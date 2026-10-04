'use strict';
// Supabase falso para los tests: imita las rutas que usa el SDK (auth, rest/v1/items, storage)
// y aplica las mismas reglas que supabase/schema.sql (cada usuario solo ve lo suyo; gana el updated_at más reciente).
const crypto = require('crypto');

class FakeSupabase {
    constructor() { this.reset(); }
    reset() {
        this.users = new Map();   // email -> { id, email, password }
        this.rows = new Map();    // `${user}/${kind}/${id}` -> fila
        this.files = new Map();   // ruta -> { type, body }
        this.clock = 0;
        this.requests = [];
        this.offline = false;
    }
    serverAt() { return new Date(Date.UTC(2026, 0, 1) + ++this.clock).toISOString(); }
    session(user) {
        return {
            access_token: 'tok_' + user.id, token_type: 'bearer', expires_in: 3600,
            expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'ref_' + user.id,
            user: { id: user.id, aud: 'authenticated', role: 'authenticated', email: user.email, app_metadata: { provider: 'email' }, user_metadata: {}, created_at: new Date().toISOString() }
        };
    }
    userFromAuth(req) {
        const m = /^Bearer tok_(.+)$/.exec(req.headers.authorization || '');
        return m ? [...this.users.values()].find(u => u.id === m[1]) || null : null;
    }
    rowsOf(userId) { return [...this.rows.values()].filter(r => r.user_id === userId); }

    /** Devuelve true si atendió la petición. */
    handle(req, res, pathname, body) {
        if (!pathname.startsWith('/sb/')) return false;
        const url = new URL(req.url, 'http://localhost');
        const path = pathname.slice(3);
        this.requests.push(req.method + ' ' + path);
        const json = (status, data, headers = {}) => {
            res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
            res.end(data === undefined ? '' : JSON.stringify(data));
        };
        if (this.offline) { req.socket.destroy(); return true; }
        const parse = () => { try { return JSON.parse(body.toString('utf8') || 'null'); } catch (e) { return null; } };

        // ---- Auth ----
        if (path === '/auth/v1/signup' && req.method === 'POST') {
            const { email, password } = parse();
            if (this.users.has(email)) return json(422, { code: 422, error_code: 'user_already_exists', msg: 'User already registered' }), true;
            const user = { id: crypto.randomUUID(), email, password };
            this.users.set(email, user);
            return json(200, this.session(user)), true;
        }
        if (path === '/auth/v1/token' && req.method === 'POST') {
            const grant = url.searchParams.get('grant_type');
            const data = parse() || {};
            let user = null;
            if (grant === 'password') {
                const u = this.users.get(data.email);
                if (u && u.password === data.password) user = u;
            } else if (grant === 'refresh_token') {
                user = [...this.users.values()].find(u => 'ref_' + u.id === data.refresh_token) || null;
            }
            if (!user) return json(400, { error: 'invalid_grant', error_description: 'Invalid login credentials', error_code: 'invalid_credentials', msg: 'Invalid login credentials' }), true;
            return json(200, this.session(user)), true;
        }
        if (path === '/auth/v1/user' && req.method === 'GET') {
            const user = this.userFromAuth(req);
            return (user ? json(200, this.session(user).user) : json(401, { msg: 'invalid JWT' })), true;
        }
        if (path === '/auth/v1/logout') { res.writeHead(204).end(); return true; }

        // ---- Tabla items ----
        if (path === '/rest/v1/items') {
            const user = this.userFromAuth(req);
            if (!user) return json(401, { message: 'JWT required' }), true;
            if (req.method === 'GET') {
                let list = this.rowsOf(user.id);
                const gt = url.searchParams.get('server_at');
                if (gt && gt.startsWith('gt.')) list = list.filter(r => r.server_at > gt.slice(3));
                list.sort((a, b) => a.server_at.localeCompare(b.server_at));
                const limit = Number(url.searchParams.get('limit')) || list.length;
                const cols = (url.searchParams.get('select') || '*').split(',');
                const out = list.slice(0, limit).map(r => (cols[0] === '*' ? r : Object.fromEntries(cols.map(c => [c, r[c]]))));
                return json(200, out), true;
            }
            if (req.method === 'POST') {
                const input = parse();
                for (const r of Array.isArray(input) ? input : [input]) {
                    if (r.user_id !== user.id) return json(403, { message: 'new row violates row-level security policy' }), true;
                    const key = `${user.id}/${r.kind}/${r.id}`;
                    const old = this.rows.get(key);
                    if (old && Number(r.updated_at) < Number(old.updated_at)) continue; // trigger: gana el más reciente
                    this.rows.set(key, { user_id: user.id, kind: r.kind, id: r.id, data: r.data ?? null, deleted: !!r.deleted, updated_at: Number(r.updated_at), server_at: this.serverAt() });
                }
                res.writeHead(201).end();
                return true;
            }
        }

        // ---- Storage ----
        const sm = /^\/storage\/v1\/object\/images\/(.+)$/.exec(path);
        if (sm) {
            const user = this.userFromAuth(req);
            const filePath = decodeURIComponent(sm[1]);
            if (!user || filePath.split('/')[0] !== user.id) return json(403, { statusCode: '403', error: 'Unauthorized', message: 'new row violates row-level security policy' }), true;
            if (req.method === 'POST' || req.method === 'PUT') {
                this.files.set(filePath, { type: req.headers['content-type'] || 'application/octet-stream', body });
                return json(200, { Id: filePath, Key: 'images/' + filePath }), true;
            }
            if (req.method === 'GET') {
                const f = this.files.get(filePath);
                if (!f) return json(400, { statusCode: '404', error: 'not_found', message: 'Object not found' }), true;
                res.writeHead(200, { 'Content-Type': f.type });
                res.end(f.body);
                return true;
            }
        }
        json(404, { message: 'Ruta no simulada: ' + req.method + ' ' + path });
        return true;
    }
}

module.exports = { FakeSupabase };
