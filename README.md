# Mi Mundo 📚

Tu universo, organizado: libros, series, películas, anime, manhwas, personas, parejas BL, colecciones y notas.

## Usar la app

Abre `index.html` en el navegador. No necesita instalación ni servidor.

Los datos se guardan en **IndexedDB** dentro del navegador, sin el límite de unos 5 MB de `localStorage`. Las imágenes subidas se guardan como archivos (Blob) aparte, y solo se escriben los registros que cambian.

- **Migración automática:** si tenías datos de la versión anterior (`localStorage`, clave `mi_mundo_data_v16`), se pasan solos a IndexedDB la primera vez. Los datos antiguos se conservan como respaldo con la clave `mi_mundo_data_v16_respaldo`.
- **Respaldo:** si el navegador no admite IndexedDB, la app sigue usando `localStorage`.
- **Varias pestañas:** los cambios se sincronizan entre pestañas abiertas.

Consejo: en **Personalizar → Copias de seguridad** puedes exportar o importar tus datos en JSON.

## Funciones destacadas

- **Inicio:** banner con lo último en curso, fila "Hoy" (racha, reto anual y emisiones), cita del día, consejo del día y tour guiado.
- **Seguridad de tus datos:** papelera de 30 días, deshacer/rehacer (Ctrl+Z / Ctrl+Shift+Z) con historial, historial de versiones de cada obra, bloqueo, borrador automático del formulario y aviso de títulos parecidos.
- **Coherencia:** gestor de etiquetas (renombrar, unir, color, emoji), parejas BL vinculadas a dos personas, temporadas o sagas por bloques (con dos barras: la temporada en la que vas y la serie completa, episodios uno a uno, lo que falta y el tiempo restante; “Rellenar datos” trae las temporadas con sus episodios de TVmaze o TMDB), varias notas por obra (comentario, reseña con criterios, teoría, cita, recordatorio) y relecturas/re-visionados.
- **Ahorro de tiempo:** rellenar datos y portadas por el título (AniList, MyAnimeList, Open Library, Google Books, TVmaze y TMDB opcional), importar de Goodreads/CSV, MyAnimeList, AniList y JSON, exportar a CSV, selección múltiple, modo rápido y autocompletado.
- **Experiencia:** atajos de teclado (pulsa `?`), modo foco, vistas de tabla/estantería/mosaico, álbum de personas, celebraciones, sonidos opcionales, estilos (Neón, Minimalista, Papel, Retro terminal, Océano), fondos, avatar, densidad, colores por tipo y menú ordenable.
- **📊 Estadísticas:** actividad, reto, comparativas, ritmo y proyección, rankings, distribuciones, notas, descubrimientos y “Tu año en Mi Mundo” para compartir.
- **🔔 Avisos:** recordatorio diario, episodios de hoy (y fechas reales de AniList/TVmaze), resumen semanal, racha en peligro, inactividad y recordatorios por obra; en Android con la app instalada también en segundo plano.
- **Búsqueda avanzada** en cualquier buscador: `BL nota:5`, `estado:pendiente año:>2020`, `tag:x tag:y`, `autor:"Mo Xiang"`, `-tag:drama`, `tipo:anime o tipo:manhwa`. Colecciones inteligentes, vistas guardadas, filtro por fechas y obras parecidas.
- **Buscar en internet**: el buscador global también encuentra etiquetas y personas (por cualquiera de sus nombres) y, al final, ofrece Google y Pinterest con lo que escribiste. Cada obra, persona y pareja tiene un botón 🌐 con búsquedas sugeridas (reparto, sinopsis, etiquetas, dónde verla…). Se abren en otra pestaña: no hace falta clave ni cuenta.
- **▶ Dónde verla / leerla:** cada obra guarda sus enlaces (Netflix, Viki, WeTV, iQIYI, Webtoon… o cualquier otra web, como Doramasia). Un botón **Ver ahora** (también en Inicio) los abre sin enlazar ninguna cuenta. Con `{n}` en la dirección te lleva al próximo episodio; con la clave de TMDB dice en qué plataformas está disponible en tu país.
- **💕 Parejas BL:** tarjetas con las dos fotos, nombre de ship (PoohPavel) como nombre principal que se busca con o sin espacios, y una etiqueta suave de cómo van (Recién juntos · Pareja consolidada · Trabajaron juntos) que se calcula con tus obras y puedes cambiar. La ficha trae primera y última obra juntos y su línea de tiempo. Las personas llevan nombre artístico como principal, y nombre nativo y de nacimiento aparte (se les encuentra por cualquiera).
- **🖼️ Banners:** cabecera con banner en obras, personas, parejas, colecciones y tu perfil. Se sube, se pega un enlace o se busca; se recorta solo a 3:1 y hay un editor (zoom, girar, voltear, proporciones, cuadrícula).
- **🔗 Personas vinculadas:** autor, actores y directores se escriben como chips con sugerencias y nombres parecidos; si no existe se crea al momento (con foto buscada en internet). Seudónimos, varios roles, reparto con personajes, pestaña “Personajes” y limpieza de personas huérfanas. Al guardar una obra, los nombres nuevos se crean solos en Personas y sus fotos se buscan en segundo plano (primero las del reparto que trae “Rellenar datos”: TVmaze, AniList, TMDB, Open Library). Para las obras que ya tenías, Personas avisa de los nombres sin ficha y los crea de una vez.
- **🔍 Buscador de imágenes:** AniList, TMDB, Wikipedia, Wikimedia Commons, MyAnimeList, Open Library y Google (con tu clave). Pinterest, Google Imágenes y Bing no permiten buscar desde otras apps: se abren en otra pestaña y se pega el enlace de la imagen (o la imagen copiada).
- **🎨 Moodboards** por obra, persona (Editorial, Casual, Eventos…) y pareja (Oficial, Behind the scenes, Fanart, Moments), con filtros por forma y enlace a su origen.
- **Contenido de cada obra:** citas, moodboard, personajes, banda sonora, premios y curiosidades. Colecciones ordenables y compartibles (enlace que caduca o imagen).
- **✨ Extras:** cronología, diario, “¿cómo te sientes hoy?”, adivina por la portada, retos, limpieza y preguntas sobre tus datos.
- **Más:** español, inglés o portugués; calendario `.ics`; marcador “➕ Mi Mundo” para guardar desde otras webs; escáner de ISBN (navegadores con BarcodeDetector); modo solo lectura y presentación.

