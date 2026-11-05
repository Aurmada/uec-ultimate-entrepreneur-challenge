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
  assert.ok(FORMS[MODELS3D['sculpt:bozo'].form], 'sculpt:bozo names a form that exists');
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

const spec = MODELS3D['sculpt:bozo'];
const glb = readFileSync(new URL(`../${spec.url}`, import.meta.url));
const model = extractModel(parseGLB(glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength)));
const rig = buildRig(model, spec);
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

test('a sculpt built with long legs (fit.legs) is not stretched again by the stride', () => {
  // the rig scales a model's legs by the fighter's stride; a sculpt built to
  // that stride already says how many times Jeff's its legs are, and only the
  // rest is scaled, so its knees bend as Jeff's do
  const thigh = (legs) => {
    const r = buildRig(model, { ...spec, fit: { ...spec.fit, legs } });
    const m = solvePose(r, posed('idle'));
    const a = transformPoint(m, r.names.indexOf('thigh.L'), r.rest['thigh.L'].head);
    const b = transformPoint(m, r.names.indexOf('thigh.L'), r.rest['thigh.L'].tail);
    return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  };
  assert.ok(Math.abs(thigh(0.8) / thigh(1) - 1.25) < 1e-6, `${(thigh(0.8) / thigh(1)).toFixed(4)}`);
  assert.equal(spec.fit.legs ?? 1, 1, "Jeff's legs are the reference");
});

// Brawling (data/forms.js), for the sculpted Adam: his own 2D guard, and a
// haymaker that is all wind-up and follow-through.
const adam = getFighter('max');
const BRAWLING = FORMS.brawling;
const adamPosed = (state, extra = {}, t = 0) => figureFrame(applyProportions(computePose(
  { def: adam, state, stateT: 0, walkPhase: 0, side: 0, vy: 0, airborne: false, movingBack: false, ...extra }, t, BRAWLING), clampBody(adam.body)));
const haymakerAt = (k) => {
  const { startup: s, active: a, recovery: r } = PUNCH;
  return adamPosed('attack', { attack: PUNCH, stateT: k < 1 ? k * s : k < 2 ? s + (k - 1) * a : s + a + (k - 2) * r });
};

test('the sculpted Adam brawls, from the guard his 2D figure stands in', () => {
  assert.equal(MODELS3D['sculpt:max'].form, 'brawling');
  const own = applyProportions(computePose({ def: adam, state: 'idle', stateT: 0, walkPhase: 0, side: 0, vy: 0, airborne: false, movingBack: false }, 0), clampBody(adam.body));
  const brawl = applyProportions(computePose({ def: adam, state: 'idle', stateT: 0, walkPhase: 0, side: 0, vy: 0, airborne: false, movingBack: false }, 0, BRAWLING), clampBody(adam.body));
  for (const k of ['armF', 'armB']) assert.deepEqual(brawl[k], own[k], `his ${k} is not where his 2D guard holds it`);
  // fists low and wide: below the shoulders, wider than the shared rig holds them
  assert.ok(brawl.armF.y > brawl.shoulderY + 10, 'his lead fist is up at his face, not down at his belly');
  assert.ok(BRAWLING.handDepth.F > 1 && BRAWLING.handDepth.B > 1, 'his fists are not out wider than his shoulders');
  // rolling his weight: the shoulders turn back and forth at rest
  const turns = [0, 0.5, 1, 1.5, 2].map((t) => adamPosed('idle', {}, t).twist);
  assert.ok(Math.max(...turns) - Math.min(...turns) > 0.08, 'he stands square and still');
});

test('the haymaker coils deeper than any punch, swings through and keeps going', () => {
  const tw = (k) => haymakerAt(k).twist;
  assert.ok(tw(0.95) < -0.4, `not much of a coil (twist ${tw(0.95)})`);
  assert.ok(tw(0.95) < FORMS.boxing.tracks.punch.keys.reduce((m, key) => Math.min(m, key.joints.twist ?? 0), 0), 'a boxer loads deeper than a brawler');
  assert.ok(haymakerAt(0.95).armF.x < haymakerAt(0).armF.x - 30, 'the fist is not drawn back: no telegraph');
  assert.ok(tw(1.15) > 0.4, 'the swing does not turn through');
  assert.ok(tw(2) > tw(1.15), 'the body does not keep turning after the hit');
  assert.ok(Math.abs(tw(3)) < 1e-6, 'he does not come back to his guard');
  for (const [name, track] of Object.entries(BRAWLING.tracks)) assert.deepEqual(validateTrack(name, track, { attack: true }), []);
});

