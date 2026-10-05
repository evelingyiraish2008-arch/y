/*
 * Mi Mundo · coherence.js
 * Etiquetas, parejas vinculadas, temporadas, notas con tipos y re-visionados.
 * Funciones puras (sin DOM). Dependen de utils.js y history.js (titleSimilarity).
 */
'use strict';

// ============================================================
// ETIQUETAS
// ============================================================
const tagKey = t => String(t || '').trim().toLowerCase();

/** Estadísticas de cada etiqueta: cuántas obras la usan y cuándo se usó por última vez. */
function tagStats(works) {
    const map = new Map();
    works.forEach(w => {
        const when = Math.max(Number(w.updatedAt) || 0, Number(w.createdAt) || 0);
        splitList(w.tags).forEach(t => {
            const k = tagKey(t);
            const cur = map.get(k) || { key: k, label: t, count: 0, lastUsed: 0 };
            cur.count++;
            cur.lastUsed = Math.max(cur.lastUsed, when);
            map.set(k, cur);
        });
    });
    return [...map.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'es'));
}
/** Une etiquetas repetidas (sin distinguir mayúsculas) manteniendo la primera. */
function dedupeTags(list) {
    const seen = new Set();
    return list.filter(t => { const k = tagKey(t); if (!k || seen.has(k)) return false; seen.add(k); return true; });
}
/** Cambia el nombre de una etiqueta en todas las obras (si "to" ya existe, se fusionan). Devuelve las obras cambiadas. */
function renameTag(works, from, to) {
    const k = tagKey(from), label = String(to || '').trim();
    if (!k || !label) return [];
    const changed = [];
    works.forEach(w => {
        const tags = splitList(w.tags);
        if (!tags.some(t => tagKey(t) === k)) return;
        w.tags = dedupeTags(tags.map(t => (tagKey(t) === k ? label : t))).join(', ');
        changed.push(w);
    });
    return changed;
}
/** Quita una etiqueta de todas las obras. Devuelve las obras cambiadas. */
function removeTag(works, tag) {
    const k = tagKey(tag);
    const changed = [];
    works.forEach(w => {
        const tags = splitList(w.tags);
        if (!tags.some(t => tagKey(t) === k)) return;
        w.tags = tags.filter(t => tagKey(t) !== k).join(', ');
        changed.push(w);
    });
    return changed;
}
/** "¿Quisiste decir…?": para cada etiqueta escrita que no existe, la existente más parecida. */
function suggestTagFixes(input, known, { min = 0.75 } = {}) {
    const knownKeys = new Map(known.map(t => [tagKey(t), t]));
    return splitList(input).map(typed => {
        if (knownKeys.has(tagKey(typed))) return null;
        let best = null;
        knownKeys.forEach(label => {
            const score = titleSimilarity(typed, label);
            if (score >= min && (!best || score > best.score)) best = { typed, suggestion: label, score };
        });
        return best;
    }).filter(Boolean);
}
/** Etiquetas que llevan obras parecidas (mismo autor/estudio, tipo, título parecido) y esta todavía no tiene. */
function suggestTagsFor(work, works, limit = 6) {
    const own = new Set(splitList(work.tags).map(tagKey));
    const scores = new Map();
    const people = f => splitList(work[f]).map(norm);
    works.forEach(o => {
        if (o.id === work.id) return;
        let weight = 0;
        if (o.type === work.type) weight += 0.5;
        if (work.bl && o.bl) weight += 0.5;
        ['author', 'studio', 'actors'].forEach(f => { if (splitList(o[f]).some(x => people(f).includes(norm(x)))) weight += 2; });
        if (work.title && titleSimilarity(work.title, o.title) >= 0.6) weight += 2;
        if (weight < 1) return;
        splitList(o.tags).forEach(t => {
            const k = tagKey(t);
            if (own.has(k)) return;
            const cur = scores.get(k) || { label: t, score: 0 };
            cur.score += weight;
            scores.set(k, cur);
        });
    });
    return [...scores.values()].sort((a, b) => b.score - a.score).slice(0, limit).map(x => x.label);
}

