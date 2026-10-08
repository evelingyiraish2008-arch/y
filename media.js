/*
 * Mi Mundo · media.js
 * Banners: el campo para elegirlos (subir, pegar enlace, buscar), el editor de recorte,
 * las cabeceras con banner (obras, personas, parejas, colecciones y perfil) y su gestión en Personalizar.
 * Los cálculos (recortes, tamaños, enlaces) están en mediakit.js.
 * Se carga antes que app.js.
 */
'use strict';

// ============================================================
// 2. PROCESAR IMÁGENES (subidas, enlaces y recortes)
// ============================================================
/** Carga una imagen; si es de otra web se pide con CORS para poder recortarla. */
async function loadImageCors(src, timeout = 15000) {
    try { return await loadImageDirect(src, timeout); } catch (e) {
        // La web no deja leer su imagen (CORS): se pide por el servicio gratuito que sí lo permite, para poder recortarla y moverla
        const proxied = mediaSetting('proxy') ? corsProxyUrl(src) : '';
        if (!proxied) throw e;
        return loadImageDirect(proxied, timeout);
    }
}
function loadImageDirect(src, timeout) {
    return new Promise((resolve, reject) => {
        const im = new Image();
        if (/^https?:/i.test(src)) im.crossOrigin = 'anonymous';
        const timer = setTimeout(() => { im.src = ''; reject(new Error('timeout')); }, timeout);
        im.onload = () => { clearTimeout(timer); resolve(im); };
        im.onerror = () => { clearTimeout(timer); reject(new Error('load')); };
        im.src = src;
    });
}
/** Pasa un lienzo a JPEG; si pesa más de 500 KB lo vuelve a comprimir un poco más. */
async function canvasToJpeg(canvas, quality = 0.85) {
    let blob = await canvasToBlob(canvas, 'image/jpeg', quality);
    if (blob.size > IMAGE_TARGET_BYTES) blob = await canvasToBlob(canvas, 'image/jpeg', 0.7);
    return blob;
}
/** Recorta (si hace falta) y reduce una imagen para el uso indicado. Devuelve un Blob JPEG y el plan usado. */
async function prepareImage(src, kind) {
    const conf = CROP_KINDS[kind] || CROP_KINDS.banner;
    const im = await loadImageCors(src);
    const plan = imagePlan(im.naturalWidth, im.naturalHeight, { aspect: conf.aspect, maxW: conf.out[0] });
    const canvas = document.createElement('canvas');
    canvas.width = plan.outW; canvas.height = plan.outH;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#191928';
    ctx.fillRect(0, 0, plan.outW, plan.outH);
    ctx.imageSmoothingQuality = 'high';
    const { sx, sy, sw, sh } = plan.crop;
    ctx.drawImage(im, sx, sy, sw, sh, 0, 0, plan.outW, plan.outH); // un GIF se queda con su primer fotograma
    return { blob: await canvasToJpeg(canvas), plan };
}
/** Descarga una imagen de otra web (si la web lo permite) y la guarda ya preparada. */
/** fetch con permiso; si la web no lo da, por el servicio gratuito de imágenes (si está activado). */
async function fetchImageBlob(url) {
    const attempt = async u => { const res = await fetch(u, { mode: 'cors' }); if (!res.ok) throw new Error('HTTP ' + res.status); return res.blob(); };
    try { return await attempt(url); } catch (e) {
        const proxied = mediaSetting('proxy') ? corsProxyUrl(url) : '';
        if (!proxied) throw e;
        return attempt(proxied);
    }
}
async function downloadImage(url, kind) {
    const blob = await fetchImageBlob(url);
    if (blob.type && !blob.type.startsWith('image/')) throw new Error('not-image');
    const local = URL.createObjectURL(blob);
    try { return await prepareImage(local, kind); } finally { URL.revokeObjectURL(local); }
}
/** Comprueba que un enlace carga como imagen. Devuelve '' si va bien o el mensaje de error. */
async function checkImageUrl(url) {
    const problem = imageUrlProblem(url);
    if (problem) return problem;
    try {
        await new Promise((resolve, reject) => {
            const im = new Image();
            const timer = setTimeout(() => reject(new Error('timeout')), 12000);
            im.onload = () => { clearTimeout(timer); resolve(); };
            im.onerror = () => { clearTimeout(timer); reject(new Error('load')); };
            im.src = url;
        });
        return '';
    } catch (e) {
        return looksLikeImageUrl(url) ? 'No se pudo cargar la imagen' : 'La URL no apunta a una imagen';
    }
}
const mediaSetting = key => {
    const s = appData.settings || {};
    return { download: s.bannerDownload !== false, resize: s.bannerResize !== false, sourceLink: s.imageSourceLink !== false, proxy: s.imageProxy !== false }[key];
};

