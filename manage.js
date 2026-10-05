/*
 * Mi Mundo · manage.js
 * Colecciones inteligentes (se llenan solas con una búsqueda), orden y compartir colecciones,
 * vistas guardadas por sección, ayuda de la búsqueda avanzada y obras parecidas.
 * Se carga antes que app.js.
 */
'use strict';

// ============================================================
// 1. COLECCIONES: INTELIGENTES, ORDEN Y COMPARTIR
// ============================================================
const isSmart = c => !!(c && c.smart && c.query);
/** Obras de una colección, en su orden (las inteligentes se calculan con su búsqueda). */
function collectionWorks(c) {
    if (!c) return [];
    let list = isSmart(c) ? searchWorks(appData.works, c.query) : c.items.map(getWorkById).filter(Boolean);
    const sort = c.sort || (isSmart(c) ? 'rating' : 'manual');
    if (sort !== 'manual') list = sortWorks(list, sort);
    return list;
}
function collectionHas(c, id) { return isSmart(c) ? collectionWorks(c).some(w => w.id === id) : c.items.includes(id); }
const manualCollections = () => appData.collections.filter(c => !isSmart(c));

function updateSmartPreview() {
    const on = $('collectionSmart').checked;
    $('collectionSmartBox').hidden = !on;
    if (!on) return;
    const q = $('collectionQuery').value.trim();
    const n = q ? searchWorks(appData.works, q).length : 0;
    $('collectionQueryHint').textContent = q ? `${describeQuery(q)} · ${n} ${n === 1 ? 'obra' : 'obras'} ahora mismo` : 'Escribe una búsqueda, por ejemplo: BL nota:>=4';
}
FEATURE_ACTIONS['smart-example'] = (q) => { $('collectionSmart').checked = true; $('collectionQuery').value = q; updateSmartPreview(); };

