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

import { METER, RUNWAY } from '../src/config.js';

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
