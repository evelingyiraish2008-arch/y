'use strict';
const { test, expect } = require('@playwright/test');
const { APP_URL, LEGACY_KEY, openApp, waitReady, goTo, reloadSaved, stored } = require('./helpers');

// PNG de 1×1 px, para simular imágenes subidas con la versión anterior (guardadas como data:)
const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

test('los datos se guardan en IndexedDB y no en localStorage', async ({ page }) => {
    await openApp(page);
    const data = await stored(page);
    expect(data.works).toHaveLength(10);
    expect(data.meta.some(m => m.key === 'initialized')).toBe(true);
    expect(await page.evaluate(k => localStorage.getItem(k), LEGACY_KEY)).toBeNull();
    await expect(page.locator('#storageBackend')).toHaveCount(1);
    await goTo(page, 'settings');
    await expect(page.locator('#storageBackend')).toContainText('IndexedDB');
});

test('migra los datos antiguos de localStorage, incluidas las imágenes', async ({ page }) => {
    const legacy = {
        works: [
            { id: 'old1', type: 'book', title: 'Libro antiguo', status: 'leyendo', image: TINY_PNG, pages: 100, progress: 10, createdAt: 1 },
            { id: 'old2', type: 'anime', title: 'Anime antiguo', status: 'terminado', note: 'Nota antigua', createdAt: 2 }
        ],
        persons: [{ id: 'pp', name: 'Persona antigua', type: 'actor', image: TINY_PNG }],
        couples: [], collections: [{ id: 'cc', name: 'Colección antigua', items: ['old1'] }], notes: [],
        settings: { userName: 'Lectora', darkMode: false, themeColor: '#ec4899' }
    };
    // Solo en la primera carga: simula a alguien que viene de la versión con localStorage
    await page.addInitScript(([key, data]) => {
        if (!sessionStorage.getItem('sembrado')) {
            sessionStorage.setItem('sembrado', '1');
            localStorage.setItem(key, JSON.stringify(data));
        }
    }, [LEGACY_KEY, legacy]);
    const errors = await openApp(page);

    await expect(page.locator('#homeGreeting')).toContainText('Lectora');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    const data = await stored(page);
    expect(data.works.map(w => w.title).sort()).toEqual(['Anime antiguo', 'Libro antiguo']);
    expect(data.works.find(w => w.id === 'old1').image).toMatch(/^idb:img_/);
    expect(data.persons[0].image).toMatch(/^idb:img_/);
    expect(data.images).toHaveLength(2);
    expect(data.notes.find(n => n.workId === 'old2').content).toBe('Nota antigua');
    expect(data.collections[0].items).toEqual(['old1']);

    // localStorage queda como respaldo con otro nombre y no se vuelve a migrar
    const ls = await page.evaluate(k => ({ old: localStorage.getItem(k), backup: localStorage.getItem(k + '_respaldo') }), LEGACY_KEY);
    expect(ls.old).toBeNull();
    expect(JSON.parse(ls.backup).works).toHaveLength(2);

    // La imagen migrada se muestra desde IndexedDB
    await goTo(page, 'books');
    await expect(page.locator('#booksGrid .card-cover img').first()).toHaveAttribute('src', /^blob:/);
    await reloadSaved(page);
    expect((await stored(page)).works).toHaveLength(2);
    expect(errors).toEqual([]);
});

test('guarda mucho más de 5 MB (el límite de localStorage)', async ({ page }) => {
    await openApp(page);
    // 8 imágenes de 1 MB con contenido aleatorio (no comprimible)
    await page.evaluate(async () => {
        for (let i = 0; i < 8; i++) {
            const bytes = new Uint8Array(1024 * 1024);
            for (let j = 0; j < bytes.length; j += 65536) crypto.getRandomValues(bytes.subarray(j, j + 65536));
            const ref = await store.saveImage(new Blob([bytes], { type: 'image/webp' }));
            appData.works[i].image = ref;
        }
        saveData();
    });
    await reloadSaved(page);
    const data = await stored(page);
    const total = data.images.reduce((a, i) => a + i.size, 0);
    expect(total).toBeGreaterThan(8 * 1024 * 1024 - 1);
    expect(data.works.filter(w => /^idb:/.test(w.image))).toHaveLength(8);
});

