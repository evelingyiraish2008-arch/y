/*
 * Mi Mundo · people.js
 * Personas vinculadas a las obras:
 *  - Autor, actores y directores se escriben como "chips": al teclear sugiere las personas que ya tienes,
 *    nombres parecidos o crearla al momento (con foto buscada en internet si quieres).
 *  - Al guardar, la obra queda unida a esas personas por su id (aunque luego cambies el nombre).
 *  - Reparto con personajes, pestaña "Personajes", personas huérfanas y ajustes de auto-vinculación.
 * La lógica pura está en peoplekit.js. Se carga antes que app.js.
 */
'use strict';

const CHIP_FIELDS = { author: 'author', actors: 'actor', directors: 'director' };
const chipState = {}; // campo → [{ name, id }]
let chipActive = { field: null, index: -1, items: [] };
let personsCreatedInForm = new Set();
const linkSetting = key => {
    const s = appData.settings || {};
    return { suggest: s.linkSuggest !== false, autoCreate: !!s.linkAutoCreate, photoAuto: !!s.photoAuto, photoAsk: s.photoAsk !== false, photoSource: s.photoSource || 'auto' }[key];
};

// ============================================================
// 1. CAMPO CON CHIPS
// ============================================================
function chipInputHtml(field, placeholder) {
    return `<div class="chip-input" data-chip-field="${field}">
        <div class="chip-box"><span class="pchips"></span>
            <input type="text" class="chip-entry" id="chip_${field}" placeholder="${esc(placeholder)}" autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="chipsug_${field}" aria-label="${esc(placeholder)}">
        </div>
        <input type="text" hidden data-field="${field}" id="f_${field}" data-chip-value>
        <div class="chip-suggest" id="chipsug_${field}" role="listbox" hidden></div>
        <div class="chip-note" hidden></div>
    </div>`;
}
function mountChipInputs(root = document) {
    root.querySelectorAll('[data-chip-mount]').forEach(el => { el.outerHTML = chipInputHtml(el.dataset.chipMount, el.dataset.placeholder || 'Escribe un nombre…'); });
}
const chipBox = field => document.querySelector(`[data-chip-field="${field}"]`);
/** Persona para un nombre: primero las ya vinculadas a la obra que editas, luego cualquiera con ese nombre o seudónimo. */
function resolvePersonName(name, preferIds = []) {
    return appData.persons.find(p => preferIds.includes(p.id) && personHasName(p, name)) || appData.persons.find(p => personHasName(p, name)) || null;
}
/** Vuelve a leer los nombres del campo oculto (al abrir el formulario o al rellenar datos automáticamente). */
function refreshChipInputs() {
    const w = editingWorkId && getWorkById(editingWorkId);
    const prefer = (w && w.personIds) || [];
    Object.keys(CHIP_FIELDS).forEach(f => {
        const input = $('f_' + f);
        if (!input) return;
        chipState[f] = splitList(input.value).map(name => { const p = resolvePersonName(name, prefer); return { name, id: p ? p.id : null }; });
        renderChips(f);
        const entry = $('chip_' + f);
        if (entry) entry.value = '';
        hideChipSuggest(f);
        setChipNote(f, '');
    });
}
function renderChips(field) {
    const box = chipBox(field);
    if (!box) return;
    box.querySelector('.pchips').innerHTML = (chipState[field] || []).map((c, i) => {
        const p = c.id && getPersonById(c.id);
        return `<span class="pchip ${p ? '' : 'is-text'}" title="${p ? 'Ver ficha de ' + esc(p.name) : 'Solo texto (sin ficha)'}">
            ${p ? `<button type="button" class="pchip-open" data-act="chip-open" data-id="${p.id}">${personAvatar(p, 22)}<span>${esc(c.name)}</span></button>`
                : `<span class="pchip-open"><span class="pchip-initials">${esc(initials(c.name))}</span><span>${esc(c.name)}</span></span><button type="button" class="pchip-link" data-act="chip-create" data-id="${field}" data-item="${i}" title="Crear su ficha">＋</button>`}
            <button type="button" class="pchip-x" data-act="chip-remove" data-id="${field}" data-item="${i}" aria-label="Quitar ${esc(c.name)}">×</button></span>`;
    }).join('');
}
/** Foto redonda de una persona o sus iniciales. */
function personAvatar(p, size = 28) {
    const src = resolveImageSrc(p.image || '');
    return src ? `<img class="pavatar" src="${esc(src)}" alt="" width="${size}" height="${size}" loading="lazy" data-ph="person">`
        : `<span class="pavatar pchip-initials" style="width:${size}px;height:${size}px">${esc(initials(p.name))}</span>`;
}
/** Guarda los chips en el campo oculto (y avisa con 'input' para el borrador). */
function writeChips(field) {
    const input = $('f_' + field);
    input.value = (chipState[field] || []).map(c => c.name).join(', ');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    renderChips(field);
}
function addChip(field, name, id = null) {
    const list = chipState[field] = chipState[field] || [];
    const clean = String(name || '').trim();
    if (!clean) return false;
    if (list.some(c => (id && c.id === id) || nameKey(c.name) === nameKey(clean))) { setChipNote(field, `“${clean}” ya está añadido`); return false; }
    list.push({ name: id ? getPersonById(id).name : clean, id });
    writeChips(field);
    return true;
}
function setChipNote(field, html) {
    const el = chipBox(field) && chipBox(field).querySelector('.chip-note');
    if (!el) return;
    el.innerHTML = html;
    el.hidden = !html;
}

