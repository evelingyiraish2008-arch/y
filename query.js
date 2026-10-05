/*
 * Mi Mundo · query.js
 * Búsqueda avanzada con una sintaxis sencilla, obras parecidas y filtros por fechas. Funciones puras.
 *
 * Ejemplos:
 *   BL nota:5                     → obras BL con 5 estrellas
 *   estado:pendiente año:>2020    → pendientes de después de 2020
 *   tag:fantasía tag:romance      → con las dos etiquetas
 *   autor:"Mo Xiang"              → comillas para frases
 *   spicy:>=3 -tag:drama          → el guion niega
 *   tipo:anime o tipo:manhwa      → "o" (u "OR") une alternativas
 * Depende de utils.js.
 */
'use strict';

const QUERY_FIELDS = {
    tipo: 'type', type: 'type',
    estado: 'status', status: 'status',
    nota: 'rating', rating: 'rating', valoracion: 'rating', estrellas: 'rating',
    ano: 'year', year: 'year',
    tag: 'tags', etiqueta: 'tags', tags: 'tags', etiquetas: 'tags',
    autor: 'author', autora: 'author', author: 'author',
    actor: 'actors', actriz: 'actors', actores: 'actors', reparto: 'actors',
    director: 'directors', directora: 'directors',
    estudio: 'studio', studio: 'studio',
    plataforma: 'platform', platform: 'platform',
    pais: 'country', country: 'country',
    genero: 'genre', genre: 'genre',
    spicy: 'spicy', picante: 'spicy',
    tristeza: 'sadness', sad: 'sadness',
    progreso: 'progress', progress: 'progress',
    bl: 'bl', fav: 'favorite', favorito: 'favorite', favorita: 'favorite',
    inicio: 'startDate', empezada: 'startDate', fin: 'endDate', terminada: 'endDate', agregada: 'createdAt',
    titulo: 'title', title: 'title', nombre: 'title'
};
const TYPE_WORDS_Q = { libro: 'book', libros: 'book', book: 'book', serie: 'series', series: 'series', pelicula: 'series', anime: 'anime', manhwa: 'manhwa', manga: 'manhwa', webtoon: 'manhwa' };
const STATUS_WORDS_Q = {
    pendiente: ['quiero leer', 'quiero ver'], pendientes: ['quiero leer', 'quiero ver'], plan: ['quiero leer', 'quiero ver'],
    activo: ['leyendo', 'viendo'], encurso: ['leyendo', 'viendo'], leyendo: ['leyendo'], viendo: ['viendo'],
    terminado: ['terminado'], terminada: ['terminado'], terminadas: ['terminado'], visto: ['terminado'], leido: ['terminado'],
    abandonado: ['abandonado'], abandonada: ['abandonado']
};
const YES = ['si', 'sí', 'yes', 'true', '1'];

