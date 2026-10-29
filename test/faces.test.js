// The 2D face's mouths, read as shapes rather than pixels. drawFace is drawn
// against a context that records the path, and the mouth is the one curve in
// it: a quadratic whose control point sits above its corners frowns, below
// them smiles (canvas y runs down). The attack snarl drew a grin for as long
// as it existed because nothing checked which way it curved.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { drawFace } from '../src/engine/drawFighter.js';

// The mouth of a face, as { from, control, to } in canvas px, or null when
// the mouth is not a curve (a set, gritted line).
function mouth(face, look = null) {
  const path = [];
  const ctx = new Proxy({}, {
    get: (_, key) => (['moveTo', 'lineTo', 'quadraticCurveTo'].includes(key)
      ? (...args) => path.push([key, args])
      : () => {}),
    set: () => true,
  });
  drawFace(ctx, 0, 0, 18, face, {}, look);
  const i = path.findIndex(([op]) => op === 'quadraticCurveTo');
  if (i < 0) return null;
  const [, [cx, cy, x, y]] = path[i];
  const [, [fx, fy]] = path[i - 1];
  return { from: { x: fx, y: fy }, control: { x: cx, y: cy }, to: { x, y } };
}
const frowns = (m) => m.control.y < m.from.y && m.control.y < m.to.y;
const smiles = (m) => m.control.y > m.from.y && m.control.y > m.to.y;

test('the attack face snarls: its mouth turns down, never up', () => {
  const m = mouth('angry');
  assert.ok(m, 'the snarl should be a curve');
  assert.ok(frowns(m), `the snarl curves up into a grin: ${JSON.stringify(m)}`);
});

test('an idle mouth follows the character\'s MOUTH_CURVE', () => {
  assert.ok(smiles(mouth('idle', { MOUTH_CURVE: 2.6 })), 'a positive curve is pleased with itself');
  assert.ok(frowns(mouth('idle', { MOUTH_CURVE: -2.2 })), 'a negative curve scowls');
});

test('a blocking face grits its teeth in a straight line', () => {
  assert.equal(mouth('block'), null);
});
