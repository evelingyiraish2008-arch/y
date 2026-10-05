'use strict';
const { test, expect } = require('@playwright/test');
const { openApp, goTo, stored } = require('./helpers');

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

/** Respuestas simuladas de los servicios de datos (en las pruebas no se sale a internet). */
async function mockApis(page) {
    await page.route('https://graphql.anilist.co/**', async route => {
        const body = JSON.parse(route.request().postData());
        if (body.query.includes('MediaListCollection')) {
            if (body.variables.name === 'nadie') return route.fulfill({ status: 404, json: { errors: [{ message: 'User not found' }] } });
            const entries = body.variables.type === 'ANIME'
                ? [{ status: 'COMPLETED', progress: 12, repeat: 0, score: 9, startedAt: {}, completedAt: { year: 2026, month: 3, day: 1 }, media: { format: 'TV', episodes: 12, genres: ['Romance'], title: { romaji: 'Given', english: 'Given' }, startDate: { year: 2019 } } },
                   { status: 'CURRENT', progress: 5, repeat: 0, score: 0, startedAt: {}, completedAt: {}, media: { format: 'TV', episodes: 24, genres: [], title: { romaji: 'Jujutsu Kaisen', english: 'Jujutsu Kaisen' } } }]
                : [{ status: 'PLANNING', progress: 0, repeat: 0, score: 0, startedAt: {}, completedAt: {}, media: { format: 'MANGA', countryOfOrigin: 'KR', chapters: 80, genres: ['Drama'], title: { romaji: 'Jinx', english: null } } }];
            return route.fulfill({ json: { data: { MediaListCollection: { lists: [{ entries }] } } } });
        }
        return route.fulfill({ json: { data: { Page: { media: [
            { id: 1, countryOfOrigin: 'JP', episodes: 11, title: { romaji: 'Given', english: 'Given' }, startDate: { year: 2019 }, description: 'Una banda y un <i>chico</i> con una guitarra.', genres: ['Drama', 'Music', 'Romance'], tags: [{ name: 'Boys Love', rank: 95 }], coverImage: { large: 'https://s4.anilist.co/given.png', extraLarge: 'https://s4.anilist.co/given-xl.png' }, studios: { nodes: [{ name: 'Lerche' }] } }
        ] } } } });
    });
    await page.route('https://api.jikan.moe/**', route => route.fulfill({ json: { data: [
        { mal_id: 9, title: 'Given', year: 2019, episodes: 11, synopsis: 'Otra sinopsis', studios: [{ name: 'Lerche' }], genres: [], images: { jpg: { image_url: 'https://cdn.myanimelist.net/given.png' } } }
    ] } }));
    await page.route(/s4\.anilist\.co|cdn\.myanimelist\.net/, route => route.fulfill({ body: PNG, contentType: 'image/png', headers: { 'Access-Control-Allow-Origin': '*' } }));
}

test('rellenar datos por el título sin pisar lo que ya escribiste', async ({ page }) => {
    const errors = await openApp(page);
    await mockApis(page);
    await page.evaluate(() => openWorkModal('anime'));
    await page.fill('#f_title', 'Given');
    await page.locator('[data-field="studio"]').fill('Mi estudio');
    await page.click('[data-act="meta-search"]');
    await expect(page.locator('#sheetBody .meta-result')).toHaveCount(2);
    await expect(page.locator('#sheetBody .meta-result').first()).toContainText('AniList');
    await page.locator('#sheetBody .meta-result').first().click();
    await expect(page.locator('.toast').last()).toContainText('desde AniList');
    await expect(page.locator('[data-field="studio"]')).toHaveValue('Mi estudio');
    await expect(page.locator('[data-field="totalEpisodes"]')).toHaveValue('11');
    await expect(page.locator('[data-field="year"]')).toHaveValue('2019');
    await expect(page.locator('[data-field="synopsis"]')).toHaveValue('Una banda y un chico con una guitarra.');
    await expect(page.locator('#f_bl')).toBeChecked();
    await expect(page.locator('#f_image')).toHaveValue(/^idb:img_/); // la portada se descarga y se guarda
    expect(errors).toEqual([]);
});

test('buscar portada: muestra opciones y guarda la elegida', async ({ page }) => {
    await openApp(page);
    await mockApis(page);
    await page.evaluate(() => openWorkModal('anime'));
    await page.fill('#f_title', 'Given');
    await page.click('[data-act="cover-search"]');
    await expect(page.locator('#sheetBody .cover-option')).toHaveCount(2);
    await page.locator('#sheetBody .cover-option').nth(1).click();
    await expect(page.locator('#f_image')).toHaveValue(/^idb:img_/);
});

