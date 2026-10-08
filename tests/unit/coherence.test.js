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

describe('temporadas: dos porcentajes, qué falta y tiempo', () => {
    const w = () => ({ type: 'series', seasonsList: [{ number: 1, episodes: 12, progress: 12 }, { number: 2, episodes: 12, progress: 7 }, { number: 3, episodes: 10, progress: 0 }] });
    it('la temporada actual y la serie completa tienen cada una su porcentaje', () => {
        const sp = c.seasonProgress(w());
        assert.deepEqual([sp.number, sp.season.done, sp.season.total, sp.season.pct, sp.season.left], [2, 7, 12, 58, 5]);
        assert.deepEqual([sp.all.done, sp.all.total, sp.all.pct, sp.all.left], [19, 34, 56, 15]);
        assert.deepEqual([sp.finishedSeasons, sp.count, sp.next, sp.partial, sp.allDone], [1, 3, { number: 3, episodes: 10 }, false, false]);
        assert.equal(c.seasonProgress({ type: 'series' }), null);
    });
    it('avisa cuando falta poco, cuando terminas una temporada y al acabar la serie', () => {
        assert.equal(c.seasonHint(w()), 'Te faltan 5 eps para cerrar la temporada 2');
        const near = w(); near.seasonsList[1].progress = 10;
        assert.equal(c.seasonHint(near), '🏁 Te faltan 2 para cerrar la temporada 2');
        near.seasonsList[1].progress = 11;
        assert.equal(c.seasonHint(near), '🏁 Te falta 1 para cerrar la temporada 2');
        const done2 = w(); done2.seasonsList[1].progress = 12;
        assert.equal(c.seasonProgress(done2).index, 2); // pasa a la siguiente
        const last = w(); last.seasonsList = last.seasonsList.map(s => ({ ...s, progress: s.episodes }));
        assert.equal(c.seasonHint(last), '🎉 Serie completa');
        const finishedNotLast = { type: 'series', seasonsList: [{ number: 1, episodes: 2, progress: 2 }, { number: 2, episodes: 0, progress: 0 }] };
        assert.equal(c.seasonProgress(finishedNotLast).partial, true); // una temporada sin total: el de la serie es aproximado
    });
    it('el tiempo que falta usa la medida de la app y se escribe corto', () => {
        assert.equal(c.seasonTimeLeft(w()), 750); // 15 episodios × 50 min
        assert.equal(c.formatMinutes(750), '≈ 12 h');
        assert.equal(c.formatMinutes(95), '≈ 1 h 35 min');
        assert.equal(c.formatMinutes(45), '≈ 45 min');
        assert.equal(c.formatMinutes(2), '');
    });
    it('poner el progreso de una temporada recalcula la obra y no se pasa del total', () => {
        const x = w();
        assert.equal(c.setSeasonProgress(x, 2, 99), true);
        assert.deepEqual([x.seasonsList[2].progress, x.progress], [10, 12 + 7 + 10]);
        c.setSeasonProgress(x, 1, 0);
        assert.equal(x.progress, 22);
        assert.equal(c.setSeasonProgress(x, 7, 1), false);
    });
    it('reparte el progreso que ya llevabas de la primera temporada a la última', () => {
        const list = [{ number: 1, episodes: 12 }, { number: 2, episodes: 12 }, { number: 3, episodes: 10 }];
        assert.deepEqual(c.distributeProgress(list, 15).map(s => s.progress), [12, 3, 0]);
        assert.deepEqual(c.distributeProgress(list, 99).map(s => s.progress), [12, 12, 10]);
        assert.deepEqual(c.distributeProgress(list, 0).map(s => s.progress), [0, 0, 0]);
    });
});
