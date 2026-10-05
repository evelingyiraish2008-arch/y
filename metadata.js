/*
 * Mi Mundo · metadata.js
 * Busca datos y portadas de una obra por su título en servicios públicos y gratuitos:
 *   Libros  → Open Library y Google Books
 *   Series  → TVmaze (y TMDB si pones tu clave gratuita en Personalizar)
 *   Películas → TMDB (con clave) o iTunes
 *   Anime   → AniList y Jikan (MyAnimeList)
 *   Manhwa  → AniList (manga coreano)
 * Todo se normaliza al mismo formato. Las funciones de lectura son puras para poder probarlas.
 */
'use strict';

const META_TIMEOUT = 9000;
const COUNTRY_ES = {
    JP: 'Japón', KR: 'Corea del Sur', CN: 'China', TW: 'Taiwán', TH: 'Tailandia', US: 'Estados Unidos', GB: 'Reino Unido',
    ES: 'España', MX: 'México', PH: 'Filipinas', AR: 'Argentina', FR: 'Francia', DE: 'Alemania', IT: 'Italia', IN: 'India', VN: 'Vietnam',
    Japan: 'Japón', 'Korea, Republic of': 'Corea del Sur', 'South Korea': 'Corea del Sur', Korea: 'Corea del Sur', China: 'China', Taiwan: 'Taiwán',
    Thailand: 'Tailandia', 'United States': 'Estados Unidos', 'United Kingdom': 'Reino Unido', Spain: 'España', Mexico: 'México', Philippines: 'Filipinas'
};
const GENRE_ES = {
    action: 'acción', adventure: 'aventura', comedy: 'comedia', drama: 'drama', fantasy: 'fantasía', romance: 'romance', horror: 'terror',
    mystery: 'misterio', 'sci-fi': 'ciencia ficción', 'science-fiction': 'ciencia ficción', 'science fiction': 'ciencia ficción',
    'slice of life': 'recuentos de la vida', sports: 'deportes', supernatural: 'sobrenatural', thriller: 'suspense', psychological: 'psicológico',
    music: 'música', historical: 'histórico', history: 'histórico', school: 'escolar', mecha: 'mecha', crime: 'crimen', family: 'familiar',
    'boys love': 'BL', 'boys\' love': 'BL', 'shounen ai': 'BL', yaoi: 'BL', 'shonen-ai': 'BL', bl: 'BL', 'gay romance': 'BL', medical: 'médico',
    war: 'bélico', western: 'western', anime: 'anime', 'young adult fiction': 'juvenil', fiction: 'ficción', 'legal': 'legal', ecchi: 'ecchi',
    'mahou shoujo': 'magical girl', shounen: 'shonen', shoujo: 'shojo', seinen: 'seinen', josei: 'josei', isekai: 'isekai', 'martial arts': 'artes marciales'
};
const translateGenre = g => GENRE_ES[String(g).trim().toLowerCase()] || String(g).trim().toLowerCase();
const stripHtml = s => String(s || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\n{3,}/g, '\n\n').trim();
const httpsUrl = u => (u ? String(u).replace(/^http:\/\//i, 'https://') : '');
const yearOf = d => { const y = parseInt(String(d || '').slice(0, 4), 10); return y > 1000 ? y : ''; };
function genreFields(genres) {
    const list = [...new Set((genres || []).map(translateGenre).filter(Boolean))];
    return { tags: list.slice(0, 6).join(', '), genre: list.filter(g => g !== 'BL').slice(0, 2).map(g => g.charAt(0).toUpperCase() + g.slice(1)).join(', '), bl: list.includes('BL') };
}

// ---------- Lectores de cada servicio (puros) ----------
function parseOpenLibrary(json) {
    return (json.docs || []).map(d => ({
        source: 'openlibrary', sourceLabel: 'Open Library', externalId: d.key, title: d.title,
        year: d.first_publish_year || '', author: (d.author_name || []).slice(0, 2).join(', '),
        pages: d.number_of_pages_median || 0,
        cover: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : '',
        coverLarge: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg` : '',
        ...genreFields((d.subject || []).slice(0, 4))
    }));
}
function parseOpenLibraryWork(json) {
    const desc = typeof json.description === 'string' ? json.description : (json.description && json.description.value) || '';
    return { synopsis: stripHtml(desc).slice(0, 1500) };
}
function parseGoogleBooks(json) {
    return (json.items || []).map(it => {
        const v = it.volumeInfo || {};
        const thumb = httpsUrl((v.imageLinks || {}).thumbnail || (v.imageLinks || {}).smallThumbnail);
        return {
            source: 'googlebooks', sourceLabel: 'Google Books', externalId: it.id,
            title: v.subtitle ? `${v.title}: ${v.subtitle}` : v.title, year: yearOf(v.publishedDate),
            author: (v.authors || []).slice(0, 2).join(', '), pages: v.pageCount || 0,
            synopsis: stripHtml(v.description).slice(0, 1500),
            cover: thumb, coverLarge: thumb ? thumb.replace('zoom=1', 'zoom=2') : '',
            ...genreFields(v.categories)
        };
    });
}
function parseTvmaze(json) {
    return (json || []).map(({ show: s }) => s && ({
        source: 'tvmaze', sourceLabel: 'TVmaze', externalId: s.id, tvmazeId: s.id, title: s.name, year: yearOf(s.premiered),
        synopsis: stripHtml(s.summary).slice(0, 1500),
        platform: (s.webChannel && s.webChannel.name) || (s.network && s.network.name) || '',
        country: COUNTRY_ES[((s.network || s.webChannel || {}).country || {}).name] || ((s.network || s.webChannel || {}).country || {}).name || '',
        cover: httpsUrl((s.image || {}).medium), coverLarge: httpsUrl((s.image || {}).original || (s.image || {}).medium),
        seriesType: 'Serie',
        ...genreFields(s.genres)
    })).filter(Boolean);
}
/** /shows/{id}?embed[]=episodes&embed[]=cast */
function parseTvmazeDetails(json) {
    const emb = json._embedded || {};
    const eps = emb.episodes || [];
    return {
        totalEpisodes: eps.length || 0,
        seasons: eps.length ? new Set(eps.map(e => e.season)).size : 0,
        actors: (emb.cast || []).slice(0, 4).map(c => c.person && c.person.name).filter(Boolean).join(', ')
    };
}
function parseTmdb(json) {
    return (json.results || []).filter(r => r.media_type !== 'person').map(r => ({
        source: 'tmdb', sourceLabel: 'TMDB', externalId: `${r.media_type || 'tv'}/${r.id}`,
        title: r.name || r.title, year: yearOf(r.first_air_date || r.release_date),
        synopsis: stripHtml(r.overview).slice(0, 1500),
        country: (r.origin_country || []).map(c => COUNTRY_ES[c] || c)[0] || '',
        seriesType: r.media_type === 'movie' ? 'Película' : 'Serie',
        cover: r.poster_path ? `https://image.tmdb.org/t/p/w342${r.poster_path}` : '',
        coverLarge: r.poster_path ? `https://image.tmdb.org/t/p/w780${r.poster_path}` : ''
    }));
}
function parseItunes(json) {
    return (json.results || []).map(r => ({
        source: 'itunes', sourceLabel: 'iTunes', externalId: r.trackId, title: r.trackName, year: yearOf(r.releaseDate),
        synopsis: stripHtml(r.longDescription || r.shortDescription).slice(0, 1500), seriesType: 'Película',
        directors: r.artistName || '',
        cover: httpsUrl(r.artworkUrl100), coverLarge: httpsUrl(r.artworkUrl100).replace('100x100', '600x600'),
        ...genreFields(r.primaryGenreName ? [r.primaryGenreName] : [])
    }));
}
const ANILIST_QUERY = `query ($q: String, $type: MediaType) {
  Page(perPage: 8) {
    media(search: $q, type: $type, sort: SEARCH_MATCH) {
      id format countryOfOrigin episodes chapters
      title { romaji english }
      startDate { year }
      description(asHtml: false)
      genres
      tags { name rank }
      coverImage { large extraLarge }
      studios(isMain: true) { nodes { name } }
      staff(perPage: 4) { edges { role node { name { full } } } }
    }
  }
}`;
function parseAniList(json, type) {
    const list = (((json || {}).data || {}).Page || {}).media || [];
    return list.map(m => {
        const tags = (m.tags || []).filter(t => t.rank >= 70).map(t => t.name);
        const g = genreFields([...(m.genres || []), ...tags]);
        const story = ((m.staff || {}).edges || []).find(e => /story|original/i.test(e.role)) || ((m.staff || {}).edges || [])[0];
        return {
            source: 'anilist', sourceLabel: 'AniList', externalId: m.id, anilistId: m.id,
            title: m.title.english || m.title.romaji, altTitle: m.title.english ? m.title.romaji : '',
            year: (m.startDate || {}).year || '',
            synopsis: stripHtml(m.description).slice(0, 1500),
            cover: (m.coverImage || {}).large || '', coverLarge: (m.coverImage || {}).extraLarge || (m.coverImage || {}).large || '',
            country: COUNTRY_ES[m.countryOfOrigin] || '',
            ...(type === 'anime'
                ? { totalEpisodes: m.episodes || 0, studio: (((m.studios || {}).nodes || [])[0] || {}).name || '' }
                : { totalChapters: m.chapters || 0, author: story && story.node ? story.node.name.full : '' }),
            ...g,
            countryCode: m.countryOfOrigin
        };
    }).sort((a, b) => (type === 'manhwa' ? (b.countryCode === 'KR') - (a.countryCode === 'KR') : 0));
}
function parseJikan(json) {
    return ((json || {}).data || []).map(a => ({
        source: 'jikan', sourceLabel: 'MyAnimeList', externalId: a.mal_id,
        title: a.title_english || a.title, altTitle: a.title_english ? a.title : '',
        year: a.year || ((((a.aired || {}).prop || {}).from || {}).year) || '',
        totalEpisodes: a.episodes || 0, synopsis: stripHtml(a.synopsis).replace(/\[Written by MAL Rewrite\]/i, '').trim().slice(0, 1500),
        studio: ((a.studios || [])[0] || {}).name || '', country: 'Japón',
        cover: (((a.images || {}).jpg) || {}).image_url || '', coverLarge: (((a.images || {}).jpg) || {}).large_image_url || '',
        ...genreFields((a.genres || []).map(x => x.name))
    }));
}

// ---------- Peticiones ----------
async function getJson(url, { fetchFn = fetch, ...init } = {}) {
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), META_TIMEOUT) : null;
    try {
        const res = await fetchFn(url, { ...init, ...(ctrl ? { signal: ctrl.signal } : {}) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    } finally { if (timer) clearTimeout(timer); }
}
const enc = encodeURIComponent;
/** Fuentes para cada tipo: [{ id, label, run(query) }]. */
function metadataSources(type, { tmdbKey = '', seriesType = 'Serie', fetchFn = fetch } = {}) {
    const opts = { fetchFn };
    const anilist = mediaType => q => getJson('https://graphql.anilist.co', {
        ...opts, method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ query: ANILIST_QUERY, variables: { q, type: mediaType } })
    }).then(j => parseAniList(j, type));
    const tmdb = q => getJson(`https://api.themoviedb.org/3/search/multi?api_key=${enc(tmdbKey)}&language=es-ES&include_adult=false&query=${enc(q)}`, opts).then(parseTmdb);
    if (type === 'book') return [
        { id: 'openlibrary', label: 'Open Library', run: q => getJson(`https://openlibrary.org/search.json?limit=8&fields=key,title,author_name,first_publish_year,cover_i,number_of_pages_median,subject&q=${enc(q)}`, opts).then(parseOpenLibrary) },
        { id: 'googlebooks', label: 'Google Books', run: q => getJson(`https://www.googleapis.com/books/v1/volumes?maxResults=8&q=${enc(q)}`, opts).then(parseGoogleBooks) }
    ];
    if (type === 'anime') return [
        { id: 'anilist', label: 'AniList', run: anilist('ANIME') },
        { id: 'jikan', label: 'MyAnimeList', run: q => getJson(`https://api.jikan.moe/v4/anime?limit=8&q=${enc(q)}`, opts).then(parseJikan) }
    ];
    if (type === 'manhwa') return [{ id: 'anilist', label: 'AniList', run: anilist('MANGA') }];
    // Series y películas
    const out = [];
    if (tmdbKey) out.push({ id: 'tmdb', label: 'TMDB', run: tmdb });
    if (seriesType === 'Película') { if (!tmdbKey) out.push({ id: 'itunes', label: 'iTunes', run: q => getJson(`https://itunes.apple.com/search?media=movie&limit=8&country=es&term=${enc(q)}`, opts).then(parseItunes) }); }
    else out.push({ id: 'tvmaze', label: 'TVmaze', run: q => getJson(`https://api.tvmaze.com/search/shows?q=${enc(q)}`, opts).then(parseTvmaze) });
    return out;
}
/** Busca en todas las fuentes del tipo a la vez. Devuelve { results, errors }. */
async function searchMetadata(type, query, opts = {}) {
    const sources = metadataSources(type, opts);
    const settled = await Promise.allSettled(sources.map(s => s.run(query)));
    const results = [], errors = [];
    settled.forEach((r, i) => (r.status === 'fulfilled' ? results.push(...r.value.slice(0, 8)) : errors.push(sources[i].label)));
    // Intercala las fuentes para que las primeras de cada una salgan arriba
    const bySource = new Map();
    results.forEach(r => { if (!bySource.has(r.source)) bySource.set(r.source, []); bySource.get(r.source).push(r); });
    const mixed = [];
    for (let i = 0; i < 8; i++) bySource.forEach(list => { if (list[i]) mixed.push(list[i]); });
    return { results: mixed, errors };
}
/** Datos extra que solo se piden al elegir un resultado (episodios y reparto, sinopsis del libro…). */
async function fetchMetadataDetails(meta, { fetchFn = fetch } = {}) {
    try {
        if (meta.source === 'tvmaze') return parseTvmazeDetails(await getJson(`https://api.tvmaze.com/shows/${enc(meta.externalId)}?embed[]=episodes&embed[]=cast`, { fetchFn }));
        if (meta.source === 'openlibrary' && !meta.synopsis) return parseOpenLibraryWork(await getJson(`https://openlibrary.org${meta.externalId}.json`, { fetchFn }));
    } catch (e) { /* los detalles son opcionales */ }
    return {};
}

