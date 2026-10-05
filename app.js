/*
 * Mi Mundo · app.js
 * Estado, renderizado, eventos e inicio. Depende de utils.js.
 */
'use strict';
// ============================================================
// 1. UTILIDADES DEL DOM
// ============================================================
const $ = id => document.getElementById(id);
const val = id => ($(id) ? $(id).value : '');
const checked = id => !!($(id) && $(id).checked);

// ============================================================
// 2. DATOS Y PERSISTENCIA
// ============================================================
let appData = emptyData();
let store = null;               // IdbBackend o LocalBackend (storage.js)
let saveChain = Promise.resolve();
let savePending = false;
let onlySampleData = false;     // este dispositivo solo tiene los ejemplos iniciales, sin cambios del usuario
const syncChannel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('mi-mundo') : null;

setImageResolver(src => (isImageRef(src) ? (store ? store.resolve(src) : '') : (src || '')));

/** Abre el almacenamiento, migra los datos antiguos de localStorage si hace falta y carga todo en memoria. */
async function loadData() {
    store = await openStorage();
    let data = null;
    try { data = await store.load(); }
    catch (e) { console.error('Datos corruptos, se cargan ejemplos', e); }
    if (data) {
        appData = normalizeData(data);
        if (store.kind === 'indexeddb') onlySampleData = !!(await store.getMeta('onlySamples'));
        store.collectGarbage(appData).catch(err => console.warn('No se pudieron limpiar imágenes', err));
        return;
    }
    const legacy = store.kind === 'indexeddb' ? readLegacyData() : null;
    if (legacy) {
        appData = normalizeData(legacy.data);
        const moved = await externalizeImages(appData, store);
        await store.save(appData);
        archiveLegacyData(legacy.raw);
        console.info(`Datos migrados a IndexedDB (${appData.works.length} obras, ${moved} imágenes).`);
    } else {
        appData = emptyData();
        seedSampleData();
        await persistNow();
        if (store.kind === 'indexeddb') { await store.setMeta('onlySamples', true); onlySampleData = true; }
    }
}
function isQuotaError(e) {
    return e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22 || e.code === 1014);
}
async function persistNow() {
    await store.save(appData);
    if (onlySampleData) { onlySampleData = false; store.setMeta('onlySamples', null).catch(() => {}); }
    if (syncChannel) syncChannel.postMessage({ type: 'saved' });
    cloud.onLocalSave();
}
/**
 * Programa el guardado de appData. Los cambios ya están en memoria y la interfaz se actualiza al momento;
 * la escritura se agrupa y se hace en segundo plano. Si falla, se vuelve al último estado guardado.
 */
function saveData() {
    if (savePending) return true;
    savePending = true;
    saveChain = saveChain.then(async () => {
        savePending = false;
        try {
            await persistNow();
        } catch (e) {
            if (isQuotaError(e)) {
                showToast('⚠️ El almacenamiento está lleno. Ve a Personalizar → “Optimizar imágenes” o elimina datos que no uses.', 'error', 7000);
            } else {
                console.error(e);
                showToast('❌ No se pudo guardar el último cambio', 'error');
            }
            const last = store.snapshot();
            if (last) { appData = normalizeData(last); applySettings(); refreshView(); }
        }
    });
    return true;
}
/** Promesa que se resuelve cuando no queda nada por guardar. */
function whenSaved() { return saveChain; }
/** Último momento en que se creó o cambió un registro (los ejemplos tienen updatedAt = 1). */
function lastTouched(item) { return Math.max(Number(item.updatedAt) || 0, Number(item.createdAt) || 0); }
/** Ejecuta una tarea de almacenamiento en orden con los guardados (sin bloquear los siguientes si falla). */
function runAfterSaves(fn) {
    const task = saveChain.then(fn);
    saveChain = task.catch(() => {});
    return task;
}
/**
 * Aplica un cambio en memoria, lo guarda y actualiza la vista.
 * Se apunta en el historial para poder deshacerlo (opts.undo = false para no hacerlo) y,
 * si cambió alguna obra, en el historial de versiones de esa obra.
 */
function mutate(fn, msg, opts = {}) {
    if (appData.settings.readOnly && !opts.allowReadOnly) {
        showToast('👀 Estás en modo solo lectura. Desactívalo en Personalizar para hacer cambios.', 'error', 4000);
        return false;
    }
    const before = indexRecords(appData);
    const cBefore = celebrationStats();
    fn();
    recordVersions(before, appData);
    const entry = opts.undo === false ? null : pushUndo(opts.label || msg, diffIndex(before, indexRecords(appData)));
    saveData();
    if (msg) showToast(msg, opts.type || 'info', entry ? 5000 : 2800, entry ? { label: 'Deshacer', run: () => undoUntil(entry) } : null);
    refreshView();
    celebrateChanges(cBefore, celebrationStats());
    return true;
}

// ---------- Deshacer / rehacer ----------
const UNDO_LIMIT = 50;
let undoStack = [], redoStack = [];
function pushUndo(label, changes) {
    if (!changes.length) return null;
    const entry = { id: generateId(), label: String(label || 'Cambio').replace(/^\W+\s*/u, ''), at: Date.now(), changes };
    undoStack.push(entry);
    if (undoStack.length > UNDO_LIMIT) undoStack.shift();
    redoStack = [];
    return entry;
}
function afterHistoryJump(msg) {
    saveData();
    applySettings();
    showToast(msg);
    refreshView();
}
function undo() {
    const entry = undoStack.pop();
    if (!entry) { showToast('Nada que deshacer'); return; }
    applyChanges(appData, entry.changes, 'before');
    redoStack.push(entry);
    afterHistoryJump(`↩️ Deshecho: ${entry.label}`);
    playSound('undo');
}
function redo() {
    const entry = redoStack.pop();
    if (!entry) { showToast('Nada que rehacer'); return; }
    applyChanges(appData, entry.changes, 'after');
    undoStack.push(entry);
    afterHistoryJump(`↪️ Rehecho: ${entry.label}`);
}
/** Deshace todo hasta esa acción incluida (el botón "Deshacer" de un aviso o del historial). */
function undoUntil(entry) {
    const i = undoStack.indexOf(entry);
    if (i < 0) { showToast('Ese cambio ya no se puede deshacer'); return; }
    const undone = undoStack.splice(i).reverse();
    undone.forEach(e => applyChanges(appData, e.changes, 'before'));
    redoStack.push(...undone);
    afterHistoryJump(undone.length > 1 ? `↩️ Deshechos ${undone.length} cambios` : `↩️ Deshecho: ${entry.label}`);
}
function openHistory() {
    openSheet('🕓 Historial de cambios', () => undoStack.length || redoStack.length ? `
        <p class="panel-desc" style="margin:0 0 12px">Tus últimos ${UNDO_LIMIT} cambios de esta sesión. También puedes usar <kbd>Ctrl</kbd>+<kbd>Z</kbd> y <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd>.</p>
        <div class="pick-list">${undoStack.slice().reverse().map(e => `
            <div class="pick-item history-item">
                <span class="info"><b>${esc(e.label)}</b><small>${esc(relativeTime(e.at))} · ${e.changes.length} ${e.changes.length === 1 ? 'registro' : 'registros'}</small></span>
                <button class="btn btn-secondary btn-sm" data-act="undo-until" data-id="${e.id}">↩️ Deshacer hasta aquí</button>
            </div>`).join('')}
            ${redoStack.length ? `<button class="pick-item" data-act="redo" style="justify-content:center;font-weight:600">↪️ Rehacer “${esc(redoStack[redoStack.length - 1].label)}”</button>` : ''}
        </div>` : emptyState('🕓', 'Sin cambios todavía', 'Aquí aparecerá lo que hagas en esta sesión, para deshacerlo si te equivocas.'));
}
/** Fecha relativa si es de la última semana ("hace 2 días"), si no la fecha. */
function relDate(ts) { return ts && Date.now() - ts < 7 * 86400000 ? relativeTime(ts) : fmtDate(ts); }
/** "hace 5 min", "ayer", "hace 3 días"… */
function relativeTime(ts, now = Date.now()) {
    const s = Math.round((now - ts) / 1000);
    if (s < 45) return 'hace un momento';
    if (s < 3600) return `hace ${Math.max(1, Math.round(s / 60))} min`;
    if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
    const d = Math.round(s / 86400);
    if (d === 1) return 'ayer';
    if (d < 30) return `hace ${d} días`;
    return fmtDate(ts);
}

function seedSampleData() {
    const day = 86400000, now = Date.now();
    const IMG_A = 'https://image.qwenlm.ai/public_source/e9c640f1-dd58-4bee-8a16-70a70c821f91/14aacaa60-a026-495a-99f8-e4b91bd878c8.png';
    const IMG_B = 'https://image.qwenlm.ai/public_source/e9c640f1-dd58-4bee-8a16-70a70c821f91/171a027e9-21ad-4735-acfc-51f3ddd78d5d.png';
    const IMG_C = 'https://image.qwenlm.ai/public_source/e9c640f1-dd58-4bee-8a16-70a70c821f91/17ff2b4a7-12b9-4bb7-ac41-8c92fac2684f.png';
    const IMG_D = 'https://image.qwenlm.ai/public_source/e9c640f1-dd58-4bee-8a16-70a70c821f91/11328a5e9-3ca1-4147-b728-c4b22cdc919d.png';
    const IMG_E = 'https://image.qwenlm.ai/public_source/e9c640f1-dd58-4bee-8a16-70a70c821f91/179bb3a42-4342-490b-9b8f-896932e2749f.png';
    appData.works = [
        { id: 'w1', type: 'book', title: "Heaven Official's Blessing", author: 'Mo Xiang Tong Xiu', genre: 'Fantasía, Romance', pages: 1200, status: 'leyendo', rating: 5, bl: true, image: IMG_A, progress: 820, synopsis: 'Una historia de amor y devoción a lo largo de ochocientos años.', tags: 'BL, fantasía, romance', spicy: 4, sadness: 3, startDate: '2026-08-01', endDate: '', year: 2020, createdAt: now - day * 10, favorite: true },
        { id: 'w2', type: 'book', title: 'El Nombre del Viento', author: 'Patrick Rothfuss', genre: 'Fantasía', pages: 800, status: 'terminado', rating: 4.5, bl: false, image: IMG_B, progress: 800, synopsis: 'La historia de Kvothe, contada por él mismo.', tags: 'fantasía, aventura', spicy: 1, sadness: 2, startDate: '2026-07-10', endDate: '2026-08-20', year: 2007, createdAt: now - day * 30, favorite: false },
        { id: 'w3', type: 'series', title: 'The Untamed', seriesType: 'Serie', platform: 'Netflix', country: 'China', actors: 'Xiao Zhan, Wang Yibo', directors: 'Chen Jialin', status: 'viendo', rating: 5, bl: true, image: IMG_A, progress: 27, totalEpisodes: 50, synopsis: 'Dos cultivadores unidos por el destino.', tags: 'BL, wuxia, drama', spicy: 2, sadness: 4, startDate: '2026-08-15', endDate: '', year: 2019, airDay: '3', createdAt: now - day * 5, favorite: true },
        { id: 'w4', type: 'series', title: 'Only Friends', seriesType: 'Serie', platform: 'Viki', country: 'Tailandia', actors: 'First Kanaphan, Khaotung Thanawat, Force Jiratchapong', directors: 'Jojo Tichakorn', status: 'viendo', rating: 4.5, bl: true, image: IMG_C, progress: 6, totalEpisodes: 12, synopsis: 'Amistades y enredos en Bangkok.', tags: 'BL, drama, tailandés', spicy: 4, sadness: 3, startDate: '2026-08-20', endDate: '', year: 2023, airDay: '6', createdAt: now - day * 3, favorite: false },
        { id: 'w5', type: 'anime', title: 'Jujutsu Kaisen', studio: 'MAPPA', country: 'Japón', status: 'viendo', rating: 5, bl: false, image: IMG_D, progress: 12, totalEpisodes: 24, seasons: 2, synopsis: 'Hechiceros contra maldiciones.', tags: 'shonen, acción, fantasía', spicy: 1, sadness: 3, startDate: '2026-07-01', endDate: '', year: 2020, airDay: '4', createdAt: now - day * 20, favorite: false },
        { id: 'w6', type: 'manhwa', title: 'Solo Leveling', author: 'Chugong', genre: 'Acción', platform: 'Webtoon', season: 1, status: 'leyendo', rating: 5, bl: false, image: IMG_D, progress: 154, totalChapters: 179, synopsis: 'El cazador más débil del mundo.', tags: 'acción, fantasía, coreano', spicy: 1, sadness: 1, startDate: '2026-07-01', endDate: '', year: 2019, airDay: '', createdAt: now - day * 15, favorite: false },
        { id: 'w7', type: 'book', title: 'El Problema de los Tres Cuerpos', author: 'Liu Cixin', genre: 'Ciencia ficción', pages: 512, status: 'terminado', rating: 4.5, bl: false, image: IMG_B, progress: 512, synopsis: 'Un drama épico de ciencia ficción.', tags: 'ciencia ficción, china', spicy: 0, sadness: 2, startDate: '2026-08-01', endDate: '2026-08-28', year: 2008, createdAt: now - day * 25, favorite: false },
        { id: 'w8', type: 'series', title: 'Semantic Error', seriesType: 'Serie', platform: 'Viki', country: 'Corea del Sur', actors: 'Park Seo Ham, Park Jae Chan', directors: 'Kim Soo Jung', status: 'terminado', rating: 5, bl: true, image: IMG_C, progress: 8, totalEpisodes: 8, synopsis: 'Un estudiante de informática y un diseñador chocan… y se enamoran.', tags: 'BL, romance, universitario', spicy: 2, sadness: 1, startDate: '2026-08-10', endDate: '2026-08-15', year: 2022, createdAt: now - day * 18, favorite: true },
        { id: 'w9', type: 'anime', title: 'Spy x Family', studio: 'WIT Studio', country: 'Japón', status: 'terminado', rating: 5, bl: false, image: IMG_D, progress: 25, totalEpisodes: 25, seasons: 2, synopsis: 'Un espía, una asesina y una telépata forman una familia.', tags: 'comedia, acción, familiar', spicy: 0, sadness: 1, startDate: '2026-07-15', endDate: '2026-08-05', year: 2022, createdAt: now - day * 22, favorite: false },
        { id: 'w10', type: 'manhwa', title: 'True Beauty', author: 'Yaongyi', genre: 'Romance', platform: 'Webtoon', season: 1, status: 'terminado', rating: 4.5, bl: false, image: IMG_D, progress: 219, totalChapters: 219, synopsis: 'Una chica que se maquilla para ocultar su inseguridad.', tags: 'romance, comedia, escolar', spicy: 1, sadness: 2, startDate: '2026-07-05', endDate: '2026-08-25', year: 2018, createdAt: now - day * 28, favorite: false }
    ];
    appData.persons = [
        { id: 'p1', name: 'Mo Xiang Tong Xiu', type: 'author', works: 3, rating: 5, image: IMG_A, bl: true, nationality: 'China', bio: 'Autora china de novelas BL.', createdAt: now - day * 40 },
        { id: 'p2', name: 'Bright Vachirawit', type: 'actor', works: 12, rating: 5, image: 'https://i.pravatar.cc/300?img=11', bl: true, nationality: 'Tailandia', bio: 'Actor y cantante tailandés.', createdAt: now - day * 35 },
        { id: 'p3', name: 'Lee Jong Suk', type: 'actor', works: 28, rating: 4.5, image: 'https://i.pravatar.cc/300?img=12', bl: false, nationality: 'Corea del Sur', bio: 'Actor surcoreano.', createdAt: now - day * 30 },
        { id: 'p4', name: 'Liu Cixin', type: 'author', works: 15, rating: 4.5, image: 'https://i.pravatar.cc/300?img=15', bl: false, nationality: 'China', bio: 'Escritor de ciencia ficción.', createdAt: now - day * 20 },
        { id: 'p5', name: 'Park Seo Ham', type: 'actor', works: 12, rating: 5, image: 'https://i.pravatar.cc/300?img=13', bl: true, nationality: 'Corea del Sur', bio: 'Actor y modelo.', createdAt: now - day * 15 },
        { id: 'p6', name: 'Park Jae Chan', type: 'actor', works: 6, rating: 4.5, image: 'https://i.pravatar.cc/300?img=14', bl: true, nationality: 'Corea del Sur', bio: 'Actor y cantante (DONGKIZ).', createdAt: now - day * 15 }
    ];
    appData.couples = [
        { id: 'c1', name: 'First & Khaotung', works: 12, rating: 5, image: IMG_E, favorite: true, createdAt: now - day * 25 },
        { id: 'c2', name: 'Bright & Win', works: 8, rating: 4.5, image: IMG_C, favorite: false, createdAt: now - day * 20 },
        { id: 'c3', name: 'Park Seo Ham & Park Jae Chan', works: 1, rating: 5, image: IMG_E, favorite: true, personA: 'p5', personB: 'p6', createdAt: now - day * 10 }
    ];
    appData.collections = [
        { id: 'col1', name: 'Mi lista', description: 'Obras que quiero ver o leer', items: ['w3', 'w8'], createdAt: now - day * 5 },
        { id: 'col2', name: 'Favoritos del año', description: 'Lo mejor de 2026', items: ['w1', 'w4'], createdAt: now - day * 2 }
    ];
    appData.notes = [
        { id: 'n1', workId: 'w3', workTitle: 'The Untamed', content: 'Me encanta la química entre los protagonistas. El episodio 27 fue increíble.', createdAt: now - day * 3 },
        { id: 'n2', workId: 'w8', workTitle: 'Semantic Error', content: 'Muy divertida y ligera. Perfecta para maratonear.', createdAt: now - day }
    ];
    appData.works.find(w => w.id === 'w3').note = appData.notes[0].content;
    appData.works.find(w => w.id === 'w8').note = appData.notes[1].content;
    // Algo de actividad de ejemplo en las últimas semanas, para que las estadísticas no empiecen vacías
    let seed = 7;
    const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
    ['w1', 'w3', 'w4', 'w5', 'w6'].forEach((id, k) => {
        const w = appData.works.find(x => x.id === id);
        w.activity = {};
        for (let d = 1; d < 75; d++) if (rnd() < 0.32 - k * 0.03) w.activity[dayKey(now - d * day)] = 1 + Math.floor(rnd() * 3);
    });
    // Marca de "ejemplo": ver IdbBackend.save (nunca ganan a datos reales al sincronizar)
    ['works', 'persons', 'couples', 'collections', 'notes'].forEach(k => appData[k].forEach(item => { item.sample = true; }));
}