// ---------- Sugerencias al escribir ----------
function chipSuggestions(field, q) {
    const role = CHIP_FIELDS[field];
    const already = new Set((chipState[field] || []).flatMap(c => [c.id, nameKey(c.name)]));
    const { exact, partial, similar } = matchPersons(q, appData.persons);
    const known = [exact, ...partial].filter(Boolean).slice(0, 5);
    const items = [];
    known.forEach(p => items.push({ kind: 'person', p, added: already.has(p.id) }));
    if (!exact) items.push({ kind: 'create', name: q.trim(), role });
    similar.forEach(p => items.push({ kind: 'similar', p, added: already.has(p.id) }));
    return items;
}
function showChipSuggest(field) {
    const entry = $('chip_' + field), box = $('chipsug_' + field);
    const q = entry.value.trim();
    if (!linkSetting('suggest') || q.length < 2) { hideChipSuggest(field); return; }
    const items = chipSuggestions(field, q);
    chipActive = { field, index: items.findIndex(it => !it.added), items };
    const row = (it, i) => {
        if (it.kind === 'create') return `<button type="button" class="chip-opt create" role="option" data-act="chip-pick" data-id="${field}" data-item="${i}">＋ Crear “${esc(it.name)}” como ${esc((PERSON_ROLES[it.role] || '').split(' /')[0].toLowerCase())}</button>`;
        const p = it.p, n = worksOfPerson(p, appData.works).length;
        return `<button type="button" class="chip-opt" role="option" data-act="chip-pick" data-id="${field}" data-item="${i}" ${it.added ? 'disabled' : ''}>
            ${personAvatar(p, 30)}<span class="info"><b>${esc(p.name)}</b><small>${esc(personRoles(p).map(r => (PERSON_ROLES[r] || r).split(' /')[0]).join(', '))} · ${n} ${n === 1 ? 'obra' : 'obras'}${p.aliases ? ' · ' + esc(p.aliases) : ''}</small></span>
            ${it.added ? '<span class="chip chip-muted">Ya añadido</span>' : ''}</button>`;
    };
    const known = items.map((it, i) => [it, i]).filter(([it]) => it.kind === 'person');
    const create = items.map((it, i) => [it, i]).filter(([it]) => it.kind === 'create');
    const similar = items.map((it, i) => [it, i]).filter(([it]) => it.kind === 'similar');
    box.innerHTML = (known.length ? `<div class="chip-sec">Ya tienes registradas</div>${known.map(([it, i]) => row(it, i)).join('')}` : '')
        + (create.length ? `<div class="chip-sec">Crear como nueva</div>${create.map(([it, i]) => row(it, i)).join('')}` : '')
        + (similar.length ? `<div class="chip-sec">¿Quizás quisiste decir…?</div>${similar.map(([it, i]) => row(it, i)).join('')}` : '');
    box.hidden = false;
    entry.setAttribute('aria-expanded', 'true');
    highlightChipOption();
}
function hideChipSuggest(field) {
    const box = $('chipsug_' + field);
    if (box) box.hidden = true;
    const entry = $('chip_' + field);
    if (entry) entry.setAttribute('aria-expanded', 'false');
    if (chipActive.field === field) chipActive = { field: null, index: -1, items: [] };
}
function highlightChipOption() {
    const box = $('chipsug_' + chipActive.field);
    if (!box) return;
    box.querySelectorAll('.chip-opt').forEach(b => b.classList.toggle('is-active', Number(b.dataset.item) === chipActive.index));
    const on = box.querySelector('.chip-opt.is-active');
    if (on) on.scrollIntoView({ block: 'nearest' });
}
function pickChipItem(field, it) {
    if (!it || it.added) return;
    $('chip_' + field).value = '';
    hideChipSuggest(field);
    setChipNote(field, '');
    if (it.kind === 'create') { if (linkSetting('autoCreate')) createPersonsQuick(field, [it.name]); else openQuickPerson(field, it.name); return; }
    addChip(field, it.p.name, it.p.id);
    $('chip_' + field).focus();
}
/** Enter: el nombre exacto; si no, la primera coincidencia; si no hay ninguna, crearla. */
function commitChipEntry(field) {
    const entry = $('chip_' + field);
    const q = entry.value.trim();
    if (!q) return;
    if (chipActive.field === field && chipActive.index >= 0) { pickChipItem(field, chipActive.items[chipActive.index]); return; }
    const { exact, partial } = matchPersons(q, appData.persons);
    const p = exact || partial[0];
    if (p) { entry.value = ''; hideChipSuggest(field); addChip(field, p.name, p.id); return; }
    hideChipSuggest(field);
    entry.value = '';
    if (linkSetting('autoCreate')) createPersonsQuick(field, [q]);
    else openQuickPerson(field, q);
}
/** Pegar o escribir varios nombres separados por comas. */
function addChipNames(field, names, { create = true } = {}) {
    const fresh = [];
    names.forEach(n => {
        const p = resolvePersonName(n);
        if (p) addChip(field, p.name, p.id); else if (!(chipState[field] || []).some(c => nameKey(c.name) === nameKey(n))) fresh.push(n);
    });
    if (!fresh.length) return;
    if (create && linkSetting('autoCreate')) { createPersonsQuick(field, fresh); return; }
    fresh.forEach(n => (chipState[field] = chipState[field] || []).push({ name: n, id: null }));
    writeChips(field);
    setChipNote(field, `${fresh.length} ${fresh.length === 1 ? 'persona nueva' : 'personas nuevas'} (${esc(fresh.join(', '))}). ¿Crear sus fichas?
        <button type="button" class="btn btn-primary btn-sm" data-act="chip-create-all" data-id="${field}">Crear ${fresh.length === 1 ? 'su ficha' : 'todas'}</button>
        <button type="button" class="btn btn-ghost btn-sm" data-act="chip-note-close" data-id="${field}">Dejar solo el nombre</button>`);
}
/** Crea fichas para nombres sueltos sin preguntar más (con el rol del campo). */
function createPersonsQuick(field, names) {
    const role = CHIP_FIELDS[field];
    const created = [];
    mutate(() => {
        names.forEach(n => {
            const p = { id: generateId(), name: n.trim(), type: role, autoCreated: true, linkPending: true, createdAt: Date.now() };
            appData.persons.push(p);
            created.push(p);
        });
    }, `👥 ${names.length === 1 ? 'Persona creada' : names.length + ' personas creadas'}`, { label: 'Crear personas' });
    created.forEach(p => {
        personsCreatedInForm.add(p.id);
        const c = (chipState[field] || []).find(x => !x.id && nameKey(x.name) === nameKey(p.name));
        if (c) c.id = p.id; else (chipState[field] = chipState[field] || []).push({ name: p.name, id: p.id });
    });
    writeChips(field);
    setChipNote(field, '');
    if (linkSetting('photoAuto') && !linkSetting('photoAsk')) created.forEach(p => autoPhoto(p));
}

