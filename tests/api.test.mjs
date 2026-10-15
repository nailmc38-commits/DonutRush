import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const temp = mkdtempSync(join(tmpdir(), 'donutrush-test-'));
process.env.DONUTRUSH_DATA_DIR = temp;
process.env.NODE_ENV = 'test';
const { server } = await import('../server.mjs');
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let cookie = '';
async function call(path, body) {
  const r = await fetch(base + path, body === undefined ? { headers: { Cookie: cookie } } : {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: base }, body: JSON.stringify(body)
  });
  const set = r.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0];
  return { status: r.status, body: await r.json() };
}
test('public homepage and assets serve correctly', async () => {
  const expected = [['/', 'text/html'], ['/style.css', 'text/css'], ['/app.js', 'application/javascript'], ['/favicon.svg', 'image/svg+xml']];
  for (const [path, contentType] of expected) {
    const r = await fetch(base + path);
    assert.equal(r.status, 200, `${path} should be available`);
    assert(r.headers.get('content-type').startsWith(contentType), `wrong content type for ${path}`);
    assert((await r.text()).length > 100);
  }
  const health = await call('/api/health');
  assert.equal(health.status, 200);
  assert.equal(health.body.ok, true);
});

test('registration, real server mines, profile, coin toss, logout and login', async () => {
  try {
    let result = await call('/api/state');
    assert.equal(result.status, 200);
    assert.equal(result.body.totalPlayers, 0);
    result = await call('/api/register', { username: 'TestUser_13', password: 'StrongExamplePass!1' });
    assert.equal(result.status, 200);
    assert.equal(result.body.user.username, 'TestUser_13');
    assert.equal(result.body.user.points, 0);
    result = await call('/api/mines/start', { difficulty: 'medium' });
    assert.equal(result.body.game.size, 6);
    assert.deepEqual([...new Set(result.body.game.tiles)], [null]);
    result = await call('/api/mines/reveal', { index: 14 });
    assert.equal(result.body.game.status, 'playing');
    assert(typeof result.body.game.tiles[14] === 'number');
    assert(result.body.game.revealed >= 1);
    result = await call('/api/profile', { minecraftName: 'Steve2026', showLeaderboard: false });
    assert.equal(result.body.user.minecraftName, 'Steve2026');
    assert.equal(result.body.user.showLeaderboard, false);
    result = await call('/api/coin/flip', { guess: 'heads' });
    assert.equal(result.status, 200);
    assert(['heads', 'tails'].includes(result.body.side));
    assert.equal(result.body.user.coinTosses, 1);
    result = await call('/api/logout', {});
    assert.equal(result.status, 200);
    result = await call('/api/state');
    assert.equal(result.body.user, null);
    result = await call('/api/login', { username: 'TestUser_13', password: 'StrongExamplePass!1' });
    assert.equal(result.status, 200);
    assert.equal(result.body.user.minecraftName, 'Steve2026');
    assert.equal(result.body.user.coinTosses, 1);
    result = await call('/api/register', { username: 'TestUser_13', password: 'StrongExamplePass!1' });
    assert.equal(result.status, 409);
  } finally {
    await new Promise(resolve => server.close(resolve));
    rmSync(temp, { recursive: true, force: true });
  }
});
