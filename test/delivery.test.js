// SAME-DAY DELIVERY: the deferred effect, step 3 of the move system. A special
// that places an order on the rival's spot and lands there `delay` seconds
// later. Registry mechanics (declaration, reset, hashing) are covered for every
// field in fighterState.test.js; everything a delivery DOES lives here.
//
// Spec: docs/superpowers/specs/2026-10-18-same-day-delivery-design.md

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/engine/game.js';
import { AIController } from '../src/engine/ai.js';
import {
  FIGHTERS, SPECIALS, PLAYER_SPECIALS, getFighter, playerSpecialId, buildGhostFighter,
} from '../src/data/fighters.js';
import { ARCHETYPES, validateCharacter } from '../src/data/schema.js';
import { toCharacter } from '../src/data/fighters.js';
import { METER, PARRY, STAGE } from '../src/config.js';
import { hashGameState } from '../src/net/online.js';

const SD = SPECIALS.sameday;
const STUB_HUD = new Proxy({}, { get: () => () => {} });
const STUB_ARENA = { id: 'test', name: 'TEST', draw() {}, mood: 'none' };
const EMPTY = {
  left: false, right: false, up: false, down: false, block: false,
  slap: false, punch: false, kick: false, launch: false,
  special: false, super: false, bomb: false, dash: false, steal: false,
};
const idler = () => ({ isHuman: false, update(f) { f.pad = { ...EMPTY }; } });
const holding = (keys) => ({ isHuman: false, update(f) {
  f.pad = { ...EMPTY };
  for (const k of keys) f.pad[k] = true;
} });

// Presses `keys` for `hold` frames, starting on frame `at` of its own clock.
function presser(keys, { at = 0, hold = 4 } = {}) {
  let i = 0;
  return { isHuman: false, update(f) {
    const on = i >= at && i < at + hold; i++;
    f.pad = { ...EMPTY };
    for (const k of keys) f.pad[k] = on;
  } };
}

function match({ p1 = 'bozo', p2 = 'zara', c1 = idler(), c2 = idler(), seed = 20261018 } = {}) {
  return new Game({
    p1: { def: getFighter(p1), controller: c1 },
    p2: { def: getFighter(p2), controller: c2 },
    arena: STUB_ARENA, mode: 'solo', difficulty: 'founder',
    hud: STUB_HUD, onEnd: () => {}, seed,
  });
}

function toFighting(game) {
  for (let i = 0; i < 600 && game.state !== 'fighting'; i++) game.update(1 / 60);
  assert.equal(game.state, 'fighting', 'round never went live');
  return game;
}

const step = (game, n) => { for (let i = 0; i < n; i++) game.update(1 / 60); };

// Jeff at 300 orders onto a rival standing at `rivalX`, with a full meter. The
// controllers are swapped in only once the round is live, so the press is
// never thrown away by the intro.
function ordered({ rivalX = 600, c2 = idler(), p2 = 'zara' } = {}) {
  const game = toFighting(match({ p2 }));
  const [a, b] = game.fighters;
  a.x = 300; b.x = rivalX;
  a.energy = METER.MAX;
  a.controller = presser(['special']);
  b.controller = c2;
  return game;
}

// Steps until the order is out (the end of startup) and returns the frame.
function untilOrdered(game, limit = 60) {
  for (let i = 0; i < limit; i++) {
    game.update(1 / 60);
    if (game.fighters[0].deliveryT > 0) return i;
  }
  assert.fail('the order never went out');
}

// ---------------------------------------------------------------- the move

test('deferred is the twelfth archetype, appended after the eleven before it', () => {
  // state.js packs a command normal's archetype as an index into this array,
  // so the first eleven are a shipped wire format and must not move.
  assert.deepEqual(ARCHETYPES.slice(0, 11), [
    'strike', 'projectile', 'aoe', 'rush', 'grab', 'teleport', 'rain', 'counter', 'trap', 'stance',
    'burn',
  ]);
  assert.equal(ARCHETYPES[11], 'deferred');
});

