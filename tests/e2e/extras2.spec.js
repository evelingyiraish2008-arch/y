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

test('rellenar datos trae un reparto más amplio y la dirección (con Wikidata cuando la fuente no la da)', async ({ page }) => {
    const errors = await openApp(page);
    await page.route('https://api.tvmaze.com/search/**', route => route.fulfill({ json: [{ show: { id: 7, name: 'Gran Reparto', premiered: '2023-01-01', genres: ['Drama'], summary: '<p>Una historia con mucho reparto para todos los que la ven en casa.</p>' } }] }));
    await page.route('https://api.tvmaze.com/shows/**', route => route.fulfill({ json: { _embedded: { episodes: [], cast: Array.from({ length: 12 }, (_, i) => ({ person: { name: 'Actor ' + (i + 1) }, character: { name: 'Pers ' + (i + 1) } })) } } }));
    await page.route(/wikidata\.org/, route => {
        const u = route.request().url();
        route.fulfill({ json: u.includes('wbsearchentities') ? { search: [{ id: 'Q2', label: 'Gran Reparto', description: 'serie de televisión de 2023', match: { text: 'Gran Reparto' } }] }
            : u.includes('props=claims') ? { entities: { Q2: { claims: { P57: [{ mainsnak: { datavalue: { value: { id: 'Q10' } } } }] } } } }
            : { entities: { Q10: { labels: { en: { value: 'Jojo Tichakorn' } } } } } });
    });
    await page.evaluate(() => openWorkModal('series'));
    await page.fill('#f_title', 'Gran Reparto');
    await page.click('[data-act="meta-search"]');
    await page.locator('#sheetBody .meta-result').first().click();
    await expect(page.locator('[data-field="actors"]')).toHaveValue(/Actor 1, .*Actor 10$/);
    expect((await page.locator('[data-field="actors"]').inputValue()).split(', ')).toHaveLength(10);
    await expect(page.locator('[data-field="directors"]')).toHaveValue('Jojo Tichakorn');
    expect(errors).toEqual([]);
});

test('buscador de imágenes: Openverse y Commons recientes aportan fotos más actuales sin salir de la app', async ({ page }) => {
    const errors = await openApp(page);
    const urls = [];
    await page.route(/graphql\.anilist\.co|wikipedia\.org|api\.jikan\.moe/, route => route.fulfill({ json: {} }));
    await page.route(/commons\.wikimedia\.org/, route => {
        urls.push(route.request().url());
        route.fulfill({ json: { query: { pages: { 1: { index: 1, title: 'File:Evento 2026.jpg', imageinfo: [{ url: 'https://up.test/evento.jpg', thumburl: 'https://up.test/evento-t.jpg', width: 1600, height: 900, mime: 'image/jpeg', descriptionurl: 'https://commons.test/evento' }] } } } } });
    });
    await page.route(/api\.openverse\.org/, route => route.fulfill({ json: { results: [{ url: 'https://ov.test/a.jpg', thumbnail: 'https://ov.test/a-t.jpg', width: 800, height: 1200, title: 'Retrato reciente', foreign_landing_url: 'https://ov.test/p' }] } }));
    await page.route(/(up|ov)\.test/, route => route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"/>' }));
    await page.evaluate(() => openImageSearch({ use: 'photo', query: 'Perth Tanapon', onPick: () => {} }));
    await expect(page.locator('#imgSearchSuggest')).toContainText(`Perth Tanapon ${new Date().getFullYear()}`);
    await expect(page.locator('#imgSearchResults')).toContainText('Retrato reciente');
    await expect(page.locator('#imgSearchResults')).toContainText('Evento 2026');
    expect(urls.some(u => u.includes('gsrsort=create_timestamp_desc'))).toBe(true); // una de las dos pide lo último subido
    await page.click('[data-act="img-search-more-sources"]');
    await expect(page.locator('#imgSearchTabs')).toContainText('Openverse');
    await expect(page.locator('#imgSearchTabs')).toContainText('Commons recientes');
    await page.locator('[data-act="img-search-tab"][data-id="openverse"]').click();
    await expect(page.locator('#imgSearchResults')).toContainText('Retrato reciente');
    expect(errors).toEqual([]);
});
