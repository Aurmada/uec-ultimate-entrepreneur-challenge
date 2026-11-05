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
import { GL3D } from '../src/config.js';

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
const scamGlb = readFileSync(new URL(`../${MODELS3D['sculpt:scam'].url}`, import.meta.url));
const scam = extractModel(parseGLB(scamGlb.buffer.slice(scamGlb.byteOffset, scamGlb.byteOffset + scamGlb.byteLength)));
const avaGlb = readFileSync(new URL(`../${MODELS3D['sculpt:ava'].url}`, import.meta.url));
const lizbeth = extractModel(parseGLB(avaGlb.buffer.slice(avaGlb.byteOffset, avaGlb.byteOffset + avaGlb.byteLength)));
const zaraGlb = readFileSync(new URL(`../${MODELS3D['sculpt:zara'].url}`, import.meta.url));
const kim = extractModel(parseGLB(zaraGlb.buffer.slice(zaraGlb.byteOffset, zaraGlb.byteOffset + zaraGlb.byteLength)));
const eleanorGlb = readFileSync(new URL(`../${MODELS3D['sculpt:eleanor'].url}`, import.meta.url));
const cathie = extractModel(parseGLB(eleanorGlb.buffer.slice(eleanorGlb.byteOffset, eleanorGlb.byteOffset + eleanorGlb.byteLength)));
const sculpts = { bozo: model, max: adam, dex: carl, kai: steve, elo, scam, ava: lizbeth, zara: kim, eleanor: cathie };
const top = (m, p, v) => {
  let best = -1, joint = 0;
  for (let k = 0; k < 4; k++) if (p.weights[v * 4 + k] > best) { best = p.weights[v * 4 + k]; joint = p.joints[v * 4 + k]; }
  return [m.jointNames[joint], best];
};

