import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BODY, BUDGET, ATTACKS } from '../src/config.js';
import { budgetCost, budgetBand, commandCost } from '../src/data/schema.js';
import { STYLES } from '../src/config.js';
import {
  validateCharacter, DEFAULT_BODY, SCHEMA_VERSION,
  ARCHETYPES, COMMAND_SLOTS, slotButton,
} from '../src/data/schema.js';

test('every body knob has a [min, max] range bracketing 1.0', () => {
  const knobs = ['height', 'build', 'reach', 'stride', 'shoulders', 'head'];
  assert.deepEqual(Object.keys(BODY).sort(), [...knobs].sort());
  for (const k of knobs) {
    const [lo, hi] = BODY[k];
    assert.ok(lo < 1 && hi > 1, `${k} range must bracket 1.0, got [${lo}, ${hi}]`);
  }
});

test('budget exposes weights and the warn/block thresholds', () => {
  assert.equal(BUDGET.WARN, 8);
  assert.equal(BUDGET.BLOCK, 15);
  assert.equal(BUDGET.W.speed, 1.2);
  assert.equal(BUDGET.W.startup, 0.7);
});

const NEUTRAL_BODY = { height: 1, build: 1, reach: 1, stride: 1, shoulders: 1, head: 1 };

test('budget reproduces the spec table for every shipped style', () => {
  const expected = {
    grappler: -4.6, brawler: -3.8, balanced: 0.0, zoner: 4.7, rushdown: 7.0,
    showman: 8.2, technical: 8.6, trickster: 12.2, glass: 14.2, phantom: 16.8,
  };
  for (const [id, want] of Object.entries(expected)) {
    const got = budgetCost(STYLES[id], NEUTRAL_BODY);
    assert.ok(Math.abs(got - want) < 0.05,
      `${id}: expected ${want}, got ${got.toFixed(2)}`);
  }
});

test('bands classify per the spec thresholds', () => {
  assert.equal(budgetBand(0), 'clean');
  assert.equal(budgetBand(-7.9), 'clean');
  assert.equal(budgetBand(8.1), 'warn');
  assert.equal(budgetBand(-14.2), 'warn');
  assert.equal(budgetBand(16.8), 'block');
});

test('PHANTOM is blocked — it holds advantage on four axes, pays on two', () => {
  assert.equal(budgetBand(budgetCost(STYLES.phantom, NEUTRAL_BODY)), 'block');
});

test('a bigger body refunds budget, because it is easier to hit', () => {
  const big = { ...NEUTRAL_BODY, height: 1.2, build: 1.2 };
  assert.ok(budgetCost(STYLES.balanced, big) < budgetCost(STYLES.balanced, NEUTRAL_BODY));
});

function validChar(over = {}) {
  return {
    schema: SCHEMA_VERSION,
    id: 'test-fighter',
    identity: { name: 'TEST', title: 'THE TEST', company: 'TESTCO', tagline: 'x', rap: 'y' },
    body: { ...DEFAULT_BODY },
    look: { stance: 'ready' },
    fighting: {
      preset: 'balanced',
      startup: 1, dmg: 1, reach: 1, recovery: 1, speed: 1, hp: 1,
      moves: { special: { archetype: 'strike', dmg: 10 }, signature: null },
    },
    ai: { aggr: 0.5, jump: 0.3, prefRange: 'mid' },
    ...over,
  };
}

test('a well-formed character validates clean', () => {
  const r = validateCharacter(validChar());
  assert.equal(r.ok, true);
  assert.deepEqual(r.errors, []);
  assert.equal(r.band, 'clean');
});

test('an unknown schema version is rejected', () => {
  const r = validateCharacter(validChar({ schema: 99 }));
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /schema version/i);
});

test('a malformed id is rejected', () => {
  for (const id of ['', 'A', 'has space', 'Uppercase', 'x'.repeat(25)]) {
    assert.equal(validateCharacter(validChar({ id })).ok, false, `id ${JSON.stringify(id)} should fail`);
  }
});

test('an out-of-range body knob is rejected, not silently clamped', () => {
  const r = validateCharacter(validChar({ body: { ...DEFAULT_BODY, height: 5 } }));
  assert.equal(r.ok, false);
  assert.match(r.errors.join(' '), /height/);
});

