/*
 * Mi Mundo · storage.js
 * Persistencia de los datos. Hay dos implementaciones con la misma interfaz:
 *  - IdbBackend: IndexedDB (sin el límite de ~5 MB, imágenes como Blob, escrituras solo de lo que cambia).
 *  - LocalBackend: localStorage, como respaldo si el navegador no tiene IndexedDB.
 * Depende de utils.js (generateId).
 */
'use strict';

const DB_NAME = 'mi_mundo_db';
const DB_VERSION = 2; // 2: almacén 'outbox' con los cambios pendientes de subir a la nube
const ENTITY_STORES = ['works', 'persons', 'couples', 'collections', 'notes'];
const LEGACY_KEY = 'mi_mundo_data_v16';
const LEGACY_BACKUP_KEY = 'mi_mundo_data_v16_respaldo';
const IMAGE_PREFIX = 'idb:';
/** Campos que guardan imágenes: [colección, campo, tipo de imagen para comprimir]. */
const IMAGE_FIELDS = [['works', 'image', 'poster'], ['persons', 'image', 'avatar'], ['persons', 'banner', 'banner'], ['couples', 'image', 'couple']];

const isImageRef = v => typeof v === 'string' && v.startsWith(IMAGE_PREFIX);
const isEmbeddedImage = v => typeof v === 'string' && v.startsWith('data:image/') && !v.startsWith('data:image/svg');

function promisify(request) {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}
function transactionDone(tx) {
    return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new DOMException('Transacción cancelada', 'AbortError'));
    });
}
function dataUrlToBlob(dataUrl) {
    const comma = dataUrl.indexOf(',');
    const head = dataUrl.slice(0, comma), body = dataUrl.slice(comma + 1);
    const mime = (head.match(/^data:([^;,]+)/) || [])[1] || 'application/octet-stream';
    const raw = /;base64/i.test(head) ? atob(body) : decodeURIComponent(body);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return new Blob([bytes], { type: mime });
}
function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
}
/** Recorre todos los campos de imagen de los datos. */
function forEachImageField(data, fn) {
    IMAGE_FIELDS.forEach(([store, field, kind]) => allRecords(data, store).forEach(item => fn(item, field, kind)));
    // Imágenes de los ajustes: avatar y fondo
    if (data.settings) [['avatar', 'avatar'], ['bgImage', 'banner']].forEach(([field, kind]) => fn(data.settings, field, kind));
}
/** Registros de una colección, incluidos los que están en la papelera (se guardan en el mismo almacén). */
function allRecords(data, name) {
    return [...(data[name] || []), ...((data.trash && data.trash[name]) || [])];
}

