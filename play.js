/*
 * Mi Mundo · play.js
 * Página "Extras" (cronología, diario, ¿cómo te sientes?, adivina por portada, retos, limpieza y preguntas),
 * consejo del día, tour guiado, plantillas de colecciones, presentación, modo solo lectura,
 * compartir, nota rápida, sugerencias inteligentes, calendario .ics, "clip" para añadir desde otras webs,
 * escáner de ISBN, favicon dinámico, contadores animados y pantalla de carga.
 * Se carga antes que app.js.
 */
'use strict';

// ============================================================
// 1. PÁGINA EXTRAS
// ============================================================
const EXTRA_TABS = {
    timeline: ['🕰️', 'Cronología'], diary: ['📔', 'Diario'], mood: ['💭', '¿Cómo te sientes?'], guess: ['🎮', 'Adivina'],
    challenges: ['🏁', 'Retos'], cleanup: ['🧹', 'Limpieza'], qa: ['❓', 'Preguntas']
};
let extrasTab = 'timeline', diaryDate = null, moodPick = null, guess = null, guessScore = { ok: 0, total: 0 }, timelineLimit = 60;
function renderExtras() {
    $('extrasTabs').innerHTML = Object.entries(EXTRA_TABS).map(([k, [i, l]]) => `<button class="tab ${extrasTab === k ? 'active' : ''}" data-act="extras-tab" data-id="${k}">${i} ${l}</button>`).join('');
    const box = $('extrasBody');
    const r = { timeline: extrasTimeline, diary: extrasDiary, mood: extrasMood, guess: extrasGuess, challenges: extrasChallenges, cleanup: extrasCleanup, qa: extrasQA }[extrasTab];
    box.innerHTML = r();
}
FEATURE_ACTIONS['extras-tab'] = k => { extrasTab = k; renderExtras(); };
const monthTitle = key => { const [y, m] = key.split('-').map(Number); const s = new Date(y, m - 1, 1).toLocaleDateString(APP_LOCALE, { month: 'long', year: 'numeric' }); return s.charAt(0).toUpperCase() + s.slice(1); };

function extrasTimeline() {
    const events = timelineEvents(appData);
    if (!events.length) return emptyState('🕰️', 'Tu historia empieza aquí', 'Agrega, empieza y termina obras para ver tu cronología.');
    const groups = groupByMonth(events.slice(0, timelineLimit));
    return `<div class="timeline">${groups.map(g => `<div class="tl-month"><h4>${esc(monthTitle(g.key))}</h4>${g.items.map(e => `
        <div class="tl-item tl-${e.kind}"><span class="tl-dot">${e.icon}</span><span class="tl-date">${esc(fmtDate(e.date))}</span>
        ${e.workId && getWorkById(e.workId) ? `<button class="tl-text link-btn" data-open="${e.workId}">${esc(e.text)}</button>` : `<span class="tl-text">${esc(e.text)}</span>`}</div>`).join('')}</div>`).join('')}</div>
        ${events.length > timelineLimit ? `<button class="btn btn-secondary btn-sm" data-act="timeline-more">Ver más</button>` : ''}`;
}
FEATURE_ACTIONS['timeline-more'] = () => { timelineLimit += 100; renderExtras(); };

