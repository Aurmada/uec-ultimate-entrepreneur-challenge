# UEC: architecture

Technical reference for engineers working on the codebase. For "how do I run
this and where is everything", read `ONBOARDING.md` first; this document assumes
you have the game running and want to change it safely.

Current version: `v3.8`. Simulation protocol version: `SIM_VERSION = 7`.

---

## 1. What the system is

UEC is a 2D arcade fighting game that runs entirely in the browser. Two fighters,
best of three rounds, sixty seconds each. Single player against an AI, or two
players over the network in real time.

Four constraints shape every decision in the codebase, and they are not
negotiable without a conversation:

| Constraint | Consequence |
| --- | --- |
| No packages, no bundler | No npm packages ship. No framework, no bundler, no 3D library. Everything is hand written except one vendored face detector (`src/vendor/pico.js`) and the Supabase client, which `net/online.js` loads from a CDN at run time for sign-in and live play. |
| Zero build step | The repo IS the deployed artifact. Browsers load `src/*.js` as native ES modules. There is nothing to compile, so what you edit is what runs. |
| Determinism | Live matches are 60 Hz lockstep. Anything affecting the simulation must be byte identical on both peers. |
| Originality | All characters, names, art and audio are original. Real people are parodied by name only and never depicted. |

The no build step rule is load bearing. It means a stack trace points at the
real file and line, a browser reload is the entire edit cycle, and there is no
class of bug where the shipped bundle differs from the source. It also means
module graph hygiene matters, because the browser resolves every import at run
time.

---

## 2. The one invariant: simulation versus rendering

If you remember nothing else from this document, remember this.

**The simulation decides what happens. Rendering decides what it looks like.
Data flows one way only.**

The simulation is the fighter state machine, hit detection and resolution,
physics, timers, and the power budget. It is deterministic, it steps at a fixed
1/60 of a second in a live match, and it is the thing the netcode replicates.
(Solo play steps by the real frame time, capped at 0.05 s, because nothing has
to agree with it.)

Rendering is poses, colours, faces, stances, motion shaping, lighting, particles
and the camera. None of it may ever be read back into the simulation.

The reason is netcode. Two peers run the same simulation from the same inputs
and must arrive at identical state. A state hash is compared every 120 frames.
The moment a pose can influence a hitbox, two clients running different
animation data diverge quietly, and the divergence surfaces two seconds later as
a voided match that looks like a network fault. It is a miserable bug to chase,
so the boundary is pinned by test rather than by intention. See
`test/determinism.test.js`, which feeds deliberately hostile animation data
(`NaN`, `Infinity`, damage values inside pose keyframes) into a running match and
asserts the state hashes are unchanged.

Practically, this is what the boundary looks like in the character data:

```js
{
  id: 'dex',
  style: 'grappler',               // SIMULATION (speed, HP, frame data multipliers)
  body:  { height, build, reach }, // SIMULATION (hurtbox, reach pricing)
  special: 'takeover',             // SIMULATION (the meter move)
  commandNormals: [ ... ],         // SIMULATION (frame data, archetype)
  usesRunway: false,               // SIMULATION (only Adam Weumann drains)
  stats: { speed, power, hp },     // legacy: nothing reads it

  c: { hair, suit, skin, ... },    // render only
  face:   { BROW_Y, PUPIL_R, ... },// render only
  stance: { lean, armF, elbowF },  // render only
  motion: { windup, drop, squash },// render only
  hairStyle, outfit, accessory,    // render only
}
```

Render only fields are read in `drawFighter.js` and nowhere else. The colours and
look fields do travel in a live pick (`toCharacter` puts them under `look`, so a
rival sees what you look like), but no simulation code reads them and the budget
does not price them. `face`, `stance` and `motion` never leave the machine.
Adding a new render only field is safe and needs no version bump. Adding a field that
the fighter state machine reads is a simulation change and needs the protocol
work described in section 5.

There is one subtlety worth internalizing, because it caused a real bug. Render
only does not mean "consequence free". Attack tracks are re-scaled so that a
zoner visibly out-ranges a grappler off the same keyframes, which means the
visual fist position is expected to agree with the hitbox. If a render effect
moves the strike hand (horizontal squash was the culprit), you get a fighter
whose punch visually lands 12 percent past where it actually connects. The
simulation is still correct and still deterministic, but the game lies to the
player. See the rule at the top of `applyMotion` in `drawFighter.js`.

---

## 3. Runtime shape

```
index.html            single page, every screen is a <section class="screen">
styles.css            all UI chrome. The fight itself is canvas, not DOM.
src/
  main.js             app shell: screen routing, match lifecycle, debug hooks
  config.js           EVERY gameplay number. Single source of truth.
  state.js            save data, profile, challenge link codec
  auth.js             Supabase auth wrapper
  engine/             the simulation and the renderer
  data/               characters, arenas, moves, the schema and budget
  ui/                 HUD, screens, result card, tutorial, face detection
  net/                live multiplayer and cloud persistence
  vendor/pico.js      vendored face detection (the Supabase client loads from a CDN)
incubator/            character authoring tool (admin surface, unlisted)
lab/                  measurement harnesses. Not shipped logic, but load bearing.
test/                 node --test, no framework
docs/                 this file and friends
```

### `src/engine` (about 5100 lines, the core)