/** Separa la búsqueda en palabras, respetando "frases entre comillas". */
function tokenize(str) {
    const out = [];
    const re = /(-?)(?:([\p{L}_]+)(:(?:>=|<=|>|<|=)?))?(?:"([^"]*)"|(\S+))/gu;
    let m;
    while ((m = re.exec(String(str || '')))) {
        const value = m[4] !== undefined ? m[4] : m[5];
        out.push({ neg: m[1] === '-', key: m[2] ? norm(m[2]) : '', op: m[3] ? (m[3].slice(1) || ':') : '', value, quoted: m[4] !== undefined });
    }
    return out;
}
/** ¿La búsqueda usa la sintaxis avanzada? (campo:valor, negaciones o palabras clave como BL) */
function isAdvancedQuery(str) {
    return tokenize(str).some(t => (t.key && QUERY_FIELDS[t.key]) || (t.neg && t.value.length > 1) || /^(bl|fav)$/i.test(t.value) || /^(o|or)$/i.test(t.value));
}
/** Convierte la búsqueda en grupos alternativos ("o") de condiciones que deben cumplirse todas. */
function parseQuery(str) {
    const groups = [[]];
    tokenize(str).forEach(t => {
        if (!t.key && !t.quoted && /^(o|or)$/i.test(t.value)) { groups.push([]); return; }
        const g = groups[groups.length - 1];
        if (t.key && QUERY_FIELDS[t.key]) g.push({ field: QUERY_FIELDS[t.key], op: t.op, value: t.value, neg: t.neg });
        else if (!t.key && !t.quoted && /^bl$/i.test(t.value)) g.push({ field: 'bl', op: ':', value: 'si', neg: t.neg });
        else if (!t.key && !t.quoted && /^(fav|favoritos?|favoritas?)$/i.test(t.value)) g.push({ field: 'favorite', op: ':', value: 'si', neg: t.neg });
        else g.push({ field: 'text', op: ':', value: t.key ? `${t.key}${t.op === ':' ? ':' : ':' + t.op}${t.value}` : t.value, neg: t.neg });
    });
    return groups.filter(g => g.length);
}
function compareNum(actual, op, wanted) {
    const a = Number(actual) || 0, b = Number(String(wanted).replace(',', '.'));
    if (isNaN(b)) return false;
    if (op === '>') return a > b;
    if (op === '>=') return a >= b;
    if (op === '<') return a < b;
    if (op === '<=') return a <= b;
    return a === b;
}
/** Compara fechas por prefijo: fin:2026 · fin:>=2026-03 · inicio:<2025-06-01 */
function compareDate(actual, op, wanted) {
    if (!actual) return false;
    const a = String(actual).slice(0, 10), b = String(wanted);
    const cut = a.slice(0, b.length);
    if (op === '>') return cut > b;
    if (op === '>=') return cut >= b;
    if (op === '<') return cut < b;
    if (op === '<=') return cut <= b;
    return cut === b;
}
const textOf = w => norm([w.title, w.author, w.studio, w.platform, w.actors, w.directors, w.tags, w.genre, w.country, w.synopsis].join(' '));
function matchCondition(w, c) {
    const v = norm(c.value);
    let ok;
    switch (c.field) {
        case 'text': ok = textOf(w).includes(v); break;
        case 'type': ok = w.type === (TYPE_WORDS_Q[v] || v) || (v === 'pelicula' && w.seriesType === 'Película'); break;
        case 'status': ok = (STATUS_WORDS_Q[v.replace(/\s/g, '')] || [v]).includes(w.status); break;
        case 'rating': case 'year': case 'spicy': case 'sadness': ok = compareNum(w[c.field], c.op, c.value); break;
        case 'progress': ok = compareNum(getProgress(w), c.op, c.value.replace('%', '')); break;
        case 'bl': case 'favorite': ok = !!w[c.field] === YES.includes(v); break;
        case 'startDate': case 'endDate': ok = compareDate(w[c.field], c.op, c.value); break;
        case 'createdAt': ok = !w.sample && w.createdAt ? compareDate(new Date(w.createdAt).toISOString(), c.op, c.value) : false; break;
        case 'tags': ok = splitList(w.tags).some(t => norm(t) === v || (!c.quoted && norm(t).includes(v))); break;
        default: ok = norm(w[c.field]).includes(v);
    }
    return c.neg ? !ok : ok;
}
function matchQuery(w, parsed) {
    return !parsed.length || parsed.some(group => group.every(c => matchCondition(w, c)));
}
function searchWorks(works, str) {
    const parsed = parseQuery(str);
    return works.filter(w => matchQuery(w, parsed));
}
/** Descripción en palabras de una búsqueda (para el asistente). */
function describeQuery(str) {
    const names = { type: 'tipo', status: 'estado', rating: 'valoración', year: 'año', tags: 'etiqueta', author: 'autor', actors: 'actor', directors: 'director', studio: 'estudio', platform: 'plataforma', country: 'país', genre: 'género', spicy: 'spicy', sadness: 'tristeza', progress: 'progreso', startDate: 'inicio', endDate: 'fin', createdAt: 'agregada', title: 'título' };
    const opText = { ':': 'es', '=': 'es', '>': 'mayor que', '>=': 'de al menos', '<': 'menor que', '<=': 'de como mucho' };
    return parseQuery(str).map(g => g.map(c => {
        let s;
        if (c.field === 'text') s = `contiene “${c.value}”`;
        else if (c.field === 'bl') s = YES.includes(norm(c.value)) ? 'es BL' : 'no es BL';
        else if (c.field === 'favorite') s = 'es favorita';
        else s = `${names[c.field] || c.field} ${opText[c.op] || 'es'} ${c.value}`;
        return (c.neg ? 'NO ' : '') + s;
    }).join(' y ')).join(' — o — ');
}

