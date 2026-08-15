// RUNWAY — a resource that drains on a clock, and the fighter states that
// hang off it. Registry mechanics (declaration, reset, hashing) live in
// fighterState.test.js; everything a runway DOES lives here.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Fighter } from '../src/engine/fighter.js';
import { FIGHTERS, getFighter } from '../src/data/fighters.js';
import { RUNWAY } from '../src/config.js';

const stub = { isHuman: false, update() {} };
const mk = (def, side = 0) => new Fighter(def, side, stub);

// ava, who does not use runway. FIGHTERS[0] and the neutral case throughout.
const plain = () => mk(FIGHTERS[0]);

test('usesRunway is a character flag, and it defaults off', () => {
  assert.equal(plain().usesRunway, false);
  assert.equal(mk({ ...FIGHTERS[0], usesRunway: true }).usesRunway, true);
});

test('a fighter without usesRunway is never winded, even at zero', () => {
  const f = plain();
  f.runway = 0;
  assert.equal(f.winded, false,
    'a fighter who does not use the resource must never suffer its penalty');
  assert.equal(f.speedMult, plain().speedMult);
  assert.equal(f.dmgMult, plain().dmgMult);
  assert.equal(f.takenMult, plain().takenMult);
});

test('winded makes a fighter slower, weaker and easier to hit', () => {
  const f = mk({ ...FIGHTERS[0], usesRunway: true });
  const speed0 = f.speedMult, dmg0 = f.dmgMult, taken0 = f.takenMult;
  f.runway = 0;
  assert.equal(f.winded, true);
  assert.ok(Math.abs(f.speedMult - speed0 * RUNWAY.WINDED.speed) < 1e-9);
  assert.ok(Math.abs(f.dmgMult - dmg0 * RUNWAY.WINDED.dmg) < 1e-9);
  assert.ok(Math.abs(f.takenMult - taken0 * RUNWAY.WINDED.taken) < 1e-9);
});

// The whole reason `winded` is derived rather than a timer: there is nothing
// to expire, so the instant a refill lands the penalty is gone.
test('winded clears the moment runway is above zero — there is no separate timer', () => {
  const f = mk({ ...FIGHTERS[0], usesRunway: true });
  f.runway = 0;
  assert.equal(f.winded, true);
  f.runway = 0.001;
  assert.equal(f.winded, false);
});

test('winded stacks multiplicatively with the buffs already in the getters', () => {
  const f = mk({ ...FIGHTERS[0], usesRunway: true });
  f.runway = 0;
  const windedOnly = f.dmgMult;
  f.unicornT = 5;
  assert.ok(f.dmgMult > windedOnly, 'Unicorn must still add on top of being winded');
});

import { Game } from '../src/engine/game.js';
import { ROUND, PARRY } from '../src/config.js';

const STUB_HUD = new Proxy({}, { get: () => () => {} });
const STUB_ARENA = { id: 'test', name: 'TEST', draw() {}, mood: 'none' };
const EMPTY = {
  left: false, right: false, up: false, down: false, block: false,
  slap: false, punch: false, kick: false, launch: false,
  special: false, super: false, bomb: false, dash: false, steal: false,
};
const idler = () => ({ isHuman: false, update(f) { f.pad = { ...EMPTY }; } });

// Adam is the only character who opts in. p1 is always the runway user here.
function match({ p1 = 'max', p2 = 'zara', c1 = idler(), c2 = idler() } = {}) {
  return new Game({
    p1: { def: getFighter(p1), controller: c1 },
    p2: { def: getFighter(p2), controller: c2 },
    arena: STUB_ARENA, mode: 'solo', difficulty: 'founder',
    hud: STUB_HUD, onEnd: () => {}, seed: 20260815,
  });
}

function toFighting(game) {
  for (let i = 0; i < 600 && game.state !== 'fighting'; i++) game.update(1 / 60);
  assert.equal(game.state, 'fighting', 'round never went live');
  return game;
}

const step = (game, n) => { for (let i = 0; i < n; i++) game.update(1 / 60); };

test('runway drains at DRAIN per second while the round is live', () => {
  const game = toFighting(match());
  const before = game.fighters[0].runway;
  step(game, 60);
  const spent = before - game.fighters[0].runway;
  assert.ok(Math.abs(spent - RUNWAY.DRAIN) < 0.2,
    `expected about ${RUNWAY.DRAIN} per second, saw ${spent.toFixed(3)}`);
});

