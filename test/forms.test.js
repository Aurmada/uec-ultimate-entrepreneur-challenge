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
import { MODELS3D, FIGHTER_MODELS, DEFAULT_MODEL } from '../src/data/models3d.js';
import { parseGLB, extractModel } from '../src/engine/gl3d/glb.js';
import { buildRig, solvePose, transformPoint } from '../src/engine/gl3d/rig.js';
import { ATTACKS, STYLES } from '../src/config.js';
import { form3D } from '../src/engine/gl3d/index.js';

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

// Cathie (`eleanor`), the ninth: tai chi, the calmest guard in the game,
// upright with the lead palm open and level in front of the chest; the push
// draws the palm in, places it out level with the weight behind it and no
// turn of the hips, and brings it back the way it went.
const eleanorDef = getFighter('eleanor');
const TAICHI = FORMS.taiChi;
const eleanorAt = (state, extra = {}, t = 0) => computePose(
  { def: eleanorDef, state, stateT: 0, walkPhase: 0, side: 0, vy: 0, airborne: false, movingBack: false, ...extra }, t, TAICHI);
const pushAt = (k) => {
  const { startup: s, active: a, recovery: r } = PUNCH;
  return eleanorAt('attack', { attack: PUNCH, stateT: k < 1 ? k * s : k < 2 ? s + (k - 1) * a : s + a + (k - 2) * r });
};

test('the sculpted Cathie stands in tai chi, the guard her 2D figure stands in, the lead palm open', () => {
  assert.equal(MODELS3D['sculpt:eleanor'].form, 'taiChi');
  const own = applyProportions(computePose({ def: eleanorDef, state: 'idle', stateT: 0, walkPhase: 0, side: 0, vy: 0, airborne: false, movingBack: false }, 0), clampBody(eleanorDef.body));
  const guard = applyProportions(eleanorAt('idle'), clampBody(eleanorDef.body));
  for (const k of ['armF', 'armB']) assert.deepEqual(guard[k], own[k], `her ${k} is not where her 2D guard holds it`);
  for (const [state, extra] of [['idle', {}], ['walk', { walkPhase: 2.1 }]]) assert.equal(eleanorAt(state, extra).hand, 'open', `${state}: the palm is closed`);
  assert.equal(eleanorAt('block').hand, undefined, 'blocking, her lead hand holds the briefcase: a fist');
  assert.ok(eleanorAt('idle').armB.y > eleanorAt('idle').armF.y + 15, 'the tablet hand is not low at her waist');
});

test('the push is placed, not thrown: drawn in, out level with the hips still, and back the way it went', () => {
  const guard = pushAt(0);
  for (const k of [0, 0.95, 1.15, 1.6, 2.55, 3]) {
    const P = pushAt(k);
    assert.equal(P.hand, 'open', `at ${k} the palm closes`);
    assert.ok(Math.abs(P.hipTwist) < 1e-9, `at ${k} her hips turn`);
    assert.ok(Math.abs(P.twist) < 0.06, `at ${k} her shoulders turn (${P.twist})`);
  }
  assert.ok(pushAt(0.95).armF.x < guard.armF.x - 8, 'the palm is not drawn in');
  assert.ok(pushAt(1.6).armF.x > guard.armF.x + 35 && Math.abs(pushAt(1.6).armF.y - guard.armF.y) < 4, 'not placed out level');
  assert.ok(pushAt(1.6).bodyLean > guard.bodyLean + 0.05, 'her weight does not move behind it');
  for (const [name, track] of Object.entries(TAICHI.tracks)) assert.deepEqual(validateTrack(name, track, { attack: true }), []);
});

// Every form's punch leaves from the guard the fighter stands in and comes
// back to it, at the reach the game gives it (the punch's, by the fighter's
// style: only Jeff's straight was ever tested at the nominal 84). A wrong
// first or last key, the reach re-scale moving the guard, or the rear hand
// measured from the stock chin instead of the guard's each made the hands,
// the head or the stance jump on the first frame of a punch and back on the
// last. The idle's own motion (a form's roll) is left out: it moves anyway.
test("every sculpt's own moves leave from its idle guard and come back to it, at the game's reach", () => {
  const ids = Object.keys(MODELS3D).filter((k) => k.startsWith('sculpt:') && MODELS3D[k].form).map((k) => k.slice(7));
  assert.ok(ids.length >= 9, `only ${ids.length} sculpts have a form`);
  for (const id of ids) {
    const def = getFighter(id), form = FORMS[MODELS3D[`sculpt:${id}`].form];
    const at = (state, stateT, extra = {}) => computePose({ def, state, stateT, walkPhase: 0, side: 0, vy: 0, airborne: false, movingBack: false, ...extra }, 0, form);
    const guard = at('idle', 0);
    for (const kind of Object.keys(form.tracks)) {
      const atk = { ...ATTACKS[kind], kind, reach: ATTACKS[kind].reach * (STYLES[def.style] || STYLES.balanced).reach };
      for (const [k, stateT] of [[0, 0], [3, atk.startup + atk.active + atk.recovery]]) {
        const P = at('attack', stateT, { attack: atk });
        const what = `${id}'s ${kind} at ${k}`;
        for (const c of ['hipY', 'shoulderY', 'headY', 'headX', 'bodyLean', 'sx', 'sy']) {
          assert.ok(Math.abs((P[c] ?? 0) - (guard[c] ?? 0)) < 1e-6, `${what}: ${c} ${P[c]} against the guard's ${guard[c]}`);
        }
        for (const l of ['armF', 'armB', 'legF', 'legB']) {
          assert.ok(Math.hypot(P[l].x - guard[l].x, P[l].y - guard[l].y) < 1e-6,
            `${what}: ${l} (${P[l].x.toFixed(2)}, ${P[l].y.toFixed(2)}) against the guard's (${guard[l].x.toFixed(2)}, ${guard[l].y.toFixed(2)})`);
        }
        // no shape is the fist
        assert.equal(P.hand || 'fist', guard.hand || 'fist', `${what}: the lead hand is ${P.hand || 'fist'}, in the guard ${guard.hand || 'fist'}`);
      }
    }
  }
});

// Each form kicks its own way, and each of them is a kick: out at the
// middle while it can hit, wherever it started from.
test('every form has a kick of its own, out at the middle while it can hit', () => {
  for (const [name, form] of Object.entries(FORMS)) {
    assert.ok(form.tracks.kick, `${name} kicks the shared kick`);
    assert.deepEqual(validateTrack(`${name}.kick`, form.tracks.kick, { attack: true }), []);
    const id = Object.keys(MODELS3D).find((k) => MODELS3D[k].form === name)?.slice(7);
    const def = getFighter(id);
    const atk = { ...ATTACKS.kick, kind: 'kick' };
    const at = (stateT) => computePose({ def, state: 'attack', stateT, walkPhase: 0, side: 0, vy: 0, airborne: false, movingBack: false, attack: atk }, 0, form);
    const guard = at(0), out = at(atk.startup + atk.active * 0.6);
    assert.ok(out.legF.x > guard.legF.x + 50 && out.legF.y < -55, `${name}'s kick is not out at the middle (${out.legF.x}, ${out.legF.y})`);
  }
});

// What keeps a form out of the 2D game is the model it belongs to (gl3d
// form3D): a fighter takes one only while drawn in 3D, in a sculpt that names
// it. The default model and the other bodies name none, nobody wears a sculpt
// by default, and with nothing drawn in 3D no fighter has a form at all.
test('a form reaches a fighter only through a sculpt drawn in 3D', () => {
  for (const [id, spec] of Object.entries(MODELS3D)) {
    if (spec.form) assert.ok(id.startsWith('sculpt:') && FORMS[spec.form], `${id} names a form`);
  }
  assert.equal(MODELS3D[DEFAULT_MODEL].form, undefined);
  assert.deepEqual(Object.keys(FIGHTER_MODELS), [], 'a fighter wears a sculpt by default');
  for (const def of [...FIGHTERS, ...BASE_CHARACTERS]) assert.equal(form3D(def), null, `${def.id} has a form with nothing drawn in 3D`);
});

