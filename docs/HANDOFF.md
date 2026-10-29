# UEC handoff: where things stand (late October 2026)

Written so the work can continue from a fresh clone, in a cloud session or on a
new machine, with nothing from the machine it was built on. Read `CLAUDE.md`
first for the standing rules, then this, then `docs/ONBOARDING.md`.

## In one paragraph

The game is live at v3.10 on GitHub Pages
(`https://aurmada.github.io/uec-ultimate-entrepreneur-challenge/`), released
on 2026-10-29. The repository
moved to the Aurmada organisation in October 2026; GitHub forwards the old
repository address but not the old Pages site (`firdous-aurmada.github.io`), which
now returns 404.
Since v3.10, `main` also carries a working prototype that answers the
owner's question "can the fighters look and move more like a modern fighting
game, without copying one": every fighter rendered as a toon-shaded 3D model
posed live from the existing 2D animation, arenas rendered in Blender, fighters
lit by their stage, and fighting-game hit effects. It is all behind URL flags
(`?gl`), render-only, and off by default. On the owner's iPhone the 3D fighters
cost 0.7 ms a frame; whether 3D becomes the default is the open question, and a
mid-range phone has not been measured.

A review session on 2026-10-18 built **v3.9**, released on 2026-10-25: step 3 of
the move system, a deferred effect, as Jeff Bozo's own signature (SAME-DAY
DELIVERY), plus two AI fixes and a gap in the live-match fingerprint. v3.9.1
points the page and the docs at the new address. The same session built a
branch, `claude/game-review-enhance-29bffb`: `live-3d` with v3.9 merged in and
the prototype's leftovers done (parallax for the rendered stages, hair and coats
that trail, rims that stay on the outline, and hit bursts that follow the blow).

Sessions on 2026-10-25 built two more releases, v3.9.2 (a throw that goes
behind the thrower from either side) and v3.9.3 (an AI that reads traps), and
both shipped on 2026-10-26.

A cloud session on 2026-10-28 built **v3.9.4** from a fresh clone of `main`:
the AI waits for an opening before it throws a grab or a slow strike, drops its
guard to punish, and stops guarding swings that have already missed. It also
kept the AI-versus-AI harness as `lab/balance.js`. Reviewed, fixed and released
the same day. It then brought the 3D prototype up to v3.9.4, measured it on the
owner's iPhone (too slow at first: the 3D image was copied into the 2D canvas),
rebuilt how the fighters reach the screen, and released it dark as **v3.10** on
2026-10-29.

## Branches

| Branch | What it is | State |
| --- | --- | --- |
| `main` | The live game, v3.10 (`SIM_VERSION` 9), with the 3D prototype behind `?gl` | Deployed. A push here is a release. 448 tests pass. |
| `claude/gfx-v3.9.4` | The branch v3.10 merged: the review branch below, `main` to v3.9.4, and the 3D layer | Merged into `main`. |
| `claude/game-review-enhance-29bffb` | `live-3d` plus v3.9 and the prototype's leftovers, with `main` to v3.9.1 | Superseded: all of it is in `main`. |
| `live-3d` | v3.8 plus the 3D prototype and one 2D bug fix | Superseded: all of it is in `main`. |

