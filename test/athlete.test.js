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
import { MODELS3D, athleteFor, CAST_MODELS, piecesFor, newBodyFor } from '../src/data/models3d.js';
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

test('each roster fighter has their own model, carrying exactly what they wear', () => {
  const founder = load('founder');
  const exists = new Set(founder.primitives.map((p) => p.name));
  for (const id of CAST_MODELS) {
    const def = FIGHTERS.find((d) => d.id === id);
    assert.ok(def, `${id} is not on the roster`);
    const m = load(id);
    assert.deepEqual(m.jointNames, founder.jointNames, `${id}: the skeleton differs`);
    const has = new Set(m.primitives.map((p) => p.name));
    const wants = piecesFor(def).filter((n) => exists.has(n));     // stubble is painted, not modelled
    assert.deepEqual([...has].sort(), wants.sort(), `${id}: carries ${[...has].join(', ')}, wears ${wants.join(', ')}`);
  }
  assert.deepEqual(CAST_MODELS.slice().sort(), FIGHTERS.map((d) => d.id).sort(), 'a roster fighter has no model of their own');
});

test('no two roster fighters share a silhouette', () => {
  // How wide the body is through the chest, and how far it reaches in front
  // at the belly: the two places a build shows first.
  const shape = (id) => {
    const m = load(id);
    const torso = new Set(['hips', 'spine', 'chest'].map((n) => m.jointNames.indexOf(n)));
    let wide = 0, front = 0;
    for (const p of m.primitives.filter((q) => q.name === 'body' || q.name.startsWith('outfit:'))) {
      for (let v = 0; v < p.positions.length / 3; v++) {
        // only what the torso carries, not the arms that hang beside it
        let best = 0;
        for (let k = 1; k < 4; k++) if (p.weights[v * 4 + k] > p.weights[v * 4 + best]) best = k;
        if (!torso.has(p.joints[v * 4 + best])) continue;
        const x = p.positions[v * 3], y = p.positions[v * 3 + 1], z = p.positions[v * 3 + 2];   // glTF: y up, z toward the camera
        if (y > 1.15 && y < 1.35) wide = Math.max(wide, Math.abs(z));
        if (y > 0.95 && y < 1.1) front = Math.max(front, x);
      }
    }
    return [wide, front];
  };
  const S = Object.fromEntries(CAST_MODELS.map((id) => [id, shape(id)]));
  for (const a of CAST_MODELS) {
    for (const b of CAST_MODELS) {
      if (a >= b) continue;
      const d = Math.abs(S[a][0] - S[b][0]) + Math.abs(S[a][1] - S[b][1]);
      assert.ok(d > 0.004, `${a} and ${b} have the same build (${S[a].map((v) => v.toFixed(3))} against ${S[b].map((v) => v.toFixed(3))})`);
    }
  }
  assert.ok(S.bozo[0] > S.kai[0] * 1.15, 'Jeff is no broader than Steve');
  assert.ok(S.dex[1] > S.kai[1] * 1.2, 'Carl has no more belly than Steve');
});

test('nobody wears an athlete body unless asked, and the women take the women\'s frame', () => {
  for (const def of [...FIGHTERS, ...BASE_CHARACTERS]) assert.equal(athlete3D(def), false, `${def.id} is in an athlete body by default`);
  assert.equal(athleteFor(FIGHTERS.find((d) => d.id === 'zara')), 'athlete-f');
  assert.equal(athleteFor(FIGHTERS.find((d) => d.id === 'bozo')), 'athlete');
  assert.equal(athleteFor(BASE_CHARACTERS[0]), 'athlete');
  assert.equal(newBodyFor(FIGHTERS.find((d) => d.id === 'dex')), 'dex');
  assert.equal(newBodyFor(BASE_CHARACTERS[0]), 'athlete');
});