// ============================================================
// 3. CAMPO DE IMAGEN (banner): vista previa + subir / pegar enlace / buscar
// ============================================================
const IMG_FIELD_TEXT = {
    banner: { empty: 'Sin banner: se usará la imagen principal difuminada', hint: 'Horizontal 3:1 (por ejemplo 1200×400). JPG, PNG, WEBP o GIF de hasta 20 MB.' },
    avatar: { empty: 'Sin foto', hint: 'Cuadrada. Se recorta por el centro.' },
    couple: { empty: 'Sin imagen', hint: 'Horizontal.' }
};
/** HTML del campo. El valor vive en un input oculto con ese id (así los formularios lo leen como siempre). */
function imgFieldHtml(id, { kind = 'banner', field = '', queryFrom = '', query = '', value = '', ctx = '' } = {}) {
    const t = IMG_FIELD_TEXT[kind] || IMG_FIELD_TEXT.banner;
    return `<div class="img-field kind-${kind}" data-img-field="${id}" data-kind="${kind}" ${queryFrom ? `data-query-from="${queryFrom}"` : ''} ${query ? `data-query="${esc(query)}"` : ''} ${ctx ? `data-ctx="${ctx}"` : ''}>
        <input type="text" hidden id="${id}" ${field ? `data-field="${field}"` : ''} value="${esc(value)}" data-img-value>
        <input type="file" hidden id="${id}__file" accept="${IMAGE_TYPES.join(',')}" data-img-file="${id}">
        <div class="img-preview">
            <img alt="" data-ph="banner">
            <div class="img-empty">🖼️ <span>${esc(t.empty)}</span></div>
            <div class="img-overlay">
                <button type="button" class="btn btn-sm" data-act="img-upload" data-id="${id}" title="Cambiar">🔄 Cambiar</button>
                <button type="button" class="btn btn-sm" data-act="img-crop" data-id="${id}" title="Recortar">✂️ Recortar</button>
                <button type="button" class="btn btn-sm" data-act="img-clear" data-id="${id}" title="Quitar">🗑️ Quitar</button>
            </div>
            <div class="img-busy" hidden>⏳ Preparando…</div>
        </div>
        <div class="img-actions">
            <button type="button" class="btn btn-secondary btn-sm" data-act="img-upload" data-id="${id}">📤 Subir</button>
            <button type="button" class="btn btn-secondary btn-sm" data-act="img-url" data-id="${id}">🔗 Pegar URL</button>
            <button type="button" class="btn btn-secondary btn-sm" data-act="img-search" data-id="${id}">🔍 Buscar en internet</button>
        </div>
        <div class="img-url-row" hidden>
            <input type="url" class="text-input" id="${id}__url" placeholder="https://…/imagen.jpg" autocomplete="off">
            <button type="button" class="btn btn-primary btn-sm" data-act="img-url-apply" data-id="${id}">Usar</button>
        </div>
        <small class="img-error" role="alert" hidden></small>
        <small class="hint">${esc(t.hint)}</small>
    </div>`;
}
/** Monta los campos declarados en el HTML con <div data-img-mount="id" data-kind data-field data-query-from>. */
function mountImgFields(root = document) {
    root.querySelectorAll('[data-img-mount]').forEach(el => {
        const d = el.dataset;
        el.outerHTML = imgFieldHtml(d.imgMount, { kind: d.kind, field: d.field, queryFrom: d.queryFrom, ctx: d.ctx });
    });
}
const imgFieldOf = id => document.querySelector(`[data-img-field="${CSS.escape(id)}"]`);
/** Pinta la vista previa según el valor actual del campo. */
function refreshImgField(id) {
    const box = imgFieldOf(id), input = $(id);
    if (!box || !input) return;
    const src = resolveImageSrc(input.value.trim());
    const im = box.querySelector('.img-preview img');
    box.classList.toggle('has-image', !!src);
    if (src) { im.onerror = () => { im.onerror = null; box.classList.remove('has-image'); showImgError(id, 'No se pudo cargar la imagen'); }; im.src = src; }
    else im.removeAttribute('src');
    showImgError(id, '');
}
function refreshImgFields(root = document) { root.querySelectorAll('[data-img-field]').forEach(b => refreshImgField(b.dataset.imgField)); }
function showImgError(id, msg) {
    const el = imgFieldOf(id) && imgFieldOf(id).querySelector('.img-error');
    if (!el) return;
    el.textContent = msg ? '⚠️ ' + msg : '';
    el.hidden = !msg;
}
function setImgBusy(id, busy) {
    const el = imgFieldOf(id) && imgFieldOf(id).querySelector('.img-busy');
    if (el) el.hidden = !busy;
}
/** Cambia el valor y avisa con 'input' (así se guarda el borrador, los ajustes, etc.). */
function setImgField(id, value) {
    const input = $(id);
    if (!input) return;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    refreshImgField(id);
}
const imgKindOf = id => (imgFieldOf(id) && imgFieldOf(id).dataset.kind) || 'banner';
function imgQueryOf(id) {
    const box = imgFieldOf(id);
    if (!box) return '';
    const from = box.dataset.queryFrom && $(box.dataset.queryFrom);
    return (from ? from.value : box.dataset.query || '').trim();
}