test('si no hay internet, la búsqueda lo dice en vez de quedarse esperando', async ({ page, context }) => {
    await openApp(page);
    await context.setOffline(true);
    await page.evaluate(() => openWorkModal('book'));
    await page.fill('#f_title', 'Dune');
    await page.click('[data-act="meta-search"]');
    await expect(page.locator('#sheetBody')).toContainText('Conéctate a internet');
});

test('importar un CSV de Goodreads: columnas, vista previa, duplicados y deshacer', async ({ page }) => {
    await openApp(page);
    await goTo(page, 'settings');
    await page.click('[data-act="import-wizard"]');
    const csv = 'Title,Author,My Rating,Number of Pages,Exclusive Shelf,Date Read\n' +
        'El Nombre del Viento,Patrick Rothfuss,5,662,read,2026/08/20\n' +
        'Dune,Frank Herbert,4,412,read,2026/01/10\n' +
        'Circe,Madeline Miller,0,393,to-read,\n';
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('[data-act="imp-source"][data-id="csv"]')]);
    await chooser.setFiles({ name: 'goodreads.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
    await expect(page.locator('[data-imp-map="My Rating"]')).toHaveValue('rating');
    await page.click('[data-act="imp-mapped"]');
    await expect(page.locator('.import-table tbody tr')).toHaveCount(3);
    await expect(page.locator('.import-table tbody tr').first()).toContainText('Ya la tienes');
    // No importar Circe
    await page.locator('.import-table tbody tr', { hasText: 'Circe' }).locator('input').uncheck();
    await page.locator('label', { hasText: 'Ignorarlas' }).click();
    await page.click('[data-act="imp-run"]');
    await expect(page.locator('#sheetBody')).toContainText('1 obra nueva');
    await expect(page.locator('#sheetBody')).toContainText('1 ignorada');
    const dune = (await stored(page)).works.find(w => w.title === 'Dune');
    expect([dune.type, dune.status, dune.rating, dune.pages, dune.endDate]).toEqual(['book', 'terminado', 4, 412, '2026-01-10']);
    expect(await page.evaluate(() => appData.works.some(w => w.title === 'Circe'))).toBe(false);

    await page.evaluate(() => undo());
    expect(await page.evaluate(() => appData.works.some(w => w.title === 'Dune'))).toBe(false);
});

test('importar la lista de AniList por nombre de usuario', async ({ page }) => {
    await openApp(page);
    await mockApis(page);
    await page.evaluate(() => openImportWizard());
    await page.click('[data-act="imp-source"][data-id="anilist"]');
    await page.fill('#impAniUser', 'nadie');
    await page.click('[data-act="imp-anilist"]');
    await expect(page.locator('.toast').last()).toContainText('No existe el usuario');
    await page.fill('#impAniUser', 'sara');
    await page.click('[data-act="imp-anilist"]');
    await expect(page.locator('.import-table tbody tr')).toHaveCount(3);
    await expect(page.locator('.import-table tbody tr', { hasText: 'Jujutsu Kaisen' })).toContainText('Ya la tienes');
    await page.click('[data-act="imp-run"]'); // modo por defecto: completar lo que falte
    await expect(page.locator('#sheetBody')).toContainText('2 obras nuevas');
    const works = await page.evaluate(() => appData.works);
    expect(works.find(w => w.title === 'Jinx')).toMatchObject({ type: 'manhwa', status: 'quiero leer', totalChapters: 80, country: 'Corea del Sur' });
    expect(works.find(w => w.title === 'Given')).toMatchObject({ type: 'anime', status: 'terminado', rating: 4.5, endDate: '2026-03-01' });
    expect(works.find(w => w.id === 'w5').progress).toBe(12); // no se baja el progreso que ya tenías
});

