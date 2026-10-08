/*
 * Mi Mundo · imagefind.js
 * Panel lateral para buscar imágenes en varias fuentes a la vez (AniList, TMDB, Wikipedia,
 * Wikimedia Commons, MyAnimeList, Open Library y Google con tu clave).
 * Pinterest, Google Imágenes y Bing no dejan buscar desde otra web: se abren en otra pestaña
 * y se pega aquí el enlace de la imagen (o la imagen copiada).
 * Las respuestas de cada fuente se leen con las funciones de mediakit.js. Se carga antes que app.js.
 */
'use strict';

const IMG_SEARCH_SLOW_MS = 15000;
let imgSearch = null;

// ---------- Peticiones a cada fuente ----------
async function imgJson(url, opts = {}) {
    const res = await fetch(url, { ...opts, signal: imgSearch && imgSearch.abort.signal });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
}
const ANILIST_MEDIA_Q = 'query($q:String){Page(perPage:6){media(search:$q,sort:SEARCH_MATCH){title{romaji english} coverImage{extraLarge large} bannerImage siteUrl}}}';
const ANILIST_PEOPLE_Q = 'query($q:String){Page(perPage:6){staff(search:$q){name{full native} image{large medium} siteUrl} characters(search:$q){name{full native} image{large medium} siteUrl}}}';
const SOURCE_FETCH = {
    async anilist(q, use) {
        const query = use === 'photo' ? ANILIST_PEOPLE_Q : ANILIST_MEDIA_Q;
        const json = await imgJson('https://graphql.anilist.co', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ query, variables: { q } }) });
        return imgParseAnilist(json, use);
    },
    async tmdb(q, use) {
        const kind = use === 'photo' ? 'person' : 'multi';
        const json = await imgJson(`https://api.themoviedb.org/3/search/${kind}?api_key=${encodeURIComponent(appData.settings.tmdbKey)}&language=es-ES&query=${encodeURIComponent(q)}`);
        return imgParseTmdb(json, use);
    },
    async wikipedia(q) {
        const one = lang => imgJson(`https://${lang}.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(q)}&gsrlimit=6&prop=pageimages&piprop=original|thumbnail&pithumbsize=500&format=json&origin=*`).then(j => imgParseWikiPages(j, lang)).catch(() => []);
        const [es, en] = await Promise.all([one('es'), one('en')]);
        return interleave([es, en], 12);
    },
    async commons(q, use, page = 0) {
        const json = await imgJson(`https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(q + ' filetype:bitmap')}&gsrnamespace=6&gsrlimit=20&gsroffset=${page * 20}&prop=imageinfo&iiprop=url|size|mime&iiurlwidth=500&format=json&origin=*`);
        return imgParseCommons(json);
    },
    async commonsnew(q, use, page = 0) {
        // Lo más recién subido a Commons primero (fotos actuales, no de archivo)
        const json = await imgJson(`https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(q + ' filetype:bitmap')}&gsrnamespace=6&gsrsort=create_timestamp_desc&gsrlimit=20&gsroffset=${page * 20}&prop=imageinfo&iiprop=url|size|mime&iiurlwidth=500&format=json&origin=*`);
        return imgParseCommons(json);
    },
    async openverse(q, use, page = 0) {
        return imgParseOpenverse(await imgJson(`https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&page_size=20&page=${page + 1}&mature=false`));
    },
    async jikan(q, use) {
        const path = use === 'photo' ? 'people' : 'anime';
        return imgParseJikan(await imgJson(`https://api.jikan.moe/v4/${path}?q=${encodeURIComponent(q)}&limit=8`));
    },
    async openlibrary(q) {
        return imgParseOpenLibrary(await imgJson(`https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=10&fields=title,cover_i,key`));
    },
    async google(q, use, page = 0) {
        const s = appData.settings;
        return imgParseGoogle(await imgJson(`https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(s.googleKey)}&cx=${encodeURIComponent(s.googleCx)}&searchType=image&num=10&start=${page * 10 + 1}&q=${encodeURIComponent(q)}`));
    }
};
const PAGED_SOURCES = ['commons', 'commonsnew', 'openverse', 'google'];

