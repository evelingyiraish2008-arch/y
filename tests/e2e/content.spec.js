'use strict';
const { test, expect } = require('@playwright/test');
const { openApp, stored } = require('./helpers');

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

test('citas: guardarlas, marcar favorita, cita del día en Inicio y búsqueda', async ({ page }) => {
    const errors = await openApp(page);
    await page.evaluate(() => openDetail('w3'));
    const sec = page.locator('#detailPanel details[data-key="content"]');
    await sec.locator('summary').click();
    await page.fill('#cQuoteText', 'Lan Zhan, ¿me esperarás?');
    await page.fill('#cQuoteCtx', 'Wei Ying · ep 50');
    await sec.locator('[data-act="content-add"]').click();
    await expect(sec.locator('.quote-item')).toHaveCount(1);
    await sec.locator('[data-act="content-fav"]').click();
    await expect(sec.locator('.quote-item')).toHaveClass(/is-fav/);
    await page.evaluate(() => { closeDetail(); navigateTo('home'); });
    await expect(page.locator('#quoteOfDay')).toContainText('me esperarás');
    await page.fill('#globalSearch', 'esperarás');
    await expect(page.locator('#globalSearchResults')).toContainText('❝');
    expect((await stored(page)).works.find(w => w.id === 'w3').quotes[0]).toMatchObject({ text: 'Lan Zhan, ¿me esperarás?', context: 'Wei Ying · ep 50', fav: true });
    expect(errors).toEqual([]);
});

test('galería: subir una imagen, verla y usarla de portada; se conserva al limpiar imágenes', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => { openDetail('w1'); contentTab = 'gallery'; renderDetail(true); });
    await page.locator('#detailPanel details[data-key="content"] summary').click();
    await page.setInputFiles('#galleryFile', { name: 'fanart.png', mimeType: 'image/png', buffer: PNG });
    await expect(page.locator('#detailPanel .gallery-item')).toHaveCount(1);
    await page.locator('#detailPanel .gallery-open').click();
    await page.click('[data-act="gallery-cover"]');
    const w = await page.evaluate(() => getWorkById('w1'));
    expect(w.image).toBe(w.gallery[0]);
    await page.evaluate(() => whenSaved().then(() => store.collectGarbage(appData)));
    expect((await stored(page)).images).toHaveLength(1);
});

test('personajes, música, premios y curiosidades', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => { openDetail('w8'); contentTab = 'characters'; renderDetail(true); });
    const sec = page.locator('#detailPanel details[data-key="content"]');
    await sec.locator('summary').click();
    await page.fill('#cCharName', 'Chu Jae Young');
    await page.selectOption('#cCharPerson', 'p5');
    await sec.locator('[data-act="content-add"]').click();
    await expect(sec.locator('.character-item')).toContainText('Park Seo Ham');

    await sec.locator('[data-act="content-tab"][data-id="soundtrack"]').click();
    await page.fill('#cSongTitle', 'Semantic Error OST');
    await page.fill('#cSongUrl', 'javascript:alert(1)');
    await sec.locator('[data-act="content-add"]').click();
    await expect(sec.locator('.song-item')).toHaveCount(1);
    await expect(sec.locator('.song-item a')).toHaveCount(0); // los enlaces que no son http no se guardan

    await sec.locator('[data-act="content-tab"][data-id="awards"]').click();
    await page.fill('#cAwardName', 'Mejor BL coreano');
    await page.fill('#cAwardYear', '2022');
    await sec.locator('[data-act="content-add"]').click();
    await sec.locator('[data-act="content-tab"][data-id="trivia"]').click();
    await page.fill('#cTrivia', 'Basado en un webtoon');
    await sec.locator('[data-act="content-add"]').click();
    await expect(sec.locator('summary')).toContainText('· 4');
    await page.evaluate(() => { closeDetail(); navigateTo('series'); });
    await expect(page.locator('#seriesGrid .card', { hasText: 'Semantic Error' }).locator('.pill.award')).toHaveCount(1);
});