// ============================================================
// 2. CREAR UNA PERSONA AL MOMENTO
// ============================================================
let quickPerson = null;
function openQuickPerson(field, name, chipIndex = null) {
    const box = chipBox(field);
    if (!box) return;
    closeQuickPerson();
    quickPerson = { field, chipIndex };
    const similar = similarPersons(name, appData.persons).slice(0, 2);
    const pop = document.createElement('div');
    pop.className = 'quick-person';
    pop.id = 'quickPerson';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', 'Crear persona');
    pop.innerHTML = `<div class="quick-person-head">👤 Nueva persona</div>
        ${similar.length ? `<div class="quick-similar">💡 ¿No será ${similar.map(p => `<button type="button" class="link-btn" data-act="quick-use" data-id="${p.id}">${esc(p.name)}</button>`).join(' o ')}?</div>` : ''}
        <div class="form-grid">
            <label class="field span-2"><span>Nombre</span><input type="text" class="text-input" id="qpName" value="${esc(name)}"></label>
            <label class="field"><span>Rol</span><select class="text-input" id="qpRole">${Object.entries(PERSON_ROLES).map(([k, l]) => `<option value="${k}" ${k === CHIP_FIELDS[field] ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
            <label class="field"><span>Nacionalidad <small class="muted">(opcional)</small></span><input type="text" class="text-input" id="qpNat" placeholder="Corea del Sur" list="dlCountries"></label>
        </div>
        <div class="quick-person-actions">
            <button type="button" class="btn btn-primary btn-sm" data-act="quick-create" data-id="photo">🔍 Buscar foto automáticamente</button>
            <button type="button" class="btn btn-secondary btn-sm" data-act="quick-create" data-id="nophoto">Sin foto por ahora</button>
            <button type="button" class="btn btn-ghost btn-sm" data-act="quick-cancel">Cancelar</button>
        </div>`;
    box.appendChild(pop);
    setTimeout(() => { const n = $('qpName'); if (n) { n.focus(); n.select(); } }, 30);
}
function closeQuickPerson() {
    const el = $('quickPerson');
    if (el) el.remove();
    quickPerson = null;
}
FEATURE_ACTIONS['quick-cancel'] = () => { const f = quickPerson && quickPerson.field; closeQuickPerson(); if (f) $('chip_' + f).focus(); };
FEATURE_ACTIONS['quick-use'] = id => {
    const { field, chipIndex } = quickPerson;
    closeQuickPerson();
    if (chipIndex !== null && chipState[field][chipIndex]) { chipState[field].splice(chipIndex, 1); writeChips(field); }
    addChip(field, getPersonById(id).name, id);
};
FEATURE_ACTIONS['quick-create'] = mode => {
    if (!quickPerson) return;
    const { field, chipIndex } = quickPerson;
    const name = $('qpName').value.trim();
    if (!name) { showToast('✍️ Escribe el nombre', 'error'); return; }
    const exact = resolvePersonName(name);
    if (exact) { FEATURE_ACTIONS['quick-use'](exact.id); showToast(`👤 ${exact.name} ya estaba en tus personas`); return; }
    const p = { id: generateId(), name, type: $('qpRole').value, autoCreated: true, linkPending: true, createdAt: Date.now() };
    const nat = $('qpNat').value.trim();
    if (nat) p.nationality = nat;
    closeQuickPerson();
    mutate(() => { appData.persons.push(p); }, `👤 ${name} creada`, { label: `Crear a ${name}` });
    personsCreatedInForm.add(p.id);
    if (chipIndex !== null && chipState[field][chipIndex]) chipState[field][chipIndex] = { name, id: p.id };
    else (chipState[field] = chipState[field] || []).push({ name, id: p.id });
    writeChips(field);
    if (mode === 'photo') openPhotoSearch(p);
    else if (linkSetting('photoAuto')) { if (linkSetting('photoAsk')) openPhotoSearch(p); else autoPhoto(p); }
    else $('chip_' + field).focus();
};

// ---------- Foto de la persona ----------
/** Busca fotos de la persona en varias fuentes y guarda la elegida recortada en cuadrado (400×400). */
function openPhotoSearch(p) {
    openImageSearch({ use: 'photo', query: p.name, ctx: 'persons', onPick: src => savePersonPhoto(p.id, src), onPickFile: file => savePersonPhoto(p.id, null, file) });
}
async function savePersonPhoto(id, src, file = null) {
    const p = getPersonById(id);
    if (!p) return;
    try {
        let ref = src;
        const local = file ? URL.createObjectURL(file) : null;
        try {
            if (local) ref = await store.saveImage((await prepareImage(local, 'avatar')).blob);
            else if (mediaSetting('download') && /^https?:/i.test(src)) ref = await store.saveImage((await downloadImage(src, 'avatar')).blob);
        } catch (e) { /* la web no deja descargarla: se queda el enlace */ } finally { if (local) URL.revokeObjectURL(local); }
        mutate(() => { p.image = ref; p.updatedAt = Date.now(); }, `📸 Foto de ${p.name} guardada`, { label: `Foto de ${p.name}` });
        Object.keys(CHIP_FIELDS).forEach(renderChips);
        if (/^idb:/.test(ref)) showToast(`📸 Foto de ${p.name} guardada`, 'info', 4500, { label: '✂️ Recortar', run: () => openCropper(resolveImageSrc(ref), 'avatar', async blob => { const r = await store.saveImage(blob); mutate(() => { p.image = r; }, '✂️ Foto recortada'); Object.keys(CHIP_FIELDS).forEach(renderChips); }) });
    } catch (e) { showToast('⚠️ No se pudo guardar la foto', 'error'); }
}
/** Foto automática: el primer resultado de la fuente preferida (sin preguntar). */
async function autoPhoto(p) {
    const order = activeSources(appData.settings, 'photo');
    const pref = linkSetting('photoSource');
    const srcs = pref !== 'auto' && order.includes(pref) ? [pref, ...order.filter(k => k !== pref)] : order;
    for (const k of srcs) {
        try {
            const list = await SOURCE_FETCH[k](p.name, 'photo', 0);
            const hit = list.find(r => r.o !== 'horizontal') || list[0];
            if (hit) { await savePersonPhoto(p.id, hit.src); return true; }
        } catch (e) { /* se prueba la siguiente fuente */ }
    }
    showToast(`🫥 No encontré foto de ${p.name}. Puedes subir una o se verán sus iniciales.`);
    return false;
}

// ============================================================
// 3. AL GUARDAR, CERRAR O BORRAR
// ============================================================
/** Ids de las personas del formulario (chips) más las que se reconocen por nombre en el resto de campos. */
function formPersonIds(data) {
    const ids = new Set();
    Object.keys(CHIP_FIELDS).forEach(f => {
        const wrap = chipBox(f) && chipBox(f).closest('[data-types]');
        if (wrap && wrap.hidden) return;
        (chipState[f] || []).forEach(c => { if (c.id && getPersonById(c.id)) ids.add(c.id); });
    });
    linkPersonIds(data, appData.persons).forEach(id => ids.add(id));
    return [...ids];
}
/** Al cerrar el formulario sin guardar: las personas creadas en él que no quedaron en ninguna obra. */
function checkFormOrphans() {
    const ids = [...personsCreatedInForm];
    personsCreatedInForm = new Set();
    const orphans = orphanPersons(appData).filter(p => ids.includes(p.id));
    if (!orphans.length) return;
    const n = orphans.length;
    if (confirm(`${n} ${n === 1 ? 'persona creada' : 'personas creadas'} sin obra vinculada (${orphans.map(p => p.name).join(', ')}). ¿Eliminarlas?`)) {
        removePersonsForever(orphans.map(p => p.id), `🧹 ${n === 1 ? 'Persona eliminada' : n + ' personas eliminadas'}`);
    } else mutate(() => orphans.forEach(p => { delete p.linkPending; }), '', { undo: false });
}
/** Al abrir el formulario: personas creadas en una sesión anterior que nunca se guardaron con su obra. */
function offerPendingOrphans() {
    const pending = orphanPersons(appData).filter(p => p.linkPending && !personsCreatedInForm.has(p.id));
    if (!pending.length) return;
    const n = pending.length;
    showToast(`👥 ${n} ${n === 1 ? 'persona creada' : 'personas creadas'} sin obra vinculada. ¿Eliminarlas?`, 'info', 8000, {
        label: 'Eliminar', run: () => removePersonsForever(pending.map(p => p.id), `🧹 ${n === 1 ? 'Persona eliminada' : n + ' personas eliminadas'}`)
    });
    mutate(() => pending.forEach(p => { delete p.linkPending; }), '', { undo: false });
}
function removePersonsForever(ids, msg) {
    mutate(() => { appData.persons = appData.persons.filter(p => !ids.includes(p.id)); }, msg, { label: 'Quitar personas sin obra' });
}
FEATURE_ACTIONS['orphans-clean'] = () => {
    const list = orphanPersons(appData);
    if (!list.length) { showToast('✨ No hay personas huérfanas'); return; }
    if (!confirm(`Estas ${list.length} personas se crearon desde una obra y ya no aparecen en ninguna:\n\n${list.map(p => '• ' + p.name).join('\n')}\n\n¿Eliminarlas? (Se puede deshacer)`)) return;
    removePersonsForever(list.map(p => p.id), `🧹 ${list.length === 1 ? 'Persona huérfana eliminada' : list.length + ' personas huérfanas eliminadas'}`);
    renderLinkPanel();
};

// ============================================================
// 4. REPARTO Y PERSONAJES
// ============================================================
/** Chips de personas en la ficha: foto o iniciales y, si interpreta a alguien, su personaje. */
function castChipsHtml(w, field) {
    const role = PERSON_FIELDS[field];
    return castOf(w, appData.persons).filter(c => c.role === role).map(c => c.person
        ? `<button class="chip person-chip" data-person="${c.person.id}">${personAvatar(c.person, 22)}${esc(c.name)}${c.characters.length ? ` <small>→ ${esc(c.characters.join(', '))}</small>` : ''}</button>`
        : `<span class="chip chip-muted person-chip"><span class="pchip-initials">${esc(initials(c.name))}</span>${esc(c.name)}</span>`).join('');
}
/** "Reparto: Xiao Zhan → Wei Wuxian" con los personajes vinculados a su actor. */
function castLinesHtml(w) {
    const chars = (w.characters || []).filter(c => c.personId && getPersonById(c.personId));
    if (!chars.length) return '';
    return `<div class="cast-lines">${chars.map(c => { const p = getPersonById(c.personId); return `<button class="cast-line" data-person="${p.id}">${personAvatar(p, 26)}<b>${esc(p.name)}</b><span>→</span><span>${esc(c.name)}</span></button>`; }).join('')}</div>`;
}
/** Pestaña "Personajes" de Personas: todos los personajes con su obra y quien los interpreta. */
function charactersListHtml(q = '') {
    const list = allCharacters(appData.works, appData.persons).filter(c => !q || norm(c.name).includes(q) || (c.person && norm(c.person.name).includes(q)) || norm(c.work.title).includes(q));
    if (!list.length) return `<div class="empty-state"><div class="big">🎭</div><h4>Aún no hay personajes</h4><p>Abre una obra → “✨ Más contenido” → “🎭 Personajes” y añade los que te gustan (puedes decir quién los interpreta).</p></div>`;
    return `<div class="characters-grid">${list.map(c => `<article class="character-card">
        <div class="character-avatar">${c.person ? personAvatar(c.person, 56) : '<span class="pchip-initials" style="width:56px;height:56px">🎭</span>'}</div>
        <div class="info"><b>${c.fav ? '♥ ' : ''}${esc(c.name)}</b>
            <small>${esc(CHARACTER_ROLES[c.role] || '')}${c.person ? ` · <button class="link-btn" data-person="${c.person.id}">${esc(c.person.name)}</button>` : ' · sin intérprete'}</small>
            <small><button class="link-btn" data-open="${c.work.id}">${TYPE_META[c.work.type].icon} ${esc(c.work.title)}</button></small></div></article>`).join('')}</div>`;
}
/** Personas para el selector "Interpretado por": primero el reparto de la obra. */
function characterPersonOptions(w) {
    const castIds = new Set(castOf(w, appData.persons).filter(c => c.person).map(c => c.person.id));
    const sorted = appData.persons.slice().sort((a, b) => a.name.localeCompare(b.name, 'es'));
    const cast = sorted.filter(p => castIds.has(p.id)), rest = sorted.filter(p => !castIds.has(p.id));
    const opt = p => `<option value="${p.id}">${esc(p.name)}</option>`;
    return (cast.length ? `<optgroup label="Reparto de esta obra">${cast.map(opt).join('')}</optgroup><optgroup label="Otras personas">${rest.map(opt).join('')}</optgroup>` : rest.map(opt).join(''));
}

// ============================================================
// 5. PERSONALIZAR → AUTO-VINCULACIÓN
// ============================================================
function renderLinkPanel() {
    const box = $('linkPanelBody');
    if (!box) return;
    const s = appData.settings;
    const orphans = orphanPersons(appData).length;
    const toggle = (key, label, on) => `<div class="setting-row"><span>${label}</span><button class="toggle-switch" data-act="link-toggle" data-id="${key}" role="switch" aria-checked="${on}" aria-label="${esc(label)}"></button></div>`;
    const sources = activeSources(s, 'photo');
    box.innerHTML = `
        ${toggle('linkSuggest', '🔎 Sugerir personas mientras escribes', linkSetting('suggest'))}
        ${toggle('linkAutoCreate', '⚡ Crear la ficha automáticamente de los nombres nuevos', linkSetting('autoCreate'))}
        ${toggle('photoAuto', '📸 Buscar foto al crear una persona', linkSetting('photoAuto'))}
        ${linkSetting('photoAuto') ? toggle('photoAsk', '🙋 Dejarme elegir la foto (si no, se usa la primera)', linkSetting('photoAsk')) : ''}
        <label class="field" style="margin-top:8px"><span>Fuente preferida para las fotos</span>
            <select class="text-input" id="settingPhotoSource"><option value="auto">Automática (por orden)</option>${sources.map(k => `<option value="${k}" ${s.photoSource === k ? 'selected' : ''}>${IMAGE_SOURCES[k].icon} ${esc(IMAGE_SOURCES[k].label)}</option>`).join('')}</select></label>
        <button class="btn btn-secondary btn-sm" data-act="orphans-clean" style="margin-top:12px">🧹 Limpiar personas huérfanas${orphans ? ` (${orphans})` : ''}</button>
        <p class="hint">Huérfanas: las que se crearon desde una obra y ya no aparecen en ninguna. Las que añades a mano nunca se tocan.</p>`;
}
FEATURE_ACTIONS['link-toggle'] = key => {
    const defaultsOn = ['linkSuggest', 'photoAsk'];
    const s = appData.settings;
    s[key] = defaultsOn.includes(key) ? s[key] === false : !s[key];
    saveData();
    renderLinkPanel();
};

/** Aviso en la ficha de persona mientras escribes el nombre: "¿Ya la tienes?". */
function updatePersonNameHint() {
    const el = $('personNameHint');
    if (!el) return;
    const id = $('editPersonId').value;
    const sims = $('personName').value.trim().length >= 3 ? similarPersons($('personName').value, appData.persons, id).slice(0, 2) : [];
    el.hidden = !sims.length;
    el.innerHTML = sims.length ? `💡 ¿Ya la tienes? ${sims.map(p => `<button type="button" class="link-btn" data-person="${p.id}">${esc(p.name)}</button>`).join(' ')}` : '';
}

// ============================================================
// 6. EVENTOS
// ============================================================
FEATURE_ACTIONS['chip-open'] = id => openPersonDetail(id);
FEATURE_ACTIONS['chip-remove'] = (field, el) => { chipState[field].splice(Number(el.dataset.item), 1); writeChips(field); };
FEATURE_ACTIONS['chip-pick'] = (field, el) => pickChipItem(field, chipActive.items[Number(el.dataset.item)]);
FEATURE_ACTIONS['chip-create'] = (field, el) => { const c = chipState[field][Number(el.dataset.item)]; if (c) openQuickPerson(field, c.name, Number(el.dataset.item)); };
FEATURE_ACTIONS['chip-create-all'] = field => createPersonsQuick(field, (chipState[field] || []).filter(c => !c.id).map(c => c.name));
FEATURE_ACTIONS['chip-note-close'] = field => setChipNote(field, '');

document.addEventListener('input', e => {
    const t = e.target;
    if (t.classList && t.classList.contains('chip-entry')) {
        const field = t.id.slice(5);
        if (/[,;\n]/.test(t.value)) { const parts = splitNames(t.value); const last = /[,;\n]\s*$/.test(t.value) ? '' : parts.pop() || ''; t.value = last; addChipNames(field, parts); }
        showChipSuggest(field);
        return;
    }
    // El valor cambió desde fuera (rellenar datos, borrador…): se vuelven a pintar los chips
    if (t.dataset && 'chipValue' in t.dataset && !t.dataset.writing) {
        const field = t.dataset.field;
        const names = splitList(t.value);
        const cur = (chipState[field] || []).map(c => c.name);
        if (names.join('|') !== cur.join('|')) { chipState[field] = names.map(n => { const p = resolvePersonName(n); return { name: n, id: p ? p.id : null }; }); renderChips(field); }
    }
    if (t.id === 'settingPhotoSource') { appData.settings.photoSource = t.value; saveData(); }
    if (t.id === 'personName') updatePersonNameHint();
});
document.addEventListener('paste', e => {
    const t = e.target;
    if (!t.classList || !t.classList.contains('chip-entry')) return;
    const text = (e.clipboardData && e.clipboardData.getData('text')) || '';
    const names = splitNames(text);
    if (names.length < 2) return;
    e.preventDefault();
    addChipNames(t.id.slice(5), names);
});
// Teclas en el campo de chips (antes que el Enter del formulario, que guardaría la obra)
document.addEventListener('keydown', e => {
    const t = e.target;
    if (t.id === 'qpName' || t.id === 'qpNat') {
        if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); FEATURE_ACTIONS['quick-create']('nophoto'); }
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); FEATURE_ACTIONS['quick-cancel'](); }
        return;
    }
    if (!t.classList || !t.classList.contains('chip-entry')) return;
    const field = t.id.slice(5);
    const open = chipActive.field === field && !$('chipsug_' + field).hidden;
    if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); commitChipEntry(field); return; }
    if (e.key === 'Escape' && open) { e.preventDefault(); e.stopPropagation(); hideChipSuggest(field); return; }
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && open) {
        e.preventDefault();
        const n = chipActive.items.length;
        let i = chipActive.index;
        for (let k = 0; k < n; k++) { i = (i + (e.key === 'ArrowDown' ? 1 : -1) + n) % n; if (!chipActive.items[i].added) break; }
        chipActive.index = i;
        highlightChipOption();
        return;
    }
    if (e.key === 'Backspace' && !t.value && (chipState[field] || []).length) { chipState[field].pop(); writeChips(field); }
}, true);
document.addEventListener('focusout', e => {
    const t = e.target;
    if (!t.classList || !t.classList.contains('chip-entry')) return;
    const field = t.id.slice(5);
    // Se espera un poco por si se pulsa una sugerencia
    setTimeout(() => {
        const box = chipBox(field);
        if (box && !box.contains(document.activeElement)) {
            hideChipSuggest(field);
            if (t.value.trim()) { addChipNames(field, splitNames(t.value), { create: false }); t.value = ''; } // al salir nunca se crean fichas solas
        }
    }, 150);
});
mountChipInputs();
