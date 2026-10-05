/*
 * Mi Mundo · cloud.js
 * Sincronización opcional con Supabase: conexión al proyecto, cuenta (correo y contraseña),
 * adaptadores para sync.js y el panel "☁️ Nube" de Personalizar.
 * El SDK (vendor/supabase.js) solo se carga si se configura un proyecto.
 * Depende de storage.js, sync.js y de app.js (appData, store, saveData, whenSaved…).
 */
'use strict';

const CLOUD_SDK_URL = 'vendor/supabase.js';
const SYNC_DEBOUNCE_MS = 1500;
const SYNC_INTERVAL_MS = 60000;

/** Acceso a las tablas y al almacenamiento de Supabase con la forma que espera sync.js. */
class SupabaseRemote {
    constructor(client, userId) {
        this.client = client;
        this.userId = userId;
    }
    async pull(cursor, limit) {
        let query = this.client.from('items')
            .select('kind,id,data,deleted,updated_at,server_at')
            .order('server_at', { ascending: true })
            .limit(limit);
        if (cursor) query = query.gt('server_at', cursor);
        const { data, error } = await query;
        if (error) throw error;
        return data || [];
    }
    async push(rows) {
        const { error } = await this.client.from('items')
            .upsert(rows.map(r => ({ ...r, user_id: this.userId })), { onConflict: 'user_id,kind,id' });
        if (error) throw error;
    }
    async uploadImage(id, blob) {
        const { error } = await this.client.storage.from('images')
            .upload(`${this.userId}/${id}`, await blob.arrayBuffer(), { contentType: blob.type || 'image/webp', upsert: true });
        if (error) throw error;
    }
    async downloadImage(id) {
        const { data, error } = await this.client.storage.from('images').download(`${this.userId}/${id}`);
        if (error) {
            if (String(error.statusCode || error.status) === '404' || /not.?found/i.test(error.message || '')) return null;
            throw error;
        }
        return data;
    }
}

/** Une el motor de sincronización con los datos en memoria (appData) y en IndexedDB (store). */
const cloudLocalAdapter = {
    flush: () => settleSaves(),
    getOutbox: () => store.getOutbox(),
    removeOutbox: entries => store.removeOutbox(entries),
    getRecord(kind, id) {
        if (kind === 'settings') return appData.settings;
        return [...(appData[kind] || []), ...((appData.trash && appData.trash[kind]) || [])].find(x => x.id === id) || null;
    },
    getImage: id => store.getImageBlob(IMAGE_PREFIX + id),
    hasImage: async id => store.hasImage(id),
    putImage: (id, blob) => store.putImageWithId(id, blob),
    getMeta: key => store.getMeta(key),
    setMeta: (key, value) => store.setMeta(key, value),
    async applyRemote(changes) {
        await settleSaves();
        let settingsChanged = false;
        changes.forEach(c => {
            if (c.kind === 'settings') { appData.settings = { ...DEFAULT_SETTINGS, ...(c.data || {}) }; settingsChanged = true; return; }
            if (!appData[c.kind]) return;
            if (c.deleted) removeRecord(appData, c.kind, c.id);
            else placeRecord(appData, c.kind, c.data); // a la papelera si viene con trashedAt
        });
        if (changes.some(c => c.kind === 'collections')) [...appData.collections, ...appData.trash.collections].forEach(col => { if (!Array.isArray(col.items)) col.items = []; });
        await runAfterSaves(() => store.applyRemote(changes));
        if (settingsChanged) applySettings();
        refreshView();
    }
};
/** Espera a que no quede ningún guardado pendiente. */
async function settleSaves() {
    do { await whenSaved(); } while (savePending);
}

