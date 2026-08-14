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