function extrasDiary() {
    const key = diaryDate || todayISO();
    const d = diaryDay(appData, key);
    return `<div class="diary-head">
            <button class="icon-btn sm" data-act="diary-step" data-id="-1" aria-label="Día anterior">‹</button>
            <input type="date" class="text-input" id="diaryDate" value="${esc(key)}" max="${todayISO()}">
            <button class="icon-btn sm" data-act="diary-step" data-id="1" aria-label="Día siguiente" ${key >= todayISO() ? 'disabled' : ''}>›</button>
        </div>
        <div class="diary-section"><div class="pz-title">Lo que hiciste (automático)</div>
        ${d.auto.length ? `<div class="pick-list">${d.auto.map(x => `<button class="pick-item" data-open="${x.work.id}"><div class="thumb">${img(x.work.image, x.work.type, x.work.title)}</div>
            <span class="info"><b>${esc(x.work.title)}</b><small>${[x.started ? '▶️ empezada' : '', x.finished ? '✅ terminada' : '', x.sessions ? `${x.sessions} ${x.sessions === 1 ? 'sesión' : 'sesiones'}` : ''].filter(Boolean).join(' · ')}</small></span></button>`).join('')}</div>`
            : '<p class="viz-empty">Ese día no avanzaste nada.</p>'}</div>
        <div class="diary-section"><div class="pz-title">Tus apuntes</div>
            ${d.manual.map(m => `<div class="diary-entry"><p>${esc(m.text)}</p><button class="icon-btn sm" data-act="diary-del" data-id="${esc(m.id)}" aria-label="Borrar">✕</button></div>`).join('')}
            <div class="content-form"><textarea class="text-input" id="diaryText" rows="2" placeholder="¿Qué viste o leíste hoy? ¿Cómo te hizo sentir?"></textarea>
            <button class="btn btn-primary btn-sm" data-act="diary-add">＋ Apuntar</button></div></div>`;
}
FEATURE_ACTIONS['diary-step'] = d => { const k = dayKey(addDays(new Date((diaryDate || todayISO()) + 'T12:00:00'), Number(d))); diaryDate = k > todayISO() ? todayISO() : k; renderExtras(); };
FEATURE_ACTIONS['diary-add'] = () => {
    const text = $('diaryText').value.trim();
    if (!text) return;
    mutate(() => { appData.settings.diary = [...(appData.settings.diary || []), { id: generateId(), date: diaryDate || todayISO(), text }]; }, '📔 Apuntado en tu diario', { label: 'Apunte del diario' });
};
FEATURE_ACTIONS['diary-del'] = id => mutate(() => { appData.settings.diary = (appData.settings.diary || []).filter(d => d.id !== id); }, '✕ Apunte borrado', { label: 'Borrar apunte' });

function extrasMood() {
    const list = moodPick ? moodSuggestions(appData.works, moodPick) : [];
    return `<p class="panel-desc" style="margin:0 0 12px">Elige cómo te sientes y te propongo algo de tu colección.</p>
        <div class="mood-grid">${Object.entries(MOODS).map(([k, m]) => `<button class="mood-option ${moodPick === k ? 'is-on' : ''}" data-act="mood-pick" data-id="${k}"><span>${m.icon}</span>${esc(m.label)}</button>`).join('')}</div>
        ${moodPick ? (list.length ? `<p class="hint" style="margin:14px 0 8px">Para ${esc(MOODS[moodPick].why)}:</p><div class="pick-list">${list.map(x => `<button class="pick-item" data-open="${x.work.id}"><div class="thumb">${img(x.work.image, x.work.type, x.work.title)}</div>
            <span class="info"><b>${esc(x.work.title)}</b><small>${TYPE_META[x.work.type].icon} ${esc(getTypeLabel(x.work.type))} · ${esc(x.why)}</small></span></button>`).join('')}</div>`
            : '<p class="viz-empty">No encontré nada para ese ánimo. Añade spicy, tristeza y etiquetas a tus obras para afinar.</p>') : ''}`;
}
FEATURE_ACTIONS['mood-pick'] = k => { moodPick = k; renderExtras(); };

function extrasGuess() {
    if (!guess) guess = guessRound(appData.works);
    if (!guess) return emptyState('🎮', 'Necesitas al menos 4 obras con portada', 'Añade portadas para jugar.');
    const g = guess;
    return `<div class="guess">
        <div class="guess-score">Aciertos: <b>${guessScore.ok}</b> de ${guessScore.total}</div>
        <div class="guess-cover ${g.answered ? 'revealed' : ''}">${img(g.answer.image, g.answer.type, '')}</div>
        <div class="guess-options">${g.options.map(o => `<button class="btn ${g.answered ? (o.id === g.answer.id ? 'btn-success' : o.id === g.picked ? 'btn-danger' : 'btn-secondary') : 'btn-secondary'}" data-act="guess-pick" data-id="${o.id}" ${g.answered ? 'disabled' : ''}>${esc(o.title)}</button>`).join('')}</div>
        ${g.answered ? `<p class="guess-result">${g.picked === g.answer.id ? '🎉 ¡Correcto!' : `😅 Era “${esc(g.answer.title)}”`}</p><button class="btn btn-primary btn-sm" data-act="guess-next">Otra →</button>` : '<p class="hint">¿De qué obra es esta portada? (está borrosa hasta que respondas)</p>'}
    </div>`;
}
FEATURE_ACTIONS['guess-pick'] = id => { if (!guess || guess.answered) return; guess.answered = true; guess.picked = id; guessScore.total++; if (id === guess.answer.id) { guessScore.ok++; playSound('success'); } renderExtras(); };
FEATURE_ACTIONS['guess-next'] = () => { guess = guessRound(appData.works); renderExtras(); };