/** Campos que se rellenarían: solo los que están vacíos en el formulario (lo que escribiste no se toca). */
const META_FIELDS = ['anilistId', 'tvmazeId', 'title', 'author', 'studio', 'platform', 'country', 'genre', 'year', 'actors', 'directors', 'pages', 'totalEpisodes', 'totalChapters', 'seasons', 'tags', 'synopsis', 'seriesType'];
function mergeMetadata(current, meta, { overwrite = false } = {}) {
    const patch = {};
    const empty = v => v === undefined || v === null || v === '' || v === 0 || (typeof v === 'number' && isNaN(v));
    META_FIELDS.forEach(f => {
        const v = meta[f];
        if (empty(v)) return;
        if (f === 'seasons' && Number(v) < 2) return;
        if (overwrite || empty(current[f]) || (f === 'seasons' && Number(current[f]) <= 1)) patch[f] = v;
    });
    if (meta.bl && !current.bl) patch.bl = true;
    return patch;
}

// ---------- Próximos episodios (fechas de emisión reales) ----------
const ANILIST_AIRING_QUERY = `query ($ids: [Int]) { Page(perPage: 50) { media(id_in: $ids) { id status nextAiringEpisode { airingAt episode } } } }`;
/** { anilistId: { at (ms), episode } | null } */
function parseAniListAiring(json) {
    const out = {};
    ((((json || {}).data || {}).Page || {}).media || []).forEach(m => {
        out[m.id] = m.nextAiringEpisode ? { at: m.nextAiringEpisode.airingAt * 1000, episode: m.nextAiringEpisode.episode } : null;
    });
    return out;
}
/** /shows/{id}?embed=nextepisode */
function parseTvmazeNext(json) {
    const n = ((json || {})._embedded || {}).nextepisode;
    return n && n.airstamp ? { at: Date.parse(n.airstamp), episode: n.number || 0, season: n.season || 0 } : null;
}
/** Pide la fecha del próximo episodio de las obras con id de AniList o TVmaze. Devuelve { workId: info|null }. */
async function fetchNextEpisodes(works, { fetchFn = fetch } = {}) {
    const out = {};
    const ani = works.filter(w => Number(w.anilistId));
    if (ani.length) {
        try {
            const j = await getJson('https://graphql.anilist.co', { fetchFn, method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                body: JSON.stringify({ query: ANILIST_AIRING_QUERY, variables: { ids: ani.map(w => Number(w.anilistId)) } }) });
            const map = parseAniListAiring(j);
            ani.forEach(w => { if (Number(w.anilistId) in map) out[w.id] = map[w.anilistId]; });
        } catch (e) { /* sin conexión: se deja como estaba */ }
    }
    for (const w of works.filter(x => Number(x.tvmazeId))) {
        try { out[w.id] = parseTvmazeNext(await getJson(`https://api.tvmaze.com/shows/${Number(w.tvmazeId)}?embed=nextepisode`, { fetchFn })); } catch (e) { /* sigue */ }
    }
    return out;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        parseAniListAiring, parseTvmazeNext, fetchNextEpisodes,
        translateGenre, stripHtml, parseOpenLibrary, parseOpenLibraryWork, parseGoogleBooks, parseTvmaze, parseTvmazeDetails, parseTmdb,
        parseItunes, parseAniList, parseJikan, metadataSources, searchMetadata, fetchMetadataDetails, mergeMetadata, ANILIST_QUERY, COUNTRY_ES
    };
}
