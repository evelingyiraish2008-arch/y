'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
Object.assign(global, require('../../utils.js'));
Object.assign(global, require('../../history.js'));
const k = require('../../peoplekit.js');
const m = require('../../mediakit.js');

const persons = () => [
    { id: 'p1', name: 'Xiao Zhan', type: 'actor' },
    { id: 'p2', name: 'Wang Yibo', type: 'actor', roles: ['director'] },
    { id: 'p3', name: 'Mo Xiang Tong Xiu', type: 'author', aliases: 'MXTX, 墨香铜臭' },
    { id: 'p4', name: 'Xiao Zhen', type: 'actor' }
];

test('matchPersons: exacto, parciales y nombres parecidos', () => {
    const r = k.matchPersons('xiao', persons());
    assert.equal(r.exact, null);
    assert.deepEqual(r.partial.map(p => p.id), ['p1', 'p4']);
    const ex = k.matchPersons('MXTX', persons());
    assert.equal(ex.exact.id, 'p3'); // por su seudónimo
    const typo = k.matchPersons('Wang Yibu', persons());
    assert.deepEqual(typo.similar.map(p => p.id), ['p2']);
    assert.deepEqual(k.matchPersons('Zhan Xiao', persons()).similar.map(p => p.id), ['p1']); // mismo nombre en otro orden
    assert.deepEqual(k.matchPersons('', persons()), { exact: null, partial: [], similar: [] });
});

test('nombres: parecidos, separar listas pegadas e iniciales', () => {
    assert.equal(k.namesSimilar('Xiao Zhan', 'Xiao Zhen'), true);
    assert.equal(k.namesSimilar('Xiao Zhan', 'Wang Yibo'), false);
    assert.equal(k.namesSimilar('Ana', 'Ana'), false); // iguales no son "parecidos"
    assert.deepEqual(k.splitNames('Xiao Zhan, Wang Yibo y Liu Haikuan\nMeng Ziyi; Song Jiyang & Zhu Zanjin'), ['Xiao Zhan', 'Wang Yibo', 'Liu Haikuan', 'Meng Ziyi', 'Song Jiyang', 'Zhu Zanjin']);
    assert.equal(k.initials('Xiao Zhan'), 'XZ');
    assert.equal(k.initials('Chugong'), 'C');
    assert.deepEqual(k.personRoles(persons()[1]), ['actor', 'director']);
    assert.deepEqual(k.similarPersons('xiao zhan', persons()).map(p => p.id), ['p1', 'p4']);
});

test('obras de una persona: por id, por nombre y por seudónimo', () => {
    const works = [
        { id: 'w1', actors: 'Xiao Zhan, Wang Yibo', personIds: ['p1', 'p2'] },
        { id: 'w2', author: 'MXTX' },
        { id: 'w3', actors: 'Otro nombre', personIds: ['p1'] }, // vinculada aunque el nombre cambió
        { id: 'w4', directors: 'Wang Yibo' }
    ];
    const [p1, p2, p3] = persons();
    assert.deepEqual(k.worksOfPerson(p1, works).map(w => w.id), ['w1', 'w3']);
    assert.deepEqual(k.worksOfPerson(p2, works).map(w => w.id), ['w1', 'w4']);
    assert.deepEqual(k.worksOfPerson(p3, works).map(w => w.id), ['w2']);
    assert.deepEqual(k.linkPersonIds({ actors: 'Xiao Zhan, Nadie', author: 'MXTX' }, persons()), ['p3', 'p1']);
});

test('reparto con personajes, renombrar y quitar de las obras', () => {
    const w = { id: 'w1', actors: 'Xiao Zhan, Wang Yibo, Liu Haikuan', directors: 'Wang Yibo', personIds: ['p1', 'p2'], characters: [{ id: 'c1', name: 'Wei Wuxian', personId: 'p1' }] };
    const cast = k.castOf(w, persons());
    assert.deepEqual(cast.map(c => [c.name, c.role, c.person && c.person.id, c.characters]), [
        ['Xiao Zhan', 'actor', 'p1', ['Wei Wuxian']], ['Wang Yibo', 'actor', 'p2', []], ['Liu Haikuan', 'actor', null, []], ['Wang Yibo', 'director', 'p2', []]
    ]);
    const works = [w, { id: 'w2', actors: 'Wang Yibo' }];
    assert.equal(k.renamePersonInWorks(works, persons()[1], 'Wang Yibo', 'Yibo Wang'), 2);
    assert.equal(w.actors, 'Xiao Zhan, Yibo Wang, Liu Haikuan');
    assert.equal(w.directors, 'Yibo Wang');
    const changed = k.removePersonFromWorks(works, persons()[0]);
    assert.deepEqual(changed.map(x => x.id), ['w1']);
    assert.equal(w.actors, 'Yibo Wang, Liu Haikuan');
    assert.deepEqual(w.personIds, ['p2']);
    assert.equal(w.characters[0].personId, undefined); // el personaje se queda, sin intérprete
});

