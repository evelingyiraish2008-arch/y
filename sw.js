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
    './coherence.js',
    './metadata.js',
    './importers.js',
    './features.js',
    './tools.js',
    './ux.js',
    './analytics.js',
    './statsplus.js',
    './notify.js',
    './alerts.js',
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

// ============================================================
// Avisos en segundo plano (Chrome/Android con la app instalada)
// ============================================================
try { importScripts('./utils.js', './insights.js', './notify.js'); } catch (e) { /* sin avisos en segundo plano */ }

function idbRequest(req) { return new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); }); }
/** Lee las obras y los ajustes de IndexedDB, muestra los avisos que tocan y apunta que ya salieron. */
async function backgroundNotify() {
    if (typeof dueNotifications !== 'function') return;
    const db = await new Promise((resolve, reject) => {
        const req = indexedDB.open('mi_mundo_db');
        req.onupgradeneeded = () => { req.transaction.abort(); };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
    try {
        if (!db.objectStoreNames.contains('works') || !db.objectStoreNames.contains('meta')) return;
        const tx = db.transaction(['works', 'meta'], 'readonly');
        const [works, settings, sent] = await Promise.all([
            idbRequest(tx.objectStore('works').getAll()),
            idbRequest(tx.objectStore('meta').get('settings')),
            idbRequest(tx.objectStore('meta').get('notifSent'))
        ]);
        const now = Date.now();
        const sentMap = pruneSent((sent && sent.value) || {}, now);
        const due = dueNotifications({ works, settings: (settings && settings.value) || {} }, now, sentMap);
        for (const n of due.slice(0, 4)) {
            try {
                await self.registration.showNotification(n.title, { body: n.body, tag: n.id, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', data: { workId: n.workId || '' } });
                sentMap[n.id] = now;
            } catch (e) { return; } // sin permiso: se intentará la próxima vez
        }
        if (due.length) {
            const wtx = db.transaction('meta', 'readwrite');
            wtx.objectStore('meta').put({ key: 'notifSent', value: sentMap });
            await new Promise(r => { wtx.oncomplete = r; wtx.onerror = r; });
        }
    } finally { db.close(); }
}
self.addEventListener('periodicsync', event => {
    if (event.tag === 'mi-mundo-avisos') event.waitUntil(backgroundNotify().catch(() => {}));
});
// Al tocar un aviso se abre la app (o se enfoca si ya estaba abierta) en esa obra
self.addEventListener('notificationclick', event => {
    event.notification.close();
    const workId = (event.notification.data || {}).workId;
    event.waitUntil((async () => {
        const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        const client = all.find(c => c.url.startsWith(self.registration.scope));
        if (client) {
            await client.focus();
            if (workId) client.postMessage({ type: 'open-work', id: workId });
            return;
        }
        await self.clients.openWindow(workId ? `./?obra=${encodeURIComponent(workId)}` : './');
    })());
});

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
