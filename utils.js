/*
 * Mi Mundo · utils.js
 * Constantes y funciones puras (sin DOM ni estado global).
 * Se cargan antes que app.js en el navegador y se exportan para los tests en Node.
 */
'use strict';
// ============================================================
// 1. CONSTANTES
// ============================================================
/** Idioma y formato regional de fechas y números (lo cambia i18n.js). */
let APP_LOCALE = 'es-ES';
function setAppLocale(loc) { APP_LOCALE = loc; }
const DEFAULT_SETTINGS = { themeColor: '#8b5cf6', fontSize: 14, imageFit: 'contain', darkMode: true, userName: 'Sara', yearGoal: 0 };
const TYPE_META = {
    book:   { label: 'Libro',  icon: '📚', color: '#8b5cf6', progressLabel: 'Página actual',   unit: 'págs', step: 10 },
    series: { label: 'Serie',  icon: '🎬', color: '#ec4899', progressLabel: 'Episodio actual', unit: 'ep',   step: 1 },
    anime:  { label: 'Anime',  icon: '🎌', color: '#d97706', progressLabel: 'Episodio actual', unit: 'ep',   step: 1 },
    manhwa: { label: 'Manhwa', icon: '📕', color: '#3b82f6', progressLabel: 'Capítulo actual', unit: 'cap',  step: 1 }
};
const READ_STATUSES = ['leyendo', 'terminado', 'quiero leer', 'abandonado'];
const WATCH_STATUSES = ['viendo', 'terminado', 'quiero ver', 'abandonado'];
const STATUS_BY_TYPE = { book: READ_STATUSES, manhwa: READ_STATUSES, series: WATCH_STATUSES, anime: WATCH_STATUSES };
const STATUS_LABEL = { 'leyendo': 'Leyendo', 'viendo': 'Viendo', 'terminado': 'Terminado', 'quiero leer': 'Quiero leer', 'quiero ver': 'Quiero ver', 'abandonado': 'Abandonado' };
const PERSON_TYPE_LABEL = { actor: 'Actor / Actriz', author: 'Autor / Autora', director: 'Director / Directora' };
const WEEK = [
    { day: 1, short: 'Lun' }, { day: 2, short: 'Mar' }, { day: 3, short: 'Mié' }, { day: 4, short: 'Jue' },
    { day: 5, short: 'Vie' }, { day: 6, short: 'Sáb' }, { day: 0, short: 'Dom' }
];
const IMAGE_SIZES = { poster: [480, 720, 0.8], gallery: [1200, 1200, 0.8], avatar: [360, 360, 0.82], banner: [1200, 480, 0.75], couple: [800, 500, 0.78] };

// ============================================================
// 2. UTILIDADES
// ============================================================
function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function generateId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function norm(s) { return String(s || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
function splitList(str) { return String(str || '').split(',').map(t => t.trim()).filter(Boolean); }
function formatBytes(n) {
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(0) + ' KB';
    if (n < 1073741824) return (n / 1048576).toFixed(1) + ' MB';
    return (n / 1073741824).toFixed(1) + ' GB';
}
function fmtDate(d) {
    if (!d) return '–';
    const date = typeof d === 'number' ? new Date(d) : new Date(d + (String(d).length === 10 ? 'T00:00:00' : ''));
    return isNaN(date) ? '–' : date.toLocaleDateString(APP_LOCALE, { day: 'numeric', month: 'short', year: 'numeric' });
}
function todayISO() { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); }

function makePlaceholder(emoji, color, w = 300, h = 450) {
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='${color}' stop-opacity='.45'/><stop offset='1' stop-color='#12121d' stop-opacity='0'/></linearGradient></defs><rect width='100%' height='100%' fill='#191928'/><rect width='100%' height='100%' fill='url(#g)'/><text x='50%' y='52%' font-size='${Math.round(Math.min(w, h) / 4)}' text-anchor='middle' dominant-baseline='middle'>${emoji}</text></svg>`;
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}
const PH = {
    book: makePlaceholder('📚', '#8b5cf6'), series: makePlaceholder('🎬', '#ec4899'),
    anime: makePlaceholder('🎌', '#f59e0b'), manhwa: makePlaceholder('📕', '#3b82f6'),
    person: makePlaceholder('👤', '#8b5cf6', 300, 300), couple: makePlaceholder('💕', '#ec4899', 400, 250),
    banner: makePlaceholder('✨', '#8b5cf6', 1000, 400)
};
/** Convierte una referencia guardada (p. ej. "idb:…") en una URL que se puede mostrar. La define app.js. */
let resolveImageSrc = src => src || '';
function setImageResolver(fn) { resolveImageSrc = fn; }
function imageSrc(src, ph) { return resolveImageSrc(src) || PH[ph] || ''; }
function img(src, ph, alt = '', extra = '') {
    return `<img src="${esc(imageSrc(src, ph))}" alt="${esc(alt)}" loading="lazy" data-ph="${ph}" ${extra}>`;
}
function cssUrl(src) { return `url("${String(src).replace(/["\\\n]/g, encodeURIComponent)}")`; }