// Carl (`dex`), the third: a grappler. His lead hand is open, reaching, and his
// punch is a seizure that closes it on contact (P.hand, the lead hand's shape
// a sculpt shows: `hand:open` or `hand:fist`).
const carl = getFighter('dex');
const GRAPPLING = FORMS.grappling;
const carlAt = (state, extra = {}, t = 0) => computePose(
  { def: carl, state, stateT: 0, walkPhase: 0, side: 0, vy: 0, airborne: false, movingBack: false, ...extra }, t, GRAPPLING);
const seizeAt = (k) => {
  const { startup: s, active: a, recovery: r } = PUNCH;
  return carlAt('attack', { attack: PUNCH, stateT: k < 1 ? k * s : k < 2 ? s + (k - 1) * a : s + a + (k - 2) * r });
};

test('the sculpted Carl grapples from the guard his 2D figure stands in, the lead hand open', () => {
  assert.equal(MODELS3D['sculpt:dex'].form, 'grappling');
  const own = applyProportions(computePose({ def: carl, state: 'idle', stateT: 0, walkPhase: 0, side: 0, vy: 0, airborne: false, movingBack: false }, 0), clampBody(carl.body));
  const grab = applyProportions(carlAt('idle'), clampBody(carl.body));
  for (const k of ['armF', 'armB']) assert.deepEqual(grab[k], own[k], `his ${k} is not where his 2D guard holds it`);
  for (const [state, extra] of [['idle', {}], ['walk', { walkPhase: 2.1 }], ['crouch', { crouching: true }]]) {
    assert.equal(carlAt(state, extra).hand, 'open', `${state}: his lead hand is not open`);
  }
  assert.equal(carlAt('block').hand, undefined, 'blocking, his lead hand holds the briefcase: a fist');
  // a pose drawn without a form has no hand to show
  assert.equal(computePose(fighter('idle'), 0).hand, undefined);
});

test('a slap opens the lead hand in every form, as the 2D figure draws it; a punch keeps the fist', () => {
  const SLAP = { kind: 'slap', button: 'slap', startup: 4, active: 3, recovery: 6, reach: 78 };
  for (const [name, form] of Object.entries(FORMS)) {
    assert.equal(computePose(fighter('attack', { attack: SLAP, stateT: 5 }), 0, form).hand, 'open', `${name}: a slap with a fist`);
  }
  assert.equal(computePose(fighter('attack', { attack: PUNCH, stateT: 6 }), 0, BOXING).hand, undefined, 'a boxer punches open-handed');
});

test('the seizure reaches out open, closes on contact and hauls it back in', () => {
  for (const k of [0, 0.95, 1.15]) assert.equal(seizeAt(k).hand, 'open', `at ${k} the hand is not open`);
  for (const k of [1.6, 2, 2.45]) assert.equal(seizeAt(k).hand, 'fist', `at ${k} the hand has let go`);
  assert.equal(seizeAt(3).hand, 'open', 'he does not let go after');
  assert.ok(seizeAt(1.15).armF.x > seizeAt(0).armF.x + 25, 'the hand does not reach out');
  assert.ok(seizeAt(2.45).armF.x < seizeAt(1.6).armF.x - 30, 'he does not haul it back in');
  assert.ok(seizeAt(1.15).twist > 0 && seizeAt(2.45).twist < 0, 'the body does not lunge in and turn away with the pull');
  for (const [name, track] of Object.entries(GRAPPLING.tracks)) assert.deepEqual(validateTrack(name, track, { attack: true }), []);
  assert.deepEqual(validateTrack('bad', { keys: [{ t: 0, hand: 'claw', joints: {} }] }), ['bad[0]: unknown hand claw']);
});

// Steve (`kai`), the fourth: a showman. His lead hand is open, presenting, and
// his punch is a big finish: a flourish up and back, the hand closing at the
// top of it, the punch down at the chest, and the finish held a beat too long.
const steve = getFighter('kai');
const SHOWBOATING = FORMS.showboating;
const steveAt = (state, extra = {}, t = 0) => computePose(
  { def: steve, state, stateT: 0, walkPhase: 0, side: 0, vy: 0, airborne: false, movingBack: false, ...extra }, t, SHOWBOATING);
const finishAt = (k) => {
  const { startup: s, active: a, recovery: r } = PUNCH;
  return steveAt('attack', { attack: PUNCH, stateT: k < 1 ? k * s : k < 2 ? s + (k - 1) * a : s + a + (k - 2) * r });
};

