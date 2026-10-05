'use strict';
const { test, expect } = require('@playwright/test');
const { openApp, goTo, reloadSaved, stored } = require('./helpers');

/** Pulsa el botón de un aviso (toast) que contiene ese texto. */
async function clickToastAction(page, text, action) {
    await page.locator('.toast', { hasText: text }).locator('.toast-action', { hasText: action }).click();
}
const toast = page => page.locator('#toastStack');

test('eliminar una obra la manda a la papelera y el aviso permite deshacerlo', async ({ page }) => {
    const errors = await openApp(page);
    await goTo(page, 'books');
    await page.locator('#booksGrid .card', { hasText: 'El Nombre del Viento' }).click();
    await page.locator('#detailPanel [data-act="delete"]').click(); // sin notas ni colecciones: no pregunta
    await expect(page.locator('#booksGrid')).not.toContainText('El Nombre del Viento');
    await clickToastAction(page, 'papelera', 'Deshacer');
    await expect(page.locator('#booksGrid')).toContainText('El Nombre del Viento');
    expect((await stored(page)).works.find(w => w.id === 'w2').trashedAt).toBeUndefined();
    expect(errors).toEqual([]);
});

test('Ctrl+Z deshace y Ctrl+Shift+Z rehace, también desde el historial', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => changeProgress('w4', 1));
    await page.evaluate(() => changeProgress('w4', 1));
    expect(await page.evaluate(() => getWorkById('w4').progress)).toBe(8);
    await page.locator('body').press('Control+z');
    expect(await page.evaluate(() => getWorkById('w4').progress)).toBe(7);
    await page.locator('body').press('Control+Shift+z');
    expect(await page.evaluate(() => getWorkById('w4').progress)).toBe(8);

    // Historial: deshacer hasta la primera acción
    await page.evaluate(() => openHistory());
    const items = page.locator('#sheetBody .history-item');
    await expect(items).toHaveCount(2);
    await items.last().locator('[data-act="undo-until"]').click();
    expect(await page.evaluate(() => getWorkById('w4').progress)).toBe(6);
    await expect(page.locator('#sheetBody [data-act="redo"]')).toBeVisible();
    await page.waitForFunction(() => getWorkById('w4').progress === 6);
    expect((await stored(page)).works.find(w => w.id === 'w4').progress).toBe(6);
});

test('papelera: restaurar devuelve la obra con sus notas y colecciones; vaciar pide doble confirmación', async ({ page }) => {
    await openApp(page);
    // The Untamed (w3) tiene una nota y está en "Mi lista": pregunta antes
    let asked = '';
    page.once('dialog', d => { asked = d.message(); d.accept(); });
    await page.evaluate(() => deleteWork('w3'));
    expect(asked).toContain('1 colección');
    expect(asked).toContain('1 nota');
    expect(await page.evaluate(() => appData.notes.some(n => n.workId === 'w3'))).toBe(false);

    await goTo(page, 'settings');
    const item = page.locator('#trashBody .trash-item', { hasText: 'The Untamed' });
    await expect(item).toContainText('desde Series');
    await expect(item).toContainText('con 1 nota');
    await expect(item).toContainText('se borra en 30 días');
    await expect(page.locator('#trashCount')).toHaveText('1');
    await item.locator('[data-act="trash-restore"]').click();
    await expect(page.locator('#trashBody')).toContainText('vacía');
    expect(await page.evaluate(() => [appData.notes.some(n => n.workId === 'w3'), myList().items.includes('w3')])).toEqual([true, true]);

    // Vaciar: dos confirmaciones
    await page.evaluate(() => { deleteWork('w2'); deletePerson('p3'); });
    await expect(page.locator('#trashBody .trash-item')).toHaveCount(2);
    let confirms = 0;
    page.on('dialog', d => { confirms++; d.accept(); });
    await page.click('[data-act="trash-empty"]');
    expect(confirms).toBe(2);
    await expect(page.locator('#trashBody')).toContainText('vacía');
    const data = await stored(page);
    expect(data.works.some(w => w.id === 'w2')).toBe(false);
    expect(data.persons.some(p => p.id === 'p3')).toBe(false);
});

test('lo que lleva más de 30 días en la papelera se borra al abrir la app', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => {
        trashRecord(appData, 'works', 'w2', Date.now() - 31 * 86400000);
        trashRecord(appData, 'works', 'w7', Date.now() - 3 * 86400000);
        saveData();
    });
    await reloadSaved(page);
    expect(await page.evaluate(() => appData.trash.works.map(w => w.id))).toEqual(['w7']);
    expect((await stored(page)).works.some(w => w.id === 'w2')).toBe(false);
});

