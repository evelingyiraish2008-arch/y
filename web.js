/*
 * Mi Mundo · web.js
 * "Buscar en internet": un solo sitio para buscar obras, etiquetas, personas o imágenes en toda la web.
 * Google y Pinterest no dejan que otras apps busquen dentro de ellos, así que se abren en otra pestaña
 * con lo escrito ya puesto (y sugerencias para tocar: reparto, sinopsis, etiquetas, dónde verla…).
 * Está en la búsqueda global (Ctrl K), en las fichas de obras, personas y parejas, y en el panel de imágenes.
 * Los enlaces y las sugerencias se calculan en mediakit.js. Se carga antes que app.js.
 */
'use strict';

let webState = { query: '', kind: 'works', type: '', bl: false };
function webOpen(url) { window.open(url, '_blank', 'noopener,noreferrer'); }
const webLink = (id, q, kind = 'works') => (webSearchLinks(q, kind).find(l => l.id === id) || {}).url || '';

/** Pie de la búsqueda global y de la paleta: "¿No está? Búscalo en Google · Pinterest · más". */
function webFooterHtml(raw) {
    const q = String(raw || '').trim();
    if (q.length < 2) return '';
    return `<div class="search-web"><span>🌐 ¿No está? Buscar “${esc(q.length > 28 ? q.slice(0, 28) + '…' : q)}” en</span>
        <button type="button" class="chip" data-act="web-go" data-id="google" data-q="${esc(q)}">🔎 Google</button>
        <button type="button" class="chip" data-act="web-go" data-id="pinterest" data-q="${esc(q)}">📌 Pinterest</button>
        <button type="button" class="chip chip-muted" data-act="web-query" data-id="${esc(q)}">Más…</button></div>`;
}
/** Abre la ventana de búsqueda en internet. */
function openWebSearch({ query = '', kind = 'works', type = '', bl = false } = {}) {
    webState = { query: String(query || '').trim(), kind, type, bl };
    const titles = { works: '🌐 Buscar la obra en internet', persons: '🌐 Buscar a la persona en internet', couples: '🌐 Buscar la pareja en internet', collections: '🌐 Buscar ideas en internet' };
    openSheet(titles[kind] || '🌐 Buscar en internet', renderWebSearch);
    setTimeout(() => { const i = $('webQ'); if (i) { i.focus(); i.select(); } }, 80);
}
function renderWebSearch() {
    const s = webState;
    const links = webSearchLinks(s.query || ' ', s.kind);
    const sugg = webSuggestions({ name: s.query, kind: s.kind, type: s.type, bl: s.bl });
    const others = links.filter(l => !l.main);
    return `<form class="img-search-form" id="webForm" role="search">
            <input type="search" class="text-input" id="webQ" value="${esc(s.query)}" placeholder="¿Qué quieres buscar?" autocomplete="off" aria-label="Buscar en internet">
            <button type="submit" class="btn btn-primary btn-sm">Buscar</button>
        </form>
        <div class="web-main">
            <button type="button" class="btn btn-primary" data-act="web-go" data-id="google">🔎 Google</button>
            <button type="button" class="btn btn-secondary" data-act="web-go" data-id="pinterest">📌 Pinterest</button>
        </div>
        ${sugg.length ? `<div class="detail-section-title" style="margin-top:14px">Búsquedas que suelen servir</div>
            <div class="tag-list">${sugg.map(x => `<button type="button" class="chip chip-muted" data-act="web-go" data-id="google" data-q="${esc(x.query)}" title="Buscar “${esc(x.query)}” en Google">${esc(x.label)}</button>`).join('')}</div>` : ''}
        <details class="expandable" style="margin-top:14px"><summary>Más buscadores</summary><div class="expandable-content"><div class="seg-inline wrap">
            ${others.map(l => `<button type="button" class="btn btn-secondary btn-sm" data-act="web-go" data-id="${l.id}">${l.icon} ${esc(l.name)}</button>`).join('')}</div></div></details>
        <p class="hint" style="margin-top:12px">Se abren en otra pestaña. Pinterest y Google no dejan buscar dentro de la app: elige lo que quieras allí y, para una imagen, copia su dirección («Copiar dirección de la imagen») y pégala en el 🖼️ de la portada, el banner o el moodboard.</p>`;
}
FEATURE_ACTIONS['web-go'] = (id, el) => {
    const q = (el && el.dataset.q) || ($('webQ') ? $('webQ').value : webState.query);
    const url = webLink(id, q, webState.kind);
    if (!String(q || '').trim()) { showToast('✍️ Escribe qué quieres buscar', 'error'); if ($('webQ')) $('webQ').focus(); return; }
    if (url) webOpen(url);
};
FEATURE_ACTIONS['web-query'] = q => openWebSearch({ query: q });
FEATURE_ACTIONS['web-work'] = id => { const w = getWorkById(id); if (w) openWebSearch({ query: w.title, kind: 'works', type: w.type, bl: !!w.bl }); };
FEATURE_ACTIONS['web-person'] = id => { const p = getPersonById(id); if (p) openWebSearch({ query: p.name, kind: 'persons' }); };
FEATURE_ACTIONS['web-couple'] = id => { const c = getCoupleById(id); if (c) openWebSearch({ query: coupleTitle(c), kind: 'couples' }); };
document.addEventListener('submit', e => {
    if (e.target.id !== 'webForm') return;
    e.preventDefault();
    webState.query = $('webQ').value.trim();
    FEATURE_ACTIONS['web-go']('google');
});
document.addEventListener('input', e => {
    if (e.target.id === 'webQ') webState.query = e.target.value; // se recuerda al repintar la ventana
});
