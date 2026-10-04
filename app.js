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
    }
}
function isQuotaError(e) {
    return e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22 || e.code === 1014);
}
async function persistNow() {
    await store.save(appData);
    if (syncChannel) syncChannel.postMessage({ type: 'saved' });
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
/** Aplica un cambio en memoria, lo guarda y actualiza la vista. */
function mutate(fn, msg) {
    fn();
    saveData();
    if (msg) showToast(msg);
    refreshView();
    return true;
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
        { id: 'p5', name: 'Park Seo Ham', type: 'actor', works: 12, rating: 5, image: 'https://i.pravatar.cc/300?img=13', bl: true, nationality: 'Corea del Sur', bio: 'Actor y modelo.', createdAt: now - day * 15 }
    ];
    appData.couples = [
        { id: 'c1', name: 'First & Khaotung', works: 12, rating: 5, image: IMG_E, favorite: true, createdAt: now - day * 25 },
        { id: 'c2', name: 'Bright & Win', works: 8, rating: 4.5, image: IMG_C, favorite: false, createdAt: now - day * 20 },
        { id: 'c3', name: 'Park Seo Ham & Park Jae Chan', works: 1, rating: 5, image: IMG_E, favorite: true, createdAt: now - day * 10 }
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
    <article class="card" data-open="${w.id}" data-id="${w.id}" tabindex="0" aria-label="${esc(w.title)}">
      <div class="card-cover">
        ${img(w.image, w.type, w.title)}
        <div class="card-top">
          <span class="pill ${statusClass(w.status)}">${esc(getStatusLabel(w.status))}</span>
          ${w.bl ? '<span class="pill bl">BL</span>' : ''}
          ${opts.showType ? `<span class="pill">${TYPE_META[w.type].icon} ${esc(getTypeLabel(w.type))}</span>` : ''}
          <span class="spacer"></span>
          ${w.rating ? `<span class="pill rating">★ ${ratingText(w.rating)}</span>` : ''}
        </div>
        <div class="card-bottom">
          ${(isActive(w) || opts.showProgress) && getTotal(w) ? `<span class="pill">${esc(getProgressText(w))}</span>` : ''}
          <div class="card-actions">
            ${quickPlus ? `<button class="card-act" data-act="progress" title="Avanzar progreso" aria-label="Avanzar progreso">＋</button>` : ''}
            <button class="card-act" data-act="edit" title="Editar" aria-label="Editar">✎</button>
            <button class="card-act danger" data-act="delete" title="Eliminar" aria-label="Eliminar">✕</button>
          </div>
        </div>
        ${p > 0 && p < 100 ? `<div class="card-progress"><span style="width:${p}%"></span></div>` : ''}
      </div>
      <div class="card-body">
        <h4 class="card-title">${w.favorite ? '<span class="fav">♥</span>' : ''}<span class="t">${esc(w.title)}</span></h4>
        <div class="card-sub">${esc(getSubtitle(w))}</div>
        ${opts.compact ? '' : `<div class="card-meta"><span class="stars">${getStars(w.rating)}</span>${w.spicy ? `<span title="Spicy">🌶️${w.spicy}</span>` : ''}${w.sadness ? `<span title="Tristeza">💧${w.sadness}</span>` : ''}</div>`}
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
function hbars(container, entries, emptyMsg) {
    if (!entries.length) { container.innerHTML = `<div class="empty-state" style="padding:24px"><p>${esc(emptyMsg)}</p></div>`; return; }
    const max = Math.max(...entries.map(e => e[1]), 1);
    container.innerHTML = entries.map(([label, count]) => `
        <div class="hbar"><span class="hbar-label" title="${esc(label)}">${esc(label)}</span><div class="hbar-track"><div class="hbar-fill" style="width:${(count / max) * 100}%"></div></div><span class="hbar-val">${count}</span></div>`).join('');
}
function vbars(container, items, color) {
    const max = Math.max(1, ...items.flatMap(i => i.values || [i.value]));
    container.innerHTML = items.map(i => {
        const values = i.values || [i.value];
        return `<div class="vbar"><span class="vbar-val">${values.join(' · ')}</span><div class="vbar-track">${values.map((v, k) => `<div class="vbar-fill ${k ? 'alt' : ''}" style="height:${(v / max) * 100}%;${color && !k ? 'background:' + color : ''}"></div>`).join('')}</div><span class="vbar-label">${esc(i.label)}</span></div>`;
    }).join('');
}
// ============================================================
// 5. FILTROS Y ORDEN
// ============================================================
function renderGrid(gridId, list, empty, countId) {
    const grid = $(gridId);
    if (countId) $(countId).textContent = list.length ? `· ${list.length}` : '';
    grid.innerHTML = list.length ? list.map(w => workCard(w)).join('') : emptyState(...empty);
}

// ============================================================
// 6. PÁGINAS DE OBRAS
// ============================================================
function renderBooks() {
    let list = filterWorks(getWorksByType('book'), {
        search: val('booksSearch'), status: val('booksStatusFilter'), bl: checked('booksBlFilter'), fav: checked('booksFavFilter'),
        spicy: val('booksSpicyFilter'), sadness: val('booksSadnessFilter')
    });
    renderGrid('booksGrid', sortWorks(list, val('booksSort')), ['📚', 'No hay libros aquí', 'Prueba con otros filtros o agrega un libro nuevo.', 'book'], 'booksCount');
}

let seriesTab = 'all', seriesView = 'grid';
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
    $('seriesGrid').classList.toggle('is-list', seriesView === 'list');
    $('viewGridBtn').classList.toggle('is-on', seriesView === 'grid');
    $('viewListBtn').classList.toggle('is-on', seriesView === 'list');
    renderGrid('seriesGrid', sortWorks(list, val('seriesSort')), ['🎬', 'No hay series aquí', 'Prueba con otra pestaña o agrega una serie.', 'series']);
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
    renderGrid('animeGrid', sortWorks(list, val('animeSort')), ['🎌', 'No hay animes aquí', 'Prueba con otros filtros o agrega un anime.', 'anime'], 'animeCount');
}
function renderManhwa() {
    let list = filterWorks(getWorksByType('manhwa'), {
        search: val('manhwaSearch'), status: val('manhwaStatusFilter'), bl: checked('manhwaBlFilter'), fav: checked('manhwaFavFilter'),
        spicy: val('manhwaSpicyFilter'), sadness: val('manhwaSadnessFilter')
    });
    renderGrid('manhwaGrid', sortWorks(list, val('manhwaSort')), ['📕', 'No hay manhwas aquí', 'Prueba con otros filtros o agrega un manhwa.', 'manhwa'], 'manhwaCount');
}
function renderBL() {
    let list = filterWorks(appData.works.filter(w => w.bl), {
        search: val('blSearch'), type: val('blTypeFilter'), status: val('blStatusFilter'), minRating: checked('blMinRating') ? 4 : 0
    });
    list = sortWorks(list, val('blSort'));
    $('blCount').textContent = list.length ? `· ${list.length}` : '';
    $('blGrid').innerHTML = list.length ? list.map(w => workCard(w, { showType: true })).join('')
        : emptyState('💖', 'No hay obras BL aquí', 'Marca “Es BL” al agregar o editar una obra.', 'series');
}

// ============================================================
// 7. INICIO
// ============================================================
function renderHome() {
    const s = appData.settings;
    $('statBooks').textContent = getWorksByType('book').length;
    $('statSeries').textContent = getWorksByType('series').length;
    $('statAnime').textContent = getWorksByType('anime').length;
    $('statManhwa').textContent = getWorksByType('manhwa').length;
    $('statPersons').textContent = appData.persons.length;

    const h = new Date().getHours();
    const hello = h < 12 ? 'Buenos días' : h < 20 ? 'Buenas tardes' : 'Buenas noches';
    $('homeGreeting').textContent = `${hello}, ${s.userName || 'Sara'} 💜`;
    const now = new Date();
    const dateStr = now.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    $('home-date').textContent = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);

    const inProgress = appData.works.filter(isActive).sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
    $('homeContinueWatching').innerHTML = inProgress.length
        ? inProgress.slice(0, 12).map(w => workCard(w, { compact: true, showType: true })).join('')
        : emptyState('🍿', 'Nada en curso', 'Marca una obra como “Leyendo” o “Viendo” para seguirla desde aquí.');

    const favs = appData.works.filter(w => w.favorite).sort((a, b) => (b.rating || 0) - (a.rating || 0));
    $('homeFavSection').hidden = !favs.length;
    $('homeFavorites').innerHTML = favs.slice(0, 12).map(w => workCard(w, { compact: true, showType: true })).join('');

    const recent = sortWorks(appData.works, 'recent').slice(0, 12);
    $('homeRecent').innerHTML = recent.length ? recent.map(w => workCard(w, { compact: true, showType: true })).join('')
        : emptyState('✨', 'Tu mundo está vacío', 'Agrega tu primera obra para empezar.', 'book');

    hbars($('homeGenresChart'), tagCounts(appData.works).slice(0, 8), 'Añade etiquetas a tus obras para ver las más populares.');
    renderHero(inProgress);
}