function extrasChallenges() {
    const active = appData.settings.challenges || [];
    const now = Date.now();
    return `${active.length ? `<div class="challenge-list">${active.map(ch => { const p = challengeProgress(ch, appData, now); return `<div class="challenge ${p.done ? 'is-done' : ''}">
            <span class="ch-icon">${p.done ? '🏆' : ch.icon}</span>
            <div class="ch-info"><b>${esc(ch.title)}</b><small>Desde el ${esc(fmtDate(ch.since))} · ${p.value} de ${p.goal}</small>
            <div class="progress-bar sm"><div class="progress-fill" style="width:${p.pct}%"></div></div></div>
            <button class="icon-btn sm" data-act="challenge-remove" data-id="${esc(ch.id)}" aria-label="Quitar reto">✕</button></div>`; }).join('')}</div>` : '<p class="panel-desc">Aún no tienes retos. ¡Elige uno!</p>'}
        <div class="pz-title" style="margin-top:16px">Retos para empezar</div>
        <div class="challenge-templates">${CHALLENGE_TEMPLATES.filter(t => !active.some(a => a.template === t.id)).map(t => `<button class="pick-item" data-act="challenge-add" data-id="${t.id}"><span class="ch-icon">${t.icon}</span><span class="info"><b>${esc(t.title)}</b><small>Empieza hoy</small></span></button>`).join('')}</div>`;
}
FEATURE_ACTIONS['challenge-add'] = id => {
    const t = CHALLENGE_TEMPLATES.find(x => x.id === id);
    if (!t) return;
    mutate(() => { appData.settings.challenges = [...(appData.settings.challenges || []), { ...t, id: generateId(), template: t.id, since: todayISO() }]; }, `🏁 Reto aceptado: ${t.title}`, { label: 'Nuevo reto' });
};
FEATURE_ACTIONS['challenge-remove'] = id => mutate(() => { appData.settings.challenges = (appData.settings.challenges || []).filter(c => c.id !== id); }, '✕ Reto quitado', { label: 'Quitar reto' });

function extrasCleanup() {
    const list = cleanupSuggestions(appData);
    if (!list.length) return emptyState('✨', '¡Todo en orden!', 'No encontré nada que limpiar.');
    return `<div class="cleanup-list">${list.map(g => `<details class="expandable"><summary>${g.icon} ${esc(g.text)} · ${g.items.length}</summary><div class="expandable-content"><div class="pick-list">
        ${g.items.slice(0, 30).map(x => x.title ? `<button class="pick-item" data-open="${x.id}"><div class="thumb">${img(x.image, x.type, x.title)}</div><span class="info"><b>${esc(x.title)}</b><small>${TYPE_META[x.type].icon} ${esc(getStatusLabel(x.status))}</small></span></button>`
            : `<button class="pick-item" data-coll="${x.id}"><span class="info"><b>🗂️ ${esc(x.name)}</b></span></button>`).join('')}
        ${g.id === 'stalled' ? `<button class="btn btn-secondary btn-sm" data-act="cleanup-drop">⏸️ Marcarlas todas como abandonadas</button>` : ''}</div></div></details>`).join('')}</div>`;
}
FEATURE_ACTIONS['cleanup-drop'] = () => {
    const g = cleanupSuggestions(appData).find(x => x.id === 'stalled');
    if (!g || !confirm(`¿Marcar ${g.items.length} obras como abandonadas? Podrás deshacerlo.`)) return;
    mutate(() => g.items.forEach(w => { w.status = 'abandonado'; }), `⏸️ ${g.items.length} obras abandonadas`, { label: 'Limpiar obras paradas' });
};

function extrasQA() {
    return `<div class="qa-list">${QA_QUESTIONS.map(([id, q]) => { const a = answerQuestion(id, appData); return `<details class="expandable"><summary>${esc(q)}</summary>
        <div class="expandable-content"><p>${esc(a.text)}</p>${a.workId ? `<button class="btn btn-secondary btn-sm" data-open="${a.workId}">Ver la obra</button>` : ''}</div></details>`; }).join('')}</div>`;
}