/** Guarda una imagen (archivo, blob o enlace) en el campo, preparándola según los ajustes. */
async function useImageIn(id, source, { file = null } = {}) {
    const kind = imgKindOf(id);
    showImgError(id, '');
    setImgBusy(id, true);
    try {
        if (file) {
            if (!IMAGE_TYPES.includes(file.type) && !/^image\//.test(file.type)) throw new Error('El archivo no es una imagen (JPG, PNG, WEBP o GIF)');
            if (file.size > IMAGE_MAX_BYTES) throw new Error(`La imagen pesa ${formatBytes(file.size)}: el máximo son 20 MB`);
            if (!mediaSetting('resize')) { setImgField(id, await store.saveImage(file)); return; }
            const local = URL.createObjectURL(file);
            try {
                const { blob, plan } = await prepareImage(local, kind);
                setImgField(id, await store.saveImage(blob));
                imageReadyToast(id, kind, plan, file.size, blob.size);
            } finally { URL.revokeObjectURL(local); }
            return;
        }
        const url = String(source || '').trim();
        const problem = await checkImageUrl(url);
        if (problem) throw new Error(problem);
        if (mediaSetting('download') && /^https?:/i.test(url)) {
            try {
                const { blob, plan } = await downloadImage(url, kind);
                setImgField(id, await store.saveImage(blob));
                imageReadyToast(id, kind, plan, 0, blob.size);
                return;
            } catch (e) { /* la web no deja descargarla: se guarda el enlace */ }
        }
        setImgField(id, url);
        showToast(/^https?:/i.test(url) ? '🔗 Imagen enlazada (se carga desde su web)' : '🖼️ Imagen lista');
    } catch (e) {
        const msg = isQuotaError(e) ? 'No queda espacio para guardar la imagen' : (e.message && !/^(load|timeout|HTTP)/.test(e.message) ? e.message : 'No se pudo cargar la imagen');
        showImgError(id, msg);
        showToast('⚠️ ' + msg, 'error');
    } finally { setImgBusy(id, false); }
}
function imageReadyToast(id, kind, plan, before, after) {
    const name = (CROP_KINDS[kind] || CROP_KINDS.banner).name;
    const parts = [`${plan.outW}×${plan.outH}`, formatBytes(after)];
    const note = plan.small ? ' · es pequeña, puede verse algo borrosa' : plan.cropped ? ' · recortada por el centro' : '';
    showToast(`✅ ${name[0].toUpperCase() + name.slice(1)} listo (${parts.join(', ')})${note}`, 'info', 4500, { label: '✂️ Recortar', run: () => FEATURE_ACTIONS['img-crop'](id) });
}

FEATURE_ACTIONS['img-upload'] = id => { const f = $(id + '__file'); if (f) f.click(); };
FEATURE_ACTIONS['img-url'] = id => {
    const row = imgFieldOf(id) && imgFieldOf(id).querySelector('.img-url-row');
    if (!row) return;
    row.hidden = !row.hidden;
    if (!row.hidden) setTimeout(() => $(id + '__url').focus(), 30);
};
FEATURE_ACTIONS['img-url-apply'] = async id => {
    const url = $(id + '__url').value.trim();
    const problem = imageUrlProblem(url);
    if (problem) { showImgError(id, problem); return; }
    await useImageIn(id, url);
    if (!imgFieldOf(id).querySelector('.img-error').textContent) { $(id + '__url').value = ''; imgFieldOf(id).querySelector('.img-url-row').hidden = true; }
};
FEATURE_ACTIONS['img-clear'] = id => { setImgField(id, ''); };
FEATURE_ACTIONS['img-crop'] = id => {
    const v = $(id) && $(id).value.trim();
    if (!v) return;
    const kind = imgKindOf(id);
    openCropper(resolveImageSrc(v), kind, async blob => setImgField(id, await store.saveImage(blob)));
};
FEATURE_ACTIONS['img-search'] = id => {
    if (typeof openImageSearch !== 'function') return;
    const kind = imgKindOf(id);
    openImageSearch({ use: kind === 'avatar' ? 'photo' : kind, query: imgQueryOf(id), ctx: imgFieldOf(id).dataset.ctx || '', onPick: src => useImageIn(id, src) });
};
document.addEventListener('change', e => {
    const t = e.target;
    if (!t.dataset || !t.dataset.imgFile) return;
    const file = t.files && t.files[0];
    t.value = '';
    if (file) useImageIn(t.dataset.imgFile, null, { file });
});
document.addEventListener('input', e => {
    const t = e.target;
    if (t.id === 'profileBannerInput') { appData.settings.profileBanner = t.value; saveData(); applyProfileBanner(); renderBannerPanel(); }
    if (t.id === 'quickBanner' && quickBannerTarget) saveQuickBanner(t.value);
});
document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.id && e.target.id.endsWith('__url')) { e.preventDefault(); e.stopPropagation(); FEATURE_ACTIONS['img-url-apply'](e.target.id.slice(0, -5)); }
}, true);
// Pegar una imagen (Ctrl+V) estando en el campo del enlace
document.addEventListener('paste', e => {
    const t = e.target;
    if (!t.id || !t.id.endsWith('__url')) return;
    const item = [...(e.clipboardData && e.clipboardData.items || [])].find(i => i.type.startsWith('image/'));
    if (item) { e.preventDefault(); useImageIn(t.id.slice(0, -5), null, { file: item.getAsFile() }); }
});

