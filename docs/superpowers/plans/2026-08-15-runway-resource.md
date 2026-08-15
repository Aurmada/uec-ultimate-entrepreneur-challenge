# Runway Resource Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a second per-fighter resource that drains on a clock instead of accumulating, give exactly one character the flag that turns it on, and build a signature special that spends it.

**Architecture:** `runway` is one more entry in the `FIGHTER_STATE` registry, so it is initialised, round-reset, hashed and backstop-checked by the machinery step 1 built. The drain lives in `Game.updateFighting`, which is the only place `game.state === 'fighting'` is already true. The refill hooks the two sites that already award `METER.HIT_DEAL`. `winded` is a derived getter (`runway <= 0`), not stored state, and folds into the existing `speedMult` / `dmgMult` / `takenMult` getters next to the stance and Unicorn terms. BURN IT ALL is a new `burn` archetype whose damage is recomputed each active frame from the tank it is about to empty.

**Tech Stack:** Vanilla ES modules, Canvas 2D, `node --test`. Zero dependencies, no build step.

**Spec:** `docs/superpowers/specs/2026-08-15-runway-resource-design.md`
**Why this step exists:** `docs/superpowers/specs/2026-08-14-move-system-decomposition.md` (step 2 of 4)

---

## Context an engineer needs before starting

- **Verified starting state (2026-08-15).** `main` is clean at `d4c82df`, `origin/main` is at `7d74ee3`. `npm test` → **283 passing, 0 failing** across 14 files. Per file: ai 1, anim 42, codec 21, commandNormals 21, determinism 6, fighterState 27, moves 13, parts 39, playerBuild 24, proportions 7, roster 8, rosterMoves 36, schema 37, smoke 1.
- **This is simulation, not rendering.** Live matches are 60 Hz delay-lockstep and compare a state hash every 120 frames (`SYNC_EVERY`). State the hash cannot see is state two peers can silently disagree about, surfacing ~2 s later as a voided match that looks like a network fault.
- **`SIM_VERSION` must bump, 5 → 6.** Unlike last time, 5 **has** shipped: `origin/main` is at the fighter-state merge, so a v5 peer exists in the wild. `src/net/online.js:108-110` currently carries the now-false comment *"It stays 5 rather than becoming 6 because 5 has never shipped: main is on 4, this branch is unmerged"* — that sentence must go when the bump lands. `SCHEMA_VERSION` (2) and `CHARACTER_WIRE_VERSION` (1) must not move.
- **Run the tests:** `npm test`, or `node --test test/<file>.test.js` for one file.
- **Run the game:** `python3 dev-server.py 4173`, then `http://localhost:4173/?debug=1`. Plain `http.server` caches ES modules; `dev-server.py` sends no-store headers. rAF is throttled in a headless pane — drive time with `UEC.step(seconds)`.
- **Golden harness:** `http://localhost:4173/test/golden/index.html`, or `?run=baseline` to run on load and read `window.__goldenResult`. **126 cases** (14 in `test/golden/hash.js` `CASES` × 9 fighters), all matching today.

### Where damage is dealt, so a refill can hook "landed a hit"

All damage resolution is in `src/engine/game.js`. There are five sites; only two of them are "the attacker landed a hit":

| Site | Line | What it is | Refill? |
|---|---|---|---|
| `strike()` counter payback | 257 | the *defender* turned a swing around; `att` is the victim | no |
| `strike()` parried hit | 266-281 | `def` blocked inside `PARRY.WINDOW`; returns before any damage | no |
| `strike()` chip through a block | 284 | 3 meter, not 12 — and **currently unreachable**, see Notes | no |
| `strike()` normal hit | 298-304 | `def.applyHit(...)` then `giveEnergy(att, METER.HIT_DEAL)` | **yes** |
| `doSteal()` | 354-357 | `dmg: 0`, siphons meter | no |
| `doGrab()` | 382-390 | `def.applyHit(...)` then `giveEnergy(att, METER.HIT_DEAL)` | **yes** |

The rule this plan implements: **runway refills exactly where `METER.HIT_DEAL` is awarded.** Two call sites, both already written, both easy to find again. Do not scatter the refill anywhere else.

Both no-damage outcomes (parry, shield) `return` from `strike()` above those lines, so they need no guard — placing the refill next to `giveEnergy(att, METER.HIT_DEAL)` is what makes that true for free.

### How `game.state` gates the round, so the drain is correctly scoped

`Game.update(rawDt)` (`src/engine/game.js:90`) does, in order:

1. `if (this.paused) return;`
2. `if (this.fx.hitstopT > 0) { this.hud.update(this); return; }`
3. `switch (this.state)` → `'intro'` | `'fighting'` | `'roundEnd'` | `'matchEnd'`

So putting the drain inside `updateFighting(dt)` gives the spec's scoping **by construction**, with no extra condition to get wrong: not during the round intro (`'intro'`), not after a KO (`doKO` → `endRound` → `'roundEnd'`), not during victory (`'matchEnd'`), not while paused, not during hitstop. Do **not** put the drain in `Fighter.update()` — that runs in every one of those states (`updateIntro`, `updateRoundEnd` and `updateMatchEnd` all call it with `locked = true`).

### How `src/ui/hud.js` draws the meter, so the runway bar follows it

The HUD is **DOM, not canvas**. Three pieces have to move together:

- **`index.html:167-168` and `178-179`** — inside each `.hud-bars` column: a `.hp-track` (with `#hpGhost{1,2}` + `#hpFill{1,2}`) then an `.en-track` (with `#enFill{1,2}` + `#enSpark{1,2}`).
- **`styles.css:385-419`** — `.hp-track` is `clamp(12px, 2.4vw, 18px)` tall at `width: 100%`; `.en-track` is `clamp(7px, 1.4vw, 10px)` tall at `width: 78%`, and `.hud-p2 .en-track { align-self: flex-end; }` mirrors it. Fills are absolutely positioned with `transform-origin: left center` (right for `.hud-p2`) and are driven purely by `transform: scaleX(...)`.
- **`src/ui/hud.js`** — `bind()` caches elements, `setup(game)` runs once per match, `snapBars(game)` sets `transition: none`, writes the transform, forces a reflow, restores the transition, and `update(game)` writes `scaleX` every frame. `energy` appears 7 times in the file (1 in the header comment, 6 in code: lines 62, 81, 83, 84, 88, 95).

The runway bar copies this pattern exactly: a third track below `.en-track`, driven by `scaleX`, hidden unless `usesRunway`.

### Two constraints the spec does not mention, both load-bearing

1. **`ARCHETYPES` order is a wire format.** `src/state.js:164` packs a command normal's archetype as `ARCHETYPES.indexOf(...)` and `:195` unpacks it as `ARCHETYPES[p.a]`. Challenge links in the wild carry those integers. `'burn'` must be **appended after `'stance'`**, never inserted. `docs/ARCHITECTURE.md` §5 already records this as an append-only contract.
2. **`src/ui/screens.js:332` builds the player's special dropdown from `Object.values(SPECIALS)` with no filter.** Adding `burnitall` to `SPECIALS` makes it immediately player-selectable, which contradicts spec §9 ("Runway is roster-only"). Task 6 closes this two ways: the damage formula reads runway only for a `usesRunway` fighter, and a `rosterOnly` marker keeps the move out of the menu.

### Where the spec and the code disagree

Every path, name and number in the spec was re-checked against the source on 2026-08-15. It holds up well; these are the gaps, recorded rather than silently corrected.