// And a slap and an uppercut of its own: the slap with the hand open,
// out at the face while it can hit; the launcher's fist (or palm) up past
// the head. Each from its own guard and back (above).
test('every form has its own slap, open at the face, and its own uppercut, up past the head', () => {
  for (const [name, form] of Object.entries(FORMS)) {
    const id = Object.keys(MODELS3D).find((k) => MODELS3D[k].form === name)?.slice(7);
    const def = getFighter(id);
    for (const kind of ['slap', 'launch']) {
      assert.ok(form.tracks[kind], `${name} throws the shared ${kind}`);
      assert.deepEqual(validateTrack(`${name}.${kind}`, form.tracks[kind], { attack: true }), []);
    }
    // at a share k of the move's active window, or its first frame
    const at = (kind, k) => {
      const atk = { ...ATTACKS[kind], kind };
      return computePose({ def, state: 'attack', stateT: Math.max(0, atk.startup + atk.active * k), walkPhase: 0, side: 0, vy: 0, airborne: false, movingBack: false, attack: atk }, 0, form);
    };
    const guard = at('slap', -Infinity);
    const slap = at('slap', 0.6), upper = at('launch', 0.6);
    assert.equal(slap.hand, 'open', `${name}'s slap is a ${slap.hand || 'fist'}`);
    assert.ok(slap.armF.x > guard.armF.x + 25 && slap.armF.y < -140, `${name}'s slap is not out at the face (${slap.armF.x}, ${slap.armF.y})`);
    assert.ok(upper.armF.y < upper.headY - 10, `${name}'s uppercut is not up past the head (${upper.armF.y} against ${upper.headY})`);
  }
});

// How each form takes a hit, goes down and celebrates (`hit`, `ko`,
// `victory`). The timing is the shared one; the form says where the arms
// go, how far a hit throws the body, and its own celebration, a loop that
// ends where it began.
test('every form takes a hit, goes down and celebrates its own way', () => {
  for (const [name, form] of Object.entries(FORMS)) {
    assert.ok(form.hit && form.ko && form.victory, `${name} reacts the shared way`);
    assert.ok(form.hit.lean > 0.3 && form.hit.lean < 1.6, `${name}'s hit throws it ${form.hit.lean} times as far`);
    const V = form.victory;
    assert.deepEqual(validateTrack(`${name}.victory`, V), []);
    const keys = V.keys;
    assert.equal(keys[0].t, 0);
    assert.equal(keys[keys.length - 1].t, 1);
    assert.deepEqual(keys[keys.length - 1].joints, keys[0].joints, `${name}'s celebration does not loop`);
    const id = Object.keys(MODELS3D).find((k) => MODELS3D[k].form === name)?.slice(7);
    const def = getFighter(id);
    const at = (state, stateT, t = 0) => computePose({ def, state, stateT, walkPhase: 0, side: 0, vy: 0, airborne: false, movingBack: false }, t, form);
    // the arms where the form puts them, over the shared timing, taken from
    // the form's own guard: its height and feet, knocked back from its lean
    // (it took hits from the stock standing pose, so a low stance stood up)
    const hit = at('hitstun', 0.05), guard = at('idle', 0);
    const dy = guard.hipY - computePose({ def, state: 'hitstun', stateT: 0.05, walkPhase: 0, side: 0, vy: 0, airborne: false, movingBack: false }, 0).hipY;
    assert.deepEqual(hit.armF, { x: form.hit.armF.x, y: form.hit.armF.y + dy });
    assert.equal(hit.hipY, guard.hipY, `${name} stands up to take a hit`);
    assert.deepEqual([hit.legF, hit.legB], [guard.legF, guard.legB], `${name} takes a hit on the stock feet`);
    assert.ok(hit.bodyLean < guard.bodyLean - 0.05, `${name} is not knocked back`);
    // and every form, the stoic ones too, snaps on the impact itself (they
    // were scaled down throughout, and a hit hardly moved Lizbeth or Cathie)
    const impact = at('hitstun', 0.01);
    assert.ok(impact.bodyLean <= guard.bodyLean - 0.18 && impact.headX <= guard.headX - 5, `${name} hardly moves when hit (${(impact.bodyLean - guard.bodyLean).toFixed(2)}, ${(impact.headX - guard.headX).toFixed(1)} px)`);
    for (const st of [0.02, 0.1, 0.3]) assert.ok(at('hitstun', st).headY > guard.headY - 6, `${name}'s head goes up when hit`);
    assert.deepEqual(at('ko', 0.3).armF, form.ko.armF);
    assert.ok(at('ko', 1).rot < -1.2, `${name} does not go down`);
    // and the celebration moves
    const v0 = at('victory', 0, 0), v1 = at('victory', 0, 0.5 / V.rate);
    assert.notDeepEqual([v0.armF, v0.armB, v0.headY], [v1.armF, v1.armB, v1.headY], `${name}'s celebration stands still`);
  }
});

// Kim's nails are held out in front of her chest, not her face (above).
test("Kim's celebration keeps her face clear", () => {
  const def = getFighter('zara');
  for (const t of [0, 0.5, 1, 1.5]) {
    const P = computePose({ def, state: 'victory', stateT: 0, walkPhase: 0, side: 0, vy: 0, airborne: false, movingBack: false }, t, FORMS.peekaboo);
    assert.ok(P.armF.y > P.headY + 15, `at ${t} her hand is at her face (${P.armF.y} against ${P.headY})`);
  }
});

// Each form walks its own way, and in its own stance: the shared walk stood
// every fighter up to the stock rest height at the shared lean the moment
// they moved (Carl's hunch and Kim's crouch gone until they stopped). The
// feet stay apart and never cross, and the lifted foot is always the one
// travelling, backing off too (the shared walk lifted the planted one).
test('every form walks its own way, in its own stance, the feet apart and the lifted one travelling', () => {
  for (const [name, form] of Object.entries(FORMS)) {
    const W = form.walk;
    assert.ok(W && W.cycle > 0 && (W.slip ?? 0) >= 0 && (W.slip ?? 0) <= 0.4 && (W.lift ?? 0) >= 0, `${name} walks the shared walk`);
    const id = Object.keys(MODELS3D).find((k) => MODELS3D[k].form === name)?.slice(7);
    const def = getFighter(id);
    const pose = (state, extra = {}) => computePose({ def, state, stateT: 0, walkPhase: 0, side: 0, vy: 0, airborne: false, movingBack: false, ...extra }, 0, form);
    const guard = pose('idle');
    const most = (W.low ?? 0) + (W.bob ?? 0) + 1e-6;
    for (const movingBack of [false, true]) {
      const lean = movingBack ? (W.back ?? guard.bodyLean) : (W.lean ?? guard.bodyLean);
      for (let i = 0; i < 48; i++) {
        const walkPhase = i * Math.PI / 12;
        const P = pose('walk', { walkPhase, movingBack });
        const what = `${name} at ${walkPhase.toFixed(2)}${movingBack ? ' backing off' : ''}`;
        for (const c of ['hipY', 'shoulderY', 'headY']) {
          const d = P[c] - guard[c];
          assert.ok(d >= -1e-6 && d <= most, `${what}: ${c} ${P[c].toFixed(1)} against the guard's ${guard[c]}`);
        }
        assert.equal(P.bodyLean, lean, `${what}: leans ${P.bodyLean}`);
        assert.equal(P.sy, guard.sy);
        assert.ok(P.legF.x - P.legB.x >= 20 - 1e-6, `${what}: the feet are ${(P.legF.x - P.legB.x).toFixed(1)} apart`);
        const next = pose('walk', { walkPhase: walkPhase + 0.01, movingBack });
        for (const l of ['legF', 'legB']) {
          assert.ok(P[l].y <= 1e-9, `${what}: ${l} is under the floor`);
          if (P[l].y < -0.5) {
            const dx = next[l].x - P[l].x;
            assert.ok(movingBack ? dx < 0 : dx > 0, `${what}: ${l} is lifted while it is planted`);
          }
        }
      }
    }
    // Turning round mid-walk carries on the same step: only which foot is up
    // swaps, by no more than the form's lift (the cycle once ran backwards to
    // back off, and the feet jumped up to 28 px in a frame).
    for (let i = 0; i < 48; i++) {
      const walkPhase = i * Math.PI / 12;
      const on = pose('walk', { walkPhase }), back = pose('walk', { walkPhase, movingBack: true });
      for (const l of ['legF', 'legB', 'armF', 'armB']) {
        assert.ok(Math.abs(on[l].x - back[l].x) < 1e-9, `${name} turning round at ${walkPhase.toFixed(2)}: ${l} jumps ${(back[l].x - on[l].x).toFixed(1)} px`);
      }
      for (const l of ['legF', 'legB']) assert.ok(Math.abs(on[l].y - back[l].y) <= (W.lift ?? 0) + 1e-9, `${name} turning round lifts ${l} past its step`);
      for (const c of ['hipY', 'twist', 'hipTwist']) assert.ok(Math.abs(on[c] - back[c]) < 1e-9, `${name} turning round at ${walkPhase.toFixed(2)}: ${c} jumps`);
    }
  }
});