// ============================================================
// 2. CONSEJO DEL DÍA, TOUR Y PLANTILLAS
// ============================================================
const TIPS = [
    'Pulsa <kbd>Ctrl</kbd>+<kbd>K</kbd> para buscar o ir a cualquier sección.',
    'Escribe <code>BL nota:5</code> en un buscador para ver tus BL de cinco estrellas.',
    'Con <kbd>N</kbd> agregas una obra y con <kbd>Shift</kbd>+<kbd>N</kbd> varias seguidas (modo rápido).',
    'En la ficha de una obra, “🎯 Foco” abre un modo grande para ir sumando episodios.',
    'Las colecciones inteligentes se llenan solas: prueba con <code>tristeza:>=4</code>.',
    '¿Borraste algo sin querer? Pulsa <kbd>Ctrl</kbd>+<kbd>Z</kbd> o búscalo en la papelera (Personalizar).',
    'Usa “🔎 Rellenar datos por el título” al agregar una obra para no escribirlo todo.',
    'Guarda tus combinaciones de filtros como “vistas” con el botón ＋ Guardar vista.',
    'En Estadísticas, “🎁 Tu año en Mi Mundo” crea un resumen para compartir.',
    'Activa los avisos en Personalizar para que te recuerde los episodios de hoy.',
    'Arrastra el botón “➕ Mi Mundo” a tus marcadores para guardar obras desde cualquier web.',
    'Prueba las vistas Tabla, Estantería y Mosaico en Libros, Series o Anime.'
];
function renderTip() {
    const box = $('tipOfDay');
    if (!box) return;
    const s = appData.settings;
    box.hidden = !!s.tipsOff || s.tipHiddenOn === todayISO();
    if (box.hidden) return;
    const i = Math.abs([...todayISO()].reduce((a, c) => a * 31 + c.charCodeAt(0), 3)) % TIPS.length;
    box.innerHTML = `<span class="tip-icon">💡</span><span class="tip-text"><b>Consejo:</b> ${TIPS[i]}</span><button class="icon-btn sm" data-act="tip-hide" aria-label="Ocultar consejo">✕</button>`;
}
FEATURE_ACTIONS['tip-hide'] = () => { appData.settings.tipHiddenOn = todayISO(); saveData(); renderTip(); };

const TOUR_STEPS = [
    ['.sidebar .nav-section', '📚 Aquí están tus secciones: libros, series, anime, manhwas, BL y más.'],
    ['#page-home [data-add]', '＋ Agrega una obra. Puedes rellenar los datos solos buscando por el título.'],
    ['#heroBanner', '▶️ Lo que estás viendo o leyendo aparece aquí para seguir con un toque.'],
    ['#todayGrid', '🔥 Tu racha, tu reto del año y lo que se emite hoy.'],
    ['.sidebar-search', '🔍 Busca lo que sea o ve a cualquier sitio (también con Ctrl+K).'],
    ['[data-nav="stats"]', '📊 Estadísticas, rankings y tu resumen del año.'],
    ['[data-nav="settings"]', '⚙️ Personaliza colores, estilo, avisos, menú… y recupera lo borrado de la papelera.']
];
let tourStep = -1;
function startTour() { navigateTo('home'); tourStep = 0; renderTour(); }
function renderTour() {
    let layer = $('tourLayer');
    if (tourStep < 0 || tourStep >= TOUR_STEPS.length) {
        if (layer) layer.remove();
        tourStep = -1;
        return;
    }
    const [sel, text] = TOUR_STEPS[tourStep];
    const target = [...document.querySelectorAll(sel)].find(el => el.offsetParent !== null);
    if (!target) { tourStep++; renderTour(); return; }
    target.scrollIntoView({ block: 'center' });
    const r = target.getBoundingClientRect();
    if (!layer) { layer = document.createElement('div'); layer.id = 'tourLayer'; layer.className = 'tour-layer'; layer.setAttribute('role', 'dialog'); layer.setAttribute('aria-label', 'Tour de Mi Mundo'); document.body.appendChild(layer); }
    const below = r.bottom + 180 < window.innerHeight;
    layer.innerHTML = `<div class="tour-hole" style="left:${r.left - 6}px;top:${r.top - 6}px;width:${r.width + 12}px;height:${r.height + 12}px"></div>
        <div class="tour-card" style="left:${Math.max(12, Math.min(window.innerWidth - 332, r.left))}px;top:${below ? r.bottom + 14 : Math.max(12, r.top - 170)}px">
            <p>${esc(text)}</p>
            <div class="tour-actions"><span class="muted">${tourStep + 1} / ${TOUR_STEPS.length}</span>
            <button class="btn btn-ghost btn-sm" data-act="tour-end">Saltar</button>
            <button class="btn btn-primary btn-sm" data-act="tour-next">${tourStep === TOUR_STEPS.length - 1 ? '¡Listo!' : 'Siguiente →'}</button></div>
        </div>`;
    layer.querySelector('[data-act="tour-next"]').focus();
}
FEATURE_ACTIONS['tour'] = () => startTour();
FEATURE_ACTIONS['tour-next'] = () => { tourStep++; if (tourStep >= TOUR_STEPS.length) FEATURE_ACTIONS['tour-end'](); else renderTour(); };
FEATURE_ACTIONS['tour-end'] = () => { tourStep = -1; renderTour(); appData.settings.tourDone = true; saveData(); renderWelcome(); };
/** Tarjeta de bienvenida (primera vez): ofrece el tour. */
function renderWelcome() {
    const box = $('welcomeCard');
    if (!box) return;
    box.hidden = !!appData.settings.tourDone;
    if (box.hidden) return;
    box.innerHTML = `<span class="tip-icon">👋</span><span class="tip-text"><b>¡Hola! ¿Te enseño Mi Mundo en 1 minuto?</b> Verás dónde está cada cosa.</span>
        <button class="btn btn-primary btn-sm" data-act="tour">Hacer el tour</button><button class="btn btn-ghost btn-sm" data-act="tour-end">Ahora no</button>`;
}

