/*
 * Mi Mundo · statsplus.js
 * Estadísticas avanzadas (comparativas, ritmo, rankings, distribuciones, notas) y "Tu año" en formato historia,
 * con imagen para descargar o compartir. Se carga antes que app.js.
 */
'use strict';

// Colores de la comparativa "este año / año anterior" (validados para daltonismo en claro y oscuro)
const CMP_SERIES = () => [{ name: String(new Date().getFullYear()), color: 'var(--cmp-now)' }, { name: String(new Date().getFullYear() - 1), color: 'var(--cmp-prev)' }];
let statsPeriod = '12m';

function deltaText(now, prev) {
    if (now === prev) return ['= igual', ''];
    const diff = now - prev;
    return [`${diff > 0 ? '▲' : '▼'} ${Math.abs(diff)} ${diff > 0 ? 'más' : 'menos'}`, diff > 0 ? 'up' : 'down'];
}
function compareTile(title, c) {
    const [txt, trend] = deltaText(c.now, c.prev);
    return `<div class="cmp-tile"><div class="kpi-label">${esc(title)}</div>
        <div class="cmp-values"><b>${c.now}</b><span>${esc(c.label)}</span><span class="cmp-vs">vs</span><b class="muted-num">${c.prev}</b><span>${esc(c.prevLabel)}</span></div>
        <div class="kpi-delta ${trend}">${esc(txt)}</div></div>`;
}
function rankItem(label, w, extra = '') {
    if (!w) return '';
    return `<button class="rank-cell" data-open="${w.id}"><span class="thumb">${img(w.image, w.type, w.title)}</span>
        <span class="info"><small>${esc(label)}</small><b>${esc(w.title)}</b><small>${w.rating ? '★ ' + ratingText(w.rating) : ''}${extra ? ' · ' + esc(extra) : ''}</small></span></button>`;
}
function rankPeople(label, list) {
    if (!list.length) return '';
    return `<div class="rank-cell is-text"><span class="info"><small>${esc(label)}</small>${list.map((x, i) => `<span class="rank-line"><b>${i + 1}.</b> ${esc(x.label)} <small>${x.count} ${x.count === 1 ? 'obra' : 'obras'}${x.avg ? ' · ★ ' + ratingText(Math.round(x.avg * 10) / 10) : ''}</small></span>`).join('')}</span></div>`;
}

