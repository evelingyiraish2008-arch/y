/*
 * Mi Mundo · sync.js
 * Motor de sincronización con la nube. No sabe nada del DOM ni de Supabase: recibe dos adaptadores.
 *
 *  local (este dispositivo):
 *    flush()                         → espera a que no quede nada por guardar
 *    getOutbox()                     → cambios pendientes de subir [{ key, kind, id, deleted, updatedAt }]
 *    removeOutbox(entries)           → quita los que ya se subieron (si no han vuelto a cambiar)
 *    getRecord(kind, id)             → registro actual o null
 *    getImage(id) / hasImage(id) / putImage(id, blob)
 *    applyRemote(changes)            → aplica cambios que vienen de la nube [{ kind, id, deleted, data, updatedAt }]
 *    getMeta(key) / setMeta(key, value)
 *
 *  remote (la nube):
 *    pull(cursor, limit)             → filas nuevas desde el cursor, ordenadas por server_at
 *    push(rows)                      → sube filas { kind, id, data, deleted, updated_at }
 *    uploadImage(id, blob) / downloadImage(id) → Blob o null
 *
 * Reglas:
 *  - Primero se sube, luego se baja. En el servidor gana la versión con updated_at más reciente.
 *  - Un cambio local pendiente más reciente que el que llega de la nube no se pisa.
 *  - Los borrados viajan como marcas (deleted = true) para que no reaparezcan.
 */
'use strict';

const SYNC_KINDS = ['works', 'persons', 'couples', 'collections', 'notes', 'settings'];
const SYNC_IMAGE_FIELDS = { works: ['image'], persons: ['image', 'banner'], couples: ['image'] };
const SYNC_IMAGE_PREFIX = 'idb:';
const PUSH_CHUNK = 200;
const PULL_LIMIT = 500;

/** Ids de las imágenes guardadas en IndexedDB que usa un registro. */
function imageIdsOf(kind, record) {
    if (!record) return [];
    return (SYNC_IMAGE_FIELDS[kind] || [])
        .map(f => record[f])
        .filter(v => typeof v === 'string' && v.startsWith(SYNC_IMAGE_PREFIX))
        .map(v => v.slice(SYNC_IMAGE_PREFIX.length));
}
const syncKey = (kind, id) => `${kind}/${id}`;

class SyncEngine {
    constructor(local, remote, { onStatus = () => {} } = {}) {
        this.local = local;
        this.remote = remote;
        this.onStatus = onStatus;
        this.running = null;
        this.again = false;
    }

    /** Sincroniza. Si ya hay una sincronización en marcha, se repite al terminar. */
    sync() {
        if (this.running) { this.again = true; return this.running; }
        this.running = (async () => {
            let result;
            try {
                do {
                    this.again = false;
                    this.onStatus({ state: 'syncing' });
                    const pushed = await this.push();
                    const pulled = await this.pull();
                    result = { pushed, pulled };
                } while (this.again);
                this.onStatus({ state: 'ok', at: Date.now(), ...result });
                return result;
            } catch (error) {
                this.onStatus({ state: 'error', error });
                throw error;
            } finally {
                this.running = null;
            }
        })();
        return this.running;
    }

    async push() {
        await this.local.flush();
        const outbox = await this.local.getOutbox();
        if (!outbox.length) return 0;
        const uploaded = new Set((await this.local.getMeta('uploadedImages')) || []);
        const rows = [];
        for (const entry of outbox) {
            const record = entry.deleted ? null : this.local.getRecord(entry.kind, entry.id);
            const deleted = entry.deleted || !record;
            for (const imageId of imageIdsOf(entry.kind, record)) {
                if (uploaded.has(imageId)) continue;
                const blob = await this.local.getImage(imageId);
                if (blob) {
                    await this.remote.uploadImage(imageId, blob);
                    uploaded.add(imageId);
                }
            }
            rows.push({
                kind: entry.kind,
                id: entry.id,
                deleted,
                data: deleted ? null : JSON.parse(JSON.stringify(record)),
                updated_at: entry.updatedAt
            });
        }
        for (let i = 0; i < rows.length; i += PUSH_CHUNK) await this.remote.push(rows.slice(i, i + PUSH_CHUNK));
        await this.local.setMeta('uploadedImages', [...uploaded]);
        await this.local.removeOutbox(outbox);
        return rows.length;
    }

    async pull() {
        let cursor = (await this.local.getMeta('syncCursor')) || null;
        let applied = 0;
        for (;;) {
            const rows = await this.remote.pull(cursor, PULL_LIMIT);
            if (!rows.length) break;
            const pending = new Map((await this.local.getOutbox()).map(e => [e.key, e.updatedAt]));
            const changes = [];
            for (const row of rows) {
                if (!SYNC_KINDS.includes(row.kind)) continue;
                const updatedAt = Number(row.updated_at) || 0;
                const key = syncKey(row.kind, row.id);
                // Hay un cambio local más reciente sin subir: se queda el local.
                if (pending.has(key) && pending.get(key) > updatedAt) continue;
                const current = this.local.getRecord(row.kind, row.id);
                const currentAt = row.kind === 'settings' ? ((await this.local.getMeta('settingsUpdatedAt')) || 0) : Number(current && current.updatedAt) || 0;
                if (row.deleted) {
                    if (!current || currentAt > updatedAt) continue;
                } else if (current && currentAt >= updatedAt) {
                    continue; // ya lo tenemos (o es nuestro propio cambio de vuelta)
                }
                changes.push({ kind: row.kind, id: row.id, deleted: !!row.deleted, data: row.data, updatedAt });
            }
            // Descarga las imágenes que aún no están en este dispositivo
            for (const change of changes) {
                for (const imageId of imageIdsOf(change.kind, change.data)) {
                    if (await this.local.hasImage(imageId)) continue;
                    const blob = await this.remote.downloadImage(imageId);
                    if (blob) await this.local.putImage(imageId, blob);
                }
            }
            if (changes.length) await this.local.applyRemote(changes);
            applied += changes.length;
            cursor = rows[rows.length - 1].server_at;
            await this.local.setMeta('syncCursor', cursor);
            if (rows.length < PULL_LIMIT) break;
        }
        return applied;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SyncEngine, imageIdsOf, syncKey, SYNC_KINDS };
}
