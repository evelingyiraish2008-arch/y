'use strict';
const { test, expect } = require('@playwright/test');
const { startServer } = require('./static-server');
const { FakeSupabase } = require('./fake-supabase');
const { waitReady, goTo, stored } = require('./helpers');

const fake = new FakeSupabase();
let server;
test.beforeAll(async () => { server = await startServer('/mi-mundo/', fake); });
test.afterAll(async () => { await server.close(); });
test.beforeEach(() => fake.reset());

const ANON_KEY = 'anon-key-de-prueba-0123456789';

/** Abre la app en un "dispositivo" nuevo (contexto del navegador con sus propios datos). */
async function newDevice(browser) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(server.url + '#settings');
    await waitReady(page);
    return { context, page, errors };
}
/** Conecta el proyecto y entra (o crea la cuenta). onConfirm: respuesta a la pregunta de unir datos. */
async function signIn(page, { email = 'sara@example.com', password = 'contraseña-segura', create = false, onConfirm = true } = {}) {
    if (await page.locator('#cloudUrl').count()) {
        await page.fill('#cloudUrl', server.origin + '/sb');
        await page.fill('#cloudKey', ANON_KEY);
        await page.click('[data-cloud="connect"]');
    }
    await page.fill('#cloudEmail', email);
    await page.fill('#cloudPassword', password);
    const dialogs = [];
    const onDialog = d => { dialogs.push(d.message()); return onConfirm ? d.accept() : d.dismiss(); };
    page.on('dialog', onDialog);
    try {
        await page.click(`[data-cloud="${create ? 'signup' : 'signin'}"]`);
        await expect(page.locator('#cloudPanelBody')).toContainText('Conectada como ' + email, { timeout: 10000 });
        await expect(page.locator('#cloudStatus')).toContainText('Sincronizado', { timeout: 10000 });
    } finally {
        page.off('dialog', onDialog);
    }
    return dialogs;
}
async function syncNow(page) {
    await page.evaluate(() => whenSaved());
    await page.evaluate(() => cloud.syncNow());
    await expect(page.locator('#cloudStatus')).toContainText('Sincronizado');
}
const cloudWorks = () => [...fake.rows.values()].filter(r => r.kind === 'works');

test('validación del formulario de conexión', async ({ browser }) => {
    const { page, context } = await newDevice(browser);
    await page.fill('#cloudUrl', 'no-es-una-url');
    await page.fill('#cloudKey', ANON_KEY);
    await page.click('[data-cloud="connect"]');
    await expect(page.locator('.toast').last()).toContainText('URL');
    await page.fill('#cloudUrl', server.origin + '/sb');
    await page.fill('#cloudKey', 'corta');
    await page.click('[data-cloud="connect"]');
    await expect(page.locator('.toast').last()).toContainText('clave');
    await context.close();
});

test('crear cuenta sube los datos de este dispositivo', async ({ browser }) => {
    const { page, context, errors } = await newDevice(browser);
    await signIn(page, { create: true });
    expect(cloudWorks()).toHaveLength(10);
    expect([...fake.rows.values()].some(r => r.kind === 'settings')).toBe(true);
    expect(await page.evaluate(async () => (await store.getOutbox()).length)).toBe(0);
    await expect(page.locator('#cloudChip')).toHaveText('☁️');
    expect(errors).toEqual([]);
    await context.close();
});

test('contraseña incorrecta muestra un aviso', async ({ browser }) => {
    const a = await newDevice(browser);
    await signIn(a.page, { create: true });
    await a.context.close();
    const { page, context } = await newDevice(browser);
    await page.fill('#cloudUrl', server.origin + '/sb');
    await page.fill('#cloudKey', ANON_KEY);
    await page.click('[data-cloud="connect"]');
    await page.fill('#cloudEmail', 'sara@example.com');
    await page.fill('#cloudPassword', 'otra');
    await page.click('[data-cloud="signin"]');
    await expect(page.locator('.toast').last()).toContainText('incorrectos');
    await context.close();
});