| Spec | Reality |
|---|---|
| §5 "references `energy` in seven places" | Seven `energy` matches in `src/ui/hud.js`, but one is the file's header comment. Six are code (62, 81, 83, 84, 88, 95). Harmless. |
| §4 "hashed, reset and **backstop-checked** automatically" | True *now*, and only just: the backstop was rewritten from a `this.<name>T` grep to a property-based check in `de1b8fa`. Against the previous version, `runway` (no trailing `T`) would have sailed straight past it. The claim is right; the reason is newer than the spec implies. |
| §7 "`SIM_VERSION` 5 → 6" | Correct, but `src/net/online.js:108-110` carries a comment *arguing* it should stay 5 ("5 has never shipped: main is on 4, this branch is unmerged"). Both premises are now false — `origin/main` is at the fighter-state merge. The comment must be deleted, or the next person will read it and revert the bump. |
| §7 "`burn` joins `ARCHETYPES`" | Correct, and incomplete: the array's **order is a wire format** (`state.js` packs/unpacks archetype indices into challenge links). `burn` must be appended. |
| §9 "Player access. Runway is roster-only." | Not free. `src/ui/screens.js:332` builds the player's special dropdown from `Object.values(SPECIALS)` with **no filter**, so merely adding `burnitall` to `SPECIALS` hands it to every player build — the exact outcome §9 forbids. Task 6 adds `rosterOnly` / `PLAYER_SPECIALS` to close it. (`alignmentshift` is already exposed this way; see Notes.) |
| §8 "Refill … a landed hit" (implying chip is the boundary case) | The interesting boundary is not chip. A held block currently parries **every** non-grab hit and the chip branch is unreachable — verified live, see Notes. |
| §10 "Elo owns `burnrate` alone" | True of the nine in `FIGHTERS`. `BASE_CHARACTERS` still has `b-builder` and `b-maker` on `burnrate`; those are player-build silhouettes, not roster fighters, and the sharing-pair table is about the nine. |

### The registry's backstop already covers `runway`

`test/fighterState.test.js:200` was rewritten (`de1b8fa`) from a `this.(\w+T) =` grep to a property-based check: it constructs a real `Fighter` and fails on any own enumerable property that is neither declared in `FIGHTER_STATE` nor on the `NOT_REGISTRY_STATE` allowlist. `runway` is caught by that. **The corollary matters:** `usesRunway` and `winded` must be **getters on the prototype**, not constructor assignments, or that test fails naming them. (`docs/ARCHITECTURE.md` §5 still describes the old timer-grep version of this test — fix it in Task 9.)

---

## File Structure

| File | Responsibility |
|---|---|
| **Modify** `src/config.js` | `RUNWAY` block. |
| **Modify** `src/data/schema.js` | `'burn'` appended to `ARCHETYPES`; rejected as a command-normal archetype. |
| **Modify** `src/engine/moves.js` | `ARCHETYPE_SHAPES.burn`, `ARCHETYPE_TICKS.burn`. |
| **Modify** `src/engine/fighterState.js` | One registry entry: `runway`. |
| **Modify** `src/engine/fighter.js` | `usesRunway` / `winded` getters; winded folded into the three multipliers; `burn` gets an aoe-height hitbox. |
| **Modify** `src/engine/game.js` | `drainRunway` in `updateFighting`; `refillRunway` at the two `HIT_DEAL` sites; BURN IT ALL's no-refill exception. |
| **Modify** `src/data/fighters.js` | `burnitall` in `SPECIALS`; `usesRunway: true` and the new special on `max`; `PLAYER_SPECIALS` export. |
| **Modify** `src/ui/screens.js` | Player special menu reads `PLAYER_SPECIALS`. |
| **Modify** `src/engine/ai.js` | Winded behaviour and a BURN IT ALL fit in `decide()`. |
| **Modify** `src/net/online.js` | `SIM_VERSION` 5 → 6; kill the stale "stays 5" comment. |
| **Modify** `index.html`, `styles.css`, `src/ui/hud.js` | The runway bar. |
| **Create** `test/runway.test.js` | Drain, refill, winded, BURN IT ALL, opt-out, HUD structure. |
| **Modify** `test/fighterState.test.js` | Registry declaration; `SIM_VERSION` 6. |
| **Modify** `test/schema.test.js` | `burn` in the vocabulary; append-only guard. |
| **Modify** `test/moves.test.js` | `burn` has a tick. |
| **Modify** `test/rosterMoves.test.js` | `runway` joins `EFFECT_NOISE`. |
| **Modify** `test/ai.test.js` | Two real-`Game` Adam tests. |
| **Modify** `test/determinism.test.js` | A scripted run with drain and a BURN IT ALL. |
| **Modify** `docs/ARCHITECTURE.md` | Runway in §5; fix the stale backstop sentence. |

---

## Task 1: `burn` joins the archetype vocabulary

Done **first**, before any character data changes. Step 1 shipped `stance` late and `roster.test.js` failed permanently in between: `toCharacter(def)` emits `moves.special.archetype = SPECIALS[def.special].type`, and `validateCharacter` rejects any archetype not in `ARCHETYPES`, so the moment `max.special` becomes `burnitall` every roster test that validates him fails. This task removes that trap before it can be sprung.

**Files:** Modify `src/data/schema.js`, `src/engine/moves.js`; Test `test/schema.test.js`

- [ ] **Step 1: Write the failing tests**

In `test/schema.test.js`, first extend the existing vocabulary test. Replace:

```js
test('schema v2 carries the full ten-archetype vocabulary', () => {
  assert.equal(SCHEMA_VERSION, 2);
  // 'stance' joined in fighter-state-foundation (2026-08-14): a toggle
  // (ALIGNMENT SHIFT) that changes `stanceId` instead of swinging, hitting,
  // or placing anything. It grew the vocabulary rather than reusing 'strike'
  // because pricing and engine routing both branch on archetype identity.
  for (const a of ['strike', 'aoe', 'projectile', 'rush', 'grab', 'teleport', 'rain', 'counter', 'trap', 'stance']) {
    assert.ok(ARCHETYPES.includes(a), `${a} must be an archetype`);
  }
});
```

with:

```js
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
```

Then append two new tests to `test/schema.test.js`:

```js
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
  assert.equal(ARCHETYPES.length, 11);
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
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test test/schema.test.js`
Expected: FAIL — the vocabulary test fails on `burn must be an archetype`; the append-only test fails on `ARCHETYPES[10]` being `undefined`; the command-normal test fails because `validateCharacter` accepts nothing named `burn` at all (the special is rejected, so the first assertion trips first).

- [ ] **Step 3: Implement**

In `src/data/schema.js`, extend the comment above `ARCHETYPES` and append the entry:

```js
// `aoe` is a live special type (Burn Rate Blast) and stays its own archetype
// rather than folding into `strike`, because the shipped behaviour must be
// preserved exactly. `counter` and `trap` are the two new fight patterns —
// they exist so the roster can hold characters that differ in kind, not
// merely in degree. `stance` is the tenth, added for ALIGNMENT SHIFT
// (fighter-state-foundation, 2026-08-14): a toggle that changes `stanceId`
// rather than swinging, hitting or placing anything. `burn` is the eleventh,
// added for BURN IT ALL (runway-resource, 2026-08-15): a strike that reads
// its damage from the thrower's RUNWAY at the moment of contact and empties
// that runway by connecting. Both are known archetypes for
// `fighting.moves.special`/`signature` only — see the commandNormals guard
// below for why each is rejected as a command-normal archetype.
//
// APPEND ONLY. state.js packs a command normal's archetype as an index into
// this array and unpacks it the same way, so the order is a shipped wire
// format: inserting anywhere but the end re-points every challenge link that
// already exists.
export const ARCHETYPES = [
  'strike', 'projectile', 'aoe', 'rush', 'grab', 'teleport', 'rain', 'counter', 'trap', 'stance',
  'burn',
];
```

Still in `src/data/schema.js`, in `validateCharacter`'s command-normal loop, extend the `stance` rejection. Replace:

```js
        } else if (cn.archetype === 'stance') {
```

with:

```js
        } else if (cn.archetype === 'stance' || cn.archetype === 'burn') {
```

and replace the `errors.push` line inside that branch:

```js
          errors.push(`${at}.archetype 'stance' is not usable as a command normal yet`);
```

with:

```js
          // `burn` fails for the same two reasons as `stance`, plus a third:
          // its damage comes from the thrower's RUNWAY, and runway is a
          // roster-only opt-in (`usesRunway`) that the power budget has no
          // axis to price. An authored burn normal would be free, and either
          // permanently weak or a resource handed out for nothing.
          errors.push(`${at}.archetype '${cn.archetype}' is not usable as a command normal yet`);
```

In `src/engine/moves.js`, add the shape after the `stance` entry in `ARCHETYPE_SHAPES`:

```js
  // BURN IT ALL. A real swing — unlike stance/counter/trap it has a hitbox and
  // it is meant to connect. `dmg` is deliberately NOT final here: the tick
  // rewrites it every active frame from the runway the move is about to spend,
  // so what lands is what the tank held at CONTACT, not at startup. The floor
  // set here is what a fighter with no runway at all gets.
  burn: (a, sp) => {
    a.words = ['TORCHED!', 'BURN IT ALL!', 'ALL OF IT!'];
    a.hitY = -85;
    a.dmg = sp.dmgBase ?? 8;
  },
```

- [ ] **Step 4: Verify**

Run: `node --test test/schema.test.js`
Expected: PASS, 39 tests (37 before, plus 2).

Run: `npm test`
Expected: **285 pass, 0 fail** (283 + 2). `test/moves.test.js` stays at 13 — its `every schema archetype has an implementation` and `shaping never invents a word list` loops both iterate `ARCHETYPES` and now find `burn`, which is exactly why the shape lands in this task rather than a later one.

- [ ] **Step 5: Commit**

```bash
git add src/data/schema.js src/engine/moves.js test/schema.test.js
git commit -m "feat(burn): an eleventh archetype, appended and refused as a command normal"
```

---

## Task 2: The `RUNWAY` config block and the registry field

**Files:** Modify `src/config.js`, `src/engine/fighterState.js`; Test `test/fighterState.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `test/fighterState.test.js` (at the very end; `fakeGame` is a hoisted function declaration and `hashGameState` is imported at line 148, so both are in scope):

```js
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
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test test/fighterState.test.js`
Expected: FAIL — `SyntaxError`/`does not provide an export named 'RUNWAY'` from `src/config.js`. Add the config block first, re-run, and the failure becomes `runway is not declared in fighterState.js`.

- [ ] **Step 3: Implement**

In `src/config.js`, add after the `STANCE` block (which ends at line 405, before the `POWER BUDGET` banner):

```js
// ---- RUNWAY ----------------------------------------------------------------
// The game's second resource, and deliberately the OPPOSITE of the first.
// METER builds — 12 per hit dealt, 8 per hit taken, 3 per chip — so it rewards
// staying alive and cashing in. RUNWAY drains from the moment the round goes
// live and the only way to top it up is to land something. Meter says wait and
// you gain; runway says wait and you lose. A fighter carrying both is pulled in
// two directions at once, which is the entire reason it is worth adding rather
// than reskinning the bar that already exists.
//
// At MAX 100 and DRAIN 4, an untouched tank empties in 25 seconds of a 60
// second round — long enough that it is a clock and not a countdown, short
// enough that a passive round ends winded.
//
// WINDED is DERIVED (`runway <= 0`), never stored. There is no timer to reset,
// hash or leak, and one landed hit clears it in the same frame.
export const RUNWAY = {
  MAX: 100,
  DRAIN: 4,            // per second, while game.state === 'fighting'
  REFILL_ON_HIT: 15,   // a landed hit buys runway back
  WINDED: { speed: 0.85, dmg: 0.80, taken: 1.20 },
};
```

In `src/engine/fighterState.js`, extend the config import:

```js
import { STANCE, RUNWAY } from '../config.js';
```

and add the entry after the stance block:

```js
  // ---- runway (see config RUNWAY) -----------------------------------------
  // Declared for EVERY fighter and initialised to MAX, even though only a
  // character with `usesRunway` ever drains. A nullable field would need a
  // special case in the quantiser, and a special case in a hash function is
  // where a desync hides. Hashing a constant costs one integer and cannot go
  // wrong.
  { key: 'runway',        init: RUNWAY.MAX, round: 'reset', hash: 'q8' },
```

- [ ] **Step 4: Verify**

Run: `node --test test/fighterState.test.js`
Expected: PASS, 29 tests (27 before, plus 2). The pre-existing loops (`a fresh fighter has every registry key at its declared init`, `a round transition resets every reset key…`, `every hashed key actually moves the fingerprint`, `a fighter has no simulation state outside the registry`) all pick `runway` up on their own — that is the registry working, not luck.

Run: `npm test`
Expected: **287 pass, 0 fail** (285 + 2). Nothing changes `runway` yet, so `rosterMoves`, `determinism` and the golden baseline are all untouched.

- [ ] **Step 5: Commit**

```bash
git add src/config.js src/engine/fighterState.js test/fighterState.test.js
git commit -m "feat(runway): the numbers, and one line in the registry"
```

---

## Task 3: `usesRunway`, `winded`, and the three multipliers

Pure `Fighter` behaviour, no `Game` yet. Nothing drains at the end of this task; the getters just read whatever `runway` happens to be.

**Files:** Modify `src/engine/fighter.js`; Test create `test/runway.test.js`

- [ ] **Step 1: Write the failing tests**

Create `test/runway.test.js`:

```js
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
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test test/runway.test.js`
Expected: FAIL — `usesRunway` is `undefined`, so the first test fails on `assert.equal(undefined, false)`, and `winded` is `undefined` throughout.

- [ ] **Step 3: Implement**

In `src/engine/fighter.js`, extend the config import on line 4 to include `RUNWAY`:

```js
import { STAGE, PHYS, ATTACKS, METER, UNICORN, BOMB, DASH, DROPS, COMBO, STEAL, STYLES, PLAYER_STATS, STANCE, RUNWAY } from '../config.js';
```

Add the two getters next to `grounded` / `alive` (immediately after line 70, `get alive()`):

```js
  // GETTERS, not constructor fields, on purpose. test/fighterState.test.js's
  // structural backstop fails on any own enumerable property of a Fighter that
  // is not in the registry — and neither of these is simulation state. One is
  // read straight off the character def; the other is a pure function of
  // `runway`, which the registry already owns.
  //
  // Opt-in rather than opt-out: `runway` is declared for everyone and pinned at
  // MAX for everyone who does not carry this flag, so a non-user is hashed the
  // same way as a user and can never be winded.
  get usesRunway() { return !!this.def.usesRunway; }

  // Derived, never stored. Nothing to reset, nothing to hash, and one landed
  // hit clears it in the same frame the refill arrives.
  get winded() { return this.usesRunway && this.runway <= 0; }
```

Extend the three multiplier getters, leaving every existing term exactly where it is:

```js
  get speedMult() {
    return this.stats.speed
      * (this.unicornT > 0 ? UNICORN.SPEED_MULT : 1)
      * (this.speedBuffT > 0 ? DROPS.BUFF_SPEED : 1)
      * (this.stanceSet ? this.stanceSet.speed : 1)
      * (this.winded ? RUNWAY.WINDED.speed : 1);
  }
  get dmgMult() {
    return this.stats.power
      * (this.unicornT > 0 ? UNICORN.DMG_MULT : 1)
      * (this.dmgBuffT > 0 ? DROPS.BUFF_DMG : 1)
      * (this.stanceSet ? this.stanceSet.dmg : 1)
      * (this.winded ? RUNWAY.WINDED.dmg : 1);
  }
