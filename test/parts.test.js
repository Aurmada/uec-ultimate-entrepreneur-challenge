// Parts are render-only geometry, but they are still authored data, so they
// get the same treatment as everything else a human types: rejected loudly
// rather than silently repaired. This codebase has been bitten by silent
// fallbacks more than once — getFighter returning Lizbeth for an unknown id,
// AI_LEVELS quietly resolving an unknown difficulty to `founder`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateParts, PART_SHAPES, PART_ANCHORS, FILL_ROLES,
  validateCharacter, SCHEMA_VERSION, DEFAULT_BODY,
} from '../src/data/schema.js';

const good = () => ({
  id: 'case', shape: 'roundRect', anchor: 'armB',
  dx: 6, dy: 4, w: 40, h: 32, rot: 0, fill: 'accent', z: 'front',
});

test('the vocabulary is closed and complete', () => {
  assert.deepEqual(PART_SHAPES, ['roundRect', 'ellipse', 'capsule', 'path']);
  assert.deepEqual(PART_ANCHORS,
    ['armF', 'armB', 'legF', 'legB', 'head', 'shoulder', 'hip', 'torso']);
  assert.deepEqual(FILL_ROLES,
    ['skin', 'suit', 'suit2', 'accent', 'hair', 'pants', 'shoe']);
});

test('a well-formed part validates clean', () => {
  assert.deepEqual(validateParts([good()]), []);
});

test('absent parts are valid — most characters have none', () => {
  assert.deepEqual(validateParts(undefined), []);
  assert.deepEqual(validateParts([]), []);
});

test('an unknown shape is rejected', () => {
  const e = validateParts([{ ...good(), shape: 'blob' }]);
  assert.equal(e.length, 1);
  assert.match(e[0], /shape/);
});

test('an unknown anchor is rejected', () => {
  const e = validateParts([{ ...good(), anchor: 'elbow' }]);
  assert.match(e[0], /anchor/);
});

test('an unknown fill role is rejected, but a hex is allowed', () => {
  assert.match(validateParts([{ ...good(), fill: 'leather' }])[0], /fill/);
  assert.deepEqual(validateParts([{ ...good(), fill: '#6b4a2b' }]), []);
});

test('an out-of-range offset is rejected, not clamped', () => {
  const e = validateParts([{ ...good(), dx: 999 }]);
  assert.match(e[0], /dx/);
});

test('a duplicate id within one character is rejected', () => {
  const e = validateParts([good(), good()]);
  assert.match(e[0], /duplicate/);
});

test('more than the cap is rejected', () => {
  const many = Array.from({ length: 7 }, (_, i) => ({ ...good(), id: 'p' + i }));
  assert.match(validateParts(many)[0], /at most/);

  // The cap must not mask the rest. An author fixing one error at a time,
  // re-running between each, is exactly the loop this validator exists to avoid.
  const alsoBroken = [...many];
  alsoBroken[3] = { ...alsoBroken[3], shape: 'blob' };
  const errs = validateParts(alsoBroken);
  assert.ok(errs.some((e) => /at most/.test(e)), 'cap error still reported');
  assert.ok(errs.some((e) => /shape/.test(e)), 'per-part errors survive the cap error');
});

test('a path needs at least 3 points and at most 24', () => {
  const path = (n) => ({
    id: 'coat', shape: 'path', anchor: 'hip', dx: 0, dy: 0, fill: 'suit2', z: 'behind',
    pts: Array.from({ length: n }, (_, i) => [i, i]),
  });
  assert.match(validateParts([path(2)])[0], /points/);
  assert.match(validateParts([path(25)])[0], /points/);
  assert.deepEqual(validateParts([path(4)]), []);
});

test('follow outside 0..1 is rejected', () => {
  assert.match(validateParts([{ ...good(), follow: 1.5 }])[0], /follow/);
});

function baseChar(parts) {
  return {
    schema: SCHEMA_VERSION,
    id: 'tester',
    identity: { name: 'TEST', title: 'THE TEST', company: 'TESTCO', tagline: 'x', rap: 'y' },
    body: { ...DEFAULT_BODY },
    look: {},
    fighting: {
      startup: 1, dmg: 1, reach: 1, recovery: 1, speed: 1, hp: 1,
      moves: { special: { archetype: 'strike' }, signature: null },
    },
    commandNormals: [],
    ai: { aggr: 0.5, jump: 0.3, prefRange: 'mid' },
    parts,
  };
}

test('a character with a valid part validates clean', () => {
  const r = validateCharacter(baseChar([good()]));
  assert.equal(r.ok, true, r.errors.join('; '));
});

test('a character with a broken part is rejected', () => {
  const r = validateCharacter(baseChar([{ ...good(), anchor: 'nose' }]));
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /anchor/.test(e)), r.errors.join('; '));
});

test('parts are NOT priced — they are render-only like shoulders and stride', () => {
  const without = validateCharacter(baseChar(undefined)).cost;
  const heavy = Array.from({ length: 6 }, (_, i) => ({ ...good(), id: 'p' + i }));
  const with6 = validateCharacter(baseChar(heavy)).cost;
  assert.equal(with6, without, 'adding parts must not move the power budget');
});
