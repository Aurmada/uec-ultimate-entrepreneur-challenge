// Fighting-game effects for the 3D prototype (engine/fx.js state, engine/vfx.js
// drawing). Two promises matter here. With the flag off the effects must not
// exist at all, so the shipped game renders exactly as before. With it on,
// the parts that decide what is drawn (how big a burst is and when it dies,
// which limb a trail follows, when a cut-in is on screen) must behave. None of
// it may touch simulation time; the determinism test guards that boundary.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FXSystem, FX_STYLE } from '../src/engine/fx.js';
import { burstEnvelope, cutInEnvelope, limbsInWorld, strikingLimb, signatureColour } from '../src/engine/vfx.js';
import { FX_ART, METER } from '../src/config.js';
import { Game } from '../src/engine/game.js';
import { hashGameState } from '../src/net/online.js';
import { FIGHTERS } from '../src/data/fighters.js';

function withFlag(fn) {
  FX_STYLE.impact = true;
  try { fn(); } finally { FX_STYLE.impact = false; }
}

test('with the flag off, hits, guards and specials leave no effects state behind', () => {
  assert.equal(FX_STYLE.impact, false);
  const fx = new FXSystem();
  fx.impact(100, 200, 1, '#ffd23f', 1);
  fx.guard(100, 200, 1);
  fx.cutIn({ def: {} }, 'PITCH DECK STRIKE', '#29d9ff', -1, true);
  const hitstop = fx.hitstopT;
  fx.update(1 / 60);
  assert.deepEqual(fx.bursts, []);
  assert.equal(fx.playing, null);
  assert.equal(fx.dimT, 0);
  assert.equal(fx.hitstopT, hitstop);
});

test('a heavier hit bursts bigger, with more spikes, and lasts longer', () => {
  withFlag(() => {
    const fx = new FXSystem();
    fx.impact(0, 0, 1, '#fff', 0);
    fx.impact(0, 0, 1, '#fff', 1);
    const [light, heavy] = fx.bursts;
    assert.ok(heavy.r > light.r && heavy.spikes.length > light.spikes.length && heavy.dur > light.dur);
    assert.equal(light.r, FX_ART.IMPACT.R[0]);
    assert.equal(heavy.r, FX_ART.IMPACT.R[1]);
  });
});

test('spikes reach furthest along the blow', () => {
  withFlag(() => {
    const fx = new FXSystem();
    for (let i = 0; i < 40; i++) fx.impact(0, 0, 1, '#fff', 1);
    let along = 0, against = 0, na = 0, nb = 0;
    for (const b of fx.bursts) {
      for (const s of b.spikes) {
        if (Math.cos(s.a) > 0.5) { along += s.len; na++; }
        if (Math.cos(s.a) < -0.5) { against += s.len; nb++; }
      }
    }
    assert.ok(along / na > (against / nb) * 1.3, `along ${along / na}, against ${against / nb}`);
  });
});

test('a burst swells, fades out, and is gone once its time is up', () => {
  withFlag(() => {
    const fx = new FXSystem();
    fx.impact(0, 0, 1, '#fff', 0.5);
    const b = fx.bursts[0];
    const at = (t) => burstEnvelope({ ...b, t });
    assert.ok(at(0).size < at(b.dur * FX_ART.IMPACT.GROW).size, 'it should swell first');
    assert.equal(at(b.dur * 0.1).alpha, 1);
    assert.ok(at(b.dur).alpha <= 1e-9, 'it should have faded by the end');
    fx.update(b.dur * 0.5);
    assert.equal(fx.bursts.length, 1);
    fx.update(b.dur * 0.6);
    assert.equal(fx.bursts.length, 0);
  });
});

test('a cut-in slides in, holds, slides out, and a new one replaces it', () => {
  withFlag(() => {
    const fx = new FXSystem();
    const f = { def: {} };
    fx.cutIn(f, 'FIRST', '#fff', -1);
    fx.cutIn(f, 'SECOND', '#fff', 1, true);
    assert.equal(fx.playing.name, 'SECOND');
    assert.equal(fx.playing.dur, FX_ART.CUTIN.SUPER_DUR);
    assert.ok(fx.dimT >= fx.playing.dur, 'the stage stays dim for the whole cut-in');
    const C = FX_ART.CUTIN, c = fx.playing;
    assert.deepEqual(cutInEnvelope({ ...c, t: 0 }), { enter: 0, leave: 0 });
    const mid = cutInEnvelope({ ...c, t: c.dur / 2 });
    assert.equal(mid.enter, 1);
    assert.equal(mid.leave, 0);
    assert.equal(cutInEnvelope({ ...c, t: c.dur }).leave, 1);
    assert.ok(C.IN + C.OUT < C.DUR, 'a cut-in needs time to hold between sliding in and out');
    fx.update(c.dur + 0.01);
    assert.equal(fx.playing, null);
  });
});