test('an unknown move archetype is rejected', () => {
  const c = validChar();
  c.fighting.moves.special = { archetype: 'nonsense' };
  assert.equal(validateCharacter(c).ok, false);
});

test('an over-budget character is blocked but still reports its cost', () => {
  const c = validChar();
  Object.assign(c.fighting, { dmg: 1.5, speed: 1.2, hp: 1.2 });
  const r = validateCharacter(c);
  assert.equal(r.ok, false);
  assert.equal(r.band, 'block');
  assert.ok(r.cost > 15);
});

test('a warn-band character validates ok but carries a warning', () => {
  const c = validChar();
  Object.assign(c.fighting, { dmg: 1.12 });
  const r = validateCharacter(c);
  assert.equal(r.ok, true);
  assert.equal(r.band, 'warn');
  assert.equal(r.warnings.length, 1);
});

test('identity text over its length cap is rejected', () => {
  const c = validChar();
  c.identity.name = 'X'.repeat(30);
  assert.equal(validateCharacter(c).ok, false);
});

// ---------------------------------------------------------------- v2: command normals

test('schema v2 carries the full eleven-archetype vocabulary', () => {
  assert.equal(SCHEMA_VERSION, 2);
  // 'stance' joined in fighter-state-foundation (2026-08-14): a toggle
  // (ALIGNMENT SHIFT) that changes `stanceId` instead of swinging, hitting,
  // or placing anything. 'burn' joined in runway-resource (2026-08-15): a
  // strike whose damage is read from the thrower's runway at the moment of
  // contact, and which empties that runway by connecting. Both grew the
  // vocabulary rather than reusing 'strike' or 'aoe', because pricing and
  // engine routing both branch on archetype identity.
  for (const a of ['strike', 'aoe', 'projectile', 'rush', 'grab', 'teleport', 'rain', 'counter', 'trap',
                   'stance', 'burn']) {
    assert.ok(ARCHETYPES.includes(a), `${a} must be an archetype`);
  }
});

// A challenge link carries a command normal's archetype as an INDEX into this
// array (state.js packCommand/unpackCommand), so the order is a wire format
// even though nothing calls it one. Inserting 'burn' anywhere but the end
// would silently re-point every link already in the wild: a 'trap' would
// decode as 'stance', priced and resolved as something its author never
// authored. Appending costs nothing and cannot do that.
test('the archetype list is append-only — challenge links index into it', () => {
  assert.deepEqual(ARCHETYPES.slice(0, 10), [
    'strike', 'projectile', 'aoe', 'rush', 'grab', 'teleport', 'rain', 'counter', 'trap', 'stance',
  ], 'the first ten indices are a shipped wire format and may not be reordered');
  assert.equal(ARCHETYPES[10], 'burn');
  assert.equal(ARCHETYPES[11], 'deferred');
  assert.equal(ARCHETYPES.length, 12);
});

// Same reasoning as 'stance', and the same failure mode if it is skipped:
// BUDGET.CMD.ARCHETYPE has no `burn` entry, so a burn command normal would
// price as free (identical to `strike`); and its damage is read from the
// thrower's RUNWAY, which is a resource only a roster character opts into —
// so an authored one would either deal 8 flat forever or hand a player a
// resource the budget has no axis to charge for. Refuse it here rather than
// let rosterMoves.test.js find it.
test('burn is a known archetype for a special, but rejected as a command normal', () => {
  const c = validChar();
  c.fighting.moves.special = { archetype: 'burn', dmg: 10 };
  assert.equal(validateCharacter(c).ok, true, 'burn must be legal as a signature special');

  const d = validChar();
  d.commandNormals = [{
    slot: 'fwd+punch', archetype: 'burn', displayName: 'TORCH IT',
    frameData: { startup: ATTACKS.punch.startup, active: ATTACKS.punch.active,
                 recovery: ATTACKS.punch.recovery, dmg: ATTACKS.punch.dmg, reach: ATTACKS.punch.reach },
  }];
  const r = validateCharacter(d);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes("'burn' is not usable as a command normal")));
});

