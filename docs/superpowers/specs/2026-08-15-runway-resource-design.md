# RUNWAY — a private resource, and the move that spends it

Step 2 of the move system, scoped by
`docs/superpowers/specs/2026-08-14-move-system-decomposition.md`. Step 1 (the fighter
state registry, proved by stance switch) shipped as **v3.5**; this is the first verb
built on a substrate that already exists.

Everything here is simulation. `SIM_VERSION` must bump, 5 → 6.

---

## 1. Why a second resource is not a second meter

The game already has a resource. Meter **builds** — 12 per hit dealt, 8 per hit taken,
3 per chip — and spends at 25 (bomb), 50 (special), 100 (super). It rewards patience:
stay alive, accumulate, cash in.

A second accumulating resource would be meter with extra steps, and players would read
the two bars as the same thing. So RUNWAY does the opposite: it **drains on a clock from
the moment the round starts**, and the only way to top it up is to land hits.

That inverts the pressure. Meter says *wait and you gain*. Runway says *wait and you
lose*. A fighter carrying both is being pulled in two directions at once, which is the
whole reason it is worth adding rather than reskinning what exists.

It is also the parody writing itself. **Adam Weumann, THE BURNER, torched $47B and kept
the jet.** He is the only character on the roster who should have a number going down.

---

## 2. The mechanic

```js
// config.js
export const RUNWAY = {
  MAX: 100,
  DRAIN: 4,            // per second, while the round is live
  REFILL_ON_HIT: 15,   // a landed hit buys you runway back
  WINDED: { speed: 0.85, dmg: 0.80, taken: 1.20 },
};
```

**Drains** at `DRAIN`/second while `game.state === 'fighting'` — not during the round
intro, not during KO or victory, not while the match is paused. **Refills** by
`REFILL_ON_HIT` whenever the owner lands a hit, capped at `MAX`.

**At zero the fighter is WINDED**: slower, weaker, and easier to hit, until they land
something. There is no separate timer for this — `winded` is derived as `runway <= 0`,
so it clears the instant a hit refills. One less piece of state to reset, hash and get
wrong.

### Only Adam has it

The registry field exists on every fighter and initialises to `MAX`, but only a
character that opts in ever drains. Everyone else sits pinned at full and can never be
winded. That keeps the registry uniform — one declaration, hashed the same way for
everyone — rather than introducing a nullable field whose quantiser needs a special
case. Hashing a constant costs nothing and cannot desync.

Opt-in is a flag on the character: `usesRunway: true`.

---

## 3. The signature: BURN IT ALL

Adam's new special, replacing the `burnrate` he currently shares with Elo — which
becomes Elo's alone, closing the second of the three original sharing pairs.

```js
burnitall: {
  id: 'burnitall', name: 'BURN IT ALL', icon: '🔥', type: 'burn',
  desc: 'Torches every remaining dollar of runway. The more left, the harder it lands — '
      + 'and you are winded the moment it connects.',
  startup: 0.18, active: 0.12, recovery: 0.40, reach: 130,
  dmgBase: 8, dmgPerRunway: 0.18,   // 8 + up to 18 at full runway
}
```

Damage scales with runway **spent**, and spending it empties the tank — so the move
leaves Adam winded by construction. Throw it full and it hurts; throw it full and you
are then slow, weak and fragile until you connect again. That is the trade, and it is
the same character trait as the stance sets: a real cost, not a drawback on paper.

It must **not** refill on its own hit. The whole point is that it empties you; refunding
15 immediately would undercut it. This is a deliberate exception to the refill rule and
needs a comment saying so, or someone will "fix" it later.

---

## 4. What step 1 bought us

This is the payoff for building the registry first. Adding a resource is now:

* one entry in `FIGHTER_STATE` — `{ key: 'runway', init: RUNWAY.MAX, round: 'reset',
  hash: 'q8' }` — and it is hashed, reset and backstop-checked automatically
* multipliers folded into the existing `speedMult` / `dmgMult` / `takenMult` getters,
  next to the stance and unicorn terms already there
* no new hand-maintained list anywhere

If step 1 had not happened, this is precisely where an unhashed field would have entered
the simulation and desynced live matches two seconds into the first winded fighter.

---

## 5. HUD

The decomposition note predicted this step forces HUD work, and it does: a resource the
player cannot see is a resource they cannot play around.

