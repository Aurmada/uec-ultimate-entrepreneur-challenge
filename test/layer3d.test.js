// The 3D layer (GL3D.LAYER) draws a fighter straight onto a WebGL canvas on
// screen instead of rendering it into a buffer and letting the 2D canvas's
// transform carry the buffer there. Those must put every point of the model
// in the same place, or the layered fighter would drift from its hitboxes,
// its shadow and the 2D fighters it is compared with. WebGL is not available
// here, so this holds the two projections, which are pure, to each other.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { screenProjection, bufferProjection } from '../src/engine/gl3d/toon.js';
import { GL3D } from '../src/config.js';

// A 2D canvas transform [a, b, c, d, e, f], built the way render.js and
// drawFighter build theirs: device pixel ratio, the camera's zoom and crop,
// the fighter's place, its facing, and the pose's rotation.
function transform({ dpr = 2, zoom = 1.2, camX = 480, camY = 300, x = 520, y = 480, facing = 1, rot = 0 } = {}) {
  let m = [dpr, 0, 0, dpr, 0, 0];
  const mul = (n) => {
    const [a, b, c, d, e, f] = m;
    m = [a * n[0] + c * n[1], b * n[0] + d * n[1], a * n[2] + c * n[3], b * n[2] + d * n[3],
      a * n[4] + c * n[5] + e, b * n[4] + d * n[5] + f];
  };
  const halfW = 960 / (2 * zoom), halfH = 540 / (2 * zoom);
  mul([zoom, 0, 0, zoom, -(camX - halfW) * zoom, -(camY - halfH) * zoom]);
  mul([1, 0, 0, 1, x, y]);
  mul([facing, 0, 0, 1, 0, 0]);
  mul([Math.cos(rot), Math.sin(rot), -Math.sin(rot), Math.cos(rot), 0, 0]);
  return m;
}

const apply4 = (M, p) => [0, 1, 2, 3].map((r) => M[r] * p[0] + M[4 + r] * p[1] + M[8 + r] * p[2] + M[12 + r] * p[3]);

const BOX = { ox: 130, oy: 250, w: 280, h: 300 };
const CW = 1920, CH = 1080;
const CASES = [
  { name: 'facing right', m: transform() },
  { name: 'facing left', m: transform({ facing: -1 }) },
  { name: 'rotated, mid-throw', m: transform({ rot: 0.6 }) },
  { name: 'left and rotated, KO zoom', m: transform({ facing: -1, rot: -0.4, zoom: 1.6, x: 300, y: 420 }) },
];
const SQUASH = [{ x: 1, y: 1 }, { x: 1.12, y: 0.9 }];
const POINTS = [[0, 0, 0], [0.4, 1.3, 0.2], [-0.9, 2.1, -0.5], [1.2, -0.1, 0.8], [0.05, 0.7, -2.5]];

test('a model point lands on the same device pixel on the layer as through the buffer', () => {
  const ss = GL3D.SS;
  const vwB = BOX.w * ss, vhB = BOX.h * ss;
  for (const { name, m } of CASES) {
    for (const squash of SQUASH) {
      for (const jitter of [0, 1.5]) {
        const B = bufferProjection(BOX, squash, jitter);
        const S = screenProjection({ m }, BOX, squash, jitter, CW, CH).view;
        for (const p of POINTS) {
          // Through the buffer: clip -> buffer px -> local px -> the 2D transform.
          const cb = apply4(B, [...p, 1]);
          const lx = ((cb[0] / cb[3] + 1) / 2) * vwB / ss - BOX.ox;
          const ly = ((1 - cb[1] / cb[3]) / 2) * vhB / ss - BOX.oy;
          const want = [m[0] * lx + m[2] * ly + m[4], m[1] * lx + m[3] * ly + m[5]];
          // On the layer: clip -> device px.
          const cs = apply4(S, [...p, 1]);
          const got = [((cs[0] / cs[3] + 1) / 2) * CW, ((1 - cs[1] / cs[3]) / 2) * CH];
          for (const k of [0, 1]) {
            assert.ok(Math.abs(got[k] - want[k]) < 1e-6,
              `${name}, squash ${squash.x}/${squash.y}, jitter ${jitter}, point ${p}: layer ${got} vs buffer ${want}`);
          }
          // Depth is untouched by the 2D transform.
          assert.ok(Math.abs(cs[2] / cs[3] - cb[2] / cb[3]) < 1e-9, `${name}: depth moved`);
        }
      }
    }
  }
});

test('the layer turns the winding over exactly when the fighter is mirrored', () => {
  for (const { name, m } of CASES) {
    const { flip } = screenProjection({ m }, BOX, { x: 1, y: 1 }, 0, CW, CH);
    const mirrored = m[0] * m[3] - m[1] * m[2] < 0;
    assert.equal(flip, mirrored, `${name}: flip ${flip}`);
  }
  assert.equal(screenProjection({ m: transform({ facing: -1 }) }, BOX, { x: 1, y: 1 }, 0, CW, CH).flip, true);
  assert.equal(screenProjection({ m: transform({ rot: 1.2 }) }, BOX, { x: 1, y: 1 }, 0, CW, CH).flip, false);
});

test('the rim looks the way a normal points on screen, as far out as in the buffer', () => {
  for (const { name, m } of CASES) {
    const squash = { x: 1.1, y: 0.95 };
    const P = screenProjection({ m }, BOX, squash, 0, CW, CH);
    const [a, b, c, d] = m;
    const kx = squash.x * GL3D.UNIT, ky = squash.y * GL3D.UNIT;
    for (const n of [[1, 0], [0, 1], [0.6, -0.8], [-0.3, 0.95]]) {
      // The mask is addressed by gl_FragCoord, whose y runs up the canvas.
      const dev = [a * kx * n[0] - c * ky * n[1], b * kx * n[0] - d * ky * n[1]];
      const want = [dev[0], -dev[1]];
      const R = P.rimDir;
      const got = [R[0] * n[0] + R[2] * n[1], R[1] * n[0] + R[3] * n[1]];
      const cross = got[0] * want[1] - got[1] * want[0];
      const dot = got[0] * want[0] + got[1] * want[1];
      assert.ok(Math.abs(cross) < 1e-6 && dot > 0, `${name}: rim for ${n} points ${got}, screen says ${want}`);
    }
    const px = Math.sqrt(Math.abs(a * d - b * c));
    assert.ok(Math.abs(P.reach / px - GL3D.RIM_REACH / GL3D.SS) < 1e-9, `${name}: rim reach ${P.reach}`);
  }
});

test('the key line\'s quad covers the whole fighter box on screen', () => {
  for (const { name, m } of CASES) {
    const P = screenProjection({ m, keyline: { px: 2 } }, BOX, { x: 1, y: 1 }, 0, CW, CH);
    const [x0, y0, x1, y1] = P.keyRect;
    for (const lx of [-BOX.ox, BOX.w - BOX.ox]) {
      for (const ly of [-BOX.oy, BOX.h - BOX.oy]) {
        const X = ((m[0] * lx + m[2] * ly + m[4]) / CW) * 2 - 1;
        const Y = 1 - ((m[1] * lx + m[3] * ly + m[5]) / CH) * 2;
        assert.ok(X > x0 && X < x1 && Y > y0 && Y < y1, `${name}: corner ${lx},${ly} outside the key line's quad`);
      }
    }
    assert.ok(P.keyRadius > 0, `${name}: no key line radius`);
  }
  assert.equal(screenProjection({ m: transform() }, BOX, { x: 1, y: 1 }, 0, CW, CH).keyRect, null,
    'a fighter drawn with no key line got a key line quad');
});
