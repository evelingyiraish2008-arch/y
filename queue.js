/*
 * Mi Mundo · queue.js
 * Página "Qué ver" (cola ordenable, Sorpréndeme, Maratón y parecidas) y calendario del mes del Centro de Emisión.
 * Los cálculos están en queuekit.js. Se carga antes que app.js.
 */
'use strict';

const queueUi = { mood: 'cualquiera', type: 'all', bl: false, available: false, picked: '', hours: 3 };
const typeIcon = w => (TYPE_META[w.type] || {}).icon || '🎬';
const remainingText = w => { const r = remaining(w); return r && r.minutes ? fmtMinutes(r.minutes) : ''; };

function queueRowHtml(w, i, total) {
    const rem = remainingText(w);
    return `<li class="queue-row" data-id="${w.id}">
        <span class="queue-num">${i + 1}</span>
        <button type="button" class="queue-main" data-open="${w.id}">
            <span class="thumb">${img(w.image, w.type, w.title)}</span>
            <span class="info"><b>${esc(w.title)}</b><small>${typeIcon(w)} ${esc(getTypeLabel(w.type))}${rem ? ` · ${esc(rem)}` : ''}${w.bl ? ' · 💖 BL' : ''}</small>${availabilityChipHtml(w)}</span>
            <span class="pill ${statusClass(w.status)}">${esc(getStatusLabel(w.status))}</span>
        </button>
        <span class="queue-move">
            <button type="button" class="icon-btn sm" data-act="queue-top" data-id="${w.id}" aria-label="Poner la primera" title="Primera" ${i === 0 ? 'disabled' : ''}>⏫</button>
            <button type="button" class="icon-btn sm" data-act="queue-up" data-id="${w.id}" aria-label="Subir" title="Subir" ${i === 0 ? 'disabled' : ''}>🔼</button>
            <button type="button" class="icon-btn sm" data-act="queue-down" data-id="${w.id}" aria-label="Bajar" title="Bajar" ${i === total - 1 ? 'disabled' : ''}>🔽</button>
        </span>
    </li>`;
}
function surpriseHtml() {
    const w = queueUi.picked && getWorkById(queueUi.picked);
    const opts = (obj, cur) => Object.entries(obj).map(([k, v]) => `<option value="${k}" ${cur === k ? 'selected' : ''}>${v}</option>`).join('');
    const moods = Object.fromEntries(Object.entries(WATCH_MOODS).map(([k, m]) => [k, `${m.icon} ${m.label}`]));
    const types = { all: 'Todo tipo', series: '🎬 Series y películas', anime: '🎌 Anime', book: '📚 Libros', manhwa: '📕 Manhwas' };
    return `<div class="queue-surprise">
        <div class="queue-controls">
            <select class="filter-select" id="queueMood" aria-label="Ánimo">${opts(moods, queueUi.mood)}</select>
            <select class="filter-select" id="queueType" aria-label="Tipo">${opts(types, queueUi.type)}</select>
            <label class="checkbox-wrapper"><input type="checkbox" id="queueBl" ${queueUi.bl ? 'checked' : ''}> 💖 Solo BL</label>
            <label class="checkbox-wrapper"><input type="checkbox" id="queueAvail" ${queueUi.available ? 'checked' : ''}> 📺 Solo lo que ya puedo ver</label>
            <button type="button" class="btn btn-primary" data-act="surprise">🎲 Sorpréndeme</button>
        </div>
        ${w ? `<div class="queue-pick"><button type="button" class="queue-main" data-open="${w.id}">
                <span class="thumb">${img(w.image, w.type, w.title)}</span>
                <span class="info"><b>${esc(w.title)}</b><small>${typeIcon(w)} ${esc(getTypeLabel(w.type))}${remainingText(w) ? ` · ${esc(remainingText(w))}` : ''}${w.synopsis ? ' · ' + esc(w.synopsis.slice(0, 90)) + (w.synopsis.length > 90 ? '…' : '') : ''}</small></span></button>
            <div class="queue-pick-actions"><button type="button" class="btn btn-primary btn-sm" data-act="${isRewatchWish(w) ? 'reread-start' : 'sugg-start'}" data-id="${w.id}">▶️ Empezar</button>
                <button type="button" class="btn btn-secondary btn-sm" data-act="surprise">🎲 Otra</button></div></div>`
            : queueUi.picked === '-' ? '<p class="hint">No tienes nada en la cola que encaje con eso. Prueba con otro ánimo o tipo.</p>' : ''}
    </div>`;
}
function marathonHtml() {
    const minutes = Math.max(0, Math.round((Number(queueUi.hours) || 0) * 60));
    if (!minutes) return '<p class="hint">Escribe cuántas horas tienes.</p>';
    const plan = marathonPlan(appData.works, minutes);
    if (!plan.episodes.length && !plan.whole.length) return `<p class="hint">Con ${esc(fmtMinutes(minutes))} no cabe nada entero. Prueba con más tiempo o añade la duración a tus obras (“Rellenar datos”).</p>`;
    const unit = w => (w.type === 'book' ? 'págs' : w.type === 'manhwa' ? 'caps' : 'eps');
    return `${plan.episodes.length ? `<div class="detail-section-title">Lo que estás siguiendo</div><ul class="queue-list">${plan.episodes.map(e => `<li class="queue-row"><button type="button" class="queue-main" data-open="${e.work.id}">
            <span class="thumb">${img(e.work.image, e.work.type, e.work.title)}</span>
            <span class="info"><b>${esc(e.work.title)}</b><small>${e.count} ${unit(e.work)} · ${esc(fmtMinutes(e.minutes))}${e.finishes ? ' · ¡la terminas!' : ''}</small></span></button></li>`).join('')}</ul>` : ''}
        ${plan.whole.length ? `<div class="detail-section-title" style="margin-top:12px">Pendientes que caben enteros</div><ul class="queue-list">${plan.whole.slice(0, 6).map(e => `<li class="queue-row"><button type="button" class="queue-main" data-open="${e.work.id}">
            <span class="thumb">${img(e.work.image, e.work.type, e.work.title)}</span>
            <span class="info"><b>${esc(e.work.title)}</b><small>${esc(fmtMinutes(e.minutes))}</small></span></button></li>`).join('')}</ul>` : ''}`;
}
function renderQueue() {
    const items = queueItems(appData.works);
    $('queueSurprise').innerHTML = surpriseHtml();
    $('queueCount').textContent = items.length ? `· ${items.length}` : '';
    $('queueList').innerHTML = items.length
        ? `<ol class="queue-list">${items.map((w, i) => queueRowHtml(w, i, items.length)).join('')}</ol>`
        : emptyState('🎲', 'Tu cola está vacía', 'Las obras “Quiero ver/leer” y “Para rever/releer” aparecen aquí para que las ordenes.');
    $('marathonHours').value = queueUi.hours;
    $('marathonBody').innerHTML = marathonHtml();
    const rec = recommendFromLiked(appData.works);
    $('queueSimilar').innerHTML = rec.length
        ? `<ul class="queue-list">${rec.map(r => `<li class="queue-row"><button type="button" class="queue-main" data-open="${r.work.id}">
            <span class="thumb">${img(r.work.image, r.work.type, r.work.title)}</span>
            <span class="info"><b>${esc(r.work.title)}</b><small>Porque te gustó ${r.because.map(esc).join(', ')}</small></span></button></li>`).join('')}</ul>`
        : '<p class="hint">Cuando valores con 4 o más estrellas alguna obra terminada, aquí verás lo de tu cola que se le parece.</p>';
}
function reorderQueue(id, where) {
    const items = queueItems(appData.works);
    const ids = moveInQueue(items, id, where);
    if (ids.join() === items.map(w => w.id).join()) return;
    mutate(() => { ids.forEach((wid, i) => { const w = getWorkById(wid); if (w) w.queuePos = i * 10; }); }, null, { label: 'Ordenar la cola' });
}
['top', 'up', 'down'].forEach(where => { FEATURE_ACTIONS['queue-' + where] = id => reorderQueue(id, where); });
FEATURE_ACTIONS.surprise = () => {
    const w = pickSurprise(appData.works, { mood: queueUi.mood, type: queueUi.type, bl: queueUi.bl, available: queueUi.available, skip: queueUi.picked });
    queueUi.picked = w ? w.id : '-';
    $('queueSurprise').innerHTML = surpriseHtml();
};
document.addEventListener('change', e => {
    const t = e.target;
    if (t.id === 'queueMood') queueUi.mood = t.value;
    else if (t.id === 'queueType') queueUi.type = t.value;
    else if (t.id === 'queueBl') queueUi.bl = t.checked;
    else if (t.id === 'queueAvail') queueUi.available = t.checked;
});
document.addEventListener('input', e => {
    if (e.target.id !== 'marathonHours') return;
    queueUi.hours = e.target.value;
    $('marathonBody').innerHTML = marathonHtml();
});