test('Jeff owns SAME-DAY DELIVERY, Carl keeps the grab, and nobody shares a signature', () => {
  assert.equal(getFighter('bozo').special, 'sameday');
  assert.equal(SD.type, 'deferred');
  assert.equal(getFighter('dex').special, 'takeover');
  const roster = FIGHTERS.filter((f) => !f.base);
  const specials = roster.map((f) => f.special);
  assert.equal(new Set(specials).size, specials.length,
    `two roster fighters share a special: ${specials.join(', ')}`);
});

test('Jeff still validates as a character', () => {
  const r = validateCharacter(toCharacter(getFighter('bozo')));
  assert.deepEqual(r.errors, []);
});

test('the order goes out on the rival\'s spot when startup ends, and costs a special', () => {
  const game = ordered({ rivalX: 640 });
  const a = game.fighters[0];
  untilOrdered(game);
  assert.equal(a.deliveryX, 640, 'the order must be placed where the rival stood');
  assert.ok(Math.abs(a.deliveryT - SD.delay) < 0.05, `expected about ${SD.delay}s on the clock, saw ${a.deliveryT}`);
  assert.equal(a.energy, METER.MAX - METER.SPECIAL_COST);
});

test('a rival who stays put is hit when the clock runs out, and not before', () => {
  const game = ordered();
  const b = game.fighters[1];
  const hp0 = b.hp;
  untilOrdered(game);
  step(game, Math.floor(SD.delay * 60) - 3);
  assert.equal(b.hp, hp0, 'the parcel landed early');
  step(game, 6);
  assert.ok(b.hp < hp0, 'the parcel never landed on a rival who stood still');
  assert.equal(game.fighters[0].deliveryT, 0, 'the order must be cleared once it lands');
});

test('a clean hit pops the rival up, so Jeff can follow it', () => {
  const game = ordered();
  const b = game.fighters[1];
  untilOrdered(game);
  let popped = false;
  for (let i = 0; i < SD.delay * 60 + 10; i++) {
    game.update(1 / 60);
    if (b.airborne && b.state === 'hitstun') popped = true;
  }
  assert.equal(popped, true);
});

test('a rival who walks out of the zone takes nothing', () => {
  // Zara walks right, away from the zone, from the moment the order is out.
  const game = ordered({ rivalX: 600 });
  const b = game.fighters[1];
  const hp0 = b.hp;
  untilOrdered(game);
  b.controller = holding(['right']);
  step(game, SD.delay * 60 + 30);
  assert.ok(Math.abs(b.x - 600) > SD.radius, 'the fixture must actually leave the zone');
  assert.equal(b.hp, hp0, 'the parcel followed the rival out of the zone');
  assert.equal(game.fighters[0].deliveryT, 0, 'a miss must clear the order too');
});

test('jumping in place does not dodge it: it falls from the sky', () => {
  const game = ordered();
  const b = game.fighters[1];
  const hp0 = b.hp;
  untilOrdered(game);
  // Jump so the parcel arrives near the top of the jump.
  step(game, Math.floor(SD.delay * 60) - 22);
  b.controller = presser(['up'], { hold: 3 });
  step(game, 40);
  assert.ok(b.hp < hp0, 'a jump dodged a parcel falling from above');
});

test('Jeff does not sign for his own parcel', () => {
  const game = ordered();
  const [a, b] = game.fighters;
  const hp0 = a.hp;
  untilOrdered(game);
  step(game, 2);
  a.x = a.deliveryX; b.x = a.deliveryX + 200;   // stand on his own mark
  for (let i = 0; i < SD.delay * 60 + 10; i++) { game.update(1 / 60); a.x = a.deliveryX; }
  assert.equal(a.hp, hp0);
});

test('a held block takes chip, and the clock keeps running behind it', () => {
  const game = ordered({ c2: holding(['block']) });
  const b = game.fighters[1];
  const hp0 = b.hp;
  untilOrdered(game);
  step(game, SD.delay * 60 + 10);
  const lost = hp0 - b.hp;
  assert.ok(lost >= 1 && lost <= 4, `a blocked parcel should chip, it took ${lost}`);
});

