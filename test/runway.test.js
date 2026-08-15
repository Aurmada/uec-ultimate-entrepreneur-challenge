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