// ============================================================
// 3. CONSULTAS
// ============================================================
const getWorksByType = type => appData.works.filter(w => w.type === type);
const getWorkById = id => appData.works.find(w => w.id === id);
const getPersonById = id => appData.persons.find(p => p.id === id);
const getCoupleById = id => appData.couples.find(c => c.id === id);
const getCollectionById = id => appData.collections.find(c => c.id === id);
function worksForPerson(p) {
    const n = norm(p.name);
    if (!n) return [];
    return appData.works.filter(w => ['author', 'actors', 'directors', 'studio'].some(f => splitList(w[f]).some(x => norm(x) === n)));
}
function personWorkCount(p) { return Math.max(worksForPerson(p).length, Number(p.works) || 0); }
function findPersonByName(name) { const n = norm(name); return appData.persons.find(p => norm(p.name) === n); }
// ============================================================
// 4. COMPONENTES DE RENDER
// ============================================================
function workCard(w, opts = {}) {
    const p = getProgress(w);
    const quickPlus = isActive(w) && getTotal(w) && (Number(w.progress) || 0) < getTotal(w);
    return `
    <article class="card work-item${selection.has(w.id) ? ' is-selected' : ''}" data-open="${w.id}" data-id="${w.id}" tabindex="0" aria-label="${esc(w.title)}">
      <div class="card-cover">
        ${img(w.image, w.type, w.title)}
        <div class="card-top">
          ${cardHides('status') ? '' : `<span class="pill ${statusClass(w.status)}">${esc(getStatusLabel(w.status))}</span>`}
          ${w.bl ? '<span class="pill bl">BL</span>' : ''}
          ${w.locked ? '<span class="pill" title="Bloqueada">🔒</span>' : ''}
          ${(w.awards || []).length ? `<span class="pill award" title="${esc(w.awards.map(a => a.name).join(', '))}">🏆</span>` : ''}
          ${opts.showType ? `<span class="pill">${TYPE_META[w.type].icon} ${esc(getTypeLabel(w.type))}</span>` : ''}
          <span class="spacer"></span>
          ${w.rating ? `<span class="pill rating">★ ${ratingText(w.rating)}</span>` : ''}
        </div>
        <div class="card-bottom">
          ${(isActive(w) || opts.showProgress) && getTotal(w) && !cardHides('progress') ? `<span class="pill">${esc(hasSeasons(w) ? seasonLabel(w) : getProgressText(w))}</span>` : ''}
          ${rereadBadge(w) ? `<span class="pill">${esc(rereadBadge(w))}</span>` : ''}
          <div class="card-actions">
            ${quickPlus ? `<button class="card-act" data-act="progress" title="Avanzar progreso" aria-label="Avanzar progreso">＋</button>` : ''}
            <button class="card-act" data-act="quick-note" title="Nota rápida" aria-label="Nota rápida">📝</button>
            <button class="card-act" data-act="edit" title="Editar" aria-label="Editar">✎</button>
            <button class="card-act danger" data-act="delete" title="Eliminar" aria-label="Eliminar">✕</button>
          </div>
        </div>
        ${p > 0 && p < 100 && !cardHides('progress') ? `<div class="card-progress"><span style="width:${p}%"></span></div>` : ''}
      </div>
      <div class="card-body">
        <h4 class="card-title">${w.favorite ? '<span class="fav">♥</span>' : ''}<span class="t">${esc(w.title)}</span></h4>
        ${cardHides('subtitle') ? '' : `<div class="card-sub">${esc(getSubtitle(w))}</div>`}
        ${opts.compact ? '' : `<div class="card-meta">${cardHides('stars') ? '' : `<span class="stars">${getStars(w.rating)}</span>`}${w.spicy && !cardHides('spicy') ? `<span title="Spicy">🌶️${w.spicy}</span>` : ''}${w.sadness && !cardHides('sadness') ? `<span title="Tristeza">💧${w.sadness}</span>` : ''}</div>`}
        <div class="card-actions-list">
          <button class="btn btn-secondary btn-sm" data-act="edit">✎ Editar</button>
          ${quickPlus ? `<button class="btn btn-secondary btn-sm" data-act="progress">＋ Progreso</button>` : ''}
        </div>
      </div>
    </article>`;
}
function miniCard(w) {
    return `<button class="mini-card" data-open="${w.id}">
        <div class="mini-cover">${img(w.image, w.type, w.title)}</div>
        <div class="mini-title">${esc(w.title)}</div>
        <div class="mini-sub">${TYPE_META[w.type].icon} ${esc(getTypeLabel(w.type))}${w.rating ? ' · ★' + ratingText(w.rating) : ''}</div>
    </button>`;
}
function emptyState(icon, title, text, addType) {
    return `<div class="empty-state"><div class="big">${icon}</div><h4>${esc(title)}</h4><p>${esc(text)}</p>${addType ? `<button class="btn btn-primary btn-sm" data-add="${addType}">＋ Agregar</button>` : ''}</div>`;
}
// ============================================================
// 5. FILTROS Y ORDEN
// ============================================================
function renderGrid(gridId, list, empty, countId, page = currentPage, cardOpts = {}) {
    const grid = $(gridId);
    if (countId) $(countId).textContent = list.length ? `· ${list.length}` : '';
    if (list.length) renderWorks(grid, list, page, cardOpts);
    else { grid.className = 'card-grid'; grid.innerHTML = emptyState(...empty); }
}

// ============================================================
// 6. PÁGINAS DE OBRAS
// ============================================================
function renderBooks() {
    let list = filterWorks(getWorksByType('book'), {
        search: val('booksSearch'), status: val('booksStatusFilter'), bl: checked('booksBlFilter'), fav: checked('booksFavFilter'),
        spicy: val('booksSpicyFilter'), sadness: val('booksSadnessFilter')
    });
    list = filterByDate(list, val('booksDateFilter'));
    renderSavedViews('books');
    renderGrid('booksGrid', sortWorks(list, val('booksSort')), ['📚', 'No hay libros aquí', 'Prueba con otros filtros o agrega un libro nuevo.', 'book'], 'booksCount', 'books');
}

let seriesTab = 'all';
function renderSeries() {
    const all = getWorksByType('series');
    populateYearFilter('seriesYearFilter', all);
    let list = filterWorks(all, {
        search: val('seriesSearch'), fav: checked('seriesFavFilter'),
        spicy: val('seriesSpicyFilter'), sadness: val('seriesSadnessFilter')
    });
    if (seriesTab === 'bl') list = list.filter(w => w.bl);
    else if (seriesTab !== 'all') list = list.filter(w => w.status === seriesTab);
    const year = val('seriesYearFilter'), type = val('seriesTypeFilter');
    if (year !== 'all') list = list.filter(w => String(w.year) === year);
    if (type !== 'all') list = list.filter(w => (w.seriesType || 'Serie') === type);

    $('seriesCountAll').textContent = all.length;
    $('seriesCountBl').textContent = all.filter(w => w.bl).length;
    $('seriesCountViendo').textContent = all.filter(w => w.status === 'viendo').length;
    $('seriesCountTerminado').textContent = all.filter(w => w.status === 'terminado').length;
    $('seriesCountPlan').textContent = all.filter(w => w.status === 'quiero ver').length;
    document.querySelectorAll('#seriesTabs .tab').forEach(t => t.classList.toggle('active', t.dataset.filter === seriesTab));
    const titles = { all: '❤️ Todas', bl: '💕 BL', viendo: '▶️ Viendo', terminado: '✅ Terminadas', 'quiero ver': '⏳ Pendientes' };
    $('seriesSectionTitle').innerHTML = `${titles[seriesTab]} <span class="muted">${list.length ? '· ' + list.length : ''}</span>`;
    list = filterByDate(list, val('seriesDateFilter'));
    renderSavedViews('series');
    renderGrid('seriesGrid', sortWorks(list, val('seriesSort')), ['🎬', 'No hay series aquí', 'Prueba con otra pestaña o agrega una serie.', 'series'], null, 'series');
}
function populateYearFilter(selectId, items) {
    const select = $(selectId);
    const current = select.value;
    const years = [...new Set(items.map(w => w.year).filter(Boolean))].sort((a, b) => b - a);
    select.innerHTML = '<option value="all">Año: todos</option>' + years.map(y => `<option value="${esc(y)}">${esc(y)}</option>`).join('');
    select.value = years.map(String).includes(current) ? current : 'all';
}
function renderAnime() {
    let list = filterWorks(getWorksByType('anime'), {
        search: val('animeSearch'), status: val('animeStatusFilter'), bl: checked('animeBlFilter'), fav: checked('animeFavFilter'),
        spicy: val('animeSpicyFilter'), sadness: val('animeSadnessFilter')
    });
    list = filterByDate(list, val('animeDateFilter'));
    renderSavedViews('anime');
    renderGrid('animeGrid', sortWorks(list, val('animeSort')), ['🎌', 'No hay animes aquí', 'Prueba con otros filtros o agrega un anime.', 'anime'], 'animeCount', 'anime');
}
function renderManhwa() {
    let list = filterWorks(getWorksByType('manhwa'), {
        search: val('manhwaSearch'), status: val('manhwaStatusFilter'), bl: checked('manhwaBlFilter'), fav: checked('manhwaFavFilter'),
        spicy: val('manhwaSpicyFilter'), sadness: val('manhwaSadnessFilter')
    });
    list = filterByDate(list, val('manhwaDateFilter'));
    renderSavedViews('manhwa');
    renderGrid('manhwaGrid', sortWorks(list, val('manhwaSort')), ['📕', 'No hay manhwas aquí', 'Prueba con otros filtros o agrega un manhwa.', 'manhwa'], 'manhwaCount', 'manhwa');
}
function renderBL() {
    let list = filterWorks(appData.works.filter(w => w.bl), {
        search: val('blSearch'), type: val('blTypeFilter'), status: val('blStatusFilter'), minRating: checked('blMinRating') ? 4 : 0
    });
    list = sortWorks(filterByDate(list, val('blDateFilter')), val('blSort'));
    renderSavedViews('bl');
    renderGrid('blGrid', list, ['💖', 'No hay obras BL aquí', 'Marca “Es BL” al agregar o editar una obra.', 'series'], 'blCount', 'bl', { showType: true });
}

// ============================================================
// 7. INICIO
// ============================================================
function renderHome() {
    const s = appData.settings;
    animateCount($('statBooks'), getWorksByType('book').length);
    animateCount($('statSeries'), getWorksByType('series').length);
    animateCount($('statAnime'), getWorksByType('anime').length);
    animateCount($('statManhwa'), getWorksByType('manhwa').length);
    animateCount($('statPersons'), appData.persons.length);

    const h = new Date().getHours();
    const hello = h < 12 ? 'Buenos días' : h < 20 ? 'Buenas tardes' : 'Buenas noches';
    $('homeGreeting').textContent = `${hello}, ${s.userName || 'Sara'} 💜`;
    const now = new Date();
    const dateStr = now.toLocaleDateString(APP_LOCALE, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    $('home-date').textContent = `${dateStr.charAt(0).toUpperCase() + dateStr.slice(1)} · ${welcomePhrase(now)}`;

    const inProgress = appData.works.filter(isActive).sort((a, b) => lastTouched(b) - lastTouched(a));
    $('homeContinueWatching').innerHTML = inProgress.length
        ? inProgress.slice(0, 12).map(w => workCard(w, { compact: true, showType: true })).join('')
        : emptyState('🍿', 'Nada en curso', 'Marca una obra como “Leyendo” o “Viendo” para seguirla desde aquí.');

    const favs = appData.works.filter(w => w.favorite).sort((a, b) => (b.rating || 0) - (a.rating || 0));
    $('homeFavSection').hidden = !favs.length;
    $('homeFavorites').innerHTML = favs.slice(0, 12).map(w => workCard(w, { compact: true, showType: true })).join('');

    const recent = sortWorks(appData.works, 'recent').slice(0, 12);
    $('homeRecent').innerHTML = recent.length ? recent.map(w => workCard(w, { compact: true, showType: true })).join('')
        : emptyState('✨', 'Tu mundo está vacío', 'Agrega tu primera obra para empezar.', 'book');

    $('homeGenresChart').innerHTML = barList(tagCounts(appData.works).slice(0, 8).map(([label, value]) => ({ label, value })),
        { caption: 'Etiquetas más usadas', empty: 'Añade etiquetas a tus obras para ver las más populares.' });
    renderHero(inProgress);
    renderToday();
    renderQuoteOfDay();
    renderTip();
    renderWelcome();
    renderBell();
}

/** Fila "Hoy": racha, reto anual y lo que se emite hoy. */
function renderToday() {
    const now = Date.now();
    const st = streaks(activityByDay(appData.works), now);
    const year = new Date().getFullYear();
    const goal = Number(appData.settings.yearGoal) || 0;
    const done = finishedInYear(appData.works, year);
    const today = new Date().getDay();
    const airing = appData.works.filter(w => isActive(w) && getAirDay(w) === today);
    $('todayGrid').innerHTML = `
        <button class="today-card" data-nav="stats">
            <div class="today-icon fire">🔥</div>
            <div><div class="t-title">Racha</div><div class="t-value">${st.current} ${st.current === 1 ? 'día' : 'días'}</div>
            <div class="t-sub">${st.today ? '¡Hoy ya sumaste! 💪' : st.current ? 'Avanza algo hoy para no perderla' : 'Avanza una obra para empezar una racha'}</div></div>
        </button>
        <button class="today-card" data-nav="stats">
            <div class="today-icon">🎯</div>
            <div><div class="t-title">Reto ${year}</div><div class="t-value">${goal ? `${done} / ${goal}` : `${done} terminadas`}</div>
            <div class="t-sub">${goal ? (done >= goal ? '¡Reto cumplido! 🏆' : `${Math.round(done / goal * 100)} % completado`) : 'Ponte una meta en Estadísticas'}</div></div>
        </button>
        <button class="today-card" data-nav="emission">
            <div class="today-icon tv">📺</div>
            <div><div class="t-title">Hoy se emite</div><div class="t-value">${airing.length ? `${airing.length} ${airing.length === 1 ? 'obra' : 'obras'}` : 'Nada hoy'}</div>
            <div class="t-sub">${airing.length ? esc(airing.map(w => w.title).join(' · ')) : 'Asigna el día de emisión al editar una obra'}</div></div>
        </button>`;
}

// ---------- Avisos (campana) ----------
const SEEN_KEY = 'mi_mundo_avisos_vistos';
function seenNotifications() {
    try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]')); } catch (e) { return new Set(); }
}
function bellItems() { return [...reminderBellItems(), ...computeNotifications(appData.works, appData.settings), ...rateReminderItems()]; }
function renderBell() {
    const list = bellItems();
    const seen = seenNotifications();
    const unseen = list.filter(n => !seen.has(n.id)).length;
    $('bellBadge').hidden = !unseen;
    $('bellBadge').textContent = unseen > 9 ? '9+' : unseen;
    updateFavicon(unseen);
}
function openNotifications() {
    const list = bellItems();
    const seen = seenNotifications();
    openSheet('🔔 Avisos', () => list.length ? `<div class="pick-list">${list.map(n => `
        <button class="notif-item ${seen.has(n.id) ? '' : 'is-new'}" ${n.workId ? `data-open="${n.workId}"` : 'data-nav="stats"'}>
            <span class="n-icon">${n.icon}</span><span><b>${esc(n.title)}</b><small>${esc(n.text)}</small></span>
        </button>`).join('')}</div>`
        : emptyState('🔕', 'Todo al día', 'Aquí verás lo que se emite hoy, lo que estás a punto de terminar y lo que llevas tiempo sin avanzar.'));
    try { localStorage.setItem(SEEN_KEY, JSON.stringify(list.map(n => n.id))); } catch (e) { /* sin acceso */ }
    renderBell();
}

// ---------- ¿Qué veo hoy? ----------
let pickType = 'all', pickExclude = [], pickCurrent = null;
function openPicker() {
    pickExclude = [];
    pickCurrent = pickForToday(appData.works, { type: pickType });
    openSheet('🎲 ¿Qué veo hoy?', renderPicker);
}
function renderPicker() {
    const types = [['all', 'Todo'], ['book', '📚 Libro'], ['series', '🎬 Serie'], ['anime', '🎌 Anime'], ['manhwa', '📕 Manhwa']];
    const w = pickCurrent && getWorkById(pickCurrent.id);
    return `<div class="pick-filters">${types.map(([t, l]) => `<button class="chip chip-muted ${pickType === t ? 'is-on' : ''}" data-act="pick-type" data-id="${t}">${l}</button>`).join('')}</div>
        ${w ? `<div class="pick-card dice-roll">
            <div class="poster">${img(w.image, w.type, w.title)}</div>
            <div>
                <span class="chip">${TYPE_META[w.type].icon} ${esc(getTypeLabel(w.type))}</span> <span class="chip chip-muted">${esc(getStatusLabel(w.status))}</span>
                <h3>${esc(w.title)}</h3>
                <p>${esc(w.synopsis || getSubtitle(w))}</p>
                <div class="seg-inline">
                    ${isPlanned(w) ? `<button class="btn btn-primary btn-sm" data-act="pick-start" data-id="${w.id}">▶️ Empezar hoy</button>` : `<button class="btn btn-primary btn-sm" data-open="${w.id}">▶️ Continuar</button>`}
                    <button class="btn btn-secondary btn-sm" data-act="pick-again">🎲 Otra</button>
                </div>
            </div>
        </div>` : emptyState('🤷', 'No hay nada pendiente', 'Marca obras como “Quiero ver” o “Quiero leer” y aquí te propondré una al azar.')}`;
}

// ---------- Valorar con estrellas ----------
function starInput(id, rating) {
    const r = Number(rating) || 0;
    return `<span class="star-input" role="group" aria-label="Valoración: ${ratingText(r)}">${[1, 2, 3, 4, 5].map(n =>
        `<button type="button" class="${r >= n ? 'on' : r >= n - 0.5 ? 'half' : ''}" data-act="rate" data-id="${id}" data-star="${n}" aria-label="Valorar con ${n} ${n === 1 ? 'estrella' : 'estrellas'}">★</button>`).join('')}</span>`;
}
function setRating(id, value) {
    const w = getWorkById(id);
    if (!w || isLocked(w)) return;
    const next = Number(w.rating) === value ? 0 : value;
    mutate(() => { w.rating = next; }, next ? `⭐ Valorada con ${ratingText(next)}` : '☆ Valoración quitada');
}

// ---------- Mi lista ----------
function myList() { return appData.collections.find(c => norm(c.name) === 'mi lista'); }
function toggleMyList(id) {
    const w = getWorkById(id);
    if (!w) return;
    const list = myList();
    const inList = list && list.items.includes(id);
    mutate(() => {
        let col = myList();
        if (!col) { col = { id: generateId(), name: 'Mi lista', description: 'Lo que quiero ver o leer pronto', items: [], createdAt: Date.now() }; appData.collections.push(col); }
        col.items = inList ? col.items.filter(x => x !== id) : [...col.items, id];
    }, inList ? `➖ Quitada de “Mi lista”` : `✅ Añadida a “Mi lista”`);
}

function renderHero(inProgress) {
    const bg = $('heroBg'), content = $('heroContent');
    const w = inProgress.slice().sort((a, b) => (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0) || lastTouched(b) - lastTouched(a))[0];
    if (!w) {
        bg.style.backgroundImage = 'none';
        content.innerHTML = `
            <div class="hero-info">
                <span class="hero-badge">✨ Bienvenida</span>
                <h2 class="hero-title">Tu universo, organizado.</h2>
                <p class="hero-text">Guarda libros, series, anime y manhwas, sigue tu progreso y descubre tus hábitos.</p>
                <div class="hero-actions"><button class="btn btn-primary" data-add="book">＋ Agregar mi primera obra</button></div>
            </div>`;
        return;
    }
    bg.style.backgroundImage = cssUrl(imageSrc(w.image, w.type));
    const p = getProgress(w), total = getTotal(w);
    const step = TYPE_META[w.type].step;
    content.innerHTML = `
        <div class="hero-poster">${img(w.image, w.type, w.title)}</div>
        <div class="hero-info">
            <span class="hero-badge">${w.favorite ? '❤️' : '▶️'} Continúa donde lo dejaste</span>
            <h2 class="hero-title">${esc(w.title)}</h2>
            <div class="hero-meta">
                <span>${TYPE_META[w.type].icon} ${esc(getTypeLabel(w.type))}</span>
                <span class="hero-stars">${starInput(w.id, w.rating)}</span>
                ${getSubtitle(w) !== getTypeLabel(w.type) ? `<span>${esc(getSubtitle(w))}</span>` : ''}
                ${w.bl ? '<span>💖 BL</span>' : ''}
            </div>
            ${total ? `<div class="hero-progress"><div class="progress-bar"><div class="progress-fill" style="width:${p}%"></div></div><div class="progress-text"><span>${esc(getProgressText(w))}</span><span>${p}%</span></div></div>`
                    : (w.synopsis ? `<p class="hero-text">${esc(w.synopsis)}</p>` : '')}
            <div class="hero-actions">
                ${total && (Number(w.progress) || 0) < total ? `<button class="btn btn-primary" data-act="progress" data-id="${w.id}">＋${step} ${TYPE_META[w.type].unit}</button>` : ''}
                <button class="btn btn-secondary" data-open="${w.id}">Ver detalles</button>
                <button class="btn btn-secondary" data-act="mylist" data-id="${w.id}">${myList() && myList().items.includes(w.id) ? '✓ En Mi lista' : '＋ Mi lista'}</button>
            </div>
        </div>`;
}

