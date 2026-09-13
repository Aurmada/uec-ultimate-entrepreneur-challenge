# UEC — technical brief for an outside read on character art

**Date:** 2026-07-30 · **Purpose:** second opinion on whether the current character-art approach is the right one before committing more work to it.

> **Historical snapshot (noted September 2026).** This brief describes the project at v2.3.1 and is kept as the record of why the baked-sprite experiment was paused. Several details are no longer true: the `p1-character-forge` branch was merged and no longer exists, the Incubator and the `counter` and `trap` archetypes are built, the rank-based combo ladder was replaced by a single any-basic-into-any-basic rule, the schema is at version 2, and the procedural rig has since gained faces, stances, motion and parts. The sprite path it describes still exists, dormant, behind `?sprites`. For the current system read `ARCHITECTURE.md`.

---

## 0. What I actually want reviewed

The game is **done and live**. Combat, netcode, progression, UI, audio — all shipped and working. The one part that is not solved is **making characters look distinct from each other**.

Right now there is exactly **one character model**. Nine named fighters share it. Making them look like nine different people is the remaining work, and it's large enough that I want to sanity-check the approach before spending more on it.

Skip to **§6 (the unsolved problem)** and **§7 (options)** if you want the decision. §1–5 is context so the constraints are legible.

---

## 1. The product

**UEC: Ultimate Entrepreneur Challenge** — a browser arcade fighter. Founders and CEOs fight 1-v-1 with Pitch Deck Strikes, Hostile Takeovers and full-meter **Unicorn Mode**. Side-view, best-of-3, 60-second rounds. Pacing and feel take cues from 1990s arcade fighters.

Live at v2.3.1. Playable in ~5 seconds with no account and no install.

**Shipped feature set:**
- Combat: 4 basic attacks (slap/punch/kick/launch), 6 signature specials, 3 universal moves (Cease & Desist, Acqui-Hire, Hustle Dash), block, parry (0.12 s window), dash, jump, crouch
- Rank-based combo system — cancel into same-or-stronger, with per-move caps; routes run 8+ hits
- Meter economy: energy → Special (50) or Unicorn Mode (100)
- **Live multiplayer** — deterministic 60 Hz lockstep over Supabase Realtime, input-delay netcode, packet-loss healing, desync detection, Web Worker so backgrounded tabs keep simulating
- Vs AI at 3 difficulties with per-fighter personality (aggression, jumpiness, preferred range)
- Async challenge links (the URL carries your fighter; friends fight your AI ghost)
- Profiles with photo upload → on-device face detection → your face becomes your fighter
- 6 animated arenas, leaderboard, ranked points, shareable result cards, tutorial, full mobile touch controls

**Roster (all parody, all fictional):** Lizbeth Holmez (Theramos), Adam Weumann (WeWerk), Steve Nojobs (Pear), Kim Koindashian (SkimzCoin), Cathie Woodz (ARKK Capital), Carl Icahnt (Icahnt Holdings), plus cameo tier Elo Ma / Jeff Bozo / Scam Alt. Sixteen additional generic "base" bodies exist for player-made profiles.

---

## 2. Hard constraints

These are non-negotiable and any proposal has to live inside them.

| Constraint | Detail |
|---|---|
| **Zero dependencies, zero build step** | The shipped game is vanilla ES modules + Canvas 2D + Web Audio. No bundler, no framework, no runtime 3D library. `npm test` runs Node's built-in test runner; that's the entire toolchain. Deployment is "copy the folder to a static host." |
| **Originality / legal** | 100% original characters, names, companies, art, audio. No Mortal Kombat characters, artwork, names, sounds or assets. Street Fighter is **genre-convention inspiration only** — no SF characters, logos, named moves, sounds, or ripped art. Real CEOs are parodied by name only, never depicted. |
| **Cost** | Generative asset spend must stay small. AI image/video generation per character is explicitly off the table as a per-character cost — an earlier plan to generate all nine via a generative service was rejected as too expensive. |
| **Determinism** | Live matches are lockstep. Anything that affects simulation must be byte-identical on both peers. Art is safe here; move/stat data is not. |
| **Runtime budget** | Whole render pass currently ~0.3 ms/frame at 60 fps (~98% headroom). Character rendering must not eat that. |

---

## 3. Stack and code shape