const COLLECTION_TEMPLATES = [
    { name: '💖 Top BL', query: 'BL nota:>=4.5', desc: 'Tus BL de 4,5 estrellas o más' },
    { name: '😭 Para llorar', query: 'tristeza:>=4', desc: 'Historias que te rompieron' },
    { name: '🌶️ Picantes', query: 'spicy:>=4', desc: 'Las más subidas de tono' },
    { name: '🏁 Casi terminadas', query: 'estado:activo progreso:>=75', desc: 'Les queda poco' },
    { name: '⏳ Pendientes favoritas', query: 'estado:pendiente fav', desc: 'Lo que más ganas tienes de empezar' },
    { name: `🗓️ Lo mejor de ${new Date().getFullYear()}`, query: `fin:${new Date().getFullYear()} nota:>=4.5`, desc: 'Lo que más te gustó este año' },
    { name: '🍿 Maratón de finde', query: '', desc: 'Una lista a mano para el fin de semana' }
];
FEATURE_ACTIONS['coll-templates'] = () => openSheet('📋 Plantillas de colecciones', () => `<p class="panel-desc" style="margin:0 0 12px">Las que tienen búsqueda se llenan solas.</p>
    <div class="pick-list">${COLLECTION_TEMPLATES.map((t, i) => `<button class="pick-item" data-act="coll-template" data-id="${i}"><span class="info"><b>${esc(t.name)}</b><small>${esc(t.desc)}${t.query ? ` · ${searchWorks(appData.works, t.query).length} obras ahora` : ''}</small></span></button>`).join('')}</div>`);
FEATURE_ACTIONS['coll-template'] = i => {
    const t = COLLECTION_TEMPLATES[Number(i)];
    if (!t) return;
    closeModal('sheetModal');
    mutate(() => appData.collections.push({ id: generateId(), name: t.name, description: t.desc, items: [], smart: !!t.query, query: t.query, createdAt: Date.now() }), `🗂️ Colección “${t.name}” creada`, { label: 'Crear colección de plantilla' });
    navigateTo('collections');
};