test('seleccionar varias obras: cambiar estado, colección y enviar a la papelera', async ({ page }) => {
    await openApp(page);
    await goTo(page, 'books');
    await page.locator('#page-books [data-act="select-mode"]').click();
    await expect(page.locator('#bulkBar')).toBeVisible();
    await page.locator('#booksGrid .card', { hasText: 'El Nombre del Viento' }).click();
    await page.locator('#booksGrid .card', { hasText: 'Tres Cuerpos' }).click();
    await expect(page.locator('#bulkBar .bulk-count')).toContainText('2 seleccionadas');
    await expect(page.locator('#detailPanel')).not.toHaveClass(/active/); // no abre la ficha
    await page.selectOption('#bulkStatus', 'plan');
    expect(await page.evaluate(() => ['w2', 'w7'].map(id => getWorkById(id).status))).toEqual(['quiero leer', 'quiero leer']);

    await page.click('[data-act="bulk-coll"]');
    await page.locator('#sheetBody [data-act="bulk-coll-add"]', { hasText: 'Favoritos del año' }).click();
    expect(await page.evaluate(() => getCollectionById('col2').items)).toEqual(['w1', 'w4', 'w2', 'w7']);

    await page.click('[data-act="bulk-all"]');
    await expect(page.locator('#bulkBar .bulk-count')).toContainText('3 seleccionadas');
    page.once('dialog', d => d.accept());
    await page.click('[data-act="bulk-delete"]');
    await expect(page.locator('#booksGrid .card')).toHaveCount(0);
    await page.locator('body').press('Control+z'); // un solo deshacer las devuelve todas
    await expect(page.locator('#booksGrid .card')).toHaveCount(3);
    await page.keyboard.press('Escape');
    await expect(page.locator('#bulkBar')).toBeHidden();
});

test('modo rápido: añade varias seguidas con Intro', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => openQuickAdd());
    await page.locator('#sheetBody [data-act="quick-type"][data-id="manhwa"]').click();
    await page.fill('#quickTitle', 'Lookism');
    await page.press('#quickTitle', 'Enter');
    await expect(page.locator('#quickTitle')).toHaveValue('');
    await page.fill('#quickTitle', 'Omniscient Reader');
    await page.selectOption('#quickStatus', 'done');
    await page.press('#quickTitle', 'Enter');
    await expect(page.locator('.quick-added')).toContainText('2 añadidas');
    const added = (await stored(page)).works.filter(w => ['Lookism', 'Omniscient Reader'].includes(w.title)).map(w => [w.type, w.status]);
    expect(added).toEqual([['manhwa', 'quiero leer'], ['manhwa', 'terminado']]);
});

test('autocompletado y aviso del día de emisión', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => openWorkModal('series'));
    const platforms = await page.locator('#dlPlatforms option').evaluateAll(os => os.map(o => o.value));
    expect(platforms[0]).toBe('Viki'); // la que más usas, primero
    await page.locator('[data-field="airDay"]').selectOption('3');
    await expect(page.locator('#airDayHint')).toContainText('Ese día ya tienes 1: The Untamed');
});

test('exportar a CSV', async ({ page }) => {
    await openApp(page);
    await goTo(page, 'settings');
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('[data-act="export-csv"]')]);
    const text = require('fs').readFileSync(await download.path(), 'utf8');
    expect(text.split('\n')[0]).toContain('title,type,status');
    expect(text).toContain('Solo Leveling,manhwa,leyendo');
});

test('en el móvil ninguna página es más ancha que la pantalla', async ({ page }) => {
    await openApp(page);
    for (const p of ['home', 'books', 'series', 'anime', 'manhwa', 'bl', 'persons', 'couples', 'emission', 'collections', 'stats', 'notes', 'settings']) {
        await page.evaluate(name => navigateTo(name), p);
        const [scroll, inner] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
        expect(scroll, p).toBeLessThanOrEqual(inner);
    }
});

test('fechas de emisión reales: próximos episodios desde AniList', async ({ page }) => {
    await openApp(page);
    const at = Math.floor((Date.now() + 2 * 86400000) / 1000);
    await page.route('https://graphql.anilist.co/**', route => route.fulfill({ json: { data: { Page: { media: [{ id: 113415, nextAiringEpisode: { airingAt: at, episode: 13 } }] } } } }));
    await page.evaluate(() => { getWorkById('w5').anilistId = 113415; saveData(); });
    await goTo(page, 'emission');
    await page.click('[data-act="airing-refresh"]');
    await expect(page.locator('#nextAiring')).toContainText('Jujutsu Kaisen');
    await expect(page.locator('#nextAiring')).toContainText('Ep 13');
    await expect(page.locator('#nextAiring')).toContainText('en 2 días');
    expect((await stored(page)).works.find(w => w.id === 'w5').nextAiring.episode).toBe(13);
});

test('al rellenar datos desde AniList se guarda su id para consultar emisiones', async ({ page }) => {
    await openApp(page);
    await mockApis(page);
    await page.evaluate(() => openWorkModal('anime'));
    await page.fill('#f_title', 'Given');
    await page.click('[data-act="meta-search"]');
    await page.locator('#sheetBody .meta-result').first().click();
    await expect(page.locator('[data-field="anilistId"]')).toHaveValue('1');
    await page.click('#workSaveBtn');
    expect((await stored(page)).works.find(w => w.title === 'Given').anilistId).toBe(1);
});
