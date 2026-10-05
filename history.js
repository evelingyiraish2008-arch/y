/*
 * Mi Mundo · history.js
 * Papelera, deshacer/rehacer, versiones de cada obra, duplicar y títulos parecidos.
 * Funciones puras (sin DOM): reciben los datos y la fecha actual. Dependen de utils.js.
 *
 * Papelera: lo borrado se queda en su misma colección con `trashedAt` (así se sincroniza sin cambiar la
 * base de datos de la nube). En memoria vive aparte, en data.trash[colección], para que el resto de la app no lo vea.
 */
'use strict';

const TRASH_DAYS = 30;
const RECORD_KINDS = ['works', 'persons', 'couples', 'collections', 'notes'];
const MAX_VERSIONS = 10;
const VERSION_MERGE_MS = 5 * 60000;
/** Campos que no cuentan como "cambio" en el historial de una obra. */
const VERSION_IGNORED = new Set(['updatedAt', 'createdAt', 'activity', 'versions', 'sample', 'note', 'trashedAt', 'trashInfo', 'personIds', 'mediaSources', 'galleryInfo']);

const recordKey = (kind, id) => `${kind}/${id}`;

/** Todos los registros (vivos y en la papelera) y los ajustes como JSON, por clave "colección/id". */
function indexRecords(data) {
    const map = new Map();
    RECORD_KINDS.forEach(kind => {
        (data[kind] || []).forEach(item => map.set(recordKey(kind, item.id), JSON.stringify(item)));
        ((data.trash && data.trash[kind]) || []).forEach(item => map.set(recordKey(kind, item.id), JSON.stringify(item)));
    });
    map.set('settings/main', JSON.stringify(data.settings || {}));
    return map;
}

/** Qué registros cambiaron entre dos índices: [{ key, before, after }] (null = no existía). */
function diffIndex(before, after) {
    const out = [];
    after.forEach((json, key) => { if (before.get(key) !== json) out.push({ key, before: before.has(key) ? before.get(key) : null, after: json }); });
    before.forEach((json, key) => { if (!after.has(key)) out.push({ key, before: json, after: null }); });
    return out;
}

function ensureTrash(data) {
    if (!data.trash) data.trash = {};
    RECORD_KINDS.forEach(k => { if (!Array.isArray(data.trash[k])) data.trash[k] = []; });
    return data.trash;
}
/** Quita un registro de su lista y de la papelera. Devuelve el registro quitado o null. */
function removeRecord(data, kind, id) {
    let found = null;
    [data[kind], ensureTrash(data)[kind]].forEach(list => {
        const i = list.findIndex(x => x.id === id);
        if (i >= 0) found = list.splice(i, 1)[0];
    });
    return found;
}
/** Coloca un registro en su sitio: en la papelera si tiene trashedAt, si no en su lista (manteniendo la posición si ya estaba). */
function placeRecord(data, kind, item) {
    const lists = [data[kind], ensureTrash(data)[kind]];
    const target = item.trashedAt ? lists[1] : lists[0];
    for (const list of lists) {
        const i = list.findIndex(x => x.id === item.id);
        if (i < 0) continue;
        if (list === target) { list[i] = item; return; }
        list.splice(i, 1);
    }
    target.push(item);
}

/** Deshace (side = 'before') o rehace (side = 'after') una lista de cambios de diffIndex. */
function applyChanges(data, changes, side) {
    changes.forEach(c => {
        const json = c[side];
        if (c.key === 'settings/main') { data.settings = JSON.parse(json || '{}'); return; }
        const slash = c.key.indexOf('/');
        const kind = c.key.slice(0, slash), id = c.key.slice(slash + 1);
        if (!RECORD_KINDS.includes(kind)) return;
        if (json === null) removeRecord(data, kind, id);
        else placeRecord(data, kind, JSON.parse(json));
    });
    return data;
}