```
8,429 LOC   src/     shipped game
2,524 LOC   lab/     offline asset pipeline (never ships to the browser)
  290 LOC   test/    31 tests, all passing
```

```
index.html            all screens & modals (DOM shell)
styles.css            visual system
src/
  config.js           every gameplay number: physics, frame data, meter, points, ranks
  state.js            localStorage save + challenge-link codec
  main.js             boot, screen router, match lifecycle, render loop
  data/fighters.js    roster definitions, specials metadata, custom/ghost builders
  data/arenas.js      six procedural animated arenas
  data/schema.js      character schema v1 + validator + power budget   [new]
  engine/game.js      match controller: rounds, timer, hit resolution, KO
  engine/fighter.js   fighter entity: state machine, physics, attacks, specials
  engine/moves.js     move archetype implementations                    [new]
  engine/proportions.js  body proportion clamping + pose post-pass      [new]
  engine/ai.js        AI controller (difficulty × personality)
  engine/input.js     keyboard + multi-touch → virtual gamepads
  engine/drawFighter.js  procedural character rig  ← the art problem lives here
  engine/sprites.js   sprite-atlas rendering path                       [new]
  engine/render.js    frame compositor
  engine/fx.js        particles, comic popups, shake, hitstop
  engine/audio.js     Web Audio SFX + generative per-arena music
  ui/                 hud, screens, result card, tutorial, face detect
  net/online.js       Supabase Realtime lockstep netcode
lab/                  offline: GLB parsing, skinning, rasteriser, sprite baker
```

**The `Controller` contract** is the reason the netcode is small: human, AI and network players are interchangeable inputs to the same simulation.

---

## 4. Game logic (this part is settled — included for completeness)

Frame data lives entirely in `config.js`. Example basics:

| Move | Startup | Active | Recovery | Dmg | Reach |
|---|---|---|---|---|---|
| slap | 0.04 s | 0.06 | 0.12 | 4 | 78 |
| punch | 0.05 | 0.06 | 0.11 | 7 | 84 |
| kick | 0.10 | 0.08 | 0.17 | 12 | 106 |
| launch | 0.06 | 0.10 | 0.28 | 10 | 74 |

Physics: walk 250 px/s, jump −760, gravity 2100, hurtbox 56×148. Stage 960×540, floor at y=480.

Specials are **typed behaviours**, not bespoke code: `strike / aoe / projectile / rush / grab / teleport / rain`, with `counter` and `trap` specced but not built.

Character difference today is **10 style presets** — six scalar multipliers each (`startup, dmg, reach, recovery, speed, hp`). A "fighting style" is six numbers.

### The power budget (new, and I think the most useful thing built recently)

```
COST = 100 × [ 1.00 × (dmg   − 1)
             + 1.00 × (hp    − 1)
             + 1.20 × (speed − 1)
             + 1.00 × (reach − 1)
             + 0.70 × (1 − startup)
             + 0.50 × (1 − recovery)
             + 0.80 × (body.reach − 1)
             − 0.60 × (body.height × body.build − 1) ]
```

`|COST| ≤ 8` clean · `≤ 15` warn · `> 15` blocked. The last term is a refund: a bigger body is a bigger hurtbox, so size partly self-balances.

Run against the ten shipped styles: grappler −4.6, brawler −3.8, balanced 0.0, zoner +4.7, rushdown +7.0, showman +8.2, technical +8.6, trickster +12.2, glass +14.2, **phantom +16.8 (blocked)**. Five clean, four warn, one blocked — it discriminates rather than condemning everything. PHANTOM holds advantage on four axes and pays on two; that's a real balance bug the formula caught and I'd previously missed by eye.

---

## 5. Graphics — two rendering paths currently exist

### Path A — the procedural rig (shipped, live)

`drawFighter.js`, 1,084 lines. Every fighter is drawn from code every frame: capsule limbs, blob torso, then layered `drawHair / drawHeadwear / drawEyewear / drawFacialHair / drawAccessory / drawFace / drawTorso`. Pose is computed per frame from the fighter's state machine.

On top of that sits a **cel-shade post-pass**: the fighter renders into an offscreen buffer, then one shading pass composites a form shadow, warm-key/cool-fill directional split and rim light across the whole silhouette at once. Because it's a post-pass rather than per-shape, it's pose-independent — every current and future frame is lit for free.

