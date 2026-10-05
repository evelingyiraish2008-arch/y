/*
 * Mi Mundo · i18n.js
 * Idiomas de la interfaz: español (original), inglés y portugués. Detecta el idioma del navegador.
 * Traduce los textos fijos de la página (menú, títulos, botones, filtros, formularios y ajustes) y cambia el
 * formato de fechas y números. Los mensajes que genera la app al momento siguen en español.
 * Depende de utils.js (setAppLocale).
 */
'use strict';

const LANGS = { es: { label: 'Español', locale: 'es-ES' }, en: { label: 'English', locale: 'en-GB' }, pt: { label: 'Português', locale: 'pt-BR' } };
// [español, inglés, portugués]
const I18N_ROWS = [
    ['Inicio', 'Home', 'Início'], ['Libros', 'Books', 'Livros'], ['Series y Películas', 'Series & Movies', 'Séries e Filmes'], ['Anime', 'Anime', 'Anime'],
    ['Manhwas', 'Manhwas', 'Manhwas'], ['Solo BL', 'BL only', 'Só BL'], ['Personas', 'People', 'Pessoas'], ['Parejas BL', 'BL couples', 'Casais BL'],
    ['Centro de Emisión', 'Airing center', 'Central de exibição'], ['Gestión', 'Manage', 'Gestão'], ['Colecciones', 'Collections', 'Coleções'],
    ['Estadísticas', 'Statistics', 'Estatísticas'], ['Notas', 'Notes', 'Notas'], ['Personalizar', 'Customize', 'Personalizar'], ['Extras', 'Extras', 'Extras'],
    ['Buscar o ir a…', 'Search or go to…', 'Buscar ou ir para…'], ['Tu universo, organizado.', 'Your universe, organized.', 'Seu universo, organizado.'],
    ['Agregar obra', 'Add title', 'Adicionar obra'], ['Agregar', 'Add', 'Adicionar'], ['Agregar BL', 'Add BL', 'Adicionar BL'], ['Agregar persona', 'Add person', 'Adicionar pessoa'],
    ['Añadir pareja', 'Add couple', 'Adicionar casal'], ['Añadir pareja BL', 'Add BL couple', 'Adicionar casal BL'], ['Nueva colección', 'New collection', 'Nova coleção'],
    ['Filtros', 'Filters', 'Filtros'], ['Seleccionar', 'Select', 'Selecionar'], ['Continuar', 'Continue', 'Continuar'], ['Tus favoritos', 'Your favorites', 'Seus favoritos'],
    ['Agregados recientemente', 'Recently added', 'Adicionados recentemente'], ['Etiquetas más populares', 'Most used tags', 'Tags mais usadas'],
    ['Ver calendario →', 'See calendar →', 'Ver calendário →'], ['Más estadísticas →', 'More statistics →', 'Mais estatísticas →'],
    ['Tu biblioteca personal de lecturas.', 'Your personal reading library.', 'Sua biblioteca pessoal de leituras.'],
    ['Explora y organiza todas tus series a tu manera.', 'Explore and organize all your shows your way.', 'Explore e organize todas as suas séries do seu jeito.'],
    ['Tu colección de animes con seguimiento de episodios.', 'Your anime collection with episode tracking.', 'Sua coleção de animes com acompanhamento de episódios.'],
    ['Tu colección de manhwas con seguimiento de capítulos.', 'Your manhwa collection with chapter tracking.', 'Sua coleção de manhwas com acompanhamento de capítulos.'],
    ['Todas tus obras BL, unificadas en un solo lugar.', 'All your BL titles in one place.', 'Todas as suas obras BL em um só lugar.'],
    ['Actores, autores, directores y más.', 'Actors, authors, directors and more.', 'Atores, autores, diretores e mais.'],
    ['Todas las parejas BL que forman parte de tu colección.', 'All the BL couples in your collection.', 'Todos os casais BL da sua coleção.'],
    ['Todo lo que estás siguiendo, organizado por día de emisión.', 'Everything you follow, organized by airing day.', 'Tudo o que você acompanha, por dia de exibição.'],
    ['Crea listas personalizadas para organizar tus obras.', 'Create custom lists to organize your titles.', 'Crie listas personalizadas para organizar suas obras.'],
    ['Descubre tu progreso y tus hábitos.', 'Discover your progress and habits.', 'Descubra seu progresso e seus hábitos.'],
    ['Tus pensamientos, teorías y reseñas.', 'Your thoughts, theories and reviews.', 'Seus pensamentos, teorias e resenhas.'],
    ['Los cambios se guardan automáticamente.', 'Changes are saved automatically.', 'As alterações são salvas automaticamente.'],
    ['Estado', 'Status', 'Status'], ['Estado: todos', 'Status: all', 'Status: todos'], ['Leyendo', 'Reading', 'Lendo'], ['Viendo', 'Watching', 'Assistindo'],
    ['Terminado', 'Finished', 'Concluído'], ['Terminadas', 'Finished', 'Concluídas'], ['Quiero leer', 'Want to read', 'Quero ler'], ['Quiero ver', 'Want to watch', 'Quero ver'],
    ['Abandonado', 'Dropped', 'Abandonado'], ['Pendientes', 'Planned', 'Pendentes'], ['Pendiente', 'Planned', 'Pendente'], ['Todas', 'All', 'Todas'], ['Siempre', 'All time', 'Sempre'],
    ['Ordenar: recientes', 'Sort: recent', 'Ordenar: recentes'], ['Ordenar: mi calificación', 'Sort: my rating', 'Ordenar: minha nota'], ['Ordenar: nombre', 'Sort: name', 'Ordenar: nome'],
    ['Valoración', 'Rating', 'Avaliação'], ['Título A-Z', 'Title A-Z', 'Título A-Z'], ['Páginas', 'Pages', 'Páginas'], ['Progreso', 'Progress', 'Progresso'],
    ['Episodios', 'Episodes', 'Episódios'], ['Capítulos', 'Chapters', 'Capítulos'], ['Año', 'Year', 'Ano'], ['Año: todos', 'Year: all', 'Ano: todos'], ['Tipo: todos', 'Type: all', 'Tipo: todos'],
    ['Spicy: todos', 'Spicy: all', 'Spicy: todos'], ['Tristeza: todos', 'Sadness: all', 'Tristeza: todos'], ['Favoritos', 'Favorites', 'Favoritos'], ['Favorito', 'Favorite', 'Favorito'],
    ['Favorita', 'Favorite', 'Favorita'], ['Favoritas', 'Favorites', 'Favoritas'], ['Mejor valoradas', 'Top rated', 'Mais bem avaliadas'], ['Más recientes', 'Most recent', 'Mais recentes'],
    ['Recientes', 'Recent', 'Recentes'], ['Fechas: cualquiera', 'Dates: any', 'Datas: qualquer'], ['Este mes', 'This month', 'Este mês'], ['Últimos 3 meses', 'Last 3 months', 'Últimos 3 meses'],
    ['Este año', 'This year', 'Este ano'], ['Año pasado', 'Last year', 'Ano passado'], ['Últimos 12 meses', 'Last 12 months', 'Últimos 12 meses'],
    ['Serie', 'Series', 'Série'], ['Series', 'Series', 'Séries'], ['Película', 'Movie', 'Filme'], ['Variedad', 'Variety', 'Variedades'], ['Libro', 'Book', 'Livro'], ['Manhwa', 'Manhwa', 'Manhwa'],
    ['Series / Películas', 'Series / Movies', 'Séries / Filmes'], ['Estantería', 'Shelf', 'Estante'], ['Tarjetas', 'Cards', 'Cartões'], ['Lista', 'List', 'Lista'], ['Tabla', 'Table', 'Tabela'], ['Mosaico', 'Mosaic', 'Mosaico'],
    ['Todas las personas', 'Everyone', 'Todas as pessoas'], ['General', 'Overview', 'Geral'], ['Top con más obras', 'Most titles', 'Com mais obras'], ['Galería BL', 'BL gallery', 'Galeria BL'],
    ['Ranking de parejas', 'Couples ranking', 'Ranking de casais'], ['Calendario semanal', 'Weekly calendar', 'Calendário semanal'], ['En curso sin día asignado', 'In progress without a day', 'Em andamento sem dia'],
    ['Esta semana', 'This week', 'Esta semana'], ['Hoy', 'Today', 'Hoje'], ['En curso', 'In progress', 'Em andamento'],
    ['Lunes', 'Monday', 'Segunda'], ['Martes', 'Tuesday', 'Terça'], ['Miércoles', 'Wednesday', 'Quarta'], ['Jueves', 'Thursday', 'Quinta'], ['Viernes', 'Friday', 'Sexta'], ['Sábado', 'Saturday', 'Sábado'], ['Domingo', 'Sunday', 'Domingo'],
    ['Tu año en Mi Mundo', 'Your year in Mi Mundo', 'Seu ano no Mi Mundo'], ['Tu actividad', 'Your activity', 'Sua atividade'], ['Reto anual', 'Yearly challenge', 'Desafio anual'],
    ['Comparativas', 'Comparisons', 'Comparações'], ['Este año frente al anterior', 'This year vs last year', 'Este ano vs o anterior'], ['Tus temporadas', 'Your seasons', 'Suas temporadas'],
    ['Ritmo y proyección', 'Pace and projection', 'Ritmo e projeção'], ['Descubrimientos', 'Discoveries', 'Descobertas'], ['Tus rankings', 'Your rankings', 'Seus rankings'],
    ['Notas por tipo', 'Ratings by type', 'Notas por tipo'], ['¿De qué época son?', 'From which era?', 'De que época são?'], ['Lo que más valoras', 'What you value most', 'O que você mais valoriza'],
    ['Lo que más repites', 'What you rewatch most', 'O que você mais repete'], ['Tus notas', 'Your notes', 'Suas notas'], ['Notas por mes', 'Notes per month', 'Notas por mês'],
    ['Tus palabras', 'Your words', 'Suas palavras'], ['Cuándo escribes', 'When you write', 'Quando você escreve'], ['Terminadas por mes', 'Finished per month', 'Concluídas por mês'],
    ['Estado de tu colección', 'Collection status', 'Status da coleção'], ['Tiempo por tipo', 'Time by type', 'Tempo por tipo'], ['Tus valoraciones', 'Your ratings', 'Suas avaliações'],
    ['Mapa de emociones', 'Emotion map', 'Mapa de emoções'], ['Etiquetas más frecuentes', 'Most frequent tags', 'Tags mais frequentes'], ['Países', 'Countries', 'Países'],
    ['Plataformas', 'Platforms', 'Plataformas'], ['Logros', 'Achievements', 'Conquistas'], ['Ver tabla', 'Show table', 'Ver tabela'], ['Rankings y distribuciones de:', 'Rankings and distributions for:', 'Rankings e distribuições de:'],
    ['Tu perfil', 'Your profile', 'Seu perfil'], ['Tu nombre', 'Your name', 'Seu nome'], ['Color principal', 'Accent color', 'Cor principal'], ['Tamaño de la interfaz', 'Interface size', 'Tamanho da interface'],
    ['Pequeño', 'Small', 'Pequeno'], ['Fotos de personas', 'People photos', 'Fotos de pessoas'], ['Completa (sin recorte)', 'Full (no crop)', 'Completa (sem corte)'], ['Rellenar (con recorte)', 'Fill (crop)', 'Preencher (com corte)'],
    ['Tema', 'Theme', 'Tema'], ['Modo oscuro', 'Dark mode', 'Modo escuro'], ['Más personalización', 'More customization', 'Mais personalização'], ['Etiquetas', 'Tags', 'Tags'],
    ['Gestionar etiquetas', 'Manage tags', 'Gerenciar tags'], ['Renombra, une, colorea o pon un emoji a tus etiquetas.', 'Rename, merge, color or add an emoji to your tags.', 'Renomeie, una, colora ou ponha um emoji nas suas tags.'],
    ['Avisos', 'Notifications', 'Avisos'], ['Búsqueda de datos', 'Data lookup', 'Busca de dados'], ['Sincronización en la nube', 'Cloud sync', 'Sincronização na nuvem'], ['App', 'App', 'App'],
    ['Instalar Mi Mundo', 'Install Mi Mundo', 'Instalar Mi Mundo'], ['Almacenamiento', 'Storage', 'Armazenamento'], ['Optimizar imágenes guardadas', 'Optimize saved images', 'Otimizar imagens salvas'],
    ['Copias de seguridad', 'Backups', 'Backups'], ['Exportar datos (JSON)', 'Export data (JSON)', 'Exportar dados (JSON)'], ['Importar datos (JSON)', 'Import data (JSON)', 'Importar dados (JSON)'],
    ['Importar de otras apps', 'Import from other apps', 'Importar de outros apps'], ['Exportar a CSV (Excel)', 'Export to CSV (Excel)', 'Exportar para CSV (Excel)'], ['Borrar todos los datos', 'Delete all data', 'Apagar todos os dados'],
    ['Papelera', 'Trash', 'Lixeira'], ['Historial', 'History', 'Histórico'], ['Restaurar apariencia', 'Reset appearance', 'Restaurar aparência'], ['Idioma', 'Language', 'Idioma'],
    ['Todo se guarda en este navegador. Exporta una copia de vez en cuando para no perder nada.', 'Everything is saved in this browser. Export a copy now and then so you never lose anything.', 'Tudo fica salvo neste navegador. Exporte uma cópia de vez em quando para não perder nada.'],
    ['Cancelar', 'Cancel', 'Cancelar'], ['Guardar', 'Save', 'Salvar'], ['Listo', 'Done', 'Pronto'], ['Título *', 'Title *', 'Título *'], ['Nombre de la obra', 'Title name', 'Nome da obra'],
    ['Tipo', 'Type', 'Tipo'], ['Autor', 'Author', 'Autor'], ['Estudio', 'Studio', 'Estúdio'], ['Plataforma', 'Platform', 'Plataforma'], ['País', 'Country', 'País'], ['Género', 'Genre', 'Gênero'],
    ['Actores (separados por comas)', 'Cast (comma separated)', 'Elenco (separado por vírgulas)'], ['Directores (separados por comas)', 'Directors (comma separated)', 'Diretores (separados por vírgulas)'],
    ['Total de páginas', 'Total pages', 'Total de páginas'], ['Total de episodios', 'Total episodes', 'Total de episódios'], ['Total de capítulos', 'Total chapters', 'Total de capítulos'],
    ['Temporadas', 'Seasons', 'Temporadas'], ['Temporada', 'Season', 'Temporada'], ['Día de emisión', 'Airing day', 'Dia de exibição'], ['Sin asignar', 'Not set', 'Sem dia'],
    ['Fecha de inicio', 'Start date', 'Data de início'], ['Fecha de fin', 'End date', 'Data de término'], ['Etiquetas (separadas por comas)', 'Tags (comma separated)', 'Tags (separadas por vírgulas)'],
    ['Sinopsis', 'Synopsis', 'Sinopse'], ['¿De qué trata?', 'What is it about?', 'Do que se trata?'], ['Es BL', 'Is BL', 'É BL'], ['Subir imagen', 'Upload image', 'Enviar imagem'], ['Buscar portada', 'Find cover', 'Buscar capa'],
    ['Rellenar datos por el título', 'Fill in data from the title', 'Preencher dados pelo título'], ['Modo rápido', 'Quick mode', 'Modo rápido'], ['Tiene varias temporadas', 'Has several seasons', 'Tem várias temporadas'],
    ['Se reduce automáticamente para ahorrar espacio.', 'Automatically resized to save space.', 'Reduzida automaticamente para economizar espaço.'], ['…o pega una URL', '…or paste a URL', '…ou cole uma URL'],
    ['Nombre', 'Name', 'Nome'], ['Nombre *', 'Name *', 'Nome *'], ['Descripción', 'Description', 'Descrição'], ['Rol', 'Role', 'Função'], ['Nacionalidad', 'Nationality', 'Nacionalidade'],
    ['Fecha de nacimiento', 'Birth date', 'Data de nascimento'], ['Biografía', 'Biography', 'Biografia'], ['Spicy', 'Spicy', 'Spicy'], ['Tristeza', 'Sadness', 'Tristeza'],
    ['Buscar…', 'Search…', 'Buscar…'], ['Buscar… (prueba: BL nota:5)', 'Search… (try: BL nota:5)', 'Buscar… (tente: BL nota:5)'], ['Buscar en notas…', 'Search notes…', 'Buscar nas notas…'],
    ['Buscar por nombre…', 'Search by name…', 'Buscar por nome…'], ['Buscar parejas…', 'Search couples…', 'Buscar casais…'], ['Buscar en BL…', 'Search BL…', 'Buscar em BL…'],
    ['Título, autor o etiqueta…', 'Title, author or tag…', 'Título, autor ou tag…'], ['Título, actor o etiqueta…', 'Title, cast or tag…', 'Título, ator ou tag…'], ['Título, estudio o etiqueta…', 'Title, studio or tag…', 'Título, estúdio ou tag…'],
    ['Busca obras, personas… o escribe una acción', 'Search titles, people… or type an action', 'Busque obras, pessoas… ou digite uma ação'],
    ['Sin conexión · tus datos siguen disponibles', 'Offline · your data is still available', 'Sem conexão · seus dados continuam disponíveis'], ['Cargando…', 'Loading…', 'Carregando…'],
    ['Comentarios', 'Comments', 'Comentários'], ['Reseñas', 'Reviews', 'Resenhas'], ['Teorías', 'Theories', 'Teorias'], ['Citas', 'Quotes', 'Citações'], ['Recordatorios', 'Reminders', 'Lembretes'],
    ['Cronología', 'Timeline', 'Linha do tempo'], ['Diario', 'Diary', 'Diário'], ['¿Cómo te sientes?', 'How do you feel?', 'Como você se sente?'], ['Adivina', 'Guess', 'Adivinhe'],
    ['Retos', 'Challenges', 'Desafios'], ['Limpieza', 'Cleanup', 'Limpeza'], ['Preguntas', 'Questions', 'Perguntas'], ['Plantillas', 'Templates', 'Modelos'],
    ['Tu historia, juegos, retos y curiosidades sobre tu colección.', 'Your story, games, challenges and fun facts about your collection.', 'Sua história, jogos, desafios e curiosidades da sua coleção.'],
    ['Presentar favoritas', 'Present favorites', 'Apresentar favoritas'], ['Añadir a mi calendario (.ics)', 'Add to my calendar (.ics)', 'Adicionar ao meu calendário (.ics)'],
    ['Solo lectura', 'Read-only', 'Somente leitura'], ['Tour guiado', 'Guided tour', 'Tour guiado'], ['Guardar desde otras webs', 'Save from other websites', 'Salvar de outros sites'],
    ['Escanear ISBN', 'Scan ISBN', 'Escanear ISBN']
];
const I18N = { en: new Map(), pt: new Map() };
I18N_ROWS.forEach(([es, en, pt]) => { I18N.en.set(es, en); I18N.pt.set(es, pt); });

