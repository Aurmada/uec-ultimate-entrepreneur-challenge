// The player-facing build.
//
// The load-bearing rule here is from v1.7: a human fighter's stats never depend
// on anything they picked. Variety comes from silhouette (free) and moves
// (priced, and required to balance to roughly zero). These tests exist because
// that rule is easy to break by accident — `Fighter` derives speed and HP from
// `style`, so ANY path that lets a player choice reach `style` is a regression.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCustomFighter, playerBuildCost, playerCommandNormals, clampPlayerBody,
  BASE_CHARACTERS, toCharacter,
  SPECIALS, PLAYER_SPECIALS,
} from '../src/data/fighters.js';
import { PLAYER_MOVES, PLAYER_BUDGET, getPlayerMove, toCommandNormal } from '../src/data/playerMoves.js';
import { validateCharacter, commandCost, COMMAND_SLOTS, DEFAULT_BODY } from '../src/data/schema.js';
import { Fighter } from '../src/engine/fighter.js';
import { PLAYER_STATS, BODY } from '../src/config.js';

const CTL = { update() {} };

test('a player fighter is always balanced, whatever base they picked', () => {
  for (const base of BASE_CHARACTERS) {
    const def = buildCustomFighter({ name: 'X', baseId: base.id });
    assert.equal(def.style, 'balanced', `${base.id} leaked a style onto the player`);
  }
});

// The actual thing v1.7 protects: identical stats at the engine level, not just
// identical data. Fighter reads `style`, not `stats`, so this is the real check.
test('every player fighter has identical stats in the engine', () => {
  const seen = new Set();
  for (const base of BASE_CHARACTERS) {
    const f = new Fighter(buildCustomFighter({ name: 'X', baseId: base.id }), 0, CTL);
    seen.add(`${f.stats.speed}/${f.stats.power}/${f.stats.hp}`);
  }
  assert.equal(seen.size, 1, `player stats varied by base pick: ${[...seen].join(' vs ')}`);
  assert.deepEqual([...seen], [`${PLAYER_STATS.speed}/${PLAYER_STATS.power}/${PLAYER_STATS.hp}`]);
});

test('moves and body do not move a player\'s stats either', () => {
  const plain = new Fighter(buildCustomFighter({ name: 'A' }), 0, CTL);
  const loaded = new Fighter(buildCustomFighter({
    name: 'B', moves: ['stonewall', 'sweep'], body: { height: 1.2, build: 1.2, shoulders: 1.25 },
  }), 0, CTL);
  assert.deepEqual(loaded.stats, plain.stats);
});

// ---------------------------------------------------------------- the economy

test('a stock build costs nothing', () => {
  assert.ok(Math.abs(playerBuildCost({})) < 0.001);
});

test('the menu has both sides of a trade', () => {
  const costs = PLAYER_MOVES.map(m => commandCost(toCommandNormal(m)));
  assert.ok(costs.some(c => c > 3), 'nothing on the menu is worth saving up for');
  assert.ok(costs.some(c => c < -3), 'nothing on the menu pays budget back');
});

test('an expensive move can be paid for by a cheap one', () => {
  const solo = playerBuildCost({ moves: ['uppercut'] });
  const paired = playerBuildCost({ moves: ['uppercut', 'sweep'] });
  assert.ok(solo > PLAYER_BUDGET, 'the expensive move should not be affordable alone');
  assert.ok(Math.abs(paired) <= PLAYER_BUDGET, `pairing should balance, got ${paired.toFixed(1)}`);
});

// LAWYERED is the priciest thing on the menu, and the one whose price is most
// easily pushed out of reach: it has to be fast enough to actually counter, and
// fwd+launch charges dearly for speed. At counter damage 13 it cost 13 and NO
// pairing on the menu could afford it — the creator collapsed to a single legal
// build, which is a worse failure than the move being weak. Pinned here so the
// most expensive corner of the budget always has more than one way in.
test('the priciest move costs a real trade but never strands the build', () => {
  const solo = playerBuildCost({ moves: ['stonewall'] });
  assert.ok(solo > PLAYER_BUDGET, 'a counter that beats three basics should not be free');

  const affordable = PLAYER_MOVES
    .filter(m => m.id !== 'stonewall')
    .filter(m => Math.abs(playerBuildCost({ moves: ['stonewall', m.id] })) <= PLAYER_BUDGET);
  assert.ok(affordable.length >= 2,
    `at least two moves must pay for it, got ${affordable.length}: ${affordable.map(m => m.id)}`);

  const costs = PLAYER_MOVES.map(m => commandCost(toCommandNormal(m)));
  assert.equal(Math.max(...costs), commandCost(toCommandNormal(getPlayerMove('stonewall'))),
    'if something overtakes it as the priciest move, this test is guarding the wrong one');
});