**What's good:** zero asset files, infinitely recolourable, customisation is data (12 hair styles × 5 headwear × 4 eyewear × 5 facial hair × 9 outfits = 10,800 combinations before colours), photo-derived faces work, and it costs ~0.3 ms/frame.

**What's bad:** it looks like *shapes*. It reads as a stylised puppet, not a fighter. Squash-and-stretch, anticipation coils and recoil snaps were added and helped, but the ceiling is low. It does not read as Street Fighter or Mortal Kombat, and that gap is what triggered this whole line of work.

### Path B — baked sprite atlases (on branch, opt-in via `?sprites`)

13 PNG atlases, 1.3 MB total, shipped as plain files. Frame 341×332, feet anchor at (151, 330). States: idle, walk, crouch, block, slap, punch, kick, launch, jump, hitlight, hitstun, launched, ko.

The game never touches a 3D file and gains no 3D dependency — it draws sub-rectangles of PNGs. `sprites.js` is 142 lines and maps fighter state → atlas state, with attacks falling back to the nearest basic so a character with a signature move never vanishes.

Frames were sampled by **equal motion**, not equal time, so the manifest carries each frame's real normalised moment in the clip. Replaying at a constant rate flattened a punch into a shove; honouring the timings makes it snap (0.029–0.035 s on the impact frames vs 0.111 uniform).

---

## 6. The asset pipeline (lab/) — and the unsolved problem

This is the part I most want judged.

### How the sprites are made

Entirely offline, in the browser, with no libraries:

1. **`parseGLB`** — reads glTF binary directly (JSON + BIN chunks, accessors, bufferViews, byteStride). ~670 lines total in `glb.js`.
2. **`classify`** — the model's UV atlas was unusable, so vertices are coloured by **dominant bone** instead: skin, hair, suit, shirt, tie, pants, shoe. Then `smoothMaterials` does a 2-pass majority vote over the mesh's own connectivity (CSR adjacency, 1.5 self-bias) to kill the sawtooth at material seams.
3. **`skinAt`** — full skeletal skinning: TRS channels, quaternion nlerp, node hierarchy, inverse bind matrices, 4-weight vertex blending.
4. **Retargeting** — the animation service decimated the mesh (30,974 → 469 triangles). Rather than pay again, only **rotations** are grafted from the cheap clip onto the full-detail mesh. Joint names match; bone lengths differ ~3%, and rotation-only transfer is immune to that.
5. **`motionTimes`** — arc-length sampling, so frames are spaced by equal motion.
6. **`renderPose`** — a software rasteriser: barycentric fill, z-buffer, 3-band cel shading against a fixed light, silhouette ink outline. ~85 lines.
7. **Ground lock** — one constant Y offset **per clip** (not per frame; per-frame introduced a 40 px bounce that existed nowhere in the source).
8. **`drawFace`** — a 2D face drawn after the body, positioned in the **head bone's own coordinate frame** and wrapped on the head sphere, so it turns with the head instead of sliding off or poking through the silhouette.
9. **`bake-all.html`** — renders all 13 states at one shared projection, takes the union ink box across every frame of every state, crops everything to it, exports atlases + manifest.

### What it cost

**96 credits total** (balance 801 → 705). One mesh + twelve animation clips at 8 credits each. **Additional characters cost zero credits** — the pipeline is reusable, the mesh is owned, and re-baking is free compute.

That's the strong argument for this path. It's also why the next problem is sharp.

### The unsolved problem

**One mesh. Nine characters. They are currently identical.**

The atlas has lighting baked into RGB, so I can't tint at runtime without the shading going with it. Options I can see:

- Re-bake per character with a different palette (13 states × N characters of PNG weight — at 1.3 MB each, nine characters is ~12 MB)
- Bake a **material-ID channel** alongside colour, and recolour at runtime in a shader-less Canvas pass (cheap in bytes, costs per-frame CPU or a one-time offscreen recolour at load)
- Bake per character but share silhouette-identical states and only vary what differs

And recolouring alone may not be enough. Nine characters in different-coloured identical suits with identical builds and identical animations is a palette swap, and palette swaps are exactly what makes a roster feel cheap. Real differentiation needs some combination of body proportion variation (already built — `proportions.js` clamps six knobs 0.82–1.25), different animation clips per character (clip alternates already identified: 4–5 options each for punch/kick/block/ko/walk), and per-character silhouette elements.

