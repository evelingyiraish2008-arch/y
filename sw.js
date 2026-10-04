/*
 * Mi Mundo · service worker
 * - Archivos de la app: primero la red (siempre la última versión) y, sin conexión, la copia guardada.
 * - Fuentes de Google: copia guardada al instante y se actualiza en segundo plano.
 * - Portadas de otras webs: copia guardada si existe; se guardan hasta MAX_IMAGES.
 * Las rutas son relativas para que funcione también dentro de una subcarpeta (GitHub Pages).
 */
'use strict';
const VERSION = 'v1';
const APP_CACHE = `mi-mundo-app-${VERSION}`;
const FONT_CACHE = 'mi-mundo-fonts';
const IMAGE_CACHE = 'mi-mundo-images';
const MAX_IMAGES = 80;

const APP_SHELL = [
    './',
    './index.html',
    './styles.css',
    './utils.js',
    './insights.js',
    './history.js',
    './charts.js',
    './storage.js',
    './sync.js',
    './cloud.js',
    './vendor/supabase.js',
    './app.js',
    './manifest.webmanifest',
    './icons/icon.svg',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './icons/apple-touch-icon.png'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(APP_CACHE)
            .then(cache => cache.addAll(APP_SHELL))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    const keep = [APP_CACHE, FONT_CACHE, IMAGE_CACHE];
    event.waitUntil(
        caches.keys()
            .then(names => Promise.all(names.filter(n => !keep.includes(n)).map(n => caches.delete(n))))
            .then(() => self.clients.claim())
    );
});

async function networkFirst(request) {
    const cache = await caches.open(APP_CACHE);
    try {
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
    } catch (err) {
        const cached = await cache.match(request, { ignoreSearch: true });
        if (cached) return cached;
        if (request.mode === 'navigate') {
            const shell = await cache.match('./index.html');
            if (shell) return shell;
        }
        throw err;
    }
}

async function staleWhileRevalidate(request, cacheName) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    const network = fetch(request)
        .then(response => {
            if (response.ok || response.type === 'opaque') cache.put(request, response.clone());
            return response;
        })
        .catch(() => cached);
    return cached || network;
}

async function trimCache(cacheName, max) {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

async function cacheFirstImage(request) {
    const cache = await caches.open(IMAGE_CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok || response.type === 'opaque') {
        await cache.put(request, response.clone());
        trimCache(IMAGE_CACHE, MAX_IMAGES);
    }
    return response;
}

self.addEventListener('fetch', event => {
    const { request } = event;
    if (request.method !== 'GET') return;
    const url = new URL(request.url);
    if (!url.protocol.startsWith('http')) return;

    if (url.origin === self.location.origin) {
        event.respondWith(networkFirst(request));
    } else if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
        event.respondWith(staleWhileRevalidate(request, FONT_CACHE));
    } else if (request.destination === 'image') {
        event.respondWith(cacheFirstImage(request));
    }
});
