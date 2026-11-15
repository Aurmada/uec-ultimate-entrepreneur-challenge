// Cathie's coat (a graphics review, 2026-11-09): built as one piece riding
// her hips, it stood out behind her as a stiff wedge in a crouch, reaching
// under the floor, and in a knockout poked 12 px through it. The skirt is now
// handed to her thighs as it falls (gl3d/cloth.js, models3d.js `cloth`), and
// a knockout is laid by the coat as well as the body (index.js sinkOf). Since
// v3.22.3 its back hangs from the waist too (cloth.js hangsFor, the shader's
// uHang), where in a deep crouch it was drawn under her between her knees.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseGLB, extractModel } from '../src/engine/gl3d/glb.js';
import { buildRig, solvePose } from '../src/engine/gl3d/rig.js';
import { clothFor, hangsFor, hangOf } from '../src/engine/gl3d/cloth.js';
import { sinkOf } from '../src/engine/gl3d/index.js';
import { MODELS3D } from '../src/data/models3d.js';
import { FORMS } from '../src/data/forms.js';
import { getFighter } from '../src/data/fighters.js';
import { computePose, groundFall } from '../src/engine/drawFighter.js';
import { applyProportions, clampBody } from '../src/engine/proportions.js';
import { figureFrame } from '../src/engine/figure.js';
import { GL3D } from '../src/config.js';

const load = (spec) => {
  const b = readFileSync(new URL(`../${spec.url}`, import.meta.url));
  return extractModel(parseGLB(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)));
};
const COAT = 'prop:coat';
const cathie = MODELS3D['sculpt:eleanor'];

test("the loader loosens a model's cloth as it loads", () => {
  const src = readFileSync(new URL('../src/engine/gl3d/index.js', import.meta.url), 'utf8');
  assert.match(src, /entry\.cloth = new Set\(clothFor\(model, spec\)\);\s*entry\.rig = buildRig\(model, spec\);/,
    'the coat is not re-weighted before the rig is built');
  assert.ok(cathie.cloth?.[COAT], "Cathie's coat is not listed as cloth");
});

test("Cathie's coat: the waist stays on the hips, the skirt goes to the thigh it hangs over", () => {
  const model = load(cathie);
  const p = model.primitives.find((q) => q.name === COAT);
  const verts = p.positions.length / 3;
  assert.deepEqual(clothFor(model, cathie), [COAT]);
  assert.equal(p.positions.length / 3, verts, 'the coat gained or lost vertices');
  const c = cathie.cloth[COAT];
  const j = (n) => model.jointNames.indexOf(n);
  const hips = j('hips'), L = j('thigh.L'), R = j('thigh.R');
  let hem = 0;
  for (let v = 0; v < verts; v++) {
    const w = (joint) => [0, 1, 2, 3].reduce((s, k) => s + (p.joints[v * 4 + k] === joint ? p.weights[v * 4 + k] : 0), 0);
    const sum = [0, 1, 2, 3].reduce((s, k) => s + p.weights[v * 4 + k], 0);
    assert.ok(Math.abs(sum - 1) < 1e-5, `vertex ${v}'s weights sum to ${sum}`);
    const y = p.positions[v * 3 + 1], z = p.positions[v * 3 + 2];
    if (y >= c.from) assert.equal(w(hips), 1, `vertex ${v} at the waist (${y.toFixed(2)}) left the hips`);
    if (y <= c.to) {
      hem++;
      const legs = w(L) + w(R);
      assert.ok(legs >= c.follow * c.back - 1e-6, `vertex ${v} at the hem gives the legs only ${legs.toFixed(2)}`);
      // a side panel goes with its own leg (thigh.R is the +z one)
      const r = model.restHeads[R][2];
      if (Math.abs(z) > Math.abs(r)) assert.ok(z * r > 0 ? w(R) > 0.5 : w(L) > 0.5, `vertex ${v} on the ${z > 0 ? '+' : '-'}z side follows the other leg`);
    }
  }
  assert.ok(hem > 100, 'the hem was not found');
});

test('no other model is touched', () => {
  for (const [id, spec] of Object.entries(MODELS3D)) {
    if (id === 'sculpt:eleanor') continue;
    const model = load(spec);
    const before = model.primitives.map((p) => [p.joints.slice(), p.weights.slice()]);
    assert.deepEqual(clothFor(model, spec), [], `${id} has cloth`);
    model.primitives.forEach((p, i) => {
      assert.deepEqual(p.joints, before[i][0], `${id}'s ${p.name} was re-skinned`);
      assert.deepEqual(p.weights, before[i][1], `${id}'s ${p.name} was re-weighted`);
    });
  }
});