test('historial de una obra: muestra los cambios y permite volver a una versión anterior', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => openDetail('w4'));
    await page.locator('#detailPanel [data-act="edit"]').click();
    await page.fill('#f_title', 'Only Friends (editada)');
    await page.selectOption('#f_status', 'abandonado');
    await page.click('#workSaveBtn');
    const hist = page.locator('#detailPanel details', { hasText: 'Historial' });
    await hist.locator('summary').click();
    await expect(hist).toContainText('Título: Only Friends → Only Friends (editada)');
    await expect(hist).toContainText('Estado: Viendo → Abandonado');
    await hist.locator('[data-act="version-restore"]').click();
    await expect(page.locator('#detailPanel .detail-title')).toHaveText('Only Friends');
    expect(await page.evaluate(() => getWorkById('w4').status)).toBe('viendo');
});

test('duplicar una obra como otro tipo abre la copia para editarla', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => openDetail('w6'));
    await page.locator('#detailPanel [data-act="duplicate"]').click();
    await page.locator('#sheetBody [data-act="duplicate-as"][data-type="anime"]').click();
    await expect(page.locator('#workModal')).toHaveClass(/active/);
    await expect(page.locator('#f_title')).toHaveValue('Solo Leveling');
    await expect(page.locator('#f_status')).toHaveValue('quiero ver');
    const copies = await page.evaluate(() => appData.works.filter(w => w.title === 'Solo Leveling').map(w => [w.type, w.progress]));
    expect(copies).toEqual([['manhwa', 154], ['anime', 0]]);
});

test('una obra bloqueada no se puede editar, avanzar, valorar ni borrar', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => openDetail('w4'));
    await page.locator('#detailPanel [data-act="lock"]').click();
    await expect(page.locator('#detailPanel [data-act="lock"]')).toContainText('Bloqueada');
    await page.locator('#detailPanel [data-act="progress"]').click();
    await page.locator('#detailPanel [data-act="edit"]').click();
    await page.locator('#detailPanel [data-act="delete"]').click();
    await expect(toast(page)).toContainText('bloqueada');
    await expect(page.locator('#workModal')).not.toHaveClass(/active/);
    expect(await page.evaluate(() => [getWorkById('w4').progress, !!getWorkById('w4').trashedAt])).toEqual([6, false]);
});

test('cerrar el formulario con cambios pregunta, y el borrador se puede recuperar', async ({ page }) => {
    await openApp(page);
    await page.locator('#page-home [data-add="book"]').first().click();
    await page.fill('#f_title', 'Mi borrador');
    let asked = '';
    page.once('dialog', d => { asked = d.message(); d.dismiss(); });
    await page.keyboard.press('Escape');
    expect(asked).toContain('cambios sin guardar');
    await expect(page.locator('#workModal')).toHaveClass(/active/);

    // Se cierra la app sin guardar: al volver se ofrece el borrador
    await page.reload();
    await page.locator('#page-home [data-add="book"]').first().click();
    await expect(page.locator('#workDraftBar')).toContainText('Mi borrador');
    await page.locator('[data-act="draft-restore"]').click();
    await expect(page.locator('#f_title')).toHaveValue('Mi borrador');
    await page.click('#workSaveBtn');
    await expect(page.locator('#workModal')).not.toHaveClass(/active/);
    expect(await page.evaluate(() => localStorage.getItem('mi_mundo_borrador_obra'))).toBeNull();
});

test('avisa de títulos parecidos mientras escribes y al guardar', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => openWorkModal('anime'));
    await page.fill('#f_title', 'jujutsu kaisn');
    await expect(page.locator('#titleHint')).toContainText('Jujutsu Kaisen');
    let asked = '';
    page.once('dialog', d => { asked = d.message(); d.dismiss(); });
    await page.click('#workSaveBtn');
    expect(asked).toContain('Se parece mucho a “Jujutsu Kaisen”');
    // Pulsar la sugerencia abre la obra que ya tienes
    page.once('dialog', d => d.accept()); // descartar el formulario
    await page.locator('#titleHint [data-open]').click();
    await expect(page.locator('#detailPanel .detail-title')).toHaveText('Jujutsu Kaisen');
});

test('confirmaciones inteligentes: persona con obras y colección con obras', async ({ page }) => {
    await openApp(page);
    const msgs = [];
    page.on('dialog', d => { msgs.push(d.message()); d.dismiss(); });
    await page.evaluate(() => deletePerson('p1')); // Mo Xiang Tong Xiu aparece en una obra
    await page.evaluate(() => deleteCollection('col1'));
    expect(msgs[0]).toContain('aparece en 1 obra');
    expect(msgs[1]).toContain('tiene 2 obras');
    await page.evaluate(() => deletePerson('p3')); // sin obras: no pregunta
    expect(msgs).toHaveLength(2);
    expect(await page.evaluate(() => appData.trash.persons.map(p => p.id))).toEqual(['p3']);
});

test('editar una obra sin cambiar nada no apunta cambios raros en su historial', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => openWorkModal(null, getWorkById('w2')));
    await page.fill('#f_title', 'El Nombre del Viento ');
    await page.fill('#f_title', 'El Nombre del Viento');
    await page.click('#workSaveBtn');
    const w = await page.evaluate(() => getWorkById('w2'));
    expect(w.versions).toBeUndefined();
    expect('anilistId' in w).toBe(false);
});
