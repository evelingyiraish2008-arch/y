/*
 * Mi Mundo · tagkit.js
 * Etiquetas más específicas: traducción al español de las etiquetas que traen las fuentes (AniList, MyAnimeList, TMDB)
 * y un catálogo de etiquetas detalladas (tropos, tono, ambientación…) para sugerir al escribir.
 * Funciones puras (sin DOM): se prueban con tests unitarios.
 */
'use strict';

/** Etiquetas de las fuentes (en inglés) → español. Las claves van en minúsculas. */
const TAG_ES = {
    // Relación y tropos
    'enemies to lovers': 'enemigos a amantes', 'friends to lovers': 'amigos a amantes', 'rivals to lovers': 'rivales a amantes',
    'childhood friends': 'amigos de la infancia', 'love triangle': 'triángulo amoroso', 'age gap': 'diferencia de edad',
    'fake relationship': 'relación falsa', 'fake dating': 'relación falsa', 'arranged marriage': 'matrimonio arreglado',
    'marriage': 'matrimonio', 'forbidden love': 'amor prohibido', 'unrequited love': 'amor no correspondido', 'first love': 'primer amor',
    'second chance': 'segunda oportunidad', 'slow burn': 'slow burn', 'found family': 'familia elegida', 'one-sided love': 'amor no correspondido',
    'cohabitation': 'convivencia', 'roommates': 'compañeros de piso', 'bodyguard': 'guardaespaldas', 'master-servant': 'amo y sirviente',
    'boss-employee': 'jefe y empleado', 'teacher-student': 'profesor y alumno', 'senpai-kouhai': 'senpai y kouhai', 'tsundere': 'tsundere',
    'yandere': 'yandere', 'possessive': 'posesivo', 'jealousy': 'celos', 'misunderstanding': 'malentendidos', 'miscommunication': 'malentendidos',
    'reunion': 'reencuentro', 'long-distance relationship': 'relación a distancia', 'secret relationship': 'relación secreta',
    'coming out': 'salir del armario', 'closeted': 'en el armario', 'omegaverse': 'omegaverse', 'mpreg': 'mpreg', 'reincarnation': 'reencarnación',
    'time loop': 'bucle temporal', 'time travel': 'viaje en el tiempo', 'transmigration': 'transmigración', 'villainess': 'villana',
    // Tono
    'angst': 'angustia', 'fluff': 'dulzura', 'wholesome': 'tierno', 'heartwarming': 'conmovedor', 'tragedy': 'tragedia', 'tearjerker': 'para llorar',
    'dark': 'oscuro', 'gritty': 'crudo', 'lighthearted': 'ligero', 'bittersweet': 'agridulce', 'happy ending': 'final feliz', 'sad ending': 'final triste',
    'melodrama': 'melodrama', 'cute': 'tierno', 'sweet': 'dulce', 'steamy': 'sensual', 'smut': 'erótico', 'explicit': 'explícito', 'mature': 'maduro',
    'cringe': 'vergüenza ajena', 'comfort': 'reconfortante', 'hurt/comfort': 'herir y consolar', 'redemption': 'redención', 'revenge': 'venganza',
    // Ambientación
    'college': 'universidad', 'university': 'universidad', 'high school': 'instituto', 'school': 'escolar', 'office': 'oficina', 'workplace': 'trabajo',
    'idol': 'ídolos', 'idols': 'ídolos', 'showbiz': 'mundo del espectáculo', 'entertainment industry': 'mundo del espectáculo', 'acting': 'actuación',
    'band': 'banda', 'music': 'música', 'cooking': 'cocina', 'food': 'comida', 'medicine': 'medicina', 'police': 'policía', 'detective': 'detectives',
    'mafia': 'mafia', 'gangster': 'mafia', 'yakuza': 'yakuza', 'royalty': 'realeza', 'palace': 'palacio', 'wuxia': 'wuxia', 'xianxia': 'xianxia',
    'cultivation': 'cultivo', 'martial arts': 'artes marciales', 'samurai': 'samuráis', 'ancient china': 'China antigua', 'historical': 'histórico',
    'period drama': 'drama de época', 'rural': 'rural', 'urban': 'urbano', 'summer': 'verano', 'travel': 'viajes', 'sports': 'deportes',
    'basketball': 'baloncesto', 'soccer': 'fútbol', 'football': 'fútbol', 'swimming': 'natación', 'tennis': 'tenis', 'volleyball': 'voleibol',
    'esports': 'esports', 'video games': 'videojuegos', 'virtual world': 'mundo virtual', 'magic': 'magia', 'vampire': 'vampiros', 'vampires': 'vampiros',
    'werewolf': 'hombres lobo', 'ghost': 'fantasmas', 'ghosts': 'fantasmas', 'demons': 'demonios', 'gods': 'dioses', 'angels': 'ángeles', 'dragons': 'dragones',
    'post-apocalyptic': 'postapocalíptico', 'dystopian': 'distópico', 'space': 'espacio', 'aliens': 'alienígenas', 'robots': 'robots', 'cyberpunk': 'cyberpunk',
    // Géneros, demografías y temas
    'shounen ai': 'BL', "boys' love": 'BL', 'boys love': 'BL', 'bl': 'BL', 'yaoi': 'BL', 'shoujo ai': 'GL', "girls' love": 'GL', 'yuri': 'GL',
    'slice of life': 'recuentos de la vida', 'coming of age': 'crecimiento personal', 'psychological': 'psicológico', 'supernatural': 'sobrenatural',
    'iyashikei': 'iyashikei', 'josei': 'josei', 'seinen': 'seinen', 'shounen': 'shonen', 'shoujo': 'shojo', 'isekai': 'isekai', 'harem': 'harén',
    'reverse harem': 'harén inverso', 'gender bender': 'cambio de género', 'cross-dressing': 'travestismo', 'transgender': 'transgénero', 'lgbt': 'LGBT',
    'adult cast': 'reparto adulto', 'male protagonist': 'protagonista masculino', 'female protagonist': 'protagonista femenina', 'ensemble cast': 'reparto coral',
    'anti-hero': 'antihéroe', 'villain': 'villano', 'amnesia': 'amnesia', 'illness': 'enfermedad', 'disability': 'discapacidad', 'trauma': 'trauma',
    'abuse': 'maltrato', 'bullying': 'acoso escolar', 'suicide': 'suicidio', 'death': 'muerte', 'family life': 'vida familiar', 'friendship': 'amistad',
    'adoption': 'adopción', 'pregnancy': 'embarazo', 'twins': 'gemelos', 'heartbreak': 'desamor', 'betrayal': 'traición', 'secrets': 'secretos',
    'mystery': 'misterio', 'thriller': 'suspense', 'suspense': 'suspense', 'horror': 'terror', 'comedy': 'comedia', 'romantic comedy': 'comedia romántica',
    'drama': 'drama', 'romance': 'romance', 'fantasy': 'fantasía', 'sci-fi': 'ciencia ficción', 'crime': 'crimen', 'war': 'bélico', 'political': 'política',
    'parody': 'parodia', 'satire': 'sátira', 'survival': 'supervivencia', 'time skip': 'salto en el tiempo',
    'thai bl': 'BL tailandés', 'korean bl': 'BL coreano', 'japanese bl': 'BL japonés', 'chinese bl': 'BL chino', 'danmei': 'danmei',
    'thai drama': 'drama tailandés', 'korean drama': 'drama coreano', 'chinese drama': 'drama chino', 'japanese drama': 'drama japonés', 'k-drama': 'drama coreano'
};
const tagLookup = t => String(t || '').trim().toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' ');
/** Traduce una etiqueta de una fuente al español; si no la conoce, la deja en minúsculas tal cual. */
function translateTagName(t) {
    const k = tagLookup(t);
    return TAG_ES[k] || k;
}

