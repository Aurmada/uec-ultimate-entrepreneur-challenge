// The animation/simulation boundary.
//
// Written BEFORE the keyframe system exists, deliberately. Pose data is
// render-only: it must never be read by the fighter state machine, by hit
// resolution, or by anything that crosses the wire. Live matches are
// deterministic lockstep, so the moment a pose can influence the sim, two
// peers running different animation data quietly diverge — and it surfaces as
// a voided match blamed on the network.
//
// This is exactly the kind of boundary that erodes one convenient read at a
// time, so it is pinned by test rather than by intention.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game } from '../src/engine/game.js';
import { hashGameState } from '../src/net/online.js';
import { FIGHTERS } from '../src/data/fighters.js';
import { challengePayload } from '../src/state.js';
import { METER } from '../src/config.js';

// A controller that replays a fixed script — the AI uses Math.random, which
// would make this test measure luck instead of determinism.
function scripted(script) {
  let i = 0;
  return {
    isHuman: false,
    update(f) {
      const frame = script[i % script.length];
      i++;
      f.pad = {
        left: !!frame.l, right: !!frame.r, up: !!frame.u, down: !!frame.d,
        block: !!frame.b, slap: !!frame.s, punch: !!frame.p, kick: !!frame.k,
        launch: !!frame.L, special: !!frame.x, super: false, bomb: false,
        dash: false, steal: false,
      };
    },
  };
}

// deliberately busy: walks, attacks, blocks, and holds forward so command
// normals resolve too. `x` (special) is pressed twice, far enough apart
// (fighter-state-foundation, 2026-08-14) to land on either side of
// STANCE.CD once p1's energy is seeded — see runMatch — so a stance switch
// actually lands inside the recorded match, not just a button press that
// starves on cooldown.
const SCRIPT_A = [
  { r: 1 }, { r: 1 }, { r: 1, p: 1 }, {}, {}, { r: 1, k: 1 }, {}, {}, {},
  { b: 1 }, { b: 1 }, { l: 1 }, { s: 1 }, {}, { r: 1, L: 1 }, {}, { x: 1 }, {},
];
const SCRIPT_B = [
  { l: 1 }, { l: 1, k: 1 }, {}, {}, { p: 1 }, {}, { u: 1 }, {}, {},
  { l: 1, p: 1 }, {}, {}, { b: 1 }, { r: 1 }, { s: 1 }, {}, {}, {},
];

const STUB_HUD = new Proxy({}, { get: () => () => {} });
const STUB_ARENA = { id: 'test', name: 'TEST', draw() {}, mood: 'none' };

// Runs a fixed match and fingerprints the simulation as it goes.
//
// p1 is 'scam' (was 'dex') so the `x` (special) presses in SCRIPT_A actually
// exercise ALIGNMENT SHIFT — 'dex' and 'zara' both carry ordinary specials,
// so a special press there would never touch stanceId at all and this test
// would prove nothing about the new archetype.
function runMatch(animOverrides) {
  const withAnim = (id) => {
    const def = FIGHTERS.find(f => f.id === id);
    return animOverrides === undefined ? def : { ...def, animOverrides };
  };
  const game = new Game({
    p1: { def: withAnim('scam'), controller: scripted(SCRIPT_A) },
    p2: { def: withAnim('zara'), controller: scripted(SCRIPT_B) },
    arena: STUB_ARENA, mode: 'solo', difficulty: 'founder',
    hud: STUB_HUD, onEnd: () => {}, seed: 20260731,
  });
  // A stance switch costs METER.SPECIAL_COST same as any other special, but
  // only once switchStance() actually succeeds — a refused switch (its own
  // cooldown still running) costs nothing, since the meter-overcharge fix.
  // Seeded here rather than earned through scripted hits so the switch is
  // guaranteed to land deterministically instead of depending on exactly
  // which frames connect — that would make this test measure combat luck,
  // the same reason `scripted()` exists instead of driving the AI.
  game.fighters[0].energy = METER.MAX;
  const hashes = [];
  for (let i = 0; i < 900; i++) {
    game.update(1 / 60);
    if (i % 15 === 0) hashes.push(hashGameState(game));
  }
  return hashes;
}

// A plausible-looking track set, and a hostile one. Neither may move the sim.
const REAL_TRACKS = {
  idle: [
    { t: 0, joints: { hipY: -66, armF: { x: 30, y: -98 } } },
    { t: 0.5, joints: { hipY: -80, armF: { x: 44, y: -130 } }, ease: 'outBack' },
    { t: 1, joints: { hipY: -66, armF: { x: 30, y: -98 } } },
  ],
  punch: [
    { t: 0, joints: { bodyLean: -0.3, sx: 1.1, sy: 0.9 } },
    { t: 0.4, joints: { bodyLean: 0.9, sx: 0.8, sy: 1.2 }, smear: true },
    { t: 1, joints: { bodyLean: 0 }, hold: true },
  ],
};
const HOSTILE_TRACKS = {
  punch: [
    { t: 0, joints: { dmg: 9999, reach: 9999, startup: 0, hp: 9999 } },
    { t: 1, joints: { hipY: NaN, sx: Infinity } },
  ],
  idle: 'not even an array',
  __proto__: null,
};

test('the simulation is identical with and without animation data', () => {
  const none = runMatch(undefined);
  const real = runMatch(REAL_TRACKS);
  assert.ok(none.length > 40, 'the run must actually cover a match');
  assert.deepEqual(real, none, 'animation data must not move the simulation');
});