test('the sculpted Steve showboats from the guard his 2D figure stands in, the lead hand open and high', () => {
  assert.equal(MODELS3D['sculpt:kai'].form, 'showboating');
  const own = applyProportions(computePose({ def: steve, state: 'idle', stateT: 0, walkPhase: 0, side: 0, vy: 0, airborne: false, movingBack: false }, 0), clampBody(steve.body));
  const show = applyProportions(steveAt('idle'), clampBody(steve.body));
  for (const k of ['armF', 'armB']) assert.deepEqual(show[k], own[k], `his ${k} is not where his 2D guard holds it`);
  assert.ok(show.armF.y < show.shoulderY, 'the presenting hand is not up and high');
  for (const [state, extra] of [['idle', {}], ['walk', { walkPhase: 2.1 }]]) assert.equal(steveAt(state, extra).hand, 'open', `${state}: not presenting`);
  assert.equal(steveAt('block').hand, undefined, 'blocking, his lead hand holds the briefcase: a fist');
});

test('the big finish flourishes up and back, closes at the top and holds the finish a beat too long', () => {
  const guard = finishAt(0);
  assert.equal(finishAt(0.5).hand, 'open', 'the flourish is not open-handed');
  assert.ok(finishAt(0.5).armF.y < guard.armF.y - 15 && finishAt(0.95).twist < -0.3, 'no flourish: the hand up and back, the body turned away');
  for (const k of [0.95, 1.15, 2, 2.5]) assert.equal(finishAt(k).hand, 'fist', `at ${k} the hand is open`);
  assert.equal(finishAt(3).hand, 'open', 'he does not go back to presenting');
  // a boxer is back at his guard by now; the showman is still holding it out
  assert.ok(finishAt(2.5).armF.x > guard.armF.x + 25, 'he does not hold the finish');
  assert.ok(posed('attack', { attack: PUNCH, stateT: PUNCH.startup + PUNCH.active + 0.5 * PUNCH.recovery }).armF.x < finishAt(2.5).armF.x - 20, 'the boxer holds his as long');
  for (const [name, track] of Object.entries(SHOWBOATING.tracks)) assert.deepEqual(validateTrack(name, track, { attack: true }), []);
});

// Elo (`elo`), the fifth: a shoulder roll, the lead arm low across the belly
// and the rear fist at the chin, and the glass cannon's whip: a huge wind-up,
// held out only while it can hit, then snapped straight back.
const eloDef = getFighter('elo');
const ROLL = FORMS.shoulderRoll;
const eloAt = (state, extra = {}, t = 0) => computePose(
  { def: eloDef, state, stateT: 0, walkPhase: 0, side: 0, vy: 0, airborne: false, movingBack: false, ...extra }, t, ROLL);
const whipAt = (k) => {
  const { startup: s, active: a, recovery: r } = PUNCH;
  return eloAt('attack', { attack: PUNCH, stateT: k < 1 ? k * s : k < 2 ? s + (k - 1) * a : s + a + (k - 2) * r });
};

test('the sculpted Elo stands in a shoulder roll, the guard his 2D figure stands in', () => {
  assert.equal(MODELS3D['sculpt:elo'].form, 'shoulderRoll');
  const own = applyProportions(computePose({ def: eloDef, state: 'idle', stateT: 0, walkPhase: 0, side: 0, vy: 0, airborne: false, movingBack: false }, 0), clampBody(eloDef.body));
  const roll = applyProportions(eloAt('idle'), clampBody(eloDef.body));
  for (const k of ['armF', 'armB']) assert.deepEqual(roll[k], own[k], `his ${k} is not where his 2D guard holds it`);
  assert.ok(roll.armF.y > roll.armB.y + 30, 'the lead arm is not dropped low, the rear fist up at the chin');
  assert.ok(eloAt('block').twist < -0.2, 'he does not roll the shot off his shoulder');
});

test('the whip winds up hugely, holds only while it can hit, and snaps straight back', () => {
  const guard = whipAt(0);
  assert.ok(whipAt(0.95).twist < -0.5, `not much of a wind-up (twist ${whipAt(0.95).twist})`);
  assert.ok(whipAt(0.95).armF.x < guard.armF.x - 30, 'the fist is not drawn back');
  assert.ok(whipAt(1.6).armF.x > guard.armF.x + 50, 'the fist is not out while it can hit');
  // back home by 2.3, where a boxer's straight is still on its way back
  assert.ok(Math.abs(whipAt(2.3).armF.x - guard.armF.x) < 10, 'the whip is not snapped back');
  assert.ok(punchAt(2.3).armF.x > posed('idle').armF.x + 10, 'the boxer is home as fast');
  for (const [name, track] of Object.entries(ROLL.tracks)) assert.deepEqual(validateTrack(name, track, { attack: true }), []);
});

