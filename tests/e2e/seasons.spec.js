'use strict';
const { test, expect } = require('@playwright/test');
const { openApp, goTo, stored } = require('./helpers');

/** Deja "Only Friends" (w4) con 3 temporadas: 12/12, 7/12 y 0/10. */
async function threeSeasons(page) {
    await page.evaluate(() => {
        const w = getWorkById('w4');
        w.seasonsList = [{ number: 1, year: 2023, episodes: 12, progress: 12, rating: 4 }, { number: 2, year: 2024, episodes: 12, progress: 7, rating: 0 }, { number: 3, year: 2025, episodes: 10, progress: 0, rating: 0 }];
        syncSeasonAggregates(w);
        saveData();
    });
}

test('ficha: dos barras, la de la temporada actual y la de toda la serie', async ({ page }) => {
    const errors = await openApp(page);
    await threeSeasons(page);
    await page.evaluate(() => openDetail('w4'));
    const box = page.locator('#detailPanel .dual-progress');
    await expect(box.locator('.dual-row').nth(0)).toContainText('Temporada 2');
    await expect(box.locator('.dual-row').nth(0)).toContainText('ep 7 / 12');
    await expect(box.locator('.dual-row').nth(0).locator('.dual-pct')).toHaveText('58 %');
    await expect(box.locator('.dual-row').nth(1)).toContainText('Serie completa');
    await expect(box.locator('.dual-row').nth(1)).toContainText('19 / 34 · 1/3 temporadas');
    await expect(box.locator('.dual-row').nth(1).locator('.dual-pct')).toHaveText('56 %');
    await expect(box.locator('.dual-hint')).toContainText('Te faltan 5 eps para cerrar la temporada 2');
    await expect(box.locator('.dual-hint')).toContainText('⏱️ ≈ 12 h para terminar');
    // El + avanza en la temporada actual y se actualizan las dos barras
    await page.locator('#detailPanel [data-act="progress"]').click();
    await expect(box.locator('.dual-row').nth(0).locator('.dual-pct')).toHaveText('67 %');
    await expect(box.locator('.dual-row').nth(1).locator('.dual-pct')).toHaveText('59 %');
    // Una obra sin temporadas sigue con su barra de siempre
    await page.evaluate(() => openDetail('w3'));
    await expect(page.locator('#detailPanel .dual-progress')).toHaveCount(0);
    expect(errors).toEqual([]);
});

test('episodios uno a uno, terminar y reiniciar una temporada', async ({ page }) => {
    await openApp(page);
    await threeSeasons(page);
    await page.evaluate(() => openDetail('w4'));
    const seasons = page.locator('#detailPanel details[data-key="seasons"]');
    const third = seasons.locator('.season-item').nth(2);
    await third.locator('summary').click();
    await expect(third.locator('.ep-cell')).toHaveCount(10);
    await third.locator('.ep-cell').nth(3).click(); // ep 4 → progreso 4
    expect(await page.evaluate(() => getWorkById('w4').seasonsList[2].progress)).toBe(4);
    await expect(page.locator('#detailPanel .season-item').nth(2).locator('.ep-cell.is-seen')).toHaveCount(4);
    // Tocar el último visto lo quita
    await page.locator('#detailPanel .season-item').nth(2).locator('.ep-cell').nth(3).click();
    expect(await page.evaluate(() => getWorkById('w4').seasonsList[2].progress)).toBe(3);
    // Marcar terminada la temporada 2 (7/12 → 12/12), y la actual pasa a la 3
    await page.locator('#detailPanel .season-item').nth(1).locator('[data-act="season-finish"]').click();
    expect(await page.evaluate(() => getWorkById('w4').seasonsList[1].progress)).toBe(12);
    expect(await page.evaluate(() => getWorkById('w4').progress)).toBe(12 + 12 + 3);
    await expect(page.locator('#detailPanel .dual-row').first()).toContainText('Temporada 3');
    await expect(page.locator('#toastStack')).toContainText('Temporada 2 terminada');
    // Reiniciar y deshacer
    await page.locator('#detailPanel .season-item').nth(0).locator('[data-act="season-set"][data-value="0"]').click();
    expect(await page.evaluate(() => getWorkById('w4').seasonsList[0].progress)).toBe(0);
    await page.evaluate(() => undo());
    expect(await page.evaluate(() => getWorkById('w4').seasonsList[0].progress)).toBe(12);
    expect((await stored(page)).works.find(w => w.id === 'w4').seasonsList[0].progress).toBe(12);
});

