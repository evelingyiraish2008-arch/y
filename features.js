/*
 * Mi Mundo · features.js
 * Pantallas de: etiquetas, parejas vinculadas, temporadas, notas con tipos y re-visionados.
 * Se carga antes que app.js; usa sus funciones (mutate, openSheet, $…) solo dentro de funciones.
 * Las acciones de botones (data-act) se registran en FEATURE_ACTIONS y las llama handleAction de app.js.
 */
'use strict';

/** Acciones de los botones con data-act que no están en app.js: (id, elemento) => void. */
const FEATURE_ACTIONS = {};

// ============================================================
// 1. ETIQUETAS
// ============================================================
const TAG_COLORS = ['#8b5cf6', '#ec4899', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#14b8a6', '#a855f7', '#64748b'];
function tagMeta(tag) { return ((appData.settings.tagMeta || {})[tagKey(tag)]) || {}; }
function setTagMeta(tag, patch) {
    const all = { ...(appData.settings.tagMeta || {}) };
    const next = { ...(all[tagKey(tag)] || {}), ...patch };
    Object.keys(next).forEach(k => { if (!next[k]) delete next[k]; });
    if (Object.keys(next).length) all[tagKey(tag)] = next; else delete all[tagKey(tag)];
    appData.settings.tagMeta = all;
}
/** Chip de etiqueta con su color y emoji. Al pulsarlo muestra las obras que la llevan. */
function tagChip(tag) {
    const m = tagMeta(tag);
    return `<button type="button" class="chip tag-chip" ${m.color ? `style="--tag:${esc(m.color)}"` : ''} data-act="tag-open" data-id="${esc(tag)}">${m.emoji ? esc(m.emoji) + ' ' : ''}${esc(tag)}</button>`;
}
function knownTags() { return tagStats(appData.works).map(t => t.label); }

let tagFilter = '';
function openTagManager() {
    tagFilter = '';
    openSheet('🏷️ Etiquetas', renderTagManager);
}
function renderTagManager() {
    const stats = tagStats(appData.works);
    const q = norm(tagFilter);
    const list = stats.filter(t => !q || norm(t.label).includes(q));
    const orphans = Object.keys(appData.settings.tagMeta || {}).filter(k => !stats.some(t => t.key === k));
    const row = t => {
        const m = tagMeta(t.label);
        return `<div class="tag-row">
            <span class="chip tag-chip" ${m.color ? `style="--tag:${esc(m.color)}"` : ''}>${m.emoji ? esc(m.emoji) + ' ' : ''}${esc(t.label)}</span>
            <small class="tag-row-info">${t.count} ${t.count === 1 ? 'obra' : 'obras'}${t.lastUsed > 1 ? ' · ' + esc(relativeTime(t.lastUsed)) : ''}</small>
            <span class="tag-row-actions">
                <label class="tag-color" title="Color"><input type="color" data-tag-color="${esc(t.label)}" value="${esc(m.color || TAG_COLORS[0])}" aria-label="Color de ${esc(t.label)}"></label>
                <button class="icon-btn sm" data-act="tag-emoji" data-id="${esc(t.label)}" title="Emoji" aria-label="Emoji">${m.emoji ? esc(m.emoji) : '😀'}</button>
                <button class="icon-btn sm" data-act="tag-rename" data-id="${esc(t.label)}" title="Renombrar" aria-label="Renombrar">✏️</button>
                <button class="icon-btn sm" data-act="tag-merge" data-id="${esc(t.label)}" title="Unir con otra" aria-label="Unir con otra">🔀</button>
                <button class="icon-btn sm" data-act="tag-delete" data-id="${esc(t.label)}" title="Quitar de todas las obras" aria-label="Eliminar">🗑️</button>
            </span>
        </div>`;
    };
    const single = list.filter(t => t.count === 1);
    return `
        <input type="search" class="text-input" id="tagSearch" placeholder="Buscar etiqueta…" value="${esc(tagFilter)}" style="margin-bottom:12px">
        ${stats.length ? '' : emptyState('🏷️', 'Sin etiquetas todavía', 'Escribe etiquetas al agregar o editar una obra (separadas por comas).')}
        <div class="tag-list-manage">${list.filter(t => t.count > 1).map(row).join('')}</div>
        ${single.length ? `<div class="trash-group-title" style="margin-top:14px">Usadas en una sola obra · ${single.length}</div><p class="hint" style="margin:0 0 8px">¿Alguna es una errata? Únela con la buena con 🔀.</p><div class="tag-list-manage">${single.map(row).join('')}</div>` : ''}
        ${orphans.length ? `<div class="trash-group-title" style="margin-top:14px">Sin uso · ${orphans.length}</div><div class="tag-list-manage">${orphans.map(k => `
            <div class="tag-row"><span class="chip chip-muted">${esc(k)}</span><small class="tag-row-info">Ya no la usa ninguna obra</small>
            <span class="tag-row-actions"><button class="btn btn-secondary btn-sm" data-act="tag-forget" data-id="${esc(k)}">Olvidar</button></span></div>`).join('')}</div>` : ''}`;
}
FEATURE_ACTIONS['tags'] = () => openTagManager();
FEATURE_ACTIONS['tag-open'] = tag => {
    const k = tagKey(tag);
    const list = appData.works.filter(w => splitList(w.tags).some(t => tagKey(t) === k));
    openSheet(`🏷️ ${tag}`, () => list.length ? `<div class="pick-list">${list.map(w => `
        <button class="pick-item" data-open="${w.id}"><div class="thumb">${img(w.image, w.type, w.title)}</div>
        <span class="info"><b>${esc(w.title)}</b><small>${TYPE_META[w.type].icon} ${esc(getTypeLabel(w.type))} · ${esc(getStatusLabel(w.status))}</small></span></button>`).join('')}</div>`
        : emptyState('🏷️', 'Ninguna obra', 'Ya ninguna obra lleva esta etiqueta.'));
};
FEATURE_ACTIONS['tag-rename'] = tag => {
    const to = (prompt(`Nuevo nombre para “${tag}”:`, tag) || '').trim();
    if (!to || to === tag) return;
    const exists = knownTags().find(t => tagKey(t) === tagKey(to) && tagKey(t) !== tagKey(tag));
    if (exists && !confirm(`Ya existe “${exists}”. ¿Unir las dos?`)) return;
    mutate(() => {
        renameTag(appData.works, tag, exists || to);
        const m = tagMeta(tag);
        setTagMeta(tag, { color: '', emoji: '' });
        if (m.color || m.emoji) setTagMeta(exists || to, { ...m, ...tagMeta(exists || to) });
    }, `🏷️ “${tag}” → “${exists || to}”`, { label: `Renombrar etiqueta “${tag}”` });
};
FEATURE_ACTIONS['tag-merge'] = tag => {
    const others = knownTags().filter(t => tagKey(t) !== tagKey(tag));
    if (!others.length) { showToast('No hay otras etiquetas con las que unirla'); return; }
    const best = suggestTagFixes(tag, others, { min: 0.5 })[0];
    const to = (prompt(`¿Con qué etiqueta quieres unir “${tag}”? (se quedará la que escribas)\n\nTienes: ${others.slice(0, 30).join(', ')}`, best ? best.suggestion : '') || '').trim();
    if (!to) return;
    const target = others.find(t => tagKey(t) === tagKey(to));
    if (!target) { showToast(`⚠️ No tienes ninguna etiqueta “${to}”`, 'error'); return; }
    mutate(() => {
        renameTag(appData.works, tag, target);
        setTagMeta(tag, { color: '', emoji: '' });
    }, `🔀 “${tag}” unida con “${target}”`, { label: `Unir “${tag}” con “${target}”` });
};
FEATURE_ACTIONS['tag-delete'] = tag => {
    const n = appData.works.filter(w => splitList(w.tags).some(t => tagKey(t) === tagKey(tag))).length;
    if (!confirm(`¿Quitar la etiqueta “${tag}” de ${n} ${n === 1 ? 'obra' : 'obras'}? Las obras no se borran.`)) return;
    mutate(() => { removeTag(appData.works, tag); setTagMeta(tag, { color: '', emoji: '' }); }, `🗑️ Etiqueta “${tag}” quitada`, { label: `Quitar etiqueta “${tag}”` });
};
FEATURE_ACTIONS['tag-emoji'] = tag => {
    const v = prompt(`Emoji para “${tag}” (déjalo vacío para quitarlo):`, tagMeta(tag).emoji || '');
    if (v === null) return;
    const emoji = [...v.trim()].slice(0, 2).join('');
    mutate(() => setTagMeta(tag, { emoji }), emoji ? `${emoji} Emoji guardado` : 'Emoji quitado', { label: `Emoji de “${tag}”` });
};
FEATURE_ACTIONS['tag-forget'] = key => mutate(() => setTagMeta(key, { color: '', emoji: '' }), '🧹 Etiqueta olvidada');
function onTagColorChange(input) {
    const tag = input.dataset.tagColor;
    mutate(() => setTagMeta(tag, { color: input.value }), '🎨 Color de la etiqueta guardado', { label: `Color de “${tag}”` });
}

/** Debajo del campo de etiquetas: "¿Quisiste decir…?" y etiquetas sugeridas. */
function updateTagsHint() {
    const el = $('tagsHint'), input = $('f_tags');
    if (!el || !input) return;
    const fixes = suggestTagFixes(input.value, knownTags());
    const draft = { ...collectWorkForm(), type: formType, id: editingWorkId };
    let suggested = suggestTagsFor(draft, appData.works, 5);
    // Sin pistas todavía: las etiquetas que más usas
    if (!suggested.length && !splitList(input.value).length) suggested = tagStats(appData.works).slice(0, 6).map(t => t.label);
    el.hidden = !fixes.length && !suggested.length;
    el.innerHTML = [
        fixes.length ? `🤔 ¿Quisiste decir ${fixes.map(f => `<button type="button" class="link-btn" data-act="tag-fix" data-id="${esc(f.typed)}" data-to="${esc(f.suggestion)}">${esc(f.suggestion)}</button>`).join(', ')}?` : '',
        suggested.length ? `<span>✨ Sugeridas: ${suggested.map(t => `<button type="button" class="chip chip-muted" data-act="tag-add" data-id="${esc(t)}">＋ ${esc(t)}</button>`).join(' ')}</span>` : ''
    ].filter(Boolean).join(' ');
}
FEATURE_ACTIONS['tag-fix'] = (typed, el) => {
    const input = $('f_tags');
    input.value = splitList(input.value).map(t => (tagKey(t) === tagKey(typed) ? el.dataset.to : t)).join(', ');
    input.dispatchEvent(new Event('input', { bubbles: true }));
};
FEATURE_ACTIONS['tag-add'] = tag => {
    const input = $('f_tags');
    input.value = dedupeTags([...splitList(input.value), tag]).join(', ');
    input.dispatchEvent(new Event('input', { bubbles: true }));
};

// ============================================================
// 2. PAREJAS VINCULADAS
// ============================================================
function coupleInfo(c) { return coupleSummary(c, appData.works, appData.persons); }
function personOptions(selected) {
    const actors = appData.persons.slice().sort((a, b) => (a.type === 'actor' ? 0 : 1) - (b.type === 'actor' ? 0 : 1) || a.name.localeCompare(b.name, 'es'));
    return `<option value="">— Elige —</option>${actors.map(p => `<option value="${esc(p.id)}" ${p.id === selected ? 'selected' : ''}>${esc(p.name)}${p.type !== 'actor' ? ` (${esc(PERSON_TYPE_LABEL[p.type] || p.type)})` : ''}</option>`).join('')}`;
}
let coupleWorkPick = new Set();
function fillCoupleLinks(c) {
    $('coupleA').innerHTML = personOptions(c && c.personA);
    $('coupleB').innerHTML = personOptions(c && c.personB);
    coupleWorkPick = new Set((c && c.workIds) || []);
    $('coupleWorksSearch').value = '';
    renderCoupleWorksPicker();
}
function renderCoupleWorksPicker() {
    const q = norm($('coupleWorksSearch').value);
    const a = getPersonById($('coupleA').value), b = getPersonById($('coupleB').value);
    const auto = new Set(a && b ? coupleWorks({ personA: a.id, personB: b.id }, appData.works, appData.persons).map(w => w.id) : []);
    const list = appData.works.filter(w => w.type === 'series' || w.bl || auto.has(w.id) || coupleWorkPick.has(w.id))
        .filter(w => !q || norm(w.title).includes(q))
        .sort((x, y) => (auto.has(y.id) || coupleWorkPick.has(y.id) ? 1 : 0) - (auto.has(x.id) || coupleWorkPick.has(x.id) ? 1 : 0) || x.title.localeCompare(y.title, 'es'));
    $('coupleWorksPicker').innerHTML = list.length ? list.map(w => `
        <label class="pick-item couple-pick">
            <input type="checkbox" data-couple-work="${w.id}" ${auto.has(w.id) || coupleWorkPick.has(w.id) ? 'checked' : ''} ${auto.has(w.id) ? 'disabled title="Salen los dos en el reparto"' : ''}>
            <span class="info"><b>${esc(w.title)}</b><small>${TYPE_META[w.type].icon} ${esc(getTypeLabel(w.type))}${auto.has(w.id) ? ' · salen los dos en el reparto' : ''}</small></span>
        </label>`).join('') : '<p class="hint" style="margin:0">No hay series ni obras BL que coincidan.</p>';
    const n = new Set([...auto, ...coupleWorkPick]).size;
    $('coupleWorksCount').textContent = n ? `${n} ${n === 1 ? 'obra' : 'obras'} juntos` : '';
}
function collectCoupleLinks() {
    return { personA: $('coupleA').value || '', personB: $('coupleB').value || '', workIds: [...coupleWorkPick].filter(id => getWorkById(id)) };
}
function openCoupleDetail(id) {
    openSheet('💕 Pareja', () => {
        const c = getCoupleById(id);
        if (!c) return '<p>Pareja no encontrada.</p>';
        $('sheetTitle').textContent = '💕 ' + c.name;
        const s = coupleInfo(c);
        const a = getPersonById(c.personA), b = getPersonById(c.personB);
        const related = relatedCouples(c, appData.couples);
        return `
        <div class="couple-banner ${c.banner ? 'has-banner' : ''}">${bannerBgHtml(c.banner, c.image)}
            <button class="icon-btn sm detail-banner-btn" data-act="banner-quick" data-kind="couples" data-id="${c.id}" title="${c.banner ? 'Cambiar banner' : 'Poner un banner'}" aria-label="${c.banner ? 'Cambiar banner' : 'Poner un banner'}">🖼️</button></div>
        <div class="couple-detail-hero">${img(c.image, 'couple', c.name)}</div>
        <div class="couple-detail-people">
            ${[a, b].map(p => (p ? `<button class="couple-person" data-person="${p.id}"><span class="avatar">${img(p.image, 'person', p.name)}</span><b>${esc(p.name)}</b></button>` : '')).join('<span class="couple-heart">💕</span>')}
        </div>
        <div class="detail-chips" style="justify-content:center;margin:10px 0 16px">
            <span class="chip chip-muted">🎬 ${s.count} ${s.count === 1 ? 'obra' : 'obras'} juntos</span>
            ${s.avgRating ? `<span class="chip chip-orange">★ ${ratingText(Math.round(s.avgRating * 10) / 10)} de media en sus obras</span>` : c.rating ? `<span class="chip chip-orange">★ ${ratingText(c.rating)}</span>` : ''}
            ${c.favorite ? '<span class="chip chip-pink">❤️ Favorita</span>' : ''}
        </div>
        ${!s.linked ? '<p class="hint" style="text-align:center">Edita la pareja y elige a los dos actores para ver sus obras juntos automáticamente.</p>' : ''}
        ${s.works.length ? `<div class="detail-section-title">Sus obras juntos</div><div class="mini-grid">${s.works.map(miniCard).join('')}</div>` : ''}
        ${related.length ? `<div class="detail-section-title" style="margin-top:16px">Parejas relacionadas</div><div class="tag-list">${related.map(r => `<button class="chip" data-couple="${r.id}">💕 ${esc(r.name)}</button>`).join('')}</div>` : ''}
        <div class="detail-section-title" style="margin-top:16px">🎨 Moodboard${(c.gallery || []).length ? ' · ' + c.gallery.length : ''}</div>
        ${moodboardHtml('couples', c)}
        <div class="seg-inline" style="justify-content:center;margin-top:18px">
            <button class="btn btn-secondary btn-sm" data-act="couple-edit" data-id="${c.id}">✏️ Editar</button>
            <button class="btn btn-secondary btn-sm" data-act="couple-fav" data-id="${c.id}">${c.favorite ? '🤍 Quitar de favoritas' : '❤️ Favorita'}</button>
        </div>`;
    });
}
FEATURE_ACTIONS['couple-edit'] = id => { closeModal('sheetModal'); openCoupleModal(getCoupleById(id)); };

// ============================================================
// 3. TEMPORADAS
// ============================================================
const SEASON_WORDS = {
    book: { check: 'Es una saga (varios libros)', one: 'Libro', unit: 'Págs', add: '＋ Añadir libro' },
    manhwa: { check: 'Tiene varias temporadas o partes', one: 'Parte', unit: 'Caps', add: '＋ Añadir parte' },
    series: { check: 'Tiene varias temporadas', one: 'Temporada', unit: 'Eps', add: '＋ Añadir temporada' },
    anime: { check: 'Tiene varias temporadas', one: 'Temporada', unit: 'Eps', add: '＋ Añadir temporada' }
};
function renderSeasonsEditor(list) {
    const words = SEASON_WORDS[formType];
    $('lbl_multi').textContent = words.check;
    $('f_multi').checked = !!(list && list.length);
    const rows = list && list.length ? list : [];
    $('seasonsEditor').hidden = !rows.length;
    $('seasonsEditor').innerHTML = `${rows.map((s, i) => seasonRow(s, i, words)).join('')}
        <button type="button" class="btn btn-secondary btn-sm" data-act="season-add">${words.add}</button>`;
    toggleAggregateInputs();
}
function seasonRow(s, i, words) {
    const opt = v => `<option value="${v}" ${Number(s.rating || 0) === v ? 'selected' : ''}>${v ? '★ ' + v : '–'}</option>`;
    return `<div class="season-row" data-season-row>
        <b class="season-num">${words.one.charAt(0)}${i + 1}</b>
        <label><span>Año</span><input type="number" class="text-input" data-sfield="year" value="${esc(s.year || '')}" min="1800" max="2100" placeholder="—"></label>
        <label><span>${words.unit}</span><input type="number" class="text-input" data-sfield="episodes" value="${esc(s.episodes || '')}" min="0" placeholder="0"></label>
        <label><span>Visto</span><input type="number" class="text-input" data-sfield="progress" value="${esc(s.progress || '')}" min="0" placeholder="0"></label>
        <label><span>Nota</span><select class="text-input" data-sfield="rating">${[0, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5].map(opt).join('')}</select></label>
        <button type="button" class="icon-btn sm" data-act="season-remove" data-id="${i}" aria-label="Quitar">✕</button>
    </div>`;
}
function readSeasonsEditor() {
    if (!$('f_multi').checked) return [];
    return [...$('seasonsEditor').querySelectorAll('[data-season-row]')].map((row, i) => {
        const v = f => row.querySelector(`[data-sfield="${f}"]`).value;
        const eps = Math.max(0, Number(v('episodes')) || 0);
        return { number: i + 1, year: Number(v('year')) || '', episodes: eps, progress: Math.min(Math.max(0, Number(v('progress')) || 0), eps || Infinity), rating: Number(v('rating')) || 0 };
    });
}
/** Con temporadas, el total y el progreso de la obra se calculan solos. */
function toggleAggregateInputs() {
    const on = $('f_multi').checked;
    const list = readSeasonsEditor();
    workForm.querySelectorAll('[data-field="progress"], [data-field="pages"], [data-field="totalEpisodes"], [data-field="totalChapters"], [data-field="seasons"]').forEach(el => {
        el.readOnly = on;
        el.closest('.field').classList.toggle('is-computed', on);
    });
    if (on && list.length) {
        const t = seasonTotals({ seasonsList: list });
        workForm.querySelector('[data-field="progress"]').value = t.progress;
        const tf = workForm.querySelector(`[data-field="${totalField(formType)}"]`);
        if (tf) tf.value = t.total || '';
        workForm.querySelector('[data-field="seasons"]').value = list.length;
    }
}
FEATURE_ACTIONS['season-add'] = () => {
    const list = readSeasonsEditor();
    if (!list.length && !$('f_multi').checked) return;
    const last = list[list.length - 1];
    list.push({ episodes: last ? last.episodes : '', year: last && last.year ? Number(last.year) + 1 : '', progress: 0, rating: 0 });
    renderSeasonsEditor(list);
    const rows = $('seasonsEditor').querySelectorAll('[data-season-row]');
    rows[rows.length - 1].querySelector('[data-sfield="episodes"]').focus();
};
FEATURE_ACTIONS['season-remove'] = i => {
    const list = readSeasonsEditor();
    list.splice(Number(i), 1);
    renderSeasonsEditor(list);
    if (!list.length) { $('f_multi').checked = false; toggleAggregateInputs(); }
};
function onMultiSeasonToggle() {
    if ($('f_multi').checked) {
        // Empieza con lo que ya tenía la obra como primera temporada
        const total = Number(workForm.querySelector(`[data-field="${totalField(formType)}"]`).value) || 0;
        const progress = Number(workForm.querySelector('[data-field="progress"]').value) || 0;
        const year = Number(workForm.querySelector('[data-field="year"]').value) || '';
        renderSeasonsEditor([{ episodes: total, progress, year, rating: 0 }]);
        $('f_multi').checked = true;
        $('seasonsEditor').hidden = false;
    } else {
        $('seasonsEditor').hidden = true;
        toggleAggregateInputs();
    }
}
function seasonsSectionHtml(w, openState) {
    if (!hasSeasons(w)) return '';
    const words = SEASON_WORDS[w.type];
    const t = seasonTotals(w);
    const label = { terminado: 'Terminada', 'en curso': 'En curso', pendiente: 'Pendiente' };
    return `<details class="expandable" data-key="seasons" ${openState ?? true ? 'open' : ''}>
        <summary>📺 ${words.one === 'Libro' ? 'Libros de la saga' : words.one === 'Parte' ? 'Partes' : 'Temporadas'} · ${w.seasonsList.length}</summary>
        <div class="expandable-content">
          ${t.avgRating ? `<p class="hint" style="margin:0 0 10px">★ ${ratingText(Math.round(t.avgRating * 10) / 10)} de media entre ${words.one === 'Libro' ? 'libros' : 'temporadas'}</p>` : ''}
          <div class="season-list">${w.seasonsList.map((s, i) => {
              const eps = Number(s.episodes) || 0, p = Number(s.progress) || 0;
              const st = seasonStatus(s);
              return `<div class="season-item ${i === t.current && st !== 'terminado' ? 'is-current' : ''}">
                <div class="season-head"><b>${words.one} ${s.number || i + 1}</b>
                  <small>${[s.year, eps ? `${eps} ${words.unit.toLowerCase()}` : '', s.rating ? '★ ' + ratingText(s.rating) : '', label[st]].filter(Boolean).map(esc).join(' · ')}</small>
                  <span class="stepper">
                    <button class="icon-btn sm" data-act="season-step" data-id="${w.id}" data-season="${i}" data-delta="-1" aria-label="Retroceder">−</button>
                    <button class="icon-btn sm" data-act="season-step" data-id="${w.id}" data-season="${i}" data-delta="1" aria-label="Avanzar">＋</button>
                  </span></div>
                <div class="progress-bar sm"><div class="progress-fill" style="width:${eps ? Math.min(100, p / eps * 100) : 0}%"></div></div>
                <small class="hint">${p}${eps ? ' / ' + eps : ''} ${words.unit.toLowerCase()}</small>
              </div>`;
          }).join('')}</div>
        </div>
    </details>`;
}
FEATURE_ACTIONS['season-step'] = (id, el) => {
    const w = getWorkById(id);
    if (!w || isLocked(w) || !hasSeasons(w)) return;
    const i = Number(el.dataset.season), delta = Number(el.dataset.delta);
    const s = w.seasonsList[i];
    const eps = Number(s.episodes) || 0;
    let next = Math.max(0, (Number(s.progress) || 0) + delta);
    if (eps) next = Math.min(next, eps);
    if (next === (Number(s.progress) || 0)) return;
    const words = SEASON_WORDS[w.type];
    mutate(() => {
        s.progress = next;
        syncSeasonAggregates(w);
        w.updatedAt = Date.now();
        if (delta > 0) {
            bumpActivity(w);
            if (isPlanned(w)) { w.status = STATUS_BY_TYPE[w.type][0]; if (!w.startDate) w.startDate = todayISO(); }
            if (getTotal(w) && w.progress >= getTotal(w)) finishWork(w);
        }
    }, delta > 0 && eps && next >= eps ? `🎉 ${words.one} ${s.number || i + 1} terminada` : `⏩ ${w.title} · ${words.one.charAt(0)}${s.number || i + 1}: ${next}${eps ? '/' + eps : ''}`);
};

// ============================================================
// 4. NOTAS CON TIPOS
// ============================================================
let editingNoteId = null, noteFilter = 'all';
function criteriaInputs(scores = {}) {
    return REVIEW_CRITERIA.map(([k, label]) => `<label class="criteria-row"><span>${esc(label)}</span>
        <select class="text-input" data-criteria="${k}">${[0, 1, 2, 3, 4, 5].map(v => `<option value="${v}" ${Number(scores[k] || 0) === v ? 'selected' : ''}>${v ? '★'.repeat(v) : '–'}</option>`).join('')}</select></label>`).join('');
}
function noteCard(n, { showWork = false } = {}) {
    const t = NOTE_TYPES[noteType(n)];
    const avg = noteType(n) === 'resena' ? reviewAverage(n.scores) : 0;
    const w = showWork && getWorkById(n.workId);
    return `<article class="note-item ${n.pinned ? 'is-pinned' : ''}" data-note="${n.id}">
        <div class="note-item-head">
            <span class="chip chip-muted">${t.icon} ${t.label}</span>
            ${n.pinned ? '<span class="chip">📌 Fijada</span>' : ''}
            ${avg ? `<span class="chip chip-orange">★ ${ratingText(Math.round(avg * 10) / 10)}</span>` : ''}
            <small class="muted">${esc(relativeTime(lastTouched(n) || n.createdAt))}</small>
            ${w ? `<button class="link-btn" data-open="${w.id}">${esc(w.title)}</button>` : ''}
        </div>
        <div class="note-item-text">${esc(n.content)}</div>
        ${avg ? `<div class="criteria-list">${REVIEW_CRITERIA.filter(([k]) => Number((n.scores || {})[k]) > 0).map(([k, label]) => `<span>${esc(label)} <b>${'★'.repeat(Number(n.scores[k]))}</b></span>`).join('')}</div>` : ''}
        <div class="note-item-actions">
            <button class="btn btn-secondary btn-sm" data-act="note-pin" data-id="${n.id}">${n.pinned ? 'Desfijar' : '📌 Fijar'}</button>
            <button class="btn btn-secondary btn-sm" data-act="note-edit" data-id="${n.id}">✏️ Editar</button>
            <button class="btn btn-secondary btn-sm" data-act="note-remove" data-id="${n.id}" aria-label="Eliminar nota">🗑️</button>
        </div>
    </article>`;
}
function notesSectionHtml(w, openState, draft) {
    const all = notesOfWork(appData.notes, w.id);
    const types = [...new Set(all.map(noteType))];
    const list = notesOfWork(appData.notes, w.id, types.includes(noteFilter) ? noteFilter : 'all');
    const editing = editingNoteId && appData.notes.find(n => n.id === editingNoteId && n.workId === w.id);
    const d = draft || (editing ? { type: noteType(editing), content: editing.content, scores: editing.scores || {} } : { type: 'comentario', content: '', scores: {} });
    return `<details class="expandable" data-key="notes" ${openState ?? all.length ? 'open' : ''}>
        <summary>📝 Mis notas${all.length ? ' · ' + all.length : ''}</summary>
        <div class="expandable-content">
          <div class="note-composer">
            ${editing ? '<div class="hint" style="margin:0 0 6px">✏️ Editando una nota · <button class="link-btn" data-act="note-cancel">Cancelar</button></div>' : ''}
            <div class="note-type-row">${Object.entries(NOTE_TYPES).map(([k, t]) => `<label class="chip chip-muted note-type-opt"><input type="radio" name="noteType" value="${k}" ${d.type === k ? 'checked' : ''}> ${t.icon} ${t.label}</label>`).join('')}</div>
            <label class="field"><textarea id="detailNote" placeholder="Escribe tus pensamientos, teorías o reseñas…">${esc(d.content)}</textarea></label>
            <div class="criteria" id="reviewCriteria" ${d.type === 'resena' ? '' : 'hidden'}>${criteriaInputs(d.scores)}</div>
            <div style="display:flex;gap:8px;margin-top:10px;"><button class="btn btn-primary btn-sm" data-act="note-save" data-id="${w.id}">${editing ? 'Guardar cambios' : 'Añadir nota'}</button></div>
          </div>
          ${types.length > 1 ? `<div class="pick-filters" style="margin-top:14px">${[['all', 'Todas'], ...types.map(k => [k, NOTE_TYPES[k].icon + ' ' + NOTE_TYPES[k].label])].map(([k, l]) => `<button class="chip chip-muted ${noteFilter === k || (k === 'all' && !types.includes(noteFilter)) ? 'is-on' : ''}" data-act="note-filter" data-id="${k}">${esc(l)}</button>`).join('')}</div>` : ''}
          ${list.length ? `<div class="note-feed">${list.map(n => noteCard(n)).join('')}</div>` : ''}
        </div>
    </details>`;
}
/** Lo escrito en el editor de notas (para no perderlo si la ficha se vuelve a pintar). */
function readNoteComposer() {
    if (!$('detailNote')) return null;
    const type = (document.querySelector('input[name="noteType"]:checked') || {}).value || 'comentario';
    const scores = {};
    document.querySelectorAll('[data-criteria]').forEach(el => { if (Number(el.value)) scores[el.dataset.criteria] = Number(el.value); });
    return { type, content: $('detailNote').value, scores };
}
function saveNote(workId) {
    const w = getWorkById(workId);
    const d = readNoteComposer();
    if (!w || !d) return;
    const content = d.content.trim();
    if (!content) { showToast('📝 Escribe algo antes de guardar', 'error'); return; }
    const scores = d.type === 'resena' ? d.scores : undefined;
    const editing = editingNoteId && appData.notes.find(n => n.id === editingNoteId);
    mutate(() => {
        if (editing) Object.assign(editing, { content, type: d.type, scores, workTitle: w.title, updatedAt: Date.now() });
        else appData.notes.push({ id: generateId(), workId, workTitle: w.title, content, type: d.type, ...(scores ? { scores } : {}), createdAt: Date.now() });
        delete w.note; // las notas viven en su propia lista
        editingNoteId = null;
        $('detailNote').value = '';
    }, editing ? '📝 Nota actualizada' : `${NOTE_TYPES[d.type].icon} ${NOTE_TYPES[d.type].label} guardada`, { label: editing ? 'Editar nota' : 'Añadir nota' });
}
FEATURE_ACTIONS['note-pin'] = id => {
    const n = appData.notes.find(x => x.id === id);
    if (n) mutate(() => { n.pinned = !n.pinned; }, n.pinned ? 'Nota desfijada' : '📌 Nota fijada arriba');
};
FEATURE_ACTIONS['note-edit'] = id => {
    const n = appData.notes.find(x => x.id === id);
    if (!n) return;
    if (currentDetailId !== n.workId) openDetail(n.workId);
    editingNoteId = id;
    renderDetail(true);
    $('detailNote').focus();
};
FEATURE_ACTIONS['note-cancel'] = () => { editingNoteId = null; renderDetail(true); };
FEATURE_ACTIONS['note-remove'] = id => {
    const n = appData.notes.find(x => x.id === id);
    if (!n) return;
    if (editingNoteId === id) editingNoteId = null;
    mutate(() => {
        trashRecord(appData, 'notes', id, Date.now(), { from: 'Notas' });
        const w = getWorkById(n.workId);
        if (w) delete w.note;
    }, '🗑️ Nota enviada a la papelera', { label: 'Eliminar nota' });
};
FEATURE_ACTIONS['note-filter'] = type => { noteFilter = type; renderDetail(); };

// ============================================================
// 5. RE-VISIONADOS / RELECTURAS
// ============================================================
const verbAgain = w => (w.type === 'book' || w.type === 'manhwa' ? 'leer' : 'ver');
function rereadsSectionHtml(w, openState) {
    const passes = w.rereads || [];
    if (w.status !== 'terminado' && !passes.length && !w.rereading) return '';
    const word = w.type === 'book' || w.type === 'manhwa' ? 'Relecturas' : 'Re-visionados';
    return `<details class="expandable" data-key="rereads" ${openState ?? (passes.length || w.rereading) ? 'open' : ''}>
        <summary>🔁 ${word}${passes.length ? ' · ' + passes.length : ''}</summary>
        <div class="expandable-content">
          <ol class="reread-list">
            <li><b>1ª vez</b> <small>${w.endDate ? 'terminada el ' + esc(fmtDate(w.endDate)) : 'terminada'}${w.rating && !passes.length ? ' · ★ ' + ratingText(w.rating) : ''}</small></li>
            ${passes.map((r, i) => `<li><b>${i + 2}ª vez</b> <small>${esc(fmtDate(r.date))}${r.rating ? ' · ★ ' + ratingText(r.rating) : ''}${r.note ? ' · ' + esc(r.note) : ''}</small>
                <button class="icon-btn sm" data-act="reread-remove" data-id="${w.id}" data-version="${i}" aria-label="Quitar">✕</button></li>`).join('')}
            ${w.rereading ? `<li class="is-current"><b>${passes.length + 2}ª vez</b> <small>en curso</small></li>` : ''}
          </ol>
          <div class="seg-inline" style="margin-top:10px">
            ${w.rereading ? `<button class="btn btn-primary btn-sm" data-act="reread-finish" data-id="${w.id}">✅ Terminar esta vez</button>`
                : `<button class="btn btn-primary btn-sm" data-act="reread-start" data-id="${w.id}">▶️ Volver a ${verbAgain(w)}la</button>
                   <button class="btn btn-secondary btn-sm" data-act="reread-log" data-id="${w.id}">＋ Apuntar otra vez ya terminada</button>`}
          </div>
        </div>
    </details>`;
}
/** Marca una obra como terminada; si era una relectura, la apunta como otra vez más. */
function finishWork(w) {
    if (w.rereading) addReread(w, { date: todayISO(), rating: w.rating });
    w.status = 'terminado';
    if (!w.endDate) w.endDate = todayISO();
}
FEATURE_ACTIONS['reread-start'] = id => {
    const w = getWorkById(id);
    if (!w || isLocked(w)) return;
    mutate(() => {
        w.rereading = true;
        w.status = STATUS_BY_TYPE[w.type][0];
        w.progress = 0;
        if (hasSeasons(w)) { w.seasonsList.forEach(s => { s.progress = 0; }); syncSeasonAggregates(w); }
        bumpActivity(w);
    }, `🔁 ¡A por la ${(w.rereads || []).length + 2}ª vez con “${w.title}”!`, { label: `Volver a empezar “${w.title}”` });
};
FEATURE_ACTIONS['reread-finish'] = id => {
    const w = getWorkById(id);
    if (!w || isLocked(w)) return;
    mutate(() => {
        finishWork(w);
        if (getTotal(w)) w.progress = getTotal(w);
        if (hasSeasons(w)) { w.seasonsList.forEach(s => { s.progress = Number(s.episodes) || s.progress; }); syncSeasonAggregates(w); }
        bumpActivity(w);
    }, `🎉 ¡${w.rereads.length + 1}ª vez terminada!`, { label: `Terminar otra vez “${w.title}”` });
};
FEATURE_ACTIONS['reread-log'] = id => {
    const w = getWorkById(id);
    if (!w) return;
    openSheet(`🔁 Otra vez: ${w.title}`, () => `
        <div class="form-grid">
            <label class="field"><span>¿Cuándo la terminaste?</span><input type="date" class="text-input" id="rereadDate" value="${todayISO()}"></label>
            <label class="field"><span>Valoración esa vez</span><select class="text-input" id="rereadRating">${[0, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5].map(v => `<option value="${v}">${v ? '★ ' + v : 'Sin valorar'}</option>`).join('')}</select></label>
            <label class="field span-2"><span>Nota (opcional)</span><input type="text" class="text-input" id="rereadNote" maxlength="120" placeholder="¿Qué te pareció esta vez?"></label>
        </div>
        <button class="btn btn-primary btn-sm" data-act="reread-save" data-id="${w.id}" style="margin-top:12px">Guardar</button>`);
};
FEATURE_ACTIONS['reread-save'] = id => {
    const w = getWorkById(id);
    if (!w) return;
    const date = $('rereadDate').value || todayISO();
    const rating = Number($('rereadRating').value) || 0, note = $('rereadNote').value.trim();
    closeModal('sheetModal');
    mutate(() => {
        addReread(w, { date, rating, note });
        w.rereads.sort((a, b) => String(a.date).localeCompare(String(b.date)));
    }, '🔁 Apuntada otra vez más', { label: `Apuntar otra vez “${w.title}”` });
};
FEATURE_ACTIONS['reread-remove'] = (id, el) => {
    const w = getWorkById(id);
    if (!w) return;
    mutate(() => {
        w.rereads = (w.rereads || []).filter((_, i) => i !== Number(el.dataset.version));
        if (!w.rereads.length) delete w.rereads;
    }, '✕ Quitada', { label: 'Quitar una vez' });
};

if (typeof module !== 'undefined' && module.exports) module.exports = { FEATURE_ACTIONS };
