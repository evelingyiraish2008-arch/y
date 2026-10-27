'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
Object.assign(global, require('../../utils.js'), require('../../history.js'), require('../../query.js'));
const q = require('../../queuekit.js');

const W = (id, o = {}) => ({ id, title: id.toUpperCase(), type: 'series', status: 'quiero ver', createdAt: 1, ...o });

describe('cola de pendientes', () => {
    const works = [W('a', { createdAt: 1 }), W('b', { createdAt: 3 }), W('c', { status: 'para rever', createdAt: 2 }), W('d', { status: 'viendo' }), W('e', { status: 'terminado' }), W('f', { trashedAt: 5 })];
    it('incluye pendientes y para rever; lo más reciente primero hasta que la ordenes', () => {
        assert.deepEqual(q.queueItems(works).map(w => w.id), ['b', 'c', 'a']);
        const ordered = works.map(w => (w.id === 'a' ? { ...w, queuePos: 0 } : w.id === 'b' ? { ...w, queuePos: 10 } : w));
        assert.deepEqual(q.queueItems(ordered).map(w => w.id), ['a', 'b', 'c']);
    });
    it('mover arriba, abajo, al principio y al final', () => {
        const items = q.queueItems(works);
        assert.deepEqual(q.moveInQueue(items, 'a', 'up'), ['b', 'a', 'c']);
        assert.deepEqual(q.moveInQueue(items, 'b', 'up'), ['b', 'c', 'a']); // ya es la primera
        assert.deepEqual(q.moveInQueue(items, 'b', 'down'), ['c', 'b', 'a']);
        assert.deepEqual(q.moveInQueue(items, 'a', 'down'), ['b', 'c', 'a']); // ya es la última
        assert.deepEqual(q.moveInQueue(items, 'a', 'top'), ['a', 'b', 'c']);
        assert.deepEqual(q.moveInQueue(items, 'b', 'bottom'), ['c', 'a', 'b']);
        assert.deepEqual(q.moveInQueue(items, 'zzz', 'up'), ['b', 'c', 'a']);
    });
});
describe('tiempo', () => {
    it('lo que falta, con la duración real si la hay; lo para rever cuenta entero', () => {
        assert.deepEqual(q.remaining(W('s', { totalEpisodes: 12, progress: 4, runtime: 45 })), { units: 8, minutes: 360 });
        assert.deepEqual(q.remaining(W('s', { totalEpisodes: 12 })), { units: 12, minutes: 600 }); // 50 min por defecto
        assert.deepEqual(q.remaining(W('p', { seriesType: 'Película' })), { units: 1, minutes: 120 });
        assert.deepEqual(q.remaining(W('p', { seriesType: 'Película', runtime: 95 })), { units: 1, minutes: 95 });
        assert.deepEqual(q.remaining(W('r', { status: 'para rever', totalEpisodes: 10, progress: 10, type: 'anime' })), { units: 10, minutes: 230 });
        assert.equal(q.remaining(W('x')), null); // sin total no se sabe
        assert.deepEqual(q.remaining(W('b', { type: 'book', pages: 300, progress: 100 })), { units: 200, minutes: 240 });
        assert.deepEqual([q.fmtMinutes(40), q.fmtMinutes(95), q.fmtMinutes(120), q.fmtMinutes(0)], ['40 min', '1 h 35 min', '2 h', '0 min']);
    });
});
describe('Sorpréndeme', () => {
    const works = [
        W('lig', { sadness: 1, spicy: 1, tags: 'comedia', totalEpisodes: 8 }), W('llo', { sadness: 5, totalEpisodes: 12 }),
        W('pic', { spicy: 4, bl: true, sadness: 2, type: 'anime', totalEpisodes: 12 }), W('cor', { seriesType: 'Película', runtime: 90, sadness: 3 }),
        W('viendo', { status: 'viendo', sadness: 5 })
    ];
    const first = () => 0;
    it('respeta el ánimo, el tipo y BL, y solo elige de la cola', () => {
        assert.equal(q.pickSurprise(works, { mood: 'llorar', rng: first }).id, 'llo');
        assert.equal(q.pickSurprise(works, { mood: 'picante', rng: first }).id, 'pic');
        assert.equal(q.pickSurprise(works, { mood: 'corto', rng: first }).id, 'cor');
        assert.equal(q.pickSurprise(works, { mood: 'ligero', rng: first }).id, 'lig');
        assert.equal(q.pickSurprise(works, { type: 'anime', rng: first }).id, 'pic');
        assert.equal(q.pickSurprise(works, { bl: true, rng: first }).id, 'pic');
        assert.equal(q.pickSurprise(works, { mood: 'picante', type: 'series', rng: first }), null);
        assert.ok(!['viendo'].includes(q.pickSurprise(works, { rng: () => 0.99 }).id)); // lo que ya estás viendo no entra
    });
    it('no repite la anterior si hay más opciones', () => {
        assert.notEqual(q.pickSurprise(works, { skip: q.queueItems(works)[0].id, rng: first }).id, q.queueItems(works)[0].id);
        assert.equal(q.pickSurprise([W('solo')], { skip: 'solo', rng: first }).id, 'solo'); // si es la única, se repite
    });
});
describe('Maratón', () => {
    it('cuántos capítulos caben de lo que ves y qué pendientes caben enteros', () => {
        const works = [
            W('en', { status: 'viendo', totalEpisodes: 12, progress: 2, runtime: 45 }),
            W('casi', { status: 'viendo', totalEpisodes: 10, progress: 8, runtime: 45 }),
            W('peli', { seriesType: 'Película', runtime: 100 }), W('larga', { totalEpisodes: 20, runtime: 60 })
        ];
        const p = q.marathonPlan(works, 180);
        assert.deepEqual(p.episodes.map(e => [e.work.id, e.count, e.finishes]), [['casi', 2, true], ['en', 4, false]]); // primero lo que termina
        assert.deepEqual(p.whole.map(e => e.work.id), ['peli']);
        assert.deepEqual(q.marathonPlan(works, 30), { episodes: [], whole: [], minutes: 30 });
    });
});
describe('parecidas a lo que te gustó', () => {
    it('de la cola, lo más parecido a lo que valoraste con 4 o más, con el motivo', () => {
        const works = [
            W('gusto', { status: 'terminado', rating: 5, bl: true, tags: 'bl, universidad, slow burn', actors: 'First' }),
            W('malo', { status: 'terminado', rating: 2, tags: 'terror' }),
            W('p1', { bl: true, tags: 'BL, universidad', actors: 'First' }), W('p2', { tags: 'terror, gore' }), W('p3', { bl: true, tags: 'slow burn' })
        ];
        const r = q.recommendFromLiked(works);
        assert.deepEqual(r.map(x => x.work.id), ['p1', 'p3']);
        assert.deepEqual(r[0].because, ['GUSTO']);
        assert.deepEqual(q.recommendFromLiked([W('solo')]), []);
    });
});
describe('calendario del mes', () => {
    it('la cuadrícula empieza en lunes y cubre el mes entero', () => {
        const m = q.monthMatrix(2026, 9); // octubre 2026: el día 1 es jueves
        assert.equal(m.length, 5);
        assert.ok(m.every(w => w.length === 7));
        assert.deepEqual([m[0][0].iso, m[0][3].iso, m[0][3].inMonth, m[0][2].inMonth], ['2026-09-28', '2026-10-01', true, false]);
        assert.equal(m[4][6].iso, '2026-11-01');
    });
    it('episodios con fecha real y proyección semanal; solo hasta el final de la serie', () => {
        const at = new Date(2026, 9, 8, 21, 0).getTime(); // jueves 8 de octubre
        const works = [
            W('real', { status: 'viendo', totalEpisodes: 3, progress: 1, nextAiring: { at, episode: 2, season: 1 } }),
            W('dia', { status: 'viendo', airDay: 5, progress: 4, totalEpisodes: 6 }), // viernes
            W('plan', { nextAiring: { at: new Date(2026, 9, 20, 12, 0).getTime(), episode: 1 } }),
            W('visto', { status: 'terminado', nextAiring: { at, episode: 9 } })
        ];
        const now = new Date(2026, 9, 5, 10, 0).getTime();
        const ev = q.calendarEvents(works, '2026-10-01', '2026-10-31', now);
        assert.deepEqual(ev.filter(e => e.work.id === 'real').map(e => [e.date, e.episode, e.projected]), [['2026-10-08', 2, false], ['2026-10-15', 3, true]]); // 3 es el último
        assert.deepEqual(ev.filter(e => e.work.id === 'dia').map(e => [e.date, e.episode]), [['2026-10-09', 5], ['2026-10-16', 6]]);
        assert.deepEqual(ev.filter(e => e.work.id === 'plan').map(e => e.date)[0], '2026-10-20');
        assert.ok(!ev.some(e => e.work.id === 'visto'));
        assert.deepEqual(ev.map(e => e.date), [...ev.map(e => e.date)].sort()); // ordenados
        assert.deepEqual(q.calendarEvents(works, '2026-11-01', '2026-11-30', now).filter(e => e.work.id === 'real'), []);
        assert.equal(q.platformHue(''), -1);
        assert.equal(q.platformHue('Viki'), q.platformHue(' VIKI '));
    });
});