// Scam (`scam`), the sixth: the fence, one hand in his pocket and the other
// open in front of his chest, and the slip: barely any wind-up, the hand
// closing only as it lands, lingering out after.
const scamDef = getFighter('scam');
const FENCE = FORMS.fence;
const scamAt = (state, extra = {}, t = 0) => computePose(
  { def: scamDef, state, stateT: 0, walkPhase: 0, side: 0, vy: 0, airborne: false, movingBack: false, ...extra }, t, FENCE);
const slipAt = (k) => {
  const { startup: s, active: a, recovery: r } = PUNCH;
  return scamAt('attack', { attack: PUNCH, stateT: k < 1 ? k * s : k < 2 ? s + (k - 1) * a : s + a + (k - 2) * r });
};

test('the sculpted Scam fences from the guard his 2D figure stands in, the hand open, the other pocketed', () => {
  assert.equal(MODELS3D['sculpt:scam'].form, 'fence');
  const own = applyProportions(computePose({ def: scamDef, state: 'idle', stateT: 0, walkPhase: 0, side: 0, vy: 0, airborne: false, movingBack: false }, 0), clampBody(scamDef.body));
  const fence = applyProportions(scamAt('idle'), clampBody(scamDef.body));
  for (const k of ['armF', 'armB']) assert.deepEqual(fence[k], own[k], `his ${k} is not where his 2D guard holds it`);
  assert.ok(fence.armB.x < 0, 'the pocket hand is out in front');
  for (const [state, extra] of [['idle', {}], ['walk', { walkPhase: 2.1 }]]) assert.equal(scamAt(state, extra).hand, 'open', `${state}: the fence hand is closed`);
  assert.equal(scamAt('block').hand, undefined, 'blocking, his fence hand holds the briefcase: a fist');
});

test('the slip barely winds up, closes only as it lands and lingers out after', () => {
  const guard = slipAt(0);
  assert.ok(Math.abs(slipAt(0.95).armF.x - guard.armF.x) < 10 && slipAt(0.95).twist > -0.1, 'it telegraphs');
  assert.equal(slipAt(0.95).hand, 'open', 'the hand closes before it lands');
  assert.equal(slipAt(1.6).hand, 'fist');
  assert.ok(slipAt(2.6).armF.x > guard.armF.x + 25, 'it does not linger');
  assert.equal(slipAt(3).hand, 'open', 'he does not open the hand again');
  // the pocket hand stays at his side; it only goes with the body as he leans
  // into the hit (the rear hand follows the head, see trackedAttackPose)
  for (const k of [0, 1.15, 2.6]) {
    const B = slipAt(k).armB;
    assert.ok(B.y === guard.armB.y && Math.abs(B.x - guard.armB.x) < 8, `at ${k} the pocket hand comes out (${B.x}, ${B.y})`);
  }
  for (const [name, track] of Object.entries(FENCE.tracks)) assert.deepEqual(validateTrack(name, track, { attack: true }), []);
});

// Lizbeth (`ava`), the seventh: fencing, the stillest guard in the game, side
// on with the lead hand loose and open; the thrust goes straight out along
// its own line, fingers first, and the hand never closes.
const avaDef = getFighter('ava');
const FENCING = FORMS.fencing;
const avaAt = (state, extra = {}, t = 0) => computePose(
  { def: avaDef, state, stateT: 0, walkPhase: 0, side: 0, vy: 0, airborne: false, movingBack: false, ...extra }, t, FENCING);
const thrustAt = (k) => {
  const { startup: s, active: a, recovery: r } = PUNCH;
  return avaAt('attack', { attack: PUNCH, stateT: k < 1 ? k * s : k < 2 ? s + (k - 1) * a : s + a + (k - 2) * r });
};

test('the sculpted Lizbeth fences from the guard her 2D figure stands in, the lead hand open', () => {
  assert.equal(MODELS3D['sculpt:ava'].form, 'fencing');
  const own = applyProportions(computePose({ def: avaDef, state: 'idle', stateT: 0, walkPhase: 0, side: 0, vy: 0, airborne: false, movingBack: false }, 0), clampBody(avaDef.body));
  const guard = applyProportions(avaAt('idle'), clampBody(avaDef.body));
  for (const k of ['armF', 'armB']) assert.deepEqual(guard[k], own[k], `her ${k} is not where her 2D guard holds it`);
  assert.equal(avaAt('idle').hand, 'open');
  assert.ok(FENCING.handDepth.F < 0.7 && FENCING.handDepth.B < 0.7, 'her hands are not in on her centre line');
});