const cloud = {
    state: 'off',      // off | unavailable | signedOut | signedIn
    config: null,      // { url, anonKey }
    client: null,
    user: null,
    engine: null,
    status: { state: 'idle' },
    pending: 0,
    timer: null,
    interval: null,
    busy: false,

    async init() {
        if (!store || store.kind !== 'indexeddb') { this.state = 'unavailable'; this.render(); return; }
        this.config = (await store.getMeta('cloudConfig')) || null;
        if (!this.config) { this.state = 'off'; this.render(); return; }
        try {
            await this.connect(this.config);
        } catch (e) {
            console.warn('No se pudo conectar con Supabase', e);
            this.state = 'signedOut';
            this.status = { state: 'error', error: e };
            this.render();
        }
    },

    async loadSdk() {
        if (window.supabase && window.supabase.createClient) return window.supabase;
        await new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = CLOUD_SDK_URL;
            script.onload = resolve;
            script.onerror = () => reject(new Error('No se pudo cargar el cliente de Supabase'));
            document.head.appendChild(script);
        });
        return window.supabase;
    },

    async connect(config) {
        const sdk = await this.loadSdk();
        this.client = sdk.createClient(config.url, config.anonKey, {
            auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
        });
        this.client.auth.onAuthStateChange((event, session) => {
            // Se difiere para no llamar a Supabase dentro de su propio aviso
            setTimeout(() => this.onSession(session), 0);
        });
        const { data } = await this.client.auth.getSession();
        await this.onSession(data.session);
    },

    async onSession(session) {
        const user = session ? session.user : null;
        if (user && this.user && user.id === this.user.id) return;
        this.user = user;
        if (!user) {
            this.stopTimers();
            this.engine = null;
            this.state = 'signedOut';
            this.render();
            return;
        }
        this.state = 'signedIn';
        const remote = new SupabaseRemote(this.client, user.id);
        this.engine = new SyncEngine(cloudLocalAdapter, remote, { onStatus: s => this.onStatus(s) });
        this.render();
        try {
            await this.linkDevice(user, remote);
        } catch (e) {
            this.onStatus({ state: 'error', error: e });
            return;
        }
        this.startTimers();
        this.syncNow();
    },

    /** La primera vez que este dispositivo entra en una cuenta, decide qué hacer con sus datos. */
    async linkDevice(user, remote) {
        if ((await store.getMeta('syncUser')) === user.id) return;
        await store.setMeta('syncCursor', null);
        await store.setMeta('uploadedImages', null);
        const cloudHasData = (await remote.pull(null, 1)).length > 0;
        const localHasData = appData.works.length + appData.persons.length + appData.couples.length + appData.notes.length > 0;
        let keepLocal = true;
        if (cloudHasData && onlySampleData) {
            // Dispositivo recién estrenado: sus ejemplos no deben mezclarse con los datos reales de la nube.
            keepLocal = false;
        } else if (cloudHasData && localHasData) {
            keepLocal = confirm(
                'Tu cuenta ya tiene datos en la nube.\n\n' +
                'Aceptar: unir los datos de este dispositivo con los de la nube.\n' +
                'Cancelar: usar solo los datos de la nube (se reemplazan los de este dispositivo).'
            );
        }
        if (keepLocal) {
            await settleSaves();
            await store.enqueueAll(appData);
        } else {
            await settleSaves();
            await store.clearLocalData();
            // Los ajustes de la nube ganan a los de un dispositivo recién estrenado (nombre, colores, avatar…)
            await store.setMeta('settingsUpdatedAt', null);
            const settings = appData.settings;
            appData = emptyData();
            appData.settings = settings;
            refreshView();
        }
        if (onlySampleData) { onlySampleData = false; await store.setMeta('onlySamples', null); }
        await store.setMeta('syncUser', user.id);
    },

    onStatus(status) {
        this.status = status;
        if (status.state === 'ok' && (status.pulled || status.pushed)) {
            console.info(`Sincronizado: ${status.pushed} subidos, ${status.pulled} recibidos`);
        }
        if (status.state === 'error') console.warn('Error al sincronizar', status.error);
        this.updatePending().then(() => this.render());
    },
    async updatePending() {
        try { this.pending = store && store.kind === 'indexeddb' ? (await store.getOutbox()).length : 0; } catch (e) { this.pending = 0; }
    },

    /** Lo llama app.js después de cada guardado local. */
    onLocalSave() {
        if (this.state !== 'signedIn') return;
        clearTimeout(this.timer);
        this.timer = setTimeout(() => this.syncNow(), SYNC_DEBOUNCE_MS);
    },
    async syncNow() {
        if (this.state !== 'signedIn' || !this.engine) return null;
        clearTimeout(this.timer);
        if (!navigator.onLine) { this.onStatus({ state: 'offline' }); return null; }
        try { return await this.engine.sync(); } catch (e) { return null; }
    },
    startTimers() {
        this.stopTimers();
        this.interval = setInterval(() => { if (document.visibilityState === 'visible') this.syncNow(); }, SYNC_INTERVAL_MS);
    },
    stopTimers() {
        clearTimeout(this.timer);
        clearInterval(this.interval);
        this.interval = null;
    },

    // ---------- Acciones del panel ----------
    async saveConfig(url, anonKey) {
        url = url.trim().replace(/\/+$/, '');
        anonKey = anonKey.trim();
        if (!/^https?:\/\/[^\s/]+/i.test(url)) { showToast('⚠️ La URL del proyecto no es válida', 'error'); return; }
        if (anonKey.length < 20) { showToast('⚠️ Pega la clave pública (anon) completa', 'error'); return; }
        this.config = { url, anonKey };
        await store.setMeta('cloudConfig', this.config);
        try {
            await this.connect(this.config);
            showToast('☁️ Proyecto conectado. Ahora entra o crea tu cuenta.');
        } catch (e) {
            showToast('❌ No se pudo conectar: ' + (e.message || e), 'error', 6000);
            this.state = 'signedOut';
            this.render();
        }
    },
    async signIn(email, password, create) {
        if (!this.client) return;
        if (!email || !password) { showToast('⚠️ Escribe tu correo y tu contraseña', 'error'); return; }
        if (create && password.length < 8) { showToast('⚠️ La contraseña debe tener al menos 8 caracteres', 'error'); return; }
        this.busy = true; this.render();
        try {
            const redirect = location.href.split('#')[0].split('?')[0];
            const { data, error } = create
                ? await this.client.auth.signUp({ email, password, options: { emailRedirectTo: redirect } })
                : await this.client.auth.signInWithPassword({ email, password });
            if (error) throw error;
            if (create && !data.session) showToast('📧 Te enviamos un correo para confirmar la cuenta. Después, entra aquí.', 'info', 8000);
            else showToast(create ? '✅ Cuenta creada' : '✅ Sesión iniciada');
        } catch (e) {
            const msg = /invalid login/i.test(e.message || '') ? 'Correo o contraseña incorrectos' : (e.message || 'Error desconocido');
            showToast('❌ ' + msg, 'error', 6000);
        } finally {
            this.busy = false; this.render();
        }
    },
    async signOut() {
        if (!this.client) return;
        if (!confirm('¿Cerrar sesión? Tus datos se quedan en este dispositivo, pero dejarán de sincronizarse.')) return;
        await this.client.auth.signOut().catch(() => {});
        await this.onSession(null);
        showToast('👋 Sesión cerrada');
    },
    async forget() {
        if (!confirm('¿Desconectar este dispositivo del proyecto de Supabase? Tus datos se quedan aquí.')) return;
        if (this.client) await this.client.auth.signOut().catch(() => {});
        this.stopTimers();
        this.client = null; this.user = null; this.engine = null; this.config = null;
        await store.setMeta('cloudConfig', null);
        await store.setMeta('syncUser', null);
        await store.setMeta('syncCursor', null);
        await store.setMeta('uploadedImages', null);
        this.state = 'off';
        this.status = { state: 'idle' };
        this.render();
    },

    // ---------- Panel en Personalizar ----------
    statusText() {
        const s = this.status;
        if (this.busy || s.state === 'syncing') return '🔄 Sincronizando…';
        if (s.state === 'offline') return `📡 Sin conexión${this.pending ? ` · ${this.pending} cambios esperando` : ''}`;
        if (s.state === 'error') return `⚠️ No se pudo sincronizar: ${(s.error && (s.error.message || s.error)) || 'error'}${this.pending ? ` · ${this.pending} cambios esperando` : ''}`;
        if (s.state === 'ok') return `✅ Sincronizado a las ${new Date(s.at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`;
        return '';
    },
    render() {
        const body = document.getElementById('cloudPanelBody');
        if (!body) return;
        const chip = document.getElementById('cloudChip');
        if (chip) {
            chip.textContent = { signedIn: this.status.state === 'error' ? '⚠️' : '☁️', signedOut: '🔒', off: '', unavailable: '' }[this.state] || '';
            chip.title = this.state === 'signedIn' ? this.statusText() : '';
        }
        if (this.state === 'unavailable') {
            body.innerHTML = '<p class="panel-desc" style="margin:0">La sincronización necesita IndexedDB, que este navegador no tiene disponible.</p>';
            return;
        }
        if (this.state === 'off') {
            body.innerHTML = `
                <p class="panel-desc" style="margin:-6px 0 12px">Guarda tus datos en tu propio proyecto gratuito de <b>Supabase</b> y úsalos en todos tus dispositivos.</p>
                <div class="stack" style="gap:10px">
                    <label class="field"><span>URL del proyecto</span><input type="url" id="cloudUrl" placeholder="https://xxxx.supabase.co" autocomplete="off"></label>
                    <label class="field"><span>Clave pública (anon)</span><input type="text" id="cloudKey" placeholder="eyJhbGciOi…" autocomplete="off"></label>
                    <button class="btn btn-primary btn-sm btn-block" data-cloud="connect">🔌 Conectar</button>
                    <p class="hint">Antes, ejecuta <code>supabase/schema.sql</code> en el SQL Editor de tu proyecto. La URL y la clave están en <i>Project Settings → API</i>.</p>
                </div>`;
            return;
        }
        if (this.state === 'signedOut') {
            body.innerHTML = `
                <p class="panel-desc" style="margin:-6px 0 12px">Proyecto: <b>${esc(this.config ? this.config.url.replace(/^https?:\/\//, '') : '')}</b></p>
                ${this.status.state === 'error' ? `<p class="hint" style="margin:-4px 0 10px;color:var(--orange)">${esc(this.statusText())}</p>` : ''}
                <div class="stack" style="gap:10px">
                    <label class="field"><span>Correo</span><input type="email" id="cloudEmail" autocomplete="email" placeholder="tu@correo.com"></label>
                    <label class="field"><span>Contraseña</span><input type="password" id="cloudPassword" autocomplete="current-password" placeholder="Mínimo 8 caracteres"></label>
                    <div class="seg-inline">
                        <button class="btn btn-primary btn-sm" data-cloud="signin" ${this.busy ? 'disabled' : ''}>Entrar</button>
                        <button class="btn btn-secondary btn-sm" data-cloud="signup" ${this.busy ? 'disabled' : ''}>Crear cuenta</button>
                    </div>
                    <button class="btn btn-ghost btn-sm" data-cloud="forget">Usar otro proyecto</button>
                </div>`;
            return;
        }
        body.innerHTML = `
            <p class="panel-desc" style="margin:-6px 0 6px">Conectada como <b>${esc(this.user && this.user.email)}</b></p>
            <p class="hint" id="cloudStatus" style="margin:0 0 12px">${esc(this.statusText())}</p>
            <div class="stack" style="gap:10px">
                <button class="btn btn-primary btn-sm btn-block" data-cloud="sync" ${this.status.state === 'syncing' ? 'disabled' : ''}>🔄 Sincronizar ahora</button>
                <div class="seg-inline">
                    <button class="btn btn-secondary btn-sm" data-cloud="signout">Cerrar sesión</button>
                    <button class="btn btn-ghost btn-sm" data-cloud="forget">Desconectar proyecto</button>
                </div>
            </div>`;
    }
};

document.addEventListener('click', e => {
    const btn = e.target.closest('[data-cloud]');
    if (!btn) return;
    const action = btn.dataset.cloud;
    const v = id => (document.getElementById(id) || {}).value || '';
    if (action === 'connect') cloud.saveConfig(v('cloudUrl'), v('cloudKey'));
    else if (action === 'signin') cloud.signIn(v('cloudEmail').trim(), v('cloudPassword'), false);
    else if (action === 'signup') cloud.signIn(v('cloudEmail').trim(), v('cloudPassword'), true);
    else if (action === 'signout') cloud.signOut();
    else if (action === 'forget') cloud.forget();
    else if (action === 'sync') cloud.syncNow().then(r => { if (r) showToast(`🔄 Sincronizado · ${r.pushed} enviados, ${r.pulled} recibidos`); });
});
document.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || !e.target) return;
    if (e.target.id === 'cloudPassword') { e.preventDefault(); cloud.signIn(document.getElementById('cloudEmail').value.trim(), e.target.value, false); }
    if (e.target.id === 'cloudKey') { e.preventDefault(); cloud.saveConfig(document.getElementById('cloudUrl').value, e.target.value); }
});
window.addEventListener('online', () => cloud.syncNow());
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') cloud.syncNow(); });
