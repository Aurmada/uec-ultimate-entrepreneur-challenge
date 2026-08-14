# CHARACTER PARTS — Silhouette Identity

Companion to `2026-07-29-character-forge-design.md`. That spec's **P3** acceptance
reads: *"no two characters share a move archetype + body silhouette."* The archetype
half shipped in v2.8, when all nine fighters got a distinct signature move. The
**silhouette half never shipped**, and until now was never measured.

This spec covers the silhouette half only. It is render-only work: no `SIM_VERSION`,
no netcode, no hurtboxes, no budget pricing.

---

## The problem

`lab/silhouette.js` (added with this work) strips colour from the cast and leaves
shape alone. Run against v3.3, the nine fighters resolve into **two families and one
outlier**:

| Family | Fighters | Reads as |
|---|---|---|
| Narrow column | Lizbeth, Kim, Cathie, Elo, Scam | Near-interchangeable |
| Wide and blocky | Adam, Carl, Jeff | Distinct from columns, similar to each other |
| Pose outlier | Steve | The only instantly nameable outline |

The cast varies on essentially **one axis: bulk**. Nothing varies in head shape, limb
length, posture archetype, or anything extending past the body outline.

Steve is the useful accident: the only silhouette you can name at a glance, and it is
not his body doing the work — it is an extended arm breaking the column. A shape that
leaves the body outline is worth more identity than any body dial.

**Why this matters in the project's own terms:** classic Mortal Kombat differentiated
characters by costume — one sprite, several palettes. Street Fighter differentiates by
silhouette. v2.0 asked for the Street Fighter approach, style only, no borrowed
assets. On the evidence above the cast currently sits nearer the MK end, by accident.

---

## Decisions taken

1. **Props and custom geometry are one system, not two.** A briefcase on a hand, a
   coat flaring from the hips and a cape on the shoulders are all "extra shapes
   anchored to a rig joint." Splitting them duplicates anchoring, mirroring, z-order
   and animation, and forces an arbitrary ruling on whether a coat tail is a prop.
2. **Parts are plain data, not draw code.** A per-character `draw()` hook would be
   more expressive and cheaper today, but it cannot be authored in the Incubator,
   cannot be validated, will not survive a rig change, and offers somewhere to
   accidentally read simulation state. Explicitly rejected.
3. **Authoring is hand-written data with live Incubator preview.** No part editor
   yet — build one later, once the vocabulary has stopped moving.
4. **Parts are unpriced.** They are render-only, like `shoulders`, `stride` and `head`
   already are.
5. **Parts are render-only, with no exceptions.** If a prop should hit someone, that
   is a *move*, and moves belong to the other sub-project.

---

## 1. Data format

A character gains an optional `parts` array.

```js
parts: [
  { id: 'case', shape: 'roundRect', anchor: 'armB', dx: 6, dy: 4,
    w: 40, h: 32, rot: 0, fill: 'accent', z: 'front' },

  { id: 'coat', shape: 'path', anchor: 'hip', pts: [[-14,0],[14,0],[18,34],[-18,34]],
    fill: 'suit2', z: 'behind', follow: 0.4 },
]
```

| Field | Values | Meaning |
|---|---|---|
| `id` | `[a-z0-9-]{2,16}` | Identifies the part in tests and errors. Unique per character. |
| `shape` | `roundRect` \| `ellipse` \| `capsule` \| `path` | Drawing primitive. |
| `anchor` | `armF` \| `armB` \| `legF` \| `legB` \| `head` \| `shoulder` \| `hip` \| `torso` | Rig joint the part rides. |
| `dx`, `dy` | −120..120 | Offset from the anchor, in rig px. |
| `w`, `h`, `r`, `pts` | per shape | Geometry. `pts` is a closed polygon, max 24 points. |
| `rot` | −π..π | Rotation relative to the rig. |
| `fill` | colour **role** or `#hex` | See below. |
| `z` | `front` \| `behind` | Which pass draws it. |
| `follow` | 0..1, default 0 | Cloth lag. 0 is rigid to the anchor. |
| `states` | array of pose states, optional | Defaults to all states. |

**`fill` is a colour role by default** — `suit`, `suit2`, `accent`, `skin`, `hair`,
`pants`, `shoe`. A part therefore recolours automatically with the character,
including a player founder whose palette was sampled from their photo. A literal hex
is allowed for something genuinely fixed, like the existing briefcase's leather.

---

## 2. Rendering

New module `src/engine/parts.js`, exporting one function:

```js
drawParts(g, def, P, layer)   // layer: 'behind' | 'front'
```

Called twice from `drawFighter`, **inside the offscreen buffer**: `behind` before the
body, `front` after the front arm — exactly where `drawBriefcase` sits today at
`drawFighter.js:1333`.

Drawing inside the buffer is the whole trick, and it is why this is cheap. The v2.0
pipeline renders the fighter into `_buf`, then composites cel shading, rim light and
the key line over the finished silhouette as a **post-pass**. Anything inside the
buffer therefore inherits all of it for free and becomes part of the silhouette.
Anything drawn after the blit would look pasted on.