// A resource that ticks while "ROUND 1" is still on screen would hand the
// player a fight they had already started losing before they could press
// anything.
test('runway does not move during the round intro', () => {
  const game = match();
  assert.equal(game.state, 'intro');
  step(game, 30);
  assert.equal(game.state, 'intro', 'the fixture must still be in the intro');
  assert.equal(game.fighters[0].runway, RUNWAY.MAX);
});

test('runway does not move after a KO', () => {
  const game = toFighting(match());
  step(game, 30);
  game.fighters[1].hp = 0;
  step(game, 1);
  assert.equal(game.state, 'roundEnd');
  const frozen = game.fighters[0].runway;
  assert.ok(frozen < RUNWAY.MAX, 'the fixture must have drained something first');
  step(game, 60);
  assert.equal(game.fighters[0].runway, frozen, 'the tank ticked through a KO');
});

test('a paused match does not drain', () => {
  const game = toFighting(match());
  step(game, 30);
  const frozen = game.fighters[0].runway;
  game.paused = true;
  step(game, 60);
  assert.equal(game.fighters[0].runway, frozen);
});

// Free from the registry's `round: 'reset'`, but this is the guarantee the
// whole mechanic rests on, so it is asserted rather than assumed.
test('a new round starts on a full tank', () => {
  const game = toFighting(match());
  step(game, 120);
  assert.ok(game.fighters[0].runway < RUNWAY.MAX);
  game.fighters[1].hp = 0;
  for (let i = 0; i < 600 && game.roundNum === 1; i++) game.update(1 / 60);
  assert.equal(game.roundNum, 2, 'the match never reached a second round');
  assert.equal(game.fighters[0].runway, RUNWAY.MAX);
});

test('a fighter without usesRunway never drains, across a whole round', () => {
  const game = toFighting(match({ p1: 'zara', p2: 'kai' }));
  step(game, Math.ceil(ROUND.TIME * 60) - 60);
  for (const f of game.fighters) {
    assert.equal(f.usesRunway, false, 'the fixture must be two non-users');
    assert.equal(f.runway, RUNWAY.MAX, `${f.def.id} drained without opting in`);
    assert.equal(f.winded, false);
  }
});

// A pad that presses one button for a few frames, then stops. `hold` outlives
// a basic's startup so the swing actually comes out.
function presser(keys, hold = 4) {
  let i = 0;
  return { isHuman: false, update(f) {
    const on = i < hold; i++;
    f.pad = { ...EMPTY };
    for (const k of keys) f.pad[k] = on;
  } };
}

// Runs a live round with p1 pressing `keys` at point-blank range and reports
// every frame on which the tank went UP — a refill is the only thing that can
// move it in that direction.
function refillsWhilePressing(keys, { runway = 50, energy = 0, gap = 60, frames = 120,
                                      p1 = 'max', dummy = idler() } = {}) {
  const game = toFighting(match({ p1, c1: presser(keys), c2: dummy }));
  const [a, b] = game.fighters;
  a.x = 480; b.x = 480 + gap; a.y = b.y = 480;
  a.runway = runway; a.energy = energy;
  const hp0 = b.hp, defEnergy0 = b.energy;
  const jumps = [];
  for (let i = 0; i < frames; i++) {
    const before = a.runway;
    game.update(1 / 60);
    if (a.runway > before) jumps.push(a.runway - before);
    b.x = a.x + gap; b.vx = 0;             // hold range; knockback is not a miss
  }
  return { jumps, runway: a.runway, dmg: hp0 - b.hp, defEnergy: b.energy - defEnergy0 };
}

test('a landed hit refills the tank', () => {
  const r = refillsWhilePressing(['punch']);
  assert.ok(r.jumps.length > 0, 'a connecting punch never topped the tank up');
  // The drain runs on the same frame, so the observed jump is REFILL minus one
  // frame of drain. Anything near 15 is the refill; anything near 0 is not.
  const jump = r.jumps[0] + RUNWAY.DRAIN / 60;
  assert.ok(Math.abs(jump - RUNWAY.REFILL_ON_HIT) < 0.2,
    `expected a jump of about ${RUNWAY.REFILL_ON_HIT}, saw ${r.jumps[0].toFixed(3)}`);
});

test('a refill is capped at MAX', () => {
  const r = refillsWhilePressing(['punch'], { runway: RUNWAY.MAX - 2 });
  assert.ok(r.jumps.length > 0, 'the fixture must actually land a hit');
  assert.ok(r.runway <= RUNWAY.MAX, `runway overflowed to ${r.runway}`);
});

