// The registry exists because two hand-maintained lists — resetForRound and
// hashGameState — had already drifted apart from the fields they govern. Its
// whole value is that opting out costs a written justification, so these
// tests check the CONTRACT, not just the data.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FIGHTER_STATE, RESET_KEYS, HASH_KEYS, quantise } from '../src/engine/fighterState.js';

test('every entry declares the four required fields', () => {
  for (const e of FIGHTER_STATE) {
    assert.equal(typeof e.key, 'string', `entry missing key: ${JSON.stringify(e)}`);
    assert.ok('init' in e, `${e.key} missing init`);
    assert.ok(e.round === 'reset' || e.round === 'keep', `${e.key} round must be reset|keep`);
    assert.ok(e.hash === false || ['q8', 'int', 'enum'].includes(e.hash),
      `${e.key} hash must be false|q8|int|enum`);
  }
});

test('opting out of reset or hashing costs a written justification', () => {
  for (const e of FIGHTER_STATE) {
    if (e.round === 'keep' || e.hash === false) {
      assert.ok(typeof e.why === 'string' && e.why.length > 10,
        `${e.key} opts out but has no why — that is the whole point of the registry`);
    }
  }
});

test('keys are unique', () => {
  const seen = new Set();
  for (const e of FIGHTER_STATE) {
    assert.ok(!seen.has(e.key), `duplicate key ${e.key}`);
    seen.add(e.key);
  }
});

test('the eight fields that drifted out of resetForRound are all declared', () => {
  for (const k of ['stunT', 'comboDropT', 'airAttackUsed', 'energy',
                   'walkPhase', 'movingBack', 'moveVx', 'dashDir']) {
    assert.ok(FIGHTER_STATE.some((e) => e.key === k), `${k} is not in the registry`);
  }
});

test('energy carries between rounds, and says so', () => {
  const e = FIGHTER_STATE.find((x) => x.key === 'energy');
  assert.equal(e.round, 'keep');
  assert.match(e.why, /round/i);
});

test('RESET_KEYS and HASH_KEYS are derived, not hand-listed', () => {
  assert.deepEqual(RESET_KEYS, FIGHTER_STATE.filter((e) => e.round === 'reset').map((e) => e.key));
  assert.deepEqual(HASH_KEYS, FIGHTER_STATE.filter((e) => e.hash).map((e) => e.key));
});

test('quantisers match what hashGameState already does', () => {
  assert.equal(quantise('q8', 1.26), Math.round(1.26 * 8));
  assert.equal(quantise('int', 3.9), 3);
  assert.equal(quantise('enum', null), 0);
  assert.equal(quantise('enum', 'safety'), quantise('enum', 'safety'));
  assert.notEqual(quantise('enum', 'safety'), quantise('enum', 'capabilities'));
});

import { Fighter } from '../src/engine/fighter.js';
import { FIGHTERS } from '../src/data/fighters.js';

const mk = (side = 0) => new Fighter(FIGHTERS[0], side, { isHuman: false, update() {} });

test('a fresh fighter has every registry key at its declared init', () => {
  const f = mk();
  for (const e of FIGHTER_STATE) {
    const want = typeof e.init === 'function' ? e.init() : e.init;
    assert.deepEqual(f[e.key], want, `${e.key} did not initialise from the registry`);
  }
});

test('a round transition resets every reset key and leaves every keep key alone', () => {
  const f = mk();
  // Dirty everything, so a field that is silently skipped shows up.
  for (const e of FIGHTER_STATE) {
    f[e.key] = typeof e.init === 'boolean' ? !e.init
             : typeof e.init === 'number' ? e.init + 7
             : 'safety';
  }
  const keptBefore = Object.fromEntries(
    FIGHTER_STATE.filter((e) => e.round === 'keep').map((e) => [e.key, f[e.key]]));

  f.resetForRound(0);

  for (const e of FIGHTER_STATE) {
    const want = typeof e.init === 'function' ? e.init() : e.init;
    if (e.round === 'reset') {
      assert.deepEqual(f[e.key], want, `${e.key} declares reset but survived the round`);
    } else {
      assert.deepEqual(f[e.key], keptBefore[e.key], `${e.key} declares keep but was cleared`);
    }
  }
});

test('energy specifically survives a round — the rule the registry made explicit', () => {
  const f = mk();
  f.energy = 55;
  f.resetForRound(0);
  assert.equal(f.energy, 55);
});

test('positional state still resets, and still depends on side', () => {
  const a = mk(0), b = mk(1);
  a.x = b.x = 999; a.hp = b.hp = 3;
  a.resetForRound(0); b.resetForRound(1);
  assert.equal(a.hp, a.maxHp);
  assert.notEqual(a.x, b.x, 'the two sides must start apart');
});

import { hashGameState, SIM_VERSION } from '../src/net/online.js';

// A minimal game-shaped object: hashGameState only reads these.
function fakeGame() {
  const f = () => { const x = mk(); return x; };
  return { fighters: [f(), f()], timer: 60, roundWins: [0, 0], projectiles: [], drops: [] };
}

test('every hashed key actually moves the fingerprint', () => {
  for (const e of FIGHTER_STATE) {
    if (!e.hash) continue;
    const g = fakeGame();
    const before = hashGameState(g);
    g.fighters[0][e.key] = e.hash === 'enum' ? 'capabilities'
                         : typeof e.init === 'boolean' ? !e.init : (e.init || 0) + 5;
    assert.notEqual(hashGameState(g), before, `${e.key} declares hash but does not affect it`);
  }
});

test('an unhashed key never moves the fingerprint', () => {
  for (const e of FIGHTER_STATE) {
    if (e.hash) continue;
    const g = fakeGame();
    const before = hashGameState(g);
    g.fighters[0][e.key] = typeof e.init === 'boolean' ? !e.init : (e.init || 0) + 5;
    assert.equal(hashGameState(g), before, `${e.key} declares hash:false but changed it`);
  }
});

test('the simulation version was bumped for the behaviour change', () => {
  assert.equal(SIM_VERSION, 5);
});

import { readFileSync } from 'node:fs';

test('a timer added to Fighter outside the registry fails the suite', () => {
  const src = readFileSync(new URL('../src/engine/fighter.js', import.meta.url), 'utf8');
  const ctor = src.slice(src.indexOf('constructor('), src.indexOf('resetForRound'));
  const declared = new Set(FIGHTER_STATE.map((e) => e.key));
  const stray = [...ctor.matchAll(/this\.(\w+T) =/g)]
    .map((m) => m[1])
    .filter((k) => !declared.has(k));
  assert.deepEqual(stray, [],
    `these timers are set on Fighter but not declared in fighterState.js: ${stray.join(', ')}. `
    + 'Undeclared state is state the hash cannot see and resetForRound will not clear.');
});
