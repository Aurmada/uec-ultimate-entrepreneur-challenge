# SAME-DAY DELIVERY: a move that lands later

Step 3 of the move system, scoped by
`docs/superpowers/specs/2026-08-14-move-system-decomposition.md`: the **deferred
effect**. Step 1 (the state registry, proved by stance switch) shipped as v3.5 and
step 2 (runway) as v3.7. This is the third verb on the same substrate.

Everything here is simulation. `SIM_VERSION` bumps, 7 to 8.

---

## 1. What a deferred effect adds

Every move in the game so far resolves now, at a place. A trap waits, but it waits for
the rival to step on it, so the rival decides when it fires. A deferred effect decides
for itself: it is a clock. Once it is running the rival has to play around a moment
in the future, not a spot on the floor, and the thrower gets to spend the time in
between.

That is the gap the decomposition note named: nothing in the game **defers**.

## 2. Who gets it

**Jeff Bozo**, THE EVERYTHING GUY, PRIMEZON. He shares HOSTILE TAKEOVER with Carl
Icahnt, the last of the three sharing pairs. Carl is the grappler and keeps the grab;
Jeff gets a move that is his business model. He already carries the parcel.

## 3. The move

```js
// data/fighters.js, SPECIALS
sameday: {
  id: 'sameday', name: 'SAME-DAY DELIVERY', icon: '📦', type: 'deferred',
  startup: 0.14, active: 0.06, recovery: 0.26,
  delay: 1.5,      // seconds from the order to the drop
  radius: 62,      // half-width of the drop zone
  dmg: 18, kb: 140, kbUp: -380, stun: 0.5,
  rosterOnly: true,
}
```

Jeff places an order on the spot the rival is standing **when it goes out** (the end
of startup). A marker appears on the floor there and tightens for `delay` seconds,
then the parcel lands. Anyone the parcel's column overlaps takes the hit, airborne
or not: it falls from the sky, so jumping does not dodge it, moving does.

The rival's options are the ordinary ones, which is the point:

* **Leave.** A second and a half is enough to walk out of a 124 px zone from anywhere
  in it. Jeff's job in that time is to make leaving cost something.
* **Block.** It is blockable and chips like anything else. A parry turns it away with
  no stagger, because the thrower is not the thing that hit you (the same rule as a
  projectile or a trap, `fromProjectile`).
* **Sign for it.** On a clean hit it pops the rival up, which gives Jeff a juggle if
  he has stayed close.

The counter stance does not turn it back (there is nobody swinging), and a Legal
Shield absorbs it like any other hit.

A second order while one is out is **refused, not charged**: the same rule ALIGNMENT
SHIFT follows on its cooldown. Taking 50 meter for a press that does nothing is a
trap, not a cost.

## 4. State

Two registry entries, both `round: 'reset'` and hashed `q8`:

| Key | Meaning |
| --- | --- |
| `deliveryT` | Seconds until the parcel lands. `0` means nothing is out. |
| `deliveryX` | Where it lands. Meaningless while `deliveryT` is `0`. |

The clock lives in `Game.updateFighting`, next to the runway drain and for the same
reason: that is the one place the round is already known to be live. Pause and
hitstop both return before it, so a hitstop freezes the parcel in the air.

### The edges the decomposition note warned about

"The hard part is not the mechanic, it is timers surviving KO, round end and match
end without leaking or double-firing."

* **Round end, KO or time-up.** `endRound` cancels every order, and `placeOrder`
  refuses outside the live round: the round can end while Jeff is in startup, and
  attacks keep running through round end, so the order would otherwise go out after
  the bell (found in review). A parcel still in the
  air when the bell rings is never delivered, so a fighter can not be hit after they
  have already won, and the marker does not hang over the KO slow motion.
* **Next round.** The registry resets both keys. Nothing to remember.
* **Double-firing.** The landing clears `deliveryT` before it resolves the hit, so
  nothing can run it twice.
* **Jeff hit during startup.** The attack is cleared by `applyHit` before the order
  goes out, so no order is placed. Same as every special: the meter is spent.

## 5. Archetype

`deferred` is the twelfth entry in `ARCHETYPES`, appended (the codec indexes the
array). It has a shape (`noHitbox`, words) and a tick (place the order once). It is
legal for a special or signature and **rejected as a command normal**, for the reasons
`stance` and `burn` are: neither the command-normal budget nor its dispatch has any
behaviour for it, and the pending order is per fighter, read off `f.special`.

It is roster-only. The budget has no axis for a delay, the same open question
runway left.

## 6. AI

Both sides, or the mechanic exists only for the player.

* **The rival** (every AI). A pending order is read in `decide()`, after the threat
  response: standing in the zone, walk out the near side (the far side if a wall or
  the rival is in the way), or block if the parcel lands before they could make it.
  Clear of it, do not take an approach that crosses the mark before it lands.
  Noticing is gated on `blockProb`, rolled each decision until it happens and then
  held for that order, so a rookie sometimes stands there and signs for it but a
  fighter that has stepped clear never walks back in. A 1.5 s clock does not need a
  per-frame reflex.

  (Found in review, and fixed: the gate was first rolled on every decision, and a
  failed roll walked a fighter that had already escaped straight back over the
  mark; a Champion signed for 4 in 60 point-blank orders that way, a Contender 15.)
* **Jeff.** Orders from mid range, where the rival has to choose between walking
  toward him and backing into the corner, and never while an order is already out.

## 7. Drawing

A dashed ring in Jeff's accent, tightening onto the zone, a shadow that grows under
the falling box for the last moments, and the box itself: plain cardboard, tape, an
arrow. Not any real company's box. On a miss the parcel sits there a beat with a
LEFT AT THE DOOR popup; on a hit, DELIVERED! and the pop-up.

## 8. Testing

| Layer | Test |
| --- | --- |
| The order | A special places it on the rival's spot when startup ends, and costs 50. |
| Landing | A rival who stays in the zone takes damage at `delay`, not before. |
| Leaving | A rival who walks out takes nothing. |
| Air | A rival who jumps in place is still hit. |
| Block | A held block takes chip; a fresh block parries. |
| Refusal | A second order while one is out is refused and costs nothing. |
| Round end | An order out at a KO never lands, in round end or the next round. |
| Hash | `deliveryT` and `deliveryX` move the fingerprint. |
| AI | A real `Game`: Jeff's AI orders, and a rival AI standing in a zone leaves it. |
| Schema | `deferred` is appended, legal as a special, refused as a command normal; `sameday` is off the player menu and the codec. |

## 9. Out of scope

* **Summon**, step 4.
* **Player access**, for the budget reason above.
* **More than one order at a time.** One per fighter is the whole state. A move that
  wants several needs a list, and a list needs its own hashing.

## 10. Acceptance

* `npm test` green, with the tests above
* Jeff owns `sameday`; Carl owns `takeover`; no two roster fighters share a special
* `deferred` in `ARCHETYPES`, `ARCHETYPE_SHAPES`, `ARCHETYPE_TICKS`, and refused as a
  command normal
* `SIM_VERSION` 8; `SCHEMA_VERSION` and `CHARACTER_WIRE_VERSION` unchanged