function renderHero(inProgress) {
    const bg = $('heroBg'), content = $('heroContent');
    const w = inProgress.slice().sort((a, b) => (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0) || (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0))[0];
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
                ${w.rating ? `<span style="color:var(--gold)">★ ${ratingText(w.rating)}</span>` : ''}
                ${getSubtitle(w) !== getTypeLabel(w.type) ? `<span>${esc(getSubtitle(w))}</span>` : ''}
                ${w.bl ? '<span>💖 BL</span>' : ''}
            </div>
            ${total ? `<div class="hero-progress"><div class="progress-bar"><div class="progress-fill" style="width:${p}%"></div></div><div class="progress-text"><span>${esc(getProgressText(w))}</span><span>${p}%</span></div></div>`
                    : (w.synopsis ? `<p class="hero-text">${esc(w.synopsis)}</p>` : '')}
            <div class="hero-actions">
                ${total && (Number(w.progress) || 0) < total ? `<button class="btn btn-primary" data-act="progress" data-id="${w.id}">＋${step} ${TYPE_META[w.type].unit}</button>` : ''}
                <button class="btn btn-secondary" data-open="${w.id}">Ver detalles</button>
            </div>
        </div>`;
}

function changeProgress(id, delta) {
    const w = getWorkById(id);
    if (!w) return;
    const total = getTotal(w);
    const step = delta * TYPE_META[w.type].step;
    let next = Math.max(0, (Number(w.progress) || 0) + step);
    if (total) next = Math.min(next, total);
    const finishes = total && next >= total && w.status !== 'terminado';
    const msg = finishes ? `🎉 ¡Terminaste “${w.title}”!` : `⏩ ${w.title}: ${w.type === 'book' ? next + ' págs' : (w.type === 'manhwa' ? 'cap ' : 'ep ') + next}`;
    mutate(() => {
        w.progress = next;
        w.updatedAt = Date.now();
        if (finishes) {
            w.status = 'terminado';
            if (!w.endDate) w.endDate = todayISO();
        } else if (delta > 0 && isPlanned(w)) {
            w.status = STATUS_BY_TYPE[w.type][0];
            if (!w.startDate) w.startDate = todayISO();
        }
    }, msg);
}

// ============================================================
// 8. NAVEGACIÓN
// ============================================================
const RENDERERS = {
    home: renderHome, books: renderBooks, series: renderSeries, anime: renderAnime, manhwa: renderManhwa,
    bl: renderBL, persons: renderPersons, couples: renderCouples, emission: renderEmission, stats: renderStats,
    collections: renderCollections, notes: renderNotes, settings: renderSettings
};
let currentPage = 'home';

function navigateTo(page, { push = true } = {}) {
    if (!RENDERERS[page]) page = 'home';
    currentPage = page;
    document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.nav === page));
    document.querySelectorAll('.page-view').forEach(el => el.classList.toggle('active', el.id === 'page-' + page));
    if (push && location.hash !== '#' + page) history.replaceState(null, '', '#' + page);
    $('main').scrollTop = 0;
    if (window.innerWidth <= 760) window.scrollTo(0, 0);
    RENDERERS[page]();
}
function refreshView() {
    RENDERERS[currentPage]();
    renderSidebar();
    if (currentDetailId) renderDetail();
    if ($('personDetailOverlay').classList.contains('active') && currentPersonId) renderPersonDetail();
    if ($('sheetModal').classList.contains('active') && sheetRefresh) sheetRefresh();
}
function renderSidebar() {
    const counts = { bl: appData.works.filter(w => w.bl).length };
    Object.keys(TYPE_META).forEach(t => counts[t] = getWorksByType(t).length);
    document.querySelectorAll('[data-count]').forEach(el => el.textContent = counts[el.dataset.count] || '');
    const name = appData.settings.userName || 'Sara';
    const xp = appData.works.length * 10 + appData.works.filter(w => w.status === 'terminado').length * 15 + appData.notes.length * 5;
    const level = Math.floor(xp / 50) + 1;
    const ranks = [[1, '🌱 Semilla'], [3, '🌿 Brote'], [6, '⭐ Estrella'], [10, '🔥 Leyenda'], [15, '👑 Supremo']];
    const rank = ranks.filter(r => level >= r[0]).pop()[1];
    $('userName').textContent = name;
    $('userAvatar').textContent = name.trim().charAt(0).toUpperCase() || '✨';
    $('userRank').textContent = `${rank} · Nivel ${level}`;
    $('userLevelBar').style.width = ((xp % 50) / 50 * 100) + '%';
    $('personNames').innerHTML = appData.persons.map(p => `<option value="${esc(p.name)}">`).join('');
}

// ============================================================
// 9. BÚSQUEDA GLOBAL
// ============================================================
let searchResults = [], searchIndex = -1;
function runGlobalSearch() {
    const q = norm($('globalSearch').value);
    const box = $('globalSearchResults');
    if (q.length < 2) { box.classList.remove('active'); return; }
    const results = [];
    appData.works.forEach(w => {
        if (norm([w.title, w.tags, w.author, w.actors, w.studio].join(' ')).includes(q))
            results.push({ kind: 'work', id: w.id, title: w.title, sub: `${TYPE_META[w.type].icon} ${getTypeLabel(w.type)} · ${getStatusLabel(w.status)}`, image: w.image, ph: w.type });
    });
    appData.persons.forEach(p => { if (norm(p.name).includes(q)) results.push({ kind: 'person', id: p.id, title: p.name, sub: '👤 ' + (PERSON_TYPE_LABEL[p.type] || p.type), image: p.image, ph: 'person' }); });
    appData.couples.forEach(c => { if (norm(c.name).includes(q)) results.push({ kind: 'couple', id: c.id, title: c.name, sub: '💕 Pareja BL', image: c.image, ph: 'couple' }); });
    appData.collections.forEach(c => { if (norm(c.name).includes(q)) results.push({ kind: 'collection', id: c.id, title: c.name, sub: `🗂️ Colección · ${c.items.length} obras`, icon: '🗂️' }); });
    appData.notes.forEach(n => { if (norm(n.content + ' ' + n.workTitle).includes(q)) results.push({ kind: 'note', id: n.workId, title: n.workTitle || 'Nota', sub: '📝 ' + n.content.slice(0, 50), icon: '📝' }); });
    searchResults = results.slice(0, 12);
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
    if (r.kind === 'work' || r.kind === 'note') openDetail(r.id);
    else if (r.kind === 'person') openPersonDetail(r.id);
    else if (r.kind === 'couple') openCoupleModal(getCoupleById(r.id));
    else if (r.kind === 'collection') { navigateTo('collections'); openCollectionView(r.id); }
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
function openModal(id) {
    lastFocus = document.activeElement;
    $(id).classList.add('active');
    const first = $(id).querySelector('input:not([type=hidden]):not([type=file]), select, textarea, button');
    setTimeout(() => first && first.focus({ preventScroll: true }), 60);
}
function closeModal(id) {
    $(id).classList.remove('active');
    if (id === 'sheetModal') sheetRefresh = null;
    if (id === 'personDetailOverlay') currentPersonId = null;
    if (lastFocus && document.body.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
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
    const src = work || preset;
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
    openModal('workModal');
    setTimeout(() => $('f_title').focus(), 60);
}
function collectWorkForm() {
    const data = {};
    workForm.querySelectorAll('[data-field]').forEach(el => {
        const wrap = el.closest('[data-types]');
        if (wrap && wrap.hidden) return;
        const f = el.dataset.field;
        if (el.type === 'checkbox') data[f] = el.checked;
        else if ('num' in el.dataset) data[f] = el.value === '' ? (f === 'year' ? '' : 0) : Number(el.value);
        else data[f] = el.value.trim();
    });
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
    const ok = mutate(() => {
        if (editing) {
            const w = getWorkById(editing);
            Object.assign(w, data, { updatedAt: Date.now() });
            appData.notes.forEach(n => { if (n.workId === w.id) n.workTitle = w.title; });
        } else {
            appData.works.push({ id: generateId(), type: formType, ...data, createdAt: Date.now(), updatedAt: Date.now() });
        }
    }, editing ? '✅ Obra actualizada' : '✅ Obra agregada');
    if (ok) closeModal('workModal');
}
function deleteWork(id) {
    const w = getWorkById(id);
    if (!w || !confirm(`¿Eliminar “${w.title}” permanentemente?`)) return;
    if (currentDetailId === id) closeDetail();
    mutate(() => {
        appData.works = appData.works.filter(x => x.id !== id);
        appData.notes = appData.notes.filter(n => n.workId !== id);
        appData.collections.forEach(c => { c.items = c.items.filter(i => i !== id); });
    }, '🗑️ Obra eliminada');
}
function toggleFavorite(id) {
    const w = getWorkById(id);
    if (!w) return;
    mutate(() => { w.favorite = !w.favorite; w.updatedAt = Date.now(); }, w.favorite ? '🤍 Quitado de favoritos' : '❤️ Añadido a favoritos');
}

// ============================================================
// 13. PANEL DE DETALLE
// ============================================================
let currentDetailId = null;
function openDetail(id) {
    if (!getWorkById(id)) return;
    if (currentDetailId !== id) $('detailPanel').innerHTML = '';
    currentDetailId = id;
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
}
function peopleChips(str) {
    return splitList(str).map(n => {
        const p = findPersonByName(n);
        return p ? `<button class="chip" data-person="${p.id}">${esc(n)}</button>` : `<span class="chip chip-muted">${esc(n)}</span>`;
    }).join('');
}
function renderDetail() {
    const w = getWorkById(currentDetailId);
    if (!w) { closeDetail(); return; }
    const openStates = [...$('detailPanel').querySelectorAll('details')].map(d => d.open);
    const p = getProgress(w), total = getTotal(w);
    const note = appData.notes.find(n => n.workId === w.id);
    const inColls = appData.collections.filter(c => c.items.includes(w.id));
    const rel = [
        ['Autor', w.author, true], ['Estudio', w.studio], ['Plataforma', w.platform], ['Género', w.genre], ['País', w.country],
        ['Actores', w.actors, true], ['Directores', w.directors, true],
        ['Temporadas', w.type === 'anime' && w.seasons ? w.seasons : ''], ['Temporada', w.type === 'manhwa' && w.season ? w.season : ''],
        ['Emisión', (WEEK.find(d => d.day === getAirDay(w)) || {}).short || '']
    ].filter(r => r[1]);
    const tags = splitList(w.tags);
    const wTags = tags.map(t => t.toLowerCase());
    const similar = appData.works.filter(o => o.id !== w.id)
        .map(o => ({ o, score: splitList(o.tags).filter(t => wTags.includes(t.toLowerCase())).length + (o.bl && w.bl ? 0.5 : 0) + (o.type === w.type ? 0.25 : 0) }))
        .filter(x => x.score >= 1).sort((a, b) => b.score - a.score).slice(0, 6).map(x => x.o);

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
          <button class="btn btn-secondary btn-sm" data-act="collect" data-id="${w.id}">📂 Colecciones${inColls.length ? ' · ' + inColls.length : ''}</button>
          <button class="btn btn-danger btn-sm" data-act="delete" data-id="${w.id}">🗑️</button>
        </div>
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
          <div class="detail-stat"><div class="k">Valoración</div><div class="v" style="color:var(--gold)">${w.rating ? '★ ' + ratingText(w.rating) : '–'}</div></div>
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
        ${tags.length ? `<div class="detail-section"><div class="detail-section-title">Etiquetas</div><div class="tag-list">${tags.map(t => `<span class="chip">${esc(t)}</span>`).join('')}</div></div>` : ''}
        <details class="expandable" ${openStates[0] ?? rel.length ? 'open' : ''}>
          <summary>🔗 Ficha</summary>
          <div class="expandable-content">
            ${rel.length ? `<dl class="kv">${rel.map(([k, v, people]) => `<dt>${k}</dt><dd>${people ? peopleChips(v) : esc(v)}</dd>`).join('')}</dl>` : '<p>Sin información adicional. Edita la obra para añadirla.</p>'}
          </div>
        </details>
        <details class="expandable" ${openStates[1] ?? note ? 'open' : ''}>
          <summary>📝 Mis notas</summary>
          <div class="expandable-content">
            <label class="field"><textarea id="detailNote" placeholder="Escribe tus pensamientos, teorías o reseñas…">${esc(note ? note.content : '')}</textarea></label>
            <div style="display:flex;gap:8px;margin-top:10px;">
              <button class="btn btn-primary btn-sm" data-act="note-save" data-id="${w.id}">Guardar nota</button>
              ${note ? `<button class="btn btn-danger btn-sm" data-act="note-delete" data-id="${w.id}">Eliminar</button>` : ''}
            </div>
          </div>
        </details>
        <details class="expandable" ${openStates[2] ?? similar.length ? 'open' : ''}>
          <summary>🔍 Obras similares</summary>
          <div class="expandable-content">
            ${similar.length ? `<div class="mini-grid">${similar.map(miniCard).join('')}</div>` : `<p>${tags.length ? 'No hay obras con etiquetas en común.' : 'Añade etiquetas a esta obra para ver recomendaciones.'}</p>`}
          </div>
        </details>
      </div>`;
}
function saveNote(id) {
    const w = getWorkById(id);
    const content = $('detailNote').value.trim();
    if (!w) return;
    if (!content) { showToast('📝 Escribe algo antes de guardar', 'error'); return; }
    mutate(() => {
        const existing = appData.notes.find(n => n.workId === id);
        if (existing) { existing.content = content; existing.workTitle = w.title; existing.updatedAt = Date.now(); }
        else appData.notes.push({ id: generateId(), workId: id, workTitle: w.title, content, createdAt: Date.now() });
        w.note = content;
    }, '📝 Nota guardada');
}
function deleteNote(workId) {
    if (!confirm('¿Eliminar esta nota?')) return;
    mutate(() => {
        appData.notes = appData.notes.filter(n => n.workId !== workId);
        const w = getWorkById(workId);
        if (w) delete w.note;
    }, '🗑️ Nota eliminada');
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
        const works = c.items.map(getWorkById).filter(Boolean);
        const mosaic = works.slice(0, 4);
        return `
        <article class="collection-card" data-coll="${c.id}" tabindex="0">
          <div class="collection-mosaic">${mosaic.length ? mosaic.map(w => img(w.image, w.type, w.title)).join('') + '<span></span>'.repeat(4 - mosaic.length) : '<div class="ph">🗂️</div>'}</div>
          <div class="collection-info">
            <h4><span>${esc(c.name)}</span><span class="chip chip-muted">${works.length}</span></h4>
            <p>${esc(c.description || '')}</p>
            <div class="collection-actions">
              <button class="btn btn-secondary btn-sm" data-act="coll-open" data-id="${c.id}">📂 Abrir</button>
              <button class="btn btn-secondary btn-sm" data-act="coll-edit" data-id="${c.id}">✏️</button>
              <button class="btn btn-secondary btn-sm" data-act="coll-delete" data-id="${c.id}">🗑️</button>
            </div>
          </div>
        </article>`;
    }).join('');
}
function openCollectionModal(c = null) {
    $('editCollectionId').value = c ? c.id : '';
    $('collectionName').value = c ? c.name : '';
    $('collectionDesc').value = c ? (c.description || '') : '';
    $('collectionModalTitle').textContent = c ? '✏️ Editar colección' : '＋ Nueva colección';
    openModal('collectionModal');
}
let pendingCollectWorkId = null;
function saveCollection() {
    const id = $('editCollectionId').value;
    const name = $('collectionName').value.trim();
    if (!name) { showToast('⚠️ El nombre es obligatorio', 'error'); return; }
    const description = $('collectionDesc').value.trim();
    const ok = mutate(() => {
        if (id) Object.assign(getCollectionById(id), { name, description });
        else appData.collections.push({ id: generateId(), name, description, items: pendingCollectWorkId ? [pendingCollectWorkId] : [], createdAt: Date.now() });
    }, id ? '✅ Colección actualizada' : (pendingCollectWorkId ? '✅ Colección creada con la obra' : '✅ Colección creada'));
    if (ok) { pendingCollectWorkId = null; closeModal('collectionModal'); }
}
function deleteCollection(id) {
    const c = getCollectionById(id);
    if (!c || !confirm(`¿Eliminar la colección “${c.name}”? Las obras no se borrarán.`)) return;
    mutate(() => { appData.collections = appData.collections.filter(x => x.id !== id); }, '🗑️ Colección eliminada');
}
function openCollectionView(id) {
    openSheet((getCollectionById(id) || {}).name || 'Colección', () => {
        const c = getCollectionById(id);
        if (!c) return '<p>Colección no encontrada.</p>';
        $('sheetTitle').textContent = '🗂️ ' + c.name;
        const works = c.items.map(getWorkById).filter(Boolean);
        if (!works.length) return emptyState('📭', 'Colección vacía', 'Abre cualquier obra y pulsa “📂 Colecciones” para añadirla aquí.');
        return `<div class="pick-list">${works.map(w => `
            <div class="pick-item">
              <div class="thumb">${img(w.image, w.type, w.title)}</div>
              <button class="info" style="text-align:left" data-open="${w.id}"><b>${esc(w.title)}</b><small>${TYPE_META[w.type].icon} ${esc(getTypeLabel(w.type))} · ${esc(getStatusLabel(w.status))}</small></button>
              <button class="icon-btn sm" data-act="coll-remove" data-id="${c.id}" data-item="${w.id}" title="Quitar de la colección" aria-label="Quitar">✕</button>
            </div>`).join('')}</div>`;
    });
}
function openCollectionPicker(workId) {
    const w = getWorkById(workId);
    if (!w) return;
    openSheet('📂 Añadir a colección', () => `
        <p class="panel-desc" style="margin:0 0 12px">Marca las colecciones donde quieres guardar “${esc(w.title)}”.</p>
        <div class="pick-list">
          ${appData.collections.map(c => `
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
    if (personTab === 'general') {
        $('allPersonsGrid').innerHTML = all.length ? all.map(personCard).join('') : emptyPersons;
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
        $('personsGrid').innerHTML = list.length ? list.map(personCard).join('') : emptyPersons;
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
          ${social ? `<div class="tag-list" style="justify-content:center;margin-bottom:16px">${social}</div>` : ''}
          <div style="display:flex;gap:8px;justify-content:center;margin-bottom:20px">
            <button class="btn btn-secondary btn-sm" data-act="person-edit" data-id="${p.id}">✏️ Editar</button>
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
    if (ok) closeModal('personModal');
}
function deletePerson(id) {
    const p = getPersonById(id);
    if (!p || !confirm(`¿Eliminar a ${p.name}?`)) return;
    if (currentPersonId === id) closeModal('personDetailOverlay');
    mutate(() => { appData.persons = appData.persons.filter(x => x.id !== id); }, '🗑️ Persona eliminada');
}

// ============================================================
// 16. PAREJAS BL
// ============================================================
let coupleFilter = 'all';
function renderCouples() {
    const q = norm(val('couplesSearch'));
    let list = appData.couples.filter(c => norm(c.name).includes(q));
    if (coupleFilter === 'favorite') list = list.filter(c => c.favorite);
    if (coupleFilter === 'rating') list = list.slice().sort((a, b) => (b.rating || 0) - (a.rating || 0));
    document.querySelectorAll('#coupleTabs .tab').forEach(t => t.classList.toggle('active', t.dataset.filter === coupleFilter));
    $('coupleCount').textContent = `${list.length} ${list.length === 1 ? 'pareja' : 'parejas'}`;
    $('couplesGrid').innerHTML = list.length ? list.map(c => `
        <article class="couple-card" data-couple="${c.id}" data-id="${c.id}" tabindex="0">
          <div class="couple-image">${img(c.image, 'couple', c.name)}</div>
          <div class="couple-actions">
            <button class="card-act ${c.favorite ? 'is-fav' : ''}" data-act="couple-fav" title="Favorita" aria-label="Favorita">${c.favorite ? '♥' : '♡'}</button>
            <button class="card-act danger" data-act="couple-delete" title="Eliminar" aria-label="Eliminar">✕</button>
          </div>
          <div class="couple-info">
            <div class="couple-name">${esc(c.name)}</div>
            <div class="couple-works">${c.works || 0} ${c.works == 1 ? 'obra' : 'obras'} juntos</div>
            <div class="couple-rating"><span class="stars">${getStars(c.rating)}</span><span class="value">${ratingText(c.rating)}</span></div>
          </div>
        </article>`).join('')
        : `<div class="empty-state"><div class="big">💕</div><h4>No hay parejas aquí</h4><p>Guarda tus parejas BL favoritas.</p><button class="btn btn-primary btn-sm" data-act="couple-new">＋ Añadir pareja</button></div>`;
    const top = appData.couples.slice().sort((a, b) => (b.rating || 0) - (a.rating || 0)).slice(0, 5);
    $('coupleRanking').innerHTML = top.length ? top.map((c, i) => `
        <button class="ranking-item" data-couple="${c.id}">
          <div class="ranking-number ${['gold', 'silver', 'bronze'][i] || ''}">${i + 1}</div>
          <div class="ranking-avatar">${img(c.image, 'couple', c.name)}</div>
          <div class="ranking-info"><div class="ranking-name">${esc(c.name)}</div><div class="ranking-detail">${c.works || 0} obras${c.favorite ? ' · ❤️' : ''}</div></div>
          <div class="ranking-rating">★ ${ratingText(c.rating)}</div>
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
    updateRangeOutputs($('coupleModal'));
    updateCouplePreview();
    openModal('coupleModal');
}
function saveCouple() {
    const id = $('editCoupleId').value;
    const name = $('coupleName').value.trim();
    if (!name) { showToast('⚠️ El nombre es obligatorio', 'error'); $('coupleName').focus(); return; }
    const data = { name, works: Number($('coupleWorks').value) || 0, rating: Number($('coupleRating').value) || 0, image: $('coupleImage').value.trim(), favorite: $('coupleFavorite').checked };
    const ok = mutate(() => {
        if (id) Object.assign(getCoupleById(id), data);
        else appData.couples.push({ id: generateId(), ...data, createdAt: Date.now() });
    }, id ? '✅ Pareja actualizada' : '✅ Pareja añadida');
    if (ok) closeModal('coupleModal');
}
function deleteCouple(id) {
    const c = getCoupleById(id);
    if (!c || !confirm(`¿Eliminar a “${c.name}”?`)) return;
    mutate(() => { appData.couples = appData.couples.filter(x => x.id !== id); }, '🗑️ Pareja eliminada');
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
    const unscheduled = active.filter(w => getAirDay(w) === null);
    $('unscheduledSection').hidden = !unscheduled.length;
    $('unscheduledGrid').innerHTML = unscheduled.map(w => workCard(w, { compact: true, showType: true })).join('');
}

// ============================================================
// 18. ESTADÍSTICAS
// ============================================================
function renderStats() {
    const works = appData.works;
    const done = works.filter(w => w.status === 'terminado');
    const rated = works.filter(w => w.rating);
    const minutesByType = { book: 0, series: 0, anime: 0, manhwa: 0 };
    works.forEach(w => { minutesByType[w.type] += estimateMinutes(w); });
    const totalMin = Object.values(minutesByType).reduce((a, b) => a + b, 0);
    const hours = Math.round(totalMin / 60);
    $('statsTotal').textContent = works.length;
    $('statsDone').textContent = done.length;
    $('statsHours').textContent = hours + 'h';
    $('statsTotalHours').textContent = hours + 'h';
    $('statsAvg').textContent = rated.length ? '★ ' + (rated.reduce((a, w) => a + Number(w.rating), 0) / rated.length).toFixed(1) : '–';

    // Donut dinámico
    let acc = 0;
    const segs = Object.keys(minutesByType).map(t => {
        const pct = totalMin ? (minutesByType[t] / totalMin) * 100 : 0;
        const seg = `${TYPE_META[t].color} ${acc}% ${acc + pct}%`;
        acc += pct;
        return seg;
    });
    $('statsDonut').style.background = totalMin ? `conic-gradient(${segs.join(', ')})` : 'var(--bg-elevated)';
    $('statsLegend').innerHTML = Object.keys(minutesByType).map(t => `
        <div class="legend-item"><div class="legend-color" style="background:${TYPE_META[t].color}"></div><div class="legend-label">${TYPE_META[t].icon} ${t === 'series' ? 'Series' : getTypeLabel(t) + (t === 'anime' ? '' : 's')}</div>
        <div class="legend-value">${Math.round(minutesByType[t] / 60)}h · ${totalMin ? Math.round(minutesByType[t] / totalMin * 100) : 0}%</div></div>`).join('');

    // Actividad mensual real
    const months = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        months.push({ y: d.getFullYear(), m: d.getMonth(), label: d.toLocaleDateString('es-ES', { month: 'short' }).replace('.', '') });
    }
    const inMonth = (date, mo) => date && date.getFullYear() === mo.y && date.getMonth() === mo.m;
    vbars($('statsChart'), months.map(mo => ({
        label: mo.label,
        values: [
            works.filter(w => w.createdAt && inMonth(new Date(w.createdAt), mo)).length,
            works.filter(w => w.endDate && inMonth(new Date(w.endDate + 'T00:00:00'), mo)).length
        ]
    })));
    const levels = key => [1, 2, 3, 4, 5].map(l => ({ label: String(l), value: works.filter(w => Number(w[key]) === l).length }));
    vbars($('statsSpicyChart'), levels('spicy'), 'linear-gradient(180deg,#f87171,#b91c1c)');
    vbars($('statsSadnessChart'), levels('sadness'), 'linear-gradient(180deg,#60a5fa,#1d4ed8)');
    hbars($('statsGenresChart'), tagCounts(works).slice(0, 10), 'Añade etiquetas para ver estadísticas de géneros.');
    renderAchievements();
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
    const notes = appData.notes.filter(n => !q || norm(n.content + ' ' + n.workTitle).includes(q))
        .sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
    $('notesList').innerHTML = notes.length ? notes.map(n => {
        const w = getWorkById(n.workId);
        return `
        <article class="note-card">
          <div class="thumb" ${w ? `data-open="${w.id}"` : ''}>${img(w && w.image, w ? w.type : 'book', n.workTitle)}</div>
          <div class="body">
            <h4>${esc(n.workTitle || (w && w.title) || 'Nota')}</h4>
            <div class="date">${n.updatedAt ? 'Editada ' + fmtDate(n.updatedAt) : fmtDate(n.createdAt)}</div>
            <div class="content">${esc(n.content)}</div>
            <div class="actions">
              ${w ? `<button class="btn btn-secondary btn-sm" data-open="${w.id}">✏️ Abrir</button>` : ''}
              <button class="btn btn-secondary btn-sm" data-act="note-delete" data-id="${esc(n.workId)}">🗑️</button>
            </div>
          </div>
        </article>`;
    }).join('') : `<div class="empty-state"><div class="big">📝</div><h4>${q ? 'Sin resultados' : 'Aún no tienes notas'}</h4><p>Abre cualquier obra y escribe en “Mis notas”.</p></div>`;
}

// ============================================================
// 20. AJUSTES, TEMA Y COPIAS
// ============================================================
function applySettings() {
    const s = appData.settings;
    const root = document.documentElement;
    root.style.setProperty('--accent', s.themeColor);
    root.dataset.theme = s.darkMode ? 'dark' : 'light';
    document.querySelector('.page-inner').style.zoom = (s.fontSize || 14) / 14;
    document.body.classList.toggle('fit-cover', s.imageFit === 'cover');
    document.querySelector('meta[name=color-scheme]').content = s.darkMode ? 'dark' : 'light';
    // Color de la barra del sistema (móvil y app instalada)
    document.querySelector('meta[name=theme-color]').content = s.darkMode ? '#0b0b13' : '#fbfbfe';
}
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
    document.querySelectorAll('.color-option').forEach(o => o.classList.toggle('active', o.dataset.color.toLowerCase() === String(s.themeColor).toLowerCase()));
    $('fontSizeSlider').value = s.fontSize;
    $('fontSizeValue').textContent = s.fontSize + 'px';
    $('btnContain').classList.toggle('is-on', s.imageFit !== 'cover');
    $('btnCover').classList.toggle('is-on', s.imageFit === 'cover');
    $('themeToggle').setAttribute('aria-checked', String(!!s.darkMode));
    updateStorageMeter();
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
        mutate(() => { appData = data; }, '📥 Datos importados correctamente');
        applySettings();
        renderSettings();
        await whenSaved();
        store.collectGarbage(appData).then(updateStorageMeter).catch(() => {});
    };
    reader.readAsText(file);
}
async function wipeData() {
    if (!confirm('¿Borrar TODOS tus datos? Esta acción no se puede deshacer.\n\nConsejo: exporta una copia antes.')) return;
    if (!confirm('¿Seguro del todo?')) return;
    const settings = appData.settings;
    mutate(() => { appData = emptyData(); appData.settings = settings; }, '🗑️ Datos borrados');
    await whenSaved();
    store.collectGarbage(appData).then(updateStorageMeter).catch(() => {});
}

// ============================================================
// 21. TOAST
// ============================================================
function showToast(msg, type = 'info', ms = 2800) {
    const stack = $('toastStack');
    while (stack.children.length >= 3) stack.firstElementChild.remove();
    const el = document.createElement('div');
    el.className = 'toast toast-' + type;
    el.textContent = msg;
    stack.appendChild(el);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('show')));
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, ms);
}

// ============================================================
// 22. EVENTOS
// ============================================================
function handleAction(act, id, el) {
    switch (act) {
        case 'edit': openWorkModal(null, getWorkById(id)); break;
        case 'delete': deleteWork(id); break;
        case 'progress': changeProgress(id, 1); break;
        case 'progress-minus': changeProgress(id, -1); break;
        case 'fav': toggleFavorite(id); break;
        case 'collect': openCollectionPicker(id); break;
        case 'note-save': saveNote(id); break;
        case 'note-delete': deleteNote(id); break;
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
    }
}

document.addEventListener('click', e => {
    const t = e.target;
    // Cerrar search al hacer clic fuera
    if (!t.closest('#globalSearchBox')) $('globalSearchResults').classList.remove('active');

    const result = t.closest('[data-result]');
    if (result) { openSearchResult(Number(result.dataset.result)); return; }
    const closeBtn = t.closest('[data-close]');
    if (closeBtn) { closeModal(closeBtn.closest('.modal-overlay').id); return; }
    if (t.closest('[data-detail-close]')) { closeDetail(); return; }
    const add = t.closest('[data-add]');
    if (add) { openWorkModal(add.dataset.add, null, add.dataset.bl ? { bl: true } : {}); return; }
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
        if (open.closest('#sheetModal')) closeModal('sheetModal');
        if (open.closest('#personDetailOverlay')) closeModal('personDetailOverlay');
        openDetail(open.dataset.open);
        return;
    }
    const person = t.closest('[data-person]');
    if (person) { if (currentDetailId && person.closest('#detailPanel')) closeDetail(); openPersonDetail(person.dataset.person); return; }
    const couple = t.closest('[data-couple]');
    if (couple) { openCoupleModal(getCoupleById(couple.dataset.couple)); return; }
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
    const viewBtn = t.closest('[data-view]');
    if (viewBtn) { seriesView = viewBtn.dataset.view; renderSeries(); return; }
    const personTabBtn = t.closest('#personTabs .tab');
    if (personTabBtn) { personTab = personTabBtn.dataset.tab; renderPersons(); return; }
    const coupleTabBtn = t.closest('#coupleTabs .tab');
    if (coupleTabBtn) { coupleFilter = coupleTabBtn.dataset.filter; renderCouples(); return; }
    const color = t.closest('[data-color]');
    if (color) { updateSetting('themeColor', color.dataset.color, '🎨 Color actualizado'); return; }
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
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (currentPage !== 'home') navigateTo('home');
        $('globalSearch').focus();
        return;
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
    if (e.key === 'Escape') {
        const m = topOpenModal();
        if (m) { closeModal(m.id); return; }
        if (currentDetailId) { closeDetail(); return; }
        $('globalSearchResults').classList.remove('active');
        return;
    }
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-open], [data-person], [data-couple], [data-coll]') && e.target.tagName !== 'BUTTON') {
        e.preventDefault();
        e.target.click();
    }
    if (e.key === 'Enter' && e.target.closest('#workForm') && e.target.tagName === 'INPUT') { e.preventDefault(); saveWork(); }
});

// Botones con id
$('workSaveBtn').addEventListener('click', saveWork);
$('personSaveBtn').addEventListener('click', savePerson);
$('coupleSaveBtn').addEventListener('click', saveCouple);
$('collectionSaveBtn').addEventListener('click', saveCollection);
$('addPersonBtn').addEventListener('click', () => openPersonModal());
$('addCoupleBtn').addEventListener('click', () => openCoupleModal());
$('addCollectionBtn').addEventListener('click', () => { pendingCollectWorkId = null; openCollectionModal(); });
$('themeToggle').addEventListener('click', () => updateSetting('darkMode', !appData.settings.darkMode, appData.settings.darkMode ? '☀️ Modo claro' : '🌙 Modo oscuro'));
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
window.addEventListener('hashchange', () => navigateTo(location.hash.slice(1), { push: false }));
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
// Actualiza saludo/fecha cada minuto
setInterval(() => { if (currentPage === 'home') renderHome(); }, 60000);

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
    renderSidebar();
    renderInstallState();
    renderPersistState();
    updateOnlineState(false);
    navigateTo(location.hash.slice(1) || 'home', { push: false });
    // Acceso directo “Agregar obra” del icono de la app
    const startParams = new URLSearchParams(location.search);
    if (startParams.get('accion') === 'agregar') {
        history.replaceState(null, '', location.pathname + location.hash);
        openWorkModal('book');
    }
    document.documentElement.dataset.ready = 'true';
})();
