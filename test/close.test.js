// Up close, a 3D fighter keeps its guard and feet to its own side of the
// midpoint between the two (gl3d/close.js). At the closest the push allows,
// each lead fist stood in the other's chest and the feet crossed (the
// graphics reviews of v3.21 and v3.22.3). Render only: the fight is the
// simulation's, and so is every attack's reach.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { closeGuard, give, tuckOf } from '../src/engine/gl3d/close.js';
import { MODELS3D } from '../src/data/models3d.js';
import { FORMS } from '../src/data/forms.js';
import { FIGHTERS } from '../src/data/fighters.js';
import { computePose } from '../src/engine/drawFighter.js';
import { applyProportions, clampBody } from '../src/engine/proportions.js';
import { Fighter } from '../src/engine/fighter.js';
import { GL3D, PHYS } from '../src/config.js';

const C = GL3D.CLOSE;
const CAST = FIGHTERS.filter((d) => MODELS3D[`sculpt:${d.id}`]);
// two fighters' centres at the closest the push allows (fighter.js pushGap)
const closest = (a, b) => (a.pushHalf ?? PHYS.PUSH_HALF) + (b.pushHalf ?? PHYS.PUSH_HALF);

function stance(def, state, t) {
  const spec = MODELS3D[`sculpt:${def.id}`];
  const f = { def, state, stateT: t, walkPhase: state === 'walk' ? t * 2 * Math.PI : 0, side: 0, vy: 0, airborne: false,
    crouching: state === 'crouch', movingBack: false, attack: null, facing: 1, x: 0, y: 0, hitbox: Fighter.prototype.hitbox };
  return applyProportions(computePose(f, t, FORMS[spec.form]), clampBody(def.body));
}

test('at the closest, every fighter keeps hands and feet behind the midpoint, in every stance', () => {
  let crossed = 0;
  for (const def of CAST) {
    for (const foe of CAST) {
      const close = closest(def, foe);
      for (const state of C.STATES) {
        for (const t of [0, 0.3, 0.6]) {
          const P = stance(def, state, t), room = close / 2;
          if (P.armF.x > room - C.HAND) crossed++;
          const Q = closeGuard(P, close);
          for (const k of ['armF', 'armB']) {
            assert.ok(Q[k].x <= room - C.HAND + 1e-9, `${def.id} against ${foe.id}, ${state}: ${k} at ${Q[k].x.toFixed(1)}, the midpoint ${room}`);
            assert.ok(Q[k].y <= P[k].y + 1e-9, `${def.id}, ${state}: ${k} dropped as it came back`);
          }
          for (const k of ['legF', 'legB']) assert.ok(Q[k].x <= room - C.FOOT + 1e-9, `${def.id} against ${foe.id}, ${state}: ${k} at ${Q[k].x.toFixed(1)}`);
        }
      }
    }
  }
  // without the tuck, lead fists crossed the midpoint all over the cast
  assert.ok(crossed > CAST.length * CAST.length, `only ${crossed} guards crossed the midpoint untucked`);
});

test('far apart nothing moves, and closing in it gives smoothly', () => {
  for (const def of CAST) {
    const P = stance(def, 'idle', 0);
    const far = closeGuard(P, 400);
    for (const k of ['armF', 'armB', 'legF', 'legB']) assert.deepEqual(far[k], P[k], `${def.id}'s ${k} moved at 400 px`);
    let last = closeGuard(P, 300).armF.x;
    for (let gap = 299; gap >= 40; gap--) {
      const x = closeGuard(P, gap).armF.x;
      assert.ok(x <= last + 1e-9, `${def.id}: closing to ${gap}, the guard came forward`);
      assert.ok(last - x < 1, `${def.id}: closing to ${gap}, the guard jumped ${(last - x).toFixed(2)} px`);
      last = x;
    }
  }
  assert.equal(give(10, 50, 14), 10);
  assert.ok(give(1000, 50, 14) <= 50 && give(1000, 50, 14) > 49.9, "a guard far over the limit is not held at it");
  assert.ok(give(45, 50, 14) < 45 && give(45, 50, 14) > 36, "a guard near the limit does not give");
  // and the pose given is not changed
  const P = stance(CAST[0], 'idle', 0), before = JSON.stringify(P);
  closeGuard(P, 40);
  assert.equal(JSON.stringify(P), before);
});

test('the tuck eases in and out with the stance, so an attack does not jump out of it', () => {
  const f = { state: 'idle' };
  assert.equal(tuckOf(f, 0), 1, 'a fighter first drawn in a stance is not tucked');
  f.state = 'attack';
  const a = tuckOf(f, 1 / 60);
  assert.ok(a > 0 && a < 1, `one frame into an attack the tuck is ${a}`);
  let w = a;
  for (let i = 2; i < 30; i++) w = tuckOf(f, i / 60);
  assert.ok(w < 0.01, `half a second into an attack the tuck is still ${w}`);
  f.state = 'block';
  let b = 0;
  for (let i = 30; i < 60; i++) b = tuckOf(f, i / 60);
  assert.ok(b > 0.99, 'blocking, the tuck did not come back');
});

test('the 3D fighters take the tuck from their foe, and the 2D fighters do not', () => {
  const src = readFileSync(new URL('../src/engine/drawFighter.js', import.meta.url), 'utf8');
  const in3D = src.slice(src.indexOf('if (has3D(def)) {'), src.indexOf('// Baked sprite path.'));
  assert.match(in3D, /const tuck = foe \? tuckOf\(f, t\) : 0;\s*if \(tuck > 0\) P = closeGuard\(P, Math\.abs\(foe\.x - f\.x\), tuck\);/);
  assert.equal((src.match(/closeGuard\(/g) || []).length, 1, 'the tuck is used outside the 3D path');
  const render = readFileSync(new URL('../src/engine/render.js', import.meta.url), 'utf8');
  assert.equal((render.match(/drawFighter\([a-z]+, f, t, game\.other\(f\)\)/g) || []).length, 4, 'a fighter is drawn without its foe');
});
