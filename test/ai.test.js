// AI behaviour driven through a real Game — not just the decision functions
// in isolation. ai.js has shipped decision branches that looked reasonable in
// a unit test (a stance string comes back, a threshold trips) and then did
// nothing, or worse, locked the whole controller, once actually stepped
// against a live opponent. This file drives the real pad path the way
// rosterMoves.test.js drives human input, but for the AIController side.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/engine/game.js';
import { AIController } from '../src/engine/ai.js';
import { FIGHTERS } from '../src/data/fighters.js';

const STUB_HUD = new Proxy({}, { get: () => () => {} });
const STUB_ARENA = { id: 'test', name: 'TEST', draw() {}, mood: 'none' };
const EMPTY = {
  left: false, right: false, up: false, down: false, block: false,
  slap: false, punch: false, kick: false, launch: false,
  special: false, super: false, bomb: false, dash: false, steal: false,
};
const idler = () => ({ isHuman: false, update(f) { f.pad = { ...EMPTY }; } });

// scam's special (ALIGNMENT SHIFT) is the only shipped `type: 'stance'`
// special, so it is the one archetype that exercises the AI's stance branch
// in decide() at all. A passive dummy opponent never attacks or blocks, so
// nothing but the AI's own decisions can produce an attack or any movement.
test('an AI whose special is a stance toggle still attacks and moves', () => {
  const scam = FIGHTERS.find(f => f.id === 'scam');
  const dummy = FIGHTERS.find(f => f.id === 'zara');
  const game = new Game({
    p1: { def: scam, controller: new AIController('founder', scam) },
    p2: { def: dummy, controller: idler() },
    arena: STUB_ARENA, mode: 'solo', difficulty: 'founder',
    hud: STUB_HUD, onEnd: () => {}, seed: 20260814,
  });
  const [ai] = game.fighters;
  const x0 = ai.x;
  let attacks = 0;
  let maxWalked = 0;
  let prevState = ai.state;
  for (let i = 0; i < 900; i++) {
    game.update(1 / 60);
    if (ai.state === 'attack' && prevState !== 'attack') attacks++;
    prevState = ai.state;
    // Peak displacement, not final displacement: a KO ends the round and
    // resetForRound() snaps x back to the exact same spawn value, so if a
    // later round happens to be freshly reset at frame 900, "final - start"
    // would misreport a fighter that walked and fought all match as having
    // never moved at all.
    maxWalked = Math.max(maxWalked, Math.abs(ai.x - x0));
  }
  assert.ok(attacks > 0,
    `AI-controlled SCAM ALT never attacked over 900 frames (peak walk ${maxWalked}px) — `
    + 'the stance branch in decide() is locking the controller');
  assert.ok(maxWalked > 0, 'AI-controlled SCAM ALT never moved over 900 frames');
});

import { METER, RUNWAY, PHYS } from '../src/config.js';

function adamMatch(seed) {
  const max = FIGHTERS.find(f => f.id === 'max');
  const dummy = FIGHTERS.find(f => f.id === 'zara');
  return new Game({
    p1: { def: max, controller: new AIController('founder', max) },
    p2: { def: dummy, controller: idler() },
    arena: STUB_ARENA, mode: 'solo', difficulty: 'founder',
    hud: STUB_HUD, onEnd: () => {}, seed,
  });
}

// The step-1 failure, re-run against the new branch: an AI that reaches a
// `return` with no pulse and no direction stands still forever, and every unit
// test on the decision helper still passes while it does.
test('an AI-controlled Adam still attacks and moves while winded', () => {
  const game = adamMatch(20260815);
  const [ai] = game.fighters;
  assert.equal(ai.usesRunway, true, 'the fixture must be a runway user');
  const x0 = ai.x;
  let attacks = 0, maxWalked = 0, prev = ai.state;
  for (let i = 0; i < 900; i++) {
    ai.runway = 0;                          // hold him winded for the whole run
    game.update(1 / 60);
    if (ai.state === 'attack' && prev !== 'attack') attacks++;
    prev = ai.state;
    maxWalked = Math.max(maxWalked, Math.abs(ai.x - x0));
  }
  assert.ok(attacks > 0,
    `AI-controlled ADAM WEUMANN never attacked over 900 winded frames (peak walk ${maxWalked}px) — `
    + 'the winded branch in decide() is locking the controller');
  assert.ok(maxWalked > 0, 'AI-controlled ADAM WEUMANN never moved over 900 winded frames');
});

