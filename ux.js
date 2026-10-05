/*
 * Mi Mundo · ux.js
 * Experiencia y personalización: atajos de teclado, modo foco, vistas (tabla, estantería, mosaico, álbum),
 * celebraciones y sonidos, temas, fondos, avatar, colores por tipo, menú ordenable, campos visibles y densidad.
 * Se carga antes que app.js (usa sus funciones solo dentro de funciones).
 */
'use strict';

// ============================================================
// 1. NIVEL Y CELEBRACIONES
// ============================================================
function levelInfo(data = appData) {
    const xp = data.works.length * 10 + data.works.filter(w => w.status === 'terminado').length * 15 + data.notes.length * 5;
    const level = Math.floor(xp / 50) + 1;
    const ranks = [[1, '🌱 Semilla'], [3, '🌿 Brote'], [6, '⭐ Estrella'], [10, '🔥 Leyenda'], [15, '👑 Supremo']];
    return { xp, level, rank: ranks.filter(r => level >= r[0]).pop()[1], pct: (xp % 50) / 50 * 100 };
}
/** Lo que se compara antes y después de cada cambio para saber si hay algo que celebrar. */
function celebrationStats() {
    const year = new Date().getFullYear();
    return {
        done: new Set(appData.works.filter(w => w.status === 'terminado').map(w => w.id + ':' + (w.rereads || []).length)),
        level: levelInfo().level,
        goal: Number(appData.settings.yearGoal) || 0,
        doneYear: finishedInYear(appData.works, year),
        reviews: appData.notes.filter(n => n.type === 'resena').length,
        best: streaks(activityByDay(appData.works)).best
    };
}
function celebrateChanges(before, after) {
    if (!before || !after) return;
    const newlyDone = [...after.done].filter(k => !before.done.has(k));
    if (after.goal && before.doneYear < after.goal && after.doneYear >= after.goal) { celebrate('goal', `🏆 ¡Reto ${new Date().getFullYear()} cumplido! ${after.doneYear} de ${after.goal}`); return; }
    if (after.level > before.level) { celebrate('level', `⬆️ ¡Subiste al nivel ${after.level}! ${levelInfo().rank}`); return; }
    if (newlyDone.length) { celebrate('finish'); return; }
    if (!before.reviews && after.reviews) { celebrate('review', '⭐ ¡Tu primera reseña! Escribir lo que piensas hace tu colección única.'); return; }
    if (after.best > before.best && after.best >= 3) celebrate('streak', `🔥 ¡Nuevo récord de racha: ${after.best} días!`);
}
const reduceMotion = () => !!appData.settings.reduceMotion || (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches);
/** Confeti, sonido y un aviso. */
function celebrate(kind, msg) {
    playSound(kind === 'level' || kind === 'goal' ? 'level' : 'success');
    if (msg) setTimeout(() => showToast(msg, 'success', 4500), 350);
    if (reduceMotion()) return;
    const layer = document.createElement('div');
    layer.className = 'confetti';
    layer.setAttribute('aria-hidden', 'true');
    const colors = ['var(--accent)', '#ec4899', '#fbbf24', '#10b981', '#3b82f6', '#f97316'];
    const n = kind === 'goal' || kind === 'level' ? 90 : 50;
    for (let i = 0; i < n; i++) {
        const p = document.createElement('i');
        p.style.setProperty('--x', `${(Math.random() - 0.5) * 120}vw`);
        p.style.setProperty('--y', `${-30 - Math.random() * 60}vh`);
        p.style.setProperty('--r', `${Math.random() * 900 - 450}deg`);
        p.style.setProperty('--d', `${0.9 + Math.random() * 0.9}s`);
        p.style.left = `${40 + Math.random() * 20}%`;
        p.style.background = colors[i % colors.length];
        if (i % 3 === 0) p.style.borderRadius = '50%';
        layer.appendChild(p);
    }
    document.body.appendChild(layer);
    setTimeout(() => layer.remove(), 2200);
}

// ============================================================
// 2. SONIDOS SUAVES (apagados por defecto)
// ============================================================
let audioCtx = null;
function playSound(kind) {
    const s = appData.settings;
    if (!s.sounds) return;
    try {
        audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
        const vol = Math.max(0, Math.min(1, (Number(s.volume) || 40) / 100)) * 0.25;
        const notes = { tick: [880], success: [523, 659, 784], level: [523, 659, 784, 1047], undo: [440, 349], streak: [659, 880], review: [587, 784], goal: [523, 659, 784, 1047] }[kind] || [660];
        notes.forEach((f, i) => {
            const t = audioCtx.currentTime + i * 0.09;
            const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.value = f;
            gain.gain.setValueAtTime(0, t);
            gain.gain.linearRampToValueAtTime(vol, t + 0.015);
            gain.gain.exponentialRampToValueAtTime(0.0001, t + (kind === 'tick' ? 0.12 : 0.35));
            osc.connect(gain).connect(audioCtx.destination);
            osc.start(t);
            osc.stop(t + 0.4);
        });
    } catch (e) { /* sin audio */ }
}

