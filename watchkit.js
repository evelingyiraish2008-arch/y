/*
 * Mi Mundo · watchkit.js
 * "Dónde verla / leerla": enlaces de cada obra a las webs donde se ve o se lee.
 * No se enlaza ninguna cuenta: son enlaces normales que se abren en otra pestaña.
 *  - Plataformas conocidas (con su búsqueda) y un enlace libre para cualquier otra web.
 *  - Los enlaces pueden llevar {n} (próximo episodio o capítulo) y {t} (temporada actual)
 *    para continuar justo donde vas, en webs que numeran sus episodios en la dirección.
 *  - Disponibilidad por país con los datos de TMDB (JustWatch), si pones tu clave.
 * Funciones puras (sin DOM): dependen solo de utils.js (norm). Se prueban con tests unitarios.
 */
'use strict';

/** types: dónde tiene sentido (v = ver series y anime, l = leer libros y manhwas). */
const WATCH_PLATFORMS = [
    { id: 'netflix', name: 'Netflix', icon: '🔴', hosts: ['netflix.com'], search: 'https://www.netflix.com/search?q={q}', kind: 'v' },
    { id: 'viki', name: 'Viki', icon: '💙', hosts: ['viki.com'], site: 'viki.com', kind: 'v' },
    { id: 'wetv', name: 'WeTV', icon: '💚', hosts: ['wetv.vip'], site: 'wetv.vip', kind: 'v' },
    { id: 'iqiyi', name: 'iQIYI', icon: '🟢', hosts: ['iq.com', 'iqiyi.com'], site: 'iq.com', kind: 'v' },
    { id: 'disney', name: 'Disney+', icon: '🏰', hosts: ['disneyplus.com'], site: 'disneyplus.com', kind: 'v' },
    { id: 'prime', name: 'Prime Video', icon: '📦', hosts: ['primevideo.com', 'amazon.com'], site: 'primevideo.com', kind: 'v' },
    { id: 'max', name: 'Max', icon: '🟣', hosts: ['max.com', 'hbomax.com'], site: 'max.com', kind: 'v' },
    { id: 'appletv', name: 'Apple TV+', icon: '🍎', hosts: ['tv.apple.com'], site: 'tv.apple.com', kind: 'v' },
    { id: 'crunchyroll', name: 'Crunchyroll', icon: '🍊', hosts: ['crunchyroll.com'], search: 'https://www.crunchyroll.com/search?q={q}', kind: 'v' },
    { id: 'youtube', name: 'YouTube', icon: '▶️', hosts: ['youtube.com', 'youtu.be'], search: 'https://www.youtube.com/results?search_query={q}', kind: 'v' },
    { id: 'gagaoolala', name: 'GagaOOLala', icon: '🌈', hosts: ['gagaoolala.com'], site: 'gagaoolala.com', kind: 'v' },
    { id: 'webtoon', name: 'Webtoon', icon: '📗', hosts: ['webtoons.com'], site: 'webtoons.com', kind: 'l' },
    { id: 'tapas', name: 'Tapas', icon: '📙', hosts: ['tapas.io'], site: 'tapas.io', kind: 'l' },
    { id: 'tappytoon', name: 'Tappytoon', icon: '📘', hosts: ['tappytoon.com'], site: 'tappytoon.com', kind: 'l' },
    { id: 'lezhin', name: 'Lezhin', icon: '📕', hosts: ['lezhinus.com', 'lezhin.com'], site: 'lezhinus.com', kind: 'l' },
    { id: 'kindle', name: 'Kindle / Amazon', icon: '📚', hosts: ['amazon.es', 'amazon.com.mx', 'amazon.co.uk', 'read.amazon.com'], site: 'amazon.com', kind: 'l' },
    { id: 'goodreads', name: 'Goodreads', icon: '📖', hosts: ['goodreads.com'], search: 'https://www.goodreads.com/search?q={q}', kind: 'l' }
];
const WATCH_BY_ID = Object.fromEntries(WATCH_PLATFORMS.map(p => [p.id, p]));
/** Qué plataformas se ofrecen según el tipo de obra. */
const watchKindOf = type => (type === 'book' || type === 'manhwa' ? 'l' : 'v');
const watchPlatformsFor = type => WATCH_PLATFORMS.filter(p => p.kind === watchKindOf(type) || (type === 'manhwa' && p.id === 'webtoon'));

