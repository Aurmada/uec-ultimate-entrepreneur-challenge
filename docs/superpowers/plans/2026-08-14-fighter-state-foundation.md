# Fighter State Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace two hand-maintained lists of per-fighter state with one declaration each field must pass through, then prove it with a stance-switch move.

**Architecture:** A registry module declares every piece of persistent fighter state — default, round-reset policy, hash quantiser, AI accessor. `Fighter`'s constructor, `Fighter.resetForRound()` and `hashGameState()` all iterate it instead of naming fields by hand. Stance switch is added on top as the first verb built against the registry.

**Tech Stack:** Vanilla ES modules, Canvas 2D, `node --test`. Zero dependencies, no build step.

**Spec:** `docs/superpowers/specs/2026-08-14-fighter-state-foundation-design.md`

---

## Context an engineer needs before starting

- **This is simulation, not rendering.** The parts work that preceded this was render-only and could never desync a match. Everything here can. Live matches are 60 Hz delay-lockstep and compare a state hash every 120 frames; state the hash cannot see is state two peers can silently disagree about, surfacing ~2 s later as a voided match that looks like a network fault.
- **`SIM_VERSION` must bump, 4 → 5.** `SCHEMA_VERSION` (2) and `CHARACTER_WIRE_VERSION` (1) must not move. Those three guard different things and confusing them causes real damage — see `ARCHITECTURE.md` §5.
- **Run the tests:** `npm test` (254 passing before this work).
- **Run the game:** `python3 dev-server.py 4173`, then `http://localhost:4173/?debug=1`.
- **Golden harness:** `http://localhost:4173/test/golden/index.html`, or `?run=baseline` to run it on load and read `window.__goldenResult`. Currently 126 cases, all matching.

### The two lists being replaced

`Fighter.resetForRound()` (`src/engine/fighter.js`) assigns 20 fields by name. `hashGameState()` (`src/net/online.js`) names 13 values: both fighters' `x`, `y`, `hp`, `energy`, plus `timer`, `roundWins[0]`, `roundWins[1]`, `projectiles.length`, `drops.length`.

Eight constructor fields are absent from `resetForRound`, and the spec's §3 classifies all eight. Do not re-derive that table — it is the source text for the registry's `why` strings.

---

## File Structure

| File | Responsibility |
|---|---|
| **Create** `src/engine/fighterState.js` | The registry, its quantisers, and the helpers the three call sites use. |
| **Modify** `src/engine/fighter.js` | Constructor and `resetForRound` iterate the registry. |
| **Modify** `src/net/online.js` | `hashGameState` iterates the registry; `SIM_VERSION` 4 → 5. |
| **Modify** `src/config.js` | `STANCE` block. |
| **Modify** `src/data/fighters.js` | `alignmentshift` in `SPECIALS`; `scam.special` changes. |
| **Modify** `src/engine/ai.js` | Stance selection in `decide()`. |
| **Create** `test/fighterState.test.js` | Registry integrity, round transition, hash coverage, structural backstop. |

---

## Task 1: The registry module

**Files:** Create `src/engine/fighterState.js`; Test `test/fighterState.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/fighterState.test.js`:

```js
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
  assert.equal(quantise('enum', 'safety'), quantise('enum', 'safety'));
  assert.notEqual(quantise('enum', 'safety'), quantise('enum', 'capabilities'));
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/fighterState.test.js`
Expected: FAIL — `Cannot find module '../src/engine/fighterState.js'`

- [ ] **Step 3: Implement `src/engine/fighterState.js`**