// The coat, skinned, laid as drawFighter lays the fighter: its lowest point
// and how far behind her it reaches, against the body's own.
function coat(cloth) {
  const model = load(cathie);
  const spec = cloth ? cathie : { ...cathie, cloth: undefined };
  const names = new Set(clothFor(model, spec));
  const rig = buildRig(model, spec), entry = { model, rig, cloth: names };
  const def = getFighter('eleanor'), form = FORMS[cathie.form];
  const pose = (state, extra = {}) => figureFrame(applyProportions(computePose({ def, state, stateT: 3, walkPhase: 0, side: 0, vy: 0, airborne: false, crouching: false, movingBack: false, ...extra }, 0, form), clampBody(def.body)));
  const extent = (P, name, gx = 0, gy = 0) => {
    const m = solvePose(rig, P), c = Math.cos(P.rot || 0), s = Math.sin(P.rot || 0), sx = P.sx ?? 1, sy = P.sy ?? 1;
    let low = -Infinity, back = Infinity;
    for (const p of model.primitives) {
      if (p.name !== name) continue;
      for (let v = 0; v < p.positions.length / 3; v++) {
        let X = 0, Y = 0;
        for (let k = 0; k < 4; k++) {
          const w = p.weights[v * 4 + k];
          if (!w) continue;
          const o = p.joints[v * 4 + k] * 16, x = p.positions[v * 3], y = p.positions[v * 3 + 1], z = p.positions[v * 3 + 2];
          X += w * (m[o] * x + m[o + 4] * y + m[o + 8] * z + m[o + 12]);
          Y += w * (m[o + 1] * x + m[o + 5] * y + m[o + 9] * z + m[o + 13]);
        }
        const px = X * GL3D.UNIT * sx + gx, py = -Y * GL3D.UNIT * sy + gy;
        low = Math.max(low, px * s + py * c);
        back = Math.min(back, px * c - py * s);
      }
    }
    return { low, back };
  };
  const standing = extent(pose('idle'), 'body').low;
  const cr = pose('crouch', { crouching: true, stateT: 0.5 });
  const P = pose('ko'), g = groundFall(P);
  const lift = Math.min(0, GL3D.LIE.SOLE - (sinkOf(entry, P) + g.shift));
  const ko = extent(P, COAT, g.x + lift * Math.sin(P.rot || 0), g.y + lift * Math.cos(P.rot || 0));
  return { standing, crouch: extent(cr, COAT), crouchBody: extent(cr, 'body'), ko, entry, P };
}

test("Cathie's coat stays over the floor crouching and knocked out, and does not stand out behind her", () => {
  const { standing, crouch, crouchBody, ko } = coat(true);
  assert.ok(crouch.low <= standing + 1, `crouching, the coat goes ${(crouch.low - standing).toFixed(1)} px through the floor`);
  assert.ok(crouch.back >= crouchBody.back - 1, `crouching, the coat stands ${(crouchBody.back - crouch.back).toFixed(1)} px out behind her`);
  assert.ok(ko.low <= standing + 1, `knocked out, the coat goes ${(ko.low - standing).toFixed(1)} px through the floor`);
});

test('a knockout is laid by the coat too, not the body alone', () => {
  // With the coat as it was built, riding the hips, it is the lowest thing on
  // her lying down: counted, it lifts her clear; left out, it went under.
  const stiff = coat(false);
  stiff.entry.cloth = new Set([COAT]);
  stiff.entry.samples = null;
  const counted = sinkOf(stiff.entry, stiff.P);
  stiff.entry.cloth = new Set();
  stiff.entry.samples = null;
  const body = sinkOf(stiff.entry, stiff.P);
  assert.ok(counted > body + 5, `the knockout's sampling leaves the coat out (${counted.toFixed(1)} against ${body.toFixed(1)})`);
});

