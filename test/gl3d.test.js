// The live 3D renderer's headless half: the .glb reader, the model contract,
// what each fighter wears, and the pose solver.
//
// WebGL cannot run here, but everything that decides WHAT is drawn and WHERE
// can, and that is where the renderer would lie to a player: a look option
// with no mesh (a player who picked a beanie and fights bareheaded), a fist
// that misses its hitbox, a foot that floats, a matrix that goes NaN on one
// body. The shaders only decide how it looks, and are checked in the browser.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseGLB, extractModel } from '../src/engine/gl3d/glb.js';
import { buildRig, solvePose, transformPoint, ik, BONES } from '../src/engine/gl3d/rig.js';
import { wearing } from '../src/engine/gl3d/index.js';
import { invertAffine, multiply, boneFrame } from '../src/engine/gl3d/math.js';
import { MODELS3D, DEFAULT_MODEL, FIGHTER_MODELS, LOOK_SLOTS, resolveLook3D, DERIVED_ROLES } from '../src/data/models3d.js';
import { restPose } from '../src/engine/anim.js';
import { applyProportions, clampBody } from '../src/engine/proportions.js';
import { FIGHTERS, BASE_CHARACTERS, LOOKS } from '../src/data/fighters.js';
import { GL3D } from '../src/config.js';

function loadModel(id) {
  const b = readFileSync(new URL(`../${MODELS3D[id].url}`, import.meta.url));
  return extractModel(parseGLB(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)));
}
const founder = loadModel(DEFAULT_MODEL);
const meshNames = new Set(founder.primitives.map((p) => p.name));
const near = (a, b, eps = 1e-4) => a.every((v, i) => Math.abs(v - b[i]) < eps);
const isIdentity = (m) => m.every((v, i) => Math.abs(v - (i % 5 === 0 ? 1 : 0)) < 1e-6);
const ROSTER = [...FIGHTERS, ...BASE_CHARACTERS];

test('every model honours the rig contract', () => {
  for (const id of new Set([DEFAULT_MODEL, ...Object.values(FIGHTER_MODELS)])) {
    const model = id === DEFAULT_MODEL ? founder : loadModel(id);
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
      const slot = p.name.includes(':') ? p.name.split(':')[0] : null;
      assert.ok(slot === null || slot === 'prop' || LOOK_SLOTS.includes(slot),
        `mesh "${p.name}" names a slot the runtime does not know`);
    }
  }
});