// A planted foot stays where it was put on the floor. The walk phase runs with
// the distance walked, so a foot that is down goes back under the body at the
// body's own speed, less only the glide a form chooses (`slip`): the feet
// swung on a sine at a cadence of their own and slid along with the body at
// 59 to 83% of its speed, every walk skating. Measured on the floor, the legs
// as drawn (applyProportions widens them by the body's stride).
test('a planted foot stays planted: the walk keeps to the ground going by', async () => {
  const { applyProportions, clampBody } = await import('../src/engine/proportions.js');
  const { PHYS } = await import('../src/config.js');
  const px = PHYS.WALK / PHYS.WALK_PHASE;     // floor going by per radian of the walk phase
  for (const [name, form] of Object.entries(FORMS)) {
    const id = Object.keys(MODELS3D).find((k) => MODELS3D[k].form === name)?.slice(7);
    const def = getFighter(id), body = clampBody(def.body), slip = form.walk.slip ?? 0;
    for (const movingBack of [false, true]) {
      const at = (walkPhase) => applyProportions(computePose({ def, state: 'walk', stateT: 0, walkPhase, side: 0, vy: 0, airborne: false, movingBack }, 0, form), body);
      let down = 0;
      for (let i = 0; i < 240; i++) {
        const w = i * 0.07, a = at(w), b = at(w + 0.005);
        for (const l of ['legF', 'legB']) {
          if (a[l].y !== 0 || b[l].y !== 0) continue;
          down++;
          const onFloor = (b[l].x - a[l].x) / 0.005 + (movingBack ? -px : px);
          assert.ok(Math.abs(onFloor) <= (slip + 0.01) * px, `${name}${movingBack ? ' backing off' : ''} at ${w.toFixed(2)}: the planted ${l} slides at ${(100 * Math.abs(onFloor) / px).toFixed(0)}% of the walk`);
        }
      }
      assert.ok(down > 120, `${name} hardly puts a foot down`);
    }
  }
});

// And jumps its own way: leaving the floor in one shape and coming down in
// another, at the guard's height, the feet off the floor throughout.
test('every form jumps its own way, from its own shape going up to its own coming down', () => {
  for (const [name, form] of Object.entries(FORMS)) {
    const J = form.jump;
    assert.ok(J && J.up, `${name} jumps the shared tuck`);
    const D = J.down ?? J.up;
    const id = Object.keys(MODELS3D).find((k) => MODELS3D[k].form === name)?.slice(7);
    const def = getFighter(id);
    const pose = (state, vy = 0) => computePose({ def, state, stateT: 0, walkPhase: 0, side: 0, vy, airborne: state === 'jump', movingBack: false }, 0, form);
    const guard = pose('idle');
    const up = pose('jump', -760), down = pose('jump', 760);
    assert.deepEqual([up.legF, up.legB], [J.up.legF, J.up.legB], `${name} leaves the floor in the shared tuck`);
    assert.deepEqual([down.legF, down.legB], [D.legF, D.legB], `${name} comes down in the shared tuck`);
    if (J.up.armF) assert.deepEqual(up.armF, J.up.armF);
    for (let vy = -760; vy <= 760; vy += 40) {
      const P = pose('jump', vy);
      assert.equal(P.hipY, guard.hipY, `${name}'s hips in the air at ${vy}`);
      for (const l of ['legF', 'legB']) assert.ok(P[l].y < 0, `${name}'s ${l} on the floor in the air at ${vy}`);
    }
  }
});

// Each form crouches its own way and clearly lower than it stands: the shared
// crouch dropped everyone from the stock rest height, so a fighter already
// low in their guard (Carl, Kim) hardly went down. The hands come down with
// the shoulders, so whatever they hold stays in them.
test('every form crouches its own way, well below its guard, the hands carried down', () => {
  for (const [name, form] of Object.entries(FORMS)) {
    const C = form.crouch;
    assert.ok(C, `${name} crouches the shared crouch`);
    const id = Object.keys(MODELS3D).find((k) => MODELS3D[k].form === name)?.slice(7);
    const def = getFighter(id);
    const pose = (state) => computePose({ def, state, stateT: 0, walkPhase: 0, side: 0, vy: 0, airborne: false, crouching: state === 'crouch', movingBack: false }, 0, form);
    const guard = pose('idle'), P = pose('crouch');
    assert.ok(P.headY > guard.headY + 18, `${name} crouches ${(P.headY - guard.headY).toFixed(1)} px below the guard`);
    assert.ok(P.hipY > guard.hipY + 15, `${name}'s hips go down ${(P.hipY - guard.hipY).toFixed(1)} px`);
    assert.equal(P.bodyLean, C.lean ?? guard.bodyLean);
    for (const l of ['legF', 'legB']) assert.equal(P[l].y, 0, `${name}'s ${l} is off the floor in a crouch`);
    assert.ok(P.legF.x - P.legB.x >= 20, `${name}'s feet meet in a crouch`);
    for (const a of ['armF', 'armB']) {
      const o = C[a] ?? { x: 0, y: 0 };
      assert.ok(Math.abs(P[a].x - guard[a].x - o.x) < 1e-9 && Math.abs((P[a].y - P.shoulderY) - (guard[a].y - guard.shoulderY) - o.y) < 1e-9,
        `${name}'s ${a} leaves the guard in a crouch`);
    }
  }
});

// And dashes its own way, with a dash back of its own: the shared dash leans
// into a charge whichever way it goes, so a dash back was a charge dragged
// backwards.
test('every form dashes its own way, leaning out of a dash back', () => {
  for (const [name, form] of Object.entries(FORMS)) {
    const D = form.dash;
    assert.ok(D && D.back, `${name} dashes the shared dash`);
    const id = Object.keys(MODELS3D).find((k) => MODELS3D[k].form === name)?.slice(7);
    const def = getFighter(id);
    const pose = (dashDir) => computePose({ def, state: 'dash', stateT: 0.08, walkPhase: 0, side: 0, vy: 0, airborne: false, movingBack: false, facing: 1, dashDir }, 0, form);
    const guard = computePose({ def, state: 'idle', stateT: 0, walkPhase: 0, side: 0, vy: 0, airborne: false, movingBack: false }, 0, form);
    const into = pose(1), away = pose(-1);
    assert.equal(into.bodyLean, D.lean ?? guard.bodyLean, `${name} dashes in at the shared lean`);
    assert.equal(away.bodyLean, D.back.lean ?? D.lean ?? guard.bodyLean, `${name} dashes back at the shared lean`);
    assert.ok(away.bodyLean < into.bodyLean - 0.05, `${name} leans into a dash back (${away.bodyLean} against ${into.bodyLean})`);
    assert.deepEqual(into.legF, D.legF);
    assert.deepEqual(away.legF, D.back.legF ?? D.legF);
    for (const P of [into, away]) assert.ok(P.legF.x - P.legB.x >= 20, `${name}'s feet meet in a dash`);
  }
});

