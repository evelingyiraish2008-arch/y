'use strict';
const { test, expect } = require('@playwright/test');
const { openApp, goTo, stored } = require('./helpers');

const seed = page => page.evaluate(() => {
    const w = getWorkById('w3'); // The Untamed
    w.characters = [
        { id: 'ch1', name: 'Wei Wuxian', role: 'protagonista', personId: 'p1', note: '' },
        { id: 'ch2', name: 'Lan Wangji', role: 'protagonista', personId: 'p2' },
        { id: 'ch3', name: 'Jiang Cheng', role: 'secundario' }
    ];
    appData.persons.forEach(p => { if (p.id === 'p1' || p.id === 'p2') p.type = 'actor'; });
    saveData(); refreshView();
});

test('ficha de personaje: se abre desde Personas, guarda por qué te gusta, escenas, favorito y foto', async ({ page }) => {
    const errors = await openApp(page);
    await seed(page);
    await goTo(page, 'persons');
    await page.click('[data-tab="characters"]');
    await page.locator('#personsGrid [data-act="char-open"]', { hasText: 'Wei Wuxian' }).click();
    const sheet = page.locator('#sheetBody .char-sheet');
    await expect(sheet).toContainText('Wei Wuxian');
    await expect(sheet).toContainText('The Untamed');
    await expect(sheet).toContainText('Protagonista');
    await expect(sheet).toContainText('Aún no has apuntado ninguna.');
    // Por qué me encanta: se guarda al salir de la caja
    await page.fill('#charNote', 'Su libertad y cómo defiende a los suyos');
    await page.locator('#charSceneWhere').click();
    expect((await stored(page)).works.find(w => w.id === 'w3').characters[0].note).toBe('Su libertad y cómo defiende a los suyos');
    // Escenas favoritas
    await page.fill('#charSceneWhere', 'ep. 20');
    await page.fill('#charSceneText', 'Toca la flauta en la cueva');
    await page.click('[data-act="char-scene-add"]');
    await expect(sheet).toContainText('ep. 20');
    await expect(sheet).toContainText('Toca la flauta en la cueva');
    await expect(page.locator('#charNote')).toHaveValue('Su libertad y cómo defiende a los suyos'); // al repintar no se pierde
    // Favorito
    await page.click('[data-act="char-fav"]');
    await expect(sheet).toContainText('♥ Wei Wuxian');
    expect((await stored(page)).works.find(w => w.id === 'w3').characters[0].fav).toBe(true);
    // Quitar la escena
    await page.click('[data-act="char-scene-del"]');
    await expect(sheet).toContainText('Aún no has apuntado ninguna.');
    expect(errors).toEqual([]);
});

test('personajes: parejas entre ellos (se ven desde los dos), pareja real de los intérpretes y quitarla', async ({ page }) => {
    const errors = await openApp(page);
    await seed(page);
    await page.evaluate(() => { appData.couples.push({ id: 'cx', personA: 'p1', personB: 'p2', ship: 'WangXian', createdAt: 1 }); saveData(); openCharacterDetail('w3', 'ch1'); });
    const sheet = page.locator('#sheetBody .char-sheet');
    await expect(sheet).toContainText('Sin pareja apuntada.');
    await page.selectOption('#charPairPick', 'ch2');
    await expect(sheet).toContainText('Lan Wangji');
    await expect(sheet).toContainText('Quienes los interpretan son pareja en la vida real');
    await expect(sheet).toContainText('WangXian');
    await expect(page.locator('#charPairPick option')).toHaveText(['＋ Formar pareja con…', 'Jiang Cheng']); // ya no ofrece a quien ya es pareja
    // Desde el otro personaje también aparece
    await sheet.locator('.char-pair [data-act="char-open"]').click();
    await expect(page.locator('#sheetBody .char-sheet h3')).toHaveText('Lan Wangji');
    await expect(page.locator('#sheetBody .char-sheet')).toContainText('Wei Wuxian');
    // Quitar la pareja la quita en los dos lados
    await page.locator('#sheetBody [data-act="char-pair-del"]').click();
    await expect(page.locator('#sheetBody .char-sheet')).toContainText('Sin pareja apuntada.');
    const chars = (await stored(page)).works.find(w => w.id === 'w3').characters;
    expect(chars.map(c => c.pairs)).toEqual([undefined, undefined, undefined]);
    expect(errors).toEqual([]);
});

test('personaje: cambiar nombre y buscar su imagen; una obra bloqueada no se edita', async ({ page }) => {
    const errors = await openApp(page);
    await seed(page);
    await page.route(/graphql\.anilist\.co|wikipedia\.org|commons\.wikimedia\.org|api\.jikan\.moe|api\.openverse\.org/, route => route.fulfill({ json: {} }));
    await page.evaluate(() => openCharacterDetail('w3', 'ch3'));
    const answers = ['Jiang Wanyin', 'Líder de Yunmeng'];
    page.on('dialog', d => d.accept(answers.shift() || ''));
    await page.click('[data-act="char-rename"]');
    await expect(page.locator('#sheetBody .char-sheet h3')).toHaveText('Jiang Wanyin');
    await expect(page.locator('#sheetBody .char-sheet')).toContainText('Líder de Yunmeng');
    await page.click('[data-act="char-image"]');
    await expect(page.locator('#imgSearchModal')).toHaveClass(/active/);
    await expect(page.locator('#imgSearchQ')).toHaveValue('Jiang Wanyin The Untamed');
    await page.evaluate(() => closeModal('imgSearchModal'));
    await page.evaluate(() => { getWorkById('w3').locked = true; saveData(); openCharacterDetail('w3', 'ch3'); });
    await expect(page.locator('#sheetBody [data-act="char-fav"]')).toHaveCount(0);
    await expect(page.locator('#charNote')).toBeDisabled();
    expect(errors).toEqual([]);
});
