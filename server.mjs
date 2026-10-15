import http from 'node:http';
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, resolve, relative, isAbsolute } from 'node:path';
import { randomBytes, randomInt, scryptSync, timingSafeEqual, createHash } from 'node:crypto';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(ROOT, 'public');
const DATA = process.env.DONUTRUSH_DATA_DIR || join(ROOT, 'data');
const DB_PATH = join(DATA, 'db.json');
mkdirSync(DATA, { recursive: true });
const db = existsSync(DB_PATH) ? JSON.parse(readFileSync(DB_PATH, 'utf8')) : { users: [], sessions: {} };
db.users ??= [];
db.sessions ??= {};
const games = new Map();
const limits = new Map();
const SESSION_AGE = 14 * 24 * 60 * 60 * 1000;
const DIFFICULTIES = Object.freeze({
  easy: { size: 5, mines: 4, points: 100, label: 'Easy' },
  medium: { size: 6, mines: 7, points: 200, label: 'Medium' },
  hard: { size: 8, mines: 13, points: 400, label: 'Hard' }
});

function persist() {
  const tmp = `${DB_PATH}.tmp`;
  writeFileSync(tmp, JSON.stringify(db, null, 2), { mode: 0o600 });
  renameSync(tmp, DB_PATH);
}
function hashToken(token) { return createHash('sha256').update(token).digest('hex'); }
function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
function verifyPassword(password, digest) {
  const [salt, hash] = digest.split(':');
  if (!salt || !hash) return false;
  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}