test('huérfanas: solo las creadas desde una obra que ya no aparecen en nada', () => {
    const data = {
        persons: [{ id: 'a', name: 'Sin obra', autoCreated: true }, { id: 'b', name: 'A mano' }, { id: 'c', name: 'En pareja', autoCreated: true }, { id: 'd', name: 'Con obra', autoCreated: true }, { id: 'e', name: 'Personaje', autoCreated: true }],
        works: [{ id: 'w', actors: 'Con obra', characters: [{ name: 'X', personId: 'e' }] }],
        couples: [{ id: 'k', personA: 'c', personB: 'b' }]
    };
    assert.deepEqual(k.orphanPersons(data).map(p => p.id), ['a']);
    assert.deepEqual(k.allCharacters(data.works, data.persons).map(c => [c.name, c.person.id]), [['X', 'e']]);
});

test('fuentes de imágenes: activas según ajustes y claves', () => {
    assert.deepEqual(m.activeSources({}, 'banner'), ['anilist', 'wikipedia', 'commons', 'commonsnew', 'openverse']);
    assert.deepEqual(m.activeSources({ tmdbKey: 'x' }, 'photo'), ['anilist', 'tmdb', 'wikipedia', 'commons', 'commonsnew', 'openverse', 'jikan']);
    assert.deepEqual(m.activeSources({ imageSourceOrder: ['commons'], imageSourcesOff: ['anilist'], googleKey: 'k' }, 'banner'), ['commons', 'wikipedia', 'commonsnew', 'openverse']); // Google también necesita el cx
    assert.deepEqual(m.activeSources({ googleKey: 'k', googleCx: 'c' }, 'poster').slice(-1), ['google']);
});

test('fuentes de imágenes: lee las respuestas de cada web', () => {
    const commons = m.imgParseCommons({ query: { pages: { 2: { index: 2, title: 'File:B.png', imageinfo: [{ url: 'u2', thumburl: 't2', width: 300, height: 900, mime: 'image/png', descriptionurl: 'd2' }] }, 1: { index: 1, title: 'File:A.jpg', imageinfo: [{ url: 'u1', thumburl: 't1', width: 1200, height: 400, mime: 'image/jpeg', descriptionurl: 'd1' }] }, 3: { index: 3, title: 'File:C.svg', imageinfo: [{ url: 'u3', mime: 'image/svg+xml' }] } } } });
    assert.deepEqual(commons.map(r => [r.src, r.thumb, r.o, r.title, r.page]), [['u1', 't1', 'horizontal', 'A', 'd1'], ['u2', 't2', 'vertical', 'B', 'd2']]);
    const wiki = m.imgParseWikiPages({ query: { pages: { 9: { index: 1, title: 'Xiao Zhan', original: { source: 'https://up/x.jpg', width: 800, height: 800 }, thumbnail: { source: 'https://up/x-500.jpg' } }, 8: { index: 2, title: 'Logo', original: { source: 'https://up/l.svg' } } } } }, 'es');
    assert.deepEqual(wiki.map(r => [r.src, r.o, r.page]), [['https://up/x.jpg', 'square', 'https://es.wikipedia.org/wiki/Xiao_Zhan']]);
    const ani = m.imgParseAnilist({ data: { Page: { media: [{ title: { romaji: 'Given' }, bannerImage: 'b.jpg', coverImage: { extraLarge: 'c.jpg', large: 'cl.jpg' }, siteUrl: 's' }] } } }, 'banner');
    assert.deepEqual(ani.map(r => r.src), ['b.jpg']); // para un banner, solo el banner
    const staff = m.imgParseAnilist({ data: { Page: { staff: [{ name: { full: 'Xiao Zhan' }, image: { large: 'x.png', medium: 'xm.png' } }, { name: { full: 'Nadie' }, image: { large: 'https://s4.anilist.co/default.jpg' } }] } } }, 'photo');
    assert.deepEqual(staff.map(r => [r.src, r.title]), [['x.png', 'Xiao Zhan']]);
    const tmdb = m.imgParseTmdb({ results: [{ id: 1, media_type: 'tv', name: 'The Untamed', poster_path: '/p.jpg', backdrop_path: '/b.jpg' }] }, 'banner');
    assert.deepEqual(tmdb.map(r => r.src), ['https://image.tmdb.org/t/p/w1280/b.jpg']);
    assert.equal(m.imgParseJikan({ data: [{ name: 'X', images: { jpg: { image_url: 'https://cdn/questionmark.gif' } } }, { name: 'Y', url: 'u', images: { jpg: { image_url: 'y.jpg' } } }] }).length, 1);
    assert.equal(m.imgParseOpenLibrary({ docs: [{ title: 'Dune', cover_i: 7, key: '/works/1' }, { title: 'Sin' }] })[0].src, 'https://covers.openlibrary.org/b/id/7-L.jpg');
    assert.equal(m.imgParseGoogle({ items: [{ link: 'g.jpg', title: 'G', image: { thumbnailLink: 'gt', width: 10, height: 20, contextLink: 'ctx' } }] })[0].o, 'vertical');
});

