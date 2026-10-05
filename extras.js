/*
 * Mi Mundo · extras.js
 * Funciones puras de los extras: cronología, diario, limpieza, preguntas sobre tus datos,
 * "¿cómo te sientes hoy?", adivina por portada, retos, sugerencias inteligentes y calendario (.ics).
 * Dependen de utils.js, insights.js y coherence.js.
 */
'use strict';

// ---------- Cronología personal ----------
/** Eventos de tu historia ordenados del más reciente al más antiguo. */
function timelineEvents(data) {
    const ev = [];
    data.works.forEach(w => {
        if (w.createdAt && !w.sample) ev.push({ date: dayKey(w.createdAt), kind: 'add', icon: '➕', text: `Agregaste “${w.title}”`, workId: w.id });
        if (w.startDate) ev.push({ date: w.startDate, kind: 'start', icon: '▶️', text: `Empezaste “${w.title}”`, workId: w.id });
        if (w.endDate && w.status === 'terminado') ev.push({ date: w.endDate, kind: 'end', icon: '✅', text: `Terminaste “${w.title}”${w.rating ? ` · ★ ${ratingText(w.rating)}` : ''}`, workId: w.id });
        (w.rereads || []).forEach((r, i) => { if (r.date) ev.push({ date: r.date, kind: 'reread', icon: '🔁', text: `${i + 2}ª vez con “${w.title}”`, workId: w.id }); });
    });
    data.notes.forEach(n => { if (n.createdAt && !n.sample) ev.push({ date: dayKey(n.createdAt), kind: 'note', icon: '📝', text: `Escribiste sobre “${n.workTitle || 'una obra'}”`, workId: n.workId }); });
    (data.settings.diary || []).forEach(d => ev.push({ date: d.date, kind: 'diary', icon: '📔', text: d.text, diaryId: d.id }));
    return ev.filter(e => e.date).sort((a, b) => b.date.localeCompare(a.date) || a.kind.localeCompare(b.kind));
}
/** Agrupa eventos por mes: [{ key: '2026-10', items: [...] }]. */
function groupByMonth(events) {
    const out = [];
    events.forEach(e => {
        const k = e.date.slice(0, 7);
        if (!out.length || out[out.length - 1].key !== k) out.push({ key: k, items: [] });
        out[out.length - 1].items.push(e);
    });
    return out;
}

// ---------- Diario de consumo ----------
/** Lo de un día: sesiones registradas (automático) + entradas escritas a mano. */
function diaryDay(data, key) {
    const auto = data.works.filter(w => Number((w.activity || {})[key]) > 0 || w.startDate === key || (w.endDate === key && w.status === 'terminado'))
        .map(w => ({ work: w, sessions: Number((w.activity || {})[key]) || 0, started: w.startDate === key, finished: w.endDate === key && w.status === 'terminado' }));
    const manual = (data.settings.diary || []).filter(d => d.date === key);
    return { auto, manual };
}

// ---------- Modo limpieza ----------
/** Cosas a revisar para tener la colección ordenada. */
function cleanupSuggestions(data, now = Date.now()) {
    const out = [];
    const works = data.works;
    const add = (id, icon, text, items, action) => { if (items.length) out.push({ id, icon, text, items, action }); };
    add('nocover', '🖼️', 'Obras sin portada', works.filter(w => !w.image), 'edit');
    add('norating', '⭐', 'Terminadas sin valorar', works.filter(w => w.status === 'terminado' && !Number(w.rating)), 'rate');
    add('notags', '🏷️', 'Obras sin etiquetas', works.filter(w => !splitList(w.tags).length), 'edit');
    add('nototal', '📏', 'En curso sin total (no se puede seguir el progreso)', works.filter(w => isActive(w) && !getTotal(w)), 'edit');
    add('stalled', '⏸️', 'En curso sin avanzar desde hace más de 2 meses', works.filter(w => {
        if (!isActive(w)) return false;
        const last = Object.keys(w.activity || {}).sort().pop() || w.startDate || '';
        return last && (now - new Date(last + 'T12:00:00')) / 86400000 > 60;
    }), 'drop');
    add('oldplan', '🕸️', 'Pendientes desde hace más de un año', works.filter(w => isPlanned(w) && !w.sample && w.createdAt && now - w.createdAt > 365 * 86400000), 'review');
    const dups = [];
    works.forEach((w, i) => works.slice(i + 1).forEach(o => { if (titleSimilarity(w.title, o.title) >= 0.9 && w.type === o.type) dups.push(w, o); }));
    add('dups', '👯', 'Posibles duplicados', [...new Set(dups)], 'review');
    add('emptycoll', '📭', 'Colecciones vacías', data.collections.filter(c => !c.smart && !c.items.some(id => works.some(w => w.id === id))), 'collection');
    return out;
}

