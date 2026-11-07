// The pace of a match (a game designer's review, 2026-11-06). Two things made
// matches feel samey and slow, and both are simulation, so both are pinned:
// UNICORN MODE came about twice a player a match, on screen for nearly 40% of
// the fighting, and a knockout held the players for 4.65 s before the next
// round and 5.4 s before the results. Each test here fails on the code before.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/engine/game.js';
import { FIGHTERS } from '../src/data/fighters.js';
import { ROUND } from '../src/config.js';
import { runMatch } from '../lab/balance.js';
import { canSkipVictory } from '../src/ui/flow.js';

const STUB_HUD = new Proxy({}, { get: () => () => {} });
const STUB_ARENA = { id: 'test', name: 'TEST', draw() {}, mood: 'none' };
const EMPTY = {
  left: false, right: false, up: false, down: false, block: false,
  slap: false, punch: false, kick: false, launch: false,
  special: false, super: false, bomb: false, dash: false, steal: false,
};
const idler = () => ({ isHuman: false, update(f) { f.pad = { ...EMPTY }; } });
const byId = (id) => FIGHTERS.find((f) => f.id === id);
const FRAME = 1 / 60;
const ROSTER = ['ava', 'max', 'kai', 'zara', 'eleanor', 'dex', 'elo', 'bozo', 'scam'];

test('UNICORN MODE comes about once a player a match, not twice', async () => {
  // AI against AI at Contender, each of the nine once, seeded. At 12 and 8
  // meter a hit this read 1.9 a player a match; at 9 and 4, about 1.
  let unicorns = 0, matches = 0;
  for (let i = 0; i < ROSTER.length; i++) {
    const a = ROSTER[i], b = ROSTER[(i + 4) % ROSTER.length];
    await runMatch(a, b, 'founder', 7001 + i, {
      setup(game) {
        for (const f of game.fighters) {
          const go = f.activateUnicorn.bind(f);
          f.activateUnicorn = (g) => { unicorns++; return go(g); };
        }
      },
    });
    matches++;
  }
  const each = unicorns / matches / 2;
  assert.ok(each <= 1.4, `${each.toFixed(2)} UNICORN MODEs a player a match`);
  assert.ok(each >= 0.5, `${each.toFixed(2)} UNICORN MODEs a player a match: too rare to plan for`);
});

// A live round between two idle fighters, Jeff's rival knocked out at once.
// Returns the game and a clock that counts frames until `until` holds.
function knockedOut(ko = 1) {
  let ended = null;
  const game = new Game({
    p1: { def: byId('bozo'), controller: idler() }, p2: { def: byId('kai'), controller: idler() },
    arena: STUB_ARENA, mode: 'solo', difficulty: 'intern',
    hud: STUB_HUD, onEnd: (r) => { ended = r; }, seed: 20261107,
  });
  const live = () => { for (let i = 0; i < 600 && game.state !== 'fighting'; i++) game.update(FRAME); };
  live();
  for (let k = 1; k < ko; k++) {
    game.doKO(0, 1);
    for (let i = 0; i < 1200 && game.state !== 'intro'; i++) game.update(FRAME);
    live();
  }
  game.doKO(0, 1);
  const seconds = (until) => {
    let n = 0;
    while (!until() && n < 60 * 20) { game.update(FRAME); n++; }
    return n * FRAME;
  };
  return { game, seconds, ended: () => ended };
}

test('a knockout hands back control in under 4 s, not 4.65', () => {
  const { game, seconds } = knockedOut();
  const t = seconds(() => game.state === 'fighting');
  assert.ok(t <= 3.8, `${t.toFixed(2)} s from the knockout to the next round`);
  assert.ok(t >= 3, `${t.toFixed(2)} s: too short to see the knockout land`);
});

test('the match-winning knockout reaches the results in under 4.5 s, not 5.4', () => {
  const { seconds, ended } = knockedOut(2);
  const t = seconds(() => ended());
  assert.ok(ended(), 'the match never ended');
  assert.ok(t <= 4.3, `${t.toFixed(2)} s from the knockout to the results`);
});

test('in single player the victory pose can be skipped, once it has begun', () => {
  const { game, seconds } = knockedOut(2);
  assert.equal(canSkipVictory(game), false, 'skippable during the knockout itself');
  seconds(() => game.state === 'matchEnd');
  assert.equal(canSkipVictory(game), false, 'skippable on the frame it began: the winning blow would skip it');
  seconds(() => game.stateT >= ROUND.SKIP_AFTER);
  assert.equal(canSkipVictory(game), true);
  game.paused = true;
  assert.equal(canSkipVictory(game), false, 'skippable behind the pause menu');
  game.paused = false;
  for (const mode of ['online', 'versus']) {
    assert.equal(canSkipVictory({ ...game, mode, state: game.state, stateT: game.stateT }), false, `skippable ${mode}`);
  }
  game.finish();
  assert.equal(canSkipVictory(game), false, 'skippable once it is over');
});
