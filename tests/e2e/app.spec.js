'use strict';
const { test, expect } = require('@playwright/test');
const { openApp, goTo, stored, reloadSaved } = require('./helpers');

const PAGES = ['home', 'books', 'series', 'anime', 'manhwa', 'bl', 'persons', 'couples', 'emission', 'stats', 'collections', 'notes', 'settings'];

test('todas las secciones cargan sin errores ni desborde horizontal', async ({ page }) => {
    const errors = await openApp(page);
    for (const name of PAGES) {
        await goTo(page, name);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow, `desborde en ${name}`).toBeLessThanOrEqual(0);
    }
    expect(errors).toEqual([]);
});

test('agregar un libro lo guarda y aparece en la estantería', async ({ page }) => {
    const errors = await openApp(page);
    await page.locator('#page-home [data-add="book"]').click();
    await expect(page.locator('#workModal')).toHaveClass(/active/);
    await page.fill('#f_title', 'Libro de prueba');
    await page.locator('#workForm [data-field="author"]').fill('Autora Test');
    await page.locator('#workForm [data-field="pages"]').fill('300');
    await page.locator('#workForm [data-field="progress"]').fill('999');
    await page.click('#workSaveBtn');
    await expect(page.locator('#workModal')).not.toHaveClass(/active/);

    await goTo(page, 'books');
    await expect(page.locator('#booksGrid')).toContainText('Libro de prueba');
    const book = (await stored(page)).works.find(w => w.title === 'Libro de prueba');
    expect(book).toMatchObject({ type: 'book', author: 'Autora Test', pages: 300, status: 'leyendo' });
    expect(book.progress).toBe(300); // se limita al total de páginas
    expect(errors).toEqual([]);
});

test('el título es obligatorio', async ({ page }) => {
    await openApp(page);
    await page.locator('#page-home [data-add="book"]').click();
    await page.click('#workSaveBtn');
    await expect(page.locator('#workModal')).toHaveClass(/active/);
    await expect(page.locator('.toast').last()).toContainText('obligatorio');
});

test('el HTML en los títulos se muestra como texto', async ({ page }) => {
    const errors = await openApp(page);
    await page.locator('#page-home [data-add="book"]').click();
    await page.fill('#f_title', '<img src=x onerror="window.__xss=1">Hack');
    await page.click('#workSaveBtn');
    await goTo(page, 'books');
    await expect(page.locator('#booksGrid .card-title').filter({ hasText: '<img src=x' })).toHaveCount(1);
    expect(await page.evaluate(() => window.__xss)).toBeUndefined();
    expect(errors).toEqual([]);
});

test('editar y eliminar una obra', async ({ page }) => {
    await openApp(page);
    await goTo(page, 'books');
    const card = page.locator('#booksGrid .card', { hasText: 'El Nombre del Viento' });
    await card.click();
    await expect(page.locator('#detailPanel')).toHaveClass(/active/);
    await page.locator('#detailPanel [data-act="edit"]').click();
    await expect(page.locator('#f_status')).toHaveValue('terminado'); // el estado no se pierde al editar
    await page.fill('#f_title', 'El Nombre del Viento (editado)');
    await page.click('#workSaveBtn');
    await expect(page.locator('#detailPanel .detail-title')).toHaveText('El Nombre del Viento (editado)');

    page.once('dialog', d => d.accept());
    await page.locator('#detailPanel [data-act="delete"]').click();
    await expect(page.locator('#detailPanel')).not.toHaveClass(/active/);
    await expect(page.locator('#booksGrid')).not.toContainText('El Nombre del Viento');
    // Va a la papelera: sigue guardada, marcada como borrada
    expect((await stored(page)).works.find(w => w.id === 'w2').trashedAt).toBeGreaterThan(0);
});

test('avanzar el progreso hasta el final marca la obra como terminada', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => {
        const w = appData.works.find(x => x.id === 'w4');
        w.progress = 11;
        saveData();
        openDetail('w4');
    });
    await page.locator('#detailPanel [data-act="progress"]').click();
    await expect(page.locator('.toast').last()).toContainText('Terminaste');
    const w = (await stored(page)).works.find(x => x.id === 'w4');
    expect(w).toMatchObject({ progress: 12, status: 'terminado' });
    expect(w.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});

test('favoritos, notas y colecciones desde el detalle', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => openDetail('w2'));
    const panel = page.locator('#detailPanel');

    await panel.locator('[data-act="fav"]').click();
    await expect(panel.locator('[data-act="fav"]')).toContainText('❤️');

    await panel.locator('summary', { hasText: 'Mis notas' }).click();
    await page.fill('#detailNote', 'Una nota de prueba');
    await panel.locator('[data-act="note-save"]').click();

    await panel.locator('[data-act="collect"]').click();
    await page.locator('#sheetModal label', { hasText: 'Mi lista' }).locator('input').check();
    await page.keyboard.press('Escape');
    await expect(page.locator('#sheetModal')).not.toHaveClass(/active/);

    const data = await stored(page);
    expect(data.works.find(w => w.id === 'w2').favorite).toBe(true);
    expect(data.notes.find(n => n.workId === 'w2').content).toBe('Una nota de prueba');
    expect(data.collections.find(c => c.name === 'Mi lista').items).toContain('w2');

    await page.keyboard.press('Escape');
    await goTo(page, 'notes');
    await expect(page.locator('#notesList')).toContainText('Una nota de prueba');
});

