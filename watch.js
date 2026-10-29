/*
 * Mi Mundo · watch.js
 * "Dónde verla / leerla" en la ficha: lista de enlaces de la obra, botón "▶ Ver ahora" (también en Inicio),
 * sugerencia a partir del campo "Plataforma" y consulta de disponibilidad por país con TMDB.
 * La lógica está en watchkit.js. Se carga antes que app.js.
 */
'use strict';

const watchProviderState = new Map(); // obra → { country, result | error } (solo mientras la app está abierta)
const watchWords = type => (type === 'book' || type === 'manhwa' ? { verb: 'leerla', open: '📖 Leer ahora', title: 'Dónde leerla' } : { verb: 'verla', open: '▶ Ver ahora', title: 'Dónde verla' });
const watchCountry = () => (appData.settings && appData.settings.watchCountry) || defaultWatchCountry(typeof navigator !== 'undefined' ? navigator.language : '');
const watchHref = (link, w) => buildWatchUrl(link, w);
const WATCH_NEW_TAB = 'target="_blank" rel="noopener noreferrer"';

/** Botón principal "Ver ahora": abre el primer enlace de la obra (o '' si no tiene). */
function watchPrimaryHtml(w, cls = 'btn btn-primary btn-sm') {
    const link = (w.watchLinks || [])[0];
    if (!link) return '';
    const pos = watchPosition(w);
    const text = hasPlaceholders(link.url) ? `${watchWords(w.type).open.slice(0, 2)} Continuar · ${w.type === 'book' ? 'pág' : w.type === 'manhwa' ? 'cap' : 'ep'} ${pos.n}` : watchWords(w.type).open;
    return `<a class="${cls} watch-btn" href="${esc(watchHref(link, w))}" ${WATCH_NEW_TAB} title="Se abre en ${esc(watchLinkName(link))}">${esc(text)} <small>· ${esc(watchLinkName(link))}</small></a>`;
}
function watchLinkRow(w, link, i, locked) {
    const name = watchLinkName(link);
    const detail = link.url ? (hasPlaceholders(link.url) ? `continúa en ${w.type === 'book' ? 'pág' : w.type === 'manhwa' ? 'cap' : 'ep'} ${watchPosition(w).n}` : hostOf(link.url)) : 'busca el título en su web';
    return `<div class="watch-row">
        <span class="watch-icon" aria-hidden="true">${watchLinkIcon(link)}</span>
        <span class="info"><b>${esc(name)}${i === 0 ? ' <span class="chip chip-muted">principal</span>' : ''}</b><small>${esc(detail)}</small></span>
        <a class="btn btn-secondary btn-sm" href="${esc(watchHref(link, w))}" ${WATCH_NEW_TAB}>Abrir ↗</a>
        ${locked ? '' : `${i > 0 ? `<button type="button" class="icon-btn sm" data-act="watch-primary" data-id="${w.id}" data-link="${link.id}" title="Hacer principal" aria-label="Hacer principal">☆</button>` : ''}
        <button type="button" class="icon-btn sm" data-act="watch-del" data-id="${w.id}" data-link="${link.id}" aria-label="Quitar ${esc(name)}">✕</button>`}
    </div>`;
}
function watchProvidersHtml(w) {
    if (w.type === 'book' || w.type === 'manhwa' || w.seriesType === 'Variedad') return '';
    const key = appData.settings.tmdbKey;
    if (!key) return '<p class="hint">Con tu clave de TMDB (en Personalizar → Datos automáticos) también te digo en qué plataformas está disponible en tu país.</p>';
    const st = watchProviderState.get(w.id);
    const country = (st && st.country) || watchCountry();
    const have = new Set((w.watchLinks || []).map(l => l.platform).filter(Boolean));
    let body = '';
    if (st && st.error) body = `<p class="hint">⚠️ ${esc(st.error)}</p>`;
    else if (st && st.result) {
        const r = st.result;
        const chips = (list, label) => (list.length ? `<div class="watch-prov"><small>${label}</small><div class="tag-list">${list.map(n => {
            const p = platformFromProvider(n);
            return p && !have.has(p.id) ? `<button type="button" class="chip" data-act="watch-suggest" data-id="${w.id}" data-platform="${p.id}" title="Añadir a mis enlaces">＋ ${esc(n)}</button>` : `<span class="chip chip-muted">${esc(n)}${p && have.has(p.id) ? ' ✓' : ''}</span>`;
        }).join('')}</div></div>` : '');
        body = r.none ? '<p class="hint">TMDB no tiene datos de plataformas para este país.</p>'
            : `${chips(r.flatrate, 'Incluida en')}${chips(r.rent, 'Alquiler')}${chips(r.buy, 'Compra')}${r.link ? `<a class="link-btn" href="${esc(r.link)}" ${WATCH_NEW_TAB}>Ver todas en JustWatch ↗</a>` : ''}`;
    }
    return `<div class="watch-avail">
        <div class="seg-inline wrap"><select class="filter-select" id="watchCountry" aria-label="País">${WATCH_COUNTRIES.map(([k, l]) => `<option value="${k}" ${k === country ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
        <button type="button" class="btn btn-secondary btn-sm" data-act="watch-providers" data-id="${w.id}">🔎 ¿Dónde está disponible?</button></div>
        ${body}<small class="hint">Datos de TMDB / JustWatch. Pueden cambiar o no estar al día.</small>
    </div>`;
}
/** Sección de la ficha. */
function watchSectionHtml(w, openState) {
    const links = w.watchLinks || [];
    const words = watchWords(w.type);
    const locked = isLocked(w);
    const guess = platformByName(w.platform);
    const suggest = guess && !links.some(l => l.platform === guess.id) && watchPlatformsFor(w.type).some(p => p.id === guess.id)
        ? `<button type="button" class="chip" data-act="watch-suggest" data-id="${w.id}" data-platform="${guess.id}">＋ Buscar en ${esc(guess.name)} <small>(tu plataforma)</small></button>` : '';
    const options = watchPlatformsFor(w.type).map(p => `<option value="${p.id}">${p.icon} ${esc(p.name)}</option>`).join('');
    return `<details class="expandable" data-key="watch" ${openState ?? (links.length > 0) ? 'open' : ''}>
        <summary>${watchWords(w.type).open.slice(0, 2)} ${words.title}${links.length ? ' · ' + links.length : ''}</summary>
        <div class="expandable-content">
          ${links.length ? `<div class="watch-list">${links.map((l, i) => watchLinkRow(w, l, i, locked)).join('')}</div>` : `<p class="hint" style="margin:0 0 8px">Guarda dónde ${words.verb}: un enlace directo a la obra o la plataforma. No hace falta enlazar ninguna cuenta.</p>`}
          ${suggest ? `<div class="tag-list" style="margin-bottom:10px">${suggest}</div>` : ''}
          ${locked ? '' : `<div class="watch-form">
            <select class="text-input" id="watchPlatform" aria-label="Plataforma">${options}<option value="">🌐 Otra web…</option></select>
            <input type="url" class="text-input" id="watchUrl" placeholder="Enlace (opcional en las plataformas conocidas)" autocomplete="off">
            <input type="text" class="text-input" id="watchLabel" placeholder="Nombre de la web (ej.: Doramasia)" maxlength="40" hidden>
            <button type="button" class="btn btn-primary btn-sm" data-act="watch-add" data-id="${w.id}">＋ Añadir</button>
          </div>
          <small class="hint">Truco: escribe <code>{n}</code> donde va el número de episodio (y <code>{t}</code> el de temporada) y el botón te llevará justo al siguiente que te toca. Ej.: <code>https://sitio.com/serie-capitulo-{n}</code></small>`}
          ${watchProvidersHtml(w)}
        </div>
    </details>`;
}

// ---------- Acciones ----------
function saveWatchLinks(w, links, msg) {
    mutate(() => { if (links.length) w.watchLinks = links; else delete w.watchLinks; w.updatedAt = Date.now(); }, msg, { label: `Dónde verla “${w.title}”` });
}
FEATURE_ACTIONS['watch-open-section'] = (id, el) => {
    const d = document.querySelector('#detailPanel details[data-key="watch"]');
    if (d) { d.open = true; d.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
};
FEATURE_ACTIONS['watch-add'] = (id) => {
    const w = getWorkById(id);
    if (!w || isLocked(w)) return;
    const platform = $('watchPlatform').value, url = $('watchUrl').value.trim(), label = $('watchLabel').value.trim();
    if (url && !normalizeWatchUrl(url)) { showToast('⚠️ Ese enlace no parece una página web (debe empezar por http o https)', 'error', 4000); $('watchUrl').focus(); return; }
    if (!platform && !url) { showToast('✍️ Pega el enlace de la web', 'error'); $('watchUrl').focus(); return; }
    const link = makeWatchLink({ platform, url, label }, generateId);
    if (!link) { showToast('⚠️ No se pudo crear el enlace', 'error'); return; }
    const list = addWatchLink(w.watchLinks, link);
    if (list === (w.watchLinks || [])) { showToast('Ese enlace ya está en la lista'); return; }
    saveWatchLinks(w, list, `▶ Enlace añadido: ${watchLinkName(link)}`);
};
FEATURE_ACTIONS['watch-suggest'] = (id, el) => {
    const w = getWorkById(id);
    if (!w || isLocked(w)) return;
    const link = makeWatchLink({ platform: el.dataset.platform }, generateId);
    if (link) saveWatchLinks(w, addWatchLink(w.watchLinks, link), `▶ ${watchLinkName(link)} añadida`);
};
FEATURE_ACTIONS['watch-del'] = (id, el) => {
    const w = getWorkById(id);
    if (!w || isLocked(w)) return;
    saveWatchLinks(w, (w.watchLinks || []).filter(l => l.id !== el.dataset.link), '✕ Enlace quitado');
};
FEATURE_ACTIONS['watch-primary'] = (id, el) => {
    const w = getWorkById(id);
    if (!w || isLocked(w)) return;
    saveWatchLinks(w, makePrimary(w.watchLinks, el.dataset.link), '⭐ Enlace principal cambiado');
};
FEATURE_ACTIONS['watch-providers'] = async (id) => {
    const w = getWorkById(id);
    const key = appData.settings.tmdbKey;
    if (!w || !key) return;
    const country = ($('watchCountry') && $('watchCountry').value) || watchCountry();
    appData.settings.watchCountry = country;
    saveData();
    watchProviderState.set(id, { country });
    showToast('🔎 Buscando dónde está disponible…');
    try {
        const kind = w.seriesType === 'Película' ? 'movie' : 'tv';
        const found = await fetchJson(`https://api.themoviedb.org/3/search/${kind}?api_key=${encodeURIComponent(key)}&language=es-ES&query=${encodeURIComponent(w.title)}`);
        const hit = (found.results || [])[0];
        if (!hit) throw new Error('TMDB no encontró esta obra por su título');
        const json = await fetchJson(`https://api.themoviedb.org/3/${kind}/${hit.id}/watch/providers?api_key=${encodeURIComponent(key)}`);
        const result = parseWatchProviders(json, country);
        watchProviderState.set(id, { country, result: result || { none: true, flatrate: [], rent: [], buy: [], link: '' } });
    } catch (e) {
        watchProviderState.set(id, { country, error: /Failed to fetch|NetworkError/i.test(String(e.message)) ? 'No se pudo conectar con TMDB (¿sin internet?)' : (e.message || 'No se pudo consultar TMDB') });
    }
    if (currentDetailId === id) renderDetail();
};
async function fetchJson(url) {
    const res = await fetch(url);
    if (res.status === 401) throw new Error('La clave de TMDB no es válida');
    if (!res.ok) throw new Error('TMDB respondió con un error (' + res.status + ')');
    return res.json();
}
document.addEventListener('change', e => {
    if (e.target.id === 'watchPlatform') { const other = e.target.value === ''; $('watchLabel').hidden = !other; if (other) $('watchUrl').focus(); }
});
document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.target.id === 'watchUrl' || e.target.id === 'watchLabel')) {
        e.preventDefault(); e.stopPropagation();
        const w = getWorkById(currentDetailId);
        if (w) FEATURE_ACTIONS['watch-add'](w.id);
    }
}, true);