test('dos dispositivos: los cambios, borrados y ajustes viajan de uno a otro', async ({ browser }) => {
    const phone = await newDevice(browser);
    await signIn(phone.page, { create: true });
    const laptop = await newDevice(browser);
    const asked = await signIn(laptop.page); // dispositivo nuevo: usa los datos de la nube sin preguntar
    expect(asked).toEqual([]);

    // Cambio en el móvil → aparece en el portátil
    await phone.page.evaluate(() => { appData.works.find(w => w.id === 'w2').title = 'Editado en el móvil'; saveData(); });
    await syncNow(phone.page);
    await syncNow(laptop.page);
    await goTo(laptop.page, 'books');
    await expect(laptop.page.locator('#booksGrid')).toContainText('Editado en el móvil');

    // Borrado en el portátil → desaparece del móvil y no vuelve
    await laptop.page.evaluate(() => { appData.works = appData.works.filter(w => w.id !== 'w7'); saveData(); });
    await syncNow(laptop.page);
    await syncNow(phone.page);
    await syncNow(phone.page);
    expect(await phone.page.evaluate(() => appData.works.some(w => w.id === 'w7'))).toBe(false);
    expect((await stored(phone.page)).works.some(w => w.id === 'w7')).toBe(false);

    // Ajustes
    await phone.page.click('[data-color="#10b981"]');
    await syncNow(phone.page);
    await syncNow(laptop.page);
    await expect.poll(() => laptop.page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim())).toBe('#10b981');

    expect(phone.errors).toEqual([]);
    expect(laptop.errors).toEqual([]);
    await phone.context.close();
    await laptop.context.close();
});

test('un dispositivo nuevo puede usar solo los datos de la nube', async ({ browser }) => {
    const phone = await newDevice(browser);
    await signIn(phone.page, { create: true });
    await phone.page.evaluate(() => { appData.works = appData.works.filter(w => w.type === 'book'); saveData(); });
    await syncNow(phone.page);

    const laptop = await newDevice(browser);
    await laptop.page.evaluate(() => { appData.works.push({ id: 'solo-local', type: 'book', title: 'Solo en el portátil', createdAt: Date.now() }); saveData(); });
    const asked = await signIn(laptop.page, { onConfirm: false }); // Cancelar = usar solo la nube
    expect(asked[0]).toContain('Tu cuenta ya tiene datos');
    const titles = await laptop.page.evaluate(() => appData.works.map(w => w.title).sort());
    expect(titles).toEqual(["El Nombre del Viento", "El Problema de los Tres Cuerpos", "Heaven Official's Blessing"]);
    expect(cloudWorks().some(r => r.id === 'solo-local')).toBe(false);
    await phone.context.close();
    await laptop.context.close();
});

test('las imágenes subidas llegan al otro dispositivo', async ({ browser }) => {
    const phone = await newDevice(browser);
    await signIn(phone.page, { create: true });
    await phone.page.evaluate(async () => {
        const c = document.createElement('canvas'); c.width = 60; c.height = 90;
        const ctx = c.getContext('2d'); ctx.fillStyle = '#ec4899'; ctx.fillRect(0, 0, 60, 90);
        const blob = await new Promise(r => c.toBlob(r, 'image/png'));
        appData.works.find(w => w.id === 'w1').image = await store.saveImage(blob);
        saveData();
    });
    await syncNow(phone.page);
    expect(fake.files.size).toBe(1);

    const laptop = await newDevice(browser);
    await signIn(laptop.page);
    const info = await laptop.page.evaluate(() => {
        const ref = appData.works.find(w => w.id === 'w1').image;
        return { ref, src: imageSrc(ref, 'book'), has: store.hasImage(ref.slice(4)) };
    });
    expect(info.ref).toMatch(/^idb:img_/);
    expect(info.has).toBe(true);
    expect(info.src).toMatch(/^blob:/);
    await phone.context.close();
    await laptop.context.close();
});

test('sin conexión los cambios esperan y se envían al volver', async ({ browser }) => {
    const { page, context } = await newDevice(browser);
    await signIn(page, { create: true });
    fake.offline = true;
    await page.evaluate(() => { appData.works.find(w => w.id === 'w3').title = 'Cambiado sin red'; saveData(); });
    await page.evaluate(() => whenSaved());
    await page.evaluate(() => cloud.syncNow());
    await expect(page.locator('#cloudStatus')).toContainText('cambios esperando', { timeout: 10000 });
    await expect(page.locator('#cloudChip')).toHaveText('⚠️');
    fake.offline = false;
    await syncNow(page);
    expect(cloudWorks().find(r => r.id === 'w3').data.title).toBe('Cambiado sin red');
    await context.close();
});

