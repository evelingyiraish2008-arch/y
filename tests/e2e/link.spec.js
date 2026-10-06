'use strict';
const { test, expect } = require('@playwright/test');
const { openApp, goTo, stored } = require('./helpers');

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const image = route => route.fulfill({ status: 200, contentType: 'image/png', body: PNG, headers: { 'Access-Control-Allow-Origin': '*' } });

/** TVmaze con reparto (fotos y personajes) y Wikipedia para las fotos que falten. */
async function mockSources(page, { wikiTitle = null } = {}) {
    await page.route('https://api.tvmaze.com/search/shows**', route => route.fulfill({ json: [{ show: { id: 42, name: 'Word of Honor', premiered: '2021-02-22', genres: ['Drama'], image: { medium: 'https://static.tvmaze.com/p.png' } } }] }));
    await page.route('https://api.tvmaze.com/shows/42**', route => route.fulfill({ json: { _embedded: { episodes: [{ season: 1 }, { season: 1 }], cast: [
        { person: { name: 'Zhang Zhehan', image: { original: 'https://static.tvmaze.com/zhang.png' } }, character: { name: 'Zhou Zishu', image: { medium: 'https://static.tvmaze.com/zhou.png' } } },
        { person: { name: 'Gong Jun', image: { original: 'https://static.tvmaze.com/gong.png' } }, character: { name: 'Wen Kexing' } }
    ] } } }));
    await page.route('https://static.tvmaze.com/**', image);
    await page.route(/wikipedia\.org\/w\/api\.php/, route => {
        const q = new URL(route.request().url()).searchParams.get('gsrsearch');
        const title = wikiTitle === null ? q : wikiTitle;
        return route.fulfill({ json: { query: { pages: { 1: { index: 1, title, original: { source: 'https://img.test/wiki.png', width: 400, height: 500 }, thumbnail: { source: 'https://img.test/wiki.png' } } } } } });
    });
    await page.route('https://img.test/**', image);
    // El resto de fuentes de fotos, sin resultados: la prueba no debe depender de internet
    await page.route('https://graphql.anilist.co/**', route => route.fulfill({ json: { data: { Page: { staff: [], characters: [], media: [] } } } }));
    await page.route(/commons\.wikimedia\.org|api\.jikan\.moe|api\.themoviedb\.org|googleapis\.com/, route => route.fulfill({ json: {} }));
}

test('al guardar una obra, los nombres nuevos se crean en Personas (con foto si se encuentra)', async ({ page }) => {
    const errors = await openApp(page);
    await mockSources(page);
    await page.evaluate(() => openWorkModal('series'));
    await page.fill('#f_title', 'Mi serie nueva');
    await page.locator('#chip_actors').pressSequentially('Ana Nueva, Park Seo Ham,');
    await expect(page.locator('[data-chip-field="actors"] .pchip.is-new')).toHaveCount(1);
    await expect(page.locator('[data-chip-field="actors"] .chip-note')).toContainText('se crearán al guardar');
    await page.locator('#chip_directors').pressSequentially('Director Nuevo,');
    await page.click('#workSaveBtn');
    await expect(page.locator('#toastStack')).toContainText('2 personas nuevas');
    const data = await stored(page);
    const ana = data.persons.find(p => p.name === 'Ana Nueva');
    const dir = data.persons.find(p => p.name === 'Director Nuevo');
    expect([ana.type, dir.type, ana.autoCreated]).toEqual(['actor', 'director', true]);
    const w = data.works.find(x => x.title === 'Mi serie nueva');
    expect(w.personIds.sort()).toEqual([ana.id, dir.id, 'p5'].sort());
    // La foto se busca sola en segundo plano (Wikipedia devuelve una página con su nombre)
    await expect.poll(() => page.evaluate(() => (appData.persons.find(p => p.name === 'Ana Nueva') || {}).image || '')).toMatch(/^idb:img_/);
    await expect(page.locator('#toastStack')).toContainText('Fotos encontradas: 2 de 2');
    // Aparece en Personas con la obra
    await goTo(page, 'persons');
    await page.fill('#personSearch', 'Ana Nueva');
    await page.locator('#allPersonsGrid [data-person]').first().click();
    await expect(page.locator('#personDetailCard')).toContainText('Mi serie nueva');
    expect(errors).toEqual([]);
});

test('no guarda la foto de otra persona: si el nombre no coincide, se queda sin foto', async ({ page }) => {
    await openApp(page);
    await mockSources(page, { wikiTitle: 'Alguien Distinto' });
    await page.evaluate(() => openWorkModal('book'));
    await page.fill('#f_title', 'Libro raro');
    await page.locator('#chip_author').pressSequentially('Autora Rara,');
    await page.click('#workSaveBtn');
    await expect(page.locator('#toastStack')).toContainText('No encontré fotos');
    expect(await page.evaluate(() => appData.persons.find(p => p.name === 'Autora Rara').image)).toBeUndefined();
});