```

and, further down (currently line 102):

```js
  get takenMult() {
    return (this.stanceSet ? this.stanceSet.taken : 1)
      * (this.winded ? RUNWAY.WINDED.taken : 1);
  }
```

- [ ] **Step 4: Verify**

Run: `node --test test/runway.test.js`
Expected: PASS, 5 tests.

Run: `npm test`
Expected: **292 pass, 0 fail** (287 + 5). Nothing sets `runway` below MAX yet, so no shipped fighter is winded and no existing test moves.

- [ ] **Step 5: Commit**

```bash
git add src/engine/fighter.js test/runway.test.js
git commit -m "feat(runway): usesRunway, winded, and the three multipliers"
```

---

## Task 4: The drain, scoped to a live round

The flag lands on Adam here so there is something to drain. `SIM_VERSION` bumps here too — this is the first commit where two peers on either side of the line resolve the same inputs differently, and leaving the version behind the behaviour is precisely the v2.8 failure.

**Files:** Modify `src/data/fighters.js`, `src/engine/game.js`, `src/net/online.js`; Test `test/runway.test.js`, `test/fighterState.test.js`, `test/rosterMoves.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `test/runway.test.js`:

```js
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
```

In `test/fighterState.test.js`, change the version assertion (line 178):

```js
test('the simulation version was bumped for the behaviour change', () => {
  assert.equal(SIM_VERSION, 6);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test test/runway.test.js`
Expected: FAIL — `expected about 4 per second, saw 0.000`, and the KO / reset tests fail on `the fixture must have drained something first`. The two negative tests (intro, paused, non-user) pass vacuously right now; that is expected and is why the positive drain test is written first.

Run: `node --test test/fighterState.test.js`
Expected: FAIL — `Expected values to be strictly equal: 5 !== 6`.

- [ ] **Step 3: Implement**

In `src/data/fighters.js`, add the flag to `max`. Change (line 159):

```js
    special: 'burnrate', style: 'brawler',
```

to:

```js
    special: 'burnrate', style: 'brawler',
    // THE BURNER is the only character on the roster with a number going down.
    // Opting in is the whole gate: `runway` is declared and hashed for everyone
    // (see engine/fighterState.js), but only a fighter carrying this flag ever
    // drains, and only a fighter who drains can ever be winded.
    usesRunway: true,
```

In `src/engine/game.js`, extend the config import on line 4 to include `RUNWAY`:

```js
import { STAGE, PHYS, ROUND, METER, BLOCK, UNICORN, BOMB, DROPS, COMBO, STEAL, PARRY, RUNWAY } from '../config.js';
```

In `updateFighting(dt)`, call the drain immediately after the timer block and before the fighters update — a fixed position in a fixed order, which is all lockstep asks:

```js
    for (const f of this.fighters) f.update(dt, this, false);
```

becomes:

```js
    this.drainRunway(dt);
    for (const f of this.fighters) f.update(dt, this, false);
```

Add the method just below `updateFighting`, above `pushApart`:

```js
  // The clock only runs while the round does. This lives in updateFighting
  // rather than in Fighter.update because THIS is the only place
  // `state === 'fighting'` is already true: updateIntro, updateRoundEnd and
  // updateMatchEnd all call Fighter.update too (locked), and Game.update
  // returns early on `paused` and on hitstop before the switch is even reached.
  // Scoping by call site means there is no condition here to get wrong later.
  drainRunway(dt) {
    for (const f of this.fighters) {
      if (!f.usesRunway) continue;
      f.runway = Math.max(0, f.runway - RUNWAY.DRAIN * dt);
    }
  }
```

In `src/net/online.js`, **delete** the now-false final paragraph of the `SIM_VERSION` comment:

```js
// It stays 5 rather than becoming 6 because 5 has never shipped: main is on 4,
// this branch is unmerged, and no peer anywhere runs 5. Versions number what
// was released, not what was edited.
export const SIM_VERSION = 5;
```

and replace it with:

```js
// v6: RUNWAY. Adam Weumann's runway drains 4/second while the round is live and
// refills 15 on a landed hit, and at zero he is WINDED — 15% slower, 20% weaker,
// 20% easier to hit. A v5 peer runs none of that, so the two would shake hands,
// agree perfectly on what the character IS, and then resolve the same inputs to
// different damage within seconds. Unlike 5, this one is a real bump: 5 shipped
// (origin/main carries the fighter-state merge), so a v5 client exists.
export const SIM_VERSION = 6;
```

In `test/rosterMoves.test.js`, add `runway` to `EFFECT_NOISE`. This file's `stateChanged` check snapshots every registry key that represents a real effect and compares before/after; `runway` now ticks every frame for Adam merely from the round being live, which would make his `special spent 50 and produced nothing` guard pass unconditionally — exactly the vacuous pass the file's header exists to prevent. Replace:

```js
  'flashT',                                     // hit-flash render timer
]);
```

with:

```js
  'flashT',                                     // hit-flash render timer
  // A runway user's tank ticks down every live frame from the round merely
  // being live, so including it would make `stateChanged` unconditionally true
  // for Adam and pass this file's whole "did the move actually do anything"
  // guard for free — the exact vacuous pass the header describes. BURN IT ALL
  // is covered on its own terms in test/runway.test.js.
  'runway',
]);
```

- [ ] **Step 4: Verify**

Run: `node --test test/runway.test.js`
Expected: PASS, 11 tests (5 + 6).

Run: `npm test`
Expected: **298 pass, 0 fail** (292 + 6).

Confirm the other two versions have not moved:

```bash
grep -n "^export const SCHEMA_VERSION\|^export const CHARACTER_WIRE_VERSION\|^export const SIM_VERSION" src/data/schema.js src/net/online.js
```
Expected: `SCHEMA_VERSION = 2`, `CHARACTER_WIRE_VERSION = 1`, `SIM_VERSION = 6`.

- [ ] **Step 5: Commit**

```bash
git add src/data/fighters.js src/engine/game.js src/net/online.js \
        test/runway.test.js test/fighterState.test.js test/rosterMoves.test.js
git commit -m "feat(runway): it drains, and only while the round is live — SIM_VERSION 5 -> 6"
```

---

## Task 5: The refill

**Files:** Modify `src/engine/game.js`; Test `test/runway.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `test/runway.test.js`:

```js
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
  assert.equal(r.runway, RUNWAY.MAX);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test test/runway.test.js`
Expected: FAIL — `a connecting punch never topped the tank up` and `a landed HOSTILE TAKEOVER did not refill the tank`. The three negative tests pass; the two positive ones are the point.

- [ ] **Step 3: Implement**

In `src/engine/game.js`, add the helper directly below `drainRunway`:

```js
  // The counterweight to the drain: connecting is the only way to buy time.
  // Called from exactly the two places that award METER.HIT_DEAL — the normal
  // hit in strike() and the throw in doGrab(). Nothing that fails to land is on
  // that list: a shield absorb, a parry and a chipped block all return from
  // strike() before those lines, and a counter's payback damages the ATTACKER,
  // who did not land anything.
  refillRunway(f) {
    if (!f.usesRunway) return;
    f.runway = Math.min(RUNWAY.MAX, f.runway + RUNWAY.REFILL_ON_HIT);
  }
```

In `strike()`, at the normal-hit path. Change:

```js
    def.applyHit({ dmg, kb, kbUp: a.kbUp || 0, stun: a.stun, dir });
    this.giveEnergy(att, METER.HIT_DEAL);
    this.giveEnergy(def, METER.HIT_TAKE);
