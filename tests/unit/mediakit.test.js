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
