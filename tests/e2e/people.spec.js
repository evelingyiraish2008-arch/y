'use strict';
const { test, expect } = require('@playwright/test');
const { openApp, goTo, stored } = require('./helpers');

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

/** Respuestas falsas de las fuentes de imágenes (en las pruebas no hay internet). */
async function mockImageSources(page, { slow = false } = {}) {
    await page.route('https://graphql.anilist.co/**', async route => {
        if (slow) await new Promise(r => setTimeout(r, 4000));
        const body = JSON.parse(route.request().postData());
        if (body.query.includes('staff')) return route.fulfill({ json: { data: { Page: { staff: [{ name: { full: body.variables.q }, image: { large: 'https://img.test/anilist-staff.png', medium: 'https://img.test/anilist-staff.png' }, siteUrl: 'https://anilist.co/staff/1' }], characters: [] } } } });
        return route.fulfill({ json: { data: { Page: { media: [{ title: { romaji: body.variables.q }, bannerImage: 'https://img.test/anilist-banner.png', coverImage: { extraLarge: 'https://img.test/anilist-cover.png', large: 'https://img.test/anilist-cover.png' }, siteUrl: 'https://anilist.co/anime/1' }] } } } });
    });
    await page.route(/wikipedia\.org\/w\/api\.php/, route => route.fulfill({ json: { query: { pages: { 1: { index: 1, title: 'Foto Wiki', original: { source: 'https://img.test/wiki.jpg', width: 600, height: 800 }, thumbnail: { source: 'https://img.test/wiki.jpg' } } } } } }));
    await page.route(/commons\.wikimedia\.org/, route => route.fulfill({ json: { query: { pages: { 1: { index: 1, title: 'File:Commons.jpg', imageinfo: [{ url: 'https://img.test/commons.jpg', thumburl: 'https://img.test/commons.jpg', width: 1500, height: 500, mime: 'image/jpeg', descriptionurl: 'https://commons.wikimedia.org/wiki/File:Commons.jpg' }] } } } } }));
    await page.route(/api\.jikan\.moe/, route => route.fulfill({ json: { data: [] } }));
    await page.route('https://img.test/**', route => route.fulfill({ status: 200, contentType: 'image/png', body: PNG, headers: { 'Access-Control-Allow-Origin': '*' } }));
}
const sug = page => page.locator('#chipsug_actors');

test('actores como chips: sugerencias, "ya añadido", nombres parecidos y teclado', async ({ page }) => {
    const errors = await openApp(page);
    await page.evaluate(() => openWorkModal('series'));
    await page.fill('#f_title', 'Mi serie');
    const entry = page.locator('#chip_actors');
    await entry.pressSequentially('pa');
    await expect(sug(page)).toBeVisible();
    await expect(sug(page)).toContainText('Ya tienes registradas');
    await expect(sug(page).locator('.chip-opt').first()).toContainText('Park Jae Chan');
    await expect(sug(page)).toContainText('Crear “pa” como actor');
    // Flecha abajo + Enter elige la segunda
    await entry.press('ArrowDown');
    await entry.press('Enter');
    await expect(page.locator('[data-chip-field="actors"] .pchip')).toHaveCount(1);
    await expect(page.locator('#f_actors')).toHaveValue('Park Seo Ham');
    // La que ya está añadida sale marcada
    await entry.pressSequentially('park');
    await expect(sug(page).locator('.chip-opt', { hasText: 'Park Seo Ham' })).toContainText('Ya añadido');
    await entry.fill('');
    // Un nombre mal escrito: "¿Quizás quisiste decir…?"
    await entry.pressSequentially('Lee Jong Suc');
    await expect(sug(page)).toContainText('¿Quizás quisiste decir');
    await sug(page).locator('.chip-opt', { hasText: 'Lee Jong Suk' }).click();
    await expect(page.locator('#f_actors')).toHaveValue('Park Seo Ham, Lee Jong Suk');
    // Borrar con la tecla de retroceso
    await entry.press('Backspace');
    await expect(page.locator('#f_actors')).toHaveValue('Park Seo Ham');
    // Enter con un nombre parcial elige la primera coincidencia (y no guarda la obra)
    await entry.pressSequentially('jae');
    await entry.press('Escape');
    await entry.press('Enter');
    await expect(page.locator('#f_actors')).toHaveValue('Park Seo Ham, Park Jae Chan');
    await expect(page.locator('#workModal')).toHaveClass(/active/);
    await page.click('#workSaveBtn');
    const w = (await stored(page)).works.find(x => x.title === 'Mi serie');
    expect(w.personIds.sort()).toEqual(['p5', 'p6']);
    // La ficha de la persona la muestra como obra asociada
    await page.evaluate(() => openPersonDetail('p6'));
    await expect(page.locator('#personDetailCard')).toContainText('Mi serie');
    expect(errors).toEqual([]);
});

