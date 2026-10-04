/*
 * Mi Mundo · insights.js
 * Cálculos para estadísticas, rachas, reto anual, avisos y "¿Qué veo hoy?".
 * Funciones puras (sin DOM): reciben las obras y la fecha actual. Dependen de utils.js.
 */
'use strict';

const DAY_MS = 86400000;
const ACTIVITY_KEEP_DAYS = 400;
const STALLED_DAYS = 14;

/** Fecha local como YYYY-MM-DD. */
function dayKey(date) {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function addDays(date, n) {
    const d = new Date(date);
    d.setDate(d.getDate() + n);
    return d;
}

/** Apunta una sesión de actividad (avanzar, terminar, empezar) en la obra. Guarda solo ~13 meses. */
function bumpActivity(work, now = Date.now()) {
    const act = { ...(work.activity || {}) };
    const key = dayKey(now);
    act[key] = (act[key] || 0) + 1;
    const oldest = dayKey(now - ACTIVITY_KEEP_DAYS * DAY_MS);
    Object.keys(act).forEach(k => { if (k < oldest) delete act[k]; });
    work.activity = act;
    return work;
}

/** Actividad por día de todas las obras: sesiones + el día en que se agregó + el día en que se terminó. */
function activityByDay(works) {
    const map = new Map();
    const add = (key, n = 1) => { if (key) map.set(key, (map.get(key) || 0) + n); };
    works.forEach(w => {
        Object.entries(w.activity || {}).forEach(([k, n]) => add(k, Number(n) || 0));
        if (w.createdAt && !w.sample) add(dayKey(w.createdAt));
        if (w.endDate && w.status === 'terminado') add(w.endDate);
    });
    return map;
}

/** Racha de días seguidos con actividad. Si hoy aún no hay, la racha de ayer sigue viva. */
function streaks(byDay, now = Date.now()) {
    let current = 0;
    let day = new Date(now);
    if (!byDay.get(dayKey(day))) day = addDays(day, -1);
    while (byDay.get(dayKey(day))) { current++; day = addDays(day, -1); }
    let best = 0, run = 0, prev = null;
    [...byDay.keys()].filter(k => byDay.get(k) > 0).sort().forEach(k => {
        const d = new Date(k + 'T12:00:00');
        run = prev && Math.round((d - prev) / DAY_MS) === 1 ? run + 1 : 1;
        best = Math.max(best, run);
        prev = d;
    });
    return { current, best: Math.max(best, current), today: byDay.get(dayKey(now)) || 0 };
}

/** Últimos `months` meses: obras terminadas por tipo, según la fecha de fin. */
function finishedByMonth(works, months = 12, now = Date.now()) {
    const base = new Date(now);
    const out = [];
    for (let i = months - 1; i >= 0; i--) {
        const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        out.push({
            key,
            label: d.toLocaleDateString('es-ES', { month: 'short' }).replace('.', ''),
            year: d.getFullYear(),
            byType: { book: 0, series: 0, anime: 0, manhwa: 0 }
        });
    }
    const index = new Map(out.map((m, i) => [m.key, i]));
    works.forEach(w => {
        if (w.status !== 'terminado' || !w.endDate) return;
        const i = index.get(String(w.endDate).slice(0, 7));
        if (i !== undefined && out[i].byType[w.type] !== undefined) out[i].byType[w.type]++;
    });
    return out;
}

/** Cuántas obras hay con cada valoración (de 0,5 en 0,5). */
function ratingHistogram(works) {
    const bins = [];
    for (let r = 0.5; r <= 5; r += 0.5) bins.push({ rating: r, count: 0 });
    works.forEach(w => {
        const r = Math.round((Number(w.rating) || 0) * 2) / 2;
        const bin = bins.find(b => b.rating === r);
        if (bin) bin.count++;
    });
    return bins;
}

/** Cuadrícula 5×5: filas = tristeza (5 arriba), columnas = spicy (1 a la izquierda). */
function moodGrid(works) {
    const grid = Array.from({ length: 5 }, () => Array(5).fill(0));
    works.forEach(w => {
        const s = Number(w.spicy) || 0, t = Number(w.sadness) || 0;
        if (s >= 1 && s <= 5 && t >= 1 && t <= 5) grid[5 - t][s - 1]++;
    });
    return grid;
}

function statusSummary(works) {
    const out = { active: 0, done: 0, planned: 0, dropped: 0 };
    works.forEach(w => {
        if (w.status === 'leyendo' || w.status === 'viendo') out.active++;
        else if (w.status === 'terminado') out.done++;
        else if (w.status === 'abandonado') out.dropped++;
        else out.planned++;
    });
    return out;
}

function hoursByType(works) {
    const out = { book: 0, series: 0, anime: 0, manhwa: 0 };
    works.forEach(w => { if (out[w.type] !== undefined) out[w.type] += estimateMinutes(w) / 60; });
    return out;
}

/** Valores más frecuentes de un campo de texto (país, plataforma…), sin distinguir mayúsculas. */
function topValues(works, field, limit = 6) {
    const counts = new Map();
    works.forEach(w => splitList(w[field]).forEach(v => {
        const k = norm(v);
        const cur = counts.get(k) || { label: v, count: 0 };
        cur.count++;
        counts.set(k, cur);
    }));
    return [...counts.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'es')).slice(0, limit);
}

