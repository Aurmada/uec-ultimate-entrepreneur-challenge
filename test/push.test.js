// How near two fighters may stand (PHYS.PUSH_HALF, a fighter's own pushHalf,
// Fighter pushGap). Until v3.21 one gap held for everyone, 0.92 of a body
// width (51.5 px between centres), and the cast's sculpts are broader than
// that: Jeff's belly and Adam's chest stand 30 px in front of their centres
// in a guard, so the two stood inside each other, and Carl stood inside Jeff
// before his seizure (the v3.20 graphics review).
//
// The trunk (what is skinned to the hips, spine, chest, neck and head) is
// measured from each sculpt as the match poses it, standing, walking,
// blocking and hit. Arms and legs are left out: guards and lead feet cross at
// close range in any fighting game, bodies do not.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseGLB, extractModel } from '../src/engine/gl3d/glb.js';
import { buildRig, solvePose } from '../src/engine/gl3d/rig.js';
import { MODELS3D } from '../src/data/models3d.js';
import { FORMS } from '../src/data/forms.js';
import { FIGHTERS, buildCustomFighter, buildGhostFighter } from '../src/data/fighters.js';
import { computePose } from '../src/engine/drawFighter.js';
import { applyProportions, clampBody } from '../src/engine/proportions.js';
import { figureFrame } from '../src/engine/figure.js';
import { GL3D, PHYS, STAGE } from '../src/config.js';
import { Fighter, pushGap } from '../src/engine/fighter.js';
import { Game } from '../src/engine/game.js';

const TRUNK = /^(hips|spine|chest|neck|head)$/;
const INK = GL3D.INK * GL3D.UNIT;            // the outline drawn round the trunk

// How far the trunk stands in front of the centre, at most, in `states`.
function trunkFront(def, states = ['idle', 'walk', 'block', 'hit']) {
  const spec = MODELS3D[`sculpt:${def.id}`];
  const buf = readFileSync(new URL(`../${spec.url}`, import.meta.url));
  const model = extractModel(parseGLB(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)));
  const rig = buildRig(model, spec);
  const body = model.primitives.filter((p) => p.name === 'body');
  let most = -Infinity;
  for (const state of states) {
    for (const t of [0, 0.25, 0.5, 0.75]) {
      const f = { def, state, stateT: t, walkPhase: state === 'walk' ? t * 2 * Math.PI : 0, side: 0, vy: 0, airborne: false,
        crouching: false, movingBack: false, attack: null, facing: 1, x: 0, y: 0, hitbox: Fighter.prototype.hitbox };
      const P = applyProportions(computePose(f, t, FORMS[spec.form]), clampBody(def.body));
      figureFrame(P);
      const m = solvePose(rig, P), sx = P.sx ?? 1;
      for (const p of body) {
        for (let v = 0; v < p.positions.length / 3; v += 2) {
          let X = 0, top = -1, tw = 0;
          for (let k = 0; k < 4; k++) {
            const w = p.weights[v * 4 + k];
            if (!w) continue;
            const j = p.joints[v * 4 + k], o = j * 16;
            if (w > tw) { tw = w; top = j; }
            X += w * (m[o] * p.positions[v * 3] + m[o + 4] * p.positions[v * 3 + 1] + m[o + 8] * p.positions[v * 3 + 2] + m[o + 12]);
          }
          if (TRUNK.test(model.jointNames[top])) most = Math.max(most, X * GL3D.UNIT * sx);
        }
      }
    }
  }
  return most;
}

const SCULPTED = FIGHTERS.filter((def) => MODELS3D[`sculpt:${def.id}`]);
const fronts = new Map(SCULPTED.map((def) => [def.id, trunkFront(def)]));

test('every sculpt keeps its trunk inside its own push half, outline and all', () => {
  for (const def of SCULPTED) {
    const half = new Fighter(def, 0, { update() {} }).pushHalf;
    assert.ok(fronts.get(def.id) + INK <= half,
      `${def.name}'s trunk stands ${fronts.get(def.id).toFixed(1)} px in front of the centre, past a push half of ${half}`);
  }
});