| Module | Responsibility |
| --- | --- |
| `game.js` | Match controller. Rounds, timers, **hit detection and resolution**, projectiles, traps, drops, KO and victory. |
| `fighter.js` | Fighter entity. Physics, state machine, attack initiation, command normal resolution, meter, stance and runway multipliers. Owns its own state; does not resolve hits. |
| `fighterState.js` | The registry of persistent per-fighter state: default, round reset, hashing. See section 5. |
| `moves.js` | Move archetypes. `ARCHETYPE_SHAPES` (applied once at start) and `ARCHETYPE_TICKS` (applied per frame while active). |
| `anim.js` | Keyframe sampling, `REST` pose, pose math. |
| `drawFighter.js` | Procedural vector fighter. Pose composition, faces, hair, cel shading, key line. The largest and most delicate file. |
| `proportions.js` | Body clamping and the pose post pass that applies proportions. |
| `parts.js` | Render only character parts: pure placement (`resolveParts`) and drawing (`drawParts`). See section 7. |
| `gl3d/` | The live 3D fighter prototype behind `?gl`: glTF reader, pose-to-bones rig, WebGL2 toon renderer. See section 7. |
| `render.js` | Frame compositor and camera. |
| `stage.js` | Rendered stages for the 3D prototype: loads an arena's Blender render and draws it with its glow, live screens and overlay. See section 7. |
| `ai.js` | AI opponent. Decision ticks plus a per frame reflex layer. |
| `input.js`, `audio.js`, `fx.js`, `sprites.js` | Input mapping, synthesized audio, particles and juice, and a dormant sprite-atlas path behind `?sprites`. |

Hit resolution living in `game.js` while fighters own their state is deliberate.
A fighter never reaches into another fighter. This keeps the state machine
testable in isolation and keeps the resolution rules in one readable place.

### `src/data`

`fighters.js` holds the roster and the helpers that turn a saved profile into a
playable fighter. `schema.js` holds the character format, the validator, and the
power budget, and it is imported by the game, the Incubator, the netcode
handshake and the challenge link decoder. There is deliberately only one
implementation of validation and pricing anywhere in the project.

---

## 4. The frame loop

```
main.js requestAnimationFrame
  └─ game.update(dt)              SIMULATION: 1/60 s live (netStep), frame time solo
       ├─ fighter.update(dt)        controller → pad → state machine → physics
       ├─ resolve hits              hitbox vs hurtbox, block, parry, counter
       ├─ projectiles, traps, drops
       └─ round and match state
  └─ renderGame(ctx, game)        RENDER, may run at any rate
       ├─ updateCamera              zoom and pan from fighter separation
       ├─ arena.draw + stage grade  backdrop, scrim, perspective floor
       ├─ drawFighter per fighter   pose → proportions → shade → key line
       └─ fx overlay                particles, popups, shake, flashes
```

The controller contract is the seam that makes everything else work. A
controller is any object with `update(fighter)` that sets `fighter.pad`.
Keyboard, touch, AI and a network peer are all the same shape, which is why
command normal resolution can live inside the simulation and the netcode needs
no knowledge of it at all.

```js
// every input source reduces to this
{ isHuman, update(f) { f.pad = { left, right, up, down, block,
                                 slap, punch, kick, launch,
                                 special, super, bomb, dash, steal }; } }
```

---

## 5. Determinism and the netcode

Live matches use delay based lockstep over Supabase Realtime. Both peers run the
same `Game` from the same inputs. A state hash is exchanged every 120 frames; a
mismatch voids the match rather than letting it drift.

Three version numbers guard three different things, and confusing them causes
real damage:

| Constant | Location | Guards |
| --- | --- | --- |
| `SCHEMA_VERSION` | `data/schema.js` | The shape of a character object. |
| `CHARACTER_WIRE_VERSION` | `net/online.js` | The encoding of a character on the wire. |
| `SIM_VERSION` | `net/online.js` | **What a move does.** |

A fourth, `CODEC_VERSION` in `state.js`, versions the challenge link format and
is unrelated to live play.

`SIM_VERSION` is the one people forget. Bump it whenever fight behaviour
changes: damage, frame data, hit resolution, how an archetype resolves. The
character payload can be byte identical while the behaviour differs, in which
case the other two versions still match and two clients shake hands happily and
then diverge on the first use of the changed move.

Every bump is recorded in the comments at the constant. Two show why the rule
exists:

* **v3**: projectile command normals fired nothing at all, because the tick's
  counters were seeded on one code path and not the other. A v2 client threw a
  harmless whiff where a v3 client threw two projectiles for 11 damage.
* **v4**: a curated player move's frame data changed. Note carefully why that is
  a wire concern: `packCommand` sends curated moves as a bare id and
  `unpackCommand` rebuilds them from **our** table, deliberately, so the numbers
  cannot be forged by editing a challenge link. The flip side is that each peer
  supplies its own copy, so a table change is a protocol change.

The later bumps: v5 moved persistent state behind the registry and added
stance switching, v6 added the runway, and v7 holds a peer's custom build to
player rules (a roster-only special or a roster base's runway is refused by
`buildCustomFighter`, which `specToDef` rebuilds every peer through).

Render only changes never need a bump. A v3.1 and a v3.2 client see different
hair colours and simulate identically.

### What the simulation remembers

Persistent per-fighter state is declared once in `engine/fighterState.js`, not
assigned by hand in three places. Each entry carries its default, whether it resets at a
round boundary, and how it enters the state hash.
`Fighter`'s constructor, `Fighter.resetForRound()` and `hashGameState()` all iterate the
registry.

Both opt-outs, `round: 'keep'` and `hash: false`, require a written `why`. That is the
mechanism, not decoration: before the registry existed, `resetForRound` named twenty
fields and eight more had drifted out of it unnoticed. One of those eight was `energy`,
which meant meter carries between rounds: a real balance rule whose only record was the
absence of a line.

