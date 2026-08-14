# FIGHTER STATE FOUNDATION — and stance switch as its proof

Step 1 of the move system, scoped by
`docs/superpowers/specs/2026-08-14-move-system-decomposition.md`. That note decided the
sequence, the four verbs and this step's approach; read it first for the reasoning this
spec does not repeat.

Unlike the parts work, **everything here is simulation.** `SIM_VERSION` must bump.

---

## 1. The problem

Persistent per-fighter state is governed by **two hand-maintained lists**, and
both have already drifted.

`Fighter.resetForRound()` clears twenty fields by name. Eight more are set in the
constructor and never cleared between rounds: `stunT`, `comboDropT`, `airAttackUsed`, `energy`, `moveVx`,
`walkPhase`, `movingBack`, `dashDir`. None is live-broken — each is masked by `state`
resetting to `'idle'`, or recomputed every frame — but none was *decided*, either.

`hashGameState()` in `src/net/online.js` names thirteen values. Everything else is
invisible to desync detection, including every buff timer the game already has.

Today that is survivable. It stops being survivable in step 2 onward: a resource value
or a pending deferred timer has no `'idle'` to hide behind, and state the hash cannot see
is state two peers can silently disagree about — surfacing two seconds later as a voided
match wearing the costume of a network fault.

**Building that discipline once, before three more verbs depend on it, is the whole
point of this step.** Stance switch rides along as the cheapest real verb that exercises
it.

---

## 2. The registry

New module `src/engine/fighterState.js`. It sits beside `fighter.js` rather than in
`config.js` or `schema.js` deliberately: `config.js` holds tunable numbers, `schema.js`
holds the character format, and this is neither — it is a declaration of what the
simulation remembers.

```js
export const FIGHTER_STATE = [
  { key: 'unicornT',   init: 0, round: 'reset', hash: 'q8', ai: 'unicorn' },
  { key: 'stanceId',   init: null, round: 'reset', hash: 'enum', ai: 'stance' },
  { key: 'stanceCD',   init: 0, round: 'reset', hash: 'q8' },
  { key: 'stunT',      init: 0, round: 'reset', hash: 'q8' },
  { key: 'walkPhase',  init: 0, round: 'keep',  hash: false,
    why: 'animation phase; render-only in effect, and visibly worse if it snaps' },
  // ...
];
```

Every entry declares four things, and **none of them has a default**:

| Field | Values | Meaning |
|---|---|---|
| `key` | identifier | The property name on `Fighter`. |
| `init` | value, or `() => value` for objects | Constructor value. |
| `round` | `'reset'` \| `'keep'` | What happens at a round boundary. `'keep'` requires a `why`. |
| `hash` | `false` \| `'q8'` \| `'int'` \| `'enum'` | How it enters the state fingerprint. `false` requires a `why`. |
| `ai` | accessor name, optional | Exposes the value to the AI under a stable name. |
| `why` | string | Mandatory whenever `round: 'keep'` or `hash: false`. |

Making `why` mandatory for the two opt-outs is the load-bearing detail. The drifted
fields did not drift because anyone decided they should persist — they drifted because
declaring nothing was easier than declaring something. An opt-out that costs a sentence
of justification is an opt-out people take deliberately.

`hash` quantisers mirror what `hashGameState` already does: `q8` is
`Math.round(v * 8)`, matching the existing `q()`; `int` is `v | 0`; `enum` maps a
nullable string to a stable integer index, because hashing strings by character would be
needlessly expensive and order-sensitive.

### What consumes it

Three call sites, each replacing hand-maintained code:

* **`Fighter` constructor** — initialises every `key` from `init`.
* **`Fighter.resetForRound()`** — iterates entries with `round: 'reset'`. The twenty
  existing by-name assignments that are genuinely per-round state move into the registry;
  positional ones (`hp`, `x`, `y`, `facing`) stay explicit, since they depend on `side`.
* **`hashGameState()`** — iterates entries with a truthy `hash`, for both fighters, and
  appends to the existing thirteen values. Existing hashed values are unchanged and stay
  in the same order, so the fingerprint only grows.

