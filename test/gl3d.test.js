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
import {
  MODELS3D, DEFAULT_MODEL, FIGHTER_MODELS, LOOK_SLOTS, CONDITIONS, PAINTED_LOOKS, resolveLook3D, FACE_STATES, faceCell, faceKey,
  drawnFaceKey,
} from '../src/data/models3d.js';
import { restPose } from '../src/engine/anim.js';
import { applyProportions, clampBody } from '../src/engine/proportions.js';
import { FIGHTERS, BASE_CHARACTERS, LOOKS } from '../src/data/fighters.js';
import { GL3D, STYLIZE } from '../src/config.js';

function loadModel(id) {
  const b = readFileSync(new URL(`../${MODELS3D[id].url}`, import.meta.url));
  return extractModel(parseGLB(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)));
}
const founder = loadModel(DEFAULT_MODEL);
const meshNames = new Set(founder.primitives.map((p) => p.name));
const near = (a, b, eps = 1e-4) => a.every((v, i) => Math.abs(v - b[i]) < eps);
const isIdentity = (m) => m.every((v, i) => Math.abs(v - (i % 5 === 0 ? 1 : 0)) < 1e-6);
const ROSTER = [...FIGHTERS, ...BASE_CHARACTERS];
const painted = (slot, option) => (PAINTED_LOOKS[slot] || []).includes(option);

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
      const [slot, option] = p.name.includes(':') ? p.name.split(':') : [null, null];
      assert.ok(slot === null || slot === 'prop' || LOOK_SLOTS.includes(slot) || (slot === 'fx' && CONDITIONS.includes(option)),
        `mesh "${p.name}" names a slot or condition the runtime does not know`);
    }
  }
});

