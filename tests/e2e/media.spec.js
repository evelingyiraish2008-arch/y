'use strict';
const { test, expect } = require('@playwright/test');
const { openApp, goTo, stored, reloadSaved } = require('./helpers');

/** Crea una imagen PNG de w×h en el navegador (mitad izquierda rosa, derecha azul). */
async function makePng(page, w, h) {
    const b64 = await page.evaluate(([w, h]) => {
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#ec4899'; ctx.fillRect(0, 0, w / 2, h);
        ctx.fillStyle = '#3b82f6'; ctx.fillRect(w / 2, 0, w / 2, h);
        return c.toDataURL('image/png').split(',')[1];
    }, [w, h]);
    return Buffer.from(b64, 'base64');
}
const sizeOf = (page, id) => page.evaluate(id => new Promise(r => { const i = new Image(); i.onload = () => r([i.width, i.height]); i.src = resolveImageSrc(document.getElementById(id).value); }), id);

test('banner de una obra: se sube, se recorta solo a 3:1 y se ve en la ficha y en Inicio', async ({ page }) => {
    const errors = await openApp(page);
    await page.evaluate(() => openWorkModal(null, getWorkById('w4')));
    // Una imagen vertical: se recorta por el centro a 3:1 y se reduce
    await page.setInputFiles('#f_banner__file', { name: 'vertical.png', mimeType: 'image/png', buffer: await makePng(page, 1500, 2000) });
    await expect(page.locator('#f_banner')).toHaveValue(/^idb:img_/);
    expect(await sizeOf(page, 'f_banner')).toEqual([1200, 400]);
    await expect(page.locator('[data-img-field="f_banner"]')).toHaveClass(/has-image/);
    await expect(page.locator('.toast').last()).toContainText('Banner listo (1200×400');
    await page.click('#workSaveBtn');
    const w = (await stored(page)).works.find(x => x.id === 'w4');
    expect(w.banner).toMatch(/^idb:img_/);

    await page.evaluate(() => openDetail('w4'));
    await expect(page.locator('#detailPanel .detail-header .banner-bg')).toHaveClass(/is-banner/);
    // Una obra sin banner usa su portada difuminada, y sin portada el degradado
    await page.evaluate(() => openDetail('w2'));
    await expect(page.locator('#detailPanel .detail-header .banner-bg')).toHaveClass(/is-blur/);
    await page.evaluate(() => { getWorkById('w2').image = ''; renderDetail(true); });
    await expect(page.locator('#detailPanel .detail-header .banner-bg')).toHaveClass(/is-pattern/);
    await page.evaluate(() => closeDetail());
    // En Inicio, la obra en curso con banner lo usa de fondo
    await page.evaluate(() => { getWorkById('w4').favorite = true; renderHome(); });
    await expect(page.locator('#heroBg')).toHaveClass(/is-banner/);
    expect(errors).toEqual([]);
});

test('editor de recorte: zoom, girar, cambiar proporción y guardar', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => openWorkModal(null, getWorkById('w4')));
    await page.setInputFiles('#f_banner__file', { name: 'ancha.png', mimeType: 'image/png', buffer: await makePng(page, 2400, 800) });
    await expect(page.locator('#f_banner')).toHaveValue(/^idb:img_/);
    const first = await page.inputValue('#f_banner');
    await page.locator('[data-img-field="f_banner"] .img-preview').hover();
    await page.locator('[data-img-field="f_banner"] [data-act="img-crop"]').click();
    await expect(page.locator('#cropModal')).toHaveClass(/active/);
    await expect(page.locator('#cropInfo')).toHaveText('Resultado: 1200×400 px');
    await page.locator('#cropZoom').fill('2');
    await expect(page.locator('#cropInfo')).toHaveText('Resultado: 600×200 px'); // no se amplía lo que se recorta
    await page.selectOption('#cropRatio', { label: '2:1' });
    await page.click('[data-act="crop-rotate"]');
    await page.click('[data-act="crop-flip"][data-id="h"]');
    await page.click('[data-act="crop-grid"]');
    await expect(page.locator('#cropGrid')).toBeHidden();
    await page.click('[data-act="crop-reset"]');
    await expect(page.locator('#cropInfo')).toHaveText('Resultado: 1200×400 px');
    // Arrastrar mueve la imagen (con zoom), y guardar crea una imagen nueva
    await page.locator('#cropZoom').fill('1.5');
    const box = await page.locator('#cropCanvas').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2);
    await page.mouse.up();
    expect(await page.evaluate(() => crop.st.x)).toBeGreaterThan(0);
    await page.click('[data-act="crop-save"]');
    await expect(page.locator('#cropModal')).not.toHaveClass(/active/);
    await expect(page.locator('#f_banner')).not.toHaveValue(first);
    expect(await sizeOf(page, 'f_banner')).toEqual([800, 267]);
    await expect(page.locator('#workModal')).toHaveClass(/active/); // el formulario sigue abierto
});