// ---------- Panel ----------
/**
 * Abre el buscador.
 *  use: 'banner' | 'poster' | 'photo' | 'moodboard'
 *  onPick(src, meta): para elegir una sola imagen (se cierra al elegir).
 *  target: { kind, id } para elegir varias y usarlas en esa obra/persona/pareja (portada, banner o moodboard).
 */
function openImageSearch({ use = 'banner', query = '', ctx = '', onPick = null, target = null, type = '', people = [] } = {}) {
    if (imgSearch) imgSearch.abort.abort();
    imgSearch = { use, query: query.trim(), ctx, onPick, target, type, people, tab: 'all', orient: 'all', results: {}, errors: {}, pending: new Set(), selected: [], pages: {}, abort: new AbortController() };
    $('imgSearchQ').value = imgSearch.query;
    $('imgSearchTitle').textContent = { banner: '🔍 Buscar banner', poster: '🔍 Buscar portada', photo: '🔍 Buscar foto', moodboard: '🔍 Buscar imágenes' }[use] || '🔍 Buscar imágenes';
    $('imgSearchOrient').value = 'all';
    renderImgSearchTabs();
    renderImgSearchSuggest();
    renderCopyrightNote();
    openModal('imgSearchModal');
    if (imgSearch.query) runImageSearch(); else renderImgSearchResults();
    setTimeout(() => $('imgSearchQ').focus(), 60);
}
function renderCopyrightNote() {
    const box = $('imgSearchNotice');
    let seen = false;
    try { seen = sessionStorage.getItem('mi_mundo_aviso_imagenes') === '1'; } catch (e) { /* sin acceso */ }
    box.hidden = seen || appData.settings.imageCopyrightNotice === false;
    if (!box.hidden) { try { sessionStorage.setItem('mi_mundo_aviso_imagenes', '1'); } catch (e) { /* sin acceso */ } }
}
FEATURE_ACTIONS['img-notice-off'] = () => { appData.settings.imageCopyrightNotice = false; saveData(); $('imgSearchNotice').hidden = true; };
function renderImgSearchSuggest() {
    const s = imgSearch;
    const qs = suggestQueries({ name: s.query, kind: s.ctx || (s.use === 'photo' ? 'persons' : 'works'), type: s.type, people: s.people });
    $('imgSearchSuggest').innerHTML = qs.map(q => `<button type="button" class="chip chip-muted ${q === s.query ? 'is-on' : ''}" data-act="img-search-q" data-id="${esc(q)}">${esc(q)}</button>`).join('');
}
function renderImgSearchTabs() {
    const s = imgSearch;
    const srcs = activeSources(appData.settings, s.use);
    const count = k => (s.results[k] || []).length;
    // Lo normal: Recomendadas y Google/Pinterest. Las fuentes sueltas están escondidas en "Más fuentes" para no sobrecargar.
    const showSources = s.moreSources || !['all', 'web'].includes(s.tab);
    const tabs = [['all', '✨ Recomendadas'], ['web', '🌐 Google y Pinterest'], ...(showSources ? srcs.map(k => [k, `${IMAGE_SOURCES[k].icon} ${IMAGE_SOURCES[k].label.replace(' (con tu clave)', '')}`]) : [])];
    const moreBtn = `<button type="button" class="chip chip-muted tab-more" data-act="img-search-more-sources" aria-expanded="${showSources}">${showSources ? '▴ Menos fuentes' : '⋯ Más fuentes'}</button>`;
    $('imgSearchTabs').innerHTML = tabs.map(([k, l]) => `<button type="button" class="chip chip-muted ${s.tab === k ? 'is-on' : ''}" data-act="img-search-tab" data-id="${k}">${esc(l)}${k !== 'all' && k !== 'web' ? (s.pending.has(k) ? ' ⏳' : count(k) ? ` · ${count(k)}` : s.errors[k] ? ' ⚠️' : '') : ''}</button>`).join('') + moreBtn;
}
async function runImageSearch() {
    const s = imgSearch;
    if (!s.query) { renderImgSearchResults(); return; }
    s.abort.abort();
    s.abort = new AbortController();
    s.results = {}; s.errors = {}; s.pages = {}; s.selected = [];
    const srcs = activeSources(appData.settings, s.use);
    s.pending = new Set(srcs);
    s.started = Date.now();
    s.slow = false;
    clearTimeout(s.slowTimer);
    s.slowTimer = setTimeout(() => { if (imgSearch === s && s.pending.size) { s.slow = true; renderImgSearchResults(); } }, IMG_SEARCH_SLOW_MS);
    renderImgSearchTabs();
    renderImgSearchResults();
    const signal = s.abort.signal;
    await Promise.all(srcs.map(k => SOURCE_FETCH[k](s.query, s.use, 0)
        .then(list => { if (!signal.aborted) s.results[k] = list; })
        .catch(e => { if (!signal.aborted) s.errors[k] = e.message || 'error'; })
        .finally(() => {
            if (signal.aborted || imgSearch !== s) return;
            s.pending.delete(k);
            renderImgSearchTabs();
            renderImgSearchResults();
        })));
    clearTimeout(s.slowTimer);
}
/** Resultados de la pestaña actual (en "Recomendadas" se intercalan las fuentes, por orden de prioridad). */
function currentImgResults() {
    const s = imgSearch;
    const srcs = activeSources(appData.settings, s.use);
    let list = s.tab === 'all' ? interleave(srcs.map(k => s.results[k] || []), 80) : (s.results[s.tab] || []);
    // Para un banner primero lo horizontal; para una foto o portada, lo vertical o cuadrado
    if (s.tab === 'all' && s.orient === 'all') {
        const fits = r => (s.use === 'banner' ? r.o === 'horizontal' : s.use === 'moodboard' ? true : r.o !== 'horizontal');
        list = [...list.filter(fits), ...list.filter(r => !fits(r))];
    }
    return filterOrientation(list, s.orient);
}
function renderImgSearchResults() {
    const s = imgSearch;
    if (!s) return;
    const box = $('imgSearchResults'), status = $('imgSearchStatus');
    box.classList.toggle('is-web', s.tab === 'web');
    if (s.tab === 'web') { box.innerHTML = webTabHtml(); status.innerHTML = ''; updateImgSearchBar(); return; }
    const list = currentImgResults();
    const n = s.pending.size;
    status.innerHTML = !s.query ? '<p class="hint">Escribe qué buscas o elige una sugerencia.</p>'
        : n ? `<div class="img-search-wait"><span class="spinner" aria-hidden="true"></span> Buscando en ${n} ${n === 1 ? 'fuente' : 'fuentes'}…
            ${s.slow ? `<div class="img-search-slow">La búsqueda está tardando. ¿Continuar esperando? <button type="button" class="btn btn-secondary btn-sm" data-act="img-search-wait">Seguir esperando</button> <button type="button" class="btn btn-ghost btn-sm" data-act="img-search-stop">Ver lo que hay</button></div>` : ''}</div>`
        : !list.length ? `<div class="empty-state small"><div class="big">🫥</div><h4>Sin resultados</h4><p>Prueba otra búsqueda, cambia la orientación o mira en <button type="button" class="link-btn" data-act="img-search-tab" data-id="web">Pinterest y la web</button>. También puedes subir una imagen.</p></div>` : '';
    const sel = new Set(s.selected.map(r => r.src));
    box.innerHTML = list.map((r, i) => `<figure class="img-result ${sel.has(r.src) ? 'is-selected' : ''}">
        <button type="button" class="img-result-pick" data-act="img-search-pick" data-id="${i}" aria-label="${esc(r.title || 'Imagen')}"><img src="${esc(r.thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.closest('figure').hidden=true"></button>
        <figcaption><span class="img-origin">${IMAGE_SOURCES[r.origin] ? IMAGE_SOURCES[r.origin].icon : '🌐'} ${esc(r.title || '')}</span>${r.w ? `<small>${r.w}×${r.h}</small>` : ''}
        ${r.page ? `<a class="link-btn" href="${esc(r.page)}" target="_blank" rel="noopener noreferrer" title="Ver en su web">↗</a>` : ''}</figcaption>
        ${sel.has(r.src) ? '<span class="img-check">✓</span>' : ''}</figure>`).join('');
    const pagedTab = PAGED_SOURCES.includes(s.tab) && (s.results[s.tab] || []).length >= 10;
    $('imgSearchMore').hidden = !pagedTab || n > 0;
    updateImgSearchBar();
}
function webTabHtml() {
    const urls = webSearchUrls(imgSearch.query);
    return `<div class="img-web">
        <p class="panel-desc">Pinterest, Google Imágenes y Bing no dejan que otras apps busquen en ellos. Ábrelos aquí al lado, elige una imagen y:</p>
        <ol class="img-web-steps"><li>Ábrela en grande y mantén pulsado (o clic derecho) → <b>«Copiar dirección de la imagen»</b>.</li><li>Pégala abajo. También puedes <b>copiar la imagen</b> y pegarla con Ctrl+V.</li></ol>
        <div class="seg-inline wrap">
            <a class="btn btn-secondary btn-sm" href="${esc(urls.pinterest)}" target="_blank" rel="noopener noreferrer">📌 Abrir Pinterest</a>
            <a class="btn btn-secondary btn-sm" href="${esc(urls.google)}" target="_blank" rel="noopener noreferrer">🔎 Google Imágenes</a>
            <a class="btn btn-secondary btn-sm" href="${esc(urls.bing)}" target="_blank" rel="noopener noreferrer">🅱️ Bing</a>
            <a class="btn btn-secondary btn-sm" href="${esc(urls.unsplash)}" target="_blank" rel="noopener noreferrer">📷 Unsplash</a>
        </div>
        <div class="img-url-row" style="margin-top:12px"><input type="url" class="text-input" id="imgWebUrl" placeholder="Pega aquí el enlace de la imagen (https://i.pinimg.com/…)" autocomplete="off">
            <button type="button" class="btn btn-primary btn-sm" data-act="img-web-use">Usar</button></div>
        <input type="url" class="text-input" id="imgWebPage" placeholder="Enlace del pin o de la página (opcional, para guardar el origen)" autocomplete="off" style="margin-top:6px">
        <small class="img-error" id="imgWebError" hidden></small>
    </div>`;
}
function updateImgSearchBar() {
    const s = imgSearch, bar = $('imgSearchBar');
    const multi = !s.onPick && s.target;
    bar.hidden = !multi || !s.selected.length;
    if (bar.hidden) return;
    const one = s.selected.length === 1;
    const kind = s.target.kind;
    bar.innerHTML = `<span><b>${s.selected.length}</b> ${one ? 'seleccionada' : 'seleccionadas'}</span>
        ${one && kind === 'works' ? '<button type="button" class="btn btn-secondary btn-sm" data-act="img-search-use" data-id="image">Usar como portada</button>' : ''}
        ${one && kind === 'persons' ? '<button type="button" class="btn btn-secondary btn-sm" data-act="img-search-use" data-id="image">Usar como foto</button>' : ''}
        ${one ? '<button type="button" class="btn btn-secondary btn-sm" data-act="img-search-use" data-id="banner">Usar como banner</button>' : ''}
        <button type="button" class="btn btn-primary btn-sm" data-act="img-search-use" data-id="gallery">Añadir al moodboard</button>
        <button type="button" class="btn btn-ghost btn-sm" data-act="img-search-clear">Cancelar</button>`;
}

