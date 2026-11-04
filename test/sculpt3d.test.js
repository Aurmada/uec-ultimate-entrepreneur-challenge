// The sculpted models as built (lab/blender/fighter3d.py -- <id> --rig): each
// dressed in his clothes from the 2D game, bare fists (November 2026). Jeff's
// first.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseGLB, extractModel } from '../src/engine/gl3d/glb.js';
import { MODELS3D } from '../src/data/models3d.js';
import { roleColour } from '../src/engine/gl3d/toon.js';
import { getFighter } from '../src/data/fighters.js';
import { mix } from '../src/engine/figure.js';
import { buildRig, solvePose, transformPoint } from '../src/engine/gl3d/rig.js';
import { restPose } from '../src/engine/anim.js';

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

// Adam (`max`), the second: his hoodie, baggy trousers and sneakers, and his
// cap backwards over short hair, all in his own palette's roles.
const adamGlb = readFileSync(new URL(`../${MODELS3D['sculpt:max'].url}`, import.meta.url));
const adam = extractModel(parseGLB(adamGlb.buffer.slice(adamGlb.byteOffset, adamGlb.byteOffset + adamGlb.byteLength)));

test('Adam wears his hoodie, its ribbing and strings, his trousers and shoes, and his cap', () => {
  const roles = new Set(adam.primitives.filter((p) => p.name === 'body').map((p) => p.role));
  for (const role of ['skin', 'suit', 'suit2', 'accent', 'pants', 'shoe']) assert.ok(roles.has(role), `no ${role}`);
  const cap = new Set(adam.primitives.filter((p) => p.name === 'hair:cap').map((p) => p.role));
  for (const role of ['suit2', 'accent', 'hair']) assert.ok(cap.has(role), `his cap has no ${role}`);
});

test("Adam's fists are bare too: his cuffs end at the wrist", () => {
  const reach = (p) => {
    let m = 0;
    for (let i = 0; i < p.positions.length; i += 3) m = Math.max(m, Math.abs(p.positions[i + 2]));
    return m;
  };
  const body = adam.primitives.filter((p) => p.name === 'body');
  const skin = reach(body.find((p) => p.role === 'skin'));
  for (const p of body.filter((q) => q.role !== 'skin')) assert.ok(reach(p) < skin - 0.06, `${p.role} reaches over the hands`);
});

// Carl (`dex`), the third: his suit, a jacket buttoned over his paunch with
// its lapels in the suit's colour in shade, the shirt and tie in the V, the
// shirt's cuffs at the wrists; every piece in his own palette's roles.
const carlGlb = readFileSync(new URL(`../${MODELS3D['sculpt:dex'].url}`, import.meta.url));
const carl = extractModel(parseGLB(carlGlb.buffer.slice(carlGlb.byteOffset, carlGlb.byteOffset + carlGlb.byteLength)));
const carlBody = carl.primitives.filter((p) => p.name === 'body');

test('Carl wears his suit: shirt, tie, jacket, lapels, trousers and shoes', () => {
  const roles = new Set(carlBody.map((p) => p.role));
  for (const role of ['skin', 'shirt', 'accent', 'suit', 'suit*0.78', 'pants', 'shoe']) assert.ok(roles.has(role), `no ${role}`);
});

test("every piece of Carl's takes its colour from his palette, the shirt aside (white, as in 2D)", () => {
  const { c } = getFighter('dex');
  for (const p of carlBody.filter((q) => q.role !== 'shirt')) {
    assert.notEqual(roleColour(c, p.role, null), null, `${p.role} is not in his palette`);
  }
  // the lapels as figure.js draws them: the suit mixed with black by 0.22
  const lapel = roleColour(c, 'suit*0.78', null).map((v) => Math.round(v * 255));
  const want = mix(c.suit, '#000000', 0.22).match(/\w\w/g).map((h) => parseInt(h, 16));
  lapel.forEach((v, i) => assert.ok(Math.abs(v - want[i]) <= 1, `lapel ${lapel} against ${want}`));
});

