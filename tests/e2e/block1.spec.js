'use strict';
const { test, expect } = require('@playwright/test');
const { openApp, goTo, stored } = require('./helpers');

test('Para rever: se marca desde la ficha, tiene su pestaña, sigue contando como terminada y se puede volver a ver ya', async ({ page }) => {
    const errors = await openApp(page);
    const doneBefore = await page.evaluate(() => appData.works.filter(w => isDone(w)).length);
    await page.evaluate(() => openDetail('w8')); // Semantic Error, terminada
    await page.locator('#detailPanel [data-act="rewatch-mark"]').click();
    await expect(page.locator('#toastStack')).toContainText('quedó para rever');
    expect((await stored(page)).works.find(w => w.id === 'w8').status).toBe('para rever');
    await expect(page.locator('#detailPanel')).toContainText('Para rever');
    expect(await page.evaluate(() => appData.works.filter(w => isDone(w)).length)).toBe(doneBefore); // no cambia lo "terminado" de las estadísticas
    // Pestaña propia en Series
    await page.evaluate(() => closeDetail());
    await goTo(page, 'series');
    await expect(page.locator('#seriesCountRewatch')).toHaveText('1');
    await page.click('#seriesTabs [data-filter="para rever"]');
    await expect(page.locator('#seriesGrid')).toContainText('Semantic Error');
    await expect(page.locator('#seriesGrid .card')).toHaveCount(1);
    await expect(page.locator('#seriesCountTerminado')).toHaveText('0'); // la pestaña Terminadas solo lista las que siguen en "Terminado"
    // En el formulario es un estado más
    await page.evaluate(() => openWorkModal(null, getWorkById('w8')));
    await expect(page.locator('#f_status')).toHaveValue('para rever');
    await expect(page.locator('#f_status option')).toHaveText(['Viendo', 'Terminado', 'Para rever', 'Quiero ver', 'Abandonado']);
    await page.evaluate(() => closeModal('workModal', { force: true }));
    // Volver a verla ya la pone en curso desde el principio
    await page.evaluate(() => openDetail('w8'));
    await page.locator('#detailPanel .detail-actions [data-act="reread-start"]').click();
    const w = (await stored(page)).works.find(x => x.id === 'w8');
    expect([w.status, w.progress, w.rereading]).toEqual(['viendo', 0, true]);
    expect(errors).toEqual([]);
});

test('Para releer en libros, filtro por estado, búsqueda "estado:rever" y cambio de estado en grupo', async ({ page }) => {
    const errors = await openApp(page);
    await page.evaluate(() => { getWorkById('w2').status = 'para releer'; saveData(); refreshView(); });
    await goTo(page, 'books');
    if (!(await page.locator('#booksFilterBar').isVisible())) await page.click('[data-toggle-filters="booksFilterBar"]');
    await page.selectOption('#booksStatusFilter', 'para releer');
    await expect(page.locator('#booksGrid .card')).toHaveCount(1);
    await expect(page.locator('#booksGrid')).toContainText('El Nombre del Viento');
    await expect(page.locator('#booksGrid .card')).toContainText('Para releer');
    await page.selectOption('#booksStatusFilter', 'all');
    await page.fill('#booksSearch', 'estado:repetir');
    await expect(page.locator('#booksGrid .card')).toHaveCount(1);
    // Marcar varios a la vez
    await page.fill('#booksSearch', '');
    const status = await page.evaluate(() => { const w = getWorkById('w7'); w.status = 'terminado'; return statusFor('rewatch', 'book') + '/' + statusFor('rewatch', 'anime') + '/' + statusFor('plan', 'anime'); });
    expect(status).toBe('para releer/para rever/quiero ver');
    expect(errors).toEqual([]);
});

