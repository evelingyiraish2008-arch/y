'use strict';
const { test, expect } = require('@playwright/test');
const { openApp, goTo, stored } = require('./helpers');

const seed = page => page.evaluate(() => {
    const now = Date.now();
    appData.works = [
        { id: 'q1', type: 'series', title: 'Cola Uno', status: 'quiero ver', totalEpisodes: 10, runtime: 45, sadness: 1, spicy: 1, tags: 'comedia', createdAt: now - 1000 },
        { id: 'q2', type: 'series', title: 'Cola Dos', status: 'quiero ver', totalEpisodes: 12, runtime: 50, sadness: 5, tags: 'angustia, BL', bl: true, createdAt: now - 2000 },
        { id: 'q3', type: 'anime', title: 'Cola Tres', status: 'para rever', totalEpisodes: 12, progress: 12, runtime: 24, sadness: 3, spicy: 4, createdAt: now - 3000 },
        { id: 'q4', type: 'series', seriesType: 'Película', title: 'Cola Peli', status: 'quiero ver', runtime: 100, createdAt: now - 4000 },
        { id: 'q5', type: 'book', title: 'Cola Libro', status: 'quiero leer', pages: 240, createdAt: now - 5000 },
        { id: 'v1', type: 'series', title: 'Viendo Ahora', status: 'viendo', totalEpisodes: 10, progress: 8, runtime: 45, createdAt: now },
        { id: 'g1', type: 'series', title: 'Me Gustó', status: 'terminado', rating: 5, bl: true, tags: 'BL, angustia', createdAt: now }
    ];
    saveData(); refreshView();
});

test('Qué ver: la cola se ordena a mano y el orden se recuerda', async ({ page }) => {
    const errors = await openApp(page);
    await seed(page);
    await goTo(page, 'queue');
    const rows = page.locator('#queueList .queue-row');
    await expect(rows).toHaveCount(5);
    await expect(rows.first()).toContainText('Cola Uno'); // lo más reciente primero
    await expect(page.locator('#queueList')).toContainText('Para rever');
    await expect(rows.nth(2)).toContainText('4 h 48 min'); // anime para rever: 12 × 24 min
    await rows.nth(2).locator('[data-act="queue-top"]').click();
    await expect(rows.first()).toContainText('Cola Tres');
    await rows.first().locator('[data-act="queue-down"]').click();
    await expect(rows.nth(1)).toContainText('Cola Tres');
    await rows.nth(1).locator('[data-act="queue-up"]').click();
    await expect(rows.first()).toContainText('Cola Tres');
    await expect(rows.first().locator('[data-act="queue-up"]')).toBeDisabled();
    await expect(rows.last().locator('[data-act="queue-down"]')).toBeDisabled();
    const saved = (await stored(page)).works.filter(w => w.queuePos !== undefined).sort((a, b) => a.queuePos - b.queuePos).map(w => w.id);
    expect(saved).toEqual(['q3', 'q1', 'q2', 'q4', 'q5']);
    await page.reload();
    await goTo(page, 'queue');
    await expect(page.locator('#queueList .queue-row').first()).toContainText('Cola Tres');
    expect(errors).toEqual([]);
});

test('Qué ver: Sorpréndeme respeta el ánimo, el tipo y BL, y Empezar la pone en curso', async ({ page }) => {
    const errors = await openApp(page);
    await seed(page);
    await goTo(page, 'queue');
    await page.selectOption('#queueMood', 'llorar');
    await page.click('[data-act="surprise"]');
    await expect(page.locator('.queue-pick')).toContainText('Cola Dos');
    await page.selectOption('#queueMood', 'picante');
    await page.click('[data-act="surprise"]');
    await expect(page.locator('.queue-pick')).toContainText('Cola Tres');
    await page.selectOption('#queueMood', 'corto');
    await page.selectOption('#queueType', 'series');
    await page.click('[data-act="surprise"]');
    await expect(page.locator('.queue-pick')).toContainText('Cola Peli');
    await page.selectOption('#queueMood', 'picante'); // no hay series picantes en la cola
    await page.click('[data-act="surprise"]');
    await expect(page.locator('#queueSurprise')).toContainText('nada en la cola que encaje');
    await page.selectOption('#queueMood', 'cualquiera');
    await page.selectOption('#queueType', 'all');
    await page.check('#queueBl');
    await page.click('[data-act="surprise"]');
    await expect(page.locator('.queue-pick')).toContainText('Cola Dos');
    await page.click('.queue-pick [data-act="sugg-start"]');
    expect((await stored(page)).works.find(w => w.id === 'q2').status).toBe('viendo');
    expect(errors).toEqual([]);
});

