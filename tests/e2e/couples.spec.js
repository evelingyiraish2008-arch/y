'use strict';
const { test, expect } = require('@playwright/test');
const { openApp, goTo, stored } = require('./helpers');

/** Tres obras de Bright (p2) y Park Seo Ham (p5) juntos, con año, para tener una pareja consolidada. */
async function threeWorksTogether(page) {
    await page.evaluate(() => {
        appData.works.push(
            { id: 'j1', type: 'series', title: 'Juntos Uno', actors: 'Bright Vachirawit, Park Seo Ham', year: 2023, status: 'terminado', rating: 4, createdAt: 1 },
            { id: 'j2', type: 'series', title: 'Juntos Dos', actors: 'Park Seo Ham, Bright Vachirawit', year: 2025, status: 'terminado', rating: 5, createdAt: 2 },
            { id: 'j3', type: 'series', title: 'Juntos Tres', actors: 'Bright Vachirawit, Park Seo Ham', year: 2021, status: 'terminado', createdAt: 3 });
        appData.couples.push({ id: 'cx', name: 'Bright & Seo Ham', personA: 'p2', personB: 'p5', createdAt: 9 });
        saveData();
    });
}

test('persona con nombre artístico como principal, nombre nativo y de nacimiento', async ({ page }) => {
    const errors = await openApp(page);
    await page.evaluate(() => openPersonModal(getPersonById('p2')));
    await expect(page.locator('#personModal')).toContainText('Nombre artístico');
    await page.fill('#personNativeName', 'ไบร์ท วชิรวิชญ์');
    await page.fill('#personBirthName', 'Vachirawit Chivaaree');
    await page.click('#personSaveBtn');
    const p = (await stored(page)).persons.find(x => x.id === 'p2');
    expect([p.name, p.nativeName, p.birthName]).toEqual(['Bright Vachirawit', 'ไบร์ท วชิรวิชญ์', 'Vachirawit Chivaaree']);
    // La ficha muestra los otros nombres y se le encuentra por cualquiera de ellos
    await page.evaluate(() => openPersonDetail('p2'));
    await expect(page.locator('#personDetailCard .person-aka')).toContainText('ไบร์ท วชิรวิชญ์');
    await expect(page.locator('#personDetailCard .person-aka')).toContainText('Nombre de nacimiento: Vachirawit Chivaaree');
    await page.evaluate(() => closeModal('personDetailOverlay'));
    await goTo(page, 'persons');
    await page.fill('#personSearch', 'Chivaaree');
    await expect(page.locator('#allPersonsGrid [data-person]')).toHaveCount(1);
    // En el formulario de una obra también aparece al escribir su nombre de nacimiento
    await page.evaluate(() => openWorkModal('series'));
    await page.fill('#f_title', 'Prueba');
    await page.locator('#chip_actors').pressSequentially('Vachirawit Chiv');
    await expect(page.locator('#chipsug_actors .chip-opt').first()).toContainText('Bright Vachirawit');
    expect(errors).toEqual([]);
});

test('pareja con nombre de ship: se sugiere, es el nombre principal y se busca con o sin espacios', async ({ page }) => {
    const errors = await openApp(page);
    await goTo(page, 'couples');
    await page.click('#addCoupleBtn');
    await page.selectOption('#coupleA', 'p2');
    await page.selectOption('#coupleB', 'p5');
    await expect(page.locator('#coupleShipHint')).toContainText('Sugerido: BrightPark');
    await page.locator('#coupleShipHint [data-act="ship-suggest"]').click();
    await expect(page.locator('#coupleShip')).toHaveValue('BrightPark');
    await expect(page.locator('#coupleShipHint')).toBeHidden();
    await page.fill('#coupleShip', 'BrightSeoHam');
    await page.fill('#coupleSince', '2024');
    await page.click('#coupleSaveBtn');
    const saved = (await stored(page)).couples.find(c => c.ship === 'BrightSeoHam');
    expect(saved).toMatchObject({ name: 'Bright Vachirawit & Park Seo Ham', since: 2024 });
    expect(saved.status).toBeUndefined(); // automático: no se guarda
    // La tarjeta lleva el ship como nombre y debajo los dos actores, con las dos fotos
    const card = page.locator('#couplesGrid .couple-card', { hasText: 'BrightSeoHam' });
    await expect(card.locator('.couple-name')).toHaveText('BrightSeoHam');
    await expect(card.locator('.couple-sub')).toHaveText('Bright Vachirawit & Park Seo Ham');
    await expect(card.locator('.duo-av')).toHaveCount(2);
    // Búsqueda: con espacio, en minúsculas, por un actor y sin coincidencias
    for (const [q, n] of [['bright seo ham', 1], ['BRIGHTSEOHAM', 1], ['vachirawit', 1], ['seo ham', 2], ['zzz', 0]]) {
        await page.fill('#couplesSearch', q);
        await expect(page.locator('#couplesGrid .couple-card')).toHaveCount(n);
    }
    await page.fill('#couplesSearch', '');
    // El ship manda en el ranking y en la ficha del actor
    await expect(page.locator('#coupleRanking')).toContainText('BrightSeoHam');
    await page.evaluate(() => openPersonDetail('p2'));
    await expect(page.locator('#personDetailCard [data-couple]', { hasText: 'BrightSeoHam' })).toHaveCount(1);
    expect(errors).toEqual([]);
});

