'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
Object.assign(global, require('../../utils.js'));
Object.assign(global, require('../../history.js'));
const c = require('../../coherence.js');

describe('etiquetas', () => {
    const works = () => [
        { id: '1', tags: 'BL, Drama', updatedAt: 50 },
        { id: '2', tags: 'bl, fantasia', createdAt: 80 },
        { id: '3', tags: 'Fantasía, drama' }
    ];
    it('tagStats cuenta sin distinguir mayúsculas y recuerda el último uso', () => {
        const s = c.tagStats(works());
        assert.deepEqual(s.map(t => [t.label, t.count]), [['BL', 2], ['Drama', 2], ['fantasia', 1], ['Fantasía', 1]]);
        assert.equal(s.find(t => t.key === 'bl').lastUsed, 80);
    });
    it('renombrar une con la existente sin duplicar', () => {
        const w = works();
        const changed = c.renameTag(w, 'fantasia', 'Fantasía');
        assert.equal(changed.length, 1);
        assert.equal(w[1].tags, 'bl, Fantasía');
        c.renameTag(w, 'drama', 'Fantasía');
        assert.equal(w[2].tags, 'Fantasía'); // ya la tenía: no se repite
    });
    it('quitar una etiqueta de todas las obras', () => {
        const w = works();
        assert.equal(c.removeTag(w, 'bl').length, 2);
        assert.equal(w[0].tags, 'Drama');
    });
    it('¿quisiste decir…?', () => {
        assert.deepEqual(c.suggestTagFixes('fantsía, BL, nuevo', ['Fantasía', 'BL']).map(x => [x.typed, x.suggestion]), [['fantsía', 'Fantasía']]);
    });
    it('sugiere etiquetas de obras del mismo autor', () => {
        const all = [{ id: 'a', type: 'book', author: 'Liu Cixin', tags: 'ciencia ficción, china' }, { id: 'b', type: 'book', author: 'Otro', tags: 'romance' }];
        assert.deepEqual(c.suggestTagsFor({ id: 'n', type: 'book', author: 'liu cixin', tags: 'china' }, all), ['ciencia ficción']);
    });
});

describe('parejas vinculadas', () => {
    const persons = [{ id: 'a', name: 'Park Seo Ham' }, { id: 'b', name: 'Park Jae Chan' }, { id: 'x', name: 'Otro' }];
    const works = [
        { id: '1', actors: 'Park Seo Ham, Park Jae Chan', rating: 5 },
        { id: '2', actors: 'Park Seo Ham', rating: 3 },
        { id: '3', actors: 'park jae chan, PARK SEO HAM', rating: 4 }
    ];
    it('cuenta las obras en las que salen los dos y las marcadas a mano', () => {
        const s = c.coupleSummary({ personA: 'a', personB: 'b', workIds: ['2'] }, works, persons);
        assert.deepEqual(s.works.map(w => w.id), ['1', '2', '3']);
        assert.equal(s.avgRating, 4);
        assert.equal(s.linked, true);
    });
    it('sin vincular usa el número escrito a mano', () => {
        assert.equal(c.coupleSummary({ works: 7 }, works, persons).count, 7);
    });
    it('parejas relacionadas y ranking', () => {
        const couples = [{ id: 'c1', personA: 'a', personB: 'b', rating: 1 }, { id: 'c2', personA: 'a', personB: 'x', rating: 4.8 }, { id: 'c3', rating: 2 }];
        assert.deepEqual(c.relatedCouples(couples[0], couples).map(x => x.id), ['c2']);
        assert.deepEqual(c.couplesForPerson('a', couples).map(x => x.id), ['c1', 'c2']);
        assert.deepEqual(c.rankCouples(couples, works, persons).map(r => r.couple.id), ['c2', 'c1', 'c3']);
    });
});

describe('temporadas', () => {
    const w = () => ({ type: 'anime', seasonsList: [{ episodes: 12, progress: 12, rating: 4 }, { episodes: 12, progress: 3, rating: 5 }, { episodes: 10, progress: 0 }] });
    it('suma total y progreso, media y temporada actual', () => {
        assert.deepEqual(c.seasonTotals(w()), { total: 34, progress: 15, avgRating: 4.5, current: 1 });
        assert.equal(c.seasonLabel(w()), 'T2 3/12');
    });
    it('avanzar llena la temporada actual y pasa a la siguiente', () => {
        const x = w();
        x.seasonsList[1].progress = 11;
        assert.deepEqual(c.advanceSeason(x, 1), { index: 1, finishedSeason: true });
        assert.equal(x.progress, 24);
        assert.equal(x.totalEpisodes, 34);
        assert.equal(x.seasons, 3);
        c.advanceSeason(x, 1);
        assert.equal(x.seasonsList[2].progress, 1);
        c.advanceSeason(x, -1);
        c.advanceSeason(x, -1);
        assert.deepEqual(x.seasonsList.map(s => s.progress), [12, 11, 0]);
    });
    it('estado de cada temporada', () => {
        assert.deepEqual(w().seasonsList.map(c.seasonStatus), ['terminado', 'en curso', 'pendiente']);
    });
});

describe('notas y re-visionados', () => {
    it('reseñas: media de los criterios valorados', () => {
        assert.equal(c.reviewAverage({ historia: 5, personajes: 4, final: 0 }), 4.5);
        assert.equal(c.reviewAverage(undefined), 0);
    });
    it('notas de una obra: fijadas primero y luego las más nuevas; filtro por tipo', () => {
        const notes = [{ id: 'a', workId: 'w', createdAt: 1 }, { id: 'b', workId: 'w', createdAt: 3, type: 'teoria' }, { id: 'c', workId: 'w', createdAt: 2, pinned: true }, { id: 'd', workId: 'x', createdAt: 9 }];
        assert.deepEqual(c.notesOfWork(notes, 'w').map(n => n.id), ['c', 'b', 'a']);
        assert.deepEqual(c.notesOfWork(notes, 'w', 'teoria').map(n => n.id), ['b']);
        assert.deepEqual(c.notesOfWork(notes, 'w', 'comentario').map(n => n.id), ['c', 'a']); // sin tipo = comentario
    });
    it('relecturas: insignia, veces terminada y más repetidas', () => {
        const w = { title: 'A', status: 'terminado' };
        assert.equal(c.rereadBadge(w), '');
        w.rereading = true;
        assert.equal(c.rereadBadge(w), '🔁 2ª vez');
        c.addReread(w, { date: '2026-10-01', rating: 5 });
        assert.equal(w.rereading, false);
        assert.equal(c.rereadBadge(w), '🔁 ×2');
        assert.equal(c.timesCompleted(w), 2);
        assert.deepEqual(c.mostRevisited([w, { title: 'B' }]).map(x => x.times), [2]);
    });
});
