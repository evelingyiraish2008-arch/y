# Mi Mundo 📚

Tu universo, organizado: libros, series, películas, anime, manhwas, personas, parejas BL, colecciones y notas.

## Usar la app

Abre `index.html` en el navegador. No necesita instalación ni servidor.

Los datos se guardan en **IndexedDB** dentro del navegador, sin el límite de unos 5 MB de `localStorage`. Las imágenes subidas se guardan como archivos (Blob) aparte, y solo se escriben los registros que cambian.

- **Migración automática:** si tenías datos de la versión anterior (`localStorage`, clave `mi_mundo_data_v16`), se pasan solos a IndexedDB la primera vez. Los datos antiguos se conservan como respaldo con la clave `mi_mundo_data_v16_respaldo`.
- **Respaldo:** si el navegador no admite IndexedDB, la app sigue usando `localStorage`.
- **Varias pestañas:** los cambios se sincronizan entre pestañas abiertas.

Consejo: en **Personalizar → Copias de seguridad** puedes exportar o importar tus datos en JSON.

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
| `storage.js` | Persistencia: IndexedDB (y `localStorage` como respaldo), imágenes y migración |
| `sync.js` | Motor de sincronización (sin DOM; se prueba con tests unitarios) |
| `cloud.js` | Conexión con Supabase, cuenta y panel de la nube |
| `vendor/supabase.js` | Cliente oficial de Supabase (se regenera con `npm run vendor`) |
| `supabase/schema.sql` | Tabla, reglas de seguridad e imágenes para Supabase |
| `app.js` | Estado, renderizado, eventos e inicio (usa `utils.js`) |
| `sw.js` | Service worker: funcionamiento sin conexión |
| `manifest.webmanifest`, `icons/` | Datos e iconos para instalar la app |

No hay JavaScript en línea en el HTML, así que se puede añadir una Content Security Policy más adelante.

## Tests

```bash
npm install
npx playwright install chromium   # solo la primera vez
npm test                          # unitarios + de punta a punta
npm run test:unit                 # solo utils.js (node --test)
npm run test:e2e                  # solo Playwright (escritorio y móvil, incluidas la PWA y la nube)
DATABASE_URL=postgres://… npm run test:sql   # prueba supabase/schema.sql en un PostgreSQL
```

Los tests de la nube usan un Supabase simulado (`tests/e2e/fake-supabase.js`), así que no necesitan cuenta. Todos se ejecutan automáticamente en GitHub Actions en cada pull request, el de SQL con un PostgreSQL 16.