// ============================================================
// MIS PLATAFORMAS: AVISO CUANDO ALGO DE TU COLA LLEGA A UNA QUE TIENES (TMDB)
// ============================================================
const AVAIL_RECHECK_MS = 7 * 86400000;   // cada obra se consulta como mucho una vez por semana
const AVAIL_RUN_MS = 12 * 3600000;       // la comprobación automática, como mucho cada 12 horas
const AVAIL_BATCH = 8;
let availRunning = false;
const myPlatformIds = () => (appData.settings.myPlatforms || []).filter(id => WATCH_PLATFORMS.some(p => p.id === id));
const wait2 = ms => new Promise(r => setTimeout(r, ms));
function setAvailStatus(text) { const el = $('availStatus'); if (el) el.textContent = text || ''; }
/** Consulta en TMDB dónde está cada obra de tu cola y avisa de las que llegan a tus plataformas. */
async function checkAvailability({ auto = false } = {}) {
    const key = appData.settings.tmdbKey;
    if (availRunning || !key) { if (!auto && !key) showToast('🔑 Para esto necesitas tu clave gratuita de TMDB (Personalizar → Búsqueda de datos)', 'error', 6000); return; }
    if (!navigator.onLine) { if (!auto) showToast('📶 Sin conexión', 'error'); return; }
    availRunning = true;
    const country = watchCountry(), mineIds = myPlatformIds(), now = Date.now();
    const todo = queueItems(appData.works).filter(w => w.type !== 'book' && w.type !== 'manhwa' && !(w.availCheckedAt && now - w.availCheckedAt < AVAIL_RECHECK_MS && w.availCountry === country)).slice(0, auto ? AVAIL_BATCH : 40);
    const found = [];
    try {
        let n = 0;
        for (const w of todo) {
            n++;
            if (!auto) setAvailStatus(`Mirando ${n} de ${todo.length}…`);
            try {
                const kind = w.seriesType === 'Película' ? 'movie' : 'tv';
                const search = await fetchJson(`https://api.themoviedb.org/3/search/${kind}?api_key=${encodeURIComponent(key)}&language=es-ES&query=${encodeURIComponent(w.title)}`);
                const hit = pickBestMatch(w, parseTmdb({ results: (search.results || []).map(r => ({ ...r, media_type: kind })) }));
                if (!hit) { found.push({ w, none: true }); continue; }
                const json = await fetchJson(`https://api.themoviedb.org/3/${hit.externalId}/watch/providers?api_key=${encodeURIComponent(key)}`);
                found.push({ w, ...availabilityInfo(parseWatchProviders(json, country), mineIds) });
            } catch (e) { /* esa obra se intenta otro día */ }
            await wait2(auto ? 700 : 300);
        }
        const arrivals = [];
        if (found.length) {
            mutate(() => found.forEach(f => {
                f.w.availCheckedAt = now; f.w.availCountry = country;
                if (f.none) { delete f.w.availOn; delete f.w.availMine; return; }
                f.w.availOn = f.on; f.w.availMine = f.mine;
                newArrivals(f.mine, f.w.availNotified).forEach(name => arrivals.push({ id: `plat:${f.w.id}:${name}`, workId: f.w.id, platform: name, at: now }));
                f.w.availNotified = [...new Set([...(f.w.availNotified || []), ...f.mine])];
            }), null, { undo: false });
            if (arrivals.length && appData.settings.platformAlerts !== false) {
                appData.settings.platformArrivals = [...(appData.settings.platformArrivals || []), ...arrivals].slice(-30);
                saveData(); renderBell();
                const first = getWorkById(arrivals[0].workId);
                showToast(`📺 “${first.title}” ya está en ${arrivals[0].platform}${arrivals.length > 1 ? ` (y ${arrivals.length - 1} más)` : ''}`, 'success', 6000);
            }
        }
        appData.settings.availRunAt = now; saveData();
        if (!auto) setAvailStatus(found.length ? `Listo: ${found.filter(f => !f.none).length} de ${todo.length} encontradas en TMDB${arrivals.length ? ` · ${arrivals.length} ${arrivals.length === 1 ? 'nueva en tus plataformas' : 'nuevas en tus plataformas'}` : ''}.` : 'No hay nada nuevo que comprobar (se mira una vez por semana).');
        if (currentPage === 'queue') renderQueue();
    } finally { availRunning = false; }
}
function maybeCheckAvailability() {
    const s = appData.settings;
    if (!s.tmdbKey || s.platformAlerts === false || s.readOnly || navigator.webdriver || !navigator.onLine || !myPlatformIds().length) return;
    if (Date.now() - (Number(s.availRunAt) || 0) < AVAIL_RUN_MS) return;
    setTimeout(() => checkAvailability({ auto: true }).catch(() => { availRunning = false; }), 9000);
}
/** Avisos de la campana: lo que ha llegado a tus plataformas y sigue en tu cola. */
function platformBellItems(now = Date.now()) {
    return (appData.settings.platformArrivals || []).filter(a => now - a.at < 21 * 86400000).map(a => ({ a, w: getWorkById(a.workId) }))
        .filter(({ w }) => w && (isPlanned(w) || isRewatchWish(w)))
        .map(({ a, w }) => ({ id: a.id, icon: '📺', workId: w.id, title: `“${w.title}” ya está en ${a.platform}`, text: 'Está en tu cola: ya puedes verla.' }));
}
/** Texto corto "Disponible en Viki" para la ficha y la cola. */
function availabilityChipHtml(w) {
    if (!(w.availOn || []).length) return '';
    const mine = w.availMine || [];
    return `<span class="chip ${mine.length ? 'chip-pink' : 'chip-muted'} avail-chip" title="Según TMDB (${esc(w.availCountry || '')})">📺 ${mine.length ? `Ya en ${esc(mine.join(', '))}` : `Disponible en ${esc(w.availOn.slice(0, 3).join(', '))}`}</span>`;
}
function renderMyPlatforms() {
    const box = $('myPlatformsBox');
    if (!box) return;
    const s = appData.settings, mine = new Set(myPlatformIds());
    box.innerHTML = `<div class="pz-title" style="margin-top:12px">📺 Mis plataformas</div>
        <p class="panel-desc" style="margin:0 0 8px">Marca las que tienes. Si pones tu clave de TMDB, te aviso cuando algo de tu cola (“Quiero ver” o “Para rever”) llegue a una de ellas.</p>
        <div class="tag-list">${WATCH_PLATFORMS.filter(p => p.kind === 'v').map(p => `<button type="button" class="chip ${mine.has(p.id) ? '' : 'chip-muted'}" data-act="my-platform" data-id="${p.id}" aria-pressed="${mine.has(p.id)}">${p.icon} ${esc(p.name)}</button>`).join('')}</div>
        <div class="seg-inline wrap" style="margin-top:10px"><label class="field" style="margin:0"><span>País</span><select class="filter-select" id="myCountry" aria-label="País para las plataformas">${WATCH_COUNTRIES.map(([k, l]) => `<option value="${k}" ${k === watchCountry() ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label></div>
        <div class="setting-row" style="margin-top:10px"><span>🔔 Avisarme cuando llegue a mis plataformas</span><button class="toggle-switch" data-act="platform-alerts-toggle" id="platformAlertsToggle" role="switch" aria-checked="${s.platformAlerts !== false}" aria-label="Avisarme cuando llegue a mis plataformas"></button></div>
        <button type="button" class="btn btn-secondary" data-act="avail-check" style="margin-top:8px">📺 Mirar mi cola ahora</button> <small class="hint" id="availStatus" role="status"></small>`;
}
FEATURE_ACTIONS['my-platform'] = id => {
    const cur = new Set(myPlatformIds());
    if (cur.has(id)) cur.delete(id); else cur.add(id);
    appData.settings.myPlatforms = [...cur];
    // Lo ya consultado se vuelve a mirar con tu nueva lista
    appData.works.forEach(w => { delete w.availCheckedAt; });
    saveData(); renderMyPlatforms();
};
FEATURE_ACTIONS['platform-alerts-toggle'] = () => { appData.settings.platformAlerts = appData.settings.platformAlerts === false; saveData(); renderMyPlatforms(); };
FEATURE_ACTIONS['avail-check'] = () => {
    if (appData.settings.readOnly) { showToast('👀 Estás en modo solo lectura', 'error'); return; }
    checkAvailability().catch(e => { availRunning = false; setAvailStatus(String(e.message || 'No se pudo consultar ahora.')); });
};
document.addEventListener('change', e => {
    if (e.target.id === 'myCountry') { appData.settings.watchCountry = e.target.value; appData.works.forEach(w => { delete w.availCheckedAt; }); saveData(); }
});