// ============================================================
// 3. MODO FOCO
// ============================================================
let focusId = null;
function openFocus(id) {
    const w = getWorkById(id);
    if (!w) return;
    focusId = id;
    if (currentDetailId) closeDetail();
    renderFocus();
    const el = $('focusMode');
    el.hidden = false;
    requestAnimationFrame(() => el.classList.add('active'));
    if (el.requestFullscreen && !document.fullscreenElement && appData.settings.focusFullscreen !== false) el.requestFullscreen().catch(() => {});
    setTimeout(() => { const b = el.querySelector('[data-act="focus-plus"]') || el.querySelector('[data-act="focus-close"]'); if (b) b.focus(); }, 60);
}
function closeFocus() {
    const el = $('focusMode');
    el.classList.remove('active');
    setTimeout(() => { el.hidden = true; el.innerHTML = ''; }, 250);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    focusId = null;
}
function renderFocus(bump = false) {
    const w = getWorkById(focusId);
    if (!w) { closeFocus(); return; }
    const total = getTotal(w), p = getProgress(w);
    const unit = w.type === 'book' ? 'páginas' : w.type === 'manhwa' ? 'capítulos' : 'episodios';
    const step = TYPE_META[w.type].step;
    const done = total && (Number(w.progress) || 0) >= total;
    $('focusMode').innerHTML = `
        <div class="focus-bg" style="background-image:${esc(cssUrl(imageSrc(w.image, w.type)))}"></div>
        <button class="icon-btn focus-close" data-act="focus-close" aria-label="Salir del modo foco (Esc)">✕</button>
        <div class="focus-inner">
            <div class="focus-cover">${img(w.image, w.type, w.title)}</div>
            <div class="focus-info">
                <span class="chip">${TYPE_META[w.type].icon} ${esc(getTypeLabel(w.type))} · ${esc(getStatusLabel(w.status))}${rereadBadge(w) ? ' · ' + esc(rereadBadge(w)) : ''}</span>
                <h2>${esc(w.title)}</h2>
                ${total ? `<div class="focus-progress">
                    <div class="focus-number ${bump ? 'bump' : ''}"><b>${Number(w.progress) || 0}</b><span>/ ${total} ${unit}</span></div>
                    <div class="progress-bar"><div class="progress-fill" style="width:${p}%"></div></div>
                    <div class="focus-pct">${done ? '🎉 ¡Terminada!' : `${p} % · te faltan ${total - (Number(w.progress) || 0)}`}${hasSeasons(w) ? ' · ' + esc(seasonLabel(w)) : ''}</div>
                </div>` : `<p class="focus-hint">Añade el total de ${unit} al editarla para seguir tu progreso aquí.</p>`}
                <div class="focus-actions">
                    ${total && !done ? `<button class="btn btn-primary focus-big" data-act="focus-plus">＋${step} <small>${w.type === 'book' ? 'págs' : w.type === 'manhwa' ? 'cap' : 'ep'}</small></button>
                    <button class="btn btn-secondary focus-mid" data-act="focus-minus" aria-label="Retroceder">−${step}</button>` : ''}
                    ${w.status !== 'terminado' || w.rereading ? `<button class="btn btn-secondary focus-mid" data-act="focus-finish">✅ Terminar</button>` : ''}
                </div>
                <div class="focus-rating"><span>Tu valoración</span>${starInput(w.id, w.rating)}</div>
                <div class="focus-secondary">
                    <button class="btn btn-ghost btn-sm" data-act="focus-edit">✏️ Editar</button>
                    <button class="btn btn-ghost btn-sm" data-act="focus-detail">📄 Ver ficha</button>
                </div>
                <p class="focus-keys"><kbd>Espacio</kbd> avanzar · <kbd>←</kbd> retroceder · <kbd>Esc</kbd> salir</p>
            </div>
        </div>`;
}
FEATURE_ACTIONS['focus'] = id => openFocus(id);
FEATURE_ACTIONS['focus-close'] = () => closeFocus();
FEATURE_ACTIONS['focus-plus'] = () => { changeProgress(focusId, 1); playSound('tick'); renderFocus(true); };
FEATURE_ACTIONS['focus-minus'] = () => { changeProgress(focusId, -1); renderFocus(true); };
FEATURE_ACTIONS['focus-finish'] = () => {
    const w = getWorkById(focusId);
    if (!w || isLocked(w)) return;
    mutate(() => {
        finishWork(w);
        if (getTotal(w)) w.progress = getTotal(w);
        if (hasSeasons(w)) { w.seasonsList.forEach(s => { if (Number(s.episodes)) s.progress = Number(s.episodes); }); syncSeasonAggregates(w); }
        bumpActivity(w);
    }, `🎉 ¡Terminaste “${w.title}”!`, { type: 'success', label: `Terminar “${w.title}”` });
    renderFocus();
};
FEATURE_ACTIONS['focus-edit'] = () => { const id = focusId; closeFocus(); const w = getWorkById(id); if (w && !isLocked(w)) openWorkModal(null, w); };
FEATURE_ACTIONS['focus-detail'] = () => { const id = focusId; closeFocus(); openDetail(id); };

