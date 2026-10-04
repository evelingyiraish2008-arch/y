# Mi Mundo 📚

Tu universo, organizado: libros, series, películas, anime, manhwas, personas, parejas BL, colecciones y notas.

## Usar la app

Abre `index.html` en el navegador. No necesita instalación ni servidor. Los datos se guardan en el `localStorage` del navegador (clave `mi_mundo_data_v16`).

Consejo: en **Personalizar → Copias de seguridad** puedes exportar o importar tus datos en JSON.

## Estructura

| Archivo | Contenido |
|---|---|
| `index.html` | Estructura de la página |
| `styles.css` | Estilos y temas (oscuro / claro) |
| `utils.js` | Constantes y funciones puras, sin DOM; se prueban con tests unitarios |
| `app.js` | Estado, renderizado, eventos e inicio (usa `utils.js`) |

No hay JavaScript en línea en el HTML, así que se puede añadir una Content Security Policy más adelante.

## Tests

```bash
npm install
npx playwright install chromium   # solo la primera vez
npm test                          # unitarios + de punta a punta
npm run test:unit                 # solo utils.js (node --test)
npm run test:e2e                  # solo Playwright (escritorio y móvil)
```

Los tests se ejecutan automáticamente en GitHub Actions en cada pull request.