/** Deja una dirección lista (con https://) o '' si no es una web. Solo http(s): nada de javascript: ni data:. */
function normalizeWatchUrl(raw) {
    let u = String(raw || '').trim();
    if (!u) return '';
    if (!/^[a-z][a-z0-9+.-]*:/i.test(u)) u = 'https://' + u.replace(/^\/+/, '');
    if (!/^https?:\/\//i.test(u)) return '';
    try {
        const p = new URL(u.replace(/\{(n|t)\}/g, '1')); // los marcadores no son caracteres de dirección
        if (!p.hostname.includes('.')) return '';
    } catch (e) { return ''; }
    return u;
}
const hostOf = url => { try { return new URL(String(url).replace(/\{(n|t)\}/g, '1')).hostname.replace(/^www\./, '').toLowerCase(); } catch (e) { return ''; } };
/** Plataforma conocida a partir de una dirección (por su dominio) o null. */
function detectWatchPlatform(url) {
    const h = hostOf(url);
    return WATCH_PLATFORMS.find(p => p.hosts.some(d => h === d || h.endsWith('.' + d))) || null;
}
/** Plataforma conocida a partir del nombre que escribiste en "Plataforma" ("Netflix", "viki", "Prime"…). */
function platformByName(name) {
    const n = norm(name).replace(/[^a-z0-9]/g, '');
    if (!n) return null;
    return WATCH_PLATFORMS.find(p => { const k = norm(p.name).replace(/[^a-z0-9]/g, ''); return k === n || n.startsWith(k) || (k.length > 4 && k.startsWith(n) && n.length >= 4); }) || null;
}
/** Nombre que se muestra: el de la plataforma, el que le pusiste o el de la web ("doramasia.com"). */
function watchLinkName(link) {
    const p = WATCH_BY_ID[link.platform] || detectWatchPlatform(link.url);
    return (p && p.name) || link.label || hostOf(link.url) || 'Enlace';
}
const watchLinkIcon = link => ((WATCH_BY_ID[link.platform] || detectWatchPlatform(link.url) || {}).icon) || '🌐';
/** Enlace de búsqueda del título en una plataforma (con su buscador o, si no tiene, buscando en su web desde Google). */
function watchSearchUrl(platformId, title) {
    const p = WATCH_BY_ID[platformId];
    if (!p) return '';
    const q = encodeURIComponent(String(title || '').trim());
    if (p.search) return p.search.replace('{q}', q);
    return `https://www.google.com/search?q=${q}+site%3A${encodeURIComponent(p.site)}`;
}
/** Próximo episodio y temporada para los marcadores {n} y {t}. */
function watchPosition(w) {
    const list = Array.isArray(w.seasonsList) ? w.seasonsList : [];
    if (list.length) {
        let cur = list.findIndex(x => !(Number(x.episodes) && (Number(x.progress) || 0) >= Number(x.episodes)));
        if (cur < 0) cur = list.length - 1;
        const s = list[cur];
        const eps = Number(s.episodes) || 0;
        return { n: Math.min(eps || Infinity, (Number(s.progress) || 0) + 1), t: s.number || cur + 1 };
    }
    return { n: (Number(w.progress) || 0) + 1, t: Number(w.season) || 1 };
}
/** Dirección final de un enlace: reemplaza {n} y {t}; si no hay dirección, busca el título en la plataforma. */
function buildWatchUrl(link, w) {
    if (!link.url) return watchSearchUrl(link.platform, w.title);
    const pos = watchPosition(w);
    return link.url.replace(/\{n\}/g, String(pos.n)).replace(/\{t\}/g, String(pos.t));
}
const hasPlaceholders = url => /\{(n|t)\}/.test(String(url || ''));
/** Crea un enlace listo para guardar o null si la dirección no vale. */
function makeWatchLink({ platform = '', url = '', label = '' }, makeId = () => String(Date.now())) {
    const clean = normalizeWatchUrl(url);
    if (url && !clean) return null;
    const known = (platform && WATCH_BY_ID[platform] ? platform : '') || (detectWatchPlatform(clean) || {}).id || '';
    if (!clean && !known) return null;
    const out = { id: makeId() };
    if (known) out.platform = known;
    if (clean) out.url = clean;
    if (!known && label) out.label = String(label).trim().slice(0, 40);
    return out;
}
/** Añade un enlace sin repetir (misma plataforma y misma dirección). Devuelve la lista nueva. */
function addWatchLink(list, link) {
    const cur = Array.isArray(list) ? list : [];
    if (cur.some(x => (x.url || '') === (link.url || '') && (x.platform || '') === (link.platform || ''))) return cur;
    return [...cur, link];
}
/** Pone un enlace el primero (es el del botón "Ver ahora"). */
function makePrimary(list, id) {
    const i = (list || []).findIndex(x => x.id === id);
    if (i <= 0) return list || [];
    return [list[i], ...list.slice(0, i), ...list.slice(i + 1)];
}

// ---------- Disponibilidad por país (TMDB / JustWatch) ----------
const WATCH_COUNTRIES = [['ES', 'España'], ['MX', 'México'], ['AR', 'Argentina'], ['CO', 'Colombia'], ['CL', 'Chile'], ['PE', 'Perú'], ['US', 'Estados Unidos'], ['BR', 'Brasil'], ['TH', 'Tailandia'], ['KR', 'Corea del Sur'], ['JP', 'Japón'], ['PH', 'Filipinas']];
/** País por defecto: el de tu navegador si está en la lista; si no, España. */
function defaultWatchCountry(lang) {
    const m = String(lang || '').match(/[-_]([A-Za-z]{2})$/);
    const c = m ? m[1].toUpperCase() : '';
    return WATCH_COUNTRIES.some(([k]) => k === c) ? c : 'ES';
}
/** /tv/{id}/watch/providers → { link, flatrate: [nombres], rent, buy } del país pedido. */
function parseWatchProviders(json, country) {
    const r = ((json || {}).results || {})[country];
    if (!r) return null;
    const names = list => (list || []).map(x => x.provider_name).filter(Boolean);
    return { link: r.link || '', flatrate: names(r.flatrate), rent: names(r.rent), buy: names(r.buy) };
}
/** Nombre de un servicio de TMDB ("Netflix", "Amazon Prime Video", "Disney Plus") → plataforma conocida o null. */
function platformFromProvider(name) {
    const n = norm(name).replace(/[^a-z0-9]/g, '');
    const alias = { amazonprimevideo: 'prime', amazonvideo: 'prime', disneyplus: 'disney', hbomax: 'max', maxamazonchannel: 'max', appletvplus: 'appletv', appletv: 'appletv', viki: 'viki', rakutenviki: 'viki', wetv: 'wetv', iqiyi: 'iqiyi', iq: 'iqiyi', crunchyroll: 'crunchyroll', netflix: 'netflix', youtube: 'youtube', gagaoolala: 'gagaoolala' };
    return WATCH_BY_ID[alias[n]] || null;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        WATCH_PLATFORMS, WATCH_COUNTRIES, watchPlatformsFor, watchKindOf, normalizeWatchUrl, detectWatchPlatform, platformByName, watchLinkName, watchLinkIcon,
        watchSearchUrl, watchPosition, buildWatchUrl, hasPlaceholders, makeWatchLink, addWatchLink, makePrimary, defaultWatchCountry, parseWatchProviders, platformFromProvider
    };
}
