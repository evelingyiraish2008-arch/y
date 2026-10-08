/*
 * Mi Mundo · mediakit.js
 * Cálculos de imágenes sin tocar la página: recortes, tamaños, comprobación de enlaces
 * y qué fondo lleva cada cabecera. Lo usan media.js, people.js e imagefind.js, y se prueba en Node.
 */
'use strict';

// ============================================================
// 1. RECORTES Y TAMAÑOS
// ============================================================
const BANNER_RATIOS = [['3:1', 3], ['4:1', 4], ['16:9', 16 / 9], ['2:1', 2]];
/** Tipos de imagen que se pueden recortar: proporción, tamaño máximo y nombre para los avisos. */
const CROP_KINDS = {
    banner: { aspect: 3, ratios: BANNER_RATIOS, out: [1200, 400], name: 'banner' },
    avatar: { aspect: 1, ratios: [['1:1', 1]], out: [400, 400], name: 'foto' },
    poster: { aspect: 2 / 3, ratios: [['2:3', 2 / 3]], out: [480, 720], name: 'portada' },
    couple: { aspect: 16 / 10, ratios: [['16:10', 16 / 10], ['1:1', 1]], out: [800, 500], name: 'imagen' }
};
const IMAGE_MAX_BYTES = 20 * 1024 * 1024;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const IMAGE_TARGET_BYTES = 500 * 1024;

/** Recorte centrado con la proporción pedida (lo que queda al "rellenar" el marco). */
function centerCrop(w, h, aspect) {
    if (w / h > aspect) { const sw = Math.round(h * aspect); return { sx: Math.round((w - sw) / 2), sy: 0, sw, sh: h }; }
    const sh = Math.round(w / aspect);
    return { sx: 0, sy: Math.round((h - sh) / 2), sw: w, sh };
}
/**
 * Cómo guardar una imagen subida: si no tiene la forma esperada se recorta por el centro,
 * y se reduce hasta el ancho máximo. Nunca se agranda (una imagen pequeña se queda como está).
 */