test('a fresh block parries it, and the parry does not stagger a Jeff who is far away', () => {
  const game = ordered();
  const [a, b] = game.fighters;
  const hp0 = b.hp;
  untilOrdered(game);
  b.energy = 0;
  // Press block a few frames before the landing.
  step(game, Math.floor(SD.delay * 60) - 4);
  b.controller = holding(['block']);
  step(game, 12);
  assert.equal(b.hp, hp0, 'a parried parcel must do no damage');
  assert.equal(b.energy, PARRY.ENERGY, 'the fixture must resolve as a parry');
  assert.notEqual(a.state, 'hitstun', 'a parry staggered a thrower who was nowhere near it');
});

test('a second order while one is out is refused, and costs nothing', () => {
  const game = ordered();
  const a = game.fighters[0];
  untilOrdered(game);
  step(game, 30);
  const t0 = a.deliveryT, x0 = a.deliveryX, e0 = a.energy;
  assert.ok(e0 >= METER.SPECIAL_COST, 'the fixture must be able to afford a second order');
  a.controller = presser(['special']);
  step(game, 20);
  assert.equal(a.energy, e0, 'a refused order took meter');
  assert.equal(a.deliveryX, x0, 'the first order was replaced');
  assert.ok(a.deliveryT < t0, 'the first order\'s clock was reset');
});

test('Jeff hit during startup places no order', () => {
  const game = ordered({ rivalX: 360 });
  const [a, b] = game.fighters;
  // The rival jabs on the same frame; a punch starts faster than the order.
  b.controller = presser(['punch']);
  step(game, 40);
  assert.equal(a.deliveryT, 0, 'an order went out from a special that was interrupted');
});

// ------------------------------------------------------------- the edges

test('an order out when the round is won by KO is never delivered', () => {
  const game = ordered();
  const [a, b] = game.fighters;
  untilOrdered(game);
  step(game, 10);
  a.hp = 0;                     // Jeff loses the round with his parcel in the air
  step(game, 1);
  assert.equal(game.state, 'roundEnd');
  assert.equal(a.deliveryT, 0, 'the order must be cancelled at the bell');
  const hp0 = b.hp;
  step(game, 240);
  assert.equal(b.hp, hp0, 'a parcel landed on the winner after the round was over');
});

test('an order out at time-up is cancelled too', () => {
  const game = ordered();
  const a = game.fighters[0];
  untilOrdered(game);
  game.timer = 0.01;
  step(game, 2);
  assert.equal(game.state, 'roundEnd');
  assert.equal(a.deliveryT, 0);
});

test('the next round starts with nothing out', () => {
  const game = ordered();
  const a = game.fighters[0];
  untilOrdered(game);
  game.fighters[1].hp = 0;
  for (let i = 0; i < 900 && game.roundNum === 1; i++) game.update(1 / 60);
  assert.equal(game.roundNum, 2);
  assert.equal(a.deliveryT, 0);
  assert.equal(a.deliveryX, 0);
});

test('hitstop freezes the parcel in the air', () => {
  const game = ordered();
  const a = game.fighters[0];
  untilOrdered(game);
  const t0 = a.deliveryT;
  game.fx.hitstop(0.5);
  step(game, 20);
  assert.equal(a.deliveryT, t0, 'the delivery clock ran through a hitstop');
});

test('a pending order moves the state fingerprint', () => {
  const g1 = ordered(), g2 = ordered();
  untilOrdered(g1); untilOrdered(g2);
  assert.equal(hashGameState(g1), hashGameState(g2), 'the fixture must start identical');
  g2.fighters[0].deliveryT += 0.5;
  assert.notEqual(hashGameState(g1), hashGameState(g2), 'deliveryT is invisible to the hash');
  g2.fighters[0].deliveryT -= 0.5;
  g2.fighters[0].deliveryX += 40;
  assert.notEqual(hashGameState(g1), hashGameState(g2), 'deliveryX is invisible to the hash');
});