test('crear una persona al momento, sin foto, y queda vinculada por id aunque cambie de nombre', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => openWorkModal('series'));
    await page.fill('#f_title', 'Word of Honor');
    await page.locator('#chip_actors').pressSequentially('Gong Jun');
    await page.locator('#chip_actors').press('Enter');
    await expect(page.locator('#quickPerson')).toBeVisible();
    await expect(page.locator('#qpName')).toHaveValue('Gong Jun');
    await expect(page.locator('#qpRole')).toHaveValue('actor');
    await page.fill('#qpNat', 'China');
    await page.click('[data-act="quick-create"][data-id="nophoto"]');
    await expect(page.locator('#quickPerson')).toHaveCount(0);
    await expect(page.locator('[data-chip-field="actors"] .pchip')).toContainText('GJ'); // iniciales mientras no tenga foto
    // Directores: el rol se elige solo
    await page.locator('#chip_directors').pressSequentially('Ma Hua Gan');
    await page.locator('#chip_directors').press('Enter');
    await expect(page.locator('#qpRole')).toHaveValue('director');
    await page.click('[data-act="quick-create"][data-id="nophoto"]');
    await page.click('#workSaveBtn');
    const data = await stored(page);
    const gong = data.persons.find(p => p.name === 'Gong Jun');
    expect(gong).toMatchObject({ type: 'actor', nationality: 'China', autoCreated: true });
    expect(gong.linkPending).toBeUndefined();
    const w = data.works.find(x => x.title === 'Word of Honor');
    expect(w.personIds).toContain(gong.id);

    // Renombrar a la persona cambia el nombre en la obra
    await page.evaluate(id => openPersonModal(getPersonById(id)), gong.id);
    await page.fill('#personName', 'Simon Gong');
    await page.fill('#personAliases', 'Gong Jun');
    await page.click('#personSaveBtn');
    expect(await page.evaluate(() => appData.works.find(x => x.title === 'Word of Honor').actors)).toBe('Simon Gong');
    // y se le sigue encontrando por su otro nombre
    await page.evaluate(() => openWorkModal('series'));
    await page.fill('#f_title', 'Otra');
    await page.locator('#chip_actors').pressSequentially('Gong Jun');
    await expect(sug(page).locator('.chip-opt').first()).toContainText('Simon Gong');
});

test('pegar varios nombres: los conocidos se vinculan y los nuevos se crean de una vez', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => openWorkModal('series'));
    await page.fill('#f_title', 'Reparto pegado');
    await page.locator('#chip_actors').focus();
    await page.evaluate(() => {
        const dt = new DataTransfer();
        dt.setData('text', 'Park Seo Ham, Ana Nueva, Beto Nuevo');
        document.getElementById('chip_actors').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    });
    await expect(page.locator('[data-chip-field="actors"] .pchip')).toHaveCount(3);
    const note = page.locator('[data-chip-field="actors"] .chip-note');
    await expect(note).toContainText('2 personas nuevas');
    await note.locator('[data-act="chip-create-all"]').click();
    await expect(note).toBeHidden();
    await expect(page.locator('[data-chip-field="actors"] .pchip.is-text')).toHaveCount(0);
    expect(await page.evaluate(() => appData.persons.filter(p => ['Ana Nueva', 'Beto Nuevo'].includes(p.name)).map(p => p.type))).toEqual(['actor', 'actor']);
});