test('cómo van: recién juntos, consolidada y trabajaron juntos, sin dramatismos y con opción a cambiarlo', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => { appData.couples.find(c => c.id === 'c3').since = 0; saveData(); });
    await goTo(page, 'couples');
    // La de ejemplo (Park Seo Ham & Park Jae Chan) tiene 1 obra de 2022: hace años que no coinciden
    const old = page.locator('#couplesGrid .couple-card', { hasText: 'Park Seo Ham & Park Jae Chan' });
    await expect(old.locator('.couple-st')).toHaveText(/Trabajaron juntos/);
    await expect(old.locator('.couple-works')).toContainText('2022');
    // Una pareja con 3 obras recientes: consolidada, con sus años
    await threeWorksTogether(page);
    await page.evaluate(() => renderCouples());
    const strong = page.locator('#couplesGrid .couple-card', { hasText: 'Bright & Seo Ham' });
    await expect(strong.locator('.couple-st')).toHaveText(/Pareja consolidada/);
    await expect(strong.locator('.couple-works')).toContainText('3 obras juntos · 2021–2025');
    // "Consolidadas" las filtra (las de ejemplo con 12 y 8 obras escritas a mano también cuentan)
    await page.locator('#coupleTabs [data-filter="consolidada"]').click();
    await expect(page.locator('#couplesGrid .couple-card')).toHaveCount(3);
    await expect(page.locator('#couplesGrid')).toContainText('Bright & Seo Ham');
    await expect(page.locator('#couplesGrid')).not.toContainText('Park Seo Ham & Park Jae Chan');
    await page.locator('#coupleTabs [data-filter="all"]').click();
    // Una con una sola obra reciente: recién juntos
    await page.evaluate(() => {
        appData.works.push({ id: 'n1', type: 'series', title: 'Nueva Serie', actors: 'Lee Jong Suk, Liu Cixin', year: new Date().getFullYear(), createdAt: 5 });
        appData.couples.push({ id: 'cn', name: 'Lee & Liu', personA: 'p3', personB: 'p4', createdAt: 8 });
        saveData(); renderCouples();
    });
    await expect(page.locator('#couplesGrid .couple-card', { hasText: 'Lee & Liu' }).locator('.couple-st')).toHaveText(/Recién juntos/);
    // Elegirlo a mano: la tarjeta lo respeta y la ficha dice que lo elegiste tú
    await page.evaluate(() => openCoupleModal(getCoupleById('cn')));
    await page.selectOption('#coupleStatus', 'consolidada');
    await page.click('#coupleSaveBtn');
    const lee = page.locator('#couplesGrid .couple-card', { hasText: 'Lee & Liu' });
    await expect(lee.locator('.couple-st')).toHaveText(/Pareja consolidada/);
    await lee.locator('.couple-info').click();
    await expect(page.locator('#sheetBody')).toContainText('lo elegiste tú');
    // Volver a automático borra la elección
    await page.evaluate(() => { closeModal('sheetModal'); openCoupleModal(getCoupleById('cn')); });
    await page.selectOption('#coupleStatus', '');
    await page.click('#coupleSaveBtn');
    expect((await stored(page)).couples.find(c => c.id === 'cn').status).toBeUndefined();
});

test('ficha de la pareja: datos clave y línea de tiempo de más antigua a más nueva', async ({ page }) => {
    const errors = await openApp(page);
    await threeWorksTogether(page);
    await page.evaluate(() => { getCoupleById('cx').ship = 'BrightSeoHam'; saveData(); openCoupleDetail('cx'); });
    const body = page.locator('#sheetBody');
    await expect(body.locator('.couple-title')).toHaveText('BrightSeoHam');
    await expect(body.locator('.couple-fullnames')).toHaveText('Bright & Seo Ham'.replace('Bright & Seo Ham', 'Bright Vachirawit & Park Seo Ham'));
    await expect(body.locator('.couple-st')).toHaveText(/Pareja consolidada/);
    await expect(body.locator('.couple-facts')).toContainText('3');
    await expect(body.locator('.couple-facts')).toContainText('2021');
    await expect(body.locator('.couple-facts')).toContainText('2025');
    await expect(body.locator('.couple-timeline li .tl-year')).toHaveText(['2021', '2023', '2025']);
    await body.locator('.couple-timeline .tl-work').first().click();
    await expect(page.locator('#detailPanel .detail-title')).toHaveText('Juntos Tres');
    expect(errors).toEqual([]);
});

test('en el móvil, la pantalla de parejas no se sale de la pantalla', async ({ page }) => {
    await openApp(page);
    await threeWorksTogether(page);
    await page.evaluate(() => { getCoupleById('cx').ship = 'BrightSeoHamConUnNombreMuyLargoParaProbar'; saveData(); });
    await goTo(page, 'couples');
    const wide = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    expect(wide).toBe(false);
});