test('stance is a known archetype for a special, but rejected as a command normal', () => {
  // No entry in BUDGET.CMD.ARCHETYPE and no engine routing exist for a
  // command-normal-level stance (fighter.js only intercepts `type: 'stance'`
  // on the character's special) — so unlike every other archetype, this one
  // must be refused here rather than silently priced at 0 and shipped dead.
  const c = validChar();
  c.commandNormals = [{
    slot: 'fwd+punch', archetype: 'stance', displayName: 'TOGGLE',
    frameData: { startup: ATTACKS.punch.startup, active: ATTACKS.punch.active,
                 recovery: ATTACKS.punch.recovery, dmg: ATTACKS.punch.dmg, reach: ATTACKS.punch.reach },
  }];
  const r = validateCharacter(c);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes("'stance' is not usable as a command normal")));
});

test('every command slot names a real basic attack', () => {
  assert.deepEqual([...COMMAND_SLOTS].sort(), ['fwd+kick', 'fwd+launch', 'fwd+punch', 'fwd+slap']);
  for (const slot of COMMAND_SLOTS) {
    assert.ok(ATTACKS[slotButton(slot)], `${slot} must map onto an ATTACKS entry`);
  }
});

// A command normal is priced against the neutral basic it shares a button with,
// so "costs nothing" means "is that basic, on a direction".
const cmd = (over = {}) => ({
  slot: 'fwd+punch', archetype: 'strike', displayName: 'TEST NORMAL',
  frameData: { ...ATTACKS.punch },
  ...over,
});

test('a command normal identical to its base costs nothing', () => {
  assert.ok(Math.abs(commandCost(cmd())) < 0.001);
});

test('a richer archetype costs more than a plain strike', () => {
  const plain = commandCost(cmd({ archetype: 'strike' }));
  for (const a of ['counter', 'projectile', 'grab']) {
    assert.ok(commandCost(cmd({ archetype: a })) > plain, `${a} should cost more than strike`);
  }
});

test('adding launch to a basic that does not launch is charged for', () => {
  const flat = commandCost(cmd());
  const launcher = commandCost(cmd({ frameData: { ...ATTACKS.punch, kbUp: -380 } }));
  assert.ok(launcher > flat + 2, `launcher ${launcher} should carry a real premium over ${flat}`);
});

// A trap laid at your feet is not weak for being close. Pricing its placing
// animation's reach refunded it so hard that having a trap beat having no move.
test('a non-swinging archetype is not refunded for its wind-up reach', () => {
  const short = commandCost(cmd({
    slot: 'fwd+kick', archetype: 'trap',
    frameData: { ...ATTACKS.kick, reach: 40 },
    params: { dmg: ATTACKS.kick.dmg },
  }));
  const long = commandCost(cmd({
    slot: 'fwd+kick', archetype: 'trap',
    frameData: { ...ATTACKS.kick, reach: 160 },
    params: { dmg: ATTACKS.kick.dmg },
  }));
  assert.ok(Math.abs(short - long) < 0.001, 'reach must not move a trap\'s price');
  assert.ok(short > 0, 'and a trap still costs something for being a trap');
});

test('a trap is priced on the hazard it places, not the animation that places it', () => {
  const mk = (hazardDmg) => commandCost(cmd({
    slot: 'fwd+kick', archetype: 'trap',
    frameData: { ...ATTACKS.kick },
    params: { dmg: hazardDmg },
  }));
  assert.ok(mk(ATTACKS.kick.dmg * 1.5) > mk(ATTACKS.kick.dmg));
});

test('a launching basic is not charged twice for launching', () => {
  // ATTACKS.launch already launches, so keeping that property is free
  const asIs = commandCost(cmd({ slot: 'fwd+launch', frameData: { ...ATTACKS.launch } }));
  assert.ok(Math.abs(asIs) < 0.001);
});