// ============================================================
// PAREJAS VINCULADAS
// ============================================================
/** Obras de una pareja: las marcadas a mano + aquellas en las que aparecen los dos actores. */
function coupleWorks(couple, works, persons) {
    const ids = new Set(couple.workIds || []);
    const a = persons.find(p => p.id === couple.personA), b = persons.find(p => p.id === couple.personB);
    if (a && b) {
        const na = norm(a.name), nb = norm(b.name);
        works.forEach(w => {
            const actors = splitList(w.actors).map(norm);
            if (actors.includes(na) && actors.includes(nb)) ids.add(w.id);
        });
    }
    return works.filter(w => ids.has(w.id));
}
/** Resumen de la pareja: obras, número y valoración media de sus obras juntos. */
function coupleSummary(couple, works, persons) {
    const list = coupleWorks(couple, works, persons);
    const rated = list.filter(w => Number(w.rating) > 0);
    const linked = !!(couple.personA && couple.personB) || !!(couple.workIds || []).length;
    return {
        works: list,
        count: linked ? list.length : Number(couple.works) || 0,
        avgRating: rated.length ? rated.reduce((s, w) => s + Number(w.rating), 0) / rated.length : 0,
        linked
    };
}
/** Otras parejas que comparten un actor con esta. */
function relatedCouples(couple, couples) {
    const people = [couple.personA, couple.personB].filter(Boolean);
    return couples.filter(c => c.id !== couple.id && [c.personA, c.personB].some(p => p && people.includes(p)));
}
function couplesForPerson(personId, couples) {
    return couples.filter(c => c.personA === personId || c.personB === personId);
}
/** Ranking: primero por la media de sus obras juntos (si están vinculadas), si no por la nota manual. */
function rankCouples(couples, works, persons) {
    return couples.map(c => {
        const s = coupleSummary(c, works, persons);
        return { couple: c, score: s.avgRating || Number(c.rating) || 0, count: s.count };
    }).sort((a, b) => b.score - a.score || b.count - a.count);
}

// ============================================================
// TEMPORADAS / PARTES DE UNA SAGA
// ============================================================
const hasSeasons = w => Array.isArray(w.seasonsList) && w.seasonsList.length > 0;
const totalField = type => (type === 'book' ? 'pages' : type === 'manhwa' ? 'totalChapters' : 'totalEpisodes');
/** Suma de las temporadas: total, progreso, media de las valoraciones y cuál es la actual. */
function seasonTotals(w) {
    const list = hasSeasons(w) ? w.seasonsList : [];
    const total = list.reduce((s, x) => s + (Number(x.episodes) || 0), 0);
    const progress = list.reduce((s, x) => s + Math.min(Number(x.progress) || 0, Number(x.episodes) || Infinity), 0);
    const rated = list.filter(x => Number(x.rating) > 0);
    let current = list.findIndex(x => !(Number(x.episodes) && (Number(x.progress) || 0) >= Number(x.episodes)));
    if (current < 0) current = list.length - 1;
    return { total, progress, avgRating: rated.length ? rated.reduce((s, x) => s + Number(x.rating), 0) / rated.length : 0, current };
}
/** Copia el total y el progreso de las temporadas a la obra (los usan el resto de pantallas y estadísticas). */
function syncSeasonAggregates(w) {
    if (!hasSeasons(w)) return w;
    const t = seasonTotals(w);
    w.progress = t.progress;
    if (t.total) w[totalField(w.type)] = t.total;
    if (w.type === 'anime') w.seasons = w.seasonsList.length;
    return w;
}
/** Avanza (o retrocede) en la temporada actual. Devuelve { index, finishedSeason }. */
function advanceSeason(w, delta) {
    const list = w.seasonsList;
    let { current } = seasonTotals(w);
    if (delta < 0) {
        // Retrocede en la última temporada con progreso
        for (let i = list.length - 1; i >= 0; i--) if ((Number(list[i].progress) || 0) > 0) { current = i; break; }
    }
    const s = list[current];
    const eps = Number(s.episodes) || 0;
    let next = Math.max(0, (Number(s.progress) || 0) + delta);
    if (eps) next = Math.min(next, eps);
    s.progress = next;
    syncSeasonAggregates(w);
    return { index: current, finishedSeason: delta > 0 && eps > 0 && next >= eps };
}
/** Estado de una temporada a partir de su progreso. */
function seasonStatus(s) {
    const eps = Number(s.episodes) || 0, p = Number(s.progress) || 0;
    return eps && p >= eps ? 'terminado' : p > 0 ? 'en curso' : 'pendiente';
}
/** Texto corto para la tarjeta: "T2 3/12". */
function seasonLabel(w) {
    if (!hasSeasons(w)) return '';
    const { current } = seasonTotals(w);
    const s = w.seasonsList[current];
    const prefix = w.type === 'book' ? 'Libro ' : w.type === 'manhwa' ? 'Parte ' : 'T';
    return `${prefix}${s.number || current + 1} ${Number(s.progress) || 0}/${Number(s.episodes) || '?'}`;
}