// ============================================================
// 4. VISTAS: TARJETAS, LISTA, TABLA, ESTANTERÍA Y MOSAICO
// ============================================================
const VIEW_MODES = [['grid', '🎴', 'Tarjetas'], ['list', '📋', 'Lista'], ['table', '📊', 'Tabla'], ['shelf', '📚', 'Estantería'], ['mosaic', '🧩', 'Mosaico']];
const tableSort = {};
function viewModeOf(page) { return ((appData.settings.viewModes || {})[page]) || 'grid'; }
function viewSwitch(page) {
    const mode = viewModeOf(page);
    return VIEW_MODES.map(([m, icon, label]) => `<button class="btn btn-secondary btn-sm ${mode === m ? 'is-on' : ''}" data-act="view-mode" data-id="${page}:${m}" title="${label}" aria-pressed="${mode === m}">${icon}<span class="vs-label"> ${label}</span></button>`).join('');
}
FEATURE_ACTIONS['view-mode'] = key => {
    const [page, mode] = key.split(':');
    appData.settings.viewModes = { ...(appData.settings.viewModes || {}), [page]: mode };
    saveData();
    RENDERERS[page]();
};
/** Pinta la lista de obras de una página en el modo de vista elegido. */
function renderWorks(grid, list, page, cardOpts = {}) {
    const mode = viewModeOf(page);
    const sw = document.querySelector(`[data-view-switch="${page}"]`);
    if (sw) sw.innerHTML = viewSwitch(page);
    grid.className = `card-grid view-${mode}${mode === 'list' ? ' is-list' : ''}`;
    if (mode === 'table') { grid.innerHTML = worksTable(list, page); return; }
    if (mode === 'shelf') { grid.innerHTML = worksShelf(list); return; }
    if (mode === 'mosaic') {
        grid.innerHTML = list.map(w => `<button class="mosaic-item work-item${selection.has(w.id) ? ' is-selected' : ''}" data-open="${w.id}" data-id="${w.id}" title="${esc(w.title)}" aria-label="${esc(w.title)}">
            ${img(w.image, w.type, w.title)}${w.rating ? `<span class="mosaic-rating">★ ${ratingText(w.rating)}</span>` : ''}${getProgress(w) > 0 && getProgress(w) < 100 ? `<span class="mosaic-progress" style="width:${getProgress(w)}%"></span>` : ''}</button>`).join('');
        return;
    }
    grid.innerHTML = list.map(w => workCard(w, cardOpts)).join('');
}
function worksTable(list, page) {
    const sort = tableSort[page] || { key: '', dir: 1 };
    const cols = [['title', 'Título'], ['type', 'Tipo'], ['status', 'Estado'], ['progress', 'Progreso'], ['rating', 'Nota'], ['year', 'Año']];
    const val = (w, k) => (k === 'progress' ? getProgress(w) : k === 'type' ? getTypeLabel(w.type) : k === 'status' ? getStatusLabel(w.status) : w[k]);
    const rows = sort.key ? list.slice().sort((a, b) => {
        const x = val(a, sort.key), y = val(b, sort.key);
        return (typeof x === 'number' || typeof y === 'number' ? (Number(x) || 0) - (Number(y) || 0) : String(x || '').localeCompare(String(y || ''), 'es')) * sort.dir;
    }) : list;
    return `<div class="works-table-wrap"><table class="works-table">
        <thead><tr><th class="c-cover"><span class="sr-only">Portada</span></th>${cols.map(([k, l]) => `<th scope="col" aria-sort="${sort.key === k ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none'}"><button data-act="table-sort" data-id="${page}:${k}">${l}${sort.key === k ? (sort.dir > 0 ? ' ▲' : ' ▼') : ''}</button></th>`).join('')}</tr></thead>
        <tbody>${rows.map(w => `<tr class="work-item${selection.has(w.id) ? ' is-selected' : ''}" data-open="${w.id}" data-id="${w.id}" tabindex="0">
            <td class="c-cover">${img(w.image, w.type, '')}</td>
            <td class="c-title"><b>${w.favorite ? '<span class="fav">♥</span> ' : ''}${esc(w.title)}</b><small>${esc(getSubtitle(w))}</small></td>
            <td>${TYPE_META[w.type].icon}<span class="c-hide-sm"> ${esc(getTypeLabel(w.type))}</span></td>
            <td><span class="pill ${statusClass(w.status)}">${esc(getStatusLabel(w.status))}</span></td>
            <td class="c-progress">${getTotal(w) ? `<span>${esc(hasSeasons(w) ? seasonLabel(w) : getProgressText(w))}</span><span class="progress-bar sm"><span class="progress-fill" style="width:${getProgress(w)}%"></span></span>` : '–'}</td>
            <td class="c-rating">${w.rating ? '★ ' + ratingText(w.rating) : '–'}</td>
            <td>${esc(w.year || '–')}</td>
        </tr>`).join('')}</tbody></table></div>`;
}
FEATURE_ACTIONS['table-sort'] = key => {
    const [page, k] = key.split(':');
    const cur = tableSort[page] || {};
    tableSort[page] = { key: k, dir: cur.key === k ? -cur.dir : (k === 'rating' || k === 'progress' || k === 'year' ? -1 : 1) };
    RENDERERS[page]();
};
/** Lomos de libro en estanterías: el alto depende de la longitud y el color del tipo (o de su primera etiqueta con color). */
function worksShelf(list) {
    const lomo = w => {
        const tag = splitList(w.tags).map(t => tagMeta(t).color).find(Boolean);
        const color = tag || TYPE_META[w.type].color;
        const len = getTotal(w);
        const h = 150 + Math.min(70, Math.round(Math.log10((len || 50) + 1) * 22));
        const wdt = 34 + Math.min(22, Math.round((len || 100) / (w.type === 'book' ? 60 : 12)));
        // Cada lomo con un tono un poco distinto para que la estantería no sea de un solo color
        const hash = [...String(w.id)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 997, 7);
        return `<button class="spine work-item${selection.has(w.id) ? ' is-selected' : ''}" data-open="${w.id}" data-id="${w.id}" style="--spine:${esc(color)};height:${h}px;width:${wdt}px;filter:hue-rotate(${(hash % 50) - 25}deg) brightness(${0.85 + (hash % 30) / 100})" title="${esc(w.title)}" aria-label="${esc(w.title)}">
            <span class="spine-title">${esc(w.title)}</span><span class="spine-icon">${w.favorite ? '♥' : TYPE_META[w.type].icon}</span></button>`;
    };
    const perShelf = Math.max(6, Math.floor((($('main') || {}).clientWidth || 900) / 52) - 2);
    const shelves = [];
    for (let i = 0; i < list.length; i += perShelf) shelves.push(list.slice(i, i + perShelf));
    return shelves.map(s => `<div class="shelf">${s.map(lomo).join('')}</div>`).join('');
}

