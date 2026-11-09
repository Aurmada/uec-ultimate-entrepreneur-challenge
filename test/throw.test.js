// A throw puts the victim behind the thrower, whichever side they stood on.
//
// doGrab has always promised "thrown behind the attacker, sides swap", and
// from one side it was true. Until v3.9.2 it applied the knockback's sign twice,
// so the victim always flew to the RIGHT: thrown from the thrower's left they
// swapped sides as promised, thrown from the right they landed back where they
// started, and the thrower was shoved backward as the bodies came apart. Found
// because Carl kept landing on Kim's RUG PULL off his own throws.
//
// Driven through the real pad path in a real Game, the way rosterMoves.test.js
// drives every move, and from both player slots: when the two bodies share an
// x, pushApart breaks the tie by slot, so a fix that only works for p1 would
// pass half of this.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/engine/game.js';
import { FIGHTERS } from '../src/data/fighters.js';
import { METER, PHYS, STAGE, THROW, THROW_ARC } from '../src/config.js';
import { setThrows, throwPose, drawnAt } from '../src/engine/drawFighter.js';

const STUB_HUD = new Proxy({}, { get: () => () => {} });
const STUB_ARENA = { id: 'test', name: 'TEST', draw() {}, mood: 'none' };
const EMPTY = {
  left: false, right: false, up: false, down: false, block: false,
  slap: false, punch: false, kick: false, launch: false,
  special: false, super: false, bomb: false, dash: false, steal: false,
};
const idler = () => ({ isHuman: false, update(f) { f.pad = { ...EMPTY }; } });

// 'fwd' is toward the opponent, read from facing on each frame, so the same
// presser throws ASSET SEIZURE whichever way Carl is pointing.
function presser(keys, hold = 4) {
  let i = 0;
  return { isHuman: false, update(f) {
    const on = i < hold; i++;
    f.pad = { ...EMPTY };
    for (const k of keys) {
      if (k === 'fwd') f.pad[f.facing > 0 ? 'right' : 'left'] = i < hold + 2;
      else f.pad[k] = on;
    }
  } };
}

const CARL = FIGHTERS.find(f => f.id === 'dex');
const KIM = FIGHTERS.find(f => f.id === 'zara');
const AT = 480;      // mid-stage, well clear of both walls
const GAP = 60;      // inside both grabs' reach (rosterMoves tests command normals here)

// Carl in `slot`, standing at `at`, throws Kim, who starts `side` (-1 left,
// +1 right) of him.
function throwKim(slot, side, keys, at = AT) {
  const game = new Game({
    p1: { def: slot === 0 ? CARL : KIM, controller: idler() },
    p2: { def: slot === 0 ? KIM : CARL, controller: idler() },
    arena: STUB_ARENA, mode: 'solo', difficulty: 'founder',
    hud: STUB_HUD, onEnd: () => {}, seed: 20261025,
  });
  for (let i = 0; i < 600 && game.state !== 'fighting'; i++) game.update(1 / 60);
  assert.equal(game.state, 'fighting', 'round never went live');
  const carl = game.fighters[slot];
  const kim = game.fighters[1 - slot];
  carl.x = at; kim.x = at + side * GAP;
  carl.energy = METER.MAX;
  game.update(1 / 60);               // one free frame so both face the new layout
  carl.controller = presser(keys);
  const hp0 = kim.hp;
  // Long enough for the throw's hold (THROW.HOLD), the flight and the landing.
  for (let i = 0; i < 150; i++) game.update(1 / 60);
  return { landed: hp0 - kim.hp, kimSide: Math.sign(kim.x - carl.x), carlMoved: carl.x - at, kim, carl };
}

const MOVES = [
  ['HOSTILE TAKEOVER (special)', ['special']],
  ['ASSET SEIZURE (command grab)', ['fwd', 'kick']],
];

for (const [name, keys] of MOVES) {
  test(`${name} lands the victim behind the thrower from either side and either slot`, () => {
    for (const slot of [0, 1]) {
      for (const side of [-1, 1]) {
        const where = `Carl as p${slot + 1}, Kim starting on his ${side < 0 ? 'left' : 'right'}`;
        const r = throwKim(slot, side, keys);
        assert.ok(r.landed > 0, `${where}: the throw never connected`);
        assert.equal(r.kimSide, -side,
          `${where}: Kim landed on the side she started (Kim ${r.kim.x.toFixed(0)}, Carl ${r.carl.x.toFixed(0)})`);
        // The bodies separate after the throw and Carl gives up a little
        // ground doing it. It must be into the space Kim left, never backward:
        // backward is how he ended up on her traps.
        assert.ok(r.carlMoved * side >= 0,
          `${where}: Carl was shoved ${Math.abs(r.carlMoved).toFixed(0)} px backward by his own throw`);
      }
    }
  });
}

// Flush against a wall (x is clamped there, which is where a cornered fighter
// stands) there is no room behind the thrower. Both bodies then shared one x
// and pushApart broke the tie by slot: as p1 Carl threw out of the right
// corner but not the left, as p2 the reverse. A cornered throw swaps like any
// other, the victim goes into the corner, and the thrower comes out of it.
for (const [name, keys] of MOVES) {
  test(`${name} from flush against either wall swaps and walks the thrower out`, () => {
    for (const slot of [0, 1]) {
      for (const wall of [STAGE.MIN_X, STAGE.MAX_X]) {
        const side = wall === STAGE.MIN_X ? 1 : -1;     // Kim stands out in the stage
        const where = `Carl as p${slot + 1}, his back to the ${side > 0 ? 'left' : 'right'} wall`;
        const r = throwKim(slot, side, keys, wall);
        assert.ok(r.landed > 0, `${where}: the throw never connected`);
        assert.equal(r.kimSide, -side,
          `${where}: Kim landed back in front of him (Kim ${r.kim.x.toFixed(0)}, Carl ${r.carl.x.toFixed(0)})`);
        assert.ok(Math.abs(r.carl.x - wall) >= PHYS.BODY_W / 2,
          `${where}: Carl is still in the corner at ${r.carl.x.toFixed(0)}`);
      }
    }
  });
}

