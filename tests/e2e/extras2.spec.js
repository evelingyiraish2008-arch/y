'use strict';
const { test, expect } = require('@playwright/test');
const { openApp, goTo, stored } = require('./helpers');

/** Abre la barra de filtros si está plegada (en el móvil empieza cerrada). */
async function openFilters(page, bar) {
    if (!(await page.locator('#' + bar).isVisible())) await page.click(`[data-toggle-filters="${bar}"]`);
}

test('filtro por país: aparece con bandera y cantidad, filtra y se guarda en las vistas', async ({ page }) => {
    const errors = await openApp(page);
    await goTo(page, 'series');
    await openFilters(page, 'seriesFilterBar');
    const sel = page.locator('#seriesCountryFilter');
    const labels = await sel.locator('option').allTextContents();
    expect(labels[0]).toContain('País: todos');
    expect(labels.join('|')).toMatch(/🇹🇭 Tailandia \(1\)/);
    expect(labels.join('|')).toMatch(/🇰🇷 Corea del Sur \(1\)/);
    await sel.selectOption('tailandia');
    await expect(page.locator('#seriesGrid .card')).toHaveCount(1);
    await expect(page.locator('#seriesGrid')).toContainText('Only Friends');
    // Anime: otro filtro con sus propios países
    await goTo(page, 'anime');
    await openFilters(page, 'animeFilterBar');
    await expect(page.locator('#animeCountryFilter option')).toContainText(['🌍 País: todos', '🇯🇵 Japón (2)']);
    await page.locator('#animeCountryFilter').selectOption('japon');
    await expect(page.locator('#animeGrid .card')).toHaveCount(2);
    // Solo BL
    await goTo(page, 'bl');
    await openFilters(page, 'blFilterBar');
    await page.locator('#blCountryFilter').selectOption('corea del sur');
    await expect(page.locator('#blGrid')).toContainText('Semantic Error');
    await expect(page.locator('#blGrid')).not.toContainText('Only Friends');
    // Una vista guardada recuerda el país
    page.once('dialog', d => d.accept('BL de Corea'));
    await page.click('[data-saved-views="bl"] [data-act="view-save"]');
    await page.locator('#blCountryFilter').selectOption('all');
    await page.click('[data-saved-views="bl"] [data-act="view-apply"]');
    await expect(page.locator('#blCountryFilter')).toHaveValue('corea del sur');
    expect(errors).toEqual([]);
});

test('el formulario de libros y manhwas también tiene País', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => openWorkModal('book'));
    await expect(page.locator('[data-field="country"]')).toBeVisible();
});

test('etiquetas: sugerencias detalladas, autocompletar y todas por grupos', async ({ page }) => {
    const errors = await openApp(page);
    await page.evaluate(() => openWorkModal('series'));
    await page.locator('#f_bl, [data-field="bl"]').first().check().catch(() => {});
    await page.fill('[data-field="country"]', 'Tailandia');
    await page.fill('#f_tags', 'BL, ');
    const hint = page.locator('#tagsHint');
    await expect(hint).toContainText('Más específicas');
    // Una etiqueta del catálogo se añade
    await hint.locator('[data-act="tag-add"]', { hasText: 'slow burn' }).first().click();
    await expect(page.locator('#f_tags')).toHaveValue(/slow burn/);
    // Autocompletar: lo escrito a medias se completa, no se queda al lado
    await page.fill('#f_tags', 'BL, enem');
    await expect(hint).toContainText('Etiquetas que encajan');
    await hint.locator('[data-act="tag-add"]', { hasText: 'enemigos a amantes' }).click();
    await expect(page.locator('#f_tags')).toHaveValue('BL, enemigos a amantes');
    // Todas por grupos
    await page.click('[data-act="tags-more"]');
    await expect(hint.locator('.tag-group')).toHaveCount(6);
    await expect(hint).toContainText('Ambientación');
    await hint.locator('.tag-group [data-act="tag-add"]', { hasText: 'universidad' }).click();
    await expect(page.locator('#f_tags')).toHaveValue(/universidad/);
    expect(errors).toEqual([]);
});

test('sinopsis en español: Rellenar datos la traduce, el botón del formulario y el de la ficha también', async ({ page }) => {
    const errors = await openApp(page);
    const asked = [];
    await page.route('https://api.mymemory.translated.net/**', route => {
        const q = new URL(route.request().url()).searchParams.get('q');
        asked.push(q);
        route.fulfill({ json: { responseStatus: 200, responseData: { translatedText: 'Dos jóvenes se enamoran en la universidad.' } } });
    });
    await page.route('https://api.tvmaze.com/search/**', route => route.fulfill({ json: [{ show: { id: 5, name: 'Love Class', premiered: '2022-01-01', summary: '<p>Two young men fall in love while they study at the university for the world.</p>', genres: ['Drama'] } }] }));
    await page.route('https://api.tvmaze.com/shows/**', route => route.fulfill({ json: { _embedded: { episodes: [], cast: [] } } }));
    await page.evaluate(() => openWorkModal('series'));
    await page.fill('#f_title', 'Love Class');
    await page.click('[data-act="meta-search"]');
    await expect(page.locator('#metaTranslate')).toBeChecked();
    await page.locator('#sheetBody .meta-result').first().click();
    await expect(page.locator('[data-field="synopsis"]')).toHaveValue('Dos jóvenes se enamoran en la universidad.');
    await expect(page.locator('#toastStack')).toContainText('sinopsis traducida');
    expect(asked.length).toBe(1);
    expect(asked[0]).toContain('Two young men');
    // Ya en español: el botón avisa y no llama al servicio
    await page.click('[data-act="synopsis-translate"]');
    await expect(page.locator('#toastStack')).toContainText('Ya parece estar en español');
    expect(asked.length).toBe(1);
    // Texto en inglés escrito a mano
    await page.fill('[data-field="synopsis"]', 'A spy, an assassin and a telepath form a family for the world.');
    await page.click('[data-act="synopsis-translate"]');
    await expect(page.locator('[data-field="synopsis"]')).toHaveValue('Dos jóvenes se enamoran en la universidad.');
    // En la ficha de una obra guardada (con deshacer)
    await page.evaluate(() => { closeModal('workModal', { force: true }); const w = appData.works.find(x => x.id === 'w5'); w.synopsis = 'Sorcerers fight curses that are born from the world and the people.'; saveData(); openDetail('w5'); });
    await page.locator('#detailPanel [data-act="work-translate"]').click();
    await expect(page.locator('#toastStack')).toContainText('Sinopsis traducida');
    const w5 = (await stored(page)).works.find(x => x.id === 'w5');
    expect(w5.synopsis).toBe('Dos jóvenes se enamoran en la universidad.');
    expect(w5.synopsisOriginal).toContain('Sorcerers');
    expect(errors).toEqual([]);
});

test('si la traducción falla, se queda la sinopsis original y se avisa', async ({ page }) => {
    await openApp(page);
    await page.route('https://api.mymemory.translated.net/**', route => route.fulfill({ json: { responseStatus: 200, responseData: { translatedText: 'MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY' } } }));
    await page.evaluate(() => openWorkModal('series'));
    await page.fill('[data-field="synopsis"]', 'Two young men fall in love while they study at the university for the world.');
    await page.click('[data-act="synopsis-translate"]');
    await expect(page.locator('#toastStack')).toContainText('No pude traducirla');
    await expect(page.locator('[data-field="synopsis"]')).toHaveValue(/Two young men/);
});