test('an expensive move can also be paid for with a bigger body', () => {
  const solo = playerBuildCost({ moves: ['uppercut'] });
  const bigger = playerBuildCost({ moves: ['uppercut'], body: { height: 1.06, build: 1.06 } });
  assert.ok(Math.abs(bigger) < Math.abs(solo), 'a bigger hurtbox must refund');
  assert.ok(Math.abs(bigger) <= PLAYER_BUDGET);
});

test('stacking every strong option lands far outside the gate', () => {
  const cost = playerBuildCost({
    moves: ['stonewall', 'uppercut', 'papertrail'],
    body: { height: 0.85, build: 0.9, reach: 1.2 },       // small, long-armed
  });
  assert.ok(cost > PLAYER_BUDGET * 3, `expected a clear reject, got ${cost.toFixed(1)}`);
});

test('silhouette is free — shoulders, stride and head cost nothing', () => {
  const base = playerBuildCost({});
  for (const knob of ['shoulders', 'stride', 'head']) {
    const [lo, hi] = BODY[knob];
    assert.ok(Math.abs(playerBuildCost({ body: { [knob]: hi } }) - base) < 0.001, `${knob} max should be free`);
    assert.ok(Math.abs(playerBuildCost({ body: { [knob]: lo } }) - base) < 0.001, `${knob} min should be free`);
  }
});

// ---------------------------------------------------------------- robustness

test('an unknown move id is dropped, not thrown', () => {
  assert.deepEqual(playerCommandNormals(['nope', 'also-nope']), []);
  assert.equal(playerCommandNormals(['sweep', 'nope']).length, 1);
});

test('two moves on the same input cannot both exist', () => {
  // uppercut and haymaker both live on fwd+punch
  const got = playerCommandNormals(['uppercut', 'haymaker']);
  assert.equal(got.length, 1);
  assert.equal(got[0].slot, 'fwd+punch');
});

test('a profile from an older menu still loads', () => {
  for (const junk of [null, undefined, 'nope', 42, {}, ['ghost-move']]) {
    assert.doesNotThrow(() => buildCustomFighter({ name: 'X', moves: junk }));
  }
});

test('body values outside the bounds are clamped, never passed through', () => {
  const b = clampPlayerBody({ height: 99, build: -5, reach: NaN, shoulders: 'tall' });
  for (const [key, v] of Object.entries(b)) {
    const [lo, hi] = BODY[key];
    assert.ok(v >= lo && v <= hi, `${key} = ${v} escaped [${lo}, ${hi}]`);
  }
});

test('every menu move names a real command slot and a real basic', () => {
  for (const m of PLAYER_MOVES) {
    assert.ok(COMMAND_SLOTS.includes(m.slot), `${m.id} has slot ${m.slot}`);
    assert.ok(m.displayName && m.displayName.length <= 24, `${m.id} display name`);
    assert.ok(m.blurb && m.blurb.length > 20, `${m.id} needs a blurb a player can read`);
  }
});

test('the menu spreads across inputs so a build is not forced onto one button', () => {
  const slots = new Set(PLAYER_MOVES.map(m => m.slot));
  assert.ok(slots.size >= 3, `menu only covers ${slots.size} input(s)`);
});

// ---------------------------------------------------------------- end to end

test('a built player fighter is a valid character', () => {
  const def = buildCustomFighter({
    name: 'FIRDOUS', company: 'AURMADA',
    moves: ['stonewall', 'sweep'],
    body: { shoulders: 1.2, stride: 1.1, height: 1.02 },
  });
  const r = validateCharacter(toCharacter(def));
  assert.equal(r.ok, true, r.errors.join('; '));
});

test('a player fighter actually gets its moves in the engine', () => {
  const f = new Fighter(buildCustomFighter({ name: 'X', moves: ['sweep'] }), 0, CTL);
  assert.equal(f.cmdBySlot.size, 1);
  f.facing = 1;
  f.pad = { right: true };
  const resolved = f.resolveBasic('kick');
  assert.notEqual(typeof resolved, 'string', 'forward+kick should give the chosen move');
  assert.equal(resolved.displayName, getPlayerMove('sweep').displayName);
});

// ------------------------------------------------- the link a player shares
//
// A challenge link is how a player's founder reaches anyone else. If the build
// changes on the way through, the link promises a fighter it does not deliver.

