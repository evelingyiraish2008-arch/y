'use strict';
const { test, expect } = require('@playwright/test');
const { openApp, goTo, stored } = require('./helpers');

test('etiquetas: renombrar, unir, color y emoji desde el gestor', async ({ page }) => {
    const errors = await openApp(page);
    await page.evaluate(() => openTagManager());
    const row = label => page.locator('#sheetBody .tag-row', { has: page.locator('.tag-chip', { hasText: new RegExp(`(^|\\s)${label}$`) }) });
    await expect(row('fantasía')).toContainText('4 obras');

    page.once('dialog', d => d.accept('Fantasía épica'));
    await row('fantasía').locator('[data-act="tag-rename"]').click();
    await expect(page.locator('#sheetBody')).toContainText('Fantasía épica');
    expect(await page.evaluate(() => getWorkById('w2').tags)).toBe('Fantasía épica, aventura');

    // Unir "aventura" (1 obra) con "acción"
    page.once('dialog', d => d.accept('acción'));
    await row('aventura').locator('[data-act="tag-merge"]').click();
    expect(await page.evaluate(() => getWorkById('w2').tags)).toBe('Fantasía épica, acción');

    page.once('dialog', d => d.accept('✨'));
    await row('Fantasía épica').locator('[data-act="tag-emoji"]').click();
    await row('Fantasía épica').locator('input[type=color]').evaluate(el => { el.value = '#10b981'; el.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(await page.evaluate(() => appData.settings.tagMeta['fantasía épica'])).toEqual({ emoji: '✨', color: '#10b981' });

    // En la ficha la etiqueta sale con su emoji y abre sus obras
    await page.evaluate(() => { closeModal('sheetModal'); openDetail('w2'); });
    await page.locator('#detailPanel .tag-chip', { hasText: '✨ Fantasía épica' }).click();
    await expect(page.locator('#sheetBody .pick-item')).toHaveCount(4);
    expect((await stored(page)).settings.tagMeta['fantasía épica'].emoji).toBe('✨');
    expect(errors).toEqual([]);
});

test('etiquetas: el formulario sugiere correcciones y etiquetas de obras parecidas', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => openWorkModal('book'));
    await page.fill('#f_title', 'El Bosque Oscuro');
    await page.locator('[data-field="author"]').fill('Liu Cixin');
    await page.fill('#f_tags', 'ciencia ficcion');
    await expect(page.locator('#tagsHint')).toContainText('¿Quisiste decir');
    await page.locator('#tagsHint [data-act="tag-fix"]').click();
    await expect(page.locator('#f_tags')).toHaveValue('ciencia ficción');
    await page.locator('#tagsHint [data-act="tag-add"]', { hasText: 'china' }).click();
    await expect(page.locator('#f_tags')).toHaveValue('ciencia ficción, china');
});

test('parejas vinculadas: obras juntos automáticas, ficha de la pareja y parejas en la ficha del actor', async ({ page }) => {
    await openApp(page);
    await goTo(page, 'couples');
    const card = page.locator('#couplesGrid .couple-card', { hasText: 'Park Seo Ham & Park Jae Chan' });
    await expect(card).toContainText('1 obra juntos');
    await card.locator('.couple-info').click();
    await expect(page.locator('#sheetBody')).toContainText('Semantic Error');
    await expect(page.locator('#sheetBody')).toContainText('★ 5 de media');

    // Nueva pareja eligiendo los actores: el nombre se pone solo
    await page.evaluate(() => closeModal('sheetModal'));
    await page.click('#addCoupleBtn');
    await page.selectOption('#coupleA', 'p2');
    await page.selectOption('#coupleB', 'p5');
    await page.locator('#coupleWorksPicker [data-couple-work="w4"]').check();
    await expect(page.locator('#coupleWorksCount')).toHaveText('1 obra juntos');
    await page.click('#coupleSaveBtn');
    await expect(page.locator('#couplesGrid')).toContainText('Bright Vachirawit & Park Seo Ham');
    const saved = (await stored(page)).couples.find(c => c.name === 'Bright Vachirawit & Park Seo Ham');
    expect([saved.personA, saved.personB, saved.workIds]).toEqual(['p2', 'p5', ['w4']]);

    // La ficha de Park Seo Ham muestra sus dos parejas y la pareja nueva tiene una relacionada
    await page.evaluate(() => openPersonDetail('p5'));
    await expect(page.locator('#personDetailCard [data-couple]')).toHaveCount(2);
    await page.locator('#personDetailCard [data-couple]', { hasText: 'Bright' }).click();
    await expect(page.locator('#sheetBody')).toContainText('Parejas relacionadas');
    await expect(page.locator('#sheetBody [data-couple]')).toContainText('Park Seo Ham & Park Jae Chan');
});