// ---------- Papelera ----------
/** Manda un registro a la papelera. Para las obras, también sus notas, y recuerda en qué colecciones estaba. */
function trashRecord(data, kind, id, now = Date.now(), info = {}) {
    const item = (data[kind] || []).find(x => x.id === id);
    if (!item) return null;
    const trashInfo = { ...info };
    if (kind === 'works') {
        trashInfo.collections = data.collections.filter(c => c.items.includes(id)).map(c => c.id);
        data.collections.forEach(c => { if (c.items.includes(id)) c.items = c.items.filter(x => x !== id); });
        data.notes.filter(n => n.workId === id).forEach(n => {
            placeRecord(data, 'notes', { ...n, trashedAt: now, trashInfo: { parent: id } });
        });
    }
    const trashed = { ...item, trashedAt: now, trashInfo };
    placeRecord(data, kind, trashed);
    return trashed;
}
/** Saca un registro de la papelera (y lo que se fue con él). */
function restoreRecord(data, kind, id) {
    const trash = ensureTrash(data);
    const item = trash[kind].find(x => x.id === id);
    if (!item) return null;
    const info = item.trashInfo || {};
    const restored = { ...item };
    delete restored.trashedAt;
    delete restored.trashInfo;
    placeRecord(data, kind, restored);
    if (kind === 'works') {
        trash.notes.filter(n => n.trashInfo && n.trashInfo.parent === id).forEach(n => restoreRecord(data, 'notes', n.id));
        (info.collections || []).forEach(cid => {
            const c = data.collections.find(x => x.id === cid);
            if (c && !c.items.includes(id)) c.items.push(id);
        });
    }
    return restored;
}
/** Borra para siempre un registro de la papelera (las notas de una obra se van con ella). */
function purgeRecord(data, kind, id) {
    const trash = ensureTrash(data);
    trash[kind] = trash[kind].filter(x => x.id !== id);
    if (kind === 'works') trash.notes = trash.notes.filter(n => !(n.trashInfo && n.trashInfo.parent === id));
}
/** Borra lo que lleva más de TRASH_DAYS días en la papelera. Devuelve cuántos registros se borraron. */
function purgeExpiredTrash(data, now = Date.now(), days = TRASH_DAYS) {
    const trash = ensureTrash(data);
    const limit = now - days * 86400000;
    let removed = 0;
    RECORD_KINDS.forEach(kind => {
        const before = trash[kind].length;
        trash[kind] = trash[kind].filter(x => Number(x.trashedAt) > limit);
        removed += before - trash[kind].length;
    });
    return removed;
}
function trashDaysLeft(item, now = Date.now(), days = TRASH_DAYS) {
    return Math.max(0, Math.ceil((Number(item.trashedAt) + days * 86400000 - now) / 86400000));
}
/** Elementos de la papelera para mostrar (las notas que se fueron con su obra van dentro de la obra). */
function trashEntries(data) {
    const trash = ensureTrash(data);
    const out = [];
    RECORD_KINDS.forEach(kind => trash[kind].forEach(item => {
        if (kind === 'notes' && item.trashInfo && item.trashInfo.parent && trash.works.some(w => w.id === item.trashInfo.parent)) return;
        out.push({ kind, item, extra: kind === 'works' ? trash.notes.filter(n => n.trashInfo && n.trashInfo.parent === item.id).length : 0 });
    }));
    return out.sort((a, b) => b.item.trashedAt - a.item.trashedAt);
}
function trashCount(data) { return trashEntries(data).length; }

// ---------- Versiones de cada obra ----------
const sameValue = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
/** Campos distintos entre dos versiones de una obra: { campo: [antes, después] }. */
function fieldChanges(prev, next) {
    const out = {};
    new Set([...Object.keys(prev), ...Object.keys(next)]).forEach(f => {
        if (VERSION_IGNORED.has(f)) return;
        const a = prev[f], b = next[f];
        const empty = v => v === undefined || v === null || v === '';
        if (empty(a) && empty(b)) return;
        if (!sameValue(a, b)) out[f] = [a ?? null, b ?? null];
    });
    return out;
}
/**
 * Apunta en cada obra cambiada qué campos cambiaron (máximo MAX_VERSIONS entradas).
 * Los cambios seguidos en pocos minutos se juntan en una sola entrada.
 */
