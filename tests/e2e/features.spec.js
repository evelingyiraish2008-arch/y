'use strict';
const { test, expect } = require('@playwright/test');
const { openApp, goTo, stored, reloadSaved } = require('./helpers');

const todayISO = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };

test('estadísticas: todos los gráficos, vista de tabla y tooltip', async ({ page }) => {
    const errors = await openApp(page);
    await goTo(page, 'stats');
    await expect(page.locator('#statsKpis .kpi')).toHaveCount(5);
    for (const id of ['statsCalendar', 'statsMonthly', 'statsStatus', 'statsTime', 'statsRatings', 'statsMood', 'statsGenresChart', 'statsCountries', 'statsPlatforms']) {
        await expect(page.locator(`#${id}`)).not.toBeEmpty();
    }
    // Leyenda con los 4 tipos en el gráfico apilado
    await expect(page.locator('#statsMonthly .viz-legend span')).toHaveCount(4);
    // Vista de tabla
    const card = page.locator('.viz-card', { has: page.locator('#statsMonthly') });
    await card.locator('[data-table-toggle]').click();
    await expect(card.locator('table.viz-table')).toBeVisible();
    await expect(card.locator('table.viz-table thead')).toContainText('Libros');
    await card.locator('[data-table-toggle]').click();
    await expect(card.locator('table.viz-table')).toBeHidden();
    // Tooltip con teclado y con el ratón
    await page.locator('#statsStatus .viz-bar-row').first().focus();
    await expect(page.locator('#vizTip')).toHaveClass(/show/);
    await expect(page.locator('#vizTip b')).toHaveText('5');
    await expect(page.locator('#vizTip span')).toHaveText('En curso');
    expect(errors).toEqual([]);
});

test('reto anual: fijarlo actualiza el medidor y la tarjeta de Inicio', async ({ page }) => {
    await openApp(page);
    await goTo(page, 'stats');
    await page.fill('#goalInput', '20');
    await page.click('[data-act="goal-save"]');
    await expect(page.locator('#statsGoal .goal-ring-text')).toContainText('de 20');
    expect((await stored(page)).settings.yearGoal).toBe(20);
    await goTo(page, 'home');
    await expect(page.locator('#todayGrid')).toContainText(/\d+ \/ 20/);
});

test('avanzar el progreso suma actividad y mantiene la racha de hoy', async ({ page }) => {
    await openApp(page);
    await expect(page.locator('#todayGrid')).not.toContainText('¡Hoy ya sumaste!');
    await page.locator('#heroContent [data-act="progress"]').click();
    await expect(page.locator('#todayGrid')).toContainText('¡Hoy ya sumaste!');
    const w = (await stored(page)).works.find(x => x.id === 'w3');
    expect(w.activity[todayISO()]).toBeGreaterThanOrEqual(1);
    await goTo(page, 'stats');
    await expect(page.locator('#statsCalendar .viz-cell.is-today')).not.toHaveClass(/ l0/);
});

test('valorar con estrellas: entera, media y quitar', async ({ page, isMobile }) => {
    await openApp(page);
    await page.evaluate(() => openDetail('w2'));
    const star4 = page.locator('#detailPanel [data-act="rate"][data-star="4"]');
    await star4.click({ position: { x: 14, y: 8 } }); // mitad derecha → 4
    await expect.poll(async () => (await stored(page)).works.find(w => w.id === 'w2').rating).toBe(4);
    await page.locator('#detailPanel [data-act="rate"][data-star="4"]').click({ position: { x: 2, y: 8 } }); // mitad izquierda → 3,5
    await expect.poll(async () => (await stored(page)).works.find(w => w.id === 'w2').rating).toBe(3.5);
    await expect(page.locator('#detailPanel [data-star="4"]')).toHaveClass(/half/);
    await page.locator('#detailPanel [data-act="rate"][data-star="4"]').click({ position: { x: 2, y: 8 } }); // misma nota → se quita
    await expect.poll(async () => (await stored(page)).works.find(w => w.id === 'w2').rating).toBe(0);
});

test('Mi lista desde el banner', async ({ page }) => {
    await openApp(page);
    const btn = page.locator('#heroContent [data-act="mylist"]');
    await expect(btn).toHaveText('✓ En Mi lista'); // la colección de ejemplo ya la contiene
    await btn.click();
    await expect(page.locator('#heroContent [data-act="mylist"]')).toHaveText('＋ Mi lista');
    await page.locator('#heroContent [data-act="mylist"]').click();
    await expect(page.locator('#heroContent [data-act="mylist"]')).toHaveText('✓ En Mi lista');
    const col = (await stored(page)).collections.find(c => c.name === 'Mi lista');
    expect(col.items).toContain('w3');
});

