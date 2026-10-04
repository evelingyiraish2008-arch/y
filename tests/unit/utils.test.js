'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const u = require('../../utils.js');

describe('esc', () => {
    it('escapa etiquetas y comillas', () => {
        assert.equal(u.esc('<script>alert("x")</script>'), '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
        assert.equal(u.esc("O'Neil & co"), 'O&#39;Neil &amp; co');
    });
    it('convierte null/undefined en cadena vacía', () => {
        assert.equal(u.esc(null), '');
        assert.equal(u.esc(undefined), '');
    });
    it('mantiene el texto normal', () => assert.equal(u.esc('Hola mundo'), 'Hola mundo'));
});

describe('norm y splitList', () => {
    it('quita tildes y mayúsculas', () => assert.equal(u.norm('  Acción ÉPICA '), 'accion epica'));
    it('separa por comas y descarta vacíos', () => assert.deepEqual(u.splitList('BL, drama,, romance '), ['BL', 'drama', 'romance']));
    it('acepta valores vacíos', () => assert.deepEqual(u.splitList(undefined), []));
});

describe('getProgress', () => {
    it('calcula el progreso de un libro', () => assert.equal(u.getProgress({ type: 'book', pages: 100, progress: 50 }), 50));
    it('nunca pasa del 100 %', () => assert.equal(u.getProgress({ type: 'book', pages: 100, progress: 150 }), 100));
    it('devuelve 0 sin total', () => assert.equal(u.getProgress({ type: 'book', pages: 0, progress: 50 }), 0));
    it('devuelve 100 si está terminada sin total', () => assert.equal(u.getProgress({ type: 'series', status: 'terminado' }), 100));
    it('usa episodios en series y anime', () => {
        assert.equal(u.getProgress({ type: 'series', totalEpisodes: 24, progress: 12 }), 50);
        assert.equal(u.getProgress({ type: 'anime', totalEpisodes: 12, progress: 3 }), 25);
    });
    it('usa capítulos en manhwa', () => assert.equal(u.getProgress({ type: 'manhwa', totalChapters: 200, progress: 50 }), 25));
});

describe('getProgressText', () => {
    it('formatea según el tipo', () => {
        assert.equal(u.getProgressText({ type: 'book', pages: 300, progress: 10 }), '10 / 300 págs');
        assert.equal(u.getProgressText({ type: 'manhwa', totalChapters: 9, progress: 2 }), 'Cap 2 / 9');
        assert.equal(u.getProgressText({ type: 'anime', progress: 4 }), 'Ep 4');
        assert.equal(u.getProgressText({ type: 'series', seriesType: 'Película', status: 'terminado' }), 'Vista');
    });
});

describe('getStars y ratingText', () => {
    it('cinco estrellas para 5', () => assert.equal(u.getStars(5), '★★★★★'));
    it('redondea medias estrellas', () => assert.equal(u.getStars(4.5), '★★★★★'));
    it('vacías sin valoración', () => assert.equal(u.getStars(0), '☆☆☆☆☆'));
    it('texto de valoración', () => {
        assert.equal(u.ratingText(4.25), '4.3');
        assert.equal(u.ratingText(0), '–');
    });
});

describe('normalizeData', () => {
    it('devuelve una estructura vacía con datos inválidos', () => {
        const d = u.normalizeData(null);
        assert.deepEqual(d.works, []);
        assert.equal(d.settings.themeColor, u.DEFAULT_SETTINGS.themeColor);
    });
    it('descarta obras sin id o con tipo desconocido', () => {
        const d = u.normalizeData({ works: [{ id: 'a', type: 'book', title: 'ok' }, { type: 'book' }, { id: 'b', type: 'podcast' }] });
        assert.deepEqual(d.works.map(w => w.id), ['a']);
    });
    it('completa ajustes que faltan sin perder los existentes', () => {
        const d = u.normalizeData({ works: [], settings: { darkMode: false } });
        assert.equal(d.settings.darkMode, false);
        assert.equal(d.settings.fontSize, 14);
    });
    it('convierte notas antiguas guardadas en la obra', () => {
        const d = u.normalizeData({ works: [{ id: 'w', type: 'anime', title: 'X', note: 'genial' }] });
        assert.equal(d.notes.length, 1);
        assert.equal(d.notes[0].workId, 'w');
        assert.equal(d.notes[0].content, 'genial');
    });
    it('repara colecciones sin lista de obras', () => {
        const d = u.normalizeData({ works: [], collections: [{ id: 'c', name: 'C' }] });
        assert.deepEqual(d.collections[0].items, []);
    });
});

describe('filterWorks y sortWorks', () => {
    const works = [
        { id: '1', type: 'book', title: 'Bravo', author: 'Ana', status: 'leyendo', bl: true, spicy: 3, rating: 4, createdAt: 1 },
        { id: '2', type: 'series', title: 'Alfa', actors: 'Bright', status: 'quiero ver', favorite: true, rating: 5, createdAt: 3 },
        { id: '3', type: 'anime', title: 'Charlie', tags: 'acción', status: 'terminado', rating: 2, createdAt: 2 }
    ];
    const ids = list => list.map(w => w.id);
    it('busca en título, autor, actores y etiquetas sin tildes', () => {
        assert.deepEqual(ids(u.filterWorks(works, { search: 'ana' })), ['1']);
        assert.deepEqual(ids(u.filterWorks(works, { search: 'bright' })), ['2']);
        assert.deepEqual(ids(u.filterWorks(works, { search: 'accion' })), ['3']);
    });
    it('filtra por estados agrupados', () => {
        assert.deepEqual(ids(u.filterWorks(works, { status: 'active' })), ['1']);
        assert.deepEqual(ids(u.filterWorks(works, { status: 'plan' })), ['2']);
        assert.deepEqual(ids(u.filterWorks(works, { status: 'terminado' })), ['3']);
    });
    it('filtra por BL, favoritos, spicy, tipo y valoración mínima', () => {
        assert.deepEqual(ids(u.filterWorks(works, { bl: true })), ['1']);
        assert.deepEqual(ids(u.filterWorks(works, { fav: true })), ['2']);
        assert.deepEqual(ids(u.filterWorks(works, { spicy: '3' })), ['1']);
        assert.deepEqual(ids(u.filterWorks(works, { type: 'anime' })), ['3']);
        assert.deepEqual(ids(u.filterWorks(works, { minRating: 4 })), ['1', '2']);
    });
    it('ordena sin modificar la lista original', () => {
        assert.deepEqual(ids(u.sortWorks(works, 'title')), ['2', '1', '3']);
        assert.deepEqual(ids(u.sortWorks(works, 'rating')), ['2', '1', '3']);
        assert.deepEqual(ids(u.sortWorks(works, 'recent')), ['2', '3', '1']);
        assert.deepEqual(ids(works), ['1', '2', '3']);
    });
});

describe('tagCounts', () => {
    it('cuenta etiquetas sin distinguir mayúsculas', () => {
        const counts = u.tagCounts([{ tags: 'BL, Drama' }, { tags: 'bl' }, {}]);
        assert.deepEqual(counts, [['bl', 2], ['drama', 1]]);
    });
});

describe('getAirDay y estimateMinutes', () => {
    it('lee el día de emisión o null', () => {
        assert.equal(u.getAirDay({ airDay: '0' }), 0);
        assert.equal(u.getAirDay({ airDay: '' }), null);
        assert.equal(u.getAirDay({}), null);
    });
    it('estima minutos según el tipo', () => {
        assert.equal(u.estimateMinutes({ type: 'anime', progress: 2 }), 46);
        assert.equal(u.estimateMinutes({ type: 'series', seriesType: 'Película', status: 'terminado' }), 120);
        assert.equal(u.estimateMinutes({ type: 'series', progress: 0 }), 0);
    });
});

describe('img', () => {
    it('usa la ilustración de relleno y escapa los atributos', () => {
        const html = u.img('', 'book', '"><b>');
        assert.match(html, /data-ph="book"/);
        assert.match(html, /src="data:image\/svg\+xml/);
        assert.doesNotMatch(html, /"><b>/);
        assert.doesNotMatch(html, /onerror/);
    });
});
