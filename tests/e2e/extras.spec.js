'use strict';
const { test, expect } = require('@playwright/test');
const { openApp, goTo, reloadSaved, stored, APP_URL } = require('./helpers');

test('página Extras: cronología, diario, ánimo, juego, retos, limpieza y preguntas', async ({ page }) => {
    const errors = await openApp(page);
    await goTo(page, 'extras');
    await expect(page.locator('#extrasBody .tl-item').first()).toBeVisible();
    await page.click('[data-act="extras-tab"][data-id="diary"]');
    await page.fill('#diaryText', 'Hoy lloré con The Untamed');
    await page.click('[data-act="diary-add"]');
    await expect(page.locator('#extrasBody .diary-entry')).toContainText('lloré');
    await page.click('[data-act="extras-tab"][data-id="mood"]');
    await page.click('[data-act="mood-pick"][data-id="sad"]');
    await expect(page.locator('#extrasBody .pick-item').first()).toContainText('The Untamed');
    await page.click('[data-act="extras-tab"][data-id="guess"]');
    await page.locator('[data-act="guess-pick"]').first().click();
    await expect(page.locator('.guess-result')).toBeVisible();
    await expect(page.locator('.guess-score')).toContainText('de 1');
    await page.click('[data-act="extras-tab"][data-id="challenges"]');
    await page.locator('[data-act="challenge-add"]').first().click();
    await expect(page.locator('#extrasBody .challenge')).toHaveCount(1);
    await page.evaluate(() => mutate(() => { getWorkById('w2').rating = 0; }));
    await page.click('[data-act="extras-tab"][data-id="cleanup"]');
    await expect(page.locator('#extrasBody')).toContainText('Terminadas sin valorar');
    await page.click('[data-act="extras-tab"][data-id="qa"]');
    await page.locator('#extrasBody summary', { hasText: '¿Cuánto BL veo?' }).click();
    await expect(page.locator('#extrasBody')).toContainText('son BL');
    const s = (await stored(page)).settings;
    expect([s.diary.length, s.challenges.length]).toEqual([1, 1]);
    expect(errors).toEqual([]);
});

test('tour guiado y consejo del día', async ({ page }) => {
    await openApp(page);
    await expect(page.locator('#welcomeCard')).toBeVisible();
    await expect(page.locator('#tipOfDay')).toContainText('Consejo');
    await page.click('#welcomeCard [data-act="tour"]');
    await expect(page.locator('.tour-card')).toContainText('/ 7');
    const step = await page.locator('.tour-actions .muted').textContent();
    await page.click('[data-act="tour-next"]');
    await expect(page.locator('.tour-actions .muted')).not.toHaveText(step);
    await page.keyboard.press('Escape');
    await expect(page.locator('.tour-layer')).toHaveCount(0);
    await expect(page.locator('#welcomeCard')).toBeHidden();
    await page.click('[data-act="tip-hide"]');
    await expect(page.locator('#tipOfDay')).toBeHidden();
});

test('modo solo lectura: no deja cambiar nada', async ({ page }) => {
    await openApp(page);
    await goTo(page, 'settings');
    await page.click('#readOnlyToggle');
    await expect(page.locator('html')).toHaveClass(/read-only/);
    await page.evaluate(() => changeProgress('w4', 1));
    await expect(page.locator('.toast').last()).toContainText('solo lectura');
    expect(await page.evaluate(() => getWorkById('w4').progress)).toBe(6);
    await goTo(page, 'books');
    await expect(page.locator('#page-books [data-add]')).toBeHidden();
});

test('idioma: inglés y portugués para la interfaz, con fechas de su región', async ({ page }) => {
    await openApp(page);
    await goTo(page, 'settings');
    await page.selectOption('#settingLang', 'en');
    await expect(page.locator('.sidebar [data-nav="books"] .label')).toHaveText('Books');
    await expect(page.locator('#page-settings .page-title')).toContainText('Customize');
    await goTo(page, 'books');
    await expect(page.locator('#page-books .page-subtitle')).toHaveText('Your personal reading library.');
    expect(await page.evaluate(() => fmtDate('2026-10-04'))).toBe('4 Oct 2026');
    await reloadSaved(page);
    await expect(page.locator('.sidebar [data-nav="home"] .label')).toHaveText('Home');
    await page.evaluate(() => { appData.settings.lang = 'pt'; applySettings(); });
    await expect(page.locator('.sidebar [data-nav="home"] .label')).toHaveText('Início');
    await page.evaluate(() => { appData.settings.lang = 'es'; applySettings(); });
    await expect(page.locator('.sidebar [data-nav="home"] .label')).toHaveText('Inicio');
});