test('solo se escribe lo que cambia', async ({ page }) => {
    await openApp(page);
    const changes = await page.evaluate(async () => {
        await whenSaved();
        appData.works[0].favorite = !appData.works[0].favorite;
        return store.save(appData);
    });
    expect(changes).toBe(1);
});

test('la copia de seguridad incluye las imágenes y al importarla vuelven a IndexedDB', async ({ page }, testInfo) => {
    await openApp(page);
    await page.evaluate(async png => {
        const blob = await (await fetch(png)).blob();
        appData.works[0].image = await store.saveImage(blob);
        saveData();
    }, TINY_PNG);
    await goTo(page, 'settings');
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#exportBtn')]);
    const file = testInfo.outputPath('copia.json');
    await download.saveAs(file);
    const exported = JSON.parse(require('fs').readFileSync(file, 'utf8'));
    expect(exported.works[0].image).toMatch(/^data:image\/png;base64,/);

    page.on('dialog', d => d.accept());
    await page.click('#wipeBtn');
    await expect(page.locator('.toast').last()).toContainText('borrados');
    await expect.poll(async () => (await stored(page)).images.length).toBe(0); // la imagen huérfana se borra

    await page.setInputFiles('#importFileInput', file);
    await expect(page.locator('.toast').last()).toContainText('importados');
    const data = await stored(page);
    expect(data.works).toHaveLength(10);
    expect(data.works[0].image).toMatch(/^idb:img_/);
    expect(data.images).toHaveLength(1);
});

test('las imágenes que ya no se usan se borran al abrir la app', async ({ page }) => {
    await openApp(page);
    await page.evaluate(async () => { await store.saveImage(new Blob(['x'], { type: 'image/png' })); });
    expect((await stored(page)).images).toHaveLength(1);
    await reloadSaved(page);
    await expect.poll(async () => (await stored(page)).images.length).toBe(0);
});

test('los cambios se sincronizan con otra pestaña abierta', async ({ page, context }) => {
    await openApp(page);
    const other = await context.newPage();
    await other.goto(APP_URL + '#books');
    await waitReady(other);

    await page.evaluate(() => { appData.works.find(w => w.id === 'w2').title = 'Título desde otra pestaña'; saveData(); });
    await expect(other.locator('#booksGrid')).toContainText('Título desde otra pestaña');
});

test('sin IndexedDB sigue funcionando con localStorage', async ({ page }) => {
    await page.addInitScript(() => { Object.defineProperty(window, 'indexedDB', { value: undefined, configurable: true }); });
    const errors = await openApp(page);
    await page.locator('#page-home [data-add="book"]').click();
    await page.fill('#f_title', 'Libro sin IndexedDB');
    await page.click('#workSaveBtn');
    await page.reload();
    await waitReady(page);
    await goTo(page, 'books');
    await expect(page.locator('#booksGrid')).toContainText('Libro sin IndexedDB');
    const saved = await page.evaluate(k => JSON.parse(localStorage.getItem(k)), LEGACY_KEY);
    expect(saved.works.some(w => w.title === 'Libro sin IndexedDB')).toBe(true);
    await goTo(page, 'settings');
    await expect(page.locator('#storageBackend')).toContainText('localStorage');
    expect(errors).toEqual([]);
});

test('si el guardado falla (disco lleno) avisa y deshace el cambio', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => {
        store.save = () => Promise.reject(new DOMException('Sin espacio', 'QuotaExceededError'));
    });
    await page.locator('#page-home [data-add="book"]').click();
    await page.fill('#f_title', 'No cabe');
    await page.click('#workSaveBtn');
    await expect(page.locator('.toast.toast-error').last()).toContainText('lleno');
    await expect.poll(() => page.evaluate(() => appData.works.some(w => w.title === 'No cabe'))).toBe(false);
    await goTo(page, 'books');
    await expect(page.locator('#booksGrid')).not.toContainText('No cabe');
});