// The other half: a mechanic the AI never uses is a mechanic that exists only
// for the player. `fits` in decide() has no entry for an archetype it has not
// been taught, so BURN IT ALL would simply never come out.
test('an AI-controlled Adam actually throws BURN IT ALL on a full tank', () => {
  const game = adamMatch(20260816);
  const [ai] = game.fighters;
  let burns = 0, attacks = 0, prev = ai.state;
  for (let i = 0; i < 1200; i++) {
    // Enough for a special, never enough for a super or a bomb — so the branch
    // under test is the one that gets the decision, not the unicorn.
    ai.energy = METER.SPECIAL_COST + 10;
    ai.runway = RUNWAY.MAX;                 // a full tank: the throw he should want
    game.update(1 / 60);
    if (ai.attack && ai.attack.kind === 'burn') burns++;
    if (ai.state === 'attack' && prev !== 'attack') attacks++;
    prev = ai.state;
  }
  assert.ok(attacks > 0, 'the fixture AI did not attack at all');
  assert.ok(burns > 0,
    `AI-controlled ADAM WEUMANN threw ${attacks} attacks over 1200 frames on a full tank `
    + 'and never once threw BURN IT ALL — decide()\'s `fits` list has no burn entry');
});

// The melee branch of decide() rolls one number for slap, punch, kick, block
// and "create space". The last of those set a direction and then fell through
// to `dir = 0`, so it never stepped back: a rookie (aggr 0.45) simply stood
// in melee range doing nothing for about a third of its decisions there.
test('an AI that rolls "create space" in melee range actually steps back', () => {
  const kim = FIGHTERS.find(f => f.id === 'zara');
  const carl = FIGHTERS.find(f => f.id === 'dex');
  const game = new Game({
    p1: { def: kim, controller: new AIController('intern', kim) },
    p2: { def: carl, controller: idler() },
    arena: STUB_ARENA, mode: 'solo', difficulty: 'intern',
    hud: STUB_HUD, onEnd: () => {}, seed: 20261018,
  });
  for (let i = 0; i < 600 && game.state !== 'fighting'; i++) game.update(1 / 60);
  const [ai, dummy] = game.fighters;
  ai.x = 400; dummy.x = 480;
  ai.controller.decideT = 0;                 // decide on the next frame
  const real = Math.random;
  Math.random = () => 0.9;                   // past every attack and the block
  try {
    for (let i = 0; i < 8; i++) game.update(1 / 60);
  } finally {
    Math.random = real;
  }
  assert.ok(ai.x < 390, `the AI rolled "create space" and stayed put at x ${ai.x.toFixed(1)}`);
});

// ------------------------------------------------------- the rival's traps
//
// Kim's RUG PULL (and a built fighter's POISON PILL) bites a grounded rival
// within its radius once it arms. The AI never looked at game.traps, so every
// difficulty walked straight onto one, the same blind spot SAME-DAY DELIVERY
// had before the AI learned to read an order.

// The AI rolls Math.random for every hesitation and every choice, so each run
// gets its own seeded stream and a failure here reproduces. The same helper
// as delivery.test.js.
function seeded(seed, fn) {
  let s = seed >>> 0;
  const real = Math.random;
  Math.random = () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  try { return fn(); } finally { Math.random = real; }
}

const KIM = FIGHTERS.find(f => f.id === 'zara');
const RUG = KIM.commandNormals.find(c => c.archetype === 'trap');
const RIVALS = FIGHTERS.filter(f => !f.base && f.id !== 'zara').map(f => f.id);