// Álbum de personas
function personAlbum(list) {
    return `<div class="person-album">${list.map(p => `<button class="album-item" data-person="${p.id}" data-id="${p.id}" aria-label="${esc(p.name)}">
        ${img(p.image, 'person', p.name)}<span class="album-name"><b>${esc(p.name)}</b><small>${esc(PERSON_TYPE_LABEL[p.type] || p.type)} · ${personWorkCount(p)} obras</small></span></button>`).join('')}</div>`;
}
FEATURE_ACTIONS['person-view'] = mode => { appData.settings.personView = mode; saveData(); renderPersons(); };

// ============================================================
// 5. ATAJOS DE TECLADO
// ============================================================
const SHORTCUTS = [
    ['N', 'Agregar obra'], ['Shift + N', 'Modo rápido (varias seguidas)'], ['/  o  Ctrl + F', 'Buscar'], ['Ctrl + K', 'Buscar o ir a…'],
    ['E', 'Editar la obra abierta'], ['D', 'Duplicar la obra abierta'], ['F', 'Modo foco con la obra abierta'],
    ['Ctrl + Z', 'Deshacer'], ['Ctrl + Shift + Z', 'Rehacer'], ['Ctrl + S', 'Guardar el formulario'], ['Esc', 'Cerrar'],
    ['G y luego H', 'Ir a Inicio'], ['G L / G S / G A / G M / G B', 'Libros, Series, Anime, Manhwas, BL'],
    ['G P / G J / G C / G E / G N / G X / G T', 'Personas, Parejas, Colecciones, Estadísticas, Notas, Extras, Personalizar'], ['?', 'Ver esta ayuda']
];
const GO_KEYS = { x: 'extras', h: 'home', l: 'books', s: 'series', a: 'anime', m: 'manhwa', b: 'bl', p: 'persons', j: 'couples', r: 'emission', c: 'collections', e: 'stats', n: 'notes', t: 'settings' };
let goPending = 0;
function openShortcuts() {
    openSheet('⌨️ Atajos de teclado', () => `<dl class="shortcut-list">${SHORTCUTS.map(([k, d]) => `<dt>${k.split(/(\s\+\s|\s+o\s+|\s\/\s|\s)/).map(part => (/^\s|^\/$/.test(part) || !part.trim() ? esc(part) : `<kbd>${esc(part)}</kbd>`)).join('')}</dt><dd>${esc(d)}</dd>`).join('')}</dl>`);
}
FEATURE_ACTIONS['shortcuts'] = () => openShortcuts();
/** Devuelve true si el atajo se ha usado. */
function handleShortcut(e) {
    const typing = e.target.closest && e.target.closest('input, textarea, select, [contenteditable="true"]');
    const k = e.key.toLowerCase();
    const mod = e.ctrlKey || e.metaKey;
    if (!$('focusMode').hidden) {
        if (e.key === 'Escape') { closeFocus(); return true; }
        if (!typing && (e.key === ' ' || e.key === 'ArrowRight') && $('focusMode').querySelector('[data-act="focus-plus"]')) { FEATURE_ACTIONS['focus-plus'](); return true; }
        if (!typing && e.key === 'ArrowLeft') { FEATURE_ACTIONS['focus-minus'](); return true; }
        return false;
    }
    if (mod && k === 's') {
        const m = topOpenModal();
        const save = { workModal: 'workSaveBtn', personModal: 'personSaveBtn', coupleModal: 'coupleSaveBtn', collectionModal: 'collectionSaveBtn' }[m && m.id];
        if (save) { $(save).click(); return true; }
        return false;
    }
    if (mod && k === 'f' && !topOpenModal()) { focusSearch(); return true; }
    if (mod && !e.shiftKey && k === 'n') { openWorkModal(pageType()); return true; } // algunos navegadores no lo dejan usar
    if (typing || mod || e.altKey || topOpenModal()) return false;
    if (goPending && Date.now() - goPending < 1200 && GO_KEYS[k]) { goPending = 0; if (currentDetailId) closeDetail(); navigateTo(GO_KEYS[k]); return true; }
    goPending = 0;
    if (k === 'g') { goPending = Date.now(); return true; }
    if (e.key === '?') { openShortcuts(); return true; }
    if (e.key === '/') { focusSearch(); return true; }
    if (e.key === 'N') { openQuickAdd(); return true; }
    if (k === 'n' && !e.shiftKey) { openWorkModal(pageType()); return true; }
    if (currentDetailId && k === 'e') { handleAction('edit', currentDetailId); return true; }
    if (currentDetailId && k === 'd') { openDuplicate(currentDetailId); return true; }
    if (currentDetailId && k === 'f') { openFocus(currentDetailId); return true; }
    return false;
}
function pageType() { return { books: 'book', series: 'series', anime: 'anime', manhwa: 'manhwa', bl: 'series' }[currentPage] || 'book'; }
function focusSearch() {
    const local = { books: 'booksSearch', series: 'seriesSearch', anime: 'animeSearch', manhwa: 'manhwaSearch', bl: 'blSearch', persons: 'personSearch', couples: 'couplesSearch', notes: 'notesSearch', home: 'globalSearch' }[currentPage];
    if (local && $(local) && $(local).offsetParent) { $(local).focus(); $(local).select(); } else openPalette();
}

