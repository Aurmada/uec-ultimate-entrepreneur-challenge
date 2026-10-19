# UEC handoff: where things stand (October 2026)

Written so the work can continue from a fresh clone, in a cloud session or on a
new machine, with nothing from the machine it was built on. Read `CLAUDE.md`
first for the standing rules, then this, then `docs/ONBOARDING.md`.

## In one paragraph

The game is live at v3.8 on GitHub Pages
(`https://firdous-aurmada.github.io/uec-ultimate-entrepreneur-challenge/`).
Alongside it, the `live-3d` branch holds a working prototype that answers the
owner's question "can the fighters look and move more like a modern fighting
game, without copying one": every fighter rendered as a toon-shaded 3D model
posed live from the existing 2D animation, arenas rendered in Blender, fighters
lit by their stage, and fighting-game hit effects. It is all behind URL flags,
render-only, and off by default. It was reviewed and cleaned up in October 2026.
The open question is how it runs on a phone: that has never been measured.

A review session on 2026-10-18 added two local branches, neither pushed. One is
the next release, **v3.9**: step 3 of the move system, a deferred effect, as Jeff
Bozo's own signature (SAME-DAY DELIVERY), plus two AI fixes and a gap in the
live-match fingerprint. The other is `live-3d` with v3.9 merged in and the
prototype's leftovers done: parallax for the rendered stages, hair and coats that
trail, rims that stay on the outline, and hit bursts that follow the blow.

## Branches

| Branch | What it is | State |
| --- | --- | --- |
| `main` | The live game, v3.8 (`SIM_VERSION` 7) | Deployed. A push here is a release. |
| `live-3d` | `main` plus the 3D prototype and one 2D bug fix | Pushed, not merged. 374 tests pass. |
| `claude/same-day-delivery` | `main` plus v3.9 (`SIM_VERSION` 8) | Local, not pushed. 355 tests pass. Ready to release. |
| `claude/game-review-enhance-29bffb` | `live-3d` plus v3.9 and the prototype's leftovers | Local, not pushed. 412 tests pass. |

The two `claude/` branches were built in a git worktree under
`.claude/worktrees/`; nothing else is outstanding.

## v3.9 on `claude/same-day-delivery`

Spec: `docs/superpowers/specs/2026-10-18-same-day-delivery-design.md`;
ARCHITECTURE section 5, "A deferred effect".

- **SAME-DAY DELIVERY** (`SPECIALS.sameday`, archetype `deferred`, the twelfth,
  appended). Jeff orders a parcel onto the rival's spot; it lands 1.5 s later on
  anything within 62 px, from the sky (a jump does not dodge it, moving does).
  Blockable, parryable, a pop-up on a clean hit. One order at a time; a second
  press is refused and costs nothing. Roster-only. Jeff no longer shares HOSTILE
  TAKEOVER with Carl, so no two roster fighters share a signature.
- **State**: `deliveryT` and `deliveryX` in the registry. The clock runs in
  `updateFighting`; `endRound` cancels any order still out, so nothing lands
  after the bell.
- **AI**: every rival reads a pending order in `decide()` and steps off the mark,
  or blocks when it is too late to walk (`dodgeDelivery`); Jeff orders from mid
  range. Fixed on the way: the melee "create space" roll never moved (a rookie
  froze for a third of its melee decisions).
- **Fingerprint**: `hashGameState` now counts traps, which it never did.
- **Reviewed** by a second pass, which found two things, both fixed with tests that
  fail without the fix: an order could go out after the bell if the round ended
  during Jeff's startup, and the AI re-rolled its notice every decision, so a
  fighter that had stepped clear often walked back in (a Champion signed for 4 in
  60 point-blank orders, a Contender 15; now 0 and 4). Left as it is, like traps: a
  parcel landing in the same frame as a KO still resolves, deterministically.
- **Measured** in AI-versus-AI matches over the whole roster (scratch harness, 20
  per ordered pair, run twice): Jeff at Champion went from about 27% to 35%;
  nobody else moved outside the noise. With the flags off, nine staged frames over
  three arenas hash exactly as on `main`.

To release: push `claude/same-day-delivery` to `main` (it is `main` plus these
commits), then verify with the `curl` check in ONBOARDING section 7. `VERSION` is
already v3.9 and the README has its section. Live play needs both players on v3.9.

## The prototype on `live-3d`

All of it is described properly in section 7 of `docs/ARCHITECTURE.md` on that
branch. In short:

- **3D fighters** (`src/engine/gl3d/`, `?gl`). One modular, skinned model
  (`assets/models/founder.glb`, built by `lab/blender/build_founder.py`) wears
  every fighter's look: a mesh per hair style, headwear, eyewear, facial hair,
  outfit, accessory and roster prop, coloured from the fighter's palette. It is
  posed every frame from the same 2D pose the procedural rig draws, through
  stretchy two-bone IK, so every move, stance, body knob and player build carries
  over without a new keyframe. WebGL2, no library, two-pass toon shading.
- **Faces and portraits.** Each fighter's own 2D face, in every expression, is
  painted into a texture and projected onto the head. A founder who uploaded a
  photo fights with their photo. With `?gl` every portrait (select, VS, HUD,
  results) is a 3D bust.
- **Rendered stages** (`src/engine/stage.js`, `lab/blender/build_stage.py` and
  `lab/blender/stages/*.py`). All six arenas are lit Blender scenes rendered to
  images, with live screens the game paints (sponsor boards, the market board,
  the boardroom TV) and overlays (confetti, clouds). Each stage also lights the
  fighters standing on it.
- **Fighting-game effects** (`src/engine/vfx.js`). Impact bursts, guard and
  parry flashes, strike trails, projectile wakes, a cut-in banner for specials
  and Unicorn Mode, a signature look for each kind of special, Unicorn Mode's
  horn, and a camera push-in on a KO.
- **Sharp fighters** (`RENDER.sharpFighters` in `render.js`). Fighters are drawn
  at screen resolution between two world layers instead of being upscaled with
  the 960x540 world.

Added on `claude/game-review-enhance-29bffb` (2026-10-18; ARCHITECTURE section 7):

- **Parallax.** Each stage is also rendered in depth layers (the far distance,
  the floor, bands of the room) and each moves by its own depth as the camera
  pans; the floor is one skewed image. The boardroom's city and the summit's
  mountains hold still behind the window frames and railing. `STAGE_ART.PARALLAX`.
- **Secondary motion.** Ponytails, long hair, bobs and Cathie's coat trail their
  anchor on a spring, bent in the vertex shader; no new bones.
- **Rims on the outline only**, through a silhouette mask: the back light no
  longer streaks down inner legs.
- **Bursts follow the blow** (up for a launcher, low for a sweep, down for a
  parcel), and SAME-DAY DELIVERY's landing slams the floor in 3D.
- `lab/vfx.js` has scenes for those, and `lab/gl3d-bench.html` a flat-stage mode.

Flags: `?gl` turns everything on; `&stages=0` and `&fx=0` take out a piece;
`?stages`, `?fx` and `?sharp` try one piece with the 2D fighters; `?gl=max,dex`
puts only those fighters in 3D; `&perf` shows timing.

