'use strict';
const { test, expect } = require('@playwright/test');
const { openApp, goTo } = require('./helpers');

/** Pulsa algo que abre otra pestaña y devuelve su dirección (las webs de fuera se simulan: no hay internet). */
async function popupUrl(page, click) {
    await page.context().route(/google\.com|pinterest\.com|wikipedia\.org|mydramalist\.com|youtube\.com|bing\.com/, route => route.fulfill({ status: 200, contentType: 'text/html', body: '<html>ok</html>' }));
    const [popup] = await Promise.all([page.context().waitForEvent('page'), click()]);
    await popup.waitForLoadState('domcontentloaded').catch(() => {});
    const url = popup.url();
    await popup.close();
    return url;
}

test('búsqueda global: encuentra personas por cualquier nombre y etiquetas, y ofrece Google y Pinterest', async ({ page }) => {
    const errors = await openApp(page);
    await page.evaluate(() => { const p = getPersonById('p2'); p.nativeName = 'ไบร์ท'; p.birthName = 'Vachirawit Chivaaree'; saveData(); });
    // Una persona, por su nombre de nacimiento: sale con el nombre artístico y dice cuál coincidió
    await page.fill('#globalSearch', 'Chivaaree');
    const hit = page.locator('#globalSearchResults .search-result', { hasText: 'Bright Vachirawit' });
    await expect(hit).toHaveCount(1);
    await expect(hit).toContainText('Vachirawit Chivaaree');
    // Una etiqueta: sale como resultado y al tocarla se ven sus obras
    await page.fill('#globalSearch', 'wuxia');
    const tag = page.locator('#globalSearchResults .search-result', { hasText: '#wuxia' });
    await expect(tag).toContainText('Etiqueta · 1 obra');
    await tag.click();
    await expect(page.locator('#sheetBody')).toContainText('The Untamed');
    await page.evaluate(() => closeModal('sheetModal'));
    // Siempre al final: ¿No está? Google · Pinterest
    await page.fill('#globalSearch', 'only friends');
    const foot = page.locator('#globalSearchResults .search-web');
    await expect(foot).toContainText('¿No está? Buscar “only friends”');
    expect(await popupUrl(page, () => foot.locator('[data-id="google"]').click())).toContain('google.com/search?q=only%20friends');
    expect(await popupUrl(page, () => foot.locator('[data-id="pinterest"]').click())).toContain('pinterest.com/search/pins/?q=only%20friends');
    // Y también cuando no hay ningún resultado
    await page.fill('#globalSearch', 'zzzqqq');
    await expect(page.locator('#globalSearchResults')).toContainText('Sin resultados');
    await expect(page.locator('#globalSearchResults .search-web')).toBeVisible();
    expect(errors).toEqual([]);
});

test('paleta de comandos: grupo "Buscar en internet" y la ventana con más buscadores', async ({ page }) => {
    await openApp(page);
    await page.keyboard.press('Control+k');
    await page.fill('#paletteInput', 'perth santa');
    const group = page.locator('#paletteList .palette-group', { hasText: 'Buscar en internet' });
    await expect(group).toBeVisible();
    const gpt = page.locator('#paletteList .palette-item', { hasText: 'en Pinterest' });
    expect(await popupUrl(page, () => gpt.click())).toContain('pinterest.com/search/pins/?q=perth%20santa');
    await page.keyboard.press('Control+k');
    await page.fill('#paletteInput', 'perth santa');
    await page.locator('#paletteList .palette-item', { hasText: 'Más buscadores' }).click();
    await expect(page.locator('#sheetTitle')).toContainText('Buscar');
    await expect(page.locator('#webQ')).toHaveValue('perth santa');
    // Cambiar el texto y buscar con Enter abre Google con lo nuevo
    await page.fill('#webQ', 'perth santa dramas');
    expect(await popupUrl(page, () => page.press('#webQ', 'Enter'))).toContain('google.com/search?q=perth%20santa%20dramas');
});

