'use strict';
const path = require('path');
const { pathToFileURL } = require('url');
const { expect } = require('@playwright/test');

const APP_URL = pathToFileURL(path.join(__dirname, '..', '..', 'index.html')).href;
const STORAGE_KEY = 'mi_mundo_data_v16';

/** Abre la app y falla el test si aparece cualquier error de JavaScript. */
async function openApp(page, hash = '') {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(APP_URL + hash);
    await expect(page.locator('.page-view.active')).toBeVisible();
    return errors;
}

/** Navega con la barra lateral (o la barra inferior en móvil). */
async function goTo(page, name) {
    await page.locator(`.sidebar [data-nav="${name}"]`).first().click();
    await expect(page.locator(`#page-${name}`)).toHaveClass(/active/);
}

const stored = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);

module.exports = { APP_URL, STORAGE_KEY, openApp, goTo, stored };