function recordVersions(beforeIndex, data, now = Date.now()) {
    data.works.forEach(w => {
        const prevJson = beforeIndex.get(recordKey('works', w.id));
        if (!prevJson || prevJson === JSON.stringify(w)) return;
        const prev = JSON.parse(prevJson);
        if (prev.trashedAt) return;
        const changes = fieldChanges(prev, w);
        if (!Object.keys(changes).length) return;
        const versions = (w.versions || []).map(v => ({ at: v.at, changes: { ...v.changes } }));
        const last = versions[versions.length - 1];
        if (last && now - last.at < VERSION_MERGE_MS) {
            Object.entries(changes).forEach(([f, [a, b]]) => {
                const old = last.changes[f] ? last.changes[f][0] : a;
                if (sameValue(old, b)) delete last.changes[f]; else last.changes[f] = [old, b];
            });
            last.at = now;
            if (!Object.keys(last.changes).length) versions.pop();
        } else {
            versions.push({ at: now, changes });
        }
        if (versions.length) w.versions = versions.slice(-MAX_VERSIONS);
        else delete w.versions;
    });
}
/** Devuelve la obra como estaba justo antes de la versión `index` (deshaciendo esa y todas las posteriores). */
function workBeforeVersion(work, index) {
    const versions = work.versions || [];
    const out = { ...work };
    for (let i = versions.length - 1; i >= index; i--) {
        Object.entries(versions[i].changes).forEach(([f, [a]]) => {
            if (a === null || a === undefined) delete out[f]; else out[f] = a;
        });
    }
    return out;
}

// ---------- Duplicar ----------
const PLANNED_STATUS = { book: 'quiero leer', manhwa: 'quiero leer', series: 'quiero ver', anime: 'quiero ver' };
/** Copia de una obra sin progreso, fechas, valoración ni historial, como pendiente. Puede cambiar de tipo. */
function duplicateWork(work, { type = work.type, id = generateId(), now = Date.now() } = {}) {
    const copy = JSON.parse(JSON.stringify(work));
    ['versions', 'activity', 'rereads', 'startDate', 'endDate', 'sample', 'locked', 'trashedAt', 'trashInfo', 'note', 'reminder'].forEach(f => delete copy[f]);
    return {
        ...copy, id, type,
        title: type === work.type ? `${work.title} (copia)` : work.title,
        status: PLANNED_STATUS[type], progress: 0, rating: 0, favorite: false,
        createdAt: now, updatedAt: now
    };
}
function duplicatePerson(person, { id = generateId(), now = Date.now() } = {}) {
    const copy = JSON.parse(JSON.stringify(person));
    ['sample', 'trashedAt', 'trashInfo'].forEach(f => delete copy[f]);
    return { ...copy, id, name: `${person.name} (copia)`, createdAt: now, updatedAt: now };
}

// ---------- Títulos parecidos ----------
function simpleTitle(s) { return norm(s).replace(/[^a-z0-9぀-鿿가-힯]+/g, ' ').trim(); }
function levenshtein(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
        const cur = [i];
        for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        prev = cur;
    }
    return prev[b.length];
}
/** Parecido entre dos títulos de 0 a 1 (sin tildes, mayúsculas ni signos). */
function titleSimilarity(a, b) {
    const x = simpleTitle(a), y = simpleTitle(b);
    if (!x || !y) return 0;
    if (x === y) return 1;
    const short = x.length < y.length ? x : y, long = x.length < y.length ? y : x;
    if (short.length >= 5 && (` ${long} `).includes(` ${short} `)) return 0.9;
    return 1 - levenshtein(x, y) / Math.max(x.length, y.length);
}
/** Obras con un título parecido, de más a menos parecida. */
function findSimilarWorks(title, works, { excludeId = null, min = 0.8, limit = 3 } = {}) {
    if (simpleTitle(title).length < 3) return [];
    return works.filter(w => w.id !== excludeId)
        .map(w => ({ work: w, score: titleSimilarity(title, w.title) }))
        .filter(x => x.score >= min)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        TRASH_DAYS, RECORD_KINDS, MAX_VERSIONS, indexRecords, diffIndex, applyChanges, removeRecord, placeRecord, ensureTrash,
        trashRecord, restoreRecord, purgeRecord, purgeExpiredTrash, trashDaysLeft, trashEntries, trashCount,
        fieldChanges, recordVersions, workBeforeVersion, duplicateWork, duplicatePerson,
        levenshtein, titleSimilarity, findSimilarWorks
    };
}