// ============================================================
// 4. EDITOR DE RECORTE
// ============================================================
let crop = null;
/** Abre el editor. onDone recibe el Blob recortado (no se llama si se cancela). */
async function openCropper(src, kind = 'banner', onDone = () => {}) {
    const conf = CROP_KINDS[kind] || CROP_KINDS.banner;
    let im;
    try { im = await loadImageCors(src); } catch (e) { showToast('⚠️ No se pudo abrir la imagen para recortarla', 'error'); return; }
    crop = { im, conf, onDone, aspect: conf.aspect, grid: true, st: { zoom: 1, x: 0, y: 0, rot: 0, flipH: false, flipV: false } };
    $('cropRatio').innerHTML = conf.ratios.map(([l, r]) => `<option value="${r}">${l}</option>`).join('');
    $('cropRatio').hidden = conf.ratios.length < 2;
    $('cropZoom').value = 1;
    $('cropTitle').textContent = `✂️ Recortar ${conf.name}`;
    $('cropGridBtn').classList.add('is-on');
    $('cropGrid').hidden = false;
    openModal('cropModal');
    requestAnimationFrame(drawCropper);
}
function cropFrame() {
    const stage = $('cropStage');
    const W = Math.max(120, Math.min(stage.clientWidth || 600, 760));
    const H = W / crop.aspect; // sin redondear: así el tamaño final sale exacto (1200×400)
    const maxH = Math.max(200, Math.round(window.innerHeight * 0.55));
    if (H > maxH) return [maxH * crop.aspect, maxH];
    return [W, H];
}
/** Dibuja la imagen con el zoom, giro y desplazamiento actuales en un lienzo de W×H (fw = ancho del marco en pantalla). */
function paintCrop(ctx, W, H, fw) {
    const { im, st } = crop;
    const k = W / fw;
    const s = coverScale(im.naturalWidth, im.naturalHeight, W, H, st.rot) * st.zoom;
    ctx.save();
    ctx.fillStyle = '#191928';
    ctx.fillRect(0, 0, W, H);
    ctx.imageSmoothingQuality = 'high';
    ctx.translate(W / 2 + st.x * k, H / 2 + st.y * k);
    ctx.scale(st.flipH ? -1 : 1, st.flipV ? -1 : 1);
    ctx.rotate(st.rot * Math.PI / 180);
    ctx.drawImage(crop.im, -im.naturalWidth * s / 2, -im.naturalHeight * s / 2, im.naturalWidth * s, im.naturalHeight * s);
    ctx.restore();
}
function drawCropper() {
    if (!crop) return;
    const [fw, fh] = cropFrame();
    crop.fw = fw; crop.fh = fh;
    crop.st = clampPan(crop.st, crop.im.naturalWidth, crop.im.naturalHeight, fw, fh);
    const c = $('cropCanvas'), dpr = window.devicePixelRatio || 1;
    c.style.width = fw + 'px'; c.style.height = fh + 'px';
    c.width = Math.round(fw * dpr); c.height = Math.round(fh * dpr);
    paintCrop(c.getContext('2d'), c.width, c.height, fw);
    const box = $('cropFrameBox');
    box.style.width = fw + 'px'; box.style.height = fh + 'px';
    const [ow, oh] = cropOutputSize(crop.st, crop.im.naturalWidth, crop.im.naturalHeight, fw, fh, crop.conf.out[0], crop.aspect);
    $('cropInfo').textContent = `Resultado: ${ow}×${oh} px`;
}
function cropUpdate(patch) { if (!crop) return; Object.assign(crop.st, patch); drawCropper(); }
FEATURE_ACTIONS['crop-rotate'] = () => cropUpdate({ rot: (crop.st.rot + 90) % 360, x: 0, y: 0 });
FEATURE_ACTIONS['crop-flip'] = d => cropUpdate(d === 'v' ? { flipV: !crop.st.flipV } : { flipH: !crop.st.flipH });
FEATURE_ACTIONS['crop-grid'] = () => { crop.grid = !crop.grid; $('cropGrid').hidden = !crop.grid; $('cropGridBtn').classList.toggle('is-on', crop.grid); };
FEATURE_ACTIONS['crop-reset'] = () => { crop.aspect = crop.conf.aspect; $('cropRatio').value = String(crop.conf.aspect); $('cropZoom').value = 1; cropUpdate({ zoom: 1, x: 0, y: 0, rot: 0, flipH: false, flipV: false }); };
FEATURE_ACTIONS['crop-save'] = async () => {
    if (!crop) return;
    const { im, st, fw, fh, conf, onDone, aspect } = crop;
    const [ow, oh] = cropOutputSize(st, im.naturalWidth, im.naturalHeight, fw, fh, conf.out[0], aspect);
    const canvas = document.createElement('canvas');
    canvas.width = ow; canvas.height = oh;
    paintCrop(canvas.getContext('2d'), ow, oh, fw);
    let blob;
    try { blob = await canvasToJpeg(canvas); } catch (e) {
        showToast('⚠️ Esta imagen está en otra web que no deja recortarla. Descárgala y súbela.', 'error', 5000);
        return;
    }
    crop = null;
    closeModal('cropModal', { force: true });
    try { await onDone(blob); showToast(`✂️ Recorte guardado (${ow}×${oh})`); } catch (e) { showToast(isQuotaError(e) ? '⚠️ No queda espacio' : '❌ No se pudo guardar el recorte', 'error'); }
};
document.addEventListener('DOMContentLoaded', () => {
    const c = $('cropCanvas');
    if (!c) return;
    let drag = null;
    c.addEventListener('pointerdown', e => { if (!crop) return; drag = { x: e.clientX, y: e.clientY, sx: crop.st.x, sy: crop.st.y }; c.setPointerCapture(e.pointerId); });
    c.addEventListener('pointermove', e => { if (drag) cropUpdate({ x: drag.sx + e.clientX - drag.x, y: drag.sy + e.clientY - drag.y }); });
    const end = () => { drag = null; };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener('wheel', e => {
        if (!crop) return;
        e.preventDefault();
        const zoom = Math.min(4, Math.max(1, crop.st.zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08)));
        $('cropZoom').value = zoom;
        cropUpdate({ zoom });
    }, { passive: false });
    $('cropZoom').addEventListener('input', e => cropUpdate({ zoom: Number(e.target.value) }));
    $('cropRatio').addEventListener('change', e => { crop.aspect = Number(e.target.value); drawCropper(); });
    window.addEventListener('resize', () => { if (crop && $('cropModal').classList.contains('active')) drawCropper(); });
    document.addEventListener('keydown', e => {
        if (!crop || !$('cropModal').classList.contains('active') || !e.target.closest || e.target.closest('input, select')) return;
        const step = e.shiftKey ? 20 : 5;
        const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
        if (moves[e.key]) { e.preventDefault(); cropUpdate({ x: crop.st.x + moves[e.key][0], y: crop.st.y + moves[e.key][1] }); }
    });
});