test('si cierras sin guardar, ofrece borrar las personas creadas y sin obra', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => openWorkModal('series'));
    await page.fill('#f_title', 'Borrador');
    await page.locator('#chip_actors').pressSequentially('Persona Suelta');
    await page.locator('#chip_actors').press('Enter');
    await page.click('[data-act="quick-create"][data-id="nophoto"]');
    expect(await page.evaluate(() => appData.persons.some(p => p.name === 'Persona Suelta'))).toBe(true);
    const asked = [];
    page.on('dialog', d => { asked.push(d.message()); d.accept(); });
    await page.locator('#workModal [data-close]').first().click();
    await expect.poll(() => asked.length).toBe(2);
    expect(asked[1]).toContain('1 persona creada sin obra vinculada (Persona Suelta)');
    await expect.poll(() => page.evaluate(() => appData.persons.some(p => p.name === 'Persona Suelta'))).toBe(false);
});

test('buscar la foto de una persona nueva en varias fuentes y guardarla en cuadrado', async ({ page }) => {
    await openApp(page);
    await mockImageSources(page);
    await page.evaluate(() => openWorkModal('series'));
    await page.fill('#f_title', 'Otra');
    await page.locator('#chip_actors').pressSequentially('Xiao Zhan');
    await page.locator('#chip_actors').press('Enter');
    await page.click('[data-act="quick-create"][data-id="photo"]');
    const panel = page.locator('#imgSearchModal');
    await expect(panel).toHaveClass(/active/);
    await expect(page.locator('#imgSearchQ')).toHaveValue('Xiao Zhan');
    await expect(page.locator('#imgSearchNotice')).toBeVisible(); // aviso de derechos, una vez por sesión
    await expect(page.locator('#imgSearchSuggest')).toContainText('Xiao Zhan photoshoot');
    await expect(page.locator('#imgSearchResults .img-result')).toHaveCount(3); // AniList, Wikipedia y Commons
    await page.locator('[data-act="img-search-tab"][data-id="wikipedia"]').click();
    await expect(page.locator('#imgSearchResults .img-result')).toHaveCount(1);
    await page.locator('#imgSearchResults .img-result-pick').first().click();
    await expect(panel).not.toHaveClass(/active/);
    await expect.poll(() => page.evaluate(() => (appData.persons.find(p => p.name === 'Xiao Zhan') || {}).image || '')).toMatch(/^idb:img_/);
    const size = await page.evaluate(() => new Promise(r => { const i = new Image(); i.onload = () => r([i.width, i.height]); i.src = resolveImageSrc(appData.persons.find(p => p.name === 'Xiao Zhan').image); }));
    expect(size[0]).toBe(size[1]); // cuadrada
    await expect(page.locator('[data-chip-field="actors"] .pchip img')).toHaveCount(1);
    // El aviso no se repite en la misma sesión
    await page.evaluate(() => openImageSearch({ use: 'banner', query: 'x', onPick: () => {} }));
    await expect(page.locator('#imgSearchNotice')).toBeHidden();
});