test('fichas: buscar la obra, la persona o la pareja con sugerencias que sirven', async ({ page }) => {
    const errors = await openApp(page);
    // Obra BL: reparto, sinopsis, etiquetas, dónde verla…
    await page.evaluate(() => openDetail('w4'));
    await page.locator('#detailPanel [data-act="web-work"]').click();
    await expect(page.locator('#webQ')).toHaveValue('Only Friends');
    const sugg = page.locator('#sheetBody .tag-list .chip');
    await expect(sugg).toContainText(['La obra', 'Reparto', 'Sinopsis', 'Etiquetas y géneros', 'Dónde verla', 'Wiki o ficha']);
    expect(await popupUrl(page, () => sugg.filter({ hasText: 'Reparto' }).click())).toContain('google.com/search?q=Only%20Friends%20reparto');
    await page.locator('#sheetBody details summary').click();
    expect(await popupUrl(page, () => page.locator('#sheetBody [data-act="web-go"][data-id="mydramalist"]').click())).toContain('mydramalist.com/search?q=Only%20Friends');
    // Persona
    await page.evaluate(() => { closeModal('sheetModal'); closeDetail(); openPersonDetail('p2'); });
    await page.locator('#personDetailCard [data-act="web-person"]').click();
    await expect(page.locator('#sheetBody .tag-list')).toContainText('Nombre real');
    expect(await popupUrl(page, () => page.locator('#sheetBody .tag-list .chip', { hasText: 'Filmografía' }).click())).toContain('Bright%20Vachirawit%20filmograf');
    // Pareja: usa el nombre de ship
    await page.evaluate(() => { closeModal('sheetModal'); closeModal('personDetailOverlay'); getCoupleById('c3').ship = 'SeoJae'; saveData(); openCoupleDetail('c3'); });
    await page.locator('#sheetBody [data-act="web-couple"]').click();
    await expect(page.locator('#webQ')).toHaveValue('SeoJae');
    await expect(page.locator('#sheetBody .tag-list')).toContainText('Sus dramas juntos');
    // Sin texto no se busca
    await page.fill('#webQ', '');
    await page.click('#sheetBody [data-act="web-go"][data-id="google"]');
    await expect(page.locator('#toastStack')).toContainText('Escribe qué quieres buscar');
    expect(errors).toEqual([]);
});

test('panel de imágenes: solo Recomendadas y Google y Pinterest; el resto está en "Más fuentes"', async ({ page }) => {
    await openApp(page);
    await page.route(/graphql\.anilist\.co|wikipedia\.org|commons\.wikimedia\.org|api\.jikan\.moe/, route => route.fulfill({ json: {} }));
    await page.evaluate(() => openImageSearch({ use: 'banner', query: 'Given', onPick: () => {} }));
    const tabs = page.locator('#imgSearchTabs [data-act="img-search-tab"]');
    await expect(tabs).toHaveText(['✨ Recomendadas', '🌐 Google y Pinterest']);
    const more = page.locator('[data-act="img-search-more-sources"]');
    await expect(more).toContainText('Más fuentes');
    await more.click();
    await expect(tabs).toContainText(['✨ Recomendadas', '🌐 Google y Pinterest', '🎌 AniList']);
    await page.locator('[data-act="img-search-tab"][data-id="anilist"]').click();
    await more.click(); // con una fuente abierta, esconderlas te devuelve a Recomendadas
    await expect(tabs).toHaveCount(2);
    await expect(page.locator('#imgSearchTabs .is-on')).toHaveText('✨ Recomendadas');
});

test('al buscar datos de una obra, también se ofrece buscarla en internet', async ({ page }) => {
    await openApp(page);
    await page.route(/graphql\.anilist\.co|api\.tvmaze\.com|api\.jikan\.moe|openlibrary\.org|googleapis\.com/, route => route.fulfill({ json: [] }));
    await page.evaluate(() => openWorkModal('series'));
    await page.fill('#f_title', 'Una Serie Rarísima');
    await page.click('[data-act="meta-search"]');
    await expect(page.locator('#sheetBody .meta-web')).toContainText('¿No está? Buscar “Una Serie Rarísima”');
    expect(await popupUrl(page, () => page.locator('#sheetBody .meta-web [data-id="google"]').click())).toContain('google.com/search?q=Una%20Serie%20Rar');
});
