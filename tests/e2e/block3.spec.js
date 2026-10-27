'use strict';
const { test, expect } = require('@playwright/test');
const { openApp, goTo, stored, reloadSaved } = require('./helpers');

test('estantería: marcapáginas con el progreso, la marca de releer y la portada al pasar o tocar', async ({ page }) => {
    const errors = await openApp(page);
    await page.evaluate(() => { getWorkById('w7').status = 'para releer'; saveData(); });
    await goTo(page, 'books');
    if (!(await page.locator('#booksFilterBar').isVisible())) await page.click('[data-toggle-filters="booksFilterBar"]');
    await page.click('[data-act="view-mode"][data-id="books:shelf"]');
    const spines = page.locator('#booksGrid .spine');
    await expect(spines).toHaveCount(3);
    const w1 = page.locator('#booksGrid .spine[data-id="w1"]'); // leyendo 820 de 1200 págs
    await expect(w1.locator('.spine-bar')).toHaveCount(1);
    expect(await w1.locator('.spine-bar').evaluate(el => el.style.height)).toBe('68%');
    await expect(page.locator('#booksGrid .spine[data-id="w2"] .spine-bar')).toHaveCount(0); // terminada: sin marcapáginas
    await expect(page.locator('#booksGrid .spine[data-id="w7"] .spine-ribbon')).toBeVisible();
    const touch = await page.evaluate(() => matchMedia('(hover: none)').matches);
    const peek = page.locator('#spinePeek');
    if (touch) {
        await w1.tap();
        await expect(peek).toBeVisible();
        await expect(peek).toContainText("Heaven Official's Blessing");
        await expect(page.locator('#detailPanel')).not.toHaveClass(/active/); // el primer toque no abre la ficha
        await w1.tap();
        await expect(page.locator('#detailPanel')).toContainText("Heaven Official's Blessing"); // el segundo, sí
    } else {
        await w1.hover();
        await expect(peek).toBeVisible();
        await expect(peek).toContainText("Heaven Official's Blessing");
        await expect(peek).toContainText('Leyendo');
        await expect(peek.locator('img')).toHaveCount(1);
        await page.mouse.move(5, 5);
        await expect(peek).toBeHidden();
        await w1.click();
        await expect(page.locator('#detailPanel')).toContainText("Heaven Official's Blessing");
    }
    expect(errors).toEqual([]);
});

test('Personalizar: tipo de letra y esquinas se aplican y se recuerdan', async ({ page }) => {
    const errors = await openApp(page);
    await goTo(page, 'settings');
    const font = () => page.evaluate(() => getComputedStyle(document.body).fontFamily);
    const radius = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--radius-md').trim());
    const before = await font();
    expect(await radius()).toBe('12px');
    await page.click('[data-act="font"][data-id="serif"]');
    await expect(page.locator('html')).toHaveAttribute('data-font', 'serif');
    expect(await font()).toMatch(/Georgia|Palatino|Iowan/);
    expect(await font()).not.toBe(before);
    await page.click('[data-act="corners"][data-id="round"]');
    expect(await radius()).toBe('20px');
    await page.click('[data-act="corners"][data-id="sharp"]');
    expect(await radius()).toBe('4px');
    await reloadSaved(page);
    await expect(page.locator('html')).toHaveAttribute('data-font', 'serif');
    await expect(page.locator('html')).toHaveAttribute('data-corners', 'sharp');
    expect((await stored(page)).settings).toMatchObject({ font: 'serif', corners: 'sharp' });
    await goTo(page, 'settings');
    await page.click('[data-act="font"][data-id="default"]');
    await page.click('[data-act="corners"][data-id="normal"]');
    expect(await font()).toBe(before);
    expect(await radius()).toBe('12px');
    expect(errors).toEqual([]);
});

test('al avanzar, la barra se llena despacio y brilla al llegar al final; con "Reducir animaciones" no', async ({ page }) => {
    const errors = await openApp(page);
    await page.evaluate(() => { Object.assign(getWorkById('w3'), { progress: 48 }); saveData(); openDetail('w3'); });
    await page.locator('#detailPanel [data-act="progress"]').click();
    const fill = page.locator('#detailPanel .progress-fill').first();
    await expect(fill).toHaveClass(/bar-grow/);
    expect((await stored(page)).works.find(w => w.id === 'w3').progress).toBe(49);
    await expect(fill).not.toHaveClass(/bar-grow/, { timeout: 3000 }); // la marca se quita sola
    await page.locator('#detailPanel [data-act="progress"]').click(); // 50 de 50: termina
    await expect(page.locator('#detailPanel .progress-fill').first()).toHaveClass(/bar-shine/);
    // Sin animaciones
    await page.evaluate(() => { appData.settings.reduceMotion = true; applySettings(); Object.assign(getWorkById('w4'), { progress: 2 }); saveData(); openDetail('w4'); });
    await page.locator('#detailPanel [data-act="progress"]').click();
    await page.waitForTimeout(300);
    await expect(page.locator('#detailPanel .progress-fill.bar-grow')).toHaveCount(0);
    expect(errors).toEqual([]);
});
