'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
Object.assign(global, require('../../utils.js'));
Object.assign(global, require('../../insights.js'));
const n = require('../../notify.js');

const NOW = new Date(2026, 9, 4, 21, 30).getTime(); // domingo 4 oct 2026, 21:30
const on = extra => ({ notify: { enabled: true, ...extra } });

describe('avisos programados', () => {
    const works = [
        { id: 'a', type: 'series', title: 'The Untamed', status: 'viendo', progress: 27, airDay: '0', activity: { '2026-10-03': 1, '2026-10-02': 1 } },
        { id: 'b', type: 'book', title: 'Dune', status: 'quiero leer' }
    ];
    it('desactivados: no sale nada', () => {
        assert.deepEqual(n.dueNotifications({ works, settings: {} }, NOW), []);
    });
    it('diario, emisión, resumen semanal y racha en peligro, cada uno una sola vez', () => {
        const due = n.dueNotifications({ works, settings: on() }, NOW);
        assert.deepEqual(due.map(x => x.id).sort(), ['air:a:2026-10-04', 'daily:2026-10-04', 'streak:2026-10-04', 'weekly:2026-10-04']);
        assert.match(due.find(x => x.id.startsWith('streak')).title, /racha de 2 días/);
        assert.match(due.find(x => x.id.startsWith('weekly')).body, /^2 sesiones, 0 obras terminadas/);
        const sent = Object.fromEntries(due.map(x => [x.id, NOW]));
        assert.deepEqual(n.dueNotifications({ works, settings: on() }, NOW + 60000, sent), []);
    });
    it('respeta las horas elegidas y las opciones apagadas', () => {
        const early = new Date(2026, 9, 4, 9, 0).getTime();
        assert.deepEqual(n.dueNotifications({ works, settings: on({ weekly: { on: false } }) }, early), []);
    });
    it('inactividad: avisa a partir de los días elegidos', () => {
        const idle = [{ ...works[0], activity: { '2026-09-28': 1 }, airDay: '' }];
        const due = n.dueNotifications({ works: idle, settings: on({ daily: { on: false }, weekly: { on: false }, streak: { on: false } }) }, NOW);
        assert.deepEqual(due.map(x => x.id), ['idle:2026-09-28']);
        assert.match(due[0].body, /Hace 6 días/);
    });
    it('recordatorios de cada obra: diario, semanal, mensual y una vez', () => {
        assert.ok(n.reminderDueAt({ reminder: { mode: 'daily', time: '20:00' } }, NOW) <= NOW);
        assert.equal(n.reminderDueAt({ reminder: { mode: 'weekly', day: 1, time: '20:00' } }, NOW), 0);
        assert.ok(n.reminderDueAt({ reminder: { mode: 'monthly', day: 4, time: '08:00' } }, NOW) > 0);
        const ws = [{ id: 'c', type: 'book', title: 'Circe', status: 'quiero leer', reminder: { mode: 'once', at: NOW - 1000, note: '¡Empieza hoy!' } }];
        const due = n.dueNotifications({ works: ws, settings: on({ daily: { on: false }, weekly: { on: false }, streak: { on: false }, inactivity: { on: false } }) }, NOW);
        assert.deepEqual(due.map(x => [x.title, x.body]), [['🔔 Circe', '¡Empieza hoy!']]);
    });
    it('olvida lo enviado hace más de 40 días', () => {
        assert.deepEqual(Object.keys(n.pruneSent({ old: NOW - 41 * 86400000, recent: NOW - 1000 }, NOW)), ['recent']);
    });
});

describe('descubrimientos y sugerencias', () => {
    const works = [
        { id: '1', type: 'anime', title: 'A', rating: 5, studio: 'MAPPA', tags: 'acción', status: 'terminado', endDate: '2026-10-04', startDate: '2026-10-01' },
        { id: '2', type: 'anime', title: 'B', rating: 5, studio: 'MAPPA', tags: 'acción', status: 'terminado', endDate: '2026-09-27', startDate: '2026-09-20' },
        { id: '3', type: 'book', title: 'C', rating: 3, tags: 'drama', status: 'terminado', endDate: '2026-09-23', startDate: '2026-09-01', bl: true },
        { id: '4', type: 'book', title: 'D', rating: 3, tags: 'drama', status: 'terminado', endDate: '2026-09-20', startDate: '2026-09-10', bl: true },
        { id: '5', type: 'anime', title: 'E', tags: 'acción', studio: 'MAPPA', status: 'quiero ver' },
        { id: '6', type: 'series', title: 'F', tags: 'drama', status: 'abandonado' }, { id: '7', type: 'series', title: 'G', tags: 'drama', status: 'abandonado' }
    ];
    it('encuentra patrones con datos suficientes', () => {
        const d = n.discoveries(works);
        const text = d.map(x => x.text).join('\n');
        assert.match(text, /Terminas más obras los domingos/);
        assert.match(text, /etiqueta “acción” \(★ 5 de media/);
        assert.match(text, /El BL te convence menos/);
        assert.match(text, /abandonar obras con la etiqueta “drama”/);
        assert.match(text, /Tardas una media de/);
    });
    it('sugiere pendientes parecidas a tus favoritas', () => {
        const s = n.suggestForYou(works);
        assert.equal(s[0].work.id, '5');
        assert.match(s[0].reason, /te gustó A|acción/);
    });
});

describe('episodio nuevo según la fecha real', () => {
    it('avisa cuando ya ha salido', () => {
        const w = [{ id: 'x', type: 'anime', title: 'Frieren', status: 'viendo', nextAiring: { at: NOW - 3600000, episode: 12 } }];
        const due = n.dueNotifications({ works: w, settings: { notify: { enabled: true, daily: { on: false }, weekly: { on: false }, streak: { on: false }, inactivity: { on: false } } } }, NOW);
        assert.deepEqual(due.map(d => [d.id, d.body]), [['newep:x:12', 'Episodio 12 disponible.']]);
    });
});
