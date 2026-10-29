// A single-player match against a roster AI is reported (report_solo) so the
// difficulty levels can be tuned on how real players do. What is sent must be
// exactly what the server's table accepts, and nothing about the player: no
// id, no name, no build. A ghost challenge and anything not single-player are
// not reported. The game's own result, as Game.onEnd hands it over, is used.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { soloReport } from '../src/net/cloud.js';
import { Game } from '../src/engine/game.js';
import { FIGHTERS, BASE_CHARACTERS } from '../src/data/fighters.js';
import { AI_LEVELS } from '../src/config.js';
import { AIController } from '../src/engine/ai.js';

const HUD = new Proxy({}, { get: () => () => {} });
const ARENA = { id: 'test', name: 'TEST', draw() {}, mood: 'none' };
const idle = { isHuman: false, update(f) { f.pad = {}; } };

// A finished match, through the real Game: a Champion AI against one that
// stands still, so it ends in a minute or so of game time.
function finished({ mode = 'solo', isChallenge = false, difficulty = 'intern' } = {}) {
  let result = null;
  const game = new Game({
    p1: { def: BASE_CHARACTERS[0], controller: idle },
    p2: { def: FIGHTERS[1], controller: new AIController('mogul', FIGHTERS[1]) },
    arena: ARENA, mode, difficulty, isChallenge, hud: HUD, onEnd: (r) => { result = r; }, seed: 5,
  });
  for (let i = 0; i < 60 * 60 * 6 && !result; i++) game.update(1 / 60);
  assert.ok(result, 'the match never ended');
  return result;
}

test('a single-player match is reported as the server table takes it, and nothing about the player', () => {
  const result = finished();
  const p = soloReport(result, { version: 'v9.9', threeD: true });
  assert.deepEqual(Object.keys(p).sort(), ['p_ko_rounds', 'p_level', 'p_opponent', 'p_rounds_lost', 'p_rounds_won',
    'p_three_d', 'p_version', 'p_won'].sort());
  assert.equal(p.p_opponent, FIGHTERS[1].id);
  assert.match(p.p_opponent, /^[a-z0-9-]{2,16}$/);
  assert.ok(Object.keys(AI_LEVELS).includes(p.p_level));
  assert.equal(p.p_won, result.winnerIdx === 0);
  // the table's own checks: a best of three, and KOs only in rounds won
  assert.ok(p.p_won ? p.p_rounds_won === 2 && p.p_rounds_lost <= 1 : p.p_rounds_lost === 2 && p.p_rounds_won <= 1,
    `score ${p.p_rounds_won}-${p.p_rounds_lost} would be refused`);
  assert.ok(p.p_ko_rounds >= 0 && p.p_ko_rounds <= p.p_rounds_won);
  assert.equal(p.p_version, 'v9.9');
  assert.equal(p.p_three_d, true);
});

test('a ghost challenge, a two-player match and an online match are not reported', () => {
  assert.equal(soloReport(finished({ isChallenge: true })), null);
  assert.equal(soloReport(finished({ mode: 'versus' })), null);
  assert.equal(soloReport({ ...finished(), mode: 'online' }), null);
  assert.equal(soloReport(null), null);
});