test('la sesión se mantiene al recargar y al cerrar sesión se conservan los datos', async ({ browser }) => {
    const { page, context } = await newDevice(browser);
    await signIn(page, { create: true });
    await page.reload();
    await waitReady(page);
    await expect(page.locator('#cloudPanelBody')).toContainText('Conectada como sara@example.com');
    page.once('dialog', d => d.accept());
    await page.click('[data-cloud="signout"]');
    await expect(page.locator('#cloudEmail')).toBeVisible();
    expect(await page.evaluate(() => appData.works.length)).toBe(10);
    await context.close();
});

test('desconectar el proyecto vuelve al formulario inicial', async ({ browser }) => {
    const { page, context } = await newDevice(browser);
    await signIn(page, { create: true });
    page.once('dialog', d => d.accept());
    await page.click('[data-cloud="forget"]');
    await expect(page.locator('#cloudUrl')).toBeVisible();
    await page.reload();
    await waitReady(page);
    await expect(page.locator('#cloudUrl')).toBeVisible();
    await context.close();
});

test('un dispositivo con datos propios puede unirlos con los de la nube', async ({ browser }) => {
    const phone = await newDevice(browser);
    await signIn(phone.page, { create: true });
    await phone.page.evaluate(() => { appData.works.find(w => w.id === 'w1').title = 'Del móvil'; saveData(); });
    await syncNow(phone.page);

    const laptop = await newDevice(browser);
    await laptop.page.evaluate(() => { appData.works.push({ id: 'del-portatil', type: 'anime', title: 'Del portátil', createdAt: Date.now() }); saveData(); });
    const asked = await signIn(laptop.page, { onConfirm: true }); // Aceptar = unir
    expect(asked).toHaveLength(1);
    await syncNow(phone.page);
    const titles = await phone.page.evaluate(() => appData.works.map(w => w.title));
    expect(titles).toContain('Del portátil');
    expect(titles).toContain('Del móvil'); // los ejemplos del portátil no pisan la edición real del móvil
    expect(cloudWorks().some(r => r.id === 'del-portatil')).toBe(true);
    await phone.context.close();
    await laptop.context.close();
});

test('la papelera viaja entre dispositivos y restaurar también', async ({ browser }) => {
    const phone = await newDevice(browser);
    await signIn(phone.page, { create: true });
    const laptop = await newDevice(browser);
    await signIn(laptop.page);

    await phone.page.evaluate(() => deleteWork('w2'));
    await syncNow(phone.page);
    expect(cloudWorks().find(r => r.id === 'w2').data.trashedAt).toBeGreaterThan(0);
    await syncNow(laptop.page);
    expect(await laptop.page.evaluate(() => [appData.works.some(w => w.id === 'w2'), appData.trash.works.map(w => w.id)])).toEqual([false, ['w2']]);

    await laptop.page.evaluate(() => restoreFromTrash('works:w2'));
    await syncNow(laptop.page);
    await syncNow(phone.page);
    expect(await phone.page.evaluate(() => [appData.works.some(w => w.id === 'w2'), appData.trash.works.length])).toEqual([true, 0]);
    expect(phone.errors).toEqual([]);
    expect(laptop.errors).toEqual([]);
    await phone.context.close();
    await laptop.context.close();
});

test('la foto de avatar (guardada en los ajustes) llega al otro dispositivo', async ({ browser }) => {
    const phone = await newDevice(browser);
    await signIn(phone.page, { create: true });
    await phone.page.evaluate(async () => {
        const c = document.createElement('canvas'); c.width = 40; c.height = 40;
        c.getContext('2d').fillRect(0, 0, 40, 40);
        appData.settings.avatar = await store.saveImage(await new Promise(r => c.toBlob(r, 'image/png')));
        saveData();
    });
    await syncNow(phone.page);
    const laptop = await newDevice(browser);
    await signIn(laptop.page);
    await expect(laptop.page.locator('#userAvatar img')).toHaveAttribute('src', /^blob:/);
    await phone.context.close();
    await laptop.context.close();
});