```js
// WHAT THE SIMULATION REMEMBERS ABOUT A FIGHTER.
//
// Persistent per-fighter state used to live in two hand-maintained lists:
// resetForRound() named 20 fields, hashGameState() named 13 values, and eight
// constructor fields had already drifted out of the first one. None was
// live-broken — each was masked by `state` resetting to 'idle', or recomputed
// every frame — but none was DECIDED either, and `energy` turned out to encode
// a real balance rule (meter carries between rounds) recorded nowhere but the
// absence of a line.
//
// So: one declaration per field, and the two opt-outs cost a sentence.
// `round: 'keep'` and `hash: false` both require a `why`. That is the whole
// mechanism — an opt-out that costs a justification is one people take
// deliberately.
//
// RENDER-ONLY state does not belong here. Pose, parts and animation are
// governed by the boundary in test/determinism.test.js; this registry is for
// state the SIMULATION reads.

export const FIGHTER_STATE = [
  // ---- combat timers -------------------------------------------------------
  { key: 'stateT',        init: 0,     round: 'reset', hash: 'q8' },
  { key: 'stunT',         init: 0,     round: 'reset', hash: 'q8' },
  { key: 'flashT',        init: 0,     round: 'reset', hash: false,
    why: 'hit-flash timer; drives a render filter only and is never read by the sim' },
  { key: 'unicornT',      init: 0,     round: 'reset', hash: 'q8', ai: 'unicorn' },
  { key: 'speedBuffT',    init: 0,     round: 'reset', hash: 'q8' },
  { key: 'dmgBuffT',      init: 0,     round: 'reset', hash: 'q8' },
  { key: 'shieldT',       init: 0,     round: 'reset', hash: 'q8' },
  { key: 'dashCD',        init: 0,     round: 'reset', hash: 'q8' },
  { key: 'stealCD',       init: 0,     round: 'reset', hash: 'q8' },

  // ---- combo bookkeeping ---------------------------------------------------
  { key: 'comboTaken',    init: 0,     round: 'reset', hash: 'int' },
  { key: 'comboDropT',    init: 0,     round: 'reset', hash: 'q8' },

  // ---- stance (see config STANCE) -----------------------------------------
  { key: 'stanceId',      init: null,  round: 'reset', hash: 'enum', ai: 'stance' },
  { key: 'stanceCD',      init: 0,     round: 'reset', hash: 'q8' },

  // ---- movement ------------------------------------------------------------
  { key: 'airborne',      init: false, round: 'reset', hash: 'int' },
  { key: 'airAttackUsed', init: false, round: 'reset', hash: 'int' },

  // ---- declared KEEPs ------------------------------------------------------
  { key: 'energy',        init: 0,     round: 'keep',  hash: 'q8',
    why: 'meter CARRIES BETWEEN ROUNDS. A real balance rule that shapes round two, '
       + 'and until this registry existed the only record of it was the absence of a '
       + 'line in resetForRound' },
  { key: 'walkPhase',     init: 0,     round: 'keep',  hash: false,
    why: 'animation phase; render-only in effect, and snapping it to zero looks worse '
       + 'than letting it run' },
  { key: 'movingBack',    init: false, round: 'keep',  hash: false,
    why: 'recomputed from the pad every frame before any read' },
  { key: 'moveVx',        init: 0,     round: 'keep',  hash: false,
    why: 'walk intent, zeroed at the top of every update() before use' },
  { key: 'dashDir',       init: 1,     round: 'keep',  hash: false,
    why: 'a direction, meaningless until a dash starts, and a dash always sets it' },
];

export const RESET_KEYS = FIGHTER_STATE.filter((e) => e.round === 'reset').map((e) => e.key);
export const HASH_KEYS = FIGHTER_STATE.filter((e) => e.hash).map((e) => e.key);



// Stable string -> integer for hashing. Sorted so the mapping does not depend
// on registry order, which would make the fingerprint depend on source layout.
const ENUM_VALUES = [null, 'safety', 'capabilities'];

// Mirrors the quantisation hashGameState already used: q8 is the existing q().
export function quantise(kind, v) {
  if (kind === 'q8') return Math.round((v || 0) * 8);
  if (kind === 'int') return (v | 0);
  if (kind === 'enum') {
    const i = ENUM_VALUES.indexOf(v ?? null);
    return i < 0 ? 0 : i;
  }
  return 0;
}

// Apply every `init` to a fresh fighter.
export function initState(f) {
  for (const e of FIGHTER_STATE) f[e.key] = typeof e.init === 'function' ? e.init() : e.init;
}

// Apply every `round: 'reset'` default. Positional state (hp, x, y, facing)
// is NOT here — it depends on which side the fighter starts on.
export function resetState(f) {
  for (const e of FIGHTER_STATE) {
    if (e.round === 'reset') f[e.key] = typeof e.init === 'function' ? e.init() : e.init;
  }
}

// The hashable values for one fighter, in registry order.
export function hashValues(f) {
  const out = [];
  for (const e of FIGHTER_STATE) if (e.hash) out.push(quantise(e.hash, f[e.key]));
  return out;
}


```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test test/fighterState.test.js`
Expected: PASS, 7 tests

Run: `npm test`
Expected: 261 pass, 0 fail (254 before, plus 7)

- [ ] **Step 5: Commit**

```bash
git add src/engine/fighterState.js test/fighterState.test.js
git commit -m "feat(state): a registry for what the simulation remembers"
```

---

## Task 2: Fighter uses the registry

The registry currently has no caller. This wires the constructor and `resetForRound`.

**Files:** Modify `src/engine/fighter.js`; Test `test/fighterState.test.js`

- [ ] **Step 1: Write the failing test**

Append to `test/fighterState.test.js`:

```js
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

