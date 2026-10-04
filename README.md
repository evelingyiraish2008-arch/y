# Mi Mundo 📚

Tu universo, organizado: libros, series, películas, anime, manhwas, personas, parejas BL, colecciones y notas.

## Usar la app

Abre `index.html` en el navegador. No necesita instalación ni servidor. Los datos se guardan en el `localStorage` del navegador (clave `mi_mundo_data_v16`).

Consejo: en **Personalizar → Copias de seguridad** puedes exportar o importar tus datos en JSON.

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
npm run test:e2e                  # solo Playwright (escritorio y móvil, incluida la PWA)
```

Los tests se ejecutan automáticamente en GitHub Actions en cada pull request.