```

to:

```js
    def.applyHit({ dmg, kb, kbUp: a.kbUp || 0, stun: a.stun, dir });
    this.giveEnergy(att, METER.HIT_DEAL);
    this.giveEnergy(def, METER.HIT_TAKE);
    this.refillRunway(att);
```

In `doGrab()`. Change:

```js
    this.giveEnergy(att, METER.HIT_DEAL);
    this.giveEnergy(def, METER.HIT_TAKE);
    this.audio.sfx('throwSlam');
```

to:

```js
    this.giveEnergy(att, METER.HIT_DEAL);
    this.giveEnergy(def, METER.HIT_TAKE);
    this.refillRunway(att);
    this.audio.sfx('throwSlam');
```

- [ ] **Step 4: Verify**

Run: `node --test test/runway.test.js`
Expected: PASS, 16 tests (11 + 5).

Run: `npm test`
Expected: **303 pass, 0 fail** (298 + 5).

- [ ] **Step 5: Commit**

```bash
git add src/engine/game.js test/runway.test.js
git commit -m "feat(runway): landing a hit buys the tank back"
```

---

## Task 6: BURN IT ALL

**Files:** Modify `src/data/fighters.js`, `src/engine/moves.js`, `src/engine/fighter.js`, `src/engine/game.js`, `src/ui/screens.js`; Test `test/runway.test.js`, `test/moves.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `test/runway.test.js`:

```js
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
test('BURN IT ALL is not offered to a player-built founder', () => {
  assert.equal(SPECIALS.burnitall.rosterOnly, true);
  assert.equal(PLAYER_SPECIALS.some(sp => sp.id === 'burnitall'), false);
  assert.ok(PLAYER_SPECIALS.length >= 6, 'the menu must still hold the ordinary specials');
});
```

In `test/moves.test.js`, add `burn` to the tick-coverage list. Change:

```js
  for (const type of ['projectile', 'rain', 'teleport', 'rush', 'aoe', 'trap']) {
```

to:

```js
  for (const type of ['projectile', 'rain', 'teleport', 'rush', 'aoe', 'trap', 'burn']) {
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test test/runway.test.js`
Expected: FAIL — `Expected values to be strictly equal: 'burnrate' !== 'burnitall'` on the first new test, and cascading failures below it.

Run: `node --test test/moves.test.js`
Expected: FAIL — `burn needs a tick`.

- [ ] **Step 3: Implement**

In `src/data/fighters.js`, add the special to `SPECIALS`, after `alignmentshift`:

```js
  burnitall: {
    id: 'burnitall',
    name: 'BURN IT ALL',
    icon: '🔥',
    type: 'burn',
    desc: 'Torches every remaining dollar of runway. The more left, the harder it lands — '
        + 'and you are winded the moment it connects.',
    startup: 0.18, active: 0.12, recovery: 0.40, reach: 130,
    kb: 420, kbUp: -180,
    dmgBase: 8, dmgPerRunway: 0.18,   // 8, plus up to 18 at a full tank
    // Roster-only, and structurally so rather than by convention: the move's
    // entire point is the resource it spends, and RUNWAY has no budget axis
    // (see the decomposition note's open question), so it cannot be priced for
    // a player build. PLAYER_SPECIALS below is what screens.js actually reads.
    rosterOnly: true,
  },
```

Immediately after the `SPECIALS` object closes, add:

```js
// What a player-built founder may choose from. A `rosterOnly` special depends
// on something a player character does not have — today that is RUNWAY, which
// only a `usesRunway` roster entry carries and which the power budget has no
// axis to charge for.
export const PLAYER_SPECIALS = Object.values(SPECIALS).filter(sp => !sp.rosterOnly);
```

Change `max`'s special (line 159):

```js
    special: 'burnrate', style: 'brawler',
```

to:

```js
    special: 'burnitall', style: 'brawler',
```

(leaving the `usesRunway: true` line added in Task 4 directly beneath it).

In `src/ui/screens.js`, change the import on line 4 to add `PLAYER_SPECIALS`, and change line 332:

```js
  for (const sp of Object.values(SPECIALS)) {
```

to:

```js
  for (const sp of PLAYER_SPECIALS) {
```

In `src/engine/moves.js`, add the tick to `ARCHETYPE_TICKS`, after `trap`:

```js
  // Recomputed EVERY active frame, deliberately. Between startup and contact
  // there is 0.18s in which the tank keeps draining and an incoming hit could
  // refill it, and the spec's promise is that the damage is what the tank held
  // at CONTACT. Reading it once at startup would be a different, weaker move.
  //
  // A fighter without `usesRunway` gets dmgBase and nothing else: their runway
  // is pinned at MAX and never spends, so scaling off it would be free damage
  // with none of the cost the number is supposed to represent.
  burn: (f, a, sp, dt, game) => {
    a.dmg = (sp.dmgBase ?? 8) + (f.usesRunway ? f.runway : 0) * (sp.dmgPerRunway ?? 0);
    if (a.fxDone) return;
    a.fxDone = true;
    game.onBurnBlast(f);
  },
```

In `src/engine/fighter.js`, give `burn` the same tall hitbox the `aoe` it replaces had — a point-blank inferno that only clips the chest reads as broken. In `hitbox()`, change:

```js
    const tall = a.kind === 'aoe' ? 150 : 74;
```

to:

```js
    const tall = (a.kind === 'aoe' || a.kind === 'burn') ? 150 : 74;
```

In `src/engine/game.js`, in `strike()`, replace the single refill line added in Task 5:

```js
    this.refillRunway(att);
```

with:

```js
    // BURN IT ALL is the ONE deliberate exception to the refill rule, and it is
    // marked so nobody "fixes" it. The move's whole cost is that it empties the
    // tank; handing 15 straight back on its own hit would refund that cost and
    // turn the signature trade into a free damage spike.
    if (a.kind === 'burn') att.runway = 0;
    else this.refillRunway(att);
```

- [ ] **Step 4: Verify**

Run: `node --test test/moves.test.js`
Expected: PASS, 13 tests.

Run: `node --test test/runway.test.js`
Expected: PASS, 23 tests (16 + 7).

Run: `npm test`
Expected: **310 pass, 0 fail** (303 + 7).

Pay attention to `test/rosterMoves.test.js` here: its `max: meter moves spend and do something` case now fires BURN IT ALL for real, and with `runway` in `EFFECT_NOISE` it must clear the bar on damage, not on `stateChanged`. If it fails, the move is not connecting at 90px — the default `gap` in that file — and that is a real reach finding, not a test to loosen.

- [ ] **Step 5: Commit**

```bash
git add src/data/fighters.js src/engine/moves.js src/engine/fighter.js src/engine/game.js \
        src/ui/screens.js test/runway.test.js test/moves.test.js
git commit -m "feat(burn): BURN IT ALL, and burnrate becomes Elo's alone"
```

---

## Task 7: The AI plays around its own runway

**Read this before writing a line of it.** Step 1 shipped an AI-controlled fighter that stood motionless for an entire match with 277 tests green, because the only coverage was a unit test on the decision function. `preferredStance()` returned the right string; `decide()` then hit `return` with `dir` zeroed and no pulse, every tick, forever. **A unit test on a decision helper does not count here.** Both tests in this task drive a real `Game` for hundreds of frames and count attacks.

Note also that `decide()` runs every `level.react` seconds (0.42 / 0.26 / 0.14), which is fine for a resource on a multi-second clock — no per-frame reflex is needed, unlike the counter. And note the second half of the v2.8 lesson, which is what actually bit last time: **a branch in `decide()` that returns without setting a pulse or a direction is a branch that freezes the controller.**