function finishedInYear(works, year) {
    return works.filter(w => w.status === 'terminado' && w.endDate && String(w.endDate).startsWith(String(year))).length;
}

function lastTouchedOf(w) { return Math.max(Number(w.updatedAt) || 0, Number(w.createdAt) || 0); }

/** Avisos útiles para hoy. Cada uno tiene un id estable para saber si ya se vio. */
function computeNotifications(works, settings = {}, now = Date.now()) {
    const today = new Date(now).getDay();
    const out = [];
    const active = works.filter(w => w.status === 'leyendo' || w.status === 'viendo');
    active.forEach(w => {
        if (w.airDay !== undefined && w.airDay !== null && w.airDay !== '' && Number(w.airDay) === today) {
            out.push({ id: `air:${w.id}:${dayKey(now)}`, icon: '📺', workId: w.id, title: `Hoy toca ${w.title}`, text: `Siguiente: ${w.type === 'manhwa' ? 'capítulo' : 'episodio'} ${(Number(w.progress) || 0) + 1}` });
        }
    });
    active.forEach(w => {
        const total = w.type === 'book' ? Number(w.pages) : w.type === 'manhwa' ? Number(w.totalChapters) : Number(w.totalEpisodes);
        const p = Number(w.progress) || 0;
        if (total && p / total >= 0.85 && p < total) {
            out.push({ id: `end:${w.id}`, icon: '🏁', workId: w.id, title: `¡Casi terminas ${w.title}!`, text: `Te faltan ${total - p} ${w.type === 'book' ? 'páginas' : w.type === 'manhwa' ? 'capítulos' : 'episodios'}` });
        }
    });
    active.forEach(w => {
        const last = lastTouchedOf(w);
        const days = Math.floor((now - last) / DAY_MS);
        if (last > 1 && days >= STALLED_DAYS) {
            out.push({ id: `stall:${w.id}:${Math.floor(days / 7)}`, icon: '⏸️', workId: w.id, title: `¿Sigues con ${w.title}?`, text: `Hace ${days} días que no avanzas` });
        }
    });
    const goal = Number(settings.yearGoal) || 0;
    if (goal > 0) {
        const year = new Date(now).getFullYear();
        const done = finishedInYear(works, year);
        if (done >= goal) out.push({ id: `goal-done:${year}`, icon: '🏆', title: `¡Reto ${year} cumplido!`, text: `Has terminado ${done} de ${goal} obras` });
        else {
            const startOfYear = new Date(year, 0, 1).getTime();
            const expected = Math.floor(goal * (now - startOfYear) / (new Date(year + 1, 0, 1).getTime() - startOfYear));
            if (done < expected) out.push({ id: `goal-behind:${year}:${new Date(now).getMonth()}`, icon: '🎯', title: 'Reto anual', text: `Llevas ${done} de ${goal}; para ir al día deberías llevar ${expected}` });
        }
    }
    return out;
}

/** Elige una obra al azar para hoy: primero entre las pendientes; si no hay, entre las que están en curso. */
function pickForToday(works, { type = 'all', exclude = [], random = Math.random } = {}) {
    const ok = w => (type === 'all' || w.type === type) && !exclude.includes(w.id);
    let pool = works.filter(w => ok(w) && (w.status === 'quiero ver' || w.status === 'quiero leer'));
    if (!pool.length) pool = works.filter(w => ok(w) && (w.status === 'viendo' || w.status === 'leyendo'));
    if (!pool.length) return null;
    // Las mejor valoradas y las favoritas tienen un poco más de probabilidad
    const weights = pool.map(w => 1 + (Number(w.rating) || 0) / 2 + (w.favorite ? 1 : 0));
    let r = random() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < pool.length; i++) { r -= weights[i]; if (r < 0) return pool[i]; }
    return pool[pool.length - 1];
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        dayKey, addDays, bumpActivity, activityByDay, streaks, finishedByMonth, ratingHistogram, moodGrid,
        statusSummary, hoursByType, topValues, finishedInYear, computeNotifications, pickForToday
    };
}
