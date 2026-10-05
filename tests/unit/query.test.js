'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
Object.assign(global, require('../../utils.js'));
const q = require('../../query.js');

const works = [
    { id: '1', type: 'book', title: "Heaven Official's Blessing", author: 'Mo Xiang Tong Xiu', status: 'leyendo', rating: 5, bl: true, tags: 'BL, fantasía, romance', spicy: 4, year: 2020, startDate: '2026-08-01' },
    { id: '2', type: 'book', title: 'El Nombre del Viento', author: 'Patrick Rothfuss', status: 'terminado', rating: 4.5, tags: 'fantasía, aventura', spicy: 1, year: 2007, endDate: '2026-08-20' },
    { id: '3', type: 'series', title: 'The Untamed', status: 'viendo', rating: 5, bl: true, tags: 'BL, wuxia, drama', spicy: 2, year: 2019, actors: 'Xiao Zhan, Wang Yibo' },
    { id: '4', type: 'anime', title: 'Jujutsu Kaisen', status: 'quiero ver', rating: 0, tags: 'shonen, acción', year: 2020, studio: 'MAPPA' },
    { id: '5', type: 'manhwa', title: 'Solo Leveling', status: 'abandonado', rating: 3, tags: 'acción', year: 2018 }
];
const ids = s => q.searchWorks(works, s).map(w => w.id);

describe('sintaxis de búsqueda', () => {
    it('ejemplos de la ayuda', () => {
        assert.deepEqual(ids('BL rating:5'), ['1', '3']);
        assert.deepEqual(ids('estado:pendiente año:>2019'), ['4']);
        assert.deepEqual(ids('tag:fantasía tag:romance'), ['1']);
        assert.deepEqual(ids('autor:"Mo Xiang"'), ['1']);
        assert.deepEqual(ids('spicy:>=3'), ['1']);
    });
    it('negación, alternativas, tipos y texto libre', () => {
        assert.deepEqual(ids('BL -tag:drama'), ['1']);
        assert.deepEqual(ids('tipo:anime o tipo:manhwa'), ['4', '5']);
        assert.deepEqual(ids('tipo:libro estado:terminada'), ['2']);
        assert.deepEqual(ids('fantasía nota:<5'), ['2']);
        assert.deepEqual(ids('actor:"wang yibo"'), ['3']);
        assert.deepEqual(ids('estudio:mappa'), ['4']);
        assert.deepEqual(ids('bl:no estado:activo'), []);
        assert.deepEqual(ids('fin:2026-08 nota:>=4'), ['2']);
        assert.deepEqual(ids('inicio:>=2026'), ['1']);
        assert.deepEqual(ids('progreso:0 tipo:anime'), ['4']);
    });
    it('reconoce si una búsqueda es avanzada y la describe', () => {
        assert.equal(q.isAdvancedQuery('nombre del viento'), false);
        assert.equal(q.isAdvancedQuery('BL'), true);
        assert.equal(q.isAdvancedQuery('año:>2020'), true);
        assert.equal(q.describeQuery('BL nota:>=4 o tipo:anime'), 'es BL y valoración de al menos 4 — o — tipo es anime');
    });
});

describe('parecidas y fechas', () => {
    it('obras parecidas con motivos', () => {
        const s = q.similarWorks(works[0], works);
        assert.equal(s[0].work.id, '3');
        assert.ok(s[0].why.includes('BL'));
    });
    it('filtro por fechas', () => {
        const NOW = new Date(2026, 9, 4).getTime();
        assert.deepEqual(q.filterByDate(works, '3m', NOW).map(w => w.id), ['1', '2']);
        assert.deepEqual(q.filterByDate(works, 'm', NOW).map(w => w.id), []);
        assert.equal(q.filterByDate(works, 'any', NOW).length, 5);
    });
});