**Files:** Modify `src/engine/ai.js`; Test `test/ai.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `test/ai.test.js`:

```js
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
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test test/ai.test.js`
Expected: FAIL on the second test — `never once threw BURN IT ALL`. The first test may well **pass** before the change, because Adam's ordinary melee branches still fire when winded. That is fine and expected: it is a regression guard for the branch about to be added, and step 4 is where it earns its keep. Do not skip writing it on those grounds — that is exactly the test that was missing last time.

- [ ] **Step 3: Implement**

In `src/engine/ai.js`, extend the config import on line 4:

```js
import { AI_LEVELS, METER, STAGE, RUNWAY } from '../config.js';
```

In `decide()`, insert the winded branch immediately after the threat-response block (after the `if ((oppAttacking && dist < 220) || projThreat) { ... }` block closes) and before the `--- stance ---` comment:

```js
    // --- winded ---
    // At zero runway the only way out is to connect, so a basic that lands
    // beats a special that whiffs: no dash, no jump-in, no meter spend, just
    // close the gap and swing. Placed AFTER threat response so a winded
    // fighter still blocks a real swing and still jumps a grab — being
    // desperate is not the same as being suicidal.
    //
    // EVERY path out of this branch either sets a pulse or sets `dir`. A
    // branch that returns having done neither freezes the controller for the
    // rest of the match, which is precisely how the stance branch shipped
    // broken with a green suite.
    if (f.winded) {
      if (dist < 128) {
        const r = Math.random();
        if (r < 0.45) this.pulse.punch = true;
        else if (r < 0.80) this.pulse.slap = true;
        else this.pulse.kick = true;
        this.dir = 0;
      } else {
        this.dir = toward;
      }
      return;
    }
```

Then teach the special-selection `fits` list about `burn`. Change:

```js
      const fits =
        (sp === 'projectile' && dist > 240) ||
        (sp === 'rain' && dist > 180) ||
        (sp === 'aoe' && dist < 170) ||
        (sp === 'grab' && dist < 130 && opp.grounded) ||
        (sp === 'rush' && dist > 150 && dist < 460) ||
        (sp === 'teleport' && dist > 200);
```

to:

```js
      const fits =
        (sp === 'projectile' && dist > 240) ||
        (sp === 'rain' && dist > 180) ||
        (sp === 'aoe' && dist < 170) ||
        (sp === 'grab' && dist < 130 && opp.grounded) ||
        (sp === 'rush' && dist > 150 && dist < 460) ||
        (sp === 'teleport' && dist > 200) ||
        // Same range band as the `aoe` it replaces, plus the resource gate:
        // BURN IT ALL spends the whole tank whatever is in it, so throwing it
        // near-empty pays 50 meter for the floor damage AND winds you. Half a
        // tank is the point below which it is strictly a bad idea.
        (sp === 'burn' && dist < 170 && f.runway >= RUNWAY.MAX * 0.5);
```

- [ ] **Step 4: Verify**

Run: `node --test test/ai.test.js`
Expected: PASS, 3 tests (1 + 2).

If `an AI-controlled Adam still attacks and moves while winded` fails **now** having passed in step 2, the new branch is the cause — a `return` reached with neither a pulse nor a `dir`. Fix the branch; do not relax the test.

Run: `npm test`
Expected: **312 pass, 0 fail** (310 + 2).

- [ ] **Step 5: Commit**

```bash
git add src/engine/ai.js test/ai.test.js
git commit -m "feat(runway): the AI scrambles when winded and cashes a full tank"
```

---

## Task 8: The HUD bar

**This one needs a browser.** `node --test` cannot see a DOM, so the tests here are structural only and prove nothing about how it looks. The eye check in step 4 is not optional.

**Files:** Modify `index.html`, `styles.css`, `src/ui/hud.js`; Test `test/runway.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `test/runway.test.js`:

```js
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

// Structural only. These pin that the wiring EXISTS; whether the bar reads
// correctly against health and meter is a browser check (see the plan's
// Task 8 step 4), and no assertion here can stand in for it.
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
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test test/runway.test.js`
Expected: FAIL — `index.html has no #rwTrack1`.

- [ ] **Step 3: Implement**

In `index.html`, add a track below each `.en-track`. For P1, change line 168 from:

```html
              <div class="en-track"><div class="en-fill" id="enFill1"></div><div class="en-spark" id="enSpark1">READY</div></div>
```

to:

```html
              <div class="en-track"><div class="en-fill" id="enFill1"></div><div class="en-spark" id="enSpark1">READY</div></div>
              <div class="rw-track hidden" id="rwTrack1"><div class="rw-fill" id="rwFill1"></div></div>
```

and the same for P2 on line 179, with `rwTrack2` / `rwFill2`.

In `styles.css`, add after the `.en-track.ready .en-spark` rule (line 419):

```css
/* RUNWAY — Adam's private clock, and the one bar in the HUD that goes DOWN on
   its own. Deliberately unlike the two above it in three ways at once, because
   one difference is not enough at 10px: it is half the meter's height, it is a
   flat colour rather than a gradient, and it is narrower than both. The colour
   is Adam's own accent (#ffd23f) so it reads as HIS number — see the note in
   the plan about the one place gold is already used (.en-fill.full). */
.rw-track {
  position: relative; height: clamp(4px, .9vw, 6px);
  background: rgba(5,7,15,.82); border: 2px solid var(--shadow);
  border-radius: 4px; overflow: hidden; width: 58%;
}
.hud-p2 .rw-track { align-self: flex-end; }
.rw-fill {
  position: absolute; inset: 0; transform-origin: left center;
  background: var(--gold); transition: transform .12s linear;
}
.hud-p2 .rw-fill { transform-origin: right center; }
/* Empty has to read as a STATE, not just as a short bar — winded costs 15%
   speed and 20% damage, and the player needs to know why. */
.rw-track.winded { border-color: var(--red); animation: rwWinded .5s infinite; }
@keyframes rwWinded { 50% { border-color: rgba(255,71,87,.35); } }
.rw-fill.refill { animation: rwFlash .22s ease-out; }
@keyframes rwFlash { 0% { filter: brightness(2.6); } 100% { filter: none; } }
```

In `src/ui/hud.js`, extend the config import on line 4:

```js
import { METER, ROUND, RUNWAY } from '../config.js';
```

In `bind()`, add to `this.el` after the `enSpark` line:

```js
      rwTrack: [$('rwTrack1'), $('rwTrack2')],
      rw: [$('rwFill1'), $('rwFill2')],
```

and after `this.hintTimer = null;`:

```js
    // Last frame's runway, per side. The tank only ever goes UP on a landed
    // hit, so a rise is the refill and nothing else — no event plumbing needed.
    this.lastRunway = [null, null];
```

In `setup(game)`, inside the existing `for (let i = 0; i < 2; i++)` loop, after `this.el.combo[i].classList.remove('show');`:

```js
      // Only a fighter who actually burns one gets a bar. A permanently-full
      // gold bar under the other eight is a resource the player would try to
      // play around and could not.
      this.el.rwTrack[i].classList.toggle('hidden', !game.fighters[i].usesRunway);
      this.el.rwTrack[i].classList.remove('winded');
      this.lastRunway[i] = null;
```

In `snapBars(game)`, extend the `bars` array:

```js
      const bars = [
        [this.el.hp[i], f.hp / f.maxHp],
        [this.el.ghost[i], f.hp / f.maxHp],
        [this.el.en[i], f.energy / METER.MAX],
        [this.el.rw[i], f.runway / RUNWAY.MAX],
      ];
```

In `update(game)`, inside the `for (let i = 0; i < 2; i++)` loop, after the pips block and before the loop closes:

```js
      if (f.usesRunway) {
        this.el.rw[i].style.transform = `scaleX(${Math.max(0, f.runway / RUNWAY.MAX)})`;
        this.el.rwTrack[i].classList.toggle('winded', f.winded);
        if (this.lastRunway[i] !== null && f.runway > this.lastRunway[i] + 0.01) {
          this.el.rw[i].classList.remove('refill');
          void this.el.rw[i].offsetWidth;             // restart the flash
          this.el.rw[i].classList.add('refill');
        }
        this.lastRunway[i] = f.runway;
      }
```

- [ ] **Step 4: Verify — tests, then the browser**

Run: `node --test test/runway.test.js`
Expected: PASS, 25 tests (23 + 2).

Run: `npm test`
Expected: **314 pass, 0 fail** (312 + 2).

Now the part the suite cannot do:

```bash
python3 dev-server.py 4173
```

Open `http://localhost:4173/?debug=1`. The human is always P1, so **pick ADAM WEUMANN as the rival** from the select grid — the runway bar will be on the **right-hand (P2)** side of the HUD. Then look at exactly these, in order:

1. **Presence.** P2 has three bars (health, meter, runway); P1 has two. Not two-and-a-half, not three on both.
2. **Stillness during the intro.** While `ROUND 1` and `FIGHT!` are on screen the gold bar does not move at all. It starts moving on the first frame after the banner clears.
3. **The drain.** It empties over ~25 s of round time. Drive it with `UEC.step(1/60)` in a loop if rAF is throttled in your pane.
4. **The refill.** Let Adam hit you: the bar jumps right by about a seventh of its width and flashes bright. Hitting *him* must do nothing to it.
5. **Winded.** At empty the track outline pulses red, and Adam is visibly slower to walk and to swing.
6. **BURN IT ALL.** When Adam connects with it, the bar goes to zero in a single frame.
7. **The colour, side by side with a full meter.** Charge your own meter to 100 so P1's `.en-fill.full` runs its gold-containing gradient, and confirm at a glance that Adam's flat gold runway bar still does not read as "meter full". If it does, the fix is the runway bar's shape (thinner, narrower, or a hard-edged segmented fill), not a different colour — the colour is the character.

Record what you saw. If any of 1–7 is wrong, fix it before committing.

- [ ] **Step 5: Commit**

```bash
git add index.html styles.css src/ui/hud.js test/runway.test.js
git commit -m "feat(runway): a third bar, gold, and only for the man burning it"
```

---

## Task 9: Determinism, the golden baseline, and the docs

**Files:** Modify `test/determinism.test.js`, `docs/ARCHITECTURE.md`

- [ ] **Step 1: Add a runway run to the determinism script**

`test/determinism.test.js` already runs `scam` vs `zara` on a fixed input script to pin the animation boundary. Adam needs his own run: a drain that ticks every frame, a hash that has to see it, and a BURN IT ALL that changes damage mid-match.

Append to `test/determinism.test.js`:

```js
// SCRIPT_A presses `x` (special), so a seeded meter turns the first press into
// a BURN IT ALL: the tank empties, Adam goes winded, and every subsequent hit
// resolves differently for the rest of the run. Runway is hashed (q8, via the
// registry), so if the drain were computed from anything but the fixed
// timestep — wall clock, frame count, Math.random — the two runs would part.
function runBurnMatch() {
  const game = new Game({
    p1: { def: FIGHTERS.find(f => f.id === 'max'), controller: scripted(SCRIPT_A) },
    p2: { def: FIGHTERS.find(f => f.id === 'zara'), controller: scripted(SCRIPT_B) },
    arena: STUB_ARENA, mode: 'solo', difficulty: 'founder',
    hud: STUB_HUD, onEnd: () => {}, seed: 20260815,
  });
  game.fighters[0].energy = METER.MAX;
  const hashes = [];
  for (let i = 0; i < 900; i++) {
    game.update(1 / 60);
    if (i % 15 === 0) hashes.push(hashGameState(game));
  }
  return hashes;
}

test('a match with a draining runway and a BURN IT ALL is deterministic', () => {
  const a = runBurnMatch();
  assert.deepEqual(runBurnMatch(), a, 'two identical runway matches disagreed');
  assert.ok(new Set(a).size > 10, `expected a moving match, saw ${new Set(a).size} distinct states`);
});
```

Run: `node --test test/determinism.test.js`
Expected: PASS, 7 tests (6 + 1). If the two runs disagree, **stop** — that is a real desync in the runway implementation, not a flaky test. The first place to look is the drain: `Math.max(0, f.runway - RUNWAY.DRAIN * dt)` must read the `dt` `updateFighting` was handed, never `rawDt` and never a wall clock.

- [ ] **Step 2: Re-check the golden baseline**

```bash
python3 dev-server.py 4173
```

Open `http://localhost:4173/test/golden/index.html?run=baseline` and read the verdict.

Expected: **all 126 cases match, with nothing re-baselined.** Nothing in this work touches the fighter renderer: the runway bar is DOM, and `test/golden/hash.js`'s `CASES` pin canvas poses only. A mismatch here means something render-adjacent moved that this plan did not intend — inspect it by eye and explain it before re-blessing anything.

- [ ] **Step 3: Document it**

In `docs/ARCHITECTURE.md` §5, first **fix the stale sentence** in *What the simulation remembers*. Replace:

```markdown
A structural test backs it up: a `this.<name>T` timer set on `Fighter` and not declared
in the registry fails the suite.
```

with:

```markdown
A structural test backs it up: `test/fighterState.test.js` constructs a real `Fighter` and
fails on any own enumerable property that is neither declared in the registry nor on an
explicit allowlist of things that are legitimately not simulation state. (It began life as
a grep for `this.<name>T` timers; the very next task moved every registry field into
`initState()`, which left that grep with nothing to find and no way to fail.) The
corollary is worth knowing before you add anything: derived state belongs in a **getter**,
not a constructor field — `usesRunway` and `winded` are getters for exactly this reason.
```

Then add a new subsection at the end of §5, immediately after the stance-switch paragraph and before the `---` that opens §6:

```markdown
### Runway, the second resource

`RUNWAY` (config) is the second verb built on the registry, and the reason `SIM_VERSION`
moved to 6. It is one entry — `{ key: 'runway', init: RUNWAY.MAX, round: 'reset',
hash: 'q8' }` — and everything else follows: initialised in the constructor, cleared at
the round boundary, in the fingerprint, and caught by the structural backstop, none of
which anyone had to remember.

It is deliberately the inverse of meter. Meter builds and rewards patience; runway drains
at 4/second from the moment the round goes live and is topped up only by landing a hit.
At zero the fighter is **winded** — 15% slower, 20% weaker, 20% easier to hit — and
`winded` is derived (`runway <= 0`), never stored, so one connecting hit clears it in the
same frame and there is no timer to reset, hash or leak.

Three placement decisions are load-bearing:

* **The drain lives in `Game.updateFighting`**, not in `Fighter.update`. That is the only
  place `state === 'fighting'` is already true — `updateIntro`, `updateRoundEnd` and
  `updateMatchEnd` all call `Fighter.update` too, and `Game.update` returns early on
  `paused` and on hitstop before the switch. Scoping by call site leaves no condition to
  get wrong later.
* **The refill hooks the two sites that award `METER.HIT_DEAL`** — the normal hit in
  `strike()` and the throw in `doGrab()`. Not chip, not steal, not a counter's payback.
* **Only a character with `usesRunway` drains.** The field is declared and pinned at MAX
  for everyone else, so a non-user hashes identically to a user and the quantiser needs no
  nullable case. Runway is roster-only: `SPECIALS.burnitall` carries `rosterOnly: true` and
  `PLAYER_SPECIALS` is what the profile screen offers, because the power budget still has
  no axis to price a resource.

`burn` joined `ARCHETYPES` (§6) as an eleventh entry — appended, same append-only contract
as `stance`. BURN IT ALL reads its damage from the tank on every active frame and zeroes
it on contact, and it is the one documented exception to the refill rule: refunding 15 on
its own hit would hand back the entire cost of the move.
```

