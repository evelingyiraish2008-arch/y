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
        assert.deepEqual(md.parseTvmazeDetails({ _embedded: { episodes: [{ season: 1 }, { season: 1 }, { season: 2 }], cast: [{ person: { name: 'Xiao Zhan', image: { medium: 'http://tv/m.jpg', original: 'http://tv/o.jpg' } }, character: { name: 'Wei Wuxian' } }] } }),
            { totalEpisodes: 3, seasons: 2, seasonsList: [{ number: 1, year: '', episodes: 2, progress: 0, rating: 0 }, { number: 2, year: '', episodes: 1, progress: 0, rating: 0 }], actors: 'Xiao Zhan', people: [{ name: 'Xiao Zhan', role: 'actor', image: 'https://tv/o.jpg', character: 'Wei Wuxian', characterRole: 'protagonista' }] });
        const al = md.parseAniList({ data: { Page: { media: [
            { id: 1, countryOfOrigin: 'JP', chapters: 10, title: { romaji: 'A', english: null }, genres: [], tags: [] },
            { id: 2, countryOfOrigin: 'KR', chapters: 80, title: { romaji: 'Jinx', english: 'Jinx' }, genres: ['Drama'], tags: [{ name: 'Boys Love', rank: 90 }], staff: { edges: [{ role: 'Story & Art', node: { name: { full: 'Mingwa' } } }] }, coverImage: { large: 'L' } }
        ] } } }, 'manhwa');
        assert.equal(al[0].title, 'Jinx'); // el coreano primero
        assert.deepEqual([al[0].bl, al[0].author, al[0].country, al[0].totalChapters], [true, 'Mingwa', 'Corea del Sur', 80]);
        assert.deepEqual(al[0].people, [{ name: 'Mingwa', role: 'author', image: '' }]);
        const jk = md.parseJikan({ data: [{ mal_id: 5, title: 'Shingeki', title_english: 'Attack on Titan', year: 2013, episodes: 25, synopsis: 'Titanes. [Written by MAL Rewrite]', studios: [{ name: 'WIT' }], genres: [{ name: 'Action' }], images: { jpg: { image_url: 'i', large_image_url: 'I' } } }] });
        assert.deepEqual([jk[0].title, jk[0].synopsis, jk[0].studio, jk[0].tags], ['Attack on Titan', 'Titanes.', 'WIT', 'acción']);
    });
    it('reparto con fotos y personajes: AniList (seiyuus), TMDB, Jikan y Open Library', () => {
        const an = md.parseAniList({ data: { Page: { media: [{ id: 9, title: { romaji: 'Given' }, characters: { edges: [
            { role: 'MAIN', node: { name: { full: 'Mafuyu Satou' } }, voiceActors: [{ name: { full: 'Shougo Yano' }, image: { large: 'https://s4/yano.png' } }] },
            { role: 'SUPPORTING', node: { name: { full: 'Otro' } }, voiceActors: [{ name: { full: 'X' }, image: {} }] },
            { role: 'MAIN', node: { name: { full: 'Sin voz' } }, voiceActors: [] }
        ] } }] } } }, 'anime');
        assert.deepEqual(an[0].people, [{ name: 'Shougo Yano', role: 'actor', image: 'https://s4/yano.png', character: 'Mafuyu Satou', characterRole: 'protagonista' }]);
        const tm = md.parseTmdbCredits({ cast: [{ name: 'Gong Jun', profile_path: '/g.jpg', character: 'Wen Kexing / Zhou' }], crew: [{ name: 'Ma Hua Gan', job: 'Director', profile_path: null }, { name: 'Otro', job: 'Writer' }] });
        assert.deepEqual([tm.actors, tm.directors], ['Gong Jun', 'Ma Hua Gan']);
        assert.deepEqual(tm.people.map(p => [p.name, p.role, p.image, p.character || '']), [['Gong Jun', 'actor', 'https://image.tmdb.org/t/p/h632/g.jpg', 'Wen Kexing'], ['Ma Hua Gan', 'director', '', '']]);
        const jc = md.parseJikanCharacters({ data: [{ role: 'Main', character: { name: 'Satou, Mafuyu' }, voice_actors: [{ language: 'English', person: { name: 'Smith, John' } }, { language: 'Japanese', person: { name: 'Yano, Shougo', images: { jpg: { image_url: 'https://cdn/y.jpg' } } } }] }, { role: 'Supporting', character: { name: 'B' }, voice_actors: [] }] });
        assert.deepEqual(jc, [{ name: 'Shougo Yano', role: 'actor', image: 'https://cdn/y.jpg', character: 'Mafuyu Satou', characterRole: 'protagonista' }]);
        const ol = md.parseOpenLibrary({ docs: [{ key: '/works/1', title: 'Dune', author_name: ['Frank Herbert'], author_key: ['OL79034A'] }] });
        assert.deepEqual(ol[0].people, [{ name: 'Frank Herbert', role: 'author', image: 'https://covers.openlibrary.org/a/olid/OL79034A-L.jpg?default=false' }]);
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

describe('próximos episodios', () => {
    it('lee AniList y TVmaze', () => {
        assert.deepEqual(md.parseAniListAiring({ data: { Page: { media: [{ id: 5, nextAiringEpisode: { airingAt: 1700000000, episode: 7 } }, { id: 6, nextAiringEpisode: null }] } } }), { 5: { at: 1700000000000, episode: 7 }, 6: null });
        assert.deepEqual(md.parseTvmazeNext({ _embedded: { nextepisode: { airstamp: '2026-10-08T12:00:00+00:00', number: 9, season: 2 } } }), { at: Date.parse('2026-10-08T12:00:00Z'), episode: 9, season: 2 });
        assert.equal(md.parseTvmazeNext({}), null);
    });
    it('los ids de AniList y TVmaze se guardan al rellenar datos', () => {
        assert.equal(md.mergeMetadata({}, { anilistId: 12, title: 'x' }).anilistId, 12);
    });
    it('consulta solo las obras con id', async () => {
        const calls = [];
        const fetchFn = async (url, init) => { calls.push(url); return { ok: true, json: async () => (url.includes('anilist') ? { data: { Page: { media: [{ id: 1, nextAiringEpisode: { airingAt: 10, episode: 2 } }] } } } : { _embedded: {} }) }; };
        const out = await md.fetchNextEpisodes([{ id: 'a', anilistId: 1 }, { id: 'b', tvmazeId: 3 }, { id: 'c' }], { fetchFn });
        assert.deepEqual(out, { a: { at: 10000, episode: 2 }, b: null });
        assert.equal(calls.length, 2);
    });
});

it('temporadas desde las fuentes: TVmaze (episodios) y TMDB (temporadas)', () => {
    const eps = [{ season: 1, airdate: '2021-02-22' }, { season: 1, airdate: '2021-02-23' }, { season: 2, airdate: '2023-05-01' }, { season: 2 }, { season: 0 }];
    assert.deepEqual(md.seasonsFromSource(eps), [{ number: 1, year: 2021, episodes: 2, progress: 0, rating: 0 }, { number: 2, year: 2023, episodes: 2, progress: 0, rating: 0 }]);
    const tm = md.parseTmdbSeasons({ seasons: [{ season_number: 0, episode_count: 5 }, { season_number: 1, episode_count: 12, air_date: '2019-06-27' }, { season_number: 2, episode_count: 10, air_date: '2023-01-01' }] });
    assert.deepEqual(tm.seasonsList.map(s => [s.number, s.episodes, s.year]), [[1, 12, 2019], [2, 10, 2023]]);
    assert.deepEqual(md.parseTmdbSeasons({ seasons: [{ season_number: 1, episode_count: 12 }] }), {}); // con una sola no hace falta
});
