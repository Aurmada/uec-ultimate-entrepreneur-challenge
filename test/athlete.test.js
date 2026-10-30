// The athlete bodies (assets/models/athlete.glb and athlete-f.glb, built by
// lab/blender/build_founder.py), on test behind ?gl&athlete. They are only
// worth having as drop-in replacements for the founder model: the same
// joints, so every pose solves the same way, and the same named meshes with
// the same palette roles, so every look, outfit, prop and colour still finds
// its piece. And nobody wears them until asked.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { parseGLB, extractModel } from '../src/engine/gl3d/glb.js';
import { MODELS3D, athleteFor } from '../src/data/models3d.js';
import { athlete3D } from '../src/engine/gl3d/index.js';
import { FIGHTERS, BASE_CHARACTERS } from '../src/data/fighters.js';

const load = (id) => {
  const buf = readFileSync(new URL(`../${MODELS3D[id].url}`, import.meta.url));
  return extractModel(parseGLB(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)));
};
const pieces = (m) => new Set(m.primitives.map((p) => `${p.name}/${p.role}`));

test('each athlete body is a drop-in for the founder: same joints, same pieces, same roles', () => {
  const founder = load('founder');
  for (const id of ['athlete', 'athlete-f']) {
    assert.ok(existsSync(new URL(`../${MODELS3D[id].url}`, import.meta.url)), `${id}: the model file is missing`);
    const m = load(id);
    assert.deepEqual(m.jointNames, founder.jointNames, `${id}: the skeleton differs`);
    const missing = [...pieces(founder)].filter((p) => !pieces(m).has(p));
    assert.deepEqual(missing, [], `${id}: no piece for ${missing.join(', ')}`);
    // the same bind skeleton, so the face lands where MODELS3D says it does
    m.restHeads.forEach((h, i) => h.forEach((v, k) => assert.ok(Math.abs(v - founder.restHeads[i][k]) < 1e-4,
      `${id}: ${m.jointNames[i]} sits somewhere else at bind`)));
  }
});

test('the athlete body is fuller than the founder model, not just the same shape', () => {
  // More triangles where the forms are: the body itself and a fitted top.
  const tris = (m, name) => m.primitives.filter((p) => p.name === name).reduce((n, p) => n + p.indices.length / 3, 0);
  const founder = load('founder'), athlete = load('athlete');
  for (const name of ['body', 'outfit:tee']) {
    assert.ok(tris(athlete, name) > tris(founder, name) * 1.8, `${name}: ${tris(athlete, name)} triangles against ${tris(founder, name)}`);
  }
});

test('nobody wears an athlete body unless asked, and the women take the women\'s frame', () => {
  for (const def of [...FIGHTERS, ...BASE_CHARACTERS]) assert.equal(athlete3D(def), false, `${def.id} is in an athlete body by default`);
  assert.equal(athleteFor(FIGHTERS.find((d) => d.id === 'zara')), 'athlete-f');
  assert.equal(athleteFor(FIGHTERS.find((d) => d.id === 'bozo')), 'athlete');
  assert.equal(athleteFor(BASE_CHARACTERS[0]), 'athlete');
});
