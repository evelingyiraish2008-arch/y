/*
 * Mi Mundo · notify.js
 * Avisos programados (recordatorio diario, emisiones, resumen semanal, inactividad, racha en peligro,
 * recordatorios de cada obra), descubrimientos sobre tus gustos y sugerencias.
 * Funciones puras: las usa la app y también el service worker (importScripts), así que no tocan el DOM.
 * Dependen de utils.js e insights.js.
 */
'use strict';

const DEFAULT_NOTIFY = {
    enabled: false,
    daily: { on: true, time: '20:00' },
    airing: { on: true, time: '18:00' },
    weekly: { on: true, day: 0, time: '10:00' },
    inactivity: { on: true, days: 3 },
    streak: { on: true, time: '21:00' },
    reminders: { on: true }
};
function notifySettings(settings = {}) {
    const n = settings.notify || {};
    const out = { enabled: !!n.enabled };
    Object.keys(DEFAULT_NOTIFY).forEach(k => { if (k !== 'enabled') out[k] = { ...DEFAULT_NOTIFY[k], ...(n[k] || {}) }; });
    return out;
}
/** Momento (ms) de hoy a la hora "HH:MM". */
function atTime(now, hhmm) {
    const [h, m] = String(hhmm || '00:00').split(':').map(Number);
    const d = new Date(now);
    d.setHours(h || 0, m || 0, 0, 0);
    return d.getTime();
}
const isActiveWork = w => w.status === 'leyendo' || w.status === 'viendo';

/** ¿Toca hoy el recordatorio de esta obra? Devuelve el momento en que toca o 0. */
function reminderDueAt(w, now) {
    const r = w.reminder;
    if (!r || !r.mode) return 0;
    if (r.mode === 'once') return Number(r.at) || 0;
    const t = atTime(now, r.time || '20:00');
    if (r.mode === 'daily') return t;
    if (r.mode === 'weekly') return new Date(now).getDay() === Number(r.day ?? 0) ? t : 0;
    if (r.mode === 'monthly') return new Date(now).getDate() === Math.min(Number(r.day) || 1, 28) ? t : 0;
    return 0;
}

/**
 * Avisos que deberían salir ya y aún no se han enviado.
 * sent: { id: momento en que se envió }. Cada id lleva la fecha para que salgan como mucho una vez al día (o semana).
 */