// ============================================================
// 5. CABECERAS CON BANNER
// ============================================================
/** Fondo de una cabecera: el banner nítido, la imagen principal difuminada o un degradado con puntos. */
function bannerBgHtml(banner, fallback) {
    const b = banner && resolveImageSrc(banner), f = fallback && resolveImageSrc(fallback);
    const mode = bannerMode(b, f);
    const src = mode === 'banner' ? b : f;
    return `<div class="banner-bg is-${mode}" ${src ? `style="background-image:${esc(cssUrl(src))}"` : ''}></div>`;
}
/** Banner del perfil detrás de tu nombre en el menú. */
function applyProfileBanner() {
    const box = document.querySelector('.user-profile');
    if (!box) return;
    const src = resolveImageSrc(appData.settings.profileBanner || '');
    box.classList.toggle('has-banner', !!src);
    box.style.setProperty('--profile-banner', src ? cssUrl(src) : 'none');
}

// Cambiar el banner desde la ficha, sin abrir el formulario de edición
let quickBannerTarget = null;
const BANNER_KINDS = () => ({ works: ['obra', getWorkById, r => r.title], persons: ['persona', getPersonById, r => r.name], couples: ['pareja', getCoupleById, r => r.name], collections: ['colección', getCollectionById, r => r.name] });
function openBannerSheet(kind, id) {
    const [, getter, nameOf] = BANNER_KINDS()[kind] || [];
    const rec = getter && getter(id);
    if (!rec) return;
    quickBannerTarget = { kind, id };
    openSheet(`🖼️ Banner · ${nameOf(rec)}`, () => {
        const r = getter(id);
        if (!r) return '<p>No encontrado.</p>';
        return imgFieldHtml('quickBanner', { kind: 'banner', query: nameOf(r), value: r.banner || '', ctx: kind }) +
            '<p class="hint" style="margin-top:10px">Se guarda al momento. En las tarjetas y listas se sigue viendo la portada.</p>';
    });
    refreshImgField('quickBanner');
}
function saveQuickBanner(value) {
    const { kind, id } = quickBannerTarget;
    const [label, getter, nameOf] = BANNER_KINDS()[kind];
    const rec = getter(id);
    if (!rec || (rec.banner || '') === value) return;
    if (kind === 'works' && isLocked(rec)) return;
    mutate(() => { if (value) rec.banner = value; else delete rec.banner; rec.updatedAt = Date.now(); },
        value ? '🖼️ Banner guardado' : '🗑️ Banner quitado', { label: `Banner de ${label} “${nameOf(rec)}”` });
    refreshImgField('quickBanner');
}
FEATURE_ACTIONS['banner-quick'] = (id, el) => openBannerSheet(el.dataset.kind || 'works', id);