FEATURE_ACTIONS['img-search-q'] = q => { imgSearch.query = q; $('imgSearchQ').value = q; renderImgSearchSuggest(); runImageSearch(); };
FEATURE_ACTIONS['img-search-more-sources'] = () => {
    const s = imgSearch;
    const open = s.moreSources || !['all', 'web'].includes(s.tab);
    s.moreSources = !open;
    if (!s.moreSources && !['all', 'web'].includes(s.tab)) s.tab = 'all';
    renderImgSearchTabs();
    renderImgSearchResults();
};
FEATURE_ACTIONS['img-search-tab'] = k => { imgSearch.tab = k; renderImgSearchTabs(); renderImgSearchResults(); };
FEATURE_ACTIONS['img-search-wait'] = () => { imgSearch.slow = false; clearTimeout(imgSearch.slowTimer); imgSearch.slowTimer = setTimeout(() => { if (imgSearch.pending.size) { imgSearch.slow = true; renderImgSearchResults(); } }, IMG_SEARCH_SLOW_MS); renderImgSearchResults(); };
FEATURE_ACTIONS['img-search-stop'] = () => { imgSearch.abort.abort(); imgSearch.pending.clear(); imgSearch.slow = false; renderImgSearchTabs(); renderImgSearchResults(); };
FEATURE_ACTIONS['img-search-more'] = async () => {
    const s = imgSearch, k = s.tab;
    s.pages[k] = (s.pages[k] || 0) + 1;
    s.pending.add(k);
    renderImgSearchResults();
    try { s.results[k] = interleave([s.results[k] || [], await SOURCE_FETCH[k](s.query, s.use, s.pages[k])], 400); } catch (e) { /* no hay más */ }
    s.pending.delete(k);
    renderImgSearchTabs();
    renderImgSearchResults();
};
FEATURE_ACTIONS['img-search-pick'] = i => {
    const s = imgSearch;
    const r = currentImgResults()[Number(i)];
    if (!r) return;
    if (s.onPick) { pickImage(r); return; }
    const at = s.selected.findIndex(x => x.src === r.src);
    if (at >= 0) s.selected.splice(at, 1); else s.selected.push(r);
    renderImgSearchResults();
};
FEATURE_ACTIONS['img-search-clear'] = () => { imgSearch.selected = []; renderImgSearchResults(); };
function pickImage(r) {
    const s = imgSearch;
    closeModal('imgSearchModal', { force: true });
    imgSearch = null;
    s.abort.abort();
    s.onPick(r.src, { page: r.page, title: r.title, origin: r.origin });
}
FEATURE_ACTIONS['img-web-use'] = async () => {
    const url = $('imgWebUrl').value.trim(), page = $('imgWebPage').value.trim();
    const problem = await checkImageUrl(url);
    const err = $('imgWebError');
    err.hidden = !problem;
    err.textContent = problem ? '⚠️ ' + problem : '';
    if (problem) return;
    const r = { src: url, thumb: url, title: '', page: /^https?:\/\//i.test(page) ? page : '', origin: /pinimg|pinterest/i.test(url + page) ? 'pinterest' : 'web' };
    if (imgSearch.onPick) { pickImage(r); return; }
    imgSearch.selected.push(r);
    $('imgWebUrl').value = ''; $('imgWebPage').value = '';
    updateImgSearchBar();
    showToast('➕ Imagen añadida a la selección');
};
/** Usa las imágenes elegidas en la obra/persona/pareja: portada, banner o moodboard. */
FEATURE_ACTIONS['img-search-use'] = async field => {
    const s = imgSearch;
    if (!s || !s.target || !s.selected.length) return;
    const { kind, id } = s.target;
    const getter = { works: getWorkById, persons: getPersonById, couples: getCoupleById }[kind];
    const rec = getter && getter(id);
    if (!rec) return;
    const picked = s.selected.slice();
    closeModal('imgSearchModal', { force: true });
    imgSearch = null;
    s.abort.abort();
    const imgKind = field === 'banner' ? 'banner' : field === 'image' ? (kind === 'persons' ? 'avatar' : 'poster') : null;
    showToast(`⏳ Guardando ${picked.length} ${picked.length === 1 ? 'imagen' : 'imágenes'}…`);
    const refs = [];
    for (const r of picked) refs.push({ ref: await storeRemoteImage(r.src, imgKind), meta: r });
    if (field === 'gallery') { addToMoodboard(kind, id, refs); return; }
    const { ref, meta } = refs[0];
    mutate(() => {
        rec[field] = ref;
        if (mediaSetting('sourceLink') && meta.page) rec.mediaSources = { ...(rec.mediaSources || {}), [field]: meta.page };
        rec.updatedAt = Date.now();
    }, field === 'banner' ? '🖼️ Banner guardado' : '🖼️ Imagen guardada', { label: field === 'banner' ? 'Cambiar banner' : 'Cambiar imagen' });
};
/** Descarga y prepara una imagen de otra web; si no se puede, se queda el enlace. kind = null: solo se reduce (moodboard). */
async function storeRemoteImage(url, kind) {
    if (!mediaSetting('download') || !/^https?:/i.test(url)) return url;
    try {
        if (kind) { const { blob } = await downloadImage(url, kind); return await store.saveImage(blob); }
        const local = URL.createObjectURL(await fetchImageBlob(url));
        try { return await store.saveImage(await compressImage(local, 'gallery')); } finally { URL.revokeObjectURL(local); }
    } catch (e) { return url; }
}

// ---------- Eventos del panel ----------
document.addEventListener('DOMContentLoaded', () => {
    const form = $('imgSearchForm');
    if (!form) return;
    form.addEventListener('submit', e => {
        e.preventDefault();
        if (!imgSearch) return;
        imgSearch.query = $('imgSearchQ').value.trim();
        if (imgSearch.tab === 'web') imgSearch.tab = 'all';
        renderImgSearchSuggest();
        renderImgSearchTabs();
        runImageSearch();
    });
    $('imgSearchOrient').addEventListener('change', e => { imgSearch.orient = e.target.value; renderImgSearchResults(); });
    $('imgSearchModal').addEventListener('paste', e => {
        if (!imgSearch) return;
        const item = [...((e.clipboardData && e.clipboardData.items) || [])].find(i => i.type.startsWith('image/'));
        if (!item) return;
        e.preventDefault();
        const file = item.getAsFile();
        if (imgSearch.onPick) {
            const s = imgSearch;
            closeModal('imgSearchModal', { force: true });
            imgSearch = null;
            if (s.onPickFile) s.onPickFile(file); else s.onPick(URL.createObjectURL(file), { origin: 'paste' });
        } else showToast('📋 Para el moodboard, usa “📤 Subir varias”', 'info');
    });
    // Cargar más al llegar al final (fuentes con páginas)
    if ('IntersectionObserver' in window) {
        new IntersectionObserver(entries => {
            if (entries.some(e => e.isIntersecting) && imgSearch && !$('imgSearchMore').hidden) FEATURE_ACTIONS['img-search-more']();
        }, { root: $('imgSearchScroll') }).observe($('imgSearchMore'));
    }
});
document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.id === 'imgWebUrl') { e.preventDefault(); e.stopPropagation(); FEATURE_ACTIONS['img-web-use'](); }
}, true);

