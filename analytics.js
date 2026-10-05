/*
 * Mi Mundo · analytics.js
 * Cálculos de las estadísticas avanzadas: comparativas, ritmo y proyecciones, rankings,
 * distribuciones, estadísticas de notas y el resumen del año ("Wrapped").
 * Funciones puras. Dependen de utils.js, insights.js y coherence.js.
 */
'use strict';

const MONTHS_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MONTHS_LONG = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const dateOf = s => new Date(String(s).slice(0, 10) + 'T12:00:00');
const daysBetween = (a, b) => Math.round((dateOf(b) - dateOf(a)) / 86400000);
const finished = works => works.filter(w => w.status === 'terminado' && w.endDate);
const median = arr => {
    if (!arr.length) return 0;
    const s = arr.slice().sort((a, b) => a - b), m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// ---------- Periodos ----------
/** Rango [desde, hasta] (AAAA-MM-DD) de un periodo: '12m', 'year', 'prev', 'all' o un año ('2025'). */
function periodRange(period, now = Date.now()) {
    const d = new Date(now), y = d.getFullYear();
    if (period === 'year') return [`${y}-01-01`, dayKey(now)];
    if (period === 'prev') return [`${y - 1}-01-01`, `${y - 1}-12-31`];
    if (/^\d{4}$/.test(String(period))) return [`${period}-01-01`, `${period}-12-31`];
    if (period === '12m') return [dayKey(addDays(now, -365)), dayKey(now)];
    return ['0000-01-01', '9999-12-31'];
}
/** Obras con algo dentro del periodo: se agregaron, empezaron o terminaron en él. */
function worksInPeriod(works, period, now = Date.now()) {
    if (!period || period === 'all') return works;
    const [from, to] = periodRange(period, now);
    const inside = s => s && s >= from && s <= to;
    return works.filter(w => inside(w.endDate) || inside(w.startDate) || (!w.sample && w.createdAt && inside(dayKey(w.createdAt))));
}

// ---------- Comparativas ----------
function countFinishedBetween(works, from, to) { return finished(works).filter(w => w.endDate >= from && w.endDate <= to).length; }
/** Este mes / mes pasado, este año / el anterior hasta la misma fecha, trimestre actual / anterior. */
function periodComparisons(works, now = Date.now()) {
    const d = new Date(now), y = d.getFullYear(), m = d.getMonth();
    const pad = n => String(n).padStart(2, '0');
    const monthStart = (yy, mm) => { const x = new Date(yy, mm, 1); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-01`; };
    const monthEnd = (yy, mm) => dayKey(new Date(yy, mm + 1, 0));
    const today = dayKey(now), sameDayLastYear = `${y - 1}-${today.slice(5)}`;
    const q = Math.floor(m / 3);
    const qStart = (yy, qq) => monthStart(yy, qq * 3), qEnd = (yy, qq) => monthEnd(yy, qq * 3 + 2);
    const prevQ = q === 0 ? [y - 1, 3] : [y, q - 1];
    return {
        month: { now: countFinishedBetween(works, monthStart(y, m), today), prev: countFinishedBetween(works, monthStart(y, m - 1), monthEnd(y, m - 1)), label: MONTHS_LONG[m], prevLabel: MONTHS_LONG[(m + 11) % 12] },
        year: { now: countFinishedBetween(works, `${y}-01-01`, today), prev: countFinishedBetween(works, `${y - 1}-01-01`, sameDayLastYear), label: String(y), prevLabel: String(y - 1) },
        quarter: { now: countFinishedBetween(works, qStart(y, q), today), prev: countFinishedBetween(works, qStart(...prevQ), qEnd(...prevQ)), label: `T${q + 1}`, prevLabel: `T${prevQ[1] + 1}${prevQ[0] !== y ? ' ' + prevQ[0] : ''}` }
    };
}
/** Terminadas por mes del año [ene..dic] en un año dado. */
function finishedByMonthOfYear(works, year) {
    const out = Array(12).fill(0);
    finished(works).forEach(w => { if (String(w.endDate).startsWith(String(year))) out[Number(w.endDate.slice(5, 7)) - 1]++; });
    return out;
}
/** Estacionalidad: terminadas en cada mes del año, sumando todos los años. */
function seasonality(works) {
    const out = Array(12).fill(0);
    finished(works).forEach(w => { const mm = Number(String(w.endDate).slice(5, 7)); if (mm >= 1 && mm <= 12) out[mm - 1]++; });
    return out;
}

// ---------- Ritmo y proyección ----------
/**
 * Ritmo de una obra en curso: unidades al día desde que empezaste, fecha estimada de fin
 * y si se ha frenado (hace mucho más de lo normal que no avanzas).
 */
function workPace(w, now = Date.now()) {
    const total = getTotal(w), progress = Number(w.progress) || 0;
    if (!w.startDate || !progress) return null;
    const days = Math.max(1, daysBetween(w.startDate, dayKey(now)) + 1);
    const perDay = progress / days;
    const remaining = total ? Math.max(0, total - progress) : 0;
    const eta = total && perDay > 0 ? dayKey(addDays(now, Math.ceil(remaining / perDay))) : '';
    const sessions = Object.keys(w.activity || {}).filter(k => Number(w.activity[k]) > 0).sort();
    let slowing = false, idleDays = 0;
    if (sessions.length) {
        idleDays = daysBetween(sessions[sessions.length - 1], dayKey(now));
        const span = sessions.length > 1 ? daysBetween(sessions[0], sessions[sessions.length - 1]) : 0;
        const avgGap = sessions.length > 1 ? span / (sessions.length - 1) : 7;
        slowing = idleDays >= 7 && idleDays > avgGap * 3;
    }
    return { perDay, perWeek: perDay * 7, remaining, eta, days, idleDays, slowing };
}
/** Ritmos generales: páginas al día (libros) y episodios a la semana (series y anime), de los últimos 12 meses. */
function overallPace(works, now = Date.now()) {
    const from = dayKey(addDays(now, -365));
    // Unidades consumidas en los últimos 12 meses (repartiendo cada obra por los días que duró) ÷ días del periodo
    const rate = list => {
        let units = 0, first = '';
        list.forEach(w => {
            if (!w.startDate || !(Number(w.progress) > 0)) return;
            const end = w.status === 'terminado' && w.endDate ? w.endDate : dayKey(now);
            if (end < from) return;
            const start = w.startDate < from ? from : w.startDate;
            const share = (Math.max(0, daysBetween(start, end)) + 1) / (Math.max(0, daysBetween(w.startDate, end)) + 1);
            units += (Number(w.progress) || 0) * share;
            if (!first || start < first) first = start;
        });
        return first ? units / (Math.max(0, daysBetween(first, dayKey(now))) + 1) : 0;
    };
    const books = works.filter(w => w.type === 'book'), eps = works.filter(w => w.type === 'series' || w.type === 'anime');
    return { pagesPerDay: rate(books), episodesPerWeek: rate(eps) * 7 };
}
/** ¿Cuándo cumplirás el reto a este ritmo? Devuelve la fecha estimada o '' si no hay datos. */
function goalProjection(works, goal, now = Date.now()) {
    const y = new Date(now).getFullYear();
    const done = finishedInYear(works, y);
    if (!goal || !done) return { done, date: '' };
    if (done >= goal) return { done, date: dayKey(now), reached: true };
    const elapsed = Math.max(1, daysBetween(`${y}-01-01`, dayKey(now)) + 1);
    const perDay = done / elapsed;
    return { done, date: dayKey(addDays(now, Math.ceil((goal - done) / perDay))) };
}

// ---------- Rankings ----------
function bestOf(list) {
    return list.filter(w => Number(w.rating) > 0)
        .sort((a, b) => Number(b.rating) - Number(a.rating) || (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0) || String(b.endDate || '').localeCompare(String(a.endDate || '')))[0] || null;
}
/** Valores más frecuentes de un campo con su media de valoración. */
function topWithRating(works, field, limit = 3) {
    const map = new Map();
    works.forEach(w => splitList(w[field]).forEach(v => {
        const k = norm(v);
        const cur = map.get(k) || { label: v, count: 0, sum: 0, rated: 0 };
        cur.count++;
        if (Number(w.rating) > 0) { cur.sum += Number(w.rating); cur.rated++; }
        map.set(k, cur);
    }));
    return [...map.values()].map(x => ({ label: x.label, count: x.count, avg: x.rated ? x.sum / x.rated : 0 }))
        .sort((a, b) => b.count - a.count || b.avg - a.avg).slice(0, limit);
}
function rankings(works) {
    const byType = {};
    Object.keys(TYPE_META).forEach(t => { byType[t] = bestOf(works.filter(w => w.type === t)); });
    const tags = tagStats(works).slice(0, 5).map(t => ({ tag: t.label, best: bestOf(works.filter(w => splitList(w.tags).some(x => tagKey(x) === t.key))) })).filter(x => x.best);
    return {
        byType, bestBl: bestOf(works.filter(w => w.bl)), byTag: tags,
        actors: topWithRating(works, 'actors'), studios: topWithRating(works, 'studio'),
        platforms: topWithRating(works, 'platform'), authors: topWithRating(works, 'author')
    };
}

// ---------- Distribuciones ----------
/** Valoraciones de cada tipo: lista ordenada, mediana, mínima y máxima. */
function ratingSpread(works) {
    return Object.keys(TYPE_META).map(t => {
        const r = works.filter(w => w.type === t && Number(w.rating) > 0).map(w => Number(w.rating)).sort((a, b) => a - b);
        return { type: t, ratings: r, median: median(r), min: r[0] || 0, max: r[r.length - 1] || 0 };
    }).filter(x => x.ratings.length);
}
/** Obras por década de publicación: [{ label: '2010s', count }]. */
function byDecade(works) {
    const map = new Map();
    works.forEach(w => { const y = Number(w.year); if (y > 1000) { const d = Math.floor(y / 10) * 10; map.set(d, (map.get(d) || 0) + 1); } });
    const keys = [...map.keys()].sort((a, b) => a - b);
    if (!keys.length) return [];
    const out = [];
    for (let d = keys[0]; d <= keys[keys.length - 1]; d += 10) out.push({ label: `${d}s`, count: map.get(d) || 0 });
    return out;
}
/** Media de cada criterio en tus reseñas. */
function criteriaAverages(notes) {
    return REVIEW_CRITERIA.map(([k, label]) => {
        const vals = notes.filter(n => noteType(n) === 'resena').map(n => Number((n.scores || {})[k]) || 0).filter(v => v > 0);
        return { key: k, label, avg: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0, count: vals.length };
    }).filter(x => x.count);
}

// ---------- Notas ----------
const STOPWORDS = new Set(('a al algo algun alguna algunas alguno algunos ante antes aqui asi aun bien cada casi como con contra cual cuando de del desde donde dos el ella ellas ellos en entre era es esa esas ese eso esos esta estaba estan estar este esto estos fue fueron ha hace hacia han hasta hay la las le les lo los mas me mi mis mucho muy nada ni no nos nuestra o os otra otro para pero poco por porque que quien se sea ser si sido sin sobre solo son su sus tambien tan te tener tengo ti tiene tienen todo todos tu tus un una uno unos ya yo the and of to is it in that this was for with you').split(' '));
function notesStats(notes, now = Date.now()) {
    const words = notes.map(n => wordCount(n.content));
    const total = words.reduce((a, b) => a + b, 0);
    const longest = notes.reduce((best, n, i) => (!best || words[i] > best.words ? { note: n, words: words[i] } : best), null);
    const perMonth = [];
    const base = new Date(now);
    for (let i = 11; i >= 0; i--) {
        const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        perMonth.push({ label: MONTHS_ES[d.getMonth()], key, count: notes.filter(n => n.createdAt && !n.sample && dayKey(n.createdAt).startsWith(key)).length });
    }
    const counts = new Map();
    notes.forEach(n => (norm(n.content).match(/[a-zñ぀-鿿가-힯]{4,}/g) || []).forEach(wd => { if (!STOPWORDS.has(wd)) counts.set(wd, (counts.get(wd) || 0) + 1); }));
    const topWords = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 10).map(([word, count]) => ({ word, count }));
    // Cuándo escribes: filas = día de la semana (L→D), columnas = franjas de 4 horas
    const hours = Array.from({ length: 7 }, () => Array(6).fill(0));
    notes.forEach(n => { if (!n.createdAt || n.sample) return; const d = new Date(n.createdAt); hours[(d.getDay() + 6) % 7][Math.floor(d.getHours() / 4)]++; });
    return { count: notes.length, totalWords: total, avgWords: notes.length ? total / notes.length : 0, longest, perMonth, topWords, hours };
}

// ---------- Tu año (Wrapped) ----------
function wrappedSummary(data, year, now = Date.now()) {
    const works = data.works;
    const done = finished(works).filter(w => String(w.endDate).startsWith(String(year)));
    const byType = Object.fromEntries(Object.keys(TYPE_META).map(t => [t, done.filter(w => w.type === t).length]));
    const topType = Object.entries(byType).sort((a, b) => b[1] - a[1])[0];
    const months = finishedByMonthOfYear(works, year);
    const bestMonth = months.indexOf(Math.max(...months));
    const yearActivity = new Map([...activityByDay(works)].filter(([k]) => k.startsWith(String(year))));
    const st = streaks(yearActivity, now);
    const hours = done.reduce((a, w) => a + estimateMinutes(w) / 60, 0);
    const notes = data.notes.filter(n => n.createdAt && !n.sample && dayKey(n.createdAt).startsWith(String(year)));
    const rereads = works.reduce((a, w) => a + (w.rereads || []).filter(r => String(r.date).startsWith(String(year))).length, 0);
    const sorted = done.slice().sort((a, b) => String(a.endDate).localeCompare(String(b.endDate)));
    return {
        year, total: done.length, byType, topType: topType && topType[1] ? topType[0] : '',
        hours: Math.round(hours), best: bestOf(done), topTag: (tagStats(done)[0] || {}).label || '',
        topPerson: (topWithRating(done, 'actors', 1)[0] || topWithRating(done, 'author', 1)[0] || {}).label || '',
        bestMonth: Math.max(...months) ? MONTHS_LONG[bestMonth] : '', bestMonthCount: Math.max(...months),
        bestStreak: st.best, notes: notes.length, words: notes.reduce((a, n) => a + wordCount(n.content), 0), rereads,
        first: sorted[0] || null, last: sorted[sorted.length - 1] || null, bl: done.filter(w => w.bl).length,
        favorites: done.filter(w => w.favorite).length
    };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        MONTHS_ES, periodRange, worksInPeriod, periodComparisons, finishedByMonthOfYear, seasonality, workPace, overallPace,
        goalProjection, rankings, topWithRating, ratingSpread, byDecade, criteriaAverages, notesStats, wrappedSummary, median
    };
}
