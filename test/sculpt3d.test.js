// The sculpted Jeff's model as built (lab/blender/fighter3d.py -- bozo --rig):
// dressed in his clothes from the 2D game, bare fists (November 2026).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseGLB, extractModel } from '../src/engine/gl3d/glb.js';
import { MODELS3D } from '../src/data/models3d.js';

const glb = readFileSync(new URL(`../${MODELS3D['sculpt:bozo'].url}`, import.meta.url));
const model = extractModel(parseGLB(glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength)));
const body = model.primitives.filter((p) => p.name === 'body');

test('he is dressed: shirt, vest, trousers and shoes, in his own colours where he has them', () => {
  const roles = new Set(body.map((p) => p.role));
  for (const role of ['skin', 'shirt', 'suit', 'pants', 'shoe']) assert.ok(roles.has(role), `no ${role}`);
});

test('no skin is left under his trousers or shoes, to show through them', () => {
  // glTF is y up, the character's left on -z; the waist is at 1.03
  const skin = body.find((p) => p.role === 'skin').positions;
  let low = 0;
  for (let i = 0; i < skin.length; i += 3) {
    if (skin[i + 1] < 1.0 && Math.abs(skin[i + 2]) < 0.25) low++;
  }
  assert.equal(low, 0, `${low} skin vertices below the waist`);
});

test('his fists are bare', () => {
  // the arms hang out to the sides in the rest pose, so how far out a material
  // reaches says whether it covers the hands: the whole fist, eight
  // centimetres of it beyond the cuff, must be skin
  const reach = (p) => {
    let m = 0;
    for (let i = 0; i < p.positions.length; i += 3) m = Math.max(m, Math.abs(p.positions[i + 2]));
    return m;
  };
  const skin = reach(body.find((p) => p.role === 'skin'));
  for (const p of body.filter((q) => q.role !== 'skin')) {
    assert.ok(reach(p) < skin - 0.06, `${p.role} reaches over the hands`);
  }
});