// Her coat's back hangs from the waist (cloth.js hangsFor, the shader's uHang):
// in a deep crouch it bunched round her rear knee, handed to both legs at
// once (the graphics reviews of v3.21 and v3.22.3); a coat's back falls
// straight from the waist and lies on the floor. The hang is done here as the
// shader does it (toon.js): each vertex drawn toward the point straight below
// where its column leaves the waist, riding the hips, no lower than the floor.
function hungCoat(state, extra, hang) {
  const model = load(cathie);
  clothFor(model, cathie);
  const rig = buildRig(model, cathie);
  const def = getFighter('eleanor'), form = FORMS[cathie.form];
  const P = figureFrame(applyProportions(computePose({ def, state, stateT: 0.5, walkPhase: 0, side: 0, vy: 0, airborne: false, crouching: false, movingBack: false, ...extra }, 0, form), clampBody(def.body)));
  const m = solvePose(rig, P);
  const p = model.primitives.find((q) => q.name === COAT);
  const h = hang ? hangOf(hangsFor(model, cathie), p, Math.cos(P.rot || 0)) : null;
  const at = (o, x, y, z) => [0, 1, 2].map((i) => m[o + i] * x + m[o + 4 + i] * y + m[o + 8 + i] * z + m[o + 12 + i]);
  const out = [];
  for (let v = 0; v < p.positions.length / 3; v++) {
    const [x, y, z] = [p.positions[v * 3], p.positions[v * 3 + 1], p.positions[v * 3 + 2]];
    let q = [0, 0, 0];
    for (let k = 0; k < 4; k++) {
      const w = p.weights[v * 4 + k];
      if (w) q = q.map((c, i) => c + w * at(p.joints[v * 4 + k] * 16, x, y, z)[i]);
    }
    const [from, to, ax, az] = h ? h.col : [1, 0, 0, 0];
    const t = Math.min(1, Math.max(0, (from - y) / (from - to))), down = t * t * (3 - 2 * t);
    const side = Math.abs(z - az) / (Math.hypot(x - ax, z - az) || 1e-4);
    const g = h ? h.opt[0] * down * (1 - side) ** h.opt[3] : 0;
    const top = at(h ? h.opt[1] * 16 : 0, x, from, z);
    const hung = [top[0], Math.max(top[1] - (from - y), h ? h.opt[2] : 0), top[2]];
    out.push({ y, side, at: q.map((c, i) => c + (hung[i] - c) * g) });
  }
  return { out, hips: at(model.jointNames.indexOf('hips') * 16, 0, 0, 0), spec: cathie.cloth[COAT] };
}

// The coat's hem in bands, by how far round it is from straight behind (0)
// to the side (1): where each band lies on average, ahead of her hips and up
// from the floor, in px.
function bands(r) {
  const out = [];
  for (const [a, b] of [[0, 0.2], [0.2, 0.4], [0.4, 0.6], [0.6, 0.8], [0.8, 1.01]]) {
    const vs = r.out.filter((v) => v.y <= r.spec.to + 0.1 && v.side >= a && v.side < b);
    const mean = (f) => (vs.reduce((s, v) => s + f(v), 0) / vs.length) * GL3D.UNIT;
    out.push({ round: a, n: vs.length, ahead: mean((v) => v.at[0] - r.hips[0]), up: mean((v) => v.at[1]) });
  }
  return out;
}

test("Cathie's coat: in a deep crouch the back hangs straight below her hips, not pulled under her", () => {
  // Handed to both legs, the back of the hem was drawn 21 to 25 px forward,
  // under her between her knees, where it lay as a lump; hung, it is below her
  // hips. The sides still follow their own leg.
  const was = bands(hungCoat('crouch', { crouching: true }, false)), now = bands(hungCoat('crouch', { crouching: true }, true));
  for (let i = 0; i < 3; i++) {
    assert.ok(now[i].n > 20, `the hem ${now[i].round} round was not found`);
    assert.ok(was[i].ahead > 15, `${was[i].round} round, the hem already lay ${was[i].ahead.toFixed(1)} px ahead of her hips`);
    assert.ok(Math.abs(now[i].ahead) < 6, `${now[i].round} round, the hem lies ${now[i].ahead.toFixed(1)} px ahead of her hips, from ${was[i].ahead.toFixed(1)}`);
  }
  assert.ok(now[4].ahead > 20, 'the sides no longer follow her legs');
  assert.ok(hungCoat('crouch', { crouching: true }, true).out.every((v) => v.at[1] >= 0), 'the coat goes through the floor');
});

test("Cathie's coat: standing, the hang moves it next to nothing, and a knockout lets go of it", () => {
  const was = bands(hungCoat('idle', {}, false)), now = bands(hungCoat('idle', {}, true));
  now.forEach((b, i) => {
    assert.ok(Math.abs(b.ahead - was[i].ahead) < 3 && Math.abs(b.up - was[i].up) < 3,
      `standing, the hem ${b.round} round moved ${(b.ahead - was[i].ahead).toFixed(1)} px across and ${(b.up - was[i].up).toFixed(1)} up`);
  });
  const model = load(cathie);
  const hangs = hangsFor(model, cathie);
  const coatPart = { name: COAT };
  assert.equal(hangOf(hangs, { name: 'body' }), null, 'a part with no hang hangs');
  assert.equal(hangOf(hangs, coatPart, Math.cos(Math.PI / 2)), null, 'lying down, the coat still hangs toward the floor below her');
  assert.equal(hangOf(hangs, coatPart).opt[1], model.jointNames.indexOf('hips'), 'it hangs from the wrong joint');
  // and the shader does what the test does
  const toon = readFileSync(new URL('../src/engine/gl3d/toon.js', import.meta.url), 'utf8');
  assert.match(toon, /vec4 top = uBones\[int\(uHangOpt\.y\)\] \* vec4\(pos\.x, uHangCol\.x, pos\.z, 1\.0\);/);
  assert.match(toon, /p\.xyz = mix\(p\.xyz, hung, uHangOpt\.x \* down \* pow\(1\.0 - side, uHangOpt\.w\)\);/);
});