// ============================================================
// 3. PRESENTACIÓN, SOLO LECTURA, COMPARTIR Y NOTA RÁPIDA
// ============================================================
let present = null;
function startPresentation(works, title = 'Mi Mundo') {
    const list = works.filter(Boolean);
    if (!list.length) { showToast('No hay obras para presentar'); return; }
    present = { list, i: 0, title, timer: null };
    const el = $('presentMode');
    el.hidden = false;
    if (el.requestFullscreen && !document.fullscreenElement) el.requestFullscreen().catch(() => {});
    renderPresentation();
    present.timer = setInterval(() => { present.i = (present.i + 1) % present.list.length; renderPresentation(); }, 6000);
}
function renderPresentation() {
    const w = present.list[present.i];
    $('presentMode').innerHTML = `<div class="present-bg" style="background-image:${esc(cssUrl(imageSrc(w.image, w.type)))}"></div>
        <div class="present-slide"><div class="present-cover">${img(w.image, w.type, w.title)}</div>
        <div class="present-info"><small>${esc(present.title)} · ${present.i + 1}/${present.list.length}</small><h2>${esc(w.title)}</h2>
        <p>${TYPE_META[w.type].icon} ${esc(getSubtitle(w))}</p>${w.rating ? `<div class="present-stars">${getStars(w.rating)} <b>${ratingText(w.rating)}</b></div>` : ''}
        ${w.synopsis ? `<p class="present-syn">${esc(w.synopsis.slice(0, 260))}</p>` : ''}</div></div>
        <button class="icon-btn present-close" data-act="present-close" aria-label="Salir">✕</button>`;
}
function stopPresentation() {
    if (!present) return;
    clearInterval(present.timer);
    present = null;
    $('presentMode').hidden = true;
    $('presentMode').innerHTML = '';
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
}
FEATURE_ACTIONS['present-close'] = () => stopPresentation();
FEATURE_ACTIONS['present-favs'] = () => startPresentation(appData.works.filter(w => w.favorite).concat(appData.works.filter(w => !w.favorite && Number(w.rating) >= 4.5)), '❤️ Mis favoritas');
FEATURE_ACTIONS['present-coll'] = id => { const c = getCollectionById(id); closeModal('sheetModal'); startPresentation(collectionWorks(c), c.name); };
function onPresentKey(e) {
    if (!present) return false;
    if (e.key === 'Escape') { stopPresentation(); return true; }
    if (e.key === 'ArrowRight' || e.key === ' ') { present.i = (present.i + 1) % present.list.length; renderPresentation(); return true; }
    if (e.key === 'ArrowLeft') { present.i = (present.i - 1 + present.list.length) % present.list.length; renderPresentation(); return true; }
    return false;
}

const isReadOnly = () => !!appData.settings.readOnly;
FEATURE_ACTIONS['readonly-toggle'] = () => {
    appData.settings.readOnly = !appData.settings.readOnly;
    applySettings(); saveData(); renderSettings();
    showToast(appData.settings.readOnly ? '👀 Modo solo lectura: nada se puede cambiar sin querer' : '✏️ Ya puedes editar de nuevo');
};

FEATURE_ACTIONS['share-work'] = async id => {
    const w = getWorkById(id);
    if (!w) return;
    const text = `${TYPE_META[w.type].icon} ${w.title}${w.rating ? ` · ${getStars(w.rating)}` : ''}${w.status === 'terminado' ? ' · ¡terminada!' : isActive(w) ? ` · ${getProgressText(w)}` : ''}\n${w.synopsis ? w.synopsis.slice(0, 140) + '\n' : ''}— desde Mi Mundo`;
    try {
        if (navigator.share) await navigator.share({ title: w.title, text });
        else { await navigator.clipboard.writeText(text); showToast('📋 Texto copiado para compartir'); }
    } catch (e) { /* cancelado */ }
};

FEATURE_ACTIONS['quick-note'] = id => {
    const w = getWorkById(id);
    if (!w) return;
    openSheet(`📝 Nota rápida: ${w.title}`, () => `<div class="note-type-row">${Object.entries(NOTE_TYPES).map(([k, t]) => `<label class="chip chip-muted note-type-opt"><input type="radio" name="qnType" value="${k}" ${k === 'comentario' ? 'checked' : ''}> ${t.icon} ${t.label}</label>`).join('')}</div>
        <textarea class="text-input" id="quickNoteText" rows="4" placeholder="Escribe lo que piensas…" style="width:100%;padding:10px"></textarea>
        <button class="btn btn-primary btn-sm" data-act="quick-note-save" data-id="${w.id}" style="margin-top:10px">Guardar nota</button>`);
    setTimeout(() => $('quickNoteText') && $('quickNoteText').focus(), 80);
};
FEATURE_ACTIONS['quick-note-save'] = id => {
    const w = getWorkById(id);
    const text = $('quickNoteText').value.trim();
    if (!w || !text) return;
    const type = (document.querySelector('input[name="qnType"]:checked') || {}).value || 'comentario';
    closeModal('sheetModal');
    mutate(() => appData.notes.push({ id: generateId(), workId: id, workTitle: w.title, content: text, type, createdAt: Date.now() }), '📝 Nota guardada', { label: 'Nota rápida' });
};

