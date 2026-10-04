/*
 * Mi Mundo · charts.js
 * Gráficos en HTML/CSS (el texto se mantiene nítido en cualquier tamaño). Cada función devuelve HTML.
 * Reglas: barras de ≤24 px con el extremo de datos redondeado, 2 px de separación entre segmentos,
 * leyenda si hay 2 o más series, tooltip en cada marca (data-tip) y tabla equivalente para cada gráfico.
 * Depende de utils.js (esc).
 */
'use strict';

const fmtNum = n => (Math.round(n * 10) / 10).toLocaleString('es-ES');

/** Divide el eje en 3–5 valores redondos. */
function niceTicks(max) {
    if (max <= 0) return [0, 1];
    const raw = max / 4;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 5, 10].map(m => m * mag).find(s => s >= raw) || raw;
    const top = Math.ceil(max / step) * step;
    const ticks = [];
    for (let v = 0; v <= top + 1e-9; v += step) ticks.push(Math.round(v * 1000) / 1000);
    return ticks;
}

/** Atributos para el tooltip: el valor destaca y la etiqueta acompaña. */
function tipAttrs(value, label) {
    return `data-tip-value="${esc(value)}" data-tip-label="${esc(label)}" tabindex="0"`;
}

function legend(series) {
    if (series.length < 2) return '';
    return `<div class="viz-legend">${series.map(s => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join('')}</div>`;
}

function dataTable(headers, rows, caption) {
    return `<table class="viz-table">
        ${caption ? `<caption>${esc(caption)}</caption>` : ''}
        <thead><tr>${headers.map(h => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead>
        <tbody>${rows.map(r => `<tr>${r.map((c, i) => (i ? `<td>${esc(c)}</td>` : `<th scope="row">${esc(c)}</th>`)).join('')}</tr>`).join('')}</tbody>
    </table>`;
}

/**
 * Columnas (apiladas si hay varias series).
 * categories: ['ene', …]; series: [{ name, color }]; values[i][s] = valor de la categoría i en la serie s.
 */
function columnChart({ categories, series, values, unit = '', height = 180, caption = '' }) {
    const totals = values.map(v => v.reduce((a, b) => a + b, 0));
    const ticks = niceTicks(Math.max(...totals, 0));
    const top = ticks[ticks.length - 1] || 1;
    const cols = categories.map((cat, i) => {
        const segs = series.map((s, k) => ({ s, v: values[i][k] })).filter(x => x.v > 0);
        const total = totals[i];
        const tipLabel = series.length > 1
            ? `${cat} · ${segs.map(x => `${x.s.name}: ${fmtNum(x.v)}`).join(', ') || 'sin datos'}`
            : cat;
        return `<div class="viz-col" ${tipAttrs(`${fmtNum(total)}${unit}`, tipLabel)}>
            <div class="viz-stack" style="height:${(total / top) * 100}%">
                ${segs.map(x => `<span style="flex:${x.v};background:${x.s.color}"></span>`).join('')}
            </div>
        </div>`;
    }).join('');
    return `<div class="viz-columns" style="--h:${height}px">
        <div class="viz-yaxis">${ticks.slice().reverse().map(t => `<span>${fmtNum(t)}</span>`).join('')}</div>
        <div class="viz-plot">
            <div class="viz-grid">${ticks.map(() => '<i></i>').join('')}</div>
            <div class="viz-cols">${cols}</div>
        </div>
        <div></div>
        <div class="viz-xaxis">${categories.map(c => `<span>${esc(c)}</span>`).join('')}</div>
    </div>
    ${legend(series)}
    ${dataTable(['', ...series.map(s => s.name), ...(series.length > 1 ? ['Total'] : [])],
        categories.map((c, i) => [c, ...values[i].map(fmtNum), ...(series.length > 1 ? [fmtNum(totals[i])] : [])]), caption)}`;
}

/** Barras horizontales de una sola serie: [{ label, value, display? }]. */
function barList(entries, { color = 'var(--accent)', unit = '', caption = '', empty = 'Sin datos todavía.' } = {}) {
    if (!entries.length) return `<p class="viz-empty">${esc(empty)}</p>`;
    const max = Math.max(...entries.map(e => e.value), 1);
    return `<div class="viz-bars">${entries.map(e => `
        <div class="viz-bar-row" ${tipAttrs(`${fmtNum(e.value)}${unit}`, e.label)}>
            <span class="viz-bar-label">${esc(e.label)}</span>
            <span class="viz-bar-track"><span class="viz-bar" style="width:${Math.max(e.value / max * 100, e.value ? 2 : 0)}%;background:${color}"></span></span>
            <span class="viz-bar-value">${esc(e.display ?? fmtNum(e.value) + unit)}</span>
        </div>`).join('')}</div>
        ${dataTable(['', 'Valor'], entries.map(e => [e.label, e.display ?? fmtNum(e.value) + unit]), caption)}`;
}

