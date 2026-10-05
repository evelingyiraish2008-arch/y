/*
 * Mi Mundo · importers.js
 * Leer listas de otras apps: CSV (Goodreads, Letterboxd, hojas de cálculo…), XML de MyAnimeList,
 * listas de AniList y JSON. Todo se convierte en obras de Mi Mundo. Funciones puras. Dependen de utils.js.
 */
'use strict';

/** Lee un CSV (separado por comas, punto y coma o tabuladores) con comillas. Devuelve { headers, rows }. */
function parseCSV(text) {
    const src = String(text || '').replace(/^﻿/, '');
    const firstLine = src.split(/\r?\n/, 1)[0] || '';
    const delim = [',', ';', '\t'].map(d => [d, firstLine.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
    const records = [];
    let field = '', row = [], quoted = false;
    for (let i = 0; i < src.length; i++) {
        const ch = src[i];
        if (quoted) {
            if (ch === '"') { if (src[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
            else field += ch;
        } else if (ch === '"') quoted = true;
        else if (ch === delim) { row.push(field); field = ''; }
        else if (ch === '\n' || ch === '\r') {
            if (ch === '\r' && src[i + 1] === '\n') i++;
            row.push(field); field = '';
            if (row.some(c => c.trim() !== '')) records.push(row);
            row = [];
        } else field += ch;
    }
    row.push(field);
    if (row.some(c => c.trim() !== '')) records.push(row);
    const headers = (records.shift() || []).map(h => h.trim());
    const rows = records.map(r => Object.fromEntries(headers.map((h, i) => [h, (r[i] || '').trim()])));
    return { headers, rows };
}

/** Campos de Mi Mundo a los que se puede asignar una columna. */
const IMPORT_FIELDS = {
    title: 'Título', type: 'Tipo', status: 'Estado', rating: 'Valoración', progress: 'Progreso', total: 'Total (págs/eps/caps)',
    author: 'Autor', studio: 'Estudio', platform: 'Plataforma', country: 'País', genre: 'Género', year: 'Año', tags: 'Etiquetas',
    synopsis: 'Sinopsis', startDate: 'Fecha de inicio', endDate: 'Fecha de fin', image: 'Portada (URL)', actors: 'Actores', bl: 'Es BL', favorite: 'Favorito'
};
const HEADER_HINTS = {
    title: ['title', 'titulo', 'título', 'name', 'nombre', 'series_title', 'manga_title', 'film'],
    type: ['type', 'tipo', 'media', 'format', 'formato', 'kind'],
    status: ['status', 'estado', 'exclusive shelf', 'shelf', 'my_status', 'estanteria'],
    rating: ['my rating', 'rating', 'valoracion', 'valoración', 'nota', 'score', 'my_score', 'puntuacion', 'stars'],
    progress: ['progress', 'progreso', 'my_watched_episodes', 'my_read_chapters', 'episodes watched', 'pagina actual'],
    total: ['number of pages', 'pages', 'paginas', 'páginas', 'episodes', 'episodios', 'chapters', 'capitulos', 'capítulos', 'series_episodes', 'total'],
    author: ['author', 'autor', 'autora', 'author l-f', 'writer'],
    studio: ['studio', 'estudio', 'studios'],
    platform: ['platform', 'plataforma', 'network', 'service'],
    country: ['country', 'pais', 'país', 'origin'],
    genre: ['genre', 'genero', 'género', 'genres'],
    year: ['original publication year', 'year published', 'year', 'año', 'ano', 'release year'],
    tags: ['tags', 'etiquetas', 'bookshelves', 'my_tags', 'labels'],
    synopsis: ['synopsis', 'sinopsis', 'description', 'descripcion', 'descripción', 'summary', 'review'],
    startDate: ['date started', 'start date', 'fecha de inicio', 'inicio', 'my_start_date', 'started'],
    endDate: ['date read', 'finish date', 'fecha de fin', 'fin', 'my_finish_date', 'watched date', 'completed', 'date'],
    image: ['image', 'imagen', 'cover', 'portada', 'poster'],
    actors: ['actors', 'actores', 'cast', 'reparto'],
    bl: ['bl', 'es bl'],
    favorite: ['favorite', 'favorito', 'favourite', 'liked']
};
/** Adivina qué columna corresponde a cada campo por su nombre. Devuelve { columna: campo }. */
function guessMapping(headers) {
    const map = {};
    const used = new Set();
    // Primero las coincidencias exactas, después las parciales
    [true, false].forEach(exact => headers.forEach(h => {
        if (map[h]) return;
        const k = norm(h);
        const field = Object.keys(HEADER_HINTS).find(f => !used.has(f) && HEADER_HINTS[f].some(x => (exact ? k === norm(x) : k.includes(norm(x)))));
        if (field) { map[h] = field; used.add(field); }
    }));
    return map;
}
const TYPE_WORDS = {
    book: ['book', 'libro', 'novel', 'novela', 'light novel', 'novel_ln'],
    series: ['series', 'serie', 'tv show', 'show', 'drama', 'dorama', 'movie', 'pelicula', 'película', 'film', 'k-drama', 'tv'],
    anime: ['anime', 'ova', 'ona', 'tv_short', 'special'],
    manhwa: ['manhwa', 'manga', 'webtoon', 'manhua', 'comic', 'one_shot', 'one shot']
};
function normalizeType(value, fallback = 'book') {
    const k = norm(value);
    if (!k) return fallback;
    const hit = Object.keys(TYPE_WORDS).find(t => TYPE_WORDS[t].some(w => k === norm(w)));
    return hit || Object.keys(TYPE_WORDS).find(t => TYPE_WORDS[t].some(w => k.includes(norm(w)))) || fallback;
}
/** Convierte el estado de cualquier app al de Mi Mundo para ese tipo. */
function normalizeStatus(value, type) {
    const k = norm(value).replace(/[_-]/g, ' ');
    const read = type === 'book' || type === 'manhwa';
    if (/^(read|completed?|finished|watched|done|visto|vista)\b|^(terminad|leid)/.test(k)) return 'terminado';
    if (/(currently|watching|reading|leyendo|viendo|current|in progress|en curso|repeating|rewatching)/.test(k)) return read ? 'leyendo' : 'viendo';
    if (/(dropped|abandon|did not finish|dnf)/.test(k)) return 'abandonado';
    return read ? 'quiero leer' : 'quiero ver';
}
/** Valoración en estrellas (0–5, de media en media). Escalas de 10 o 100 se convierten. */
function normalizeRating(value, scale = 0) {
    const n = parseFloat(String(value || '').replace(',', '.'));
    if (!(n > 0)) return 0;
    const s = scale || (n > 10 ? 100 : n > 5 ? 10 : 5);
    return Math.min(5, Math.round((n / s) * 5 * 2) / 2);
}
/** Fecha a AAAA-MM-DD (acepta 2026/08/15, 15/08/2026, 2026-8-5 y "0000-00-00" vacías). */
function normalizeDate(value) {
    const s = String(value || '').trim();
    if (!s || /^0{4}/.test(s)) return '';
    let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    const d = new Date(s);
    return isNaN(d) ? '' : d.toISOString().slice(0, 10);
}
const truthy = v => /^(1|true|si|sí|yes|y|x|✓|❤️?)$/i.test(String(v || '').trim());
const TOTAL_FIELD = { book: 'pages', series: 'totalEpisodes', anime: 'totalEpisodes', manhwa: 'totalChapters' };

/** Filas + asignación de columnas → obras (sin id). */
function rowsToWorks(rows, mapping, { defaultType = 'book' } = {}) {
    const col = field => Object.keys(mapping).find(h => mapping[h] === field);
    const get = (row, field) => { const h = col(field); return h ? row[h] : ''; };
    return rows.map(row => {
        const title = String(get(row, 'title') || '').trim();
        if (!title) return null;
        const type = normalizeType(get(row, 'type'), defaultType);
        const w = { type, title, status: normalizeStatus(get(row, 'status'), type) };
        const rating = normalizeRating(get(row, 'rating'));
        if (rating) w.rating = rating;
        const total = parseInt(get(row, 'total'), 10);
        if (total > 0) w[TOTAL_FIELD[type]] = total;
        const progress = parseInt(get(row, 'progress'), 10);
        if (progress > 0) w.progress = progress;
        else if (w.status === 'terminado' && total > 0) w.progress = total;
        const year = parseInt(get(row, 'year'), 10);
        if (year > 1000) w.year = year;
        ['author', 'studio', 'platform', 'country', 'genre', 'synopsis', 'image', 'actors'].forEach(f => {
            const v = String(get(row, f) || '').trim();
            if (v) w[f] = f === 'author' ? v.replace(/^(.+),\s*(.+)$/, (m, last, first) => (/\s/.test(last) ? m : `${first} ${last}`)) : v;
        });
        const tags = splitList(String(get(row, 'tags') || '').replace(/;/g, ','))
            .filter(t => !['read', 'to-read', 'currently-reading'].includes(t.toLowerCase()));
        if (tags.length) w.tags = tags.join(', ');
        ['startDate', 'endDate'].forEach(f => { const d = normalizeDate(get(row, f)); if (d) w[f] = d; });
        if (w.endDate && w.status !== 'terminado') delete w.endDate;
        if (truthy(get(row, 'bl')) || /\bBL\b/.test(w.tags || '')) w.bl = true;
        if (truthy(get(row, 'favorite'))) w.favorite = true;
        return w;
    }).filter(Boolean);
}

// ---------- MyAnimeList (XML exportado) ----------
function xmlValue(block, tag) {
    const m = block.match(new RegExp(`<${tag}>\\s*(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([\\s\\S]*?))\\s*</${tag}>`));
    if (!m) return '';
    return (m[1] !== undefined ? m[1] : m[2] || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
}
function parseMalXml(text) {
    const out = [];
    const src = String(text || '');
    [['anime', 'anime'], ['manga', 'manhwa']].forEach(([tag, type]) => {
        (src.match(new RegExp(`<${tag}>[\\s\\S]*?</${tag}>`, 'g')) || []).forEach(block => {
            const title = xmlValue(block, tag === 'anime' ? 'series_title' : 'manga_title');
            if (!title) return;
            const malType = xmlValue(block, 'series_type').toLowerCase();
            const realType = type === 'anime' ? (malType === 'movie' ? 'anime' : 'anime') : type;
            const w = { type: realType, title, status: normalizeStatus(xmlValue(block, 'my_status'), realType) };
            const total = parseInt(xmlValue(block, tag === 'anime' ? 'series_episodes' : 'series_chapters') || xmlValue(block, 'manga_chapters'), 10);
            if (total > 0) w[TOTAL_FIELD[realType]] = total;
            const progress = parseInt(xmlValue(block, tag === 'anime' ? 'my_watched_episodes' : 'my_read_chapters'), 10);
            if (progress > 0) w.progress = progress;
            const rating = normalizeRating(xmlValue(block, 'my_score'), 10);
            if (rating) w.rating = rating;
            const start = normalizeDate(xmlValue(block, 'my_start_date')), end = normalizeDate(xmlValue(block, 'my_finish_date'));
            if (start) w.startDate = start;
            if (end && w.status === 'terminado') w.endDate = end;
            const tags = splitList(xmlValue(block, 'my_tags'));
            if (tags.length) w.tags = tags.join(', ');
            const times = parseInt(xmlValue(block, tag === 'anime' ? 'my_times_watched' : 'my_times_read'), 10);
            if (times > 0) w.rereads = Array.from({ length: times }, () => ({ date: end || '', rating: 0 }));
            out.push(w);
        });
    });
    return out;
}

// ---------- AniList (lista pública de un usuario) ----------
const ANILIST_LIST_QUERY = `query ($name: String, $type: MediaType) {
  MediaListCollection(userName: $name, type: $type) {
    lists { entries {
      status progress repeat
      score(format: POINT_10_DECIMAL)
      startedAt { year month day }
      completedAt { year month day }
      media { format countryOfOrigin episodes chapters genres title { romaji english } startDate { year } coverImage { large } }
    } }
  }
}`;
const fuzzyDate = d => (d && d.year ? `${d.year}-${String(d.month || 1).padStart(2, '0')}-${String(d.day || 1).padStart(2, '0')}` : '');
function parseAniListCollection(json, mediaType) {
    const lists = ((((json || {}).data || {}).MediaListCollection) || {}).lists || [];
    const out = [];
    lists.forEach(l => (l.entries || []).forEach(e => {
        const m = e.media || {};
        const type = mediaType === 'ANIME' ? 'anime' : (m.format === 'NOVEL' ? 'book' : 'manhwa');
        const status = { CURRENT: 'activo', REPEATING: 'activo', COMPLETED: 'terminado', DROPPED: 'abandonado', PLANNING: 'plan', PAUSED: 'plan' }[e.status] || 'plan';
        const w = {
            type, title: (m.title || {}).english || (m.title || {}).romaji,
            status: status === 'activo' ? STATUS_BY_TYPE[type][0] : status === 'plan' ? STATUS_BY_TYPE[type][2] : status
        };
        if (!w.title) return;
        const total = type === 'anime' ? m.episodes : type === 'book' ? 0 : m.chapters;
        if (total) w[TOTAL_FIELD[type]] = total;
        if (e.progress) w.progress = e.progress;
        const rating = normalizeRating(e.score, 10);
        if (rating) w.rating = rating;
        if ((m.startDate || {}).year) w.year = m.startDate.year;
        if ((m.coverImage || {}).large) w.image = m.coverImage.large;
        const start = fuzzyDate(e.startedAt), end = fuzzyDate(e.completedAt);
        if (start) w.startDate = start;
        if (end && w.status === 'terminado') w.endDate = end;
        const genres = (m.genres || []).map(g => g.toLowerCase());
        if (genres.length) w.tags = genres.slice(0, 5).join(', ');
        if (m.countryOfOrigin === 'KR') w.country = 'Corea del Sur';
        if (e.repeat > 0) w.rereads = Array.from({ length: e.repeat }, () => ({ date: end || '', rating: 0 }));
        out.push(w);
    }));
    return out;
}

// ---------- JSON ----------
/** Una copia de Mi Mundo o una lista de objetos con "title". */
function parseJsonImport(text) {
    const data = JSON.parse(text);
    const list = Array.isArray(data) ? data : Array.isArray(data.works) ? data.works : [];
    return list.filter(x => x && (x.title || x.name)).map(x => {
        const type = TYPE_META[x.type] ? x.type : normalizeType(x.type || x.kind, 'book');
        const w = { ...x, type, title: String(x.title || x.name) };
        delete w.id; delete w.name;
        if (!STATUS_BY_TYPE[type].includes(w.status)) w.status = normalizeStatus(w.status, type);
        return w;
    });
}

// ---------- Plan de importación ----------
/**
 * Decide qué hacer con cada obra según lo que ya tienes (mismo tipo y título):
 * mode = 'update' (completa la existente), 'skip' (la ignora) o 'duplicate' (la añade igualmente).
 */
function planImport(incoming, existing, mode = 'update') {
    const index = new Map(existing.map(w => [`${w.type}|${norm(w.title)}`, w]));
    const plan = { create: [], update: [], skip: [] };
    incoming.forEach(w => {
        const found = index.get(`${w.type}|${norm(w.title)}`);
        if (!found || mode === 'duplicate') { plan.create.push(w); return; }
        if (mode === 'skip') { plan.skip.push(w); return; }
        const patch = {};
        Object.entries(w).forEach(([k, v]) => {
            if (v === '' || v === undefined || v === null || k === 'type' || k === 'title') return;
            const cur = found[k];
            const curEmpty = cur === undefined || cur === null || cur === '' || cur === 0 || (Array.isArray(cur) && !cur.length);
            // El estado y el progreso se actualizan si lo importado va más avanzado
            if (k === 'progress' && Number(v) > (Number(cur) || 0)) patch[k] = v;
            else if (k === 'status' && found.status !== 'terminado' && v === 'terminado') patch[k] = v;
            else if (curEmpty) patch[k] = v;
        });
        if (Object.keys(patch).length) plan.update.push({ existing: found, patch });
        else plan.skip.push(w);
    });
    return plan;
}
/** Marca cuáles ya existen (para la vista previa). */
function markExisting(incoming, existing) {
    const keys = new Set(existing.map(w => `${w.type}|${norm(w.title)}`));
    return incoming.map(w => keys.has(`${w.type}|${norm(w.title)}`));
}

// ---------- Exportar a CSV ----------
const CSV_COLUMNS = ['title', 'type', 'status', 'rating', 'progress', 'total', 'author', 'studio', 'platform', 'country', 'genre', 'year', 'tags', 'startDate', 'endDate', 'bl', 'favorite'];
function csvCell(v) {
    const s = String(v ?? '');
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function worksToCSV(works) {
    const lines = [CSV_COLUMNS.join(',')];
    works.forEach(w => lines.push(CSV_COLUMNS.map(c => csvCell(
        c === 'total' ? (w[TOTAL_FIELD[w.type]] || '') : c === 'bl' || c === 'favorite' ? (w[c] ? 'sí' : '') : w[c]
    )).join(',')));
    return lines.join('\n');
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        parseCSV, IMPORT_FIELDS, guessMapping, normalizeType, normalizeStatus, normalizeRating, normalizeDate, rowsToWorks,
        parseMalXml, ANILIST_LIST_QUERY, parseAniListCollection, parseJsonImport, planImport, markExisting, worksToCSV, CSV_COLUMNS
    };
}