// --------------------------------------------------------- roster-only

test('SAME-DAY DELIVERY is roster-only: off the player menu, and off a challenge link', () => {
  assert.equal(SD.rosterOnly, true);
  assert.equal(PLAYER_SPECIALS.sameday, undefined);
  assert.equal(playerSpecialId('sameday'), 'pitchdeck');
  const ghost = buildGhostFighter({ n: 'ATTACKER', sp: 'sameday' });
  assert.notEqual(ghost.special, 'sameday', 'a hand-edited link handed a ghost a roster-only move');
});

test('deferred is refused as a command normal', () => {
  const ch = toCharacter(getFighter('kai'));
  ch.commandNormals = [{ slot: 'fwd+kick', archetype: 'deferred', displayName: 'LATER',
    frameData: { startup: 0.1, active: 0.06, recovery: 0.2, dmg: 10 } }];
  const r = validateCharacter(ch);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes("'deferred'")), r.errors.join('; '));
});

// ------------------------------------------------------------------ AI

// The AI rolls Math.random for every hesitation and every choice, which made
// these two tests pass or fail on luck. Each run gets its own seeded stream,
// so a failure here reproduces.
function seeded(seed, fn) {
  let s = seed >>> 0;
  const real = Math.random;
  Math.random = () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  try { return fn(); } finally { Math.random = real; }
}

test('Jeff\'s AI orders deliveries in a real match', () => {
  const bozo = getFighter('bozo'), zara = getFighter('zara');
  let orders = 0;
  for (let seed = 1; seed <= 3; seed++) seeded(seed, () => {
    const game = new Game({
      p1: { def: bozo, controller: new AIController('mogul', bozo) },
      p2: { def: zara, controller: new AIController('mogul', zara) },
      arena: STUB_ARENA, mode: 'solo', difficulty: 'mogul',
      hud: STUB_HUD, onEnd: () => {}, seed,
    });
    let was = 0;
    for (let i = 0; i < 60 * 60; i++) {
      game.update(1 / 60);
      const t = game.fighters[0].deliveryT;
      if (t > 0 && was === 0) orders++;
      was = t;
    }
  });
  assert.ok(orders >= 3, `Jeff's AI ordered ${orders} times in three minutes of fighting`);
});

test('a rival AI standing in the zone gets out of it', () => {
  // The fixture has to give the rival a reason to STAY, or it proves nothing:
  // an AI at range walks toward Jeff and out of any zone on its own (the first
  // version of this test passed before the AI knew deliveries existed). So the
  // rival starts in melee range of a Jeff who holds block and is pinned in
  // place, where every AI stands and swings. Measured over several orders so
  // one hesitation roll does not decide it.
  let left = 0, tries = 0;
  for (const id of ['zara', 'kai', 'eleanor', 'dex']) {
    for (let seed = 1; seed <= 3; seed++) seeded(seed * 7919, () => {
      const game = ordered({ p2: id, rivalX: 390 });
      const [a, b] = game.fighters;
      untilOrdered(game);
      const mark = a.deliveryX;
      a.controller = holding(['block']);
      b.controller = new AIController('mogul', b.def);
      for (let i = 0; i < Math.floor(SD.delay * 60) - 2; i++) {
        game.update(1 / 60);
        a.x = 300; a.vx = 0;
      }
      tries++;
      if (Math.abs(b.x - mark) > SD.radius) left++;
    });
  }
  assert.ok(left >= tries * 0.6, `a champion AI left the zone ${left} times out of ${tries}`);
});

test('the zone stays on the stage', () => {
  const game = ordered({ rivalX: STAGE.MAX_X });
  untilOrdered(game);
  const x = game.fighters[0].deliveryX;
  assert.ok(x >= STAGE.MIN_X && x <= STAGE.MAX_X);
});
