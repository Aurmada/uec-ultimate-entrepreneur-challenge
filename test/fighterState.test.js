// The registry exists because two hand-maintained lists — resetForRound and
// hashGameState — had already drifted apart from the fields they govern. Its
// whole value is that opting out costs a written justification, so these
// tests check the CONTRACT, not just the data.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FIGHTER_STATE, RESET_KEYS, HASH_KEYS, quantise } from '../src/engine/fighterState.js';

test('every entry declares the four required fields', () => {
  for (const e of FIGHTER_STATE) {
    assert.equal(typeof e.key, 'string', `entry missing key: ${JSON.stringify(e)}`);
    assert.ok('init' in e, `${e.key} missing init`);
    assert.ok(e.round === 'reset' || e.round === 'keep', `${e.key} round must be reset|keep`);
    assert.ok(e.hash === false || ['q8', 'int', 'enum'].includes(e.hash),
      `${e.key} hash must be false|q8|int|enum`);
  }
});

test('opting out of reset or hashing costs a written justification', () => {
  for (const e of FIGHTER_STATE) {
    if (e.round === 'keep' || e.hash === false) {
      assert.ok(typeof e.why === 'string' && e.why.length > 10,
        `${e.key} opts out but has no why — that is the whole point of the registry`);
    }
  }
});

test('keys are unique', () => {
  const seen = new Set();
  for (const e of FIGHTER_STATE) {
    assert.ok(!seen.has(e.key), `duplicate key ${e.key}`);
    seen.add(e.key);
  }
});

test('the eight fields that drifted out of resetForRound are all declared', () => {
  for (const k of ['stunT', 'comboDropT', 'airAttackUsed', 'energy',
                   'walkPhase', 'movingBack', 'moveVx', 'dashDir']) {
    assert.ok(FIGHTER_STATE.some((e) => e.key === k), `${k} is not in the registry`);
  }
});

test('energy carries between rounds, and says so', () => {
  const e = FIGHTER_STATE.find((x) => x.key === 'energy');
  assert.equal(e.round, 'keep');
  assert.match(e.why, /round/i);
});

test('RESET_KEYS and HASH_KEYS are derived, not hand-listed', () => {
  assert.deepEqual(RESET_KEYS, FIGHTER_STATE.filter((e) => e.round === 'reset').map((e) => e.key));
  assert.deepEqual(HASH_KEYS, FIGHTER_STATE.filter((e) => e.hash).map((e) => e.key));
});

test('quantisers match what hashGameState already does', () => {
  assert.equal(quantise('q8', 1.26), Math.round(1.26 * 8));
  assert.equal(quantise('int', 3.9), 3);
  assert.equal(quantise('enum', null), 0);
  // A real stance must never share null's slot; comparing a value with itself,
  // as this line used to, could not fail.
  assert.notEqual(quantise('enum', 'safety'), quantise('enum', null));
  assert.notEqual(quantise('enum', 'safety'), quantise('enum', 'capabilities'));
});

// quantise('enum') used to fold ANY unlisted value into the same slot as
// null (indexOf returns -1 for an unknown value, and -1 was mapped to 0,
// which is null's own index) — so 'aggression', '', and 'SAFETY' all
// quantised identically to "no stance". That's unreachable today because
// ENUM_VALUES happens to list every value stanceId can hold, but the list
// was a hand-maintained duplicate of STANCE.SETS's keys with nothing binding
// them: add a third stance and it fingerprints as "no stance" — a desync the
// detector would be structurally blind to. A hash function that quietly
// conflates two different states is worse than one that crashes in a test.
test('quantise("enum") throws on a value outside the known vocabulary', () => {
  assert.throws(() => quantise('enum', 'aggression'));
  assert.throws(() => quantise('enum', ''));
  assert.throws(() => quantise('enum', 'SAFETY'));
});

test('quantise("enum") never collides two different stances, or a stance with null', () => {
  const values = [null, 'safety', 'capabilities'].map((v) => quantise('enum', v));
  assert.equal(new Set(values).size, values.length, `collided: ${values.join(',')}`);
});

import { Fighter } from '../src/engine/fighter.js';
import { FIGHTERS } from '../src/data/fighters.js';

const mk = (side = 0) => new Fighter(FIGHTERS[0], side, { isHuman: false, update() {} });

test('a fresh fighter has every registry key at its declared init', () => {
  const f = mk();
  for (const e of FIGHTER_STATE) {
    const want = typeof e.init === 'function' ? e.init() : e.init;
    assert.deepEqual(f[e.key], want, `${e.key} did not initialise from the registry`);
  }
});