function imagePlan(w, h, { aspect = 3, maxW = 1200, tolerance = 0.06 } = {}) {
    const off = Math.abs(w / h - aspect) / aspect > tolerance;
    const crop = off ? centerCrop(w, h, aspect) : { sx: 0, sy: 0, sw: w, sh: h };
    const outW = Math.max(1, Math.min(maxW, crop.sw));
    const outH = Math.max(1, Math.round(outW * crop.sh / crop.sw));
    return { crop, outW, outH, cropped: off, small: crop.sw < 800 && aspect > 1 };
}
/** Tamaño de la imagen después de girarla. */
const rotatedSize = (iw, ih, rot) => (rot % 180 ? [ih, iw] : [iw, ih]);
/** Escala con la que la imagen (girada) cubre justo el marco: es el "zoom 1". */
function coverScale(iw, ih, W, H, rot = 0) {
    const [rw, rh] = rotatedSize(iw, ih, rot);
    return Math.max(W / rw, H / rh);
}
/** Limita el desplazamiento para que la imagen siempre tape todo el marco (sin bordes vacíos). */
function clampPan(st, iw, ih, W, H) {
    const s = coverScale(iw, ih, W, H, st.rot) * st.zoom;
    const [rw, rh] = rotatedSize(iw, ih, st.rot);
    const mx = Math.max(0, (rw * s - W) / 2), my = Math.max(0, (rh * s - H) / 2);
    const lim = (v, m) => Math.min(m, Math.max(-m, v));
    return { ...st, x: lim(st.x, mx), y: lim(st.y, my) };
}
/** Tamaño final del recorte: el trozo elegido, reducido al máximo permitido pero nunca ampliado. */
function cropOutputSize(st, iw, ih, W, H, maxW, aspect = W / H) {
    const s = coverScale(iw, ih, W, H, st.rot) * st.zoom; // píxeles del marco por píxel de la imagen
    const outW = Math.max(1, Math.round(Math.min(maxW, W / s)));
    return [outW, Math.max(1, Math.round(outW / aspect))];
}
/** ¿Parece la dirección de una imagen? (por la extensión o por ser de un servicio de imágenes conocido) */
const IMAGE_HOSTS = /(^|\.)(pinimg\.com|wikimedia\.org|tmdb\.org|anilist\.co|myanimelist\.net|openlibrary\.org|unsplash\.com|googleusercontent\.com|gstatic\.com|imgur\.com|tvmaze\.com|ytimg\.com|staticflickr\.com|media-amazon\.com)$/i;
function looksLikeImageUrl(url) {
    const u = String(url || '').trim();
    if (/^data:image\//i.test(u)) return true;
    let parsed;
    try { parsed = new URL(u); } catch (e) { return false; }
    if (!/^https?:$/.test(parsed.protocol)) return false;
    return /\.(jpe?g|png|webp|gif|avif|bmp)$/i.test(parsed.pathname) || IMAGE_HOSTS.test(parsed.hostname);
}
/** Explica por qué un enlace no sirve como imagen (o '' si en principio sirve). */
function imageUrlProblem(url) {
    const u = String(url || '').trim();
    if (!u) return 'Pega un enlace';
    if (/^data:image\//i.test(u)) return '';
    if (!/^https?:\/\//i.test(u)) return 'La URL no apunta a una imagen';
    if (/(^|\.)pinterest\.[a-z.]+\/pin\/|\/\/pin\.it\//i.test(u)) return 'Es el enlace del pin, no el de la imagen. En Pinterest abre la imagen, mantén pulsado (o clic derecho) → «Copiar dirección de la imagen» y pégala aquí.';
    return '';
}
/** Qué fondo lleva una cabecera: el banner, la imagen principal difuminada o un degradado con puntos. */
function bannerMode(banner, fallback) {
    if (banner) return 'banner';
    if (fallback) return 'blur';
    return 'pattern';
}
/** Todos los banners guardados: [{ kind, rec, ref }] (obras, personas, parejas, colecciones y perfil). */
function bannerEntries(data) {
    const out = [];
    [['works', 'Obras'], ['persons', 'Personas'], ['couples', 'Parejas'], ['collections', 'Colecciones']].forEach(([kind]) => (data[kind] || []).forEach(rec => { if (rec.banner) out.push({ kind, rec, ref: rec.banner }); }));
    if (data.settings && data.settings.profileBanner) out.push({ kind: 'profile', rec: data.settings, ref: data.settings.profileBanner });
    return out;
}

// ============================================================
// 2. BÚSQUEDA DE IMÁGENES: fuentes y respuestas
// ============================================================
/**
 * Fuentes de imágenes que funcionan desde el navegador (con permiso CORS).
 * Pinterest y Google Imágenes no tienen una API abierta: se abren en otra pestaña y se pega el enlace de la imagen.
 */
const IMAGE_SOURCES = {
    anilist: { label: 'AniList', icon: '🎌', uses: ['banner', 'poster', 'photo', 'moodboard'] },
    tmdb: { label: 'TMDB', icon: '🎬', uses: ['banner', 'poster', 'photo', 'moodboard'], key: 'tmdbKey' },
    wikipedia: { label: 'Wikipedia', icon: '📖', uses: ['banner', 'poster', 'photo', 'moodboard'] },
    commons: { label: 'Wikimedia Commons', icon: '🖼️', uses: ['banner', 'poster', 'photo', 'moodboard'] },
    jikan: { label: 'MyAnimeList', icon: '📺', uses: ['poster', 'photo', 'moodboard'] },
    openlibrary: { label: 'Open Library', icon: '📚', uses: ['poster', 'moodboard'] },
    google: { label: 'Google (con tu clave)', icon: '🔎', uses: ['banner', 'poster', 'photo', 'moodboard'], key: 'googleKey' }
};
const DEFAULT_SOURCE_ORDER = ['anilist', 'tmdb', 'wikipedia', 'commons', 'jikan', 'openlibrary', 'google'];
/** Fuentes activas en el orden elegido (las que necesitan clave solo si la tienes). */
function activeSources(settings = {}, use = 'banner') {
    const order = [...new Set([...(settings.imageSourceOrder || []), ...DEFAULT_SOURCE_ORDER])].filter(k => IMAGE_SOURCES[k]);
    const off = new Set(settings.imageSourcesOff || []);
    return order.filter(k => !off.has(k) && IMAGE_SOURCES[k].uses.includes(use) && (!IMAGE_SOURCES[k].key || (settings[IMAGE_SOURCES[k].key] && (k !== 'google' || settings.googleCx))));
}
const orientationOf = (w, h) => (!w || !h ? '' : w / h > 1.15 ? 'horizontal' : h / w > 1.15 ? 'vertical' : 'square');
function filterOrientation(list, o) { return !o || o === 'all' ? list : list.filter(r => !r.o || r.o === o); }
/** Junta varias listas intercalando (1.º de cada fuente, 2.º de cada fuente…) y sin repetir imágenes. */
function interleave(lists, max = 60) {
    const out = [], seen = new Set();
    for (let i = 0; out.length < max && lists.some(l => l[i]); i++) {
        lists.forEach(l => { const r = l[i]; if (r && !seen.has(r.src) && out.length < max) { seen.add(r.src); out.push(r); } });
    }
    return out;
}
const imgResult = (src, thumb, w, h, title, page, origin) => ({ src, thumb: thumb || src, w: w || 0, h: h || 0, o: orientationOf(w, h), title: title || '', page: page || '', origin });

function imgParseCommons(json) {
    const pages = Object.values((json && json.query && json.query.pages) || {}).sort((a, b) => (a.index || 0) - (b.index || 0));
    return pages.map(p => {
        const ii = (p.imageinfo || [])[0];
        if (!ii || !/^image\/(jpeg|png|webp|gif)/.test(ii.mime || 'image/jpeg')) return null;
        return imgResult(ii.url, ii.thumburl, ii.width, ii.height, String(p.title || '').replace(/^File:|^Archivo:/, '').replace(/\.[a-z]+$/i, ''), ii.descriptionurl, 'commons');
    }).filter(Boolean);
}
function imgParseWikiPages(json, lang = 'es') {
    const pages = Object.values((json && json.query && json.query.pages) || {}).sort((a, b) => (a.index || 0) - (b.index || 0));
    return pages.filter(p => p.original && /\.(jpe?g|png|webp|gif)$/i.test(p.original.source)).map(p => imgResult(p.original.source, p.thumbnail && p.thumbnail.source, p.original.width, p.original.height, p.title, `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(String(p.title).replace(/ /g, '_'))}`, 'wikipedia'));
}
function imgParseAnilist(json, use) {
    const page = (json && json.data && json.data.Page) || {};
    const out = [];
    (page.media || []).forEach(m => {
        const title = (m.title && (m.title.english || m.title.romaji)) || '';
        if (m.bannerImage && use !== 'photo') out.push(imgResult(m.bannerImage, m.bannerImage, 1900, 400, title + ' · banner', m.siteUrl, 'anilist'));
        if (m.coverImage && m.coverImage.extraLarge && use !== 'banner') out.push(imgResult(m.coverImage.extraLarge, m.coverImage.large, 460, 650, title, m.siteUrl, 'anilist'));
    });
    [...(page.staff || []), ...(page.characters || [])].forEach(s => {
        const im = s.image && (s.image.large || s.image.medium);
        if (im && !/default\.jpg$/.test(im)) out.push(imgResult(im, s.image.medium || im, 460, 650, (s.name && (s.name.full || s.name.native)) || '', s.siteUrl, 'anilist'));
    });
    return out;
}
const TMDB_IMG = 'https://image.tmdb.org/t/p/';
function imgParseTmdb(json, use) {
    return ((json && json.results) || []).flatMap(r => {
        const title = r.title || r.name || '';
        const page = `https://www.themoviedb.org/${r.media_type || 'tv'}/${r.id}`;
        const out = [];
        if (r.profile_path) out.push(imgResult(TMDB_IMG + 'h632' + r.profile_path, TMDB_IMG + 'w185' + r.profile_path, 421, 632, title, page, 'tmdb'));
        if (r.backdrop_path && use !== 'photo') out.push(imgResult(TMDB_IMG + 'w1280' + r.backdrop_path, TMDB_IMG + 'w500' + r.backdrop_path, 1280, 720, title + ' · fondo', page, 'tmdb'));
        if (r.poster_path && use !== 'banner') out.push(imgResult(TMDB_IMG + 'w780' + r.poster_path, TMDB_IMG + 'w342' + r.poster_path, 780, 1170, title, page, 'tmdb'));
        return out;
    });
}
function imgParseJikan(json) {
    return ((json && json.data) || []).map(d => {
        const im = d.images && (d.images.webp || d.images.jpg) || {};
        const src = im.large_image_url || im.image_url;
        if (!src || /questionmark/.test(src)) return null;
        return imgResult(src, im.image_url || src, 425, 600, d.title || d.name || '', d.url, 'jikan');
    }).filter(Boolean);
}
function imgParseOpenLibrary(json) {
    return ((json && json.docs) || []).filter(d => d.cover_i).map(d => imgResult(`https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg`, `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg`, 400, 600, d.title, d.key ? 'https://openlibrary.org' + d.key : '', 'openlibrary'));
}
function imgParseGoogle(json) {
    return ((json && json.items) || []).map(i => imgResult(i.link, i.image && i.image.thumbnailLink, i.image && i.image.width, i.image && i.image.height, i.title, i.image && i.image.contextLink, 'google'));
}
/** Búsquedas sugeridas según lo que buscas (una obra, una persona…). */
function suggestQueries({ name = '', kind = 'works', type = '', people = [] } = {}) {
    const n = String(name || '').trim();
    if (!n) return [];
    if (kind === 'persons') return [n, `${n} photoshoot`, `${n} aesthetic`, `${n} portrait`, `${n} outfit`];
    if (kind === 'couples') return [n, `${n} aesthetic`, `${n} moments`, `${n} behind the scenes`, `${n} fanart`];
    if (kind === 'collections') return [n, `${n} aesthetic`, `${n} wallpaper`];
    const base = type === 'book' ? [n, `${n} cover`, `${n} fanart`, `${n} aesthetic`] : [n, `${n} poster`, `${n} wallpaper`, `${n} aesthetic`, `${n} scenes`, `${n} banner`];
    return [...base, ...people.slice(0, 2)];
}
/**
 * Buscadores de toda la web. Google y Pinterest no dejan que otras apps busquen dentro de ellos,
 * así que la búsqueda se abre en otra pestaña con lo escrito ya puesto. main = los dos grandes.
 */
const WEB_ENGINES = [
    { id: 'google', name: 'Google', icon: '🔎', main: true, url: q => `https://www.google.com/search?q=${q}` },
    { id: 'pinterest', name: 'Pinterest', icon: '📌', main: true, url: q => `https://www.pinterest.com/search/pins/?q=${q}` },
    { id: 'googleimg', name: 'Google Imágenes', icon: '🖼️', url: q => `https://www.google.com/search?tbm=isch&q=${q}` },
    { id: 'wikipedia', name: 'Wikipedia', icon: '📖', url: q => `https://es.wikipedia.org/w/index.php?search=${q}` },
    { id: 'youtube', name: 'YouTube', icon: '▶️', url: q => `https://www.youtube.com/results?search_query=${q}` },
    { id: 'mydramalist', name: 'MyDramaList', icon: '🎭', kinds: ['works', 'persons', 'couples'], url: q => `https://mydramalist.com/search?q=${q}` },
    { id: 'bing', name: 'Bing', icon: '🅱️', url: q => `https://www.bing.com/search?q=${q}` }
];
/** Enlaces de búsqueda de un texto en todos los buscadores (los que no valen para ese tipo de cosa se quitan). */
function webSearchLinks(query, kind = 'works') {
    const q = encodeURIComponent(String(query || '').trim());
    if (!q) return [];
    return WEB_ENGINES.filter(e => !e.kinds || e.kinds.includes(kind)).map(e => ({ id: e.id, name: e.name, icon: e.icon, main: !!e.main, url: e.url(q) }));
}
/**
 * Búsquedas que suelen dar buen resultado según qué buscas, para tocarlas en vez de escribirlas:
 * reparto, sinopsis, etiquetas, dónde verla… Cada una es { label, query }.
 */
function webSuggestions({ name = '', kind = 'works', type = '', bl = false } = {}) {
    const n = String(name || '').trim();
    if (!n) return [];
    const s = (label, extra) => ({ label, query: extra ? `${n} ${extra}` : n });
    if (kind === 'persons') return [s('Todo sobre él/ella'), s('Filmografía', 'filmografía'), s('Nombre real', 'nombre real'), s('Dramas y series', 'dramas series'), s('Redes sociales', 'instagram')];
    if (kind === 'couples') return [s('La pareja'), s('Sus dramas juntos', 'dramas juntos'), s('Momentos', 'moments'), s('Fanart', 'fanart'), s('Behind the scenes', 'behind the scenes')];
    if (kind === 'collections') return [s('Ideas parecidas', 'recomendaciones'), s('Estética', 'aesthetic')];
    if (type === 'book') return [s('La obra'), s('Autor/a', 'autor'), s('Sinopsis', 'sinopsis'), s('Reseñas', 'reseña'), s('Saga o continuación', 'saga')];
    if (type === 'manhwa') return [s('La obra', 'manhwa'), s('Dónde leerla', 'dónde leer'), s('Capítulos', 'capítulos'), s('Autor/a', 'autor'), s('Etiquetas y géneros', 'tags géneros')];
    return [s('La obra', bl ? 'BL' : ''), s('Reparto', 'reparto'), s('Sinopsis', 'sinopsis'), s('Etiquetas y géneros', 'tags géneros'), s('Dónde verla', 'dónde ver'), s('Wiki o ficha', 'wiki')];
}
/** Búsquedas en webs sin API abierta (se abren en otra pestaña). */
function webSearchUrls(q) {
    const e = encodeURIComponent(String(q || '').trim());
    return {
        pinterest: `https://www.pinterest.com/search/pins/?q=${e}`,
        google: `https://www.google.com/search?tbm=isch&q=${e}`,
        bing: `https://www.bing.com/images/search?q=${e}`,
        unsplash: `https://unsplash.com/s/photos/${e}`
    };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        centerCrop, imagePlan, rotatedSize, coverScale, clampPan, cropOutputSize, looksLikeImageUrl, imageUrlProblem, bannerMode, bannerEntries, CROP_KINDS, BANNER_RATIOS,
        WEB_ENGINES, webSearchLinks, webSuggestions, IMAGE_SOURCES, DEFAULT_SOURCE_ORDER, activeSources, orientationOf, filterOrientation, interleave,
        imgParseCommons, imgParseWikiPages, imgParseAnilist, imgParseTmdb, imgParseJikan, imgParseOpenLibrary, imgParseGoogle, suggestQueries, webSearchUrls
    };
}
