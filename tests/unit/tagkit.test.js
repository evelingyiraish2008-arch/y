'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { translateTagName, catalogSuggest, catalogGroups, TAG_CATALOG } = require('../../tagkit.js');
Object.assign(global, require('../../tagkit.js'));
const meta = require('../../metadata.js');

test('traduce las etiquetas de las fuentes al español (y deja lo desconocido en minúsculas)', () => {
    assert.equal(translateTagName('Enemies to Lovers'), 'enemigos a amantes');
    assert.equal(translateTagName("Boys' Love"), 'BL');
    assert.equal(translateTagName('Age Gap'), 'diferencia de edad');
    assert.equal(translateTagName('Something New'), 'something new');
});
test('el catálogo no repite etiquetas dentro de un mismo grupo y todas están en minúsculas o son siglas', () => {
    TAG_CATALOG.forEach(g => assert.equal(new Set(g.tags).size, g.tags.length, g.group));
});
test('sugerencias: típicas de BL, por país y sin repetir las que ya tiene', () => {
    const bl = catalogSuggest({ bl: true, country: 'Tailandia' }, { own: ['slow burn'] });
    assert.ok(bl.includes('BL tailandés'));
    assert.ok(!bl.includes('slow burn'));
    assert.ok(!catalogSuggest({ bl: false, country: 'Tailandia' }).includes('BL tailandés'));
    assert.ok(catalogSuggest({ bl: true }, { limit: 5 }).length <= 5);
});
test('autocompletar: lo que escribe, sin tildes y por palabra', () => {
    const r = catalogSuggest({ bl: true }, { typed: 'enem' });
    assert.equal(r[0], 'enemigos a amantes');
    assert.ok(catalogSuggest({}, { typed: 'amor' }).includes('amor prohibido'));
    assert.ok(catalogSuggest({}, { typed: 'angus' }).includes('angustia'));
    assert.deepEqual(catalogSuggest({}, { typed: 'zzzz' }), []);
});
test('grupos: quita lo que ya tiene y los grupos vacíos', () => {
    const all = catalogGroups([]);
    assert.equal(all.length, TAG_CATALOG.length);
    assert.ok(!catalogGroups(['Slow Burn'])[0].tags.includes('slow burn'));
});
test('las fuentes traen más etiquetas, ya en español', () => {
    const j = { data: { Page: { media: [{ id: 1, title: { romaji: 'Given' }, genres: ['Romance', 'Music'], tags: [{ name: 'Age Gap', rank: 60 }, { name: 'Boys Love', rank: 90 }, { name: 'Spoilery', rank: 80, isGeneralSpoiler: true }, { name: 'Low', rank: 20 }] }] } } };
    const [r] = meta.parseAniList(j, 'anime');
    assert.match(r.tags, /diferencia de edad/);
    assert.match(r.tags, /BL/);
    assert.doesNotMatch(r.tags, /spoilery|low/);
    assert.equal(r.bl, true);
    const k = meta.parseTmdbKeywords({ results: [{ name: 'Love Triangle' }, { name: 'college' }] });
    assert.deepEqual(k, ['triángulo amoroso', 'universidad']);
    assert.equal(meta.joinTags('BL, drama', ['drama', 'universidad']), 'BL, drama, universidad');
    const jk = meta.parseJikan({ data: [{ mal_id: 1, title: 'X', genres: [{ name: 'Drama' }], themes: [{ name: 'Music' }], demographics: [{ name: 'Josei' }] }] });
    assert.match(jk[0].tags, /drama.*música.*josei/);
});
