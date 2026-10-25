'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DB_PATH = path.join(ROOT, 'data', 'meridian.db');
const TOKEN_KEY = crypto.createHash('sha256').update('meridian-local-session-v1').digest();
const TOKEN_TTL = 8 * 60 * 60;

const OPERATOR = {
  sub: '8f3c1a20-6b4e-4d7a-9c11-2e5a7b90d4c6',
  name: 'Noah Adeyemi',
  role: 'Operations lead',
};

const SCOPES = [
  'ops.records.read',
  'ops.records.write',
  'ops.reconcile',
  'ops.insights',
  'ops.export',
  'ops.workspace',
  'iam.session',
  'gl.mappings.read',
];

const APP_ROUTES = new Set([
  '/',
  '/records',
  '/records/expanded',
  '/insights',
  '/reconcile',
  '/workspace',
]);

const LEGACY = {
  '/index.html': '/',
  '/records.html': '/records',
  '/insights.html': '/insights',
  '/about.html': '/workspace',
};

const SORTABLE = new Set([
  'id', 'ref', 'account', 'region', 'channel', 'status', 'amount', 'opened_at', 'gl_code', 'owner',
]);

/* ------------------------------------------------------------------ *
 * Storage
 * ------------------------------------------------------------------ */

const db = new DatabaseSync(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS records (
    id        INTEGER PRIMARY KEY,
    ref       TEXT NOT NULL,
    account   TEXT NOT NULL,
    region    TEXT NOT NULL,
    channel   TEXT NOT NULL,
    status    TEXT NOT NULL,
    amount    REAL NOT NULL,
    opened_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id         TEXT PRIMARY KEY,
    sub        TEXT NOT NULL,
    name       TEXT NOT NULL,
    role       TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS reconciliations (
    id         INTEGER PRIMARY KEY,
    left_id    INTEGER NOT NULL,
    right_id   INTEGER NOT NULL,
    note       TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );
`);

function columnNames(table) {
  return db.prepare('PRAGMA table_info(' + table + ')').all().map((row) => row.name);
}

function migrate() {
  const cols = columnNames('records');
  if (!cols.includes('gl_code')) db.exec('ALTER TABLE records ADD COLUMN gl_code TEXT');
  if (!cols.includes('owner')) db.exec('ALTER TABLE records ADD COLUMN owner TEXT');
  if (!cols.includes('note')) db.exec("ALTER TABLE records ADD COLUMN note TEXT NOT NULL DEFAULT ''");

  const owners = ['Northwind Books', 'Lumen Freight', 'Kestrel Health', 'Harbor & Co', 'Fieldnote', 'Arcadia Mutual'];
  const pending = db.prepare("SELECT id FROM records WHERE gl_code IS NULL OR gl_code = '' OR owner IS NULL OR owner = ''").all();
  const fill = db.prepare('UPDATE records SET gl_code = ?, owner = ? WHERE id = ?');
  for (const row of pending) {
    fill.run('GL-' + String(41000 + (row.id * 17) % 800), owners[row.id % owners.length], row.id);
  }
}

function seed() {
  const n = db.prepare('SELECT COUNT(*) AS n FROM records').get().n;
  if (n > 0) return;

  const regions = ['NA', 'EU', 'APAC', 'LATAM'];
  const channels = ['Web', 'Mobile', 'API', 'Branch'];
  const statuses = ['Matched', 'Pending', 'Flagged', 'Cleared'];
  const owners = ['Northwind Books', 'Lumen Freight', 'Kestrel Health', 'Harbor & Co', 'Fieldnote', 'Arcadia Mutual'];

  const insert = db.prepare(
    'INSERT INTO records (ref, account, region, channel, status, amount, opened_at, gl_code, owner, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );

  let s = 1337;
  const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

  const TOTAL = 54;
  for (let i = 1; i <= TOTAL; i++) {
    const ref = 'RC-2026-' + String(100000 + i).slice(1);
    const account = 'ACME-' + String(1 + Math.floor(rnd() * 40)).padStart(3, '0');
    const region = regions[Math.floor(rnd() * regions.length)];
    const channel = channels[Math.floor(rnd() * channels.length)];
    const status = statuses[Math.floor(rnd() * statuses.length)];
    const amount = Number((Math.round(rnd() * 480000) / 100 + 12).toFixed(2));
    const month = String(1 + Math.floor(rnd() * 10)).padStart(2, '0');
    const day = String(1 + Math.floor(rnd() * 27)).padStart(2, '0');
    const gl = 'GL-' + String(41000 + (i * 17) % 800);
    insert.run(ref, account, region, channel, status, amount, `2026-${month}-${day}`, gl, owners[i % owners.length], '');
  }
}

migrate();
seed();

const DEFAULT_COLUMNS = [
  { columnId: 'c_ref', field: 'ref', label: 'Reference', isDetokenizable: false },
  { columnId: 'c_account', field: 'account', label: 'Account', isDetokenizable: true },
  { columnId: 'c_owner', field: 'owner', label: 'Counterparty', isDetokenizable: false },
  { columnId: 'c_region', field: 'region', label: 'Region', isDetokenizable: false },
  { columnId: 'c_channel', field: 'channel', label: 'Channel', isDetokenizable: false },
  { columnId: 'c_status', field: 'status', label: 'Status', isDetokenizable: false },
  { columnId: 'c_gl', field: 'gl_code', label: 'GL code', isDetokenizable: true },
  { columnId: 'c_amount', field: 'amount', label: 'Amount', isDetokenizable: true },
  { columnId: 'c_opened', field: 'opened_at', label: 'Opened', isDetokenizable: false },
];

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

function sendJson(res, status, obj, extra) {
  const body = JSON.stringify(obj);
  res.writeHead(status, Object.assign({
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  }, extra || {}));
  res.end(body);
}

function b64url(value) {
  return Buffer.from(value).toString('base64url');
}

function issueToken(session) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: session.sub,
    name: session.name,
    role: session.role,
    scope: SCOPES,
    aud: 'meridian-ops',
    iat: now,
    exp: now + TOKEN_TTL,
  };
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', TOKEN_KEY).update(header + '.' + body).digest('base64url');
  return { token: header + '.' + body + '.' + sig, expiresIn: TOKEN_TTL };
}

function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const expected = crypto.createHmac('sha256', TOKEN_KEY).update(parts[0] + '.' + parts[1]).digest('base64url');
  const got = Buffer.from(parts[2]);
  const want = Buffer.from(expected);
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (!payload || typeof payload !== 'object') return null;
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch (err) {
    return null;
  }
}

function parseCookies(req) {
  const out = Object.create(null);
  String(req.headers.cookie || '').split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i === -1) return;
    const key = part.slice(0, i).trim();
    if (!key) return;
    try {
      out[key] = decodeURIComponent(part.slice(i + 1).trim());
    } catch (err) {
      out[key] = part.slice(i + 1).trim();
    }
  });
  return out;
}

function ensureSession(req, res) {
  const sid = parseCookies(req).meridian_sid;
  if (sid) {
    const row = db.prepare('SELECT id, sub, name, role, created_at FROM sessions WHERE id = ?').get(sid);
    if (row) return row;
  }
  const id = crypto.randomBytes(18).toString('hex');
  const created = new Date().toISOString();
  db.prepare('INSERT INTO sessions (id, sub, name, role, created_at) VALUES (?, ?, ?, ?, ?)').run(
    id, OPERATOR.sub, OPERATOR.name, OPERATOR.role, created
  );
  res.setHeader('Set-Cookie', 'meridian_sid=' + id + '; HttpOnly; Path=/; SameSite=Lax; Max-Age=604800');
  return { id, sub: OPERATOR.sub, name: OPERATOR.name, role: OPERATOR.role, created_at: created };
}

function authorized(req) {
  const header = String(req.headers.authorization || '');
  if (!header.startsWith('Bearer ')) return false;
  return !!verifyToken(header.slice(7).trim());
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 100000) {
        reject(Object.assign(new Error('too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          reject(Object.assign(new Error('bad json'), { status: 400 }));
          return;
        }
        resolve(parsed);
      } catch (err) {
        reject(Object.assign(new Error('bad json'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
};

function serveFile(res, full) {
  fs.readFile(full, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end('Not found');
      return;
    }
    const ext = path.extname(full).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(data);
  });
}

function serveStatic(res, pathname) {
  let rel = pathname;
  try {
    rel = decodeURIComponent(pathname);
  } catch (err) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Bad request');
    return;
  }
  const full = path.normalize(path.join(PUBLIC_DIR, rel));
  if (full !== PUBLIC_DIR && !full.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }
  serveFile(res, full);
}

function serveIndex(req, res) {
  ensureSession(req, res);
  serveFile(res, path.join(PUBLIC_DIR, 'index.html'));
}

/* ------------------------------------------------------------------ *
 * API
 * ------------------------------------------------------------------ */

function apiRecords(res, params) {
  const limit = Math.min(Math.max(parseInt(params.get('limit') || '200', 10) || 200, 1), 500);
  const offset = Math.max(parseInt(params.get('offset') || '0', 10) || 0, 0);
  const status = params.get('status');
  const region = params.get('region');
  const sort = SORTABLE.has(params.get('sort') || '') ? params.get('sort') : 'id';
  const dir = String(params.get('dir') || 'asc').toLowerCase() === 'desc' ? 'DESC' : 'ASC';

  const where = [];
  const args = [];
  if (status) {
    where.push('status = ?');
    args.push(status);
  }
  if (region) {
    where.push('region = ?');
    args.push(region);
  }
  const sql = 'SELECT id, ref, account, region, channel, status, amount, opened_at, gl_code, owner, note FROM records'
    + (where.length ? ' WHERE ' + where.join(' AND ') : '')
    + ' ORDER BY ' + sort + ' ' + dir
    + ' LIMIT ? OFFSET ?';
  const rows = db.prepare(sql).all(...args, limit, offset);
  sendJson(res, 200, { rows });
}

function apiRecord(res, id) {
  const row = db.prepare(
    'SELECT id, ref, account, region, channel, status, amount, opened_at, gl_code, owner, note FROM records WHERE id = ?'
  ).get(id);
  if (!row) return sendJson(res, 404, { error: 'Not found' });
  sendJson(res, 200, { record: row });
}

function apiSaveNote(res, id, body) {
  const existing = db.prepare('SELECT id FROM records WHERE id = ?').get(id);
  if (!existing) return sendJson(res, 404, { error: 'Not found' });
  const note = String(body.note == null ? '' : body.note).trim().slice(0, 280);
  db.prepare('UPDATE records SET note = ? WHERE id = ?').run(note, id);
  const row = db.prepare(
    'SELECT id, ref, account, region, channel, status, amount, opened_at, gl_code, owner, note FROM records WHERE id = ?'
  ).get(id);
  sendJson(res, 200, { record: row });
}

function apiStats(res) {
  const total = db.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(amount), 0) AS sum FROM records').get();
  const byStatus = db.prepare(
    'SELECT status, COUNT(*) AS n, COALESCE(SUM(amount), 0) AS sum FROM records GROUP BY status ORDER BY n DESC'
  ).all();
  const byRegion = db.prepare(
    'SELECT region, COUNT(*) AS n, COALESCE(SUM(amount), 0) AS sum FROM records GROUP BY region ORDER BY n DESC'
  ).all();
  const byChannel = db.prepare(
    'SELECT channel, COUNT(*) AS n, COALESCE(SUM(amount), 0) AS sum FROM records GROUP BY channel ORDER BY n DESC'
  ).all();
  const links = db.prepare('SELECT COUNT(*) AS n FROM reconciliations').get();
  sendJson(res, 200, {
    records: total.n,
    volume: Number(Number(total.sum).toFixed(2)),
    reconciliations: links.n,
    byStatus,
    byRegion,
    byChannel,
  });
}

function apiListLinks(res) {
  const rows = db.prepare(`
    SELECT r.id, r.left_id, r.right_id, r.note, r.created_at,
           a.ref AS left_ref, a.amount AS left_amount, a.status AS left_status,
           b.ref AS right_ref, b.amount AS right_amount, b.status AS right_status
    FROM reconciliations r
    JOIN records a ON a.id = r.left_id
    JOIN records b ON b.id = r.right_id
    ORDER BY r.id DESC
  `).all();
  sendJson(res, 200, { reconciliations: rows });
}

function apiCreateLink(res, body) {
  const leftId = parseInt(body.leftId, 10);
  const rightId = parseInt(body.rightId, 10);
  if (!leftId || !rightId || leftId === rightId) {
    return sendJson(res, 400, { error: 'Choose two different records' });
  }
  const left = db.prepare('SELECT id FROM records WHERE id = ?').get(leftId);
  const right = db.prepare('SELECT id FROM records WHERE id = ?').get(rightId);
  if (!left || !right) return sendJson(res, 404, { error: 'Not found' });
  const note = String(body.note == null ? '' : body.note).trim().slice(0, 280);
  const created = new Date().toISOString();
  const info = db.prepare(
    'INSERT INTO reconciliations (left_id, right_id, note, created_at) VALUES (?, ?, ?, ?)'
  ).run(leftId, rightId, note, created);
  const row = db.prepare(`
    SELECT r.id, r.left_id, r.right_id, r.note, r.created_at,
           a.ref AS left_ref, a.amount AS left_amount, a.status AS left_status,
           b.ref AS right_ref, b.amount AS right_amount, b.status AS right_status
    FROM reconciliations r
    JOIN records a ON a.id = r.left_id
    JOIN records b ON b.id = r.right_id
    WHERE r.id = ?
  `).get(Number(info.lastInsertRowid));
  sendJson(res, 201, { reconciliation: row });
}

function apiDeleteLink(res, id) {
  const info = db.prepare('DELETE FROM reconciliations WHERE id = ?').run(id);
  if (!info.changes) return sendJson(res, 404, { error: 'Not found' });
  sendJson(res, 200, { ok: true });
}

/* ------------------------------------------------------------------ *
 * Server
 * ------------------------------------------------------------------ */

async function handle(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  if (LEGACY[pathname] && (req.method === 'GET' || req.method === 'HEAD')) {
    res.writeHead(302, { Location: LEGACY[pathname] + url.search, 'Cache-Control': 'no-store' });
    res.end();
    return;
  }

  if (pathname === '/api/session/token' && req.method === 'POST') {
    const session = ensureSession(req, res);
    await readJson(req);
    return sendJson(res, 200, issueToken(session));
  }

  if (pathname.startsWith('/api/')) {
    if (!authorized(req)) return sendJson(res, 401, { error: 'Sign-in required' });

    if (req.method === 'GET' && pathname === '/api/records') return apiRecords(res, url.searchParams);
    if (req.method === 'GET' && pathname === '/api/records/columns') {
      return sendJson(res, 200, { columns: DEFAULT_COLUMNS });
    }
    if (req.method === 'GET' && pathname === '/api/stats') return apiStats(res);
    if (req.method === 'GET' && pathname === '/api/reconciliations') return apiListLinks(res);

    const recordNote = pathname.match(/^\/api\/records\/(\d+)\/note$/);
    if (recordNote && req.method === 'POST') {
      const body = await readJson(req);
      return apiSaveNote(res, Number(recordNote[1]), body);
    }

    const recordOne = pathname.match(/^\/api\/records\/(\d+)$/);
    if (recordOne && req.method === 'GET') return apiRecord(res, Number(recordOne[1]));

    if (req.method === 'POST' && pathname === '/api/reconciliations') {
      const body = await readJson(req);
      return apiCreateLink(res, body);
    }

    const linkOne = pathname.match(/^\/api\/reconciliations\/(\d+)$/);
    if (linkOne && req.method === 'DELETE') return apiDeleteLink(res, Number(linkOne[1]));

    return sendJson(res, 404, { error: 'Not found' });
  }

  if (req.method === 'GET' || req.method === 'HEAD') {
    if (pathname === '/' || APP_ROUTES.has(pathname) || !path.extname(pathname)) return serveIndex(req, res);
    return serveStatic(res, pathname);
  }

  res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8', Allow: 'GET, HEAD, POST, DELETE' });
  res.end('Method Not Allowed');
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((err) => {
    if (res.headersSent || res.writableEnded) return;
    const status = err && err.status ? err.status : 400;
    sendJson(res, status, { error: status === 413 ? 'Payload too large' : 'Bad request' });
  });
});

server.listen(PORT, () => {
  console.log(`Meridian Ops Console → http://localhost:${PORT}`);
});
