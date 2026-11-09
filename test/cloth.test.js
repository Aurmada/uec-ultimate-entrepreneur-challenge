// Cathie's coat (a graphics review, 2026-11-09): built as one piece riding
// her hips, it stood out behind her as a stiff wedge in a crouch, reaching
// under the floor, and in a knockout poked 12 px through it. The skirt is now
// handed to her thighs as it falls (gl3d/cloth.js, models3d.js `cloth`), and
// a knockout is laid by the coat as well as the body (index.js sinkOf).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseGLB, extractModel } from '../src/engine/gl3d/glb.js';
import { buildRig, solvePose } from '../src/engine/gl3d/rig.js';
import { clothFor } from '../src/engine/gl3d/cloth.js';
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