A structural test backs it up: `test/fighterState.test.js` constructs a real `Fighter` and
fails on any own enumerable property that is neither declared in the registry nor on an
explicit allowlist of things that are legitimately not simulation state. (It began life as
a grep for `this.<name>T` timers; the very next task moved every registry field into
`initState()`, which left that grep with nothing to find and no way to fail.) The
corollary is worth knowing before you add anything: derived state belongs in a **getter**,
not a constructor field. `usesRunway` and `winded` are getters for exactly this reason.

Stance switch (ALIGNMENT SHIFT, scam's special) is the first verb built against the
registry, and the reason `SIM_VERSION` moved to 5: a fighter in `capabilities` resolves
the same inputs to different damage dealt and taken than one in `safety` or neutral, so
two peers on either side of the version bump would shake hands and then diverge the first
time either stance mattered. `stance` also joined `ARCHETYPES` (§6) as a tenth entry,
appended rather than inserted, so the wire codec's archetype index (`state.js`, append-only by
contract) stays stable and needed no `CHARACTER_WIRE_VERSION` bump. It is a known
archetype for a character's special only: it is explicitly rejected as a command-normal
archetype, because neither the command-normal budget (`BUDGET.CMD.ARCHETYPE`) nor
`fighter.js`'s command-normal routing have any behaviour for it; only the special or
signature path intercepts `type === 'stance'` before an attack object is even built.

### Runway, the second resource

`RUNWAY` (config) is the second verb built on the registry, and the reason `SIM_VERSION`
moved to 6. It is one entry, `{ key: 'runway', init: RUNWAY.MAX, round: 'reset',
hash: 'q8' }`, and everything else follows: initialized in the constructor, cleared at
the round boundary, in the fingerprint, and caught by the structural backstop, none of
which anyone had to remember.

It is deliberately the inverse of meter. Meter builds and rewards patience; runway drains
at 4/second from the moment the round goes live and is topped up only by landing a hit.
At zero the fighter is **winded** (15% slower, 20% weaker, 20% easier to hit), and
`winded` is derived (`runway <= 0`), never stored, so one connecting hit clears it in the
same frame and there is no timer to reset, hash or leak.

Three placement decisions are load-bearing:

* **The drain lives in `Game.updateFighting`**, not in `Fighter.update`. That is the only
  place `state === 'fighting'` is already true: `updateIntro`, `updateRoundEnd` and
  `updateMatchEnd` all call `Fighter.update` too, and `Game.update` returns early on
  `paused` and on hitstop before the switch. Scoping by call site leaves no condition to
  get wrong later.
* **The refill hooks the two sites that award `METER.HIT_DEAL`**: the normal hit in
  `strike()` and the throw in `doGrab()`. Not chip, not steal, not a counter's payback.
* **Only a character with `usesRunway` drains.** The field is declared and pinned at MAX
  for everyone else, so a non-user hashes identically to a user and the quantiser needs no
  nullable case. Runway is roster-only: `SPECIALS.burnitall` carries `rosterOnly: true`,
  because the power budget still has no axis to price a resource. Every player build and
  challenge-link ghost resolves its special through `playerSpecialId()` and pins
  `usesRunway` to false, so neither a stale save nor a forged base id can reach it.

`burn` joined `ARCHETYPES` (§6) as an eleventh entry, appended under the same append-only
contract as `stance`. BURN IT ALL reads its damage from the tank on every active frame and zeroes
it on contact, and it is the one documented exception to the refill rule: refunding 15 on
its own hit would hand back the entire cost of the move.

---

## 6. The character format and the power budget

A character is plain data validated by `validateCharacter` and priced by
`budgetCost`. The budget exists so that a custom founder can be strong in one
direction only by being weak in another. It returns a signed number: positive is
net advantage, negative is net handicap, zero is the balanced baseline. Bands are
`clean` (8 or under), `warn` (up to 15) and `block` above that.

### Command normals

A command normal is forward plus a basic attack: `fwd+slap`, `fwd+punch`,
`fwd+kick`, `fwd+launch`. Maximum three per character, one per input. Each is
priced against the neutral basic on its own button, so "free" means "that basic,
on a direction".

Resolution happens inside the simulation at press time, in
`Fighter.resolveBasic`, while the direction that selected the variant is still
readable. Resolving later would collapse every command normal back to its
neutral basic the moment it was used inside a combo, which is exactly where it
matters.

### Archetypes

Eleven are legal: `strike`, `projectile`, `aoe`, `rush`, `grab`, `teleport`,
`rain`, `counter`, `trap`, `stance`, `burn`. Each has an optional shape applied once
(`ARCHETYPE_SHAPES`) and an optional per frame tick (`ARCHETYPE_TICKS`).

`counter` and `trap` are grouped as `NO_SWING`, meaning the move is not the
swing. That set exists **for pricing only**: their power lives in `params`
rather than in frame data. It is not a statement about needing an incoming
attack. A counter does need someone to swing at it; a trap is placed whether or
not anyone attacks, and an attacking opponent actually beats it out of its
startup. Conflating those two readings will send you looking for a bug that is
not there.

`stance` and `burn` (§5) are legal for a character's special or signature but
rejected by `validateCharacter` as command-normal archetypes: neither the pricing
table nor the command-normal dispatch in `fighter.js` has any behaviour for them,
so allowing them there would validate, price as free, and fire as a no-op.

### What the budget prices

* Frame data, as a ratio against the base move, clamped by `BUDGET.CMD.CLAMP`.
* Archetype capability, as a flat cost.
* Launcher capability, only when the base move could not already launch.
* For `NO_SWING`, the hazard's own damage plus its `params` axes: counter
  `window`; trap `radius`, `lifetime`, `maxActive` and `armTime` (inverted,
  because a trap that arms sooner is stronger).

`BUDGET.NOMINAL` defines the reference value for each `params` axis, chosen as
the shipped design, so a move built at nominal prices at zero on that axis.