// ---------- Preguntas sobre tus datos ----------
const QA_QUESTIONS = [
    ['bestYear', '¿Cuál fue mi mejor año?'], ['longest', '¿Cuál es la obra más larga que he terminado?'], ['fastest', '¿Qué terminé más rápido?'],
    ['topAuthor', '¿Qué autor o estudio he visto más?'], ['firstEver', '¿Qué fue lo primero que terminé?'], ['bestRated', '¿Cuál es mi obra mejor valorada?'],
    ['oldestPending', '¿Qué pendiente llevo más tiempo sin empezar?'], ['blShare', '¿Cuánto BL veo?'], ['hours', '¿Cuántas horas llevo en total?'], ['favMonth', '¿En qué mes termino más cosas?']
];
function answerQuestion(id, data) {
    const works = data.works;
    const done = works.filter(w => w.status === 'terminado');
    const pick = (list, fn) => list.slice().sort(fn)[0];
    switch (id) {
        case 'bestYear': {
            const m = new Map();
            done.forEach(w => { if (w.endDate) { const y = w.endDate.slice(0, 4); m.set(y, (m.get(y) || 0) + 1); } });
            const best = [...m.entries()].sort((a, b) => b[1] - a[1])[0];
            return best ? { text: `${best[0]}, con ${best[1]} ${best[1] === 1 ? 'obra terminada' : 'obras terminadas'}.` } : { text: 'Aún no has terminado nada con fecha de fin.' };
        }
        case 'longest': {
            const w = pick(done.filter(x => getTotal(x)), (a, b) => estimateMinutes({ ...b, progress: getTotal(b) }) - estimateMinutes({ ...a, progress: getTotal(a) }));
            return w ? { text: `“${w.title}”: ${getTotal(w)} ${w.type === 'book' ? 'páginas' : w.type === 'manhwa' ? 'capítulos' : 'episodios'}.`, workId: w.id } : { text: 'Todavía no hay obras terminadas con su longitud.' };
        }
        case 'fastest': {
            const list = done.filter(w => w.startDate && w.endDate && w.endDate >= w.startDate);
            const w = pick(list, (a, b) => (new Date(a.endDate) - new Date(a.startDate)) - (new Date(b.endDate) - new Date(b.startDate)));
            if (!w) return { text: 'Necesito obras terminadas con fecha de inicio y de fin.' };
            const d = Math.round((new Date(w.endDate) - new Date(w.startDate)) / 86400000) + 1;
            return { text: `“${w.title}”, en ${d} ${d === 1 ? 'día' : 'días'}.`, workId: w.id };
        }
        case 'topAuthor': {
            const m = new Map();
            works.forEach(w => [...splitList(w.author), ...splitList(w.studio)].forEach(x => { const k = norm(x); const c = m.get(k) || { x, n: 0 }; c.n++; m.set(k, c); }));
            const top = [...m.values()].sort((a, b) => b.n - a.n)[0];
            return top ? { text: `${top.x}, con ${top.n} ${top.n === 1 ? 'obra' : 'obras'}.` } : { text: 'Añade autor o estudio a tus obras para saberlo.' };
        }
        case 'firstEver': {
            const w = pick(done.filter(x => x.endDate), (a, b) => a.endDate.localeCompare(b.endDate));
            return w ? { text: `“${w.title}”, el ${fmtDate(w.endDate)}.`, workId: w.id } : { text: 'Aún no hay obras terminadas con fecha.' };
        }
        case 'bestRated': {
            const w = pick(works.filter(x => Number(x.rating)), (a, b) => Number(b.rating) - Number(a.rating) || (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0));
            return w ? { text: `“${w.title}” con ★ ${ratingText(w.rating)}.`, workId: w.id } : { text: 'Valora alguna obra con estrellas.' };
        }
        case 'oldestPending': {
            const w = pick(works.filter(x => isPlanned(x) && x.createdAt), (a, b) => a.createdAt - b.createdAt);
            return w ? { text: `“${w.title}”, la agregaste el ${fmtDate(w.createdAt)}.`, workId: w.id } : { text: '¡No tienes pendientes! 🎉' };
        }
        case 'blShare': {
            const n = works.filter(w => w.bl).length;
            return { text: works.length ? `${n} de ${works.length} obras (${Math.round(n / works.length * 100)} %) son BL.` : 'Aún no tienes obras.' };
        }
        case 'hours': {
            const h = Math.round(works.reduce((a, w) => a + estimateMinutes(w), 0) / 60);
            return { text: `Unas ${h.toLocaleString(APP_LOCALE)} horas, que son ${Math.round(h / 24)} días seguidos.` };
        }
        case 'favMonth': {
            const m = Array(12).fill(0);
            done.forEach(w => { if (w.endDate) m[Number(w.endDate.slice(5, 7)) - 1]++; });
            const i = m.indexOf(Math.max(...m));
            return Math.max(...m) ? { text: `En ${['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'][i]} (${m[i]} terminadas).` } : { text: 'Aún no hay obras terminadas con fecha.' };
        }
        default: return { text: '' };
    }
}