test('a push half is no wider than its sculpt needs, so close range stays close', () => {
  // the shared one, or the fighter's own: 3 px past the trunk at most
  for (const def of SCULPTED) {
    if (def.pushHalf === undefined) continue;
    assert.ok(def.pushHalf - fronts.get(def.id) <= 3,
      `${def.name}'s pushHalf of ${def.pushHalf} is ${(def.pushHalf - fronts.get(def.id)).toFixed(1)} px past the trunk`);
  }
  // and the shared one is what a player's own founder gets, whatever base it
  // was built on (a forged link can name a roster base, and `...base` spread
  // Jeff's breadth onto it)
  const own = buildCustomFighter({ name: 'TEST', company: 'TESTCO', baseId: 'bozo' });
  assert.equal(new Fighter(own, 0, { update() {} }).pushHalf, PHYS.PUSH_HALF, "a founder built on Jeff's base took his breadth");
  // and a challenge link's ghost, which spreads the fighter the link names
  for (const f of ['bozo', 'max', 'dex']) {
    const ghost = buildGhostFighter({ n: 'RIVAL', co: 'CO', f, pts: 0 });
    assert.equal(new Fighter(ghost, 0, { update() {} }).pushHalf, PHYS.PUSH_HALF, `a ghost named after ${f} took his breadth`);
  }
  assert.equal(new Fighter({ id: 'custom', body: {}, pushHalf: 5 }, 0, { update() {} }).pushHalf, PHYS.PUSH_HALF,
    'a push half narrower than the shared one');
});

test('two fighters walked into each other stop with their trunks apart, every pair', () => {
  const STUB_HUD = new Proxy({}, { get: () => () => {} });
  const STUB_ARENA = { id: 'test', name: 'TEST', draw() {}, mood: 'none' };
  const walk = (dir) => ({ isHuman: false, update(f) { f.pad = { left: dir < 0, right: dir > 0 }; } });
  for (const a of SCULPTED) {
    for (const b of SCULPTED) {
      const game = new Game({
        p1: { def: a, controller: { isHuman: false, update(f) { f.pad = {}; } } },
        p2: { def: b, controller: { isHuman: false, update(f) { f.pad = {}; } } },
        arena: STUB_ARENA, mode: 'solo', difficulty: 'founder', hud: STUB_HUD, onEnd: () => {}, seed: 7,
      });
      for (let i = 0; i < 600 && game.state !== 'fighting'; i++) game.update(1 / 60);
      const [p, q] = game.fighters;
      p.x = 400; q.x = 520;
      p.controller = walk(1); q.controller = walk(-1);
      for (let i = 0; i < 60; i++) game.update(1 / 60);
      const gap = q.x - p.x;
      assert.ok(gap >= pushGap(p, q) - 1e-6, `${a.name} and ${b.name} came within ${gap.toFixed(1)} px`);
      assert.ok(gap >= fronts.get(a.id) + fronts.get(b.id) + 2 * INK,
        `${a.name} and ${b.name} stand ${gap.toFixed(1)} px apart, their trunks ${(fronts.get(a.id) + fronts.get(b.id)).toFixed(1)} px deep`);
    }
  }
});

// In a corner the wall takes the cornered body's half of the push: split
// evenly and clamped, a fighter walked into a cornered rival stopped up to
// 4 px inside the gap (Adam into Jeff 60 of 64, their chests touching; the
// v3.21 review). The free body gives what the wall cannot.
test('a fighter walked into a cornered rival stops a push gap away, either wall, either slot', () => {
  const STUB_HUD = new Proxy({}, { get: () => () => {} });
  const STUB_ARENA = { id: 'test', name: 'TEST', draw() {}, mood: 'none' };
  const still = { isHuman: false, update(f) { f.pad = {}; } };
  const pairs = [['max', 'bozo'], ['bozo', 'dex'], ['zara', 'max']];
  for (const [ia, ib] of pairs) {
    for (const wall of [STAGE.MIN_X, STAGE.MAX_X]) {
      for (const slot of [0, 1]) {
        const a = FIGHTERS.find((f) => f.id === ia), b = FIGHTERS.find((f) => f.id === ib);
        const game = new Game({
          p1: { def: slot ? b : a, controller: still }, p2: { def: slot ? a : b, controller: still },
          arena: STUB_ARENA, mode: 'solo', difficulty: 'founder', hud: STUB_HUD, onEnd: () => {}, seed: 7,
        });
        for (let i = 0; i < 600 && game.state !== 'fighting'; i++) game.update(1 / 60);
        const walker = game.fighters[slot ? 1 : 0], cornered = game.fighters[slot ? 0 : 1];
        const out = wall === STAGE.MIN_X ? 1 : -1;
        cornered.x = wall; walker.x = wall + out * 140;
        walker.controller = { isHuman: false, update(f) { f.pad = { left: out > 0, right: out < 0 }; } };
        for (let i = 0; i < 60; i++) game.update(1 / 60);
        const gap = Math.abs(walker.x - cornered.x);
        assert.ok(gap >= pushGap(walker, cornered) - 1e-6,
          `${walker.def.name} walked into ${cornered.def.name} in the ${out > 0 ? 'left' : 'right'} corner and stopped ${gap.toFixed(1)} px away, inside ${pushGap(walker, cornered)}`);
      }
    }
  }
});
