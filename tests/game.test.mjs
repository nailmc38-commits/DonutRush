import test from 'node:test';
import assert from 'node:assert/strict';
import { DIFFICULTIES, neighbors, armGame, revealGame, visibleGame } from '../server.mjs';

function fresh(size, mineCount) {
  return { size, mineCount, difficulty: 'easy', pointReward: 100, status: 'playing', revealed: new Set(), flags: new Set(), mines: new Set(), armed: false };
}
test('all game difficulties have safe tile counts', () => {
  for (const game of Object.values(DIFFICULTIES)) assert(game.mines < game.size * game.size - 9);
});
test('neighbors handles corner, edge and center', () => {
  assert.equal(neighbors(0, 5).length, 3);
  assert.equal(neighbors(2, 5).length, 5);
  assert.equal(neighbors(12, 5).length, 8);
});
test('first click and surrounding area are always safe', () => {
  for (const { size, mines } of Object.values(DIFFICULTIES)) {
    for (const first of [0, Math.floor(size * size / 2), size * size - 1]) {
      const g = fresh(size, mines);
      armGame(g, first);
      assert.equal(g.mines.size, mines);
      assert(!g.mines.has(first));
      for (const n of neighbors(first, size)) assert(!g.mines.has(n));
    }
  }
});
test('a complete puzzle is detected as a win', () => {
  const g = fresh(3, 1);
  g.mines = new Set([8]); g.armed = true;
  for (let i = 0; i < 8; i++) revealGame(g, i);
  assert.equal(g.status, 'won');
  assert.equal(g.revealed.size, 8);
  assert.equal(visibleGame(g).tiles[8], 'mine');
});
test('mines end a game and cannot reveal afterwards', () => {
  const g = fresh(4, 1);
  g.mines = new Set([5]); g.armed = true;
  revealGame(g, 5); assert.equal(g.status, 'lost');
  const before = g.revealed.size;
  revealGame(g, 0); assert.equal(g.revealed.size, before);
});
test('live game responses never expose hidden mine positions', () => {
  const g = fresh(4, 1); g.armed = true; g.mines = new Set([5]);
  const publicState = visibleGame(g);
  assert(publicState.tiles.every(item => item === null));
  assert.equal(JSON.stringify(publicState).includes('mines":['), false);
});