test('paleta de comandos: buscar obras, ir a secciones y ejecutar acciones', async ({ page }) => {
    const errors = await openApp(page);
    await page.keyboard.press('Control+k');
    await expect(page.locator('#paletteModal')).toHaveClass(/active/);
    await page.keyboard.type('estad');
    await page.keyboard.press('Enter');
    await expect(page.locator('#page-stats')).toHaveClass(/active/);

    await page.keyboard.press('Control+k');
    await page.keyboard.type('semantic');
    await expect(page.locator('.palette-item').first()).toContainText('Semantic Error');
    await page.keyboard.press('Enter');
    await expect(page.locator('#detailPanel .detail-title')).toHaveText('Semantic Error');
    await page.keyboard.press('Escape');

    await page.keyboard.press('Control+k');
    await page.keyboard.type('agregar anime');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Enter');
    await expect(page.locator('#workModal')).toHaveClass(/active/);
    await expect(page.locator('#workTypeTabs .seg-btn.active')).toHaveAttribute('data-type', 'anime');
    expect(errors).toEqual([]);
});

test('avisos: la campana cuenta los nuevos y se apagan al verlos', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => { appData.works.find(w => w.id === 'w4').airDay = String(new Date().getDay()); saveData(); refreshView(); });
    const badge = page.locator('#bellBadge');
    await expect(badge).toBeVisible();
    await page.click('[data-act="notifications"]');
    await expect(page.locator('#sheetBody')).toContainText('Hoy toca Only Friends');
    await expect(badge).toBeHidden();
    await page.locator('#sheetBody .notif-item', { hasText: 'Only Friends' }).click();
    await expect(page.locator('#detailPanel .detail-title')).toHaveText('Only Friends');
});

test('¿Qué veo hoy?: propone pendientes, filtra por tipo y empieza una', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => {
        appData.works.push({ id: 'p1', type: 'anime', title: 'Pendiente anime', status: 'quiero ver', createdAt: Date.now() });
        appData.works.push({ id: 'p2', type: 'book', title: 'Pendiente libro', status: 'quiero leer', createdAt: Date.now() });
        saveData();
    });
    await page.click('[data-act="pick"]');
    await page.click('#sheetBody [data-act="pick-type"][data-id="anime"]');
    await expect(page.locator('#sheetBody h3')).toHaveText('Pendiente anime');
    await page.click('#sheetBody [data-act="pick-type"][data-id="book"]');
    await expect(page.locator('#sheetBody h3')).toHaveText('Pendiente libro');
    await page.click('#sheetBody [data-act="pick-start"]');
    await expect(page.locator('#detailPanel .detail-title')).toHaveText('Pendiente libro');
    const w = (await stored(page)).works.find(x => x.id === 'p2');
    expect(w.status).toBe('leyendo');
    expect(w.startDate).toBe(todayISO());
});

test('mapa de emociones: una casilla abre esas obras', async ({ page }) => {
    await openApp(page);
    await goTo(page, 'stats');
    // Only Friends: spicy 4, tristeza 3 → fila 5-3=2, columna 4-1=3
    await page.click('#statsMood [data-act="mood"][data-id="2:3"]');
    await expect(page.locator('#sheetBody')).toContainText('Only Friends');
});

test('al agregar avisa de duplicados y al terminar pone la fecha sola', async ({ page }) => {
    await openApp(page);
    await page.locator('#page-home [data-add="book"]').click();
    await page.fill('#f_title', 'el nombre del viento');
    let asked = '';
    page.once('dialog', d => { asked = d.message(); d.dismiss(); });
    await page.click('#workSaveBtn');
    expect(asked).toContain('Ya tienes');
    await expect(page.locator('#workModal')).toHaveClass(/active/);

    await page.fill('#f_title', 'Libro terminado hoy');
    await page.selectOption('#f_status', 'terminado');
    await page.click('#workSaveBtn');
    await expect(page.locator('#workModal')).not.toHaveClass(/active/);
    const w = (await stored(page)).works.find(x => x.title === 'Libro terminado hoy');
    expect(w.endDate).toBe(todayISO());
    expect(w.startDate).toBe(todayISO());
});

test('manhwas: ordenar por capítulos', async ({ page }) => {
    await openApp(page);
    await goTo(page, 'manhwa');
    if (await page.locator('#manhwaFilterBar.is-collapsed').count()) await page.click('[data-toggle-filters="manhwaFilterBar"]');
    await page.selectOption('#manhwaSort', 'chapters');
    await expect(page.locator('#manhwaGrid .card-title').first()).toContainText('True Beauty');
});
