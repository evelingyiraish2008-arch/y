/*
 * Mi Mundo · queuekit.js
 * "Qué ver": tu cola de pendientes (ordenable), "Sorpréndeme" según tu ánimo, Maratón ("tengo 3 horas"),
 * recomendaciones entre tus propias obras y el calendario del mes con los próximos episodios.
 * Funciones puras (sin DOM): dependen de utils.js (isPlanned, isActive, isRewatchWish, isDone, getTotal, splitList, norm)
 * y de query.js (similarWorks). Se prueban con tests unitarios.
 */
'use strict';

// ============================================================
// COLA DE PENDIENTES
// ============================================================
/** Lo que está esperando: pendientes y "para rever/releer". Primero lo que ordenaste a mano, luego lo más reciente. */
function queueItems(works) {
    return works
        .filter(w => !w.trashedAt && (isPlanned(w) || isRewatchWish(w)))
        .sort((a, b) => {
            const pa = Number.isFinite(Number(a.queuePos)) && a.queuePos !== undefined ? Number(a.queuePos) : Infinity;
            const pb = Number.isFinite(Number(b.queuePos)) && b.queuePos !== undefined ? Number(b.queuePos) : Infinity;
            return pa - pb || (b.createdAt || 0) - (a.createdAt || 0);
        });
}
/** Nuevo orden (lista de ids) tras mover una obra: 'up', 'down', 'top' o 'bottom'. */
function moveInQueue(items, id, where) {
    const ids = items.map(w => w.id);
    const i = ids.indexOf(id);
    if (i < 0) return ids;
    ids.splice(i, 1);
    const to = { up: Math.max(0, i - 1), down: Math.min(ids.length, i + 1), top: 0, bottom: ids.length }[where];
    ids.splice(to === undefined ? i : to, 0, id);
    return ids;
}

// ============================================================
// TIEMPO
// ============================================================
/** Minutos por unidad (episodio, capítulo o página). Con la duración real si la conocemos. */
function unitMinutes(w) {
    const run = Number(w.runtime) > 0 ? Number(w.runtime) : 0;
    if (w.type === 'book') return 1.2;
    if (w.type === 'manhwa') return 4;
    if (w.type === 'anime') return run || 23;
    return run || 50;
}
const isMovie = w => w.type === 'series' && w.seriesType === 'Película';
/** Lo que falta por ver/leer: unidades y minutos (null si no se sabe el total). Lo "para rever" cuenta entero. */
function remaining(w) {
    if (isMovie(w)) {
        const done = isDone(w) && !isRewatchWish(w);
        return done ? { units: 0, minutes: 0 } : { units: 1, minutes: Number(w.runtime) > 0 ? Number(w.runtime) : 120 };
    }
    const total = getTotal(w);
    if (!total) return null;
    const units = isRewatchWish(w) ? total : Math.max(0, total - (Number(w.progress) || 0));
    return { units, minutes: Math.round(units * unitMinutes(w)) };
}
/** 95 → "1 h 35 min"; 40 → "40 min"; 120 → "2 h". */
function fmtMinutes(min) {
    const m = Math.round(Number(min) || 0);
    if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60), r = m % 60;
    return r ? `${h} h ${r} min` : `${h} h`;
}

// ============================================================
// SORPRÉNDEME
// ============================================================
const WATCH_MOODS = {
    cualquiera: { label: 'Lo que sea', icon: '🎲' },
    ligero: { label: 'Algo ligero', icon: '🌤️' },
    llorar: { label: 'Para llorar', icon: '😭' },
    picante: { label: 'Picante', icon: '🌶️' },
    corto: { label: 'Corto (menos de 3 h)', icon: '⏱️' }
};
const tagHas = (w, words) => { const t = splitList(w.tags).map(norm); return words.some(x => t.some(y => y.includes(x))); };
/** ¿Encaja la obra con ese ánimo? Usa tus marcas de spicy y tristeza y las etiquetas. */
function fitsMood(w, mood) {
    const sad = Number(w.sadness) || 0, spicy = Number(w.spicy) || 0;
    if (mood === 'ligero') return sad <= 2 && !tagHas(w, ['tragedia', 'angustia', 'para llorar']) || tagHas(w, ['ligero', 'comedia', 'dulzura', 'tierno', 'comedia romantica']) && sad <= 3;
    if (mood === 'llorar') return sad >= 4 || tagHas(w, ['para llorar', 'tragedia', 'angustia']);
    if (mood === 'picante') return spicy >= 3 || tagHas(w, ['sensual', 'erotico']);
    if (mood === 'corto') { const r = remaining(w); return !!r && r.minutes > 0 && r.minutes <= 180; }
    return true;
}
/** Una obra de tu cola al azar que encaje (tipo, BL y ánimo). `rng` se puede cambiar para probar. `skip` evita repetir la anterior. */
function pickSurprise(works, { mood = 'cualquiera', type = 'all', bl = false, skip = '', rng = Math.random } = {}) {
    let pool = queueItems(works).filter(w => (type === 'all' || w.type === type) && (!bl || w.bl) && fitsMood(w, mood));
    if (pool.length > 1 && skip) pool = pool.filter(w => w.id !== skip);
    if (!pool.length) return null;
    return pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
}

// ============================================================
// MARATÓN
// ============================================================
/**
 * Qué cabe en el tiempo que tienes. episodes: lo que ya estás viendo (cuántos capítulos/páginas caben).
 * whole: lo pendiente que cabe entero (en el orden de tu cola).
 */
