'use strict';
const { test, expect } = require('@playwright/test');
const { openApp, goTo, stored } = require('./helpers');

const section = page => page.locator('#detailPanel details[data-key="watch"]');

test('guardar dónde verla: plataformas, otra web y el botón Ver ahora', async ({ page }) => {
    const errors = await openApp(page);
    await page.evaluate(() => openDetail('w4')); // Only Friends · plataforma Viki
    await expect(page.locator('#detailPanel .watch-btn')).toHaveCount(0);
    await section(page).locator('summary').click();
    // La plataforma que ya escribiste se sugiere sola
    await section(page).locator('[data-act="watch-suggest"]').click();
    await expect(page.locator('#detailPanel .watch-btn')).toContainText('Ver ahora');
    await expect(page.locator('#detailPanel .watch-btn')).toHaveAttribute('href', 'https://www.google.com/search?q=Only%20Friends+site%3Aviki.com');
    await expect(page.locator('#detailPanel .watch-btn')).toHaveAttribute('target', '_blank');
    await expect(page.locator('#detailPanel .watch-btn')).toHaveAttribute('rel', /noopener/);
    // Un enlace directo a Netflix (se reconoce solo) y otra web con nombre propio
    await section(page).locator('#watchUrl').fill('netflix.com/title/81234');
    await section(page).locator('#watchUrl').press('Enter');
    await expect(section(page).locator('.watch-row')).toHaveCount(2);
    await expect(section(page).locator('.watch-row').nth(1)).toContainText('Netflix');
    await section(page).locator('#watchPlatform').selectOption('');
    await expect(section(page).locator('#watchLabel')).toBeVisible();
    await section(page).locator('#watchLabel').fill('Doramasia');
    await section(page).locator('#watchUrl').fill('https://doramasia.com/only-friends-capitulo-{n}');
    await section(page).locator('[data-act="watch-add"]').click();
    await expect(section(page).locator('.watch-row')).toHaveCount(3);
    await expect(section(page).locator('.watch-row').nth(2)).toContainText('Doramasia');
    await expect(section(page).locator('.watch-row').nth(2)).toContainText('continúa en ep 7'); // llevaba 6
    // Hacer principal: el botón de arriba cambia, y {n} se rellena con el próximo episodio
    await section(page).locator('.watch-row').nth(2).locator('[data-act="watch-primary"]').click();
    await expect(page.locator('#detailPanel .watch-btn')).toHaveAttribute('href', 'https://doramasia.com/only-friends-capitulo-7');
    await expect(page.locator('#detailPanel .watch-btn')).toContainText('Continuar · ep 7');
    // Al avanzar un episodio, el enlace sigue a la vez
    await page.locator('#detailPanel [data-act="progress"]').click();
    await expect(page.locator('#detailPanel .watch-btn')).toHaveAttribute('href', 'https://doramasia.com/only-friends-capitulo-8');
    const w = (await stored(page)).works.find(x => x.id === 'w4');
    expect(w.watchLinks.map(l => [l.platform || '', l.label || '', l.url || ''])).toEqual([
        ['', 'Doramasia', 'https://doramasia.com/only-friends-capitulo-{n}'], ['viki', '', ''], ['netflix', '', 'https://netflix.com/title/81234'].map(x => x)].map(r => r));
    // Quitar y deshacer
    await section(page).locator('.watch-row').nth(0).locator('[data-act="watch-del"]').click();
    await expect(section(page).locator('.watch-row')).toHaveCount(2);
    await page.evaluate(() => undo());
    await expect(section(page).locator('.watch-row')).toHaveCount(3);
    expect(errors).toEqual([]);
});

test('los enlaces raros se rechazan y el botón aparece también en Inicio', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => { openDetail('w3'); });
    await section(page).locator('summary').click();
    await section(page).locator('#watchPlatform').selectOption('');
    await section(page).locator('#watchUrl').fill('javascript:alert(1)');
    await section(page).locator('[data-act="watch-add"]').click();
    await expect(page.locator('#toastStack')).toContainText('no parece una página web');
    await section(page).locator('#watchUrl').fill('');
    await section(page).locator('[data-act="watch-add"]').click();
    await expect(page.locator('#toastStack')).toContainText('Pega el enlace');
    expect((await page.evaluate(() => getWorkById('w3').watchLinks))).toBeUndefined();
    // Un enlace válido: se ve en Inicio junto a "+1 ep"
    await section(page).locator('#watchPlatform').selectOption('netflix');
    await section(page).locator('[data-act="watch-add"]').click();
    await page.evaluate(() => closeDetail());
    await goTo(page, 'home');
    await expect(page.locator('#heroContent a.watch-btn')).toContainText('Ver ahora');
    expect(await page.evaluate(() => getWorkById('w3').watchLinks.length)).toBe(1);
});

test('libros y manhwas dicen "Dónde leerla" y solo ofrecen plataformas de lectura', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => openDetail('w6')); // Solo Leveling · Webtoon
    await expect(section(page).locator('summary')).toContainText('Dónde leerla');
    await section(page).locator('summary').click();
    const options = await section(page).locator('#watchPlatform option').allTextContents();
    expect(options.join('|')).toContain('Webtoon');
    expect(options.join('|')).not.toContain('Netflix');
    await section(page).locator('[data-act="watch-suggest"]').click();
    await expect(page.locator('#detailPanel .watch-btn')).toContainText('Leer ahora');
});

test('con la clave de TMDB dice dónde está disponible en tu país y permite añadirlo', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => { appData.settings.tmdbKey = 'clave-de-prueba'; saveData(); });
    await page.route('https://api.themoviedb.org/3/search/tv**', route => route.fulfill({ json: { results: [{ id: 77 }] } }));
    await page.route('https://api.themoviedb.org/3/tv/77/watch/providers**', route => route.fulfill({ json: { results: {
        MX: { link: 'https://www.themoviedb.org/tv/77/watch', flatrate: [{ provider_name: 'Netflix' }, { provider_name: 'Canal Raro' }], rent: [{ provider_name: 'Apple TV' }] } } } }));
    await page.evaluate(() => openDetail('w3'));
    await section(page).locator('summary').click();
    await section(page).locator('#watchCountry').selectOption('MX');
    await section(page).locator('[data-act="watch-providers"]').click();
    await expect(section(page).locator('.watch-avail')).toContainText('Incluida en');
    await expect(section(page).locator('.watch-avail')).toContainText('Canal Raro');
    await expect(section(page).locator('.watch-avail')).toContainText('Ver todas en JustWatch');
    await section(page).locator('.watch-avail [data-act="watch-suggest"]', { hasText: 'Netflix' }).click();
    await expect(section(page).locator('.watch-row')).toHaveCount(1);
    await expect(section(page).locator('.watch-row')).toContainText('Netflix');
    expect(await page.evaluate(() => appData.settings.watchCountry)).toBe('MX');
    // Otro país sin datos
    await section(page).locator('#watchCountry').selectOption('JP');
    await section(page).locator('[data-act="watch-providers"]').click();
    await expect(section(page).locator('.watch-avail')).toContainText('no tiene datos de plataformas');
});

test('sin clave de TMDB se explica cómo tener la disponibilidad', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => openDetail('w3'));
    await section(page).locator('summary').click();
    await expect(section(page).locator('.hint').last()).toContainText('clave de TMDB');
});