### Known remaining defects in the sprite path

Being explicit so this isn't oversold:

- **Hair reads as a grey cap.** It's a flat band with a hard edge across the crown. Colour is fixed; the shape isn't.
- **Face is too subtle at gameplay size.** At 3× zoom the jaw, mouth and cheekbone read fine. At the in-game 196 px they do almost nothing.
- **`crouch` shuffles** — the source is a crouch-*walk* clip, so it slides. Needs a static low guard or a range trim.
- **Poses are generic.** A corporate raider throwing a textbook boxing jab. Correct, not characterful.
- **No victory state.** The obvious animation candidates in the library are holding weapons.
- **The mesh is a boxer in a suit.** It is not a stylised fighting-game character.

---

## 7. Options on the table

| | Approach | Per-character cost | Time | Ceiling |
|---|---|---|---|---|
| **A** | Keep the procedural rig, push it harder | Zero (data only) | Low | Low — it will always read as shapes |
| **B** | Sprite atlas + runtime recolour via material-ID channel | Zero credits, ~1.3 MB shared + tiny per-character data | Medium | Medium — solves colour, not silhouette |
| **C** | Sprite atlas + per-character re-bake (palette + body proportions + alternate clips) | Zero credits, ~1.3 MB each | Medium-high | Medium-high — genuinely distinct, but all from one mesh |
| **D** | Commission or generate a distinct mesh per character, run each through the same pipeline | ~96 credits each (~864 for nine) | High | High — real roster, real cost |
| **E** | Hand-drawn 2D sprite art per character | Money or a lot of time | Very high | Highest — but incompatible with the "zero asset files" identity and with player photo upload |
| **F** | Hybrid: baked sprites for the AI roster, procedural rig for player-made founders | Mixed | High | Medium — but two rendering paths to maintain forever |

Option F is worth flagging: **player photo upload is a core feature**, and a baked sprite cannot carry an arbitrary uploaded face. Whatever path is chosen either keeps the procedural rig alive for player characters, or invents a way to composite a photo face onto a baked sprite (the head-bone-anchored face system already does something close to this, so it may be tractable).

---

## 8. Specific questions I'd like answered

1. **Is the 3D→sprite pipeline the right foundation at all**, or is it a lot of machinery pointed at the wrong target? The honest counter-argument is that a fighting game's characters are its whole identity, and deriving nine from one boxer mesh may be structurally incapable of producing a roster that feels like a roster.

2. **Is per-character re-bake (C) or runtime recolour (B) the better call?** Re-bake is simpler and looks better; recolour is ~9× smaller and keeps character creation instant. There's a version-control consideration too: nine sets of PNGs in git is a different repo than one.

3. **How much does the "one mesh" ceiling actually matter?** Street Fighter and Mortal Kombat rosters differ in silhouette first — Dhalsim vs Zangief is legible at 20 px. Body proportion knobs (0.82–1.25) plus per-character alternate clips might get most of the way there, or might not get close. I don't have a good instinct for this.

4. **Does the player-photo feature force keeping the procedural rig forever?** And if so, is maintaining two rendering paths acceptable, or does that argue for pushing option A much harder instead?

5. **Is there an approach I'm not seeing** that fits inside zero-dependencies, near-zero per-character cost, and full originality?

---

## 9. Current state, precisely

- **`main`** — v2.3.1, live and deployed. Procedural rig only.
- **`p1-character-forge`** — 24 commits, **unpushed, undeployed**. Contains: character schema v1 + validator + power budget, body proportions system, move archetype extraction, golden-image regression harness (FNV-1a pixel hashing), the entire `lab/` pipeline, the 13 baked atlases, and `?sprites` opt-in rendering.
- **31 tests pass.**
- The sprite path is **opt-in and non-default**; nothing shipped has changed appearance.

### Also specced but not built

**"The Incubator"** — an authoring tool for characters (identity, look, body sliders, move archetype editor, live power-budget meter, live preview using the real renderer, spar against real AI, export to a plain data module). Designed to live on an admin/backend surface, not in the game. The schema it produces is already built and validated; the UI is not. Phases: P1 foundation (done) → P2 authoring UI → P3 repopulate the roster → P4 per-character pose/animation rig.