function marathonPlan(works, minutes) {
    const out = { episodes: [], whole: [], minutes };
    works.filter(w => !w.trashedAt && isActive(w)).forEach(w => {
        const r = remaining(w), unit = unitMinutes(w);
        if (!r || !r.units) return;
        const n = Math.min(r.units, Math.floor(minutes / unit));
        if (n >= 1) out.episodes.push({ work: w, count: n, minutes: Math.round(n * unit), finishes: n >= r.units });
    });
    out.episodes.sort((a, b) => Number(b.finishes) - Number(a.finishes) || b.minutes - a.minutes);
    queueItems(works).forEach(w => {
        const r = remaining(w);
        if (r && r.minutes > 0 && r.minutes <= minutes) out.whole.push({ work: w, minutes: r.minutes });
    });
    return out;
}

// ============================================================
// PARECIDAS A LO QUE TE GUSTÓ
// ============================================================
/** De tu cola, lo que más se parece a lo que valoraste con 4 o más: [{ work, score, because: [títulos] }]. */
function recommendFromLiked(works, { limit = 6, similar = similarWorks } = {}) {
    const liked = works.filter(w => !w.trashedAt && isDone(w) && Number(w.rating) >= 4);
    const queue = queueItems(works);
    const acc = new Map();
    liked.forEach(l => similar(l, queue, queue.length).forEach(({ work, score }) => {
        const cur = acc.get(work.id) || { work, score: 0, because: [] };
        cur.score += score * (Number(l.rating) / 5);
        if (cur.because.length < 3) cur.because.push(l.title);
        acc.set(work.id, cur);
    }));
    return [...acc.values()].sort((a, b) => b.score - a.score || String(a.work.title).localeCompare(String(b.work.title), 'es')).slice(0, limit);
}

// ============================================================
// CALENDARIO DEL MES
// ============================================================
const pad2 = n => String(n).padStart(2, '0');
/** Fecha local AAAA-MM-DD de un Date o de milisegundos. */
function localISO(d) { const x = new Date(d); return `${x.getFullYear()}-${pad2(x.getMonth() + 1)}-${pad2(x.getDate())}`; }
/** Semanas (lunes a domingo) que cubren el mes: [[{ iso, day, inMonth }]]. */
function monthMatrix(year, month) {
    const first = new Date(year, month, 1);
    const lead = (first.getDay() + 6) % 7; // lunes = 0
    const days = new Date(year, month + 1, 0).getDate();
    const total = Math.ceil((lead + days) / 7) * 7;
    const weeks = [];
    for (let i = 0; i < total; i++) {
        const d = new Date(year, month, 1 - lead + i);
        if (i % 7 === 0) weeks.push([]);
        weeks[weeks.length - 1].push({ iso: localISO(d), day: d.getDate(), inMonth: d.getMonth() === month });
    }
    return weeks;
}
/**
 * Episodios que salen entre dos fechas (ISO). Usa la fecha real de la fuente (nextAiring) y, desde ahí,
 * sigue semana a semana; si solo tienes puesto el día de emisión, proyecta ese día. `projected` = no es una fecha confirmada.
 */
function calendarEvents(works, fromISO, toISO, now = Date.now()) {
    const out = [];
    const todayISO = localISO(now);
    works.filter(w => !w.trashedAt && (isActive(w) || isPlanned(w))).forEach(w => {
        const total = getTotal(w) || Infinity;
        const na = w.nextAiring && Number(w.nextAiring.at) ? w.nextAiring : null;
        if (na) {
            let t = new Date(na.at), ep = Number(na.episode) || (Number(w.progress) || 0) + 1, first = true;
            for (let guard = 0; guard < 60 && ep <= total; guard++) {
                const iso = localISO(t);
                if (iso > toISO) break;
                if (iso >= fromISO) out.push({ date: iso, work: w, episode: ep, season: na.season || 0, projected: !first, time: first ? t.getTime() : 0 });
                t = new Date(t.getTime() + 7 * 86400000); ep++; first = false;
            }
        } else if (isActive(w) && w.airDay !== undefined && w.airDay !== null && w.airDay !== '') {
            const wd = Number(w.airDay);
            let t = new Date(now);
            t = new Date(t.getFullYear(), t.getMonth(), t.getDate());
            while (t.getDay() !== wd) t = new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1);
            let ep = (Number(w.progress) || 0) + 1;
            for (let guard = 0; guard < 60 && ep <= total; guard++) {
                const iso = localISO(t);
                if (iso > toISO) break;
                if (iso >= fromISO && iso >= todayISO) out.push({ date: iso, work: w, episode: ep, season: 0, projected: true, time: 0 });
                t = new Date(t.getFullYear(), t.getMonth(), t.getDate() + 7); ep++;
            }
        }
    });
    return out.sort((a, b) => a.date.localeCompare(b.date) || (a.time || 1e15) - (b.time || 1e15) || String(a.work.title).localeCompare(String(b.work.title), 'es'));
}
/** Color estable para una plataforma (para pintar el calendario). */
function platformHue(name) {
    const s = norm(name);
    if (!s) return -1;
    let h = 0;
    for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) % 360;
    return h;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { queueItems, moveInQueue, unitMinutes, remaining, fmtMinutes, WATCH_MOODS, fitsMood, pickSurprise, marathonPlan, recommendFromLiked, localISO, monthMatrix, calendarEvents, platformHue };
}
