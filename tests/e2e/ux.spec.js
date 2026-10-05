'use strict';
const { test, expect } = require('@playwright/test');
const { openApp, goTo, reloadSaved, stored } = require('./helpers');

test('vistas: tabla ordenable, estantería y mosaico; se recuerdan al recargar', async ({ page }) => {
    const errors = await openApp(page);
    await goTo(page, 'anime');
    if (await page.locator('#animeFilterBar.is-collapsed').count()) await page.click('[data-toggle-filters="animeFilterBar"]');
    await page.locator('[data-view-switch="anime"] [data-act="view-mode"][data-id="anime:table"]').click();
    const rows = page.locator('#animeGrid .works-table tbody tr');
    await expect(rows).toHaveCount(2);
    await page.locator('#animeGrid [data-act="table-sort"][data-id="anime:title"]').click();
    await expect(rows.first()).toContainText('Jujutsu Kaisen');
    await page.locator('#animeGrid [data-act="table-sort"][data-id="anime:title"]').click();
    await expect(rows.first()).toContainText('Spy x Family');
    await rows.first().click();
    await expect(page.locator('#detailPanel .detail-title')).toHaveText('Spy x Family');
    await page.evaluate(() => closeDetail());

    await page.locator('[data-act="view-mode"][data-id="anime:shelf"]').click();
    await expect(page.locator('#animeGrid .spine')).toHaveCount(2);
    await page.locator('[data-act="view-mode"][data-id="anime:mosaic"]').click();
    await expect(page.locator('#animeGrid .mosaic-item')).toHaveCount(2);
    await reloadSaved(page);
    await goTo(page, 'anime');
    await expect(page.locator('#animeGrid .mosaic-item')).toHaveCount(2);
    expect(errors).toEqual([]);
});

test('la selección múltiple funciona también en la vista de tabla', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => { appData.settings.viewModes = { books: 'table' }; navigateTo('books'); setSelecting(true); });
    await page.locator('#booksGrid tbody tr').nth(0).click();
    await page.locator('#booksGrid tbody tr').nth(1).click();
    await expect(page.locator('#bulkBar .bulk-count')).toContainText('2 seleccionadas');
    await expect(page.locator('#booksGrid tbody tr.is-selected')).toHaveCount(2);
});

test('modo foco: avanzar con botón y con el teclado, terminar con confeti', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => { const w = getWorkById('w4'); w.progress = 10; saveData(); openDetail('w4'); });
    await page.locator('#detailPanel [data-act="focus"]').click();
    await expect(page.locator('#focusMode')).toBeVisible();
    await page.locator('#focusMode [data-act="focus-plus"]').click();
    await expect(page.locator('#focusMode .focus-number b')).toHaveText('11');
    await page.keyboard.press('Space');
    await expect(page.locator('#focusMode')).toContainText('¡Terminada!');
    await expect(page.locator('.confetti')).toHaveCount(1);
    expect(await page.evaluate(() => getWorkById('w4').status)).toBe('terminado');
    await page.keyboard.press('Escape');
    await expect(page.locator('#focusMode')).toBeHidden();
});

test('con "Reducir animaciones" no sale confeti', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => { appData.settings.reduceMotion = true; getWorkById('w4').progress = 11; changeProgress('w4', 1); });
    await expect(page.locator('.toast').last()).toContainText('Terminaste');
    await expect(page.locator('.confetti')).toHaveCount(0);
});

test('subir de nivel y cumplir el reto anual se celebran', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => { appData.settings.yearGoal = finishedInYear(appData.works, new Date().getFullYear()) + 1; getWorkById('w4').progress = 11; changeProgress('w4', 1); });
    await expect(page.locator('#toastStack')).toContainText('cumplido');
});

test('atajos: N agrega, G+L va a Libros, / busca, E edita, ? ayuda, Ctrl+S guarda', async ({ page }) => {
    await openApp(page);
    await page.keyboard.press('g');
    await page.keyboard.press('l');
    await expect(page.locator('#page-books')).toHaveClass(/active/);
    await page.keyboard.press('/');
    await expect(page.locator('#booksSearch')).toBeFocused();
    await page.keyboard.press('Escape');
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.evaluate(() => document.activeElement.blur());
    await page.keyboard.press('n');
    await expect(page.locator('#workModal')).toHaveClass(/active/);
    await expect(page.locator('#workTypeTabs .seg-btn.active')).toHaveAttribute('data-type', 'book');
    await page.fill('#f_title', 'Atajo guardado');
    await page.keyboard.press('Control+s');
    await expect(page.locator('#workModal')).not.toHaveClass(/active/);
    expect(await page.evaluate(() => appData.works.some(w => w.title === 'Atajo guardado'))).toBe(true);

    await page.evaluate(() => { document.activeElement.blur(); openDetail('w2'); document.activeElement.blur(); });
    await page.keyboard.press('e');
    await expect(page.locator('#f_title')).toHaveValue('El Nombre del Viento');
    await page.keyboard.press('Escape');
    await page.evaluate(() => { closeDetail(); document.activeElement.blur(); });
    await page.keyboard.press('Shift+?');
    await expect(page.locator('#sheetTitle')).toContainText('Atajos');
});

