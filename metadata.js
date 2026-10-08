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
// tagkit.js (si está cargado) conoce muchas más etiquetas: tropos, tono, ambientación…
const translateGenre = g => GENRE_ES[String(g).trim().toLowerCase()] || (typeof translateTagName === 'function' ? translateTagName(g) : String(g).trim().toLowerCase());
const stripHtml = s => String(s || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\n{3,}/g, '\n\n').trim();
const httpsUrl = u => (u ? String(u).replace(/^http:\/\//i, 'https://') : '');
const yearOf = d => { const y = parseInt(String(d || '').slice(0, 4), 10); return y > 1000 ? y : ''; };
function genreFields(genres) {
    const list = [...new Set((genres || []).map(translateGenre).filter(Boolean))];
    return { tags: list.slice(0, 12).join(', '), genre: list.filter(g => g !== 'BL').slice(0, 2).map(g => g.charAt(0).toUpperCase() + g.slice(1)).join(', '), bl: list.includes('BL') };
}

// ---------- Detalles extra: estado de emisión, duración, idioma, origen, nota, web oficial ----------
const AIR_STATUS = { running: 'En emisión', releasing: 'En emisión', 'currently airing': 'En emisión', 'returning series': 'En emisión', 'in production': 'En emisión', ended: 'Finalizada', finished: 'Finalizada', 'finished airing': 'Finalizada',
    canceled: 'Cancelada', cancelled: 'Cancelada', 'to be determined': 'Sin determinar', 'in development': 'Próximamente', planned: 'Próximamente', 'not_yet_released': 'Próximamente', 'not yet released': 'Próximamente', 'not yet aired': 'Próximamente', hiatus: 'En pausa' };
const airStatusEs = s => AIR_STATUS[String(s || '').trim().toLowerCase().replace(/_/g, ' ')] || AIR_STATUS[String(s || '').trim().toLowerCase()] || '';
const LANG_ES = { en: 'Inglés', es: 'Español', ja: 'Japonés', ko: 'Coreano', zh: 'Chino', cn: 'Chino (cantonés)', th: 'Tailandés', tl: 'Filipino', fr: 'Francés', de: 'Alemán', it: 'Italiano', pt: 'Portugués', hi: 'Hindi', vi: 'Vietnamita', id: 'Indonesio', ru: 'Ruso',
    english: 'Inglés', spanish: 'Español', japanese: 'Japonés', korean: 'Coreano', chinese: 'Chino', thai: 'Tailandés', french: 'Francés', german: 'Alemán', italian: 'Italiano', portuguese: 'Portugués', mandarin: 'Chino' };
const languageEs = l => LANG_ES[String(l || '').trim().toLowerCase()] || '';
const SOURCE_ES = { manga: 'Manga', 'light novel': 'Novela ligera', light_novel: 'Novela ligera', novel: 'Novela', 'web novel': 'Novela web', web_novel: 'Novela web', 'visual novel': 'Novela visual', visual_novel: 'Novela visual', original: 'Original', 'video game': 'Videojuego', video_game: 'Videojuego',
    game: 'Videojuego', 'web manga': 'Manga web', '4-koma manga': 'Manga', 'live action': 'Imagen real', anime: 'Anime', comic: 'Cómic', 'picture book': 'Libro ilustrado' };
const basedOnEs = x => SOURCE_ES[String(x || '').trim().toLowerCase()] || '';
/** "24 min per ep" / "1 hr 30 min" → minutos. */
function minutesFrom(text) {
    const t = String(text || '').toLowerCase();
    const h = (t.match(/(\d+)\s*hr/) || [])[1], m = (t.match(/(\d+)\s*min/) || [])[1];
    return (Number(h) || 0) * 60 + (Number(m) || 0);
}
const scoreOf = (n, scale = 10) => { const v = Number(n); return v > 0 ? Math.round((v * 10 / scale) * 10) / 10 : ''; };
const cleanUrl = u => (/^https?:\/\//i.test(String(u || '')) ? String(u).trim() : '');

// ---------- Lectores de cada servicio (puros) ----------
function parseOpenLibrary(json) {
    return (json.docs || []).map(d => ({
        source: 'openlibrary', sourceLabel: 'Open Library', externalId: d.key, title: d.title,
        year: d.first_publish_year || '', author: (d.author_name || []).slice(0, 2).join(', '),
        pages: d.number_of_pages_median || 0,
        publisher: (d.publisher || [])[0] || '', language: languageEs((d.language || [])[0] === 'spa' ? 'es' : (d.language || [])[0] === 'eng' ? 'en' : ''),
        cover: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : '',
        coverLarge: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg` : '',
        // Foto del autor (default=false: si no tiene, da error en vez de una imagen vacía)
        people: (d.author_name || []).slice(0, 2).map((n, i) => metaPerson(n, 'author', (d.author_key || [])[i] ? `https://covers.openlibrary.org/a/olid/${d.author_key[i]}-L.jpg?default=false` : '')),
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
            publisher: v.publisher || '', language: languageEs(v.language), score: scoreOf(v.averageRating, 5), officialUrl: cleanUrl(v.infoLink),
            cover: thumb, coverLarge: thumb ? thumb.replace('zoom=1', 'zoom=2') : '',
            ...genreFields(v.categories)
        };
    });
}
function parseTvmaze(json) {
    return (json || []).map(({ show: s }) => s && ({
        source: 'tvmaze', sourceLabel: 'TVmaze', externalId: s.id, tvmazeId: s.id, title: s.name, year: yearOf(s.premiered),
        synopsis: stripHtml(s.summary).slice(0, 1500),
        airStatus: airStatusEs(s.status), runtime: Number(s.averageRuntime || s.runtime) || '', language: languageEs(s.language), score: scoreOf((s.rating || {}).average), officialUrl: cleanUrl(s.officialSite),
        platform: (s.webChannel && s.webChannel.name) || (s.network && s.network.name) || '',
        country: COUNTRY_ES[((s.network || s.webChannel || {}).country || {}).name] || ((s.network || s.webChannel || {}).country || {}).name || '',
        cover: httpsUrl((s.image || {}).medium), coverLarge: httpsUrl((s.image || {}).original || (s.image || {}).medium),
        seriesType: 'Serie',
        ...genreFields(s.genres)
    })).filter(Boolean);
}
/**
 * Personas que trae una fuente, con su foto y el personaje que interpretan:
 * [{ name, role: 'actor' | 'author' | 'director', image, character, characterRole, characterImage }]
 */
const metaPerson = (name, role, image, extra = {}) => ({ name: String(name || '').trim(), role, image: httpsUrl(image), ...Object.fromEntries(Object.entries(extra).filter(([, v]) => v !== '')) });
/**
 * Temporadas a partir de una lista de episodios o de temporadas de una fuente (TVmaze, TMDB):
 * [{ number, episodes, year, progress: 0, rating: 0 }]. Ignora la temporada 0 (extras) y las vacías.
 */
function seasonsFromSource(items) {
    const bySeason = new Map();
    (items || []).forEach(e => {
        const n = Number(e.season ?? e.number);
        if (!n || n < 1) return;
        const cur = bySeason.get(n) || { number: n, episodes: 0, year: '' };
        cur.episodes += e.episodes !== undefined ? Number(e.episodes) || 0 : 1;
        const y = parseInt(String(e.airdate || e.year || '').slice(0, 4), 10);
        if (y > 1800 && (!cur.year || y < cur.year)) cur.year = y;
        bySeason.set(n, cur);
    });
    return [...bySeason.values()].filter(x => x.episodes > 0).sort((a, b) => a.number - b.number).map((x, i) => ({ number: i + 1, year: x.year, episodes: x.episodes, progress: 0, rating: 0 }));
}
/** /shows/{id}?embed[]=episodes&embed[]=cast */
function parseTvmazeDetails(json) {
    const emb = json._embedded || {};
    const eps = emb.episodes || [];
    const cast = (emb.cast || []).filter(c => c.person && c.person.name).slice(0, 10);
    const seasonsList = seasonsFromSource(eps);
    return {
        totalEpisodes: eps.length || 0,
        seasons: eps.length ? new Set(eps.map(e => e.season)).size : 0,
        ...(seasonsList.length > 1 ? { seasonsList } : {}),
        actors: cast.map(c => c.person.name).join(', '),
        people: cast.map(c => metaPerson(c.person.name, 'actor', (c.person.image || {}).original || (c.person.image || {}).medium,
            c.character && c.character.name ? { character: c.character.name, characterRole: 'protagonista', characterImage: httpsUrl((c.character.image || {}).original || (c.character.image || {}).medium) } : {}))
    };
}
/** /tv/{id} o /movie/{id} de TMDB: estado, duración, web oficial y plataforma. */
function parseTmdbInfo(json) {
    const j = json || {};
    const run = Array.isArray(j.episode_run_time) ? j.episode_run_time.filter(Boolean)[0] : 0;
    const net = (j.networks || [])[0];
    return {
        airStatus: airStatusEs(j.status), runtime: Number(run || j.runtime) || '', officialUrl: cleanUrl(j.homepage),
        ...(net && net.name ? { platform: net.name } : {}),
        ...(j.original_language ? { language: languageEs(j.original_language) } : {})
    };
}
/** /tv/{id} de TMDB: temporadas con sus episodios (la temporada 0 son extras y no cuenta). */
function parseTmdbSeasons(json) {
    const seasonsList = seasonsFromSource(((json || {}).seasons || []).map(x => ({ season: x.season_number, episodes: x.episode_count, airdate: x.air_date })));
    return seasonsList.length > 1 ? { seasonsList } : {};
}
/**
 * /movie/{id}/credits o /tv/{id}/aggregate_credits de TMDB: hasta 10 del reparto (con su personaje) y 3 directores.
 * En las series, los directores son los que más episodios dirigieron.
 */
function parseTmdbCredits(json) {
    const img = p => (p ? `https://image.tmdb.org/t/p/h632${p}` : '');
    const cast = ((json || {}).cast || []).filter(c => c.name).slice(0, 10);
    const isDirector = c => c.job === 'Director' || (c.jobs || []).some(j => j.job === 'Director');
    const episodes = c => Number(c.total_episode_count) || (c.jobs || []).reduce((n, j) => n + (Number(j.episode_count) || 0), 0);
    const dirs = ((json || {}).crew || []).filter(c => c.name && isDirector(c)).sort((a, b) => episodes(b) - episodes(a)).slice(0, 3);
    const character = c => String(c.character || ((c.roles || [])[0] || {}).character || '').split(' / ')[0];
    return {
        actors: cast.map(c => c.name).join(', '),
        directors: dirs.map(c => c.name).join(', '),
        people: [...cast.map((c, i) => metaPerson(c.name, 'actor', img(c.profile_path), character(c) ? { character: character(c), characterRole: i < 4 ? 'protagonista' : 'secundario' } : {})),
            ...dirs.map(c => metaPerson(c.name, 'director', img(c.profile_path)))]
    };
}
/** /anime/{id}/characters de Jikan: personajes (principales primero) con su seiyuu japonés. Hasta 8. */
function parseJikanCharacters(json) {
    const list = ((json || {}).data || []);
    return [...list.filter(c => c.role === 'Main'), ...list.filter(c => c.role !== 'Main')].map(c => {
        const va = (c.voice_actors || []).find(v => v.language === 'Japanese');
        if (!va || !va.person) return null;
        const name = String(va.person.name || '').split(', ').reverse().join(' '); // MAL escribe "Apellido, Nombre"
        return metaPerson(name, 'actor', (((va.person.images || {}).jpg) || {}).image_url, { character: String(c.character.name || '').split(', ').reverse().join(' '), characterRole: c.role === 'Main' ? 'protagonista' : 'secundario', characterImage: httpsUrl((((c.character.images || {}).jpg) || {}).image_url).replace(/.*questionmark.*/, '') });
    }).filter(Boolean).slice(0, 8);
}
/** /anime/{id}/staff de Jikan: quién dirige (solo "Director" y "Chief Director"). */
function parseJikanStaff(json) {
    return ((json || {}).data || []).filter(s => s.person && (s.positions || []).some(p => /^(chief )?director$/i.test(String(p).trim()))).slice(0, 3)
        .map(s => metaPerson(String(s.person.name || '').split(', ').reverse().join(' '), 'director', (((s.person.images || {}).jpg) || {}).image_url));
}
function parseTmdb(json) {
    return (json.results || []).filter(r => r.media_type !== 'person').map(r => ({
        source: 'tmdb', sourceLabel: 'TMDB', externalId: `${r.media_type || 'tv'}/${r.id}`,
        title: r.name || r.title, year: yearOf(r.first_air_date || r.release_date),
        synopsis: stripHtml(r.overview).slice(0, 1500),
        country: (r.origin_country || []).map(c => COUNTRY_ES[c] || c)[0] || '',
        seriesType: r.media_type === 'movie' ? 'Película' : 'Serie',
        altTitle: (r.original_name || r.original_title) && (r.original_name || r.original_title) !== (r.name || r.title) ? (r.original_name || r.original_title) : '',
        language: languageEs(r.original_language), score: scoreOf(r.vote_average),
        cover: r.poster_path ? `https://image.tmdb.org/t/p/w342${r.poster_path}` : '',
        coverLarge: r.poster_path ? `https://image.tmdb.org/t/p/w780${r.poster_path}` : ''
    }));
}
function parseItunes(json) {
    return (json.results || []).map(r => ({
        source: 'itunes', sourceLabel: 'iTunes', externalId: r.trackId, title: r.trackName, year: yearOf(r.releaseDate),
        synopsis: stripHtml(r.longDescription || r.shortDescription).slice(0, 1500), seriesType: 'Película',
        directors: r.artistName || '', runtime: r.trackTimeMillis ? Math.round(r.trackTimeMillis / 60000) : '',
        cover: httpsUrl(r.artworkUrl100), coverLarge: httpsUrl(r.artworkUrl100).replace('100x100', '600x600'),
        ...genreFields(r.primaryGenreName ? [r.primaryGenreName] : [])
    }));
}
const ANILIST_QUERY = `query ($q: String, $type: MediaType) {
  Page(perPage: 8) {
    media(search: $q, type: $type, sort: SEARCH_MATCH) {
      id format countryOfOrigin episodes chapters status duration source averageScore siteUrl
      title { romaji english native }
      startDate { year }
      description(asHtml: false)
      genres
      tags { name rank isGeneralSpoiler }
      coverImage { large extraLarge }
      studios(isMain: true) { nodes { name } }
      staff(perPage: 14) { edges { role node { name { full } image { large } } } }
      characters(perPage: 16, sort: [ROLE, RELEVANCE]) { edges { role node { name { full } image { large } } voiceActors(language: JAPANESE) { name { full } image { large } } } }
    }
  }
}`;
function parseAniList(json, type) {
    const list = (((json || {}).data || {}).Page || {}).media || [];
    return list.map(m => {
        const tags = (m.tags || []).filter(t => t.rank >= 55 && !t.isGeneralSpoiler).map(t => t.name);
        const g = genreFields([...(m.genres || []), ...tags]);
        const staff = (m.staff || {}).edges || [];
        const story = staff.find(e => /story|original/i.test(e.role)) || staff[0];
        // Dirección: "Director" y "Chief Director" (no los ayudantes, de sonido, etc.)
        const dirs = staff.filter(e => /^(chief )?director$/i.test(String(e.role).trim()) && e.node && e.node.name).slice(0, 3);
        const voiced = ((m.characters || {}).edges || []).filter(e => (e.voiceActors || [])[0]);
        const cast = [...voiced.filter(e => e.role === 'MAIN'), ...voiced.filter(e => e.role !== 'MAIN')].slice(0, 8);
        const people = type === 'anime'
            ? [...cast.map(e => metaPerson(e.voiceActors[0].name.full, 'actor', (e.voiceActors[0].image || {}).large, { character: e.node.name.full, characterRole: e.role === 'MAIN' ? 'protagonista' : 'secundario', characterImage: httpsUrl((e.node.image || {}).large).replace(/.*\/default\.jpg$/, '') })),
                ...dirs.map(e => metaPerson(e.node.name.full, 'director', (e.node.image || {}).large))]
            : (story && story.node ? [metaPerson(story.node.name.full, 'author', (story.node.image || {}).large)] : []);
        return {
            source: 'anilist', sourceLabel: 'AniList', externalId: m.id, anilistId: m.id,
            title: m.title.english || m.title.romaji, altTitle: [m.title.english ? m.title.romaji : '', m.title.native].filter(Boolean).join(' · '),
            airStatus: airStatusEs(m.status), runtime: type === 'anime' ? (Number(m.duration) || '') : '', basedOn: basedOnEs(m.source), score: scoreOf(m.averageScore, 100), officialUrl: cleanUrl(m.siteUrl),
            year: (m.startDate || {}).year || '',
            synopsis: stripHtml(m.description).slice(0, 1500),
            cover: (m.coverImage || {}).large || '', coverLarge: (m.coverImage || {}).extraLarge || (m.coverImage || {}).large || '',
            country: COUNTRY_ES[m.countryOfOrigin] || '',
            ...(type === 'anime'
                ? { totalEpisodes: m.episodes || 0, studio: (((m.studios || {}).nodes || [])[0] || {}).name || '', actors: cast.map(e => e.voiceActors[0].name.full).join(', '), directors: dirs.map(e => e.node.name.full).join(', ') }
                : { totalChapters: m.chapters || 0, author: story && story.node ? story.node.name.full : '' }),
            ...g,
            people: people.filter(p => p.name).map(p => (/default\.jpg$/.test(p.image) ? { ...p, image: '' } : p)),
            countryCode: m.countryOfOrigin
        };
    }).sort((a, b) => (type === 'manhwa' ? (b.countryCode === 'KR') - (a.countryCode === 'KR') : 0));
}
function parseJikan(json) {
    return ((json || {}).data || []).map(a => ({
        source: 'jikan', sourceLabel: 'MyAnimeList', externalId: a.mal_id,
        title: a.title_english || a.title, altTitle: [a.title_english ? a.title : '', a.title_japanese].filter(Boolean).join(' · '),
        airStatus: airStatusEs(a.status), runtime: minutesFrom(a.duration) || '', basedOn: basedOnEs(a.source), score: scoreOf(a.score), officialUrl: cleanUrl(a.url),
        year: a.year || ((((a.aired || {}).prop || {}).from || {}).year) || '',
        totalEpisodes: a.episodes || 0, synopsis: stripHtml(a.synopsis).replace(/\[Written by MAL Rewrite\]/i, '').trim().slice(0, 1500),
        studio: ((a.studios || [])[0] || {}).name || '', country: 'Japón',
        cover: (((a.images || {}).jpg) || {}).image_url || '', coverLarge: (((a.images || {}).jpg) || {}).large_image_url || '',
        ...genreFields([...(a.genres || []), ...(a.themes || []), ...(a.demographics || [])].map(x => x.name))
    }));
}

/** Une etiquetas ya escritas ("a, b") con más (lista) sin repetir; máx. 14. */
function joinTags(current, extra) {
    const seen = new Set(), out = [];
    [...String(current || '').split(','), ...extra].map(x => String(x).trim()).filter(Boolean).forEach(t => { const k = t.toLowerCase(); if (!seen.has(k)) { seen.add(k); out.push(t); } });
    return out.slice(0, 14).join(', ');
}
/** /tv/{id}/keywords (results) o /movie/{id}/keywords (keywords) → etiquetas en español. */
function parseTmdbKeywords(json) {
    const list = (json || {}).keywords || (json || {}).results || [];
    return [...new Set(list.map(k => translateGenre(k.name)).filter(Boolean))].slice(0, 8);
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
        { id: 'openlibrary', label: 'Open Library', run: q => getJson(`https://openlibrary.org/search.json?limit=8&fields=key,title,author_name,author_key,first_publish_year,cover_i,number_of_pages_median,subject,publisher,language&q=${enc(q)}`, opts).then(parseOpenLibrary) },
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
// ---------- Wikidata: dirección y reparto cuando la fuente no los trae (gratis, sin clave) ----------
const WIKIDATA_WORK = /serie|televis|pel[ií]cula|film|anime|drama|miniserie|novela|manga|manhwa|ova|ona/i;
/** wbsearchentities → id de la obra que corresponde (por tipo de cosa, título y año) o ''. */
function pickWikidataItem(json, title, year) {
    const norm2 = x => String(x || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
    const t = norm2(title);
    const hit = ((json || {}).search || []).find(r => {
        if (!WIKIDATA_WORK.test(r.description || '')) return false;
        if (norm2(r.label) !== t && norm2((r.match || {}).text) !== t) return false;
        const y = (String(r.description).match(/\b(19|20)\d{2}\b/) || [])[0];
        return !(year && y && Math.abs(Number(y) - Number(year)) > 1);
    });
    return hit ? hit.id : '';
}
/** Ids de las entidades de una propiedad (P57 director, P161 reparto) de wbgetentities. */
function wikidataClaimIds(json, id, prop) {
    const claims = ((((json || {}).entities || {})[id] || {}).claims || {})[prop] || [];
    return claims.map(c => (((c.mainsnak || {}).datavalue || {}).value || {}).id).filter(Boolean);
}
/** wbgetentities con labels → { Qid: nombre } (en inglés, que suele ser el nombre artístico romanizado; si no, en español). */
function wikidataLabels(json) {
    const out = {};
    Object.entries((json || {}).entities || {}).forEach(([id, e]) => { const l = (e.labels || {}); const name = (l.en || l.es || {}).value; if (name) out[id] = name; });
    return out;
}
/** Dirección (hasta 3) y reparto (hasta 10) de una obra según Wikidata. Devuelve {} si no encuentra algo claro. */
async function fetchWikidataCredits(title, year, { fetchFn = fetch } = {}) {
    const api = 'https://www.wikidata.org/w/api.php';
    const search = await getJson(`${api}?action=wbsearchentities&search=${enc(title)}&language=es&uselang=es&type=item&limit=8&format=json&origin=*`, { fetchFn });
    const id = pickWikidataItem(search, title, year);
    if (!id) return {};
    const item = await getJson(`${api}?action=wbgetentities&ids=${id}&props=claims&format=json&origin=*`, { fetchFn });
    const dirIds = wikidataClaimIds(item, id, 'P57').slice(0, 3), castIds = wikidataClaimIds(item, id, 'P161').slice(0, 10);
    const ids = [...new Set([...dirIds, ...castIds])];
    if (!ids.length) return {};
    const names = wikidataLabels(await getJson(`${api}?action=wbgetentities&ids=${ids.join('|')}&props=labels&languages=en|es&format=json&origin=*`, { fetchFn }));
    const dirs = dirIds.map(q => names[q]).filter(Boolean), cast = castIds.map(q => names[q]).filter(Boolean);
    return {
        directors: dirs.join(', '), actors: cast.join(', '),
        people: [...cast.map(n => metaPerson(n, 'actor', '')), ...dirs.map(n => metaPerson(n, 'director', ''))]
    };
}

/** Datos extra que solo se piden al elegir un resultado (episodios, reparto con fotos y personajes, dirección, sinopsis del libro…). */
async function fetchMetadataDetails(meta, { fetchFn = fetch, tmdbKey = '' } = {}) {
    const own = await fetchSourceDetails(meta, { fetchFn, tmdbKey });
    // Si la fuente no trae dirección (TVmaze, iTunes…), se intenta con Wikidata; es opcional y nunca estropea lo ya obtenido
    const isBook = ['openlibrary', 'googlebooks'].includes(meta.source);
    if (!isBook && !own.directors && !meta.directors && meta.title) {
        try {
            const wiki = await fetchWikidataCredits(meta.title, meta.year, { fetchFn });
            if (wiki.directors) {
                const haveActors = own.actors || meta.actors;
                const people = [...(own.people || meta.people || [])];
                [...(wiki.people || [])].filter(p => p.role === 'director' || !haveActors).forEach(p => { if (!people.some(x => x.name === p.name)) people.push(p); });
                return { ...own, directors: wiki.directors, ...(haveActors ? {} : { actors: wiki.actors }), people };
            }
        } catch (e) { /* sin Wikidata no pasa nada */ }
    }
    return own;
}
async function fetchSourceDetails(meta, { fetchFn = fetch, tmdbKey = '' } = {}) {
    try {
        if (meta.source === 'tmdb' && tmdbKey) {
            const credits = parseTmdbCredits(await getJson(`https://api.themoviedb.org/3/${meta.externalId}/${/^tv\//.test(String(meta.externalId)) ? 'aggregate_credits' : 'credits'}?api_key=${enc(tmdbKey)}&language=es-ES`, { fetchFn }));
            // Las series también traen sus temporadas con los episodios de cada una (si falla, se sigue sin ellas)
            const info = await getJson(`https://api.themoviedb.org/3/${meta.externalId}?api_key=${enc(tmdbKey)}&language=es-ES`, { fetchFn }).catch(() => null);
            const seasons = info && /^tv\//.test(String(meta.externalId)) ? parseTmdbSeasons(info) : {};
            const extra = info ? parseTmdbInfo(info) : {};
            // Palabras clave de TMDB: etiquetas más específicas que los géneros
            const kw = await getJson(`https://api.themoviedb.org/3/${meta.externalId}/keywords?api_key=${enc(tmdbKey)}`, { fetchFn }).then(parseTmdbKeywords).catch(() => []);
            return { ...credits, ...seasons, ...extra, ...(kw.length ? { tags: joinTags(meta.tags, kw) } : {}) };
        }
        if (meta.source === 'jikan') {
            const cast = parseJikanCharacters(await getJson(`https://api.jikan.moe/v4/anime/${enc(meta.externalId)}/characters`, { fetchFn }));
            // La dirección es opcional: si falla su petición se sigue con el reparto
            const dirs = await getJson(`https://api.jikan.moe/v4/anime/${enc(meta.externalId)}/staff`, { fetchFn }).then(parseJikanStaff).catch(() => []);
            return { people: [...cast, ...dirs], actors: cast.map(p => p.name).join(', '), directors: dirs.map(p => p.name).join(', ') };
        }
        if (meta.source === 'tvmaze') return parseTvmazeDetails(await getJson(`https://api.tvmaze.com/shows/${enc(meta.externalId)}?embed[]=episodes&embed[]=cast`, { fetchFn }));
        if (meta.source === 'openlibrary' && !meta.synopsis) return parseOpenLibraryWork(await getJson(`https://openlibrary.org${meta.externalId}.json`, { fetchFn }));
    } catch (e) { /* los detalles son opcionales */ }
    return {};
}

/** Campos que se rellenarían: solo los que están vacíos en el formulario (lo que escribiste no se toca). */
const META_FIELDS = ['anilistId', 'tvmazeId', 'title', 'author', 'studio', 'platform', 'country', 'genre', 'year', 'actors', 'directors', 'pages', 'totalEpisodes', 'totalChapters', 'seasons', 'tags', 'synopsis', 'seriesType',
    'altTitle', 'airStatus', 'runtime', 'language', 'basedOn', 'score', 'officialUrl', 'publisher'];
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
        parseItunes, parseAniList, parseJikan, parseTmdbCredits, parseTmdbSeasons, seasonsFromSource, parseJikanCharacters, parseJikanStaff, parseTmdbInfo, airStatusEs, languageEs, basedOnEs, minutesFrom, scoreOf, pickWikidataItem, wikidataClaimIds, wikidataLabels, fetchWikidataCredits, parseTmdbKeywords, joinTags, metadataSources, searchMetadata, fetchMetadataDetails, mergeMetadata, ANILIST_QUERY, COUNTRY_ES
    };
}