// Each fighter's signature special plays a track of its own in their form,
// from the idle guard and back to it, where it used to play the basic its
// kind borrows (Kim's GROWTH HACK rush was one punch held half a second).
// Scam's ALIGNMENT SHIFT switches stance and swings nothing, so it has none.
test("every sculpt's signature special plays its own track, from its guard and back", async () => {
  const { SPECIALS } = await import('../src/data/fighters.js');
  const { shapeAttack } = await import('../src/engine/moves.js');
  const ids = Object.keys(MODELS3D).filter((k) => k.startsWith('sculpt:') && MODELS3D[k].form).map((k) => k.slice(7));
  let own = 0;
  for (const id of ids) {
    const def = getFighter(id), form = FORMS[MODELS3D[`sculpt:${id}`].form];
    const sp = SPECIALS[def.special];
    if (sp.type === 'stance') { assert.equal(form.specials?.[sp.id], undefined); continue; }
    const track = form.specials?.[sp.id];
    assert.ok(track, `${id}'s ${sp.name} plays the basic its kind borrows`);
    assert.deepEqual(validateTrack(`${id}.${sp.id}`, track, { attack: true }), []);
    own++;
    const a = shapeAttack({ kind: sp.type, special: sp, hasHit: false, startup: sp.startup || 0.15, active: sp.active || 0.1, recovery: sp.recovery || 0.3, reach: sp.reach }, sp);
    const at = (stateT, attack = a) => computePose({ def, state: 'attack', stateT, walkPhase: 0, side: 0, vy: 0, airborne: false, movingBack: false, attack }, 0, form);
    const guard = computePose({ def, state: 'idle', stateT: 0, walkPhase: 0, side: 0, vy: 0, airborne: false, movingBack: false }, 0, form);
    for (const [k, stateT] of [[0, 0], [3, a.startup + a.active + a.recovery]]) {
      const P = at(stateT), what = `${id}'s ${sp.name} at ${k}`;
      for (const c of ['hipY', 'shoulderY', 'headY', 'headX', 'bodyLean', 'sx', 'sy']) {
        assert.ok(Math.abs((P[c] ?? 0) - (guard[c] ?? 0)) < 1e-6, `${what}: ${c} ${P[c]} against the guard's ${guard[c]}`);
      }
      for (const l of ['armF', 'armB', 'legF', 'legB']) {
        assert.ok(Math.hypot(P[l].x - guard[l].x, P[l].y - guard[l].y) < 1e-6, `${what}: ${l} leaves the guard`);
      }
      assert.equal(P.hand || 'fist', guard.hand || 'fist', `${what}: the lead hand`);
    }
    // in the middle of it, its own and not the borrowed basic
    const mid = a.startup + a.active / 2;
    const borrowed = at(mid, { ...a, special: { ...sp, id: undefined } });
    const P = at(mid);
    assert.notDeepEqual([P.armF, P.armB, P.bodyLean], [borrowed.armF, borrowed.armB, borrowed.bodyLean], `${id}'s ${sp.name} is the borrowed basic`);
    // and a command normal of the same kind still borrows the basic
    const cmd = at(mid, { ...a, cmd: { archetype: sp.type } });
    assert.deepEqual([cmd.armF, cmd.armB], [borrowed.armF, borrowed.armB], `${id}'s command normals play ${sp.name}`);
  }
  assert.equal(own, 8, `${own} signature specials have their own track`);
});

// And the two moves everyone has, the energy steal and the bomb, which
// borrowed the punch and the slap: each form's own, from its guard and back.
test('every form steals and throws the bomb its own way, from its guard and back', async () => {
  const { STEAL, BOMB } = await import('../src/config.js');
  for (const [name, form] of Object.entries(FORMS)) {
    const id = Object.keys(MODELS3D).find((k) => MODELS3D[k].form === name)?.slice(7);
    const def = getFighter(id);
    const guard = computePose({ def, state: 'idle', stateT: 0, walkPhase: 0, side: 0, vy: 0, airborne: false, movingBack: false }, 0, form);
    for (const [kind, T] of [['steal', STEAL], ['bomb', BOMB]]) {
      const track = form.moves?.[kind];
      assert.ok(track, `${name} ${kind}s with its ${kind === 'steal' ? 'punch' : 'slap'}`);
      assert.deepEqual(validateTrack(`${name}.${kind}`, track, { attack: true }), []);
      const a = { kind, hasHit: false, startup: T.startup, active: T.active, recovery: T.recovery, reach: T.reach };
      const at = (stateT, attack = a) => computePose({ def, state: 'attack', stateT, walkPhase: 0, side: 0, vy: 0, airborne: false, movingBack: false, attack }, 0, form);
      for (const [k, stateT] of [[0, 0], [3, a.startup + a.active + a.recovery]]) {
        const P = at(stateT), what = `${name}'s ${kind} at ${k}`;
        for (const c of ['hipY', 'shoulderY', 'headY', 'headX', 'bodyLean', 'sx', 'sy']) {
          assert.ok(Math.abs((P[c] ?? 0) - (guard[c] ?? 0)) < 1e-6, `${what}: ${c} ${P[c]} against the guard's ${guard[c]}`);
        }
        for (const l of ['armF', 'armB', 'legF', 'legB']) {
          assert.ok(Math.hypot(P[l].x - guard[l].x, P[l].y - guard[l].y) < 1e-6, `${what}: ${l} leaves the guard`);
        }
        assert.equal(P.hand || 'fist', guard.hand || 'fist', `${what}: the lead hand`);
      }
      const mid = a.startup + a.active / 2;
      const borrowed = at(mid, { ...a, kind: kind === 'steal' ? 'punch' : 'slap' });
      const P = at(mid);
      assert.notDeepEqual([P.armF, P.armB], [borrowed.armF, borrowed.armB], `${name}'s ${kind} is the borrowed basic`);
    }
  }
});

// Each fighter's command moves play their own track, by input, where they
// borrowed the form's basic for that button (Lizbeth's THE DEMO, a counter
// that swings nothing, was her slap). From the guard and back. Carl's ASSET
// SEIZURE keeps his punch, which is already a seizure.
test("every sculpt's command moves play their own track, from its guard and back", async () => {
  const { shapeAttack } = await import('../src/engine/moves.js');
  const ids = Object.keys(MODELS3D).filter((k) => k.startsWith('sculpt:') && MODELS3D[k].form).map((k) => k.slice(7));
  let own = 0;
  for (const id of ids) {
    const def = getFighter(id), form = FORMS[MODELS3D[`sculpt:${id}`].form];
    const style = STYLES[def.style] || STYLES.balanced;
    for (const cn of def.commandNormals || []) {
      const track = form.commands?.[cn.slot];
      if (cn.displayName === 'ASSET SEIZURE') { assert.equal(track, undefined); continue; }
      assert.ok(track, `${id}'s ${cn.displayName} borrows the basic`);
      assert.deepEqual(validateTrack(`${id}.${cn.slot}`, track, { attack: true }), []);
      own++;
      // built as Fighter.startAttack builds it
      const button = cn.slot.split('+')[1];
      const fd = { ...ATTACKS[button], ...cn.frameData };
      const a = { ...fd, kind: cn.archetype !== 'strike' ? cn.archetype : button, button, cmd: cn, hasHit: false,
        startup: fd.startup * style.startup, recovery: fd.recovery * style.recovery, reach: (fd.reach || 84) * style.reach };
      a.special = { ...(cn.params || {}), ...cn.frameData, type: cn.archetype };
      shapeAttack(a, a.special);
      const at = (stateT, attack = a) => computePose({ def, state: 'attack', stateT, walkPhase: 0, side: 0, vy: 0, airborne: false, movingBack: false, attack }, 0, form);
      const guard = computePose({ def, state: 'idle', stateT: 0, walkPhase: 0, side: 0, vy: 0, airborne: false, movingBack: false }, 0, form);
      for (const [k, stateT] of [[0, 0], [3, a.startup + a.active + a.recovery]]) {
        const P = at(stateT), what = `${id}'s ${cn.displayName} at ${k}`;
        for (const c of ['hipY', 'shoulderY', 'headY', 'headX', 'bodyLean', 'sx', 'sy']) {
          assert.ok(Math.abs((P[c] ?? 0) - (guard[c] ?? 0)) < 1e-6, `${what}: ${c} ${P[c]} against the guard's ${guard[c]}`);
        }
        for (const l of ['armF', 'armB', 'legF', 'legB']) {
          assert.ok(Math.hypot(P[l].x - guard[l].x, P[l].y - guard[l].y) < 1e-6, `${what}: ${l} leaves the guard`);
        }
        assert.equal(P.hand || 'fist', guard.hand || 'fist', `${what}: the lead hand`);
      }
      const mid = a.startup + a.active / 2;
      const borrowed = at(mid, { ...a, cmd: { ...cn, slot: 'none' } });
      const P = at(mid);
      assert.notDeepEqual([P.armF, P.armB, P.legF], [borrowed.armF, borrowed.armB, borrowed.legF], `${id}'s ${cn.displayName} is the borrowed basic`);
    }
  }
  assert.equal(own, 9, `${own} command moves have their own track`);
});

