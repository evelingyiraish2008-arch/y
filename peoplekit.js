/*
 * Mi Mundo · peoplekit.js
 * Vincular personas con obras: buscar a quién te refieres al escribir un nombre,
 * nombres parecidos, seudónimos, varios roles, reparto con personajes y personas huérfanas.
 * Funciones puras (sin DOM). Dependen de utils.js (norm, splitList) y history.js (levenshtein).
 */
'use strict';

/** Campos de una obra que nombran personas y el rol que tiene quien aparece en cada uno. */
const PERSON_FIELDS = { author: 'author', actors: 'actor', directors: 'director', studio: 'studio' };
const PERSON_ROLES = { actor: 'Actor / Actriz', author: 'Autor / Autora', director: 'Director / Directora', studio: 'Estudio' };

/** Nombres por los que se conoce a una persona: el principal y sus otros nombres (seudónimo, nombre real…). */
function personNames(p) {
    return [p.name, ...splitList(p.aliases)].filter(Boolean);
}
/** Clave para comparar nombres: sin tildes, mayúsculas, puntos ni espacios de más. */
const nameKey = s => norm(s).replace(/[.·'’\-_]+/g, ' ').replace(/\s+/g, ' ').trim();
/** Las mismas palabras en otro orden ("Zhan Xiao" y "Xiao Zhan"). */
const tokensKey = s => nameKey(s).split(' ').sort().join(' ');
function personHasName(p, name) {
    const k = nameKey(name);
    return !!k && personNames(p).some(n => nameKey(n) === k);
}
/** Roles de una persona (el principal primero). */
function personRoles(p) {
    return [...new Set([p.type || 'actor', ...(Array.isArray(p.roles) ? p.roles : [])])];
}
/** ¿Se parecen dos nombres lo bastante como para preguntar "¿quizás quisiste decir…?"? */
function namesSimilar(a, b) {
    const x = nameKey(a), y = nameKey(b);
    if (!x || !y || x === y) return false;
    if (tokensKey(a) === tokensKey(b)) return true;
    const d = levenshtein(x, y);
    return d <= Math.max(1, Math.floor(Math.min(x.length, y.length) * 0.25));
}
/**
 * Qué personas encajan con lo que estás escribiendo:
 * exact (nombre igual), partial (contiene lo escrito, máx. 5) y similar (nombres parecidos, máx. 3).
 */
function matchPersons(query, persons, { limit = 5 } = {}) {
    const k = nameKey(query);
    if (!k) return { exact: null, partial: [], similar: [] };
    const exact = persons.find(p => personHasName(p, query)) || null;
    const partial = persons
        .filter(p => p !== exact && personNames(p).some(n => nameKey(n).includes(k) || nameKey(n).split(' ').some(w => w.startsWith(k))))
        .sort((a, b) => (nameKey(a.name).startsWith(k) ? 0 : 1) - (nameKey(b.name).startsWith(k) ? 0 : 1) || a.name.localeCompare(b.name, 'es'))
        .slice(0, limit);
    const taken = new Set([exact, ...partial]);
    const similar = k.length < 3 ? [] : persons.filter(p => !taken.has(p) && personNames(p).some(n => namesSimilar(n, query))).slice(0, 3);
    return { exact, partial, similar };
}
/** Personas con un nombre parecido (para avisar antes de crear un duplicado). */
function similarPersons(name, persons, excludeId = null) {
    return persons.filter(p => p.id !== excludeId && personNames(p).some(n => nameKey(n) === nameKey(name) || namesSimilar(n, name)));
}
/** Separa una lista pegada ("A, B y C" o una por línea) en nombres. */
function splitNames(str) {
    return String(str || '').split(/\s*(?:[,;\n]|\s+y\s+|\s+&\s+|\s+and\s+)\s*/i).map(s => s.trim()).filter(Boolean);
}

/** ¿Aparece la persona en la obra? Por su id vinculado o por cualquiera de sus nombres en los campos de personas. */
function workHasPerson(w, p) {
    if (Array.isArray(w.personIds) && w.personIds.includes(p.id)) return true;
    return Object.keys(PERSON_FIELDS).some(f => splitList(w[f]).some(n => personHasName(p, n)));
}
const worksOfPerson = (p, works) => works.filter(w => workHasPerson(w, p));
/** Ids de las personas que nombra una obra (por nombre o seudónimo). */
function linkPersonIds(w, persons) {
    const ids = new Set();
    Object.keys(PERSON_FIELDS).forEach(f => splitList(w[f]).forEach(n => { const p = persons.find(x => personHasName(x, n)); if (p) ids.add(p.id); }));
    return [...ids];
}
/** Reparto de una obra: cada persona vinculada con su rol y, si lo hay, el personaje que interpreta. */
function castOf(w, persons) {
    const out = [];
    Object.entries(PERSON_FIELDS).forEach(([f, role]) => splitList(w[f]).forEach(name => {
        const p = persons.find(x => (w.personIds || []).includes(x.id) && personHasName(x, name)) || persons.find(x => personHasName(x, name)) || null;
        const chars = p ? (w.characters || []).filter(c => c.personId === p.id).map(c => c.name) : [];
        out.push({ name, role, person: p, characters: chars });
    }));
    return out;
}
/** Cambia el nombre de una persona en las obras donde aparece (tras renombrarla). Devuelve cuántas obras cambió. */
function renamePersonInWorks(works, p, oldName, newName) {
    const k = nameKey(oldName);
    let n = 0;
    works.forEach(w => {
        let touched = false;
        Object.keys(PERSON_FIELDS).forEach(f => {
            const list = splitList(w[f]);
            if (!list.some(x => nameKey(x) === k)) return;
            w[f] = list.map(x => (nameKey(x) === k ? newName : x)).join(', ');
            touched = true;
        });
        if (touched) n++;
    });
    return n;
}
/** Quita a una persona de las obras (sus nombres y su vínculo). Devuelve las obras cambiadas. */
function removePersonFromWorks(works, p) {
    const changed = [];
    works.forEach(w => {
        let touched = false;
        Object.keys(PERSON_FIELDS).forEach(f => {
            const list = splitList(w[f]);
            const keep = list.filter(x => !personHasName(p, x));
            if (keep.length !== list.length) { w[f] = keep.join(', '); touched = true; }
        });
        if (Array.isArray(w.personIds) && w.personIds.includes(p.id)) { w.personIds = w.personIds.filter(id => id !== p.id); touched = true; }
        (w.characters || []).forEach(c => { if (c.personId === p.id) { delete c.personId; touched = true; } });
        if (touched) changed.push(w);
    });
    return changed;
}
/**
 * Personas huérfanas: creadas desde el formulario de una obra (autoCreated) y que ya no aparecen
 * en ninguna obra, pareja ni personaje. Las que añadiste a mano nunca se consideran huérfanas.
 */
function orphanPersons(data) {
    const inCouples = new Set((data.couples || []).flatMap(c => [c.personA, c.personB]).filter(Boolean));
    const inChars = new Set((data.works || []).flatMap(w => (w.characters || []).map(c => c.personId)).filter(Boolean));
    return (data.persons || []).filter(p => p.autoCreated && !inCouples.has(p.id) && !inChars.has(p.id) && !worksOfPerson(p, data.works || []).length);
}
/** Todos los personajes de todas las obras, con su obra y su intérprete. */
function allCharacters(works, persons) {
    const out = [];
    works.forEach(w => (w.characters || []).forEach(c => out.push({ ...c, work: w, person: persons.find(p => p.id === c.personId) || null })));
    return out.sort((a, b) => (b.fav ? 1 : 0) - (a.fav ? 1 : 0) || a.name.localeCompare(b.name, 'es'));
}
/** Iniciales para el avatar de quien no tiene foto ("Xiao Zhan" → "XZ"). */
function initials(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    return ((parts[0] || '?')[0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

/**
 * ¿El título de una foto encontrada corresponde a esta persona? Todas las palabras del nombre
 * deben aparecer (en cualquier orden). Así no se guarda la foto de otra persona por error.
 */
function titleMatchesName(title, name) {
    const words = new Set(nameKey(title).split(' '));
    const need = nameKey(name).split(' ').filter(w => w.length > 1);
    return need.length > 0 && need.every(w => words.has(w));
}
/**
 * Nombres de las obras que todavía no tienen ficha en Personas (autor, actores y directores).
 * Devuelve [{ name, role, works }] sin repetir, con el rol del primer campo donde aparece.
 */
function missingPersons(works, persons) {
    const out = new Map();
    works.forEach(w => Object.entries(PERSON_FIELDS).forEach(([f, role]) => {
        if (f === 'studio') return; // los estudios se quedan como texto
        splitList(w[f]).forEach(name => {
            if (persons.some(p => personHasName(p, name))) return;
            const k = nameKey(name);
            if (!k) return;
            if (!out.has(k)) out.set(k, { name, role, works: 0 });
            out.get(k).works++;
        });
    }));
    return [...out.values()].sort((a, b) => b.works - a.works || a.name.localeCompare(b.name, 'es'));
}
/**
 * Personajes que trae una fuente ({ name, character, characterRole }) que la obra aún no tiene.
 * Se unen a su intérprete con personId. No repite personajes por nombre.
 */
function newCharacters(existing, metaPeople, persons, makeId) {
    const have = new Set((existing || []).map(c => nameKey(c.name)));
    const out = [];
    (metaPeople || []).forEach(m => {
        if (!m.character || have.has(nameKey(m.character))) return;
        const p = persons.find(x => personHasName(x, m.name));
        have.add(nameKey(m.character));
        out.push({ id: makeId(), name: m.character, role: m.characterRole || 'protagonista', ...(p ? { personId: p.id } : {}) });
    });
    return out;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        PERSON_FIELDS, PERSON_ROLES, personNames, nameKey, personHasName, personRoles, namesSimilar, matchPersons, similarPersons, splitNames,
        workHasPerson, worksOfPerson, linkPersonIds, castOf, renamePersonInWorks, removePersonFromWorks, orphanPersons, allCharacters, initials,
        titleMatchesName, missingPersons, newCharacters
    };
}