/** Se llama al final de renderStats: pinta las secciones nuevas. */
function renderStatsPlus(now = Date.now()) {
    const works = appData.works;
    const pworks = worksInPeriod(works, statsPeriod, now);
    const year = new Date(now).getFullYear();

    // Comparativas
    const cmp = periodComparisons(works, now);
    $('statsCompareTiles').innerHTML = compareTile('Este mes', cmp.month) + compareTile('Este trimestre', cmp.quarter) + compareTile('Este año (hasta hoy)', cmp.year);
    const thisY = finishedByMonthOfYear(works, year), prevY = finishedByMonthOfYear(works, year - 1);
    $('statsYearCompare').innerHTML = thisY.concat(prevY).some(Boolean)
        ? columnChart({ categories: MONTHS_ES, series: CMP_SERIES(), values: MONTHS_ES.map((_, i) => [thisY[i], prevY[i]]), grouped: true, height: 160, caption: 'Obras terminadas por mes: este año y el anterior' })
        : '<p class="viz-empty">Cuando termines obras en distintos meses podrás comparar un año con otro.</p>';
    const season = seasonality(works);
    const peak = season.indexOf(Math.max(...season));
    $('statsSeasonSub').textContent = Math.max(...season) ? `Tu mes más fuerte suele ser ${MONTHS_ES[peak]}` : 'Todos los años juntos';
    $('statsSeason').innerHTML = season.some(Boolean)
        ? columnChart({ categories: MONTHS_ES, series: [{ name: 'Terminadas', color: 'var(--accent)' }], values: season.map(v => [v]), height: 140, caption: 'Terminadas en cada mes, sumando todos los años' })
        : '<p class="viz-empty">Sin obras terminadas todavía.</p>';

    // Ritmo y proyección
    const pace = overallPace(works, now);
    const proj = goalProjection(works, Number(appData.settings.yearGoal) || 0, now);
    const active = works.filter(isActive).map(w => ({ w, p: workPace(w, now) })).filter(x => x.p)
        .sort((a, b) => (a.p.eta || '9999').localeCompare(b.p.eta || '9999'));
    $('statsPace').innerHTML = `
        <div class="pace-kpis">
            <div><b>${fmtNum(pace.pagesPerDay)}</b><small>páginas al día</small></div>
            <div><b>${fmtNum(pace.episodesPerWeek)}</b><small>episodios a la semana</small></div>
            <div><b>${proj.date ? (proj.reached ? '✅' : esc(fmtDate(proj.date))) : '–'}</b><small>${proj.reached ? 'reto cumplido' : appData.settings.yearGoal ? 'cumplirás tu reto' : 'ponte un reto anual'}</small></div>
        </div>
        ${active.length ? `<div class="pace-list">${active.slice(0, 8).map(({ w, p }) => `
            <button class="pace-item ${p.slowing ? 'is-slow' : ''}" data-open="${w.id}">
                <span class="thumb">${img(w.image, w.type, w.title)}</span>
                <span class="info"><b>${esc(w.title)}</b>
                <small>${fmtNum(w.type === 'book' ? p.perDay : p.perWeek)} ${w.type === 'book' ? 'págs/día' : w.type === 'manhwa' ? 'caps/semana' : 'eps/semana'}${p.eta ? ` · terminarás hacia el ${esc(fmtDate(p.eta))}` : ''}</small>
                ${p.slowing ? `<small class="pace-warn">🐢 Te has frenado: ${p.idleDays} días sin avanzar</small>` : ''}</span>
            </button>`).join('')}</div>` : '<p class="viz-empty">Empieza una obra (con fecha de inicio) para ver tu ritmo y cuándo la terminarás.</p>'}`;

    // Rankings (del periodo elegido)
    const rk = rankings(pworks);
    const typeCells = TYPE_ORDER.map(t => rankItem(`Mejor ${getTypeLabel(t).toLowerCase()}`, rk.byType[t])).join('');
    const cells = typeCells + rankItem('Mejor BL', rk.bestBl) + rk.byTag.slice(0, 3).map(x => rankItem(`Mejor de “${x.tag}”`, x.best)).join('')
        + rankPeople('Actores que más ves', rk.actors) + rankPeople('Autores', rk.authors) + rankPeople('Estudios', rk.studios) + rankPeople('Plataformas', rk.platforms);
    $('statsRankings').innerHTML = cells || '<p class="viz-empty">Valora tus obras para ver tus rankings.</p>';

    // Distribuciones
    $('statsSpread').innerHTML = dotStrip(ratingSpread(pworks).map(r => ({ label: TYPE_PLURAL[r.type], color: TYPE_META[r.type].color, values: r.ratings, median: r.median })),
        { caption: 'Valoraciones por tipo' });
    const decades = byDecade(pworks);
    $('statsDecades').innerHTML = decades.length
        ? columnChart({ categories: decades.map(d => d.label), series: [{ name: 'Obras', color: 'var(--accent)' }], values: decades.map(d => [d.count]), height: 140, caption: 'Obras por década de publicación' })
        : '<p class="viz-empty">Añade el año a tus obras para ver de qué épocas son.</p>';
    const crit = criteriaAverages(appData.notes);
    $('statsCriteria').innerHTML = barList(crit.map(c => ({ label: c.label, value: Math.round(c.avg * 10) / 10, display: `★ ${fmtNum(c.avg)}` })),
        { color: 'var(--gold)', caption: 'Media de cada criterio en tus reseñas', empty: 'Escribe reseñas con criterios (historia, personajes, final…) para ver qué valoras más.' });
    $('statsRevisited').innerHTML = barList(mostRevisited(works).map(x => ({ label: x.work.title, value: x.times, display: `${x.times} veces` })),
        { caption: 'Obras que más has repetido', empty: 'Aquí verás lo que vuelves a ver o leer.' });

    // Notas
    const ns = notesStats(appData.notes, now);
    $('statsNotesKpis').innerHTML = `
        <div><b>${ns.count}</b><small>notas</small></div>
        <div><b>${ns.totalWords.toLocaleString('es-ES')}</b><small>palabras</small></div>
        <div><b>${Math.round(ns.avgWords)}</b><small>palabras de media</small></div>
        ${ns.longest ? `<button class="longest-note" data-open="${esc(ns.longest.note.workId)}"><small>La más larga (${ns.longest.words} palabras)</small><b>${esc(ns.longest.note.workTitle || 'Nota')}</b></button>` : ''}`;
    $('statsNotesMonthly').innerHTML = ns.perMonth.some(m => m.count)
        ? columnChart({ categories: ns.perMonth.map(m => m.label), series: [{ name: 'Notas', color: 'var(--accent)' }], values: ns.perMonth.map(m => [m.count]), height: 120, caption: 'Notas escritas por mes' })
        : '<p class="viz-empty">Las notas que escribas a partir de ahora aparecerán aquí por mes.</p>';
    $('statsWords').innerHTML = barList(ns.topWords.map(x => ({ label: x.word, value: x.count })), { caption: 'Palabras que más usas en tus notas', empty: 'Escribe notas para ver tus palabras favoritas.' });
    $('statsWriting').innerHTML = ns.hours.flat().some(Boolean)
        ? heatGrid(ns.hours, { rows: ['L', 'M', 'X', 'J', 'V', 'S', 'D'], cols: ['0–4', '4–8', '8–12', '12–16', '16–20', '20–24'], rowTitle: 'Día', colTitle: 'Hora', caption: 'Cuándo escribes tus notas' })
        : '<p class="viz-empty">Aún no hay notas con fecha para saber cuándo escribes.</p>';
    document.querySelectorAll('[data-stats-period]').forEach(b => b.classList.toggle('is-on', b.dataset.statsPeriod === statsPeriod));
}