test('buscador: Pinterest y la web en otra pestaña, pegar el enlace y la espera larga', async ({ page }) => {
    await openApp(page);
    await mockImageSources(page, { slow: true });
    await page.evaluate(() => openWorkModal(null, getWorkById('w3')));
    await page.locator('[data-img-field="f_banner"] [data-act="img-search"]').click();
    await expect(page.locator('#imgSearchQ')).toHaveValue('The Untamed');
    await expect(page.locator('#imgSearchStatus')).toContainText(/Buscando en \d fuentes?…/);
    // Simula que pasan 15 segundos
    await page.evaluate(() => { imgSearch.slow = true; renderImgSearchResults(); });
    await expect(page.locator('#imgSearchStatus')).toContainText('¿Continuar esperando?');
    await page.locator('[data-act="img-search-stop"]').click();
    await expect(page.locator('#imgSearchStatus')).not.toContainText('Buscando');
    await page.locator('[data-act="img-search-tab"][data-id="web"]').click();
    await expect(page.locator('#imgSearchResults a', { hasText: 'Abrir Pinterest' })).toHaveAttribute('href', 'https://www.pinterest.com/search/pins/?q=The%20Untamed');
    await page.fill('#imgWebUrl', 'https://www.pinterest.com/pin/999/');
    await page.press('#imgWebUrl', 'Enter');
    await expect(page.locator('#imgWebError')).toContainText('enlace del pin');
    await page.fill('#imgWebUrl', 'https://img.test/pin-imagen.png');
    await page.click('[data-act="img-web-use"]');
    await expect(page.locator('#imgSearchModal')).not.toHaveClass(/active/);
    await expect(page.locator('#f_banner')).toHaveValue(/^idb:img_/);
});

test('ficha: reparto con fotos y personajes, pestaña Personajes y borrar quitando referencias', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => {
        const w = getWorkById('w8');
        w.characters = [{ id: 'k1', name: 'Chu Jae Young', role: 'protagonista', personId: 'p5' }, { id: 'k2', name: 'Jang Jae Young', role: 'protagonista', personId: 'p6', fav: true }];
        saveData();
        openDetail('w8');
    });
    const ficha = page.locator('#detailPanel details[data-key="ficha"]');
    await expect(ficha.locator('.person-chip', { hasText: 'Park Seo Ham' })).toContainText('→ Chu Jae Young');
    await expect(ficha.locator('.cast-line')).toHaveCount(2);
    await expect(ficha.locator('.cast-line').first()).toContainText('Park Seo Ham→Chu Jae Young');
    await page.evaluate(() => closeDetail());
    await goTo(page, 'persons');
    await page.locator('#personTabs [data-tab="characters"]').click();
    await expect(page.locator('#personsGrid .character-card')).toHaveCount(2);
    await expect(page.locator('#personsGrid .character-card').first()).toContainText('♥ Jang Jae Young');
    // Borrar a Park Jae Chan y quitarlo también de la obra
    page.on('dialog', d => d.accept());
    await page.evaluate(() => deletePerson('p6'));
    const w = await page.evaluate(() => getWorkById('w8'));
    expect(w.actors).toBe('Park Seo Ham');
    expect(w.characters.find(c => c.id === 'k2').personId).toBeUndefined();
});

test('Personalizar: auto-vinculación (crear automáticamente) y limpiar huérfanas', async ({ page }) => {
    await openApp(page);
    await goTo(page, 'settings');
    const auto = page.locator('[data-act="link-toggle"][data-id="linkAutoCreate"]');
    await expect(auto).toHaveAttribute('aria-checked', 'false');
    await auto.click();
    await expect(auto).toHaveAttribute('aria-checked', 'true');
    await page.evaluate(() => openWorkModal('series'));
    await page.fill('#f_title', 'Con auto');
    await page.locator('#chip_actors').pressSequentially('Nombre Nuevo');
    await page.locator('#chip_actors').press('Enter');
    await expect(page.locator('#quickPerson')).toHaveCount(0); // sin preguntar
    expect(await page.evaluate(() => appData.persons.some(p => p.name === 'Nombre Nuevo' && p.autoCreated))).toBe(true);
    // Se cierra sin guardar y se dice que no: queda huérfana. Se limpia desde Personalizar.
    page.on('dialog', d => (d.message().includes('sin obra vinculada') ? d.dismiss() : d.accept()));
    await page.evaluate(() => closeModal('workModal', { force: true }));
    await page.waitForTimeout(100);
    await page.evaluate(() => renderSettings());
    await expect(page.locator('[data-act="orphans-clean"]')).toContainText('(1)');
    await page.click('[data-act="orphans-clean"]');
    expect(await page.evaluate(() => appData.persons.some(p => p.name === 'Nombre Nuevo'))).toBe(false);
    // Desactivar las sugerencias
    await page.locator('[data-act="link-toggle"][data-id="linkSuggest"]').click();
    await page.evaluate(() => openWorkModal('series'));
    await page.fill('#f_title', 'Sin sugerencias');
    await page.locator('#chip_actors').pressSequentially('park');
    await expect(sug(page)).toBeHidden();
});

