/*
 * Mi Mundo · moodboard.js
 * Moodboards: un tablero de imágenes por obra, persona o pareja.
 * Las imágenes se guardan en rec.gallery (lista de imágenes) y sus datos en rec.galleryInfo, otra lista
 * en el mismo orden (origen, título, forma y categoría). Así las galerías antiguas siguen funcionando
 * y los datos no se pierden al exportar o importar (aunque cambie la referencia de la imagen).
 * Se añaden subiendo varias a la vez, pegando enlaces (uno por línea) o buscando en internet.
 * Se carga antes que app.js.
 */
'use strict';

const MOODBOARD_MAX = 60;
const MOODBOARD_CATS = {
    works: [],
    persons: [['editorial', '📸 Editorial'], ['casual', '☕ Casual'], ['eventos', '🎤 Eventos'], ['personajes', '🎭 Personajes'], ['otros', '👥 Con otros']],
    couples: [['oficial', '✨ Oficial'], ['bts', '🎬 Behind the scenes'], ['fanart', '🎨 Fanart'], ['moments', '💕 Moments']]
};
const moodboardState = {}; // `${kind}:${id}` → { o: 'all' | orientación, cat: 'all' | categoría }
const mbGetter = kind => ({ works: getWorkById, persons: getPersonById, couples: getCoupleById }[kind]);
const mbMeta = (rec, i) => (rec.galleryInfo && rec.galleryInfo[i]) || {};

/** Forma de una imagen (horizontal, vertical o cuadrada) cargándola. */
function imageOrientation(src) {
    return new Promise(resolve => {
        const im = new Image();
        const t = setTimeout(() => resolve(''), 8000);
        im.onload = () => { clearTimeout(t); resolve(orientationOf(im.naturalWidth, im.naturalHeight)); };
        im.onerror = () => { clearTimeout(t); resolve(''); };
        im.src = resolveImageSrc(src);
    });
}