test('“Rellenar datos” trae el reparto con fotos y personajes, y al guardar se crean y se vinculan', async ({ page }) => {
    await openApp(page);
    await mockSources(page);
    await page.evaluate(() => openWorkModal('series'));
    await page.fill('#f_title', 'Word of Honor');
    await page.click('[data-act="meta-search"]');
    await page.locator('#sheetBody .meta-result').first().click();
    await expect(page.locator('#f_actors')).toHaveValue('Zhang Zhehan, Gong Jun');
    await expect(page.locator('[data-chip-field="actors"] .pchip img')).toHaveCount(2); // ya se ven sus fotos
    await page.click('#workSaveBtn');
    await expect.poll(() => page.evaluate(() => appData.persons.filter(p => ['Zhang Zhehan', 'Gong Jun'].includes(p.name) && /^idb:/.test(p.image || '')).length)).toBe(2);
    const w = await page.evaluate(() => appData.works.find(x => x.title === 'Word of Honor'));
    const ids = await page.evaluate(() => Object.fromEntries(appData.persons.map(p => [p.name, p.id])));
    expect(w.characters.map(c => [c.name, c.personId, c.image || ''])).toEqual([['Zhou Zishu', ids['Zhang Zhehan'], 'https://static.tvmaze.com/zhou.png'], ['Wen Kexing', ids['Gong Jun'], '']]);
    // La ficha muestra "actor → personaje"
    await page.evaluate(id => openDetail(id), w.id);
    await expect(page.locator('#detailPanel .cast-line').first()).toContainText('Zhang Zhehan→Zhou Zishu');
});

test('obras que ya tenías: Personas avisa de los nombres sin ficha y los crea de una vez', async ({ page }) => {
    await openApp(page);
    await goTo(page, 'persons');
    const banner = page.locator('#personLinkBanner .link-banner');
    await expect(banner).toContainText('nombres en tus obras sin ficha');
    const before = await page.evaluate(() => appData.persons.length);
    page.once('dialog', d => { expect(d.message()).toContain('Xiao Zhan'); d.accept(); });
    await banner.locator('[data-act="link-all"]').click();
    await expect(page.locator('#personLinkBanner .link-banner')).toHaveCount(0);
    const after = await page.evaluate(() => appData.persons.length);
    expect(after).toBeGreaterThan(before);
    const w3 = await page.evaluate(() => getWorkById('w3'));
    const names = await page.evaluate(ids => ids.map(id => getPersonById(id).name), w3.personIds);
    expect(names.sort()).toEqual(['Chen Jialin', 'Wang Yibo', 'Xiao Zhan']);
    // Deshacer lo quita todo de una vez
    await page.evaluate(() => undo());
    expect(await page.evaluate(() => appData.persons.length)).toBe(before);
});

test('personajes: “Otra persona” crea la ficha del intérprete', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => { openDetail('w3'); contentTab = 'characters'; renderDetail(true); });
    await page.locator('#detailPanel details[data-key="content"] summary').click();
    await page.fill('#cCharName', 'Wei Wuxian');
    await page.selectOption('#cCharPerson', '__new');
    await expect(page.locator('#cCharNewPerson')).toBeVisible();
    await page.fill('#cCharNewPerson', 'Xiao Zhan');
    await page.locator('#detailPanel [data-act="content-add"]').click();
    await expect(page.locator('#toastStack')).toContainText('Xiao Zhan añadida a Personas');
    const p = await page.evaluate(() => appData.persons.find(x => x.name === 'Xiao Zhan'));
    const w = await page.evaluate(() => getWorkById('w3'));
    expect(w.characters[0].personId).toBe(p.id);
    expect(w.personIds).toContain(p.id);
});

test('se puede desactivar: sin crear fichas al guardar y con “Solo el nombre”', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => openWorkModal('series'));
    await page.fill('#f_title', 'Solo nombres');
    await page.locator('#chip_actors').pressSequentially('Persona Texto,');
    await page.locator('[data-act="chip-keep-text"]').click();
    await expect(page.locator('[data-chip-field="actors"] .pchip.is-new')).toHaveCount(0);
    await page.click('#workSaveBtn');
    expect(await page.evaluate(() => appData.persons.some(p => p.name === 'Persona Texto'))).toBe(false);
    await goTo(page, 'settings');
    await page.locator('[data-act="link-toggle"][data-id="linkCreateOnSave"]').click();
    await page.evaluate(() => openWorkModal('series'));
    await page.fill('#f_title', 'Otra');
    await page.locator('#chip_actors').pressSequentially('Otra Persona,');
    await page.click('#workSaveBtn');
    expect(await page.evaluate(() => appData.persons.some(p => p.name === 'Otra Persona'))).toBe(false);
    expect(await page.evaluate(() => appData.works.find(w => w.title === 'Otra').actors)).toBe('Otra Persona');
});
