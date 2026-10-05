'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
Object.assign(global, require('../../utils.js'));
const im = require('../../importers.js');
const md = require('../../metadata.js');

describe('CSV', () => {
    it('lee comillas, saltos de línea dentro de comillas y detecta el separador', () => {
        const { headers, rows } = im.parseCSV('﻿Title;Author;Notes\n"Dune; edición";"Herbert, Frank";"línea 1\nlínea ""2"""\n\n');
        assert.deepEqual(headers, ['Title', 'Author', 'Notes']);
        assert.equal(rows.length, 1);
        assert.equal(rows[0].Title, 'Dune; edición');
        assert.equal(rows[0].Notes, 'línea 1\nlínea "2"');
    });
    it('Goodreads: adivina columnas, convierte estados, notas, fechas y "Apellido, Nombre"', () => {
        const csv = 'Book Id,Title,Author l-f,Author,My Rating,Number of Pages,Original Publication Year,Date Read,Exclusive Shelf,Bookshelves\n' +
            '1,El Nombre del Viento,"Rothfuss, Patrick",Patrick Rothfuss,5,662,2007,2026/08/20,read,"fantasía, favoritos"\n' +
            '2,Dune,"Herbert, Frank",Frank Herbert,0,412,1965,,to-read,to-read\n' +
            '3,Circe,"Miller, Madeline",Madeline Miller,4,393,2018,,currently-reading,';
        const { headers, rows } = im.parseCSV(csv);
        const map = im.guessMapping(headers);
        assert.equal(map['Title'], 'title');
        assert.equal(map['My Rating'], 'rating');
        assert.equal(map['Exclusive Shelf'], 'status');
        assert.equal(map['Number of Pages'], 'total');
        const works = im.rowsToWorks(rows, map, { defaultType: 'book' });
        assert.deepEqual(works[0], {
            type: 'book', title: 'El Nombre del Viento', status: 'terminado', rating: 5, pages: 662, progress: 662, year: 2007,
            author: 'Patrick Rothfuss', tags: 'fantasía, favoritos', endDate: '2026-08-20'
        });
        assert.equal(works[1].status, 'quiero leer');
        assert.equal(works[1].tags, undefined);
        assert.equal(works[2].status, 'leyendo');
    });
    it('normaliza tipos, estados, valoraciones y fechas de otras apps', () => {
        assert.equal(im.normalizeType('Película'), 'series');
        assert.equal(im.normalizeType('Manga'), 'manhwa');
        assert.equal(im.normalizeType('TV', 'anime'), 'series');
        assert.equal(im.normalizeStatus('Plan to Watch', 'anime'), 'quiero ver');
        assert.equal(im.normalizeStatus('Reading', 'manhwa'), 'leyendo');
        assert.equal(im.normalizeStatus('Completed', 'anime'), 'terminado');
        assert.equal(im.normalizeStatus('Dropped', 'series'), 'abandonado');
        assert.equal(im.normalizeRating('8', 10), 4);
        assert.equal(im.normalizeRating('87'), 4.5);
        assert.equal(im.normalizeRating('3,5'), 3.5);
        assert.equal(im.normalizeDate('15/08/2026'), '2026-08-15');
        assert.equal(im.normalizeDate('0000-00-00'), '');
    });
    it('exporta a CSV y se puede volver a leer', () => {
        const csv = im.worksToCSV([{ type: 'anime', title: 'Spy, Family', status: 'terminado', totalEpisodes: 25, rating: 5, bl: false }]);
        const { headers, rows } = im.parseCSV(csv);
        const back = im.rowsToWorks(rows, im.guessMapping(headers));
        assert.deepEqual(back[0], { type: 'anime', title: 'Spy, Family', status: 'terminado', rating: 5, totalEpisodes: 25, progress: 25 });
    });
});