// ---------- Sugerencias inteligentes en la ficha ----------
function suggestionsHtml(w) {
    const list = workSuggestions(w, appData).filter(s => !(w.dismissed || []).includes(s.id));
    return list.length ? `<div class="smart-suggestions">${list.map(s => `<div class="smart-sugg"><span>${s.icon} ${esc(s.text)}</span>
        <span class="seg-inline"><button class="btn btn-primary btn-sm" data-act="${s.act}" data-id="${w.id}" ${s.collId ? `data-coll-id="${s.collId}"` : ''}>Sí</button>
        <button class="btn btn-ghost btn-sm" data-act="sugg-dismiss" data-id="${w.id}" data-sugg="${esc(s.id)}">No</button></span></div>`).join('')}</div>` : '';
}
FEATURE_ACTIONS['sugg-finish'] = id => { const w = getWorkById(id); if (w && !isLocked(w)) mutate(() => finishWork(w), `🎉 ¡Terminaste “${w.title}”!`, { type: 'success' }); };
FEATURE_ACTIONS['sugg-start'] = id => { const w = getWorkById(id); if (w && !isLocked(w)) mutate(() => { w.status = STATUS_BY_TYPE[w.type][0]; if (!w.startDate) w.startDate = todayISO(); }, '▶️ Marcada como en curso'); };
FEATURE_ACTIONS['sugg-rate'] = id => { const el = document.querySelector('#detailPanel .detail-rating'); if (el) { el.scrollIntoView({ block: 'center' }); el.classList.add('flash-ring'); setTimeout(() => el.classList.remove('flash-ring'), 1500); } };
FEATURE_ACTIONS['sugg-coll'] = (id, el) => { const c = getCollectionById(el.dataset.collId); if (c) mutate(() => { c.items = [...c.items, id]; }, `📂 Añadida a “${c.name}”`); };
FEATURE_ACTIONS['sugg-dismiss'] = (id, el) => { const w = getWorkById(id); if (w) mutate(() => { w.dismissed = [...(w.dismissed || []), el.dataset.sugg]; }, null, { undo: false }); };
/** Aviso de la campana: terminadas sin valorar. */
function rateReminderItems() {
    const list = unratedFinished(appData.works);
    return list.length ? [{ id: `rate:${list.length}:${list.map(w => w.id).join(',').length}`, icon: '⭐', workId: list[0].id, title: `${list.length === 1 ? 'Una obra terminada' : list.length + ' obras terminadas'} sin valorar`, text: `Empieza por “${list[0].title}”` }] : [];
}

// ============================================================
// 4. CALENDARIO, CLIP Y ESCÁNER DE ISBN
// ============================================================
FEATURE_ACTIONS['export-ics'] = () => {
    const ics = buildIcs(appData.works);
    if (!/BEGIN:VEVENT/.test(ics)) { showToast('📅 Asigna el día de emisión a tus obras en curso para crear el calendario', 'error', 5000); return; }
    downloadBlob(new Blob([ics], { type: 'text/calendar' }), 'mi-mundo-emisiones.ics');
    showToast('📅 Calendario descargado: ábrelo para añadirlo a Google Calendar, Apple o Outlook');
};
/** Marcador (bookmarklet) que abre Mi Mundo con el título, la portada y el enlace de la página que estás viendo. */
function clipperBookmarklet() {
    const base = location.protocol.startsWith('http') ? location.origin + location.pathname : 'https://evelingyiraish2008-arch.github.io/y/';
    const code = `(function(){var m=function(p){var e=document.querySelector('meta[property="'+p+'"],meta[name="'+p+'"]');return e?e.content:''};var t=m('og:title')||document.title;var i=m('og:image');window.open('${base}?accion=agregar&titulo='+encodeURIComponent(t)+'&imagen='+encodeURIComponent(i)+'&enlace='+encodeURIComponent(location.href),'_blank')})()`;
    return 'javascript:' + encodeURIComponent(code);
}
/** Si la app se abrió desde el marcador: abre el formulario con los datos. */
function presetFromParams(params) {
    const title = (params.get('titulo') || '').replace(/\s*[|·–-]\s*(Netflix|Viki|Crunchyroll|Goodreads|MyAnimeList|AniList|Webtoon|Wikipedia|IMDb|Amazon).*$/i, '').trim();
    const image = safeUrl(params.get('imagen'));
    const link = safeUrl(params.get('enlace'));
    const host = link ? new URL(link).hostname : '';
    const type = /webtoon|tapas|lezhin|mangadex/.test(host) ? 'manhwa' : /crunchyroll|myanimelist|anilist/.test(host) ? 'anime' : /goodreads|casadellibro|amazon|books\.google/.test(host) ? 'book' : /netflix|viki|primevideo|disney|imdb|mydramalist/.test(host) ? 'series' : 'book';
    return { type, preset: { ...(title ? { title } : {}), ...(image ? { image } : {}), ...(link ? { synopsis: `Guardado desde ${host}` } : {}) } };
}