- [ ] **Step 4: Verify and commit**

Run: `npm test`
Expected: **315 pass, 0 fail** (314 + 1).

```bash
git add test/determinism.test.js docs/ARCHITECTURE.md
git commit -m "docs(runway): the second resource, and a determinism run that spends it"
```

---

## Acceptance

Mirrors spec §10.

- [ ] `npm test` green at **315**, including two real-`Game` AI tests that count attacks (`test/ai.test.js`)
- [ ] Runway drains at `DRAIN`/second while fighting and not during intro, KO, victory or pause
- [ ] A landed hit refills by `REFILL_ON_HIT`, capped at `MAX`; a hit turned away by a block does not
- [ ] At zero, `speedMult` and `dmgMult` fall and `takenMult` rises; one hit clears it in the same frame
- [ ] A fighter without `usesRunway` never drains and is never winded, across a full round
- [ ] Runway returns to `MAX` at a round boundary, asserted rather than assumed
- [ ] BURN IT ALL scales with the runway it spends, empties the tank on contact, and does **not** refill on its own hit
- [ ] Runway moves the state fingerprint, asserted directly
- [ ] `burn` in `ARCHETYPES` (appended, index 10), in `ARCHETYPE_SHAPES`, and rejected as a command normal
- [ ] HUD bar visible for Adam only, verified in a browser against all seven checks in Task 8 step 4
- [ ] `SIM_VERSION` is 6, the stale "stays 5" comment is gone; `SCHEMA_VERSION` 2 and `CHARACTER_WIRE_VERSION` 1 unchanged
- [ ] `usesRunway` confirmed to reach the peer — resolved below, and recorded in this plan
- [ ] Elo owns `burnrate` alone on the roster
- [ ] Determinism passes with a draining runway and a BURN IT ALL in the script
- [ ] Golden baseline: 126 matching, nothing re-baselined

---

## Notes for whoever picks this up

**`usesRunway` and `toCharacter` — resolved, and the answer is "do nothing".** The spec flags this as an open check with a real bug behind it. It was traced: `toCharacter` does **not** need to carry the flag, and adding it would be actively wrong.

`main.js:498 defToSpec` sends `{ wv, sv, simv, ch: toCharacter(def), kind: 'roster', id: def.id }`. `main.js:518 specToDef` validates, and for a roster pick returns **`getFighter(spec.id)`** — the receiver's own local roster def, keyed by an id both sides agree on. So `usesRunway: true` sitting on `max` in `src/data/fighters.js` reaches the peer the same way `parts` does: it is never sent, because it never needs to be. This is the pattern `toCharacter`'s own comment already argues for `parts` — *"a validated-then-discarded field is worse than no field, because it makes the protocol look like it does something it doesn't."* Adding `usesRunway` to `toCharacter` would create exactly that field.

Two related paths, both checked:
* `buildGhostFighter(ch)` spreads `...getFighter(ch.f)`, so a ghost of Adam inherits the flag. Correct.
* `buildCustomFighter(profile)` spreads `...getFighter(profile.baseId)`, and `baseId` is peer-controlled on the custom path. A peer could send `baseId: 'max'` and inherit `usesRunway` — but that is a **handicap** (their tank drains), and their special comes from `profile.special`, which `PLAYER_SPECIALS` and the `rosterOnly` marker now keep away from `burnitall`. Even if it slipped through, the tick's `f.usesRunway ? f.runway : 0` term means the exploit direction — full tank, no drain, 26 damage — cannot exist. There is nothing to fix here, but it is worth knowing the shape of it.

**`alignmentshift` is already exposed to players, and this plan does not change that.** `screens.js:332` built the special dropdown from every entry in `SPECIALS` with no filter, so a player-built founder has been able to pick ALIGNMENT SHIFT since v3.5. Task 6 introduces `rosterOnly` and `PLAYER_SPECIALS` and applies the marker to `burnitall` only. Whether a stance toggle should also be roster-only is a real question with a real answer either way (a stance is at least self-contained and costs the same 50 meter as any special), and it is a balance decision, not a bug — so it is left alone rather than folded into this change. Someone should decide it deliberately.

**A block currently turns every non-grab hit into a parry, and `BLOCK.CHIP` is dead code. This is pre-existing — report it, do not fix it here.** Verified against the live engine on 2026-08-15: `Fighter.update`'s `default:` branch runs `if (pad.block && this.grounded) this.setState('block')` *every frame*, and `setState` zeroes `stateT`. Nothing in that branch ever increments `stateT` back up. So a fighter holding block sits at `stateT === 0` indefinitely, `strike()`'s `blocked && def.stateT <= PARRY.WINDOW` is permanently true, and the chip branch four lines below it can never run. Measured directly: a punch into a held block deals **0 damage** and awards the defender exactly `PARRY.ENERGY` (10), with the attacker staggered for `PARRY.STAGGER`.

Two consequences for this work, neither of which is a reason to change the parry code inside this plan:

* The Task 5 test is written as *"a hit turned away by a block does not refill"* and asserts `defEnergy === PARRY.ENERGY`, so it pins the outcome that actually happens rather than passing for the wrong reason. If someone later fixes the parry window, that assertion is the thing that tells them to revisit the refill rule — which is the correct place to have the conversation.
* **A blocked BURN IT ALL is a parried BURN IT ALL**, which means the move is interrupted (`att.attack = null`, `att.setState('hitstun')`) and the tank is not spent at all. Adam pays 50 meter and a `PARRY.STAGGER` stagger and keeps his runway. Given how committal the move is, that reads as acceptable — but it is a consequence of a bug, not a design decision, so it should be re-examined the moment the parry window is fixed.

`STANCE`'s own config comment already reasons carefully about how `taken` interacts with chip damage. That reasoning is about a code path that cannot currently execute. Worth knowing before anyone trusts it.

**Adam's budget does not move, and that is not an oversight.** `budgetCost` prices style params, body and command normals. A character's signature special is not priced at all, so swapping `burnrate` (aoe, 22 flat) for `burnitall` (8–26 plus a resource) changes his cost by exactly zero. This is the open question the decomposition note records — the budget has no axis for a resource — and it is out of scope here. It is also why `burn` is refused as a command normal: the command-normal budget would price it at 0, same as `strike`.

**"Elo owns `burnrate` alone" is true of the roster, not of every def in the file.** `BASE_CHARACTERS` still contains `b-builder` and `b-maker` on `burnrate`. Those are player-build silhouettes, not roster fighters, and the spec's sharing-pair table is about the nine. The acceptance test asserts over `FIGHTERS` deliberately.

**The gold collision is the weakest part of the HUD design.** `--gold` is already load-bearing in two places near this bar: `.pip.won` and `.en-fill.full`'s gradient. The spec is firm that the runway bar must be Adam's `accent` so it reads as *his* number, and that is the right call, but it means the differentiation has to come entirely from shape — half height, 58% width, flat fill against two gradients. Check 7 in Task 8 exists because that is the judgement most likely to be wrong on contact with a real screen. If it fails, change the shape, not the colour.

**The second AI test is not seeded.** `AIController` uses `Math.random()` throughout, so `an AI-controlled Adam actually throws BURN IT ALL` is probabilistic — 1200 frames at `founder`'s 0.26 s cadence is roughly 75 decisions, each with `specialProb` 0.55 once the range gate is met, and Adam's `prefRange: 'close'` walks him into that range on his own. It should be overwhelmingly reliable. If it ever flakes, lengthen the run; do **not** replace it with a unit test on `decide()`, which is the substitution that let a motionless fighter ship last time.