test('temas: estilos, color por modo, modo del sistema, fondo, densidad y avatar', async ({ page }) => {
    await openApp(page);
    await goTo(page, 'settings');
    await page.locator('[data-act="preset"][data-id="paper"]').click();
    await expect(page.locator('html')).toHaveAttribute('data-preset', 'paper');
    // El color del modo claro es distinto del oscuro
    await page.click('#themeToggle');
    await page.click('[data-color="#3b82f6"]');
    await page.click('#themeToggle');
    const accent = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim());
    expect(await accent()).toBe('#b45309');
    await page.click('#themeToggle');
    expect(await accent()).toBe('#3b82f6');

    await page.emulateMedia({ colorScheme: 'dark' });
    await page.locator('[data-act="toggle-setting"][data-id="themeAuto"]').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

    await page.locator('[data-act="background"][data-id="stars"]').click();
    await expect(page.locator('html')).toHaveAttribute('data-bg', 'stars');
    await page.locator('[data-act="density"][data-id="compact"]').click();
    await expect(page.locator('html')).toHaveAttribute('data-density', 'compact');
    await page.locator('[data-act="avatar"][data-id="🦋"]').click();
    await expect(page.locator('#userAvatar')).toHaveText('🦋');
    await reloadSaved(page);
    await expect(page.locator('html')).toHaveAttribute('data-preset', 'paper');
    await expect(page.locator('#userAvatar')).toHaveText('🦋');
});

test('una foto de avatar se guarda y no se borra al limpiar imágenes', async ({ page }) => {
    await openApp(page);
    await goTo(page, 'settings');
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
    await page.setInputFiles('#avatarFile', { name: 'yo.png', mimeType: 'image/png', buffer: png });
    await expect(page.locator('#userAvatar img')).toHaveCount(1);
    await reloadSaved(page);
    await expect(page.locator('#userAvatar img')).toHaveCount(1);
    expect((await stored(page)).images).toHaveLength(1);
});

test('menú lateral: ocultar y reordenar secciones; ocultar datos de las tarjetas y del formulario', async ({ page }) => {
    await openApp(page);
    await goTo(page, 'settings');
    await page.locator('[data-nav-visible="couples"]').uncheck();
    await expect(page.locator('.sidebar .nav-item[data-nav="couples"]')).toBeHidden();
    await page.locator('[data-act="nav-move"][data-id="persons:-1"]').click();
    const order = await page.locator('.sidebar .nav-section').first().locator('.nav-item').evaluateAll(els => els.map(e => e.dataset.nav));
    expect(order.indexOf('persons')).toBeLessThan(order.indexOf('bl'));

    await page.locator('[data-card-field="stars"]').uncheck();
    await page.locator('[data-form-field="synopsis"]').uncheck();
    await goTo(page, 'books');
    await expect(page.locator('#booksGrid .card .stars')).toHaveCount(0);
    await page.evaluate(() => openWorkModal('book'));
    await expect(page.locator('[data-field="synopsis"]')).toBeHidden();
    const s = (await stored(page)).settings;
    expect([s.navHidden, s.hiddenCardFields, s.hiddenFormFields]).toEqual([['couples'], ['stars'], ['synopsis']]);
});

test('colores por tipo cambian los gráficos', async ({ page }) => {
    await openApp(page);
    await goTo(page, 'settings');
    await page.locator('[data-type-color="book"]').evaluate(el => { el.value = '#10b981'; el.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(await page.evaluate(() => TYPE_META.book.color)).toBe('#10b981');
    await page.locator('[data-act="type-colors-reset"]').click();
    expect(await page.evaluate(() => TYPE_META.book.color)).toBe('#8b5cf6');
});

test('personas en vista álbum', async ({ page }) => {
    await openApp(page);
    await goTo(page, 'persons');
    await page.locator('[data-act="person-view"][data-id="album"]').click();
    await expect(page.locator('#allPersonsGrid .album-item')).toHaveCount(6);
    await page.locator('#allPersonsGrid .album-item').first().click();
    await expect(page.locator('#personDetailOverlay')).toHaveClass(/active/);
});