let scanStream = null;
const canScan = () => typeof window !== 'undefined' && 'BarcodeDetector' in window && navigator.mediaDevices && navigator.mediaDevices.getUserMedia;
async function startIsbnScan() {
    if (!canScan()) { showToast('📷 Tu navegador no puede leer códigos de barras. Escribe el ISBN en el título y busca los datos.', 'error', 6000); return; }
    openSheet('📷 Escanear ISBN', () => `<div class="scan-box"><video id="scanVideo" playsinline muted></video><div class="scan-line"></div></div><p class="hint" style="text-align:center">Apunta al código de barras de la contraportada.</p>`);
    try {
        scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        const video = $('scanVideo');
        video.srcObject = scanStream;
        await video.play();
        const detector = new BarcodeDetector({ formats: ['ean_13'] }); // los ISBN-13 son códigos EAN-13
        const tick = async () => {
            if (!scanStream || !$('scanVideo')) return;
            try {
                const codes = await detector.detect(video);
                const code = (codes.find(c => /^(97[89])?\d{9}[\dX]$/.test(c.rawValue)) || {}).rawValue;
                if (code) { stopIsbnScan(); closeModal('sheetModal'); await isbnLookup(code); return; }
            } catch (e) { /* sigue intentándolo */ }
            requestAnimationFrame(tick);
        };
        tick();
    } catch (e) {
        stopIsbnScan();
        showToast('📷 No se pudo usar la cámara', 'error');
    }
}
function stopIsbnScan() { if (scanStream) { scanStream.getTracks().forEach(t => t.stop()); scanStream = null; } }
async function isbnLookup(isbn) {
    showToast(`🔎 Buscando el ISBN ${isbn}…`);
    try {
        const res = await fetch(`https://openlibrary.org/search.json?limit=1&fields=key,title,author_name,first_publish_year,cover_i,number_of_pages_median,subject&isbn=${encodeURIComponent(isbn)}`);
        const r = parseOpenLibrary(await res.json())[0];
        if (!r) { showToast('No encontré ese ISBN. Escribe el título y usa “Rellenar datos”.', 'error'); return; }
        if (!$('f_title').value) setFormField('title', r.title);
        Object.entries(mergeMetadata(collectWorkForm(), r)).forEach(([f, v]) => setFormField(f, v));
        if (r.coverLarge && !$('f_image').value) await useCover(r.coverLarge);
        showToast(`📚 “${r.title}” encontrado`);
    } catch (e) { showToast('❌ No se pudo buscar el ISBN (¿sin conexión?)', 'error'); }
}
FEATURE_ACTIONS['scan-isbn'] = () => startIsbnScan();

// ============================================================
// 5. DETALLES: FAVICON, CONTADORES, BIENVENIDA
// ============================================================
let faviconBase = null;
/** Pone un punto con el número de avisos sin ver en el icono de la pestaña. */
function updateFavicon(count) {
    const link = document.querySelector('link[rel="icon"][type="image/svg+xml"]');
    if (!link) return;
    if (!faviconBase) faviconBase = link.href;
    if (!count) { link.href = faviconBase; return; }
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='14' fill='#8b5cf6'/><text x='32' y='42' font-size='30' text-anchor='middle'>📚</text><circle cx='50' cy='14' r='13' fill='#ef4444'/><text x='50' y='19' font-size='15' font-weight='700' fill='#fff' text-anchor='middle' font-family='Arial'>${count > 9 ? '9+' : count}</text></svg>`;
    link.href = 'data:image/svg+xml,' + encodeURIComponent(svg);
}
/** Números que suben poco a poco hasta su valor (si cambian). */
function animateCount(el, to) {
    const from = Number(el.dataset.shown || 0);
    el.dataset.shown = to;
    if (from === to || reduceMotion()) { el.textContent = to; return; }
    const start = performance.now(), dur = 600;
    const step = t => { const k = Math.min(1, (t - start) / dur); el.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
}
const WELCOME_PHRASES = ['¿Qué historia te espera hoy?', 'Tu universo te estaba esperando.', 'Un capítulo más nunca hace daño.', 'Hoy es un buen día para empezar algo nuevo.', '¿Maratón o solo un episodio? 😉', 'Las mejores historias son las que se terminan.', 'Tu colección crece contigo.'];
function welcomePhrase(now = new Date()) { return WELCOME_PHRASES[(now.getDate() + now.getMonth()) % WELCOME_PHRASES.length]; }

if (typeof module !== 'undefined' && module.exports) module.exports = { presetFromParams, clipperBookmarklet, welcomePhrase };
