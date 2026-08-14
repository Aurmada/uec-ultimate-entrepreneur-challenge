# UEC: architecture

Technical reference for engineers working on the codebase. For "how do I run
this and where is everything", read `ONBOARDING.md` first; this document assumes
you have the game running and want to change it safely.

Current version: `v3.3`. Simulation protocol version: `SIM_VERSION = 4`.

---

## 1. What the system is

UEC is a 2D arcade fighting game that runs entirely in the browser. Two fighters,
best of three rounds, sixty seconds each. Single player against an AI, or two
players over the network in real time.

Four constraints shape every decision in the codebase, and they are not
negotiable without a conversation:

| Constraint | Consequence |
| --- | --- |
| Zero runtime dependencies | No npm packages ship. No framework, no bundler, no 3D library. Everything is hand written except one vendored face detector. |
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
physics, timers, and the power budget. It is deterministic, it runs at a fixed
60 Hz, and it is the thing the netcode replicates.

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
  stats: { speed, power, hp },     // SIMULATION
  body:  { height, build, reach }, // SIMULATION (hurtbox, reach pricing)
  style: 'grappler',               // SIMULATION (frame data multipliers)
  commandNormals: [ ... ],         // SIMULATION (frame data, archetype)

  c: { hair, suit, skin, ... },    // render only
  face:   { BROW_Y, PUPIL_R, ... },// render only
  stance: { lean, armF, elbowF },  // render only
  motion: { windup, drop, squash },// render only
  hairStyle, outfit, accessory,    // render only
}
```

Render only fields are read in `drawFighter.js` and nowhere else. They are not
carried by the codec, not part of the netcode handshake, and not priced by the
budget. Adding a new one is safe and needs no version bump. Adding a field that
the fighter state machine reads is a simulation change and needs the protocol
work described in section 5.

There is one subtlety worth internalising, because it caused a real bug. Render
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
  vendor/pico.js      the only third party code (face detection)
incubator/            character authoring tool (admin surface, unlisted)
lab/                  measurement harnesses. Not shipped logic, but load bearing.
test/                 node --test, no framework
docs/                 this file and friends
```

### `src/engine` (about 4700 lines, the core)

| Module | Responsibility |
| --- | --- |
| `game.js` | Match controller. Rounds, timers, **hit detection and resolution**, projectiles, traps, drops, KO and victory. |
| `fighter.js` | Fighter entity. Physics, state machine, attack initiation, command normal resolution, meter. Owns its own state; does not resolve hits. |
| `moves.js` | Move archetypes. `ARCHETYPE_SHAPES` (applied once at start) and `ARCHETYPE_TICKS` (applied per frame while active). |
| `anim.js` | Keyframe sampling, `REST` pose, pose maths. |
| `drawFighter.js` | Procedural vector fighter. Pose composition, faces, hair, cel shading, key line. The largest and most delicate file. |
| `proportions.js` | Body clamping and the pose post pass that applies proportions. |
| `render.js` | Frame compositor and camera. |
| `ai.js` | AI opponent. Decision ticks plus a per frame reflex layer. |
| `input.js`, `audio.js`, `fx.js`, `sprites.js` | Input mapping, synthesised audio, particles and juice, optional sprite path. |

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
  └─ game.update(dt)              SIMULATION, fixed 60 Hz
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

`SIM_VERSION` is the one people forget. Bump it whenever fight behaviour
changes: damage, frame data, hit resolution, how an archetype resolves. The
character payload can be byte identical while the behaviour differs, in which
case the other two versions still match and two clients shake hands happily and
then diverge on the first use of the changed move.

Two shipped examples are recorded in the comments at the constant:

* **v3**: projectile command normals fired nothing at all, because the tick's
  counters were seeded on one code path and not the other. A v2 client threw a
  harmless whiff where a v3 client threw two projectiles for 11 damage.
* **v4**: a curated player move's frame data changed. Note carefully why that is
  a wire concern: `packCommand` sends curated moves as a bare id and
  `unpackCommand` rebuilds them from **our** table, deliberately, so the numbers
  cannot be forged by editing a challenge link. The flip side is that each peer
  supplies its own copy, so a table change is a protocol change.

Render only changes never need a bump. A v3.1 and a v3.2 client see different
hair colours and simulate identically.

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

Nine are legal: `strike`, `projectile`, `aoe`, `rush`, `grab`, `teleport`,
`rain`, `counter`, `trap`. Each has an optional shape applied once
(`ARCHETYPE_SHAPES`) and an optional per frame tick (`ARCHETYPE_TICKS`).

`counter` and `trap` are grouped as `NO_SWING`, meaning the move is not the
swing. That set exists **for pricing only**: their power lives in `params`
rather than in frame data. It is not a statement about needing an incoming
attack. A counter does need someone to swing at it; a trap is placed whether or
not anyone attacks, and an attacking opponent actually beats it out of its
startup. Conflating those two readings will send you looking for a bug that is
not there.

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

A character may carry `parts` — render-only geometry outside its body outline. A
held prop, a coat, a cape: all one system, differing only by anchor joint and
z-layer.

`resolveParts()` in `engine/parts.js` is pure — parts plus pose in, absolute
coordinates out — which is what makes placement unit-testable in a suite with no
canvas. `drawParts()` paints them, and is called twice from `drawFighter` **inside
the offscreen buffer**: `behind` before the back limbs, `front` after the front arm.
Drawing inside the buffer is what earns cel shading, rim light, the key line and
membership in the silhouette for free.

Parts are validated by the shared `validateCharacter` and are **never priced** — they
are free, like shoulders, stride and head. They do travel on the wire, which is why
`CHARACTER_WIRE_VERSION` is 2. Cost is under the measurement noise floor: with two
parts-bearing fighters on screen, 1.106 ms/frame with parts against 1.123 ms without,
a difference smaller than the 0.13 ms run-to-run variance.

The one rule: **a prop must never read as extending reach.** Same failure as the
`applyMotion` rule above — the simulation stays correct, but the game lies to the
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

215 tests across 11 files. The ones worth knowing:

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

---

## 11. Hazards worth knowing before you touch things

* **The round opens in `intro` and discards inputs pressed then.** A test harness
  that presses on frame 0 reports the entire roster as dead. Idle until
  `game.state === 'fighting'`.
* **Not every move sets `attack`.** A dash changes state, a super sets a buff
  timer, a steal moves meter. Watching `fighter.attack` alone misses them.
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