test('temporadas: se editan como bloques, la tarjeta muestra la actual y +1 avanza en ella', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => openDetail('w5'));
    await page.locator('#detailPanel [data-act="edit"]').click();
    await page.check('#f_multi');
    const rows = page.locator('#seasonsEditor [data-season-row]');
    await expect(rows).toHaveCount(1);
    await expect(rows.first().locator('[data-sfield="episodes"]')).toHaveValue('24');
    await rows.first().locator('[data-sfield="progress"]').fill('24');
    await page.click('[data-act="season-add"]');
    await rows.nth(1).locator('[data-sfield="episodes"]').fill('23');
    await rows.nth(1).locator('[data-sfield="progress"]').fill('2');
    await rows.nth(1).locator('[data-sfield="rating"]').selectOption('4');
    await expect(page.locator('[data-field="totalEpisodes"]')).toHaveValue('47');
    await page.click('#workSaveBtn');

    const w = await page.evaluate(() => getWorkById('w5'));
    expect([w.progress, w.totalEpisodes, w.seasons, w.seasonsList.length]).toEqual([26, 47, 2, 2]);
    await expect(page.locator('#detailPanel details[data-key="seasons"]')).toContainText('Temporada 2');
    await page.locator('#detailPanel [data-act="progress"]').first().click();
    expect(await page.evaluate(() => getWorkById('w5').seasonsList[1].progress)).toBe(3);
    await page.evaluate(() => closeDetail());
    await goTo(page, 'anime');
    await expect(page.locator('#animeGrid .card', { hasText: 'Jujutsu Kaisen' })).toContainText('T2 3/23');
});

test('notas: varias por obra, con tipos, reseña con criterios, fijar y editar', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => openDetail('w3')); // ya tiene una nota de ejemplo
    const notes = page.locator('#detailPanel details[data-key="notes"]');
    await notes.locator('label', { hasText: 'Reseña' }).click();
    await expect(page.locator('#reviewCriteria')).toBeVisible();
    await page.fill('#detailNote', 'Una obra maestra del wuxia.');
    await page.locator('[data-criteria="historia"]').selectOption('5');
    await page.locator('[data-criteria="final"]').selectOption('4');
    await notes.locator('[data-act="note-save"]').click();
    await expect(notes.locator('.note-item')).toHaveCount(2);
    await expect(notes.locator('.note-item').first()).toContainText('★ 4.5');

    await notes.locator('label', { hasText: 'Teoría' }).click();
    await page.fill('#detailNote', 'Creo que el final tiene otra lectura');
    await notes.locator('[data-act="note-save"]').click();
    await expect(notes.locator('.note-item')).toHaveCount(3);

    // Filtrar por tipo y fijar la más antigua
    await notes.locator('[data-act="note-filter"][data-id="teoria"]').click();
    await expect(notes.locator('.note-item')).toHaveCount(1);
    await notes.locator('[data-act="note-filter"][data-id="all"]').click();
    await notes.locator('.note-item').last().locator('[data-act="note-pin"]').click();
    await expect(notes.locator('.note-item').first()).toContainText('química');

    // Editar
    await notes.locator('.note-item').first().locator('[data-act="note-edit"]').click();
    await expect(page.locator('#detailNote')).toHaveValue(/química/);
    await page.fill('#detailNote', 'Química editada');
    await notes.locator('[data-act="note-save"]').click();
    await expect(notes.locator('.note-item').first()).toContainText('Química editada');
    const saved = (await stored(page)).notes.filter(n => n.workId === 'w3');
    expect(saved).toHaveLength(3);
    expect(saved.find(n => n.type === 'resena').scores).toEqual({ historia: 5, final: 4 });

    // La página de notas filtra por tipo
    await page.evaluate(() => closeDetail());
    await goTo(page, 'notes');
    await page.selectOption('#notesTypeFilter', 'resena');
    await expect(page.locator('#notesList .note-card')).toHaveCount(1);
});

test('lo escrito en una nota no se pierde si la ficha se vuelve a pintar', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => openDetail('w1'));
    await page.locator('#detailPanel details[data-key="notes"] summary').click();
    await page.fill('#detailNote', 'A medio escribir');
    await page.evaluate(() => refreshView());
    await expect(page.locator('#detailNote')).toHaveValue('A medio escribir');
});

test('relecturas: volver a ver, terminar otra vez y apuntar una pasada', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => openDetail('w8')); // Semantic Error, terminada
    const sec = page.locator('#detailPanel details[data-key="rereads"]');
    await sec.locator('summary').click();
    await sec.locator('[data-act="reread-start"]').click();
    expect(await page.evaluate(() => [getWorkById('w8').status, getWorkById('w8').progress])).toEqual(['viendo', 0]);
    await page.evaluate(() => closeDetail());
    await goTo(page, 'series');
    await expect(page.locator('#seriesGrid .card', { hasText: 'Semantic Error' })).toContainText('🔁 2ª vez');

    // Al llegar al último episodio se apunta la 2ª vez
    await page.evaluate(() => { getWorkById('w8').progress = 7; saveData(); changeProgress('w8', 1); });
    const w = await page.evaluate(() => getWorkById('w8'));
    expect([w.status, w.rereading, w.rereads.length, w.endDate]).toEqual(['terminado', false, 1, '2026-08-15']);
    await expect(page.locator('#seriesGrid .card', { hasText: 'Semantic Error' })).toContainText('🔁 ×2');

    await page.evaluate(() => openDetail('w8'));
    await page.locator('#detailPanel [data-act="reread-log"]').click();
    await page.fill('#rereadDate', '2026-09-01');
    await page.selectOption('#rereadRating', '4.5');
    await page.click('[data-act="reread-save"]');
    await expect(page.locator('#detailPanel .reread-list li')).toHaveCount(3);
    expect((await stored(page)).works.find(x => x.id === 'w8').rereads.map(r => r.date)[0]).toBe('2026-09-01');
});
