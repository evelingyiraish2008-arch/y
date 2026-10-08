/*
 * Mi Mundo · tools.js
 * Herramientas para ahorrar tiempo: buscar datos y portadas, importar de otras apps,
 * acciones con varias obras a la vez, modo rápido y autocompletado.
 * Se carga antes que app.js (usa sus funciones solo dentro de funciones).
 */
'use strict';

// ============================================================
// 1. BUSCAR DATOS Y PORTADAS
// ============================================================
let metaState = { query: '', loading: false, results: [], errors: [], mode: 'data', overwrite: false };
function metaOptions() {
    const seriesType = (workForm.querySelector('[data-field="seriesType"]') || {}).value || 'Serie';
    return { tmdbKey: appData.settings.tmdbKey || '', seriesType };
}
async function openMetaSearch(mode) {
    const query = $('f_title').value.trim();
    if (query.length < 2) { showToast('✍️ Escribe primero el título', 'error'); $('f_title').focus(); return; }
    metaState = { query, loading: true, results: [], errors: [], mode, overwrite: false, type: formType };
    openSheet(mode === 'cover' ? '🖼️ Elegir portada' : '🔎 Buscar datos', renderMetaSheet);
    if (!navigator.onLine) { metaState.loading = false; metaState.errors = ['sin conexión']; if (sheetRefresh) sheetRefresh(); return; }
    const out = await searchMetadata(formType, query, metaOptions());
    if (metaState.query !== query) return; // se lanzó otra búsqueda
    Object.assign(metaState, { loading: false, results: out.results, errors: out.errors });
    if (sheetRefresh && $('sheetModal').classList.contains('active')) sheetRefresh();
}
function renderMetaSheet() {
    const s = metaState;
    const sources = metadataSources(s.type, metaOptions()).map(x => x.label).join(', ');
    if (s.loading) return `<div class="meta-loading"><span class="spinner"></span> Buscando “${esc(s.query)}” en ${esc(sources)}…</div>`;
    const failed = s.errors.length ? `<p class="hint">⚠️ No respondió: ${esc(s.errors.join(', '))}.${s.errors.includes('sin conexión') ? ' Conéctate a internet para buscar.' : ''}</p>` : '';
    const more = `<div class="meta-web">${webFooterHtml(s.query)}</div>`;
    if (!s.results.length) return failed + emptyState('🔍', 'Sin resultados', `No encontré “${s.query}”. Prueba con el título original o en inglés.`) + more;
    if (s.mode === 'cover') {
        const covers = [];
        s.results.forEach((r, i) => { const url = r.coverLarge || r.cover; if (url && !covers.some(c => c.url === url)) covers.push({ url, thumb: r.cover || url, i, r }); });
        return `${failed}<p class="panel-desc" style="margin:0 0 12px">Toca una portada para usarla. Se guardará reducida en tu dispositivo.</p>
            <div class="cover-grid">${covers.slice(0, 10).map(c => `<button class="cover-option" data-act="cover-pick" data-id="${c.i}" title="${esc(c.r.title)} · ${esc(c.r.sourceLabel)}">
                <img src="${esc(c.thumb)}" alt="${esc(c.r.title)}" loading="lazy" data-ph="${s.type}"><small>${esc(c.r.sourceLabel)}${c.r.year ? ' · ' + esc(c.r.year) : ''}</small></button>`).join('')}</div>`;
    }
    return `${failed}
        <label class="checkbox-wrapper" style="margin-bottom:12px"><input type="checkbox" id="metaOverwrite" ${s.overwrite ? 'checked' : ''}> Reemplazar también lo que ya escribí</label>
        <div class="pick-list">${s.results.map((r, i) => `
        <button class="pick-item meta-result" data-act="meta-apply" data-id="${i}">
            <div class="thumb">${r.cover ? `<img src="${esc(r.cover)}" alt="" loading="lazy" data-ph="${s.type}">` : TYPE_META[s.type].icon}</div>
            <span class="info"><b>${esc(r.title)}</b>
                <small>${[r.year, r.author || r.studio || r.platform, r.totalEpisodes ? r.totalEpisodes + ' eps' : '', r.totalChapters ? r.totalChapters + ' caps' : '', r.pages ? r.pages + ' págs' : ''].filter(Boolean).map(esc).join(' · ')}</small>
                ${r.synopsis ? `<small class="meta-synopsis">${esc(r.synopsis.slice(0, 120))}${r.synopsis.length > 120 ? '…' : ''}</small>` : ''}
            </span>
            <span class="chip chip-muted">${esc(r.sourceLabel)}</span>
        </button>`).join('')}</div>${more}`;
}
/** Pone un valor en el campo del formulario de obra y avisa como si se hubiera escrito. */
function setFormField(field, value) {
    const el = workForm.querySelector(`[data-field="${field}"]`);
    if (!el) return false;
    if (el.type === 'checkbox') el.checked = !!value; else el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
}
async function applyMeta(i) {
    const r = metaState.results[Number(i)];
    if (!r) return;
    const overwrite = $('metaOverwrite') ? $('metaOverwrite').checked : false;
    closeModal('sheetModal');
    const details = await fetchMetadataDetails(r, { tmdbKey: appData.settings.tmdbKey || '' });
    const meta = { ...r, ...details };
    // Reparto con fotos y personajes: se usará al guardar para crear sus fichas en Personas
    rememberMetaPeople(meta.people || []);
    if (meta.seriesType === 'Película') delete meta.totalEpisodes;
    const current = collectWorkForm();
    const patch = mergeMetadata(current, meta, { overwrite });
    delete patch.title; // el título lo dejas como lo escribiste
    if (patch.seriesType) setFormField('seriesType', patch.seriesType);
    let n = 0;
    Object.entries(patch).forEach(([f, v]) => { if (f !== 'seriesType' && setFormField(f, v)) n++; });
    // Temporadas con los episodios de cada una (TVmaze, TMDB): solo si aún no las tenías, para no pisar lo que escribiste
    let seasonsFilled = 0;
    if ((meta.seasonsList || []).length > 1 && (!$('f_multi').checked || overwrite)) {
        const progress = Number(workForm.querySelector('[data-field="progress"]').value) || 0;
        renderSeasonsEditor(distributeProgress(meta.seasonsList, progress));
        seasonsFilled = meta.seasonsList.length;
        n++;
    }
    updateRangeOutputs(workForm);
    const coverUrl = meta.coverLarge || meta.cover;
    if (coverUrl && (overwrite || !$('f_image').value)) { await useCover(coverUrl); n++; }
    const extra = seasonsFilled ? ` · ${seasonsFilled} temporadas con sus episodios` : '';
    showToast(n ? `✨ ${n} ${n === 1 ? 'dato rellenado' : 'datos rellenados'} desde ${r.sourceLabel}${extra}` : 'Ya tenías todo rellenado 👌');
}
/** Descarga la portada y la guarda reducida. Si el servidor no lo permite, se guarda el enlace. */
async function useCover(url) {
    try {
        const res = await fetch(url, { mode: 'cors' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const blob = await res.blob();
        const local = URL.createObjectURL(blob);
        try {
            const small = await compressImage(local, 'poster');
            const ref = await store.saveImage(small);
            setFormField('image', ref);
        } finally { URL.revokeObjectURL(local); }
    } catch (e) {
        setFormField('image', url);
    }
    updateWorkPreview();
}
FEATURE_ACTIONS['meta-search'] = () => openMetaSearch('data');
FEATURE_ACTIONS['cover-search'] = () => openMetaSearch('cover');
FEATURE_ACTIONS['meta-apply'] = i => applyMeta(i);
FEATURE_ACTIONS['cover-pick'] = async i => {
    const r = metaState.results[Number(i)];
    if (!r) return;
    closeModal('sheetModal');
    await useCover(r.coverLarge || r.cover);
    showToast('🖼️ Portada lista');
};

// ============================================================
// 2. IMPORTAR DE OTRAS APPS
// ============================================================
let imp = null;
const IMPORT_SOURCES = [
    ['csv', '📄', 'CSV (Goodreads, Letterboxd, Excel…)', 'Exporta tu lista como CSV y elígela aquí. Podrás decir qué columna es cada dato.'],
    ['mal', '🎌', 'MyAnimeList', 'En MyAnimeList: Perfil → Export → descarga el archivo .xml (o .xml.gz).'],
    ['anilist', '💠', 'AniList', 'Solo necesitas tu nombre de usuario (la lista debe ser pública).'],
    ['json', '🗂️', 'JSON', 'Una copia de Mi Mundo u otra lista en JSON. Se añade a lo que ya tienes.']
];
function openImportWizard() {
    imp = { step: 'source', source: null, headers: [], rows: [], mapping: {}, works: [], exists: [], selected: new Set(), mode: 'update', defaultType: 'book', filterType: 'all', filterText: '', busy: false, summary: null };
    openSheet('📥 Importar de otras apps', renderImport);
}
function renderImport() {
    if (!imp) return '';
    if (imp.step === 'source') return `<div class="pick-list">${IMPORT_SOURCES.map(([id, icon, name, desc]) => `
        <button class="pick-item import-source" data-act="imp-source" data-id="${id}"><span class="n-icon">${icon}</span>
        <span class="info"><b>${esc(name)}</b><small>${esc(desc)}</small></span></button>`).join('')}</div>
        ${imp.source === 'anilist' ? '' : ''}`;
    if (imp.step === 'anilist') return `
        <label class="field"><span>Tu usuario de AniList</span><input type="text" class="text-input" id="impAniUser" placeholder="usuario" autocomplete="off"></label>
        <p class="hint">Se importan tu lista de anime y de manga (los manhwas y novelas se reconocen solos).</p>
        <div class="seg-inline" style="margin-top:12px"><button class="btn btn-secondary btn-sm" data-act="imp-back">← Atrás</button>
        <button class="btn btn-primary btn-sm" data-act="imp-anilist" ${imp.busy ? 'disabled' : ''}>${imp.busy ? '⏳ Buscando…' : 'Buscar mi lista'}</button></div>`;
    if (imp.step === 'map') return `
        <p class="panel-desc" style="margin:0 0 12px">${imp.rows.length} filas. Dime qué es cada columna (ya he adivinado algunas):</p>
        <label class="field" style="margin-bottom:12px"><span>Si una fila no dice el tipo, es un…</span>
            <select class="text-input" id="impDefaultType">${TYPE_ORDER.map(t => `<option value="${t}" ${imp.defaultType === t ? 'selected' : ''}>${TYPE_META[t].icon} ${getTypeLabel(t)}</option>`).join('')}</select></label>
        <div class="import-map">${imp.headers.map(h => `
            <div class="import-map-row"><span><b>${esc(h)}</b><small>${esc(String((imp.rows[0] || {})[h] || '').slice(0, 40))}</small></span>
            <select class="text-input" data-imp-map="${esc(h)}"><option value="">— No importar —</option>${Object.entries(IMPORT_FIELDS).map(([f, l]) => `<option value="${f}" ${imp.mapping[h] === f ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>`).join('')}</div>
        <div class="seg-inline" style="margin-top:14px"><button class="btn btn-secondary btn-sm" data-act="imp-back">← Atrás</button>
        <button class="btn btn-primary btn-sm" data-act="imp-mapped">Ver vista previa →</button></div>`;
    if (imp.step === 'preview') {
        const q = norm(imp.filterText);
        const visible = imp.works.map((w, i) => i).filter(i => (imp.filterType === 'all' || imp.works[i].type === imp.filterType) && (!q || norm(imp.works[i].title).includes(q)));
        const dupCount = imp.exists.filter(Boolean).length;
        return `
        <div class="import-toolbar">
            <input type="search" class="text-input" id="impFilterText" placeholder="Filtrar por título…" value="${esc(imp.filterText)}">
            <select class="text-input" id="impFilterType"><option value="all">Todos los tipos</option>${TYPE_ORDER.map(t => `<option value="${t}" ${imp.filterType === t ? 'selected' : ''}>${TYPE_META[t].icon} ${getTypeLabel(t)}</option>`).join('')}</select>
            <button class="btn btn-secondary btn-sm" data-act="imp-all">Marcar visibles</button>
            <button class="btn btn-secondary btn-sm" data-act="imp-none">Desmarcar visibles</button>
        </div>
        ${dupCount ? `<div class="import-mode"><span>${dupCount} ya ${dupCount === 1 ? 'la tienes' : 'las tienes'}. ¿Qué hago con ${dupCount === 1 ? 'ella' : 'ellas'}?</span>
            ${[['update', 'Completar lo que falte'], ['skip', 'Ignorarlas'], ['duplicate', 'Añadirlas otra vez']].map(([m, l]) => `<label class="chip chip-muted note-type-opt"><input type="radio" name="impMode" value="${m}" ${imp.mode === m ? 'checked' : ''}> ${l}</label>`).join('')}</div>` : ''}
        <div class="import-table-wrap"><table class="import-table">
            <thead><tr><th></th><th>Título</th><th>Tipo</th><th>Estado</th><th>Nota</th><th>Progreso</th></tr></thead>
            <tbody>${visible.slice(0, 400).map(i => { const w = imp.works[i]; return `<tr class="${imp.exists[i] ? 'is-dup' : ''}">
                <td><input type="checkbox" data-imp-row="${i}" ${imp.selected.has(i) ? 'checked' : ''} aria-label="Importar ${esc(w.title)}"></td>
                <td>${esc(w.title)}${imp.exists[i] ? ' <span class="chip chip-muted">Ya la tienes</span>' : ''}</td>
                <td>${TYPE_META[w.type].icon}</td><td>${esc(getStatusLabel(w.status))}</td><td>${w.rating ? '★ ' + ratingText(w.rating) : '–'}</td>
                <td>${w.progress || 0}${getTotal(w) ? ' / ' + getTotal(w) : ''}</td></tr>`; }).join('')}</tbody></table></div>
        ${visible.length > 400 ? `<p class="hint">Se muestran 400 de ${visible.length}. Filtra para ver el resto (las marcadas se importan igualmente).</p>` : ''}
        <div class="seg-inline" style="margin-top:14px"><button class="btn btn-secondary btn-sm" data-act="imp-back">← Atrás</button>
        <button class="btn btn-primary btn-sm" data-act="imp-run" ${imp.selected.size ? '' : 'disabled'}>📥 Importar ${imp.selected.size}</button></div>`;
    }
    if (imp.step === 'done') {
        const s = imp.summary;
        return `<div class="import-done"><div class="big">🎉</div><h4>¡Importación terminada!</h4>
            <p>${s.created} ${s.created === 1 ? 'obra nueva' : 'obras nuevas'} · ${s.updated} ${s.updated === 1 ? 'completada' : 'completadas'} · ${s.skipped} ${s.skipped === 1 ? 'ignorada' : 'ignoradas'}</p>
            <p class="hint">¿Te equivocaste? Pulsa Ctrl+Z o “Deshacer” en el aviso para dejarlo todo como estaba.</p></div>`;
    }
    return '';
}
function importLoaded(works, label) {
    if (!works.length) { showToast(`⚠️ No encontré obras en ${label}`, 'error'); return; }
    imp.works = works;
    imp.exists = markExisting(works, appData.works);
    imp.selected = new Set(works.map((_, i) => i));
    imp.step = 'preview';
    sheetRefresh();
}
async function readImportFile(file) {
    if (!file || !imp) return;
    let text;
    try {
        if (/\.gz$/i.test(file.name) && typeof DecompressionStream !== 'undefined') {
            text = await new Response(file.stream().pipeThrough(new DecompressionStream('gzip'))).text();
        } else text = await file.text();
    } catch (e) { showToast('❌ No se pudo leer el archivo', 'error'); return; }
    try {
        if (imp.source === 'mal' || /<myanimelist/i.test(text.slice(0, 500))) { importLoaded(parseMalXml(text), 'el archivo de MyAnimeList'); return; }
        if (imp.source === 'json' || /^\s*[[{]/.test(text)) { importLoaded(parseJsonImport(text), 'el JSON'); return; }
        const { headers, rows } = parseCSV(text);
        if (!headers.length || !rows.length) { showToast('⚠️ El CSV está vacío', 'error'); return; }
        Object.assign(imp, { headers, rows, mapping: guessMapping(headers), step: 'map' });
        if (/goodreads|book id/i.test(headers.join(' '))) imp.defaultType = 'book';
        sheetRefresh();
    } catch (e) {
        console.error(e);
        showToast('❌ El archivo no tiene un formato que entienda', 'error');
    }
}
async function importAniList() {
    const user = ($('impAniUser').value || '').trim();
    if (!user) { showToast('✍️ Escribe tu usuario', 'error'); return; }
    imp.busy = true; sheetRefresh();
    const ask = type => fetch('https://graphql.anilist.co', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ query: ANILIST_LIST_QUERY, variables: { name: user, type } })
    }).then(r => r.json().then(j => { if (!r.ok || j.errors) throw new Error((j.errors && j.errors[0] && j.errors[0].message) || r.status); return parseAniListCollection(j, type); }));
    try {
        const [anime, manga] = await Promise.all([ask('ANIME'), ask('MANGA')]);
        imp.busy = false;
        importLoaded([...anime, ...manga], `la lista de ${user}`);
    } catch (e) {
        imp.busy = false; sheetRefresh();
        showToast(/not found|404/i.test(String(e.message)) ? `⚠️ No existe el usuario “${user}” o su lista es privada` : '❌ No se pudo conectar con AniList', 'error', 5000);
    }
}
function runImport() {
    const chosen = [...imp.selected].sort((a, b) => a - b).map(i => imp.works[i]);
    const plan = planImport(chosen, appData.works, imp.mode);
    const now = Date.now();
    mutate(() => {
        plan.create.forEach((w, k) => appData.works.push({ ...w, id: generateId(), createdAt: now + k, updatedAt: now + k }));
        plan.update.forEach(({ existing, patch }) => Object.assign(existing, patch));
    }, `📥 ${plan.create.length} ${plan.create.length === 1 ? 'obra importada' : 'obras importadas'}${plan.update.length ? `, ${plan.update.length} completadas` : ''}`, { label: 'Importar obras' });
    imp.summary = { created: plan.create.length, updated: plan.update.length, skipped: plan.skip.length };
    imp.step = 'done';
    sheetRefresh();
    // Las portadas de AniList se descargan poco a poco en segundo plano
    downloadImportedCovers();
    // Autores y reparto de lo importado: se ofrece crear sus fichas en Personas
    const missing = missingPersons(appData.works, appData.persons).length;
    if (missing) showToast(`👥 Hay ${missing} ${missing === 1 ? 'nombre' : 'nombres'} sin ficha en Personas`, 'info', 8000, { label: 'Crear fichas', run: () => linkAllWorks({ ask: false }) });
}
async function downloadImportedCovers() {
    const pending = appData.works.filter(w => /^https:\/\/s4\.anilist\.co\//.test(w.image || '')).slice(0, 200);
    for (const w of pending) {
        try {
            const res = await fetch(w.image);
            if (!res.ok) continue;
            const local = URL.createObjectURL(await res.blob());
            const ref = await store.saveImage(await compressImage(local, 'poster'));
            URL.revokeObjectURL(local);
            const cur = getWorkById(w.id);
            if (cur && cur.image === w.image) { cur.image = ref; saveData(); }
        } catch (e) { break; }
    }
}
FEATURE_ACTIONS['import-wizard'] = () => openImportWizard();
FEATURE_ACTIONS['imp-source'] = id => {
    imp.source = id;
    if (id === 'anilist') { imp.step = 'anilist'; sheetRefresh(); setTimeout(() => $('impAniUser') && $('impAniUser').focus(), 30); return; }
    const input = $('importAnyFile');
    input.accept = id === 'mal' ? '.xml,.gz' : id === 'json' ? '.json,application/json' : '.csv,.tsv,.txt,text/csv';
    input.click();
};
FEATURE_ACTIONS['imp-back'] = () => { imp.step = imp.step === 'preview' && imp.headers.length ? 'map' : 'source'; sheetRefresh(); };
FEATURE_ACTIONS['imp-anilist'] = () => importAniList();
FEATURE_ACTIONS['imp-mapped'] = () => {
    if (!Object.values(imp.mapping).includes('title')) { showToast('⚠️ Elige qué columna es el título', 'error'); return; }
    importLoaded(rowsToWorks(imp.rows, imp.mapping, { defaultType: imp.defaultType }), 'el CSV');
};
const visibleImportRows = () => [...document.querySelectorAll('[data-imp-row]')].map(el => Number(el.dataset.impRow));
FEATURE_ACTIONS['imp-all'] = () => { visibleImportRows().forEach(i => imp.selected.add(i)); sheetRefresh(); };
FEATURE_ACTIONS['imp-none'] = () => { visibleImportRows().forEach(i => imp.selected.delete(i)); sheetRefresh(); };
FEATURE_ACTIONS['imp-run'] = () => runImport();
/** Cambios en el asistente (selects, casillas, filtros). Devuelve true si lo ha gestionado. */
function onImportInput(t) {
    if (!imp) return false;
    if (t.dataset.impMap !== undefined) { if (t.value) Object.keys(imp.mapping).forEach(h => { if (imp.mapping[h] === t.value) delete imp.mapping[h]; }); imp.mapping[t.dataset.impMap] = t.value; if (!t.value) delete imp.mapping[t.dataset.impMap]; sheetRefresh(); return true; }
    if (t.id === 'impDefaultType') { imp.defaultType = t.value; return true; }
    if (t.dataset.impRow !== undefined) { const i = Number(t.dataset.impRow); if (t.checked) imp.selected.add(i); else imp.selected.delete(i); $('sheetBody').querySelector('[data-act="imp-run"]').textContent = `📥 Importar ${imp.selected.size}`; $('sheetBody').querySelector('[data-act="imp-run"]').disabled = !imp.selected.size; return true; }
    if (t.name === 'impMode') { imp.mode = t.value; return true; }
    if (t.id === 'impFilterType') { imp.filterType = t.value; sheetRefresh(); return true; }
    if (t.id === 'impFilterText') {
        imp.filterText = t.value;
        const caret = t.selectionStart;
        sheetRefresh();
        $('impFilterText').focus(); $('impFilterText').setSelectionRange(caret, caret);
        return true;
    }
    return false;
}
FEATURE_ACTIONS['export-csv'] = () => downloadFile(`mi-mundo-${todayISO()}.csv`, '﻿' + worksToCSV(appData.works), 'text/csv');
function downloadFile(name, content, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type }));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ============================================================
// 3. VARIAS OBRAS A LA VEZ
// ============================================================
let selecting = false;
const selection = new Set();
const SELECT_PAGES = ['books', 'series', 'anime', 'manhwa', 'bl'];
function setSelecting(on) {
    selecting = on;
    if (!on) selection.clear();
    document.body.classList.toggle('is-selecting', on);
    renderBulkBar();
    RENDERERS[currentPage]();
}
function toggleSelected(id) {
    if (selection.has(id)) selection.delete(id); else selection.add(id);
    document.querySelectorAll(`.work-item[data-id="${CSS.escape(id)}"]`).forEach(c => c.classList.toggle('is-selected', selection.has(id)));
    renderBulkBar();
}
function visibleWorkIds() {
    return [...new Set([...document.querySelectorAll(`#page-${currentPage} .work-item[data-id]`)].map(c => c.dataset.id))];
}
const BULK_STATUS = [['active', '▶️ En curso'], ['done', '✅ Terminada'], ['plan', '⏳ Pendiente'], ['dropped', '⏸️ Abandonada']];
function statusFor(kind, type) {
    const s = STATUS_BY_TYPE[type];
    return { active: s[0], done: 'terminado', plan: s[2], dropped: 'abandonado' }[kind];
}
function renderBulkBar() {
    const bar = $('bulkBar');
    bar.hidden = !selecting;
    if (!selecting) return;
    const n = selection.size;
    bar.innerHTML = `
        <span class="bulk-count"><b>${n}</b> ${n === 1 ? 'seleccionada' : 'seleccionadas'}</span>
        <button class="btn btn-secondary btn-sm" data-act="bulk-all">Todas las visibles</button>
        <button class="btn btn-secondary btn-sm" data-act="bulk-none" ${n ? '' : 'disabled'}>Ninguna</button>
        <span class="bulk-sep"></span>
        <select class="filter-select" id="bulkStatus" ${n ? '' : 'disabled'} aria-label="Cambiar estado"><option value="">Estado…</option>${BULK_STATUS.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select>
        <button class="btn btn-secondary btn-sm" data-act="bulk-bl" ${n ? '' : 'disabled'}>💖 BL</button>
        <button class="btn btn-secondary btn-sm" data-act="bulk-fav" ${n ? '' : 'disabled'}>❤️ Favorito</button>
        <button class="btn btn-secondary btn-sm" data-act="bulk-coll" ${n ? '' : 'disabled'}>📂 Colección</button>
        <button class="btn btn-secondary btn-sm" data-act="bulk-export" ${n ? '' : 'disabled'}>📤 Exportar</button>
        <button class="btn btn-danger btn-sm" data-act="bulk-delete" ${n ? '' : 'disabled'} aria-label="Eliminar seleccionadas">🗑️</button>
        <button class="icon-btn sm" data-act="select-mode" aria-label="Salir de la selección" title="Salir (Esc)">✕</button>`;
}
function selectedWorks() { return [...selection].map(getWorkById).filter(Boolean); }
function bulkMutate(fn, msg, label) {
    const list = selectedWorks().filter(w => !w.locked);
    const locked = selection.size - list.length;
    if (!list.length) { showToast('🔒 Las seleccionadas están bloqueadas', 'error'); return; }
    mutate(() => list.forEach(fn), msg(list.length) + (locked ? ` (${locked} bloqueada${locked === 1 ? '' : 's'} sin cambiar)` : ''), { label });
}
FEATURE_ACTIONS['select-mode'] = () => setSelecting(!selecting);
FEATURE_ACTIONS['bulk-all'] = () => { visibleWorkIds().forEach(id => selection.add(id)); RENDERERS[currentPage](); renderBulkBar(); };
FEATURE_ACTIONS['bulk-none'] = () => { selection.clear(); RENDERERS[currentPage](); renderBulkBar(); };
FEATURE_ACTIONS['bulk-bl'] = () => {
    const allBl = selectedWorks().every(w => w.bl);
    bulkMutate(w => { w.bl = !allBl; }, n => `${allBl ? '🤍 Quitado BL a' : '💖 Marcadas como BL'} ${n} ${n === 1 ? 'obra' : 'obras'}`, 'Cambiar BL en varias');
};
FEATURE_ACTIONS['bulk-fav'] = () => {
    const allFav = selectedWorks().every(w => w.favorite);
    bulkMutate(w => { w.favorite = !allFav; }, n => `${allFav ? '🤍 Quitadas de favoritos' : '❤️ Añadidas a favoritos'}: ${n}`, 'Favoritos en varias');
};
FEATURE_ACTIONS['bulk-delete'] = () => {
    const list = selectedWorks().filter(w => !w.locked);
    if (!list.length) return;
    if (!confirm(`¿Enviar ${list.length} ${list.length === 1 ? 'obra' : 'obras'} a la papelera? Podrás recuperarlas durante ${TRASH_DAYS} días.`)) return;
    const now = Date.now();
    mutate(() => list.forEach(w => trashRecord(appData, 'works', w.id, now, { from: TYPE_PLURAL[w.type] })), `🗑️ ${list.length} ${list.length === 1 ? 'obra enviada' : 'obras enviadas'} a la papelera`, { label: `Eliminar ${list.length} obras` });
    selection.clear();
    renderBulkBar();
};
FEATURE_ACTIONS['bulk-export'] = () => {
    const list = selectedWorks();
    openSheet('📤 Exportar seleccionadas', () => `<p class="panel-desc" style="margin:0 0 12px">${list.length} ${list.length === 1 ? 'obra' : 'obras'}.</p>
        <div class="seg-inline"><button class="btn btn-primary btn-sm" data-act="bulk-export-csv">📄 CSV (Excel, Google Sheets)</button>
        <button class="btn btn-secondary btn-sm" data-act="bulk-export-json">🗂️ JSON</button></div>`);
};
FEATURE_ACTIONS['bulk-export-csv'] = () => { downloadFile(`mi-mundo-seleccion-${todayISO()}.csv`, '﻿' + worksToCSV(selectedWorks()), 'text/csv'); closeModal('sheetModal'); };
FEATURE_ACTIONS['bulk-export-json'] = () => { downloadFile(`mi-mundo-seleccion-${todayISO()}.json`, JSON.stringify({ works: selectedWorks() }, null, 2), 'application/json'); closeModal('sheetModal'); };
FEATURE_ACTIONS['bulk-coll'] = () => {
    openSheet('📂 Añadir a una colección', () => `<div class="pick-list">${manualCollections().map(c => `
        <button class="pick-item" data-act="bulk-coll-add" data-id="${c.id}"><span class="info"><b>${esc(c.name)}</b><small>${c.items.length} obras</small></span></button>`).join('')
        || '<p class="panel-desc" style="margin:0">Todavía no tienes colecciones.</p>'}
        <button class="pick-item" data-act="bulk-coll-new" style="justify-content:center;color:var(--accent-text);font-weight:600">＋ Nueva colección con estas obras</button></div>`);
};
FEATURE_ACTIONS['bulk-coll-add'] = id => {
    const c = getCollectionById(id);
    if (!c) return;
    const ids = [...selection].filter(x => !c.items.includes(x));
    closeModal('sheetModal');
    mutate(() => { c.items = [...c.items, ...ids]; }, `📂 ${ids.length} ${ids.length === 1 ? 'obra añadida' : 'obras añadidas'} a “${c.name}”`, { label: `Añadir a “${c.name}”` });
};
FEATURE_ACTIONS['bulk-coll-new'] = () => {
    const name = (prompt('Nombre de la nueva colección:') || '').trim();
    if (!name) return;
    closeModal('sheetModal');
    mutate(() => { appData.collections.push({ id: generateId(), name, description: '', items: [...selection], createdAt: Date.now() }); }, `🗂️ Colección “${name}” creada con ${selection.size} obras`, { label: `Crear colección “${name}”` });
};
function onBulkStatus(select) {
    const kind = select.value;
    if (!kind) return;
    bulkMutate(w => {
        w.status = statusFor(kind, w.type);
        if (kind === 'done') { if (!w.endDate) w.endDate = todayISO(); if (getTotal(w)) w.progress = getTotal(w); }
        if ((kind === 'active' || kind === 'done') && !w.startDate) w.startDate = todayISO();
        if (kind !== 'plan') bumpActivity(w);
    }, n => `✅ Estado cambiado en ${n} ${n === 1 ? 'obra' : 'obras'}`, 'Cambiar estado de varias');
}

// ============================================================
// 4. MODO RÁPIDO
// ============================================================
let quick = { type: 'book', status: 'plan', added: [] };
function openQuickAdd() {
    quick.added = [];
    openSheet('⚡ Modo rápido', renderQuickAdd);
    setTimeout(() => $('quickTitle') && $('quickTitle').focus(), 70);
}
function renderQuickAdd() {
    return `<p class="panel-desc" style="margin:0 0 12px">Escribe un título y pulsa Intro. El formulario se vacía para la siguiente. Los detalles los puedes completar después.</p>
        <div class="pick-filters">${TYPE_ORDER.map(t => `<button class="chip chip-muted ${quick.type === t ? 'is-on' : ''}" data-act="quick-type" data-id="${t}">${TYPE_META[t].icon} ${getTypeLabel(t)}</button>`).join('')}</div>
        <div class="quick-form">
            <input type="text" class="text-input" id="quickTitle" placeholder="Título…" autocomplete="off">
            <select class="text-input" id="quickStatus" aria-label="Estado">${BULK_STATUS.map(([k, l]) => `<option value="${k}" ${quick.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
            <input type="url" class="text-input" id="quickCover" placeholder="URL de la portada (opcional)">
            <label class="checkbox-wrapper"><input type="checkbox" id="quickBl"> 💖 BL</label>
            <button class="btn btn-primary btn-sm" data-act="quick-add">＋ Añadir</button>
        </div>
        ${quick.added.length ? `<div class="quick-added"><b>${quick.added.length} ${quick.added.length === 1 ? 'añadida' : 'añadidas'} en esta tanda:</b> ${quick.added.map(id => getWorkById(id)).filter(Boolean).map(w => `<button class="chip" data-open="${w.id}">${TYPE_META[w.type].icon} ${esc(w.title)}</button>`).join(' ')}</div>` : ''}`;
}
function quickAdd() {
    const title = $('quickTitle').value.trim();
    if (!title) { $('quickTitle').focus(); return; }
    quick.status = $('quickStatus').value;
    const w = { id: generateId(), type: quick.type, title, status: statusFor(quick.status, quick.type), createdAt: Date.now(), updatedAt: Date.now() };
    const cover = $('quickCover').value.trim();
    if (cover) w.image = cover;
    if ($('quickBl').checked) w.bl = true;
    if (quick.status === 'active' || quick.status === 'done') w.startDate = todayISO();
    if (quick.status === 'done') w.endDate = todayISO();
    const dup = findSimilarWorks(title, appData.works, { min: 0.9, limit: 1 })[0];
    if (dup && !confirm(`Ya tienes “${dup.work.title}”. ¿Añadirla igualmente?`)) return;
    quick.added.push(w.id);
    mutate(() => appData.works.push(w), `⚡ “${title}” añadida`, { label: `Añadir “${title}”` });
    $('quickTitle').focus();
}
FEATURE_ACTIONS['quick'] = () => openQuickAdd();
FEATURE_ACTIONS['quick-from-form'] = () => { if (closeModal('workModal')) { quick.type = formType; openQuickAdd(); } };
FEATURE_ACTIONS['quick-type'] = t => { quick.type = t; const v = $('quickTitle').value; sheetRefresh(); $('quickTitle').value = v; $('quickTitle').focus(); };
FEATURE_ACTIONS['quick-add'] = () => quickAdd();

// ============================================================
// 5. AUTOCOMPLETADO
// ============================================================
/** Rellena las listas de sugerencias del formulario con lo que ya has escrito antes (lo más usado primero). */
function fillAutocomplete() {
    const fill = (id, values) => { const el = $(id); if (el) el.innerHTML = values.map(v => `<option value="${esc(v)}">`).join(''); };
    const top = (field, extra = []) => {
        const counts = new Map();
        [...extra, ...appData.works.flatMap(w => splitList(w[field]))].forEach(v => {
            const k = norm(v);
            const cur = counts.get(k) || { v, n: 0 };
            cur.n++;
            counts.set(k, cur);
        });
        return [...counts.values()].sort((a, b) => b.n - a.n).map(x => x.v).slice(0, 80);
    };
    fill('dlAuthors', top('author', appData.persons.filter(p => p.type === 'author').map(p => p.name)));
    fill('dlStudios', top('studio'));
    fill('dlPlatforms', top('platform', ['Netflix', 'Viki', 'Prime Video', 'Disney+', 'Crunchyroll', 'Webtoon', 'Tapas', 'Lezhin', 'GagaOOLala', 'YouTube', 'iQIYI', 'WeTV']));
    fill('dlCountries', top('country', ['Japón', 'Corea del Sur', 'China', 'Tailandia', 'Taiwán', 'Filipinas', 'Estados Unidos', 'España', 'México']));
    fill('dlGenres', top('genre', ['Fantasía', 'Romance', 'Drama', 'Acción', 'Comedia', 'Misterio', 'Terror', 'Ciencia ficción']));
    fill('dlActors', top('actors', appData.persons.filter(p => p.type === 'actor').map(p => p.name)));
    fill('dlDirectors', top('directors', appData.persons.filter(p => p.type === 'director').map(p => p.name)));
}
/** Aviso junto al día de emisión: cuántas obras tienes ya ese día. */
function updateAirDayHint() {
    const el = $('airDayHint');
    const sel = workForm.querySelector('[data-field="airDay"]');
    if (!el || !sel) return;
    const day = sel.value;
    if (day === '') { el.textContent = ''; return; }
    const same = appData.works.filter(w => w.id !== editingWorkId && isActive(w) && String(getAirDay(w)) === day);
    const status = $('f_status').value;
    el.textContent = status === 'terminado' || status === 'abandonado'
        ? '💡 Solo aparece en el calendario mientras la estés viendo.'
        : same.length ? `📺 Ese día ya tienes ${same.length}: ${same.slice(0, 3).map(w => w.title).join(', ')}${same.length > 3 ? '…' : ''}` : '';
}

// ============================================================
// 6. FECHAS DE EMISIÓN REALES (AniList y TVmaze)
// ============================================================
const AIRING_REFRESH_MS = 6 * 3600000;
async function refreshAiring({ silent = false } = {}) {
    const list = appData.works.filter(w => isActive(w) && (Number(w.anilistId) || Number(w.tvmazeId)));
    if (!list.length) { if (!silent) showToast('📺 Usa “Rellenar datos por el título” en tus series y animes para poder consultar sus próximos episodios.', 'info', 6000); return; }
    if (!navigator.onLine) { if (!silent) showToast('📶 Sin conexión', 'error'); return; }
    const info = await fetchNextEpisodes(list);
    appData.settings.airingCheckedAt = Date.now();
    const changed = list.filter(w => w.id in info && JSON.stringify(w.nextAiring || null) !== JSON.stringify(info[w.id]));
    if (changed.length) mutate(() => changed.forEach(w => { if (info[w.id]) w.nextAiring = info[w.id]; else delete w.nextAiring; }), silent ? null : `🔄 Próximos episodios actualizados (${changed.length})`, { undo: false });
    else { saveData(); if (!silent) showToast('👌 Todo al día'); }
    renderNextAiring();
}
function airingWhen(at, now = Date.now()) {
    const d = new Date(at);
    const days = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - new Date(new Date(now).getFullYear(), new Date(now).getMonth(), new Date(now).getDate())) / 86400000);
    const time = d.toLocaleTimeString(APP_LOCALE, { hour: '2-digit', minute: '2-digit' });
    if (at < now) return `ya disponible (salió ${days === 0 ? 'hoy' : days === -1 ? 'ayer' : 'el ' + fmtDate(at)})`;
    if (days === 0) return `hoy a las ${time}`;
    if (days === 1) return `mañana a las ${time}`;
    return `${d.toLocaleDateString(APP_LOCALE, { weekday: 'long', day: 'numeric', month: 'short' })}, ${time} (en ${days} días)`;
}
function renderNextAiring() {
    const box = $('nextAiring');
    if (!box) return;
    const now = Date.now();
    const list = appData.works.filter(w => isActive(w) && w.nextAiring && w.nextAiring.at > now - 3 * 86400000).sort((a, b) => a.nextAiring.at - b.nextAiring.at);
    box.hidden = !list.length;
    box.innerHTML = list.length ? `<div class="section-header"><h3 class="section-title">🗓️ Próximos episodios</h3><small class="muted">${appData.settings.airingCheckedAt ? 'Actualizado ' + esc(relativeTime(appData.settings.airingCheckedAt)) : ''}</small></div>
        <div class="pace-list">${list.map(w => `<button class="pace-item ${w.nextAiring.at < now ? 'is-out' : ''}" data-open="${w.id}"><span class="thumb">${img(w.image, w.type, w.title)}</span>
        <span class="info"><b>${esc(w.title)}</b><small>${w.nextAiring.season ? `T${w.nextAiring.season} · ` : ''}Ep ${w.nextAiring.episode} · ${esc(airingWhen(w.nextAiring.at, now))}</small></span></button>`).join('')}</div>` : '';
}
FEATURE_ACTIONS['airing-refresh'] = () => refreshAiring();
/** Al abrir el Centro de Emisión, se actualiza solo si hace más de 6 horas. */
function maybeRefreshAiring() {
    if (navigator.onLine && Date.now() - (Number(appData.settings.airingCheckedAt) || 0) > AIRING_REFRESH_MS && appData.works.some(w => isActive(w) && (Number(w.anilistId) || Number(w.tvmazeId)))) refreshAiring({ silent: true }).catch(() => {});
}

if (typeof module !== 'undefined' && module.exports) module.exports = {};
