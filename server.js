'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const config = require('./config');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const SECURE_COOKIE = process.env.SECURE_COOKIE === '1';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const VOTERS_FILE = path.join(DATA_DIR, 'voters.csv');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const PUBLIC_DIR = path.join(__dirname, 'public');
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const ROLE_LABELS = { participante: 'Participante', visitante: 'Visitante', admin: 'Administrador' };

// ---------------------------------------------------------------------------
// Votantes (data/voters.csv) — recarregado automaticamente quando o ficheiro muda
// ---------------------------------------------------------------------------

function normalizeCode(code) {
  return String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function parseCsv(text) {
  text = text.replace(/^﻿/, '');
  const firstLine = text.split(/\r?\n/, 1)[0];
  const delim = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((f) => f.trim()));
}

function findTeam(value) {
  const v = String(value || '').trim().toLowerCase();
  if (!v) return null;
  return config.teams.find((t) => t.id === v || t.name.toLowerCase() === v) || null;
}

let votersCache = { mtimeMs: -1, map: new Map() };

function getVoters() {
  let stat;
  try { stat = fs.statSync(VOTERS_FILE); } catch { return votersCache.map; }
  if (stat.mtimeMs === votersCache.mtimeMs) return votersCache.map;

  const map = new Map();
  const [header, ...rows] = parseCsv(fs.readFileSync(VOTERS_FILE, 'utf8'));
  const cols = (header || []).map((h) => h.trim().toLowerCase());
  const idx = (name) => cols.indexOf(name);
  for (const r of rows) {
    const code = normalizeCode(r[idx('codigo')]);
    if (!code) continue;
    const role = (r[idx('tipo')] || 'participante').trim().toLowerCase();
    const team = findTeam(r[idx('equipa')]);
    if (map.has(code)) console.warn(`[voters.csv] código duplicado ignorado: ${code}`);
    else if (!ROLE_LABELS[role]) console.warn(`[voters.csv] tipo inválido "${role}" para ${code}`);
    else map.set(code, { code, name: (r[idx('nome')] || '').trim() || code, teamId: team ? team.id : null, role });
  }
  votersCache = { mtimeMs: stat.mtimeMs, map };
  console.log(`[voters.csv] ${map.size} códigos carregados`);
  return map;
}

// ---------------------------------------------------------------------------
// Base de dados (data/db.json)
// ---------------------------------------------------------------------------

function loadDb() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    return {
      settings: { votingOpen: config.votingOpenOnStart, resultsVisible: config.resultsVisibleOnStart },
      votes: {},
      sessions: {},
    };
  }
}

const db = loadDb();

function saveDb() {
  const tmp = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

function eligibleTeams(voter) {
  return config.teams.filter((t) => !(config.blockOwnTeamVote && voter.teamId === t.id));
}

// ---------------------------------------------------------------------------
// Resultados
// ---------------------------------------------------------------------------

function computeResults(includeScores) {
  const voters = getVoters();
  const totalWeight = config.criteria.reduce((s, c) => s + (c.weight ?? 1), 0);

  const teams = config.teams.map((team) => {
    const sums = Object.fromEntries(config.criteria.map((c) => [c.id, 0]));
    let votes = 0;
    for (const [code, byTeam] of Object.entries(db.votes)) {
      const vote = byTeam[team.id];
      if (!vote || !voters.has(code)) continue;
      votes++;
      for (const c of config.criteria) sums[c.id] += vote.scores[c.id];
    }
    const criteria = Object.fromEntries(config.criteria.map((c) => [c.id, votes ? sums[c.id] / votes : 0]));
    const score = votes ? config.criteria.reduce((s, c) => s + criteria[c.id] * (c.weight ?? 1), 0) / totalWeight : 0;
    return { id: team.id, name: team.name, votes, score, criteria };
  });

  // Ordena pela média final; empates desfeitos pelos critérios, pela ordem definida.
  teams.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    for (const c of config.criteria) if (b.criteria[c.id] !== a.criteria[c.id]) return b.criteria[c.id] - a.criteria[c.id];
    return 0;
  });

  let total = 0, started = 0, done = 0;
  for (const voter of voters.values()) {
    if (voter.role === 'admin') continue;
    total++;
    const mine = db.votes[voter.code] || {};
    const rated = eligibleTeams(voter).filter((t) => mine[t.id]).length;
    if (rated > 0) started++;
    if (rated === eligibleTeams(voter).length) done++;
  }

  return {
    settings: db.settings,
    participation: { total, started, done },
    totalVotes: teams.reduce((s, t) => s + t.votes, 0),
    teams: includeScores ? teams : null,
    updatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Sessões
// ---------------------------------------------------------------------------

function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function sessionCookie(value, maxAgeSec) {
  return `sid=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${SECURE_COOKIE ? '; Secure' : ''}`;
}

function currentVoter(req) {
  const sid = parseCookies(req).sid;
  const session = sid && db.sessions[sid];
  if (!session) return null;
  if (Date.now() - session.createdAt > SESSION_TTL_MS) return null;
  return getVoters().get(session.code) || null;
}

// Limita tentativas de login falhadas por IP (protege contra adivinhar códigos).
const failedLogins = new Map();
const LOGIN_WINDOW_MS = 5 * 60 * 1000;
const LOGIN_MAX_FAILS = 30; // generoso: no evento muitos votantes partilham o mesmo IP (Wi-Fi)

function loginBlocked(ip) {
  const entry = failedLogins.get(ip);
  if (!entry || Date.now() - entry.first > LOGIN_WINDOW_MS) return false;
  return entry.count >= LOGIN_MAX_FAILS;
}

function registerFailedLogin(ip) {
  const entry = failedLogins.get(ip);
  if (!entry || Date.now() - entry.first > LOGIN_WINDOW_MS) failedLogins.set(ip, { first: Date.now(), count: 1 });
  else entry.count++;
}

// ---------------------------------------------------------------------------
// Tempo real (Server-Sent Events)
// ---------------------------------------------------------------------------

const streams = new Set();

function broadcast() {
  const pub = `data: ${JSON.stringify(computeResults(db.settings.resultsVisible))}\n\n`;
  const full = `data: ${JSON.stringify(computeResults(true))}\n\n`;
  for (const s of streams) s.res.write(s.admin ? full : pub);
}

setInterval(() => { for (const s of streams) s.res.write(': ping\n\n'); }, 25000).unref();

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'same-origin',
  'Content-Security-Policy':
    "default-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; frame-ancestors 'none'",
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
};