// ============================================================
// NOTAS CON TIPOS Y RESEÑAS
// ============================================================
const NOTE_TYPES = {
    comentario: { icon: '💬', label: 'Comentario' },
    resena: { icon: '⭐', label: 'Reseña' },
    teoria: { icon: '🔮', label: 'Teoría' },
    cita: { icon: '❝', label: 'Cita' },
    recordatorio: { icon: '⏰', label: 'Recordatorio' }
};
const REVIEW_CRITERIA = [['historia', 'Historia'], ['personajes', 'Personajes'], ['arte', 'Arte / animación'], ['musica', 'Banda sonora'], ['final', 'Final']];
const noteType = n => (NOTE_TYPES[n.type] ? n.type : 'comentario');
function reviewAverage(scores) {
    const vals = REVIEW_CRITERIA.map(([k]) => Number((scores || {})[k]) || 0).filter(v => v > 0);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
}
/** Notas de una obra: primero las fijadas, luego de la más nueva a la más antigua. */
function notesOfWork(notes, workId, type = 'all') {
    return notes.filter(n => n.workId === workId && (type === 'all' || noteType(n) === type))
        .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0));
}
const wordCount = text => (String(text || '').trim().match(/\S+/g) || []).length;

// ============================================================
// RE-VISIONADOS / RELECTURAS
// ============================================================
/** Veces que se ha terminado (la primera + las repeticiones). */
function timesCompleted(w) {
    return (w.status === 'terminado' || (w.rereads || []).length ? 1 : 0) + (w.rereads || []).length;
}
/** Etiqueta para la tarjeta: "🔁 2ª vez" mientras se repite, "🔁 ×3" si ya se terminó varias veces. */
function rereadBadge(w) {
    const n = (w.rereads || []).length;
    if (w.rereading) return `🔁 ${n + 2}ª vez`;
    if (n) return `🔁 ×${n + 1}`;
    return '';
}
/** Apunta que se ha terminado otra vez. */
function addReread(w, { date, rating = 0, note = '' } = {}) {
    w.rereads = [...(w.rereads || []), { date, rating: Number(rating) || 0, ...(note ? { note } : {}) }];
    w.rereading = false;
    return w;
}
/** Obras más repetidas: [{ work, times }]. */
function mostRevisited(works, limit = 5) {
    return works.filter(w => (w.rereads || []).length)
        .map(w => ({ work: w, times: (w.rereads || []).length + 1 }))
        .sort((a, b) => b.times - a.times || String(a.work.title).localeCompare(String(b.work.title), 'es'))
        .slice(0, limit);
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        tagKey, tagStats, dedupeTags, renameTag, removeTag, suggestTagFixes, suggestTagsFor,
        coupleWorks, coupleSummary, relatedCouples, couplesForPerson, rankCouples,
        hasSeasons, totalField, seasonTotals, syncSeasonAggregates, advanceSeason, seasonStatus, seasonLabel,
        NOTE_TYPES, REVIEW_CRITERIA, noteType, reviewAverage, notesOfWork, wordCount,
        timesCompleted, rereadBadge, addReread, mostRevisited
    };
}
