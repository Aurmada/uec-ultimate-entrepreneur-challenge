// Fighting forms (data/forms.js): boxing first, for the sculpted Jeff
// (November 2026). The owner: boxers guard their face, so the hands are
// higher, and a punch is thrown by turning the upper body into it.
//
// Like the guard tests, these pin what the poses mean rather than their
// numbers, so the form can keep being tuned by eye. All of it is render-only.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { computePose } from '../src/engine/drawFighter.js';
import { applyProportions, clampBody } from '../src/engine/proportions.js';
import { figureFrame } from '../src/engine/figure.js';
import { validateTrack } from '../src/engine/anim.js';
import { FORMS } from '../src/data/forms.js';
import { FIGHTERS, BASE_CHARACTERS, getFighter } from '../src/data/fighters.js';
import { MODELS3D } from '../src/data/models3d.js';
import { parseGLB, extractModel } from '../src/engine/gl3d/glb.js';
import { buildRig, solvePose, transformPoint } from '../src/engine/gl3d/rig.js';

const BOXING = FORMS.boxing;
const jeff = getFighter('bozo');
const PUNCH = { kind: 'punch', startup: 6, active: 4, recovery: 10, reach: 84 };
const fighter = (state, extra = {}) => ({
  def: jeff, state, stateT: 0, walkPhase: 0, side: 0, vy: 0, airborne: false, movingBack: false, ...extra,
});
// As the game hands a pose to the sculpted model: proportioned, then stood on
// the new bodies' frame (drawFighter, athlete3D).
const posed = (state, extra, form = BOXING, t = 0) =>
  figureFrame(applyProportions(computePose(fighter(state, extra), t, form), clampBody(jeff.body)));
// at a point in the punch's phase space (anim.js): 0 to 1 the startup, 1 to 2
// the active window, 2 to 3 the recovery
const punchAt = (k) => {
  const { startup: s, active: a, recovery: r } = PUNCH;
  const stateT = k < 1 ? k * s : k < 2 ? s + (k - 1) * a : s + a + (k - 2) * r;
  return posed('attack', { attack: PUNCH, stateT });
};

test('the sculpted Jeff boxes, and no 2D fighter carries a form', () => {
  assert.ok(FORMS[MODELS3D['jeff-sculpt'].form], 'jeff-sculpt names a form that exists');
  for (const def of [...FIGHTERS, ...BASE_CHARACTERS]) {
    assert.equal(def.form, undefined, `${def.id} carries a form: it would reach the 2D game`);
  }
  // and without one a pose has no turn for the 2D figure to ignore
  const P = computePose(fighter('attack', { attack: PUNCH, stateT: 6 }), 0);
  assert.equal(P.twist, 0);
  assert.equal(P.handDepth, undefined);
});

test('a boxer guards his face: both fists up by the chin, not one at the hip', () => {
  for (const [state, extra] of [['idle', {}], ['walk', { walkPhase: 2.1 }], ['block', {}], ['crouch', { crouching: true }]]) {
    const P = posed(state, extra);
    for (const k of ['armF', 'armB']) {
      assert.ok(P[k].y < P.shoulderY - 12, `${state}: the ${k} fist is at ${P[k].y.toFixed(0)}, not up by the face (shoulders ${P.shoulderY.toFixed(0)})`);
      assert.ok(P[k].x > 10, `${state}: the ${k} fist is behind the body`);
    }
    assert.ok(P.armF.x > P.armB.x, `${state}: the lead fist is not out in front of the rear one`);
  }
  // his own 2D stance, a karate chamber, keeps the rear fist at the hip
  const own = applyProportions(computePose(fighter('idle'), 0), clampBody(jeff.body));
  assert.ok(own.armB.y > own.shoulderY, 'the 2D Jeff still chambers the rear fist');
});

test('the boxing punch is thrown from the guard and comes back to it, the rear fist home throughout', () => {
  const guard = posed('idle');
  const start = punchAt(0), end = punchAt(3);
  for (const P of [start, end]) {
    assert.ok(Math.hypot(P.armF.x - guard.armF.x, P.armF.y - guard.armF.y) < 3, 'the lead fist starts and ends in the guard');
  }
  // no wind-up of the fist: drawing it back telegraphs the punch
  for (let k = 0; k < 1; k += 0.1) {
    assert.ok(punchAt(k).armF.x > guard.armF.x - 8, `the lead fist is drawn back at phase ${k.toFixed(1)}`);
  }
  for (let k = 0; k <= 3; k += 0.25) {
    const P = punchAt(k);
    assert.ok(Math.abs(P.armB.y - guard.armB.y) < 5, `the rear fist leaves the chin at phase ${k}`);
  }
  assert.ok(punchAt(1.2).armF.x > guard.armF.x + 40, 'the punch reaches out');
});

test('the body turns into the punch: away on the load, through on the hit, square again after', () => {
  const tw = (k) => punchAt(k).twist;
  assert.equal(tw(0), 0);
  assert.ok(tw(0.9) < -0.05, `no load before the punch (twist ${tw(0.9)})`);
  assert.ok(tw(1.3) > 0.15, `the shoulders do not turn through the hit (twist ${tw(1.3)})`);
  assert.ok(punchAt(1.3).hipTwist > 0.05, 'the hips do not turn through the hit');
  assert.ok(Math.abs(tw(3)) < 1e-6, 'the body does not come back square');
  for (const [name, track] of Object.entries(BOXING.tracks)) {
    assert.deepEqual(validateTrack(name, track, { attack: true }), []);
  }
});

const spec = MODELS3D['jeff-sculpt'];
const glb = readFileSync(new URL(`../${spec.url}`, import.meta.url));
const rig = buildRig(extractModel(parseGLB(glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength))), spec);
const joint = (m, bone, end = false) => transformPoint(m, rig.names.indexOf(bone), end ? rig.rest[bone].tail : rig.rest[bone].head);

test('in 3D a turn brings the lead shoulder forward, and the rear fist turns with the chest', () => {
  const at = (twist) => {
    const P = { ...posed('idle'), twist };
    const m = solvePose(rig, P);
    const lead = joint(m, 'upper_arm.L'), rear = joint(m, 'upper_arm.R'), fist = joint(m, 'forearm.R', true);
    // the fist across the shoulders, measured along the line between them
    const d = [rear[0] - lead[0], rear[1] - lead[1], rear[2] - lead[2]], n = Math.hypot(...d);
    const mid = lead.map((v, i) => (v + rear[i]) / 2);
    return { lead, across: ((fist[0] - mid[0]) * d[0] + (fist[1] - mid[1]) * d[1] + (fist[2] - mid[2]) * d[2]) / n };
  };
  const square = at(0), turned = at(0.3);
  assert.ok(turned.lead[0] > square.lead[0] + 0.03, 'the lead shoulder does not come forward');
  assert.ok(Math.abs(turned.across - square.across) < 0.01,
    `the rear fist slides ${(turned.across - square.across).toFixed(3)} across the chest as it turns`);
});