`claude/gfx-v3.9.4` merged v3.9.2, v3.9.3 and v3.9.4 into the review branch; the
only code conflict was the teleport in `game.js` (the prototype's warp effect,
and v3.9.3's `TELEPORT.PAST` in place of 84), and both are kept. The three
superseded branches can be deleted whenever the owner likes; nothing on them is
missing from `main`.

## v3.10, released 2026-10-29: the 3D prototype ships dark

The prototype below, merged into `main` behind its URL flags. With the flags off
the game draws exactly as v3.9.4 but for the 2D attack face, which now snarls
(checked by reading back 30 seeded frames, five from each arena, from both
versions in one browser: the attacker's face is the only difference), and the
page downloads nothing of the 3D path. `SIM_VERSION` stays 9.

What it took to make the 3D fighters fast enough on a phone is in Next steps,
step 1, and ARCHITECTURE section 7 ("The 3D layer"). In short: on the owner's
iPhone, copying each 3D fighter into the 2D canvas cost about 4 ms a frame, so
the fighters are now drawn straight onto a WebGL canvas stacked into the page,
0.7 ms. A pixel comparison of the two ways, frame by frame, then caught the
stage light blending with nothing (a haze over the picture) and the layers
shaking apart, both fixed before release. The hosted phone test ("UEC 3D Phone
Test", a private Claude artifact) times the two ways side by side and shows
either one frozen (`#look-copy`, `#look-layer`) for comparing by eye.

## v3.9.4, released 2026-10-28: the computer picks its moment

Measured first, with the harness this session kept (`lab/balance.js`, AI
against AI, 60 matches per ordered pair, seeds 11 and 12): at Champion, Elo won
17% and Carl 24%, and the move breakdowns said why. Carl's ASSET SEIZURE
touched nobody in 78% of throws (jumped, or thrown from out of its 96 px
reach) and Elo's PLATFORM BURN was parried 3.5 times a match (31% of throws),
each one a free combo for the rival. Under both sat reads the AI got wrong for
everyone. All of it is in `ai.js`, with its numbers in `config.js`; the AI is
single-player only, so `SIM_VERSION` stays 9.

- **A finished swing is not incoming.** `incoming()` ignored `hasHit` only, and
  a whiff never sets it, so the whole recovery of a missed swing read as a blow
  on its way and the AI guarded through it. It now stops at the end of the
  active window.
- **The guard comes down to punish.** A held guard presses nothing, and the AI
  held it for all of `blockT`, so after a block or a parry it stood behind it
  while the rival recovered or staggered. When the rival is open (below), the
  next decision drops it, gated at `blockProb + 0.25` like noticing a trap,
  and never while a projectile is coming or a coin is queued overhead.
- **Grabs and slow strikes wait** (`picksMoment`). A command normal that is a
  grab, or a strike or blast that starts no quicker than
  `AI_MOMENT.SLOW_STARTUP` (0.09 s: Carl's ASSET SEIZURE, Elo's PLATFORM BURN,
  Jeff's UNDERCUT), and the grab, area and BURN IT ALL specials, are thrown only
  in real reach (`inReach`, from the hitbox and hurtbox geometry, with the
  rival's knockback slide and the walls), a grab only at a rival who will be on
  the floor when it comes out (`downBy`), and then when the rival cannot answer
  (`rivalOpen`: grounded hitstun, recovering from a finished swing on the
  ground, and for a grab also a held guard or a counter stance; never a basic
  that made contact and can still cancel into the next), or else on the level's new
  `gamble` (Champion 0.18, Contender 0.8, Rookie 1.0). An open moment skips
  the personality's aggression roll. `moveFrames` mirrors how the engine
  builds the move's startup and reach, and a test builds every such move and
  compares.
- **Strings finish with the character's move** (`holdForChain`). For a fighter
  with one of those moves on the button the chain reflex presses, it holds
  forward when the move will reach and lets go when it will not. Nobody else's
  strings change. The chain's special after a kick is no longer pressed when a
  grab or blast would not reach the sliding rival.
- **Rain is read.** The projectile threat read treated every projectile as
  flying (a falling coin has no `vx`, so only coins to one side counted) and
  skipped any whose `delay` had counted down past zero, so of FUNDING ROUND's
  three coins only the first was ever seen. The guard through Cathie's
  recovery had been blocking the rest by accident.
- **Reviewed** by a second pass, which found three bugs, each now fixed with a
  test that fails without its fix:
  - The guard came down while the rival's projectile was still in flight, since
    a thrower recovering reads as open. Cathie's coins landed more often than on
    `main` (blocked 11.5 a match, hit 10.7; `main` 17.6 and 9.1). Now 18.9 and
    8.4. The coin read on its own is worth about one more block a match.
  - A basic that made contact (blocked counts) can cancel into the next basic
    for its whole recovery, so dropping the guard after blocking a jab ate the
    second one (up to 58 in 200 scripted strings for Elo; 0 to 2 on `main`).
  - A kick lifts the rival for about a tenth of a second, so Carl's string
    never ended in HOSTILE TAKEOVER after a kick, though it lands every time:
    the grab now asks whether the rival will be down by its first frame.
  - Also from the review: an attack thrown in the air never reads as open (it
    ends on landing), and the harness tallies coins and slides apart, counts a
    rush's flurry as one touch, and counts damage where it is dealt.
- **Measured** after the review's fixes (same harness, Champion, 60 per pair,
  seeds 11 and 12, `main` then this branch): Elo 17% to 29%, Carl 24% to 51%,
  Jeff 31% to 32%, Adam 50% to 44%, Kim 60% to 40%, Scam 64% to 62%, Cathie 64%
  to 62%, Steve 68% to 65%, Lizbeth 71% to 64%. Best to worst closed from 54
  points to 36. Kim's fall is her rivals punishing her missed swings instead of
  guarding them. At Contender (40 per pair, seed 11) Carl 50% to 58%, Jeff 45%
  to 34%, Kim 59% to 52%, the rest within about three; at Rookie everyone is
  within about four points of `main`. The `gamble` values were chosen by these
  runs: with Contender at 0.35, Jeff fell to 26% there.
- **Tests**: `test/moment.test.js`, 15 tests; each that guards a fix fails
  without it (checked by reverting each fix).


## v3.9.3, released 2026-10-26: the AI reads traps

Built on its own branch from v3.9.1 and merged onto v3.9.2 on the train. The same blind spot the delivery had: the AI
never looked at `game.traps`, so every rival at every difficulty walked straight
onto Kim's RUG PULL (and a built founder's POISON PILL). All of it is in `ai.js`;
the AI is single-player only, so this branch changes nothing a live match
computes and leaves `SIM_VERSION` at whatever `main` has (8 now, 9 once the throw
fix is in). `VERSION` is v3.9.3 and the README has its section.

The throw fix (v3.9.2, `SIM_VERSION` 9) was under it on `claude/release-train`,
and the two shipped together as v3.9.3.

- **Noticing** is rolled in `decide()` the way an order is: each decision while a
  trap is close enough to step onto before the next one, at `blockProb + 0.25`,
  held for that trap once it succeeds (`seenTraps`).
- **The fence** (`fenceTraps`, per frame in `update()`) stops a walk at a noticed
  trap's edge, or turns it into a jump when the jump lands clear on the far side
  and the rival is out there; it drops a dash that would cross one, steers a
  jump's drift to land clear, and holds back an air attack that would drop the
  body onto one. Most of the roster cannot jump RUG PULL from its edge (a jump
  carries 120 to 160 px; the trap denies about 160), so most of the time the AI
  fights from the edge and the trap runs out.
- **Inside one that is still arming** (laid point-blank, which a human Kim can
  do), `leaveTrap` walks it out, jumps it out, or blocks when a wall or the rival
  is in the way, since a blocked bite is chip.
- **Moves that carry the body count as steps**: the chain reflex finishes with a
  kick instead of a slap or jab (those step in `COMBO.STEP_IN`, moved into
  `config.js` from a literal in `fighter.js`, same value), and a rush or teleport
  that would set the body down on a noticed trap is not thrown.
- **Measured**: in fixed scenarios (8 rivals, 20 seeds each), walking at an armed
  trap with Kim beyond it, Champion is bitten 0 times in 160 (was 134), Contender
  7 (138), Rookie 53 (138). Caught inside an arming trap: Champion 8 in 160 (was
  160). Over the whole roster, AI against AI, both at the same level, 80 matches
  per ordered pair: Kim at Champion went from 75.1% to 70.3% (the two halves read
  71.6% and 69.1%), still the top Champion; Contender 66.1% to 62.3%, Rookie 40.9%
  to 37.0%. Nobody else moved more than about two points at any level. Rivals now
  take 1.26 trap bites a match at Champion, down from 2.48, and most of what is
  left is Kim's own combos knocking them onto a fresh trap, which is the move
  working. (Those figures are from the branch as first built, on v3.9.)
- **Reviewed** by a second pass, which found four gaps, each now fixed with a test
  that fails without its fix:
  - A teleport or rush only checked traps already noticed, and a walk only notices
    nearby ones, so Lizbeth teleported onto RUG PULL behind Kim 19 times in 20.
    A long move now looks along its path first (one noticing roll per trap,
    `lookedAt`), and the README's "stops rushes, teleports" is true.
  - Laying a trap swings nothing, so it never sets `hasHit`, and the threat
    response blocked the laying: a champion stood guarding in the trap through
    the arming time. `incoming()` leaves trap-laying out, the AI steps back from a
    trap being laid, and walking out drops any guard. Over 160 point-blank layings
    that turned 62 chip bites into clean escapes; full bites stayed about 40, from
    specials the AI had committed before Kim pressed.
  - Air steering judged a landing past a wall as clear; it is clamped to the
    stage now (`onStage`).
  - A jump judged only the trap, not the rival: one that met Kim in the air
    stopped against her (`pushApart` works in the air under 120 px apart) and fell
    onto the trap. Every jump now checks where it comes to rest, treating the
    rival's body as a wall (`restsAt`), including jump-ins `decide()` chooses.
  - The teleport distance and the push gap are now `TELEPORT.PAST` and
    `PHYS.PUSH_GAP` in `config.js`, read by both `game.js` and `ai.js` (same
    values, so no simulation change).
- **Measured on the train** (20 matches per ordered pair, seeded, AI against AI at
  the same level): Kim at Champion 75% on `main`, 66% with the trap AI as built,
  63% with the review's fixes; Contender 63%, 62%, 60%. Trap bites a match at
  Champion 0.54, 0.28, 0.24. Nobody else moved more than about two points.

## v3.9, released 2026-10-25

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

Released as a fast-forward of `main` and checked with the `curl` check in
ONBOARDING section 7. Live play needs both players on v3.9 or later (`SIM_VERSION`
8); v3.9.1 changes nothing the simulation computes.

## v3.9.2, released with v3.9.3: a throw goes behind the thrower

- **The bug**, there since v1.0. `Game.doGrab` promises "thrown behind the
  attacker, sides swap" and applied the throw's sign twice: `kb: -dir * sp.kb`
  with `dir: -dir`, and `applyHit` sets `vx = dir * kb`, so the victim's `vx` was
  `+sp.kb` whichever side they started on. Thrown from the thrower's left they
  swapped as promised; thrown from the right they landed back where they started,
  and the thrower was shoved about 21 px backward as `pushApart` separated the
  bodies. Found by the trap-AI session: Carl kept landing on Kim's RUG PULL off
  his own throws.
- **The fix** is `kb: sp.kb`; `applyHit` applies the sign. With Carl at x 600,
  Kim thrown from 520 lands at 700 with Carl at 579, as before; thrown from 680
  she now lands at 500 with Carl at 621 (was 700 and 579). Carl gives up those
  21 px forward, into the space she left.
- **The corner.** The victim used to be set down on the thrower's x, so the side
  came from their first frame of flight. With the thrower flush against a wall
  (x is clamped there, which is where a cornered fighter stands) there was no
  room for that, both bodies shared one x, and `pushApart` broke the tie by slot:
  as p1 Carl threw out of the right corner but not the left, as p2 the reverse.
  Now the victim is set down `THROW.BEHIND` (1 px, `config.js`) behind the
  thrower, and a thrower with less room than that steps forward to make it. A
  cornered throw always swaps: Kim goes into the corner and Carl comes out to
  51 px from the wall, from either wall and either slot. Mid-stage, landings move
  by half a pixel.
- **Tests.** `test/throw.test.js` throws both grabs (HOSTILE TAKEOVER and ASSET
  SEIZURE) from both sides and both player slots mid-stage, and again with Carl
  flush against each wall. Each half fails without its fix.
- **Other callers checked.** Every other `applyHit` (a normal hit, a steal, a
  counter's payback) and every direct knockback in `game.js` applies its sign once
  and pushes away from the attacker or the owner. The shield branch at the top of
  `doGrab` has no double sign either, but it pushes the shielded victim toward the
  grabber; see the owner decisions.
- **A throw that KOs** now sends the loser the way they were thrown. `doKO` takes
  its direction from `sign(loser.x - winner.x) || 1`, and with the victim set down
  on the thrower's own x that sign was 0, so every KO by a throw flung the loser
  right. Found in review; covered by the same bump. Still cosmetic: on a cornered
  KO the two bodies end 1 px apart, because `pushApart` stops once anyone is KO'd.
- **`SIM_VERSION` 9**, not 8: `origin/main` already ships 8 in v3.9 and v3.9.1,
  so a v8 peer exists, and it puts a victim thrown from the right on the other
  side from the first such throw. `VERSION` is v3.9.2 and the README has its
  section.
- **Measured** with the trap-AI session's harness (AI against AI at Champion, 160
  matches per ordered pair over four seed bases), both fixes together: Carl 25.8%
  to 23.9% (the first 80 per pair read 25.5 to 22.0, the second 26.1 to 25.9, so
  within the noise to about two points down); Lizbeth 65.9% to 65.9%; nobody else
  moved more than about a point. Every match without Carl is identical, since
  nobody else on the roster has a grab (a built founder can: HOSTILE TAKEOVER is a
  player special, the Closer and Chief bases default to it, and the fix covers
  them the same way). In Carl's matches, 1.3 s after a throw the victim is on
  the other side 65% of the time (was 21%; the rest have moved by then), Carl
  stands more than 5 px behind where he threw from after 3% of throws (was 64%),
  and he is still in a corner after 1% (was 3%). The fighter who lands the next
  hit after a throw did not change (Carl 12%, the victim 39%).
- **With the trap AI.** Both were on `claude/release-train`, the trap AI merged
  on top, and shipped together; the README has a section for each (v3.9.3 above
  v3.9.2).

## The 3D prototype (in `main` since v3.10)

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

Screenshots (from October 2026, in `docs/images/live-3d/`):
`stages.jpg` (each arena as shipped and as rendered), `portraits.jpg`,
`effects.jpg`, `signatures.jpg` (photo face, horn, each special's look) and
`lighting.jpg` (stage light and the KO shot).

Measured on an M2 Max in a live AI match at 60 fps, whole-frame render time:
1.73 ms with both fighters in 2D and 1.93 ms with both in 3D; with sharp
fighters, 1.98 ms and 2.07 ms. The stages and effects measured within
run-to-run noise. Readability with 3D fighters on rendered stages
(`lab/contrast.js`): 31.6% of a fighter lost against its stage, against 33.2%
with the procedural arenas.

### What merging it changed for players

With the flags off, one thing: the 2D attack face. It used to grin through every
attack (a curve with its signs flipped); it now snarls, as it was always meant
to. Everything else with the flags off renders exactly as v3.8, checked by
hashing game frames on all six arenas and every 2D portrait in the same
browser. It adds about 4.6 MB to the repo (the 1.3 MB model, 1.8 MB of stages with
their depth layers, and 1.5 MB of screenshots), and the game only downloads the model and stages
when `?gl` is on.

Merged as v3.10. `SIM_VERSION` did not change: nothing the simulation computes
is different (`game.simT` is new, but it is not hashed and the simulation does
not read it), which the determinism and effects tests check.

## Decisions that belong to the owner

0. **Delete the superseded branches** (`live-3d`,
   `claude/game-review-enhance-29bffb`, `claude/gfx-v3.9.4`), or keep them as
   history. Settled on 2026-10-29: the prototype merged into `main` as v3.10,
   dark, after the phone check. (Also settled on 2026-10-28: the owner set
   Supabase's Site URL and Redirect URLs to the new address.)
1. **Whether 3D becomes the default.** It runs well on the owner's iPhone; a
   mid-range phone is the remaining check (Next steps, step 1). The 2D rig has to
   stay either way: it is the fallback without WebGL2 and when the GPU context is
   lost.
2. **The aura in front.** On the 3D layer an aura drawn by the fighter in front
   (Unicorn Mode's glow, a stance ring) no longer washes over a 3D fighter
   behind it, as it did when everything was painted onto one canvas. It reads
   cleaner, and matching the old look would mean drawing auras in WebGL. Keep it,
   or ask for the old look.
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
7. **Balance as the AI plays it.** v3.9.4 lifted Elo and Carl at Champion (see
   its section). Jeff (31%) and Elo (29%) are now the bottom, Steve and Lizbeth
   (about 66%) the top, and Adam still wins over 80% at Contender and Rookie.
   `lab/balance.js` measures it; it measures how well the AI plays each kit as
   much as the kits themselves.
8. **What a shield does to a throw.** When LEGAL SHIELD absorbs a grab, `doGrab`
   sends the victim toward the grabber (`def.vx = -dir * 220`) while the grabber
   recoils (`att.vx = -dir * 160`), so both slide the same way and end touching:
   Kim 60 px from Carl ends 51 px away, the minimum body gap. The other two
   OBJECTIONs (on a strike and on a steal) push the victim away. It reads like a
   slip of sign, but it may have been meant to let the victim punish a grabber
   stuck in a long recovery. Flipping it is one sign, but it changes what a live
   match computes, so it needs `SIM_VERSION` 10; left as it is.

## Next steps, in the order they pay off

Done in the 2026-10-18 session (on `claude/game-review-enhance-29bffb`): depth for
the stages (step 3 below), secondary motion (step 4), the back-light streak and
per-move impact variations (step 5). Their notes are kept so the history reads.

1. **Phone benchmark.** A hosted copy of the benchmark, needing no server or
   network setup, was published on 2026-10-28 as a private Claude artifact
   ("UEC 3D Phone Test", from `claude/gfx-v3.9.4`): it times four setups (the
   shipped 2D game, 2D fighters on the rendered stage, one fighter in 3D, both in
   3D) for ten seconds each, reports the 3D rig's cost against the 2 ms budget,
   and has a Copy results button. The artifact host serves no `.glb`, so that copy
   carries the model as a base64 script module and answers the renderer's fetch
   from memory; nothing in the repository changed for it. On the M2 Max in Chrome
   it reads 120 fps in every setup, the rig adding 0.42 ms a frame on average and
   0.10 ms at the 95th percentile, the whole prototype 0.50 ms at the 95th.
   **First phone run, 2026-10-28**, the owner's iPhone (iOS 18.7, in the Claude
   app, a 402 by 874 point screen, so a recent and fast model, not the mid-range
   phone the budget is set for): 60 fps in every setup, so nothing visibly drops,
   but the 3D rig adds 3.97 ms a frame on average and 5 ms at the 95th
   percentile, against a 2 ms budget. WebKit rounds `performance.now()` to 1 ms,
   so the 95th percentiles are whole numbers; the averages over 600 frames hold.
   One fighter in 3D cost the same as two (4.58 and 4.57 ms a frame), so the
   cost is fixed per frame rather than per model: it points at getting the WebGL
   image into the 2D canvas (`render3D`'s `drawImage` of the GL canvas, which
   WebKit has to synchronise), the first lever below, not at the meshes.
   **Second and third runs, same phone.** The breakdown (each step timed with
   `gl.finish`): pose 0.10 ms, GPU 0.68 ms, copy into the 2D canvas 1.52 ms per
   3D fighter, so the copy is two thirds of it. `GL3D.COMPOSITE` then tried three
   ways of making that copy in one run, against the 2D fighters before and after
   (0.59 ms both times, so no warming drift): the canvas as built 3.77 ms a frame
   over 2D, the canvas without a preserved buffer 3.88, an ImageBitmap from an
   OffscreenCanvas 3.98. No difference, so the price is moving the GPU's image
   into a 2D canvas at all (in WebKit that reads it back), not the way it is
   handed over. Lowering `DETAIL` or meshes would save part of 0.68 ms at most.
   What is left is to stop putting the 3D image in a 2D canvas: show the WebGL
   canvas itself, stacked between a 2D canvas for the world behind the fighters
   and one for what is drawn in front, with the key line drawn in GL (the
   silhouette pass is most of it already). The owner chose to build it.
   **Fourth run, 2026-10-28: the 3D layer.** With `GL3D.LAYER` the 3D fighters
   are drawn straight onto a WebGL canvas stacked over the game canvas, nothing
   copied (ARCHITECTURE section 7, "The 3D layer"). Same phone, same match, both
   fighters in 3D: copied as before, 3.49 ms a frame over 2D; on the layer,
   0.80 ms (mean frame time 1.42 ms, 2.00 ms at the 95th percentile, 59.9 fps).
   That is inside the 2 ms budget on this phone. A frozen-frame comparison of the
   two paths afterwards found the first build drew the stage light's soft-light
   gradient on its own canvas, where it came out as a pale haze, and moved the
   layers by different shake offsets; both are fixed and pinned by
   `test/layer3d.test.js`. **Fifth run, 2026-10-29**, after that fix, which
   adds canvases (trails, glow, vignette, cut-in) for the browser to composite:
   0.70 ms a frame over 2D on the layer (mean frame 1.23 ms, 2.00 ms at the 95th
   percentile, 60.3 fps), against 3.95 ms copied, with 2D at 0.61 and 0.46 ms
   before and after. The added canvases cost nothing measurable. **Next:** the
   same hosted test on a mid-range phone (an Android phone or an iPhone several
   years old), which the budget is set for. Or, as before: from a checkout of
   `main`, serve with `python3 dev-server.py 4173`, open
   `http://<the machine's LAN address>:4173/lab/gl3d-bench.html` on a mid-range
   phone (no sign-in needed), and read the modes: All 2D, Both 3D, without stage,
   without effects. The budget is about 2 ms a frame for the 3D rig over 2D. If
   it is over, the known levers are a leaner composite (draw the key line in GL
   and skip the copy into the 2D buffer), a lower `DETAIL` in
   `build_founder.py`, and fewer meshes per fighter.
2. **The merge decision.** Done: v3.10.
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

- Phone performance: measured only on the owner's iPhone, a recent and fast
  model (see Next steps, step 1). A mid-range phone, which the 2 ms budget is set
  for, is still unmeasured.
- The 3D layer differs from the copy path in three small ways: an aura drawn by
  the fighter in front does not wash over a 3D fighter behind it, every trail
  lies over every 3D fighter, and 3D edges are crisper (ARCHITECTURE section 7).
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
The repository is now `https://github.com/Aurmada/uec-ultimate-entrepreneur-challenge`;
a clone that still names the old one works through GitHub's redirect, and
`git remote set-url origin https://github.com/Aurmada/uec-ultimate-entrepreneur-challenge.git`
points it at the new one.

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
messages on the prototype's branches, now merged into `main`, explain each step
of it and what was measured.
