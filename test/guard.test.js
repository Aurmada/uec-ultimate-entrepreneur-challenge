// The guard pass (October 2026). Every fighter stands, walks, crouches and
// jumps in a fighting guard and throws from it, the way the genre does: knees
// bent, feet staggered, both hands where they can strike or cover. The poses
// before it were authored across several rig eras and read as people waiting
// for a bus: a fist over the face, a rear hand hidden inside the torso, feet
// crossing on every step, an arm flung behind the head on every punch.
//
// These pin what the poses MEAN rather than their numbers, so the stances can
// keep being retuned by eye. All of it is render-only; hit resolution never
// sees a pose.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { computePose } from '../src/engine/drawFighter.js';
import { applyProportions, clampBody } from '../src/engine/proportions.js';
import { samplePose, REST, restPose } from '../src/engine/anim.js';
import { BASE_TRACKS } from '../src/data/tracks.js';
import { FIGHTERS, BASE_CHARACTERS } from '../src/data/fighters.js';
import { STYLIZE, GL3D } from '../src/config.js';
import { parseGLB, extractModel } from '../src/engine/gl3d/glb.js';
import { buildRig, solvePose, transformPoint } from '../src/engine/gl3d/rig.js';
import { MODELS3D, DEFAULT_MODEL } from '../src/data/models3d.js';

const ROSTER = [...FIGHTERS, ...BASE_CHARACTERS];
const fighter = (def, state, extra = {}) => ({
  def, state, stateT: 0, walkPhase: 0, side: 0, vy: 0, airborne: false, movingBack: false, ...extra,
});
const posed = (def, state, extra, t = 0) =>
  applyProportions(computePose(fighter(def, state, extra), t), clampBody(def.body));

// Where drawFighter draws the head: never higher than the shoulders allow.
function headOf(P) {
  const r = P.headR ?? STYLIZE.HEAD_R;
  const top = P.shoulderY - (r - STYLIZE.NECK_OVERLAP);
  return { x: P.headX + (P.bodyLean || 0) * 26, y: Math.max(P.headY, top), r };
}

// What a pose puts in front of the face: the fists, and anything held in one.
function inFront(def, P, state) {
  const out = [['armF fist', P.armF], ['armB fist', P.armB]];
  for (const part of def.parts || []) {
    if (part.anchor !== 'armF' && part.anchor !== 'armB') continue;
    if (part.states && !part.states.includes(state)) continue;
    out.push([`${part.id} (held)`, { x: P[part.anchor].x + (part.dx || 0), y: P[part.anchor].y + (part.dy || 0) }]);
  }
  return out;
}

const ATTACKS = ['punch', 'kick', 'slap', 'launch'].map((kind) => ({ kind, startup: 6, active: 4, recovery: 10 }));

test('no fighter holds a fist, or what is in it, over their own face', () => {
  const check = (def, P, state, when) => {
    const h = headOf(P);
    for (const [what, at] of inFront(def, P, state)) {
      const d = Math.hypot(at.x - h.x, at.y - h.y);
      assert.ok(d > h.r + 4, `${def.id} ${when}: the ${what} sits on the face (${d.toFixed(1)} px from its centre)`);
    }
  };
  for (const def of ROSTER) {
    for (const state of ['idle', 'walk', 'crouch', 'jump', 'block']) {
      for (const t of [0, 0.4, 0.8, 1.2]) check(def, posed(def, state, { walkPhase: t * 4 }, t), state, state);
    }
    // Through every swing. The striking hand may cross the face on the way
    // (a slap is cocked beside the head); the rear hand and a prop never.
    for (const attack of ATTACKS) {
      for (let stateT = 0; stateT < 20; stateT += 1) {
        const P = posed(def, 'attack', { attack, stateT });
        const h = headOf(P);
        for (const [what, at] of inFront(def, P, 'attack')) {
          if (what === 'armF fist') continue;
          const d = Math.hypot(at.x - h.x, at.y - h.y);
          assert.ok(d > h.r + 4, `${def.id} ${attack.kind} at frame ${stateT}: the ${what} sits on the face (${d.toFixed(1)} px)`);
        }
      }
    }
  }
});

test('a fighter keeps their own guard when they walk and when they crouch', () => {
  for (const def of ROSTER) {
    // the guard relative to the shoulders, where each state puts them
    const rel = (P, arm) => [P[arm].x, P[arm].y - P.shoulderY];
    const walk = posed(def, 'walk', { walkPhase: 0 });
    const crouch = posed(def, 'crouch');
    for (const arm of ['armF', 'armB']) {
      const [wx, wy] = rel(walk, arm), [cx, cy] = rel(crouch, arm);
      assert.ok(Math.abs(wx - cx) < 4 && Math.abs(wy - cy) < 4,
        `${def.id}: the ${arm} hand is at (${wx.toFixed(0)}, ${wy.toFixed(0)}) walking and (${cx.toFixed(0)}, ${cy.toFixed(0)}) crouching`);
    }
    const S = def.stance;
    if (S?.armB) {
      // the character's own rear hand, not a stock one: the prop it holds stays put
      const k = clampBody(def.body).reach;
      assert.ok(Math.abs(walk.armB.x - S.armB.x * k) < 4, `${def.id}: walking drops the stance's rear hand`);
    }
  }
});

test('feet stay staggered through a walk and never cross', () => {
  for (const def of ROSTER) {
    for (let ph = 0; ph < Math.PI * 2; ph += 0.2) {
      const P = posed(def, 'walk', { walkPhase: ph });
      assert.ok(P.legF.x - P.legB.x > 16, `${def.id}: the feet crossed at phase ${ph.toFixed(1)}`);
    }
  }
});