function changeProgress(id, delta) {
    const w = getWorkById(id);
    if (!w || isLocked(w)) return;
    // Se calcula en una copia para saber qué mensaje mostrar
    const sim = JSON.parse(JSON.stringify(w));
    const seasonStep = hasSeasons(sim) ? advanceSeason(sim, delta) : null;
    const total = getTotal(sim);
    if (!seasonStep) {
        let next = Math.max(0, (Number(sim.progress) || 0) + delta * TYPE_META[w.type].step);
        if (total) next = Math.min(next, total);
        sim.progress = next;
    }
    const next = Number(sim.progress) || 0;
    if (next === (Number(w.progress) || 0)) return;
    const finishes = total && next >= total && (w.status !== 'terminado' || w.rereading);
    const unit = w.type === 'book' ? next + ' págs' : (w.type === 'manhwa' ? 'cap ' : 'ep ') + next;
    const msg = finishes ? `🎉 ¡Terminaste “${w.title}”!` : `⏩ ${w.title}: ${seasonStep ? seasonLabel(sim) : unit}`;
    mutate(() => {
        if (seasonStep) advanceSeason(w, delta); else w.progress = next;
        w.updatedAt = Date.now();
        if (delta > 0) bumpActivity(w);
        if (finishes) finishWork(w);
        else if (delta > 0 && isPlanned(w)) {
            w.status = STATUS_BY_TYPE[w.type][0];
            if (!w.startDate) w.startDate = todayISO();
        }
    }, msg, { type: finishes ? 'success' : 'info' });
    if (delta > 0 && !finishes) playSound('tick');
}

// ============================================================
// 8. NAVEGACIÓN
// ============================================================
const RENDERERS = {
    home: renderHome, books: renderBooks, series: renderSeries, anime: renderAnime, manhwa: renderManhwa,
    bl: renderBL, persons: renderPersons, couples: renderCouples, emission: renderEmission, stats: renderStats,
    collections: renderCollections, notes: renderNotes, settings: renderSettings, extras: renderExtras
};
let currentPage = 'home';

function translateIfNeeded() { if (currentLang !== 'es') translateUI(document.body); }
function navigateTo(page, { push = true } = {}) {
    if (!RENDERERS[page]) page = 'home';
    if (selecting && page !== currentPage) { selecting = false; selection.clear(); document.body.classList.remove('is-selecting'); renderBulkBar(); }
    currentPage = page;
    document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.nav === page));
    document.querySelectorAll('.page-view').forEach(el => el.classList.toggle('active', el.id === 'page-' + page));
    if (push && location.hash !== '#' + page) history.replaceState(null, '', '#' + page);
    $('main').scrollTop = 0;
    if (window.innerWidth <= 760) window.scrollTo(0, 0);
    RENDERERS[page]();
    translateIfNeeded();
}
function refreshView() {
    RENDERERS[currentPage]();
    renderSidebar();
    if (currentDetailId) renderDetail();
    if ($('personDetailOverlay').classList.contains('active') && currentPersonId) renderPersonDetail();
    if ($('sheetModal').classList.contains('active') && sheetRefresh) sheetRefresh();
    translateIfNeeded();
}
function renderSidebar() {
    const counts = { bl: appData.works.filter(w => w.bl).length };
    Object.keys(TYPE_META).forEach(t => counts[t] = getWorksByType(t).length);
    document.querySelectorAll('[data-count]').forEach(el => el.textContent = counts[el.dataset.count] || '');
    const name = appData.settings.userName || 'Sara';
    const { level, rank, pct } = levelInfo();
    $('userName').textContent = name;
    renderAvatar();
    $('userRank').textContent = `${rank} · Nivel ${level}`;
    $('userLevelBar').style.width = pct + '%';
    $('personNames').innerHTML = appData.persons.map(p => `<option value="${esc(p.name)}">`).join('');
}

// ============================================================
// 9. BÚSQUEDA GLOBAL
// ============================================================
let searchResults = [], searchIndex = -1;
/** Busca en obras, personas, parejas, colecciones y notas. */
function searchAll(raw, limit = 12) {
    const q = norm(raw);
    const results = [];
    if (q.length < 2) return results;
    if (isAdvancedQuery(raw)) {
        return searchWorks(appData.works, raw).slice(0, limit).map(w => ({ kind: 'work', id: w.id, title: w.title, sub: `${TYPE_META[w.type].icon} ${getTypeLabel(w.type)} · ${getStatusLabel(w.status)}`, image: w.image, ph: w.type }));
    }
    appData.works.forEach(w => {
        if (norm([w.title, w.tags, w.author, w.actors, w.studio].join(' ')).includes(q))
            results.push({ kind: 'work', id: w.id, title: w.title, sub: `${TYPE_META[w.type].icon} ${getTypeLabel(w.type)} · ${getStatusLabel(w.status)}`, image: w.image, ph: w.type });
    });
    appData.persons.forEach(p => { if (norm(p.name).includes(q)) results.push({ kind: 'person', id: p.id, title: p.name, sub: '👤 ' + (PERSON_TYPE_LABEL[p.type] || p.type), image: p.image, ph: 'person' }); });
    appData.couples.forEach(c => { if (norm(c.name).includes(q)) results.push({ kind: 'couple', id: c.id, title: c.name, sub: '💕 Pareja BL', image: c.image, ph: 'couple' }); });
    appData.collections.forEach(c => { if (norm(c.name).includes(q)) results.push({ kind: 'collection', id: c.id, title: c.name, sub: `${isSmart(c) ? '✨ Colección inteligente' : '🗂️ Colección'} · ${collectionWorks(c).length} obras`, icon: isSmart(c) ? '✨' : '🗂️' }); });
    appData.notes.forEach(n => { if (norm(n.content + ' ' + n.workTitle).includes(q)) results.push({ kind: 'note', id: n.workId, title: n.workTitle || 'Nota', sub: '📝 ' + n.content.slice(0, 50), icon: '📝' }); });
    appData.works.forEach(w => (w.quotes || []).forEach(qq => { if (norm(qq.text + ' ' + (qq.context || '')).includes(q)) results.push({ kind: 'work', id: w.id, title: w.title, sub: '❝ ' + qq.text.slice(0, 60), icon: '❝' }); }));
    return results.slice(0, limit);
}
function openResult(r) {
    if (r.kind === 'work' || r.kind === 'note') openDetail(r.id);
    else if (r.kind === 'person') openPersonDetail(r.id);
    else if (r.kind === 'couple') openCoupleDetail(r.id);
    else if (r.kind === 'collection') { navigateTo('collections'); openCollectionView(r.id); }
}
function runGlobalSearch() {
    const box = $('globalSearchResults');
    if (norm($('globalSearch').value).length < 2) { box.classList.remove('active'); return; }
    searchResults = searchAll($('globalSearch').value);
    searchIndex = -1;
    box.innerHTML = searchResults.length ? searchResults.map((r, i) => `
        <button class="search-result" data-result="${i}" role="option">
          ${r.icon ? `<div class="thumb">${r.icon}</div>` : img(r.image, r.ph, '', 'class="thumb"')}
          <div class="info"><span class="title">${esc(r.title)}</span><span class="type">${esc(r.sub)}</span></div>
        </button>`).join('') : `<div class="search-empty">Sin resultados para “${esc($('globalSearch').value)}”</div>`;
    box.classList.add('active');
}
function openSearchResult(i) {
    const r = searchResults[i];
    if (!r) return;
    $('globalSearchResults').classList.remove('active');
    $('globalSearch').value = '';
    openResult(r);
}

