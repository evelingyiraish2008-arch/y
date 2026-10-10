'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { centerCrop, imagePlan, coverScale, clampPan, cropOutputSize, looksLikeImageUrl, imageUrlProblem, bannerMode, bannerEntries } = require('../../mediakit.js');

test('centerCrop: recorta por el centro con la proporción pedida', () => {
    assert.deepEqual(centerCrop(1600, 400, 3), { sx: 200, sy: 0, sw: 1200, sh: 400 }); // más ancha: se quitan los lados
    assert.deepEqual(centerCrop(800, 1200, 3), { sx: 0, sy: 467, sw: 800, sh: 267 }); // vertical: franja central
    assert.deepEqual(centerCrop(300, 300, 1), { sx: 0, sy: 0, sw: 300, sh: 300 });
});

test('imagePlan: recorta lo que no es 3:1, reduce a 1200 y nunca amplía', () => {
    const vertical = imagePlan(1000, 1500);
    assert.equal(vertical.cropped, true);
    assert.deepEqual([vertical.outW, vertical.outH], [1000, 333]);
    const big = imagePlan(3600, 1200);
    assert.equal(big.cropped, false);
    assert.deepEqual([big.outW, big.outH], [1200, 400]);
    const small = imagePlan(600, 200);
    assert.deepEqual([small.outW, small.outH, small.small], [600, 200, true]); // se acepta tal cual
    const almost = imagePlan(1240, 400); // 3,1:1 está dentro de la tolerancia: no se recorta
    assert.equal(almost.cropped, false);
    const avatar = imagePlan(800, 600, { aspect: 1, maxW: 400 });
    assert.deepEqual([avatar.crop.sx, avatar.crop.sw, avatar.outW, avatar.outH], [100, 600, 400, 400]);
});

test('editor: el zoom 1 cubre el marco y el desplazamiento nunca deja huecos', () => {
    assert.equal(coverScale(2000, 1000, 600, 200), 0.3);
    assert.equal(coverScale(1000, 2000, 600, 200, 90), 0.3); // girada 90° se comporta como apaisada
    const st = { zoom: 1, x: 999, y: -999, rot: 0 };
    const c = clampPan(st, 2000, 1000, 600, 200); // 600×300 visible en un marco de 600×200
    assert.deepEqual([c.x, c.y], [0, -50]);
    const z = clampPan({ ...st, zoom: 2 }, 2000, 1000, 600, 200);
    assert.deepEqual([z.x, z.y], [300, -200]);
});

test('editor: el tamaño final es el trozo elegido, hasta el máximo', () => {
    assert.deepEqual(cropOutputSize({ zoom: 1, rot: 0 }, 3000, 1000, 600, 200, 1200), [1200, 400]);
    assert.deepEqual(cropOutputSize({ zoom: 4, rot: 0 }, 3000, 1000, 600, 200, 1200), [750, 250]);
    assert.deepEqual(cropOutputSize({ zoom: 1, rot: 0 }, 900, 300, 600, 200, 1200), [900, 300]);
});

test('enlaces: reconoce imágenes y explica los errores típicos', () => {
    assert.equal(looksLikeImageUrl('https://x.com/a/foto.JPG?w=2'), true);
    assert.equal(looksLikeImageUrl('https://i.pinimg.com/originals/ab/cd/123'), true);
    assert.equal(looksLikeImageUrl('https://upload.wikimedia.org/wiki/x'), true);
    assert.equal(looksLikeImageUrl('https://example.com/pagina'), false);
    assert.equal(looksLikeImageUrl('ftp://x.com/a.jpg'), false);
    assert.equal(imageUrlProblem(''), 'Pega un enlace');
    assert.equal(imageUrlProblem('hola'), 'La URL no apunta a una imagen');
    assert.match(imageUrlProblem('https://www.pinterest.com/pin/12345/'), /enlace del pin/);
    assert.match(imageUrlProblem('https://pin.it/abc'), /enlace del pin/);
    assert.equal(imageUrlProblem('https://i.pinimg.com/736x/a.jpg'), '');
});

test('cabeceras: banner, si no la imagen difuminada y si no el degradado', () => {
    assert.equal(bannerMode('b.jpg', 'c.jpg'), 'banner');
    assert.equal(bannerMode('', 'c.jpg'), 'blur');
    assert.equal(bannerMode('', ''), 'pattern');
});

