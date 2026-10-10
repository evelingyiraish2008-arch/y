'use strict';
const { test, expect } = require('@playwright/test');
const { openApp, goTo, stored } = require('./helpers');

test('poner al día las obras ya agregadas: completa lo que falta, traduce y no pisa lo tuyo; se puede deshacer', async ({ page }) => {
    const errors = await openApp(page);
    await page.route('https://api.tvmaze.com/search/**', route => {
        const q = new URL(route.request().url()).searchParams.get('q');
        route.fulfill({ json: /Love Class/i.test(q) ? [{ show: { id: 5, name: 'Love Class', premiered: '2022-03-01', genres: ['Drama', 'Romance'], summary: '<p>Two young men fall in love while they study at the university for the world.</p>', network: { name: 'GMM', country: { name: 'Thailand' } } } }] : [] });
    });
    await page.route('https://api.tvmaze.com/shows/**', route => route.fulfill({ json: { _embedded: { episodes: [], cast: [] } } }));
    let translations = 0;
    await page.route('https://api.mymemory.translated.net/**', route => { translations++; route.fulfill({ json: { responseStatus: 200, responseData: { translatedText: 'Dos jóvenes se enamoran en la universidad.' } } }); });
    await page.evaluate(() => {
        appData.works = [
            { id: 't1', type: 'series', title: 'Love Class', bl: true, tags: 'BL, mi etiqueta', year: 2022, status: 'viendo', rating: 4, progress: 3, createdAt: Date.now() },
            { id: 't2', type: 'series', title: 'Obra Sin Resultado', createdAt: Date.now() - 1000 },
            { id: 't3', type: 'series', title: 'Completa', tags: 'a, b, c, d, e', synopsis: 'Una historia muy larga que ya está en español para todos.', country: 'Japón', year: 2020, genre: 'Drama', runtime: 45, createdAt: Date.now() - 2000 }
        ];
        saveData(); refreshView();
    });
    await goTo(page, 'settings');
    await expect(page.locator('#autoEnrichToggle')).toHaveAttribute('aria-checked', 'true');
    await page.click('[data-act="enrich-now"]');
    await expect(page.locator('#enrichStatus')).toContainText('Listo: 1 de 2 obras con datos nuevos', { timeout: 20000 });
    await expect(page.locator('#toastStack')).toContainText('Puse al día 1 obra');
    const w = id => stored(page).then(d => d.works.find(x => x.id === id));
    const t1 = await w('t1');
    expect(t1.tags).toBe('BL, mi etiqueta, drama, romance'); // las suyas primero, las nuevas detrás
    expect(t1.synopsis).toBe('Dos jóvenes se enamoran en la universidad.');
    expect(t1.synopsisOriginal).toContain('Two young men');
    expect(t1.country).toBe('Tailandia');
    expect([t1.title, t1.bl, t1.progress, t1.rating, t1.year]).toEqual(['Love Class', true, 3, 4, 2022]);
    expect(t1.enrichedAt).toBeGreaterThan(0);
    // Sin resultado claro: solo se marca como revisada (no se vuelve a consultar en 30 días)
    const t2 = await w('t2');
    expect(t2.enrichedAt).toBeGreaterThan(0);
    expect([t2.tags, t2.synopsis, t2.country, t2.year].every(v => v === undefined)).toBe(true);
    // La completa no se toca
    expect((await w('t3')).enrichedAt).toBeUndefined();
    expect(translations).toBe(1);
    // Deshacer devuelve la obra como estaba
    await page.locator('#toastStack').getByText('Deshacer').click();
    const back = await w('t1');
    expect([back.tags, back.synopsis || '', back.country || '']).toEqual(['BL, mi etiqueta', '', '']);
    // Una segunda vez no vuelve a consultar lo ya revisado
    await page.evaluate(() => { appData.works.forEach(x => { x.enrichedAt = Date.now(); }); saveData(); });
    await page.click('[data-act="enrich-now"]');
    await expect(page.locator('#toastStack')).toContainText('ya están al día');
    expect(errors).toEqual([]);
});

test('el interruptor de la puesta al día automática se recuerda', async ({ page }) => {
    await openApp(page);
    await goTo(page, 'settings');
    await page.click('#autoEnrichToggle');
    await expect(page.locator('#autoEnrichToggle')).toHaveAttribute('aria-checked', 'false');
    expect((await stored(page)).settings.autoEnrich).toBe(false);
});

test('sin cupo de traducción: se guardan los datos y la sinopsis queda para otro día', async ({ page }) => {
    await openApp(page);
    await page.route('https://api.tvmaze.com/search/**', route => route.fulfill({ json: [{ show: { id: 6, name: 'Cupo Test', premiered: '2022-03-01', genres: ['Drama'], summary: '<p>Two young men fall in love while they study at the university for the world.</p>' } }] }));
    await page.route('https://api.tvmaze.com/shows/**', route => route.fulfill({ json: { _embedded: { episodes: [], cast: [] } } }));
    await page.route('https://api.mymemory.translated.net/**', route => route.fulfill({ json: { responseStatus: 429, responseData: { translatedText: '' } } }));
    await page.evaluate(() => { appData.works = [{ id: 'q1', type: 'series', title: 'Cupo Test', year: 2022, createdAt: Date.now() }]; saveData(); refreshView(); });
    await goTo(page, 'settings');
    await page.click('[data-act="enrich-now"]');
    await expect(page.locator('#toastStack')).toContainText('cupo diario');
    const q1 = (await stored(page)).works[0];
    expect(q1.tags).toContain('drama');
    expect(q1.synopsis || '').toBe(''); // no se guarda el texto en inglés sin traducir
    expect(q1.enrichedAt).toBeUndefined();     // se reintentará
});