// The two tuning targets named in the plan. These pin the constants: if the
// weights drift, these fail before any character does.
test('balanced style plus two modest command normals stays clean', () => {
  const c = validChar();
  c.commandNormals = [
    // slower but stronger — a compensating trade, not an upgrade
    cmd({ slot: 'fwd+punch', frameData: { ...ATTACKS.punch, dmg: ATTACKS.punch.dmg * 1.1, startup: ATTACKS.punch.startup * 1.15 } }),
    cmd({ slot: 'fwd+kick', frameData: { ...ATTACKS.kick, reach: ATTACKS.kick.reach * 1.1, recovery: ATTACKS.kick.recovery * 1.15 } }),
  ];
  const r = validateCharacter(c);
  assert.equal(r.ok, true, r.errors.join('; '));
  assert.equal(r.band, 'clean', `expected clean, got ${r.band} at ${r.cost.toFixed(1)}`);
});

test('a launcher plus a projectile on fast frames pushes into warn', () => {
  const c = validChar();
  c.commandNormals = [
    cmd({
      slot: 'fwd+punch', archetype: 'strike',
      frameData: { ...ATTACKS.punch, kbUp: -380, startup: ATTACKS.punch.startup * 0.85, dmg: ATTACKS.punch.dmg * 1.1 },
    }),
    cmd({
      slot: 'fwd+kick', archetype: 'projectile',
      frameData: { ...ATTACKS.kick, startup: ATTACKS.kick.startup * 0.9 },
    }),
  ];
  const r = validateCharacter(c);
  assert.equal(r.band, 'warn', `expected warn, got ${r.band} at ${r.cost.toFixed(1)}`);
  assert.equal(r.ok, true);
});

test('command normals count toward the budget and can block export on their own', () => {
  const c = validChar();
  c.commandNormals = [
    cmd({ slot: 'fwd+punch', archetype: 'grab', frameData: { ...ATTACKS.punch, dmg: ATTACKS.punch.dmg * 1.6, reach: ATTACKS.punch.reach * 1.4 } }),
    cmd({ slot: 'fwd+kick', archetype: 'rain', frameData: { ...ATTACKS.kick, startup: ATTACKS.kick.startup * 0.6 } }),
    cmd({ slot: 'fwd+launch', archetype: 'teleport', frameData: { ...ATTACKS.launch, dmg: ATTACKS.launch.dmg * 1.5 } }),
  ];
  const r = validateCharacter(c);
  assert.equal(r.ok, false);
  assert.equal(r.band, 'block');
});

test('a character with no command normals is still valid', () => {
  const r = validateCharacter(validChar());
  assert.equal(r.ok, true);
  assert.deepEqual(r.errors, []);
});

test('command normals are capped at three slots', () => {
  const c = validChar();
  c.commandNormals = [
    cmd({ slot: 'fwd+slap', frameData: { ...ATTACKS.slap } }),
    cmd({ slot: 'fwd+punch' }),
    cmd({ slot: 'fwd+kick', frameData: { ...ATTACKS.kick } }),
    cmd({ slot: 'fwd+launch', frameData: { ...ATTACKS.launch } }),
  ];
  const r = validateCharacter(c);
  assert.equal(r.ok, false);
  assert.match(r.errors.join(' '), /at most 3/i);
});

test('a duplicate slot is rejected — one move per input', () => {
  const c = validChar();
  c.commandNormals = [cmd(), cmd({ displayName: 'OTHER' })];
  const r = validateCharacter(c);
  assert.equal(r.ok, false);
  assert.match(r.errors.join(' '), /duplicate/i);
});

test('an unknown slot or archetype is rejected', () => {
  for (const over of [{ slot: 'back+punch' }, { slot: 'down+kick' }, { archetype: 'nonsense' }]) {
    const c = validChar();
    c.commandNormals = [cmd(over)];
    assert.equal(validateCharacter(c).ok, false, `${JSON.stringify(over)} should fail`);
  }
});

// This is the anti-cheat line: frame data arrives over the wire in a challenge
// link, so ratios are clamped against the base rather than merely priced.
test('frame data far outside its clamp is rejected, not just charged for', () => {
  const c = validChar();
  c.commandNormals = [cmd({ frameData: { ...ATTACKS.punch, dmg: 400, startup: 0.001 } })];
  const r = validateCharacter(c);
  assert.equal(r.ok, false);
  assert.match(r.errors.join(' '), /frameData/);
});

test('a command normal missing its display name is rejected', () => {
  const c = validChar();
  c.commandNormals = [cmd({ displayName: '' })];
  assert.equal(validateCharacter(c).ok, false);
});