test('calendario .ics, compartir, nota rápida y presentación', async ({ page }) => {
    await openApp(page);
    await goTo(page, 'emission');
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('[data-act="export-ics"]')]);
    const ics = require('fs').readFileSync(await download.path(), 'utf8');
    expect(ics).toContain('SUMMARY:🎬 The Untamed');
    expect((ics.match(/BEGIN:VEVENT/g) || []).length).toBe(3); // las 3 en curso con día de emisión

    await page.evaluate(() => { navigateTo('books'); });
    await page.locator('#booksGrid .card').first().hover();
    await page.locator('#booksGrid .card').first().locator('[data-act="quick-note"]').click({ force: true });
    await page.fill('#quickNoteText', 'Idea rápida');
    await page.click('[data-act="quick-note-save"]');
    expect(await page.evaluate(() => appData.notes.some(n => n.content === 'Idea rápida'))).toBe(true);

    await page.evaluate(() => navigator.clipboard && (navigator.clipboard.writeText = async t => { window.__copied = t; }));
    await page.evaluate(() => { navigator.share = undefined; FEATURE_ACTIONS['share-work']('w2'); });
    await expect.poll(() => page.evaluate(() => window.__copied || '')).toContain('El Nombre del Viento');

    await page.evaluate(() => FEATURE_ACTIONS['present-favs']());
    await expect(page.locator('#presentMode h2')).toBeVisible();
    const first = await page.locator('#presentMode h2').textContent();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#presentMode h2')).not.toHaveText(first);
    await page.keyboard.press('Escape');
    await expect(page.locator('#presentMode')).toBeHidden();
});

test('sugerencias en la ficha y aviso de obras sin valorar', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => { const w = getWorkById('w4'); w.progress = 12; saveData(); openDetail('w4'); });
    const sugg = page.locator('#detailPanel .smart-sugg', { hasText: 'Ya llegaste al final' });
    await expect(sugg).toBeVisible();
    await sugg.locator('[data-act="sugg-finish"]').click();
    expect(await page.evaluate(() => getWorkById('w4').status)).toBe('terminado');
    await page.evaluate(() => { closeDetail(); getWorkById('w2').rating = 0; saveData(); openNotifications(); });
    await expect(page.locator('#sheetBody')).toContainText('sin valorar');
});

test('guardar desde otra web con el marcador abre el formulario con los datos', async ({ page }) => {
    await page.goto(APP_URL + '?accion=agregar&titulo=' + encodeURIComponent('Lore Olympus | WEBTOON') + '&enlace=' + encodeURIComponent('https://www.webtoons.com/es/lore'));
    await expect(page.locator('html[data-ready="true"]')).toHaveCount(1);
    await expect(page.locator('#workModal')).toHaveClass(/active/);
    await expect(page.locator('#f_title')).toHaveValue('Lore Olympus | WEBTOON'.replace(/\s*\|\s*WEBTOON/i, ''));
    await expect(page.locator('#workTypeTabs .seg-btn.active')).toHaveAttribute('data-type', 'manhwa');
});

test('plantillas de colecciones y favicon con avisos', async ({ page }) => {
    await openApp(page);
    await goTo(page, 'collections');
    await page.click('[data-act="coll-templates"]');
    await page.locator('[data-act="coll-template"]').first().click();
    await expect(page.locator('.collection-card', { hasText: 'Top BL' })).toContainText('✨');
    const href = await page.locator('link[rel="icon"][type="image/svg+xml"]').getAttribute('href');
    expect(href).toMatch(/^data:image\/svg\+xml/);
});
