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

A structural test backs it up: `test/fighterState.test.js` constructs a real `Fighter` and
fails on any own enumerable property that is neither declared in the registry nor on an
explicit allowlist of things that are legitimately not simulation state. (It began life as
a grep for `this.<name>T` timers; the very next task moved every registry field into
`initState()`, which left that grep with nothing to find and no way to fail.) The
corollary is worth knowing before you add anything: derived state belongs in a **getter**,
not a constructor field — `usesRunway` and `winded` are getters for exactly this reason.

Stance switch (ALIGNMENT SHIFT, scam's special) is the first verb built against the
registry, and the reason `SIM_VERSION` moved to 5: a fighter in `capabilities` resolves
the same inputs to different damage dealt and taken than one in `safety` or neutral, so
two peers on either side of the version bump would shake hands and then diverge the first
time either stance mattered. `stance` also joined `ARCHETYPES` (§6) as a tenth entry —
appended, not inserted, so the wire codec's archetype index (`state.js`, append-only by
contract) stays stable and needed no `CHARACTER_WIRE_VERSION` bump. It is a known
archetype for a character's special only: it is explicitly rejected as a command-normal
archetype, because neither the command-normal budget (`BUDGET.CMD.ARCHETYPE`) nor
`fighter.js`'s command-normal routing have any behaviour for it — only the special/
signature path intercepts `type === 'stance'` before an attack object is even built.

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

Ten are legal: `strike`, `projectile`, `aoe`, `rush`, `grab`, `teleport`,
`rain`, `counter`, `trap`, `stance`. Each has an optional shape applied once
(`ARCHETYPE_SHAPES`) and an optional per frame tick (`ARCHETYPE_TICKS`).

`counter` and `trap` are grouped as `NO_SWING`, meaning the move is not the
swing. That set exists **for pricing only**: their power lives in `params`
rather than in frame data. It is not a statement about needing an incoming
attack. A counter does need someone to swing at it; a trap is placed whether or
not anyone attacks, and an attacking opponent actually beats it out of its
startup. Conflating those two readings will send you looking for a bug that is
not there.

`stance` (§5, "What the simulation remembers") is legal for a character's
special or signature but rejected by `validateCharacter` as a command-normal
archetype — neither the pricing table nor the command-normal dispatch in
`fighter.js` have any behaviour for it, so allowing it there would validate,
price as free, and fire as a no-op.

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
over the network — a `parts` array from an untrusted peer would be a per-frame render
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

Run `npm test` for the current count; it was around 245 across 12 files when this
was written, and a pinned number in a document is a number that rots. The files
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

### `test/golden/` — the pixel-level checks, and how to run them without clicking

`npm test` has no canvas, so the two pixel guarantees live in a browser page
instead: `test/golden/index.html`, served by `python3 dev-server.py 4173`
(plain `http.server` caches modules and serves stale ones).

Three checks, one write action, all on that one page:

| Button | What it does |
| --- | --- |
| CHECK against baseline | Renders every fighter × `CASES` in `hash.js`, hashes the pixels, diffs against `baseline.json`. 126 cases as of v3.3. |
| CHECK isolation (big bodies first) | Renders three extreme bodies into a scratch canvas, THEN re-runs the baseline check — catches shading state leaking between fighters (see above). |
| CHECK every part draws | Renders each declared `parts` entry with and without itself, twice, and reports a pixel-diff count plus a contrast figure per part (see below). |
| WRITE new baseline | Captures the current renders and PUTs them to `baseline.json` — requires `dev-server.py`, which is the only server here with a PUT handler. |

**The parts check also reports contrast, but does not fail on it.**
`countDiffPixels` only asks whether a part changed any byte, which is size and
occlusion, not visibility — a part painted a shade away from the body under it
clears the pixel-count bar and still reads as invisible. Alongside that count,
`checkParts` now computes the mean RGB distance between the with-part and
without-part renders, restricted to pixels where the part draws over an
already-opaque body pixel (extension past the silhouette is excluded — that's
the pixel count's job). This number is REPORTED, not enforced: it is not
added to `bad` and cannot fail the check. The reasoning is in the comment
above `contrastForPart` in `index.html` — short version, `drawFighter` runs
every part through `shadeBuffer()` (§7) before a pixel is read, so a part's
declared fill hex is not what lands on the canvas, and there isn't enough
real post-shading data on hand to defend a specific cutoff. Pick one from an
actual run, not a guess. **This also cannot see "dark part on dark stage"**
— the canvas here is transparent with no arena behind the fighter, so
fighter-vs-stage contrast (half of the eleanor/coat bug, historically) is
entirely outside what this file measures. `lab/silhouette.js` and
`lab/contrast.js` are the tools for that; they need a live match, not this
harness.

**Running by hand**: open `http://localhost:4173/test/golden/index.html` and
click a button; results render into the page.

**Running by URL**: append `?run=baseline`, `?run=isolate`, or `?run=parts` to
the same URL and the matching check runs on load, no click needed. Two places
to read the result from:

* `window.__goldenResult` — `{ run, pass, total, badCount, bad, detail, ... }`
  (`parts`/`min` on the parts run), for anything that can execute JS in the
  page and read a variable.
* `document.title` — a one-line summary (`PASS parts 12/12 draw`,
  `FAIL baseline 3/126 mismatched`), for anything that can only read a page
  title.

**This is not CI.** There is no `.github`, no workflow file, and nothing in
this repo opens a browser on its own — `?run=` only makes the page itself
drivable once something (a screenshot tool, a scripted browser session, a
person) has already opened the URL. `window.captureGolden` on the same page
exists for the same reason: hooks for a driver that isn't committed yet.

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
