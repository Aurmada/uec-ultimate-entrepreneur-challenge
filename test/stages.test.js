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

// A painter runs every frame inside the render loop, so one that throws takes
// the match down with it. Run each against a canvas that accepts anything.
test('every screen painter draws without throwing', () => {
  const calls = [];
  const ctx = new Proxy({}, {
    get: (_, key) => (key === 'measureText' ? () => ({ width: 10 }) : (...args) => calls.push([key, args])),
    set: () => true,
  });
  for (const arena of STAGED) {
    for (const [id, paint] of Object.entries(arena.stage.screens || {})) {
      const before = calls.length;
      for (const t of [0, 1.3, 7.9]) paint(ctx, 120, 40, t);
      assert.ok(calls.length > before, `${arena.id}/${id} drew nothing`);
    }
  }
});

test('with the flag off, no arena uses its rendered stage', () => {
  assert.equal(STAGES.enabled, false);
  for (const arena of STAGED) assert.equal(stageFor(arena), null);
});
