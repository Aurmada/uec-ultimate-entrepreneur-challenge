// The figure (engine/figure.js): fighters drawn as anatomy rather than tubes,
// behind ?figure while the owner reviews it. These pin what makes it a body
// rather than the shapes' numbers, so it can keep being tuned by eye: bones
// that keep their length, a punch that lands on a straight arm, a guard with
// a bent one, legs that are half the fighter, and a head on a neck.
// All of it is render-only; hit resolution never sees a pose.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computePose, STYLE } from '../src/engine/drawFighter.js';
import { applyProportions, clampBody } from '../src/engine/proportions.js';
import { figureFrame, figureHead, figureSkeleton, solveJoint } from '../src/engine/figure.js';
import { anchorPoint } from '../src/engine/parts.js';
import { FIGHTERS, BASE_CHARACTERS } from '../src/data/fighters.js';
import { ATTACKS, FIGURE } from '../src/config.js';

const ROSTER = [...FIGHTERS, ...BASE_CHARACTERS];
const fighter = (def, state, extra = {}) => ({
  def, state, stateT: 0, walkPhase: 0, side: 0, vy: 0, airborne: false, movingBack: false, ...extra,
});
const figured = (def, state, extra) =>
  figureFrame(applyProportions(computePose(fighter(def, state, extra), 0), clampBody(def.body)));
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
// how far a joint sits off the straight line between the limb's two ends
const bow = ({ s, e, h }) => {
  const dx = h[0] - s[0], dy = h[1] - s[1];
  return Math.abs((e[0] - s[0]) * dy - (e[1] - s[1]) * dx) / Math.hypot(dx, dy);
};

test('the figure is off unless the address asks for it', () => {
  assert.equal(STYLE.figure, false);
});

test('a limb keeps its length, bends toward its pole, and lies straight out of reach', () => {
  for (const [s, t] of [[[0, 0], [50, 10]], [[0, 0], [10, 60]], [[5, -20], [-30, 40]]]) {
    const e = solveJoint(...s, ...t, 40, 38, 0.3, 1);
    assert.ok(Math.abs(dist(s, e) - 40) < 1e-6, 'upper bone changed length');
    assert.ok(Math.abs(dist(e, t) - 38) < 1e-6, 'lower bone changed length');
  }
  assert.ok(solveJoint(0, 0, 60, 0, 40, 38, 0, 1)[1] > 0, 'the joint bent away from its pole');
  assert.ok(Math.abs(solveJoint(0, 0, 100, 0, 40, 38, 0, 1)[1]) < 1e-9, 'an arm out of reach did not straighten');
});

test('a punch lands on a straight arm, and the guard it came from is bent', () => {
  const a = ATTACKS.punch;
  for (const def of ROSTER) {
    const impact = figureSkeleton(def, figured(def, 'attack', {
      attack: { ...a, kind: 'punch', button: 'punch' }, stateT: a.startup + 0.15 * a.active,
    }));
    assert.ok(bow(impact.armF) < 2, `${def.id}: the punch lands with the elbow ${bow(impact.armF).toFixed(1)} px off the line`);
    const guard = figureSkeleton(def, figured(def, 'idle'));
    assert.ok(bow(guard.armF) > 12, `${def.id}: the guard arm is nearly straight (${bow(guard.armF).toFixed(1)} px)`);
  }
});

test('the legs are about half the fighter, not the squat 42% of the tube rig', () => {
  let sum = 0;
  for (const def of ROSTER) {
    const P = figured(def, 'idle');
    const top = figureHead(P).y - figureHead(P).r;
    const legs = P.hipY / top;
    assert.ok(legs > 0.4 && legs < 0.56, `${def.id}: legs are ${(legs * 100).toFixed(0)}% of the height`);
    sum += legs;
  }
  assert.ok(sum / ROSTER.length > 0.47, `the cast's legs average ${((sum / ROSTER.length) * 100).toFixed(0)}% of their height`);
});

test('the head sits on a neck, and what is worn on the head follows it there', () => {
  for (const def of ROSTER) {
    const P = figured(def, 'idle');
    const H = figureHead(P);
    assert.ok(H.y + H.r <= P.shoulderY - 2, `${def.id}: the chin is ${(H.y + H.r - P.shoulderY).toFixed(1)} px into the collar`);
    P.headAt = H;
    assert.deepEqual(anchorPoint('head', P), { x: H.x, y: H.y });
  }
  assert.ok(FIGURE.NECK > 0);
});

test('a fighter built bigger is drawn bigger: shoulders, arms and reach follow the body', () => {
  // Jeff's build against Steve's, in the same pose: the sockets sit wider
  // apart and the arm is longer for the longer reach.
  const pose = (def) => figureFrame(applyProportions(computePose(fighter(def, 'idle'), 0), clampBody(def.body)));
  const jeff = ROSTER.find((d) => d.id === 'bozo'), steve = ROSTER.find((d) => d.id === 'kai');
  const span = (def) => { const K = figureSkeleton(def, pose(def)); return K.armF.s[0] - K.armB.s[0]; };
  assert.ok(span(jeff) > span(steve) + 6, `Jeff's shoulders (${span(jeff).toFixed(0)}) are no wider than Steve's (${span(steve).toFixed(0)})`);
  const long = { ...steve, body: { ...steve.body, reach: 1.2 } };
  assert.ok(figureSkeleton(long, pose(long)).armF.len > figureSkeleton(steve, pose(steve)).armF.len * 1.1);
});