test('ficha: cuándo salió, mi recorrido y especiales aparte del porcentaje', async ({ page }) => {
    const errors = await openApp(page);
    await page.evaluate(() => {
        Object.assign(getWorkById('w8'), { firstAired: '2022-04-11', lastAired: '2022-05-30', startDate: '2026-08-10', endDate: '2026-08-15', specialsTotal: 3, specialsSeen: 1 });
        saveData(); openDetail('w8');
    });
    const cards = page.locator('#detailPanel .date-cards');
    await expect(cards).toContainText('Cuándo salió');
    await expect(cards).toContainText('7 semanas');
    await expect(cards).toContainText('Mi recorrido');
    await expect(cards).toContainText('La vi en 5 días');
    const row = page.locator('#detailPanel .specials-row');
    await expect(row).toContainText('1 / 3');
    await expect(row).toContainText('no cuentan en el %');
    await row.locator('[data-act="special-plus"]').click();
    await expect(row).toContainText('2 / 3');
    expect((await stored(page)).works.find(w => w.id === 'w8').specialsSeen).toBe(2);
    // El porcentaje de la serie no cambió
    expect(await page.evaluate(() => getProgress(getWorkById('w8')))).toBe(100);
    await row.locator('[data-act="special-minus"]').click();
    await expect(row).toContainText('1 / 3');
    // Una serie en emisión sin último episodio
    await page.evaluate(() => { Object.assign(getWorkById('w4'), { firstAired: '2023-01-06', airStatus: 'En emisión' }); saveData(); openDetail('w4'); });
    await expect(page.locator('#detailPanel .date-cards')).toContainText('sigue en emisión');
    // Sin fechas apuntadas lo dice y pide editarla
    await page.evaluate(() => { const w = getWorkById('w3'); delete w.startDate; delete w.endDate; saveData(); openDetail('w3'); });
    await expect(page.locator('#detailPanel .date-cards')).toContainText('Sin apuntar');
    expect(errors).toEqual([]);
});

test('formulario: fechas de estreno y especiales se guardan, se validan y Rellenar datos los trae sin contar los especiales', async ({ page }) => {
    const errors = await openApp(page);
    await page.route('https://api.tvmaze.com/search/**', route => route.fulfill({ json: [{ show: { id: 11, name: 'Con Especiales', premiered: '2023-01-06', status: 'Ended', genres: [], summary: '<p>Una historia con especiales para todos los que la ven en casa.</p>' } }] }));
    await page.route('https://api.tvmaze.com/shows/**', route => route.fulfill({ json: { _embedded: { cast: [], episodes: [
        ...['2023-01-06', '2023-01-13', '2023-01-20', '2023-01-27', '2023-02-03', '2023-02-10'].map((airdate, i) => ({ season: 1, number: i + 1, airdate, type: 'regular' })),
        { season: 1, number: null, airdate: '2023-02-20', type: 'significant_special' }, { season: 1, number: null, airdate: '2023-02-27', type: 'insignificant_special' }] } } }));
    await page.route(/wikidata\.org/, route => route.fulfill({ json: {} }));
    await page.evaluate(() => openWorkModal('series'));
    await page.fill('#f_title', 'Con Especiales');
    await page.click('[data-act="meta-search"]');
    await page.locator('#sheetBody .meta-result').first().click();
    await expect(page.locator('[data-field="totalEpisodes"]')).toHaveValue('6'); // los 2 especiales no suman
    await expect(page.locator('[data-field="specialsTotal"]')).toHaveValue('2');
    await expect(page.locator('[data-field="firstAired"]')).toHaveValue('2023-01-06');
    await expect(page.locator('[data-field="lastAired"]')).toHaveValue('2023-02-10');
    // Un último episodio anterior al primero no se guarda
    await page.fill('[data-field="lastAired"]', '2022-01-01');
    await page.click('#workSaveBtn');
    await expect(page.locator('#toastStack')).toContainText('anterior al primero');
    await page.fill('[data-field="lastAired"]', '2023-02-10');
    await page.fill('[data-field="specialsSeen"]', '5'); // más que el total: se recorta al total
    await page.click('#workSaveBtn');
    const w = (await stored(page)).works.find(x => x.title === 'Con Especiales');
    expect([w.totalEpisodes, w.specialsTotal, w.specialsSeen, w.firstAired, w.lastAired]).toEqual([6, 2, 2, '2023-01-06', '2023-02-10']);
    expect(errors).toEqual([]);
});