// ============================================================
// 6. TEMAS, FONDOS, AVATAR Y PERSONALIZACIÓN
// ============================================================
const THEME_PRESETS = {
    default: { label: '✨ Mi Mundo', accent: '#8b5cf6' },
    neon: { label: '🌈 Neón', accent: '#ff2bd6' },
    minimal: { label: '◻️ Minimalista', accent: '#64748b' },
    paper: { label: '📜 Papel', accent: '#b45309' },
    terminal: { label: '🖥️ Retro terminal', accent: '#22c55e' },
    ocean: { label: '🌊 Océano', accent: '#0ea5e9' }
};
const BACKGROUNDS = { aurora: '🌌 Aurora', none: '⬛ Liso', stars: '✨ Estrellas', dots: '⚪ Puntos', waves: '🌊 Ondas', image: '🖼️ Mi imagen' };
const AVATAR_EMOJIS = ['🌸', '🌙', '⭐', '🦋', '🐱', '🐰', '🦊', '🐼', '🍓', '🍵', '🎧', '📚', '🎬', '💜', '👑', '🔥'];
const DEFAULT_TYPE_COLORS = { book: '#8b5cf6', series: '#ec4899', anime: '#d97706', manhwa: '#3b82f6' };
const NAV_FIXED = ['home', 'settings'];