Two further consequences fall out at no cost:

* **Mirroring** — the buffer is already flipped for facing, so parts flip with it.
* **Attack reach re-scaling** — a part anchored to `armF` inherits the scaled joint
  position, so it tracks a zoner's longer reach without knowing reach exists.

`src/engine/parts.js` is a separate module rather than more lines in
`drawFighter.js`, which is 1507 lines and already the most delicate file in the
codebase.

### `follow` and cloth

`follow > 0` gives a part positional lag against its anchor, so a cape trails. This is
render-side smoothing held per fighter instance. **Non-determinism is safe here
precisely because it is render-only** — but that safety depends on the boundary
holding, which §5 pins by test.

---

## 3. Validation

Extends `validateCharacter` in `src/data/schema.js`, the one validator shared by the
game, the Incubator, the netcode handshake and the challenge-link decoder.

| Condition | Result |
|---|---|
| Unknown `shape`, `anchor`, `fill` role or `z` | **error** |
| `dx`/`dy`/`rot` out of range | **error** — rejected, not clamped |
| Duplicate `id` within a character | error |
| `pts` over 24 points, or under 3 | error |
| More than 6 parts on one character | error |
| `follow` outside 0..1 | error |

Every failure is an error rather than a fallback, deliberately. This codebase has been
bitten repeatedly by silent fallbacks — `getFighter` returning Lizbeth for an unknown
id, `AI_LEVELS` quietly resolving an unknown difficulty to `founder`. Out-of-range
rejection also matches how body knobs already behave: *"an out-of-range body knob is
rejected, not silently clamped."*

Because `parts` is render-only it is **not** priced by `budgetCost` and does not
affect the band.

---

## 4. The honesty rule

**A prop must never read as extending reach.**

This is the same failure the `applyMotion` rule already guards at
`drawFighter.js:193`: the simulation stays correct and deterministic, but the game
lies to the player about where a hit lands. A long-handled prop on a striking hand is
the trap — a bat, a golf club, a sword. Props on the **rear** hand, the back, the head
and the hips are unrestricted; a prop on `armF` must stay inside the hand's own
silhouette during the active window.

---

## 5. Testing

| Layer | Test |
|---|---|
| Boundary | `determinism.test.js` extended — no simulation module may reference `parts`. Structural, same as the existing animation rule. |
| Every part draws | For every character, every part produces **non-empty pixels inside the buffer**. |
| Validation | Each rejection in §3 has a case, and each is verified to fail before the fix exists. |
| Equivalence | The migrated block briefcase renders pixel-identical to the hardcoded one. |
| Perf | Parts add under 0.3 ms/frame for a typical character. Measured, not assumed. |
| Silhouette | `lab/silhouette.js` re-run — the two shape families must visibly break up. |

The "every part draws" test is the art equivalent of this codebase's hardest-won
testing rule. Checking that a character's numbers are well formed is not the same as
checking anything happens: three moves once shipped that played their animation,
printed their popup, and did nothing at all, for months, against a green suite. A part
that renders nothing, renders off-screen, or renders outside the buffer bounds is the
same defect wearing art clothes.

---

## 6. Order of work

1. **`parts.js`, format, validation, render integration.** Nothing visible changes.
2. **Migrate the block briefcase to a part.** Proves the system against a known-good
   result before anything new depends on it.
3. **Props for all nine** — the B half. Signature objects that break each outline.
4. **`path` + `follow` for garments** — the C half. Coats, capes, hair with volume.

Steps 1 and 2 are the foundation and deliver no visible change, for the same reason
the forge spec's P1 delivered none: proving the format against existing behaviour is
what stops the vocabulary being wrong after things depend on it.

---

## 7. Out of scope

* **`SIM_VERSION`, netcode, hurtboxes, budget pricing.** Untouched by construction.
* **Wider body plans and posture archetypes** (option A) and **loosening the key
  line** (option D). Both are live options, deliberately not taken now. The key line
  in particular is a *measured* readability win from v2.6 (31.5% → 29.4% of a fighter
  near-invisible) and must not be changed on intuition.
* **Signature moves and new mechanics.** The other sub-project.
* **Wiring authored characters into the roster.** `AUTHORED` is still imported by
  nothing, so an authored character still reaches the game only by hand-copying into
  `FIGHTERS`. This is the unmet half of the forge spec's **P2** acceptance
  (*"exported, and loaded by the game without editing code by hand"*) and is described
  in `docs/ONBOARDING.md` §9. Parts do not depend on it: the shipped nine can carry
  parts today.

---

## 8. Note on a drifted name

The forge spec §5 specifies export to `src/data/roster.js` exporting `ROSTER`. The
shipped Incubator writes `src/data/authored.js` exporting `AUTHORED`. The file is the
authority; the spec was not updated. Recorded here so the next reader is not sent
looking for a file that does not exist.