const COLL_SORTS = [['manual', 'Mi orden'], ['rating', 'Valoración'], ['title', 'Título'], ['recent', 'Recientes'], ['progress', 'Progreso'], ['year', 'Año']];
function collectionViewHtml(c) {
    const works = collectionWorks(c);
    const sort = c.sort || (isSmart(c) ? 'rating' : 'manual');
    const head = `<div class="coll-toolbar">
        ${isSmart(c) ? `<span class="chip">✨ Inteligente: ${esc(c.query)}</span>` : ''}
        <select class="filter-select" data-coll-sort="${c.id}" aria-label="Ordenar">${COLL_SORTS.filter(([k]) => k !== 'manual' || !isSmart(c)).map(([k, l]) => `<option value="${k}" ${sort === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <span class="spacer"></span>
        <button class="btn btn-secondary btn-sm" data-act="present-coll" data-id="${c.id}">▶️ Presentar</button>
        <button class="btn btn-secondary btn-sm" data-act="coll-share" data-id="${c.id}">📤 Compartir</button>
    </div>`;
    const first = works.find(w => w.image);
    const hero = `<div class="coll-hero ${c.banner ? 'has-banner' : ''}">${bannerBgHtml(c.banner, first && first.image)}
        <div class="coll-hero-text"><h3>${isSmart(c) ? '✨ ' : ''}${esc(c.name)}</h3><p>${works.length} ${works.length === 1 ? 'obra' : 'obras'}${c.description ? ' · ' + esc(c.description) : ''}</p></div>
        <button class="icon-btn sm detail-banner-btn" data-act="banner-quick" data-kind="collections" data-id="${c.id}" title="${c.banner ? 'Cambiar banner' : 'Poner un banner'}" aria-label="${c.banner ? 'Cambiar banner' : 'Poner un banner'}">🖼️</button></div>`;
    if (!works.length) return hero + head + emptyState(isSmart(c) ? '✨' : '📭', isSmart(c) ? 'Ninguna obra cumple la búsqueda' : 'Colección vacía', isSmart(c) ? 'Cuando alguna obra la cumpla, aparecerá aquí sola.' : 'Abre cualquier obra y pulsa “📂 Colecciones” para añadirla aquí.');
    const manual = sort === 'manual' && !isSmart(c);
    return hero + head + `<div class="pick-list">${works.map((w, i) => `
        <div class="pick-item" ${manual ? `draggable="true" data-coll-item="${w.id}"` : ''}>
          ${manual ? '<span class="drag-handle" aria-hidden="true">⠿</span>' : ''}
          <div class="thumb">${img(w.image, w.type, w.title)}</div>
          <button class="info" style="text-align:left" data-open="${w.id}"><b>${esc(w.title)}</b><small>${TYPE_META[w.type].icon} ${esc(getTypeLabel(w.type))} · ${esc(getStatusLabel(w.status))}${w.rating ? ' · ★ ' + ratingText(w.rating) : ''}</small></button>
          ${manual ? `<button class="icon-btn sm" data-act="coll-move" data-id="${c.id}" data-item="${w.id}" data-dir="-1" aria-label="Subir" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button class="icon-btn sm" data-act="coll-move" data-id="${c.id}" data-item="${w.id}" data-dir="1" aria-label="Bajar" ${i === works.length - 1 ? 'disabled' : ''}>↓</button>` : ''}
          ${isSmart(c) ? '' : `<button class="icon-btn sm" data-act="coll-remove" data-id="${c.id}" data-item="${w.id}" title="Quitar de la colección" aria-label="Quitar">✕</button>`}
        </div>`).join('')}</div>`;
}
FEATURE_ACTIONS['coll-move'] = (id, el) => {
    const c = getCollectionById(id);
    if (!c) return;
    const i = c.items.indexOf(el.dataset.item), j = i + Number(el.dataset.dir);
    if (i < 0 || j < 0 || j >= c.items.length) return;
    mutate(() => { const items = c.items.slice(); [items[i], items[j]] = [items[j], items[i]]; c.items = items; }, null, { label: `Ordenar “${c.name}”` });
};
function onCollectionSort(select) {
    const c = getCollectionById(select.dataset.collSort);
    if (!c) return;
    // Al pasar de un orden automático a "Mi orden", se guarda el orden que se estaba viendo
    mutate(() => { if (select.value === 'manual' && !isSmart(c)) c.items = collectionWorks(c).map(w => w.id); c.sort = select.value; }, null, { label: `Orden de “${c.name}”` });
}
// Arrastrar obras dentro de una colección
let dragColl = null;
document.addEventListener('dragstart', e => { const it = e.target.closest && e.target.closest('[data-coll-item]'); if (it) { dragColl = it.dataset.collItem; it.classList.add('dragging'); } });
document.addEventListener('dragend', e => { const it = e.target.closest && e.target.closest('[data-coll-item]'); if (it) it.classList.remove('dragging'); });
document.addEventListener('dragover', e => { if (dragColl && e.target.closest && e.target.closest('[data-coll-item]')) e.preventDefault(); });
document.addEventListener('drop', e => {
    const it = e.target.closest && e.target.closest('[data-coll-item]');
    const sel = document.querySelector('[data-coll-sort]');
    if (!dragColl || !it || !sel) return;
    e.preventDefault();
    const c = getCollectionById(sel.dataset.collSort);
    const from = dragColl, to = it.dataset.collItem;
    dragColl = null;
    if (!c || from === to) return;
    mutate(() => {
        const items = c.items.filter(x => x !== from);
        items.splice(items.indexOf(to) + (c.items.indexOf(from) < c.items.indexOf(to) ? 1 : 0), 0, from);
        c.items = items;
    }, null, { label: `Ordenar “${c.name}”` });
});

// ---------- Compartir una colección ----------
const SHARE_PREFIX = '#compartido=';
function b64encode(str) { return btoa(String.fromCharCode(...new TextEncoder().encode(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function b64decode(str) { const s = atob(str.replace(/-/g, '+').replace(/_/g, '/')); return new TextDecoder().decode(Uint8Array.from(s, ch => ch.charCodeAt(0))); }
/** Enlace con la lista dentro (no se sube a ningún servidor). Caduca en los días elegidos. */
function collectionShareLink(c, days) {
    const payload = {
        v: 1, n: c.name, d: c.description || '', by: appData.settings.userName || '', exp: days ? Date.now() + days * 86400000 : 0,
        w: collectionWorks(c).slice(0, 150).map(w => [w.title, w.type, Number(w.rating) || 0, /^https?:/.test(w.image || '') ? w.image : '', w.year || ''])
    };
    const base = location.protocol.startsWith('http') ? location.origin + location.pathname : 'https://evelingyiraish2008-arch.github.io/y/';
    return base + SHARE_PREFIX + b64encode(JSON.stringify(payload));
}
function parseSharedCollection(hash, now = Date.now()) {
    if (!String(hash).startsWith(SHARE_PREFIX)) return null;
    try {
        const p = JSON.parse(b64decode(String(hash).slice(SHARE_PREFIX.length)));
        return { ...p, expired: !!(p.exp && now > p.exp) };
    } catch (e) { return { error: true }; }
}
FEATURE_ACTIONS['coll-share'] = id => {
    const c = getCollectionById(id);
    if (!c) return;
    openSheet(`📤 Compartir “${c.name}”`, () => `
        <p class="panel-desc" style="margin:0 0 12px">El enlace lleva la lista dentro (títulos, tipo, nota y portadas de internet). Quien lo abra la verá sin poder cambiar nada.</p>
        <label class="field"><span>El enlace caduca en</span><select class="text-input" id="shareDays"><option value="1">1 día</option><option value="7" selected>7 días</option><option value="30">30 días</option><option value="0">Nunca</option></select></label>
        <div class="seg-inline wrap" style="margin-top:12px">
            <button class="btn btn-primary btn-sm" data-act="coll-share-link" data-id="${c.id}">🔗 Copiar enlace</button>
            <button class="btn btn-secondary btn-sm" data-act="coll-share-image" data-id="${c.id}">🖼️ Descargar imagen</button>
        </div>`);
};
FEATURE_ACTIONS['coll-share-link'] = async id => {
    const c = getCollectionById(id);
    const link = collectionShareLink(c, Number($('shareDays').value));
    try {
        if (navigator.share && /Android|iPhone|iPad/i.test(navigator.userAgent)) await navigator.share({ title: c.name, url: link });
        else { await navigator.clipboard.writeText(link); showToast('🔗 Enlace copiado'); }
    } catch (e) { prompt('Copia este enlace:', link); }
};
FEATURE_ACTIONS['coll-share-image'] = async id => {
    const c = getCollectionById(id);
    const blob = await collectionImage(c);
    downloadBlob(blob, `${norm(c.name).replace(/[^a-z0-9]+/g, '-') || 'coleccion'}.png`);
};
/** Imagen 1080×1350 con un mosaico de portadas y la lista. */
async function collectionImage(c) {
    const works = collectionWorks(c).slice(0, 12);
    const cv = document.createElement('canvas');
    cv.width = 1080; cv.height = 1350;
    const ctx = cv.getContext('2d');
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#8b5cf6';
    const g = ctx.createLinearGradient(0, 0, 1080, 1350);
    g.addColorStop(0, '#0f0b1d'); g.addColorStop(1, accent);
    ctx.fillStyle = g; ctx.fillRect(0, 0, 1080, 1350);
    ctx.fillStyle = '#fff';
    ctx.font = '800 64px Inter, sans-serif';
    ctx.fillText(c.name.slice(0, 26), 70, 130);
    ctx.font = '500 32px Inter, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,.8)';
    ctx.fillText(`${collectionWorks(c).length} obras · ${appData.settings.userName || 'Sara'} · Mi Mundo`, 70, 185);
    const load = src => new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });
    const cols = 4, w = 220, h = 320, gap = 24, x0 = 70, y0 = 250;
    for (let i = 0; i < works.length; i++) {
        const wk = works[i], x = x0 + (i % cols) * (w + gap), y = y0 + Math.floor(i / cols) * (h + gap + 44);
        const im = await load(imageSrc(wk.image, wk.type));
        ctx.save();
        ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, 18) : ctx.rect(x, y, w, h); ctx.clip();
        ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(x, y, w, h);
        try { if (im) { const s = Math.max(w / im.width, h / im.height); ctx.drawImage(im, x + (w - im.width * s) / 2, y + (h - im.height * s) / 2, im.width * s, im.height * s); } } catch (e) { /* imagen de otra web sin permiso */ }
        ctx.restore();
        ctx.fillStyle = '#fff'; ctx.font = '600 24px Inter, sans-serif';
        let t = wk.title;
        while (ctx.measureText(t).width > w && t.length > 3) t = t.slice(0, -2);
        ctx.fillText(t === wk.title ? t : t + '…', x, y + h + 32);
    }
    // Si alguna portada de otra web "ensucia" el canvas, se rehace sin portadas
    try { return await new Promise((res, rej) => cv.toBlob(b => (b ? res(b) : rej()), 'image/png')); }
    catch (e) { return new Promise(res => { const c2 = document.createElement('canvas'); c2.width = 1080; c2.height = 1350; const x = c2.getContext('2d'); x.fillStyle = '#1a1030'; x.fillRect(0, 0, 1080, 1350); x.fillStyle = '#fff'; x.font = '800 64px Inter, sans-serif'; x.fillText(c.name.slice(0, 26), 70, 130); x.font = '500 36px Inter, sans-serif'; works.forEach((wk, i) => x.fillText(`${i + 1}. ${wk.title}`.slice(0, 40), 70, 240 + i * 70)); c2.toBlob(res, 'image/png'); }); }
}
/** Vista de solo lectura de una colección compartida (si se abre la app con #compartido=…). */
function showSharedCollection(hash) {
    const p = parseSharedCollection(hash);
    if (!p) return false;
    openSheet(p.error ? '⚠️ Enlace dañado' : `🗂️ ${p.n || 'Colección compartida'}`, () => {
        if (p.error) return emptyState('🔗', 'Este enlace no se puede leer', 'Pide que te lo vuelvan a enviar.');
        if (p.expired) return emptyState('⌛', 'Este enlace ha caducado', `${p.by || 'Quien lo compartió'} puede enviarte uno nuevo.`);
        return `<p class="panel-desc" style="margin:0 0 12px">${p.by ? `Compartida por <b>${esc(p.by)}</b>. ` : ''}${esc(p.d || '')}${p.exp ? ` · caduca el ${esc(fmtDate(p.exp))}` : ''}</p>
            <div class="pick-list">${(p.w || []).map(([title, type, rating, image, year]) => `
                <div class="pick-item"><div class="thumb">${img(image, TYPE_META[type] ? type : 'book', title)}</div>
                <span class="info"><b>${esc(title)}</b><small>${TYPE_META[type] ? TYPE_META[type].icon + ' ' + esc(getTypeLabel(type)) : ''}${year ? ' · ' + esc(year) : ''}${rating ? ' · ★ ' + ratingText(rating) : ''}</small></span>
                <button class="btn btn-secondary btn-sm" data-act="shared-add" data-id="${esc(JSON.stringify([title, type, image, year]))}">＋ Quiero</button></div>`).join('')}</div>`;
    });
    history.replaceState(null, '', location.pathname + location.search + '#home');
    return true;
}
FEATURE_ACTIONS['shared-add'] = json => {
    const [title, type, image, year] = JSON.parse(json);
    const t = TYPE_META[type] ? type : 'book';
    if (appData.works.some(w => w.type === t && norm(w.title) === norm(title))) { showToast(`Ya tienes “${title}”`); return; }
    mutate(() => appData.works.push({ id: generateId(), type: t, title, status: STATUS_BY_TYPE[t][2], ...(image ? { image } : {}), ...(year ? { year: Number(year) } : {}), createdAt: Date.now(), updatedAt: Date.now() }), `⏳ “${title}” añadida a tus pendientes`, { label: `Añadir “${title}”` });
};

// ============================================================
// 2. VISTAS GUARDADAS (búsqueda + filtros + orden + vista)
// ============================================================
function pageControls(page) {
    const root = $('page-' + page);
    return [...root.querySelectorAll('.page-header input[type=search], .filter-bar select, .filter-bar input')].filter(el => el.id);
}
function renderSavedViews(page) {
    const box = document.querySelector(`[data-saved-views="${page}"]`);
    if (!box) return;
    const views = (appData.settings.savedViews || []).filter(v => v.page === page);
    box.innerHTML = views.map(v => `<span class="saved-view"><button class="chip chip-muted" data-act="view-apply" data-id="${esc(v.id)}">⭐ ${esc(v.name)}</button><button class="saved-view-x" data-act="view-remove" data-id="${esc(v.id)}" aria-label="Quitar ${esc(v.name)}">✕</button></span>`).join('')
        + `<button class="chip chip-muted saved-view-add" data-act="view-save" data-id="${page}" title="Guarda la búsqueda, los filtros, el orden y la vista actuales">＋ Guardar vista</button>`;
}
FEATURE_ACTIONS['view-save'] = page => {
    const name = (prompt('Nombre de esta vista (por ejemplo: “BL pendientes”):') || '').trim();
    if (!name) return;
    const state = {};
    pageControls(page).forEach(el => { state[el.id] = el.type === 'checkbox' ? el.checked : el.value; });
    const extra = { viewMode: viewModeOf(page), ...(page === 'series' ? { seriesTab } : {}) };
    appData.settings.savedViews = [...(appData.settings.savedViews || []), { id: generateId(), page, name, state, ...extra }];
    saveData();
    renderSavedViews(page);
    showToast(`⭐ Vista “${name}” guardada`);
};
FEATURE_ACTIONS['view-apply'] = id => {
    const v = (appData.settings.savedViews || []).find(x => x.id === id);
    if (!v) return;
    if (currentPage !== v.page) navigateTo(v.page);
    pageControls(v.page).forEach(el => { if (el.id in v.state) { if (el.type === 'checkbox') el.checked = !!v.state[el.id]; else el.value = v.state[el.id]; } });
    if (v.viewMode) appData.settings.viewModes = { ...(appData.settings.viewModes || {}), [v.page]: v.viewMode };
    if (v.seriesTab) seriesTab = v.seriesTab;
    const bar = $(v.page + 'FilterBar');
    if (bar) { bar.classList.remove('is-collapsed'); const t = document.querySelector(`[data-toggle-filters="${v.page}FilterBar"]`); if (t) t.classList.add('is-on'); }
    RENDERERS[v.page]();
    showToast(`⭐ ${v.name}`);
};
FEATURE_ACTIONS['view-remove'] = id => {
    const v = (appData.settings.savedViews || []).find(x => x.id === id);
    appData.settings.savedViews = (appData.settings.savedViews || []).filter(x => x.id !== id);
    saveData();
    if (v) renderSavedViews(v.page);
};

// ============================================================
// 3. AYUDA DE LA BÚSQUEDA AVANZADA
// ============================================================
const QUERY_EXAMPLES = [
    ['BL nota:5', 'Obras BL con 5 estrellas'],
    ['estado:pendiente año:>2020', 'Pendientes de después de 2020'],
    ['tag:fantasía tag:romance', 'Con las dos etiquetas'],
    ['autor:"Mo Xiang"', 'Comillas para nombres con espacios'],
    ['spicy:>=3 -tag:drama', 'El guion quita resultados'],
    ['tipo:anime o tipo:manhwa', '“o” para alternativas'],
    ['fin:2026 nota:>=4', 'Terminadas en 2026 con 4★ o más'],
    ['estado:activo progreso:>=80', 'Casi terminadas'],
    ['actor:"Wang Yibo"', 'Con ese actor en el reparto'],
    ['fav -estado:terminado', 'Favoritas que no has terminado']
];
function openQueryHelp() {
    openSheet('🔎 Búsqueda avanzada', () => `
        <p class="panel-desc" style="margin:0 0 12px">Escribe en cualquier buscador. Campos: <code>tipo</code>, <code>estado</code>, <code>nota</code>, <code>año</code>, <code>tag</code>, <code>autor</code>, <code>actor</code>, <code>estudio</code>, <code>plataforma</code>, <code>país</code>, <code>spicy</code>, <code>tristeza</code>, <code>progreso</code>, <code>inicio</code>, <code>fin</code>, <code>bl</code>, <code>fav</code>. Comparaciones: <code>:</code> <code>:&gt;</code> <code>:&gt;=</code> <code>:&lt;</code> <code>:&lt;=</code>.</p>
        <label class="field"><span>Prueba aquí</span><input type="search" class="text-input" id="queryTry" placeholder="Por ejemplo: BL nota:>=4" autocomplete="off"></label>
        <p class="hint" id="queryTryHint" style="margin:6px 0 14px"></p>
        <div class="pick-list">${QUERY_EXAMPLES.map(([qq, d]) => `<button class="pick-item" data-act="query-example" data-id="${esc(qq)}"><span class="info"><b><code>${esc(qq)}</code></b><small>${esc(d)} · ${searchWorks(appData.works, qq).length} resultados</small></span></button>`).join('')}</div>`);
}
function updateQueryTry() {
    const q = $('queryTry').value.trim();
    const n = q ? searchWorks(appData.works, q).length : 0;
    $('queryTryHint').textContent = q ? `${describeQuery(q)} → ${n} ${n === 1 ? 'obra' : 'obras'}. Pulsa Intro para verlas.` : '';
}
FEATURE_ACTIONS['query-help'] = () => openQueryHelp();
FEATURE_ACTIONS['query-example'] = qq => showQueryResults(qq);
/** Resultados de una búsqueda avanzada en una hoja. */
function showQueryResults(qq) {
    const list = searchWorks(appData.works, qq);
    openSheet(`🔎 ${qq}`, () => `<p class="panel-desc" style="margin:0 0 12px">${esc(describeQuery(qq))} · ${list.length} ${list.length === 1 ? 'obra' : 'obras'}</p>
        ${list.length ? `<div class="pick-list">${list.map(w => `<button class="pick-item" data-open="${w.id}"><div class="thumb">${img(w.image, w.type, w.title)}</div>
        <span class="info"><b>${esc(w.title)}</b><small>${TYPE_META[w.type].icon} ${esc(getTypeLabel(w.type))} · ${esc(getStatusLabel(w.status))}${w.rating ? ' · ★ ' + ratingText(w.rating) : ''}</small></span></button>`).join('')}</div>` : emptyState('🔍', 'Sin resultados', 'Prueba con otra búsqueda.')}
        <button class="btn btn-secondary btn-sm" data-act="query-to-smart" data-id="${esc(qq)}" style="margin-top:12px">✨ Crear colección inteligente con esta búsqueda</button>`);
}
FEATURE_ACTIONS['query-to-smart'] = qq => { closeModal('sheetModal'); openCollectionModal(null, { smart: true, query: qq }); };

// ============================================================
// 4. OBRAS PARECIDAS
// ============================================================
FEATURE_ACTIONS['similar'] = id => {
    const w = getWorkById(id);
    if (!w) return;
    const list = similarWorks(w, appData.works, 20);
    openSheet(`🔍 Parecidas a “${w.title}”`, () => list.length ? `<div class="pick-list">${list.map(x => `
        <button class="pick-item" data-open="${x.work.id}"><div class="thumb">${img(x.work.image, x.work.type, x.work.title)}</div>
        <span class="info"><b>${esc(x.work.title)}</b><small>${Math.round(x.score * 100)} % parecida · ${esc(x.why.join(' · ') || getTypeLabel(x.work.type))}</small></span></button>`).join('')}</div>`
        : emptyState('🔍', 'Nada parecido todavía', 'Añade etiquetas, autor o reparto para encontrar obras parecidas.'));
};

if (typeof module !== 'undefined' && module.exports) module.exports = { parseSharedCollection, b64encode, b64decode };
