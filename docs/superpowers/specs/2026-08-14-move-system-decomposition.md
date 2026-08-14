# MOVE SYSTEM — decomposition note

Not a design spec. This is the output of a brainstorming session that stopped at the
decomposition step, recorded so the next session starts from the decisions rather than
re-deriving them.

The character engine work was split in two. The **silhouette half shipped as v3.4**
(`docs/superpowers/specs/2026-08-13-character-parts-design.md`). This is the other half.

---

## What was measured, and what it corrected

The motivating complaint was "six specials for nine fighters". The real numbers are
narrower:

| Special | Owned by | Their command normal |
|---|---|---|
| `pivot` | ava, scam | counter vs projectile |
| `burnrate` | max, elo | rush vs aoe |
| `takeover` | dex, bozo | grab vs strike |
| `pitchdeck` | kai | teleport |
| `growthhack` | zara | strike + trap |
| `fundinground` | eleanor | rain |

So **three pairs share a signature special**, not six fighters running on three moves.
And the sharers do not play identically — each pair is split by a different command
normal.

Separately: **all nine archetypes are live.** `counter`, `rush`, `teleport`, `strike`,
`trap`, `rain`, `grab`, `aoe` and `projectile` each appear at least once across the ten
shipped command normals. v2.8's claim holds; there is no dead archetype to revive.

---

## The decision

Filling the three gaps within the existing vocabulary was offered and **rejected**. The
ceiling is not "three characters are missing a move", it is that the engine can express
only nine kinds of move, and all nine are variations on *a thing happens now, at a
place*. Nothing in the game **persists**, **defers**, or **changes the rules**.

So: **new verbs first, then signatures built on them.**

Four verbs were chosen, all four:

| Verb | What it adds | Risk |
|---|---|---|
| **Resource** | A private per-fighter economy that is not energy — runway, burn rate. Moves spend it, some build it, running dry has consequences. | Moderate |
| **Deferred effect** | A move that resolves seconds later. The invoice, the vesting cliff. Creates a clock the opponent must play around. | Moderate |
| **Stance switch** | Toggle your own frame data and options until you switch back or get hit. "Pivot to enterprise." | Low |
| **Summon** | An autonomous helper that acts for a while. The intern, the growth team. | High |

---

## The insight that decides the order

**These are not four independent features. They share one substrate.**

Every one adds *persistent per-fighter simulation state*: a resource value, a pending
timer, a stance flag, a live summon. Every piece of that state must do the same four
things correctly, and each is a way to desync a live match:

1. **Enter `hashGameState`** (`src/net/online.js`). It currently hashes x, y, hp, energy,
   the timer, round wins, and two array lengths — nothing else. State it cannot see is
   state two peers can silently disagree about, surfacing ~2 s later as a voided match
   wearing the costume of a network fault.
2. **Reset at round boundaries and on KO**, without leaking into the next round. The
   parts work found live state leaking between renders twice; simulation state leaking
   between rounds is the same bug with real consequences.
3. **Be visible to the AI.** A mechanic the AI cannot see is a mechanic it cannot play
   around. v2.8's lesson applies directly: `CMD_FIT.counter` returned false pointing at
   a threat-response handler that never existed, so the AI could never throw a counter —
   and adding it to `decide()` was not enough, because `decide()` runs every ~0.25 s
   while a counter must be up during a 0.05 s startup. It had to become a per-frame
   reflex in `update()`. Any verb with a timing window will hit exactly this.
4. **Bump `SIM_VERSION`.** All of this changes what a move does. Unlike the parts work —
   which was render-only and could never desync — every verb here is netcode-relevant.
   `SIM_VERSION` is currently 4.

Build that substrate four times and you get four subtly different bugs. Build it once,
prove it with the cheapest verb, and the other three become largely data-shaped.

---

## Sequence

Each step is its own spec → plan → implementation cycle.

**1. Persistent fighter state foundation + stance switch.**
The foundation is the real deliverable: a declared place for per-fighter simulation
state, hashed, reset, and exposed to the AI by construction rather than by remembering.
Stance switch rides along because it is the cheapest real verb — Unicorn Mode
(`unicornT`, a timed self-buff with damage and speed multipliers) already proves the
shape — so it exercises the substrate without inventing much alongside it. Nothing else
should be attempted until state hashing and round reset are demonstrably right.

**2. Resource.** A second meter on the proven substrate, plus HUD work. The design
question to answer then, not now: does a resource gate moves, modify them, or punish you
for emptying it?