Adam gets a second, thinner bar beneath his health bar, shown **only** when
`usesRunway`. It drains visibly, flashes on refill, and reads clearly as empty when
winded. `src/ui/hud.js` already draws the meter and references `energy` in seven places;
follow that pattern rather than inventing a second drawing path.

Colour is the one thing to get right: it must not read as a second health or meter bar.
Use Adam's own `accent` (`#ffd23f`) so it is legible as *his* number.

---

## 6. AI

Adam's AI must play around his own runway, or the mechanic exists only for the player.

The v2.8 lesson applies and the step 1 precedent shows the shape: `decide()` runs every
`level.react` (0.42 / 0.26 / 0.14), which is fine for a resource that moves on a
multi-second clock. No per-frame reflex is needed here.

Two behaviours, both in `decide()`:

* **Winded, or nearly so** — prioritise landing *anything*. A basic that connects is
  worth more than a special that whiffs, because connecting is the only way out.
* **Runway high** — BURN IT ALL becomes attractive, weighted by how full the tank is.
  Throwing it near-empty is strictly bad and the AI should not.

---

## 7. Versioning

`SIM_VERSION` 5 → 6. Fight behaviour changes: Adam gains a move, a winded fighter
resolves damage and movement differently, and the registry grows a hashed field.

`SCHEMA_VERSION` (2) and `CHARACTER_WIRE_VERSION` (1) stay put. `usesRunway` is a
character flag, so it does travel — but it is a boolean on an existing shape, and the
wire payload's *shape* is what that version guards. Confirm during implementation
whether `toCharacter` carries it; if it does not, Adam's runway will not drain on the
peer's screen and that is a real bug, not a cosmetic one.

`burn` joins `ARCHETYPES`. Step 1 learned this the hard way: `stance` was missing and
`roster.test.js` failed permanently until it was added, along with an
`ARCHETYPE_SHAPES` entry and a `validateCharacter` rejection for using it as a command
normal. Do all three for `burn` up front.

---

## 8. Testing

| Layer | Test |
|---|---|
| Drain | Runway falls at `DRAIN`/second while fighting, and does **not** move during intro, KO, victory or pause. |
| Refill | A landed hit adds `REFILL_ON_HIT`, capped at `MAX`. |
| Winded | At zero, `speedMult` and `dmgMult` fall and `takenMult` rises; one landed hit clears it in the same frame. |
| Opt-out | A fighter without `usesRunway` never drains and is never winded, across a full round. |
| Round reset | Runway returns to `MAX` — free from the registry, but assert it, because that is the guarantee. |
| BURN IT ALL | Damage scales with runway at the moment of contact; the move empties the tank; it does **not** refill on its own hit. |
| Hash | Runway moves the fingerprint. Registry-driven, but assert it. |
| AI | A winded Adam still attacks. **Drive a real `Game` and count attacks** — step 1 shipped an AI that stood still for an entire match with 277 tests green, and a unit test on the decision function would not have caught it. |
| Determinism | Scripted runs with a winded fighter and a BURN IT ALL agree on hashes. |

---

## 9. Out of scope

* **Deferred effect and summon.** Steps 3 and 4.
* **The last sharing pair.** `takeover` (dex + bozo) stays shared; only Adam moves here.
* **Player access.** Runway is roster-only. Offering it to player-built founders needs a
  budget price, and the budget still has no axis for a resource — the open question
  recorded in the decomposition note, unchanged.
* **Runway interacting with stance or Unicorn.** Adam has neither. If a future character
  carries two verbs at once, that interaction gets designed then rather than guessed at
  now.

---

## 10. Acceptance

* `npm test` green, including a real-`Game` AI test that counts attacks
* Runway drains, refills, winds and resets; a non-user is untouched
* BURN IT ALL scales with what it spends and leaves Adam winded
* `burn` in `ARCHETYPES`, `ARCHETYPE_SHAPES`, and rejected as a command normal
* HUD bar visible for Adam only, and unmistakable against health and meter
* `SIM_VERSION` 6; `SCHEMA_VERSION` 2 and `CHARACTER_WIRE_VERSION` 1 unchanged
* `usesRunway` confirmed to reach the peer, or the gap explicitly recorded
* Elo owns `burnrate` alone