test('moodboard de una persona: categorías, filtros, mover, quitar y deshacer', async ({ page }) => {
    const errors = await openApp(page);
    await page.evaluate(() => openPersonDetail('p5'));
    const card = page.locator('#personDetailCard');
    await expect(card.locator('.mb-empty')).toContainText('Tu tablero está vacío');
    await page.setInputFiles('#mbFile_persons_p5', [{ name: 'uno.png', mimeType: 'image/png', buffer: PNG }, { name: 'dos.png', mimeType: 'image/png', buffer: PNG }]);
    await expect(card.locator('.mb-item')).toHaveCount(2);
    await card.locator('.mb-item').nth(1).locator('.mb-cat').selectOption('editorial');
    await card.locator('[data-act="mb-filter"][data-cat="editorial"]').click();
    await expect(card.locator('.mb-item')).toHaveCount(1);
    await card.locator('[data-act="mb-filter"][data-cat="all"]').click();
    // Mover la segunda al principio: su categoría viaja con ella
    await card.locator('.mb-item').nth(1).locator('[data-act="mb-move"][data-dir="-1"]').click({ force: true });
    expect(await page.evaluate(() => getPersonById('p5').galleryInfo.map(m => m.cat || ''))).toEqual(['editorial', '']);
    await card.locator('.mb-item').first().locator('[data-act="mb-del"]').click({ force: true });
    await expect(card.locator('.mb-item')).toHaveCount(1);
    expect(await page.evaluate(() => getPersonById('p5').galleryInfo)).toEqual([{ o: 'square', title: 'uno' }]);
    await page.evaluate(() => undo());
    await expect(card.locator('.mb-item')).toHaveCount(2);
    expect(errors).toEqual([]);
});

test('moodboard de una pareja: pegar enlaces y añadir varias desde el buscador', async ({ page }) => {
    await openApp(page);
    await mockImageSources(page);
    await page.evaluate(() => openCoupleDetail('c3'));
    const body = page.locator('#sheetBody');
    await body.locator('[data-act="mb-links"]').click();
    await body.locator('.mb-links textarea').fill('https://img.test/a.png\nhttps://www.pinterest.com/pin/1/\nhttps://img.test/b.png');
    await body.locator('[data-act="mb-links-add"]').click();
    await expect(page.locator('#toastStack')).toContainText('1 enlace no es de una imagen');
    await expect(body.locator('.mb-item')).toHaveCount(2);
    await body.locator('[data-act="mb-search"]').click();
    await expect(page.locator('#imgSearchResults .img-result')).toHaveCount(4);
    await page.locator('#imgSearchResults .img-result-pick').nth(0).click();
    await page.locator('#imgSearchResults .img-result-pick').nth(1).click();
    await expect(page.locator('#imgSearchBar')).toContainText('2 seleccionadas');
    await expect(page.locator('#imgSearchBar [data-id="banner"]')).toHaveCount(0); // con dos no se puede usar como banner
    await page.locator('#imgSearchBar [data-act="img-search-use"][data-id="gallery"]').click();
    await expect.poll(() => page.evaluate(() => getCoupleById('c3').gallery.length)).toBe(4);
    const info = await page.evaluate(() => getCoupleById('c3').galleryInfo);
    expect(info.filter(m => m.page).length).toBe(2); // se guarda el enlace de origen de lo buscado
});