// A grab is the other site that awards METER.HIT_DEAL, so it is the other site
// that refills. Adam does not own a grab special, so this borrows one.
test('a grab refills too — the rule is "wherever HIT_DEAL is awarded"', () => {
  const grabber = { ...getFighter('max'), special: 'takeover' };
  const game = toFighting(new Game({
    p1: { def: grabber, controller: presser(['special']) },
    p2: { def: getFighter('zara'), controller: idler() },
    arena: STUB_ARENA, mode: 'solo', difficulty: 'founder',
    hud: STUB_HUD, onEnd: () => {}, seed: 20260815,
  }));
  const [a, b] = game.fighters;
  a.x = 480; b.x = 540; a.y = b.y = 480;
  a.runway = 40; a.energy = 100;
  let jumped = false;
  for (let i = 0; i < 120; i++) {
    const before = a.runway;
    game.update(1 / 60);
    if (a.runway > before) jumped = true;
  }
  assert.equal(jumped, true, 'a landed HOSTILE TAKEOVER did not refill the tank');
});

// A blocked hit is not a landed one. Note WHICH blocked outcome this actually
// exercises, because it is not the obvious one: holding block re-enters
// `setState('block')` every frame, `stateT` therefore never leaves 0, and
// `def.stateT <= PARRY.WINDOW` is consequently always true — so a held block
// currently resolves every non-grab hit as a PARRY and the chip branch below it
// is unreachable (verified against the live engine, 2026-08-15; see this plan's
// Notes — it is a pre-existing finding, not something this work introduced).
// Both branches return before the refill either way, and the PARRY.ENERGY
// assertion pins which one ran so this cannot silently start passing for a
// third reason.
test('a hit turned away by a block does not refill', () => {
  const blocker = { isHuman: false, update(f) { f.pad = { ...EMPTY, block: true }; } };
  const r = refillsWhilePressing(['punch'], { dummy: blocker });
  assert.deepEqual(r.jumps, [], 'a blocked punch topped the tank up');
  assert.equal(r.dmg, 0, 'the fixture must not have landed a clean hit');
  assert.equal(r.defEnergy, PARRY.ENERGY, 'the fixture must have resolved as a parry');
});

test('a fighter without usesRunway is not refilled either', () => {
  const r = refillsWhilePressing(['punch'], { p1: 'zara' });
  assert.deepEqual(r.jumps, []);
  // `runway` was forced to 50 by the fixture and zara never opts in, so
  // nothing drains or refills it — it must sit exactly where it was left,
  // not snap back to a full tank it was never draining from in the first
  // place. (Plan bug: the original assertion here was RUNWAY.MAX, which
  // nothing in the implementation — correctly — makes true.)
  assert.equal(r.runway, 50);
});

import { SPECIALS, PLAYER_SPECIALS } from '../src/data/fighters.js';

// Throws p1's special at point-blank and reports what it did.
function throwSpecial({ p1 = 'max', runway = RUNWAY.MAX, gap = 70, frames = 120 } = {}) {
  const game = toFighting(match({
    p1, c1: presser(['special'], 6), c2: idler(),
  }));
  const [a, b] = game.fighters;
  a.x = 480; b.x = 480 + gap; a.y = b.y = 480;
  a.runway = runway; a.energy = 100;
  const hp0 = b.hp;
  let runwayAtContact = null, runwayAfterContact = null;
  for (let i = 0; i < frames; i++) {
    const hpBefore = b.hp;
    const rwBefore = a.runway;
    game.update(1 / 60);
    if (b.hp < hpBefore && runwayAtContact === null) {
      runwayAtContact = rwBefore;
      runwayAfterContact = a.runway;
    }
    b.x = a.x + gap; b.vx = 0;
  }
  return { dmg: hp0 - b.hp, runwayAtContact, runwayAfterContact, runway: a.runway, f: a };
}

test('BURN IT ALL is Adam\'s special, and it is a burn', () => {
  assert.equal(getFighter('max').special, 'burnitall');
  assert.equal(SPECIALS.burnitall.type, 'burn');
});

test('BURN IT ALL damage scales with the runway it spends', () => {
  const full = throwSpecial({ runway: RUNWAY.MAX });
  const low = throwSpecial({ runway: 10 });
  assert.ok(full.dmg > 0 && low.dmg > 0, 'both throws must connect');
  assert.ok(full.dmg > low.dmg + 10,
    `a full tank (${full.dmg}) should hit far harder than a near-empty one (${low.dmg})`);
  // 8 + 100 * 0.18 = 26 at a full tank, less a fraction for the startup's drain.
  assert.ok(full.dmg >= 24 && full.dmg <= 26, `full-tank damage was ${full.dmg}`);
  assert.ok(low.dmg >= 9 && low.dmg <= 10, `near-empty damage was ${low.dmg}`);
});