Two known characteristics of the pricer, both deliberate but both surprising:

1. **Pricing is ratio to the slot's base.** A counter on `fwd+launch` is
   expensive because launch has a slow 0.06 s base startup and a counter must be
   faster than what it wants to catch. The same counter on `fwd+slap` is cheap.
   That is the slot's character, not a bug, but it means slot choice dominates
   cost.
2. **`active` frames are not priced for ordinary strikes.** Only startup and
   recovery are, through the `commitment` term.

### A counter's startup is a cliff, not a slope

Worth knowing before tuning one. Measured against the shipped basics, a counter
catches things only if it is faster than them, and the useful range is about four
frames wide:

| Counter startup | Beats |
| --- | --- |
| 0.030 | slap, punch, kick, launch |
| 0.045 | punch, kick, launch |
| 0.050 | kick only |
| 0.066 | kick only |
| 0.080 and slower | nothing |

---

## 7. The rendering pipeline

`drawFighter` composes a pose, applies proportions, draws the rig, then post
processes. Understanding the order matters because several effects are order
dependent.

```
computePose(f, t)
  ├─ restPose()                      the ONE canonical skeleton (anim.js REST)
  ├─ stance branch by style          coiled / heavy / poised / loose / flair
  ├─ def.stance                      the character's own posture, layered on
  ├─ authored idle track             breathing, added as a DELTA
  └─ state branches                  walk, crouch, block, jump, hitstun, KO
trackedAttackPose(f, atk)            when attacking, replaces the above
  ├─ sample the authored track
  ├─ re-scale to the move's real reach
  └─ applyMotion(pose, def, t)       the character's own swing shaping
proportions post pass                height, build, reach, stride, shoulders, head
draw into an offscreen buffer
shadeBuffer()
  ├─ key light      overlay, then destination-in to re-clip
  ├─ mid and floor  source-atop
  ├─ side gradients
  └─ rim light      lighter
key line                             6 offset stamps, then source-in
```

Two hazards here have bitten before.

**Blend mode clipping.** `source-atop` clips itself to existing pixels.
`overlay`, `screen` and `lighter` do not; they fill the whole rectangle. The key
light uses `overlay` (a flat alpha wash converges every colour toward the light
and destroys the palette), so it must be followed by a `destination-in` re-clip.
Without it the buffer gets a grey slab, and worse, the contrast harness then
measures the slab and reports a large improvement.

**One skeleton only.** `REST` in `anim.js` is the single definition of the rig.
There was once a second copy written inline in `computePose`, and when the
proportions were retuned only one moved. Fighters stood at the old skeleton and
snapped to the new one to throw a punch, growing 27 percent mid swing for the
whole length of every attack.

### Character parts

A character may carry `parts`, render-only geometry outside its body outline. A
held prop, a coat, a cape: all one system, differing only by anchor joint and
z-layer.

`resolveParts()` in `engine/parts.js` is pure (parts plus pose in, absolute
coordinates out), which is what makes placement unit-testable in a suite with no
canvas. `drawParts()` paints them, and is called twice from `drawFighter` **inside
the offscreen buffer**: `behind` before the back limbs, `front` after the front arm.
Drawing inside the buffer is what earns cel shading, rim light, the key line and
membership in the silhouette for free.

Parts are validated by the shared `validateCharacter` and are **never priced**. They
are free, like shoulders, stride and head. They do **not** travel on the wire: `toCharacter`
does not emit `parts`, and `specToDef` in `main.js` never reads `spec.ch.parts`. Each
peer already owns its own copy of every roster fighter, keyed by the same id both sides
agree on, so a rival's props are drawn from that local copy, never from anything sent
over the network. A `parts` array from an untrusted peer would be a per-frame render
input, and no player-authored character can carry its own parts yet anyway, since
`buildCustomFighter` takes them from the base roster def. That is also why
`CHARACTER_WIRE_VERSION` did not need to move: the payload shape it guards is unchanged.
Cost is under the measurement noise floor: with two parts-bearing fighters on screen,
1.106 ms/frame with parts against 1.123 ms without, a difference smaller than the
0.13 ms run-to-run variance.

The one rule: **a prop must never read as extending reach.** Same failure as the
`applyMotion` rule above: the simulation stays correct, but the game lies to the
player about where a hit lands. Props on the rear hand, back, head and hips are
unrestricted; a prop on `armF` must stay inside the hand's own silhouette during the
active window.

Three ways a part can be present and still invisible, all found while authoring the
first nine and all worth checking before adjusting offsets:

* **Colour.** A fill role that resolves near the character's own suit. Cathie's
  tablet was `suit2` (#111a3d) against a #1c2a5e suit and vanished.
* **Fill versus stroke.** `blob()` FILLS a path. Scam's paperclip first traced the
  wire's centreline, which self-intersects and filled to 118 visible pixels. A `path`
  part must describe an OUTLINE.
* **Occlusion.** A `behind` part narrower than the body is covered by it. A coat only
  reads when the hem flares past the silhouette.

### Live 3D fighters (prototype, `?gl`)

A second body renderer, behind a URL flag and off by default. It exists to test
whether a 3D model can replace the procedural rig without losing what the rig
gets for free: every authored track, stance, command normal, body knob, colour
and look option, including a player founder's. It is render-only and falls back
to the procedural rig wherever WebGL2 is missing, the model has not loaded, or
the context is lost.

| Flag | Effect |
| --- | --- |
| `?gl` | Every fighter renders in 3D, wearing their own look: roster, base characters and player founders. |
| `?gl=max,dex` | Only the fighters with those ids do, for comparisons and benchmarks. |
| `&perf` | On-screen timing, with `gl.finish()` per 3D fighter, so GPU time is included (worst case). |

The pipeline, end to end:

```
lab/blender/build_founder.py   Blender script: metaball body and look options, armature, weights, glTF
assets/models/founder.glb      the only file the game loads, worn by every fighter
data/models3d.js               model registry, and how a fighter's look picks its meshes
engine/gl3d/glb.js             minimal .glb reader: one skin, indexed triangles, base colours
engine/gl3d/rig.js             2D pose -> 3D joints -> two-bone IK -> skinning matrices
engine/gl3d/toon.js            WebGL2: an ink pass (inflated back faces), then banded lighting
engine/gl3d/index.js           flags, loading, what a fighter wears, faces, render3D() and renderBust3D()
```

`drawFighter` asks `has3D(def)` and hands `render3D()` the same proportioned
pose it would have drawn, plus its own offscreen buffer. The model is drawn
into that buffer, so the key line, hit flash, facing flip, KO rotation and the
blit into the world are shared with the procedural path, and so is the camera.

**One model, every fighter.** A fighter in this game is data, and a player
founder is the same data from the profile screen, so there is no model per
character. `founder.glb` is a base body plus one named mesh per look option, and
`wearing(def, state)` picks which to draw:

* `body` always draws: skin, legs and shoes. The head is bare; each fighter's
  face is painted onto it (see Faces, below).
* `<slot>:<option>` draws when the fighter's look picks it. The slots are `hair`
  (13 styles, including the roster's backwards `cap`), `headwear`, `eyewear`,
  `facialHair`, `outfit` (all nine) and `accessory`. `resolveLook3D` reads a look
  exactly the way `drawFighter` does, older roster conventions included:
  `hairStyle: 'cap'` is a cap worn instead of hair, and `accessory` doubles as
  eyewear and as stubble.
* `prop:<id>` draws when the fighter carries a part with that id, in that part's
  states, so the block briefcase appears only while blocking. Every part the
  roster carries has one: the universal briefcase and all nine signature props.
  Hand-held props ride `grip.L` or `grip.R`; the rest hang off the torso or head.

Colours come from the fighter's palette by material role, as below, so the same
bomber is green with pink trim on one player and pink with green trim on Kim.

**The model contract.** Anything that follows it can replace `founder.glb`,
which is the point: an artist can rebuild it by hand in Blender.

* Units are rig units: 1.0 is 100 rig px, the scale the pose already uses.
* Blender Z is up and the character faces +X. Its right side (`.R`) is -Y, which
  glTF export turns into +Z, toward the renderer's camera.
* Joints are named `hips`, `spine`, `chest`, `neck`, `head`, `upper_arm.R/L`,
  `forearm.R/L`, `thigh.R/L`, `shin.R/L` and `foot.R/L`, plus optional
  `grip.L` and `grip.R` for held props. The runtime reads only where each joint sits at bind
  time (from the inverse bind matrices), never bone rolls. glTF stores joints but
  not bone ends, so `models3d.js` records where the leaf bones end and where the
  skull centre sits.
* Meshes are named `body`, `<slot>:<option>` or `prop:<id>`, as above.
* Each material is named for the palette role it takes its colour from (`suit`,
  `suit2`, `skin`, `pants`, `shoe`, `hair`, `accent`); any other name keeps its
  exported colour. `models3d.js` can mark a material `inkless` (glasses frames:
  wire thinner than the outline, which the ink pass would swell into a black
  bar) or `glass`, with an opacity (the visor, a tint the eyes show through, as
  in 2D). Glass draws last, blended, with no outline.

`test/gl3d.test.js` holds the model to this: every option a player can pick has a
mesh or is painted on (never both), every roster fighter resolves to meshes that
exist, every part has a 3D prop, and every vertex is weighted to a bone near it.

**How a 2D pose drives the bones.** The procedural rig stores hand and foot
TARGETS, not elbows and knees, and stretches a limb to reach a target, which is
how a zoner's jab visibly out-ranges a grappler's off the same keyframes. `rig.js`
does the same in 3D: two-bone IK toward each target, stretching past full reach
rather than falling short, so the fist still lands where the hitbox is. Four
choices shape the result:

* The chest turns `GL3D.YAW` toward the camera, fighting-game style, which puts
  the lead arm and leg (the pose's `armF` and `legF`) on the FAR side.
* Elbows point down and back. The 2D rig bends toward the perpendicular of
  shoulder-to-hand, which flips sign when a hand passes behind the body; at 2D's
  gentle bend that reads fine, but a real upper arm folds hard and the flip
  became a chicken wing.
* Both bones of a limb twist about one hinge axis (`cross(u, bend)` from the IK),
  which never degenerates. Twisting each bone from the bend vector itself did,
  whenever a forearm swung into line with it.
* Girth and head size are pushed at draw time (`GL3D.ARM_GIRTH` and friends). A
  model built to heroic proportions reads thin and pin-headed at 200 px.

Hazards found while building it:

* **Bones belong to parts, not to object names.** The base body is several parts
  joined under one name. The build script first stored each name's bone list,
  so the last part's list (the soles) won and the whole body was weighted to the
  feet; every structural check passed and every fighter rendered with its head
  and arms flung across the screen. Parts are weighted before they are joined
  now, and the distance-to-bone test exists because of it.
* **A held prop must not ride the forearm.** Strapped to the forearm, the block
  briefcase turned with the arm, and a tight guard swung it behind the arm into
  the body. It rides `grip.L`, which follows the lead fist but keeps the body's
  orientation, the way a 2D part is an unrotated offset from the hand.
* **Everything on the head turns with it.** Kim's ring light, built square to the
  bind pose, turned with the head's posed yaw and read as a sideways bead chain.
  It is built pre-turned by `GL3D.YAW + GL3D.HEAD_YAW`, and a test fails if those
  change without the model being rebuilt.
* **Keep a prop's colour on the camera side.** A dark screen modelled on the
  front of Steve's device and Cathie's tablet hid the accent colour that makes
  them read at game size; the 2D parts are solid colour, and so are these.
* **A NaN in the pose blanks the fighter.** `ctx.scale(NaN, NaN)` is silently
  ignored, so the procedural rig never shows it; in a projection matrix it draws
  nothing. A staged fighter with no `vy` produces exactly that in the jump pose,
  which is why `render3D` guards the squash values.
* **Model URLs resolve against the module, not the page.** A page-relative path
  worked from `index.html` and 404'd from `lab/`.
* **One WebGL context serves every fighter**, with `preserveDrawingBuffer` on,
  because each fighter is read back with `drawImage` straight after it is drawn.

**Faces.** A modelled face has one expression, and in 2D every character has
their own brows, lids and mouth, changing with state (`P.face`: idle, angry,
block, hurt, ko, happy). So the 3D head is bare, and `drawFighter`'s own
`drawFace` paints it. The first time a fighter is drawn, `index.js` has the
painter draw every expression into one texture, a cell each (`FACE_STATES`,
`GL3D.FACE_CELL`), keyed by the face values so fighters with the same face
share it. The toon shader projects the pose's cell onto the `body` skin in
BIND space, so the face rides the head bone. `MODELS3D.founder.face` says
where: the eye line, the model units per 2D px, how far forward a surface must
be, and how the face fades as the surface turns away. Stubble is painted into
the same texture rather than modelled (`PAINTED_LOOKS`), because in 2D it is a
translucent shade over the jaw. None of this touches the 2D path: with 3D off,
fighters and portraits hash identically before and after.

What it took to look right:

* **The head is sculpted to the 2D face.** Projected onto the first head (a brow
  ridge, cheekbones, a long jaw and a real nose), the same drawing read as a
  skull: the brows sank into sockets and the mouth landed on the nose. The face
  is now broad and flat at the front, the jaw short, the nose a small button
  above where the mouth is drawn, and one scale serves every feature.
* **Nothing is built over a drawn feature.** Facial hair stops short of the
  mouth, and cap, beanie and band crowns sit on the brow line, as
  `drawHeadwear` keeps 2D crowns clear of the eyes. A test measures every hair,
  headwear and facial hair mesh against the eyes and mouth; it caught the afro,
  the beard, the moustache, both caps, the beanie and the bandana.
* **The projection turns a little toward the camera** (`turn`, 0.15 rad). The
  camera sees the near side of the face almost square on, and a straight-ahead
  projection spread the near brow across it. At 0.3 the near side read best in
  a portrait, but in a match the far eye slid round to the silhouette. Judge a
  face change at the match angle, not only in a portrait.

**Portraits.** With 3D on, `drawPortrait` draws a 3D bust (`drawBust3D`) instead
of the 2D head and shoulders, keeping the backdrop, grade and frame. The pose is
the fighter's idle with the hands dropped below the frame, where a guard would
cover the face; `renderBust3D` turns the body further toward the viewer
(`GL3D.BUST.TURN`) and frames the orthographic view on the head. `opts.mirror`
turns a bust to face left, which the VS splash and HUD use on the right-hand
side. A portrait drawn while the model is still loading is drawn in 2D and
again once it lands (`pending3D`, `on3DReady`). A player with a photo keeps the
2D bust, since the photo is the face. A bust costs about 2 ms, drawn once per
screen rather than per frame. Kim's ring light is pre-turned for the match head
yaw (above), so in a bust, where the head turns further, it sits a third of a
radian off square.

Not done yet: a photo founder fights with the default drawn face in 3D, the
Unicorn horn has no 3D equivalent, and body knobs scale bones rather than using
shape keys.

**Sharp fighters.** Both renderers shared one resolution limit: the whole world,
fighters included, is drawn at 960x540 and the camera crop scales it up (about
2.2x with the device pixel ratio), which throws away the fighter's own 2x
buffer. `RENDER.sharpFighters` in `render.js` (on with `?gl`, or `?sharp` for the
2D rig) draws the world as two native-size layers, everything behind the
fighters and everything in front, and draws the fighters straight onto the
screen between them under the camera transform. With it off, the default path is
pixel-identical to before the split (checked by hashing a rendered frame from
both versions).

Measured in September 2026 on an M2 Max, in a live AI-vs-AI match at 60 fps,
whole-frame render time: 1.73 ms with both fighters in 2D, 1.93 ms with both in
3D; with sharp fighters, 1.98 ms and 2.07 ms. Adding faces moved neither number
past the noise between runs (1.3 to 2.3 ms in 2D in the same session). The model
holds 46 meshes and 42.7k triangles in 1.3 MB, and a fighter draws about 10k of
them. Phone numbers come from `lab/gl3d-bench.html`, a match that
needs no sign-in: serve with `python3 dev-server.py 4173` and open
`http://<this machine's LAN address>:4173/lab/gl3d-bench.html` on a phone on the
same network. `lab/gl3d-gallery.js` renders one fighter through every state, the
whole roster, every look option (as bodies or as busts), every face close up in
each expression, or every portrait, and `lab/blender/build_founder.py` rebuilds
the model in about five seconds.

**Rendered stages.** The fighters were 3D and the arenas were still flat
drawings. Every arena now also has a stage built in Blender, and with `?gl` the
game draws that instead (`&stages=0` turns it off, `?stages` tries it with 2D
fighters). With the flag off the procedural arenas draw exactly as before:
game frames on all six arenas hash identically before and after.

```
lab/blender/build_stage.py       the shared part: camera, helpers, renders, stage.json
lab/blender/stages/<arena id>.py one scene each, as build(kit)
assets/stages/<arena id>/        back.webp, glow.webp, stage.json (about 750 KB for all six)
src/engine/stage.js              loads a stage and draws it
src/data/arenas.js               each arena's `stage`: where it lives, its live screens, its overlay
```

`Blender -b --factory-startup -P lab/blender/build_stage.py -- garage` rebuilds
one stage in about five seconds. What it writes:

* `back.webp`: the stage at twice the 960x540 world, so it stays sharp under the
  camera's zoom. With sharp fighters it is drawn straight to the screen under the
  camera, like the fighters; the world layer (grade, scrim, haze, shadows,
  traps) draws over it as before.
* `glow.webp`: only what gives off light, on transparent. It is blurred once at
  load into a halo and breathes over the stage (`STAGE_ART.GLOW`), which is the
  life a still picture otherwise lacks: string lights, the city's windows, the
  rainbow neon. A dim emitter (a night window, a laptop) can stay out of it.
* `stage.json`: the size, where the rendered floor landed, and each **screen**:
  a flat panel whose four corners the build projects into world px. The arena
  paints it every frame (`stage.screens`), so the sponsor boards keep cycling
  sponsors (the sponsorship hook), the boardroom TV keeps its chart and the
  exchange board its candles. What cannot be a panel (confetti, drifting
  clouds, sweeping spotlights, sparkles) is the arena's `stage.overlay`, drawn
  over the stage in world px. Both reuse the procedural arena's own drawing,
  split out of it without changing a pixel.

**The camera is the contract.** A stage is only usable if the fighters stand on
its floor, so the build camera is fixed by the game, not the scene: it never
tilts (walls stay upright), it sits `DISTANCE` in front of the fight lane with a
lens that makes one unit 100 stage px there, and its lens shift puts the lane's
floor on `STAGE.FLOOR`. After building a scene the script projects the lane's
floor and a unit along it, and refuses to write the stage if either is off by
half a pixel. `test/stages.test.js` checks the written files against the game:
image sizes, the floor, a painter for every screen and a screen for every
painter, and that painters and overlays run.

What it took:

* **Emitters cast no shadows.** A bulb inside its own lamp's light threw a dark
  blot across the garage wall; the kit turns shadows off for anything emissive.
* **Keep emission low enough to keep its colour.** At high strength the view
  transform washes a coloured bulb to white; the string lights read as colours
  at about 1.
* **A screen that is drawn whole needs no panel.** The summit banner sags and
  waves below its own quad, so its panel is invisible and marks only the place.
* **Stages are not free to hold.** A decoded stage is about 10 MB, so only the
  last two used stay loaded (`STAGE_ART.KEEP`), and the glow halo is kept at
  world size. Anything that measures a stage (`lab/contrast.js`) has to wait for
  it to load, or it measures the procedural fallback.

Measured in September 2026 with the 3D fighters and the pinned contrast cast
(`lab/contrast.js`): the share of the fighter that nearly vanishes into the
stage went from 33.2% to 32.0% on average, best on the Unicorn Club (33.3% to
30.5%) and worst on the Stock Exchange (33.6% to 34.3%), so no scrim was
retuned. In the benchmark match the garage stage costs no more frame time than
the procedural garage it replaces. `lab/stages.js` renders each arena both ways
in a real match for comparison.

---

## 8. Where numbers live

`config.js` holds every gameplay number: attack frame data, physics, meter
costs, round timing, fighting styles, the power budget weights, and the
`STYLIZE` block that drives the renderer. Engine files should contain no magic
numbers. If you find yourself typing a literal into `engine/`, it probably
belongs in `config.js` with a comment explaining what it is trading off.

This is not tidiness for its own sake. It is what makes the balance auditable and
what lets a measurement harness sweep a value without editing engine code.

---

## 9. Testing

`npm test` runs the Node built in test runner. No framework, no mocks, no DOM.
The simulation is fully headless, which is why the tests can drive real matches.

Run `npm test` for the current count; it was 324 across 15 files at v3.8, and a
pinned number in a document is a number that rots. It needs Node 21 or newer,
because the script passes a quoted glob to `node --test`. The files
worth knowing:

| File | What it protects |
| --- | --- |
| `determinism.test.js` | The simulation and rendering boundary. Feeds hostile animation data into a live match and asserts the state hash is unmoved. |
| `rosterMoves.test.js` | Every move of every fighter, fired in a live `Game`. Nine fighters, 91 move slots. |
| `schema.test.js` | Validation and pricing, including the `params` axes. |
| `playerBuild.test.js` | The founder creator's economics: that trades exist and that the priciest move is still reachable. |
| `codec.test.js` | Challenge links survive a round trip and cannot be hand edited into inventing a move. |

Two testing lessons this codebase keeps re-teaching:

**Test that the button does something.** The suite checked for a long time that
a character's numbers were well formed and correctly priced, and never that
pressing the button had an effect. Three moves shipped that played their
animation, printed their popup, and did nothing at all.

**A test that passes before your fix pins nothing.** When you add a regression
test, revert the fix and confirm the test fails. The `params` pricing tests were
verified this way.

---

## 10. Measurement harnesses (`lab/`)

Browser side modules that measure rather than assert. They exist because several
questions here cannot be answered by eye and have repeatedly been answered wrong
by intuition.

* `lab/contrast.js` locates the fighter by rendering the frame with and without
  fighters and diffing, then reports contrast against the stage per arena. Use
  `measure()` for all arenas.
* `lab/roster.js` renders the whole cast, auto framed by bounding box.
* `lab/marketing.js` regenerates the social image and screenshots.

**Harnesses have been wrong more often than the code.** A short catalogue, since
the same shapes recur:

* A probe sampled a fixed screen column and called it "the fighter". The column
  was mostly backdrop, and it reported the fighter's brightness changing per
  arena, which is impossible.
* A contact sheet used a fixed crop. A rig change made the cast taller, the
  sheet showed decapitated founders, and that was reported as a render buffer
  bug that did not exist.
* Contact shadows were counted as part of the character, so a brighter floor
  pool looked like a large contrast win.

The tell is almost always **uniformity**. If a measurement says every one of nine
characters is broken in the same way, suspect the harness first. That heuristic
has been right every time it has come up.

### `test/golden/`: pixel-level checks, and running them without clicking

`npm test` has no canvas, so the two pixel guarantees live in a browser page
instead: `test/golden/index.html`, served by `python3 dev-server.py 4173`
(plain `http.server` caches modules and serves stale ones).

Three checks, one write action, all on that one page:

| Button | What it does |
| --- | --- |
| CHECK against baseline | Renders every fighter × `CASES` in `hash.js`, hashes the pixels, diffs against `baseline.json`. 126 cases as of v3.3. |
| CHECK isolation (big bodies first) | Renders three extreme bodies into a scratch canvas, then re-runs the baseline check. Catches shading state leaking between fighters (see above). |
| CHECK every part draws | Renders each declared `parts` entry with and without itself, twice, and reports a pixel-diff count plus a contrast figure per part (see below). |
| WRITE new baseline | Captures the current renders and PUTs them to `baseline.json`. Requires `dev-server.py`, which is the only server here with a PUT handler. |

**The parts check also reports contrast, but does not fail on it.**
`countDiffPixels` only asks whether a part changed any byte, which is size and
occlusion, not visibility: a part painted a shade away from the body under it
clears the pixel-count bar and still reads as invisible. Alongside that count,
`checkParts` now computes the mean RGB distance between the with-part and
without-part renders, restricted to pixels where the part draws over an
already-opaque body pixel (extension past the silhouette is excluded; that is
the pixel count's job). This number is REPORTED, not enforced: it is not
added to `bad` and cannot fail the check. The reasoning is in the comment
above `contrastForPart` in `index.html`. Short version: `drawFighter` runs
every part through `shadeBuffer()` (§7) before a pixel is read, so a part's
declared fill hex is not what lands on the canvas, and there isn't enough
real post-shading data on hand to defend a specific cutoff. Pick one from an
actual run, not a guess. **This also cannot see "dark part on dark stage".**
The canvas here is transparent with no arena behind the fighter, so
fighter-vs-stage contrast (half of the eleanor/coat bug, historically) is
entirely outside what this file measures. `lab/silhouette.js` and
`lab/contrast.js` are the tools for that; they need a live match, not this
harness.

**The baseline only reproduces where it was written.** The hashes are exact
pixels, and canvas gradients, blend modes and anti-aliasing differ between
browsers, versions and rasterizers. In September 2026, the very commit that wrote
the current `baseline.json` reported 97 of 126 cases mismatched in the Claude
desktop app's browser, while repeated runs in that browser agreed with each other
exactly. So treat it as a same-machine, before-and-after check: run CHECK on the
base commit and on your change in the same browser and compare the reported
hashes, or WRITE a fresh baseline locally before a render change. A wall of
mismatches on a new machine is the environment, not a regression.

**Running by hand**: open `http://localhost:4173/test/golden/index.html` and
click a button; results render into the page.

**Running by URL**: append `?run=baseline`, `?run=isolate`, or `?run=parts` to
the same URL and the matching check runs on load, no click needed. Two places
to read the result from:

* `window.__goldenResult`: `{ run, pass, total, badCount, bad, detail, ... }`
  (`parts`/`min` on the parts run), for anything that can execute JS in the
  page and read a variable.
* `document.title`: a one-line summary (`PASS parts N/N draw`,
  `FAIL baseline 3/126 mismatched`), for anything that can only read a page
  title.

**This is not CI.** There is no `.github`, no workflow file, and nothing in
this repo opens a browser on its own. `?run=` only makes the page itself
drivable once something (a screenshot tool, a scripted browser session, a
person) has already opened the URL. `window.captureGolden` on the same page
exists for the same reason: hooks for a driver that isn't committed yet.

---

## 11. Hazards worth knowing before you touch things

* **The round opens in `intro` and discards inputs pressed then.** A test harness
  that presses on frame 0 reports the entire roster as dead. Idle until
  `game.state === 'fighting'`.
* **Not every move sets `attack`.** A dash changes state, a super sets a buff
  timer, and a stance switch (ALIGNMENT SHIFT) changes `stanceId` without ever
  building an attack. Watching `fighter.attack` alone misses them.
* **`setState` resets `stateT`.** Calling it every frame for a state the fighter
  is already in freezes that state's clock. That is how a held block parried
  every hit from v1.4 to v3.8: the parry check reads `stateT <= PARRY.WINDOW`,
  and the block clock never left 0. Enter a state once, then advance `stateT`.
* **The meter property is `energy`, not `meter`.**
* **`pressed(k)` is a rising edge.** Holding a button fires once. Pulse it to
  fire repeatedly.
* **`p1Def` is the human slot** in `startMatch`, and `HumanController` overwrites
  `fighter.pad` every frame. To script a fighter, replace `fighter.controller`.
* **Arenas can override `STAGE.SCRIM`** through `arena.scrim`. Mutating the
  global changes nothing for any arena that sets its own, which silently
  invalidates a sweep.
* **`cmdBySlot` is a `Map`.** `Object.keys` on it is always empty and will make
  you think command normals are not registered.
