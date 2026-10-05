'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
Object.assign(global, require('../../utils.js'));
Object.assign(global, require('../../insights.js'));
Object.assign(global, require('../../history.js'));
Object.assign(global, require('../../coherence.js'));
const x = require('../../extras.js');
const i18n = require('../../i18n.js');
global.FEATURE_ACTIONS = {};
Object.assign(global, require('../../content.js'));
const play = require('../../play.js');

const NOW = new Date(2026, 9, 4, 12).getTime();
const data = () => ({
    works: [
        { id: 'a', type: 'book', title: 'Dune', status: 'terminado', startDate: '2026-01-01', endDate: '2026-01-11', rating: 5, pages: 600, progress: 600, author: 'Frank Herbert', image: 'i1', tags: 'ciencia ficción', createdAt: new Date(2025, 11, 30).getTime() },
        { id: 'b', type: 'anime', title: 'Given', status: 'viendo', startDate: '2026-10-01', totalEpisodes: 11, progress: 11, image: 'i2', tags: 'romance, BL', bl: true, sadness: 4, activity: { '2026-10-04': 2 }, airDay: '3' },
        { id: 'c', type: 'series', title: 'Semantic Error', status: 'terminado', endDate: '2026-03-01', image: 'i3', bl: true, tags: 'BL, comedia' },
        { id: 'd', type: 'manhwa', title: 'Jinx', status: 'quiero leer', progress: 5, image: 'i4', spicy: 5, createdAt: new Date(2024, 0, 1).getTime() },
        { id: 'e', type: 'book', title: 'Dune ', status: 'quiero leer', image: '', createdAt: 1 }
    ],
    notes: [{ id: 'n', workId: 'a', workTitle: 'Dune', content: 'Arena', createdAt: new Date(2026, 0, 5).getTime() }],
    collections: [{ id: 'col', name: 'BL', items: ['c', 'x'] }, { id: 'empty', name: 'Vacía', items: [] }],
    settings: { diary: [{ id: 'd1', date: '2026-10-04', text: 'Maratón de Given' }] }
});

describe('cronología y diario', () => {
    it('eventos ordenados y agrupados por mes', () => {
        const ev = x.timelineEvents(data());
        assert.equal(ev[0].date, '2026-10-04');
        assert.ok(ev.some(e => e.kind === 'end' && e.text.includes('Dune') && e.text.includes('★ 5')));
        assert.deepEqual(x.groupByMonth(ev).map(g => g.key).slice(0, 2), ['2026-10', '2026-03']);
    });
    it('el diario junta lo automático y lo escrito', () => {
        const d = x.diaryDay(data(), '2026-10-04');
        assert.deepEqual(d.auto.map(a => [a.work.id, a.sessions]), [['b', 2]]);
        assert.equal(d.manual[0].text, 'Maratón de Given');
    });
});

describe('limpieza, preguntas y ánimo', () => {
    it('sugerencias de limpieza', () => {
        const s = x.cleanupSuggestions(data(), NOW);
        const ids = Object.fromEntries(s.map(g => [g.id, g.items.map(i => i.id || i.name)]));
        assert.deepEqual(ids.norating, ['c']);
        assert.deepEqual(ids.nocover, ['e']);
        assert.deepEqual(ids.dups, ['a', 'e']);
        assert.deepEqual(ids.emptycoll, ['empty']);
        assert.deepEqual(ids.oldplan, ['d', 'e']);
    });
    it('responde preguntas con tus datos', () => {
        assert.equal(x.answerQuestion('bestYear', data()).text, '2026, con 2 obras terminadas.');
        assert.equal(x.answerQuestion('fastest', data()).text, '“Dune”, en 11 días.');
        assert.equal(x.answerQuestion('blShare', data()).text, '2 de 5 obras (40 %) son BL.');
        assert.equal(x.answerQuestion('oldestPending', data()).workId, 'e');
    });
    it('propuestas según el ánimo: primero lo que tienes a medias', () => {
        assert.deepEqual(x.moodSuggestions(data().works, 'sad').map(s => s.work.id), ['b']);
        assert.deepEqual(x.moodSuggestions(data().works, 'romantic').map(s => s.work.id), ['b']); // la terminada sin nota no se propone
        assert.deepEqual(x.moodSuggestions(data().works, 'spicy').map(s => [s.work.id, s.why]), [['d', 'la tienes pendiente']]);
    });
});