function dueNotifications(data, now = Date.now(), sent = {}) {
    const ns = notifySettings(data.settings);
    if (!ns.enabled) return [];
    const works = (data.works || []).filter(w => !w.trashedAt);
    const today = dayKey(now);
    const out = [];
    const push = (id, title, body, extra = {}) => { if (!sent[id]) out.push({ id, title, body, ...extra }); };
    const active = works.filter(isActiveWork);
    const byDay = activityByDay(works);
    const st = streaks(byDay, now);

    if (ns.daily.on && now >= atTime(now, ns.daily.time)) {
        const next = active.slice().sort((a, b) => (Number(b.updatedAt) || 0) - (Number(a.updatedAt) || 0))[0];
        if (!st.today) push(`daily:${today}`, '📚 Tu momento de hoy', next ? `¿Un poco de “${next.title}”? Vas por ${next.progress || 0}.` : 'Elige algo para ver o leer hoy en Mi Mundo.', next ? { workId: next.id } : {});
    }
    if (ns.airing.on && now >= atTime(now, ns.airing.time)) {
        const dow = new Date(now).getDay();
        active.filter(w => w.airDay !== undefined && w.airDay !== null && w.airDay !== '' && Number(w.airDay) === dow).forEach(w => {
            push(`air:${w.id}:${today}`, `📺 Hoy sale ${w.title}`, `Te toca el ${w.type === 'manhwa' ? 'capítulo' : 'episodio'} ${(Number(w.progress) || 0) + 1}.`, { workId: w.id });
        });
    }
    if (ns.weekly.on && new Date(now).getDay() === Number(ns.weekly.day) && now >= atTime(now, ns.weekly.time)) {
        let sessions = 0;
        for (let i = 0; i < 7; i++) sessions += byDay.get(dayKey(addDays(now, -i))) || 0;
        const weekAgo = dayKey(addDays(now, -6));
        const doneWeek = works.filter(w => w.status === 'terminado' && w.endDate >= weekAgo && w.endDate <= today).length;
        push(`weekly:${today}`, '🗓️ Tu semana en Mi Mundo', `${sessions} ${sessions === 1 ? 'sesión' : 'sesiones'}, ${doneWeek} ${doneWeek === 1 ? 'obra terminada' : 'obras terminadas'}. ¡Sigue así!`);
    }
    if (ns.inactivity.on && works.length) {
        const keys = [...byDay.keys()].filter(k => byDay.get(k) > 0).sort();
        const last = keys[keys.length - 1];
        const days = last ? Math.round((new Date(today + 'T12:00:00') - new Date(last + 'T12:00:00')) / 86400000) : 0;
        if (last && days >= Number(ns.inactivity.days)) push(`idle:${last}`, '🌙 Te echamos de menos', `Hace ${days} días que no avanzas nada. ¿Retomamos ${active[0] ? `“${active[0].title}”` : 'algo'}?`, active[0] ? { workId: active[0].id } : {});
    }
    if (ns.streak.on && st.current >= 2 && !st.today && now >= atTime(now, ns.streak.time)) {
        push(`streak:${today}`, `🔥 ¡Tu racha de ${st.current} días está en peligro!`, 'Avanza aunque sea un capítulo o unas páginas antes de medianoche.');
    }
    if (ns.reminders.on) {
        works.forEach(w => {
            const at = reminderDueAt(w, now);
            if (!at || now < at) return;
            const id = w.reminder.mode === 'once' ? `rem:${w.id}:${w.reminder.at}` : `rem:${w.id}:${today}`;
            push(id, `🔔 ${w.title}`, w.reminder.note || (isActiveWork(w) ? `Te toca: vas por ${w.progress || 0}.` : 'Te pediste que te lo recordara.'), { workId: w.id });
        });
    }
    return out;
}
/** Quita del registro de enviados lo que tiene más de 40 días. */
function pruneSent(sent, now = Date.now()) {
    const out = {};
    Object.entries(sent || {}).forEach(([k, t]) => { if (now - t < 40 * 86400000) out[k] = t; });
    return out;
}