let currentLang = 'es';
const originals = new WeakMap();   // nodo de texto → texto original en español
const originalAttrs = new WeakMap(); // elemento → { placeholder, title, aria-label } originales

/** Idioma a usar: el elegido; con 'auto', el del navegador; sin elegir, español. */
function detectLang(setting) {
    if (setting && LANGS[setting]) return setting;
    if (setting !== 'auto') return 'es';
    const nav = (typeof navigator !== 'undefined' && (navigator.languages || [navigator.language]) || []).map(l => String(l).slice(0, 2).toLowerCase());
    return nav.find(l => LANGS[l]) || 'es';
}
/** Traduce un texto (manteniendo el emoji o símbolo del principio y el espacio de alrededor). */
function translateText(text, lang = currentLang) {
    if (lang === 'es' || !I18N[lang]) return text;
    const m = String(text).match(/^(\s*[^\p{L}\d¿¡…]*\s*)([\s\S]*?)(\s*)$/u);
    if (!m) return text;
    const tr = I18N[lang].get(m[2]);
    return tr ? m[1] + tr + m[3] : text;
}
const I18N_SELECTOR = '.nav-item .label, .nav-section-title, .sidebar-search .label, .logo-text p, .page-title, .page-subtitle, .section-title, .panel-title, .viz-title, .viz-sub, .btn, .tab, .chip, option, .checkbox-wrapper, .field > span, .stat-label, .modal-title, .filter-label, .section-link, .offline-pill, .hint, .panel-desc, .t-title, .kpi-label';
/** Traduce los textos fijos dentro de root (y los vuelve a poner en español si el idioma es es). */
function translateUI(root = document.body) {
    if (typeof document === 'undefined') return;
    const els = root.matches && root.matches(I18N_SELECTOR) ? [root, ...root.querySelectorAll(I18N_SELECTOR)] : [...root.querySelectorAll(I18N_SELECTOR)];
    els.forEach(el => {
        el.childNodes.forEach(n => {
            if (n.nodeType !== 3 || !n.nodeValue.trim()) return;
            if (!originals.has(n)) originals.set(n, n.nodeValue);
            const next = translateText(originals.get(n));
            if (n.nodeValue !== next) n.nodeValue = next;
        });
    });
    root.querySelectorAll('[placeholder], [title], [aria-label]').forEach(el => {
        if (!originalAttrs.has(el)) originalAttrs.set(el, { placeholder: el.getAttribute('placeholder'), title: el.getAttribute('title'), 'aria-label': el.getAttribute('aria-label') });
        const o = originalAttrs.get(el);
        ['placeholder', 'title', 'aria-label'].forEach(a => { if (o[a]) el.setAttribute(a, translateText(o[a])); });
    });
}
function applyLanguage(setting) {
    currentLang = detectLang(setting);
    setAppLocale(LANGS[currentLang].locale);
    document.documentElement.lang = currentLang;
    translateUI(document.body);
}

if (typeof module !== 'undefined' && module.exports) module.exports = { LANGS, detectLang, translateText, I18N_ROWS };
