// Rendered stages (src/engine/stage.js): the Blender-built arenas of the 3D
// prototype. The images cannot be drawn here, but everything that decides
// whether a stage lines up with the game can be checked: the files exist at
// the size the renderer assumes, the rendered floor is the floor the fighters
// stand on, and every live screen has both a place in the picture and a
// painter in the arena. And with the flag off, no stage is ever used.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { ARENAS } from '../src/data/arenas.js';
import { STAGE } from '../src/config.js';
import { STAGES, stageFor } from '../src/engine/stage.js';
import { lighting } from '../src/engine/gl3d/toon.js';
import { GL3D } from '../src/config.js';

const STAGED = ARENAS.filter((a) => a.stage);
const file = (arena, name) => new URL(`../${arena.stage.dir}/${name}`, import.meta.url);
const spec = (arena) => JSON.parse(readFileSync(file(arena, 'stage.json'), 'utf8'));

// Width and height from a WebP header: lossy (VP8), lossless (VP8L) or
// extended (VP8X, which is what an image with alpha is written as).
function webpSize(buf) {
  assert.equal(buf.toString('ascii', 0, 4), 'RIFF');
  assert.equal(buf.toString('ascii', 8, 12), 'WEBP');
  const chunk = buf.toString('ascii', 12, 16);
  if (chunk === 'VP8X') return [1 + buf.readUIntLE(24, 3), 1 + buf.readUIntLE(27, 3)];
  if (chunk === 'VP8L') {
    const bits = buf.readUInt32LE(21);
    return [1 + (bits & 0x3fff), 1 + ((bits >> 14) & 0x3fff)];
  }
  if (chunk === 'VP8 ') return [buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff];
  throw new Error(`unknown WebP chunk ${chunk}`);
}

test('at least one arena has a rendered stage', () => {
  assert.ok(STAGED.length > 0);
});

test('every rendered stage has its images, at twice the world', () => {
  for (const arena of STAGED) {
    for (const name of ['back.webp', 'glow.webp', 'stage.json']) {
      assert.ok(existsSync(file(arena, name)), `${arena.id} has no ${name}`);
    }
    const s = spec(arena);
    assert.deepEqual(s.size, [STAGE.W * 2, STAGE.H * 2], `${arena.id} stage.json size`);
    for (const name of ['back.webp', 'glow.webp']) {
      assert.deepEqual(webpSize(readFileSync(file(arena, name))), s.size, `${arena.id}/${name} is not the size stage.json says`);
    }
  }
});

// The build measures where its camera puts the fight lane's floor and refuses
// to write a stage that is off; this catches a stage built for another world.
test('every rendered floor is the floor the fighters stand on', () => {
  for (const arena of STAGED) {
    assert.ok(Math.abs(spec(arena).floorY - STAGE.FLOOR) <= 0.5, `${arena.id} renders its floor at ${spec(arena).floorY}`);
  }
});

test('every live screen has a place in the picture and a painter in the arena', () => {
  for (const arena of STAGED) {
    const quads = spec(arena).screens;
    const painters = arena.stage.screens || {};
    assert.deepEqual(Object.keys(quads).sort(), Object.keys(painters).sort(),
      `${arena.id}: screens in the picture and screens the arena paints differ`);
    for (const [id, quad] of Object.entries(quads)) {
      assert.equal(quad.length, 4, `${arena.id}/${id} is not four corners`);
      for (const [x, y] of quad) {
        assert.ok(x >= 0 && x <= STAGE.W && y >= 0 && y <= STAGE.H, `${arena.id}/${id} has a corner off the stage`);
      }
      // drawStage maps a box onto the quad from three corners, which is exact
      // only for a parallelogram: top edge parallel to and as long as the bottom.
      const [tl, tr, br, bl] = quad;
      assert.ok(Math.abs((tr[0] - tl[0]) - (br[0] - bl[0])) < 0.5 && Math.abs((tr[1] - tl[1]) - (br[1] - bl[1])) < 0.5,
        `${arena.id}/${id} is not a parallelogram`);
      assert.ok(Math.hypot(tr[0] - tl[0], tr[1] - tl[1]) > 8 && Math.hypot(bl[0] - tl[0], bl[1] - tl[1]) > 8,
        `${arena.id}/${id} is too small to paint`);
    }
  }
});

// Painters and overlays run every frame inside the render loop, so one that
// throws takes the match down with it. Run each against a canvas that accepts
// any call, and hands back something that does too (a gradient, a measurement).
test('every screen painter and overlay draws without throwing', () => {
  let calls = 0;
  const anything = new Proxy(function () {}, {
    get: (_, key) => (key === 'width' ? 10 : anything),
    apply: () => { calls++; return anything; },
    set: () => true,
  });
  for (const arena of STAGED) {
    const draws = Object.entries(arena.stage.screens || {}).map(([id, paint]) => [id, (t) => paint(anything, 120, 40, t)]);
    if (arena.stage.overlay) draws.push(['overlay', (t) => arena.stage.overlay(anything, t)]);
    for (const [id, draw] of draws) {
      const before = calls;
      for (const t of [0, 1.3, 7.9]) draw(t);
      assert.ok(calls > before, `${arena.id}/${id} drew nothing`);
    }
  }
});

test('with the flag off, no arena uses its rendered stage', () => {
  assert.equal(STAGES.enabled, false);
  for (const arena of STAGED) assert.equal(stageFor(arena), null);
});

// A stage lights the 3D fighters standing on it. With no stage (or a stage
// that says nothing) the light must be exactly the old look, and every stage's
// light must be something the shader can use: colours as three numbers in a
// sensible range, directions that are directions.
test('no stage light is the old light, and every stage light is usable', () => {
  const plain = lighting(null);
  assert.deepEqual(plain.lit, [1, 1, 1]);
  assert.deepEqual(plain.shadow, GL3D.SHADOW_TINT);
  assert.deepEqual(plain.backColor, [0, 0, 0], 'no back light without a stage');
  assert.deepEqual(plain.rim, GL3D.RIM_COLOR.map((v) => v * GL3D.RIM));
  const unit = (v) => Math.abs(Math.hypot(...v) - 1) < 1e-9;
  for (const arena of STAGED) {
    const light = arena.stage.light;
    assert.ok(light, `${arena.id} has no light`);
    for (const key of ['lit', 'shadow', 'rim', 'backColor']) {
      const v = light[key];
      assert.ok(Array.isArray(v) && v.length === 3 && v.every((x) => Number.isFinite(x) && x >= 0 && x <= 1.5),
        `${arena.id} light.${key} is not a usable colour`);
    }
    const L = lighting(light);
    assert.ok(unit(L.back) && unit(L.key), `${arena.id}: directions must normalise`);
    assert.ok(L.back[2] < 0, `${arena.id}: a back light shines from behind the fighters`);
  }
});
