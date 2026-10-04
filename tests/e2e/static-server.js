'use strict';
// Servidor estático mínimo para probar la PWA (los service workers necesitan http/https).
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const TYPES = {
    '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.webmanifest': 'application/manifest+json', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml'
};

/**
 * Sirve el proyecto bajo /prefix/ (como GitHub Pages en /<repo>/). Devuelve { url, origin, close }.
 * Si se pasa un FakeSupabase, también atiende sus rutas bajo /sb/.
 */
function startServer(prefix = '/mi-mundo/', fakeSupabase = null) {
    const server = http.createServer((req, res) => {
        const { pathname } = new URL(req.url, 'http://localhost');
        if (fakeSupabase && pathname.startsWith('/sb/')) {
            const chunks = [];
            req.on('data', c => chunks.push(c));
            req.on('end', () => fakeSupabase.handle(req, res, pathname, Buffer.concat(chunks)));
            return;
        }
        if (!pathname.startsWith(prefix)) { res.writeHead(404).end(); return; }
        let rel = decodeURIComponent(pathname.slice(prefix.length)) || 'index.html';
        const file = path.normalize(path.join(ROOT, rel));
        if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404).end(); return; }
        res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
        fs.createReadStream(file).pipe(res);
    });
    return new Promise(resolve => server.listen(0, '127.0.0.1', () => {
        const origin = `http://127.0.0.1:${server.address().port}`;
        resolve({ url: origin + prefix, origin, close: () => new Promise(r => { server.closeAllConnections(); server.close(r); }) });
    }));
}

module.exports = { startServer };
