'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
Object.assign(global, require('../../utils.js'));
const k = require('../../watchkit.js');

describe('enlaces para ver o leer', () => {
    it('normaliza direcciones y rechaza lo que no es una web', () => {
        assert.equal(k.normalizeWatchUrl('www.viki.com/tv/1c'), 'https://www.viki.com/tv/1c');
        assert.equal(k.normalizeWatchUrl('  https://doramasia.com/serie/x  '), 'https://doramasia.com/serie/x');
        assert.equal(k.normalizeWatchUrl('http://a.com/ver-{n}'), 'http://a.com/ver-{n}');
        assert.equal(k.normalizeWatchUrl('javascript:alert(1)'), '');
        assert.equal(k.normalizeWatchUrl('data:text/html,hola'), '');
        assert.equal(k.normalizeWatchUrl('ftp://a.com/x'), '');
        assert.equal(k.normalizeWatchUrl('hola'), '');
        assert.equal(k.normalizeWatchUrl(''), '');
    });
    it('reconoce la plataforma por la dirección y por el nombre escrito', () => {
        assert.equal(k.detectWatchPlatform('https://www.netflix.com/title/81').id, 'netflix');
        assert.equal(k.detectWatchPlatform('https://m.webtoons.com/es/x').id, 'webtoon');
        assert.equal(k.detectWatchPlatform('https://doramasia.com/x'), null);
        assert.equal(k.platformByName('netflix').id, 'netflix');
        assert.equal(k.platformByName('Prime Video').id, 'prime');
        assert.equal(k.platformByName('Disney+').id, 'disney');
        assert.equal(k.platformByName('Prime').id, 'prime');
        assert.equal(k.platformByName('Mi canal'), null);
        assert.deepEqual(k.watchPlatformsFor('series').map(p => p.id).slice(0, 2), ['netflix', 'viki']);
        assert.ok(k.watchPlatformsFor('manhwa').some(p => p.id === 'webtoon'));
        assert.ok(!k.watchPlatformsFor('book').some(p => p.id === 'netflix'));
    });
    it('el nombre mostrado: el de la plataforma, el tuyo o el de la web', () => {
        assert.equal(k.watchLinkName({ platform: 'viki', url: 'https://viki.com/x' }), 'Viki');
        assert.equal(k.watchLinkName({ url: 'https://www.doramasia.com/x' }), 'doramasia.com');
        assert.equal(k.watchLinkName({ url: 'https://doramasia.com/x', label: 'Doramasia' }), 'Doramasia');
        assert.equal(k.watchLinkIcon({ url: 'https://doramasia.com/x' }), '🌐');
    });
    it('sin dirección busca el título en la plataforma', () => {
        assert.equal(k.watchSearchUrl('netflix', 'The Untamed'), 'https://www.netflix.com/search?q=The%20Untamed');
        assert.equal(k.watchSearchUrl('viki', 'Only Friends'), 'https://www.google.com/search?q=Only%20Friends+site%3Aviki.com');
        assert.equal(k.watchSearchUrl('nada', 'x'), '');
    });
    it('{n} y {t} llevan al próximo episodio y a la temporada actual', () => {
        const plain = { title: 'X', progress: 6, season: 2 };
        assert.deepEqual(k.watchPosition(plain), { n: 7, t: 2 });
        const seasons = { title: 'X', seasonsList: [{ number: 1, episodes: 12, progress: 12 }, { number: 2, episodes: 10, progress: 3 }] };
        assert.deepEqual(k.watchPosition(seasons), { n: 4, t: 2 });
        const done = { title: 'X', seasonsList: [{ number: 1, episodes: 12, progress: 12 }] };
        assert.deepEqual(k.watchPosition(done), { n: 12, t: 1 }); // no se pasa del último
        assert.equal(k.buildWatchUrl({ url: 'https://s.com/t{t}/ep-{n}' }, seasons), 'https://s.com/t2/ep-4');
        assert.equal(k.buildWatchUrl({ platform: 'netflix' }, plain), 'https://www.netflix.com/search?q=X');
        assert.equal(k.hasPlaceholders('https://s.com/{n}'), true);
        assert.equal(k.hasPlaceholders('https://s.com/'), false);
    });
    it('crea, añade sin repetir y pone uno de primero', () => {
        let n = 0; const id = () => 'i' + (++n);
        const a = k.makeWatchLink({ platform: 'netflix' }, id);
        assert.deepEqual(a, { id: 'i1', platform: 'netflix' });
        const b = k.makeWatchLink({ url: 'doramasia.com/serie', label: ' Doramasia ' }, id);
        assert.deepEqual(b, { id: 'i2', url: 'https://doramasia.com/serie', label: 'Doramasia' });
        const c = k.makeWatchLink({ url: 'https://www.viki.com/tv/9' }, id);
        assert.equal(c.platform, 'viki'); // se reconoce sola
        assert.equal(k.makeWatchLink({ url: 'javascript:1' }, id), null);
        assert.equal(k.makeWatchLink({}, id), null);
        let list = k.addWatchLink([], a);
        list = k.addWatchLink(list, b);
        assert.equal(k.addWatchLink(list, { id: 'x', platform: 'netflix' }).length, 2); // repetido
        assert.deepEqual(k.makePrimary(list, 'i2').map(x => x.id), ['i2', 'i1']);
        assert.deepEqual(k.makePrimary(list, 'i1').map(x => x.id), ['i1', 'i2']);
    });
    it('disponibilidad por país de TMDB', () => {
        const json = { results: { ES: { link: 'https://tmdb/x', flatrate: [{ provider_name: 'Netflix' }, { provider_name: 'Amazon Prime Video' }], rent: [{ provider_name: 'Apple TV' }] }, MX: { flatrate: [] } } };
        assert.deepEqual(k.parseWatchProviders(json, 'ES'), { link: 'https://tmdb/x', flatrate: ['Netflix', 'Amazon Prime Video'], rent: ['Apple TV'], buy: [] });
        assert.equal(k.parseWatchProviders(json, 'AR'), null);
        assert.equal(k.platformFromProvider('Amazon Prime Video').id, 'prime');
        assert.equal(k.platformFromProvider('Disney Plus').id, 'disney');
        assert.equal(k.platformFromProvider('Canal raro'), null);
        assert.equal(k.defaultWatchCountry('es-MX'), 'MX');
        assert.equal(k.defaultWatchCountry('en-GB'), 'ES');
        assert.equal(k.defaultWatchCountry(''), 'ES');
    });
});