test('bannerEntries: lista los banners de todo (también el del perfil)', () => {
    const data = { works: [{ id: 'w', banner: 'idb:1' }, { id: 'x' }], persons: [{ id: 'p', banner: 'https://a/b.jpg' }], couples: [], collections: [{ id: 'c', banner: 'idb:2' }], settings: { profileBanner: 'idb:3' } };
    assert.deepEqual(bannerEntries(data).map(e => [e.kind, e.ref]), [['works', 'idb:1'], ['persons', 'https://a/b.jpg'], ['collections', 'idb:2'], ['profile', 'idb:3']]);
});

test('buscar en internet: enlaces de cada buscador y búsquedas sugeridas', () => {
    const { webSearchLinks, webSuggestions } = require('../../mediakit.js');
    const links = webSearchLinks('The Untamed BL', 'works');
    assert.deepEqual(links.filter(l => l.main).map(l => l.id), ['google', 'pinterest']);
    assert.equal(links.find(l => l.id === 'google').url, 'https://www.google.com/search?q=The%20Untamed%20BL');
    assert.equal(links.find(l => l.id === 'pinterest').url, 'https://www.pinterest.com/search/pins/?q=The%20Untamed%20BL');
    assert.equal(links.find(l => l.id === 'googleimg').url, 'https://www.google.com/search?tbm=isch&q=The%20Untamed%20BL');
    assert.ok(links.some(l => l.id === 'mydramalist'));
    assert.ok(!webSearchLinks('Dune', 'collections').some(l => l.id === 'mydramalist')); // solo para obras, personas y parejas
    assert.deepEqual(webSearchLinks('  ', 'works'), []);
    assert.equal(webSearchLinks('a&b=c#d', 'works')[0].url, 'https://www.google.com/search?q=a%26b%3Dc%23d'); // lo escrito no rompe la dirección
    const w = webSuggestions({ name: 'Only Friends', kind: 'works', type: 'series', bl: true });
    assert.deepEqual(w.map(x => x.query), ['Only Friends BL', 'Only Friends reparto', 'Only Friends director', 'Only Friends personajes actores', 'Only Friends sinopsis', 'Only Friends tags géneros', 'Only Friends dónde ver', 'Only Friends wiki']);
    assert.equal(webSuggestions({ name: 'Dune', type: 'book' })[1].query, 'Dune autor');
    assert.equal(webSuggestions({ name: 'Solo Leveling', type: 'manhwa' })[1].query, 'Solo Leveling dónde leer');
    assert.equal(webSuggestions({ name: 'Pooh Krittin', kind: 'persons' })[2].query, 'Pooh Krittin nombre real');
    assert.equal(webSuggestions({ name: 'PoohPavel', kind: 'couples' })[1].query, 'PoohPavel dramas juntos');
    assert.deepEqual(webSuggestions({ name: '' }), []);
});

test('imágenes de otras webs: servicio para poder recortarlas y fuentes más actuales', () => {
    const mk = require('../../mediakit.js');
    assert.equal(mk.corsProxyUrl('https://img.test/a b/foto.jpg?x=1&y=2'), 'https://images.weserv.nl/?url=img.test%2Fa%20b%2Ffoto.jpg%3Fx%3D1%26y%3D2&w=2400&we&output=jpg&q=90');
    assert.equal(mk.corsProxyUrl('https://images.weserv.nl/?url=x'), ''); // no se vuelve a pasar por el servicio
    assert.equal(mk.corsProxyUrl('blob:abc'), '');
    assert.equal(mk.corsProxyUrl(''), '');
    const r = mk.imgParseOpenverse({ results: [{ url: 'https://f/1.jpg', thumbnail: 'https://t/1.jpg', width: 1600, height: 900, title: 'Concierto', foreign_landing_url: 'https://flickr/1' }, { title: 'sin url' }] });
    assert.deepEqual(r.map(x => [x.src, x.thumb, x.o, x.origin, x.page]), [['https://f/1.jpg', 'https://t/1.jpg', 'horizontal', 'openverse', 'https://flickr/1']]);
    assert.ok(mk.DEFAULT_SOURCE_ORDER.includes('openverse') && mk.DEFAULT_SOURCE_ORDER.includes('commonsnew'));
    assert.ok(mk.activeSources({}, 'photo').includes('commonsnew'));
    assert.ok(!mk.activeSources({}, 'photo').includes('google')); // sin clave no
    assert.equal(mk.suggestQueries({ name: 'Perth', kind: 'persons', year: 2026 })[1], 'Perth 2026');
});