// ============================================================
// PERSONALIZAR → FUENTES DE IMÁGENES
// ============================================================
function renderImageSourcesPanel() {
    const box = $('imageSourcesBody');
    if (!box) return;
    const s = appData.settings;
    const off = new Set(s.imageSourcesOff || []);
    const order = [...new Set([...(s.imageSourceOrder || []), ...DEFAULT_SOURCE_ORDER])].filter(k => IMAGE_SOURCES[k]);
    box.innerHTML = `
        <p class="panel-desc" style="margin:-6px 0 10px">Orden en el que se muestran en “Recomendadas”. Las que necesitan clave solo se usan si la pones.</p>
        <div class="nav-editor">${order.map((k, i) => { const src = IMAGE_SOURCES[k]; const needs = src.key && !(s[src.key] && (k !== 'google' || s.googleCx)); return `<div class="nav-edit-row" data-src-row="${k}">
            <span>${src.icon} ${esc(src.label)}${needs ? ' <small class="muted">· falta la clave</small>' : ''}</span>
            <span class="nav-edit-actions">
                <button class="icon-btn sm" data-act="src-move" data-id="${k}:-1" aria-label="Subir" ${i === 0 ? 'disabled' : ''}>↑</button>
                <button class="icon-btn sm" data-act="src-move" data-id="${k}:1" aria-label="Bajar" ${i === order.length - 1 ? 'disabled' : ''}>↓</button>
                <input type="checkbox" data-src-on="${k}" ${off.has(k) ? '' : 'checked'} aria-label="Usar ${esc(src.label)}">
            </span></div>`; }).join('')}</div>
        <div class="form-grid" style="margin-top:12px">
            <label class="field span-2"><span>Clave de Google Custom Search (opcional)</span><input type="text" class="text-input" id="settingGoogleKey" value="${esc(s.googleKey || '')}" placeholder="AIza…" autocomplete="off"></label>
            <label class="field span-2"><span>ID del buscador de Google (cx)</span><input type="text" class="text-input" id="settingGoogleCx" value="${esc(s.googleCx || '')}" placeholder="0123…:abc" autocomplete="off"></label>
        </div>
        <p class="hint">La clave de TMDB está en “Datos automáticos”. Pinterest no tiene API abierta: se abre en otra pestaña y pegas el enlace de la imagen.</p>
        <div class="setting-row"><span>🔗 Guardar el enlace de origen de cada imagen</span><button class="toggle-switch" data-act="media-toggle" data-id="imageSourceLink" role="switch" aria-checked="${mediaSetting('sourceLink')}" aria-label="Guardar el enlace de origen"></button></div>
        <div class="setting-row"><span>📜 Recordar los derechos de autor al buscar</span><button class="toggle-switch" data-act="media-toggle" data-id="imageCopyrightNotice" role="switch" aria-checked="${s.imageCopyrightNotice !== false}" aria-label="Aviso de derechos de autor"></button></div>`;
}
FEATURE_ACTIONS['src-move'] = arg => {
    const [k, d] = arg.split(':');
    const order = [...new Set([...(appData.settings.imageSourceOrder || []), ...DEFAULT_SOURCE_ORDER])].filter(x => IMAGE_SOURCES[x]);
    const i = order.indexOf(k), j = i + Number(d);
    if (i < 0 || j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    appData.settings.imageSourceOrder = order;
    saveData();
    renderImageSourcesPanel();
};
document.addEventListener('change', e => {
    const t = e.target;
    if (t.dataset && t.dataset.srcOn) {
        const off = new Set(appData.settings.imageSourcesOff || []);
        if (t.checked) off.delete(t.dataset.srcOn); else off.add(t.dataset.srcOn);
        appData.settings.imageSourcesOff = [...off];
        saveData();
    }
    if (t.id === 'settingGoogleKey' || t.id === 'settingGoogleCx') { appData.settings[t.id === 'settingGoogleKey' ? 'googleKey' : 'googleCx'] = t.value.trim(); saveData(); renderImageSourcesPanel(); }
});