## Sincronizar entre dispositivos (Supabase, opcional)

Sin configurar nada, todo se queda en tu navegador. Para tener tus datos en el móvil y en el ordenador, conéctala a tu propio proyecto gratuito de [Supabase](https://supabase.com):

1. Crea un proyecto en supabase.com.
2. En **SQL Editor → New query**, pega el contenido de [`supabase/schema.sql`](supabase/schema.sql) y pulsa **Run**. Crea la tabla, las reglas de seguridad (cada persona solo ve sus datos) y el espacio para las imágenes.
3. En **Authentication → URL Configuration**, pon en *Site URL* la dirección donde usas la app (por ejemplo `https://<usuario>.github.io/<repositorio>/`) para que funcionen los correos de confirmación.
4. En **Project Settings → API**, copia la *Project URL* y la clave *anon public*.
5. En la app: **Personalizar → ☁️ Sincronización en la nube**, pega la URL y la clave, pulsa **Conectar** y crea tu cuenta.
6. En tus otros dispositivos, repite el paso 5 y entra con la misma cuenta.

Cómo funciona:
- Cada obra, persona, nota… se guarda como un documento. Si cambias lo mismo en dos dispositivos, gana el cambio más reciente.
- Los borrados también se sincronizan y no vuelven a aparecer.
- Sin conexión, los cambios esperan en una cola y se envían al volver la red. Se sincroniza al guardar, al volver a la app y cada minuto.
- Las imágenes subidas se guardan en una carpeta privada de Supabase Storage.
- Un dispositivo nuevo que solo tiene los datos de ejemplo usa directamente los de la nube. Si ya tiene datos propios, te pregunta si quieres unirlos o quedarte solo con los de la nube.
- La clave *anon* es pública por diseño. La seguridad la dan las reglas de `schema.sql` y tu contraseña.

## Instalar como app (PWA)

Mi Mundo se puede instalar en el móvil o el ordenador y funciona sin conexión. Para ello tiene que abrirse desde una dirección web (`https://…`), no como archivo local.

**Publicarla en GitHub Pages (una sola vez):** en el repositorio, ve a **Settings → Pages** y en *Source* elige **GitHub Actions**. Cada vez que se actualice `main`, el workflow `Publicar en GitHub Pages` la publica en `https://<usuario>.github.io/<repositorio>/`.

Después, ábrela en el navegador y pulsa **Personalizar → 📲 Instalar Mi Mundo** (en iPhone: Compartir → *Añadir a pantalla de inicio*).

## Estructura

| Archivo | Contenido |
|---|---|
| `index.html` | Estructura de la página |
| `styles.css` | Estilos y temas (oscuro / claro) |
| `utils.js` | Constantes y funciones puras, sin DOM; se prueban con tests unitarios |
| `insights.js` | Cálculos de estadísticas, rachas, reto anual, avisos y “¿Qué veo hoy?” (sin DOM) |
| `charts.js` | Gráficos en HTML/CSS con tooltip y tabla equivalente |
| `storage.js` | Persistencia: IndexedDB (y `localStorage` como respaldo), imágenes y migración |
| `sync.js` | Motor de sincronización (sin DOM; se prueba con tests unitarios) |
| `cloud.js` | Conexión con Supabase, cuenta y panel de la nube |
| `vendor/supabase.js` | Cliente oficial de Supabase (se regenera con `npm run vendor`) |
| `supabase/schema.sql` | Tabla, reglas de seguridad e imágenes para Supabase |
| `history.js` | Papelera, deshacer, versiones, duplicar y títulos parecidos (sin DOM) |
| `coherence.js` | Etiquetas, parejas, temporadas, notas y relecturas (sin DOM) |
| `metadata.js`, `importers.js` | Búsqueda de datos en servicios públicos e importación de otras apps (sin DOM) |
| `analytics.js`, `notify.js`, `query.js`, `extras.js` | Estadísticas avanzadas, avisos, búsqueda avanzada y extras (sin DOM) |
| `mediakit.js`, `peoplekit.js` | Recortes, enlaces, fuentes de imágenes y vínculos de personas (sin DOM) |
| `media.js`, `imagefind.js`, `people.js`, `moodboard.js` | Banners y editor de recorte, buscador de imágenes, personas con chips y moodboards |
| `i18n.js` | Idiomas de la interfaz |
| `features.js`, `tools.js`, `ux.js`, `statsplus.js`, `alerts.js`, `manage.js`, `content.js`, `play.js` | Pantallas de cada grupo de funciones |
| `app.js` | Estado, renderizado, eventos e inicio |
| `sw.js` | Service worker: funcionamiento sin conexión |
| `manifest.webmanifest`, `icons/` | Datos e iconos para instalar la app |

No hay JavaScript en línea en el HTML, así que se puede añadir una Content Security Policy más adelante.

## Tests

```bash
npm install
npx playwright install chromium   # solo la primera vez
npm test                          # unitarios + de punta a punta
npm run test:unit                 # funciones sin DOM (node --test)
npm run test:e2e                  # solo Playwright (escritorio y móvil, incluidas la PWA y la nube)
DATABASE_URL=postgres://… npm run test:sql   # prueba supabase/schema.sql en un PostgreSQL
```

Los tests de la nube usan un Supabase simulado (`tests/e2e/fake-supabase.js`), así que no necesitan cuenta. Todos se ejecutan automáticamente en GitHub Actions en cada pull request, el de SQL con un PostgreSQL 16.
