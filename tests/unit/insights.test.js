'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
Object.assign(global, require('../../utils.js'));
const ins = require('../../insights.js');
Object.assign(global, ins);
const charts = require('../../charts.js');

const NOW = new Date(2026, 9, 4, 15, 0).getTime(); // domingo 4 oct 2026
const day = n => ins.dayKey(NOW - n * 86400000);

describe('actividad y rachas', () => {
    it('bumpActivity cuenta sesiones por día y olvida lo de hace más de ~13 meses', () => {
        const w = { activity: { '2024-01-01': 3 } };
        ins.bumpActivity(w, NOW);
        ins.bumpActivity(w, NOW);
        assert.deepEqual(w.activity, { '2026-10-04': 2 });
    });
    it('activityByDay suma sesiones, el día en que se agregó y el día en que se terminó', () => {
        const map = ins.activityByDay([
            { activity: { [day(0)]: 2 }, createdAt: NOW, status: 'viendo' },
            { createdAt: NOW - 5 * 86400000, status: 'terminado', endDate: day(1) },
            { createdAt: NOW, sample: true } // los ejemplos no cuentan como "agregados por ti"
        ]);
        assert.equal(map.get(day(0)), 3);
        assert.equal(map.get(day(1)), 1);
        assert.equal(map.get(day(5)), 1);
    });
    it('la racha sigue viva si hoy aún no hay actividad pero ayer sí', () => {
        const map = new Map([[day(1), 1], [day(2), 4], [day(3), 1], [day(10), 1], [day(11), 1]]);
        assert.deepEqual(ins.streaks(map, NOW), { current: 3, best: 3, today: 0 });
        map.set(day(0), 1);
        assert.equal(ins.streaks(map, NOW).current, 4);
        assert.equal(ins.streaks(new Map([[day(2), 1]]), NOW).current, 0);
    });
});

describe('estadísticas', () => {
    const works = [
        { type: 'book', status: 'terminado', endDate: '2026-10-01', rating: 4.5, spicy: 2, sadness: 5, country: 'Corea del Sur' },
        { type: 'anime', status: 'terminado', endDate: '2026-09-15', rating: 5, spicy: 1, sadness: 1, country: 'Japón' },
        { type: 'anime', status: 'terminado', endDate: '2025-09-15', rating: 4.5 },
        { type: 'series', status: 'viendo', rating: 0, country: 'corea del sur' },
        { type: 'manhwa', status: 'quiero leer' },
        { type: 'book', status: 'abandonado' }
    ];
    it('terminadas por mes y tipo en los últimos 12 meses', () => {
        const m = ins.finishedByMonth(works, 12, NOW);
        assert.equal(m.length, 12);
        assert.equal(m[11].key, '2026-10');
        assert.deepEqual(m[11].byType, { book: 1, series: 0, anime: 0, manhwa: 0 });
        assert.equal(m[10].byType.anime, 1);
        assert.equal(m.reduce((a, x) => a + x.byType.anime, 0), 1); // la de 2025-09 queda fuera
    });
    it('histograma de valoraciones (sin contar las que no tienen nota)', () => {
        const h = ins.ratingHistogram(works);
        assert.equal(h.length, 10);
        assert.equal(h.find(b => b.rating === 4.5).count, 2);
        assert.equal(h.find(b => b.rating === 5).count, 1);
        assert.equal(h.reduce((a, b) => a + b.count, 0), 3);
    });
    it('mapa de emociones: tristeza en filas (5 arriba) y spicy en columnas', () => {
        const g = ins.moodGrid(works);
        assert.equal(g[0][1], 1); // tristeza 5, spicy 2
        assert.equal(g[4][0], 1); // tristeza 1, spicy 1
        assert.equal(g.flat().reduce((a, b) => a + b, 0), 2);
    });
    it('resumen de estados', () => {
        assert.deepEqual(ins.statusSummary(works), { active: 1, done: 3, planned: 1, dropped: 1 });
    });
    it('valores más frecuentes sin distinguir mayúsculas', () => {
        assert.deepEqual(ins.topValues(works, 'country'), [{ label: 'Corea del Sur', count: 2 }, { label: 'Japón', count: 1 }]);
    });
    it('terminadas en un año', () => {
        assert.equal(ins.finishedInYear(works, 2026), 2);
        assert.equal(ins.finishedInYear(works, 2025), 1);
    });
});