describe('MyAnimeList y AniList', () => {
    it('lee el XML exportado de MyAnimeList (anime y manga)', () => {
        const xml = `<?xml version="1.0"?><myanimelist>
            <anime><series_title><![CDATA[Jujutsu Kaisen]]></series_title><series_type>TV</series_type><series_episodes>24</series_episodes>
            <my_watched_episodes>24</my_watched_episodes><my_start_date>2026-01-02</my_start_date><my_finish_date>2026-02-01</my_finish_date>
            <my_score>9</my_score><my_status>Completed</my_status><my_times_watched>1</my_times_watched><my_tags><![CDATA[acción, shonen]]></my_tags></anime>
            <manga><manga_title><![CDATA[Solo Leveling]]></manga_title><manga_chapters>179</manga_chapters><my_read_chapters>50</my_read_chapters>
            <my_start_date>0000-00-00</my_start_date><my_score>0</my_score><my_status>Reading</my_status></manga></myanimelist>`;
        const works = im.parseMalXml(xml);
        assert.deepEqual(works[0], {
            type: 'anime', title: 'Jujutsu Kaisen', status: 'terminado', totalEpisodes: 24, progress: 24, rating: 4.5,
            startDate: '2026-01-02', endDate: '2026-02-01', tags: 'acción, shonen', rereads: [{ date: '2026-02-01', rating: 0 }]
        });
        assert.deepEqual(works[1], { type: 'manhwa', title: 'Solo Leveling', status: 'leyendo', totalChapters: 179, progress: 50 });
    });
    it('lee la lista de AniList', () => {
        const json = { data: { MediaListCollection: { lists: [{ entries: [
            { status: 'CURRENT', progress: 3, repeat: 0, score: 8.5, startedAt: { year: 2026, month: 9, day: 1 }, completedAt: {},
              media: { format: 'MANGA', countryOfOrigin: 'KR', chapters: 100, genres: ['Romance'], title: { romaji: 'Cheese in the Trap', english: null }, startDate: { year: 2010 }, coverImage: { large: 'https://x/c.jpg' } } },
            { status: 'PLANNING', progress: 0, score: 0, startedAt: {}, completedAt: {}, media: { format: 'NOVEL', title: { romaji: 'Mo Dao Zu Shi', english: 'Grandmaster' }, genres: [] } }
        ] }] } } };
        const works = im.parseAniListCollection(json, 'MANGA');
        assert.deepEqual(works[0], {
            type: 'manhwa', title: 'Cheese in the Trap', status: 'leyendo', totalChapters: 100, progress: 3, rating: 4.5, year: 2010,
            image: 'https://x/c.jpg', startDate: '2026-09-01', tags: 'romance', country: 'Corea del Sur'
        });
        assert.deepEqual(works[1], { type: 'book', title: 'Grandmaster', status: 'quiero leer' });
    });
    it('JSON: acepta una copia de Mi Mundo o una lista suelta', () => {
        assert.deepEqual(im.parseJsonImport('[{"name":"Bleach","type":"anime","status":"Watching"}]'), [{ type: 'anime', title: 'Bleach', status: 'viendo' }]);
        assert.equal(im.parseJsonImport('{"works":[{"id":"x","type":"book","title":"A","status":"terminado"}]}')[0].id, undefined);
    });
});

describe('plan de importación', () => {
    const existing = [{ id: '1', type: 'book', title: 'Dune', status: 'leyendo', progress: 100, rating: 0, author: 'Frank Herbert' }];
    const incoming = [{ type: 'book', title: 'dune', status: 'terminado', progress: 412, rating: 4, author: 'Otro' }, { type: 'book', title: 'Nuevo', status: 'quiero leer' }];
    it('actualizar: completa lo vacío y avanza progreso/estado sin pisar lo tuyo', () => {
        const plan = im.planImport(incoming, existing, 'update');
        assert.equal(plan.create.length, 1);
        assert.deepEqual(plan.update[0].patch, { status: 'terminado', progress: 412, rating: 4 });
        assert.deepEqual(im.markExisting(incoming, existing), [true, false]);
    });
    it('ignorar o duplicar', () => {
        assert.deepEqual([im.planImport(incoming, existing, 'skip')].map(p => [p.create.length, p.update.length, p.skip.length]), [[1, 0, 1]]);
        assert.equal(im.planImport(incoming, existing, 'duplicate').create.length, 2);
    });
});