test('la búsqueda global abre el resultado con Enter', async ({ page }) => {
    await openApp(page);
    await page.fill('#globalSearch', 'untam');
    await expect(page.locator('.search-result').first()).toContainText('The Untamed');
    await page.keyboard.press('Enter');
    await expect(page.locator('#detailPanel .detail-title')).toHaveText('The Untamed');
});

test('filtros de series por pestaña y BL', async ({ page }) => {
    await openApp(page);
    await goTo(page, 'series');
    await page.locator('#seriesTabs [data-filter="terminado"]').click();
    await expect(page.locator('#seriesGrid .card')).toHaveCount(1);
    await expect(page.locator('#seriesGrid')).toContainText('Semantic Error');
    await page.locator('#seriesTabs [data-filter="all"]').click();
    await expect(page.locator('#seriesGrid .card')).toHaveCount(3);
});

test('personas: crear y ver sus obras vinculadas', async ({ page }) => {
    await openApp(page);
    await goTo(page, 'persons');
    await page.click('#addPersonBtn');
    await page.fill('#personName', 'Xiao Zhan');
    await page.click('#personSaveBtn');
    await page.locator('.person-card', { hasText: 'Xiao Zhan' }).first().click();
    await expect(page.locator('#personDetailOverlay')).toHaveClass(/active/);
    await expect(page.locator('#personDetailCard')).toContainText('The Untamed');
});

test('las imágenes rotas se cambian por su ilustración', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => { appData.works[0].image = 'https://invalid.invalid/x.png'; saveData(); openDetail(appData.works[0].id); });
    const poster = page.locator('#detailPanel .detail-poster img');
    await expect(poster).toHaveAttribute('src', /^data:image\/svg\+xml/);
});

test('modo claro y color de acento se guardan', async ({ page }) => {
    await openApp(page);
    await goTo(page, 'settings');
    await page.click('#themeToggle');
    await page.click('[data-color="#10b981"]');
    await reloadSaved(page);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    const accent = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim());
    expect(accent).toBe('#10b981');
});

test('los datos se mantienen al recargar y borrar todo no vuelve a cargar los ejemplos', async ({ page }) => {
    await openApp(page);
    await goTo(page, 'settings');
    page.on('dialog', d => d.accept());
    await page.click('#wipeBtn');
    await expect(page.locator('.toast').last()).toContainText('borrados');
    await reloadSaved(page);
    expect((await stored(page)).works).toEqual([]);
    await goTo(page, 'books');
    await expect(page.locator('#booksGrid .empty-state')).toBeVisible();
});

test('exportar e importar una copia de seguridad', async ({ page }, testInfo) => {
    await openApp(page);
    await goTo(page, 'settings');
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#exportBtn')]);
    const file = testInfo.outputPath('backup.json');
    await download.saveAs(file);

    await page.evaluate(() => { appData.works = []; saveData(); });
    page.on('dialog', d => d.accept());
    await page.setInputFiles('#importFileInput', file);
    await expect(page.locator('.toast').last()).toContainText('importados');
    expect((await stored(page)).works).toHaveLength(10);
});

test('una imagen subida se reduce antes de guardarse', async ({ page }) => {
    await openApp(page);
    await page.locator('#page-home [data-add="book"]').click();
    // Genera un PNG grande en el propio navegador y lo sube
    const png = await page.evaluate(() => {
        const c = document.createElement('canvas');
        c.width = 2400; c.height = 3600;
        const ctx = c.getContext('2d');
        for (let i = 0; i < 400; i++) { ctx.fillStyle = `hsl(${i},70%,50%)`; ctx.fillRect(Math.random() * 2400, Math.random() * 3600, 300, 300); }
        return c.toDataURL('image/png').split(',')[1];
    });
    await page.setInputFiles('#workImageFile', { name: 'grande.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
    await expect(page.locator('#f_image')).toHaveValue(/^idb:img_/);
    const dims = await page.evaluate(() => new Promise(r => { const i = new Image(); i.onload = () => r([i.width, i.height]); i.src = imageSrc(document.getElementById('f_image').value, 'book'); }));
    expect(dims[0]).toBeLessThanOrEqual(480);
    expect(dims[1]).toBeLessThanOrEqual(720);
});

test('las notas de ejemplo no aparecen como editadas en 1970', async ({ page }) => {
    await openApp(page);
    await goTo(page, 'notes');
    await expect(page.locator('#notesList .note-card')).toHaveCount(2);
    await expect(page.locator('#notesList')).not.toContainText('1970');
    await expect(page.locator('#notesList')).not.toContainText('Editada');
});