// ============================================================
// TU AÑO EN MI MUNDO (formato historia)
// ============================================================
let wrapped = null;
function wrappedSlides(s) {
    const tl = t => TYPE_PLURAL[t] ? TYPE_PLURAL[t].toLowerCase() : '';
    const slides = [
        { icon: '✨', big: String(s.year), text: `Tu año en Mi Mundo, ${esc(appData.settings.userName || 'Sara')}` },
        { icon: '✅', big: String(s.total), text: s.total === 1 ? 'obra terminada' : 'obras terminadas', sub: TYPE_ORDER.filter(t => s.byType[t]).map(t => `${TYPE_META[t].icon} ${s.byType[t]} ${tl(t)}`).join(' · ') },
        { icon: '⏱️', big: `${s.hours} h`, text: 'de historias', sub: `Eso son unos ${Math.round(s.hours / 24)} días seguidos` }
    ];
    if (s.topType) slides.push({ icon: TYPE_META[s.topType].icon, big: TYPE_PLURAL[s.topType], text: 'fue lo tuyo este año' });
    if (s.best) slides.push({ icon: '🏆', big: esc(s.best.title), text: `tu favorita del año${s.best.rating ? ' · ★ ' + ratingText(s.best.rating) : ''}`, image: s.best.image, ph: s.best.type });
    if (s.topTag) slides.push({ icon: '🏷️', big: esc(s.topTag), text: 'tu etiqueta estrella' });
    if (s.topPerson) slides.push({ icon: '👤', big: esc(s.topPerson), text: 'la persona que más apareció en tu año' });
    if (s.bestMonth) slides.push({ icon: '📅', big: s.bestMonth, text: `tu mejor mes: ${s.bestMonthCount} terminadas` });
    if (s.bestStreak) slides.push({ icon: '🔥', big: `${s.bestStreak} días`, text: 'tu mejor racha' });
    if (s.notes) slides.push({ icon: '📝', big: String(s.notes), text: `notas escritas (${s.words.toLocaleString('es-ES')} palabras)` });
    if (s.bl) slides.push({ icon: '💖', big: String(s.bl), text: s.bl === 1 ? 'obra BL terminada' : 'obras BL terminadas' });
    if (s.rereads) slides.push({ icon: '🔁', big: String(s.rereads), text: 'veces que repetiste algo que amas' });
    slides.push({ icon: '💜', big: '¡Gracias!', text: s.total ? 'Por otro año lleno de historias.' : 'Este año apenas empieza: ¡a por él!', final: true });
    return slides;
}
function openWrapped(year) {
    const now = new Date();
    const y = year || (now.getMonth() < 2 ? now.getFullYear() - 1 : now.getFullYear());
    const summary = wrappedSummary(appData, y);
    wrapped = { year: y, summary, slides: wrappedSlides(summary), i: 0 };
    $('wrapped').hidden = false;
    renderWrapped();
    requestAnimationFrame(() => $('wrapped').classList.add('active'));
}
function renderWrapped() {
    const { slides, i, year } = wrapped;
    const s = slides[i];
    const years = [...new Set(appData.works.filter(w => w.endDate).map(w => Number(String(w.endDate).slice(0, 4))))].filter(Boolean).sort((a, b) => b - a);
    if (!years.includes(new Date().getFullYear())) years.unshift(new Date().getFullYear());
    $('wrapped').innerHTML = `
        <div class="wrapped-story" style="--hue:${(i * 37) % 360}deg">
            <div class="wrapped-bars">${slides.map((_, k) => `<span class="${k < i ? 'done' : k === i ? 'now' : ''}"></span>`).join('')}</div>
            <div class="wrapped-top">
                <select class="wrapped-year" id="wrappedYear" aria-label="Año">${years.map(y => `<option ${y === year ? 'selected' : ''}>${y}</option>`).join('')}</select>
                <button class="icon-btn sm" data-act="wrapped-close" aria-label="Cerrar">✕</button>
            </div>
            <button class="wrapped-nav prev" data-act="wrapped-prev" aria-label="Anterior"></button>
            <button class="wrapped-nav next" data-act="wrapped-next" aria-label="Siguiente"></button>
            <div class="wrapped-slide" aria-live="polite">
                ${s.image ? `<div class="wrapped-cover">${img(s.image, s.ph, '')}</div>` : `<div class="wrapped-icon">${s.icon}</div>`}
                <div class="wrapped-big">${s.big}</div>
                <div class="wrapped-text">${s.text}</div>
                ${s.sub ? `<div class="wrapped-sub">${esc(s.sub)}</div>` : ''}
                ${s.final ? `<div class="wrapped-actions"><button class="btn btn-primary" data-act="wrapped-image">🖼️ Descargar imagen</button>${navigator.share ? '<button class="btn btn-secondary" data-act="wrapped-share">📤 Compartir</button>' : ''}</div>` : ''}
            </div>
        </div>`;
}
FEATURE_ACTIONS['wrapped'] = () => openWrapped();
FEATURE_ACTIONS['wrapped-close'] = () => { $('wrapped').classList.remove('active'); setTimeout(() => { $('wrapped').hidden = true; }, 200); wrapped = null; };
FEATURE_ACTIONS['wrapped-next'] = () => { if (wrapped.i < wrapped.slides.length - 1) { wrapped.i++; renderWrapped(); } };
FEATURE_ACTIONS['wrapped-prev'] = () => { if (wrapped.i > 0) { wrapped.i--; renderWrapped(); } };
FEATURE_ACTIONS['wrapped-image'] = async () => { const blob = await wrappedImage(wrapped.summary); downloadBlob(blob, `mi-mundo-${wrapped.year}.png`); };
FEATURE_ACTIONS['wrapped-share'] = async () => {
    const blob = await wrappedImage(wrapped.summary);
    const file = new File([blob], `mi-mundo-${wrapped.year}.png`, { type: 'image/png' });
    try {
        if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: `Mi año ${wrapped.year} en Mi Mundo` });
        else downloadBlob(blob, file.name);
    } catch (e) { /* cancelado */ }
};
FEATURE_ACTIONS['stats-period'] = p => { statsPeriod = p; renderStats(); };
function downloadBlob(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
/** Imagen vertical (1080×1920) con el resumen del año, dibujada en un canvas. */
function wrappedImage(s) {
    const c = document.createElement('canvas');
    c.width = 1080; c.height = 1920;
    const ctx = c.getContext('2d');
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#8b5cf6';
    const g = ctx.createLinearGradient(0, 0, 1080, 1920);
    g.addColorStop(0, '#120a24'); g.addColorStop(0.55, accent); g.addColorStop(1, '#ec4899');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 1080, 1920);
    ctx.fillStyle = 'rgba(0,0,0,.28)';
    ctx.fillRect(60, 300, 960, 1420);
    const font = (size, weight = 700) => `${weight} ${size}px Inter, -apple-system, 'Segoe UI', sans-serif`;
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.font = font(54, 600); ctx.fillText('Mi año en Mi Mundo', 540, 170);
    ctx.font = font(150, 800); ctx.fillText(String(s.year), 540, 280 + 60);
    const lines = [
        ['✅', `${s.total} ${s.total === 1 ? 'obra terminada' : 'obras terminadas'}`],
        ['⏱️', `${s.hours} horas de historias`],
        s.best && ['🏆', s.best.title],
        s.topTag && ['🏷️', s.topTag],
        s.topPerson && ['👤', s.topPerson],
        s.bestMonth && ['📅', `Mejor mes: ${s.bestMonth}`],
        s.bestStreak && ['🔥', `Racha de ${s.bestStreak} días`],
        s.notes && ['📝', `${s.notes} notas escritas`],
        s.bl && ['💖', `${s.bl} BL terminadas`]
    ].filter(Boolean).slice(0, 8);
    ctx.textAlign = 'left';
    lines.forEach(([icon, text], i) => {
        const y = 520 + i * 150;
        ctx.font = font(64, 400); ctx.fillText(icon, 130, y);
        ctx.font = font(52, 700);
        let t = String(text);
        while (ctx.measureText(t).width > 760 && t.length > 4) t = t.slice(0, -2);
        if (t !== String(text)) t = t.slice(0, -1) + '…';
        ctx.fillText(t, 240, y);
    });
    ctx.textAlign = 'center';
    ctx.font = font(36, 500); ctx.fillStyle = 'rgba(255,255,255,.85)';
    ctx.fillText(`${appData.settings.userName || 'Sara'} · Mi Mundo`, 540, 1830);
    return new Promise(r => c.toBlob(r, 'image/png'));
}
/** Teclado y cambios dentro de la historia. */
function onWrappedKey(e) {
    if (!wrapped || $('wrapped').hidden) return false;
    if (e.key === 'Escape') { FEATURE_ACTIONS['wrapped-close'](); return true; }
    if (e.key === 'ArrowRight' || e.key === ' ') { FEATURE_ACTIONS['wrapped-next'](); return true; }
    if (e.key === 'ArrowLeft') { FEATURE_ACTIONS['wrapped-prev'](); return true; }
    return false;
}

if (typeof module !== 'undefined' && module.exports) module.exports = {};