describe('juego, retos, sugerencias y calendario', () => {
    it('adivina por portada: 4 opciones con la respuesta', () => {
        let k = 0;
        const r = x.guessRound(data().works, () => [0.1, 0.5, 0.2, 0.9, 0.3, 0.7, 0.4][k++ % 7]);
        assert.equal(r.options.length, 4);
        assert.ok(r.options.some(o => o.id === r.answer.id));
        assert.equal(x.guessRound(data().works.slice(0, 3)), null);
    });
    it('progreso de los retos desde que empezaron', () => {
        const d = data();
        assert.deepEqual(x.challengeProgress({ kind: 'finish', goal: 3, bl: true, since: '2026-01-01' }, d, NOW), { value: 1, goal: 3, done: false, pct: 33 });
        assert.equal(x.challengeProgress({ kind: 'notes', goal: 1, since: '2026-01-01' }, d, NOW).done, true);
        assert.equal(x.challengeProgress({ kind: 'newcreator', goal: 2, since: '2026-01-01' }, d, NOW).value, 1);
    });
    it('sugerencias inteligentes de una obra', () => {
        const d = data();
        assert.deepEqual(x.workSuggestions(d.works[1], d).map(s => s.id), ['finish', 'coll:col']); // es BL como lo que hay en esa colección
        assert.deepEqual(x.workSuggestions(d.works[3], d).map(s => s.id), ['start']);
        assert.deepEqual(x.workSuggestions(d.works[2], d).map(s => s.id), ['rate']);
    });
    it('calendario .ics con un evento semanal por emisión', () => {
        const ics = x.buildIcs(data().works, { now: NOW });
        assert.match(ics, /BEGIN:VEVENT[\s\S]*RRULE:FREQ=WEEKLY[\s\S]*SUMMARY:🎌 Given/);
        assert.match(ics, /DTSTART:20261007T200000/); // el miércoles siguiente
        assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 1);
    });
});

describe('idiomas y marcador', () => {
    it('traduce textos con su emoji y respeta el español', () => {
        assert.equal(i18n.translateText('📖 Libros', 'en'), '📖 Books');
        assert.equal(i18n.translateText('  Inicio ', 'pt'), '  Início ');
        assert.equal(i18n.translateText('Texto sin traducir', 'en'), 'Texto sin traducir');
        assert.equal(i18n.translateText('Libros', 'es'), 'Libros');
        assert.equal(i18n.detectLang(undefined), 'es');
        assert.equal(i18n.detectLang('pt'), 'pt');
        assert.ok(i18n.I18N_ROWS.every(r => r.length === 3 && r.every(Boolean)));
    });
    it('el marcador trae título, portada y tipo según la web', () => {
        const p = play.presetFromParams(new URLSearchParams('titulo=The%20Untamed%20%7C%20Netflix%20Official%20Site&imagen=https%3A%2F%2Fx%2Fp.jpg&enlace=https%3A%2F%2Fwww.netflix.com%2Ftitle%2F1'));
        assert.deepEqual(p, { type: 'series', preset: { title: 'The Untamed', image: 'https://x/p.jpg', synopsis: 'Guardado desde www.netflix.com' } });
        assert.equal(play.presetFromParams(new URLSearchParams('titulo=Lore&enlace=https://www.webtoons.com/x&imagen=javascript:1')).preset.image, undefined);
        global.location = { protocol: 'https:', origin: 'https://ejemplo.github.io', pathname: '/y/' };
        assert.match(decodeURIComponent(play.clipperBookmarklet()), /^javascript:.*https:\/\/ejemplo.github.io\/y\/\?accion=agregar/);
    });
});
