'use strict';
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { SyncEngine, imageIdsOf } = require('../../sync.js');

/** Nube falsa con las mismas reglas que supabase/schema.sql (gana el updated_at más reciente). */
class FakeRemote {
    constructor() { this.rows = new Map(); this.images = new Map(); this.clock = 0; this.online = true; this.uploads = 0; }
    check() { if (!this.online) throw new Error('Sin conexión'); }
    async push(rows) {
        this.check();
        for (const r of rows) {
            const key = r.kind + '/' + r.id;
            const old = this.rows.get(key);
            if (old && r.updated_at < old.updated_at) continue;
            this.rows.set(key, { ...JSON.parse(JSON.stringify(r)), server_at: String(++this.clock).padStart(8, '0') });
        }
    }
    async pull(cursor, limit) {
        this.check();
        return [...this.rows.values()].filter(r => !cursor || r.server_at > cursor)
            .sort((a, b) => a.server_at.localeCompare(b.server_at)).slice(0, limit);
    }
    async uploadImage(id, blob) { this.check(); this.uploads++; this.images.set(id, blob); }
    async downloadImage(id) { this.check(); return this.images.get(id) || null; }
}

/** Dispositivo falso: imita lo que hace IdbBackend.save (marca updatedAt y apunta el cambio en la cola). */
class FakeDevice {
    constructor(name) {
        this.name = name; this.now = 1000;
        this.data = { works: [], persons: [], couples: [], collections: [], notes: [], settings: { darkMode: true } };
        this.outbox = new Map(); this.meta = new Map(); this.images = new Map();
    }
    tick() { return ++this.now; }
    upsert(kind, record) {
        const t = this.tick();
        const list = this.data[kind];
        const i = list.findIndex(x => x.id === record.id);
        const item = { ...(i >= 0 ? list[i] : {}), ...record, updatedAt: t };
        if (i >= 0) list[i] = item; else list.push(item);
        this.outbox.set(kind + '/' + record.id, { key: kind + '/' + record.id, kind, id: record.id, deleted: false, updatedAt: t });
    }
    remove(kind, id) {
        const t = this.tick();
        this.data[kind] = this.data[kind].filter(x => x.id !== id);
        this.outbox.set(kind + '/' + id, { key: kind + '/' + id, kind, id, deleted: true, updatedAt: t });
    }
    setSettings(patch) {
        const t = this.tick();
        Object.assign(this.data.settings, patch);
        this.meta.set('settingsUpdatedAt', t);
        this.outbox.set('settings/main', { key: 'settings/main', kind: 'settings', id: 'main', deleted: false, updatedAt: t });
    }
    get adapter() {
        const d = this;
        return {
            flush: async () => {},
            getOutbox: async () => [...d.outbox.values()].map(e => ({ ...e })),
            removeOutbox: async entries => entries.forEach(e => { const cur = d.outbox.get(e.key); if (cur && cur.updatedAt === e.updatedAt) d.outbox.delete(e.key); }),
            getRecord: (kind, id) => (kind === 'settings' ? d.data.settings : d.data[kind].find(x => x.id === id) || null),
            getImage: async id => d.images.get(id) || null,
            hasImage: async id => d.images.has(id),
            putImage: async (id, blob) => { d.images.set(id, blob); },
            applyRemote: async changes => changes.forEach(c => {
                if (c.kind === 'settings') { d.data.settings = c.data; d.meta.set('settingsUpdatedAt', c.updatedAt); }
                else if (c.deleted) d.data[c.kind] = d.data[c.kind].filter(x => x.id !== c.id);
                else {
                    const i = d.data[c.kind].findIndex(x => x.id === c.id);
                    if (i >= 0) d.data[c.kind][i] = c.data; else d.data[c.kind].push(c.data);
                }
                const cur = d.outbox.get(c.kind + '/' + c.id);
                if (cur && cur.updatedAt <= c.updatedAt) d.outbox.delete(c.kind + '/' + c.id);
            }),
            getMeta: async k => d.meta.get(k),
            setMeta: async (k, v) => { d.meta.set(k, v); }
        };
    }
}

let cloud, phone, laptop, syncPhone, syncLaptop;
beforeEach(() => {
    cloud = new FakeRemote();
    phone = new FakeDevice('móvil');
    laptop = new FakeDevice('portátil');
    laptop.now = 5000; // relojes distintos
    syncPhone = new SyncEngine(phone.adapter, cloud);
    syncLaptop = new SyncEngine(laptop.adapter, cloud);
});
const titles = d => d.data.works.map(w => w.title).sort();