// ---------- Paleta de comandos (Ctrl K) ----------
const PAGE_NAMES = {
    home: '🏠 Inicio', books: '📖 Libros', series: '🎬 Series y Películas', anime: '🎌 Anime', manhwa: '📕 Manhwas', bl: '💖 Solo BL',
    persons: '👥 Personas', couples: '💕 Parejas BL', emission: '📡 Centro de Emisión', collections: '🗂️ Colecciones',
    stats: '📊 Estadísticas', notes: '📝 Notas', extras: '✨ Extras', settings: '⚙️ Personalizar'
};
let paletteItems = [], paletteIndex = 0;
function paletteActions() {
    return [
        { icon: '📚', title: 'Agregar libro', run: () => openWorkModal('book') },
        { icon: '🎬', title: 'Agregar serie o película', run: () => openWorkModal('series') },
        { icon: '🎌', title: 'Agregar anime', run: () => openWorkModal('anime') },
        { icon: '📕', title: 'Agregar manhwa', run: () => openWorkModal('manhwa') },
        { icon: '👤', title: 'Agregar persona', run: () => openPersonModal() },
        { icon: '🎲', title: '¿Qué veo hoy?', run: openPicker },
        { icon: '🔔', title: 'Ver avisos', run: openNotifications },
        { icon: isDarkNow() ? '☀️' : '🌙', title: isDarkNow() ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro', run: () => { const d = isDarkNow(); appData.settings.themeAuto = false; updateSetting('darkMode', !d); } },
        { icon: '⌨️', title: 'Ver atajos de teclado', sub: '?', run: openShortcuts },
        { icon: '🎁', title: 'Tu año en Mi Mundo (resumen)', run: () => openWrapped() },
        { icon: '▶️', title: 'Presentar mis favoritas', run: () => FEATURE_ACTIONS['present-favs']() },
        { icon: '🧭', title: 'Tour guiado', run: startTour },
        { icon: '💭', title: '¿Cómo te sientes hoy?', run: () => { extrasTab = 'mood'; navigateTo('extras'); } },
        { icon: '🎮', title: 'Adivina por la portada', run: () => { extrasTab = 'guess'; navigateTo('extras'); } },
        { icon: '📅', title: 'Exportar emisiones al calendario (.ics)', run: () => FEATURE_ACTIONS['export-ics']() },
        { icon: '👀', title: appData.settings.readOnly ? 'Salir del modo solo lectura' : 'Modo solo lectura', run: () => FEATURE_ACTIONS['readonly-toggle']() },
        { icon: '📤', title: 'Exportar copia de seguridad', run: exportData },
        { icon: '↩️', title: 'Deshacer último cambio', sub: 'Ctrl + Z', run: undo },
        { icon: '↪️', title: 'Rehacer', sub: 'Ctrl + Shift + Z', run: redo },
        { icon: '🕓', title: 'Historial de cambios', run: openHistory },
        { icon: '🏷️', title: 'Gestionar etiquetas', run: openTagManager },
        { icon: '🔎', title: 'Ayuda de búsqueda avanzada', sub: 'BL nota:5 · estado:pendiente año:>2020…', run: openQueryHelp },
        { icon: '✨', title: 'Nueva colección inteligente', run: () => openCollectionModal(null, { smart: true }) },
        { icon: '⚡', title: 'Modo rápido: agregar varias obras', run: openQuickAdd },
        { icon: '🌐', title: 'Importar de Goodreads, MyAnimeList, AniList o CSV', run: openImportWizard },
        { icon: '📄', title: 'Exportar a CSV (Excel)', run: () => FEATURE_ACTIONS['export-csv']() },
        { icon: '☑️', title: 'Seleccionar varias obras', run: () => { if (!SELECT_PAGES.includes(currentPage)) navigateTo('books'); setSelecting(true); } },
        { icon: '🗑️', title: 'Abrir papelera', run: openTrash },
        ...(cloud.state === 'signedIn' ? [{ icon: '🔄', title: 'Sincronizar ahora', run: () => cloud.syncNow() }] : [])
    ];
}
function openPalette() {
    $('paletteInput').value = '';
    renderPalette();
    openModal('paletteModal');
    $('paletteInput').focus();
}
function renderPalette() {
    const raw = $('paletteInput').value;
    const q = norm(raw);
    const match = t => !q || norm(t).includes(q);
    const groups = [];
    const found = searchAll(raw, 8).map(r => ({ icon: r.icon || '', image: r.image, ph: r.ph, title: r.title, sub: r.sub, run: () => openResult(r) }));
    if (isAdvancedQuery(raw)) found.unshift({ icon: '🔎', title: `Ver todos (${searchWorks(appData.works, raw).length})`, sub: describeQuery(raw), run: () => showQueryResults(raw) });
    if (found.length) groups.push(['Resultados', found]);
    const actions = paletteActions().filter(a => match(a.title));
    if (actions.length) groups.push(['Acciones', actions]);
    const pages = Object.entries(PAGE_NAMES).filter(([, name]) => match(name)).map(([page, name]) => ({ icon: name.split(' ')[0], title: name.slice(name.indexOf(' ') + 1), sub: 'Ir a la sección', run: () => navigateTo(page) }));
    if (pages.length) groups.push(['Ir a', pages]);
    paletteItems = groups.flatMap(g => g[1]);
    paletteIndex = 0;
    let i = 0;
    $('paletteList').innerHTML = paletteItems.length ? groups.map(([name, items]) => `<div class="palette-group">${name}</div>${items.map(it => `
        <button class="palette-item ${i === 0 ? 'is-active' : ''}" data-palette-item="${i++}" role="option">
            <span class="p-icon">${it.image !== undefined && !it.icon ? img(it.image, it.ph) : it.icon}</span>
            <span class="p-text"><b>${esc(it.title)}</b>${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</span>
        </button>`).join('')}`).join('') : `<div class="search-empty">Nada coincide con “${esc(raw)}”</div>`;
}
function runPaletteItem(i) {
    const it = paletteItems[i];
    if (!it) return;
    closeModal('paletteModal');
    it.run();
}
function movePalette(delta) {
    const items = [...document.querySelectorAll('.palette-item')];
    if (!items.length) return;
    paletteIndex = (paletteIndex + delta + items.length) % items.length;
    items.forEach((el, k) => el.classList.toggle('is-active', k === paletteIndex));
    items[paletteIndex].scrollIntoView({ block: 'nearest' });
}

// ============================================================
// 10. IMÁGENES (subida con compresión)
// ============================================================
function loadImage(src) {
    return new Promise((resolve, reject) => {
        const im = new Image();
        im.onload = () => resolve(im);
        im.onerror = reject;
        im.src = src;
    });
}
let webpSupported = null;
function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve, reject) => canvas.toBlob(b => (b ? resolve(b) : reject(new Error('No se pudo crear la imagen'))), type, quality));
}
/** Reduce una imagen al tamaño adecuado para su uso y la devuelve como Blob WebP (o JPEG si no hay WebP). */
async function compressImage(src, kind) {
    const [maxW, maxH, quality] = IMAGE_SIZES[kind] || IMAGE_SIZES.poster;
    const im = await loadImage(src);
    const scale = Math.min(1, maxW / im.naturalWidth, maxH / im.naturalHeight);
    const w = Math.max(1, Math.round(im.naturalWidth * scale)), h = Math.max(1, Math.round(im.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#191928';
    ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(im, 0, 0, w, h);
    if (webpSupported !== false) {
        const blob = await canvasToBlob(canvas, 'image/webp', quality);
        webpSupported = blob.type === 'image/webp';
        if (webpSupported) return blob;
    }
    return canvasToBlob(canvas, 'image/jpeg', quality);
}
async function handleImageUpload(input) {
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { showToast('⚠️ El archivo no es una imagen', 'error'); return; }
    const url = URL.createObjectURL(file);
    try {
        const blob = await compressImage(url, input.dataset.kind);
        const ref = await store.saveImage(blob);
        const target = $(input.dataset.target);
        target.value = ref;
        target.dispatchEvent(new Event('input', { bubbles: true }));
        showToast(`✅ Imagen optimizada: ${formatBytes(file.size)} → ${formatBytes(blob.size)}`);
    } catch (e) {
        console.error(e);
        showToast(isQuotaError(e) ? '⚠️ No queda espacio para guardar la imagen' : '❌ No se pudo procesar la imagen', 'error');
    } finally {
        URL.revokeObjectURL(url);
    }
}
function bindPreview(inputId, previewId, ph) {
    const update = () => {
        const v = $(inputId).value.trim();
        const pv = $(previewId);
        pv.onerror = () => { pv.onerror = null; pv.src = PH[ph]; };
        pv.src = imageSrc(v, ph);
    };
    $(inputId).addEventListener('input', update);
    return update;
}
/** Vuelve a comprimir las imágenes guardadas que ocupan mucho (p. ej. las subidas con versiones antiguas). */
async function optimizeStoredImages() {
    const btn = $('optimizeImagesBtn');
    btn.disabled = true;
    btn.textContent = '⏳ Optimizando…';
    let saved = 0;
    const jobs = [];
    forEachImageField(appData, (item, field, kind) => {
        const v = item[field];
        if (isImageRef(v) && store.imageSize(v) > 150000) {
            const before = store.imageSize(v);
            jobs.push(compressImage(store.resolve(v), kind)
                .then(blob => (blob.size < before ? store.replaceImage(v, blob).then(() => { saved += before - blob.size; }) : null))
                .catch(() => {}));
        } else if (isEmbeddedImage(v) && v.length > 40000) {
            jobs.push(compressImage(v, kind)
                .then(blob => store.saveImage(blob))
                .then(ref => {
                    const after = isImageRef(ref) ? store.imageSize(ref) : ref.length;
                    if (after < v.length) { saved += v.length - after; item[field] = ref; }
                })
                .catch(() => {}));
        }
    });
    await Promise.all(jobs);
    btn.disabled = false;
    btn.textContent = '🪄 Optimizar imágenes guardadas';
    saveData();
    await whenSaved();
    await store.collectGarbage(appData).catch(() => 0);
    showToast(saved > 0 ? `✨ Liberado ${formatBytes(saved)} de espacio` : '👌 Tus imágenes ya estaban optimizadas');
    refreshView();
}

// ============================================================
// 11. MODALES (genérico)
// ============================================================
let lastFocus = null;
/** Formularios que avisan antes de cerrarse con cambios sin guardar. */
const DIRTY_MODALS = ['workModal', 'personModal', 'coupleModal', 'collectionModal'];
const modalBaselines = {};
function modalSnapshot(id) {
    return [...$(id).querySelectorAll('input:not([type=file]), select, textarea')].map(el => (el.type === 'checkbox' ? el.checked : el.value)).join('\u0001');
}
function openModal(id) {
    lastFocus = document.activeElement;
    $('vizTip').classList.remove('show');
    $(id).classList.add('active');
    if (DIRTY_MODALS.includes(id)) modalBaselines[id] = modalSnapshot(id);
    const first = $(id).querySelector('input:not([type=hidden]):not([type=file]), select, textarea, button');
    setTimeout(() => first && first.focus({ preventScroll: true }), 60);
}
/** Cierra un modal. Si tiene cambios sin guardar, pregunta antes (salvo force). Devuelve false si no se cerró. */
function closeModal(id, { force = false } = {}) {
    if (!force && $(id).classList.contains('active') && modalBaselines[id] !== undefined && modalSnapshot(id) !== modalBaselines[id]) {
        if (!confirm('Tienes cambios sin guardar. ¿Cerrar sin guardarlos?')) return false;
        if (id === 'workModal' && !editingWorkId) clearDraft();
    }
    delete modalBaselines[id];
    $(id).classList.remove('active');
    if (id === 'sheetModal') sheetRefresh = null;
    if (id === 'personDetailOverlay') currentPersonId = null;
    if (lastFocus && document.body.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
    return true;
}
function topOpenModal() {
    const open = [...document.querySelectorAll('.modal-overlay.active')];
    return open[open.length - 1];
}
let sheetRefresh = null;
function openSheet(title, renderBody) {
    $('sheetTitle').textContent = title;
    sheetRefresh = () => { $('sheetBody').innerHTML = renderBody(); };
    sheetRefresh();
    openModal('sheetModal');
}

// ============================================================
// 12. MODAL OBRA
// ============================================================
let editingWorkId = null, formType = 'book';
const workForm = $('workForm');
const updateWorkPreview = bindPreview('f_image', 'workImagePreview', 'book');

function setFormType(type) {
    formType = type;
    document.querySelectorAll('#workTypeTabs .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.type === type));
    workForm.querySelectorAll('[data-types]').forEach(el => { el.hidden = !el.dataset.types.split(' ').includes(type); });
    const status = $('f_status'), prev = status.value;
    status.innerHTML = STATUS_BY_TYPE[type].map(s => `<option value="${s}">${STATUS_LABEL[s]}</option>`).join('');
    // Mantiene el equivalente al cambiar de tipo (leyendo ↔ viendo)
    const idx = Math.max(0, READ_STATUSES.indexOf(prev) >= 0 ? READ_STATUSES.indexOf(prev) : WATCH_STATUSES.indexOf(prev));
    status.selectedIndex = idx;
    $('lbl_progress').textContent = TYPE_META[type].progressLabel;
    $('lbl_start').textContent = type === 'series' ? 'Fecha de estreno / inicio' : 'Fecha de inicio';
    if ($('seasonsEditor') && $('workModal').classList.contains('active')) renderSeasonsEditor(readSeasonsEditor());
    const pv = $('workImagePreview');
    if (!$('f_image').value) pv.src = PH[type];
}
function updateRangeOutputs(root = document) {
    root.querySelectorAll('input[type=range][data-out]').forEach(r => {
        const out = $(r.dataset.out);
        if (!out) return;
        const v = Number(r.value);
        out.textContent = r.classList.contains('rating') ? (v ? '★ ' + v : '–') : v;
    });
}
function openWorkModal(type = 'book', work = null, preset = {}) {
    editingWorkId = work ? work.id : null;
    $('workModalTitle').textContent = work ? '✏️ Editar obra' : '＋ Agregar obra';
    $('workSaveBtn').textContent = work ? 'Guardar cambios' : 'Agregar';
    $('f_status').innerHTML = '';
    setFormType(work ? work.type : type);
    document.querySelectorAll('#workTypeTabs .seg-btn').forEach(b => b.disabled = !!work && b.dataset.type !== work.type);
    fillAutocomplete();
    applyFormFieldVisibility();
    fillWorkForm(work || preset);
    updateAirDayHint();
    const draft = !work && !preset.title ? readDraft() : null;
    $('workDraftBar').hidden = !draft;
    if (draft) {
        $('workDraftBar').innerHTML = `<span>📝 Tienes un borrador sin guardar: <b>${esc(draft.data.title)}</b> <small>(${esc(relativeTime(draft.at))})</small></span>
            <span class="seg-inline"><button type="button" class="btn btn-primary btn-sm" data-act="draft-restore">Recuperar</button>
            <button type="button" class="btn btn-secondary btn-sm" data-act="draft-discard">Descartar</button></span>`;
    }
    openModal('workModal');
    setTimeout(() => $('f_title').focus(), 60);
}
function fillWorkForm(src) {
    workForm.querySelectorAll('[data-field]').forEach(el => {
        const f = el.dataset.field;
        let v = src[f];
        if (el.type === 'checkbox') { el.checked = !!v; return; }
        if (v === undefined || v === null) v = el.dataset.default ?? '';
        el.value = v;
        if (el.tagName === 'SELECT' && el.selectedIndex < 0) el.selectedIndex = 0;
    });
    updateRangeOutputs(workForm);
    updateWorkPreview();
    if ($('workImagePreview').src === '' || !$('f_image').value) $('workImagePreview').src = PH[formType];
    renderSeasonsEditor(src.seasonsList);
    updateTitleHint();
    updateTagsHint();
}

// ---------- Borrador del formulario (se guarda solo mientras escribes) ----------
const DRAFT_KEY = 'mi_mundo_borrador_obra';
const DRAFT_MAX_AGE = 7 * 86400000;
function saveDraft() {
    if (editingWorkId || !$('workModal').classList.contains('active')) return;
    const data = collectWorkForm();
    try {
        if (data.title) localStorage.setItem(DRAFT_KEY, JSON.stringify({ type: formType, data, at: Date.now() }));
        else localStorage.removeItem(DRAFT_KEY);
    } catch (e) { /* sin acceso a localStorage */ }
}
function readDraft() {
    try {
        const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
        if (d && d.data && d.data.title && TYPE_META[d.type] && Date.now() - d.at < DRAFT_MAX_AGE) return d;
    } catch (e) { /* borrador dañado */ }
    return null;
}
function clearDraft() { try { localStorage.removeItem(DRAFT_KEY); } catch (e) { /* sin acceso */ } }
function restoreDraft() {
    const d = readDraft();
    if (!d) return;
    setFormType(d.type);
    fillWorkForm(d.data);
    $('workDraftBar').hidden = true;
    showToast('📝 Borrador recuperado');
}

/** Aviso mientras escribes el título: "¿Ya la tienes?". */
function updateTitleHint() {
    const el = $('titleHint');
    const sims = findSimilarWorks($('f_title').value, appData.works, { excludeId: editingWorkId, limit: 2 });
    el.hidden = !sims.length;
    el.innerHTML = sims.length ? `💡 ¿Ya la tienes? ${sims.map(x => `<button type="button" class="link-btn" data-open="${x.work.id}">${TYPE_META[x.work.type].icon} ${esc(x.work.title)}</button>`).join(' ')}` : '';
}

function collectWorkForm() {
    const data = {};
    workForm.querySelectorAll('[data-field]').forEach(el => {
        const wrap = el.closest('[data-types]');
        if (wrap && wrap.hidden) return;
        const f = el.dataset.field;
        if (el.type === 'hidden' && el.value === '') return; // ids de AniList/TVmaze: solo si se buscaron datos
        if (el.type === 'checkbox') data[f] = el.checked;
        else if ('num' in el.dataset) data[f] = el.value === '' ? (f === 'year' ? '' : 0) : Number(el.value);
        else data[f] = el.value.trim();
    });
    if ($('f_multi')) data.seasonsList = readSeasonsEditor();
    return data;
}
function saveWork() {
    const data = collectWorkForm();
    if (!data.title) { showToast('⚠️ El título es obligatorio', 'error'); $('f_title').focus(); return; }
    const total = formType === 'book' ? data.pages : formType === 'manhwa' ? data.totalChapters : data.totalEpisodes;
    if (data.progress < 0) data.progress = 0;
    if (total && data.progress > total) data.progress = total;
    if (data.endDate && data.startDate && data.endDate < data.startDate) { showToast('⚠️ La fecha de fin es anterior a la de inicio', 'error'); return; }
    const editing = editingWorkId;
    // Fechas automáticas: al empezar o terminar se apunta el día de hoy si no hay otra fecha
    if ((data.status === 'leyendo' || data.status === 'viendo' || data.status === 'terminado') && !data.startDate) data.startDate = todayISO();
    if (data.status === 'terminado' && !data.endDate) data.endDate = todayISO();
    if (!editing) {
        const dup = appData.works.find(w => w.type === formType && norm(w.title) === norm(data.title));
        if (dup && !confirm(`Ya tienes “${dup.title}” en ${getTypeLabel(dup.type).toLowerCase()}s. ¿Agregarla de todas formas?`)) return;
        const sim = !dup && findSimilarWorks(data.title, appData.works, { min: 0.85, limit: 1 })[0];
        if (sim && !confirm(`Se parece mucho a “${sim.work.title}” (${getTypeLabel(sim.work.type)}). ¿Agregarla de todas formas?`)) return;
    }
    const ok = mutate(() => {
        if (editing) {
            const w = getWorkById(editing);
            const before = { progress: Number(w.progress) || 0, status: w.status };
            Object.assign(w, data, { updatedAt: Date.now() });
            if (!hasSeasons(w)) delete w.seasonsList;
            syncSeasonAggregates(w);
            if ((Number(w.progress) || 0) > before.progress || (w.status !== before.status && !isPlanned(w))) bumpActivity(w);
            if (w.rereading && w.status === 'terminado' && before.status !== 'terminado') finishWork(w);
            appData.notes.forEach(n => { if (n.workId === w.id) n.workTitle = w.title; });
        } else {
            const w = { id: generateId(), type: formType, ...data, createdAt: Date.now(), updatedAt: Date.now() };
            if (!hasSeasons(w)) delete w.seasonsList;
            syncSeasonAggregates(w);
            if ((Number(w.progress) || 0) > 0) bumpActivity(w);
            appData.works.push(w);
        }
    }, editing ? '✅ Obra actualizada' : '✅ Obra agregada', { label: editing ? `Editar “${data.title}”` : `Agregar “${data.title}”` });
    if (ok) { if (!editing) clearDraft(); closeModal('workModal', { force: true }); }
}
function deleteWork(id) {
    const w = getWorkById(id);
    if (!w || isLocked(w)) return;
    // Solo se pregunta si se van a perder relaciones: lo demás se puede deshacer o recuperar de la papelera
    const colls = manualCollections().filter(c => c.items.includes(id)).length;
    const notes = appData.notes.filter(n => n.workId === id).length;
    if (colls || notes) {
        const parts = [colls ? `está en ${colls} ${colls === 1 ? 'colección' : 'colecciones'}` : '', notes ? `tiene ${notes} ${notes === 1 ? 'nota' : 'notas'}` : ''].filter(Boolean);
        if (!confirm(`“${w.title}” ${parts.join(' y ')}.\n\nSe enviará a la papelera con sus notas y podrás restaurarla durante ${TRASH_DAYS} días. ¿Continuar?`)) return;
    }
    if (currentDetailId === id) closeDetail();
    mutate(() => { trashRecord(appData, 'works', id, Date.now(), { from: TYPE_PLURAL[w.type] }); }, `🗑️ “${w.title}” enviada a la papelera`, { label: `Eliminar “${w.title}”` });
}
function toggleFavorite(id) {
    const w = getWorkById(id);
    if (!w) return;
    mutate(() => { w.favorite = !w.favorite; w.updatedAt = Date.now(); }, w.favorite ? '🤍 Quitado de favoritos' : '❤️ Añadido a favoritos');
}

/** Si la obra está bloqueada, avisa y devuelve true. */
function isLocked(w) {
    if (!w || !w.locked) return false;
    showToast('🔒 Esta obra está bloqueada. Desbloquéala en su ficha para cambiarla.', 'error');
    return true;
}
function toggleLock(id) {
    const w = getWorkById(id);
    if (!w) return;
    mutate(() => { w.locked = !w.locked; }, w.locked ? '🔓 Obra desbloqueada' : '🔒 Obra bloqueada: no se podrá editar, avanzar ni borrar sin querer');
}
function openDuplicate(id) {
    const w = getWorkById(id);
    if (!w) return;
    openSheet('⧉ Duplicar obra', () => `
        <p class="panel-desc" style="margin:0 0 12px">Se creará una copia de “${esc(w.title)}” sin progreso, fechas ni valoración, como pendiente. ¿De qué tipo?</p>
        <div class="pick-list">${TYPE_ORDER.map(t => `
            <button class="pick-item" data-act="duplicate-as" data-id="${w.id}" data-type="${t}">
                <span class="n-icon">${TYPE_META[t].icon}</span>
                <span class="info"><b>${esc(getTypeLabel(t))}${t === w.type ? ' (mismo tipo)' : ''}</b><small>${t === w.type ? 'Ideal para otra temporada o edición' : `Por ejemplo, la adaptación en ${getTypeLabel(t).toLowerCase()}`}</small></span>
            </button>`).join('')}</div>`);
}
function duplicateAs(id, type) {
    const w = getWorkById(id);
    if (!w || !TYPE_META[type]) return;
    const copy = duplicateWork(w, { type });
    closeModal('sheetModal');
    mutate(() => { appData.works.push(copy); }, `⧉ Copia creada: “${copy.title}”`, { label: `Duplicar “${w.title}”` });
    openWorkModal(null, getWorkById(copy.id));
}
function duplicatePersonById(id) {
    const p = getPersonById(id);
    if (!p) return;
    const copy = duplicatePerson(p);
    if (currentPersonId) closeModal('personDetailOverlay');
    mutate(() => { appData.persons.push(copy); }, `⧉ Copia creada: ${copy.name}`, { label: `Duplicar a ${p.name}` });
    openPersonModal(getPersonById(copy.id));
}

// ---------- Historial de versiones de una obra ----------
const FIELD_LABELS = {
    title: 'Título', status: 'Estado', progress: 'Progreso', rating: 'Valoración', favorite: 'Favorito', bl: 'BL', author: 'Autor',
    studio: 'Estudio', platform: 'Plataforma', country: 'País', genre: 'Género', year: 'Año', actors: 'Actores', directors: 'Directores',
    pages: 'Páginas', totalEpisodes: 'Episodios', totalChapters: 'Capítulos', seasons: 'Temporadas', season: 'Temporada',
    airDay: 'Día de emisión', startDate: 'Inicio', endDate: 'Fin', tags: 'Etiquetas', synopsis: 'Sinopsis', spicy: 'Spicy',
    sadness: 'Tristeza', image: 'Portada', seriesType: 'Tipo', locked: 'Bloqueo', type: 'Tipo de obra'
};
function fieldValueText(field, v) {
    if (v === null || v === undefined || v === '') return '—';
    if (typeof v === 'boolean') return v ? 'Sí' : 'No';
    if (field === 'status') return getStatusLabel(v);
    if (field === 'type') return getTypeLabel(v);
    if (field === 'image') return 'imagen';
    if (field === 'rating') return Number(v) ? '★ ' + ratingText(v) : '—';
    if (field === 'airDay') return (WEEK.find(d => d.day === Number(v)) || {}).short || '—';
    if (field === 'startDate' || field === 'endDate') return fmtDate(v);
    if (typeof v === 'object') return '…';
    const str = String(v);
    return str.length > 40 ? str.slice(0, 40) + '…' : str;
}
function versionsHtml(w) {
    const versions = w.versions || [];
    const added = w.createdAt && !w.sample ? `<p class="hint" style="margin:10px 0 0">➕ Agregada el ${fmtDate(w.createdAt)}</p>` : '';
    if (!versions.length) return `<p>Aún no hay cambios. Aquí verás tus últimos ${MAX_VERSIONS} cambios en esta obra y podrás volver atrás.</p>${added}`;
    return `<div class="version-list">${versions.map((v, i) => ({ v, i })).reverse().map(({ v, i }) => `
        <div class="version-item">
          <div class="version-head"><b>${esc(relativeTime(v.at))}</b>
            <button class="btn btn-secondary btn-sm" data-act="version-restore" data-id="${w.id}" data-version="${i}" title="Deshace este cambio y los posteriores">⏪ Volver a antes</button></div>
          <ul>${Object.entries(v.changes).map(([f, [a, b]]) => `<li><span>${esc(FIELD_LABELS[f] || f)}:</span> ${esc(fieldValueText(f, a))} → <b>${esc(fieldValueText(f, b))}</b></li>`).join('')}</ul>
        </div>`).join('')}</div>${added}`;
}
function restoreVersion(id, index) {
    const w = getWorkById(id);
    if (!w || isLocked(w) || !(w.versions || [])[index]) return;
    const target = workBeforeVersion(w, index);
    mutate(() => {
        const i = appData.works.indexOf(w);
        appData.works[i] = { ...target, versions: w.versions };
    }, `⏪ “${w.title}” ha vuelto a una versión anterior`, { label: `Restaurar versión de “${w.title}”` });
}

// ============================================================
// 13. PANEL DE DETALLE
// ============================================================
let currentDetailId = null;
function openDetail(id) {
    if (!getWorkById(id)) return;
    if (currentDetailId !== id) { $('detailPanel').innerHTML = ''; detailRenderedId = null; }
    currentDetailId = id;
    rememberSession({ detail: id });
    renderDetail();
    $('detailPanel').scrollTop = 0;
    $('detailPanel').classList.add('active');
    $('detailPanel').setAttribute('aria-hidden', 'false');
    $('detailOverlay').classList.add('active');
}
function closeDetail() {
    $('detailPanel').classList.remove('active');
    $('detailPanel').setAttribute('aria-hidden', 'true');
    $('detailOverlay').classList.remove('active');
    currentDetailId = null;
    rememberSession({ detail: null });
}
// ---------- Recuperar la sesión (si la app se cerró con una obra abierta) ----------
const SESSION_KEY = 'mi_mundo_sesion';
function rememberSession(patch) {
    try { localStorage.setItem(SESSION_KEY, JSON.stringify({ ...JSON.parse(localStorage.getItem(SESSION_KEY) || '{}'), ...patch, at: Date.now() })); }
    catch (e) { /* sin acceso */ }
}
function offerSessionRecovery() {
    let last = null;
    try { last = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch (e) { /* dañado */ }
    const w = last && last.detail && Date.now() - last.at < 86400000 && getWorkById(last.detail);
    if (w) showToast(`👀 La última vez estabas viendo “${w.title}”`, 'info', 7000, { label: 'Abrir', run: () => openDetail(w.id) });
}
function peopleChips(str) {
    return splitList(str).map(n => {
        const p = findPersonByName(n);
        return p ? `<button class="chip" data-person="${p.id}">${esc(n)}</button>` : `<span class="chip chip-muted">${esc(n)}</span>`;
    }).join('');
}
let detailRenderedId = null;
/** Pinta la ficha. Mantiene las secciones abiertas y lo que estuvieras escribiendo (salvo fresh = true). */
function renderDetail(fresh = false) {
    const w = getWorkById(currentDetailId);
    if (!w) { closeDetail(); return; }
    const sameWork = detailRenderedId === w.id;
    const open = sameWork ? Object.fromEntries([...$('detailPanel').querySelectorAll('details[data-key]')].map(d => [d.dataset.key, d.open])) : {};
    const composer = sameWork && !fresh ? readNoteComposer() : null;
    const focusedNote = document.activeElement && document.activeElement.id === 'detailNote';
    if (!sameWork) { editingNoteId = null; noteFilter = 'all'; }
    detailRenderedId = w.id;
    const p = getProgress(w), total = getTotal(w);
    const inColls = appData.collections.filter(c => collectionHas(c, w.id));
    const rel = [
        ['Autor', w.author, true], ['Estudio', w.studio], ['Plataforma', w.platform], ['Género', w.genre], ['País', w.country],
        ['Actores', w.actors, true], ['Directores', w.directors, true],
        ['Temporadas', w.type === 'anime' && w.seasons ? w.seasons : ''], ['Temporada', w.type === 'manhwa' && w.season ? w.season : ''],
        ['Emisión', (WEEK.find(d => d.day === getAirDay(w)) || {}).short || '']
    ].filter(r => r[1]);
    const tags = splitList(w.tags);
    const similar = similarWorks(w, appData.works, 6).map(x => x.work);

    $('detailPanel').innerHTML = `
      <div class="detail-header">
        <div class="bg" style="background-image:${esc(cssUrl(imageSrc(w.image, w.type)))}"></div>
        <button class="icon-btn detail-close" data-detail-close aria-label="Cerrar">✕</button>
      </div>
      <div class="detail-top">
        <div class="detail-poster">${img(w.image, w.type, w.title)}</div>
        <div class="detail-heading">
          <div class="detail-chips">
            <span class="chip">${TYPE_META[w.type].icon} ${esc(w.type === 'series' ? (w.seriesType || 'Serie') : getTypeLabel(w.type))}</span>
            <span class="chip chip-muted">${esc(getStatusLabel(w.status))}</span>
            ${w.bl ? '<span class="chip chip-pink">💖 BL</span>' : ''}
          </div>
          <h2 class="detail-title">${esc(w.title)}</h2>
          <div class="detail-subtitle">${esc(getSubtitle(w))}</div>
        </div>
      </div>
      <div class="detail-body">
        <div class="detail-actions">
          <button class="btn btn-primary btn-sm" data-act="edit" data-id="${w.id}">✏️ Editar</button>
          <button class="btn btn-secondary btn-sm ${w.favorite ? 'is-on' : ''}" data-act="fav" data-id="${w.id}">${w.favorite ? '❤️ Favorito' : '🤍 Favorito'}</button>
          <button class="btn btn-secondary btn-sm ${myList() && myList().items.includes(w.id) ? 'is-on' : ''}" data-act="mylist" data-id="${w.id}">${myList() && myList().items.includes(w.id) ? '✓ Mi lista' : '＋ Mi lista'}</button>
          <button class="btn btn-secondary btn-sm" data-act="collect" data-id="${w.id}">📂 Colecciones${inColls.length ? ' · ' + inColls.length : ''}</button>
          <button class="btn btn-secondary btn-sm" data-act="focus" data-id="${w.id}" title="Modo foco (F)">🎯 Foco</button>
          <button class="btn btn-secondary btn-sm ${w.reminder ? 'is-on' : ''}" data-act="reminder" data-id="${w.id}" title="${w.reminder ? 'Te lo recuerdo ' + esc(reminderText(w.reminder)) : 'Recordarme'}">${w.reminder ? '🔔 Recordatorio' : '🔔 Recordarme'}</button>
          <button class="btn btn-secondary btn-sm" data-act="duplicate" data-id="${w.id}" title="Duplicar (D)">⧉ Duplicar</button>
          <button class="btn btn-secondary btn-sm ${w.locked ? 'is-on' : ''}" data-act="lock" data-id="${w.id}" title="${w.locked ? 'Desbloquear' : 'Bloquear para no cambiarla sin querer'}">${w.locked ? '🔒 Bloqueada' : '🔓 Bloquear'}</button>
          <button class="btn btn-secondary btn-sm" data-act="share-work" data-id="${w.id}" title="Compartir">📤</button>
          <button class="btn btn-danger btn-sm" data-act="delete" data-id="${w.id}" aria-label="Eliminar">🗑️</button>
        </div>
        ${suggestionsHtml(w)}
        ${total ? `
        <div class="detail-progress">
          <div class="detail-progress-row"><span>${esc(getProgressText(w))}</span>
            <div class="stepper">
              <button class="icon-btn sm" data-act="progress-minus" data-id="${w.id}" aria-label="Retroceder">−</button>
              <button class="icon-btn sm" data-act="progress" data-id="${w.id}" aria-label="Avanzar">＋</button>
            </div>
          </div>
          <div class="progress-bar"><div class="progress-fill" style="width:${p}%"></div></div>
          <div class="progress-text"><span>${p}% completado</span><span>${total - (Number(w.progress) || 0)} ${TYPE_META[w.type].unit} restantes</span></div>
        </div>` : ''}
        <div class="detail-stats">
          <div class="detail-stat detail-rating"><div class="k">Valoración ${w.rating ? '· ' + ratingText(w.rating) : ''}</div><div class="v">${starInput(w.id, w.rating)}</div></div>
          <div class="detail-stat"><div class="k">🌶️ Spicy</div><div class="v">${w.spicy || 0} / 5</div></div>
          <div class="detail-stat"><div class="k">💧 Tristeza</div><div class="v">${w.sadness || 0} / 5</div></div>
          <div class="detail-stat"><div class="k">Año</div><div class="v">${esc(w.year || '–')}</div></div>
          <div class="detail-stat"><div class="k">Inicio</div><div class="v">${fmtDate(w.startDate)}</div></div>
          <div class="detail-stat"><div class="k">Fin</div><div class="v">${fmtDate(w.endDate)}</div></div>
        </div>
        <div class="detail-section">
          <div class="detail-section-title">Sinopsis</div>
          <p class="detail-text">${esc(w.synopsis || 'Sin sinopsis todavía.')}</p>
        </div>
        ${tags.length ? `<div class="detail-section"><div class="detail-section-title">Etiquetas</div><div class="tag-list">${tags.map(tagChip).join('')}</div></div>` : ''}
        ${seasonsSectionHtml(w, open.seasons)}
        <details class="expandable" data-key="ficha" ${open.ficha ?? rel.length ? 'open' : ''}>
          <summary>🔗 Ficha</summary>
          <div class="expandable-content">
            ${rel.length ? `<dl class="kv">${rel.map(([k, v, people]) => `<dt>${k}</dt><dd>${people ? peopleChips(v) : esc(v)}</dd>`).join('')}</dl>` : '<p>Sin información adicional. Edita la obra para añadirla.</p>'}
          </div>
        </details>
        ${notesSectionHtml(w, open.notes, composer)}
        ${contentSectionHtml(w, open.content)}
        ${rereadsSectionHtml(w, open.rereads)}
        <details class="expandable" data-key="similar" ${open.similar ?? similar.length ? 'open' : ''}>
          <summary>🔍 Obras similares</summary>
          <div class="expandable-content">
            ${similar.length ? `<div class="mini-grid">${similar.map(miniCard).join('')}</div><button class="btn btn-secondary btn-sm" data-act="similar" data-id="${w.id}" style="margin-top:10px">🔍 Ver todas las parecidas y por qué</button>` : `<p>${tags.length ? 'No hay obras parecidas todavía.' : 'Añade etiquetas, autor o reparto para ver recomendaciones.'}</p>`}
          </div>
        </details>
        <details class="expandable" data-key="history" ${open.history ? 'open' : ''}>
          <summary>🕓 Historial${(w.versions || []).length ? ` · ${w.versions.length}` : ''}</summary>
          <div class="expandable-content">${versionsHtml(w)}</div>
        </details>
      </div>`;
    if (focusedNote && $('detailNote')) { const t = $('detailNote'); t.focus({ preventScroll: true }); t.setSelectionRange(t.value.length, t.value.length); }
}
// ============================================================
// 14. COLECCIONES
// ============================================================
function renderCollections() {
    const list = $('collectionsList');
    if (!appData.collections.length) {
        list.innerHTML = `<div class="empty-state"><div class="big">🗂️</div><h4>Aún no tienes colecciones</h4><p>Agrupa tus obras como quieras: “Para llorar”, “Maratón de finde”, “Top BL”…</p><button class="btn btn-primary btn-sm" data-act="coll-new">＋ Nueva colección</button></div>`;
        return;
    }
    list.innerHTML = appData.collections.map(c => {
        const works = collectionWorks(c);
        const mosaic = works.slice(0, 4);
        return `
        <article class="collection-card" data-coll="${c.id}" tabindex="0">
          <div class="collection-mosaic">${mosaic.length ? mosaic.map(w => img(w.image, w.type, w.title)).join('') + '<span></span>'.repeat(4 - mosaic.length) : '<div class="ph">🗂️</div>'}</div>
          <div class="collection-info">
            <h4><span>${isSmart(c) ? '✨ ' : ''}${esc(c.name)}</span><span class="chip chip-muted">${works.length}</span></h4>
            <p>${esc(c.description || (isSmart(c) ? describeQuery(c.query) : ''))}</p>
            <div class="collection-actions">
              <button class="btn btn-secondary btn-sm" data-act="coll-open" data-id="${c.id}">📂 Abrir</button>
              <button class="btn btn-secondary btn-sm" data-act="coll-edit" data-id="${c.id}">✏️</button>
              <button class="btn btn-secondary btn-sm" data-act="coll-delete" data-id="${c.id}">🗑️</button>
            </div>
          </div>
        </article>`;
    }).join('');
}
function openCollectionModal(c = null, preset = {}) {
    $('editCollectionId').value = c ? c.id : '';
    $('collectionName').value = c ? c.name : '';
    $('collectionDesc').value = c ? (c.description || '') : '';
    $('collectionSmart').checked = c ? isSmart(c) : !!preset.smart;
    $('collectionQuery').value = c ? (c.query || '') : (preset.query || '');
    updateSmartPreview();
    $('collectionModalTitle').textContent = c ? '✏️ Editar colección' : '＋ Nueva colección';
    openModal('collectionModal');
}
let pendingCollectWorkId = null;
function saveCollection() {
    const id = $('editCollectionId').value;
    const name = $('collectionName').value.trim();
    if (!name) { showToast('⚠️ El nombre es obligatorio', 'error'); return; }
    const description = $('collectionDesc').value.trim();
    const smart = $('collectionSmart').checked, query = $('collectionQuery').value.trim();
    if (smart && !query) { showToast('⚠️ Escribe la búsqueda de la colección inteligente', 'error'); $('collectionQuery').focus(); return; }
    const extra = smart ? { smart: true, query } : { smart: false, query: '' };
    const ok = mutate(() => {
        if (id) Object.assign(getCollectionById(id), { name, description, ...extra });
        else appData.collections.push({ id: generateId(), name, description, ...extra, items: pendingCollectWorkId && !smart ? [pendingCollectWorkId] : [], createdAt: Date.now() });
    }, id ? '✅ Colección actualizada' : (pendingCollectWorkId ? '✅ Colección creada con la obra' : '✅ Colección creada'));
    if (ok) { pendingCollectWorkId = null; closeModal('collectionModal', { force: true }); }
}
function deleteCollection(id) {
    const c = getCollectionById(id);
    if (!c) return;
    const n = isSmart(c) ? 0 : c.items.filter(getWorkById).length;
    if (n && !confirm(`La colección “${c.name}” tiene ${n} ${n === 1 ? 'obra' : 'obras'} (las obras no se borran).\n\nSe enviará a la papelera. ¿Continuar?`)) return;
    mutate(() => { trashRecord(appData, 'collections', id, Date.now(), { from: 'Colecciones' }); }, `🗑️ Colección “${c.name}” enviada a la papelera`, { label: `Eliminar colección “${c.name}”` });
}
function openCollectionView(id) {
    openSheet((getCollectionById(id) || {}).name || 'Colección', () => {
        const c = getCollectionById(id);
        if (!c) return '<p>Colección no encontrada.</p>';
        $('sheetTitle').textContent = (isSmart(c) ? '✨ ' : '🗂️ ') + c.name;
        return collectionViewHtml(c);
    });
}
function openCollectionPicker(workId) {
    const w = getWorkById(workId);
    if (!w) return;
    openSheet('📂 Añadir a colección', () => `
        <p class="panel-desc" style="margin:0 0 12px">Marca las colecciones donde quieres guardar “${esc(w.title)}”.</p>
        <div class="pick-list">
          ${manualCollections().map(c => `
            <label class="pick-item" style="cursor:pointer">
              <input type="checkbox" data-pick-coll="${c.id}" data-work="${workId}" ${c.items.includes(workId) ? 'checked' : ''}>
              <span class="info"><b>${esc(c.name)}</b><small>${c.items.length} obras</small></span>
            </label>`).join('') || '<p class="panel-desc" style="margin:0">Todavía no tienes colecciones.</p>'}
          <button class="pick-item" data-act="coll-new-with" data-id="${workId}" style="justify-content:center;color:var(--accent-text);font-weight:600">＋ Crear nueva colección</button>
        </div>`);
}

// ============================================================
// 15. PERSONAS
// ============================================================
let personTab = 'general';
function personCard(p) {
    const count = personWorkCount(p);
    return `
    <article class="person-card" data-person="${p.id}" data-id="${p.id}" tabindex="0">
      ${p.bl ? '<span class="chip chip-pink bl-dot">BL</span>' : ''}
      <div class="avatar">${img(p.image, 'person', p.name)}</div>
      <div class="person-name">${esc(p.name)}</div>
      <div class="person-original">${esc(PERSON_TYPE_LABEL[p.type] || p.type)}${p.nationality ? ' · ' + esc(p.nationality) : ''}</div>
      <div class="person-stats"><span>${p.type === 'author' ? '📚' : '🎬'} ${count} obras</span>${p.rating ? `<span style="color:var(--gold)">★ ${ratingText(p.rating)}</span>` : ''}</div>
      <div class="person-actions">
        <button class="btn btn-secondary btn-sm" data-act="person-edit">✏️ Editar</button>
        <button class="btn btn-secondary btn-sm" data-act="person-delete" aria-label="Eliminar">🗑️</button>
      </div>
    </article>`;
}
function renderPersons() {
    const q = norm(val('personSearch'));
    const sortBy = val('personSortSelect');
    let all = appData.persons.filter(p => norm(p.name).includes(q));
    if (sortBy === 'works') all.sort((a, b) => personWorkCount(b) - personWorkCount(a));
    else if (sortBy === 'rating') all.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    else all.sort((a, b) => a.name.localeCompare(b.name, 'es'));

    const byType = t => appData.persons.filter(p => p.type === t).length;
    $('personTotal').textContent = appData.persons.length;
    $('personActors').textContent = $('personActorsTab').textContent = byType('actor');
    $('personAuthors').textContent = $('personAuthorsTab').textContent = byType('author');
    $('personDirectors').textContent = $('personDirectorsTab').textContent = byType('director');
    $('personBlTab').textContent = appData.persons.filter(p => p.bl).length;
    document.querySelectorAll('#personTabs .tab').forEach(t => t.classList.toggle('active', t.dataset.tab === personTab));
    $('person-general').hidden = personTab !== 'general';
    $('person-list').hidden = personTab === 'general';

    const emptyPersons = `<div class="empty-state"><div class="big">👥</div><h4>No hay personas aquí</h4><p>Agrega actores, autores o directores para ver sus obras.</p><button class="btn btn-primary btn-sm" data-act="person-new">＋ Agregar persona</button></div>`;
    const album = appData.settings.personView === 'album';
    document.querySelectorAll('[data-act="person-view"]').forEach(b => b.classList.toggle('is-on', b.dataset.id === (album ? 'album' : 'cards')));
    const people = list => (!list.length ? emptyPersons : album ? personAlbum(list) : list.map(personCard).join(''));
    if (personTab === 'general') {
        $('allPersonsGrid').innerHTML = people(all);
        $('allPersonsGrid').classList.toggle('is-album', album);
        const top = appData.persons.slice().sort((a, b) => personWorkCount(b) - personWorkCount(a)).slice(0, 5);
        $('personRanking').innerHTML = top.length ? top.map((p, i) => `
            <button class="ranking-item" data-person="${p.id}">
              <div class="ranking-number ${['gold', 'silver', 'bronze'][i] || ''}">${i + 1}</div>
              <div class="ranking-avatar">${img(p.image, 'person', p.name)}</div>
              <div class="ranking-info"><div class="ranking-name">${esc(p.name)}</div><div class="ranking-detail">${esc(PERSON_TYPE_LABEL[p.type] || p.type)} · ${personWorkCount(p)} obras</div></div>
              ${p.rating ? `<div class="ranking-rating">★ ${ratingText(p.rating)}</div>` : ''}
            </button>`).join('') : '<p class="panel-desc" style="margin:0">Sin datos todavía.</p>';
    } else {
        const list = personTab === 'bl' ? all.filter(p => p.bl) : all.filter(p => p.type === personTab);
        $('personsGrid').innerHTML = people(list);
        $('personsGrid').classList.toggle('is-album', album);
    }
}
let currentPersonId = null;
function openPersonDetail(id) {
    if (!getPersonById(id)) return;
    $('personDetailCard').innerHTML = '';
    currentPersonId = id;
    renderPersonDetail();
    $('personDetailCard').scrollTop = 0;
    openModal('personDetailOverlay');
}
function renderPersonDetail() {
    const p = getPersonById(currentPersonId);
    if (!p) { closeModal('personDetailOverlay'); return; }
    const q = norm($('pdSearch') ? $('pdSearch').value : '');
    const typeF = $('pdType') ? $('pdType').value : 'all';
    let works = worksForPerson(p);
    const totalLinked = works.length;
    if (q) works = works.filter(w => norm(w.title).includes(q));
    if (typeF !== 'all') works = works.filter(w => w.type === typeF);
    let age = '';
    if (p.birthDate) {
        const b = new Date(p.birthDate + 'T00:00:00'), n = new Date();
        let a = n.getFullYear() - b.getFullYear();
        if (n < new Date(n.getFullYear(), b.getMonth(), b.getDate())) a--;
        if (a >= 0 && a < 130) age = ` (${a} años)`;
    }
    const social = splitList(p.socialLinks).map(l => /^https?:\/\//i.test(l)
        ? `<a class="chip" href="${esc(l)}" target="_blank" rel="noopener noreferrer">🔗 ${esc(l.replace(/^https?:\/\/(www\.)?/i, '').slice(0, 32))}</a>`
        : `<span class="chip">${esc(l)}</span>`).join('');
    const focused = document.activeElement && document.activeElement.id;
    const caret = focused === 'pdSearch' ? document.activeElement.selectionStart : null;
    $('personDetailCard').innerHTML = `
        <div class="person-detail-banner" style="${resolveImageSrc(p.banner) ? 'background-image:' + esc(cssUrl(resolveImageSrc(p.banner))) : ''}"></div>
        <button class="icon-btn sm person-detail-close" data-close aria-label="Cerrar">✕</button>
        <img class="person-detail-avatar" src="${esc(imageSrc(p.image, 'person'))}" alt="${esc(p.name)}" data-ph="person">
        <div class="person-detail-content">
          <div class="person-detail-name">${esc(p.name)}</div>
          <div class="person-detail-meta">
            <span style="color:var(--accent-text);font-weight:600">${esc(PERSON_TYPE_LABEL[p.type] || p.type)}</span>
            ${p.nationality ? `<span>🌍 ${esc(p.nationality)}</span>` : ''}
            ${p.birthDate ? `<span>🎂 ${fmtDate(p.birthDate)}${age}</span>` : ''}
          </div>
          <div class="person-detail-chips">
            <span class="chip chip-muted">🎬 ${personWorkCount(p)} obras</span>
            ${p.rating ? `<span class="chip chip-orange">★ ${ratingText(p.rating)}</span>` : ''}
            ${p.bl ? '<span class="chip chip-pink">💖 BL</span>' : ''}
          </div>
          ${p.bio ? `<div class="person-bio">${esc(p.bio)}</div>` : ''}
          ${couplesForPerson(p.id, appData.couples).length ? `<div class="tag-list" style="justify-content:center;margin-bottom:16px">${couplesForPerson(p.id, appData.couples).map(c => `<button class="chip chip-pink" data-couple="${c.id}">💕 ${esc(c.name)}</button>`).join('')}</div>` : ''}
          ${social ? `<div class="tag-list" style="justify-content:center;margin-bottom:16px">${social}</div>` : ''}
          <div style="display:flex;gap:8px;justify-content:center;margin-bottom:20px">
            <button class="btn btn-secondary btn-sm" data-act="person-edit" data-id="${p.id}">✏️ Editar</button>
            <button class="btn btn-secondary btn-sm" data-act="person-duplicate" data-id="${p.id}">⧉ Duplicar</button>
          </div>
          <div class="detail-section-title">📚 Obras en tu colección (${totalLinked})</div>
          ${totalLinked ? `
          <div class="work-filter-row">
            <input type="search" class="text-input" id="pdSearch" placeholder="Buscar obra…" value="${esc($('pdSearch') ? $('pdSearch').value : '')}">
            <select class="filter-select" id="pdType">
              ${[['all', 'Todos'], ['book', 'Libros'], ['series', 'Series'], ['anime', 'Anime'], ['manhwa', 'Manhwa']].map(([v, l]) => `<option value="${v}" ${typeF === v ? 'selected' : ''}>${l}</option>`).join('')}
            </select>
          </div>
          ${works.length ? `<div class="mini-grid">${works.map(miniCard).join('')}</div>` : '<p class="panel-desc">Ninguna obra coincide.</p>'}`
          : `<p class="panel-desc">Aún no hay obras vinculadas. Escribe “${esc(p.name)}” como autor, actor o director en una obra y aparecerá aquí.</p>`}
        </div>`;
    if (focused === 'pdSearch' && $('pdSearch')) { $('pdSearch').focus(); $('pdSearch').setSelectionRange(caret, caret); }
}
const updatePersonPreview = bindPreview('personImage', 'personImagePreview', 'person');
const updateBannerPreview = bindPreview('personBanner', 'personBannerPreview', 'banner');
function openPersonModal(p = null) {
    $('editPersonId').value = p ? p.id : '';
    $('personName').value = p ? p.name : '';
    $('personType').value = p ? p.type : 'actor';
    $('personWorks').value = p ? (p.works || '') : '';
    $('personRating').value = p ? (p.rating || 0) : 0;
    $('personNationality').value = p ? (p.nationality || '') : '';
    $('personBirthDate').value = p ? (p.birthDate || '') : '';
    $('personBio').value = p ? (p.bio || '') : '';
    $('personSocialLinks').value = p ? (p.socialLinks || '') : '';
    $('personImage').value = p ? (p.image || '') : '';
    $('personBanner').value = p ? (p.banner || '') : '';
    $('personBl').checked = p ? !!p.bl : false;
    $('personModalTitle').textContent = p ? '✏️ Editar persona' : '＋ Agregar persona';
    updateRangeOutputs($('personModal'));
    updatePersonPreview(); updateBannerPreview();
    openModal('personModal');
}
function savePerson() {
    const id = $('editPersonId').value;
    const name = $('personName').value.trim();
    if (!name) { showToast('⚠️ El nombre es obligatorio', 'error'); $('personName').focus(); return; }
    const dup = appData.persons.find(p => norm(p.name) === norm(name) && p.id !== id);
    if (dup && !confirm(`Ya existe “${dup.name}”. ¿Guardar de todas formas?`)) return;
    const data = {
        name, type: $('personType').value, works: Number($('personWorks').value) || 0, rating: Number($('personRating').value) || 0,
        nationality: $('personNationality').value.trim(), birthDate: $('personBirthDate').value, bio: $('personBio').value.trim(),
        socialLinks: $('personSocialLinks').value.trim(), image: $('personImage').value.trim(), banner: $('personBanner').value.trim(),
        bl: $('personBl').checked
    };
    const ok = mutate(() => {
        if (id) Object.assign(getPersonById(id), data, { updatedAt: Date.now() });
        else appData.persons.push({ id: generateId(), ...data, createdAt: Date.now() });
    }, id ? '✅ Persona actualizada' : '✅ Persona agregada');
    if (ok) closeModal('personModal', { force: true });
}
function deletePerson(id) {
    const p = getPersonById(id);
    if (!p) return;
    const n = worksForPerson(p).length;
    if (n && !confirm(`${p.name} aparece en ${n} ${n === 1 ? 'obra' : 'obras'} de tu colección (las obras no se borran).\n\nSe enviará a la papelera. ¿Continuar?`)) return;
    if (currentPersonId === id) closeModal('personDetailOverlay');
    mutate(() => { trashRecord(appData, 'persons', id, Date.now(), { from: 'Personas' }); }, `🗑️ ${p.name} enviada a la papelera`, { label: `Eliminar a ${p.name}` });
}

// ============================================================
// 16. PAREJAS BL
// ============================================================
let coupleFilter = 'all';
function renderCouples() {
    const q = norm(val('couplesSearch'));
    let list = appData.couples.filter(c => norm(c.name).includes(q));
    if (coupleFilter === 'favorite') list = list.filter(c => c.favorite);
    if (coupleFilter === 'rating') { const order = rankCouples(list, appData.works, appData.persons).map(r => r.couple); list = order; }
    document.querySelectorAll('#coupleTabs .tab').forEach(t => t.classList.toggle('active', t.dataset.filter === coupleFilter));
    $('coupleCount').textContent = `${list.length} ${list.length === 1 ? 'pareja' : 'parejas'}`;
    $('couplesGrid').innerHTML = list.length ? list.map(c => { const info = coupleInfo(c); return `
        <article class="couple-card" data-couple="${c.id}" data-id="${c.id}" tabindex="0">
          <div class="couple-image">${img(c.image, 'couple', c.name)}</div>
          <div class="couple-actions">
            <button class="card-act ${c.favorite ? 'is-fav' : ''}" data-act="couple-fav" title="Favorita" aria-label="Favorita">${c.favorite ? '♥' : '♡'}</button>
            <button class="card-act danger" data-act="couple-delete" title="Eliminar" aria-label="Eliminar">✕</button>
          </div>
          <div class="couple-info">
            <div class="couple-name">${esc(c.name)}</div>
            <div class="couple-works">${info.count} ${info.count === 1 ? 'obra' : 'obras'} juntos${info.linked ? ' · 🔗' : ''}</div>
            <div class="couple-rating"><span class="stars">${getStars(info.avgRating || c.rating)}</span><span class="value">${ratingText(Math.round((info.avgRating || c.rating || 0) * 10) / 10)}</span></div>
          </div>
        </article>`; }).join('')
        : `<div class="empty-state"><div class="big">💕</div><h4>No hay parejas aquí</h4><p>Guarda tus parejas BL favoritas.</p><button class="btn btn-primary btn-sm" data-act="couple-new">＋ Añadir pareja</button></div>`;
    const top = rankCouples(appData.couples, appData.works, appData.persons).slice(0, 5);
    $('coupleRanking').innerHTML = top.length ? top.map(({ couple: c, score, count }, i) => `
        <button class="ranking-item" data-couple="${c.id}">
          <div class="ranking-number ${['gold', 'silver', 'bronze'][i] || ''}">${i + 1}</div>
          <div class="ranking-avatar">${img(c.image, 'couple', c.name)}</div>
          <div class="ranking-info"><div class="ranking-name">${esc(c.name)}</div><div class="ranking-detail">${count} obras${c.favorite ? ' · ❤️' : ''}</div></div>
          <div class="ranking-rating">★ ${ratingText(Math.round(score * 10) / 10)}</div>
        </button>`).join('') : '<p class="panel-desc" style="margin:0">Sin datos todavía.</p>';
}
const updateCouplePreview = bindPreview('coupleImage', 'coupleImagePreview', 'couple');
function openCoupleModal(c = null) {
    $('editCoupleId').value = c ? c.id : '';
    $('coupleName').value = c ? c.name : '';
    $('coupleWorks').value = c ? (c.works || '') : '';
    $('coupleRating').value = c ? (c.rating || 0) : 0;
    $('coupleImage').value = c ? (c.image || '') : '';
    $('coupleFavorite').checked = c ? !!c.favorite : false;
    $('coupleModalTitle').textContent = c ? '✏️ Editar pareja' : '＋ Añadir pareja BL';
    fillCoupleLinks(c);
    updateRangeOutputs($('coupleModal'));
    updateCouplePreview();
    openModal('coupleModal');
}
function saveCouple() {
    const id = $('editCoupleId').value;
    const links = collectCoupleLinks();
    if (links.personA && links.personA === links.personB) { showToast('⚠️ Elige dos personas distintas', 'error'); return; }
    const a = getPersonById(links.personA), b = getPersonById(links.personB);
    // Si no escribes nombre, se usa "A & B"
    const name = $('coupleName').value.trim() || (a && b ? `${a.name} & ${b.name}` : '');
    if (!name) { showToast('⚠️ Escribe un nombre o elige a los dos actores', 'error'); $('coupleName').focus(); return; }
    const data = { name, works: Number($('coupleWorks').value) || 0, rating: Number($('coupleRating').value) || 0, image: $('coupleImage').value.trim(), favorite: $('coupleFavorite').checked, ...links };
    const ok = mutate(() => {
        if (id) Object.assign(getCoupleById(id), data);
        else appData.couples.push({ id: generateId(), ...data, createdAt: Date.now() });
    }, id ? '✅ Pareja actualizada' : '✅ Pareja añadida');
    if (ok) closeModal('coupleModal', { force: true });
}
function deleteCouple(id) {
    const c = getCoupleById(id);
    if (!c) return;
    mutate(() => { trashRecord(appData, 'couples', id, Date.now(), { from: 'Parejas BL' }); }, `🗑️ “${c.name}” enviada a la papelera`, { label: `Eliminar pareja “${c.name}”` });
}

// ============================================================
// 17. CENTRO DE EMISIÓN
// ============================================================
function renderEmission() {
    const active = appData.works.filter(isActive);
    const scheduled = active.filter(w => getAirDay(w) !== null);
    const today = new Date().getDay();
    $('emissionTotal').textContent = active.length;
    $('emissionThisWeek').textContent = scheduled.length;
    $('emissionToday').textContent = scheduled.filter(w => getAirDay(w) === today).length;
    $('emissionPending').textContent = appData.works.filter(isPlanned).length;

    const monday = new Date();
    monday.setDate(monday.getDate() - ((today + 6) % 7));
    $('weeklyCalendar').innerHTML = WEEK.map((d, i) => {
        const date = new Date(monday);
        date.setDate(monday.getDate() + i);
        const items = scheduled.filter(w => getAirDay(w) === d.day);
        return `
        <div class="week-day ${d.day === today ? 'today' : ''}">
          <div class="week-day-head"><div class="week-day-name">${d.short}</div><div class="week-day-date">${date.getDate()}</div></div>
          ${items.map(w => `<button class="week-event" data-open="${w.id}" style="border-left-color:${TYPE_META[w.type].color}">${esc(w.title)}<small>${esc(getProgressText(w))}</small></button>`).join('') || '<div class="week-empty">—</div>'}
        </div>`;
    }).join('');
    renderNextAiring();
    maybeRefreshAiring();
    const unscheduled = active.filter(w => getAirDay(w) === null);
    $('unscheduledSection').hidden = !unscheduled.length;
    $('unscheduledGrid').innerHTML = unscheduled.map(w => workCard(w, { compact: true, showType: true })).join('');
}

// ============================================================
// 18. ESTADÍSTICAS
// ============================================================
const TYPE_ORDER = ['book', 'series', 'anime', 'manhwa'];
const TYPE_PLURAL = { book: 'Libros', series: 'Series', anime: 'Anime', manhwa: 'Manhwas' };
let goalEditing = false;

function kpi(label, value, delta = '', trend = '') {
    return `<div class="kpi"><div class="kpi-label">${label}</div><div class="kpi-value">${value}</div>${delta ? `<div class="kpi-delta ${trend}">${esc(delta)}</div>` : ''}</div>`;
}
function renderStats() {
    const works = appData.works;
    const now = Date.now();
    const year = new Date(now).getFullYear();
    const byDay = activityByDay(works);
    const st = streaks(byDay, now);
    const doneYear = finishedInYear(works, year);
    const donePrev = finishedInYear(works, year - 1);
    const hours = hoursByType(works);
    const totalHours = TYPE_ORDER.reduce((a, t) => a + hours[t], 0);
    const rated = works.filter(w => Number(w.rating) > 0);
    const avg = rated.length ? rated.reduce((a, w) => a + Number(w.rating), 0) / rated.length : 0;
    const monthStart = new Date(new Date(now).getFullYear(), new Date(now).getMonth(), 1).getTime();
    const addedThisMonth = works.filter(w => !w.sample && (w.createdAt || 0) >= monthStart).length;
    const diff = doneYear - donePrev;

    $('statsKpis').innerHTML = [
        kpi('🗃️ Obras', works.length, `${addedThisMonth} agregadas este mes`),
        kpi(`✅ Terminadas en ${year}`, doneYear, donePrev || doneYear ? (diff === 0 ? `Igual que en ${year - 1}` : `${diff > 0 ? '▲' : '▼'} ${Math.abs(diff)} ${diff > 0 ? 'más' : 'menos'} que en ${year - 1}`) : '', diff > 0 ? 'up' : diff < 0 ? 'down' : ''),
        kpi('🔥 Racha actual', `${st.current} ${st.current === 1 ? 'día' : 'días'}`, `Mejor racha: ${st.best} ${st.best === 1 ? 'día' : 'días'}`),
        kpi('⏱️ Horas estimadas', `${Math.round(totalHours).toLocaleString(APP_LOCALE)} h`, `≈ ${Math.round(totalHours / 24)} días seguidos`),
        kpi('⭐ Valoración media', avg ? avg.toFixed(1) : '–', `${rated.length} ${rated.length === 1 ? 'obra valorada' : 'obras valoradas'}`)
    ].join('');

    $('statsStreakSub').textContent = st.current
        ? `Llevas ${st.current} ${st.current === 1 ? 'día' : 'días'} seguidos · tu mejor racha: ${st.best}`
        : '';
    // Tantas semanas como quepan (de 12 a 26) para que en el móvil no haga falta desplazarse
    const calWidth = $('statsCalendar').clientWidth || 700;
    const weeks = Math.max(12, Math.min(26, Math.floor((calWidth - 19) / 17)));
    $('statsCalendar').innerHTML = activityCalendar(byDay, { weeks, now, caption: 'Sesiones por día' });
    $('statsCalendarTitle').textContent = `Días en los que avanzaste, agregaste o terminaste algo (últimas ${weeks} semanas)`;
    const calWrap = document.querySelector('#statsCalendar .viz-calendar-wrap');
    if (calWrap) calWrap.scrollLeft = calWrap.scrollWidth;

    renderGoal(doneYear, year, now);

    const months = finishedByMonth(works, 12, now);
    $('statsMonthly').innerHTML = months.every(m => TYPE_ORDER.every(t => !m.byType[t]))
        ? '<p class="viz-empty">Aún no has terminado nada en los últimos 12 meses. Cuando marques una obra como terminada, aparecerá aquí.</p>'
        : columnChart({
        categories: months.map(m => m.label),
        series: TYPE_ORDER.map(t => ({ name: TYPE_PLURAL[t], color: TYPE_META[t].color })),
        values: months.map(m => TYPE_ORDER.map(t => m.byType[t])),
        caption: 'Obras terminadas por mes y tipo'
    });

    const sum = statusSummary(works);
    $('statsStatus').innerHTML = barList([
        { label: 'En curso', value: sum.active },
        { label: 'Terminadas', value: sum.done },
        { label: 'Pendientes', value: sum.planned },
        { label: 'Abandonadas', value: sum.dropped }
    ], { caption: 'Obras por estado' });

    $('statsTime').innerHTML = proportionBar(TYPE_ORDER.map(t => ({
        name: TYPE_PLURAL[t], value: hours[t], color: TYPE_META[t].color, display: `${Math.round(hours[t]).toLocaleString(APP_LOCALE)} h`
    })), { caption: 'Horas estimadas por tipo' });

    const pworks = worksInPeriod(works, statsPeriod, now);
    const hist = ratingHistogram(pworks);
    const prated = pworks.filter(w => Number(w.rating) > 0);
    const pavg = prated.length ? prated.reduce((a, w) => a + Number(w.rating), 0) / prated.length : 0;
    $('statsRatingSub').textContent = prated.length ? `Media ${pavg.toFixed(1)} · la más repetida: ${ratingText(hist.reduce((a, b) => (b.count > a.count ? b : a)).rating)} ★` : 'Cuántas obras tienen cada nota';
    $('statsRatings').innerHTML = prated.length ? columnChart({
        categories: hist.map(b => (b.rating % 1 ? (b.rating === 0.5 ? '½' : `${Math.floor(b.rating)}½`) : String(b.rating))),
        series: [{ name: 'Obras', color: 'var(--gold)' }],
        values: hist.map(b => [b.count]),
        height: 150,
        caption: 'Obras por valoración'
    }) : '<p class="viz-empty">Valora tus obras con estrellas para ver esto.</p>';

    $('statsMood').innerHTML = heatGrid(moodGrid(pworks), {
        rows: ['5', '4', '3', '2', '1'], cols: ['1', '2', '3', '4', '5'],
        rowTitle: '💧 Tristeza', colTitle: '🌶️ Spicy', caption: 'Obras según spicy y tristeza', cellAction: 'mood'
    });
    $('statsGenresChart').innerHTML = barList(tagCounts(pworks).slice(0, 10).map(([label, value]) => ({ label, value })),
        { caption: 'Etiquetas más usadas', empty: 'Añade etiquetas para ver estadísticas de géneros.' });
    $('statsCountries').innerHTML = barList(topValues(pworks, 'country').map(x => ({ label: x.label, value: x.count })),
        { caption: 'Obras por país', empty: 'Añade el país a tus series y animes.' });
    $('statsPlatforms').innerHTML = barList(topValues(pworks, 'platform').map(x => ({ label: x.label, value: x.count })),
        { caption: 'Obras por plataforma', empty: 'Añade la plataforma a tus series y manhwas.' });
    renderAchievements();
    renderStatsPlus(now);
    renderDiscoveries();
}
function renderGoal(done, year, now) {
    const goal = Number(appData.settings.yearGoal) || 0;
    if (!goal || goalEditing) {
        $('statsGoal').innerHTML = `
            <p class="panel-desc" style="margin:0 0 12px">¿Cuántas obras quieres terminar en ${year}? Llevas <b>${done}</b>.</p>
            <div class="upload-row">
                <input type="number" class="text-input" id="goalInput" min="1" max="1000" value="${goal || Math.max(12, done + 6)}" aria-label="Meta anual">
                <button class="btn btn-primary btn-sm" data-act="goal-save">🎯 ${goal ? 'Guardar' : 'Fijar reto'}</button>
            </div>`;
        return;
    }
    const pct = Math.min(100, Math.round(done / goal * 100));
    const start = new Date(year, 0, 1).getTime(), end = new Date(year + 1, 0, 1).getTime();
    const elapsed = Math.max(0.01, (now - start) / (end - start));
    const projected = Math.round(done / elapsed);
    const expected = Math.floor(goal * elapsed);
    const status = done >= goal ? '🏆 ¡Reto cumplido!' : done >= expected ? '✅ Vas al día' : `⏳ Vas ${expected - done} por detrás`;
    $('statsGoal').innerHTML = `
        <div class="goal-card">
            <div class="goal-ring">${ringMeter(done, goal, { label: `${done} de ${goal} obras` })}
                <div class="goal-ring-text"><b>${done}</b><span>de ${goal}</span></div></div>
            <div class="goal-info">
                <h4>${status}</h4>
                <p>${pct} % del reto · a este ritmo terminarás unas ${projected} en ${year}.${done < goal ? ` Te faltan ${goal - done}.` : ''}</p>
                <button class="btn btn-secondary btn-sm" data-act="goal-edit">Cambiar meta</button>
            </div>
        </div>`;
}
function openMoodCell(key) {
    const [r, c] = key.split(':').map(Number);
    const sadness = 5 - r, spicy = c + 1;
    const list = appData.works.filter(w => Number(w.sadness) === sadness && Number(w.spicy) === spicy);
    openSheet(`🌶️ ${spicy} · 💧 ${sadness}`, () => list.length ? `<div class="pick-list">${list.map(w => `
        <button class="pick-item" data-open="${w.id}"><div class="thumb">${img(w.image, w.type, w.title)}</div>
        <span class="info"><b>${esc(w.title)}</b><small>${TYPE_META[w.type].icon} ${esc(getTypeLabel(w.type))} · ${esc(getStatusLabel(w.status))}</small></span></button>`).join('')}</div>`
        : emptyState('🫙', 'Ninguna obra aquí', 'Ajusta el spicy y la tristeza al editar tus obras.'));
}
function calculateAchievements() {
    const w = appData.works;
    const byDate = list => list.slice().sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))[0];
    const first = (list, id, icon, title) => {
        const x = byDate(list);
        return { id, icon, title, desc: x ? `“${x.title || x.name || x.workTitle}”` : 'Aún no desbloqueado', date: x ? fmtDate(x.createdAt) : '', unlocked: !!x };
    };
    const count = (n, id, icon, title, list, what) => ({ id, icon, title, desc: `${Math.min(list.length, n)} / ${n} ${what}`, date: '', unlocked: list.length >= n });
    const done = w.filter(x => x.status === 'terminado');
    return [
        first(w.filter(x => x.type === 'book'), 'first_book', '📖', 'Primer libro'),
        first(w.filter(x => x.type === 'series'), 'first_series', '🎬', 'Primera serie'),
        first(w.filter(x => x.type === 'anime'), 'first_anime', '🎌', 'Primer anime'),
        first(w.filter(x => x.type === 'manhwa'), 'first_manhwa', '📕', 'Primer manhwa'),
        first(w.filter(x => x.bl), 'first_bl', '💖', 'Primera obra BL'),
        first(appData.notes, 'first_note', '📝', 'Primera nota'),
        first(appData.collections, 'first_collection', '🗂️', 'Primera colección'),
        first(appData.persons, 'first_person', '👤', 'Primera persona'),
        count(10, 'w10', '🔟', '10 obras registradas', w, 'obras'),
        count(5, 'd5', '✅', '5 obras terminadas', done, 'terminadas'),
        count(5, 'f5', '❤️', '5 favoritos', w.filter(x => x.favorite), 'favoritos'),
        count(10, 'bl10', '💕', 'Fan del BL', w.filter(x => x.bl), 'obras BL'),
        count(25, 'w25', '🎯', '25 obras registradas', w, 'obras'),
        count(50, 'w50', '🏅', '50 obras registradas', w, 'obras'),
        count(100, 'w100', '👑', '100 obras registradas', w, 'obras')
    ];
}
function renderAchievements() {
    const list = calculateAchievements().sort((a, b) => b.unlocked - a.unlocked);
    $('achievementsCount').textContent = `${list.filter(a => a.unlocked).length} / ${list.length}`;
    $('achievementsList').innerHTML = list.map(a => `
        <div class="achievement-item ${a.unlocked ? '' : 'locked'}">
          <div class="a-icon">${a.unlocked ? a.icon : '🔒'}</div>
          <div class="info"><div class="title">${esc(a.title)}</div><div class="desc">${esc(a.desc)}</div></div>
          <div class="date">${esc(a.date)}</div>
        </div>`).join('');
}

// ============================================================
// 19. NOTAS
// ============================================================
function renderNotes() {
    const q = norm(val('notesSearch'));
    const type = val('notesTypeFilter') || 'all';
    const notes = appData.notes.filter(n => (!q || norm(n.content + ' ' + n.workTitle).includes(q)) && (type === 'all' || noteType(n) === type))
        .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || lastTouched(b) - lastTouched(a));
    $('notesList').innerHTML = notes.length ? notes.map(n => {
        const w = getWorkById(n.workId);
        return `
        <article class="note-card">
          <div class="thumb" ${w ? `data-open="${w.id}"` : ''}>${img(w && w.image, w ? w.type : 'book', n.workTitle)}</div>
          <div class="body">
            <h4>${esc(n.workTitle || (w && w.title) || 'Nota')}</h4>
            <div class="date">${NOTE_TYPES[noteType(n)].icon} ${NOTE_TYPES[noteType(n)].label}${n.pinned ? ' · 📌' : ''} · ${lastTouched(n) > (n.createdAt || 0) + 60000 ? 'Editada ' + relDate(n.updatedAt) : relDate(n.createdAt)}${noteType(n) === 'resena' && reviewAverage(n.scores) ? ` · ★ ${ratingText(Math.round(reviewAverage(n.scores) * 10) / 10)}` : ''}</div>
            <div class="content">${esc(n.content)}</div>
            <div class="actions">
              ${w ? `<button class="btn btn-secondary btn-sm" data-open="${w.id}">✏️ Abrir</button>` : ''}
              <button class="btn btn-secondary btn-sm" data-act="note-pin" data-id="${n.id}">${n.pinned ? 'Desfijar' : '📌'}</button>
              <button class="btn btn-secondary btn-sm" data-act="note-remove" data-id="${esc(n.id)}" aria-label="Eliminar nota">🗑️</button>
            </div>
          </div>
        </article>`;
    }).join('') : `<div class="empty-state"><div class="big">📝</div><h4>${q || type !== 'all' ? 'Sin resultados' : 'Aún no tienes notas'}</h4><p>Abre cualquier obra y escribe en “Mis notas”: comentarios, reseñas, teorías, citas o recordatorios.</p></div>`;
}

// ============================================================
// 20. AJUSTES, TEMA Y COPIAS
// ============================================================
function applySettings() {
    const s = appData.settings;
    const root = document.documentElement;
    const dark = isDarkNow(s);
    root.style.setProperty('--accent', accentNow(s));
    root.dataset.theme = dark ? 'dark' : 'light';
    document.querySelector('.page-inner').style.zoom = (s.fontSize || 14) / 14;
    document.body.classList.toggle('fit-cover', s.imageFit === 'cover');
    document.querySelector('meta[name=color-scheme]').content = dark ? 'dark' : 'light';
    // Color de la barra del sistema (móvil y app instalada)
    document.querySelector('meta[name=theme-color]').content = dark ? '#0b0b13' : '#fbfbfe';
    applyPersonalization();
    root.classList.toggle('read-only', !!s.readOnly);
    if (detectLang(s.lang) !== currentLang || currentLang !== 'es') applyLanguage(s.lang);
}
if (typeof matchMedia !== 'undefined') matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (appData.settings.themeAuto) applySettings(); });
function updateSetting(key, value, msg) {
    appData.settings[key] = value;
    applySettings();
    if (saveData() && msg) showToast(msg);
    renderSettings();
    renderSidebar();
}
function renderSettings() {
    const s = appData.settings;
    if (document.activeElement !== $('settingName')) $('settingName').value = s.userName || '';
    if (document.activeElement !== $('settingTmdbKey')) $('settingTmdbKey').value = s.tmdbKey || '';
    $('settingLang').value = s.lang || 'es';
    $('readOnlyToggle').setAttribute('aria-checked', String(!!s.readOnly));
    $('clipperLink').href = clipperBookmarklet();
    document.querySelectorAll('.color-option').forEach(o => o.classList.toggle('active', o.dataset.color.toLowerCase() === String(accentNow(s)).toLowerCase()));
    $('colorModeHint').textContent = isDarkNow(s) ? 'Para el modo oscuro' : 'Para el modo claro';
    renderPersonalizePanel();
    $('fontSizeSlider').value = s.fontSize;
    $('fontSizeValue').textContent = s.fontSize + 'px';
    $('btnContain').classList.toggle('is-on', s.imageFit !== 'cover');
    $('btnCover').classList.toggle('is-on', s.imageFit === 'cover');
    $('themeToggle').setAttribute('aria-checked', String(isDarkNow(s)));
    renderTrash();
    renderNotifyPanel();
    updateStorageMeter();
}
// ---------- Papelera ----------
const TRASH_KIND = {
    works: ['Obras', w => w.title, w => img(w.image, w.type, w.title)],
    persons: ['Personas', p => p.name, p => img(p.image, 'person', p.name)],
    couples: ['Parejas BL', c => c.name, c => img(c.image, 'couple', c.name)],
    collections: ['Colecciones', c => c.name, () => '🗂️'],
    notes: ['Notas', n => `Nota de “${n.workTitle || 'obra'}”`, () => '📝']
};
function renderTrash() {
    const entries = trashEntries(appData);
    const now = Date.now();
    $('trashCount').textContent = entries.length || '';
    if (!entries.length) {
        $('trashBody').innerHTML = `<p class="panel-desc" style="margin:0">La papelera está vacía. Lo que elimines se guarda aquí ${TRASH_DAYS} días por si te arrepientes.</p>`;
        return;
    }
    $('trashBody').innerHTML = RECORD_KINDS.map(kind => {
        const list = entries.filter(e => e.kind === kind);
        if (!list.length) return '';
        const [label, title, thumb] = TRASH_KIND[kind];
        return `<div class="trash-group"><div class="trash-group-title">${label} · ${list.length}</div>${list.map(({ item, extra }) => {
            const info = item.trashInfo || {};
            const left = trashDaysLeft(item, now);
            return `<div class="pick-item trash-item">
                <div class="thumb">${thumb(item)}</div>
                <span class="info"><b>${esc(title(item))}</b>
                    <small>Eliminada ${esc(relativeTime(item.trashedAt, now))}${info.from ? ' · desde ' + esc(info.from) : ''}${extra ? ` · con ${extra} ${extra === 1 ? 'nota' : 'notas'}` : ''} · ${left ? `se borra en ${left} ${left === 1 ? 'día' : 'días'}` : 'se borra hoy'}</small>
                    ${kind === 'notes' ? `<small class="trash-preview">${esc(String(item.content || '').slice(0, 90))}</small>` : ''}
                </span>
                <span class="trash-actions">
                    <button class="btn btn-secondary btn-sm" data-act="trash-restore" data-id="${kind}:${esc(item.id)}">↩️ Restaurar</button>
                    <button class="icon-btn sm" data-act="trash-purge" data-id="${kind}:${esc(item.id)}" title="Eliminar para siempre" aria-label="Eliminar para siempre">✕</button>
                </span>
            </div>`;
        }).join('')}</div>`;
    }).join('') + `<button class="btn btn-danger btn-sm btn-block" data-act="trash-empty" style="margin-top:12px">🧹 Vaciar papelera</button>`;
}
function splitTrashId(key) {
    const i = key.indexOf(':');
    return [key.slice(0, i), key.slice(i + 1)];
}
function restoreFromTrash(key) {
    const [kind, id] = splitTrashId(key);
    const item = (appData.trash[kind] || []).find(x => x.id === id);
    if (!item) return;
    const name = TRASH_KIND[kind][1](item);
    mutate(() => { restoreRecord(appData, kind, id); }, `↩️ Restaurada: ${name}`, { label: `Restaurar ${name}` });
}
function purgeFromTrash(key) {
    const [kind, id] = splitTrashId(key);
    const item = (appData.trash[kind] || []).find(x => x.id === id);
    if (!item) return;
    const name = TRASH_KIND[kind][1](item);
    if (!confirm(`¿Eliminar para siempre “${name}”? Ya no se podrá recuperar.`)) return;
    mutate(() => { purgeRecord(appData, kind, id); }, `✕ Eliminada para siempre: ${name}`, { label: `Eliminar para siempre ${name}` });
}
function emptyTrash() {
    const n = trashCount(appData);
    if (!n) return;
    if (!confirm(`¿Vaciar la papelera? Se eliminarán para siempre ${n} ${n === 1 ? 'elemento' : 'elementos'}.`)) return;
    if (!confirm('¿Seguro del todo? No se podrá deshacer.')) return;
    mutate(() => { RECORD_KINDS.forEach(k => { appData.trash[k] = []; }); }, '🧹 Papelera vaciada', { undo: false });
    whenSaved().then(() => store.collectGarbage(appData)).then(updateStorageMeter).catch(() => {});
}
function openTrash() {
    navigateTo('settings');
    const panel = $('trashPanel');
    panel.scrollIntoView({ block: 'start', behavior: 'smooth' });
    panel.classList.add('flash');
    setTimeout(() => panel.classList.remove('flash'), 1200);
}