function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(data));
}
function err(res, status, message) { json(res, status, { error: message }); }
function cookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').map(c => c.trim().split('=').map(decodeURIComponent)).filter(a => a.length === 2));
}
function addCookie(res, name, value, maxAge) {
  const secure = process.env.COOKIE_SECURE === 'true' || (process.env.NODE_ENV === 'production' ? '; Secure' : '');
  const suffix = typeof secure === 'string' ? secure : (secure ? '; Secure' : '');
  res.setHeader('Set-Cookie', `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${suffix}`);
}
function getAuth(req) {
  const token = cookies(req).dr_session;
  if (!token) return null;
  const session = db.sessions[hashToken(token)];
  if (!session || session.expires < Date.now()) return null;
  return db.users.find(u => u.id === session.userId) || null;
}
function createSession(res, user) {
  const token = randomBytes(32).toString('hex');
  for (const [id, session] of Object.entries(db.sessions)) if (session.expires <= Date.now()) delete db.sessions[id];
  db.sessions[hashToken(token)] = { userId: user.id, expires: Date.now() + SESSION_AGE };
  persist();
  addCookie(res, 'dr_session', token, SESSION_AGE / 1000);
}
function publicUser(u) {
  if (!u) return null;
  return { username: u.username, minecraftName: u.minecraftName || '', showLeaderboard: u.showLeaderboard !== false, points: u.points, minesWins: u.minesWins, minesPlayed: u.minesPlayed, coinTosses: u.coinTosses, coinCorrect: u.coinCorrect, joinedAt: u.joinedAt };
}
function leaderboard() {
  return db.users.filter(u => u.showLeaderboard !== false && u.points > 0)
    .sort((a, b) => b.points - a.points || b.minesWins - a.minesWins)
    .slice(0, 10).map((u, i) => ({ rank: i + 1, username: u.username, minecraftName: u.minecraftName || '', points: u.points, wins: u.minesWins }));
}
async function body(req) {
  let bytes = 0, chunks = [];
  for await (const part of req) {
    bytes += part.length;
    if (bytes > 10_000) throw Object.assign(new Error('Request too large.'), { status: 413 });
    chunks.push(part);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); }
  catch { throw Object.assign(new Error('Invalid JSON.'), { status: 400 }); }
}
function limiter(req, area, allowed, period = 60_000) {
  const ip = req.socket.remoteAddress || 'unknown';
  const key = `${area}:${ip}`;
  const now = Date.now();
  let rec = limits.get(key);
  if (!rec || now - rec.start >= period) { rec = { start: now, count: 0 }; limits.set(key, rec); }
  rec.count++;
  return rec.count <= allowed;
}
function guestIdentity(req, res) {
  const token = cookies(req).dr_guest;
  if (token && /^[a-f0-9]{40}$/.test(token)) return `guest:${token}`;
  const fresh = randomBytes(20).toString('hex');
  addCookie(res, 'dr_guest', fresh, 60 * 60 * 24 * 7);
  return `guest:${fresh}`;
}
function gameIdentity(req, res, user) { return user ? `user:${user.id}` : guestIdentity(req, res); }
const neighbors = (i, size) => {
  const x = i % size, y = Math.floor(i / size), values = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (!dx && !dy) continue;
    const nx = x + dx, ny = y + dy;
    if (nx >= 0 && ny >= 0 && nx < size && ny < size) values.push(ny * size + nx);
  }
  return values;
};
function armGame(game, firstIndex) {
  // A player's first reveal is always safe, including their neighboring tiles where possible.
  const safe = new Set([firstIndex, ...neighbors(firstIndex, game.size)]);
  const possible = Array.from({ length: game.size ** 2 }, (_, i) => i).filter(i => !safe.has(i));
  for (let i = possible.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [possible[i], possible[j]] = [possible[j], possible[i]];
  }
  game.mines = new Set(possible.slice(0, game.mineCount));
  game.armed = true;
}
function revealGame(game, pos) {
  if (game.revealed.has(pos) || game.flags.has(pos) || game.status !== 'playing') return;
  if (!game.armed) armGame(game, pos);
  if (game.mines.has(pos)) { game.revealed.add(pos); game.status = 'lost'; return; }
  const queue = [pos];
  while (queue.length) {
    const i = queue.pop();
    if (game.revealed.has(i) || game.flags.has(i) || game.mines.has(i)) continue;
    game.revealed.add(i);
    if (neighbors(i, game.size).filter(n => game.mines.has(n)).length === 0) {
      for (const n of neighbors(i, game.size)) if (!game.revealed.has(n)) queue.push(n);
    }
  }
  if (game.revealed.size === game.size ** 2 - game.mineCount) game.status = 'won';
}
function visibleGame(game) {
  if (!game) return null;
  const showMines = game.status !== 'playing';
  return {
    difficulty: game.difficulty, size: game.size, mineCount: game.mineCount, pointReward: game.pointReward,
    status: game.status, revealed: game.revealed.size, flags: game.flags.size,
    tiles: Array.from({ length: game.size ** 2 }, (_, i) => {
      if (game.revealed.has(i) && game.mines.has(i)) return 'hit';
      if (game.revealed.has(i)) return neighbors(i, game.size).filter(n => game.mines.has(n)).length;
      if (showMines && game.mines.has(i)) return 'mine';
      if (game.flags.has(i)) return 'flag';
      return null;
    })
  };
}
function state(user, game) { return { user: publicUser(user), leaderboard: leaderboard(), game: visibleGame(game), totalPlayers: db.users.length }; }
function checkOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // non-browser local tools may omit Origin
  try { return new URL(origin).host === req.headers.host; } catch { return false; }
}
async function api(req, res, path) {
  const user = getAuth(req);
  const identity = gameIdentity(req, res, user);
  if (req.method === 'GET' && path === '/api/health') return json(res, 200, { ok: true, service: 'DonutRush' });
  if (req.method === 'GET' && path === '/api/state') return json(res, 200, state(user, games.get(identity)));
  if (req.method !== 'POST') return err(res, 405, 'Method not allowed.');
  if (!checkOrigin(req)) return err(res, 403, 'This request came from a different website.');
  if (!limiter(req, 'general', 180)) return err(res, 429, 'Too many requests. Try again shortly.');
  const input = await body(req);
  if (path === '/api/register' || path === '/api/login') {
    if (!limiter(req, 'auth', 18)) return err(res, 429, 'Too many login attempts. Try again later.');
    const username = String(input.username || '').trim();
    const password = String(input.password || '');
    if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) return err(res, 400, 'Username must be 3–20 letters, numbers or underscores.');
    if (password.length < 8 || password.length > 128) return err(res, 400, 'Password must be 8–128 characters.');
    let match = db.users.find(u => u.username.toLowerCase() === username.toLowerCase());
    if (path === '/api/register') {
      if (match) return err(res, 409, 'That username is taken.');
      match = { id: randomBytes(12).toString('hex'), username, passwordHash: hashPassword(password), minecraftName: '', showLeaderboard: true, points: 0, minesWins: 0, minesPlayed: 0, coinTosses: 0, coinCorrect: 0, joinedAt: Date.now() };
      db.users.push(match);
    } else if (!match || !verifyPassword(password, match.passwordHash)) {
      return err(res, 401, 'Incorrect username or password.');
    }
    createSession(res, match);
    return json(res, 200, state(match, games.get(`user:${match.id}`)));
  }
  if (path === '/api/logout') {
    const sid = cookies(req).dr_session;
    if (sid) delete db.sessions[hashToken(sid)];
    persist();
    addCookie(res, 'dr_session', '', 0);
    return json(res, 200, { ok: true });
  }
  if (path === '/api/profile') {
    if (!user) return err(res, 401, 'Log in to change your profile.');
    const name = String(input.minecraftName ?? '').trim();
    if (name && !/^[A-Za-z0-9_]{3,16}$/.test(name)) return err(res, 400, 'Minecraft names are 3–16 letters, numbers, or underscores.');
    if (typeof input.showLeaderboard !== 'boolean') return err(res, 400, 'Invalid privacy setting.');
    user.minecraftName = name;
    user.showLeaderboard = input.showLeaderboard;
    persist();
    return json(res, 200, state(user, games.get(identity)));
  }
  if (path === '/api/mines/start') {
    const difficulty = String(input.difficulty || 'easy');
    if (!(difficulty in DIFFICULTIES)) return err(res, 400, 'Choose easy, medium, or hard.');
    const config = DIFFICULTIES[difficulty];
    const game = { difficulty, size: config.size, mineCount: config.mines, pointReward: config.points, status: 'playing', mines: new Set(), flags: new Set(), revealed: new Set(), armed: false, finishedAt: null };
    games.set(identity, game);
    if (user) { user.minesPlayed++; persist(); }
    return json(res, 200, state(user, game));
  }
  if (path === '/api/mines/reveal' || path === '/api/mines/flag') {
    const game = games.get(identity);
    if (!game) return err(res, 400, 'Start a new game first.');
    if (game.status !== 'playing') return json(res, 200, state(user, game));
    const i = input.index;
    if (!Number.isInteger(i) || i < 0 || i >= game.size ** 2) return err(res, 400, 'Invalid tile.');
    if (path === '/api/mines/flag') {
      if (!game.revealed.has(i)) {
        if (game.flags.has(i)) game.flags.delete(i);
        else if (game.flags.size < game.mineCount) game.flags.add(i);
      }
    } else {
      revealGame(game, i);
      if (game.status === 'won' && !game.finishedAt) {
        game.finishedAt = Date.now();
        if (user) { user.points += game.pointReward; user.minesWins++; persist(); }
      }
    }
    return json(res, 200, state(user, game));
  }
  if (path === '/api/coin/flip') {
    if (!['heads', 'tails'].includes(input.guess)) return err(res, 400, 'Choose heads or tails.');
    if (!limiter(req, 'coin', 20, 60_000)) return err(res, 429, 'Too many flips. Try again shortly.');
    const side = randomInt(2) ? 'heads' : 'tails';
    if (user) { user.coinTosses++; if (side === input.guess) user.coinCorrect++; persist(); }
    return json(res, 200, { side, correct: side === input.guess, user: publicUser(user) });
  }
  return err(res, 404, 'No such endpoint.');
}
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; img-src 'self' data:; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'");
  try {
    const path = new URL(req.url || '/', 'http://localhost').pathname;
    if (path.startsWith('/api/')) return await api(req, res, path);
    if (req.method !== 'GET' && req.method !== 'HEAD') return err(res, 405, 'Method not allowed.');
    const normalized = path === '/' ? '/index.html' : path;
    const filepath = resolve(PUBLIC, '.' + normalized);
    // Compare paths using the OS path module: PUBLIC + '/' fails on Windows.
    const rel = relative(PUBLIC, filepath);
    if (!rel || rel === '..' || rel.startsWith('..' + (process.platform === 'win32' ? '\\' : '/')) || isAbsolute(rel) || !existsSync(filepath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Not found');
    }
    const bytes = readFileSync(filepath);
    res.writeHead(200, { 'Content-Type': MIME[extname(filepath)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    return res.end(req.method === 'HEAD' ? undefined : bytes);
  } catch (e) { console.error(e); return err(res, e.status || 500, e.status ? e.message : 'Something went wrong.'); }
});
const PORT = Number(process.env.PORT || 3000);
if (process.env.NODE_ENV !== 'test' && process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  server.listen(PORT, '0.0.0.0', () => console.log(`DonutRush running on http://localhost:${PORT}`));
}
export { server, DIFFICULTIES, neighbors, armGame, revealGame, visibleGame };