// ============================================================
// DESCUBRIMIENTOS Y SUGERENCIAS
// ============================================================
const avgOf = list => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : 0);
const fmt1 = n => (Math.round(n * 10) / 10).toLocaleString('es-ES');
/** Frases sobre tus gustos y hábitos, calculadas a partir de tus datos (solo las que tienen datos suficientes). */
function discoveries(works) {
    const out = [];
    const rated = works.filter(w => Number(w.rating) > 0);
    const avgAll = avgOf(rated.map(w => Number(w.rating)));
    // Día de la semana en que más terminas
    const doneDays = Array(7).fill(0);
    works.forEach(w => { if (w.status === 'terminado' && w.endDate) doneDays[new Date(w.endDate + 'T12:00:00').getDay()]++; });
    const totalDone = doneDays.reduce((a, b) => a + b, 0);
    const bestDay = doneDays.indexOf(Math.max(...doneDays));
    const DAYS = ['domingos', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados'];
    if (totalDone >= 4 && doneDays[bestDay] / totalDone >= 0.3) out.push({ id: `day:${bestDay}`, icon: '📅', text: `Terminas más obras los ${DAYS[bestDay]} (${Math.round(doneDays[bestDay] / totalDone * 100)} %).` });
    // Etiquetas y estudios que valoras por encima de tu media
    const groups = (field, label, min = 2) => {
        const map = new Map();
        rated.forEach(w => splitList(w[field]).forEach(v => { const k = norm(v); const cur = map.get(k) || { v, r: [] }; cur.r.push(Number(w.rating)); map.set(k, cur); }));
        return [...map.values()].filter(x => x.r.length >= min).map(x => ({ v: x.v, avg: avgOf(x.r), n: x.r.length, label }));
    };
    const best = [...groups('tags', 'etiqueta'), ...groups('studio', 'estudio'), ...groups('author', 'autor')]
        .filter(x => x.avg - avgAll >= 0.3).sort((a, b) => b.avg - a.avg)[0];
    if (best) out.push({ id: `fav:${norm(best.v)}`, icon: '💜', text: `Lo que más disfrutas: ${best.label} “${best.v}” (★ ${fmt1(best.avg)} de media, frente a ${fmt1(avgAll)} en general).` });
    // BL frente al resto
    const bl = rated.filter(w => w.bl), nobl = rated.filter(w => !w.bl);
    if (bl.length >= 2 && nobl.length >= 2) {
        const d = avgOf(bl.map(w => Number(w.rating))) - avgOf(nobl.map(w => Number(w.rating)));
        if (Math.abs(d) >= 0.3) out.push({ id: 'bl', icon: '💖', text: d > 0 ? `Valoras el BL ${fmt1(d)} estrellas más que el resto.` : `El BL te convence menos: ${fmt1(-d)} estrellas por debajo del resto.` });
    }
    // Qué abandonas
    const dropped = works.filter(w => w.status === 'abandonado');
    if (dropped.length >= 2) {
        const counts = new Map();
        dropped.forEach(w => splitList(w.tags).forEach(t => counts.set(t.toLowerCase(), (counts.get(t.toLowerCase()) || 0) + 1)));
        const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
        if (top && top[1] >= 2) out.push({ id: `drop:${top[0]}`, icon: '⏸️', text: `Sueles abandonar obras con la etiqueta “${top[0]}” (${top[1]} de ${dropped.length} abandonadas).` });
    }
    // Spicy y tristeza
    const sad = works.filter(w => Number(w.sadness) >= 4 && Number(w.rating) > 0);
    if (sad.length >= 2 && avgOf(sad.map(w => Number(w.rating))) - avgAll >= 0.3) out.push({ id: 'sad', icon: '💧', text: `Las historias que te hacen llorar son tus favoritas (★ ${fmt1(avgOf(sad.map(w => Number(w.rating))))}).` });
    // Tipo favorito por nota
    const types = Object.keys(TYPE_META).map(t => ({ t, list: rated.filter(w => w.type === t) })).filter(x => x.list.length >= 2)
        .map(x => ({ ...x, avg: avgOf(x.list.map(w => Number(w.rating))) })).sort((a, b) => b.avg - a.avg);
    if (types.length >= 2 && types[0].avg - types[types.length - 1].avg >= 0.3) out.push({ id: `type:${types[0].t}`, icon: TYPE_META[types[0].t].icon, text: `Tu tipo mejor valorado: ${TYPE_META[types[0].t].label.toLowerCase()} (★ ${fmt1(types[0].avg)}).` });
    // Rapidez
    const durations = works.filter(w => w.status === 'terminado' && w.startDate && w.endDate && w.endDate >= w.startDate)
        .map(w => Math.round((new Date(w.endDate) - new Date(w.startDate)) / 86400000) + 1);
    if (durations.length >= 3) out.push({ id: 'speed', icon: '⏱️', text: `Tardas una media de ${Math.round(avgOf(durations))} días en terminar una obra.` });
    return out;
}
/** Pendientes que encajan con lo que te gusta: [{ work, reason, score }]. */
function suggestForYou(works, limit = 3) {
    const liked = works.filter(w => Number(w.rating) >= 4.5 || w.favorite);
    if (!liked.length) return [];
    const weight = new Map();
    const add = (k, v, why) => { const cur = weight.get(k) || { v: 0, why }; cur.v += v; weight.set(k, cur); };
    liked.forEach(w => {
        splitList(w.tags).forEach(t => add('tag:' + norm(t), 1, `te encantan las obras de “${t}”`));
        ['author', 'studio'].forEach(f => splitList(w[f]).forEach(x => add(f + ':' + norm(x), 2, `te gustó ${w.title}`)));
        splitList(w.actors).forEach(x => add('actor:' + norm(x), 1.5, `sale ${x}`));
    });
    return works.filter(w => w.status === 'quiero leer' || w.status === 'quiero ver').map(w => {
        let score = 0, why = '', top = 0;
        const keys = [...splitList(w.tags).map(t => 'tag:' + norm(t)), ...splitList(w.author).map(x => 'author:' + norm(x)), ...splitList(w.studio).map(x => 'studio:' + norm(x)), ...splitList(w.actors).map(x => 'actor:' + norm(x))];
        keys.forEach(k => { const h = weight.get(k); if (h) { score += h.v; if (h.v > top) { top = h.v; why = h.why; } } });
        return { work: w, score, reason: why };
    }).filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, limit);
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { DEFAULT_NOTIFY, notifySettings, atTime, reminderDueAt, dueNotifications, pruneSent, discoveries, suggestForYou };
}