function getStars(rating) {
    const r = Number(rating) || 0;
    if (!r) return '☆☆☆☆☆';
    const full = Math.min(5, Math.round(r));
    return '★'.repeat(full) + '☆'.repeat(5 - full);
}
function ratingText(r) { return r ? (Math.round(r * 10) / 10).toString() : '–'; }


// ============================================================
// 3. MODELO DE DATOS
// ============================================================
function emptyData() {
    return {
        works: [], persons: [], couples: [], collections: [], notes: [], settings: { ...DEFAULT_SETTINGS },
        trash: { works: [], persons: [], couples: [], collections: [], notes: [] }
    };
}
function normalizeData(d) {
    const out = emptyData();
    if (!d || typeof d !== 'object') return out;
    // Lo que está en la papelera (trashedAt) se separa: puede venir mezclado (IndexedDB, nube) o ya en d.trash
    ['works', 'persons', 'couples', 'collections', 'notes'].forEach(k => {
        const all = [...(Array.isArray(d[k]) ? d[k] : []), ...(d.trash && Array.isArray(d.trash[k]) ? d.trash[k] : [])]
            .filter(x => x && x.id && (k !== 'works' || TYPE_META[x.type]));
        out[k] = all.filter(x => !x.trashedAt);
        out.trash[k] = all.filter(x => x.trashedAt);
    });
    out.settings = { ...DEFAULT_SETTINGS, ...(d.settings || {}) };
    [...out.collections, ...out.trash.collections].forEach(c => { if (!Array.isArray(c.items)) c.items = []; });
    // Sincroniza notas antiguas guardadas solo en la obra
    out.works.forEach(w => {
        if (w.note && !out.notes.some(n => n.workId === w.id)) {
            out.notes.push({ id: generateId(), workId: w.id, workTitle: w.title, content: w.note, createdAt: w.updatedAt || w.createdAt || Date.now() });
        }
    });
    return out;
}

// ============================================================
// 4. CONSULTAS PURAS
// ============================================================
const getTypeLabel = type => (TYPE_META[type] || {}).label || type;
const getStatusLabel = s => STATUS_LABEL[s] || s || '–';
const isActive = w => w.status === 'leyendo' || w.status === 'viendo';
const isPlanned = w => w.status === 'quiero leer' || w.status === 'quiero ver';
function statusClass(s) {
    if (s === 'leyendo' || s === 'viendo') return 'st-active';
    if (s === 'terminado') return 'st-done';
    if (s === 'abandonado') return 'st-drop';
    return 'st-plan';
}
function getTotal(w) {
    if (w.type === 'book') return Number(w.pages) || 0;
    if (w.type === 'manhwa') return Number(w.totalChapters) || 0;
    return Number(w.totalEpisodes) || 0;
}
function getProgress(w) {
    const total = getTotal(w);
    if (!total) return w.status === 'terminado' ? 100 : 0;
    return Math.min(100, Math.round(((Number(w.progress) || 0) / total) * 100));
}
function getProgressText(w) {
    const p = Number(w.progress) || 0, t = getTotal(w);
    if (w.type === 'book') return `${p}${t ? ' / ' + t : ''} págs`;
    if (w.type === 'manhwa') return `Cap ${p}${t ? ' / ' + t : ''}`;
    if (w.seriesType === 'Película') return w.status === 'terminado' ? 'Vista' : 'Película';
    return `Ep ${p}${t ? ' / ' + t : ''}`;
}
function getSubtitle(w) {
    const parts = {
        book: [w.author, w.year],
        series: [w.seriesType !== 'Serie' ? w.seriesType : '', w.platform, w.country, w.year],
        anime: [w.studio, w.seasons > 1 ? w.seasons + ' temp.' : '', w.year],
        manhwa: [w.author, w.platform, w.year]
    }[w.type] || [];
    return parts.filter(Boolean).join(' · ') || getTypeLabel(w.type);
}
function estimateMinutes(w) {
    const p = Number(w.progress) || 0;
    if (w.type === 'book') return p * 1.2;
    if (w.type === 'manhwa') return p * 4;
    if (w.type === 'anime') return p * 23;
    if (w.seriesType === 'Película') return (w.status === 'terminado' || p > 0) ? 120 : 0;
    return p * 50;
}
function getAirDay(w) {
    if (w.airDay !== undefined && w.airDay !== null && w.airDay !== '') return Number(w.airDay);
    return null;
}


