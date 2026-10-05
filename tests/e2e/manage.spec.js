'use strict';
const { test, expect } = require('@playwright/test');
const { openApp, goTo, stored } = require('./helpers');

test('búsqueda avanzada en la página, en la paleta y con ayuda', async ({ page }) => {
    const errors = await openApp(page);
    await goTo(page, 'books');
    await page.fill('#booksSearch', 'nota:>=4.5 -tag:BL');
    await expect(page.locator('#booksGrid .card')).toHaveCount(2);
    await page.fill('#booksSearch', '');
    await page.keyboard.press('Control+k');
    await page.keyboard.type('BL nota:5');
    await expect(page.locator('#paletteList')).toContainText('Ver todos');
    await page.keyboard.press('Enter');
    await expect(page.locator('#sheetBody .pick-item')).toHaveCount(3);
    await expect(page.locator('#sheetBody')).toContainText('es BL y valoración es 5');
    // Ayuda: probar una búsqueda y crear una colección inteligente con ella
    await page.evaluate(() => { closeModal('sheetModal'); openQueryHelp(); });
    await page.fill('#queryTry', 'tipo:anime');
    await expect(page.locator('#queryTryHint')).toContainText('2 obras');
    await page.press('#queryTry', 'Enter');
    await page.click('[data-act="query-to-smart"]');
    await expect(page.locator('#collectionSmart')).toBeChecked();
    await page.fill('#collectionName', 'Mis animes');
    await page.click('#collectionSaveBtn');
    const c = (await stored(page)).collections.find(x => x.name === 'Mis animes');
    expect([c.smart, c.query]).toEqual([true, 'tipo:anime']);
    expect(errors).toEqual([]);
});

test('colección inteligente: se actualiza sola al cambiar las obras', async ({ page }) => {
    await openApp(page);
    await goTo(page, 'collections');
    await page.evaluate(() => openCollectionModal());
    await page.fill('#collectionName', 'Para llorar');
    await page.check('#collectionSmart');
    await page.locator('[data-act="smart-example"]', { hasText: 'Para llorar' }).click();
    await expect(page.locator('#collectionQueryHint')).toContainText('1 obra ahora mismo');
    await page.click('#collectionSaveBtn');
    const card = page.locator('.collection-card', { hasText: 'Para llorar' });
    await expect(card).toContainText('✨');
    await expect(card.locator('.chip')).toHaveText('1');
    await page.evaluate(() => mutate(() => { getWorkById('w2').sadness = 5; }));
    await expect(card.locator('.chip')).toHaveText('2');
    // No aparece al añadir manualmente una obra a colecciones
    await page.evaluate(() => openCollectionPicker('w2'));
    await expect(page.locator('#sheetBody')).not.toContainText('Para llorar');
});

test('colección manual: ordenar, cambiar orden y compartir por enlace', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => openCollectionView('col2'));
    await expect(page.locator('#sheetBody .pick-item b').first()).toHaveText("Heaven Official's Blessing");
    await page.locator('#sheetBody [data-act="coll-move"][data-dir="1"]').first().click();
    await expect(page.locator('#sheetBody .pick-item b').first()).toHaveText('Only Friends');
    expect((await stored(page)).collections.find(c => c.id === 'col2').items).toEqual(['w4', 'w1']);
    await page.selectOption('[data-coll-sort="col2"]', 'title');
    await expect(page.locator('#sheetBody .pick-item b').first()).toHaveText("Heaven Official's Blessing");

    const link = await page.evaluate(() => collectionShareLink(getCollectionById('col2'), 7));
    expect(link).toContain('#compartido=');
    // Otra persona abre el enlace: lo ve y puede añadir a sus pendientes
    const other = await page.context().browser().newPage();
    await other.goto(page.url().split('#')[0] + link.slice(link.indexOf('#')));
    await expect(other.locator('html[data-ready="true"]')).toHaveCount(1);
    await expect(other.locator('#sheetTitle')).toContainText('Favoritos del año');
    await expect(other.locator('#sheetBody .pick-item')).toHaveCount(2);
    await other.close();
    // Un enlace caducado avisa
    const expired = await page.evaluate(() => parseSharedCollection('#compartido=' + b64encode(JSON.stringify({ n: 'x', exp: 1, w: [] }))));
    expect(expired.expired).toBe(true);
});

test('vistas guardadas y filtro por fechas', async ({ page }) => {
    await openApp(page);
    await goTo(page, 'books');
    if (await page.locator('#booksFilterBar.is-collapsed').count()) await page.click('[data-toggle-filters="booksFilterBar"]');
    await page.selectOption('#booksStatusFilter', 'terminado');
    await page.selectOption('#booksSort', 'title');
    page.once('dialog', d => d.accept('Leídos'));
    await page.click('[data-act="view-save"][data-id="books"]');
    await expect(page.locator('[data-saved-views="books"]')).toContainText('Leídos');
    await page.selectOption('#booksStatusFilter', 'all');
    await expect(page.locator('#booksGrid .card')).toHaveCount(3);
    await page.locator('[data-act="view-apply"]').click();
    await expect(page.locator('#booksStatusFilter')).toHaveValue('terminado');
    await expect(page.locator('#booksGrid .card')).toHaveCount(2);
    expect((await stored(page)).settings.savedViews[0]).toMatchObject({ page: 'books', name: 'Leídos', state: { booksStatusFilter: 'terminado', booksSort: 'title' } });

    await page.selectOption('#booksStatusFilter', 'all');
    await page.selectOption('#booksDateFilter', 'py');
    await expect(page.locator('#booksGrid .card')).toHaveCount(0);
});

test('obras parecidas con sus motivos', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => openDetail('w3'));
    await page.locator('#detailPanel details[data-key="similar"] [data-act="similar"]').click();
    await expect(page.locator('#sheetBody .pick-item').first()).toContainText('% parecida');
});
