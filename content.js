/*
 * Mi Mundo · content.js
 * Contenido extra de cada obra: citas (y "Cita del día"), galería, personajes favoritos,
 * banda sonora, premios y curiosidades. Se carga antes que app.js.
 */
'use strict';

const CONTENT_TABS = {
    quotes: { icon: '❝', label: 'Citas' },
    gallery: { icon: '🖼️', label: 'Galería' },
    characters: { icon: '🎭', label: 'Personajes' },
    soundtrack: { icon: '🎵', label: 'Música' },
    awards: { icon: '🏆', label: 'Premios' },
    trivia: { icon: '💡', label: 'Curiosidades' }
};
const CHARACTER_ROLES = { protagonista: 'Protagonista', secundario: 'Secundario', villano: 'Villano', otro: 'Otro' };
let contentTab = 'quotes';
const contentCount = w => Object.keys(CONTENT_TABS).reduce((a, k) => a + ((w[k] || []).length), 0);

/** "Cita del día": una de tus citas (primero las favoritas), la misma durante todo el día. */
function quoteOfTheDay(works, now = Date.now()) {
    const all = [];
    works.forEach(w => (w.quotes || []).forEach(q => all.push({ ...q, work: w })));
    if (!all.length) return null;
    const favs = all.filter(q => q.fav);
    const pool = favs.length ? favs : all;
    const seed = [...dayKey(now)].reduce((a, c) => a * 31 + c.charCodeAt(0), 7);
    return pool[Math.abs(seed) % pool.length];
}
/** Valida que un enlace sea http(s) para no abrir nada raro. */
const safeUrl = u => (/^https?:\/\//i.test(String(u || '').trim()) ? String(u).trim() : '');

function contentSectionHtml(w, openState) {
    const n = contentCount(w);
    const tab = CONTENT_TABS[contentTab] ? contentTab : 'quotes';
    const list = w[tab] || [];
    const tabs = Object.entries(CONTENT_TABS).map(([k, t]) => `<button class="chip chip-muted ${k === tab ? 'is-on' : ''}" data-act="content-tab" data-id="${k}">${t.icon} ${t.label}${(w[k] || []).length ? ` · ${(w[k] || []).length}` : ''}</button>`).join('');
    let body = '';
    if (tab === 'quotes') {
        body = `<div class="content-form">
            <textarea class="text-input" id="cQuoteText" placeholder="“La frase que no quieres olvidar…”" rows="2"></textarea>
            <input type="text" class="text-input" id="cQuoteCtx" placeholder="¿Quién la dice / en qué episodio o página?">
            <button class="btn btn-primary btn-sm" data-act="content-add" data-id="${w.id}">＋ Guardar cita</button></div>
            <div class="content-list">${list.slice().reverse().map(q => `<blockquote class="quote-item ${q.fav ? 'is-fav' : ''}"><p>${esc(q.text)}</p>
                <footer>${q.context ? esc(q.context) + ' · ' : ''}${esc(fmtDate(q.date))}
                <button class="link-btn" data-act="content-fav" data-id="${w.id}" data-item="${q.id}">${q.fav ? '★ Favorita' : '☆ Favorita'}</button>
                <button class="link-btn danger" data-act="content-del" data-id="${w.id}" data-item="${q.id}" data-kind="quotes">Quitar</button></footer></blockquote>`).join('')}</div>`;
    } else if (tab === 'gallery') {
        body = `<div class="content-form inline">
            <button type="button" class="btn btn-primary btn-sm" data-upload="galleryFile">📤 Subir imagen</button>
            <input type="file" id="galleryFile" accept="image/*" hidden data-target="galleryInput" data-kind="gallery" data-work="${w.id}">
            <input type="hidden" id="galleryInput">
            <input type="url" class="text-input" id="cGalleryUrl" placeholder="…o pega la URL de una imagen">
            <button class="btn btn-secondary btn-sm" data-act="content-add" data-id="${w.id}">Añadir</button></div>
            <div class="gallery-grid">${(w.gallery || []).map((src, i) => `<figure class="gallery-item"><button class="gallery-open" data-act="gallery-view" data-id="${w.id}" data-item="${i}">${img(src, 'banner', `Imagen ${i + 1}`)}</button>
                <button class="icon-btn sm gallery-del" data-act="content-del" data-id="${w.id}" data-item="${i}" data-kind="gallery" aria-label="Quitar imagen">✕</button></figure>`).join('')}</div>`;
    } else if (tab === 'characters') {
        const persons = appData.persons.slice().sort((a, b) => a.name.localeCompare(b.name, 'es'));
        body = `<div class="content-form grid">
            <input type="text" class="text-input" id="cCharName" placeholder="Nombre del personaje">
            <select class="text-input" id="cCharRole">${Object.entries(CHARACTER_ROLES).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select>
            <select class="text-input" id="cCharPerson"><option value="">Interpretado por… (opcional)</option>${persons.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select>
            <input type="text" class="text-input" id="cCharNote" placeholder="¿Por qué te encanta?">
            <button class="btn btn-primary btn-sm" data-act="content-add" data-id="${w.id}">＋ Añadir personaje</button></div>
            <div class="content-list">${list.map(c => { const p = getPersonById(c.personId); return `<div class="pick-item character-item">
                <div class="thumb round">${p ? img(p.image, 'person', p.name) : '🎭'}</div>
                <span class="info"><b>${c.fav ? '♥ ' : ''}${esc(c.name)}</b><small>${esc(CHARACTER_ROLES[c.role] || '')}${p ? ` · <button class="link-btn" data-person="${p.id}">${esc(p.name)}</button>` : ''}${c.note ? ' · ' + esc(c.note) : ''}</small></span>
                <button class="icon-btn sm" data-act="content-fav" data-id="${w.id}" data-item="${c.id}" data-kind="characters" aria-label="Favorito">${c.fav ? '♥' : '♡'}</button>
                <button class="icon-btn sm" data-act="content-del" data-id="${w.id}" data-item="${c.id}" data-kind="characters" aria-label="Quitar">✕</button></div>`; }).join('')}</div>`;
    } else if (tab === 'soundtrack') {
        body = `<div class="content-form grid">
            <select class="text-input" id="cSongKind"><option value="OP">Opening</option><option value="ED">Ending</option><option value="OST">Banda sonora</option><option value="Insert">Canción</option></select>
            <input type="text" class="text-input" id="cSongTitle" placeholder="Título de la canción">
            <input type="text" class="text-input" id="cSongArtist" placeholder="Artista">
            <input type="url" class="text-input" id="cSongUrl" placeholder="Enlace (YouTube, Spotify…)">
            <button class="btn btn-primary btn-sm" data-act="content-add" data-id="${w.id}">＋ Añadir canción</button></div>
            <div class="content-list">${list.map(s => `<div class="pick-item song-item"><span class="chip">${esc(s.kind)}</span>
                <span class="info"><b>${esc(s.title)}</b><small>${esc(s.artist || '')}</small></span>
                ${safeUrl(s.url) ? `<a class="btn btn-secondary btn-sm" href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener noreferrer">▶️ Escuchar</a>` : ''}
                <button class="icon-btn sm" data-act="content-del" data-id="${w.id}" data-item="${s.id}" data-kind="soundtrack" aria-label="Quitar">✕</button></div>`).join('')}</div>`;
    } else if (tab === 'awards') {
        body = `<div class="content-form grid">
            <input type="text" class="text-input" id="cAwardName" placeholder="Premio (ej.: Mejor serie BL)">
            <input type="number" class="text-input" id="cAwardYear" placeholder="Año" min="1900" max="2100">
            <button class="btn btn-primary btn-sm" data-act="content-add" data-id="${w.id}">＋ Añadir premio</button></div>
            <div class="content-list">${list.map(a => `<div class="pick-item award-item"><span class="award-medal">🏆</span>
                <span class="info"><b>${esc(a.name)}</b><small>${esc(a.year || '')}</small></span>
                <button class="icon-btn sm" data-act="content-del" data-id="${w.id}" data-item="${a.id}" data-kind="awards" aria-label="Quitar">✕</button></div>`).join('')}</div>`;
    } else {
        body = `<div class="content-form">
            <textarea class="text-input" id="cTrivia" placeholder="Una curiosidad: detrás de cámaras, datos, referencias…" rows="2"></textarea>
            <button class="btn btn-primary btn-sm" data-act="content-add" data-id="${w.id}">＋ Añadir curiosidad</button></div>
            <ul class="trivia-list">${list.map(t => `<li>💡 ${esc(t.text)} <button class="link-btn danger" data-act="content-del" data-id="${w.id}" data-item="${t.id}" data-kind="trivia">Quitar</button></li>`).join('')}</ul>`;
    }
    return `<details class="expandable" data-key="content" ${openState ?? n ? 'open' : ''}>
        <summary>✨ Más contenido${n ? ' · ' + n : ''}</summary>
        <div class="expandable-content"><div class="pick-filters content-tabs">${tabs}</div>${body}</div>
    </details>`;
}
FEATURE_ACTIONS['content-tab'] = k => { contentTab = k; renderDetail(true); };
FEATURE_ACTIONS['content-add'] = id => {
    const w = getWorkById(id);
    if (!w) return;
    const now = Date.now();
    const val = x => ($(x) ? $(x).value.trim() : '');
    let item, kind = contentTab, msg;
    if (kind === 'quotes') { if (!val('cQuoteText')) { showToast('✍️ Escribe la cita', 'error'); return; } item = { id: generateId(), text: val('cQuoteText'), context: val('cQuoteCtx'), date: todayISO() }; msg = '❝ Cita guardada'; }
    else if (kind === 'gallery') { const url = safeUrl(val('cGalleryUrl')); if (!url) { showToast('⚠️ Pega una URL que empiece por http', 'error'); return; } addGalleryImage(w, url); return; }
    else if (kind === 'characters') { if (!val('cCharName')) { showToast('✍️ Escribe el nombre del personaje', 'error'); return; } item = { id: generateId(), name: val('cCharName'), role: val('cCharRole'), personId: val('cCharPerson'), note: val('cCharNote') }; msg = '🎭 Personaje añadido'; }
    else if (kind === 'soundtrack') { if (!val('cSongTitle')) { showToast('✍️ Escribe el título de la canción', 'error'); return; } item = { id: generateId(), kind: val('cSongKind'), title: val('cSongTitle'), artist: val('cSongArtist'), url: safeUrl(val('cSongUrl')) }; msg = '🎵 Canción añadida'; }
    else if (kind === 'awards') { if (!val('cAwardName')) { showToast('✍️ Escribe el premio', 'error'); return; } item = { id: generateId(), name: val('cAwardName'), year: Number(val('cAwardYear')) || '' }; msg = '🏆 Premio añadido'; }
    else { if (!val('cTrivia')) { showToast('✍️ Escribe la curiosidad', 'error'); return; } item = { id: generateId(), text: val('cTrivia') }; kind = 'trivia'; msg = '💡 Curiosidad añadida'; }
    Object.keys(item).forEach(k => { if (item[k] === '') delete item[k]; });
    mutate(() => { w[kind] = [...(w[kind] || []), item]; w.updatedAt = now; }, msg, { label: msg.replace(/^\S+\s/, '') });
};
function addGalleryImage(w, src) {
    if ((w.gallery || []).length >= 30) { showToast('⚠️ Máximo 30 imágenes por obra', 'error'); return; }
    mutate(() => { w.gallery = [...(w.gallery || []), src]; }, '🖼️ Imagen añadida a la galería', { label: `Galería de “${w.title}”` });
}
/** La subida de imágenes deja la referencia en #galleryInput y avisa con 'input'. */
function onGalleryUploaded(input) {
    const file = $('galleryFile');
    const w = getWorkById(file && file.dataset.work);
    if (w && input.value) addGalleryImage(w, input.value);
    input.value = '';
}
FEATURE_ACTIONS['content-del'] = (id, el) => {
    const w = getWorkById(id);
    const kind = el.dataset.kind || contentTab;
    if (!w || !w[kind]) return;
    mutate(() => {
        w[kind] = kind === 'gallery' ? w.gallery.filter((_, i) => i !== Number(el.dataset.item)) : w[kind].filter(x => x.id !== el.dataset.item);
        if (!w[kind].length) delete w[kind];
    }, '✕ Quitado', { label: 'Quitar contenido' });
};
FEATURE_ACTIONS['content-fav'] = (id, el) => {
    const w = getWorkById(id);
    const kind = el.dataset.kind || 'quotes';
    const it = w && (w[kind] || []).find(x => x.id === el.dataset.item);
    if (it) mutate(() => { it.fav = !it.fav; }, it.fav ? 'Quitada de favoritas' : '★ Marcada como favorita');
};
FEATURE_ACTIONS['gallery-view'] = (id, el) => {
    const w = getWorkById(id);
    if (!w) return;
    let i = Number(el.dataset.item);
    const show = () => openSheet(`🖼️ ${w.title} · ${i + 1}/${w.gallery.length}`, () => `<div class="gallery-big">${img(w.gallery[i], 'banner', '')}</div>
        <div class="seg-inline" style="justify-content:center;margin-top:12px">
            <button class="btn btn-secondary btn-sm" data-act="gallery-step" data-id="${w.id}" data-item="${(i - 1 + w.gallery.length) % w.gallery.length}">← Anterior</button>
            <button class="btn btn-secondary btn-sm" data-act="gallery-cover" data-id="${w.id}" data-item="${i}">Usar como portada</button>
            <button class="btn btn-secondary btn-sm" data-act="gallery-step" data-id="${w.id}" data-item="${(i + 1) % w.gallery.length}">Siguiente →</button></div>`);
    show();
};
FEATURE_ACTIONS['gallery-step'] = (id, el) => FEATURE_ACTIONS['gallery-view'](id, el);
FEATURE_ACTIONS['gallery-cover'] = (id, el) => {
    const w = getWorkById(id);
    if (!w) return;
    closeModal('sheetModal');
    mutate(() => { w.image = w.gallery[Number(el.dataset.item)]; }, '🖼️ Portada cambiada', { label: `Portada de “${w.title}”` });
};

/** Tarjeta "Cita del día" en Inicio. */
function renderQuoteOfDay() {
    const box = $('quoteOfDay');
    if (!box) return;
    const q = quoteOfTheDay(appData.works);
    box.hidden = !q;
    if (!q) return;
    box.innerHTML = `<div class="qod-mark">❝</div><blockquote><p>${esc(q.text)}</p>
        <footer>${q.context ? esc(q.context) + ' · ' : ''}<button class="link-btn" data-open="${q.work.id}">${esc(q.work.title)}</button></footer></blockquote>`;
}

if (typeof module !== 'undefined' && module.exports) module.exports = { quoteOfTheDay, safeUrl };
