/*
 * Mi Mundo · alerts.js
 * Avisos del sistema (notificaciones), recordatorios de cada obra y descubrimientos.
 * Con la app abierta se comprueba cada minuto; instalada en Android/Chrome también en segundo plano
 * (Periodic Background Sync, ver sw.js). Se carga antes que app.js.
 */
'use strict';

const NOTIFY_SENT_KEY = 'notifSent';
const notifSupported = () => typeof Notification !== 'undefined';
let notifyChecking = false;

async function getSent() {
    try { return (store && store.getMeta ? await store.getMeta(NOTIFY_SENT_KEY) : JSON.parse(localStorage.getItem('mi_mundo_' + NOTIFY_SENT_KEY) || '{}')) || {}; }
    catch (e) { return {}; }
}
async function setSent(sent) {
    try { if (store && store.setMeta) await store.setMeta(NOTIFY_SENT_KEY, sent); else localStorage.setItem('mi_mundo_' + NOTIFY_SENT_KEY, JSON.stringify(sent)); }
    catch (e) { /* sin acceso */ }
}
/** Muestra un aviso: si la app está a la vista, como aviso interno; si no, como notificación del sistema. */
async function showNotice(n) {
    const open = () => { window.focus(); if (n.workId && getWorkById(n.workId)) openDetail(n.workId); };
    if (document.visibilityState === 'visible') {
        showToast(`${n.title} · ${n.body}`, 'info', 7000, n.workId ? { label: 'Abrir', run: open } : null);
        return;
    }
    if (!notifSupported() || Notification.permission !== 'granted') return;
    const opts = { body: n.body, tag: n.id, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', data: { workId: n.workId || '' } };
    try {
        const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
        if (reg) { await reg.showNotification(n.title, opts); return; }
    } catch (e) { /* sin service worker */ }
    try { const note = new Notification(n.title, opts); note.onclick = open; } catch (e) { /* no permitido */ }
}
/** Comprueba si toca algún aviso y lo muestra (como mucho una vez cada uno). */
async function checkNotifications(now = Date.now()) {
    if (notifyChecking || !appData.settings.notify || !appData.settings.notify.enabled) return [];
    notifyChecking = true;
    try {
        const sent = pruneSent(await getSent(), now);
        const due = dueNotifications(appData, now, sent);
        for (const n of due.slice(0, 4)) { await showNotice(n); sent[n.id] = now; }
        // Los recordatorios "una vez" se quitan cuando ya han salido
        const once = due.filter(n => n.id.startsWith('rem:') && n.workId && getWorkById(n.workId) && (getWorkById(n.workId).reminder || {}).mode === 'once');
        if (once.length) mutate(() => once.forEach(n => { delete getWorkById(n.workId).reminder; }), null, { undo: false });
        if (due.length) await setSent(sent);
        return due;
    } finally { notifyChecking = false; }
}
async function enableNotifications() {
    if (!notifSupported()) { showToast('⚠️ Tu navegador no permite avisos. En iPhone, instala la app en la pantalla de inicio (iOS 16.4 o más).', 'error', 7000); return; }
    let perm = Notification.permission;
    if (perm === 'default') perm = await Notification.requestPermission();
    if (perm !== 'granted') { showToast('🔕 No diste permiso para los avisos. Puedes activarlo en los ajustes del navegador.', 'error', 6000); renderNotifyPanel(); return; }
    appData.settings.notify = { ...notifySettings(appData.settings), enabled: true };
    saveData();
    await registerBackgroundCheck();
    renderNotifyPanel();
    showToast('🔔 Avisos activados');
}
/** En Chrome/Android con la app instalada, comprueba los avisos aunque la app esté cerrada (aprox. cada hora). */
async function registerBackgroundCheck() {
    try {
        const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
        if (!reg || !reg.periodicSync) return false;
        const status = await navigator.permissions.query({ name: 'periodic-background-sync' });
        if (status.state !== 'granted') return false;
        await reg.periodicSync.register('mi-mundo-avisos', { minInterval: 60 * 60 * 1000 });
        return true;
    } catch (e) { return false; }
}
function renderNotifyPanel() {
    const box = $('notifyBody');
    if (!box) return;
    const ns = notifySettings(appData.settings);
    const perm = notifSupported() ? Notification.permission : 'unsupported';
    const days = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
    const row = (key, label, extra) => `<div class="notify-row">
        <label class="checkbox-wrapper"><input type="checkbox" data-notify="${key}.on" ${ns[key].on ? 'checked' : ''}> ${label}</label>${extra || ''}</div>`;
    const time = key => `<input type="time" class="text-input notify-time" data-notify="${key}.time" value="${esc(ns[key].time)}" aria-label="Hora">`;
    box.innerHTML = `
        ${ns.enabled && perm === 'granted' ? '<p class="panel-desc" style="margin:-6px 0 12px">✅ Activados. Con la app abierta te avisa al momento; instalada en Android también con la app cerrada.</p>'
            : `<p class="panel-desc" style="margin:-6px 0 12px">${perm === 'denied' ? '🔕 Bloqueaste los avisos para esta web. Actívalos en los ajustes del navegador (icono del candado).' : perm === 'unsupported' ? 'Tu navegador no admite avisos. Aun así verás los recordatorios en la campana 🔔.' : 'Recibe recordatorios aunque no tengas la app abierta.'}</p>
               ${perm !== 'denied' && perm !== 'unsupported' ? '<button class="btn btn-primary btn-sm btn-block" data-act="notify-enable">🔔 Activar avisos</button>' : ''}`}
        ${ns.enabled ? `<div class="notify-list">
            ${row('daily', '📚 Recordatorio diario', time('daily'))}
            ${row('airing', '📺 Episodios que salen hoy', time('airing'))}
            ${row('weekly', '🗓️ Resumen semanal', `<select class="text-input notify-time" data-notify="weekly.day" aria-label="Día">${days.map((d, i) => `<option value="${i}" ${Number(ns.weekly.day) === i ? 'selected' : ''}>${d}</option>`).join('')}</select>${time('weekly')}`)}
            ${row('streak', '🔥 Racha en peligro', time('streak'))}
            ${row('inactivity', '🌙 Si llevas días sin avanzar', `<select class="text-input notify-time" data-notify="inactivity.days" aria-label="Días">${[2, 3, 5, 7, 14].map(d => `<option value="${d}" ${Number(ns.inactivity.days) === d ? 'selected' : ''}>${d} días</option>`).join('')}</select>`)}
            ${row('reminders', '🔔 Recordatorios de cada obra')}
        </div>
        <div class="seg-inline" style="margin-top:12px"><button class="btn btn-secondary btn-sm" data-act="notify-test">Probar un aviso</button><button class="btn btn-ghost btn-sm" data-act="notify-off">Desactivar</button></div>` : ''}`;
}
function onNotifyInput(t) {
    if (!t.dataset.notify) return false;
    const [key, field] = t.dataset.notify.split('.');
    const ns = notifySettings(appData.settings);
    ns[key] = { ...ns[key], [field]: t.type === 'checkbox' ? t.checked : (field === 'day' || field === 'days' ? Number(t.value) : t.value) };
    appData.settings.notify = ns;
    saveData();
    return true;
}
FEATURE_ACTIONS['notify-enable'] = () => enableNotifications();
FEATURE_ACTIONS['notify-off'] = () => { appData.settings.notify = { ...notifySettings(appData.settings), enabled: false }; saveData(); renderNotifyPanel(); showToast('🔕 Avisos desactivados'); };
FEATURE_ACTIONS['notify-test'] = async () => {
    const n = { id: 'test:' + Date.now(), title: '🔔 Así se verán tus avisos', body: 'Mi Mundo te recordará lo que quieres ver o leer.' };
    if (notifSupported() && Notification.permission === 'granted') {
        try {
            const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
            if (reg) await reg.showNotification(n.title, { body: n.body, icon: 'icons/icon-192.png' }); else new Notification(n.title, { body: n.body, icon: 'icons/icon-192.png' });
            return;
        } catch (e) { /* sigue con el aviso interno */ }
    }
    showToast(`${n.title} · ${n.body}`);
};

// ---------- Recordatorio de una obra ----------
function reminderText(r) {
    if (!r || !r.mode) return '';
    if (r.mode === 'once') return `el ${fmtDate(r.at)} a las ${new Date(r.at).toTimeString().slice(0, 5)}`;
    if (r.mode === 'daily') return `cada día a las ${r.time}`;
    if (r.mode === 'weekly') return `cada ${['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'][Number(r.day) || 0]} a las ${r.time}`;
    if (r.mode === 'monthly') return `el día ${r.day} de cada mes a las ${r.time}`;
    return '';
}
function openReminder(id) {
    const w = getWorkById(id);
    if (!w) return;
    openSheet(`🔔 Recordarme “${w.title}”`, () => {
        const r = (getWorkById(id) || {}).reminder;
        const enabled = (appData.settings.notify || {}).enabled;
        return `${r ? `<p class="panel-desc" style="margin:0 0 12px">Ahora: te lo recuerdo <b>${esc(reminderText(r))}</b>.</p>` : ''}
            <div class="form-grid">
                <label class="field"><span>¿Cuándo?</span><select class="text-input" id="remMode">
                    <option value="daily" ${!r || r.mode === 'daily' ? 'selected' : ''}>Cada día</option>
                    <option value="weekly" ${r && r.mode === 'weekly' ? 'selected' : ''}>Cada semana (hoy)</option>
                    <option value="once7" >Dentro de una semana</option>
                    <option value="monthly" ${r && r.mode === 'monthly' ? 'selected' : ''}>Cada mes (este día)</option>
                </select></label>
                <label class="field"><span>Hora</span><input type="time" class="text-input" id="remTime" value="${esc((r && r.time) || '20:00')}"></label>
                <label class="field span-2"><span>Mensaje (opcional)</span><input type="text" class="text-input" id="remNote" maxlength="80" value="${esc((r && r.note) || '')}" placeholder="Ej.: sale el episodio nuevo"></label>
            </div>
            <div class="seg-inline" style="margin-top:12px">
                <button class="btn btn-primary btn-sm" data-act="reminder-save" data-id="${w.id}">Guardar</button>
                ${r ? `<button class="btn btn-secondary btn-sm" data-act="reminder-clear" data-id="${w.id}">Quitar recordatorio</button>` : ''}
            </div>
            ${enabled ? '' : '<p class="hint" style="margin-top:12px">💡 Activa los avisos en Personalizar para recibirlo aunque no tengas la app abierta. Mientras, lo verás en la campana 🔔.</p>'}`;
    });
}
FEATURE_ACTIONS['reminder'] = id => openReminder(id);
FEATURE_ACTIONS['reminder-save'] = id => {
    const w = getWorkById(id);
    if (!w) return;
    const mode = $('remMode').value, time = $('remTime').value || '20:00', note = $('remNote').value.trim();
    const now = new Date();
    let r;
    if (mode === 'once7') { const d = addDays(now, 7); r = { mode: 'once', at: atTime(d.getTime(), time) }; }
    else if (mode === 'weekly') r = { mode, day: now.getDay(), time };
    else if (mode === 'monthly') r = { mode, day: Math.min(now.getDate(), 28), time };
    else r = { mode: 'daily', time };
    if (note) r.note = note;
    closeModal('sheetModal');
    mutate(() => { w.reminder = r; }, `🔔 Te lo recordaré ${reminderText(r)}`, { label: `Recordatorio de “${w.title}”` });
};
FEATURE_ACTIONS['reminder-clear'] = id => {
    const w = getWorkById(id);
    if (!w) return;
    closeModal('sheetModal');
    mutate(() => { delete w.reminder; }, '🔕 Recordatorio quitado', { label: `Quitar recordatorio de “${w.title}”` });
};
/** Recordatorios de obras que tocan hoy (para la campana, aunque no estén activados los avisos del sistema). */
function reminderBellItems(now = Date.now()) {
    return appData.works.filter(w => { const at = reminderDueAt(w, now); return at && now >= at && dayKey(at) === dayKey(now); })
        .map(w => ({ id: `rem:${w.id}:${dayKey(now)}`, icon: '🔔', workId: w.id, title: w.title, text: w.reminder.note || `Recordatorio ${reminderText(w.reminder)}` }));
}

// ---------- Descubrimientos ----------
function renderDiscoveries() {
    const box = $('statsDiscoveries');
    if (!box) return;
    const saved = appData.settings.savedDiscoveries || [];
    const list = discoveries(appData.works);
    const sugg = suggestForYou(appData.works);
    box.innerHTML = `
        ${list.length ? `<div class="disc-list">${list.map(d => `<div class="disc-item"><span class="disc-icon">${d.icon}</span><span>${esc(d.text)}</span>
            <button class="icon-btn sm" data-act="disc-save" data-id="${esc(d.id)}" title="Guardar" aria-label="Guardar descubrimiento" ${saved.some(s => s.id === d.id) ? 'disabled' : ''}>${saved.some(s => s.id === d.id) ? '✓' : '📌'}</button></div>`).join('')}</div>`
            : '<p class="viz-empty">Valora y termina algunas obras más y aquí aparecerán curiosidades sobre tus gustos.</p>'}
        ${sugg.length ? `<div class="disc-title">✨ Para ti, de tus pendientes</div><div class="pace-list">${sugg.map(x => `<button class="pace-item" data-open="${x.work.id}"><span class="thumb">${img(x.work.image, x.work.type, x.work.title)}</span>
            <span class="info"><b>${esc(x.work.title)}</b><small>Porque ${esc(x.reason)}</small></span></button>`).join('')}</div>` : ''}
        ${saved.length ? `<div class="disc-title">📌 Guardados</div><div class="disc-list">${saved.slice().reverse().map(s => `<div class="disc-item is-saved"><span class="disc-icon">${s.icon}</span><span>${esc(s.text)} <small class="muted">· ${esc(fmtDate(s.at))}</small></span>
            <button class="icon-btn sm" data-act="disc-remove" data-id="${esc(s.id)}" aria-label="Quitar">✕</button></div>`).join('')}</div>` : ''}`;
}
FEATURE_ACTIONS['disc-save'] = id => {
    const d = discoveries(appData.works).find(x => x.id === id);
    if (!d) return;
    appData.settings.savedDiscoveries = [...(appData.settings.savedDiscoveries || []), { ...d, at: Date.now() }].slice(-30);
    saveData(); renderDiscoveries(); showToast('📌 Descubrimiento guardado');
};
FEATURE_ACTIONS['disc-remove'] = id => {
    appData.settings.savedDiscoveries = (appData.settings.savedDiscoveries || []).filter(s => s.id !== id);
    saveData(); renderDiscoveries();
};

if (typeof module !== 'undefined' && module.exports) module.exports = {};