// A live round with Kim's RUG PULL laid at `trapX` and Kim standing idle at
// `kimX`, so nothing but the rival's own decisions moves it. The rival starts
// at `aiX` with no meter, so it has to walk rather than special its way in,
// and its first decision lands somewhere in its cadence, as it would mid-round.
function rugPulled(id, level, { aiX = 200, trapX = 470, kimX = 760, armed = true, seed = 1 } = {}) {
  const def = FIGHTERS.find(f => f.id === id);
  const game = new Game({
    p1: { def, controller: idler() },
    p2: { def: KIM, controller: idler() },
    arena: STUB_ARENA, mode: 'solo', difficulty: level,
    hud: STUB_HUD, onEnd: () => {}, seed,
  });
  for (let i = 0; i < 600 && game.state !== 'fighting'; i++) game.update(1 / 60);
  const [ai, kim] = game.fighters;
  kim.x = trapX;
  game.spawnTrap(kim, RUG.params);
  kim.x = kimX;
  if (armed) game.traps[0].armT = 0;
  ai.x = aiX;
  ai.energy = 0;
  const c = new AIController(level, def);
  c.decideT = c.level.react * Math.random();
  ai.controller = c;
  let bites = 0;
  const strike = game.strike.bind(game);
  game.strike = (att, victim, m, fp) => {
    if (m && m.kind === 'trap') bites++;
    return strike(att, victim, m, fp);
  };
  return { game, ai, kim, bitten: () => bites > 0 };
}

// Every rival, three seeds each, `frames` of play; how many took the bite.
function trapRuns(level, opts, frames, check = () => true) {
  let bitten = 0, ok = 0, tries = 0;
  for (const id of RIVALS) {
    for (let seed = 1; seed <= 3; seed++) seeded(seed * 7919 + id.length, () => {
      const run = rugPulled(id, level, { ...opts, seed });
      for (let i = 0; i < frames; i++) run.game.update(1 / 60);
      tries++;
      if (run.bitten()) bitten++;
      if (check(run)) ok++;
    });
  }
  return { bitten, ok, tries };
}

test('a champion AI does not walk onto an armed trap between it and the rival', () => {
  // Three seconds is long enough to walk the whole way in, and well inside
  // the trap's 5.5 s life, so a trap that is gone was stepped on.
  const { bitten, tries } = trapRuns('mogul', {}, 180);
  assert.ok(bitten <= tries * 0.1,
    `a champion AI walked onto an armed RUG PULL in ${bitten} of ${tries} runs`);
});

test('a champion AI fights Kim from the edge of the trap she stands on', () => {
  // Kim on her own trap: the AI has to stop at the edge, and from there it is
  // still in reach, so it should land hits rather than stand there. An AI that
  // froze at the edge would pass the first check and fail the second.
  const { bitten, ok, tries } = trapRuns('mogul', { kimX: 470 }, 240,
    (run) => run.kim.hp < run.kim.maxHp);
  assert.ok(bitten <= tries * 0.15,
    `a champion AI stepped onto the trap under Kim in ${bitten} of ${tries} runs`);
  assert.ok(ok >= tries * 0.8, `a champion AI hit Kim from the edge in only ${ok} of ${tries} runs`);
});

test('a rookie AI still walks onto some traps', () => {
  // Noticing is gated on the difficulty's blockProb, like reading an order:
  // the trap is meant to be the rookie's problem.
  const { bitten, tries } = trapRuns('intern', {}, 180);
  assert.ok(bitten >= tries * 0.25,
    `a rookie AI walked onto an armed RUG PULL in only ${bitten} of ${tries} runs`);
});

test('a champion AI caught inside a trap that is still arming gets out', () => {
  // Laid point-blank, which a human Kim can do: the rival is already inside
  // the radius and has the 0.35 s arming time to leave.
  const { bitten, tries } = trapRuns('mogul', { aiX: 420, trapX: 470, kimX: 470, armed: false }, 90);
  assert.ok(bitten <= tries * 0.25,
    `a champion AI stood in an arming RUG PULL until it bit in ${bitten} of ${tries} runs`);
});

