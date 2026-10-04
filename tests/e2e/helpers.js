'use strict';
const path = require('path');
const { pathToFileURL } = require('url');
const { expect } = require('@playwright/test');

const APP_URL = pathToFileURL(path.join(__dirname, '..', '..', 'index.html')).href;
const LEGACY_KEY = 'mi_mundo_data_v16';

/** Abre la app, espera a que carguen los datos y falla el test si aparece cualquier error de JavaScript. */
async function openApp(page, hash = '') {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(APP_URL + hash);
    await waitReady(page);
    return errors;
}
async function waitReady(page) {
    await expect(page.locator('html[data-ready="true"]')).toHaveCount(1);
}

/** Navega con la barra lateral (o la barra inferior en móvil). */
async function goTo(page, name) {
    await page.locator(`.sidebar [data-nav="${name}"]`).first().click();
    await expect(page.locator(`#page-${name}`)).toHaveClass(/active/);
}

/** Recarga cuando ya se ha guardado todo. */
async function reloadSaved(page) {
    await page.evaluate(() => whenSaved());
    await page.reload();
    await waitReady(page);
}

/** Lee lo que hay guardado de verdad en IndexedDB (no lo que hay en memoria). */
async function stored(page) {
    await page.evaluate(() => whenSaved());
    return page.evaluate(() => new Promise((resolve, reject) => {
        const req = indexedDB.open('mi_mundo_db');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
            const db = req.result;
            const names = ['works', 'persons', 'couples', 'collections', 'notes', 'meta', 'images'];
            const tx = db.transaction(names, 'readonly');
            const out = {};
            names.forEach(n => { const r = tx.objectStore(n).getAll(); r.onsuccess = () => { out[n] = r.result; }; });
            tx.oncomplete = () => {
                const meta = Object.fromEntries(out.meta.map(m => [m.key, m.value]));
                out.settings = meta.settings;
                out.images = out.images.map(i => ({ id: i.id, size: i.size, type: i.type }));
                db.close();
                resolve(out);
            };
        };
    }));
}

module.exports = { APP_URL, LEGACY_KEY, openApp, waitReady, goTo, reloadSaved, stored };
