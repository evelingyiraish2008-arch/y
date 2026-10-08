/*
 * Mi Mundo · enrichkit.js
 * Actualización automática de las obras que ya tienes: busca sus datos por el título y completa
 * SOLO lo que falta (etiquetas nuevas, país, sinopsis, año…), sin tocar nada de lo que escribiste.
 * Funciones puras (sin DOM): dependen de utils.js (splitList, norm), history.js (titleSimilarity) y metadata.js (mergeMetadata, joinTags).
 */
'use strict';

const ENRICH_RECHECK_DAYS = 30;     // una obra revisada no se vuelve a consultar hasta pasado este tiempo
const ENRICH_BATCH = 8;              // obras por tanda (para no saturar los servicios gratuitos)
const ENRICH_MIN_MATCH = 0.85;       // parecido mínimo entre tu título y el resultado para fiarse
const ENRICH_TAG_GOAL = 5;           // menos etiquetas que esto = merece la pena buscar más

/** ¿Le falta algo que las fuentes pueden darle? (o tiene la sinopsis en otro idioma). */
function enrichGaps(w, needsTranslationFn = () => false) {
    const gaps = [];
    if (splitList(w.tags).length < ENRICH_TAG_GOAL) gaps.push('tags');
    if (!w.synopsis) gaps.push('synopsis');
    else if (needsTranslationFn(w.synopsis)) gaps.push('translate');
    if (w.type !== 'book' && !w.country) gaps.push('country');
    if (!w.year) gaps.push('year');
    if (!w.genre) gaps.push('genre');
    return gaps;
}
/** Obras que tocan en la próxima tanda: con huecos y sin revisar en los últimos días. Las más recientes primero. */
function enrichCandidates(works, { now = Date.now(), needsTranslationFn, limit = ENRICH_BATCH } = {}) {
    const stale = ENRICH_RECHECK_DAYS * 86400000;
    return works
        .filter(w => w.title && !w.trashedAt && !(w.enrichedAt && now - w.enrichedAt < stale) && enrichGaps(w, needsTranslationFn).length)
        .sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0))
        .slice(0, limit);
}
/** Cuántas obras quedan por revisar en total (para decir "quedan 12"). */
const enrichPending = (works, opts = {}) => enrichCandidates(works, { ...opts, limit: Infinity }).length;

/**
 * Resultado de la búsqueda que corresponde a la obra, o null si no hay uno claro.
 * Exige un título casi igual (también el alternativo) y, si los dos traen año, que no difieran más de 1.
 */
function pickBestMatch(work, results, sim = titleSimilarity) {
    let best = null, bestScore = 0;
    (results || []).forEach(r => {
        const score = Math.max(sim(work.title, r.title), r.altTitle ? sim(work.title, r.altTitle) : 0);
        if (score < ENRICH_MIN_MATCH) return;
        if (Number(work.year) && Number(r.year) && Math.abs(Number(work.year) - Number(r.year)) > 1) return;
        const total = score + (Number(work.year) && Number(r.year) === Number(work.year) ? 0.05 : 0);
        if (total > bestScore) { best = r; bestScore = total; }
    });
    return best;
}
/**
 * Qué se le añade a la obra: lo que tiene vacío + etiquetas nuevas (las suyas se conservan siempre).
 * No cambia el título, el tipo (película/serie), si es BL ni nada que ya tuviera escrito (progreso, totales…).
 */
function enrichPatch(work, meta, mergeFn = mergeMetadata, joinFn = joinTags) {
    const patch = mergeFn(work, meta, { overwrite: false });
    ['title', 'seriesType', 'seasons', 'bl'].forEach(f => delete patch[f]);
    if (meta.tags) {
        const joined = joinFn(work.tags, splitList(meta.tags));
        if (joined && joined !== String(work.tags || '').trim()) patch.tags = joined; else delete patch.tags;
    }
    return patch;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ENRICH_RECHECK_DAYS, ENRICH_BATCH, ENRICH_MIN_MATCH, enrichGaps, enrichCandidates, enrichPending, pickBestMatch, enrichPatch };
}