// ============================================================
// 6. PERSONALIZAR → BANNERS
// ============================================================
function renderBannerPanel() {
    const box = $('bannerPanelBody');
    if (!box) return;
    const s = appData.settings;
    const list = bannerEntries(appData);
    const by = k => list.filter(e => e.kind === k).length;
    const refs = [...new Set(list.map(e => e.ref).filter(isImageRef))];
    const bytes = refs.reduce((a, r) => a + (store.imageSize(r) || 0), 0);
    const external = list.filter(e => /^https?:/i.test(e.ref)).length;
    const toggle = (key, label, on) => `<div class="setting-row"><span>${label}</span><button class="toggle-switch" data-act="media-toggle" data-id="${key}" role="switch" aria-checked="${on}" aria-label="${esc(label)}"></button></div>`;
    box.innerHTML = `
        <div class="pz-group"><div class="pz-title">Banner de tu perfil</div>
            ${imgFieldHtml('profileBannerInput', { kind: 'banner', value: s.profileBanner || '', query: 'aesthetic banner' })}
        </div>
        <div class="banner-stats">
            <div><b>${list.length}</b><small>banners</small></div>
            <div><b>${formatBytes(bytes)}</b><small>de espacio</small></div>
            <div><b>${external}</b><small>enlazados</small></div>
        </div>
        <p class="hint" style="margin:6px 0 10px">${[['works', 'obras'], ['persons', 'personas'], ['couples', 'parejas'], ['collections', 'colecciones']].map(([k, l]) => `${by(k)} ${l}`).join(' · ')}${s.profileBanner ? ' · perfil' : ''}</p>
        ${toggle('bannerDownload', '⬇️ Descargar las imágenes de enlaces externos (así no se rompen si la web las borra)', mediaSetting('download'))}
        ${toggle('imageProxy', '🔓 Si una web no deja recortar su imagen, pedirla por images.weserv.nl (servicio gratuito; ve el enlace de la imagen)', mediaSetting('proxy'))}
        ${toggle('bannerResize', '📐 Recortar y reducir automáticamente al subir', mediaSetting('resize'))}
        <div class="seg-inline wrap" style="margin-top:10px">
            <button class="btn btn-secondary btn-sm" data-act="banners-optimize" id="bannersOptimizeBtn" ${list.length ? '' : 'disabled'}>⚡ Optimizar todos los banners</button>
            <button class="btn btn-secondary btn-sm" data-act="images-orphans">🧹 Eliminar imágenes huérfanas</button>
        </div>`;
    refreshImgField('profileBannerInput');
}
FEATURE_ACTIONS['media-toggle'] = key => {
    appData.settings[key] = appData.settings[key] === false; // por defecto están activados
    saveData();
    renderBannerPanel();
    if (typeof renderImageSourcesPanel === 'function') renderImageSourcesPanel();
};
/** Reduce los banners guardados que pesan mucho y descarga los enlazados (si se puede). */
FEATURE_ACTIONS['banners-optimize'] = async () => {
    const btn = $('bannersOptimizeBtn');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Optimizando…'; }
    let saved = 0, downloaded = 0;
    const changes = [];
    for (const e of bannerEntries(appData)) {
        try {
            if (isImageRef(e.ref)) {
                const before = store.imageSize(e.ref);
                if (before <= 250000) continue;
                const { blob } = await prepareImage(store.resolve(e.ref), 'banner');
                if (blob.size < before) { await store.replaceImage(e.ref, blob); saved += before - blob.size; }
            } else if (/^https?:/i.test(e.ref)) {
                const { blob } = await downloadImage(e.ref, 'banner');
                changes.push([e, await store.saveImage(blob)]);
                downloaded++;
            }
        } catch (err) { /* se deja como estaba */ }
    }
    if (changes.length) {
        mutate(() => changes.forEach(([e, ref]) => { if (e.kind === 'profile') appData.settings.profileBanner = ref; else e.rec.banner = ref; }), '⬇️ Banners descargados', { undo: false });
        applyProfileBanner();
    }
    showToast(saved || downloaded ? `⚡ Listo: ${saved ? formatBytes(saved) + ' ahorrados' : ''}${saved && downloaded ? ' · ' : ''}${downloaded ? downloaded + ' descargados' : ''}` : '✨ Tus banners ya estaban optimizados');
    renderBannerPanel();
    updateStorageMeter();
};
FEATURE_ACTIONS['images-orphans'] = async () => {
    await whenSaved();
    const n = await store.collectGarbage(appData).catch(() => 0);
    showToast(n ? `🧹 ${n} ${n === 1 ? 'imagen huérfana eliminada' : 'imágenes huérfanas eliminadas'}` : '✨ No había imágenes sin usar');
    renderBannerPanel();
    updateStorageMeter();
};


mountImgFields();