// Found in review, in roster matches: the chain reflex presses special after a
// kick connects without asking where it lands, and Lizbeth's special is a
// teleport that sets her down 84 px past the rival, so a champion who had read
// the trap teleported onto it anyway (59 bites in 640 Champion matches). The
// roll is pinned so the chain always fires, and the pulse is read directly
// because it is only applied to the pad on the following frame.
test('the chain reflex does not teleport onto a trap it has noticed', () => {
  const ava = FIGHTERS.find(f => f.id === 'ava');
  const chainOffKick = (trapX) => {
    const game = new Game({
      p1: { def: ava, controller: idler() }, p2: { def: KIM, controller: idler() },
      arena: STUB_ARENA, mode: 'solo', difficulty: 'mogul',
      hud: STUB_HUD, onEnd: () => {}, seed: 20261025,
    });
    for (let i = 0; i < 600 && game.state !== 'fighting'; i++) game.update(1 / 60);
    const [ai, kim] = game.fighters;
    kim.x = trapX;
    game.spawnTrap(kim, RUG.params);
    game.traps[0].armT = 0;
    ai.x = 300; kim.x = 380;                  // the teleport lands at 464
    ai.energy = METER.MAX - 1;                // a special, not the unicorn
    ai.state = 'attack';
    ai.attack = { kind: 'kick', hasHit: true, chainN: 3 };
    const c = new AIController('mogul', ava);
    c.seenTraps.add(game.traps[0]);
    const real = Math.random;
    Math.random = () => 0;
    try { c.update(ai, game); } finally { Math.random = real; }
    return !!c.pulse.special;
  };
  assert.equal(chainOffKick(470), false, 'teleported onto a noticed trap');
  assert.equal(chainOffKick(800), true, 'with the landing clear, the chain should still teleport');
});

// An AI in the air over a noticed trap, `y` px up at the top of its arc, with
// `dir` as its last decision and no further decision due before it lands.
function overTrap({ id = 'kai', x, dir, up = 140, vy = 0, buff = false }) {
  const def = FIGHTERS.find(f => f.id === id);
  const game = new Game({
    p1: { def, controller: idler() }, p2: { def: KIM, controller: idler() },
    arena: STUB_ARENA, mode: 'solo', difficulty: 'mogul',
    hud: STUB_HUD, onEnd: () => {}, seed: 20261025,
  });
  for (let i = 0; i < 600 && game.state !== 'fighting'; i++) game.update(1 / 60);
  const [ai, kim] = game.fighters;
  kim.x = 470;
  game.spawnTrap(kim, RUG.params);
  game.traps[0].armT = 0;
  kim.x = 800;
  ai.x = x;
  ai.airborne = true; ai.state = 'jump'; ai.y -= up; ai.vy = vy;
  if (buff) ai.speedBuffT = 5;
  const c = new AIController('mogul', def);
  c.seenTraps.add(game.traps[0]);
  c.dir = dir;
  c.decideT = 99;
  ai.controller = c;
  return { game, ai, c };
}
const landed = ({ game, ai }) => {
  for (let i = 0; i < 90 && ai.airborne; i++) game.update(1 / 60);
  game.update(1 / 60);                      // the frame the trap checks the landing
  return game.traps.length === 1;           // still down: it did not bite
};

// Found in review: the steering tried the drift it wanted, then none, then the
// opposite, and with no drift wanted (dir 0) that is three tries at falling
// straight down. A champion whose last decision was to stand still mid-jump
// came down on the trap it was flying over.
test('an AI in the air over a trap steers clear even when it meant to stand still', () => {
  assert.equal(landed(overTrap({ x: 440, dir: 0 })), true, 'fell straight onto the trap it was over');
});

// Found in review: an attack in the air holds the body where it is until the
// attack ends, so a slap at the top of a jump that was clearing RUG PULL
// dropped the fighter onto it. Over a trap, an attack that would do that is
// not thrown.
test('an AI jumping a trap does not swing in the air and drop onto it', () => {
  // Buffed, so the jump clears the trap from its edge if nothing stops the
  // drift. The slap comes over the middle of it, past the point where drifting
  // back the way it came would still land clear.
  const run = overTrap({ x: 384, dir: 1, up: 1, vy: PHYS.JUMP_V, buff: true });
  for (let i = 0; i < 20; i++) run.game.update(1 / 60);
  assert.ok(Math.abs(run.ai.x - 470) < 20, `the fixture should be over the middle of the trap, at ${run.ai.x}`);
  run.c.pulse.slap = true;
  assert.equal(landed(run), true, 'a slap mid-jump dropped it onto the trap');
});