test('positional state still resets, and still depends on side', () => {
  const a = mk(0), b = mk(1);
  a.x = b.x = 999; a.hp = b.hp = 3;
  a.resetForRound(0); b.resetForRound(1);
  assert.equal(a.hp, a.maxHp);
  assert.notEqual(a.x, b.x, 'the two sides must start apart');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/fighterState.test.js`
Expected: FAIL — the round-transition test fails on the first `keep` key it reaches (`energy` or `walkPhase`), because `resetForRound` does not yet know about the registry, and the init test fails on `stanceId`/`stanceCD`, which no code sets yet.

- [ ] **Step 3: Implement**

In `src/engine/fighter.js`, add to the imports:

```js
import { initState, resetState } from './fighterState.js';
```

In the constructor, **replace** the individual assignments for every registry key with one call. Keep `def`, `body`, `side`, `controller`, `stats`, `maxHp`, `special`, `cmdBySlot`, `hp`, `x`, `y`, `vx`, `vy`, `facing`, `state`, `attack`, `pad`, `prevPad` exactly as they are — those are either per-character config, positional, or non-scalar, and none is in the registry. Add after them:

```js
    // Everything the simulation remembers, from one declaration.
    initState(this);
```

In `resetForRound(side)`, **replace** the by-name assignments for registry keys with:

```js
    resetState(this);
```

keeping the positional and non-scalar lines that remain:

```js
  resetForRound(side) {
    this.hp = this.maxHp;
    this.x = side === 0 ? 300 : 660;
    this.y = STAGE.FLOOR;
    this.vx = this.vy = 0;
    this.facing = side === 0 ? 1 : -1;
    this.state = 'idle';
    this.attack = null;
    this.pad = blankPad();
    this.prevPad = blankPad();
    resetState(this);
  }
```

Note `state`, `attack`, `pad` and `prevPad` stay explicit: `state` is a string with its own lifecycle, `attack` is an object reference, and the pads are fresh objects each round.

- [ ] **Step 4: Run to verify it passes**

Run: `npm test`
Expected: 265 pass, 0 fail

If any pre-existing test fails here, **stop and report** — it means a field's registry declaration disagrees with how the game actually used it, which is a real finding, not a test to adjust.

- [ ] **Step 5: Commit**

```bash
git add src/engine/fighter.js test/fighterState.test.js
git commit -m "refactor(state): Fighter initialises and resets from the registry"
```

---

## Task 3: The hash iterates the registry

**Files:** Modify `src/net/online.js`; Test `test/fighterState.test.js`

- [ ] **Step 1: Write the failing test**

Append to `test/fighterState.test.js`:

```js
import { hashGameState, SIM_VERSION } from '../src/net/online.js';

// A minimal game-shaped object: hashGameState only reads these.
function fakeGame() {
  const f = () => { const x = mk(); return x; };
  return { fighters: [f(), f()], timer: 60, roundWins: [0, 0], projectiles: [], drops: [] };
}

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
  assert.equal(SIM_VERSION, 5);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/fighterState.test.js`
Expected: FAIL — most hashed keys do not move the fingerprint yet (only `energy` does, since it was already hashed), and `SIM_VERSION` is 4.

- [ ] **Step 3: Implement**

In `src/net/online.js`, import the helper:

```js
import { hashValues } from '../engine/fighterState.js';
```

In `hashGameState`, keep the existing thirteen values in their existing order, then append the registry's:

```js
  for (const x of [
    q(f[0].x), q(f[0].y), q(f[0].hp), q(f[0].energy),
    q(f[1].x), q(f[1].y), q(f[1].hp), q(f[1].energy),
    q(game.timer), game.roundWins[0], game.roundWins[1],
    game.projectiles.length, game.drops.length,
    // Everything the registry declares hashable, both fighters, registry order.
    ...hashValues(f[0]), ...hashValues(f[1]),
  ]) mix(x);
```

`energy` is now mixed twice — once from the original list and once from the registry. That is harmless (the fingerprint just weights it) and preferable to reordering the original thirteen, which would make every old baseline incomparable for no benefit.

Then bump the version, keeping the existing comment block and adding:

```js
// v5: persistent fighter state moved behind a registry, and stance switch
// landed with it. Stances change frame data and damage taken, so two peers on
// either side of this line resolve the same inputs differently.
export const SIM_VERSION = 5;
```

**Do not touch `SCHEMA_VERSION` or `CHARACTER_WIRE_VERSION`.**

- [ ] **Step 4: Verify**

Run: `npm test`
Expected: 268 pass, 0 fail

Confirm the other two versions are unmoved:

```bash
grep -n "^export const SCHEMA_VERSION\|^export const CHARACTER_WIRE_VERSION" src/data/schema.js src/net/online.js
```
Expected: `SCHEMA_VERSION = 2`, `CHARACTER_WIRE_VERSION = 1`

- [ ] **Step 5: Commit**

```bash
git add src/net/online.js test/fighterState.test.js
git commit -m "feat(state): hashGameState iterates the registry, SIM_VERSION 4 -> 5"
```

---

## Task 4: The structural backstop

The registry makes the right thing easy. This makes the wrong thing loud.

**Files:** Test `test/fighterState.test.js`

- [ ] **Step 1: Write the test**

```js
import { readFileSync } from 'node:fs';

test('a timer added to Fighter outside the registry fails the suite', () => {
  const src = readFileSync(new URL('../src/engine/fighter.js', import.meta.url), 'utf8');
  const ctor = src.slice(src.indexOf('constructor('), src.indexOf('resetForRound'));
  const declared = new Set(FIGHTER_STATE.map((e) => e.key));
  const stray = [...ctor.matchAll(/this\.(\w+T) =/g)]
    .map((m) => m[1])
    .filter((k) => !declared.has(k));
  assert.deepEqual(stray, [],
    `these timers are set on Fighter but not declared in fighterState.js: ${stray.join(', ')}. `
    + 'Undeclared state is state the hash cannot see and resetForRound will not clear.');
});
```

- [ ] **Step 2: Verify the backstop actually guards**

Temporarily add to the `Fighter` constructor:

```js
    this.bogusT = 0;
```

Run: `node --test test/fighterState.test.js`
Expected: FAIL, naming `bogusT`.

**Remove that line again** and confirm the suite passes. A test that passes before your change pins nothing.

- [ ] **Step 3: Commit**

```bash
git add test/fighterState.test.js
git commit -m "test(state): structural backstop for state added outside the registry"
```

---

## Task 5: Stance switch — config and the move

**Files:** Modify `src/config.js`, `src/data/fighters.js`

- [ ] **Step 1: Add the `STANCE` block to `src/config.js`**

```js
// ---- STANCE SWITCH ---------------------------------------------------------
// A toggle, not a timer: you stay in a stance until you switch back, the round
// ends, or you are KO'd. Neither set is strictly better than neutral, which is
// what keeps a stance from being a free upgrade — `taken` is the price.
//
// These STACK multiplicatively with Unicorn Mode, deliberately. A stance is a
// trade and Unicorn is a pure buff, so capabilities+Unicorn is dangerous but
// also takes 15% extra damage for exactly the six seconds the opponent most
// wants to punish. This is the call in the design most likely to be wrong on
// contact with play; if it proves oppressive, make Unicorn force `safety`.
export const STANCE = {
  CD: 0.8,          // seconds between switches
  COST: 0,          // meter cost; 0 in v1 — pricing a toggle is unresolved
  SETS: {
    safety:       { startup: 1.15, dmg: 0.85, recovery: 0.90, speed: 0.95, taken: 0.85 },
    capabilities: { startup: 0.90, dmg: 1.20, recovery: 1.15, speed: 1.05, taken: 1.15 },
  },
};
```

- [ ] **Step 2: Add the special to `SPECIALS` in `src/data/fighters.js`**

```js
  alignmentshift: {
    id: 'alignmentshift',
    name: 'ALIGNMENT SHIFT',
    icon: '⚖️',
    type: 'stance',
    desc: 'Toggles between SAFETY and CAPABILITIES. One survives; the other wins faster.',
    startup: 0.10, recovery: 0.18,
  },
```

- [ ] **Step 3: Give it to `scam`**

Change `scam`'s `special: 'pivot'` to `special: 'alignmentshift'`.

`ava` keeps `pivot`, and now owns it alone.

- [ ] **Step 4: Verify nothing breaks yet**

Run: `npm test`
Expected: 269 pass, 0 fail — `rosterMoves.test.js` fires every fighter's special in a live `Game`, so if `stance` is not yet a known archetype this is where it surfaces.

If `rosterMoves.test.js` fails on `scam`, that is expected and correct at this step: the archetype has no engine behaviour until Task 6. Note it and proceed — Task 6's tests will cover it.

- [ ] **Step 5: Commit**

```bash
git add src/config.js src/data/fighters.js
git commit -m "feat(stance): ALIGNMENT SHIFT, and pivot becomes Lizbeth's alone"
```

---

## Task 6: Stance switch — behaviour

**Files:** Modify `src/engine/fighter.js`; Test `test/fighterState.test.js`

- [ ] **Step 1: Write the failing test**

```js
import { STANCE } from '../src/config.js';

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
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/fighterState.test.js`
Expected: FAIL — `f.switchStance is not a function`.

- [ ] **Step 3: Implement**

In `src/engine/fighter.js`, import `STANCE` from `../config.js` alongside the existing config imports, then add the method and the multiplier getters:

```js
  // A toggle, gated by its own cooldown. Order is fixed (null -> safety ->
  // capabilities -> safety) so two peers stepping the same inputs land in the
  // same stance — an order derived from Object.keys would depend on source
  // layout, which is not something lockstep should ever depend on.
  switchStance() {
    if (this.stanceCD > 0) return false;
    this.stanceId = this.stanceId === 'safety' ? 'capabilities' : 'safety';
    this.stanceCD = STANCE.CD;
    return true;
  }

  get stanceSet() { return this.stanceId ? STANCE.SETS[this.stanceId] : null; }

  get takenMult() { return this.stanceSet ? this.stanceSet.taken : 1; }
```

Extend the existing `dmgMult` and `speedMult` getters to include the stance factor, leaving their current terms intact — for example:

```js
  get dmgMult() {
    return this.stats.power
      * (this.unicornT > 0 ? UNICORN.DMG_MULT : 1)
      * (this.dmgBuffT > 0 ? DROPS.BUFF_DMG : 1)
      * (this.stanceSet ? this.stanceSet.dmg : 1);
  }
```

Tick the cooldown wherever the other cooldowns are ticked in `update()`:

```js
    if (this.stanceCD > 0) this.stanceCD = Math.max(0, this.stanceCD - dt);
```

Route the special. `startAttack` builds `{ kind: sp.type, special: sp, ... }` around
`src/engine/fighter.js:469`, so a `stance` special would otherwise become an attack with
`kind: 'stance'` and no engine branch. Intercept **before** that: when the resolved
special's `type` is `'stance'`, call `switchStance()`, spend no meter (`STANCE.COST` is
0), and return without creating an attack. **Not every move sets `attack`** — a dash
changes state, a super sets a buff timer — so this follows an existing pattern rather
than inventing one.

Finally, apply `takenMult` where damage is dealt. There are exactly four sites in
`src/engine/game.js`, all of the form `Math.round(<base> * <attacker>.dmgMult ...)`:

| Line | Site |
|---|---|
| ~257 | counter damage (`ctr.dmg * def.dmgMult`) |
| ~284 | chip damage through a block (`* BLOCK.CHIP`) |
| ~298 | a normal hit (`* COMBO.SCALING[depth]`) |
| ~382 | a special (`sp.dmg * att.dmgMult`) |

At each, multiply by the **victim's** `takenMult` — the fighter whose `hp` that value
reduces. Read each site to confirm which variable that is before editing: at the counter
site the roles are inverted, because `def` is the fighter who countered and the victim is
the one who swung.

- [ ] **Step 4: Verify**

Run: `npm test`
Expected: 274 pass, 0 fail — including `rosterMoves.test.js`'s `scam` case, which now has behaviour to find.

- [ ] **Step 5: Commit**

```bash
git add src/engine/fighter.js src/engine/game.js test/fighterState.test.js
git commit -m "feat(stance): toggling, multipliers, and damage taken"
```

---

## Task 7: The AI can use it

**Files:** Modify `src/engine/ai.js`; Test `test/fighterState.test.js`

A mechanic the AI cannot see is a mechanic it cannot play around. v2.8's lesson applies: `decide()` runs every `level.react` seconds (0.42 / 0.26 / 0.14), which is fine for a toggle on a 0.8 s cooldown — unlike a counter, whose 0.05 s startup forced a per-frame reflex in `update()`. So this goes in `decide()`.

- [ ] **Step 1: Write the failing test**

```js
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
```

- [ ] **Step 2: Run to verify it fails**

Expected: FAIL — `preferredStance is not a function`.

- [ ] **Step 3: Implement**

In `src/engine/ai.js`:

```js
  // Below a third HP, survive; above it, close the round out. Exposed as its
  // own method so the threshold is testable without driving a whole match.
  preferredStance(f) {
    return f.hp / f.maxHp < 0.34 ? 'safety' : 'capabilities';
  }
```

Then in `decide()`, for a fighter whose special is a stance, press the special button when `preferredStance(f) !== f.stanceId` and `f.stanceCD === 0`.

- [ ] **Step 4: Verify**

Run: `npm test`
Expected: 275 pass, 0 fail

- [ ] **Step 5: Commit**

```bash
git add src/engine/ai.js test/fighterState.test.js
git commit -m "feat(stance): the AI switches on health"
```

---

## Task 8: Determinism, golden, and docs

**Files:** Modify `test/determinism.test.js`, `docs/ARCHITECTURE.md`

- [ ] **Step 1: Add stance to the determinism script**

`test/determinism.test.js` runs a fixed input script twice and compares hashes. Add `special` presses to `SCRIPT_A` so a stance switch happens inside the recorded match, then confirm both runs still agree.

Run: `node --test test/determinism.test.js`
Expected: PASS. If the two runs disagree, **stop** — that is a real desync in the stance implementation, not a flaky test.

- [ ] **Step 2: Re-check the golden baseline**

```bash
python3 dev-server.py 4173
```

Open `http://localhost:4173/test/golden/index.html?run=baseline`, read the verdict from the page title.

Expected: idle, walk, crouch, block, jump, hitstun, ko and victory frames all match. `scam`'s attack frames may legitimately differ if his special changed what the CASES capture — inspect any mismatch by eye before re-baselining, and re-baseline only what you can explain.

- [ ] **Step 3: Document the registry**

Add to `docs/ARCHITECTURE.md`, as a new subsection at the end of §5 (Determinism and the netcode):

```markdown
### What the simulation remembers

Persistent per-fighter state is declared once in `engine/fighterState.js`, not
assigned by hand in three places. Each entry carries its default, whether it resets at a
round boundary, how it enters the state hash, and whether the AI can read it.
`Fighter`'s constructor, `Fighter.resetForRound()` and `hashGameState()` all iterate the
registry.

Both opt-outs — `round: 'keep'` and `hash: false` — require a written `why`. That is the
mechanism, not decoration: before the registry existed, `resetForRound` named twenty
fields and eight more had drifted out of it unnoticed. One of those eight was `energy`,
which meant meter carries between rounds — a real balance rule whose only record was the
absence of a line.

A structural test backs it up: a `this.<name>T` timer set on `Fighter` and not declared
in the registry fails the suite.
```

- [ ] **Step 4: Verify and commit**

Run: `npm test`
Expected: 275 pass, 0 fail

```bash
git add test/determinism.test.js docs/ARCHITECTURE.md test/golden/baseline.json
git commit -m "docs(state): the registry, and stance in the determinism script"
```

---

## Acceptance

- [ ] `npm test` green at 275
- [ ] Round-transition test passes, and `energy` demonstrably survives a round
- [ ] Every hashed key moves the fingerprint; no unhashed key does
- [ ] Structural backstop verified to fail on an undeclared timer (by hand, Task 4)
- [ ] All eight drifted fields declared, each opt-out carrying a `why`
- [ ] `SIM_VERSION` is 5; `SCHEMA_VERSION` 2 and `CHARACTER_WIRE_VERSION` 1 unchanged
- [ ] `scam` throws ALIGNMENT SHIFT; `ava` owns `pivot` alone
- [ ] Determinism test passes with stance switching in the script
- [ ] Golden baseline explained, not just re-blessed

---

## Notes for whoever picks this up

**If a pre-existing test fails in Task 2, that is a finding.** It means a field's registry declaration disagrees with how the game actually used it. Report it rather than adjusting the test — the registry is supposed to make those disagreements visible, and this is the first chance it gets to.

**The stance/Unicorn stacking rule is the weakest part of the design.** It is argued, not measured. The fallback is named in the config comment; take it if play says so.

**`energy` being hashed twice after Task 3 is deliberate.** Reordering the original thirteen values to deduplicate would make every recorded hash incomparable for no gain.