test('pegar el enlace de un banner: errores claros y descarga si la web lo permite', async ({ page }) => {
    await openApp(page);
    const png = await makePng(page, 900, 300);
    await page.route('https://img.test/**', route => {
        const u = route.request().url();
        if (u.endsWith('.png')) return route.fulfill({ status: 200, contentType: 'image/png', body: png, headers: { 'Access-Control-Allow-Origin': '*' } });
        if (u.includes('sin-cors')) return route.request().resourceType() === 'fetch' ? route.abort() : route.fulfill({ status: 200, contentType: 'image/png', body: png });
        return route.fulfill({ status: 200, contentType: 'text/html', body: '<html>hola</html>' });
    });
    await page.evaluate(() => openCollectionModal(getCollectionById('col1')));
    const field = page.locator('[data-img-field="collectionBanner"]');
    await field.locator('[data-act="img-url"]').click();
    await page.fill('#collectionBanner__url', 'https://www.pinterest.com/pin/123/');
    await page.press('#collectionBanner__url', 'Enter');
    await expect(field.locator('.img-error')).toContainText('enlace del pin');
    await page.fill('#collectionBanner__url', 'https://img.test/pagina');
    await field.locator('[data-act="img-url-apply"]').click();
    await expect(field.locator('.img-error')).toContainText('La URL no apunta a una imagen');
    await page.fill('#collectionBanner__url', 'https://img.test/rota.jpg');
    await field.locator('[data-act="img-url-apply"]').click();
    await expect(field.locator('.img-error')).toContainText('No se pudo cargar la imagen');
    // Una imagen de verdad: se descarga y se guarda en el dispositivo
    await page.fill('#collectionBanner__url', 'https://img.test/banner.png');
    await field.locator('[data-act="img-url-apply"]').click();
    await expect(page.locator('#collectionBanner')).toHaveValue(/^idb:img_/);
    await expect(field.locator('.img-error')).toBeHidden();
    await page.click('#collectionSaveBtn');
    expect((await stored(page)).collections.find(c => c.id === 'col1').banner).toMatch(/^idb:img_/);
    // Si la web no deja descargarla, se guarda el enlace
    await page.evaluate(() => openCoupleModal(appData.couples[0]));
    await page.locator('[data-img-field="coupleBanner"] [data-act="img-url"]').click();
    await page.fill('#coupleBanner__url', 'https://img.test/sin-cors.png?x=1');
    await page.press('#coupleBanner__url', 'Enter');
    await expect(page.locator('#coupleBanner')).toHaveValue('https://img.test/sin-cors.png?x=1');
});