import { challengePayload, decodeChallenge, encodeChallengePayload } from '../src/state.js';
import { buildGhostFighter } from '../src/data/fighters.js';

const PROFILE = {
  name: 'FIRDOUS', company: 'AURMADA', baseId: 'b-neo',
  moves: ['stonewall', 'sweep'],
  body: { shoulders: 1.2, stride: 1.1, height: 1.02 },
};
const roundTrip = (p) => decodeChallenge(encodeChallengePayload(challengePayload({ profile: p })));

test('a build survives a challenge link with its cost unchanged', () => {
  const before = playerBuildCost(PROFILE);
  const got = roundTrip(PROFILE);
  assert.ok(got, 'the link must decode');
  const after = validateCharacter(toCharacter(buildGhostFighter(got))).cost;
  assert.ok(Math.abs(before - after) < 0.01,
    `cost drifted across the link: ${before.toFixed(2)} → ${after.toFixed(2)}`);
});

// The bug this guards: frameData alone does not describe a counter or a trap.
// Their behaviour lives in `params`, so a link that drops it hands the ghost a
// default hazard instead of the one the player chose.
test('a counter keeps its window and damage across the link', () => {
  const got = roundTrip({ ...PROFILE, moves: ['stonewall'] });
  const cn = got.commandNormals.find(c => c.archetype === 'counter');
  assert.ok(cn, 'the counter must survive');
  assert.deepEqual(cn.params, getPlayerMove('stonewall').params);
});

test('a trap keeps its lifetime and radius across the link', () => {
  const got = roundTrip({ ...PROFILE, moves: ['bananaskin'] });
  const cn = got.commandNormals.find(c => c.archetype === 'trap');
  assert.ok(cn);
  assert.deepEqual(cn.params, getPlayerMove('bananaskin').params);
});

test('a ghost fights with the moves the player picked', () => {
  const ghost = buildGhostFighter(roundTrip(PROFILE));
  const names = (ghost.commandNormals || []).map(c => c.displayName).sort();
  assert.deepEqual(names, ['LAWYERED', 'RUNWAY SWEEP']);
  assert.equal(ghost.style, 'balanced', 'a ghost is another human — same stat line');
});

test('a link stays short enough to paste', () => {
  const link = encodeChallengePayload(challengePayload({ profile: PROFILE }));
  assert.ok(link.length < 700, `link is ${link.length} chars`);
});

test('a hand-edited move id in a link cannot invent a move', () => {
  const payload = challengePayload({ profile: PROFILE });
  payload.cn[0].m = 'not-a-real-move';
  const got = decodeChallenge(encodeChallengePayload(payload));
  // falls back to the carried frame data, which is clamped and validated;
  // what it must never do is fabricate params out of an unknown id
  if (got) for (const cn of got.commandNormals) assert.equal(cn.params, undefined);
});

// ROSTER-ONLY SPECIALS MUST NOT REACH A PLAYER BUILD.
//
// A player's founder is pinned to zero net power budget — that rule exists
// because a cosmetic wardrobe click once turned out to be worth a 33% power
// swing on the ranked ladder. A roster special is authored for one character
// and priced by nobody, so handing one to a player build reopens exactly that
// hole.
//
// There are TWO ways in, and the second is the dangerous one:
//   1. the founder creator's dropdown, built from SPECIALS
//   2. buildGhostFighter, which reads `sp` out of a DECODED CHALLENGE LINK —
//      attacker-controlled, and the decoder's own contract is that it
//      validates rather than trusts.

test('a roster-only special is not offered to player builds', () => {
  assert.ok(SPECIALS.alignmentshift, 'fixture assumes alignmentshift exists');
  assert.equal(SPECIALS.alignmentshift.rosterOnly, true);
  assert.equal(PLAYER_SPECIALS.alignmentshift, undefined,
    'a rosterOnly special must not appear in the player menu');
  assert.ok(PLAYER_SPECIALS.pitchdeck, 'ordinary specials are still offered');
});

test('a challenge link cannot smuggle a roster-only special onto a ghost', () => {
  const ghost = buildGhostFighter({ n: 'ATTACKER', sp: 'alignmentshift' });
  assert.notEqual(ghost.special, 'alignmentshift',
    'buildGhostFighter accepted a roster-only special from a hand-edited link');
});

test('a challenge link can still carry an ordinary special', () => {
  const ghost = buildGhostFighter({ n: 'RIVAL', sp: 'takeover' });
  assert.equal(ghost.special, 'takeover');
});
