'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
Object.assign(global, require('../../utils.js'), require('../../history.js'));
const md = require('../../metadata.js');
Object.assign(global, md);
const ek = require('../../enrichkit.js');
const { needsTranslation } = require('../../translatekit.js');

const day = 86400000, now = 1_800_000_000_000;
const full = { tags: 'a, b, c, d, e', synopsis: 'Una historia muy larga que ya está en español para todos.', country: 'Japón', year: 2020, genre: 'Drama' };

test('qué le falta a una obra', () => {
    assert.deepEqual(ek.enrichGaps({ type: 'series', title: 'X' }), ['tags', 'synopsis', 'country', 'year', 'genre']);
    assert.deepEqual(ek.enrichGaps({ ...full, type: 'anime' }, needsTranslation), []);
    assert.deepEqual(ek.enrichGaps({ ...full, type: 'anime', synopsis: 'Two young men fall in love while they study at the university for the world.' }, needsTranslation), ['translate']);
    assert.ok(!ek.enrichGaps({ type: 'book', title: 'L' }).includes('country')); // los libros no piden país
});
test('candidatas: con huecos, sin revisar hace poco, las más recientes primero y por tandas', () => {
    const works = [
        { id: 'ok', title: 'Completa', type: 'anime', ...full },
        { id: 'a', title: 'A', type: 'series', createdAt: 1 },
        { id: 'b', title: 'B', type: 'series', createdAt: 5 },
        { id: 'rev', title: 'Revisada', type: 'series', enrichedAt: now - 2 * day },
        { id: 'old', title: 'Vieja', type: 'series', enrichedAt: now - 40 * day, createdAt: 3 },
        { id: 'bin', title: 'Papelera', type: 'series', trashedAt: 1 }
    ];
    assert.deepEqual(ek.enrichCandidates(works, { now }).map(w => w.id), ['b', 'old', 'a']);
    assert.equal(ek.enrichCandidates(works, { now, limit: 1 }).length, 1);
    assert.equal(ek.enrichPending(works, { now }), 3);
});
test('elige solo un resultado que sea claramente la misma obra', () => {
    const w = { title: 'Only Friends', year: 2023 };
    const res = [{ title: 'Only Friend', year: 1999 }, { title: 'Only Friends', year: 2023, id: 1 }, { title: 'Friends', year: 2023 }];
    assert.equal(ek.pickBestMatch(w, res).id, 1);
    assert.equal(ek.pickBestMatch({ title: 'Sky' }, [{ title: 'Otra cosa distinta' }]), null);
    assert.equal(ek.pickBestMatch({ title: 'Dune', year: 1965 }, [{ title: 'Dune', year: 2021 }]), null); // otro año: otra obra
    assert.equal(ek.pickBestMatch({ title: 'Given' }, [{ title: 'Gifted', altTitle: 'Given' }]).title, 'Gifted'); // por título alternativo
    assert.equal(ek.pickBestMatch(w, []), null);
});
test('el parche solo añade: nada de pisar, ni título, ni tipo, ni BL', () => {
    const w = { title: 'Mi Serie', type: 'series', seriesType: 'Serie', tags: 'BL, mis cosas', synopsis: 'Mi sinopsis', progress: 3, year: 2021 };
    const meta = { title: 'Otro título', seriesType: 'Película', bl: true, year: 1990, synopsis: 'Otra', country: 'Tailandia', genre: 'Drama', tags: 'bl, universidad, slow burn', seasons: 3, totalEpisodes: 12 };
    const patch = ek.enrichPatch(w, meta);
    assert.deepEqual(patch, { country: 'Tailandia', genre: 'Drama', totalEpisodes: 12, tags: 'BL, mis cosas, universidad, slow burn' });
    // sin etiquetas nuevas no hay cambio de etiquetas
    assert.ok(!('tags' in ek.enrichPatch({ tags: 'a, b' }, { tags: 'A, B' })));
});
