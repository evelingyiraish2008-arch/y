'use strict';
const { test, expect } = require('@playwright/test');
const { openApp, goTo, stored } = require('./helpers');

/** Sustituye la API de avisos del navegador por una que apunta lo que se muestra. */
async function fakeNotifications(page, permission = 'default') {
    await page.addInitScript(perm => {
        window.__shown = [];
        class FakeNotification {
            constructor(title, opts) { window.__shown.push({ title, body: opts && opts.body }); }
            static requestPermission() { FakeNotification.permission = 'granted'; return Promise.resolve('granted'); }
        }
        FakeNotification.permission = perm;
        window.Notification = FakeNotification;
    }, permission);
}

test('activar avisos pide permiso y guarda las opciones', async ({ page }) => {
    await fakeNotifications(page);
    await openApp(page);
    await goTo(page, 'settings');
    await page.click('[data-act="notify-enable"]');
    await expect(page.locator('#notifyBody')).toContainText('Activados');
    await page.locator('[data-notify="daily.time"]').fill('07:30');
    await page.locator('[data-notify="daily.time"]').dispatchEvent('change');
    await page.locator('[data-notify="weekly.on"]').uncheck();
    const s = (await stored(page)).settings.notify;
    expect([s.enabled, s.daily.time, s.weekly.on]).toEqual([true, '07:30', false]);
});

test('con la app en segundo plano sale una notificación; a la vista, un aviso interno', async ({ page }) => {
    await fakeNotifications(page, 'granted');
    await openApp(page);
    await page.evaluate(() => { appData.settings.notify = { enabled: true, daily: { on: false }, weekly: { on: false }, streak: { on: false }, inactivity: { on: false }, airing: { on: false } }; });
    // Recordatorio de una obra que ya toca
    await page.evaluate(() => { getWorkById('w2').reminder = { mode: 'once', at: Date.now() - 1000, note: 'Relee el final' }; saveData(); });
    await page.evaluate(() => Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }));
    await page.evaluate(() => checkNotifications());
    expect(await page.evaluate(() => window.__shown)).toEqual([{ title: '🔔 El Nombre del Viento', body: 'Relee el final' }]);
    // El recordatorio "una vez" se quita y no se repite
    await expect.poll(() => page.evaluate(() => getWorkById('w2').reminder)).toBeUndefined();
    await page.evaluate(() => checkNotifications());
    expect(await page.evaluate(() => window.__shown.length)).toBe(1);

    await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); getWorkById('w7').reminder = { mode: 'daily', time: '00:00' }; });
    await page.evaluate(() => checkNotifications());
    await expect(page.locator('.toast').last()).toContainText('El Problema de los Tres Cuerpos');
    await page.locator('.toast').last().locator('.toast-action').click();
    await expect(page.locator('#detailPanel .detail-title')).toHaveText('El Problema de los Tres Cuerpos');
});

test('recordarme desde la ficha y verlo en la campana', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => openDetail('w6'));
    await page.locator('#detailPanel [data-act="reminder"]').click();
    await page.selectOption('#remMode', 'daily');
    await page.fill('#remTime', '00:01');
    await page.click('[data-act="reminder-save"]');
    await expect(page.locator('#detailPanel [data-act="reminder"]')).toContainText('Recordatorio');
    expect((await stored(page)).works.find(w => w.id === 'w6').reminder).toEqual({ mode: 'daily', time: '00:01' });
    await page.evaluate(() => { closeDetail(); navigateTo('home'); openNotifications(); });
    await expect(page.locator('#sheetBody')).toContainText('Solo Leveling');
});

test('descubrimientos en estadísticas: se pueden guardar', async ({ page }) => {
    await openApp(page);
    await goTo(page, 'stats');
    const first = page.locator('#statsDiscoveries .disc-item').first();
    await expect(first).toBeVisible();
    await first.locator('[data-act="disc-save"]').click();
    await expect(page.locator('#statsDiscoveries')).toContainText('Guardados');
    expect((await stored(page)).settings.savedDiscoveries).toHaveLength(1);
});

test('abrir la app desde un aviso abre la obra', async ({ page }) => {
    await openApp(page, '');
    await page.evaluate(() => whenSaved());
    const url = page.url().split('#')[0] + '?obra=w5';
    await page.goto(url);
    await expect(page.locator('#detailPanel .detail-title')).toHaveText('Jujutsu Kaisen');
});
