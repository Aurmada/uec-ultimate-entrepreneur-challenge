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
import { STAGES, stageFor, layerShift, floorSkew } from '../src/engine/stage.js';
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

// ------------------------------------------------------------ parallax
//
// A stage built with depth layers is drawn from them, each moved by its own
// depth as the camera pans (STAGE_ART.PARALLAX). What can be checked without
// a canvas: the layers exist at the size their rects say, they are in the
// order they must be drawn, and no pan the camera can make opens a gap at the
// edge of the frame.

const LAYER_KINDS = ['far', 'floor', 'room'];

test('every rendered stage has its depth layers, at the size their rects say', () => {
  for (const arena of STAGED) {
    const { layers } = spec(arena);
    assert.ok(Array.isArray(layers) && layers.length >= 3, `${arena.id} has no depth layers`);
    for (const L of layers) {
      assert.ok(LAYER_KINDS.includes(L.kind), `${arena.id}/${L.id} is a ${L.kind}`);
      assert.ok(existsSync(file(arena, L.file)), `${arena.id} has no ${L.file}`);
      const [w, h] = webpSize(readFileSync(file(arena, L.file)));
      assert.ok(Math.abs(w - L.rect[2] * 2) <= 1 && Math.abs(h - L.rect[3] * 2) <= 1,
        `${arena.id}/${L.file} is ${w}x${h}, its rect says ${L.rect[2] * 2}x${L.rect[3] * 2}`);
      if (L.glow) {
        // A glow is rendered at the world's own size, not twice it.
        const [gw, gh] = webpSize(readFileSync(file(arena, L.glow)));
        assert.ok(Math.abs(gw - L.rect[2]) <= 1 && Math.abs(gh - L.rect[3]) <= 1,
          `${arena.id}/${L.glow} is ${gw}x${gh}, its rect says ${L.rect[2]}x${L.rect[3]}`);
      }
    }
  }
});

test('layers are drawn back to front: the far distance, the floor, then the room by depth', () => {
  for (const arena of STAGED) {
    const { layers } = spec(arena);
    assert.equal(layers[0].kind, 'far', `${arena.id} does not start with the far distance`);
    assert.deepEqual(layers[0].rect, [0, 0, STAGE.W, STAGE.H], `${arena.id}: the far layer must fill the frame`);
    assert.equal(layers[1].kind, 'floor', `${arena.id}: the floor goes under the room`);
    const room = layers.slice(2);
    assert.ok(room.every((L) => L.kind === 'room'), `${arena.id}: one far and one floor layer only`);
    for (let i = 1; i < room.length; i++) {
      assert.ok(room[i].p > room[i - 1].p, `${arena.id}: ${room[i].id} is drawn after something nearer`);
    }
    for (const L of [layers[0], ...room]) {
      assert.ok(L.p >= 0 && L.p < 1, `${arena.id}/${L.id} moves at ${L.p}: behind the lane is under 1`);
    }
  }
});

test('the floor shears about the horizon: still at the fight lane, moving with the camera at the horizon', () => {
  const s = spec(STAGED[0]);
  assert.ok(Math.abs(s.horizon - (STAGE.FLOOR - 150)) < 0.5, `horizon at ${s.horizon}`);
  const [a, b, c, d, e, f] = floorSkew(s, 60);
  const shift = (row) => c * row + e;          // x' = a x + c y + e, with a = 1
  assert.equal(a, 1); assert.equal(b, 0); assert.equal(d, 1); assert.equal(f, 0);
  assert.ok(Math.abs(shift(STAGE.FLOOR)) < 1e-9, 'the floor under the fighters must not slide');
  assert.ok(Math.abs(shift(s.horizon) - 60) < 1e-9, 'the horizon moves with the camera');
  assert.ok(shift(STAGE.H) < 0, 'the floor nearer than the lane runs faster than the camera');
  assert.equal(layerShift(1, 80), 0);
  assert.equal(layerShift(0, 80), 80);
  assert.equal(layerShift(0.5, -40), -20);
});

test('every screen moves with the layer it hangs in', () => {
  for (const arena of STAGED) {
    const s = spec(arena);
    assert.deepEqual(Object.keys(s.screenP).sort(), Object.keys(s.screens).sort(), `${arena.id}: a screen with no depth`);
    for (const [id, p] of Object.entries(s.screenP)) assert.ok(p > 0 && p <= 1, `${arena.id}/${id} at ${p}`);
  }
});

// The camera pans at most to the stage edge at its widest push-in (the KO shot
// at 1.6x). Every layer that fills the frame width at rest must still fill
// what the camera sees at every pan, or the frame opens onto nothing.
test('no pan the camera can make opens a gap at the edge of the frame', () => {
  for (const arena of STAGED) {
    const s = spec(arena);
    for (const z of [1, 1.1, 1.26, 1.6]) {
      const halfW = STAGE.W / (2 * z);
      for (const camX of [halfW, STAGE.W / 2, STAGE.W - halfW]) {
        const pan = camX - STAGE.W / 2, left = camX - halfW, right = camX + halfW;
        for (const L of s.layers) {
          const [x, y, w, h] = L.rect;
          if (x > 0.5 || x + w < STAGE.W - 0.5) continue;      // a cropped band: it never filled the frame
          const rows = L.kind === 'floor' ? [y, y + h] : [y];
          for (const row of rows) {
            const dx = L.kind === 'floor' ? (() => { const m = floorSkew(s, pan); return m[2] * row + m[4]; })()
              : layerShift(L.p, pan);
            assert.ok(x + dx <= left + 0.5 && x + w + dx >= right - 0.5,
              `${arena.id}/${L.id} at ${z}x, camera at ${camX.toFixed(0)}: covers ${(x + dx).toFixed(1)}..${(x + w + dx).toFixed(1)}, `
              + `sees ${left.toFixed(1)}..${right.toFixed(1)}`);
          }
        }
      }
    }
  }
});

test('an overlay that sits at a depth says so, and it is a depth', () => {
  for (const arena of STAGED) {
    const p = arena.stage.overlayP;
    if (p === undefined) continue;
    assert.ok(arena.stage.overlay, `${arena.id} gives a depth to an overlay it does not have`);
    assert.ok(p > 0 && p <= 1.5, `${arena.id} overlay at ${p}`);
  }
});