test('every sculpt raises the block briefcase on its lead grip, and carries its own prop where the 2D one is', () => {
  const CASE = ['case', 'frame', 'brass'];
  const carries = {
    bozo: { 'prop:guard-case': ['grip.L', CASE], 'prop:parcel': ['chest', ['hair', 'shoe']] },     // taped
    max: { 'prop:guard-case': ['grip.L', CASE], 'prop:mat': ['chest', ['shoe', 'accent']] },        // strapped
    dex: { 'prop:guard-case': ['grip.L', CASE], 'prop:case': ['grip.R', CASE] },
    kai: { 'prop:guard-case': ['grip.L', CASE], 'prop:device': ['grip.R', ['accent']] },   // his device in his palette's accent
    elo: { 'prop:guard-case': ['grip.L', CASE], 'prop:booster': ['chest', ['accent', 'frame']] },   // worn on his back
    scam: { 'prop:guard-case': ['grip.L', CASE], 'prop:clip': ['chest', ['shoe']] },                  // and his, the 2D part's fill
    ava: { 'prop:guard-case': ['grip.L', CASE], 'prop:vial': ['hips', ['accent', 'shoe']] },          // at her hip, a white cap
    zara: { 'prop:guard-case': ['grip.L', CASE], 'prop:ringlight': ['head', ['accent']] },           // haloing her head
    eleanor: { 'prop:guard-case': ['grip.L', CASE], 'prop:tablet': ['grip.R', ['accent', 'frame']],   // the chart on it dark
      'prop:coat': ['hips', ['hair']] },                                                             // her cream coat behind her
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

// Scam (`scam`), the sixth: his oversized henley with its ribbed neckline,
// placket and buttons, baggy trousers and shoes, his fists bare below the
// cuffs, his curly mop, all in his palette's roles (the buttons white, as
// the 2D figure draws them).
test('Scam wears his henley, its trim and buttons, his trousers, shoes and curly mop', () => {
  const body = scam.primitives.filter((p) => p.name === 'body');
  const roles = new Set(body.map((p) => p.role));
  for (const role of ['skin', 'suit', 'suit2', 'button', 'pants', 'shoe']) assert.ok(roles.has(role), `no ${role}`);
  assert.deepEqual(new Set(scam.primitives.filter((p) => p.name === 'hair:curly').map((p) => p.role)), new Set(['hair']));
  const reach = (p) => {
    let m = 0;
    for (let i = 0; i < p.positions.length; i += 3) m = Math.max(m, Math.abs(p.positions[i + 2]));
    return m;
  };
  const skin = reach(body.find((p) => p.role === 'skin'));
  for (const p of body.filter((q) => q.role !== 'skin')) assert.ok(reach(p) < skin - 0.06, `${p.role} reaches over the hands`);
});

// Lizbeth (`ava`), the seventh and the first woman: a woman's frame (narrower
// shoulders, a wider pelvis) out of the same pipeline; her blazer worn open
// over a shirt, skinny trousers and shoes; her visor, cyan glass the painted
// eyes show through; her ponytail.
test("the women are built on a woman's frame: narrower in the shoulder against the hip than any man", () => {
  const ratio = (id) => MODELS3D[`sculpt:${id}`].fit.shoulderHalf / MODELS3D[`sculpt:${id}`].fit.hipHalf;
  const woman = (id) => getFighter(id).figure?.frame === 'f';
  for (const her of Object.keys(sculpts).filter(woman)) {
    for (const id of Object.keys(sculpts)) {
      if (woman(id)) continue;
      assert.ok(ratio(her) < ratio(id) - 0.2, `${her}'s shoulders against her hips (${ratio(her).toFixed(2)}) are a man's, as ${id}'s (${ratio(id).toFixed(2)})`);
    }
  }
});

test('Lizbeth wears her blazer open over a shirt, her trousers and shoes, her visor and ponytail', () => {
  const body = lizbeth.primitives.filter((p) => p.name === 'body');
  const roles = new Set(body.map((p) => p.role));
  for (const role of ['skin', 'shirt', 'suit', 'suit*0.78', 'pants', 'shoe']) assert.ok(roles.has(role), `no ${role}`);
  assert.deepEqual(new Set(lizbeth.primitives.filter((p) => p.name === 'eyewear:visor').map((p) => p.role)), new Set(['visor']));
  assert.ok(MODELS3D['sculpt:ava'].glass.visor > 0 && MODELS3D['sculpt:ava'].glass.visor < 0.6, 'the visor is not glass the eyes show through');
  assert.deepEqual(new Set(lizbeth.primitives.filter((p) => p.name === 'hair:ponytail').map((p) => p.role)), new Set(['hair']));
});

// Kim (`zara`), the eighth and the second woman: her bomber, zipped, with its
// ribbed collar and cuffs and the band at the hem in her accent, over flared
// trousers and shoes; her puffs and earrings; and her ring light, turned to
// face the camera as her head is posed, behind her head.
test('Kim wears her bomber, its rib, band and zip, flared trousers, shoes, puffs and earrings', () => {
  const body = kim.primitives.filter((p) => p.name === 'body');
  const roles = new Set(body.map((p) => p.role));
  for (const role of ['skin', 'suit', 'suit2', 'accent', 'suit2*0.8', 'pants', 'shoe']) assert.ok(roles.has(role), `no ${role}`);
  assert.deepEqual(new Set(kim.primitives.filter((p) => p.name === 'hair:puffs').map((p) => p.role)), new Set(['hair']));
  assert.deepEqual(new Set(kim.primitives.filter((p) => p.name === 'accessory:earrings').map((p) => p.role)), new Set(['accent']));
  // nothing she wears reaches over her hands: they hang at the band's height
  // in the rest pose, and the band once took them in
  const reach = (p) => {
    let m = 0;
    for (let i = 0; i < p.positions.length; i += 3) m = Math.max(m, Math.abs(p.positions[i + 2]));
    return m;
  };
  const skin = reach(body.find((p) => p.role === 'skin'));
  for (const p of body.filter((q) => q.role !== 'skin')) assert.ok(reach(p) < skin - 0.06, `${p.role} reaches over the hands`);
  // the flare: the legs wider at the hem than at the knee, front to back
  const pants = body.find((p) => p.role === 'pants').positions;
  const depth = (y0, y1) => {
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < pants.length; i += 3) {
      if (pants[i + 1] >= y0 && pants[i + 1] <= y1) { lo = Math.min(lo, pants[i]); hi = Math.max(hi, pants[i]); }
    }
    return hi - lo;
  };
  assert.ok(depth(0.04, 0.08) > depth(0.42, 0.46) + 0.03, `no flare: ${depth(0.04, 0.08).toFixed(3)} at the hem against ${depth(0.42, 0.46).toFixed(3)} at the knee`);
});

test('her ring light stands behind her head, turned as her head is posed so the camera sees it whole', () => {
  const P = kim.primitives.filter((p) => p.name === 'prop:ringlight').flatMap((p) => Array.from(p.positions));
  const n = P.length / 3;
  const c = [0, 1, 2].map((k) => P.filter((_, i) => i % 3 === k).reduce((a, v) => a + v, 0) / n);
  // its plane's normal: the direction it is thinnest in, out of the horizontal
  // ones (it stands upright)
  let thin = Infinity, normal = 0;
  for (let a = 0; a < Math.PI; a += 0.005) {
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < P.length; i += 3) {
      const d = (P[i] - c[0]) * Math.cos(a) + (P[i + 2] - c[2]) * Math.sin(a);
      lo = Math.min(lo, d); hi = Math.max(hi, d);
    }
    if (hi - lo < thin) { thin = hi - lo; normal = a; }
  }
  // glTF's z is the body's right: square to the body, the normal would be
  // along it; turned by the head's posed turn, it is that far round from it
  const turn = Math.abs(Math.PI / 2 - normal);
  assert.ok(Math.abs(turn - (GL3D.YAW + GL3D.HEAD_YAW)) < 0.03, `turned ${turn.toFixed(3)}, the head ${GL3D.YAW + GL3D.HEAD_YAW}`);
  assert.ok(thin < 0.03, `not a flat ring (${thin.toFixed(3)} thick)`);
  assert.ok(c[0] < -0.08 && c[1] > 1.75, `not behind her head (${c.map((v) => v.toFixed(3))})`);
});

// Cathie (`eleanor`), the ninth and the third woman: a navy suit buttoned over
// a shirt and tie, as the 2D figure draws it, her brooch on the near lapel,
// her trousers and shoes, her cream bob; and the skirt of her coat, behind
// her and open in front.
test('Cathie wears her suit, shirt and tie, trousers, shoes and bob, and her brooch high on the near lapel', () => {
  const body = cathie.primitives.filter((p) => p.name === 'body');
  const roles = new Set(body.map((p) => p.role));
  for (const role of ['skin', 'shirt', 'accent', 'suit', 'suit*0.78', 'pants', 'shoe']) assert.ok(roles.has(role), `no ${role}`);
  assert.deepEqual(new Set(cathie.primitives.filter((p) => p.name === 'hair:bob').map((p) => p.role)), new Set(['hair']));
  const pins = cathie.primitives.filter((p) => p.name === 'accessory:brooch');
  assert.deepEqual(new Set(pins.map((p) => p.role)), new Set(['accent']));
  const P = pins[0].positions;
  const centre = [0, 1, 2].map((k) => { let a = 0; for (let i = k; i < P.length; i += 3) a += P[i]; return a / (P.length / 3); });
  // glTF's z is the body's right, the side the camera sees; up the chest
  // between the bottom of the V and the collar
  assert.ok(centre[2] > 0.05 && centre[0] > 0.08, `not on the front of the near side (${centre.map((v) => v.toFixed(3))})`);
  for (let v = 0; v < P.length / 3; v++) {
    const [joint, w] = top(cathie, pins[0], v);
    assert.ok(joint === 'chest' && w > 0.999, `brooch vertex ${v} rides ${joint} at ${w}`);
  }
});

test('her coat hangs behind her and round her sides, open in front', () => {
  const P = cathie.primitives.filter((p) => p.name === 'prop:coat').flatMap((p) => Array.from(p.positions));
  let behind = 0;
  for (let i = 0; i < P.length; i += 3) {
    if (P[i] < 0) behind++;
    if (Math.abs(P[i + 2]) < 0.08) assert.ok(P[i] < 0, `the coat closes in front (${P[i].toFixed(3)}, ${P[i + 2].toFixed(3)})`);
  }
  assert.ok(behind > 0.6 * (P.length / 3), 'it is not behind her');
});

// Jeff's parcel and Adam's mat are carried on him, not beside him: each is
// placed by where a ray first meets the clothes (fighter3d.py `_hit`), as
// projected onto cloth that hangs, a point stopped short and the mat stood a
// hand's width off Adam's back.
test("Jeff's parcel is clamped at his near side and Adam's mat lies on his back, neither floating", () => {
  const gap = (m, name) => {
    const body = m.primitives.filter((p) => p.name === 'body').flatMap((p) => Array.from(p.positions));
    const prop = m.primitives.filter((p) => p.name === name).flatMap((p) => Array.from(p.positions));
    let best = Infinity;
    for (let i = 0; i < prop.length; i += 9) {
      for (let j = 0; j < body.length; j += 3) {
        const d = (prop[i] - body[j]) ** 2 + (prop[i + 1] - body[j + 1]) ** 2 + (prop[i + 2] - body[j + 2]) ** 2;
        if (d < best) best = d;
      }
    }
    return Math.sqrt(best);
  };
  const centre = (m, name) => {
    const P = m.primitives.filter((p) => p.name === name).flatMap((p) => Array.from(p.positions));
    return [0, 1, 2].map((k) => { let a = 0; for (let i = k; i < P.length; i += 3) a += P[i]; return a / (P.length / 3); });
  };
  assert.ok(gap(model, 'prop:parcel') < 0.03, `the parcel floats ${gap(model, 'prop:parcel').toFixed(3)} off him`);
  assert.ok(centre(model, 'prop:parcel')[2] > 0.1, 'the parcel is not at his near side, under the rear arm');
  assert.ok(gap(adam, 'prop:mat') < 0.03, `the mat floats ${gap(adam, 'prop:mat').toFixed(3)} off his back`);
  assert.ok(centre(adam, 'prop:mat')[0] < -0.1, 'the mat is not on his back');
});
