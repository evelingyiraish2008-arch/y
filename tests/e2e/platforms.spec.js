'use strict';
const { test, expect } = require('@playwright/test');
const { openApp, goTo, stored } = require('./helpers');

const seed = page => page.evaluate(() => {
    const now = Date.now();
    appData.settings.tmdbKey = 'clave-falsa';
    appData.works = [
        { id: 'a1', type: 'series', title: 'Llegó A Viki', status: 'quiero ver', year: 2023, createdAt: now - 1 },
        { id: 'a2', type: 'series', title: 'Solo En Netflix', status: 'quiero ver', createdAt: now - 2 },
        { id: 'a3', type: 'anime', title: 'No Sale En TMDB', status: 'para rever', createdAt: now - 3 },
        { id: 'a4', type: 'book', title: 'Un Libro', status: 'quiero leer', createdAt: now - 4 },
        { id: 'a5', type: 'series', title: 'Ya Terminada', status: 'terminado', createdAt: now - 5 }
    ];
    saveData(); refreshView();
});
const mockTmdb = page => Promise.all([
    page.route(/api\.themoviedb\.org\/3\/search\/tv/, route => {
        const q = new URL(route.request().url()).searchParams.get('query');
        const id = { 'Llegó A Viki': 11, 'Solo En Netflix': 12 }[q];
        route.fulfill({ json: { results: id ? [{ id, name: q, first_air_date: '2023-05-01' }] : [] } });
    }),
    page.route(/api\.themoviedb\.org\/3\/tv\/(\d+)\/watch\/providers/, route => {
        const id = route.request().url().match(/tv\/(\d+)/)[1];
        const flatrate = id === '11' ? [{ provider_name: 'Rakuten Viki' }, { provider_name: 'Netflix' }] : [{ provider_name: 'Netflix' }];
        route.fulfill({ json: { results: { ES: { link: 'https://x.test', flatrate } } } });
    })
]);

test('mis plataformas: marcas las tuyas, la cola se comprueba con TMDB y te avisa de lo que llegó', async ({ page }) => {
    const errors = await openApp(page);
    await seed(page);
    await mockTmdb(page);
    await page.evaluate(() => { appData.settings.watchCountry = 'ES'; saveData(); });
    await goTo(page, 'settings');
    await page.click('[data-act="my-platform"][data-id="viki"]');
    await expect(page.locator('[data-act="my-platform"][data-id="viki"]')).toHaveAttribute('aria-pressed', 'true');
    await page.click('[data-act="avail-check"]');
    await expect(page.locator('#availStatus')).toContainText('2 de 3 encontradas en TMDB', { timeout: 15000 });
    await expect(page.locator('#availStatus')).toContainText('1 nueva en tus plataformas');
    await expect(page.locator('#toastStack')).toContainText('“Llegó A Viki” ya está en Rakuten Viki');
    const s = await stored(page);
    const w = id => s.works.find(x => x.id === id);
    expect(w('a1').availMine).toEqual(['Rakuten Viki']);
    expect(w('a1').availOn).toEqual(['Rakuten Viki', 'Netflix']);
    expect(w('a2').availMine).toEqual([]);
    expect(w('a3').availOn).toBeUndefined(); // TMDB no la conoce
    expect(w('a4').availCheckedAt).toBeUndefined(); // los libros no se miran
    expect(w('a5').availCheckedAt).toBeUndefined(); // lo terminado tampoco
    // Campana
    await page.evaluate(() => openNotifications());
    await expect(page.locator('#sheetBody')).toContainText('“Llegó A Viki” ya está en Rakuten Viki');
    await page.evaluate(() => closeModal('sheetModal'));
    // Ficha y cola
    await page.evaluate(() => openDetail('a1'));
    await expect(page.locator('#detailPanel .avail-chip')).toContainText('Ya en Rakuten Viki');
    await page.evaluate(() => closeDetail());
    await goTo(page, 'queue');
    await expect(page.locator('#queueList .queue-row', { hasText: 'Llegó A Viki' })).toContainText('Ya en Rakuten Viki');
    await expect(page.locator('#queueList .queue-row', { hasText: 'Solo En Netflix' })).toContainText('Disponible en Netflix');
    // Sorpréndeme solo con lo que ya puedo ver
    await page.check('#queueAvail');
    await page.click('[data-act="surprise"]');
    await expect(page.locator('.queue-pick')).toContainText('Llegó A Viki');
    await page.click('.queue-pick [data-act="surprise"]');
    await expect(page.locator('.queue-pick')).toContainText('Llegó A Viki'); // es la única
    expect(errors).toEqual([]);
});

test('mis plataformas: sin clave de TMDB lo explica; con el aviso apagado no avisa; no repite el aviso', async ({ page }) => {
    const errors = await openApp(page);
    await seed(page);
    await page.evaluate(() => { delete appData.settings.tmdbKey; saveData(); });
    await goTo(page, 'settings');
    await page.click('[data-act="avail-check"]');
    await expect(page.locator('#toastStack')).toContainText('clave gratuita de TMDB');
    // Con clave pero el aviso apagado: se guarda dónde está, pero no avisa
    await mockTmdb(page);
    await page.evaluate(() => { appData.settings.tmdbKey = 'k'; appData.settings.watchCountry = 'ES'; appData.settings.myPlatforms = ['viki']; appData.settings.platformAlerts = false; saveData(); });
    await page.click('[data-act="avail-check"]');
    await expect(page.locator('#availStatus')).toContainText('encontradas en TMDB', { timeout: 15000 });
    expect((await stored(page)).settings.platformArrivals).toBeUndefined();
    expect((await stored(page)).works.find(x => x.id === 'a1').availMine).toEqual(['Rakuten Viki']);
    // Se vuelve a mirar (cambiando de país) y con el aviso encendido no repite lo ya conocido
    await page.evaluate(() => { appData.settings.platformAlerts = true; appData.works.forEach(w => { delete w.availCheckedAt; }); saveData(); });
    await page.click('[data-act="avail-check"]');
    await expect(page.locator('#availStatus')).toContainText('encontradas en TMDB', { timeout: 15000 });
    expect((await stored(page)).settings.platformArrivals || []).toEqual([]);
    expect(errors).toEqual([]);
});