test('a round transition resets every reset key and leaves every keep key alone', () => {
  const f = mk();
  // Dirty everything, so a field that is silently skipped shows up.
  for (const e of FIGHTER_STATE) {
    f[e.key] = typeof e.init === 'boolean' ? !e.init
             : typeof e.init === 'number' ? e.init + 7
             : 'safety';
  }
  const keptBefore = Object.fromEntries(
    FIGHTER_STATE.filter((e) => e.round === 'keep').map((e) => [e.key, f[e.key]]));

  f.resetForRound(0);

  for (const e of FIGHTER_STATE) {
    const want = typeof e.init === 'function' ? e.init() : e.init;
    if (e.round === 'reset') {
      assert.deepEqual(f[e.key], want, `${e.key} declares reset but survived the round`);
    } else {
      assert.deepEqual(f[e.key], keptBefore[e.key], `${e.key} declares keep but was cleared`);
    }
  }
});

test('energy specifically survives a round — the rule the registry made explicit', () => {
  const f = mk();
  f.energy = 55;
  f.resetForRound(0);
  assert.equal(f.energy, 55);
});

// crouching (fighter.js, set from pad.down/grounded/state at the top of every
// update()) was live simulation state living entirely outside the registry:
// never initialised in the constructor, never reset, not hashed, no `why`.
// It can't independently desync — it's recomputed from already-synced inputs
// before any read each frame — but it contradicted the registry's contract,
// and the structural backstop above now catches exactly this shape of gap.
test('crouching is declared: kept (recomputed every frame before use, same as movingBack/moveVx) and unhashed (fully derived, cannot independently diverge)', () => {
  const e = FIGHTER_STATE.find((x) => x.key === 'crouching');
  assert.ok(e, 'crouching is not declared in fighterState.js');
  assert.equal(e.round, 'keep');
  assert.equal(e.hash, false);
  assert.ok(typeof e.why === 'string' && e.why.length > 10);
});

test('positional state still resets, and still depends on side', () => {
  const a = mk(0), b = mk(1);
  a.x = b.x = 999; a.hp = b.hp = 3;
  a.resetForRound(0); b.resetForRound(1);
  assert.equal(a.hp, a.maxHp);
  assert.notEqual(a.x, b.x, 'the two sides must start apart');
});

import { hashGameState, SIM_VERSION } from '../src/net/online.js';

// A minimal game-shaped object: hashGameState only reads these.
function fakeGame() {
  const f = () => { const x = mk(); return x; };
  return { fighters: [f(), f()], timer: 60, roundWins: [0, 0], projectiles: [], drops: [], traps: [] };
}

// Traps are simulation (a trap that one peer has and the other does not bites
// one of them two seconds later), and until v3.9 the fingerprint counted
// projectiles and drops but not traps, so a trap desync surfaced as a damage
// mismatch long after the cause.
test('a placed trap moves the fingerprint', () => {
  const g = fakeGame();
  const before = hashGameState(g);
  g.traps.push({ x: 400, armT: 0.35, life: 6 });
  assert.notEqual(hashGameState(g), before, 'traps are invisible to the hash');
});

test('every hashed key actually moves the fingerprint', () => {
  for (const e of FIGHTER_STATE) {
    if (!e.hash) continue;
    const g = fakeGame();
    const before = hashGameState(g);
    g.fighters[0][e.key] = e.hash === 'enum' ? 'capabilities'
                         : typeof e.init === 'boolean' ? !e.init : (e.init || 0) + 5;
    assert.notEqual(hashGameState(g), before, `${e.key} declares hash but does not affect it`);
  }
});

test('an unhashed key never moves the fingerprint', () => {
  for (const e of FIGHTER_STATE) {
    if (e.hash) continue;
    const g = fakeGame();
    const before = hashGameState(g);
    g.fighters[0][e.key] = typeof e.init === 'boolean' ? !e.init : (e.init || 0) + 5;
    assert.equal(hashGameState(g), before, `${e.key} declares hash:false but changed it`);
  }
});

test('the simulation version was bumped for the behaviour change', () => {
  // 8: SAME-DAY DELIVERY, the deferred effect, and traps in the fingerprint.
  // 9: a throw goes behind the thrower from either side, corners included
  // (see online.js).
  assert.equal(SIM_VERSION, 9);
});