### Backstop

The registry makes the right thing easy; a structural test makes the wrong thing loud.
`test/fighterState.test.js` reads `src/engine/fighter.js` and fails when a
`this.<name>T = ` timer assignment appears in the constructor whose `<name>T` is not a
registry key. This was rejected as the *primary* approach in the decomposition note —
it catches mistakes after the fact and only for names it can pattern-match — but as a
second line behind the registry it costs almost nothing and catches the one failure the
registry cannot: someone adding a field directly and never opening the registry at all.

---

## 3. Classifying the drifted fields

Every field set in the `Fighter` constructor and absent from `resetForRound`, decided
rather than inherited. Eight, not six — the first pass grepped for timer-shaped names and
missed two. Config and identity fields (`def`, `body`, `side`, `controller`, `stats`,
`maxHp`, `special`, `cmdBySlot`) are excluded: they are per-character, correctly
constructor-only, and out of the registry's scope.

| Field | Decision | Why |
|---|---|---|
| `stunT` | `reset` | Hitstun must not survive a round. Harmless today only because `state` masks it; that is coincidence, not design. |
| `comboDropT` | `reset` | Same. The combo chain should begin each round from nothing. |
| `airAttackUsed` | `reset` | A fighter starts a round grounded with its air attack available. Cleared on landing today, which is a different guarantee. |
| `energy` | `keep` | **Meter carries between rounds. That is a real design property and it has never been written down anywhere.** Set to 0 in the constructor only; nothing resets it. Already hashed, so it is consistent — just undeclared. |
| `walkPhase` | `keep` | Animation phase. Snapping it to zero is visibly worse than letting it continue, and nothing reads it in the simulation. |
| `movingBack` | `keep` | Recomputed from the pad every frame before any read. |
| `moveVx` | `keep` | Walk intent, zeroed at the top of every `update()` before use. |
| `dashDir` | `keep` | A direction, meaningless until a dash starts, and a dash always sets it. |

All eight get a `why` in the registry, including the three that reset — the table above
is the source text.

`energy` is worth dwelling on, because it is the registry's argument in miniature.
Cross-round meter carryover is a genuine balance decision that shapes how round two
plays, and the only place it is currently recorded is the *absence* of a line in
`resetForRound`. Nobody reading that method can tell whether it was decided or
forgotten. That is precisely the failure the `why` field exists to prevent, and it was
already live before any new verb was added.

---

## 4. Stance switch

The proving verb. Chosen because Unicorn Mode (`unicornT`, a timed self-buff applying
speed and damage multipliers) already demonstrates the shape, so it exercises the
registry without inventing much beside it.

**Assigned to `scam` (SCAM ALT, CLOSEDAI, THE ALIGNMENT GUY) as `alignmentshift`.** Two
reasons: he currently shares `pivot` with `ava`, so this closes one of the three sharing
gaps as a side effect and leaves `pivot` as Lizbeth's alone; and a founder who toggles
between "safety" and "capabilities" is the parody writing itself.

### Behaviour

A toggle, not a timer. Pressing special switches between two declared stances and stays
there until switched back, the round ends, or the fighter is KO'd. A cooldown
(`STANCE.CD`) prevents toggling every frame.

```js
// config.js
export const STANCE = {
  CD: 0.8,                       // seconds between switches
  COST: 0,                       // meter cost; 0 in v1 — pricing a toggle is unresolved, see §7
  SETS: {
    safety:       { startup: 1.15, dmg: 0.85, recovery: 0.9,  speed: 0.95, taken: 0.85 },
    capabilities: { startup: 0.9,  dmg: 1.2,  recovery: 1.15, speed: 1.05, taken: 1.15 },
  },
};
```

`taken` is a damage-taken multiplier — the tradeoff that keeps a stance from being a
pure upgrade. Neither set is strictly better than neutral: `safety` is slower and weaker
but absorbs; `capabilities` hits harder and faster but takes more.

### Interaction with Unicorn Mode

**They stack multiplicatively, and that is safe** because a stance is a *tradeoff* while
Unicorn is a pure timed buff. `capabilities` plus Unicorn is genuinely dangerous, but
the fighter is also taking 15% extra damage for the six seconds it lasts, which is
exactly when the opponent most wants to hit them.