async function updateStorageMeter() {
    if (!store) return;
    const info = await store.estimate();
    const usage = info.usage || 0, quota = info.quota || 0;
    const pct = quota ? Math.min(100, usage / quota * 100) : 0;
    $('storageUsed').textContent = `${formatBytes(usage)} usados${pct >= 1 ? ` (${pct.toFixed(0)}%)` : ''}`;
    $('storageQuota').textContent = quota ? `de ${store.kind === 'indexeddb' ? '' : '≈'}${formatBytes(quota)}` : '';
    $('storageMeter').firstElementChild.style.width = Math.max(pct, usage ? 1 : 0) + '%';
    $('storageMeter').classList.toggle('warn', pct > 75);
    $('storageBackend').textContent = store.kind === 'indexeddb'
        ? `Guardado en IndexedDB · ${info.imageCount} ${info.imageCount === 1 ? 'imagen' : 'imágenes'} (${formatBytes(info.images)})`
        : 'Guardado en localStorage (tu navegador no admite IndexedDB): límite de unos 5 MB.';
}
async function exportData() {
    await whenSaved();
    const data = await embedImages(appData, store);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `mi-mundo-backup-${todayISO()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    showToast('📤 Copia de seguridad descargada (incluye las imágenes)');
}
function importData(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
        let parsed;
        try { parsed = JSON.parse(reader.result); } catch (e) { showToast('❌ El archivo no es un JSON válido', 'error'); return; }
        if (!parsed || !Array.isArray(parsed.works)) { showToast('❌ El archivo no parece una copia de Mi Mundo', 'error'); return; }
        if (!confirm(`Se importarán ${parsed.works.length} obras y se reemplazarán tus datos actuales. ¿Continuar?`)) return;
        const data = normalizeData(parsed);
        try { await externalizeImages(data, store); }
        catch (e) { console.error(e); showToast('❌ No se pudieron guardar las imágenes de la copia', 'error'); return; }
        mutate(() => { appData = data; }, '📥 Datos importados correctamente', { undo: false });
        undoStack = []; redoStack = [];
        applySettings();
        renderSettings();
        await whenSaved();
        store.collectGarbage(appData).then(updateStorageMeter).catch(() => {});
    };
    reader.readAsText(file);
}
async function wipeData() {
    const inCloud = cloud.state === 'signedIn' ? '\n\nTambién se borrarán de la nube y de tus otros dispositivos.' : '';
    if (!confirm('¿Borrar TODOS tus datos? Esta acción no se puede deshacer.\n\nConsejo: exporta una copia antes.' + inCloud)) return;
    if (!confirm('¿Seguro del todo?')) return;
    const settings = appData.settings;
    mutate(() => { appData = emptyData(); appData.settings = settings; }, '🗑️ Datos borrados', { undo: false });
    undoStack = []; redoStack = [];
    await whenSaved();
    store.collectGarbage(appData).then(updateStorageMeter).catch(() => {});
}

// ============================================================
// 21. TOAST
// ============================================================
/** Aviso breve. action = { label, run } añade un botón (p. ej. "Deshacer"). */
function showToast(msg, type = 'info', ms = 2800, action = null) {
    const stack = $('toastStack');
    while (stack.children.length >= 3) stack.firstElementChild.remove();
    const el = document.createElement('div');
    el.className = 'toast toast-' + type;
    const text = document.createElement('span');
    text.textContent = msg;
    el.appendChild(text);
    const hide = () => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); };
    if (action) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'toast-action';
        btn.textContent = action.label;
        btn.addEventListener('click', () => { hide(); action.run(); });
        el.appendChild(btn);
    }
    stack.appendChild(el);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('show')));
    setTimeout(hide, ms);
}

// ============================================================
// 22. EVENTOS
// ============================================================
function handleAction(act, id, el) {
    switch (act) {
        case 'edit': { const w = getWorkById(id); if (w && !isLocked(w)) openWorkModal(null, w); break; }
        case 'lock': toggleLock(id); break;
        case 'duplicate': openDuplicate(id); break;
        case 'duplicate-as': duplicateAs(id, el.dataset.type); break;
        case 'person-duplicate': duplicatePersonById(id); break;
        case 'version-restore': restoreVersion(id, Number(el.dataset.version)); break;
        case 'draft-restore': restoreDraft(); break;
        case 'draft-discard': clearDraft(); $('workDraftBar').hidden = true; break;
        case 'history': openHistory(); break;
        case 'undo-until': { const e = undoStack.find(x => x.id === id); if (e) undoUntil(e); break; }
        case 'redo': redo(); break;
        case 'trash-restore': restoreFromTrash(id); break;
        case 'trash-purge': purgeFromTrash(id); break;
        case 'trash-empty': emptyTrash(); break;
        case 'delete': deleteWork(id); break;
        case 'progress': changeProgress(id, 1); break;
        case 'progress-minus': changeProgress(id, -1); break;
        case 'fav': toggleFavorite(id); break;
        case 'collect': openCollectionPicker(id); break;
        case 'note-save': saveNote(id); break;
        case 'coll-new': pendingCollectWorkId = null; openCollectionModal(); break;
        case 'coll-new-with': pendingCollectWorkId = id; closeModal('sheetModal'); openCollectionModal(); break;
        case 'coll-open': openCollectionView(id); break;
        case 'coll-edit': openCollectionModal(getCollectionById(id)); break;
        case 'coll-delete': deleteCollection(id); break;
        case 'coll-remove': {
            const c = getCollectionById(id);
            if (c) mutate(() => { c.items = c.items.filter(i => i !== el.dataset.item); }, '➖ Quitada de la colección');
            break;
        }
        case 'person-new': openPersonModal(); break;
        case 'person-edit': openPersonModal(getPersonById(id)); break;
        case 'person-delete': deletePerson(id); break;
        case 'couple-new': openCoupleModal(); break;
        case 'couple-fav': { const c = getCoupleById(id); if (c) mutate(() => { c.favorite = !c.favorite; }, c.favorite ? '🤍 Quitada de favoritas' : '❤️ Pareja favorita'); break; }
        case 'couple-delete': deleteCouple(id); break;
        case 'mylist': toggleMyList(id); break;
        case 'notifications': openNotifications(); break;
        case 'pick': openPicker(); break;
        case 'pick-type': pickType = id; pickExclude = []; pickCurrent = pickForToday(appData.works, { type: pickType }); sheetRefresh && sheetRefresh(); break;
        case 'pick-again': {
            if (pickCurrent) pickExclude.push(pickCurrent.id);
            pickCurrent = pickForToday(appData.works, { type: pickType, exclude: pickExclude });
            if (!pickCurrent) { pickExclude = []; pickCurrent = pickForToday(appData.works, { type: pickType }); }
            if (sheetRefresh) sheetRefresh();
            break;
        }
        case 'pick-start': {
            const w = getWorkById(id);
            if (!w) break;
            closeModal('sheetModal');
            mutate(() => {
                w.status = STATUS_BY_TYPE[w.type][0];
                if (!w.startDate) w.startDate = todayISO();
                bumpActivity(w);
            }, `▶️ ¡A por “${w.title}”!`);
            openDetail(id);
            break;
        }
        case 'goal-edit': goalEditing = true; renderStats(); setTimeout(() => $('goalInput') && $('goalInput').focus(), 0); break;
        case 'goal-save': {
            const v = Math.round(Number($('goalInput').value));
            if (!(v >= 1 && v <= 1000)) { showToast('⚠️ Escribe un número entre 1 y 1000', 'error'); break; }
            goalEditing = false;
            updateSetting('yearGoal', v, `🎯 Reto de ${v} obras fijado`);
            renderStats();
            break;
        }
        case 'mood': openMoodCell(id); break;
        default: if (FEATURE_ACTIONS[act]) FEATURE_ACTIONS[act](id, el);
    }
}

document.addEventListener('click', e => {
    const t = e.target;
    // Cerrar search al hacer clic fuera
    if (!t.closest('#globalSearchBox')) $('globalSearchResults').classList.remove('active');

    // Modo selección: tocar una tarjeta la marca en vez de abrirla
    if (selecting) {
        const card = t.closest('.page-view .work-item[data-id]');
        if (card && !t.closest('[data-act="table-sort"]')) { e.preventDefault(); toggleSelected(card.dataset.id); return; }
    }
    const result = t.closest('[data-result]');
    if (result) { openSearchResult(Number(result.dataset.result)); return; }
    const closeBtn = t.closest('[data-close]');
    if (closeBtn) { closeModal(closeBtn.closest('.modal-overlay').id); return; }
    if (t.closest('[data-detail-close]')) { closeDetail(); return; }
    const add = t.closest('[data-add]');
    if (add) { openWorkModal(add.dataset.add, null, add.dataset.bl ? { bl: true } : {}); return; }
    const paletteItem = t.closest('[data-palette-item]');
    if (paletteItem) { runPaletteItem(Number(paletteItem.dataset.paletteItem)); return; }
    if (t.closest('[data-palette]')) { openPalette(); return; }
    const tableToggle = t.closest('[data-table-toggle]');
    if (tableToggle) {
        const card = tableToggle.closest('.viz-card');
        const on = card.classList.toggle('show-table');
        tableToggle.classList.toggle('is-on', on);
        tableToggle.textContent = on ? 'Ver gráfico' : 'Ver tabla';
        return;
    }
    const star = t.closest('[data-act="rate"]');
    if (star) {
        e.preventDefault();
        const n = Number(star.dataset.star);
        const rect = star.getBoundingClientRect();
        // Clic en la mitad izquierda de la estrella = media estrella (con teclado, estrella entera)
        const half = e.detail > 0 && e.clientX - rect.left < rect.width / 2;
        setRating(star.dataset.id, half ? n - 0.5 : n);
        return;
    }
    const act = t.closest('[data-act]');
    if (act) {
        e.preventDefault();
        const holder = act.dataset.id ? act : act.closest('[data-id]');
        handleAction(act.dataset.act, holder ? holder.dataset.id : null, act);
        return;
    }
    const nav = t.closest('[data-nav]');
    if (nav) { navigateTo(nav.dataset.nav); return; }
    const open = t.closest('[data-open]');
    if (open) {
        if (open.closest('#workModal') && !closeModal('workModal')) return;
        if (open.closest('#sheetModal')) closeModal('sheetModal');
        if (open.closest('#personDetailOverlay')) closeModal('personDetailOverlay');
        openDetail(open.dataset.open);
        return;
    }
    const person = t.closest('[data-person]');
    if (person) { if (currentDetailId && person.closest('#detailPanel')) closeDetail(); openPersonDetail(person.dataset.person); return; }
    const couple = t.closest('[data-couple]');
    if (couple) { if (currentDetailId && couple.closest('#detailPanel')) closeDetail(); if (couple.closest('#personDetailOverlay')) closeModal('personDetailOverlay'); openCoupleDetail(couple.dataset.couple); return; }
    const coll = t.closest('[data-coll]');
    if (coll) { openCollectionView(coll.dataset.coll); return; }
    const scroll = t.closest('[data-scroll]');
    if (scroll) {
        const row = scroll.parentElement.querySelector('.card-row');
        row.scrollBy({ left: Number(scroll.dataset.scroll) * row.clientWidth * 0.8, behavior: 'smooth' });
        return;
    }
    const toggle = t.closest('[data-toggle-filters]');
    if (toggle) {
        const bar = $(toggle.dataset.toggleFilters);
        bar.classList.toggle('is-collapsed');
        toggle.classList.toggle('is-on', !bar.classList.contains('is-collapsed'));
        return;
    }
    const upload = t.closest('[data-upload]');
    if (upload) { $(upload.dataset.upload).click(); return; }
    const typeBtn = t.closest('#workTypeTabs .seg-btn');
    if (typeBtn && !typeBtn.disabled) { setFormType(typeBtn.dataset.type); return; }
    const seriesTabBtn = t.closest('#seriesTabs .tab');
    if (seriesTabBtn) { seriesTab = seriesTabBtn.dataset.filter; renderSeries(); return; }
    const personTabBtn = t.closest('#personTabs .tab');
    if (personTabBtn) { personTab = personTabBtn.dataset.tab; renderPersons(); return; }
    const coupleTabBtn = t.closest('#coupleTabs .tab');
    if (coupleTabBtn) { coupleFilter = coupleTabBtn.dataset.filter; renderCouples(); return; }
    const color = t.closest('[data-color]');
    if (color) { updateSetting(isDarkNow() ? 'themeColor' : 'themeColorLight', color.dataset.color, '🎨 Color actualizado'); return; }
    const fit = t.closest('[data-fit]');
    if (fit) { updateSetting('imageFit', fit.dataset.fit, '🖼️ Ajuste de imagen actualizado'); return; }
});

// Cerrar modales al pulsar el fondo
document.querySelectorAll('.modal-overlay').forEach(ov => {
    ov.addEventListener('mousedown', e => { if (e.target === ov) closeModal(ov.id); });
});
$('detailOverlay').addEventListener('click', closeDetail);

// Inputs y filtros
document.addEventListener('input', e => {
    const t = e.target;
    if (t.id === 'paletteInput') { renderPalette(); return; }
    if (onImportInput(t)) return;
    if (t.id === 'collectionQuery' || t.id === 'collectionSmart') updateSmartPreview();
    if (t.id === 'queryTry') { updateQueryTry(); return; }
    if (t.id === 'galleryInput') { onGalleryUploaded(t); return; }
    if (t.dataset.notify && t.type !== 'checkbox' && t.tagName !== 'SELECT') return; // la hora se guarda al terminar de elegirla
    if (onPersonalizeInput(t, 'input')) return;
    if (t.id === 'settingTmdbKey') { appData.settings.tmdbKey = t.value.trim(); saveData(); return; }
    if (t.closest && t.closest('#workForm')) {
        if (t.dataset.sfield) toggleAggregateInputs();
        saveDraft();
        if (t.id === 'f_title') updateTitleHint();
        if (t.id === 'f_tags') updateTagsHint();
    }
    if (t.id === 'tagSearch') {
        tagFilter = t.value;
        const caret = t.selectionStart;
        sheetRefresh();
        $('tagSearch').focus();
        $('tagSearch').setSelectionRange(caret, caret);
    }
    if (t.id === 'coupleWorksSearch') renderCoupleWorksPicker();
    if (t.dataset.render && RENDERERS[t.dataset.render]) RENDERERS[t.dataset.render]();
    if (t.type === 'range' && t.dataset.out) updateRangeOutputs(t.closest('.modal, .panel-card') || document);
    if (t.id === 'pdSearch') renderPersonDetail();
    if (t.id === 'globalSearch') runGlobalSearch();
    if (t.id === 'settingName') { appData.settings.userName = t.value.trim() || 'Sara'; saveData(); renderSidebar(); }
    if (t.id === 'fontSizeSlider') { $('fontSizeValue').textContent = t.value + 'px'; appData.settings.fontSize = Number(t.value); applySettings(); }
});
document.addEventListener('change', e => {
    const t = e.target;
    if (t.type === 'file' && t.dataset.target) handleImageUpload(t);
    if (t.id === 'importFileInput') { importData(t.files[0]); t.value = ''; }
    if (t.id === 'pdType') renderPersonDetail();
    if (t.id === 'fontSizeSlider') saveData();
    if (onPersonalizeInput(t, 'change')) return;
    if (onNotifyInput(t)) return;
    if (t.id === 'settingLang') { appData.settings.lang = t.value; saveData(); applySettings(); renderSettings(); return; }
    if (t.id === 'diaryDate') { diaryDate = t.value && t.value <= todayISO() ? t.value : todayISO(); renderExtras(); return; }
    if (t.dataset.collSort) { onCollectionSort(t); return; }
    if (t.id === 'f_multi') onMultiSeasonToggle();
    if (t.id === 'wrappedYear') { openWrapped(Number(t.value)); return; }
    if (t.id === 'importAnyFile') { readImportFile(t.files[0]); t.value = ''; }
    if (t.id === 'bulkStatus') { onBulkStatus(t); t.value = ''; }
    if (t.dataset.field === 'airDay' || t.id === 'f_status') updateAirDayHint();
    if (t.closest && t.closest('#workForm')) saveDraft();
    if (t.dataset.tagColor) onTagColorChange(t);
    if (t.id === 'coupleA' || t.id === 'coupleB') renderCoupleWorksPicker();
    if (t.dataset.coupleWork) {
        if (t.checked) coupleWorkPick.add(t.dataset.coupleWork); else coupleWorkPick.delete(t.dataset.coupleWork);
        renderCoupleWorksPicker();
    }
    if (t.name === 'noteType' && $('reviewCriteria')) $('reviewCriteria').hidden = t.value !== 'resena';
    if (t.dataset.pickColl) {
        const c = getCollectionById(t.dataset.pickColl), wid = t.dataset.work;
        if (!c) return;
        mutate(() => {
            if (t.checked && !c.items.includes(wid)) c.items.push(wid);
            if (!t.checked) c.items = c.items.filter(i => i !== wid);
        }, t.checked ? `✅ Añadida a “${c.name}”` : `➖ Quitada de “${c.name}”`);
    }
});

// Teclado
document.addEventListener('keydown', e => {
    if (onWrappedKey(e) || onPresentKey(e)) { e.preventDefault(); return; }
    if (tourStep >= 0 && e.key === 'Escape') { FEATURE_ACTIONS['tour-end'](); return; }
    if (e.target.id !== 'paletteInput' && handleShortcut(e)) { e.preventDefault(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if ($('paletteModal').classList.contains('active')) closeModal('paletteModal'); else openPalette();
        return;
    }
    if (e.target.id === 'paletteInput') {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); movePalette(e.key === 'ArrowDown' ? 1 : -1); return; }
        if (e.key === 'Enter') { e.preventDefault(); runPaletteItem(paletteIndex); return; }
    }
    if (e.target.id === 'globalSearch' && $('globalSearchResults').classList.contains('active')) {
        const items = [...document.querySelectorAll('.search-result')];
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            searchIndex = (searchIndex + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
            items.forEach((it, i) => it.classList.toggle('is-active', i === searchIndex));
            items[searchIndex] && items[searchIndex].scrollIntoView({ block: 'nearest' });
            return;
        }
        if (e.key === 'Enter') { e.preventDefault(); openSearchResult(searchIndex >= 0 ? searchIndex : 0); return; }
    }
    const typing = e.target.closest && e.target.closest('input, textarea, select, [contenteditable="true"]');
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !typing) {
        const k = e.key.toLowerCase();
        if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
        if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); redo(); return; }
    }
    if (e.key === 'Escape') {
        const m = topOpenModal();
        if (m) { closeModal(m.id); return; }
        if (currentDetailId) { closeDetail(); return; }
        if (selecting) { setSelecting(false); return; }
        $('globalSearchResults').classList.remove('active');
        return;
    }
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-open], [data-person], [data-couple], [data-coll]') && e.target.tagName !== 'BUTTON') {
        e.preventDefault();
        e.target.click();
    }
    if (e.key === 'Enter' && e.target.closest('#workForm') && e.target.tagName === 'INPUT') { e.preventDefault(); saveWork(); }
    if (e.key === 'Enter' && e.target.closest('.quick-form') && e.target.tagName === 'INPUT') { e.preventDefault(); quickAdd(); }
    if (e.key === 'Enter' && e.target.id === 'queryTry' && e.target.value.trim()) { e.preventDefault(); showQueryResults(e.target.value.trim()); }
    if (e.key === 'Enter' && e.target.id === 'collectionQuery') { e.preventDefault(); saveCollection(); }
});

// Botones con id
$('workSaveBtn').addEventListener('click', saveWork);
$('personSaveBtn').addEventListener('click', savePerson);
$('coupleSaveBtn').addEventListener('click', saveCouple);
$('collectionSaveBtn').addEventListener('click', saveCollection);
$('addPersonBtn').addEventListener('click', () => openPersonModal());
$('addCoupleBtn').addEventListener('click', () => openCoupleModal());
$('addCollectionBtn').addEventListener('click', () => { pendingCollectWorkId = null; openCollectionModal(); });
$('themeToggle').addEventListener('click', () => { const dark = isDarkNow(); appData.settings.themeAuto = false; updateSetting('darkMode', !dark, dark ? '☀️ Modo claro' : '🌙 Modo oscuro'); });
$('resetSettingsBtn').addEventListener('click', () => {
    const name = appData.settings.userName;
    appData.settings = { ...DEFAULT_SETTINGS, userName: name };
    applySettings();
    saveData();
    renderSettings();
    showToast('↺ Apariencia restaurada');
});
$('exportBtn').addEventListener('click', exportData);
$('importBtn').addEventListener('click', () => $('importFileInput').click());
$('wipeBtn').addEventListener('click', wipeData);
$('optimizeImagesBtn').addEventListener('click', optimizeStoredImages);
$('globalSearch').addEventListener('focus', () => { if ($('globalSearch').value.trim().length >= 2) runGlobalSearch(); });
window.addEventListener('hashchange', () => { if (!showSharedCollection(location.hash)) navigateTo(location.hash.slice(1), { push: false }); });
// Sincroniza si la app está abierta en otra pestaña
async function reloadFromStore() {
    if (savePending) return; // hay cambios propios sin guardar: no los pisamos
    try {
        const data = await store.load();
        if (data) { appData = normalizeData(data); applySettings(); refreshView(); }
    } catch (err) { console.warn('No se pudo sincronizar con otra pestaña', err); }
}
if (syncChannel) syncChannel.onmessage = e => { if (e.data && e.data.type === 'saved') reloadFromStore(); };
window.addEventListener('storage', e => {
    if (store && store.kind === 'localstorage' && e.key === LEGACY_KEY && e.newValue) reloadFromStore();
});
// Actualiza saludo/fecha cada minuto y limpia la papelera cada hora
setInterval(() => { if (currentPage === 'home') renderHome(); }, 60000);
setInterval(() => { if (purgeExpiredTrash(appData)) { saveData(); refreshView(); } }, 3600000);
// Avisos programados: se comprueban cada minuto y al volver a la app
setInterval(() => checkNotifications().catch(() => {}), 60000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkNotifications().catch(() => {}); });

// Tooltip de los gráficos: el valor destaca y la etiqueta acompaña (con textContent, nunca HTML).
const vizTip = $('vizTip');
function showTip(el, x, y) {
    vizTip.querySelector('b').textContent = el.dataset.tipValue;
    vizTip.querySelector('span').textContent = el.dataset.tipLabel || '';
    vizTip.classList.add('show');
    const r = vizTip.getBoundingClientRect();
    const left = Math.min(window.innerWidth - r.width - 8, Math.max(8, x - r.width / 2));
    const top = y - r.height - 12 < 8 ? y + 18 : y - r.height - 12;
    vizTip.style.left = left + 'px';
    vizTip.style.top = top + 'px';
}
document.addEventListener('pointermove', e => {
    const el = e.target.closest && e.target.closest('[data-tip-value]');
    if (el) showTip(el, e.clientX, e.clientY);
    else vizTip.classList.remove('show');
});
document.addEventListener('focusin', e => {
    const el = e.target.closest && e.target.closest('[data-tip-value]');
    if (!el) return;
    const r = el.getBoundingClientRect();
    showTip(el, r.left + r.width / 2, r.top);
});
document.addEventListener('focusout', () => vizTip.classList.remove('show'));
document.addEventListener('scroll', () => {
    const el = document.activeElement;
    if (el && el.dataset && el.dataset.tipValue !== undefined) {
        const r = el.getBoundingClientRect();
        showTip(el, r.left + r.width / 2, r.top);
    } else vizTip.classList.remove('show');
}, true);

// Si una imagen falla, se cambia por su ilustración de relleno (sin handlers en línea).
document.addEventListener('error', e => {
    const t = e.target;
    if (t.tagName === 'IMG' && t.dataset.ph && !t.dataset.failed) {
        t.dataset.failed = '1';
        t.src = PH[t.dataset.ph];
    }
}, true);

// ============================================================
// 23. APP INSTALABLE (PWA)
// ============================================================
const isWebOrigin = location.protocol === 'http:' || location.protocol === 'https:';
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
let deferredInstallPrompt = null;

function renderInstallState() {
    const btn = $('installAppBtn'), status = $('installStatus');
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    btn.hidden = !deferredInstallPrompt;
    if (isStandalone()) status.textContent = '✅ Estás usando Mi Mundo como app instalada.';
    else if (!isWebOrigin) status.textContent = 'Para instalarla, abre Mi Mundo desde su dirección web (no como archivo local).';
    else if (deferredInstallPrompt) status.textContent = 'Instala Mi Mundo para abrirla como una app, incluso sin conexión.';
    else if (isIOS) status.textContent = 'En iPhone o iPad: pulsa Compartir ⬆️ y luego “Añadir a pantalla de inicio”.';
    else status.textContent = 'Si tu navegador lo permite, usa “Instalar app” en su menú. Ya funciona sin conexión.';
}
async function installApp() {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    const { outcome } = await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    renderInstallState();
    if (outcome === 'accepted') showToast('📲 Instalando Mi Mundo…');
}
async function renderPersistState() {
    const el = $('persistStatus');
    if (!navigator.storage || !navigator.storage.persisted) { el.textContent = ''; return; }
    const persisted = await navigator.storage.persisted();
    el.textContent = persisted
        ? '🔒 Almacenamiento protegido: el navegador no borrará tus datos para liberar espacio.'
        : 'ℹ️ El navegador podría borrar los datos si se queda sin espacio. Instalar la app ayuda a protegerlos; exporta copias de vez en cuando.';
}
function updateOnlineState(notify) {
    $('offlinePill').hidden = navigator.onLine;
    if (notify && navigator.onLine) showToast('📶 Conexión recuperada');
}

window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredInstallPrompt = e;
    renderInstallState();
});
window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    renderInstallState();
    showToast('✅ Mi Mundo está instalada');
});
window.addEventListener('online', () => updateOnlineState(true));
window.addEventListener('offline', () => updateOnlineState(false));
$('installAppBtn').addEventListener('click', installApp);

if (isWebOrigin && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(err => console.warn('No se pudo registrar el service worker', err));
    });
    // Pide al navegador que no borre los datos (se concede sin preguntar si la app está instalada)
    if (navigator.storage && navigator.storage.persist && isStandalone()) {
        navigator.storage.persist().then(renderPersistState).catch(() => {});
    }
}

// ============================================================
// 24. INICIO
// ============================================================
(async function init() {
    try {
        await loadData();
    } catch (e) {
        console.error('No se pudieron cargar los datos', e);
        showToast('❌ No se pudieron cargar tus datos. Prueba a recargar la página.', 'error', 8000);
    }
    applySettings();
    if (window.innerWidth <= 760) {
        document.querySelectorAll('[data-toggle-filters]').forEach(btn => {
            $(btn.dataset.toggleFilters).classList.add('is-collapsed');
            btn.classList.remove('is-on');
        });
    }
    if (purgeExpiredTrash(appData)) saveData(); // lo que lleva más de 30 días en la papelera se borra solo
    renderSidebar();
    renderInstallState();
    renderPersistState();
    updateOnlineState(false);
    const sharedHash = location.hash.startsWith('#compartido=') ? location.hash : '';
    navigateTo(sharedHash ? 'home' : (location.hash.slice(1) || 'home'), { push: false });
    if (sharedHash) showSharedCollection(sharedHash);
    // Acceso directo “Agregar obra” del icono de la app
    const startParams = new URLSearchParams(location.search);
    if (startParams.get('accion') === 'agregar') {
        history.replaceState(null, '', location.pathname + location.hash);
        // Desde el marcador "➕ Mi Mundo" llegan el título, la portada y el enlace
        const clip = presetFromParams(startParams);
        openWorkModal(clip.type, null, clip.preset);
    } else if (startParams.get('obra') && getWorkById(startParams.get('obra'))) {
        // Abierta desde un aviso
        history.replaceState(null, '', location.pathname + location.hash);
        openDetail(startParams.get('obra'));
    } else offerSessionRecovery();
    $('scanIsbnBtn').hidden = !canScan();
    document.documentElement.dataset.ready = 'true';
    setTimeout(() => { const sp = $('splash'); if (sp) sp.remove(); }, 450);
    cloud.init();
    checkNotifications().catch(() => {});
    if ((appData.settings.notify || {}).enabled) registerBackgroundCheck();
    if (navigator.serviceWorker) navigator.serviceWorker.addEventListener('message', e => { if (e.data && e.data.type === 'open-work' && getWorkById(e.data.id)) openDetail(e.data.id); });
})();