// initState() now assigns every registry field in the constructor, so the
// constructor's OWN source contains zero `this.(\w+T) =` matches — the old
// grep-based version of this guard found nothing to grep for and could never
// fail again, no matter what got added later. (The refactor that made that
// true landed in the very next task after this guard was written.)
//
// Guard the actual contract instead: construct a real Fighter and check every
// one of its own enumerable properties is either declared in the registry or
// on an explicit allowlist of the fields that are legitimately NOT simulation
// state governed by this registry (per-character config, positional state set
// directly from the constructor's arguments, or objects with their own
// lifecycle). Anything else is undeclared state — invisible to the hash,
// untouched by resetForRound — exactly what this registry exists to prevent.
const NOT_REGISTRY_STATE = new Set([
  'def', 'body', 'side', 'controller', 'stats', 'maxHp', 'hp',
  'x', 'y', 'vx', 'vy', 'facing', 'state', 'attack', 'pad', 'prevPad',
  'special', 'cmdBySlot',
]);

test('a fighter has no simulation state outside the registry', () => {
  const f = mk();
  const declared = new Set(FIGHTER_STATE.map((e) => e.key));
  const stray = Object.keys(f).filter((k) => !declared.has(k) && !NOT_REGISTRY_STATE.has(k));
  assert.deepEqual(stray, [],
    `these fields are set on Fighter but neither declared in fighterState.js nor on the `
    + `allowlist: ${stray.join(', ')}. `
    + 'Undeclared state is state the hash cannot see and resetForRound will not clear.');
});


test('switching stance toggles between the two sets', () => {
  const f = mk();
  assert.equal(f.stanceId, null);
  f.switchStance();
  assert.equal(f.stanceId, 'safety');
  f.stanceCD = 0;
  f.switchStance();
  assert.equal(f.stanceId, 'capabilities');
});

test('the cooldown blocks a second switch', () => {
  const f = mk();
  f.switchStance();
  const first = f.stanceId;
  f.switchStance();                       // cooldown still running
  assert.equal(f.stanceId, first, 'switched twice inside STANCE.CD');
  assert.ok(f.stanceCD > 0);
});

test('a stance multiplies damage dealt and damage taken', () => {
  const f = mk();
  const baseOut = f.dmgMult, baseIn = f.takenMult;
  f.stanceId = 'capabilities';
  assert.ok(f.dmgMult > baseOut, 'capabilities should hit harder');
  assert.ok(f.takenMult > baseIn, 'capabilities should also hurt more');
  f.stanceId = 'safety';
  assert.ok(f.dmgMult < baseOut && f.takenMult < baseIn);
});

test('stance and Unicorn stack multiplicatively', () => {
  const f = mk();
  f.stanceId = 'capabilities';
  const stanceOnly = f.dmgMult;
  f.unicornT = 5;
  assert.ok(f.dmgMult > stanceOnly, 'Unicorn must still add on top of a stance');
});

test('a stance does not survive the round', () => {
  const f = mk();
  f.switchStance();
  f.resetForRound(0);
  assert.equal(f.stanceId, null);
});

// STANCE.SETS declares startup/recovery/speed alongside dmg/taken, but only
// dmg and taken were ever read (dmgMult, takenMult). A stance was supposed to
// change how a fighter moves and swings, not just its damage numbers — a pure
// damage trade is a much weaker mechanic than the one promised, and it makes
// the SIM_VERSION 5 / ARCHITECTURE.md claim that "stances change frame data"
// false as shipped.
test('a stance changes movement speed too, not just damage', () => {
  const f = mk();
  const neutral = f.speedMult;
  f.stanceId = 'capabilities';
  assert.ok(f.speedMult > neutral, 'capabilities should move faster than neutral');
  f.stanceId = 'safety';
  assert.ok(f.speedMult < neutral, 'safety should move slower than neutral');
});

test('a stance changes attack startup and recovery, not just damage', () => {
  const f = mk();
  const game = { audio: { sfx() {} } };

  f.stanceId = null;
  f.startAttack('punch', game);
  const neutralStartup = f.attack.startup, neutralRecovery = f.attack.recovery;

  f.stanceId = 'capabilities';
  f.startAttack('punch', game);
  assert.ok(f.attack.startup < neutralStartup, 'capabilities should start up faster than neutral');
  assert.ok(f.attack.recovery > neutralRecovery, 'capabilities should recover slower than neutral');

  f.stanceId = 'safety';
  f.startAttack('punch', game);
  assert.ok(f.attack.startup > neutralStartup, 'safety should start up slower than neutral');
  assert.ok(f.attack.recovery < neutralRecovery, 'safety should recover faster than neutral');
});

import { AIController } from '../src/engine/ai.js';

function aiFighter(hpFrac) {
  const f = mk(1);
  f.def = { ...f.def, special: 'alignmentshift' };
  f.special = { id: 'alignmentshift', type: 'stance' };
  f.hp = f.maxHp * hpFrac;
  f.controller = new AIController('mogul', f.def);
  return f;
}