function moodboardHtml(kind, rec) {
    const key = `${kind}:${rec.id}`;
    const st = moodboardState[key] || { o: 'all', cat: 'all' };
    const cats = MOODBOARD_CATS[kind] || [];
    const all = (rec.gallery || []).map((src, i) => ({ src, i, meta: mbMeta(rec, i) }));
    const list = all.filter(x => (st.o === 'all' || x.meta.o === st.o) && (st.cat === 'all' || x.meta.cat === st.cat));
    const fileId = `mbFile_${kind}_${rec.id}`;
    const count = o => all.filter(x => x.meta.o === o).length;
    return `<div class="moodboard" data-mb="${key}">
        <div class="mb-toolbar">
            <button type="button" class="btn btn-primary btn-sm" data-upload="${fileId}">📤 Subir varias</button>
            <input type="file" id="${fileId}" accept="image/*" multiple hidden data-mb-file="${key}">
            <button type="button" class="btn btn-secondary btn-sm" data-act="mb-links" data-id="${key}">🔗 Pegar enlaces</button>
            <button type="button" class="btn btn-secondary btn-sm" data-act="mb-search" data-id="${key}">🔍 Buscar en internet</button>
            <span class="muted mb-count">${all.length}/${MOODBOARD_MAX}</span>
        </div>
        <div class="mb-links" id="mbLinks_${kind}_${rec.id}" hidden>
            <textarea class="text-input" rows="3" placeholder="Pega uno o varios enlaces de imágenes (uno por línea). Sirven los de Pinterest: «Copiar dirección de la imagen»."></textarea>
            <button type="button" class="btn btn-primary btn-sm" data-act="mb-links-add" data-id="${key}">Añadir</button>
        </div>
        ${all.length ? `<div class="tag-list mb-filters">
            ${[['all', 'Todas', all.length], ['horizontal', '▭ Horizontales', count('horizontal')], ['vertical', '▯ Verticales', count('vertical')], ['square', '◻ Cuadradas', count('square')]].filter(([k, , n]) => k === 'all' || n).map(([k, l, n]) => `<button type="button" class="chip chip-muted ${st.o === k ? 'is-on' : ''}" data-act="mb-filter" data-id="${key}" data-o="${k}">${l} · ${n}</button>`).join('')}
            ${cats.length ? `<span class="mb-sep"></span>${[['all', '🏷️ Todas las categorías']].concat(cats).map(([k, l]) => `<button type="button" class="chip chip-muted ${st.cat === k ? 'is-on' : ''}" data-act="mb-filter" data-id="${key}" data-cat="${k}">${l}${k !== 'all' ? ` · ${all.filter(x => x.meta.cat === k).length}` : ''}</button>`).join('')}` : ''}
        </div>` : ''}
        ${list.length ? `<div class="mb-grid">${list.map(x => `<figure class="mb-item">
            <button type="button" class="mb-open" data-act="mb-view" data-id="${key}" data-item="${x.i}">${img(x.src, 'banner', x.meta.title || `Imagen ${x.i + 1}`)}</button>
            <div class="mb-actions">
                <button type="button" class="icon-btn sm" data-act="mb-view" data-id="${key}" data-item="${x.i}" aria-label="Ampliar" title="Ampliar">🔍</button>
                <button type="button" class="icon-btn sm" data-act="mb-move" data-id="${key}" data-item="${x.i}" data-dir="-1" aria-label="Mover antes" title="Mover antes" ${x.i === 0 ? 'disabled' : ''}>←</button>
                <button type="button" class="icon-btn sm" data-act="mb-move" data-id="${key}" data-item="${x.i}" data-dir="1" aria-label="Mover después" title="Mover después" ${x.i === all.length - 1 ? 'disabled' : ''}>→</button>
                <button type="button" class="icon-btn sm danger" data-act="mb-del" data-id="${key}" data-item="${x.i}" aria-label="Quitar" title="Quitar">✕</button>
            </div>
            ${cats.length ? `<select class="mb-cat" data-mb-cat="${key}" data-item="${x.i}" aria-label="Categoría"><option value="">Sin categoría</option>${cats.map(([k, l]) => `<option value="${k}" ${x.meta.cat === k ? 'selected' : ''}>${l}</option>`).join('')}</select>` : ''}
        </figure>`).join('')}</div>`
        : `<p class="panel-desc mb-empty">${all.length ? 'Ninguna imagen con este filtro.' : '🎨 Tu tablero está vacío: sube fotos, pega enlaces (también de Pinterest) o busca imágenes en internet.'}</p>`}
    </div>`;
}
/** Añade imágenes ya guardadas ({ ref, meta }) al moodboard. */
async function addToMoodboard(kind, id, items) {
    const rec = mbGetter(kind)(id);
    if (!rec) return;
    const room = MOODBOARD_MAX - (rec.gallery || []).length;
    if (room <= 0) { showToast(`⚠️ Máximo ${MOODBOARD_MAX} imágenes por tablero`, 'error'); return; }
    const fresh = items.filter(x => x.ref && !(rec.gallery || []).includes(x.ref)).slice(0, room);
    const shapes = await Promise.all(fresh.map(x => (x.meta && x.meta.o) || imageOrientation(x.ref)));
    const keepLink = mediaSetting('sourceLink');
    mutate(() => {
        const before = (rec.gallery || []).length;
        const info = Array.from({ length: before }, (_, i) => mbMeta(rec, i));
        fresh.forEach((x, i) => {
            const m = { o: shapes[i] || undefined, title: (x.meta && x.meta.title) || undefined, origin: (x.meta && x.meta.origin) || undefined, page: keepLink && x.meta && x.meta.page ? x.meta.page : undefined };
            Object.keys(m).forEach(k => m[k] === undefined && delete m[k]);
            info.push(m);
        });
        rec.gallery = [...(rec.gallery || []), ...fresh.map(x => x.ref)];
        setGalleryInfo(rec, info);
    }, `🎨 ${fresh.length} ${fresh.length === 1 ? 'imagen añadida' : 'imágenes añadidas'} al moodboard`, { label: 'Añadir al moodboard' });
    if (items.length > fresh.length && fresh.length === room) showToast(`⚠️ Solo cabían ${room}: el máximo son ${MOODBOARD_MAX}`, 'error');
}
/** Guarda la lista de datos (o la quita si no hay nada que guardar). */
function setGalleryInfo(rec, info) {
    if (info.some(m => m && Object.keys(m).length)) rec.galleryInfo = info.map(m => m || {});
    else delete rec.galleryInfo;
}
const splitKey = key => { const i = key.indexOf(':'); return [key.slice(0, i), key.slice(i + 1)]; };