/** Catálogo de etiquetas detalladas que se ofrecen al escribir, por grupos. */
const TAG_CATALOG = [
    { group: 'Relación', tags: ['enemigos a amantes', 'amigos a amantes', 'rivales a amantes', 'slow burn', 'primer amor', 'segunda oportunidad', 'amor no correspondido', 'amor prohibido', 'relación falsa', 'matrimonio arreglado', 'convivencia', 'triángulo amoroso', 'diferencia de edad', 'amigos de la infancia', 'relación secreta', 'relación a distancia', 'celos', 'posesivo', 'reencuentro', 'salir del armario'] },
    { group: 'Quiénes son', tags: ['jefe y empleado', 'profesor y alumno', 'senpai y kouhai', 'guardaespaldas', 'amo y sirviente', 'compañeros de piso', 'tsundere', 'yandere', 'ídolos', 'actores', 'rivales'] },
    { group: 'Ambientación', tags: ['universidad', 'instituto', 'oficina', 'mundo del espectáculo', 'medicina', 'policía', 'mafia', 'realeza', 'wuxia', 'xianxia', 'China antigua', 'drama de época', 'deportes', 'música', 'cocina', 'rural', 'verano', 'viajes', 'videojuegos', 'postapocalíptico'] },
    { group: 'Tono', tags: ['dulzura', 'tierno', 'ligero', 'agridulce', 'angustia', 'para llorar', 'oscuro', 'tragedia', 'melodrama', 'comedia romántica', 'reconfortante', 'herir y consolar', 'final feliz', 'final abierto', 'final triste', 'sensual', 'vergüenza ajena'] },
    { group: 'Temas', tags: ['familia elegida', 'crecimiento personal', 'salud mental', 'trauma', 'redención', 'venganza', 'amistad', 'malentendidos', 'secretos', 'traición', 'acoso escolar', 'identidad', 'LGBT', 'reencarnación', 'viaje en el tiempo', 'transmigración', 'omegaverse', 'mpreg'] },
    { group: 'Origen', tags: ['BL tailandés', 'BL coreano', 'BL japonés', 'BL chino', 'BL taiwanés', 'BL filipino', 'danmei', 'drama tailandés', 'drama coreano', 'drama chino', 'drama japonés', 'webnovel'] }
];