// ---------------------------------------------------------------------------
// The params gap.
//
// `counter` and `trap` keep their power in `params`, not in frame data, and
// for a long time nothing in params was priced except damage. A counter with a
// 0.05s window and one with a 60s window cost exactly the same. So did a 78px
// trap and a 400px one that could stack twenty deep.
//
// It was the one genuinely unbounded direction in the whole budget: frame data
// is clamped by BUDGET.CMD.CLAMP, but params are never validated, so the only
// thing standing between an author and a free five-second parry was that
// nobody had tried it. These pin the price on, per axis, because the failure
// mode is silent — the move validates, exports, and quietly beats everything.
// ---------------------------------------------------------------------------

const COUNTER = {
  slot: 'fwd+slap', archetype: 'counter', displayName: 'PROBE', tags: ['counter'],
  frameData: { startup: 0.044, active: 0.06, recovery: 0.21, dmg: 4, reach: 78 },
  params: { window: BUDGET.NOMINAL.window, dmg: 6, kb: 240 },
};
const TRAP = {
  slot: 'fwd+kick', archetype: 'trap', displayName: 'PROBE', tags: ['trap'],
  frameData: { startup: 0.115, active: 0.09, recovery: 0.187, dmg: 12, reach: 60 },
  params: {
    lifetime: BUDGET.NOMINAL.trapLife, radius: BUDGET.NOMINAL.trapRadius,
    armTime: BUDGET.NOMINAL.trapArm, maxActive: BUDGET.NOMINAL.trapCount, dmg: 12,
  },
};
const withParams = (m, p) => ({ ...m, params: { ...m.params, ...p } });

test('a longer counter window costs more than a shorter one', () => {
  const short = commandCost(withParams(COUNTER, { window: 0.09 }));
  const nominal = commandCost(COUNTER);
  const long = commandCost(withParams(COUNTER, { window: 0.27 }));
  assert.ok(short < nominal, `a briefer window must be cheaper: ${short} vs ${nominal}`);
  assert.ok(long > nominal, `a longer window must cost more: ${long} vs ${nominal}`);
});

test('an absurd counter window cannot be bought', () => {
  for (const window of [1, 5, 60]) {
    const cost = commandCost(withParams(COUNTER, { window }));
    assert.equal(budgetBand(cost), 'block',
      `a ${window}s parry priced at ${cost.toFixed(1)} and was not blocked`);
  }
});

test('every trap axis is priced, not just its damage', () => {
  const nominal = commandCost(TRAP);
  const axes = {
    radius: [39, 200],        // ground denied
    lifetime: [2, 16],        // how long for
    maxActive: [1, 3],        // how many at once
  };
  for (const [key, [less, more]] of Object.entries(axes)) {
    if (key !== 'maxActive') {
      assert.ok(commandCost(withParams(TRAP, { [key]: less })) < nominal,
        `less ${key} must cost less`);
    }
    assert.ok(commandCost(withParams(TRAP, { [key]: more })) > nominal,
      `more ${key} must cost more — it was free before`);
  }
  // arming is the inverted one: sooner is stronger, so it costs more
  assert.ok(commandCost(withParams(TRAP, { armTime: 0.1 })) > nominal,
    'a trap that arms faster must cost more');
});

test('a stack of traps is priced as the strongest axis', () => {
  const cost = commandCost(withParams(TRAP, { maxActive: 3 }));
  assert.equal(budgetBand(cost), 'block',
    `three simultaneous traps priced at ${cost.toFixed(1)} and was not blocked`);
});

test('the reference moves sit at zero on every params axis', () => {
  // NOMINAL is defined as the shipped design, so a move built from it must be
  // priced purely on archetype, damage and commitment — no params drift.
  const bare = { ...COUNTER, params: { window: BUDGET.NOMINAL.window, dmg: 6, kb: 240 } };
  const shifted = withParams(bare, { window: BUDGET.NOMINAL.window * 1.5 });
  assert.ok(Math.abs(commandCost(shifted) - commandCost(bare)) > 1,
    'the nominal must actually be a reference point, not an unused constant');
});