This is the one decision in this spec most likely to be wrong on contact with play. It
is called out here so it gets tested rather than assumed, and the cheap fallback if it
proves oppressive is to make Unicorn force `safety`, or suppress stance multipliers for
its duration.

### AI

The AI must be able to see and use this, and the shape of that is already known from
v2.8. `decide()` runs every `level.react` seconds (0.14–0.42), which is fine for a
toggle with a 0.8 s cooldown — unlike a counter, whose 0.05 s startup forced a per-frame
reflex in `update()`. So stance switching goes in `decide()`, weighted by health: below
a third HP an AI prefers `safety`, above it `capabilities`.

The registry's `ai` field is what makes this possible without the AI reaching into
fighter internals — it reads `stance` through a declared accessor.

---

## 5. Versioning

`SIM_VERSION` 4 → 5. Fight behaviour changes: `scam` gains a move, and any fighter in a
stance resolves damage differently.

`SCHEMA_VERSION` and `CHARACTER_WIRE_VERSION` are untouched. A stance is runtime state,
not part of a character's declared shape — `scam`'s `special` field changes value, but
the character format does not change, and the wire payload's shape does not change.

Note the state hash grows. That is not a compatibility break on its own, because
`SIM_VERSION` already refuses a mismatched peer before a match starts.

---

## 6. Testing

| Layer | Test |
|---|---|
| Registry integrity | Every entry has `key`, `init`, `round`, `hash`. Every `round: 'keep'` and every `hash: false` has a non-empty `why`. Keys are unique. |
| Constructor | A fresh `Fighter` has every registry key present, at its `init` value. |
| **Round transition** | Set every `round: 'reset'` key to a non-default value, run a round transition, assert each is back at `init` and each `'keep'` key is untouched. |
| Hash coverage | Mutating any `hash`-truthy key changes `hashGameState`; mutating any `hash: false` key does not. |
| Structural backstop | A timer assignment in `fighter.js`'s constructor that is not a registry key fails the suite. Verified by adding one temporarily. |
| Stance behaviour | Switching applies the multipliers; the cooldown blocks a second switch inside `STANCE.CD`; a stance does not survive `resetForRound`. |
| Stance × Unicorn | Both active multiply, and the damage-taken penalty still applies. |
| AI | An AI below one third HP switches to `safety`; above it, prefers `capabilities`. |
| Determinism | Two runs, same seed and scripted inputs, with stance switching in the script, produce identical hashes. |

**The round-transition test is the one that did not exist before.** No test file
currently references `resetForRound` or `roundWins`, which is precisely why eight fields
could drift out of the reset list without anything going red.

---

## 7. Out of scope

* **Resource, deferred effect and summon.** Steps 2–4. This step must not add
  speculative registry features for them; the registry earns its generality by being
  used once, correctly, and extended when the second verb actually arrives.
* **Reassigning the other two sharing pairs.** `max`/`elo` on `burnrate` and
  `dex`/`bozo` on `takeover` stay as they are. Only `scam` moves, and only because the
  proving verb needed a home.
* **Player access.** Stance switch is roster-only for now. Offering it to player-built
  founders needs a budget price, and the budget has no axis for a tradeoff toggle — that
  is a real open question recorded in the decomposition note, not something to answer
  in passing here.
* **HUD.** A stance needs to be visible to the player eventually. v1 shows it through
  the existing move-name popup on switch; a persistent indicator is step 2's problem,
  when the resource meter forces HUD work anyway.

---

## 8. Acceptance

* `npm test` green, including the new round-transition test
* The structural backstop verified to fail when a timer is added outside the registry
* All eight drifted fields classified, each with a `why`
* `SIM_VERSION` is 5; `SCHEMA_VERSION` and `CHARACTER_WIRE_VERSION` unchanged
* `scam` throws `alignmentshift`; `ava` owns `pivot` alone
* Golden baseline re-checked — stance changes frame data, so attack frames legitimately
  move, and the block/idle frames should not