test('a hurt AI prefers safety, a healthy one prefers capabilities', () => {
  const hurt = aiFighter(0.2);
  assert.equal(hurt.controller.preferredStance(hurt), 'safety');
  const fine = aiFighter(0.9);
  assert.equal(fine.controller.preferredStance(fine), 'capabilities');
});

// The chain reflex (a basic connects, then special) never looked at stances.
// For a stance special that press IS a switch toward preferredStance(), so a
// fighter already standing in it paid 50 meter and started the cooldown for a
// switch that changed nothing: 26 of 71 paid switches across 12 AI matches.
// decide() already checked; the reflex did not. The roll is pinned so the
// chain always fires, and the pulse is read directly because it is only
// applied to the pad on the following frame.
test('the AI never chains into a stance switch that would change nothing', async () => {
  const { METER } = await import('../src/config.js');
  const realRandom = Math.random;
  Math.random = () => 0;
  try {
    const chainOffKick = (stanceId) => {
      const f = aiFighter(0.9);
      f.stanceId = stanceId;
      f.energy = METER.MAX;
      f.state = 'attack';
      f.attack = { kind: 'kick', hasHit: true, chainN: 3 };
      const opp = mk(0);
      f.controller.update(f, { dt: 1 / 60, other: () => opp });
      return !!f.controller.pulse.special;
    };
    const preferred = aiFighter(0.9).controller.preferredStance(aiFighter(0.9));
    assert.equal(chainOffKick(preferred), false, 'chained into a switch to the stance it was already in');
    assert.equal(chainOffKick(preferred === 'safety' ? 'capabilities' : 'safety'), true,
      'a switch that lands somewhere new should still chain');
  } finally {
    Math.random = realRandom;
  }
});

// A refused switch must not bill the player, and must not be silently eaten.
//
// startSpecial charged METER.SPECIAL_COST before asking switchStance() whether
// the switch could happen, so pressing special during the cooldown took 50
// meter and did nothing. That part is fixed. But the caller had already
// consumed pressed('special') for the frame, so a refusal that returns with no
// signal at all still vanishes with no sound and no popup — "the worst feel in
// a fighter" (game.js's own words for exactly this). A refusal must route
// through game.onSpecialDenied(f, 'stance'), same as steal and dash already do
// for their own cooldowns.
test('a stance switch refused by its cooldown costs no meter and is not silently eaten', async () => {
  const { METER } = await import('../src/config.js');
  const f = mk();
  f.special = { id: 'alignmentshift', type: 'stance', name: 'ALIGNMENT SHIFT' };
  const denials = [];
  const game = { onSpecialStart() {}, onSpecialDenied(fighter, kind) { denials.push(kind); } };

  f.energy = METER.MAX;
  f.startSpecial(game);
  assert.equal(f.stanceId, 'safety', 'the first press should switch');
  assert.equal(f.energy, METER.MAX - METER.SPECIAL_COST, 'and should be paid for');
  assert.deepEqual(denials, [], 'a successful switch must not report a denial');

  const banked = f.energy;
  f.startSpecial(game);                       // cooldown still running
  assert.equal(f.stanceId, 'safety', 'the second press is refused');
  assert.equal(f.energy, banked, 'and must not be charged for');
  assert.deepEqual(denials, ['stance'], 'the refused press must be routed through onSpecialDenied');
});

import { RUNWAY } from '../src/config.js';

// The payoff for building the registry first: adding a whole resource is one
// declaration, and hashing, round reset and the structural backstop all come
// for free. Assert them anyway — "free" is a claim, and the claim is the
// thing that would quietly stop being true.
test('runway is declared: full at the start, reset each round, hashed', () => {
  const e = FIGHTER_STATE.find((x) => x.key === 'runway');
  assert.ok(e, 'runway is not declared in fighterState.js');
  assert.equal(e.init, RUNWAY.MAX, 'every fighter starts with a full tank');
  assert.equal(e.round, 'reset', 'a new round is a fresh runway');
  assert.equal(e.hash, 'q8', 'an unhashed resource is a desync the detector cannot see');
  assert.equal(e.why, undefined, 'runway opts out of nothing, so it owes no justification');
});

test('runway moves the state fingerprint', () => {
  const g = fakeGame();
  const before = hashGameState(g);
  g.fighters[0].runway = RUNWAY.MAX - 1;
  assert.notEqual(hashGameState(g), before,
    'two peers could disagree about a whole resource without the hash noticing');
});