test('the rear fist stays home at the chin through every basic attack', () => {
  // The chin, as the stock guard holds it: relative to the shoulders, which
  // the uppercut lifts with the body.
  const homeX = REST.armB.x, homeY = REST.armB.y - REST.shoulderY;
  for (const name of ['punch', 'kick', 'slap', 'launch']) {
    for (let t = 0; t <= 3; t += 0.05) {
      const P = samplePose(BASE_TRACKS[name], t);
      const dx = P.armB.x - homeX, dy = (P.armB.y - P.shoulderY) - homeY;
      assert.ok(Math.hypot(dx, dy) < 14, `${name} at t=${t.toFixed(2)} pulls the rear fist ${Math.hypot(dx, dy).toFixed(0)} px from the chin`);
    }
  }
});

// Except where a hold lets go: a held strike is pinned and then snaps back,
// which is the arcade beat the tracks are built on (see tracks.js).
test('no basic attack pops: the pose is continuous across every key', () => {
  const near = (a, b, name, t, joint) => assert.ok(Math.abs(a - b) < 2.5, `${name} jumps ${Math.abs(a - b).toFixed(1)} in ${joint} at t=${t}`);
  for (const name of ['punch', 'kick', 'slap', 'launch']) {
    const keys = BASE_TRACKS[name];
    for (const [i, key] of keys.entries()) {
      if (i === 0 || keys[i - 1].hold) continue;
      const before = samplePose(BASE_TRACKS[name], key.t - 1e-6), at = samplePose(BASE_TRACKS[name], key.t);
      for (const j of ['armF', 'armB', 'legF', 'legB']) {
        near(before[j].x, at[j].x, name, key.t, `${j}.x`);
        near(before[j].y, at[j].y, name, key.t, `${j}.y`);
      }
      for (const j of ['hipY', 'shoulderY', 'headX', 'headY']) near(before[j], at[j], name, key.t, j);
      for (const j of ['bodyLean', 'sx', 'sy']) near(before[j] * 100, at[j] * 100, name, key.t, j);
    }
  }
});

test('every basic attack starts and ends in the stock guard', () => {
  for (const name of ['punch', 'kick', 'slap', 'launch']) {
    for (const t of [0, 3]) {
      const P = samplePose(BASE_TRACKS[name], t);
      for (const limb of ['armF', 'armB', 'legF', 'legB']) {
        assert.deepEqual([P[limb].x, P[limb].y], [REST[limb].x, REST[limb].y], `${name} at t=${t}: ${limb} is not in the guard`);
      }
      assert.equal(P.hipY, REST.hipY, `${name} at t=${t}: the hips are not at rest`);
    }
  }
});

test('a longer reach puts the fist further out by about the difference', () => {
  // The fist and the far edge of the hitbox have to move together, or a
  // zoner's jab looks no longer than a grappler's.
  const def = BASE_CHARACTERS[0];
  const at = (reach) => {
    const attack = { kind: 'punch', startup: 6, active: 4, recovery: 10, reach };
    // phase 1.15: the impact frame
    return computePose(fighter(def, 'attack', { attack, stateT: 6 + 0.15 * 4 }), 0).armF.x;
  };
  const gained = at(84 * 1.2) - at(84);
  assert.ok(gained > 0.8 * 84 * 0.2, `20% more reach moved the fist only ${gained.toFixed(1)} px`);
});

// ---- the 3D rig, which is posed from the same numbers

const glb = readFileSync(new URL(`../${MODELS3D[DEFAULT_MODEL].url}`, import.meta.url));
const rig = buildRig(extractModel(parseGLB(glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength))), MODELS3D[DEFAULT_MODEL]);
const joint = (m, bone, end = false) => transformPoint(m, rig.names.indexOf(bone), end ? rig.rest[bone].tail : rig.rest[bone].head);

test('a planted foot lies flat on the floor however bent the knee is', () => {
  const P = { ...restPose(), hipY: -62 };          // a deep crouch
  const m = solvePose(rig, P);
  for (const side of ['L', 'R']) {
    const ankle = joint(m, `foot.${side}`), toe = joint(m, `foot.${side}`, true);
    const pitch = Math.atan2(toe[1] - ankle[1], Math.hypot(toe[0] - ankle[0], toe[2] - ankle[2]));
    assert.ok(Math.abs(pitch) < 0.3, `${side} foot is tipped ${(pitch * 57.3).toFixed(0)} degrees: the fighter is on tiptoe`);
  }
});

test('a short stride bends the 3D knees no more than an average one', () => {
  const knee = (body) => {
    const P = applyProportions(restPose(), clampBody(body));
    const m = solvePose(rig, P);
    const hip = joint(m, 'thigh.L'), kn = joint(m, 'shin.L'), an = joint(m, 'foot.L');
    const a = [hip[0] - kn[0], hip[1] - kn[1], hip[2] - kn[2]], b = [an[0] - kn[0], an[1] - kn[1], an[2] - kn[2]];
    const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    return Math.acos(dot / (Math.hypot(...a) * Math.hypot(...b)));
  };
  const average = knee({});
  for (const stride of [0.88, 1.18]) {
    const k = knee({ stride });
    assert.ok(Math.abs(k - average) < 0.2, `stride ${stride} sets the knee at ${(k * 57.3).toFixed(0)} degrees against ${(average * 57.3).toFixed(0)}`);
  }
  assert.ok(GL3D.FOOT_LIFT > 0);
});
