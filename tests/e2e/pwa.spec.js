'use strict';
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { startServer } = require('./static-server');

let server;
test.beforeAll(async () => { server = await startServer(); });
test.afterAll(async () => { await server.close(); });

const ROOT = path.join(__dirname, '..', '..');

test('el manifest es válido y todos sus iconos existen', async ({ request }) => {
    const res = await request.get(server.url + 'manifest.webmanifest');
    expect(res.ok()).toBe(true);
    const manifest = await res.json();
    expect(manifest).toMatchObject({ short_name: 'Mi Mundo', display: 'standalone', start_url: './', scope: './' });
    expect(manifest.icons.some(i => i.sizes === '192x192')).toBe(true);
    expect(manifest.icons.some(i => i.sizes === '512x512' && i.purpose === 'maskable')).toBe(true);
    for (const icon of manifest.icons) {
        const r = await request.get(server.url + icon.src);
        expect(r.ok(), icon.src).toBe(true);
    }
});

test('los archivos que precachea el service worker existen', () => {
    const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
    const shell = JSON.parse(sw.match(/const APP_SHELL = (\[[\s\S]*?\]);/)[1].replace(/'/g, '"'));
    for (const file of shell.filter(f => f !== './')) {
        expect(fs.existsSync(path.join(ROOT, file)), file).toBe(true);
    }
});

test('se registra el service worker y la app abre sin conexión', async ({ page, context }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(server.url);
    await page.evaluate(() => navigator.serviceWorker.ready);
    // Una recarga para que el service worker controle la página y guarde los archivos
    await page.reload();
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    await expect.poll(() => page.evaluate(async () => (await caches.keys()).some(k => k.startsWith('mi-mundo-app-')))).toBe(true);

    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('#page-home')).toHaveClass(/active/);
    await expect(page.locator('#offlinePill')).toBeVisible();
    await expect(page.locator('#homeRecent .card').first()).toBeVisible();

    await context.setOffline(false);
    await expect(page.locator('#offlinePill')).toBeHidden();
    expect(errors).toEqual([]);
});

test('el service worker puede calcular y mostrar avisos en segundo plano', async ({ page, context }) => {
    await page.goto(server.url);
    await page.evaluate(() => navigator.serviceWorker.ready);
    // Avisos activados con un recordatorio que ya toca
    await page.evaluate(async () => {
        appData.settings.notify = { enabled: true, daily: { on: false }, weekly: { on: false }, streak: { on: false }, inactivity: { on: false }, airing: { on: false } };
        getWorkById('w2').reminder = { mode: 'once', at: Date.now() - 1000 };
        saveData();
        await whenSaved();
    });
    const [sw] = context.serviceWorkers().length ? context.serviceWorkers() : [await context.waitForEvent('serviceworker')];
    expect(await sw.evaluate(() => typeof dueNotifications)).toBe('function');
    // Chrome sin pantalla no deja mostrar avisos de verdad: se apunta lo que se mostraría
    await sw.evaluate(() => { self.__shown = []; self.registration.showNotification = async (title, opts) => { self.__shown.push([title, opts.data.workId]); }; });
    await sw.evaluate(() => backgroundNotify());
    expect(await sw.evaluate(() => self.__shown)).toEqual([['🔔 El Nombre del Viento', 'w2']]);
    // Ya se apuntó como enviado: no se repite
    await sw.evaluate(() => backgroundNotify());
    expect(await sw.evaluate(() => self.__shown.length)).toBe(1);
});

test('el acceso directo “Agregar obra” abre el formulario', async ({ page }) => {
    await page.goto(server.url + '?accion=agregar');
    await expect(page.locator('#workModal')).toHaveClass(/active/);
    expect(new URL(page.url()).search).toBe('');
});

test('el acceso directo a una sección funciona', async ({ page }) => {
    await page.goto(server.url + '#stats');
    await expect(page.locator('#page-stats')).toHaveClass(/active/);
});

test('abierto como archivo local no intenta registrar el service worker', async ({ page }) => {
    const { APP_URL } = require('./helpers');
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()); });
    await page.goto(APP_URL + '#settings');
    await expect(page.locator('#installStatus')).toContainText('dirección web');
    expect(errors.filter(e => /service worker/i.test(e))).toEqual([]);
});