FEATURE_ACTIONS['mb-filter'] = (key, el) => {
    const st = moodboardState[key] = moodboardState[key] || { o: 'all', cat: 'all' };
    if (el.dataset.o) st.o = el.dataset.o;
    if (el.dataset.cat) st.cat = el.dataset.cat;
    refreshView();
};
FEATURE_ACTIONS['mb-links'] = key => { const [k, id] = splitKey(key); const box = $(`mbLinks_${k}_${id}`); box.hidden = !box.hidden; if (!box.hidden) box.querySelector('textarea').focus(); };
FEATURE_ACTIONS['mb-links-add'] = async key => {
    const [kind, id] = splitKey(key);
    const box = $(`mbLinks_${kind}_${id}`);
    const lines = box.querySelector('textarea').value.split(/\s+/).map(s => s.trim()).filter(Boolean);
    if (!lines.length) return;
    const bad = lines.filter(u => imageUrlProblem(u));
    const good = lines.filter(u => !imageUrlProblem(u));
    if (bad.length) showToast(`⚠️ ${bad.length} ${bad.length === 1 ? 'enlace no es' : 'enlaces no son'} de una imagen${bad.some(u => /pinterest|pin\.it/i.test(u)) ? ' (en Pinterest copia la dirección de la imagen, no la del pin)' : ''}`, 'error', 5000);
    if (!good.length) return;
    showToast(`⏳ Guardando ${good.length} ${good.length === 1 ? 'imagen' : 'imágenes'}…`);
    const items = [];
    for (const u of good) items.push({ ref: await storeRemoteImage(u, null), meta: { origin: /pinimg|pinterest/i.test(u) ? 'pinterest' : 'web' } });
    await addToMoodboard(kind, id, items);
};
FEATURE_ACTIONS['mb-search'] = key => {
    const [kind, id] = splitKey(key);
    const rec = mbGetter(kind)(id);
    if (!rec) return;
    const name = rec.title || rec.name;
    const people = kind === 'works' ? splitList([rec.actors, rec.author].filter(Boolean).join(',')).slice(0, 2) : [];
    openImageSearch({ use: 'moodboard', query: name, ctx: kind, target: { kind, id }, type: rec.type || '', people });
};
FEATURE_ACTIONS['mb-del'] = (key, el) => {
    const [kind, id] = splitKey(key);
    const rec = mbGetter(kind)(id);
    const i = Number(el.dataset.item);
    if (!rec || !rec.gallery || rec.gallery[i] === undefined) return;
    if (sheetRefresh && $('sheetModal').classList.contains('active') && $('sheetBody').querySelector('.mb-big')) closeModal('sheetModal');
    mutate(() => {
        const info = rec.gallery.map((_, j) => mbMeta(rec, j)).filter((_, j) => j !== i);
        rec.gallery = rec.gallery.filter((_, j) => j !== i);
        setGalleryInfo(rec, info);
        if (!rec.gallery.length) delete rec.gallery;
    }, '✕ Imagen quitada del moodboard', { label: 'Quitar del moodboard' });
};
FEATURE_ACTIONS['mb-move'] = (key, el) => {
    const [kind, id] = splitKey(key);
    const rec = mbGetter(kind)(id);
    const i = Number(el.dataset.item), j = i + Number(el.dataset.dir);
    if (!rec || j < 0 || j >= rec.gallery.length) return;
    mutate(() => {
        const g = rec.gallery.slice(), info = g.map((_, k) => mbMeta(rec, k));
        [g[i], g[j]] = [g[j], g[i]];
        [info[i], info[j]] = [info[j], info[i]];
        rec.gallery = g;
        setGalleryInfo(rec, info);
    }, '', { label: 'Ordenar moodboard' });
};
/** Vista grande con anterior/siguiente y "usar como…". */
FEATURE_ACTIONS['mb-view'] = (key, el) => {
    const [kind, id] = splitKey(key);
    const rec = mbGetter(kind)(id);
    if (!rec || !rec.gallery) return;
    const i = Math.max(0, Math.min(rec.gallery.length - 1, Number(el.dataset.item)));
    const n = rec.gallery.length;
    const src = rec.gallery[i], meta = mbMeta(rec, i);
    const name = rec.title || rec.name;
    openSheet(`🎨 ${name} · ${i + 1}/${n}`, () => `<div class="gallery-big mb-big">${img(src, 'banner', meta.title || '')}</div>
        ${meta.title || meta.page ? `<p class="hint" style="text-align:center;margin-top:8px">${esc(meta.title || '')} ${meta.page ? `<a class="link-btn" href="${esc(meta.page)}" target="_blank" rel="noopener noreferrer">${meta.origin === 'pinterest' ? '📌 Ver en Pinterest' : '↗ Ver origen'}</a>` : ''}</p>` : ''}
        <div class="seg-inline wrap" style="justify-content:center;margin-top:12px">
            <button class="btn btn-secondary btn-sm" data-act="mb-view" data-id="${key}" data-item="${(i - 1 + n) % n}">← Anterior</button>
            <button class="btn btn-secondary btn-sm" data-act="mb-use" data-id="${key}" data-item="${i}" data-field="image">${kind === 'persons' ? 'Usar como foto' : kind === 'couples' ? 'Usar como imagen' : 'Usar como portada'}</button>
            <button class="btn btn-secondary btn-sm" data-act="mb-use" data-id="${key}" data-item="${i}" data-field="banner">Usar como banner</button>
            <button class="btn btn-secondary btn-sm" data-act="mb-view" data-id="${key}" data-item="${(i + 1) % n}">Siguiente →</button></div>`);
};
FEATURE_ACTIONS['mb-use'] = async (key, el) => {
    const [kind, id] = splitKey(key);
    const rec = mbGetter(kind)(id);
    const src = rec && rec.gallery && rec.gallery[Number(el.dataset.item)];
    if (!src) return;
    const field = el.dataset.field;
    closeModal('sheetModal');
    let ref = src;
    // El banner se recorta a 3:1 (y la foto en cuadrado) a partir de una copia
    const prep = field === 'banner' ? 'banner' : kind === 'persons' ? 'avatar' : null;
    if (prep) { try { ref = await store.saveImage((await prepareImage(resolveImageSrc(src), prep)).blob); } catch (e) { ref = src; } }
    mutate(() => { rec[field] = ref; rec.updatedAt = Date.now(); }, field === 'banner' ? '🖼️ Banner cambiado' : '🖼️ Imagen cambiada', { label: field === 'banner' ? 'Cambiar banner' : 'Cambiar imagen' });
};
// Compatibilidad con los botones antiguos de la galería
FEATURE_ACTIONS['gallery-view'] = (id, el) => FEATURE_ACTIONS['mb-view']('works:' + id, el);