test('limbs land in the world the way drawFighter puts them there', () => {
  const P = { rot: 0, armF: { x: 40, y: -150 }, armB: { x: -10, y: -140 }, legF: { x: 20, y: 0 }, legB: { x: -20, y: 0 } };
  const right = limbsInWorld({ x: 300, y: 480, facing: 1 }, P);
  const left = limbsInWorld({ x: 300, y: 480, facing: -1 }, P);
  assert.deepEqual(right[0], { x: 340, y: 330 });
  assert.deepEqual(left[0], { x: 260, y: 330 }, 'facing left mirrors the pose');
  const tipped = limbsInWorld({ x: 0, y: 0, facing: 1 }, { ...P, rot: Math.PI / 2 });
  assert.ok(Math.abs(tipped[0].x - 150) < 1e-9 && Math.abs(tipped[0].y - 40) < 1e-9, 'a knocked-down pose is turned');
});

test('the trail follows the limb that is actually striking', () => {
  const still = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }];
  const kick = [{ x: 0, y: 0 }, { x: 40, y: -30 }, { x: 90, y: -50 }];
  assert.deepEqual(strikingLimb([still, still, kick, still]), { limb: 2, travel: 50 + Math.hypot(50, 20) });
  assert.equal(strikingLimb([[], [], [], []]).limb, -1);
});

// The flag is per client: one peer in a live match can have ?gl and the other
// not. So the effects may draw anything they like but must never move the
// simulation, and the obvious way they could is hitstop, which is sim time.
// A busy scripted match (strikes, blocks, specials, a super) must fingerprint
// identically with the effects on and off, and must actually fire effects.
test('the effects never change the simulation', () => {
  const pads = [
    { right: 1 }, { right: 1, punch: 1 }, {}, {}, { kick: 1 }, {}, { block: 1 }, { block: 1 },
    { special: 1 }, {}, {}, { launch: 1 }, {}, { slap: 1 }, {}, { super: 1 }, {}, {}, { left: 1 },
  ];
  const script = (offset) => {
    let i = offset;
    return { isHuman: false, update(f) { f.pad = { ...pads[i++ % pads.length] }; } };
  };
  const run = () => {
    const game = new Game({
      p1: { def: FIGHTERS.find((f) => f.id === 'kai'), controller: script(0) },
      p2: { def: FIGHTERS.find((f) => f.id === 'dex'), controller: script(7) },
      arena: { id: 'test', draw() {}, mood: 'none' }, mode: 'solo', difficulty: 'founder',
      hud: new Proxy({}, { get: () => () => {} }), onEnd: () => {}, seed: 20260913,
    });
    game.fighters.forEach((f) => { f.energy = METER.MAX; f.x = f === game.fighters[0] ? 430 : 530; });
    const hashes = [];
    let effects = 0;
    for (let i = 0; i < 1200; i++) {
      if (i % 240 === 0) game.fighters.forEach((f) => { f.energy = METER.MAX; });
      game.update(1 / 60);
      effects += game.fx.bursts.length + (game.fx.playing ? 1 : 0);
      if (i % 10 === 0) hashes.push(hashGameState(game));
    }
    return { hashes, effects };
  };
  const off = run();
  FX_STYLE.impact = true;
  let on;
  try { on = run(); } finally { FX_STYLE.impact = false; }
  assert.equal(off.effects, 0);
  assert.ok(on.effects > 0, 'the scripted match fired no effects, so it proves nothing');
  assert.ok(new Set(off.hashes).size > 10, 'the match should actually move');
  assert.deepEqual(on.hashes, off.hashes, 'turning the effects on moved the simulation');
});

test('an effect wears the fighter\'s own colour, unless it is too pale to read', () => {
  const steve = FIGHTERS.find((f) => f.id === 'kai');
  assert.equal(signatureColour(steve), steve.c.suit, 'a near-white accent gives way to the suit');
  const kim = FIGHTERS.find((f) => f.id === 'zara');
  assert.equal(signatureColour(kim), kim.c.accent);
  assert.equal(signatureColour(undefined), '#ffd23f');
});