test('the thrust goes straight out along its line, the foot after it, and the hand never closes', () => {
  const guard = thrustAt(0);
  for (const k of [0, 0.95, 1.15, 1.6, 2.45, 3]) assert.equal(thrustAt(k).hand, 'open', `at ${k} the hand closes`);
  assert.ok(Math.abs(thrustAt(0.95).armF.x - guard.armF.x) < 8, 'she draws back: it admits effort');
  assert.ok(thrustAt(1.6).armF.x > guard.armF.x + 40 && Math.abs(thrustAt(1.6).armF.y - guard.armF.y) < 6, 'not straight out along its line');
  assert.ok(thrustAt(1.6).legF.x > guard.legF.x + 8, 'the lead foot does not step after it');
  assert.ok(Math.abs(thrustAt(1.6).hipTwist) < 1e-9, 'there is weight in her hips');
  for (const [name, track] of Object.entries(FENCING.tracks)) assert.deepEqual(validateTrack(name, track, { attack: true }), []);
});

// Kim (`zara`), the eighth: the peek-a-boo, the most compact guard in the
// game, both fists high and tight in front of the jaw; the snap bobs under
// the line, comes up with the jab already out and has it home before anyone
// else's is.
const zaraDef = getFighter('zara');
const PEEKABOO = FORMS.peekaboo;
const zaraAt = (state, extra = {}, t = 0) => computePose(
  { def: zaraDef, state, stateT: 0, walkPhase: 0, side: 0, vy: 0, airborne: false, movingBack: false, ...extra }, t, PEEKABOO);
const snapAt = (k) => {
  const { startup: s, active: a, recovery: r } = PUNCH;
  return zaraAt('attack', { attack: PUNCH, stateT: k < 1 ? k * s : k < 2 ? s + (k - 1) * a : s + a + (k - 2) * r });
};

test('the sculpted Kim stands in a peek-a-boo, the guard her 2D figure stands in, the fists at her jaw', () => {
  assert.equal(MODELS3D['sculpt:zara'].form, 'peekaboo');
  const own = applyProportions(computePose({ def: zaraDef, state: 'idle', stateT: 0, walkPhase: 0, side: 0, vy: 0, airborne: false, movingBack: false }, 0), clampBody(zaraDef.body));
  const guard = applyProportions(zaraAt('idle'), clampBody(zaraDef.body));
  for (const k of ['armF', 'armB']) assert.deepEqual(guard[k], own[k], `her ${k} is not where her 2D guard holds it`);
  const P = zaraAt('idle');
  for (const k of ['armF', 'armB']) {
    assert.ok(P[k].y < P.shoulderY && P[k].y > P.headY, `her ${k} is not up in front of the jaw, below the face (${P[k].y} between ${P.headY} and ${P.shoulderY})`);
  }
  assert.ok(PEEKABOO.handDepth.F < 0.5 && PEEKABOO.handDepth.B < 0.6, 'her fists are not tight in on her centre line');
  assert.equal(P.hand, undefined, 'she fights with her fists closed');
});

test('the snap bobs under the line, the fists at the jaw, then jabs and is home first', () => {
  const guard = snapAt(0);
  const bob = snapAt(0.95);
  assert.ok(bob.headY > guard.headY + 6 && bob.hipY > guard.hipY + 4, 'she does not bob under the line');
  assert.ok(bob.armF.x > guard.armF.x - 6, 'the fist is drawn back: there is no wind-up in a snap');
  assert.ok(snapAt(1.6).armF.x > guard.armF.x + 40, 'the jab is not out while it can hit');
  // home by 2.25, before the whip, the fastest reset after hers, is
  assert.ok(Math.abs(snapAt(2.25).armF.x - guard.armF.x) < 6, 'the jab is not snapped back');
  assert.ok(snapAt(2.25).headX < guard.headX, 'her head does not slip off the line as it comes home');
  assert.ok(Math.abs(snapAt(2.25).armB.x - guard.armB.x) < 8 && snapAt(2.25).armB.y === guard.armB.y, 'the rear fist leaves her jaw');
  for (const [name, track] of Object.entries(PEEKABOO.tracks)) assert.deepEqual(validateTrack(name, track, { attack: true }), []);
});