/** Una barra al 100 % dividida en partes (reparto). parts: [{ name, value, color, display }]. */
function proportionBar(parts, { caption = '', unit = '' } = {}) {
    const total = parts.reduce((a, p) => a + p.value, 0);
    if (!total) return '<p class="viz-empty">Sin datos todavía.</p>';
    const pct = v => Math.round(v / total * 100);
    return `<div class="viz-proportion">${parts.filter(p => p.value > 0).map(p =>
        `<span style="flex:${p.value};background:${p.color}" ${tipAttrs(`${pct(p.value)} %`, `${p.name} · ${p.display ?? fmtNum(p.value) + unit}`)}></span>`).join('')}</div>
    <div class="viz-legend viz-legend-values">${parts.map(p =>
        `<span><i style="background:${p.color}"></i>${esc(p.name)} <b>${pct(p.value)} %</b><small>${esc(p.display ?? fmtNum(p.value) + unit)}</small></span>`).join('')}</div>
    ${dataTable(['', 'Valor', '%'], parts.map(p => [p.name, p.display ?? fmtNum(p.value) + unit, pct(p.value) + ' %']), caption)}`;
}

/** Nivel 0–4 para un mapa de calor (0 = sin actividad). */
function heatLevel(v, max) {
    if (!v) return 0;
    if (max <= 1) return 4;
    return Math.min(4, 1 + Math.floor((v - 1) / Math.max(1, (max - 1) / 4) ));
}

/** Calendario de actividad de las últimas `weeks` semanas (columnas = semanas, filas = lunes→domingo). */
function activityCalendar(byDay, { weeks = 26, now = Date.now(), caption = '' } = {}) {
    const today = new Date(now);
    const mondayOffset = (today.getDay() + 6) % 7;
    const start = addDays(today, -mondayOffset - (weeks - 1) * 7);
    const days = [];
    for (let i = 0; i < weeks * 7; i++) days.push(addDays(start, i));
    const max = Math.max(1, ...days.map(d => byDay.get(dayKey(d)) || 0));
    const fmt = d => d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
    const months = [];
    for (let w = 0; w < weeks; w++) {
        const d = days[w * 7];
        const prev = w ? days[(w - 1) * 7] : null;
        months.push(!prev || prev.getMonth() !== d.getMonth() ? d.toLocaleDateString('es-ES', { month: 'short' }).replace('.', '') : '');
    }
    const cell = d => {
        const v = byDay.get(dayKey(d)) || 0;
        if (d > today) return '<i class="viz-cell is-future"></i>';
        return `<i class="viz-cell l${heatLevel(v, max)}${dayKey(d) === dayKey(today) ? ' is-today' : ''}" ${tipAttrs(v ? `${v} ${v === 1 ? 'sesión' : 'sesiones'}` : 'Sin actividad', fmt(d))}></i>`;
    };
    const dayNames = ['L', '', 'X', '', 'V', '', 'D'];
    let grid = '<span></span>' + months.map(m => `<span class="viz-cal-month">${esc(m)}</span>`).join('');
    for (let r = 0; r < 7; r++) {
        grid += `<span class="viz-cal-day">${dayNames[r]}</span>`;
        for (let w = 0; w < weeks; w++) grid += cell(days[w * 7 + r]);
    }
    const active = days.filter(d => d <= today && byDay.get(dayKey(d)));
    return `<div class="viz-calendar-wrap"><div class="viz-calendar" style="--weeks:${weeks}">${grid}</div></div>
    <div class="viz-scale"><span>Menos</span>${[0, 1, 2, 3, 4].map(l => `<i class="viz-cell l${l}"></i>`).join('')}<span>Más</span></div>
    ${dataTable(['Día', 'Sesiones'], active.map(d => [dayKey(d), String(byDay.get(dayKey(d)))]), caption)}`;
}

/** Cuadrícula de calor con etiquetas de filas y columnas. matrix[fila][columna]. */
function heatGrid(matrix, { rows, cols, rowTitle, colTitle, caption = '', cellAction = null } = {}) {
    const max = Math.max(1, ...matrix.flat());
    return `<div class="viz-heatgrid" style="--cols:${cols.length}">
        <span class="viz-hg-ytitle">${esc(rowTitle)}</span>
        ${matrix.map((row, r) => `
            <span class="viz-hg-label">${esc(rows[r])}</span>
            ${row.map((v, c) => `<button type="button" class="viz-hg-cell l${heatLevel(v, max)}" ${cellAction ? `data-act="${cellAction}" data-id="${r}:${c}"` : ''} ${tipAttrs(`${v} ${v === 1 ? 'obra' : 'obras'}`, `${rowTitle} ${rows[r]} · ${colTitle} ${cols[c]}`)}>${v || ''}</button>`).join('')}
        `).join('')}
        <span></span>${cols.map(c => `<span class="viz-hg-label is-col">${esc(c)}</span>`).join('')}
        <span></span><span class="viz-hg-xtitle">${esc(colTitle)}</span>
    </div>
    ${dataTable([`${rowTitle} \\ ${colTitle}`, ...cols], matrix.map((row, r) => [rows[r], ...row.map(String)]), caption)}`;
}

/** Medidor circular (reto anual). */
function ringMeter(value, max, { size = 112, stroke = 10, label = '' } = {}) {
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    const pct = max > 0 ? Math.min(1, value / max) : 0;
    return `<svg class="viz-ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${esc(label)}">
        <circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="viz-ring-track" stroke-width="${stroke}" fill="none"/>
        <circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="viz-ring-fill" stroke-width="${stroke}" fill="none"
            stroke-linecap="round" stroke-dasharray="${(c * pct).toFixed(2)} ${c.toFixed(2)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
    </svg>`;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { niceTicks, columnChart, barList, proportionBar, activityCalendar, heatGrid, ringMeter, heatLevel };
}