// Weights that sum to 1 can still point at the wrong bones. The first modular
// build weighted the whole base body to the FEET (six parts shared one name and
// the last part's bone list won), every check above passed, and every fighter
// rendered with its head and arms hurled across the screen. So: every vertex's
// strongest bone must actually be near it. A prop hangs furthest (the mat on
// Adam's back is 0.48 from his chest bone); anything else past 0.35 is weighted
// to the wrong bone, and an arm weighted across the body is at least 0.54 away.
test('every vertex is weighted to a bone near it', () => {
  const rig = buildRig(founder, MODELS3D.founder);
  const seg = (p, a, b) => {
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
    const t = Math.max(0, Math.min(1, (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / (ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2)));
    return Math.hypot(ap[0] - ab[0] * t, ap[1] - ab[1] * t, ap[2] - ab[2] * t);
  };
  for (const p of founder.primitives) {
    const limit = p.name.startsWith('prop:') ? 0.55 : 0.35;
    for (let v = 0; v < p.positions.length / 3; v++) {
      let best = -1, joint = 0;
      for (let k = 0; k < 4; k++) if (p.weights[v * 4 + k] > best) { best = p.weights[v * 4 + k]; joint = p.joints[v * 4 + k]; }
      const bone = rig.rest[founder.jointNames[joint]];
      const d = seg([p.positions[v * 3], p.positions[v * 3 + 1], p.positions[v * 3 + 2]], bone.head, bone.tail);
      assert.ok(d < limit, `${p.name} (${p.role}) vertex ${v} is ${d.toFixed(2)} from its bone ${founder.jointNames[joint]}`);
    }
  }
});

// The reason the model is modular. A player picks from LOOKS on the profile
// screen; an option with no mesh would silently fight without it.
test('every look option a player can pick has a mesh', () => {
  const SLOT = { hairStyle: 'hair', headwear: 'headwear', eyewear: 'eyewear', facialHair: 'facialHair', outfit: 'outfit' };
  const NO_MESH = new Set(['none', 'bald']);     // the base body is the look
  for (const [field, options] of Object.entries(LOOKS)) {
    for (const { id } of options) {
      if (NO_MESH.has(id)) continue;
      assert.ok(meshNames.has(`${SLOT[field]}:${id}`), `no mesh for ${field} "${id}"`);
    }
  }
});

test('every roster and base fighter resolves to meshes that exist', () => {
  for (const def of ROSTER) {
    const look = resolveLook3D(def);
    for (const slot of LOOK_SLOTS) {
      const option = look[slot];
      if (option === 'none' || option === 'bald') continue;
      assert.ok(meshNames.has(`${slot}:${option}`), `${def.id} wears ${slot} "${option}", which has no mesh`);
    }
  }
});

// Parts are the 2D props. Two have 3D meshes so far; the rest are listed so a
// new part, or a new prop mesh, is a deliberate change to this list.
test('which parts have a 3D prop is written down, not discovered', () => {
  const NOT_MODELLED = ['booster', 'case', 'clip', 'coat', 'device', 'parcel', 'ringlight', 'tablet', 'vial'];
  const ids = new Set(ROSTER.flatMap((d) => (d.parts || []).map((p) => p.id)));
  const missing = [...ids].filter((id) => !meshNames.has(`prop:${id}`)).sort();
  assert.deepEqual(missing, NOT_MODELLED);
});

test('a fighter wears their own options and nobody else\'s', () => {
  const adam = FIGHTERS.find((f) => f.id === 'max');
  const w = wearing(adam, 'idle');
  assert.equal(w('body'), true);
  assert.equal(w('hair:cap'), true, 'the roster cap is a hair style');
  assert.equal(w('headwear:cap'), false, 'and not the player headwear cap');
  assert.equal(w('outfit:hoodie'), true);
  assert.equal(w('outfit:suit'), false);
  assert.equal(w('facialHair:stubble'), true, 'accessory "stubble" still means stubble');
  assert.equal(w('eyewear:glasses'), false);
  assert.equal(w('prop:mat'), true, 'Adam carries his mat in every state');

  const player = { ...adam, hairStyle: 'long', headwear: 'beanie', eyewear: 'glasses', accessory: null, parts: undefined };
  const p = wearing(player, 'idle');
  assert.equal(p('hair:long') && p('headwear:beanie') && p('eyewear:glasses'), true);
  assert.equal(p('facialHair:stubble'), false);
  assert.equal(p('prop:mat'), false, 'a player build carries no roster props');
});

test('a prop follows its part\'s states', () => {
  const carl = FIGHTERS.find((f) => f.id === 'dex');
  assert.equal(wearing(carl, 'idle')('prop:guard-case'), false);
  assert.equal(wearing(carl, 'block')('prop:guard-case'), true);
});

test('the model wears its palette by role, including roles derived from it', () => {
  const roles = new Set(founder.primitives.map((p) => p.role));
  for (const role of ['suit', 'suit2', 'skin', 'pants', 'shoe', 'hair', 'accent']) {
    assert.ok(roles.has(role), `no primitive takes its colour from "${role}"`);
  }
  for (const role of roles) {
    if (DERIVED_ROLES[role]) assert.ok(['skin', 'suit', 'suit2', 'accent', 'hair', 'pants', 'shoe'].includes(DERIVED_ROLES[role].from));
  }
});

test('invertAffine undoes a scaled bone frame', () => {
  const m = boneFrame([0.1, 0.9, -0.2], [0.5, 0.4, 0.1], [0, 1, 0], 1.7, 0.8, 1.3);
  assert.ok(isIdentity(multiply(m, invertAffine(m))));
});

test('each rest frame composed with its stored inverse is the identity', () => {
  const rig = buildRig(founder, MODELS3D.founder);
  rig.names.forEach((name, i) => {
    const r = rig.rest[name];
    assert.ok(isIdentity(multiply(boneFrame(r.head, r.tail, r.ref), rig.inverse[i])), `${name} rest frame`);
  });
});

// The rule the whole renderer rests on: where the pose puts a fist, the model
// puts its fist. Measured by carrying the rest fist through the forearm matrix.
test('the lead fist lands exactly on the pose\'s lead hand', () => {
  const rig = buildRig(founder, MODELS3D.founder);
  const P = restPose();
  P.armF = { x: 88, y: -150 };                 // a jab at a basic's reach
  const m = solvePose(rig, P);
  const fist = transformPoint(m, rig.names.indexOf('forearm.L'), rig.rest['forearm.L'].tail);
  assert.ok(near(fist.slice(0, 2), [0.88, 1.50]), `fist landed at ${fist.map((v) => v.toFixed(3))}`);
});

test('a limb past full reach stretches rather than falling short', () => {
  const s = ik([0, 0, 0], [3, 0, 0], 0.4, 0.44, [0, -1, 0]);
  assert.ok(s.stretch > 1, 'the chain did not stretch');
  assert.ok(near(s.end, [3, 0, 0]), `the chain stopped at ${s.end}`);
  const rig = buildRig(founder, MODELS3D.founder);
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
  const rig = buildRig(founder, MODELS3D.founder);
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
  const rig = buildRig(founder, MODELS3D.founder);
  const m = solvePose(rig, restPose());
  const zOf = (bone) => transformPoint(m, rig.names.indexOf(bone), rig.rest[bone].head)[2];
  assert.ok(zOf('upper_arm.L') < 0 && zOf('upper_arm.R') > 0, 'shoulders are not split far and near');
  assert.ok(zOf('thigh.L') < 0 && zOf('thigh.R') > 0, 'hips are not split far and near');
});

test('every roster body poses to finite matrices', () => {
  const rig = buildRig(founder, MODELS3D.founder);
  for (const def of ROSTER) {
    const m = solvePose(rig, applyProportions(restPose(), clampBody(def.body)));
    assert.ok(m.every(Number.isFinite), `${def.id} produced a non-finite bone matrix`);
  }
});

// A held prop must hang in front of the fist whatever the arm is doing. The
// block briefcase was first strapped to the forearm and turned with it, so a
// tight guard (the elbow pointing down, the forearm upright) swung it behind
// the arm into the body, and it vanished from every block in the roster. It
// rides the grip joint now, which follows the fist but faces forward.
test('the block briefcase hangs in front of the fist in a tight guard', () => {
  const rig = buildRig(founder, MODELS3D.founder);
  const P = restPose();
  P.armF = { x: 25, y: -128 };                  // Kim's block: fists up at the chin
  P.armB = { x: 23, y: -123 };
  const m = solvePose(rig, P);
  const fist = transformPoint(m, rig.names.indexOf('forearm.L'), rig.rest['forearm.L'].tail);
  const cse = founder.primitives.find((p) => p.name === 'prop:guard-case' && p.role === 'case');
  let cx = 0, cy = 0, cz = 0;
  const n = cse.positions.length / 3;
  for (let v = 0; v < n; v++) { cx += cse.positions[v * 3]; cy += cse.positions[v * 3 + 1]; cz += cse.positions[v * 3 + 2]; }
  const joint = cse.joints[0];
  assert.equal(founder.jointNames[joint], 'grip.L', 'the case should ride the grip, not the forearm');
  const centre = transformPoint(m, joint, [cx / n, cy / n, cz / n]);
  assert.ok(centre[0] > fist[0] + 0.04, `the case sits behind the fist (${centre[0].toFixed(2)} vs ${fist[0].toFixed(2)})`);
  assert.ok(centre[1] < fist[1], 'the case should hang below the hand holding it');
});