test("Carl's fists are bare: his shirt's cuffs end at the wrist", () => {
  const reach = (p) => {
    let m = 0;
    for (let i = 0; i < p.positions.length; i += 3) m = Math.max(m, Math.abs(p.positions[i + 2]));
    return m;
  };
  const skin = reach(carlBody.find((p) => p.role === 'skin'));
  for (const p of carlBody.filter((q) => q.role !== 'skin')) assert.ok(reach(p) < skin - 0.06, `${p.role} reaches over the hands`);
});

test('a role in shade takes its palette colour darkened, and an unknown role keeps its own', () => {
  const pal = { suit: '#4a4038' };
  assert.deepEqual(roleColour(pal, 'suit', [1, 1, 1]), [0x4a / 255, 0x40 / 255, 0x38 / 255]);
  assert.deepEqual(roleColour(pal, 'suit*0.5', [1, 1, 1]), [0x4a / 510, 0x40 / 510, 0x38 / 510]);
  assert.deepEqual(roleColour(pal, 'shirt', [1, 1, 1]), [1, 1, 1]);
  assert.deepEqual(roleColour(pal, 'suit2*0.5', [0, 0, 1]), [0, 0, 1]);
});

// Props (2026-11-04), as the founder's model carries them: each sculpt raises
// the block briefcase in its lead fist, and Carl carries his own case in his
// rear one, each riding its grip bone wholly.
const steveGlb = readFileSync(new URL(`../${MODELS3D['sculpt:kai'].url}`, import.meta.url));
const steve = extractModel(parseGLB(steveGlb.buffer.slice(steveGlb.byteOffset, steveGlb.byteOffset + steveGlb.byteLength)));
const eloGlb = readFileSync(new URL(`../${MODELS3D['sculpt:elo'].url}`, import.meta.url));
const elo = extractModel(parseGLB(eloGlb.buffer.slice(eloGlb.byteOffset, eloGlb.byteOffset + eloGlb.byteLength)));
const sculpts = { bozo: model, max: adam, dex: carl, kai: steve, elo };
const top = (m, p, v) => {
  let best = -1, joint = 0;
  for (let k = 0; k < 4; k++) if (p.weights[v * 4 + k] > best) { best = p.weights[v * 4 + k]; joint = p.joints[v * 4 + k]; }
  return [m.jointNames[joint], best];
};

test('every sculpt raises the block briefcase on its lead grip, and carries its own prop where the 2D one is', () => {
  const CASE = ['case', 'frame', 'brass'];
  const carries = {
    bozo: { 'prop:guard-case': ['grip.L', CASE] },
    max: { 'prop:guard-case': ['grip.L', CASE] },
    dex: { 'prop:guard-case': ['grip.L', CASE], 'prop:case': ['grip.R', CASE] },
    kai: { 'prop:guard-case': ['grip.L', CASE], 'prop:device': ['grip.R', ['accent']] },   // his device in his palette's accent
    elo: { 'prop:guard-case': ['grip.L', CASE], 'prop:booster': ['chest', ['accent', 'frame']] },   // worn on his back
  };
  for (const [id, props] of Object.entries(carries)) {
    const m = sculpts[id];
    for (const [name, [grip, roles]] of Object.entries(props)) {
      const prims = m.primitives.filter((p) => p.name === name);
      assert.deepEqual(new Set(prims.map((p) => p.role)), new Set(roles), `${id} ${name}`);
      for (const p of prims) {
        for (let v = 0; v < p.positions.length / 3; v++) {
          const [joint, w] = top(m, p, v);
          assert.ok(joint === grip && w > 0.999, `${id} ${name} vertex ${v} rides ${joint} at ${w}`);
        }
      }
    }
  }
});

test("Carl's case hangs below his rear fist with its handle in it, not beside it", () => {
  const rig = buildRig(carl, MODELS3D['sculpt:dex']);
  const m = solvePose(rig, restPose());
  const fist = transformPoint(m, rig.names.indexOf('forearm.R'), rig.rest['forearm.R'].tail);
  const shell = carl.primitives.find((p) => p.name === 'prop:case' && p.role === 'case');
  const handle = carl.primitives.find((p) => p.name === 'prop:case' && p.role === 'frame');
  const centre = (p) => {
    const c = [0, 0, 0], n = p.positions.length / 3;
    for (let v = 0; v < n; v++) for (let k = 0; k < 3; k++) c[k] += p.positions[v * 3 + k] / n;
    return transformPoint(m, rig.names.indexOf('grip.R'), c);
  };
  const c = centre(shell), h = centre(handle);
  assert.ok(c[1] < fist[1] - 0.12, `the case should hang below the hand (${c[1].toFixed(2)} vs ${fist[1].toFixed(2)})`);
  assert.ok(Math.hypot(h[0] - fist[0], h[2] - fist[2]) < 0.04, 'the handle should be under the fist holding it');
  assert.ok(Math.abs(h[1] - fist[1]) < 0.08, `the handle should be at the fist (${h[1].toFixed(2)} vs ${fist[1].toFixed(2)})`);
});

