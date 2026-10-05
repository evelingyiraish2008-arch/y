'use strict';
const { test, expect } = require('@playwright/test');
const { openApp, goTo } = require('./helpers');

test('estadísticas avanzadas: comparativas, ritmo, rankings, distribuciones y notas', async ({ page }) => {
    const errors = await openApp(page);
    await goTo(page, 'stats');
    await expect(page.locator('#statsCompareTiles .cmp-tile')).toHaveCount(3);
    await expect(page.locator('#statsPace .pace-item').first()).toBeVisible();
    await expect(page.locator('#statsPace')).toContainText('terminarás hacia el');
    await expect(page.locator('#statsRankings')).toContainText('Mejor libro');
    await expect(page.locator('#statsSpread .viz-strip-row')).toHaveCount(4);
    await expect(page.locator('#statsNotesKpis')).toContainText('notas');
    // Cada gráfico nuevo tiene su tabla
    const card = page.locator('.viz-card', { has: page.locator('#statsSpread') });
    await card.locator('[data-table-toggle]').click();
    await expect(card.locator('table.viz-table')).toBeVisible();
    // Cambiar el periodo cambia los rankings
    await page.locator('[data-act="stats-period"][data-id="prev"]').click();
    await expect(page.locator('[data-stats-period="prev"]')).toHaveClass(/is-on/);
    await expect(page.locator('#statsRankings')).toContainText('Valora tus obras');
    expect(errors).toEqual([]);
});

test('tu año en Mi Mundo: historia, navegación e imagen para descargar', async ({ page }) => {
    await openApp(page);
    await goTo(page, 'stats');
    await page.click('[data-act="wrapped"]');
    await expect(page.locator('#wrapped')).toBeVisible();
    await expect(page.locator('.wrapped-big')).toHaveText(/20\d\d/);
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('.wrapped-text')).toContainText('terminada');
    const bars = await page.locator('.wrapped-bars span').count();
    for (let i = 0; i < bars; i++) await page.keyboard.press('ArrowRight');
    await expect(page.locator('.wrapped-big')).toHaveText('¡Gracias!');
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('[data-act="wrapped-image"]')]);
    expect(download.suggestedFilename()).toMatch(/^mi-mundo-20\d\d\.png$/);
    const size = require('fs').statSync(await download.path()).size;
    expect(size).toBeGreaterThan(10000);
    await page.keyboard.press('Escape');
    await expect(page.locator('#wrapped')).toBeHidden();
});
