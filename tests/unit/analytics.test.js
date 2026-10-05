'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
Object.assign(global, require('../../utils.js'));
Object.assign(global, require('../../insights.js'));
Object.assign(global, require('../../history.js'));
Object.assign(global, require('../../coherence.js'));
const a = require('../../analytics.js');
const charts = require('../../charts.js');

const NOW = new Date(2026, 9, 4, 15, 0).getTime(); // 4 oct 2026
const done = (id, endDate, extra = {}) => ({ id, type: 'book', title: id, status: 'terminado', endDate, ...extra });

describe('comparativas', () => {
    const works = [done('a', '2026-10-01'), done('b', '2026-09-10'), done('c', '2026-09-20'), done('d', '2025-03-01'), done('e', '2025-11-01'), done('f', '2026-07-05')];
    it('mes, trimestre y año frente al anterior (el año, hasta la misma fecha)', () => {
        const c = a.periodComparisons(works, NOW);
        assert.deepEqual([c.month.now, c.month.prev, c.month.label], [1, 2, 'octubre']);
        assert.deepEqual([c.quarter.now, c.quarter.prev, c.quarter.label, c.quarter.prevLabel], [1, 3, 'T4', 'T3']);
        assert.deepEqual([c.year.now, c.year.prev], [4, 1]); // 2025-11 no cuenta: es posterior al 4 de octubre
    });
    it('meses del año y estacionalidad', () => {
        assert.equal(a.finishedByMonthOfYear(works, 2026)[8], 2);
        const s = a.seasonality(works);
        assert.equal(s[8], 2);
        assert.equal(s[2], 1);
    });
    it('periodos', () => {
        assert.deepEqual(a.periodRange('year', NOW), ['2026-01-01', '2026-10-04']);
        assert.equal(a.worksInPeriod(works, 'prev', NOW).length, 2);
        assert.equal(a.worksInPeriod(works, 'all', NOW).length, 6);
    });
});

describe('ritmo y proyección', () => {
    it('ritmo de una obra, fecha estimada y aviso si se ha frenado', () => {
        const w = { type: 'book', pages: 300, progress: 100, startDate: '2026-09-25', status: 'leyendo', activity: { '2026-09-20': 1, '2026-09-21': 1, '2026-09-22': 1 } };
        const p = a.workPace(w, NOW);
        assert.equal(p.days, 10);
        assert.equal(p.perDay, 10);
        assert.equal(p.eta, '2026-10-24');
        assert.equal(p.slowing, true); // 12 días sin avanzar cuando lo normal era cada día
        assert.equal(a.workPace({ type: 'book', progress: 0 }, NOW), null);
    });
    it('reto: fecha en que lo cumplirás a este ritmo', () => {
        const works = Array.from({ length: 9 }, (_, i) => done('x' + i, '2026-0' + (i + 1) + '-01'));
        const p = a.goalProjection(works, 12, NOW);
        assert.equal(p.done, 9);
        assert.ok(p.date > '2026-12-01' && p.date < '2027-01-31', p.date);
        assert.equal(a.goalProjection(works, 5, NOW).reached, true);
    });
    it('páginas al día de los últimos 12 meses', () => {
        const pace = a.overallPace([{ type: 'book', progress: 100, startDate: '2026-09-25', status: 'leyendo' }], NOW);
        assert.equal(pace.pagesPerDay, 10);
    });
});

describe('rankings, distribuciones y notas', () => {
    const works = [
        { id: '1', type: 'book', title: 'A', rating: 4, author: 'X', tags: 'fantasía' },
        { id: '2', type: 'book', title: 'B', rating: 5, author: 'X', tags: 'fantasía', bl: true },
        { id: '3', type: 'anime', title: 'C', rating: 3, studio: 'MAPPA', year: 2019 },
        { id: '4', type: 'anime', title: 'D', rating: 5, studio: 'MAPPA', year: 2001 }
    ];
    it('lo mejor de cada tipo, BL, etiqueta y personas', () => {
        const r = a.rankings(works);
        assert.equal(r.byType.book.title, 'B');
        assert.equal(r.byType.series, null);
        assert.equal(r.bestBl.title, 'B');
        assert.equal(r.byTag[0].best.title, 'B');
        assert.deepEqual(r.authors[0], { label: 'X', count: 2, avg: 4.5 });
        assert.equal(r.studios[0].label, 'MAPPA');
    });
    it('notas por tipo (mediana) y por década, con huecos', () => {
        const s = a.ratingSpread(works);
        assert.deepEqual(s.map(x => [x.type, x.median]), [['book', 4.5], ['anime', 4]]);
        assert.deepEqual(a.byDecade(works).map(d => d.label + ':' + d.count), ['2000s:1', '2010s:1']);
    });
    it('estadísticas de notas', () => {
        const at = h => new Date(2026, 9, 1, h).getTime(); // jueves
        const notes = [{ content: 'Increíble historia, increíble final', createdAt: at(22), workTitle: 'A' }, { content: 'Final triste', createdAt: at(9), type: 'resena', scores: { final: 4 } }];
        const ns = a.notesStats(notes, NOW);
        assert.equal(ns.totalWords, 6);
        assert.equal(ns.longest.words, 4);
        assert.equal(ns.perMonth[11].count, 2);
        assert.deepEqual(ns.topWords.slice(0, 2), [{ word: 'final', count: 2 }, { word: 'increible', count: 2 }]);
        assert.equal(ns.hours[3][5], 1);
        assert.deepEqual(a.criteriaAverages(notes).map(c => [c.key, c.avg]), [['final', 4]]);
    });
});

describe('tu año', () => {
    it('resume el año', () => {
        const data = { works: [done('a', '2026-03-02', { rating: 5, tags: 'BL', bl: true, pages: 300, progress: 300 }), done('b', '2026-03-20', { rating: 3 }), done('c', '2025-01-01')], notes: [{ content: 'hola mundo', createdAt: new Date(2026, 1, 1).getTime() }] };
        const s = a.wrappedSummary(data, 2026, NOW);
        assert.deepEqual([s.total, s.byType.book, s.best.id, s.bestMonth, s.bestMonthCount, s.notes, s.words, s.bl, s.first.id], [2, 2, 'a', 'marzo', 2, 1, 2, 1, 'a']);
        assert.equal(s.hours, 6);
    });
});

describe('gráficos nuevos', () => {
    it('columnas agrupadas: una barra por serie y escala por la mayor barra', () => {
        const html = charts.columnChart({ categories: ['ene'], series: [{ name: '2026', color: 'red' }, { name: '2025', color: 'blue' }], values: [[3, 1]], grouped: true });
        assert.equal((html.match(/viz-gbar/g) || []).length, 2);
        assert.match(html, /height:100%/);
        assert.doesNotMatch(html, /<th scope="col">Total/);
    });
    it('puntos por fila con mediana y tabla', () => {
        const html = charts.dotStrip([{ label: 'Libros', color: 'red', values: [3, 5, 5], median: 5 }]);
        assert.equal((html.match(/<i style/g) || []).length, 3);
        assert.match(html, /Mediana 5/);
        assert.match(html, /<td>3<\/td>/);
    });
});