// ============================================================
// CALENDARIO DEL MES (Centro de Emisión)
// ============================================================
const calUi = { year: new Date().getFullYear(), month: new Date().getMonth(), day: '' };
const CAL_MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const eventColor = w => { const h = platformHue(w.platform); return h < 0 ? TYPE_META[w.type].color : `hsl(${h} 65% 55%)`; };
function eventLabel(e) { return `${e.work.title} · ${e.season ? 'T' + e.season + ' ' : ''}ep ${e.episode}`; }
function renderMonthCalendar() {
    const box = $('monthCalendar');
    if (!box) return;
    const weeks = monthMatrix(calUi.year, calUi.month);
    const from = weeks[0][0].iso, to = weeks[weeks.length - 1][6].iso;
    const events = calendarEvents(appData.works, from, to);
    const byDay = new Map();
    events.forEach(e => { if (!byDay.has(e.date)) byDay.set(e.date, []); byDay.get(e.date).push(e); });
    const today = localISO(Date.now());
    $('calTitle').textContent = `${CAL_MONTHS[calUi.month][0].toUpperCase()}${CAL_MONTHS[calUi.month].slice(1)} ${calUi.year}`;
    box.innerHTML = `<div class="month-head">${['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(d => `<span>${d}</span>`).join('')}</div>` + weeks.map(wk => `<div class="month-week">${wk.map(d => {
        const evs = byDay.get(d.iso) || [];
        return `<button type="button" class="month-day ${d.inMonth ? '' : 'is-out'} ${d.iso === today ? 'is-today' : ''} ${calUi.day === d.iso ? 'is-picked' : ''} ${evs.length ? 'has-events' : ''}" data-act="cal-day" data-id="${d.iso}" aria-label="${d.day} de ${CAL_MONTHS[new Date(d.iso + 'T12:00:00').getMonth()]}${evs.length ? ', ' + evs.length + (evs.length === 1 ? ' episodio' : ' episodios') : ''}">
            <span class="num">${d.day}</span>
            <span class="dots">${evs.slice(0, 3).map(e => `<i class="${e.projected ? 'is-proj' : ''}" style="background:${eventColor(e.work)}" title="${esc(eventLabel(e))}"></i>`).join('')}${evs.length > 3 ? `<em>+${evs.length - 3}</em>` : ''}</span></button>`;
    }).join('')}</div>`).join('');
    const list = calUi.day ? byDay.get(calUi.day) || [] : events.filter(e => e.date.slice(0, 7) === `${calUi.year}-${String(calUi.month + 1).padStart(2, '0')}`);
    const title = calUi.day ? `📌 ${esc(fmtDate(calUi.day))}` : 'Todo el mes';
    $('calDay').innerHTML = `<div class="detail-section-title">${title}</div>` + (list.length
        ? `<ul class="cal-list">${list.map(e => `<li><button type="button" class="cal-item" data-open="${e.work.id}"><i style="background:${eventColor(e.work)}"></i><span><b>${esc(e.work.title)}</b> <small>${e.season ? 'T' + e.season + ' · ' : ''}Ep ${e.episode}${e.projected ? ' · estimado' : ''}${e.work.platform ? ' · ' + esc(e.work.platform) : ''}</small></span><span class="when">${calUi.day ? '' : esc(fmtDate(e.date))}</span></button></li>`).join('')}</ul>`
        : '<p class="hint">Nada sale en estas fechas. Pulsa “🔄 Próximos episodios” o rellena el día de emisión de lo que sigues.</p>');
}
FEATURE_ACTIONS['cal-prev'] = () => { calUi.month--; if (calUi.month < 0) { calUi.month = 11; calUi.year--; } calUi.day = ''; renderMonthCalendar(); };
FEATURE_ACTIONS['cal-next'] = () => { calUi.month++; if (calUi.month > 11) { calUi.month = 0; calUi.year++; } calUi.day = ''; renderMonthCalendar(); };
FEATURE_ACTIONS['cal-today'] = () => { const d = new Date(); calUi.year = d.getFullYear(); calUi.month = d.getMonth(); calUi.day = localISO(d); renderMonthCalendar(); };
FEATURE_ACTIONS['cal-day'] = iso => { calUi.day = calUi.day === iso ? '' : iso; renderMonthCalendar(); };