test('Qué ver: Maratón dice qué cabe en tus horas y las parecidas explican el porqué', async ({ page }) => {
    const errors = await openApp(page);
    await seed(page);
    await goTo(page, 'queue');
    await expect(page.locator('#marathonBody')).toContainText('Viendo Ahora');
    await expect(page.locator('#marathonBody')).toContainText('2 eps'); // 8/10 vistos y quedan 2: ¡la terminas!
    await expect(page.locator('#marathonBody')).toContainText('¡la terminas!');
    await expect(page.locator('#marathonBody')).toContainText('Cola Peli'); // 1 h 40 min cabe en 3 h
    await expect(page.locator('#marathonBody')).not.toContainText('Cola Tres'); // 4 h 48 min no cabe
    await page.fill('#marathonHours', '6');
    await expect(page.locator('#marathonBody')).toContainText('Cola Tres');
    await page.fill('#marathonHours', '0.5');
    await expect(page.locator('#marathonBody')).toContainText('no cabe nada entero');
    await expect(page.locator('#queueSimilar')).toContainText('Cola Dos');
    await expect(page.locator('#queueSimilar')).toContainText('Porque te gustó Me Gustó');
    expect(errors).toEqual([]);
});

test('Qué ver: atajo G Q, vacía muestra ayuda y sale en el menú', async ({ page }) => {
    const errors = await openApp(page);
    await expect(page.locator('.sidebar [data-nav="queue"]')).toBeVisible();
    await page.evaluate(() => { appData.works = []; saveData(); refreshView(); });
    await page.keyboard.press('g');
    await page.keyboard.press('q');
    await expect(page.locator('#page-queue')).toHaveClass(/active/);
    await expect(page.locator('#queueList')).toContainText('Tu cola está vacía');
    await expect(page.locator('#queueSurprise')).toBeVisible();
    await page.click('[data-act="surprise"]');
    await expect(page.locator('#queueSurprise')).toContainText('nada en la cola que encaje');
    expect(errors).toEqual([]);
});

test('Calendario del mes: episodios con fecha, proyección semanal, cambiar de mes y ver un día', async ({ page }) => {
    const errors = await openApp(page);
    await page.evaluate(() => {
        const d = new Date();
        const at = new Date(d.getFullYear(), d.getMonth(), 15, 21, 0).getTime();
        appData.works = [
            { id: 'c1', type: 'series', title: 'Sale El Quince', platform: 'Viki', status: 'viendo', totalEpisodes: 12, progress: 3, nextAiring: { at, episode: 4, season: 1 }, createdAt: 1 },
            { id: 'c2', type: 'anime', title: 'Con Día Fijo', status: 'viendo', airDay: String((d.getDay() + 3) % 7), totalEpisodes: 24, progress: 5, createdAt: 2 }
        ];
        saveData(); refreshView();
    });
    await goTo(page, 'emission');
    await expect(page.locator('#calTitle')).toContainText(String(new Date().getFullYear()));
    const day15 = page.locator('#monthCalendar [data-act="cal-day"]:not(.is-out)').nth(14);
    await expect(day15.locator('.dots i')).toHaveCount(1 + (await page.evaluate(() => (new Date(new Date().getFullYear(), new Date().getMonth(), 15).getDay() === (new Date().getDay() + 3) % 7 ? 1 : 0))));
    await expect(page.locator('#calDay')).toContainText('Sale El Quince'); // sin elegir día: lista del mes
    await expect(page.locator('#calDay')).toContainText('T1 · Ep 4');
    await expect(page.locator('#calDay')).toContainText('estimado'); // las semanas siguientes son proyección
    await day15.click();
    await expect(page.locator('#calDay')).toContainText('Ep 4');
    await expect(page.locator('#calDay')).not.toContainText('Ep 5');
    await page.locator('#calDay .cal-item').first().click();
    await expect(page.locator('#detailPanel')).toContainText('Sale El Quince');
    await page.evaluate(() => closeDetail());
    const title = await page.locator('#calTitle').textContent();
    await page.click('[data-act="cal-next"]');
    await expect(page.locator('#calTitle')).not.toHaveText(title);
    await page.click('[data-act="cal-today"]');
    await expect(page.locator('#calTitle')).toHaveText(title);
    expect(errors).toEqual([]);
});
