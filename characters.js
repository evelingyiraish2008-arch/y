/*
 * Mi Mundo · characters.js
 * Ficha de cada personaje: foto, quién lo interpreta, por qué te encanta, escenas favoritas
 * y con quién forma pareja (con los personajes de la misma obra). Los cálculos de parejas están en peoplekit.js.
 * Se carga antes que app.js.
 */
'use strict';

const getCharacter = (workId, charId) => { const w = getWorkById(workId); return w ? { w, c: (w.characters || []).find(x => x.id === charId) || null } : { w: null, c: null }; };
const charPhotoHtml = (c, size = 88) => {
    const p = getPersonById(c.personId);
    const src = c.image || (p && p.image) || '';
    return src ? `<img class="pavatar" src="${esc(resolveImageSrc(src))}" alt="" width="${size}" height="${size}" data-ph="person" style="width:${size}px;height:${size}px;object-fit:cover;border-radius:50%">`
        : `<span class="pchip-initials" style="width:${size}px;height:${size}px;font-size:${Math.round(size / 3)}px">${esc(initials(c.name))}</span>`;
};
function characterSheetHtml(workId, charId) {
    const { w, c } = getCharacter(workId, charId);
    if (!w || !c) return '<p>Personaje no encontrado.</p>';
    $('sheetTitle').textContent = '🎭 ' + c.name;
    const p = getPersonById(c.personId);
    const pairs = characterPairs(w, c);
    const others = (w.characters || []).filter(o => o.id !== c.id && !pairs.includes(o));
    const scenes = c.scenes || [];
    const realCouples = pairs.flatMap(o => couplesForCharacters(c, o, appData.couples).map(k => ({ k, o })));
    const lock = isLocked(w);
    return `<div class="char-sheet">
        <div class="char-head">
            <div class="char-photo">${charPhotoHtml(c)}</div>
            <div class="char-title">
                <h3>${c.fav ? '♥ ' : ''}${esc(c.name)}</h3>
                ${c.nickname ? `<small class="muted">También: ${esc(c.nickname)}</small>` : ''}
                <div class="char-meta"><span class="chip">${esc(CHARACTER_ROLES[c.role] || 'Personaje')}</span>
                    <button type="button" class="chip chip-muted" data-act="char-close-open" data-id="${w.id}">${TYPE_META[w.type].icon} ${esc(w.title)}</button>
                    ${p ? `<button type="button" class="chip chip-muted" data-person="${p.id}">${personAvatar(p, 18)} ${esc(p.name)}</button>` : '<span class="chip chip-muted">Sin intérprete</span>'}</div>
                ${lock ? '' : `<div class="char-actions">
                    <button type="button" class="btn btn-secondary btn-sm" data-act="char-fav" data-id="${w.id}" data-item="${c.id}">${c.fav ? '♥ Favorito' : '♡ Favorito'}</button>
                    <button type="button" class="btn btn-secondary btn-sm" data-act="char-image" data-id="${w.id}" data-item="${c.id}">🖼️ ${c.image ? 'Cambiar imagen' : 'Buscar imagen'}</button>
                    ${c.image ? `<button type="button" class="btn btn-secondary btn-sm" data-act="char-image-clear" data-id="${w.id}" data-item="${c.id}">Quitar imagen</button>` : ''}
                    <button type="button" class="btn btn-secondary btn-sm" data-act="char-rename" data-id="${w.id}" data-item="${c.id}">✏️ Nombre</button></div>`}
            </div>
        </div>
        <div class="detail-section"><div class="detail-section-title">💭 Por qué me encanta</div>
            <textarea class="text-input" id="charNote" rows="3" maxlength="600" placeholder="Lo que más te gusta de este personaje…" data-work="${w.id}" data-item="${c.id}" ${lock ? 'disabled' : ''}>${esc(c.note || '')}</textarea></div>
        <div class="detail-section"><div class="detail-section-title">🎬 Escenas favoritas${scenes.length ? ` · ${scenes.length}` : ''}</div>
            ${scenes.length ? `<ul class="char-scenes">${scenes.map(s => `<li><span>${s.where ? `<b>${esc(s.where)}</b> · ` : ''}${esc(s.text)}</span>
                ${lock ? '' : `<button type="button" class="icon-btn sm" data-act="char-scene-del" data-id="${w.id}" data-item="${c.id}" data-scene="${s.id}" aria-label="Quitar escena">✕</button>`}</li>`).join('')}</ul>` : '<p class="hint">Aún no has apuntado ninguna.</p>'}
            ${lock ? '' : `<div class="char-scene-form"><input type="text" class="text-input" id="charSceneWhere" maxlength="30" placeholder="Dónde (ep. 5, cap. 12…)"><input type="text" class="text-input" id="charSceneText" maxlength="240" placeholder="¿Qué pasa en esa escena?">
                <button type="button" class="btn btn-primary btn-sm" data-act="char-scene-add" data-id="${w.id}" data-item="${c.id}">＋ Añadir</button></div>`}</div>
        <div class="detail-section"><div class="detail-section-title">💕 Con quién forma pareja</div>
            ${pairs.length ? `<div class="tag-list">${pairs.map(o => `<span class="chip char-pair"><button type="button" class="link-btn" data-act="char-open" data-id="${w.id}" data-item="${o.id}">${esc(o.name)}</button>
                ${lock ? '' : `<button type="button" class="icon-btn sm" data-act="char-pair-del" data-id="${w.id}" data-item="${c.id}" data-other="${o.id}" aria-label="Quitar la pareja con ${esc(o.name)}">✕</button>`}</span>`).join('')}</div>` : '<p class="hint">Sin pareja apuntada.</p>'}
            ${realCouples.length ? `<p class="hint">${realCouples.map(({ k, o }) => `Quienes los interpretan son pareja en la vida real: <button type="button" class="link-btn" data-act="char-couple" data-id="${k.id}">💕 ${esc(coupleTitle(k))}</button>`).join('<br>')}</p>` : ''}
            ${lock || !others.length ? '' : `<select class="text-input" id="charPairPick" data-work="${w.id}" data-item="${c.id}"><option value="">＋ Formar pareja con…</option>${others.map(o => `<option value="${o.id}">${esc(o.name)}</option>`).join('')}</select>`}</div>
    </div>`;
}
function openCharacterDetail(workId, charId) {
    if (!getCharacter(workId, charId).c) return;
    openSheet('🎭 Personaje', () => characterSheetHtml(workId, charId));
}
FEATURE_ACTIONS['char-open'] = (id, el) => openCharacterDetail(id, el.dataset.item);
FEATURE_ACTIONS['char-close-open'] = id => { closeModal('sheetModal'); openDetail(id); };
FEATURE_ACTIONS['char-couple'] = id => openCoupleDetail(id);
const editCharacter = (el, fn, msg, label) => {
    const { w, c } = getCharacter(el.dataset.id || el.dataset.work, el.dataset.item);
    if (!w || !c || isLocked(w)) return;
    mutate(() => { fn(c, w); w.updatedAt = Date.now(); }, msg, { label: label || `Personaje “${c.name}”` });
};
FEATURE_ACTIONS['char-fav'] = (id, el) => editCharacter(el, c => { c.fav = !c.fav; if (!c.fav) delete c.fav; }, null, 'Favorito');
FEATURE_ACTIONS['char-rename'] = (id, el) => {
    const { c } = getCharacter(id, el.dataset.item);
    if (!c) return;
    const name = (prompt('Nombre del personaje:', c.name) || '').trim();
    if (!name || name === c.name) return;
    const nick = (prompt('Otros nombres o apodos (opcional):', c.nickname || '') || '').trim();
    editCharacter(el, x => { x.name = name; if (nick) x.nickname = nick; else delete x.nickname; }, '✏️ Personaje actualizado', 'Renombrar personaje');
};
FEATURE_ACTIONS['char-scene-add'] = (id, el) => {
    const text = $('charSceneText').value.trim(), where = $('charSceneWhere').value.trim();
    if (!text) { showToast('✍️ Cuenta qué pasa en la escena', 'error'); $('charSceneText').focus(); return; }
    editCharacter(el, c => { c.scenes = [...(c.scenes || []), { id: generateId(), text, ...(where ? { where } : {}) }]; }, '🎬 Escena añadida', 'Añadir escena');
};
FEATURE_ACTIONS['char-scene-del'] = (id, el) => editCharacter(el, c => { c.scenes = (c.scenes || []).filter(s => s.id !== el.dataset.scene); if (!c.scenes.length) delete c.scenes; }, '✕ Escena quitada', 'Quitar escena');
FEATURE_ACTIONS['char-pair-del'] = (id, el) => editCharacter(el, (c, w) => { setCharacterPair(w, c.id, el.dataset.other, false); }, '✕ Pareja quitada', 'Quitar pareja de personajes');
FEATURE_ACTIONS['char-image-clear'] = (id, el) => editCharacter(el, c => { delete c.image; }, '🖼️ Imagen quitada', 'Quitar imagen del personaje');
FEATURE_ACTIONS['char-image'] = (id, el) => {
    const { w, c } = getCharacter(id, el.dataset.item);
    if (!w || !c || isLocked(w) || typeof openImageSearch !== 'function') return;
    openImageSearch({ use: 'photo', query: `${c.name} ${w.title}`, onPick: async src => {
        const ref = await storeRemoteImage(src, 'avatar');
        const target = getCharacter(id, c.id);
        if (target.c) mutate(() => { target.c.image = ref; target.w.updatedAt = Date.now(); }, '🖼️ Imagen del personaje guardada', { label: 'Imagen del personaje' });
    } });
};
// El texto "Por qué me encanta" se guarda al salir de la caja; "Formar pareja con…" al elegir
document.addEventListener('change', e => {
    const t = e.target;
    if (t.id === 'charNote') {
        const { w, c } = getCharacter(t.dataset.work, t.dataset.item);
        if (!w || !c || isLocked(w) || (c.note || '') === t.value.trim()) return;
        mutate(() => { if (t.value.trim()) c.note = t.value.trim(); else delete c.note; w.updatedAt = Date.now(); }, '💭 Guardado', { label: 'Nota del personaje' });
    } else if (t.id === 'charPairPick' && t.value) {
        const { w, c } = getCharacter(t.dataset.work, t.dataset.item);
        if (!w || !c || isLocked(w)) return;
        const other = (w.characters || []).find(o => o.id === t.value);
        mutate(() => { setCharacterPair(w, c.id, t.value, true); w.updatedAt = Date.now(); }, `💕 ${c.name} y ${other ? other.name : ''} son pareja`, { label: 'Pareja de personajes' });
    }
});