// ============================================================
// 5. FILTROS Y ORDEN
// ============================================================
/** Etiquetas más usadas: [[etiqueta, veces]]. Sin distinguir mayúsculas; se muestra como se escribió la primera vez. */
function tagCounts(works) {
    const counts = new Map();
    works.forEach(w => splitList(w.tags).forEach(t => {
        const k = t.toLowerCase();
        const cur = counts.get(k) || [t, 0];
        cur[1]++;
        counts.set(k, cur);
    }));
    return [...counts.values()].sort((a, b) => b[1] - a[1]);
}

function filterWorks(list, f) {
    // Búsqueda avanzada (query.js): "BL nota:5", "estado:pendiente año:>2020"…
    const advanced = f.search && typeof isAdvancedQuery === 'function' && isAdvancedQuery(f.search) ? parseQuery(f.search) : null;
    const q = advanced ? '' : norm(f.search);
    return list.filter(w => {
        if (advanced && !matchQuery(w, advanced)) return false;
        if (q) {
            const hay = norm([w.title, w.author, w.studio, w.platform, w.actors, w.directors, w.tags, w.genre].join(' '));
            if (!hay.includes(q)) return false;
        }
        if (f.status && f.status !== 'all') {
            if (f.status === 'active' && !isActive(w)) return false;
            else if (f.status === 'plan' && !isPlanned(w)) return false;
            else if (!['active', 'plan'].includes(f.status) && w.status !== f.status) return false;
        }
        if (f.bl && !w.bl) return false;
        if (f.fav && !w.favorite) return false;
        if (f.spicy && f.spicy !== 'all' && Number(w.spicy) !== Number(f.spicy)) return false;
        if (f.sadness && f.sadness !== 'all' && Number(w.sadness) !== Number(f.sadness)) return false;
        if (f.type && f.type !== 'all' && w.type !== f.type) return false;
        if (f.minRating && (Number(w.rating) || 0) < f.minRating) return false;
        return true;
    });
}
function sortWorks(list, key) {
    const by = {
        rating: (a, b) => (b.rating || 0) - (a.rating || 0),
        pages: (a, b) => (b.pages || 0) - (a.pages || 0),
        episodes: (a, b) => (b.totalEpisodes || 0) - (a.totalEpisodes || 0),
        chapters: (a, b) => (b.totalChapters || 0) - (a.totalChapters || 0),
        year: (a, b) => (b.year || 0) - (a.year || 0),
        title: (a, b) => a.title.localeCompare(b.title, 'es'),
        progress: (a, b) => getProgress(b) - getProgress(a),
        spicy: (a, b) => (b.spicy || 0) - (a.spicy || 0),
        recent: (a, b) => (b.createdAt || 0) - (a.createdAt || 0)
    }[key] || ((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    return list.slice().sort(by);
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        APP_LOCALE,
        setAppLocale,
        DEFAULT_SETTINGS,
        TYPE_META,
        READ_STATUSES,
        WATCH_STATUSES,
        STATUS_BY_TYPE,
        STATUS_LABEL,
        PERSON_TYPE_LABEL,
        WEEK,
        IMAGE_SIZES,
        esc,
        generateId,
        norm,
        splitList,
        formatBytes,
        fmtDate,
        todayISO,
        makePlaceholder,
        PH,
        img,
        imageSrc,
        setImageResolver,
        cssUrl,
        getStars,
        ratingText,
        emptyData,
        normalizeData,
        getTypeLabel,
        getStatusLabel,
        isActive,
        isPlanned,
        statusClass,
        getTotal,
        getProgress,
        getProgressText,
        getSubtitle,
        estimateMinutes,
        getAirDay,
        tagCounts,
        filterWorks,
        sortWorks,
    };
}
