/*
 * Mi Mundo · couplekit.js
 * Parejas BL: nombre de ship (PoohPavel, PerthSanta…), cómo van trabajando juntos (sin dramatismos:
 * se calcula solo con tus obras y se puede cambiar a mano), línea de tiempo y búsqueda por cualquiera de sus nombres.
 * Funciones puras (sin DOM). Dependen de utils.js, peoplekit.js y coherence.js.
 */
'use strict';

/** Cómo van como pareja de trabajo. Todo se calcula de las obras que tienes; no se inventa nada. */
const COUPLE_STATUS = {
    nueva: { icon: '🌱', label: 'Recién juntos', hint: 'Han trabajado juntos pocas veces y hace poco' },
    consolidada: { icon: '🤝', label: 'Pareja consolidada', hint: 'Trabajan juntos a menudo (3 obras o más)' },
    pasada: { icon: '🕰️', label: 'Trabajaron juntos', hint: 'Hace años que no coinciden en una obra' }
};
const COUPLE_STALE_YEARS = 3; // sin obras juntos en tantos años → "trabajaron juntos"

/** Año de una obra (el de estreno o, si falta, el de la fecha de inicio). */
function workYear(w) {
    const y = Number(w.year) || parseInt(String(w.startDate || '').slice(0, 4), 10);
    return y > 1900 && y < 2200 ? y : 0;
}
/** Obras de la pareja de la más antigua a la más reciente (las sin año, al final). */
function coupleTimeline(couple, works, persons) {
    return coupleWorks(couple, works, persons)
        .map(w => ({ work: w, year: workYear(w) }))
        .sort((a, b) => (a.year || 9999) - (b.year || 9999) || a.work.title.localeCompare(b.work.title, 'es'));
}
/**
 * Estado de la pareja: { key, label, icon, hint, auto, count, first, last, span } o null si no hay nada que decir.
 * Si lo eliges a mano (couple.status) se respeta; si no, se calcula: sin obras juntos desde hace 3 años o más →
 * "Trabajaron juntos"; 3 obras o más → "Pareja consolidada"; el resto → "Recién juntos".
 */
function coupleStatus(couple, works, persons, nowYear = new Date().getFullYear()) {
    const sum = coupleSummary(couple, works, persons);
    const years = sum.works.map(workYear).filter(Boolean);
    const since = Number(couple.since) || 0;
    const all = [...years, ...(since ? [since] : [])];
    const first = all.length ? Math.min(...all) : 0;
    const last = years.length ? Math.max(...years) : 0;
    const count = sum.count;
    let key = COUPLE_STATUS[couple.status] ? couple.status : '';
    const auto = !key;
    if (!key) {
        if (!count && !since) return null;
        key = last && nowYear - last >= COUPLE_STALE_YEARS ? 'pasada' : count >= 3 ? 'consolidada' : 'nueva';
    }
    const span = first && last && first !== last ? `${first}–${last}` : String(last || first || '');
    return { key, ...COUPLE_STATUS[key], auto, count, first, last, span };
}

// ---------- Nombre de ship ----------
/** Clave para comparar: sin tildes, mayúsculas, espacios ni signos, pero conservando las letras de cualquier idioma (tailandés, coreano…). */
const shipKey = s => norm(s).replace(/[^\p{L}\p{N}]/gu, '');
const cap = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');
/** Primera palabra del nombre artístico ("Pooh Krittin" → "Pooh"). */
const stageFirst = p => cap(String(p.name || '').trim().split(/\s+/)[0] || '');
/** Nombre de ship sugerido uniendo los nombres artísticos: Pooh + Pavel → "PoohPavel". '' si no se puede. */
function suggestShip(a, b) {
    if (!a || !b) return '';
    const x = stageFirst(a), y = stageFirst(b);
    return x && y && shipKey(x) !== shipKey(y) ? x + y : '';
}
/** Nombre que se ve en todas partes: el ship si lo hay; si no, el nombre de la pareja. */
const coupleTitle = c => (c.ship && c.ship.trim()) || c.name || '';
/** Los dos actores en texto: "Pooh Krittin & Pavel Naiyana" (o '' si no están elegidos). */
function coupleNames(c, persons) {
    const a = persons.find(p => p.id === c.personA), b = persons.find(p => p.id === c.personB);
    return a && b ? `${a.name} & ${b.name}` : '';
}
/** ¿Encaja la búsqueda? Vale el ship (con o sin espacios), el nombre y cualquier nombre de sus dos actores. */
function coupleMatches(c, query, persons) {
    const q = shipKey(query);
    if (!q) return true;
    const a = persons.find(p => p.id === c.personA), b = persons.find(p => p.id === c.personB);
    const keys = [c.ship, c.name, ...(a ? personNames(a) : []), ...(b ? personNames(b) : [])].filter(Boolean);
    return keys.some(k => shipKey(k).includes(q));
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { COUPLE_STATUS, COUPLE_STALE_YEARS, workYear, coupleTimeline, coupleStatus, shipKey, suggestShip, coupleTitle, coupleNames, coupleMatches };
}