// Each form strikes its own pose as its super goes on: the game freezes for
// UNICORN.POP_FREEZE, and the fighter stood frozen in whatever they were
// doing. Held while the super's timer is full, gone `fade` seconds after it
// starts to run, and never over a swing.
test('every form strikes its own pose as its super goes on, and lets it go', async () => {
  const { UNICORN } = await import('../src/config.js');
  for (const [name, form] of Object.entries(FORMS)) {
    const S = form.super;
    assert.ok(S && S.fade > 0 && S.fade < 1, `${name} goes into its super as it stood`);
    const id = Object.keys(MODELS3D).find((k) => MODELS3D[k].form === name)?.slice(7);
    const def = getFighter(id);
    const pose = (state, unicornT, extra = {}) => computePose({ def, state, stateT: 0, walkPhase: 0, side: 0, vy: 0, airborne: false, movingBack: false, unicornT, ...extra }, 0, form);
    const on = pose('idle', UNICORN.DURATION), after = pose('idle', UNICORN.DURATION - S.fade - 0.01), plain = pose('idle', 0);
    for (const [j, v] of Object.entries(S.joints)) assert.deepEqual(on[j], v, `${name}'s ${j} as the super goes on`);
    // the hands no higher than the head: the super's banner (FX_ART.CUTIN)
    // covers the screen above it for longer than the pose lasts
    for (const l of ['armF', 'armB']) assert.ok(on[l].y >= on.headY - 6, `${name}'s ${l} goes up under the super's banner`);
    if (S.hand) assert.equal(on.hand, S.hand);
    assert.deepEqual(after, plain, `${name} is still in its super pose ${S.fade} s on`);
    const atk = { ...ATTACKS.punch, kind: 'punch', hasHit: false };
    assert.deepEqual(pose('attack', UNICORN.DURATION, { attack: atk, stateT: 0.06 }), pose('attack', 0, { attack: atk, stateT: 0.06 }), `${name} strikes its super pose over a punch`);
  }
});

// Each form opens the round its own way, through ROUND and FIGHT!, where the
// fighters stood idle and locked: from its gesture to the live idle exactly by
// the time the round goes live, and only while the round is starting.
test('every form opens the round its own way and is in its live idle by FIGHT!', async () => {
  const { ROUND } = await import('../src/config.js');
  const total = ROUND.INTRO_ROUND_T + ROUND.INTRO_FIGHT_T;
  for (const [name, form] of Object.entries(FORMS)) {
    assert.ok(form.intro, `${name} stands idle through the round's start`);
    assert.deepEqual(validateTrack(`${name}.intro`, form.intro), []);
    const id = Object.keys(MODELS3D).find((k) => MODELS3D[k].form === name)?.slice(7);
    const def = getFighter(id);
    const pose = (intro, state = 'idle', t = 0.7) => computePose({ def, state, stateT: 0, walkPhase: 0, side: 0, vy: 0, airborne: false, movingBack: false }, t, form, intro);
    const first = form.intro.keys[0].joints, start = pose(0);
    const near = (a, b) => typeof a === 'object' ? Math.hypot(a.x - b.x, a.y - b.y) < 1e-9 : Math.abs(a - b) < 1e-9;
    for (const j of ['armF', 'armB', 'hipY', 'bodyLean']) assert.ok(near(start[j], first[j]), `${name}'s ${j} as the round starts`);
    assert.notDeepEqual([pose(total * 0.3).armF, pose(total * 0.3).armB], [pose(null).armF, pose(null).armB], `${name} stands idle through the round's start`);
    assert.deepEqual(pose(total), pose(null), `${name} is not in its live idle by FIGHT!`);
    assert.deepEqual(pose(0, 'walk'), pose(null, 'walk'), `${name}'s round start reaches past the idle`);
    // and never in 2D
    assert.deepEqual(computePose({ def, state: 'idle', stateT: 0, walkPhase: 0, side: 0, vy: 0, airborne: false, movingBack: false }, 0.7, null, 0),
      computePose({ def, state: 'idle', stateT: 0, walkPhase: 0, side: 0, vy: 0, airborne: false, movingBack: false }, 0.7));
  }
});