// ---------- ¿Cómo te sientes hoy? ----------
const MOODS = {
    happy: { icon: '😊', label: 'De buen humor', want: w => (Number(w.sadness) || 0) <= 2, why: 'algo ligero para seguir sonriendo' },
    sad: { icon: '😢', label: 'Con ganas de llorar', want: w => (Number(w.sadness) || 0) >= 4, why: 'una historia para soltar lágrimas' },
    romantic: { icon: '🥰', label: 'Con ganas de romance', want: w => /romance|bl|amor/i.test(w.tags || '') || w.bl, why: 'mucho romance' },
    spicy: { icon: '🌶️', label: 'Con ganas de algo picante', want: w => (Number(w.spicy) || 0) >= 3, why: 'algo picante' },
    tired: { icon: '😴', label: 'Sin energía', want: w => (w.type === 'series' || w.type === 'anime' || w.type === 'manhwa') && (Number(w.sadness) || 0) <= 3, why: 'algo fácil, sin esfuerzo' },
    adventure: { icon: '⚔️', label: 'Con ganas de aventura', want: w => /acci[oó]n|aventura|fantas[ií]a|shonen|wuxia/i.test(norm(w.tags) + ' ' + norm(w.genre)), why: 'acción y aventura' }
};
/** Propuestas para tu estado de ánimo: primero lo que tienes en curso, luego pendientes, y al final lo que te encantó (para repetir). */
function moodSuggestions(works, mood, limit = 5) {
    const m = MOODS[mood];
    if (!m) return [];
    const rank = w => (isActive(w) ? 0 : isPlanned(w) ? 1 : w.status === 'terminado' && Number(w.rating) >= 4.5 ? 2 : 9);
    return works.filter(w => m.want(w) && rank(w) < 9).sort((a, b) => rank(a) - rank(b) || (Number(b.rating) || 0) - (Number(a.rating) || 0)).slice(0, limit)
        .map(w => ({ work: w, why: isActive(w) ? 'la tienes a medias' : isPlanned(w) ? 'la tienes pendiente' : `te encantó (★ ${ratingText(w.rating)})` }));
}

// ---------- Adivina por portada ----------
/** Una ronda: la respuesta y 3 opciones falsas (de las obras con portada). random se puede fijar para las pruebas. */
function guessRound(works, random = Math.random) {
    const pool = works.filter(w => w.image && w.title);
    if (pool.length < 4) return null;
    const answer = pool[Math.floor(random() * pool.length)];
    const others = pool.filter(w => w.id !== answer.id && norm(w.title) !== norm(answer.title));
    const options = [answer];
    while (options.length < 4 && others.length) options.push(others.splice(Math.floor(random() * others.length), 1)[0]);
    for (let i = options.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [options[i], options[j]] = [options[j], options[i]]; }
    return { answer, options };
}

// ---------- Retos ----------
const CHALLENGE_TEMPLATES = [
    { id: 'books5', icon: '📚', title: 'Termina 5 libros', goal: 5, kind: 'finish', type: 'book' },
    { id: 'bl3', icon: '💖', title: 'Termina 3 obras BL', goal: 3, kind: 'finish', bl: true },
    { id: 'anime3', icon: '🎌', title: 'Termina 3 animes', goal: 3, kind: 'finish', type: 'anime' },
    { id: 'newstudio', icon: '🆕', title: 'Prueba 3 obras de autores o estudios nuevos para ti', goal: 3, kind: 'newcreator' },
    { id: 'streak7', icon: '🔥', title: 'Racha de 7 días', goal: 7, kind: 'streak' },
    { id: 'notes5', icon: '📝', title: 'Escribe 5 notas', goal: 5, kind: 'notes' },
    { id: 'pending3', icon: '🧹', title: 'Saca 3 obras de tus pendientes (empiézalas)', goal: 3, kind: 'start' }
];
/** Progreso de un reto desde que empezó (since = AAAA-MM-DD). */
function challengeProgress(ch, data, now = Date.now()) {
    const since = ch.since || '0000';
    const works = data.works;
    let value = 0;
    if (ch.kind === 'finish') value = works.filter(w => w.status === 'terminado' && w.endDate >= since && (!ch.type || w.type === ch.type) && (!ch.bl || w.bl)).length;
    else if (ch.kind === 'start') value = works.filter(w => w.startDate && w.startDate >= since).length;
    else if (ch.kind === 'notes') value = data.notes.filter(n => n.createdAt && dayKey(n.createdAt) >= since).length;
    else if (ch.kind === 'streak') value = streaks(activityByDay(works), now).current;
    else if (ch.kind === 'newcreator') {
        const before = new Set(works.filter(w => w.startDate && w.startDate < since).flatMap(w => [...splitList(w.author), ...splitList(w.studio)].map(norm)));
        const fresh = new Set();
        works.filter(w => w.startDate && w.startDate >= since).forEach(w => [...splitList(w.author), ...splitList(w.studio)].forEach(x => { if (!before.has(norm(x))) fresh.add(norm(x)); }));
        value = fresh.size;
    }
    return { value: Math.min(value, ch.goal), goal: ch.goal, done: value >= ch.goal, pct: Math.min(100, Math.round(value / ch.goal * 100)) };
}

