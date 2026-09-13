// The live 3D renderer's headless half: the .glb reader and the pose solver.
//
// WebGL cannot run here, but everything that decides WHERE the model goes can,
// and that is where the renderer would lie to a player: a fist that misses its
// hitbox, a foot that floats, a matrix that goes NaN on one body. The shaders
// only decide how it looks, and are checked in the browser.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseGLB, extractModel } from '../src/engine/gl3d/glb.js';
import { buildRig, solvePose, transformPoint, ik, BONES } from '../src/engine/gl3d/rig.js';
import { invertAffine, multiply, boneFrame } from '../src/engine/gl3d/math.js';
import { MODELS3D, FIGHTER_MODELS } from '../src/data/models3d.js';
import { restPose } from '../src/engine/anim.js';
import { applyProportions, clampBody } from '../src/engine/proportions.js';
import { FIGHTERS } from '../src/data/fighters.js';
import { GL3D } from '../src/config.js';

function loadModel(url) {
  const b = readFileSync(new URL(`../${url}`, import.meta.url));
  return extractModel(parseGLB(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)));
}
const adam = loadModel(MODELS3D.adam.url);
const near = (a, b, eps = 1e-4) => a.every((v, i) => Math.abs(v - b[i]) < eps);
const isIdentity = (m) => m.every((v, i) => Math.abs(v - (i % 5 === 0 ? 1 : 0)) < 1e-6);

test('every model the roster names exists and honours the rig contract', () => {
  for (const id of Object.values(FIGHTER_MODELS)) {
    const model = id === 'adam' ? adam : loadModel(MODELS3D[id].url);
    for (const bone of BONES) assert.ok(model.jointNames.includes(bone), `${id} has no ${bone} joint`);
    for (const p of model.primitives) {
      const verts = p.positions.length / 3;
      assert.equal(p.normals.length / 3, verts, `${p.name}: normals do not match positions`);
      assert.equal(p.joints.length / 4, verts, `${p.name}: joints do not match positions`);
      assert.equal(p.weights.length / 4, verts, `${p.name}: weights do not match positions`);
      assert.ok(p.indices.every((i) => i < verts), `${p.name}: an index points past the vertices`);
      assert.ok(p.joints.every((j) => j < model.jointNames.length), `${p.name}: a joint index is out of range`);
      for (let v = 0; v < verts; v++) {
        const w = p.weights[v * 4] + p.weights[v * 4 + 1] + p.weights[v * 4 + 2] + p.weights[v * 4 + 3];
        assert.ok(Math.abs(w - 1) < 0.01, `${p.name}: vertex ${v} weights sum to ${w}`);
      }
    }
  }
});

test('the model wears its palette by role, so any fighter can recolour it', () => {
  const roles = new Set(adam.primitives.map((p) => p.role));
  for (const role of ['suit', 'suit2', 'skin', 'pants', 'shoe', 'hair', 'accent']) {
    assert.ok(roles.has(role), `no primitive takes its colour from "${role}"`);
  }
});

test('invertAffine undoes a scaled bone frame', () => {
  const m = boneFrame([0.1, 0.9, -0.2], [0.5, 0.4, 0.1], [0, 1, 0], 1.7, 0.8, 1.3);
  assert.ok(isIdentity(multiply(m, invertAffine(m))));
});

test('each rest frame composed with its stored inverse is the identity', () => {
  const rig = buildRig(adam, MODELS3D.adam);
  rig.names.forEach((name, i) => {
    const r = rig.rest[name];
    assert.ok(isIdentity(multiply(boneFrame(r.head, r.tail, r.ref), rig.inverse[i])), `${name} rest frame`);
  });
});

// The rule the whole renderer rests on: where the pose puts a fist, the model
// puts its fist. Measured by carrying the rest fist through the forearm matrix.
test('the lead fist lands exactly on the pose\'s lead hand', () => {
  const rig = buildRig(adam, MODELS3D.adam);
  const P = restPose();
  P.armF = { x: 88, y: -150 };                 // a jab at a basic's reach
  const m = solvePose(rig, P);
  const i = rig.names.indexOf('forearm.L');
  const fist = transformPoint(m, i, rig.rest['forearm.L'].tail);
  assert.ok(near(fist.slice(0, 2), [0.88, 1.50]), `fist landed at ${fist.map((v) => v.toFixed(3))}`);
});

test('a limb past full reach stretches rather than falling short', () => {
  const s = ik([0, 0, 0], [3, 0, 0], 0.4, 0.44, [0, -1, 0]);
  assert.ok(s.stretch > 1, 'the chain did not stretch');
  assert.ok(near(s.end, [3, 0, 0]), `the chain stopped at ${s.end}`);
  const rig = buildRig(adam, MODELS3D.adam);
  const P = restPose();
  P.armF = { x: 190, y: -150 };                // far beyond the model's arm
  const m = solvePose(rig, P);
  const fist = transformPoint(m, rig.names.indexOf('forearm.L'), rig.rest['forearm.L'].tail);
  assert.ok(near(fist.slice(0, 2), [1.90, 1.50]), `an over-reaching fist stopped at ${fist}`);
});

test('an elbow that can reach its target bends instead of stretching', () => {
  const s = ik([0, 0, 0], [0.5, 0, 0], 0.4, 0.44, [0, -1, 0]);
  assert.equal(s.stretch, 1);
  assert.ok(s.mid[1] < -0.1, 'the elbow did not bend toward its pole');
});

test('both feet land on their targets, and a standing foot points forward', () => {
  const rig = buildRig(adam, MODELS3D.adam);
  const P = restPose();
  const m = solvePose(rig, P);
  for (const [side, target] of [['L', P.legF], ['R', P.legB]]) {
    const i = rig.names.indexOf(`foot.${side}`);
    const ankle = transformPoint(m, i, rig.rest[`foot.${side}`].head);
    const toe = transformPoint(m, i, rig.rest[`foot.${side}`].tail);
    assert.ok(near(ankle.slice(0, 2), [target.x / GL3D.UNIT, -(target.y - GL3D.ANKLE_PX) / GL3D.UNIT]),
      `${side} ankle at ${ankle}`);
    assert.ok(toe[0] > ankle[0] + 0.1, `${side} toe does not point toward the opponent`);
  }
});

test('the lead limbs go to the far side of the turned body', () => {
  const rig = buildRig(adam, MODELS3D.adam);
  const m = solvePose(rig, restPose());
  const zOf = (bone) => transformPoint(m, rig.names.indexOf(bone), rig.rest[bone].head)[2];
  assert.ok(zOf('upper_arm.L') < 0 && zOf('upper_arm.R') > 0, 'shoulders are not split far and near');
  assert.ok(zOf('thigh.L') < 0 && zOf('thigh.R') > 0, 'hips are not split far and near');
});

test('every roster body poses to finite matrices', () => {
  const rig = buildRig(adam, MODELS3D.adam);
  for (const def of FIGHTERS) {
    const m = solvePose(rig, applyProportions(restPose(), clampBody(def.body)));
    assert.ok(m.every(Number.isFinite), `${def.id} produced a non-finite bone matrix`);
  }
});