Screenshots (from October 2026, in `docs/images/live-3d/` on `live-3d`):
`stages.jpg` (each arena as shipped and as rendered), `portraits.jpg`,
`effects.jpg`, `signatures.jpg` (photo face, horn, each special's look) and
`lighting.jpg` (stage light and the KO shot).

Measured on an M2 Max in a live AI match at 60 fps, whole-frame render time:
1.73 ms with both fighters in 2D and 1.93 ms with both in 3D; with sharp
fighters, 1.98 ms and 2.07 ms. The stages and effects measured within
run-to-run noise. Readability with 3D fighters on rendered stages
(`lab/contrast.js`): 31.6% of a fighter lost against its stage, against 33.2%
with the procedural arenas.

### What merging it would change for players

With the flags off, one thing: the 2D attack face. It used to grin through every
attack (a curve with its signs flipped); it now snarls, as it was always meant
to. Everything else with the flags off renders exactly as v3.8, checked by
hashing game frames on all six arenas and every 2D portrait in the same
browser. It adds about 4.6 MB to the repo (the 1.3 MB model, 1.8 MB of stages with
their depth layers, and 1.5 MB of screenshots), and the game only downloads the model and stages
when `?gl` is on.

To merge: bump `VERSION` past v3.9 (v3.10, or v4.0 if it is the headline), turn the README's "In progress" section into a
release note, merge, push, and verify with the `curl` check in ONBOARDING
section 7. `SIM_VERSION` does not change: nothing the simulation computes is
different (`game.simT` is new, but it is not hashed and the simulation does not
read it), which the determinism and effects tests check.

## Decisions that belong to the owner

0. **Release v3.9** (push `claude/same-day-delivery` to `main`), and whether to
   push `claude/game-review-enhance-29bffb` as the new `live-3d`. It is `live-3d`
   plus v3.9 and the work below; merging it into `main` later carries v3.9 with it.
1. **Merge `live-3d` now** (the prototype ships dark, behind `?gl`) **or after a
   phone check.**
2. **Whether 3D ever becomes the default.** Not before phone numbers are in.
   The 2D rig has to stay either way: it is the fallback without WebGL2 and when
   the GPU context is lost.
3. **Pin the Supabase client.** `src/net/online.js` loads `supabase-js@2`, which
   floats: on 2026-10-05 it resolved to 2.117.2. A bad 2.x release would reach
   players without a deploy. Pinning means updating it by hand.
4. **The sprite sources in `lab/assets/`** (see "Not in the repo" below): keep a
   private copy, or let them go.
5. **Art direction.** The model and stages are scripted, which has a ceiling. An
   artist working in Blender to the same contract (ARCHITECTURE section 7, "The
   model contract") is the step up, and the runtime would not need to change.
6. **Fighters overlap at close range.** `pushApart` keeps bodies
   `PHYS.BODY_W * 0.92` (51 px) apart whatever their build, while the hurtbox
   scales with `build`, so a wide fighter (Adam, Carl, Jeff) visibly stands inside
   a narrow one. Widening the push box with `build` would fix the look, but it is a
   simulation change (spacing, combo step-ins, `SIM_VERSION`), so it was left.
7. **Balance as the AI plays it.** In AI-versus-AI at Champion, Elo (about 20%)
   and Carl (about 28%) sit at the bottom and Kim, Steve and Lizbeth near 70%.
   That measures how well the AI plays each kit as much as the kits themselves.

## Next steps, in the order they pay off

Done in the 2026-10-18 session (on `claude/game-review-enhance-29bffb`): depth for
the stages (step 3 below), secondary motion (step 4), the back-light streak and
per-move impact variations (step 5). Their notes are kept so the history reads.

1. **Phone benchmark.** On `live-3d`, serve with `python3 dev-server.py 4173`, open
   `http://<the machine's LAN address>:4173/lab/gl3d-bench.html` on a mid-range
   phone (no sign-in needed), and read the modes: All 2D, Both 3D, without stage,
   without effects. The budget is about 2 ms a frame for the 3D rig over 2D. If
   it is over, the known levers are a leaner composite (draw the key line in GL
   and skip the copy into the 2D buffer), a lower `DETAIL` in
   `build_founder.py`, and fewer meshes per fighter.
2. **The merge decision** above.
3. **Depth for the stages.** They are flat pictures, so nothing moves at a
   different speed when the camera does. Rendering two or three layers and
   offsetting them by camera position would give parallax.
4. **Secondary motion.** Hair, ponytails and coat tails are rigid to their bone.
5. **Smaller items:** body knobs scale bones rather than using shape keys;
   Kim's ring light sits off-square in a bust (it is pre-turned for the match
   head angle); the back light can catch an inner leg as a thin bright streak
   (the `step(0.62, edge)` threshold in `toon.js`); per-move impact variations.
6. **Golden pixel baseline.** `test/golden/baseline.json` only reproduces in the
   browser that wrote it, and it already did not match the Claude desktop app's
   browser in September. Its attack cases also changed with the snarl fix.
   Re-capture it on whatever machine will run it (ARCHITECTURE section 10).

## Known limits

- Phone performance: unmeasured, and the review session added a silhouette pass
  to the 3D fighters and more layers to the stages, both measured only on an M2
  Max (within noise, and 0.05 to 0.12 ms a frame).
- Secondary motion runs on real time, so hair keeps settling through a hitstop
  and swings at full speed in the KO slow motion.
- Kim's ring light still sits off-square in a bust; body knobs still scale bones.
- WebGL context loss: the 3D path falls back to 2D for the rest of the session
  and does not try to restore.
- The debug sign-in (`UEC.signInAs()`) uses the id `test-uid`, which is not a
  UUID, so one profile fetch to Supabase returns a harmless 400 in the console.
- Full-frame pixel hashes changed between September and October with no code
  change: the browser updated. Hashes only compare within one browser version.

## Backend (Supabase)

- Project `uec-game`. Its URL and publishable key are in `src/net/online.js`;
  dashboard links are in `docs/AUTH-SETUP.md`. It is on a paid plan so it never
  pauses. Anything that creates or changes paid resources needs the owner's OK.
- `profiles` is world-readable. Identity columns are user-writable through
  column-level grants; ranked stats are writable only by the `report_match()`
  RPC. A new user-writable column needs both INSERT and UPDATE column grants,
  and the upsert needs UPDATE on `id`, or saves fail with "permission denied".
- `report_match()` is a security-definer RPC: stats apply only once both
  players have filed mirror-image reports for the same room, under an advisory
  lock so a match is never counted twice. Its points formula mirrors `POINTS` in
  `src/config.js`; change both together.
- `leaderboard` is a view over signed-in players with at least one confirmed
  live match.
- Emails never go in `profiles`. A trigger on `auth.users` copies them into a
  private `user_emails` table that only its owner can read.
- Live matches use Realtime broadcast channels (one per room) and a presence
  lobby. No tables. Protocol in ARCHITECTURE section 5.
- `UEC.signInAs()` is local only: it creates no auth user and no profile row.

## Deploying

ONBOARDING section 7: `npm test`, bump `VERSION`, push `main`, then read the
deployed `VERSION` back with `curl`. Pages builds `main` from the repo root with
Jekyll (there is no `.nojekyll`), and Jekyll reads Liquid tags before anything
else, so two opening curly braces in a row, or an opening curly brace followed
by a percent sign, in any markdown file can fail the build. The remote is
HTTPS; on the original machine the `gh` CLI was signed in as `firdous-aurmada`.

## Lessons that cost real time

These were in the original machine's private notes; they are here so they
survive it. ARCHITECTURE section 11 has more.

- **iCloud ate the repository.** The checkout lived in `~/Documents`, which
  iCloud syncs. After three idle weeks iCloud had moved 127 files inside `.git`
  (and 17 in the tree) to the cloud, and left duplicate copies of git's index
  (`.git/index 2` and so on). `git diff` simply hung. Reading the files brings
  them back (`find . -flags +dataless` lists what is missing); `git fsck` came
  back clean. Keep checkouts somewhere iCloud does not sync, such as
  `~/Developer`.
- **Lab captures in the browser:** reload the page after editing an engine
  file, or the capture renders the old module. A hidden browser pane throttles
  timers hard, so lab scripts that wait on `setTimeout` crawl; keep the pane
  visible or route the waits through a `fetch`. `dev-server.py` rejects large
  uploads, so whole-frame sheets save as JPEG.
- **Never click blindly on the title screen.** A stray click hit FIGHT A REAL
  PLAYER and joined the live lobby as the signed-in test user. Drive the game
  with `UEC.startMatch(...)` instead (ONBOARDING section 5).
- **Measure, then believe.** `lab/contrast.js` finds the fighter by rendering
  the frame with and without it; pin the cast, and wait for a rendered stage to
  load or it measures the procedural fallback. Judge a 3D face change at the
  match angle, not only in a portrait. Compare renders before and after in the
  same browser.
- **Building the model** (details in ARCHITECTURE section 7): weigh each part to
  its bones before joining parts under one name; props in a hand ride the grip
  joints, never the forearm; a prop fixed to the head is pre-turned by the
  head's posed angle, and a test guards that; thin geometry swells into black
  bars under the ink pass (mark it `inkless`); a ring of metaball balls
  decimates into beads, so build rings from capsules.
- **Blender 5 changed its API:** the compositor is `compositing_node_group`
  (there is no `scene.node_tree`), WebP output works, `ShaderNodeMix` colour
  inputs are sockets 6 and 7 with the result on output 2, `obj.is_holdout` cuts
  objects out of a render, `obj.visible_shadow = False` stops an emitter
  shadowing itself, and scripts loaded through `importlib` write `__pycache__`
  unless `sys.dont_write_bytecode` is set.
- **`getFighter(id)` never throws.** An unknown id silently returns the first
  roster fighter, so a bad id renders as the wrong person. Fall back to
  `DEFAULT_BASE_ID` (`'b-neo'`), never a literal.
- **A field named like a method shadows it.** `FXSystem` once stored its cut-in
  as `this.cutIn`, which replaced the `cutIn()` method on the instance.

## Not in the repo

Deliberately left out, and gone if the original folder is deleted:

- `lab/assets/` (about 136 MB in 14 files, gitignored): the source models the
  dormant `?sprites` baker (`lab/baker.html`) reads, a base model with its
  texture and twelve animation clips. Where they came from is not recorded, so
  they stay out of this public repo. The baked atlases they produced are
  committed (`assets/sprites/founder/`). They are only needed to re-bake
  sprites.
- `lab/atlas/` (gitignored): the baker's output, byte for byte the committed
  `assets/sprites/founder/`. Nothing is lost without it.
- `lab/previews/` and `lab/*.png` (about 120 MB, gitignored): lab output, all
  regenerable with the `lab/` tools. The useful pictures are copied into
  `docs/images/live-3d/`.
- `.superpowers/`: two mockups from an August brainstorm (the v3.3 silhouette
  study). What they argued for shipped as v3.4.

## History

Release notes, newest first, are the "What's new" sections of `README.md`.
Design specs and implementation plans are in `docs/superpowers/`. The commit
messages on `live-3d` explain each step of the prototype and what was measured.