test('búsquedas sugeridas, enlaces de búsqueda y mezcla de fuentes', () => {
    assert.deepEqual(m.suggestQueries({ name: 'Given', people: ['Yano Shogo'] }), ['Given', 'Given poster', 'Given wallpaper', 'Given aesthetic', 'Given scenes', 'Given banner', 'Yano Shogo']);
    assert.deepEqual(m.suggestQueries({ name: 'Dune', type: 'book' }), ['Dune', 'Dune cover', 'Dune fanart', 'Dune aesthetic']);
    assert.equal(m.suggestQueries({ name: 'Xiao Zhan', kind: 'persons', year: 2026 })[1], 'Xiao Zhan 2026');
    assert.equal(m.suggestQueries({ name: 'Xiao Zhan', kind: 'persons' })[2], 'Xiao Zhan photoshoot');
    assert.equal(m.webSearchUrls('the untamed').pinterest, 'https://www.pinterest.com/search/pins/?q=the%20untamed');
    const mix = m.interleave([[{ src: 'a1' }, { src: 'a2' }], [{ src: 'b1' }, { src: 'a1' }]]);
    assert.deepEqual(mix.map(r => r.src), ['a1', 'b1', 'a2']);
    assert.deepEqual(m.filterOrientation([{ o: 'horizontal' }, { o: 'vertical' }, { o: '' }], 'vertical').length, 2);
});

test('fotos encontradas: solo si el nombre coincide', () => {
    assert.equal(k.titleMatchesName('Xiao Zhan (actor)', 'Xiao Zhan'), true);
    assert.equal(k.titleMatchesName('Zhan Xiao', 'Xiao Zhan'), true);
    assert.equal(k.titleMatchesName('Xiao Long', 'Xiao Zhan'), false);
    assert.equal(k.titleMatchesName('Cualquier cosa', ''), false);
});

test('nombres de las obras sin ficha en Personas', () => {
    const works = [
        { actors: 'Xiao Zhan, Liu Haikuan, Meng Ziyi', directors: 'Chen Jialin', studio: 'Tencent' },
        { actors: 'Liu Haikuan', author: 'MXTX' },
        { author: 'Nueva Autora' }
    ];
    assert.deepEqual(k.missingPersons(works, persons()).map(m => [m.name, m.role, m.works]), [
        ['Liu Haikuan', 'actor', 2], ['Chen Jialin', 'director', 1], ['Meng Ziyi', 'actor', 1], ['Nueva Autora', 'author', 1]
    ]); // MXTX es un seudónimo que ya existe y los estudios no se cuentan
});

test('personajes que trae la fuente: unidos a su intérprete y sin repetir', () => {
    let n = 0;
    const meta = [{ name: 'Xiao Zhan', character: 'Wei Wuxian' }, { name: 'Nadie', character: 'Lan Zhan' }, { name: 'Wang Yibo', character: 'wei wuxian' }, { name: 'Sin personaje' }];
    const out = k.newCharacters([{ name: 'Jiang Cheng' }], meta, persons(), () => 'id' + (++n));
    assert.deepEqual(out, [{ id: 'id1', name: 'Wei Wuxian', role: 'protagonista', personId: 'p1' }, { id: 'id2', name: 'Lan Zhan', role: 'protagonista' }]);
    assert.deepEqual(k.newCharacters([{ name: 'Wei Wuxian' }], meta.slice(0, 1), persons(), () => 'x'), []);
});