const PAGES = { '/': 'index.html', '/votar': 'votar.html', '/resultados': 'resultados.html', '/admin': 'admin.html' };

function send(res, status, body, headers = {}) {
  res.writeHead(status, { ...SECURITY_HEADERS, ...headers });
  res.end(body);
}

function json(res, status, data, headers = {}) {
  send(res, status, JSON.stringify(data), { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    if (!String(req.headers['content-type'] || '').startsWith('application/json')) return reject(new HttpError(415, 'Pedido inválido.'));
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 10000) { reject(new HttpError(413, 'Pedido demasiado grande.')); req.destroy(); }
    });
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); } catch { reject(new HttpError(400, 'JSON inválido.')); }
    });
    req.on('error', reject);
  });
}

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function serveStatic(req, res, pathname) {
  const file = PAGES[pathname] || pathname.slice(1);
  const full = path.join(PUBLIC_DIR, file);
  if (!full.startsWith(PUBLIC_DIR + path.sep)) return send(res, 404, 'Não encontrado');
  fs.readFile(full, (err, data) => {
    if (err) return send(res, 404, 'Não encontrado', { 'Content-Type': 'text/plain; charset=utf-8' });
    const ext = path.extname(full);
    send(res, 200, data, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.png' || ext === '.ico' ? 'public, max-age=86400' : 'no-cache',
    });
  });
}

function publicVoter(v) {
  const team = config.teams.find((t) => t.id === v.teamId);
  return { name: v.name, role: v.role, roleLabel: ROLE_LABELS[v.role], team: team ? team.name : null, teamId: v.teamId };
}