**3. Deferred effect.** Independent of resource. The hard part is not the mechanic, it is
timers surviving KO, round end and match end without leaking or double-firing.

**4. Summon.** Last, deliberately. A third acting entity touches hit resolution, the AI's
target selection, and the state hash all at once. It is the only one of the four that
careful state handling alone does not make safe.

---

---

## Step 1 design decision: a declared state registry

Taken in the same session, after the sequence above. The spec document itself was
deliberately not written here — see the note at the end.

**Approach chosen: every piece of persistent fighter state is declared once**, in one
registry, carrying its name, default, whether it resets per round, whether it enters the
state hash, and how the AI reads it. `Fighter` initialises from the registry,
`resetForRound` iterates it, `hashGameState` iterates it. Adding a verb's state without
hashing or resetting it becomes impossible rather than merely discouraged.

Two alternatives were considered and rejected. A single `ext` object hashed wholesale is
less machinery, but hashing an object needs a stable key order and "hashed wholesale"
makes it easy to put something in there that should not be hashed at all — it trades a
clear contract for less code. Keeping ad-hoc fields behind a structural test (the way
`determinism.test.js` guards the render boundary) is cheapest and closest to existing
style, but it catches the mistake after you make it, and only for names it can
pattern-match.

### The evidence this is not hypothetical hygiene

`resetForRound()` in `src/engine/fighter.js` clears twenty fields **by hand**, including
every buff timer (`unicornT`, `speedBuffT`, `dmgBuffT`, `shieldT`, `dashCD`, `stealCD`).
There is no round-to-round leak today; the existing code is disciplined.

But it is a hand-maintained list and **it has already drifted**. These fields are set in
the constructor and never cleared between rounds (verified, 2026-08-14):

| Field | Why it is probably harmless today |
|---|---|
| `stunT` | Only read while `state === 'hitstun'`, and `state` is reset to `'idle'`. |
| `comboDropT` | Same masking — the combo chain is re-entered from a clean state. |
| `airAttackUsed` | Cleared on landing, and `airborne` is reset. |
| `walkPhase` | Animation phase; render-only in effect. |
| `movingBack` | Recomputed every frame from the pad. |
| `dashDir` | A direction, not a timer; meaningless until a dash starts. |

Every one is masked by something else rather than handled deliberately. That is the
mechanism that will bite when four verbs each add state: `hashGameState` is a **second**
hand-maintained list with the same weakness, and a resource value or a pending deferred
timer has no `state === 'idle'` to hide behind.

Part of step 1 is therefore to classify each of the six above as either "should reset"
or "safe not to, and here is why" — recorded in the registry, not left to inference.

---

## Deliberately not decided here

* Which of the three sharing pairs gets which new signature, and whether the *other*
  member of each pair keeps the shared special or also gets a new one.
* Whether new verbs are available to player-built founders through
  `data/playerMoves.js`, or stay roster-only. This has ranked-ladder consequences: the
  player budget is a zero-sum fairness rule (`PLAYER_BUDGET = 3`), and a verb that is not
  priceable cannot be offered to players.
* How the power budget prices any of these. `budgetCost` prices frame data, archetype
  capability and `params` axes; a resource or a deferred effect has no obvious axis. Note
  the budget is calibrated for the player build, not the roster — the shipped nine span
  −13.4 to +12.3 and five sit in the warn band, so it is not currently a roster gate.

---

## Where to start next session

Read, in this order: this note; `docs/superpowers/specs/2026-08-13-character-parts-design.md`
as a worked example of the spec format and voice; `ARCHITECTURE.md` §5 on the three
version numbers and why confusing them causes real damage.

**Step 1's approach is already decided** (declared state registry, above), so the next
session does not re-brainstorm it — it writes the spec document for step 1 and takes it
through the normal review gate. The design work that is still open for that spec:

* the registry's exact shape, and where it lives (`config.js` holds every tunable
  number; the registry is closer to schema than to tuning)
* how the AI reads registry state — note v2.8's lesson that `decide()` runs every
  ~0.25 s and cannot serve a mechanic with a short timing window; that needs a per-frame
  reflex in `update()`
* what stance switch actually does to frame data, and how it interacts with Unicorn Mode
  (both are timed self-buffs; do they stack, override, or cancel?)
* the classification of the six currently-unreset fields
* testing: the existing suite has no round-transition test at all, which is what a state
  leak would need to be caught by

The parts work is merged to local `main` as v3.4 and is **not pushed** — `origin/main`
is still at v3.3 (`119c3dc`).