const tagNorm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
/**
 * Etiquetas del catálogo para una obra. Con `typed` (lo último que está escribiendo) autocompleta;
 * sin él, ofrece las más típicas según sea BL o no y según su país. No repite las que ya tiene (`own`).
 */
function catalogSuggest(work, { typed = '', own = [], limit = 12 } = {}) {
    const have = new Set(own.map(tagNorm));
    const q = tagNorm(typed);
    if (q) {
        const all = [...new Set(TAG_CATALOG.flatMap(g => g.tags))].filter(t => !have.has(tagNorm(t)));
        const starts = all.filter(t => tagNorm(t).split(' ').some(w => w.startsWith(q)));
        return [...starts, ...all.filter(t => !starts.includes(t) && tagNorm(t).includes(q))].slice(0, limit);
    }
    const origin = tagNorm(work.country);
    const byCountry = /tailand/.test(origin) ? ['BL tailandés', 'drama tailandés'] : /corea/.test(origin) ? ['BL coreano', 'drama coreano']
        : /japon/.test(origin) ? ['BL japonés', 'drama japonés'] : /china/.test(origin) ? ['BL chino', 'drama chino', 'danmei'] : [];
    const typical = work.bl
        ? ['slow burn', 'enemigos a amantes', 'amigos a amantes', 'primer amor', 'universidad', 'dulzura', 'angustia', 'final feliz', 'relación falsa', 'diferencia de edad', 'familia elegida', 'comedia romántica']
        : ['familia elegida', 'crecimiento personal', 'amistad', 'agridulce', 'tragedia', 'redención', 'final feliz', 'oscuro', 'comedia romántica', 'reconfortante'];
    return [...new Set([...(work.bl ? byCountry : []), ...typical])].filter(t => !have.has(tagNorm(t))).slice(0, limit);
}
/** Grupos del catálogo sin las etiquetas que la obra ya tiene (para el panel "Más etiquetas"). */
function catalogGroups(own = []) {
    const have = new Set(own.map(tagNorm));
    return TAG_CATALOG.map(g => ({ group: g.group, tags: g.tags.filter(t => !have.has(tagNorm(t))) })).filter(g => g.tags.length);
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { TAG_ES, TAG_CATALOG, translateTagName, catalogSuggest, catalogGroups };
}