test('banners de persona, pareja y colección desde su ficha, y quitar el banner', async ({ page }) => {
    const errors = await openApp(page);
    const png = await makePng(page, 1200, 400);
    // Persona: sin banner usa su foto difuminada
    await page.evaluate(() => openPersonDetail('p2'));
    await expect(page.locator('.person-detail-banner .banner-bg')).toHaveClass(/is-(blur|pattern)/);
    await page.locator('.person-detail-banner [data-act="banner-quick"]').click({ force: true });
    await page.setInputFiles('#quickBanner__file', { name: 'b.png', mimeType: 'image/png', buffer: png });
    await expect(page.locator('#quickBanner')).toHaveValue(/^idb:img_/);
    await expect.poll(() => page.evaluate(() => getPersonById('p2').banner || '')).toMatch(/^idb:img_/);
    await page.locator('#sheetModal [data-close]').first().click();
    await expect(page.locator('.person-detail-banner .banner-bg')).toHaveClass(/is-banner/);
    // Deshacer lo quita
    await page.evaluate(() => undo());
    expect(await page.evaluate(() => getPersonById('p2').banner)).toBeUndefined();

    // Pareja: la cabecera usa el banner
    await page.evaluate(() => { closeModal('personDetailOverlay'); openCoupleDetail(appData.couples[0].id); });
    await page.locator('#sheetBody .couple-banner [data-act="banner-quick"]').click({ force: true });
    await page.setInputFiles('#quickBanner__file', { name: 'b.png', mimeType: 'image/png', buffer: png });
    await expect.poll(() => page.evaluate(() => appData.couples[0].banner || '')).toMatch(/^idb:img_/);
    // Quitar
    await page.locator('[data-img-field="quickBanner"] .img-preview').hover();
    await page.locator('[data-img-field="quickBanner"] [data-act="img-clear"]').click();
    await expect.poll(() => page.evaluate(() => appData.couples[0].banner)).toBeUndefined();
    await page.locator('#sheetModal [data-close]').first().click();

    // Colección: sin banner, la portada de la primera obra difuminada y el nombre grande
    await page.evaluate(() => openCollectionView('col1'));
    await expect(page.locator('#sheetBody .coll-hero h3')).toContainText(await page.evaluate(() => getCollectionById('col1').name));
    await expect(page.locator('#sheetBody .coll-hero .banner-bg')).toHaveClass(/is-blur/);
    expect(errors).toEqual([]);
});

test('Personalizar: banner del perfil, recuento, ajustes y limpieza', async ({ page }) => {
    await openApp(page);
    await goTo(page, 'settings');
    const png = await makePng(page, 1200, 400);
    await page.setInputFiles('#profileBannerInput__file', { name: 'perfil.png', mimeType: 'image/png', buffer: png });
    await expect(page.locator('.user-profile')).toHaveClass(/has-banner/);
    await expect(page.locator('#bannerPanelBody .banner-stats')).toContainText('1banners');
    await reloadSaved(page);
    await expect(page.locator('.user-profile')).toHaveClass(/has-banner/);
    // Desactivar el recorte automático: la imagen se guarda tal cual
    await goTo(page, 'settings');
    const resize = page.locator('[data-act="media-toggle"][data-id="bannerResize"]');
    await expect(resize).toHaveAttribute('aria-checked', 'true');
    await resize.click();
    await expect(resize).toHaveAttribute('aria-checked', 'false');
    expect(await page.evaluate(() => appData.settings.bannerResize)).toBe(false);
    await page.evaluate(() => openWorkModal(null, getWorkById('w2')));
    await page.setInputFiles('#f_banner__file', { name: 'v.png', mimeType: 'image/png', buffer: await makePng(page, 300, 600) });
    await expect(page.locator('#f_banner')).toHaveValue(/^idb:img_/);
    expect(await sizeOf(page, 'f_banner')).toEqual([300, 600]);
    await page.evaluate(() => closeModal('workModal', { force: true }));
    // La imagen subida y no guardada queda huérfana: se puede limpiar
    await page.click('[data-act="images-orphans"]');
    await expect(page.locator('.toast').last()).toContainText('huérfana');
    await page.click('[data-act="banners-optimize"]');
    await expect(page.locator('.toast').last()).toContainText(/optimizados|Listo/);
});

test('las imágenes demasiado grandes o que no son imágenes se rechazan', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => openWorkModal('book'));
    await page.setInputFiles('#f_banner__file', { name: 'texto.txt', mimeType: 'text/plain', buffer: Buffer.from('hola') });
    await expect(page.locator('[data-img-field="f_banner"] .img-error')).toContainText('no es una imagen');
    await page.setInputFiles('#f_banner__file', { name: 'enorme.png', mimeType: 'image/png', buffer: Buffer.alloc(21 * 1024 * 1024) });
    await expect(page.locator('[data-img-field="f_banner"] .img-error')).toContainText('máximo son 20 MB');
    await expect(page.locator('#f_banner')).toHaveValue('');
});