// The hold (v3.21). On contact the fight stops for THROW.HOLD while the throw
// is drawn: the victim hoisted over the thrower and set down behind him. Until
// v3.21 the victim was behind him from one frame to the next, set down 1 px
// away, and pushApart then parted the two by 25 px each in a single frame.
function grabKim(keys, side = 1) {
  const game = new Game({
    p1: { def: CARL, controller: idler() }, p2: { def: KIM, controller: idler() },
    arena: STUB_ARENA, mode: 'solo', difficulty: 'founder',
    hud: STUB_HUD, onEnd: () => {}, seed: 20261109,
  });
  for (let i = 0; i < 600 && game.state !== 'fighting'; i++) game.update(1 / 60);
  const [carl, kim] = game.fighters;
  carl.x = AT; kim.x = AT + side * GAP;
  carl.energy = METER.MAX;
  game.update(1 / 60);
  carl.controller = presser(keys);
  for (let i = 0; i < 90 && !game.fx.throws.length; i++) game.update(1 / 60);
  return { game, carl, kim };
}

for (const [name, keys] of MOVES) {
  test(`${name} holds for THROW.HOLD, drawn coming down where the fight parts them`, () => {
    for (const side of [-1, 1]) {
      const { game, carl, kim } = grabKim(keys, side);
      const [cue] = game.fx.throws;
      assert.ok(cue, `${name}: no throw was drawn`);
      assert.equal(cue.thrower, carl);
      assert.equal(cue.victim, kim);
      assert.equal(Math.sign(kim.x - carl.x), -side);
      // the hold: nothing moves in the fight, and the drawing runs through it
      const held = { carl: carl.x, kim: kim.x };
      const frames = Math.round(THROW.HOLD * 60);
      for (let i = 0; i < frames - 2; i++) game.update(1 / 60);
      assert.deepEqual({ carl: carl.x, kim: kim.x }, held, 'the fight moved during the hold');
      assert.equal(game.fx.throws.length, 1, 'the drawing ended before the hold did');
      // across the end of the hold the fight parts them (pushApart, 25 px or
      // more each in one frame) and the drawing does not jump with it
      setThrows(game.fx.throws);
      try {
        let was = { carl: drawnAt(carl).x, kim: drawnAt(kim).x }, jump = 0;
        for (let i = 0; i < 8; i++) {
          game.update(1 / 60);
          const now = { carl: drawnAt(carl).x, kim: drawnAt(kim).x };
          jump = Math.max(jump, Math.abs(now.carl - was.carl), Math.abs(now.kim - was.kim));
          was = now;
        }
        assert.ok(Math.abs(carl.x - held.carl) > 20, 'the fight no longer parts them after the hold (the test lost its point)');
        assert.ok(jump < 12, `the drawing jumped ${jump.toFixed(1)} px in a frame as the hold ended`);
      } finally {
        setThrows([]);
      }
      for (let i = 0; i < Math.ceil(THROW_ARC.OUT * 60) + 2; i++) game.update(1 / 60);
      assert.equal(game.fx.throws.length, 0, 'the drawing outlived its fade');
    }
  });
}

test('the throw is drawn from where Kim stood, over Carl and down behind him, then gives way', () => {
  const carl = { x: 400, y: STAGE.FLOOR, facing: 1, pushHalf: 28 }, kim = { x: 399, y: STAGE.FLOOR, facing: 1, pushHalf: 28 };
  const cue = { thrower: carl, victim: kim, from: { att: 400, def: 460, defY: STAGE.FLOOR }, hold: THROW.HOLD, age: 0 };
  setThrows([cue]);
  try {
    // where she stood
    let at = drawnAt(kim);
    assert.ok(Math.abs(at.x - 460) < 1e-6 && Math.abs(at.y - STAGE.FLOOR) < 1e-6, 'the drawing does not start where Kim stood');
    assert.equal(throwPose(kim).held, true);
    // over him: up off the floor, near his centre, turned head first
    cue.age = THROW.HOLD * 0.62;
    at = drawnAt(kim);
    assert.ok(at.y < STAGE.FLOOR - 80, `Kim is only ${(STAGE.FLOOR - at.y).toFixed(0)} px up going over`);
    assert.ok(Math.abs(at.x - drawnAt(carl).x) < 20, 'Kim does not go over Carl');
    assert.ok(throwPose(kim).rot > 1, 'Kim is not turned going over');
    // the thrower's arms are over his head, then behind him
    assert.ok(throwPose(carl).heave, 'Carl is not drawn heaving');
    // down half a push gap behind where Carl stood, where pushApart will put her
    cue.age = THROW.HOLD;
    assert.ok(Math.abs(drawnAt(kim).x - (400 - 28)) < 1e-6, `Kim comes down at ${drawnAt(kim).x.toFixed(1)}, not where the fight will part them`);
    assert.ok(Math.abs(drawnAt(carl).x - (400 + 28)) < 1e-6, 'Carl does not step through the throw');
    cue.age = THROW.HOLD + THROW_ARC.OUT;
    const end = throwPose(kim);
    assert.ok(Math.abs(end.dx) < 1e-6 && Math.abs(end.dy) < 1e-6 && Math.abs(end.rot) < 1e-6, 'the drawing never gives way');
    assert.equal(end.held, false, 'the hit flash stays held back after the hold');
  } finally {
    setThrows([]);
  }
});