// The round's start reaches the forms only through render.js telling
// drawFighter where it is, as it sets the 3D clock: each of its three ways of
// drawing a match (one canvas, the 3D layer, the layer's 2D fallback) has to,
// before it draws a fighter, or that path opens every round standing idle.
test('every way of drawing a match tells the fighters where the round start is', () => {
  const src = readFileSync(new URL('../src/engine/render.js', import.meta.url), 'utf8');
  const clocks = [...src.matchAll(/setClock3D\(game\.simT\)/g)].map((m) => m.index);
  assert.ok(clocks.length >= 3, `render.js sets the 3D clock in ${clocks.length} places`);
  const set = "setRoundStart(game.state === 'intro' ? game.stateT : null)";
  assert.equal(src.split(set).length - 1, clocks.length, 'a path sets the clock and not the round start');
  for (const at of clocks) {
    const rest = src.slice(at), here = rest.indexOf(set), draws = rest.search(/drawFighter\(|drawFighters\w*\(/);
    assert.ok(here >= 0 && (draws < 0 || here < draws), `the path at line ${src.slice(0, at).split("\n").length} draws a fighter before it sets the round start`);
    assert.ok(here < rest.indexOf('\n}'), `the path at line ${src.slice(0, at).split('\n').length} never sets the round start`);
  }
});

// Scam's ALIGNMENT SHIFT switches stance and swings nothing, so it had
// nothing to show. His form strikes a pose for the stance he switched to,
// held for a moment of the switch's cooldown and gone before it ends.
test("Scam's ALIGNMENT SHIFT shows which way he switched, and lets it go", async () => {
  const { STANCE } = await import('../src/config.js');
  const form = FORMS.fence, S = form.shift, def = getFighter('scam');
  assert.ok(S && S.safety && S.capabilities, 'the switch shows nothing');
  const pose = (stanceId, stanceCD, state = 'idle') => computePose({ def, state, stateT: 0, walkPhase: 0, side: 0, vy: 0, airborne: false, movingBack: false, stanceId, stanceCD }, 0.4, form);
  const plain = pose(null, 0);
  for (const id of ['safety', 'capabilities']) {
    const on = pose(id, STANCE.CD), held = pose(id, STANCE.CD - S.hold);
    for (const [j, v] of Object.entries(S[id].joints)) {
      assert.deepEqual(on[j], v, `${id}: ${j} as he switches`);
      assert.deepEqual(held[j], v, `${id}: ${j} ${S.hold} s on`);
    }
    for (const l of ['armF', 'armB']) assert.ok(on[l].y >= on.headY - 6, `${id}: ${l} goes up under the banner`);
    assert.deepEqual(pose(id, STANCE.CD - S.hold - S.fade - 0.01), pose(id, 0), `${id}: still switching after ${S.hold + S.fade} s`);
    assert.ok(S.hold + S.fade < STANCE.CD, 'the pose outlasts the cooldown');
  }
  assert.notDeepEqual(pose('safety', STANCE.CD).armF, pose('capabilities', STANCE.CD).armF);
  assert.deepEqual(pose(null, STANCE.CD), plain);
  for (const [name, f] of Object.entries(FORMS)) if (name !== 'fence') assert.equal(f.shift, undefined);
});

// A held pose broken off stays off. The super's and the switch's poses run
// on timers that keep counting through a strike, a block or a jump, so the
// pose came back at whatever weight was left when the fighter stood again
// (Scam slapping out of his switch snapped back into it), and a super pressed
// in the air popped in on landing. Drawn frame by frame, as the game draws
// the same fighter.
test('a super or stance-switch pose broken off does not come back', async () => {
  const { STANCE, UNICORN } = await import('../src/config.js');
  const atk = { ...ATTACKS.slap, kind: 'slap', hasHit: false };
  const frames = (form, def, steps) => {
    const f = { def, state: 'idle', stateT: 0, walkPhase: 0, side: 0, vy: 0, airborne: false, movingBack: false, attack: null, unicornT: 0, stanceCD: 0, stanceId: null };
    return steps.map((s) => {
      Object.assign(f, s);
      const fresh = computePose({ ...f }, 0.4, form);
      return { P: computePose(f, 0.4, form), fresh, plain: computePose({ ...f, unicornT: 0, stanceCD: 0 }, 0.4, form) };
    });
  };
  // Scam switches, slaps out of it while the pose is still held, and stands
  const S = FORMS.fence.shift, def = getFighter('scam');
  const cd = (k) => STANCE.CD - k * (S.hold + S.fade) / 4;
  const scam = frames(FORMS.fence, def, [
    { stanceId: 'safety', stanceCD: cd(0) },
    { state: 'attack', stateT: 0.02, attack: atk, stanceCD: cd(1) },
    { state: 'idle', stateT: 0, attack: null, stanceCD: cd(2) },
    { stanceCD: cd(3) },
  ]);
  assert.notDeepEqual(scam[0].P.armF, scam[0].plain.armF, 'the switch shows nothing');
  assert.notDeepEqual(scam[2].fresh.armF, scam[2].plain.armF, 'the switch has eased out before he stands again: this shows nothing');
  for (const i of [2, 3]) assert.deepEqual(scam[i].P, scam[i].plain, `Scam snaps back into his switch ${i - 1} frame(s) after the slap`);
  // and a new switch shows again
  const again = frames(FORMS.fence, def, [
    { stanceId: 'safety', stanceCD: cd(0) }, { state: 'attack', attack: atk, stanceCD: cd(1) },
    { state: 'idle', attack: null, stanceCD: cd(2) }, { stanceId: 'capabilities', stanceCD: cd(0) },
  ]);
  assert.notDeepEqual(again[3].P.armF, again[3].plain.armF, 'a second switch shows nothing');
  for (const [name, form] of Object.entries(FORMS)) {
    const id = Object.keys(MODELS3D).find((k) => MODELS3D[k].form === name)?.slice(7);
    const def = getFighter(id), fade = form.super.fade;
    const T = (k) => UNICORN.DURATION - k * fade / 4;
    // pressed in the air, landing while the pose would still be held
    const air = frames(form, def, [
      { state: 'jump', airborne: true, vy: 200, unicornT: T(0) },
      { state: 'idle', airborne: false, vy: 0, unicornT: T(1) },
      { unicornT: T(2) },
    ]);
    assert.notDeepEqual(air[1].fresh, air[1].plain, `${name}'s super has eased out by landing: this shows nothing`);
    for (const i of [1, 2]) assert.deepEqual(air[i].P, air[i].plain, `${name}'s super pressed in the air pops in on landing`);
    // walking off as it goes on keeps it
    const walk = frames(form, def, [
      { unicornT: T(0) }, { state: 'walk', walkPhase: 0.5, unicornT: T(1) }, { state: 'crouch', crouching: true, unicornT: T(2) },
    ]);
    for (const i of [0, 1, 2]) assert.deepEqual(walk[i].P, walk[i].fresh, `${name}'s super pose breaks off on the ground`);
  }
});

// A move thrown from a crouch comes from the crouch: the hurtbox stays
// crouched while down is held (Fighter.crouching), and the fighter stood up
// to swing. It leaves from the crouch, the body stays down, the fist or foot
// it strikes with is where the standing move puts it (where it hits: the
// hitbox does not crouch), and a move already written low goes no lower than
// the crouch. A move thrown standing is untouched.
test('every form throws a move from its crouch, striking where it hits', async () => {
  const { shapeAttack } = await import('../src/engine/moves.js');
  for (const [name, form] of Object.entries(FORMS)) {
    const id = Object.keys(MODELS3D).find((k) => MODELS3D[k].form === name)?.slice(7);
    const def = getFighter(id);
    const pose = (state, stateT, crouching, attack) => computePose({ def, state, stateT, walkPhase: 0, side: 0, vy: 0, airborne: false, crouching, movingBack: false, attack }, 0, form);
    const crouch = pose('crouch', 0, true, null);
    for (const [kind, limb] of [['punch', 'armF'], ['slap', 'armF'], ['kick', 'legF']]) {
      const atk = { ...ATTACKS[kind], kind, hasHit: false };
      const first = pose('attack', 0, true, atk), standing = pose('attack', 0, false, atk);
      for (const c of ['hipY', 'shoulderY', 'headY', 'bodyLean']) {
        assert.ok(Math.abs(first[c] - crouch[c]) < 1e-9, `${name}'s ${kind} from a crouch leaves from ${first[c]}, the crouch's ${c} is ${crouch[c]}`);
      }
      assert.ok(standing.headY < first.headY - 15, `${name} stands up to ${kind} from a crouch`);
      const mid = atk.startup + atk.active / 2;
      const low = pose('attack', mid, true, atk), high = pose('attack', mid, false, atk);
      // a move that already dips (Carl's punch lunges 8 px) still never goes
      // below the crouch it was thrown from
      assert.ok(low.hipY > high.hipY + 5, `${name}'s ${kind} from a crouch stands up`);
      assert.ok(low.hipY <= crouch.hipY + 1e-9, `${name}'s ${kind} from a crouch goes down to ${low.hipY}, below its crouch's ${crouch.hipY}`);
      // where it hits as drawn, the squash and all
      const dx = low[limb].x * low.sx - high[limb].x * high.sx, dy = low[limb].y * low.sy - high[limb].y * high.sy;
      assert.ok(Math.hypot(dx, dy) < 1e-9, `${name}'s ${kind} from a crouch strikes ${Math.hypot(dx, dy).toFixed(1)} px from where it hits`);
      // squashed as the crouch is (the move's own stretch stood it up)
      if ((form.crouch.sy ?? 1) < 1) assert.ok(low.sy < high.sy - 0.02, `${name}'s ${kind} from a crouch keeps the standing move's stretch`);
    }
  }
  // Kim's RUG PULL is written down at the floor already
  const def = getFighter('zara'), form = FORMS.peekaboo, cn = def.commandNormals.find((c) => c.displayName === 'RUG PULL');
  const fd = { ...ATTACKS.kick, ...cn.frameData };
  const a = { ...fd, kind: cn.archetype, button: 'kick', cmd: cn, hasHit: false };
  a.special = { ...(cn.params || {}), ...cn.frameData, type: cn.archetype };
  shapeAttack(a, a.special);
  const at = (crouching, attack = a) => computePose({ def, state: crouching === null ? 'crouch' : 'attack', stateT: a.startup + a.active / 2, walkPhase: 0, side: 0, vy: 0, airborne: false, crouching: !!crouching, movingBack: false, attack }, 0, form);
  const crouch = at(null, null), low = at(true), high = at(false);
  assert.ok(low.hipY <= Math.max(high.hipY, crouch.hipY) + 1e-9, `RUG PULL from a crouch goes down to ${low.hipY}, below her crouch's ${crouch.hipY}`);
});

test('every form throws a move in the air from its own jump', () => {
  for (const [name, form] of Object.entries(FORMS)) {
    const id = Object.keys(MODELS3D).find((k) => MODELS3D[k].form === name)?.slice(7);
    const def = getFighter(id);
    for (const vy of [-500, 300]) {
      const jump = computePose({ def, state: 'jump', stateT: 0, walkPhase: 0, side: 0, vy, airborne: true, movingBack: false }, 0, form);
      for (const kind of ['punch', 'slap', 'kick']) {
        const atk = { ...ATTACKS[kind], kind, button: kind, hasHit: false };
        const P = computePose({ def, state: 'attack', stateT: atk.startup + atk.active / 2, walkPhase: 0, side: 0, vy, airborne: true, movingBack: false, attack: atk }, 0, form);
        assert.deepEqual(P.legB, jump.legB, `${name}'s ${kind} in the air drops its jump`);
        if (kind !== 'kick') assert.deepEqual(P.legF, jump.legF, `${name}'s ${kind} in the air drops its jump`);
        else assert.ok(P.legF.x > jump.legF.x + 30, `${name}'s kick in the air does not kick`);
      }
    }
  }
});

// Each form goes down its own way: how long the fall takes, how far over and
// how, where everyone fell the same 0.45 s along the same curve.
test('every form falls its own way when it is knocked out', () => {
  const curves = new Set();
  for (const [name, form] of Object.entries(FORMS)) {
    const F = form.ko?.fall;
    assert.ok(F && F.time > 0.2 && F.time < 1 && F.rot < -1 && F.rot > -1.7, `${name} falls the shared fall`);
    const id = Object.keys(MODELS3D).find((k) => MODELS3D[k].form === name)?.slice(7);
    const def = getFighter(id);
    const rot = (stateT) => computePose({ def, state: 'ko', stateT, walkPhase: 0, side: 0, vy: 0, airborne: false, movingBack: false }, 0, form).rot;
    assert.ok(Math.abs(rot(F.time) - F.rot) < 1e-9 && Math.abs(rot(F.time + 2) - F.rot) < 1e-9, `${name} does not end at ${F.rot}`);
    assert.ok(Math.abs(rot(0)) < 1e-9, `${name} starts its fall already over`);
    curves.add([F.time, F.rot, F.ease].join());
  }
  assert.ok(curves.size >= 8, `only ${curves.size} different falls`);
});

// And lands on the floor. The fall turns the standing pose over about the
// feet, so the floor came out wherever the stance put it: the rear foot went
// 10 to 38 px through it and the back lay on nothing or half under it (Adam
// and Lizbeth sank, Scam reclined 25 to 50 px up). groundFall brings
// whatever is lowest to the floor as the body goes over, and once down lays
// the back on it, lifting any hand or foot still under it. Measured as drawn:
// after the proportions and the figure's legs, turned and moved as
// drawFighter draws it (which has to call it, in the 3D branch).
test('a knocked-out body lies on the floor: nothing under it, the back on it', async () => {
  const { groundFall } = await import('../src/engine/drawFighter.js');
  const { GL3D } = await import('../src/config.js');
  const src = readFileSync(new URL('../src/engine/drawFighter.js', import.meta.url), 'utf8');
  assert.match(src, /const g = groundFall\(P\);\s*ctx\.translate\(g\.x, g\.y\);/, 'drawFighter never grounds the fall');
  const L = GL3D.LIE;
  for (const [name, form] of Object.entries(FORMS)) {
    const id = Object.keys(MODELS3D).find((k) => MODELS3D[k].form === name)?.slice(7);
    const def = getFighter(id), F = form.ko.fall;
    for (const stateT of [0, 0.03, 0.1, 0.2, 0.3, 0.45, 0.6, 0.8, F.time, F.time + 2]) {
      const P = figureFrame(applyProportions(computePose({ def, state: 'ko', stateT, walkPhase: 0, side: 0, vy: 0, airborne: false, movingBack: false }, 0, form), clampBody(def.body)));
      const g = groundFall(P), c = Math.cos(P.rot), s = Math.sin(P.rot);
      const shift = g.x * s + g.y * c;
      const lean = (P.bodyLean || 0) * GL3D.LEAN;
      const at = ([x, y]) => -(x * P.sx * s + y * P.sy * c + shift);     // height above the floor
      const socket = (x, y) => [x * Math.cos(lean) - (y - P.hipY) * Math.sin(lean), P.hipY + x * Math.sin(lean) + (y - P.hipY) * Math.cos(lean)];
      const what = `${name} ${stateT.toFixed(2)} s into its knockout`;
      for (const l of ['legF', 'legB']) assert.ok(at([P[l].x, P[l].y]) >= -1e-6, `${what}: ${l} is ${(-at([P[l].x, P[l].y])).toFixed(0)} px through the floor`);
      for (const l of ['armF', 'armB']) assert.ok(at([P[l].x, P[l].y]) >= L.LIMB - 1e-6, `${what}: ${l} is through the floor`);
      const hip = at([0, P.hipY]), sh = at(socket(0, P.shoulderY)), head = at(socket(P.headX, P.headY));
      assert.ok(hip >= L.BACK - 1e-6 && sh >= L.BACK - 1e-6 && head >= L.HEAD - 1e-6, `${what}: the body is through the floor`);
      if (stateT === 0) assert.ok(Math.abs(Math.min(at([P.legF.x, P.legF.y]), at([P.legB.x, P.legB.y]))) < 1e-6 && Math.abs(shift) < 3, `${what}: the fall does not start on its feet (moved ${shift.toFixed(1)} px)`);
      if (stateT >= F.time) assert.ok(Math.abs(Math.min(hip - L.BACK, sh - L.BACK, head - L.HEAD)) < 1e-6, `${what}: lies ${Math.min(hip - L.BACK, sh - L.BACK, head - L.HEAD).toFixed(0)} px off the floor`);
    }
  }
});

// Hit in the air (a juggle), a fighter's legs hung straight down as if on the
// floor; they take the form's own jump at that moment instead. On the ground
// the hit is as it was.
test('every form takes a hit in the air in its own jump', () => {
  for (const [name, form] of Object.entries(FORMS)) {
    const id = Object.keys(MODELS3D).find((k) => MODELS3D[k].form === name)?.slice(7);
    const def = getFighter(id);
    for (const vy of [-400, 300]) {
      const jump = computePose({ def, state: 'jump', stateT: 0, walkPhase: 0, side: 0, vy, airborne: true, movingBack: false }, 0, form);
      const hit = computePose({ def, state: 'hitstun', stateT: 0.1, walkPhase: 0, side: 0, vy, airborne: true, movingBack: false }, 0, form);
      assert.deepEqual([hit.legF, hit.legB], [jump.legF, jump.legB], `${name} hangs its legs down when hit in the air`);
      assert.equal(hit.armF.x, form.hit.armF.x);
    }
    const ground = computePose({ def, state: 'hitstun', stateT: 0.1, walkPhase: 0, side: 0, vy: 0, airborne: false, movingBack: false }, 0, form);
    assert.equal(ground.legF.y, 0, `${name}'s feet leave the floor when hit on it`);
  }
});

// A basic punch, slap or kick lands where it hits, in every form, as drawn
// (after the proportions and the figure's legs, and the squash): the fist or
// foot inside the hitbox's height and no further out than its far edge. A
// tall fighter's straight went over a short one's head and still hit (Elo's
// fist 45 px over Kim's), and Cathie's and Adam's went 15 to 25 px past the
// box. Brought in by pivoting at the shoulder or hip, the limb keeps its
// length; eased in and out, the move keeps its shape (nothing moves at the
// first frame); specials keep theirs as written.
test('every form lands its basic strikes inside the hitbox', async () => {
  const { landStrike } = await import('../src/engine/drawFighter.js');
  const { Fighter } = await import('../src/engine/fighter.js');
  const { GL3D } = await import('../src/config.js');
  const noop = () => {};
  const game = { audio: { sfx: noop }, fx: { dust: noop, burst: noop, ring: noop, text: noop, spark: noop }, onSpecialStart: noop, onSpecialDenied: noop, onUnicorn: noop, other: () => null };
  const m = GL3D.STRIKE_INSET;
  let moved = 0;
  for (const [name, form] of Object.entries(FORMS)) {
    const id = Object.keys(MODELS3D).find((k) => MODELS3D[k].form === name)?.slice(7);
    const def = getFighter(id), body = clampBody(def.body);
    for (const [kind, limb] of [['punch', 'armF'], ['slap', 'armF'], ['kick', 'legF']]) {
      const f = new Fighter(def, 0, { update: noop });
      f.x = 0; f.y = 0; f.energy = 100;
      f.startAttack(kind, game);
      const a = f.attack, at = (stateT, land = true) => {
        f.stateT = stateT;
        const P = figureFrame(applyProportions(computePose(f, 0, form), body));
        if (land) landStrike(f, P, 0, form, body, true);
        return P;
      };
      const mid = a.startup + a.active / 2, P = at(mid), raw = at(mid, false), box = f.hitbox();
      const x = P[limb].x * P.sx, y = P[limb].y * P.sy;
      const what = `${name}'s ${kind}`;
      assert.ok(y >= box.y + m - 1e-6 && y <= box.y + box.h - m + 1e-6, `${what} lands ${(box.y - y).toFixed(0)} px over its hitbox`);
      assert.ok(x <= box.x + box.w - m + 1e-6, `${what} lands ${(x - box.x - box.w).toFixed(0)} px past its hitbox`);
      if (P[limb].y !== raw[limb].y) {
        moved++;
        // pivoted, not pulled: as far from the shoulder (or hip) as before
        const o = limb === 'armF' ? (q) => [-(q.shoulderY + GL3D.SOCKET_DROP - q.hipY) * Math.sin(q.bodyLean * GL3D.LEAN), q.hipY + (q.shoulderY + GL3D.SOCKET_DROP - q.hipY) * Math.cos(q.bodyLean * GL3D.LEAN)] : (q) => [0, q.hipY];
        const len = (q) => Math.hypot(q[limb].x * q.sx - o(q)[0] * q.sx, q[limb].y * q.sy - o(q)[1] * q.sy);
        if (x < box.x + box.w - m - 1e-6) assert.ok(Math.abs(len(P) - len(raw)) < 1e-6, `${what}'s limb is ${(len(P) - len(raw)).toFixed(1)} px longer`);
      }
      assert.deepEqual(at(0)[limb], at(0, false)[limb], `${what} moves on its first frame`);
    }
    // a special is left as its form wrote it
    const s = new Fighter(def, 0, { update: noop });
    s.x = 0; s.y = 0; s.energy = 100;
    s.startSpecial(game);
    if (s.attack) {
      s.stateT = s.attack.startup + s.attack.active / 2;
      const P = figureFrame(applyProportions(computePose(s, 0, form), body)), before = structuredClone(P);
      landStrike(s, P, 0, form, body, true);
      assert.deepEqual(P, before, `${name}'s special is moved`);
    }
  }
  assert.ok(moved >= 8, `only ${moved} strikes came down into their box`);
});

// A sculpted body's limb stretches only a little to reach a target placed
// for a longer one (GL3D.STRETCH_MOST): Cathie's punch and kick, Jeff's
// UNDERCUT and Carl's HOSTILE TAKEOVER grew by up to a third. A planted foot
// still reaches the floor however far it is.
test('a sculpted arm or lifted leg stretches no more than STRETCH_MOST', async () => {
  const { GL3D } = await import('../src/config.js');
  const len = (m, bone) => { const a = joint(m, bone), b = joint(m, bone, true); return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); };
  const rest = solvePose(rig, posed('idle'));
  const base = { arm: len(rest, 'forearm.L'), leg: len(rest, 'shin.L') };
  const far = { ...posed('idle'), armF: { x: 260, y: -150 }, legF: { x: 220, y: -60 } };
  const m = solvePose(rig, far);
  assert.ok(len(m, 'forearm.L') / base.arm <= GL3D.STRETCH_MOST + 1e-3, `the arm stretches ${(len(m, 'forearm.L') / base.arm).toFixed(2)}`);
  assert.ok(len(m, 'shin.L') / base.leg <= GL3D.STRETCH_MOST + 1e-3, `the leg stretches ${(len(m, 'shin.L') / base.leg).toFixed(2)}`);
  const wide = solvePose(rig, { ...posed('idle'), legF: { x: 220, y: 0 } });
  const ankle = joint(wide, 'shin.L', true);
  assert.ok(Math.abs(ankle[0] - (220 / GL3D.UNIT)) < 0.02, 'a planted foot falls short of the floor');
});

// A launcher that misses is wide open for its long recovery, and should look
// it: the fist comes down only slowly. Elo's and Kim's were back at the guard
// for three quarters of the recovery, so the punish window could not be seen.
test('every form stays open through most of a launcher recovery', () => {
  for (const [name, form] of Object.entries(FORMS)) {
    const id = Object.keys(MODELS3D).find((k) => MODELS3D[k].form === name)?.slice(7);
    const def = getFighter(id), atk = { ...ATTACKS.launch, kind: 'launch', hasHit: false };
    const P = (stateT, state = 'attack') => computePose({ def, state, stateT, walkPhase: 0, side: 0, vy: 0, airborne: false, movingBack: false, attack: atk }, 0, form);
    const G = P(0, 'idle'), n = Math.round(atk.recovery * 60);
    let home = 0;
    for (let i = 1; i <= n; i++) {
      const Q = P(atk.startup + atk.active + i / 60);
      if (Math.hypot(Q.armF.x - G.armF.x, Q.armF.y - G.armF.y) < 12) home++;
    }
    assert.ok(home <= 0.4 * n, `${name}'s launcher is back in its guard for ${home} of its ${n} recovery frames`);
  }
});

// A win is not the guard. Five victory poses kept the hands within a few px of
// where the guard puts them, at its lean (Lizbeth's clasped hands, Cathie's
// arms opened a little, Elo's folded arms, Kim's nails at her jaw, Steve's
// presenting hand a little higher), and read as a fighter still waiting.
test('every form wins in a pose of its own, not its guard', () => {
  for (const [name, form] of Object.entries(FORMS)) {
    const id = Object.keys(MODELS3D).find((k) => MODELS3D[k].form === name)?.slice(7);
    const def = getFighter(id);
    const P = (state, t) => computePose({ def, state, stateT: 1, walkPhase: 0, side: 0, vy: 0, airborne: false, movingBack: false }, t, form);
    const G = P('idle', 0);
    let hands = 0, lean = 0;
    for (let i = 0; i < 40; i++) {
      const V = P('victory', i / 10);
      hands = Math.max(hands, Math.hypot(V.armF.x - G.armF.x, V.armF.y - G.armF.y) + Math.hypot(V.armB.x - G.armB.x, V.armB.y - G.armB.y));
      lean = Math.max(lean, Math.abs(V.bodyLean - G.bodyLean));
    }
    assert.ok(hands >= 60 || lean >= 0.12, `${name} wins in its guard: the hands ${hands.toFixed(0)} px from it, the lean ${lean.toFixed(2)}`);
  }
});
