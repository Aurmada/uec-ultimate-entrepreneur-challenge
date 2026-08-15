// RUNWAY — a resource that drains on a clock, and the fighter states that
// hang off it. Registry mechanics (declaration, reset, hashing) live in
// fighterState.test.js; everything a runway DOES lives here.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Fighter } from '../src/engine/fighter.js';
import { FIGHTERS, getFighter } from '../src/data/fighters.js';
import { RUNWAY } from '../src/config.js';

const stub = { isHuman: false, update() {} };
const mk = (def, side = 0) => new Fighter(def, side, stub);

// ava, who does not use runway. FIGHTERS[0] and the neutral case throughout.
const plain = () => mk(FIGHTERS[0]);

test('usesRunway is a character flag, and it defaults off', () => {
  assert.equal(plain().usesRunway, false);
  assert.equal(mk({ ...FIGHTERS[0], usesRunway: true }).usesRunway, true);
});

test('a fighter without usesRunway is never winded, even at zero', () => {
  const f = plain();
  f.runway = 0;
  assert.equal(f.winded, false,
    'a fighter who does not use the resource must never suffer its penalty');
  assert.equal(f.speedMult, plain().speedMult);
  assert.equal(f.dmgMult, plain().dmgMult);
  assert.equal(f.takenMult, plain().takenMult);
});

test('winded makes a fighter slower, weaker and easier to hit', () => {
  const f = mk({ ...FIGHTERS[0], usesRunway: true });
  const speed0 = f.speedMult, dmg0 = f.dmgMult, taken0 = f.takenMult;
  f.runway = 0;
  assert.equal(f.winded, true);
  assert.ok(Math.abs(f.speedMult - speed0 * RUNWAY.WINDED.speed) < 1e-9);
  assert.ok(Math.abs(f.dmgMult - dmg0 * RUNWAY.WINDED.dmg) < 1e-9);
  assert.ok(Math.abs(f.takenMult - taken0 * RUNWAY.WINDED.taken) < 1e-9);
});

// The whole reason `winded` is derived rather than a timer: there is nothing
// to expire, so the instant a refill lands the penalty is gone.
test('winded clears the moment runway is above zero — there is no separate timer', () => {
  const f = mk({ ...FIGHTERS[0], usesRunway: true });
  f.runway = 0;
  assert.equal(f.winded, true);
  f.runway = 0.001;
  assert.equal(f.winded, false);
});

test('winded stacks multiplicatively with the buffs already in the getters', () => {
  const f = mk({ ...FIGHTERS[0], usesRunway: true });
  f.runway = 0;
  const windedOnly = f.dmgMult;
  f.unicornT = 5;
  assert.ok(f.dmgMult > windedOnly, 'Unicorn must still add on top of being winded');
});

import { Game } from '../src/engine/game.js';
import { ROUND, PARRY } from '../src/config.js';

const STUB_HUD = new Proxy({}, { get: () => () => {} });
const STUB_ARENA = { id: 'test', name: 'TEST', draw() {}, mood: 'none' };
const EMPTY = {
  left: false, right: false, up: false, down: false, block: false,
  slap: false, punch: false, kick: false, launch: false,
  special: false, super: false, bomb: false, dash: false, steal: false,
};
const idler = () => ({ isHuman: false, update(f) { f.pad = { ...EMPTY }; } });

// Adam is the only character who opts in. p1 is always the runway user here.
function match({ p1 = 'max', p2 = 'zara', c1 = idler(), c2 = idler() } = {}) {
  return new Game({
    p1: { def: getFighter(p1), controller: c1 },
    p2: { def: getFighter(p2), controller: c2 },
    arena: STUB_ARENA, mode: 'solo', difficulty: 'founder',
    hud: STUB_HUD, onEnd: () => {}, seed: 20260815,
  });
}

function toFighting(game) {
  for (let i = 0; i < 600 && game.state !== 'fighting'; i++) game.update(1 / 60);
  assert.equal(game.state, 'fighting', 'round never went live');
  return game;
}

const step = (game, n) => { for (let i = 0; i < n; i++) game.update(1 / 60); };

test('runway drains at DRAIN per second while the round is live', () => {
  const game = toFighting(match());
  const before = game.fighters[0].runway;
  step(game, 60);
  const spent = before - game.fighters[0].runway;
  assert.ok(Math.abs(spent - RUNWAY.DRAIN) < 0.2,
    `expected about ${RUNWAY.DRAIN} per second, saw ${spent.toFixed(3)}`);
});

// A resource that ticks while "ROUND 1" is still on screen would hand the
// player a fight they had already started losing before they could press
// anything.
test('runway does not move during the round intro', () => {
  const game = match();
  assert.equal(game.state, 'intro');
  step(game, 30);
  assert.equal(game.state, 'intro', 'the fixture must still be in the intro');
  assert.equal(game.fighters[0].runway, RUNWAY.MAX);
});

test('runway does not move after a KO', () => {
  const game = toFighting(match());
  step(game, 30);
  game.fighters[1].hp = 0;
  step(game, 1);
  assert.equal(game.state, 'roundEnd');
  const frozen = game.fighters[0].runway;
  assert.ok(frozen < RUNWAY.MAX, 'the fixture must have drained something first');
  step(game, 60);
  assert.equal(game.fighters[0].runway, frozen, 'the tank ticked through a KO');
});

test('a paused match does not drain', () => {
  const game = toFighting(match());
  step(game, 30);
  const frozen = game.fighters[0].runway;
  game.paused = true;
  step(game, 60);
  assert.equal(game.fighters[0].runway, frozen);
});

// Free from the registry's `round: 'reset'`, but this is the guarantee the
// whole mechanic rests on, so it is asserted rather than assumed.
test('a new round starts on a full tank', () => {
  const game = toFighting(match());
  step(game, 120);
  assert.ok(game.fighters[0].runway < RUNWAY.MAX);
  game.fighters[1].hp = 0;
  for (let i = 0; i < 600 && game.roundNum === 1; i++) game.update(1 / 60);
  assert.equal(game.roundNum, 2, 'the match never reached a second round');
  assert.equal(game.fighters[0].runway, RUNWAY.MAX);
});

test('a fighter without usesRunway never drains, across a whole round', () => {
  const game = toFighting(match({ p1: 'zara', p2: 'kai' }));
  step(game, Math.ceil(ROUND.TIME * 60) - 60);
  for (const f of game.fighters) {
    assert.equal(f.usesRunway, false, 'the fixture must be two non-users');
    assert.equal(f.runway, RUNWAY.MAX, `${f.def.id} drained without opting in`);
    assert.equal(f.winded, false);
  }
});