// Weights that sum to 1 can still point at the wrong bones. The first modular
// build weighted the whole base body to the FEET (six parts shared one name and
// the last part's bone list won), every check above passed, and every fighter
// rendered with its head and arms hurled across the screen. So: every vertex's
// strongest bone must actually be near it. Props hang furthest, on purpose:
// Cathie's coat is rigid to her hips so a kick cannot tear it in two, and its
// hem sits 0.65 below them; Adam's mat is 0.48 from his chest. Anything else
// past 0.35 is weighted to the wrong bone, and an arm weighted across the body
// is at least 0.54 away.
test('every vertex is weighted to a bone near it', () => {
  const rig = buildRig(founder, MODELS3D.founder);
  const seg = (p, a, b) => {
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
    const t = Math.max(0, Math.min(1, (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / (ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2)));
    return Math.hypot(ap[0] - ab[0] * t, ap[1] - ab[1] * t, ap[2] - ab[2] * t);
  };
  for (const p of founder.primitives) {
    const limit = p.name.startsWith('prop:') ? 0.72 : 0.35;
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
// screen; an option with no mesh would silently fight without it. An option
// painted into the face texture must NOT also have a mesh, or it shows twice.
test('every look option a player can pick has a mesh or is painted, never both', () => {
  const SLOT = { hairStyle: 'hair', headwear: 'headwear', eyewear: 'eyewear', facialHair: 'facialHair', outfit: 'outfit' };
  const NO_MESH = new Set(['none', 'bald']);     // the base body is the look
  for (const [field, options] of Object.entries(LOOKS)) {
    for (const { id } of options) {
      if (NO_MESH.has(id)) continue;
      const mesh = meshNames.has(`${SLOT[field]}:${id}`);
      if (painted(SLOT[field], id)) assert.ok(!mesh, `${field} "${id}" is painted and also has a mesh`);
      else assert.ok(mesh, `no mesh for ${field} "${id}"`);
    }
  }
});

test('every roster and base fighter resolves to meshes that exist', () => {
  for (const def of ROSTER) {
    const look = resolveLook3D(def);
    for (const slot of LOOK_SLOTS) {
      const option = look[slot];
      if (option === 'none' || option === 'bald' || painted(slot, option)) continue;
      assert.ok(meshNames.has(`${slot}:${option}`), `${def.id} wears ${slot} "${option}", which has no mesh`);
    }
  }
});

// Parts are the 2D props, and every one now has a 3D mesh. A part added to the
// roster without one fails here, so the 3D roster cannot quietly lose a prop.
test('every part the roster carries has a 3D prop', () => {
  const NOT_MODELLED = [];
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
  assert.equal(resolveLook3D(adam).facialHair, 'stubble', 'accessory "stubble" still means stubble');
  assert.equal(w('eyewear:glasses'), false);
  assert.equal(w('prop:mat'), true, 'Adam carries his mat in every state');

  const player = { ...adam, hairStyle: 'long', headwear: 'beanie', eyewear: 'glasses', accessory: null, parts: undefined };
  const p = wearing(player, 'idle');
  assert.equal(p('hair:long') && p('headwear:beanie') && p('eyewear:glasses'), true);
  assert.equal(resolveLook3D(player).facialHair, 'none');
  assert.equal(p('prop:mat'), false, 'a player build carries no roster props');
});

test('Unicorn Mode shows its horn, and only then', () => {
  assert.ok(meshNames.has('fx:unicorn'), 'the model has no horn');
  const adam = FIGHTERS.find((f) => f.id === 'max');
  assert.equal(wearing(adam, 'idle')('fx:unicorn'), false);
  assert.equal(wearing(adam, 'idle', { unicorn: false })('fx:unicorn'), false);
  assert.equal(wearing(adam, 'attack', { unicorn: true })('fx:unicorn'), true);
});

// drawHead draws no eyewear or facial hair over a photo, since the person's
// own are in it; a modelled pair of glasses would float in front of the photo.
// But only while the photo is the face: until it decodes (or if it never
// does) the founder wears their drawn face, and their look with it, as in 2D.
test('a photo founder wears no modelled eyewear or facial hair while the photo shows', () => {
  const base = { ...BASE_CHARACTERS[0], eyewear: 'glasses', facialHair: 'beard', hairStyle: 'short', headwear: 'cap' };
  const founder = { ...base, photo: 'data:image/png;base64,AAAA' };
  const drawn = wearing(base, 'idle');
  const showing = wearing(founder, 'idle', { photo: true });
  const decoding = wearing(founder, 'idle', { photo: false });
  assert.equal(drawn('eyewear:glasses') && drawn('facialHair:beard'), true);
  assert.equal(showing('eyewear:glasses') || showing('facialHair:beard'), false);
  assert.equal(showing('hair:short') && showing('headwear:cap'), true, 'hair and headwear still frame the photo');
  assert.equal(decoding('eyewear:glasses') && decoding('facialHair:beard'), true, 'the drawn face keeps its look');
});

test('a prop follows its part\'s states', () => {
  const carl = FIGHTERS.find((f) => f.id === 'dex');
  assert.equal(wearing(carl, 'idle')('prop:guard-case'), false);
  assert.equal(wearing(carl, 'block')('prop:guard-case'), true);
});

test('the model wears every palette role', () => {
  const roles = new Set(founder.primitives.map((p) => p.role));
  for (const role of ['suit', 'suit2', 'skin', 'pants', 'shoe', 'hair', 'accent']) {
    assert.ok(roles.has(role), `no primitive takes its colour from "${role}"`);
  }
});

// ---- faces
//
// The head is bare and each fighter's own 2D face is painted into a texture,
// one cell per expression, then projected onto it. What can go wrong without a
// browser: an expression the pose sets with no cell of its own (the fighter
// takes a hit with an idle face), two different faces sharing one texture, and
// a mesh built over the spot where a feature is drawn (a beard over the mouth).

test('every expression the game asks for has a face cell of its own', () => {
  const src = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const asked = new Set();
  for (const m of src('src/engine/drawFighter.js').matchAll(/P\.face = '(\w+)'|face: '(\w+)'/g)) asked.add(m[1] || m[2]);
  for (const path of ['src/main.js', 'src/ui/resultCard.js', 'src/ui/screens.js', 'src/ui/hud.js']) {
    for (const m of src(path).matchAll(/drawPortrait\([^)]*face: '(\w+)'/g)) asked.add(m[1]);
  }
  assert.ok(asked.size >= 6, `found only ${[...asked]}; has the pose code moved?`);
  for (const face of asked) assert.ok(FACE_STATES.includes(face), `"${face}" has no face cell`);
  const cells = FACE_STATES.map(faceCell);
  assert.equal(new Set(cells.map(String)).size, cells.length, 'two expressions share a cell');
  for (const [u, v, w, h] of cells) assert.ok(u >= 0 && v >= 0 && u + w <= 1 + 1e-9 && v + h <= 1 + 1e-9);
  assert.equal(faceCell('no-such-face'), faceCell('idle'));
});

test('fighters share a face texture exactly when their painted faces match', () => {
  const [a, b] = FIGHTERS;
  assert.notEqual(faceKey(a), faceKey(b), 'two roster faces share a texture');
  assert.equal(faceKey({ ...a, name: 'someone else' }), faceKey(a), 'the key reads more than the face');
  const adam = FIGHTERS.find((f) => f.id === 'max');
  assert.notEqual(faceKey(adam), faceKey({ ...adam, accessory: null }), 'stubble is painted, so it is in the key');
  const one = 'data:image/jpeg;base64,' + 'A'.repeat(90000) + 'one';
  const two = 'data:image/jpeg;base64,' + 'A'.repeat(90000) + 'two';
  assert.notEqual(faceKey({ ...a, photo: one }), faceKey(a), 'a photo face is not the drawn face');
  assert.notEqual(faceKey({ ...a, photo: one }), faceKey({ ...a, photo: two }), 'two photos share a texture');
  assert.equal(faceKey({ ...a, photo: one }), faceKey({ ...b, photo: one }), 'the same photo is the same face');
  // Until the photo decodes a founder wears their drawn face, which is keyed
  // like anyone else's, so it is painted once rather than every frame.
  assert.equal(drawnFaceKey({ ...a, photo: one }), faceKey(a), 'the drawn fallback is the drawn face');
});

// Where a 2D face point (px from the head centre, y down) lands in the
// projection: across (along the turned lateral axis) and bind y. The same
// arithmetic as the vertex shader in toon.js.
const FACE = MODELS3D.founder.face;
const R = FACE.r ?? STYLIZE.HEAD_R;
const [AX, AZ] = [Math.cos(FACE.turn || 0), Math.sin(FACE.turn || 0)];
const toFace = ([x, y]) => [FACE.at[0] - x * FACE.px[0], FACE.at[1] - y * FACE.px[1]];
const acrossOf = (p, v) => p.positions[v * 3 + 2] * AX - p.positions[v * 3] * AZ;
const aheadOf = (p, v) => p.positions[v * 3] * AX + p.positions[v * 3 + 2] * AZ;
// The drawn features as boxes, centre and half-size in 2D px, as drawFace lays
// them out for the default face: an eye from the top of its lid to the bottom
// of its pupil, wide enough for the lid, the X of a KO and the arc of a win;
// the mouth from corner to corner, deep enough for a snarl's curve.
const F0 = STYLIZE.FACE;
const EYE_TOP = F0.LID_Y + F0.LID_W / 2, EYE_BOTTOM = 0.6 + F0.PUPIL_R;
const FEATURES = {
  eyeNear: [[-0.34 * R + 1, (EYE_BOTTOM - EYE_TOP) / 2], [6, (EYE_BOTTOM + EYE_TOP) / 2]],
  eyeFar: [[0.34 * R + 1, (EYE_BOTTOM - EYE_TOP) / 2], [6, (EYE_BOTTOM + EYE_TOP) / 2]],
  mouth: [[1, F0.MOUTH_Y * R], [F0.MOUTH_W + 1, 2.5]],
};
function inBox(p, v, [[cx, cy], [hx, hy]]) {
  const [a0, y0] = toFace([cx + hx, cy - hy]), [a1, y1] = toFace([cx - hx, cy + hy]);
  const a = acrossOf(p, v), y = p.positions[v * 3 + 1];
  return a >= a0 && a <= a1 && y <= y0 && y >= y1 && aheadOf(p, v) > FACE.front;
}

// The middle of each feature (a pupil, the centre of the mouth) must land where
// the projection is at full strength. Its ends can fade: the far eye's lid
// runs onto the side of the head, which a turned face foreshortens anyway.
test('the middle of every drawn feature lands on skin facing the projection', () => {
  const skin = founder.primitives.find((p) => p.name === FACE.mesh && p.role === FACE.role);
  for (const [name, [centre]] of Object.entries(FEATURES)) {
    const box = [[centre[0] + (name === 'mouth' ? 0 : 1), centre[1]], [3, 3]];
    let hits = 0;
    for (let v = 0; v < skin.positions.length / 3; v++) {
      if (!inBox(skin, v, box)) continue;
      hits++;
      const n = skin.normals[v * 3] * AX + skin.normals[v * 3 + 2] * AZ;
      assert.ok(n >= FACE.fade[0], `the ${name} lands on skin turned away (facing ${n.toFixed(2)})`);
    }
    assert.ok(hits > 0, `the ${name} lands where the head has no skin`);
  }
});

test('no hair, headwear or facial hair is built over a drawn eye or the mouth', () => {
  const skin = founder.primitives.find((p) => p.name === FACE.mesh && p.role === FACE.role);
  const covered = [];
  for (const [name, box] of Object.entries(FEATURES)) {
    let face = -Infinity;
    for (let v = 0; v < skin.positions.length / 3; v++) if (inBox(skin, v, box)) face = Math.max(face, aheadOf(skin, v));
    for (const p of founder.primitives) {
      if (!/^(hair|headwear|facialHair):/.test(p.name)) continue;
      let over = 0;
      for (let v = 0; v < p.positions.length / 3; v++) if (inBox(p, v, box) && aheadOf(p, v) > face - 0.01) over++;
      if (over) covered.push(`${p.name} covers the ${name} (${over} vertices)`);
    }
  }
  assert.deepEqual(covered, []);
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

test('a portrait turns the head further toward the viewer than a match does', () => {
  const rig = buildRig(founder, MODELS3D.founder);
  const head = rig.names.indexOf('head');
  const facing = (turn) => {
    const m = solvePose(rig, { ...restPose(), bodyLean: 0 }, {}, turn);
    const a = transformPoint(m, head, [0, 1.8, 0]), b = transformPoint(m, head, [0.1, 1.8, 0]);
    return Math.atan2(b[2] - a[2], b[0] - a[0]);    // 0 is side-on, PI/2 faces the camera
  };
  const match = facing(null), bust = facing(GL3D.BUST.TURN);
  assert.ok(Math.abs(match - (GL3D.YAW + GL3D.HEAD_YAW)) < 1e-6, `a match head turns ${match}`);
  assert.ok(bust > match && bust < Math.PI / 2, `a portrait head turns ${bust}`);
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

// Kim's ring light is built pre-turned by the head's posed yaw so it faces the
// camera (lab/blender/build_founder.py, HEAD_TURN). That couples the model to
// two config numbers; change either and the halo turns side-on again unless
// the model is rebuilt to match.
test('the ring light was built for the head yaw the renderer uses', () => {
  const HEAD_TURN = 0.92;
  assert.ok(Math.abs(GL3D.YAW + GL3D.HEAD_YAW - HEAD_TURN) < 1e-9,
    `GL3D.YAW + GL3D.HEAD_YAW is ${GL3D.YAW + GL3D.HEAD_YAW}; rebuild founder.glb with HEAD_TURN to match`);
});