// ---------- Obras parecidas ----------
/** Parecido entre dos obras (0–1) y los motivos. */
function workSimilarity(a, b) {
    let score = 0;
    const why = [];
    const ta = new Set(splitList(a.tags).map(norm)), tb = splitList(b.tags).map(norm);
    const shared = tb.filter(t => ta.has(t));
    if (shared.length) { score += Math.min(3, shared.length) * 0.15; why.push(`etiquetas: ${shared.slice(0, 3).join(', ')}`); }
    ['author', 'studio', 'actors', 'directors'].forEach(f => {
        const pa = new Set(splitList(a[f]).map(norm));
        const common = splitList(b[f]).filter(x => pa.has(norm(x)));
        if (common.length) { score += 0.25; why.push(common[0]); }
    });
    if (a.type === b.type) score += 0.05;
    if (a.bl && b.bl) { score += 0.1; why.push('BL'); }
    if (a.country && norm(a.country) === norm(b.country)) score += 0.05;
    if (Number(a.spicy) && Math.abs(Number(a.spicy) - Number(b.spicy || 0)) <= 1 && Number(a.sadness) && Math.abs(Number(a.sadness) - Number(b.sadness || 0)) <= 1) { score += 0.1; why.push('mismas emociones'); }
    return { score: Math.min(1, score), why };
}
function similarWorks(work, works, limit = 12) {
    return works.filter(o => o.id !== work.id).map(o => ({ work: o, ...workSimilarity(work, o) }))
        .filter(x => x.score >= 0.15).sort((x, y) => y.score - x.score).slice(0, limit);
}

// ---------- Filtro por fechas ----------
const DATE_FILTERS = { any: 'Fechas: cualquiera', m: 'Este mes', '3m': 'Últimos 3 meses', y: 'Este año', py: 'Año pasado' };
/** Obras con alguna fecha (agregada, empezada o terminada) dentro del rango elegido. */
function filterByDate(works, key, now = Date.now()) {
    if (!key || key === 'any') return works;
    const d = new Date(now);
    const pad = n => String(n).padStart(2, '0');
    const today = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    let from, to = today;
    if (key === 'm') from = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;
    else if (key === '3m') { const x = new Date(d.getFullYear(), d.getMonth() - 2, 1); from = `${x.getFullYear()}-${pad(x.getMonth() + 1)}-01`; }
    else if (key === 'y') from = `${d.getFullYear()}-01-01`;
    else if (key === 'py') { from = `${d.getFullYear() - 1}-01-01`; to = `${d.getFullYear() - 1}-12-31`; }
    else return works;
    const inside = s => s && s >= from && s <= to;
    const created = w => (!w.sample && w.createdAt ? new Date(w.createdAt).toISOString().slice(0, 10) : '');
    return works.filter(w => inside(w.endDate) || inside(w.startDate) || inside(created(w)));
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { tokenize, isAdvancedQuery, parseQuery, matchQuery, searchWorks, describeQuery, workSimilarity, similarWorks, filterByDate, DATE_FILTERS };
}