function csvField(v) {
  const s = String(v ?? '');
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const routes = {
  'GET /api/config': () => ({
    eventName: config.eventName,
    eventSubtitle: config.eventSubtitle,
    teams: config.teams,
    criteria: config.criteria,
    scale: config.scale,
  }),

  'POST /api/login': async (req, res) => {
    const ip = req.socket.remoteAddress;
    if (loginBlocked(ip)) throw new HttpError(429, 'Demasiadas tentativas. Aguarde alguns minutos.');
    const { code } = await readJson(req);
    const voter = getVoters().get(normalizeCode(code));
    if (!voter) {
      registerFailedLogin(ip);
      throw new HttpError(401, 'Código inválido.');
    }
    const sid = crypto.randomBytes(24).toString('base64url');
    const now = Date.now();
    for (const [k, s] of Object.entries(db.sessions)) if (now - s.createdAt > SESSION_TTL_MS) delete db.sessions[k];
    db.sessions[sid] = { code: voter.code, createdAt: now };
    saveDb();
    json(res, 200, { voter: publicVoter(voter) }, { 'Set-Cookie': sessionCookie(sid, SESSION_TTL_MS / 1000) });
  },

  'POST /api/logout': (req, res) => {
    const sid = parseCookies(req).sid;
    if (sid && db.sessions[sid]) { delete db.sessions[sid]; saveDb(); }
    json(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie('', 0) });
  },

  'GET /api/me': (req) => {
    const voter = currentVoter(req);
    if (!voter) throw new HttpError(401, 'Sessão expirada.');
    return {
      voter: publicVoter(voter),
      eligibleTeams: eligibleTeams(voter).map((t) => t.id),
      votes: db.votes[voter.code] || {},
      settings: db.settings,
    };
  },

  'POST /api/vote': async (req) => {
    const voter = currentVoter(req);
    if (!voter) throw new HttpError(401, 'Sessão expirada.');
    if (voter.role === 'admin') throw new HttpError(403, 'Administradores não votam.');
    if (!db.settings.votingOpen) throw new HttpError(409, 'A votação está encerrada.');
    const { teamId, scores } = await readJson(req);
    if (!eligibleTeams(voter).some((t) => t.id === teamId)) throw new HttpError(400, 'Não pode avaliar esta equipa.');
    const clean = {};
    for (const c of config.criteria) {
      const n = scores && scores[c.id];
      if (!Number.isInteger(n) || n < config.scale.min || n > config.scale.max) {
        throw new HttpError(400, `Indique uma nota de ${config.scale.min} a ${config.scale.max} para "${c.title}".`);
      }
      clean[c.id] = n;
    }
    db.votes[voter.code] = db.votes[voter.code] || {};
    db.votes[voter.code][teamId] = { scores: clean, at: new Date().toISOString() };
    saveDb();
    broadcast();
    return { ok: true, votes: db.votes[voter.code] };
  },

  'GET /api/results': (req) => {
    const voter = currentVoter(req);
    return computeResults(db.settings.resultsVisible || voter?.role === 'admin');
  },

  'GET /api/stream': (req, res) => {
    const admin = currentVoter(req)?.role === 'admin';
    res.writeHead(200, {
      ...SECURITY_HEADERS,
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 3000\n');
    res.write(`data: ${JSON.stringify(computeResults(admin || db.settings.resultsVisible))}\n\n`);
    const stream = { res, admin };
    streams.add(stream);
    req.on('close', () => streams.delete(stream));
  },

  'GET /api/admin/voters': (req) => {
    requireAdmin(req);
    return {
      voters: [...getVoters().values()].map((v) => {
        const eligible = eligibleTeams(v);
        const mine = db.votes[v.code] || {};
        return {
          code: v.code,
          ...publicVoter(v),
          rated: v.role === 'admin' ? null : eligible.filter((t) => mine[t.id]).length,
          eligible: v.role === 'admin' ? null : eligible.length,
        };
      }),
    };
  },

  'POST /api/admin/settings': async (req) => {
    requireAdmin(req);
    const body = await readJson(req);
    for (const key of ['votingOpen', 'resultsVisible']) if (typeof body[key] === 'boolean') db.settings[key] = body[key];
    saveDb();
    broadcast();
    return { settings: db.settings };
  },

  'GET /api/admin/export.csv': (req, res) => {
    requireAdmin(req);
    const voters = getVoters();
    const header = ['codigo', 'nome', 'tipo', 'equipa_do_votante', 'equipa_avaliada', ...config.criteria.map((c) => c.id), 'data'];
    const lines = [header.join(',')];
    for (const [code, byTeam] of Object.entries(db.votes)) {
      const v = voters.get(code);
      if (!v) continue;
      for (const [teamId, vote] of Object.entries(byTeam)) {
        const team = config.teams.find((t) => t.id === teamId);
        lines.push([code, v.name, v.role, publicVoter(v).team || '', team ? team.name : teamId,
          ...config.criteria.map((c) => vote.scores[c.id]), vote.at].map(csvField).join(','));
      }
    }
    send(res, 200, '﻿' + lines.join('\r\n'), {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="votos.csv"',
      'Cache-Control': 'no-store',
    });
  },
};

function requireAdmin(req) {
  const voter = currentVoter(req);
  if (!voter) throw new HttpError(401, 'Sessão expirada.');
  if (voter.role !== 'admin') throw new HttpError(403, 'Acesso reservado a administradores.');
}

const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  const handler = routes[`${req.method} ${pathname}`];
  try {
    if (handler) {
      const result = await handler(req, res);
      if (result !== undefined) json(res, 200, result);
    } else if (pathname.startsWith('/api/')) {
      json(res, 404, { error: 'Não encontrado.' });
    } else if (req.method === 'GET') {
      serveStatic(req, res, pathname);
    } else {
      send(res, 405, 'Método não permitido');
    }
  } catch (err) {
    if (!(err instanceof HttpError)) console.error(err);
    if (!res.headersSent) json(res, err.status || 500, { error: err.status ? err.message : 'Erro interno.' });
  }
});

fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(VOTERS_FILE)) {
  console.warn('Aviso: data/voters.csv não existe. Gere os códigos com: npm run gerar-codigos');
}
getVoters();

server.listen(PORT, HOST, () => {
  console.log(`Sistema de votação a correr em http://localhost:${PORT}`);
});