test('terminar la última temporada termina la serie; en Inicio y en las tarjetas se ven los dos porcentajes', async ({ page }) => {
    await openApp(page);
    await threeSeasons(page);
    // Tarjeta: texto de ayuda con los dos porcentajes y dos barras finas
    await goTo(page, 'series');
    const card = page.locator('#seriesGrid .card', { hasText: 'Only Friends' });
    await expect(card.locator('.pill[title]').first()).toHaveAttribute('title', 'Temporada 2: 58 % · Serie completa: 56 %');
    await expect(card.locator('.card-progress.dual')).toHaveCount(1);
    // Inicio: el protagonista del banner es la obra en curso
    await page.evaluate(() => { getWorkById('w4').favorite = true; getWorkById('w3').favorite = false; renderHome(); });
    await goTo(page, 'home');
    await expect(page.locator('#heroContent .dual-progress')).toContainText('Serie completa');
    // Terminar todo
    await page.evaluate(() => { openDetail('w4'); });
    for (const i of [1, 2]) await page.locator('#detailPanel .season-item').nth(i).locator('[data-act="season-finish"]').click();
    await expect.poll(() => page.evaluate(() => getWorkById('w4').status)).toBe('terminado');
    await expect(page.locator('#detailPanel .dual-hint')).toContainText('Serie completa');
});

test('rellenar datos por el título trae las temporadas con sus episodios y no pisa lo que ya tenías', async ({ page }) => {
    const errors = await openApp(page);
    await page.route('https://api.tvmaze.com/search/**', route => route.fulfill({ json: [{ show: { id: 9, name: 'Serie Larga', premiered: '2020-01-01', genres: ['Drama'], image: null } }] }));
    await page.route('https://api.tvmaze.com/shows/**', route => route.fulfill({ json: { _embedded: {
        episodes: [...Array(10).fill(0).map(() => ({ season: 1, airdate: '2020-03-01' })), ...Array(8).fill(0).map(() => ({ season: 2, airdate: '2022-04-01' }))], cast: [] } } }));
    await page.evaluate(() => openWorkModal('series'));
    await page.fill('#f_title', 'Serie Larga');
    await page.locator('[data-field="progress"]').fill('12');
    await page.click('[data-act="meta-search"]');
    await page.locator('#sheetBody .meta-result').first().click();
    await expect(page.locator('#f_multi')).toBeChecked();
    await expect(page.locator('#seasonsEditor [data-season-row]')).toHaveCount(2);
    await expect(page.locator('#seasonsEditor [data-sfield="episodes"]').nth(0)).toHaveValue('10');
    await expect(page.locator('#seasonsEditor [data-sfield="episodes"]').nth(1)).toHaveValue('8');
    await expect(page.locator('#seasonsEditor [data-sfield="year"]').nth(1)).toHaveValue('2022');
    // Lo que ya llevabas (12 episodios) se reparte: 10 en la primera y 2 en la segunda
    await expect(page.locator('#seasonsEditor [data-sfield="progress"]').nth(0)).toHaveValue('10');
    await expect(page.locator('#seasonsEditor [data-sfield="progress"]').nth(1)).toHaveValue('2');
    await expect(page.locator('#toastStack')).toContainText('2 temporadas con sus episodios');
    await page.click('#workSaveBtn');
    const w = (await stored(page)).works.find(x => x.title === 'Serie Larga');
    expect([w.totalEpisodes, w.progress, w.seasonsList.length]).toEqual([18, 12, 2]);
    expect(errors).toEqual([]);
});