describe('búsqueda de datos', () => {
    it('Open Library y Google Books', () => {
        const ol = md.parseOpenLibrary({ docs: [{ key: '/works/OL1W', title: 'Dune', author_name: ['Frank Herbert'], first_publish_year: 1965, cover_i: 42, number_of_pages_median: 412, subject: ['Science fiction', 'Fiction'] }] });
        assert.equal(ol[0].cover, 'https://covers.openlibrary.org/b/id/42-M.jpg');
        assert.equal(ol[0].tags, 'ciencia ficción, ficción');
        assert.equal(ol[0].pages, 412);
        const gb = md.parseGoogleBooks({ items: [{ id: 'g', volumeInfo: { title: 'Dune', authors: ['F. H.'], publishedDate: '1990-01-01', description: '<p>Arena &amp; especia</p>', pageCount: 600, imageLinks: { thumbnail: 'http://books.google.com/x?zoom=1' } } }] });
        assert.equal(gb[0].synopsis, 'Arena & especia');
        assert.equal(gb[0].cover, 'https://books.google.com/x?zoom=1');
        assert.equal(gb[0].year, 1990);
    });
    it('TVmaze, AniList (BL y país) y Jikan', () => {
        const tv = md.parseTvmaze([{ show: { id: 7, name: 'The Untamed', premiered: '2019-06-27', summary: '<p>Wuxia</p>', genres: ['Drama', 'Fantasy'], webChannel: { name: 'Tencent', country: { name: 'China' } }, image: { medium: 'http://m', original: 'http://o' } } }]);
        assert.deepEqual([tv[0].platform, tv[0].country, tv[0].coverLarge, tv[0].genre], ['Tencent', 'China', 'https://o', 'Drama, Fantasía']);
        assert.deepEqual(md.parseTvmazeDetails({ _embedded: { episodes: [{ season: 1 }, { season: 1 }, { season: 2 }], cast: [{ person: { name: 'Xiao Zhan' } }] } }), { totalEpisodes: 3, seasons: 2, actors: 'Xiao Zhan' });
        const al = md.parseAniList({ data: { Page: { media: [
            { id: 1, countryOfOrigin: 'JP', chapters: 10, title: { romaji: 'A', english: null }, genres: [], tags: [] },
            { id: 2, countryOfOrigin: 'KR', chapters: 80, title: { romaji: 'Jinx', english: 'Jinx' }, genres: ['Drama'], tags: [{ name: 'Boys Love', rank: 90 }], staff: { edges: [{ role: 'Story & Art', node: { name: { full: 'Mingwa' } } }] }, coverImage: { large: 'L' } }
        ] } } }, 'manhwa');
        assert.equal(al[0].title, 'Jinx'); // el coreano primero
        assert.deepEqual([al[0].bl, al[0].author, al[0].country, al[0].totalChapters], [true, 'Mingwa', 'Corea del Sur', 80]);
        const jk = md.parseJikan({ data: [{ mal_id: 5, title: 'Shingeki', title_english: 'Attack on Titan', year: 2013, episodes: 25, synopsis: 'Titanes. [Written by MAL Rewrite]', studios: [{ name: 'WIT' }], genres: [{ name: 'Action' }], images: { jpg: { image_url: 'i', large_image_url: 'I' } } }] });
        assert.deepEqual([jk[0].title, jk[0].synopsis, jk[0].studio, jk[0].tags], ['Attack on Titan', 'Titanes.', 'WIT', 'acción']);
    });
    it('rellena solo lo que está vacío', () => {
        const patch = md.mergeMetadata({ title: 'Dune', author: 'Yo', pages: 0, synopsis: '' }, { title: 'Dune (1965)', author: 'Frank Herbert', pages: 412, synopsis: 'Arena', year: 1965, bl: false });
        assert.deepEqual(patch, { pages: 412, synopsis: 'Arena', year: 1965 });
        assert.equal(md.mergeMetadata({ author: 'Yo' }, { author: 'Él' }, { overwrite: true }).author, 'Él');
    });
    it('busca en todas las fuentes a la vez y sigue si una falla', async () => {
        const fetchFn = async url => {
            if (url.includes('openlibrary')) return { ok: true, json: async () => ({ docs: [{ key: '/works/1', title: 'Dune OL' }] }) };
            return { ok: false, status: 503, json: async () => ({}) };
        };
        const { results, errors } = await md.searchMetadata('book', 'dune', { fetchFn });
        assert.deepEqual(results.map(r => r.title), ['Dune OL']);
        assert.deepEqual(errors, ['Google Books']);
        assert.deepEqual(md.metadataSources('series', { seriesType: 'Película' }).map(s => s.id), ['itunes']);
        assert.deepEqual(md.metadataSources('series', { tmdbKey: 'k' }).map(s => s.id), ['tmdb', 'tvmaze']);
    });
});