test('BURN IT ALL empties the tank by connecting, and leaves Adam winded', () => {
  const r = throwSpecial({ runway: RUNWAY.MAX });
  assert.ok(r.runwayAtContact > RUNWAY.MAX - 2, 'the fixture must connect on a full tank');
  assert.equal(r.runwayAfterContact, 0, 'the move must torch every remaining dollar');
  assert.equal(r.f.winded, true, 'and it must leave him winded by construction');
});

// A DELIBERATE EXCEPTION to the refill rule, and the one most likely to be
// "fixed" by someone reading refillRunway in isolation. Refunding 15 on its
// own hit would hand back the entire cost of the move.
test('BURN IT ALL does not refill on its own hit', () => {
  const r = throwSpecial({ runway: 60 });
  assert.equal(r.runwayAfterContact, 0,
    'a refill on the burn\'s own hit would leave 15 here, not 0');
});

// The move is on the roster because RUNWAY is on the roster. Anyone holding it
// without the resource gets the floor and nothing else, so there is no version
// of "pick BURN IT ALL, keep your tank full forever" that pays.
test('without usesRunway, BURN IT ALL gets no scaling at all', () => {
  const game = toFighting(new Game({
    p1: { def: { ...getFighter('kai'), special: 'burnitall' }, controller: presser(['special'], 6) },
    p2: { def: getFighter('zara'), controller: idler() },
    arena: STUB_ARENA, mode: 'solo', difficulty: 'founder',
    hud: STUB_HUD, onEnd: () => {}, seed: 20260815,
  }));
  const [a, b] = game.fighters;
  a.x = 480; b.x = 550; a.y = b.y = 480;
  a.energy = 100;
  const hp0 = b.hp;
  for (let i = 0; i < 120; i++) { game.update(1 / 60); b.x = a.x + 70; b.vx = 0; }
  assert.equal(a.usesRunway, false);
  assert.equal(a.runway, RUNWAY.MAX, 'a non-user is still pinned full');
  assert.equal(hp0 - b.hp, SPECIALS.burnitall.dmgBase,
    'a non-user must get dmgBase and nothing more');
});

test('Elo owns BURN RATE BLAST alone on the roster', () => {
  assert.deepEqual(FIGHTERS.filter(f => f.special === 'burnrate').map(f => f.id), ['elo']);
});

// spec §9: runway is roster-only. screens.js builds the player's special
// dropdown from this list, so the marker is the gate.
//
// PLAYER_SPECIALS is an OBJECT keyed by id (Object.fromEntries over SPECIALS
// filtered on !rosterOnly) in this codebase, not the array the plan assumed —
// that shape shipped in v3.6, on this branch's base, before this plan was
// written. Adapted to Object.values() rather than treated as an array.
test('BURN IT ALL is not offered to a player-built founder', () => {
  assert.equal(SPECIALS.burnitall.rosterOnly, true);
  assert.equal(Object.values(PLAYER_SPECIALS).some(sp => sp.id === 'burnitall'), false);
  assert.ok(Object.values(PLAYER_SPECIALS).length >= 6, 'the menu must still hold the ordinary specials');
});

// ---------------------------------------------------------------------------
// Task 8: the HUD bar. Structural only — node:test cannot see a DOM, so these
// pin that the wiring EXISTS. Whether the bar reads correctly on screen is a
// browser check the plan hands to a human; no assertion here substitutes.
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('the HUD carries a runway track for both sides', () => {
  const html = read('index.html');
  for (const id of ['rwTrack1', 'rwFill1', 'rwTrack2', 'rwFill2']) {
    assert.ok(html.includes(id), `index.html has no #${id}`);
  }
  const css = read('styles.css');
  assert.ok(css.includes('.rw-track'), 'styles.css has no .rw-track');
  assert.ok(css.includes('.rw-fill'), 'styles.css has no .rw-fill');
});

// Shown only for a fighter who has one. A permanently-full gold bar under
// every other fighter is a resource the player will try to play around and
// cannot.
test('the HUD shows the runway bar only for a fighter who uses it', () => {
  const src = read('src/ui/hud.js');
  assert.ok(src.includes('usesRunway'),
    'hud.js never checks usesRunway — the bar would show for all nine fighters');
  assert.ok(src.includes('RUNWAY'), 'hud.js does not read the RUNWAY config');
  assert.ok(/winded/.test(src), 'hud.js never reflects the winded state');
});