describe('SyncEngine', () => {
    it('sube los cambios locales y los baja en otro dispositivo', async () => {
        phone.upsert('works', { id: 'w1', type: 'book', title: 'Libro A' });
        phone.upsert('notes', { id: 'n1', workId: 'w1', content: 'hola' });
        const r = await syncPhone.sync();
        assert.deepEqual(r, { pushed: 2, pulled: 0 });
        assert.equal(phone.outbox.size, 0);

        const r2 = await syncLaptop.sync();
        assert.equal(r2.pulled, 2);
        assert.deepEqual(titles(laptop), ['Libro A']);
        assert.equal(laptop.data.notes[0].content, 'hola');
    });

    it('no vuelve a aplicar sus propios cambios', async () => {
        phone.upsert('works', { id: 'w1', type: 'book', title: 'A' });
        await syncPhone.sync();
        const r = await syncPhone.sync();
        assert.deepEqual(r, { pushed: 0, pulled: 0 });
    });

    it('los borrados se propagan y no reaparecen', async () => {
        phone.upsert('works', { id: 'w1', type: 'book', title: 'A' });
        phone.upsert('works', { id: 'w2', type: 'book', title: 'B' });
        await syncPhone.sync();
        await syncLaptop.sync();
        laptop.remove('works', 'w1');
        await syncLaptop.sync();
        await syncPhone.sync();
        assert.deepEqual(titles(phone), ['B']);
        // El móvil vuelve a sincronizar y la obra borrada sigue sin aparecer
        await syncPhone.sync();
        await syncLaptop.sync();
        assert.deepEqual(titles(phone), ['B']);
        assert.deepEqual(titles(laptop), ['B']);
    });

    it('en un conflicto gana el cambio más reciente', async () => {
        phone.upsert('works', { id: 'w1', type: 'book', title: 'Original' });
        await syncPhone.sync();
        await syncLaptop.sync();
        phone.upsert('works', { id: 'w1', title: 'Del móvil (antes)' });    // updatedAt ~1002
        laptop.upsert('works', { id: 'w1', title: 'Del portátil (después)' }); // updatedAt ~5002
        await syncPhone.sync();
        await syncLaptop.sync();
        await syncPhone.sync();
        assert.deepEqual(titles(phone), ['Del portátil (después)']);
        assert.deepEqual(titles(laptop), ['Del portátil (después)']);
    });

    it('un cambio local pendiente más nuevo no se pisa al bajar', async () => {
        laptop.upsert('works', { id: 'w1', type: 'book', title: 'Nube' });
        await syncLaptop.sync();
        phone.now = 9000;
        phone.upsert('works', { id: 'w1', type: 'book', title: 'Local nuevo' });
        await syncPhone.pull(); // solo bajar, sin subir antes
        assert.deepEqual(titles(phone), ['Local nuevo']);
        assert.equal(phone.outbox.size, 1);
        await syncPhone.sync();
        await syncLaptop.sync();
        assert.deepEqual(titles(laptop), ['Local nuevo']);
    });

    it('sin conexión los cambios esperan en la cola y se envían al volver', async () => {
        cloud.online = false;
        phone.upsert('works', { id: 'w1', type: 'book', title: 'Offline' });
        await assert.rejects(syncPhone.sync(), /Sin conexión/);
        assert.equal(phone.outbox.size, 1);
        cloud.online = true;
        await syncPhone.sync();
        assert.equal(phone.outbox.size, 0);
        await syncLaptop.sync();
        assert.deepEqual(titles(laptop), ['Offline']);
    });

    it('sincroniza los ajustes', async () => {
        phone.setSettings({ darkMode: false, themeColor: '#10b981' });
        await syncPhone.sync();
        await syncLaptop.sync();
        assert.equal(laptop.data.settings.darkMode, false);
        assert.equal(laptop.data.settings.themeColor, '#10b981');
    });

    it('sube cada imagen una sola vez y la descarga en el otro dispositivo', async () => {
        phone.images.set('img_1', 'BLOB-1');
        phone.upsert('works', { id: 'w1', type: 'book', title: 'Con portada', image: 'idb:img_1' });
        await syncPhone.sync();
        phone.upsert('works', { id: 'w1', title: 'Con portada (editada)' });
        await syncPhone.sync();
        assert.equal(cloud.uploads, 1);
        await syncLaptop.sync();
        assert.equal(laptop.images.get('img_1'), 'BLOB-1');
    });

    it('baja muchos cambios en varias páginas', async () => {
        for (let i = 0; i < 1203; i++) phone.upsert('works', { id: 'w' + i, type: 'book', title: 'T' + i });
        await syncPhone.sync();
        const r = await syncLaptop.sync();
        assert.equal(r.pulled, 1203);
        assert.equal(laptop.data.works.length, 1203);
    });

    it('si se pide sincronizar durante una sincronización, se repite al terminar', async () => {
        phone.upsert('works', { id: 'w1', type: 'book', title: 'A' });
        const first = syncPhone.sync();
        phone.upsert('works', { id: 'w2', type: 'book', title: 'B' });
        const second = syncPhone.sync();
        assert.equal(first, second);
        await first;
        assert.equal(phone.outbox.size, 0);
        await syncLaptop.sync();
        assert.deepEqual(titles(laptop), ['A', 'B']);
    });

    it('informa del estado', async () => {
        const states = [];
        const engine = new SyncEngine(phone.adapter, cloud, { onStatus: s => states.push(s.state) });
        await engine.sync();
        cloud.online = false;
        await engine.sync().catch(() => {});
        assert.deepEqual(states, ['syncing', 'ok', 'syncing', 'error']);
    });
});

describe('imageIdsOf', () => {
    it('devuelve solo las imágenes guardadas en IndexedDB', () => {
        assert.deepEqual(imageIdsOf('persons', { image: 'idb:a', banner: 'https://x/y.png' }), ['a']);
        assert.deepEqual(imageIdsOf('notes', { image: 'idb:a' }), []);
        assert.deepEqual(imageIdsOf('works', null), []);
    });
});