function openDatabase() {
    return new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined' || !indexedDB) { reject(new Error('IndexedDB no disponible')); return; }
        let request;
        try { request = indexedDB.open(DB_NAME, DB_VERSION); } catch (e) { reject(e); return; }
        request.onupgradeneeded = () => {
            const db = request.result;
            // Todo se carga en memoria al abrir la app, así que no hacen falta índices.
            ENTITY_STORES.forEach(name => { if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' }); });
            if (!db.objectStoreNames.contains('images')) db.createObjectStore('images', { keyPath: 'id' });
            if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
            if (!db.objectStoreNames.contains('outbox')) db.createObjectStore('outbox', { keyPath: 'key' });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        // Otra pestaña con una versión anterior tiene la base de datos abierta: se espera a que la cierre.
        request.onblocked = () => console.warn('Esperando a que otra pestaña de Mi Mundo cierre la base de datos…');
    });
}

class IdbBackend {
    constructor(db) {
        this.kind = 'indexeddb';
        this.db = db;
        this.initialized = false;
        this.persisted = {};            // colección -> Map(id -> JSON guardado)
        this.persistedSettings = null;  // JSON de los ajustes guardados
        this.imageUrls = new Map();     // id -> URL blob: para mostrar
        this.imageSizes = new Map();    // id -> bytes
        // Si otra versión de la app necesita actualizar la base de datos, cerramos para no bloquearla.
        db.onversionchange = () => db.close();
    }
    static async open() { return new IdbBackend(await openDatabase()); }

    _addImage(id, blob) {
        if (this.imageUrls.has(id)) URL.revokeObjectURL(this.imageUrls.get(id));
        this.imageUrls.set(id, URL.createObjectURL(blob));
        this.imageSizes.set(id, blob.size);
    }
    _remember(data) {
        this.persisted = {};
        ENTITY_STORES.forEach(name => {
            this.persisted[name] = new Map((data[name] || []).map(item => [item.id, JSON.stringify(item)]));
        });
        this.persistedSettings = JSON.stringify(data.settings || {});
    }

    /** Devuelve los datos guardados, o null si la base de datos aún no se ha usado. */
    async load() {
        const tx = this.db.transaction([...ENTITY_STORES, 'meta', 'images'], 'readonly');
        const results = await Promise.all([
            ...ENTITY_STORES.map(name => promisify(tx.objectStore(name).getAll())),
            promisify(tx.objectStore('meta').getAll()),
            promisify(tx.objectStore('images').getAll())
        ]);
        const images = results.pop(), metaRows = results.pop();
        images.forEach(row => { if (!this.imageUrls.has(row.id)) this._addImage(row.id, row.blob); });
        const meta = Object.fromEntries(metaRows.map(r => [r.key, r.value]));
        this.initialized = !!meta.initialized;
        if (!this.initialized) return null;
        const data = { settings: meta.settings || {} };
        ENTITY_STORES.forEach((name, i) => { data[name] = results[i]; });
        this._remember(data);
        return data;
    }

    /**
     * Guarda solo los registros que han cambiado desde la última vez, en una sola transacción.
     * Cada registro cambiado recibe updatedAt y se apunta en la cola 'outbox' para subirlo a la nube.
     */
    async save(data) {
        const tx = this.db.transaction([...ENTITY_STORES, 'meta', 'outbox'], 'readwrite');
        const outbox = tx.objectStore('outbox');
        const now = Date.now();
        const next = {};
        let changes = 0;
        ENTITY_STORES.forEach(name => {
            const store = tx.objectStore(name);
            const prev = this.persisted[name] || new Map();
            const current = new Map();
            allRecords(data, name).forEach(item => {
                let json = JSON.stringify(item);
                if (prev.get(item.id) !== json) {
                    if (item.sample && !prev.has(item.id)) {
                        // Datos de ejemplo recién creados: fecha mínima para que nunca ganen a datos reales de la nube.
                        item.updatedAt = 1;
                    } else {
                        delete item.sample; // al editar un ejemplo pasa a ser un dato propio
                        item.updatedAt = Math.max(now, (Number(item.updatedAt) || 0) + 1);
                    }
                    json = JSON.stringify(item);
                    store.put(JSON.parse(json));
                    outbox.put({ key: `${name}/${item.id}`, kind: name, id: item.id, deleted: false, updatedAt: item.updatedAt });
                    changes++;
                }
                current.set(item.id, json);
            });
            prev.forEach((_, id) => {
                if (current.has(id)) return;
                store.delete(id);
                outbox.put({ key: `${name}/${id}`, kind: name, id, deleted: true, updatedAt: now });
                changes++;
            });
            next[name] = current;
        });
        const settingsJson = JSON.stringify(data.settings || {});
        if (settingsJson !== this.persistedSettings) {
            tx.objectStore('meta').put({ key: 'settings', value: JSON.parse(settingsJson) });
            tx.objectStore('meta').put({ key: 'settingsUpdatedAt', value: now });
            outbox.put({ key: 'settings/main', kind: 'settings', id: 'main', deleted: false, updatedAt: now });
            changes++;
        }
        if (!this.initialized) { tx.objectStore('meta').put({ key: 'initialized', value: Date.now() }); changes++; }
        await transactionDone(tx);
        this.persisted = next;
        this.persistedSettings = settingsJson;
        this.initialized = true;
        return changes;
    }

    /** Últimos datos guardados con éxito (para deshacer un cambio que no se pudo guardar). */
    snapshot() {
        const data = { settings: JSON.parse(this.persistedSettings || '{}') };
        ENTITY_STORES.forEach(name => { data[name] = [...(this.persisted[name] || new Map()).values()].map(j => JSON.parse(j)); });
        return data;
    }

    async saveImage(blob) {
        const id = 'img_' + generateId();
        const tx = this.db.transaction('images', 'readwrite');
        tx.objectStore('images').put({ id, blob, size: blob.size, type: blob.type, createdAt: Date.now() });
        await transactionDone(tx);
        this._addImage(id, blob);
        return IMAGE_PREFIX + id;
    }
    async replaceImage(ref, blob) {
        const id = ref.slice(IMAGE_PREFIX.length);
        const tx = this.db.transaction('images', 'readwrite');
        tx.objectStore('images').put({ id, blob, size: blob.size, type: blob.type, createdAt: Date.now() });
        await transactionDone(tx);
        this._addImage(id, blob);
    }
    async getImageBlob(ref) {
        const tx = this.db.transaction('images', 'readonly');
        const row = await promisify(tx.objectStore('images').get(ref.slice(IMAGE_PREFIX.length)));
        return row ? row.blob : null;
    }
    resolve(ref) { return this.imageUrls.get(ref.slice(IMAGE_PREFIX.length)) || ''; }
    imageSize(ref) { return this.imageSizes.get(ref.slice(IMAGE_PREFIX.length)) || 0; }

    // ---------- Sincronización (los usa sync.js a través de cloud.js) ----------
    async getMeta(key) {
        const tx = this.db.transaction('meta', 'readonly');
        const row = await promisify(tx.objectStore('meta').get(key));
        return row ? row.value : undefined;
    }
    async setMeta(key, value) {
        const tx = this.db.transaction('meta', 'readwrite');
        if (value === undefined || value === null) tx.objectStore('meta').delete(key);
        else tx.objectStore('meta').put({ key, value });
        await transactionDone(tx);
    }
    async getOutbox() {
        const tx = this.db.transaction('outbox', 'readonly');
        return promisify(tx.objectStore('outbox').getAll());
    }
    /** Quita de la cola lo que ya se subió, salvo que haya vuelto a cambiar mientras tanto. */
    async removeOutbox(entries) {
        const tx = this.db.transaction('outbox', 'readwrite');
        const store = tx.objectStore('outbox');
        entries.forEach(entry => {
            const req = store.get(entry.key);
            req.onsuccess = () => { if (req.result && req.result.updatedAt === entry.updatedAt) store.delete(entry.key); };
        });
        await transactionDone(tx);
    }
    /** Pone en la cola todos los registros (al conectar este dispositivo con una cuenta por primera vez). */
    async enqueueAll(data) {
        // Se lee antes de abrir la transacción: IndexedDB la cierra si se espera a otra cosa en medio.
        const settingsUpdatedAt = (await this.getMeta('settingsUpdatedAt')) || 1;
        const tx = this.db.transaction('outbox', 'readwrite');
        const store = tx.objectStore('outbox');
        ENTITY_STORES.forEach(name => allRecords(data, name).forEach(item => {
            store.put({ key: `${name}/${item.id}`, kind: name, id: item.id, deleted: false, updatedAt: Number(item.updatedAt) || Number(item.createdAt) || 1 });
        }));
        store.put({ key: 'settings/main', kind: 'settings', id: 'main', deleted: false, updatedAt: settingsUpdatedAt });
        await transactionDone(tx);
    }
    /**
     * Guarda cambios que vienen de la nube sin volver a ponerlos en la cola.
     * Actualiza el registro de "lo guardado" al momento, para que el próximo save() no los vea como cambios locales.
     */
    async applyRemote(changes) {
        changes.forEach(c => {
            if (c.kind === 'settings') this.persistedSettings = JSON.stringify(c.data || {});
            else if (c.deleted) (this.persisted[c.kind] || new Map()).delete(c.id);
            else {
                if (!this.persisted[c.kind]) this.persisted[c.kind] = new Map();
                this.persisted[c.kind].set(c.id, JSON.stringify(c.data));
            }
        });
        const tx = this.db.transaction([...ENTITY_STORES, 'meta', 'outbox'], 'readwrite');
        const outbox = tx.objectStore('outbox');
        changes.forEach(c => {
            if (c.kind === 'settings') {
                tx.objectStore('meta').put({ key: 'settings', value: c.data || {} });
                tx.objectStore('meta').put({ key: 'settingsUpdatedAt', value: c.updatedAt });
            } else if (c.deleted) {
                tx.objectStore(c.kind).delete(c.id);
            } else {
                tx.objectStore(c.kind).put(c.data);
            }
            const key = `${c.kind}/${c.id}`;
            const req = outbox.get(key);
            req.onsuccess = () => { if (req.result && req.result.updatedAt <= c.updatedAt) outbox.delete(key); };
        });
        await transactionDone(tx);
    }
    /** Borra los datos de este dispositivo sin apuntar borrados para la nube (para usar solo los de la nube). */
    async clearLocalData() {
        const tx = this.db.transaction([...ENTITY_STORES, 'outbox'], 'readwrite');
        [...ENTITY_STORES, 'outbox'].forEach(name => tx.objectStore(name).clear());
        await transactionDone(tx);
        ENTITY_STORES.forEach(name => { this.persisted[name] = new Map(); });
    }
    hasImage(id) { return this.imageUrls.has(id); }
    async putImageWithId(id, blob) {
        const tx = this.db.transaction('images', 'readwrite');
        tx.objectStore('images').put({ id, blob, size: blob.size, type: blob.type, createdAt: Date.now() });
        await transactionDone(tx);
        this._addImage(id, blob);
    }

    /** Borra las imágenes que ya no usa ninguna obra, persona o pareja. */
    async collectGarbage(data) {
        const used = new Set();
        forEachImageField(data, (item, field) => { if (isImageRef(item[field])) used.add(item[field].slice(IMAGE_PREFIX.length)); });
        const orphans = [...this.imageUrls.keys()].filter(id => !used.has(id));
        if (!orphans.length) return 0;
        const tx = this.db.transaction('images', 'readwrite');
        orphans.forEach(id => tx.objectStore('images').delete(id));
        await transactionDone(tx);
        orphans.forEach(id => { URL.revokeObjectURL(this.imageUrls.get(id)); this.imageUrls.delete(id); this.imageSizes.delete(id); });
        return orphans.length;
    }

    async estimate() {
        let images = 0;
        this.imageSizes.forEach(size => { images += size; });
        const result = { images, imageCount: this.imageSizes.size, usage: null, quota: null };
        if (navigator.storage && navigator.storage.estimate) {
            try { Object.assign(result, await navigator.storage.estimate()); } catch (e) { /* sin estimación */ }
        }
        return result;
    }
}

class LocalBackend {
    constructor() {
        this.kind = 'localstorage';
        this.last = null;
    }
    load() {
        let raw = null;
        try { raw = localStorage.getItem(LEGACY_KEY); } catch (e) { console.warn('localStorage no disponible', e); }
        if (!raw) return null;
        this.last = raw;
        return JSON.parse(raw);
    }
    save(data) {
        const json = JSON.stringify(data);
        localStorage.setItem(LEGACY_KEY, json);
        this.last = json;
        return 1;
    }
    snapshot() { return this.last ? JSON.parse(this.last) : null; }
    // Sin IndexedDB las imágenes se guardan dentro de los datos, como antes.
    async saveImage(blob) { return blobToDataUrl(blob); }
    async replaceImage() { /* no se usa */ }
    async getImageBlob() { return null; }
    resolve() { return ''; }
    imageSize() { return 0; }
    async collectGarbage() { return 0; }
    async estimate() {
        let used = 0;
        try { used = (localStorage.getItem(LEGACY_KEY) || '').length + LEGACY_KEY.length; } catch (e) { /* sin acceso */ }
        return { images: 0, imageCount: 0, usage: used, quota: 5000000 };
    }
}

/** Abre IndexedDB; si no es posible (navegador antiguo o modo privado restringido), usa localStorage. */
async function openStorage() {
    try {
        return await IdbBackend.open();
    } catch (e) {
        console.warn('Usando localStorage porque IndexedDB no está disponible:', e);
        return new LocalBackend();
    }
}

/** Lee los datos que la versión anterior guardaba en localStorage. */
function readLegacyData() {
    try {
        const raw = localStorage.getItem(LEGACY_KEY);
        return raw ? { raw, data: JSON.parse(raw) } : null;
    } catch (e) {
        console.warn('No se pudieron leer los datos antiguos', e);
        return null;
    }
}
/** Tras migrar, conserva los datos antiguos con otro nombre como respaldo. */
function archiveLegacyData(raw) {
    try {
        localStorage.removeItem(LEGACY_KEY);
        localStorage.setItem(LEGACY_BACKUP_KEY, raw);
    } catch (e) { /* el respaldo es opcional */ }
}

/** Pasa las imágenes incrustadas (data:) a Blobs del almacén y deja solo la referencia. */
async function externalizeImages(data, backend) {
    if (backend.kind !== 'indexeddb') return 0;
    const jobs = [];
    forEachImageField(data, (item, field) => {
        if (isEmbeddedImage(item[field])) {
            jobs.push(backend.saveImage(dataUrlToBlob(item[field])).then(ref => { item[field] = ref; }));
        }
    });
    await Promise.all(jobs);
    return jobs.length;
}
/** Copia de los datos con las imágenes incrustadas, para exportar a JSON. */
async function embedImages(data, backend) {
    const copy = JSON.parse(JSON.stringify(data));
    const jobs = [];
    forEachImageField(copy, (item, field) => {
        if (isImageRef(item[field])) {
            jobs.push(backend.getImageBlob(item[field])
                .then(blob => (blob ? blobToDataUrl(blob) : ''))
                .then(url => { item[field] = url; }));
        }
    });
    await Promise.all(jobs);
    return copy;
}