function isDarkNow(s = appData.settings) {
    if (s.themeAuto && typeof matchMedia !== 'undefined') return matchMedia('(prefers-color-scheme: dark)').matches;
    return !!s.darkMode;
}
function accentNow(s = appData.settings) { return isDarkNow(s) ? s.themeColor : (s.themeColorLight || s.themeColor); }
/** Aplica lo que no es color ni tamaño: preset, fondo, densidad, animaciones, colores por tipo, menú y avatar. */
function applyPersonalization() {
    const s = appData.settings;
    const root = document.documentElement;
    root.dataset.preset = THEME_PRESETS[s.preset] ? s.preset : 'default';
    root.dataset.bg = BACKGROUNDS[s.background] ? s.background : 'aurora';
    root.dataset.density = ['compact', 'spacious'].includes(s.density) ? s.density : 'comfortable';
    root.classList.toggle('reduce-motion', !!s.reduceMotion);
    root.style.setProperty('--bg-opacity', String((s.bgOpacity ?? 35) / 100));
    const bgSrc = s.background === 'image' ? resolveImageSrc(s.bgImage) : '';
    root.style.setProperty('--bg-image', bgSrc ? cssUrl(bgSrc) : 'none');
    Object.keys(TYPE_META).forEach(t => { TYPE_META[t].color = ((s.typeColors || {})[t]) || DEFAULT_TYPE_COLORS[t]; });
    applyNavLayout();
    renderAvatar();
}
function applyNavLayout() {
    const s = appData.settings;
    const order = s.navOrder || [];
    const hidden = new Set(s.navHidden || []);
    document.querySelectorAll('.sidebar .nav-section').forEach(sec => {
        const items = [...sec.querySelectorAll(':scope > .nav-item[data-nav]')];
        items.sort((a, b) => {
            const ia = order.indexOf(a.dataset.nav), ib = order.indexOf(b.dataset.nav);
            return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
        }).forEach(el => { sec.appendChild(el); el.hidden = hidden.has(el.dataset.nav) && !NAV_FIXED.includes(el.dataset.nav); });
    });
}
function renderAvatar() {
    const s = appData.settings;
    const el = $('userAvatar');
    if (!el) return;
    const src = isImageRef(s.avatar) || /^https?:|^data:image/.test(s.avatar || '') ? resolveImageSrc(s.avatar) : '';
    if (src) el.innerHTML = `<img src="${esc(src)}" alt="">`;
    else el.textContent = s.avatar || (s.userName || 'Sara').trim().charAt(0).toUpperCase() || '✨';
}
function navItems() {
    const order = appData.settings.navOrder || [];
    return [...document.querySelectorAll('.sidebar .nav-item[data-nav]')].map(el => ({ id: el.dataset.nav, label: el.querySelector('.label').textContent, icon: el.querySelector('.icon').textContent, section: [...document.querySelectorAll('.sidebar .nav-section')].indexOf(el.parentElement) }))
        .sort((a, b) => a.section - b.section || ((order.indexOf(a.id) + 1 || 999) - (order.indexOf(b.id) + 1 || 999)));
}
/** Panel de Personalizar con todo lo nuevo. */
function renderPersonalizePanel() {
    const s = appData.settings;
    const box = $('personalizeBody');
    if (!box) return;
    const hiddenNav = new Set(s.navHidden || []);
    const cardHidden = new Set(s.hiddenCardFields || []);
    const formHidden = new Set(s.hiddenFormFields || []);
    const items = navItems();
    box.innerHTML = `
        <div class="pz-group"><div class="pz-title">Estilo</div>
            <div class="preset-grid">${Object.entries(THEME_PRESETS).map(([k, p]) => `<button class="preset-option ${((s.preset || 'default') === k) ? 'is-on' : ''}" data-act="preset" data-id="${k}" data-preset-sample="${k}"><span class="preset-swatch" style="--sw:${p.accent}"></span>${esc(p.label)}</button>`).join('')}</div>
            <div class="setting-row"><span>Seguir el modo del sistema (claro/oscuro)</span><button class="toggle-switch" data-act="toggle-setting" data-id="themeAuto" role="switch" aria-checked="${!!s.themeAuto}" aria-label="Seguir el modo del sistema"></button></div>
            <p class="hint">El color principal se guarda por separado para el modo claro y el oscuro.</p>
        </div>
        <div class="pz-group"><div class="pz-title">Fondo</div>
            <div class="seg-inline wrap">${Object.entries(BACKGROUNDS).map(([k, l]) => `<button class="btn btn-secondary btn-sm ${(s.background || 'aurora') === k ? 'is-on' : ''}" data-act="background" data-id="${k}">${l}</button>`).join('')}</div>
            ${s.background === 'image' ? `<div class="upload-row" style="margin-top:10px"><button class="btn btn-secondary btn-sm" data-upload="bgImageFile">📤 Subir imagen de fondo</button><input type="file" id="bgImageFile" accept="image/*" hidden data-target="bgImageInput" data-kind="banner"><input type="hidden" id="bgImageInput"></div>` : ''}
            ${s.background && s.background !== 'none' ? `<div class="slider-group" style="margin-top:10px"><span class="slider-label">Intensidad</span><input type="range" min="5" max="100" step="5" id="bgOpacity" value="${s.bgOpacity ?? 35}" aria-label="Intensidad del fondo"><output class="slider-value">${s.bgOpacity ?? 35}%</output></div>` : ''}
        </div>
        <div class="pz-group"><div class="pz-title">Avatar</div>
            <div class="avatar-grid">${AVATAR_EMOJIS.map(e => `<button class="avatar-option ${s.avatar === e ? 'is-on' : ''}" data-act="avatar" data-id="${e}" aria-label="Avatar ${e}">${e}</button>`).join('')}
                <button class="avatar-option" data-upload="avatarFile" aria-label="Subir foto">📷</button>
                <button class="avatar-option ${!s.avatar ? 'is-on' : ''}" data-act="avatar" data-id="" aria-label="Usar la inicial">Aa</button></div>
            <input type="file" id="avatarFile" accept="image/*" hidden data-target="avatarInput" data-kind="avatar"><input type="hidden" id="avatarInput">
        </div>
        <div class="pz-group"><div class="pz-title">Densidad</div>
            <div class="seg-inline">${[['compact', 'Compacta'], ['comfortable', 'Cómoda'], ['spacious', 'Espaciosa']].map(([k, l]) => `<button class="btn btn-secondary btn-sm ${(s.density || 'comfortable') === k ? 'is-on' : ''}" data-act="density" data-id="${k}">${l}</button>`).join('')}</div>
        </div>
        <div class="pz-group"><div class="pz-title">Colores por tipo</div>
            <div class="type-colors">${TYPE_ORDER.map(t => `<label class="type-color"><span class="tag-color"><input type="color" data-type-color="${t}" value="${esc(TYPE_META[t].color)}"></span>${TYPE_META[t].icon} ${esc(TYPE_PLURAL[t])}</label>`).join('')}
            <button class="btn btn-ghost btn-sm" data-act="type-colors-reset">↺ Originales</button></div>
        </div>
        <div class="pz-group"><div class="pz-title">Animaciones y sonidos</div>
            <div class="setting-row"><span>Reducir animaciones (sin confeti)</span><button class="toggle-switch" data-act="toggle-setting" data-id="reduceMotion" role="switch" aria-checked="${!!s.reduceMotion}" aria-label="Reducir animaciones"></button></div>
            <div class="setting-row"><span>Sonidos suaves</span><button class="toggle-switch" data-act="toggle-setting" data-id="sounds" role="switch" aria-checked="${!!s.sounds}" aria-label="Sonidos suaves"></button></div>
            ${s.sounds ? `<div class="slider-group"><span class="slider-label">Volumen</span><input type="range" min="5" max="100" step="5" id="soundVolume" value="${s.volume ?? 40}" aria-label="Volumen"><output class="slider-value">${s.volume ?? 40}%</output><button class="btn btn-ghost btn-sm" data-act="sound-test">▶️</button></div>` : ''}
        </div>
        <div class="pz-group"><div class="pz-title">Menú lateral</div>
            <p class="hint" style="margin:0 0 8px">Arrastra para ordenar (o usa las flechas) y desmarca lo que no uses.</p>
            <div class="nav-editor" id="navEditor">${items.map((it, i) => `<div class="nav-edit-row" draggable="${!NAV_FIXED.includes(it.id)}" data-nav-row="${it.id}" data-section="${it.section}">
                <span class="drag-handle" aria-hidden="true">⠿</span><span>${it.icon} ${esc(it.label)}</span>
                <span class="nav-edit-actions">
                    <button class="icon-btn sm" data-act="nav-move" data-id="${it.id}:-1" aria-label="Subir" ${i === 0 || items[i - 1].section !== it.section ? 'disabled' : ''}>↑</button>
                    <button class="icon-btn sm" data-act="nav-move" data-id="${it.id}:1" aria-label="Bajar" ${!items[i + 1] || items[i + 1].section !== it.section ? 'disabled' : ''}>↓</button>
                    <input type="checkbox" data-nav-visible="${it.id}" ${hiddenNav.has(it.id) ? '' : 'checked'} ${NAV_FIXED.includes(it.id) ? 'disabled' : ''} aria-label="Mostrar ${esc(it.label)}">
                </span></div>`).join('')}</div>
        </div>
        <div class="pz-group"><div class="pz-title">Qué se ve en las tarjetas</div>
            <div class="check-grid">${[['stars', '⭐ Estrellas'], ['spicy', '🌶️ Spicy'], ['sadness', '💧 Tristeza'], ['progress', '📈 Progreso'], ['status', '🏷️ Estado'], ['subtitle', '✍️ Autor/plataforma']].map(([k, l]) => `<label class="checkbox-wrapper"><input type="checkbox" data-card-field="${k}" ${cardHidden.has(k) ? '' : 'checked'}> ${l}</label>`).join('')}</div>
        </div>
        <div class="pz-group"><div class="pz-title">Campos del formulario</div>
            <div class="check-grid">${[['country', 'País'], ['actors', 'Actores'], ['directors', 'Directores'], ['genre', 'Género'], ['airDay', 'Día de emisión'], ['startDate', 'Fechas'], ['synopsis', 'Sinopsis'], ['spicy', 'Spicy y tristeza']].map(([k, l]) => `<label class="checkbox-wrapper"><input type="checkbox" data-form-field="${k}" ${formHidden.has(k) ? '' : 'checked'}> ${l}</label>`).join('')}</div>
        </div>`;
}
const cardHides = f => (appData.settings.hiddenCardFields || []).includes(f);
/** Oculta en el formulario los campos que no quieres ver (los datos no se pierden). */
function applyFormFieldVisibility() {
    const hidden = new Set(appData.settings.hiddenFormFields || []);
    const groups = { startDate: ['startDate', 'endDate'], spicy: ['spicy', 'sadness'] };
    workForm.querySelectorAll('.user-hidden').forEach(el => el.classList.remove('user-hidden'));
    hidden.forEach(f => (groups[f] || [f]).forEach(x => {
        const el = workForm.querySelector(`[data-field="${x}"]`);
        const wrap = el && (el.closest('.slider-group') || el.closest('.field'));
        if (wrap) wrap.classList.add('user-hidden');
    }));
}
function toggleListSetting(key, value, on) {
    const set = new Set(appData.settings[key] || []);
    if (on) set.delete(value); else set.add(value);
    appData.settings[key] = [...set];
    saveData();
}
FEATURE_ACTIONS['preset'] = k => {
    const p = THEME_PRESETS[k];
    if (!p) return;
    appData.settings.preset = k;
    if (isDarkNow()) appData.settings.themeColor = p.accent; else appData.settings.themeColorLight = p.accent;
    applySettings(); saveData(); renderSettings();
    showToast(`🎨 Estilo ${p.label}`);
};
FEATURE_ACTIONS['toggle-setting'] = key => {
    appData.settings[key] = !appData.settings[key];
    applySettings(); saveData(); renderSettings();
    if (key === 'sounds' && appData.settings.sounds) playSound('success');
};
FEATURE_ACTIONS['background'] = k => { appData.settings.background = k; applySettings(); saveData(); renderSettings(); if (k === 'image' && !appData.settings.bgImage) setTimeout(() => $('bgImageFile') && $('bgImageFile').click(), 50); };
FEATURE_ACTIONS['avatar'] = e => { appData.settings.avatar = e; applySettings(); saveData(); renderSettings(); };
FEATURE_ACTIONS['density'] = k => { appData.settings.density = k; applySettings(); saveData(); renderSettings(); };
FEATURE_ACTIONS['type-colors-reset'] = () => { delete appData.settings.typeColors; applySettings(); saveData(); renderSettings(); showToast('↺ Colores originales'); };
FEATURE_ACTIONS['sound-test'] = () => playSound('level');
FEATURE_ACTIONS['nav-move'] = key => {
    const [id, d] = key.split(':');
    const ids = navItems().map(x => x.id);
    const i = ids.indexOf(id), j = i + Number(d);
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    appData.settings.navOrder = ids;
    applySettings(); saveData(); renderSettings();
};
/** Cambios en los controles del panel. Devuelve true si lo ha gestionado. */
function onPersonalizeInput(t, type) {
    if (t.id === 'bgOpacity') { appData.settings.bgOpacity = Number(t.value); t.nextElementSibling.textContent = t.value + '%'; applyPersonalization(); if (type === 'change') saveData(); return true; }
    if (t.id === 'soundVolume') { appData.settings.volume = Number(t.value); t.nextElementSibling.textContent = t.value + '%'; if (type === 'change') { saveData(); playSound('tick'); } return true; }
    // Las fotos subidas llegan como 'input' (las pone handleImageUpload)
    if (t.id === 'avatarInput') { if (type === 'input') { appData.settings.avatar = t.value; applySettings(); saveData(); renderSettings(); } return true; }
    if (t.id === 'bgImageInput') { if (type === 'input') { appData.settings.bgImage = t.value; appData.settings.background = 'image'; applySettings(); saveData(); renderSettings(); } return true; }
    if (type !== 'change') return false;
    if (t.dataset.typeColor) { appData.settings.typeColors = { ...(appData.settings.typeColors || {}), [t.dataset.typeColor]: t.value }; applySettings(); saveData(); refreshView(); return true; }
    if (t.dataset.navVisible) { toggleListSetting('navHidden', t.dataset.navVisible, t.checked); applyNavLayout(); return true; }
    if (t.dataset.cardField) { toggleListSetting('hiddenCardFields', t.dataset.cardField, t.checked); return true; }
    if (t.dataset.formField) { toggleListSetting('hiddenFormFields', t.dataset.formField, t.checked); applyFormFieldVisibility(); return true; }
    return false;
}
// Arrastrar para ordenar el menú
let dragNav = null;
document.addEventListener('dragstart', e => { const row = e.target.closest && e.target.closest('[data-nav-row]'); if (row) { dragNav = row.dataset.navRow; e.dataTransfer.effectAllowed = 'move'; row.classList.add('dragging'); } });
document.addEventListener('dragend', e => { const row = e.target.closest && e.target.closest('[data-nav-row]'); if (row) row.classList.remove('dragging'); dragNav = null; });
document.addEventListener('dragover', e => { if (dragNav && e.target.closest && e.target.closest('[data-nav-row]')) e.preventDefault(); });
document.addEventListener('drop', e => {
    const row = e.target.closest && e.target.closest('[data-nav-row]');
    if (!dragNav || !row || row.dataset.navRow === dragNav) return;
    e.preventDefault();
    const items = navItems();
    const from = items.find(x => x.id === dragNav), to = items.find(x => x.id === row.dataset.navRow);
    if (!from || !to || from.section !== to.section) { showToast('Solo se puede ordenar dentro del mismo grupo'); return; }
    const ids = items.map(x => x.id).filter(id => id !== dragNav);
    ids.splice(ids.indexOf(to.id) + (items.indexOf(from) < items.indexOf(to) ? 1 : 0), 0, dragNav);
    appData.settings.navOrder = ids;
    applySettings(); saveData(); renderSettings();
});

if (typeof module !== 'undefined' && module.exports) module.exports = { levelInfo };