describe('avisos', () => {
    it('avisa de lo que se emite hoy, de lo casi terminado, de lo parado y del reto', () => {
        const works = [
            { id: 'a', title: 'Hoy', type: 'series', status: 'viendo', airDay: '0', progress: 3, totalEpisodes: 12, updatedAt: NOW },
            { id: 'b', title: 'Casi', type: 'book', status: 'leyendo', progress: 95, pages: 100, updatedAt: NOW },
            { id: 'c', title: 'Parada', type: 'anime', status: 'viendo', progress: 1, totalEpisodes: 12, updatedAt: NOW - 20 * 86400000 },
            { id: 'd', title: 'Ejemplo', type: 'anime', status: 'viendo', progress: 1, totalEpisodes: 12, updatedAt: 1 }
        ];
        const n = ins.computeNotifications(works, { yearGoal: 50 }, NOW);
        const icons = n.map(x => x.icon + x.workId);
        assert.ok(icons.includes('📺a'));
        assert.ok(icons.includes('🏁b'));
        assert.ok(icons.includes('⏸️c'));
        assert.ok(!icons.some(i => i.endsWith('d') && i.startsWith('⏸️'))); // ejemplos sin fecha real: no se avisa
        assert.ok(n.some(x => x.icon === '🎯'));
        assert.match(n.find(x => x.icon === '📺').text, /episodio 4/);
    });
    it('sin reto ni obras en curso no hay avisos', () => {
        assert.deepEqual(ins.computeNotifications([{ id: 'x', status: 'terminado' }], {}, NOW), []);
    });
});

describe('¿Qué veo hoy?', () => {
    const works = [
        { id: '1', type: 'anime', status: 'quiero ver' },
        { id: '2', type: 'book', status: 'quiero leer' },
        { id: '3', type: 'series', status: 'viendo' }
    ];
    it('elige entre las pendientes y respeta el tipo y las excluidas', () => {
        assert.equal(ins.pickForToday(works, { type: 'book', random: () => 0 }).id, '2');
        assert.equal(ins.pickForToday(works, { exclude: ['1'], random: () => 0 }).id, '2');
    });
    it('si no hay pendientes, elige entre las que están en curso; si no hay nada, null', () => {
        assert.equal(ins.pickForToday(works, { type: 'series', random: () => 0.5 }).id, '3');
        assert.equal(ins.pickForToday(works, { type: 'manhwa' }), null);
    });
});

describe('charts', () => {
    it('niceTicks da valores redondos que cubren el máximo', () => {
        assert.deepEqual(charts.niceTicks(7), [0, 2, 4, 6, 8]);
        assert.deepEqual(charts.niceTicks(0), [0, 1]);
        assert.ok(charts.niceTicks(137).at(-1) >= 137);
    });
    it('columnChart: leyenda solo con 2+ series, tabla equivalente y etiquetas escapadas', () => {
        const one = charts.columnChart({ categories: ['<b>ene</b>'], series: [{ name: 'A', color: 'red' }], values: [[3]] });
        assert.doesNotMatch(one, /viz-legend/);
        assert.match(one, /&lt;b&gt;ene&lt;\/b&gt;/);
        assert.match(one, /<table class="viz-table"/);
        const two = charts.columnChart({ categories: ['ene', 'feb'], series: [{ name: 'A', color: 'red' }, { name: 'B', color: 'blue' }], values: [[1, 2], [0, 0]] });
        assert.match(two, /viz-legend/);
        assert.match(two, /data-tip-value="3"/);
        assert.match(two, /<td>3<\/td>/); // total en la tabla
    });
    it('heatLevel reparte en 0–4', () => {
        assert.equal(charts.heatLevel(0, 10), 0);
        assert.equal(charts.heatLevel(1, 10), 1);
        assert.equal(charts.heatLevel(10, 10), 4);
        assert.equal(charts.heatLevel(1, 1), 4);
    });
    it('el calendario no marca días futuros y resalta hoy', () => {
        const html = charts.activityCalendar(new Map([[ins.dayKey(NOW), 2]]), { weeks: 2, now: NOW });
        assert.equal((html.match(/is-today/g) || []).length, 1);
        assert.match(html, /2 sesiones/);
        assert.equal((html.match(/class="viz-cell[^"]*"/g) || []).length, 14 + 5); // 14 días + 5 de la escala
    });
    it('proportionBar calcula porcentajes', () => {
        const html = charts.proportionBar([{ name: 'A', value: 3, color: 'red' }, { name: 'B', value: 1, color: 'blue' }]);
        assert.match(html, /75 %/);
        assert.match(html, /25 %/);
    });
});
