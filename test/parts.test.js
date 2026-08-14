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
import { resolveParts, anchorPoint, partLagState, applyFollow, drawParts } from '../src/engine/parts.js';
import { STYLIZE } from '../src/config.js';
import { toCharacter } from '../src/data/fighters.js';
import { CHARACTER_WIRE_VERSION } from '../src/net/online.js';

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

test('a states list must be an array of known pose states', () => {
  assert.match(validateParts([{ ...good(), states: 5 }])[0], /states/);
  assert.match(validateParts([{ ...good(), states: 'block' }])[0], /states/);
  assert.match(validateParts([{ ...good(), states: [] }])[0], /states/);
  assert.match(validateParts([{ ...good(), states: ['blok'] }])[0], /states/);
  assert.deepEqual(validateParts([{ ...good(), states: ['block', 'crouch'] }]), []);
});

function baseChar(parts) {
  return {
    schema: SCHEMA_VERSION,
    id: 'tester',
    identity: { name: 'TEST', title: 'THE TEST', company: 'TESTCO', tagline: 'x', rap: 'y' },
    body: { ...DEFAULT_BODY },
    look: {},
    fighting: {
      // dmg is deliberately off 1 (not the neutral baseline) so this fixture
      // prices to a NONZERO cost. A fixture that prices to 0 on both sides of
      // the parts-pricing test below would pass that test even if someone
      // wired parts.length into the pricer proportionally — 0 * anything is
      // still 0. See "parts are NOT priced" for why that matters.
      startup: 1, dmg: 1.03, reach: 1, recovery: 1, speed: 1, hp: 1,
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
  // baseChar's fighting profile must price to something other than zero, or
  // this assertion is vacuous: a proportional pricing bug (cost * (1 + k *
  // parts.length)) still maps 0 to 0 and would slip straight through.
  assert.notEqual(without, 0, 'fixture must price to a nonzero cost or this test proves nothing');
  assert.equal(with6, without, 'adding parts must not move the power budget');
});

function samplePose() {
  return {
    hipY: -88, shoulderY: -156, headX: 0, headY: -182, rot: 0, crouch: 0,
    armF: { x: 34, y: -146 }, armB: { x: 13, y: -144 },
    legF: { x: 26, y: 0 }, legB: { x: -25, y: 0 },
    bodyLean: 0, sx: 1, sy: 1, headR: 18,
  };
}

const COLOURS = { skin: '#e8b48c', suit: '#5865f2', suit2: '#3d47c9',
                  accent: '#29d9ff', hair: '#e8dcc0', pants: '#23294f', shoe: '#eef1ff' };

test('a part resolves to absolute coordinates at its anchor plus offset', () => {
  const P = samplePose();
  const [r] = resolveParts([{ ...good(), anchor: 'armB', dx: 6, dy: 4 }], P, COLOURS);
  assert.equal(r.x, P.armB.x + 6);
  assert.equal(r.y, P.armB.y + 4);
});

test('a fill ROLE resolves to the character colour, a hex passes through', () => {
  const P = samplePose();
  const [role] = resolveParts([{ ...good(), fill: 'accent' }], P, COLOURS);
  assert.equal(role.fill, COLOURS.accent);
  const [hex] = resolveParts([{ ...good(), fill: '#6b4a2b' }], P, COLOURS);
  assert.equal(hex.fill, '#6b4a2b');
});

test('a part anchored to the front hand tracks the reach-scaled joint', () => {
  const near = samplePose();
  const far = samplePose();
  far.armF.x = 90;                       // as an attack re-scale would move it
  const [a] = resolveParts([{ ...good(), anchor: 'armF', dx: 0, dy: 0 }], near, COLOURS);
  const [b] = resolveParts([{ ...good(), anchor: 'armF', dx: 0, dy: 0 }], far, COLOURS);
  assert.equal(b.x - a.x, 56, 'the part must follow the hand, not sit at a fixed offset');
});

test('parts split into their z layers, preserving author order', () => {
  const P = samplePose();
  const out = resolveParts([
    { ...good(), id: 'a', z: 'behind' },
    { ...good(), id: 'b', z: 'front' },
    { ...good(), id: 'c', z: 'behind' },
  ], P, COLOURS);
  assert.deepEqual(out.filter((p) => p.z === 'behind').map((p) => p.id), ['a', 'c']);
});

test('absent or empty parts resolve to nothing, allocating no array churn', () => {
  assert.deepEqual(resolveParts(undefined, samplePose(), COLOURS), []);
  assert.deepEqual(resolveParts([], samplePose(), COLOURS), []);
});

test('every anchor name in the vocabulary resolves to a finite point', () => {
  const P = samplePose();
  for (const a of PART_ANCHORS) {
    const pt = anchorPoint(a, P);
    assert.ok(Number.isFinite(pt.x) && Number.isFinite(pt.y), `${a} did not resolve`);
  }
});

test('a body lean swings the hip and shoulder sockets but not the hands', () => {
  const up = samplePose();
  const leaned = samplePose();
  leaned.bodyLean = 0.4;
  assert.notEqual(anchorPoint('hip', leaned).x, anchorPoint('hip', up).x);
  assert.notEqual(anchorPoint('shoulder', leaned).x, anchorPoint('shoulder', up).x);
  assert.equal(anchorPoint('armB', leaned).x, anchorPoint('armB', up).x);
});

test('a part with a states list only resolves in those states', () => {
  const P = samplePose();
  const part = { ...good(), states: ['block'] };

  P.partState = 'block';
  assert.equal(resolveParts([part], P, COLOURS).length, 1, 'should resolve in a listed state');

  P.partState = 'idle';
  assert.equal(resolveParts([part], P, COLOURS).length, 0, 'should be skipped in an unlisted state');

  // A part with no states list is unconditional — most parts are.
  assert.equal(resolveParts([good()], P, COLOURS).length, 1);
});

test('the head anchor is clamped up to the neck, never below it', () => {
  const low = samplePose();          // headY below headTop — must clamp
  const clamped = anchorPoint('head', low);
  const headTop = low.shoulderY - (low.headR - STYLIZE.NECK_OVERLAP);
  assert.equal(clamped.y, headTop, 'a head below the neck must be lifted to it');

  const high = samplePose();         // headY numerically above headTop — must pass through
  high.headY = headTop + 40;
  assert.equal(anchorPoint('head', high).y, headTop + 40, 'a head above the neck is left alone');
});

test('toCharacter carries parts through to the validated character', () => {
  const def = { id: 'x', name: 'X', style: 'balanced', special: 'pitchdeck', parts: [good()] };
  assert.deepEqual(toCharacter(def).parts, [good()]);
});

test('a character with no parts carries an empty array, never undefined', () => {
  const def = { id: 'x', name: 'X', style: 'balanced', special: 'pitchdeck' };
  assert.deepEqual(toCharacter(def).parts, []);
});

test('the wire version was bumped for the new payload field', () => {
  assert.equal(CHARACTER_WIRE_VERSION, 2);
});

test('a rigid part (follow 0) sits exactly on its anchor every frame', () => {
  const st = partLagState();
  const a = applyFollow(st, 'coat', { x: 10, y: 10 }, 0);
  const b = applyFollow(st, 'coat', { x: 90, y: 10 }, 0);
  assert.deepEqual(a, { x: 10, y: 10 });
  assert.deepEqual(b, { x: 90, y: 10 });
});

test('a following part trails its anchor and then catches up', () => {
  const st = partLagState();
  applyFollow(st, 'cape', { x: 0, y: 0 }, 0.5);
  const moved = applyFollow(st, 'cape', { x: 100, y: 0 }, 0.5);
  assert.ok(moved.x > 0 && moved.x < 100, `expected lag, got ${moved.x}`);
  let last = moved.x;
  for (let i = 0; i < 20; i++) last = applyFollow(st, 'cape', { x: 100, y: 0 }, 0.5).x;
  assert.ok(Math.abs(last - 100) < 0.5, `expected catch-up, got ${last}`);
});

test('lag state is per fighter, so two fighters never share a cape', () => {
  const one = partLagState(), two = partLagState();
  applyFollow(one, 'cape', { x: 0, y: 0 }, 0.5);
  applyFollow(two, 'cape', { x: 100, y: 0 }, 0.5);
  const a = applyFollow(one, 'cape', { x: 100, y: 0 }, 0.5).x;
  const b = applyFollow(two, 'cape', { x: 100, y: 0 }, 0.5).x;
  assert.notEqual(a, b);
});

// ---------------------------------------------------------------- drawParts
//
// There is no canvas in the Node suite, which is exactly why resolveParts and
// drawParts were split in the first place. But drawParts only needs a `ctx`
// with the right method names and a `blob` callback — nothing browser-specific
// — so it can be driven headlessly with a spy in place of both. This closes a
// gap the split otherwise left open: deleting the z filter, or dropping rot /
// pts / w / h / r on the way to the canvas, left all the OTHER tests green.

// A minimal fake ctx: every method the drawing code calls gets recorded as
// [name, args] so assertions can inspect exactly what reached the canvas.
function fakeCtx() {
  const calls = [];
  const ctx = { calls };
  for (const m of ['save', 'restore', 'translate', 'rotate', 'roundRect', 'ellipse', 'moveTo', 'lineTo', 'closePath']) {
    ctx[m] = (...args) => calls.push([m, args]);
  }
  return ctx;
}

// A fake blob(ctx, path, fill) that just runs the path builder (so its ctx
// calls get recorded) and records the fill it was given.
function fakeBlob(fills) {
  return (ctx, path, fill) => { path(); fills.push(fill); };
}

test('drawParts paints only the requested z layer', () => {
  const ctx = fakeCtx();
  const fills = [];
  const front = { id: 'f', shape: 'roundRect', z: 'front', x: 0, y: 0, w: 10, h: 10, fill: '#111111' };
  const behind = { id: 'b', shape: 'roundRect', z: 'behind', x: 0, y: 0, w: 10, h: 10, fill: '#222222' };
  drawParts(ctx, [front, behind], 'front', fakeBlob(fills));
  assert.deepEqual(fills, ['#111111'], 'only the front part should have painted');
});

test('rot reaches the canvas as a rotate call, and is skipped when absent', () => {
  const withRot = fakeCtx();
  const withoutRot = fakeCtx();
  const blob = (ctx, path) => path();

  drawParts(withRot, [{ id: 'r', shape: 'ellipse', z: 'front', x: 0, y: 0, r: 5, rot: 1.2, fill: '#fff' }], 'front', blob);
  const rotateCalls = withRot.calls.filter(([m]) => m === 'rotate');
  assert.deepEqual(rotateCalls, [['rotate', [1.2]]], 'a part with rot must call rotate with that value');

  drawParts(withoutRot, [{ id: 'n', shape: 'ellipse', z: 'front', x: 0, y: 0, r: 5, fill: '#fff' }], 'front', blob);
  assert.equal(withoutRot.calls.filter(([m]) => m === 'rotate').length, 0, 'a part with no rot must not call rotate at all');
});

test('geometry reaches the canvas intact: roundRect w/h, ellipse r, path pts', () => {
  const ctx = fakeCtx();
  const blob = (ctx, path) => path();

  drawParts(ctx, [{ id: 'rr', shape: 'roundRect', z: 'front', x: 0, y: 0, w: 40, h: 24, fill: '#fff' }], 'front', blob);
  const [, rrArgs] = ctx.calls.find(([m]) => m === 'roundRect');
  assert.equal(rrArgs[2], 40, 'roundRect must receive w');
  assert.equal(rrArgs[3], 24, 'roundRect must receive h');

  const ctx2 = fakeCtx();
  drawParts(ctx2, [{ id: 'el', shape: 'ellipse', z: 'front', x: 0, y: 0, r: 12, fill: '#fff' }], 'front', blob);
  const [, elArgs] = ctx2.calls.find(([m]) => m === 'ellipse');
  assert.equal(elArgs[2], 12, 'ellipse must receive r for radiusX');
  assert.equal(elArgs[3], 12, 'ellipse must receive r for radiusY');

  const ctx3 = fakeCtx();
  const pts = [[1, 2], [3, 4], [5, 6]];
  drawParts(ctx3, [{ id: 'pth', shape: 'path', z: 'front', x: 0, y: 0, pts, fill: '#fff' }], 'front', blob);
  const moveTo = ctx3.calls.filter(([m]) => m === 'moveTo').map(([, a]) => a);
  const lineTo = ctx3.calls.filter(([m]) => m === 'lineTo').map(([, a]) => a);
  assert.deepEqual(moveTo, [[1, 2]], 'path must moveTo its first point');
  assert.deepEqual(lineTo, [[3, 4], [5, 6]], 'path must lineTo every remaining point, in order');
});

test('save and restore stay balanced across several parts', () => {
  const ctx = fakeCtx();
  const blob = (ctx, path) => path();
  const parts = [
    { id: 'a', shape: 'roundRect', z: 'front', x: 0, y: 0, w: 10, h: 10, fill: '#fff' },
    { id: 'b', shape: 'ellipse', z: 'front', x: 0, y: 0, r: 5, fill: '#fff' },
    { id: 'c', shape: 'capsule', z: 'front', x: 0, y: 0, w: 8, h: 20, fill: '#fff' },
    { id: 'd', shape: 'path', z: 'front', x: 0, y: 0, pts: [[0, 0], [1, 1], [2, 2]], fill: '#fff' },
  ];
  drawParts(ctx, parts, 'front', blob);
  const saves = ctx.calls.filter(([m]) => m === 'save').length;
  const restores = ctx.calls.filter(([m]) => m === 'restore').length;
  assert.equal(saves, parts.length);
  assert.equal(restores, parts.length);
  assert.equal(saves, restores, 'every save must be matched by a restore');
});