// The lead hand (2026-11-04) comes in two shapes, parted from the body under
// the sleeve, which the game swaps by the pose: the fist and the hand open.
test("every sculpt's lead hand comes as a fist and open, parted from the body", () => {
  // glTF is y up, the character's left (the lead side) on -z
  const reach = (p, side) => {
    let m = -Infinity;
    for (let i = 0; i < p.positions.length; i += 3) m = Math.max(m, side * p.positions[i + 2]);
    return m;
  };
  for (const [id, m] of Object.entries(sculpts)) {
    const prim = (name) => m.primitives.find((p) => p.name === name && p.role === 'skin');
    const body = prim('body'), fist = prim('hand:fist'), open = prim('hand:open');
    assert.ok(fist && open, `${id} has no lead hand of its own`);
    assert.ok(reach(body, -1) < reach(fist, -1) - 0.08, `${id}'s body still carries the lead fist`);
    assert.ok(Math.abs(reach(body, 1) - reach(fist, -1)) < 0.03, `${id}'s fist is not where his other one is`);
    for (const p of [fist, open]) {
      let on = 0;
      for (let v = 0; v < p.positions.length / 3; v++) if (top(m, p, v)[0] === 'forearm.L') on++;
      assert.ok(on / (p.positions.length / 3) > 0.95, `${id} ${p.name} does not ride the lead forearm`);
    }
  }
});

// Steve (`kai`), the fourth: his glasses are rims round clear lenses, as the
// 2D ones are drawn, the rims wire drawn without the ink outline (outlined,
// the ink filled each lens black) and the lenses faint glass the painted eyes
// show through; his hair is a quiff, all in his palette's roles.

test('Steve wears his glasses, rims round clear lenses the painted eyes show through, and his quiff', () => {
  const roles = (name) => new Set(steve.primitives.filter((p) => p.name === name).map((p) => p.role));
  assert.deepEqual(roles('eyewear:glasses'), new Set(['clear', 'rim']));
  assert.deepEqual(roles('hair:quiff'), new Set(['hair']));
  const spec = MODELS3D['sculpt:kai'];
  assert.ok(spec.inkless.includes('rim'), 'the rims are outlined: the ink fills the lenses');
  assert.ok(spec.glass.clear > 0 && spec.glass.clear < 0.3, 'the lenses are not faint glass');
  assert.notEqual(roleColour(getFighter('kai').c, 'hair', null), null, 'his hair is not in his palette');
});

// Elo (`elo`), the fifth: his tee with its ribbed crew neck and the red
// diamond on the chest, baggy trousers and shoes, his fists bare below the
// short sleeves, his buzz cut, all in his palette's roles.
test('Elo wears his tee, its rib and its red diamond, his trousers, shoes and buzz cut', () => {
  const body = elo.primitives.filter((p) => p.name === 'body');
  const roles = new Set(body.map((p) => p.role));
  for (const role of ['skin', 'suit', 'suit2', 'accent', 'pants', 'shoe']) assert.ok(roles.has(role), `no ${role}`);
  assert.deepEqual(new Set(elo.primitives.filter((p) => p.name === 'hair:buzz').map((p) => p.role)), new Set(['hair']));
  const reach = (p) => {
    let m = 0;
    for (let i = 0; i < p.positions.length; i += 3) m = Math.max(m, Math.abs(p.positions[i + 2]));
    return m;
  };
  const skin = reach(body.find((p) => p.role === 'skin'));
  for (const p of body.filter((q) => q.role !== 'skin')) assert.ok(reach(p) < skin - 0.2, `${p.role} reaches past his short sleeves`);
});