document.addEventListener('change', async e => {
    const t = e.target;
    if (t.dataset && t.dataset.mbCat) {
        const [kind, id] = splitKey(t.dataset.mbCat);
        const rec = mbGetter(kind)(id);
        const i = Number(t.dataset.item);
        if (!rec || rec.gallery[i] === undefined) return;
        mutate(() => {
            const info = rec.gallery.map((_, k) => ({ ...mbMeta(rec, k) }));
            if (t.value) info[i].cat = t.value; else delete info[i].cat;
            setGalleryInfo(rec, info);
        }, '🏷️ Categoría cambiada', { label: 'Categoría del moodboard' });
        return;
    }
    if (t.dataset && t.dataset.mbFile) {
        const [kind, id] = splitKey(t.dataset.mbFile);
        const files = [...(t.files || [])].filter(f => f.type.startsWith('image/'));
        t.value = '';
        if (!files.length) return;
        showToast(`⏳ Guardando ${files.length} ${files.length === 1 ? 'imagen' : 'imágenes'}…`);
        const items = [];
        for (const f of files) {
            if (f.size > IMAGE_MAX_BYTES) { showToast(`⚠️ “${f.name}” pesa más de 20 MB`, 'error'); continue; }
            const local = URL.createObjectURL(f);
            try { items.push({ ref: await store.saveImage(await compressImage(local, 'gallery')), meta: { title: f.name.replace(/\.[a-z0-9]+$/i, '') } }); }
            catch (err) { showToast(isQuotaError(err) ? '⚠️ No queda espacio' : `❌ No se pudo leer “${f.name}”`, 'error'); }
            finally { URL.revokeObjectURL(local); }
        }
        if (items.length) await addToMoodboard(kind, id, items);
    }
});