// ---------- Sugerencias inteligentes de una obra ----------
function workSuggestions(w, data) {
    const out = [];
    const total = getTotal(w), p = Number(w.progress) || 0;
    if (isActive(w) && total && p >= total) out.push({ id: 'finish', icon: '🏁', text: 'Ya llegaste al final. ¿La marco como terminada?', act: 'sugg-finish' });
    if (isPlanned(w) && p > 0) out.push({ id: 'start', icon: '▶️', text: `Ya llevas ${p}. ¿La pongo como “${w.type === 'book' || w.type === 'manhwa' ? 'Leyendo' : 'Viendo'}”?`, act: 'sugg-start' });
    if (w.status === 'terminado' && !Number(w.rating)) out.push({ id: 'rate', icon: '⭐', text: '¡La terminaste! ¿Qué nota le das?', act: 'sugg-rate' });
    // Colección que encaja: comparte etiquetas con la mayoría de sus obras
    const tags = new Set(splitList(w.tags).map(norm));
    data.collections.filter(c => !c.smart && !c.items.includes(w.id) && c.items.length >= 2).forEach(c => {
        const items = c.items.map(id => data.works.find(x => x.id === id)).filter(Boolean);
        const match = items.filter(o => splitList(o.tags).some(t => tags.has(norm(t))) || (o.bl && w.bl)).length;
        if (items.length && match / items.length >= 0.6 && out.length < 4) out.push({ id: 'coll:' + c.id, icon: '📂', text: `¿Añadirla a “${c.name}”? Se parece a lo que hay allí.`, act: 'sugg-coll', collId: c.id });
    });
    return out;
}
/** Terminadas sin valorar (para recordarte puntuarlas). */
const unratedFinished = works => works.filter(w => w.status === 'terminado' && !Number(w.rating));

// ---------- Calendario (.ics) ----------
function icsEscape(s) { return String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n'); }
/** Calendario con un evento semanal por cada obra en curso que tiene día de emisión. */
function buildIcs(works, { now = Date.now(), time = '20:00' } = {}) {
    const [hh, mm] = time.split(':').map(Number);
    const pad = n => String(n).padStart(2, '0');
    const stamp = new Date(now).toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Mi Mundo//ES', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Mi Mundo · Emisiones'];
    works.filter(w => isActive(w) && w.airDay !== undefined && w.airDay !== null && w.airDay !== '').forEach(w => {
        const d = new Date(now);
        d.setDate(d.getDate() + ((Number(w.airDay) - d.getDay() + 7) % 7));
        const dt = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(hh)}${pad(mm)}00`;
        lines.push('BEGIN:VEVENT', `UID:${w.id}@mi-mundo`, `DTSTAMP:${stamp}`, `DTSTART:${dt}`, 'DURATION:PT1H',
            'RRULE:FREQ=WEEKLY', `SUMMARY:${icsEscape(`${TYPE_META[w.type].icon} ${w.title}`)}`,
            `DESCRIPTION:${icsEscape(`Siguiente: ${w.type === 'manhwa' ? 'capítulo' : 'episodio'} ${(Number(w.progress) || 0) + 1}${w.platform ? ' · ' + w.platform : ''}`)}`, 'END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    return lines.join('\r\n');
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        timelineEvents, groupByMonth, diaryDay, cleanupSuggestions, QA_QUESTIONS, answerQuestion, MOODS, moodSuggestions,
        guessRound, CHALLENGE_TEMPLATES, challengeProgress, workSuggestions, unratedFinished, buildIcs
    };
}