test('hostile animation data cannot reach the simulation', () => {
  // Fields named like frame data, NaN, Infinity — a pose is not a place the
  // sim looks, so none of it can matter.
  assert.deepEqual(runMatch(HOSTILE_TRACKS), runMatch(undefined));
});

test('two runs of the same match agree with each other', () => {
  // Guards the test itself: if the sim were nondeterministic, the assertions
  // above would pass for the wrong reason.
  assert.deepEqual(runMatch(REAL_TRACKS), runMatch(REAL_TRACKS));
});

test('a match actually progresses — the fingerprints are not all the same', () => {
  const h = runMatch(undefined);
  assert.ok(new Set(h).size > 10, `expected a moving match, saw ${new Set(h).size} distinct states`);
});

test('animation never crosses the wire in a challenge link', () => {
  const payload = challengePayload({
    profile: { name: 'X', company: 'Y', baseId: 'b-neo', animOverrides: REAL_TRACKS },
  });
  const json = JSON.stringify(payload);
  for (const marker of ['animOverrides', 'joints', 'smear', 'outBack']) {
    assert.equal(json.includes(marker), false, `${marker} must not be in a link`);
  }
});

// A structural guard. The behavioural tests above prove the sim ignores
// animation TODAY; this one fails the moment someone reaches for it from a
// simulation module, which is how the boundary would actually be lost.
test('simulation modules never read animation data', () => {
  const SIM = [
    'src/engine/fighter.js',
    'src/engine/game.js',
    'src/engine/moves.js',
    'src/engine/ai.js',
    'src/net/online.js',
  ];
  const FORBIDDEN = /\banimOverrides\b|\bkeyframes?\b|\bsampleTrack\b|\bresolveParts\b|\bdrawParts\b|\bdef\.parts\b|from '\.\/anim\.js'|from '\.\.\/engine\/anim\.js'|from '\.\/parts\.js'|from '\.\.\/engine\/parts\.js'|gl3d\/|models3d|vfx\.js|stage\.js|\bFX_STYLE\b|\.bursts\b|\.playing\b|\.dimT\b/;
  for (const file of SIM) {
    const src = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    const hit = src.split('\n').findIndex(l => FORBIDDEN.test(l) && !l.trim().startsWith('//'));
    assert.equal(hit, -1,
      `${file}:${hit + 1} reads render-only data (pose, parts, 3D, stages or effects state) — lockstep depends on it staying out of the sim`);
  }
});

// A draining runway, a BURN IT ALL that lands, and a tank bought back.
//
// This used to replay SCRIPT_A and trust that its `x` presses became burns.
// They never did: SCRIPT_A mashes kick and launch, so almost every special
// press arrived while the one-slot chain buffer already held a basic and was
// thrown away. The run had 0 burns, a lowest runway of 51, and Adam was never
// winded, so it proved nothing about the move it is named after. Its only
// other check, `> 10 distinct hashes`, could not fail either: game.timer is
// hashed, so two fighters pressing nothing pass it.
//
// So Adam gets a script of his own. He walks into range, presses special from
// neutral, then jabs a few times, which lands the burn, empties the tank,
// leaves him winded, and refills it with ordinary hits. Every one of those is
// asserted, so the run cannot quietly stop exercising the runway again.
const rep = (n, frame) => Array.from({ length: n }, () => frame);
const SCRIPT_BURN = [
  ...rep(55, { r: 1 }), ...rep(6, {}), ...rep(3, { x: 1 }),
  ...rep(40, {}), ...rep(3, { p: 1 }), ...rep(47, {}),
];

function runBurnMatch() {
  const game = new Game({
    p1: { def: FIGHTERS.find(f => f.id === 'max'), controller: scripted(SCRIPT_BURN) },
    p2: { def: FIGHTERS.find(f => f.id === 'zara'), controller: scripted(SCRIPT_B) },
    arena: STUB_ARENA, mode: 'solo', difficulty: 'founder',
    hud: STUB_HUD, onEnd: () => {}, seed: 20260815,
  });
  game.fighters[0].energy = METER.MAX;
  // onBurnBlast fires once per BURN IT ALL, when its active window opens.
  let burns = 0;
  const blast = game.onBurnBlast.bind(game);
  game.onBurnBlast = (f) => { burns++; blast(f); };
  const adam = game.fighters[0];
  const hashes = [];
  let windedFrames = 0, emptied = false, refilled = false;
  for (let i = 0; i < 900; i++) {
    game.update(1 / 60);
    if (adam.winded) windedFrames++;
    if (adam.runway === 0) emptied = true;
    else if (emptied && adam.runway > 0) refilled = true;
    if (i % 15 === 0) hashes.push(hashGameState(game));
  }
  return { hashes, burns, windedFrames, emptied, refilled };
}

test('a match with a draining runway and a BURN IT ALL is deterministic', () => {
  const a = runBurnMatch();
  assert.ok(a.burns > 0, 'the script never threw BURN IT ALL');
  assert.ok(a.emptied, 'BURN IT ALL never connected: the tank was never emptied');
  assert.ok(a.windedFrames > 0, 'Adam was never winded');
  assert.ok(a.refilled, 'no landed hit ever bought the tank back');
  assert.deepEqual(runBurnMatch().hashes, a.hashes, 'two identical runway matches disagreed');
});
