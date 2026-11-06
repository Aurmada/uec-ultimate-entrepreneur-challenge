# UEC handoff: where things stand (early November 2026)

Written so the work can continue from a fresh clone, in a cloud session or on a
new machine, with nothing from the machine it was built on. Read `CLAUDE.md`
first for the standing rules, then this, then `docs/ONBOARDING.md`.

## In one paragraph

The game is live at v3.17 on GitHub Pages
(`https://aurmada.github.io/uec-ultimate-entrepreneur-challenge/`), released
on 2026-11-05: 3D by default, the nine founders the sculpted cast below, each
in their own fighting form for everything they do (every move, special and
reaction, how they move, start a round and go into their super), and 2D a
choice in Settings (see "v3.17" back to "v3.13"). v3.17 also fixed the dash
(`SIM_VERSION` 10). v3.12 was built on 2026-10-30 but never reached `main`; it went
out with v3.13. The repository
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
| `main` | The live game, v3.17 (`SIM_VERSION` 10): 3D by default with the sculpted cast, 2D in Settings | Deployed. A push here is a release. 553 tests pass. |
| `claude/jeff-model` | The remodel of the cast and everything after it, released through v3.17, plus the work after it (below: knockout falls, juggles, ROUND and FIGHT! moved up in 3D, Adam's super, the review fixes, the game designers' animation and flow fixes, nine distinct faces) | v3.17 merged into `main` on 2026-11-05; the rest is pushed to this branch but not released, for the owner to review. 579 tests pass. |
| `claude/guard-pass` | v3.12 plus the guard pass below: every fighter in a fighting stance, 2D and 3D | Released in v3.13. |
| `claude/figure-pass` | `claude/guard-pass` plus the figure below (`?figure`) and the new 3D bodies (`?gl&athlete`) | Released in v3.13, both still behind their flags. |
| `claude/gfx-v3.9.4` | The branch v3.10 merged: the review branch below, `main` to v3.9.4, and the 3D layer | Merged into `main`. |
| `claude/game-review-enhance-29bffb` | `live-3d` plus v3.9 and the prototype's leftovers, with `main` to v3.9.1 | Superseded: all of it is in `main`. |
| `live-3d` | v3.8 plus the 3D prototype and one 2D bug fix | Superseded: all of it is in `main`. |

`claude/gfx-v3.9.4` merged v3.9.2, v3.9.3 and v3.9.4 into the review branch; the
only code conflict was the teleport in `game.js` (the prototype's warp effect,
and v3.9.3's `TELEPORT.PAST` in place of 84), and both are kept. The three
superseded branches can be deleted whenever the owner likes; nothing on them is
missing from `main`.

## The guard pass (2026-10-30, on `claude/guard-pass`, not released)

The owner's priority after v3.12: the fighters' limbs looked awkwardly placed,
and the genre (the big arcade fighters, as inspiration only) should be the
model. The poses had been authored across several rig eras and were
personality poses rather than fighting stances: arms hanging or folded or on
the hips, a rear hand hidden inside the torso, Kim's fists over her face, feet
that crossed on every step, and in 3D a two-fisted flex on every jump and punch.
Render-only throughout: no simulation, hitbox or `SIM_VERSION` change.

- **Everyone stands in a guard**, and keeps their personality inside it: a
  fencer's guard (Lizbeth), a brawler's low fists (Adam), a presenting hand
  (Steve), a peek-a-boo (Kim), a tai chi ready stance (Cathie), a wrestler's
  reach (Carl), a shoulder roll (Elo), a karate chamber (Jeff), and the open
  palm with a hand in the pocket (Scam). `REST` is a guard too, for the base
  characters. The five style stances are one table, `STANCES` in
  `drawFighter.js`.
- **The guard goes everywhere**: walk (now a shuffle that never crosses the
  feet), crouch, jump (knees tucked), dash and block carry the fighter's own
  hands, so a held prop (Cathie's tablet, Jeff's parcel) stays where its owner
  holds it instead of rising over the face.
- **Attacks thrown from it**: the four basic tracks are rebuilt from the guard.
  The punch cocks at the chest and turns out from the hips, the kick chambers
  the knee, the uppercut rises from a crouch, and the rear fist stays at the
  chin through every swing. A swing eases out of the fighter's own guard and
  back into it. Keys now carry forward what earlier keys set (a hold used to
  snap the squash and the guard hand home on the first frame of the recovery),
  and reach scales about where the hitbox starts, so a zoner's jab still looks
  longer than a grappler's with the hand at the chin.
- **3D**: planted feet lie flat instead of tipping onto the toes when the knee
  bends (crouched fighters looked mid-jump), and the legs scale with `stride`
  and carry a little slack (`GL3D.LEG_SLACK`), so every fighter's knees bend
  alike.
- `test/guard.test.js` pins the intent (no fist or held prop over a face, the
  guard carried into walk and crouch, feet never crossing, the rear fist home,
  no pops between keys, flat feet, even knees); each test fails on `main`.

With the flags off this deliberately changes how every fighter looks, so
`lab/pixels.js` reports every frame different from v3.12. It needs the owner's
eye, then a `VERSION` bump, before release. Next in the same direction, as the
owner set it out: animations, then fighting styles, then controls.

## The figure (2026-10-30, on `claude/figure-pass`, behind `?figure`, not released)

The owner's next note, with the guard pass in hand: the characters still did
not look fully formed next to the arcade fighters' character sheets. The poses
were not the problem any more; the drawing was. The 2D rig drew a limb as two
round strokes with no fixed length and a guessed elbow, a torso narrower than
the head, no neck, a ball for a fist, a slab for a foot, and a front-on face
painted on a ball over a body seen from the side.

`src/engine/figure.js` draws the same pose as a body instead, with every
number in `FIGURE` (`config.js`):

- **A skeleton with bones.** Arms and legs have a length and bend at an elbow
  and a knee solved by two-bone IK (elbows hang down, knees point at the
  opponent). An arm reaching out locks straight, so a punch lands on a
  straight arm whatever the fighter's shoulders and lean do to the distance,
  and the guard keeps its bend.
- **Proportions.** The hip rides 12% higher (`FIGURE.LEGS`), so the legs are
  about half the fighter instead of 42%, and the head sits on a neck instead of
  sinking into the collar. Head-anchored parts (Kim's ring light) follow it.
- **Forms.** A 3/4 torso with chest, waist and hips; deltoids; muscle-shaped
  arm and leg segments; trousers that hang straight below the knee; squared
  fists with knuckles and a thumb, an open hand for the slap; shoes with a
  heel, a sole and laces.
- **A 3/4 head**: brow, nose, lips and chin standing proud of the skull, an ear,
  the near eye full and the far one foreshortened. Every face knob each
  fighter already has is used. Hair and hats are the tube rig's own, kept off
  the face; glasses, shades, the visor and facial hair are redrawn for 3/4.
  Photo founders keep the photo face.
- **Light.** Every form has a lit side and a shadow side, cut hard and
  multiplied so detail survives, violet on cloth and red on skin.
- **Builds.** Each roster fighter has a render-only `figure` entry in
  `fighters.js`: Jeff the gym rat, Carl's paunch and bull neck, Scam soft all
  over, Kim narrow-waisted, Steve rake thin, and so on.

It is 2D only (the 3D path draws its model as before) and off by default:
`?figure` turns it on, and `lab/pixels.js` reports the flags-off game
identical to `claude/guard-pass`. Lab sheets: `lab/figure-sheet.js` (`sheet`,
`looks` for every profile look, `bench`). In headless Chromium, which draws in
software, the figure's shapes cost about 2.2 ms a fighter against the tube's
0.7 ms (2.8 before the shading stopped clipping each segment), and a whole
frame, stage included, about 8% more. It needs a real phone before it could be
the default: `?figure&perf` shows the 2D draw time in the game, and the review
page shows each renderer's frame time on whatever device opens it. `test/figure.test.js` pins bone
lengths, the straight punch and bent guard, legs at half the height, the neck,
and builds that show; each fails without its part.

Decided on 2026-10-30, after watching both side by side in a live match: the
head stays the size it is (`FIGURE.HEAD` 0.94, "head A"). The smaller, more
heroic head was tried (`sheet({ tweak: { HEAD: 0.8 } })` still shows it) and
not taken. Still open for the owner: whether this becomes the default renderer.

## The athlete bodies (2026-10-30, on `claude/figure-pass`, behind `?gl&athlete`)

The owner asked why the bodies could not be more complicated and realistic,
and picked the 3D route of three (push the 2D drawing further; better 3D
bodies; sprites pre-rendered from 3D): a 3D body bends at its joints instead of
being redrawn, so anatomy stays right in every pose, and the 3D layer is
already cheap on his iPhone.

`lab/blender/build_founder.py` now also builds `assets/models/athlete.glb`
(`-- <out> athlete`) and `athlete-f.glb` (`-- <out> athlete-f`, the women's
frame). Same skeleton, same head and face, same named meshes and palette roles
as `founder.glb`, so every look, outfit and prop still fits (`test/athlete.test.js`
holds that). What changes is the body: metaball muscles (pectorals, deltoids,
traps, lats over a narrower waist, biceps, triceps and a forearm that swells
below the elbow, glutes, quads and hamstrings), bigger fists with knuckles,
and clothes built from the same muscles grown by a pad per outfit, so a tee
shows the chest and arms, tailoring softens them and a puffer hides them.
About 3.5 times the founder's triangles (a fighter in a tee: about 32,000
against 9,000) and 3.3 MB a model against 1.3 MB.

`?gl&athlete` puts every fighter without a model of their own in the athlete
body for their frame (`athleteFor` in `models3d.js`: the women's frame for a
fighter whose 2D figure uses it), and an athlete stands on the 2D figure's
longer legs (`figureFrame`). Off by default; `lab/pixels.js` reports both the
flags-off game and `--flags gl` identical to `claude/guard-pass`. Lab sheets:
`lab/figure3d.js` (`sheet` and `cast`, through the match renderer at any size).

Blender is not needed as an app: `pip install bpy` (5.1.2 was used) runs the
script as `python lab/blender/build_founder.py -- <out.glb> [athlete]`, and it
rebuilds `founder.glb` identically apart from the exporter's version string.

**A body of their own** (same day). The owner liked the athlete body and
asked for what the arcade fighters have: every character unique in many ways.
The first of those ways is the silhouette, so each roster fighter now has
their own model, `assets/models/cast/<id>.glb`, built by
`lab/blender/build_cast.mjs` (it runs `build_founder.py` once per fighter):

- their build from the same `figure` numbers the 2D figure draws (`muscle`,
  `chest`, `waist`, `belly`, `hips`, `neck`, `frame`), pushed wide on purpose,
  since a subtle difference is no difference at game size;
- the cut of their clothes, `figure.costume`: how close the top and sleeves
  sit (`tight`, `regular`, `oversized`), how far the top hangs past the hips,
  and the trousers (`skinny`, `suit`, `baggy`, `flared`);
- only the pieces they wear (`piecesFor` in `models3d.js`), about 1 MB each.

Jeff is huge through the chest and arms with tight sleeves, Carl short and
barrel-chested with a paunch and a bull neck, Adam big in an oversized hoodie
and baggy trousers, Steve rake thin in fitted clothes, Scam soft with a belly
in a baggy henley, Kim small with a narrow waist and flared trousers. With
`?gl&athlete` a roster fighter wears their own model and a player's founder the
athlete body for their frame; each is fetched the first time it is worn, so a
fighter can show in 2D for a moment at the start of a match until theirs
arrives. `test/athlete.test.js` checks each model carries exactly what its
fighter wears and that no two share a build; both fail with one shared body.

Next for uniqueness, as the owner set the direction: their own heads and faces
(the face is still projected onto today's round head), signature costume
pieces, then how each one moves.

## Jeff, remodelled from scratch (2026-11-01, on `claude/jeff-model`, in progress)

Two routes before this were turned down by the owner. Better 3D bodies built
from metaballs read as "bulky, chunky": every form blended into its
neighbours, so an arm was a sausage the same thickness from shoulder to wrist,
and the live 3D also draws every limb 40% thicker (`GL3D.ARM_GIRTH` and
friends). Pre-rendering those same bodies in Blender (`claude/blender-sprites`,
2026-10-31) changed nothing, since the shapes were the problem. So the owner
asked to start again, one character at a time, beginning with Jeff, to the
heroic proportions of the modern arcade fighters.

`lab/blender/sculpt.py` sculpts in a signed distance field: masses blended
broadly for the silhouette, then definition carved in as shallow grooves that
follow the surface (`Field.groove`), so muscles read without standing proud as
bubbles, then meshed with surface nets. Jeff's body (7.5 heads, tapered
limbs, fists) was `lab/blender/sculpt_jeff.py`, now the roster pipeline
(below), and `lab/blender/clay.py` renders clay views. Stages, each shown to the owner
before the next: the body; the face (an original design, not a likeness); the
hands; the costume; then rigging and into the game on the same skeleton.

Where it stands. The owner preferred him drawn by the game's own renderer to
the Blender render, so he is rigged (`--rig`, `assets/models/sculpt/bozo.glb`)
and registered as `sculpt:bozo` in `models3d.js`, used only by the lab sheets
(`lab/figure3d.js`). Its `fit` lets a body built to its own size keep its own
torso, neck and head, lean over bent knees, and nod at most `fit.nod`, all
render only. Owner feedback so far: the neck and head were not humanly possible
and the back not straight (fixed in `4d885c7`), then "his neck and shoulder
looks off" (fixed next: the deltoids were balls sitting above the traps, the
traps were weighted to the neck and arms so they lumped with every move, the
jaw melted into the neck, and the head jutted on a punch).

Then: "boxers guard their face", and a punch is thrown by turning the upper
body into it; each character can have their own fighting form, and Jeff's is
boxing. `src/data/forms.js` holds fighting forms, render only: a form brings
its own guard, motion and attack tracks in place of the fighter's own
(`computePose(f, t, form)`), and can turn the shoulders and hips through a
move (`twist`, `hipTwist`, new pose channels only the 3D rig reads), bring the
fists in to guard the face (`handDepth`) and keep the rear fist at the chin as
the body turns (`guardTurn`). A form belongs to a model for now
(`models3d.js` `form`, read through `gl3d` `form3D`), so the 2D Jeff keeps his
karate stance and the parcel under his arm; moving `form` onto the fighter
would give the 2D game the same boxing, and is the owner's call. Boxing so
far: the guard (idle, walk, crouch, jump), a shell block, and a lead straight
loaded and turned through the hips and shoulders, the rear fist home
throughout. Kicks, the uppercut and the slap still use the shared tracks.
`test/forms.test.js`.

An independent review of the body (2026-11-01), worst first: the legs and
forearms were too small for the upper body (thighs no wider than the head);
the neck reads long from the side and the back was a smooth slab; the pec
rounded into a hanging lobe when the arm moved, with a dark hollow under the
armpit when the chest turned to the camera; the belly crumpled on a twist and
the carved abs broke into chips through the toon bands. The body pass that
followed: thighs about 1.2 heads wide with an outer sweep, fuller calves and
forearms, the thighs parted below the crotch (fused to mid-thigh, they tore
when the legs moved); the spine, shoulder blades and lat edges carved into the
back; the pec running on into the arm as the front fold of the armpit; softer
ab lines; and the skin under the shorts removed (`hide_under_shorts`), which
was what showed through them as patches when the waist turned. Still to do:
the neck from the side, and the arms stretching a little at full punch.

The face (2026-11-01): an original design built to his character notes (hard
flat brows, narrow eyes, a wide set jaw), never a likeness. The forms are
sculpted (a heavy level brow, deep-set eyes under heavy lids, cheekbones, a
broad straight nose, firm lips, a square chin and wide jaw). The eyes, brow
hair and mouth are painted on in game, one cell per expression as the founder's
face is, but by a painter drawn for sculpted heads (`src/engine/gl3d/faces3d.js`,
to the model's `face.layout`): the 2D face's layout puts the mouth
just under mid-head and cannot sit on a sculpted brow and mouth. Strokes are
bold on purpose, so the face still reads on a 26 px head in a match. The
owner: "the face is going in the right direction". Then a polish: a confident
squint, a catchlight and a smirk at rest (he looked tired), the eye hollows
moved up under the brow (they read as bags), a squarer chin (a ball in
profile), and his rear guard fist lowered to the jaw so the game's camera
sees his mouth.

His shades (the owner: keep them, on all the time): a mesh of their own,
`eyewear:shades` (worn because his accessory is shades), two wraparound
lenses on a bar across the brow, a bridge and arms back to the ears, weighted
wholly to the head and built in their own fine field (`shades()` in
fighter3d.py, placed by `eyewear()` in `fighters/bozo.py`). The lenses are dark glass (`glass: { lens: 0.84 }`) his
painted eyes show faintly through, as in 2D, and the bar sits under the
painted brows, so his brows and mouth still carry his expression.

His clothes (the owner: clothes, and bare fists): his outfit from the 2D game
(`outfit: 'vest'`), a fitted white shirt with long sleeves tucked in, a teal
quilted vest open down the front with a standing collar, suit trousers and
shoes, replacing the fight shorts. Each is the body's own surface pushed out
and cut to its edges (`shirt()`, `vest()`, `trousers()`, `shoes()` in
fighter3d.py), in his palette's roles (`suit`, `pants`, `shoe`; the shirt
white is the 2D outfit's own). The trouser legs fall straight from the thigh,
each leg its own with a slot between them below the crotch: blended, they
webbed together and tore into black spikes as the legs moved. The skin the
clothes cover is removed (`hidden`), all of it below the waist, so none shows
through. `test/sculpt3d.test.js`.
`lab/figure3d.js` `faces()` draws every expression close up (`focus` on
`renderFull3D` frames one part of a fighter). `test/faces3d.test.js`.

### The roster pipeline (2026-11-01)

The cast's names here are the ids in `data/fighters.js`; in the game they are
Adam (`max`), Steve (`kai`), Carl (`dex`), Elo, Jeff (`bozo`), Scam, Lizbeth
(`ava`), Kim (`zara`) and Cathie (`eleanor`).


The owner: Jeff is the character "to build all the existing ones and improve
them". So his build is now one pipeline for the whole cast, and Jeff is its
first fighter, coming out of it byte for byte as he was (the same field, the
same model file, the same painted face, call for call):

- `lab/blender/fighter3d.py -- <id> --rig` builds `assets/models/sculpt/<id>.glb`
  (`--views <dir>` for clay). The body is the pipeline's, scaled by the
  fighter's own knobs read from the game (`Build`: `figure.muscle`, `chest`,
  `waist`, `belly`, `neck`, `body.shoulders`). Jeff's knobs are the reference,
  so his factors are all exactly 1; each knob moves only part of the way its
  ratio says, since the 2D knobs are drawn exaggerated. A softer build is
  carved shallower. Clothes come from the fighter's `outfit` (`OUTFITS`, so
  far Jeff's `vest`, Adam's `hoodie` and Carl's `pinstripe`), in their
  palette; rig, weights and export are shared.
- `lab/blender/fighters/<id>.py` holds what is the fighter's alone: their head
  (`head`), its carved lines (`head_definition`) and their eyewear, an
  original face built to their character notes.
- `models3d.js` registers each as `sculpt:<id>` from `SCULPTED`: what every
  sculpted model shares, plus each one's leaf bones, joints' width, face
  centre, face `layout` (where the eyes, brow ridge and lips are on that head,
  in the painter's px) and form. Lab sheets name it `'sculpted'`.
- The face painter is shared: the layout says where the features are, and the
  fighter's own 2D face values (`LID_Y`, `PUPIL_R`, `BROW_W`, `BROW_TILT`,
  `MOUTH_CURVE`) say how they are drawn, pinned on Jeff's (`FACE_REF`), so
  another fighter's narrowed eyes, scowl or stare carry over from 2D.

The men of the cast in clay through it, each from his own knobs
(`fighter3d.py -- --cast <dir> max kai dex elo scam`; a fighter with no
design yet gets a plain placeholder head): Jeff the gym rat, Max broad and
athletic, Kai slim, Dex and Scam with a gut, Elo with a little one. The
trunk is sized by a girth map over its height (`Build.girth`: the hips as
Jeff's, the waist's factor over the belly, the chest's over the ribcage), so
a narrower chest brings its pecs, armpits and lats in with it: sized one mass
at a time, they stood off it in ridges. Less muscle thins the limbs' cores as
well as the muscle on them, carves the definition shallower and tighter, and
a belly hides the abs. All of it is exactly 1 for Jeff, whose field is checked
bit for bit after every change.

Each fighter is built to their own size (`Frame`), as the game draws them:
legs as long as their `stride` makes them, the trunk by `height`, the head
by `head` and their size together (as the 2D head is sized for the body under
it), every width by their size and `build`, and the neck as long as the head
makes it and as thick as the trunk (lengthened with the trunk, a tall
fighter's neck became a stalk). The body is built in Jeff's space and the
finished meshes and joints are warped to theirs, so no part of the build has
to know. The game's rig draws a sculpt's own trunk and head but scales its
legs by the stride, so a sculpt records how long its legs are built
(`fit.legs`, against Jeff's) and the rig scales only the rest. `--rig` prints
the numbers its `SCULPTED` entry needs.

Fat (2026-11-02). The owner: heavier fighters only had a bigger stomach,
when fat goes to the chest, the arms and everywhere else, and men and
women carry it differently. So the 2D `belly` knob is now how much fat a
fighter carries (`Build.fat`), laid on where a man carries it (`fat` in
fighter3d.py): a layer over the whole body but the head, hands and feet
(`Field.thicken`), then swells where it gathers (`FAT_M`: most round the
middle, the flanks and the lower back, then the chest, under the arm, the
upper back, the back of the neck, under the chin, the seat, the upper arms
and thighs, a little on the forearms and calves), and last all of it
softened (`Field.soften`, a blur made at a third of the resolution and
blended in), so the muscles under it stop reading one by one. The owner's
second look, "fat is not quite there yet": laid only as swells, a heavy man
still read as a muscled one with a gut and two plates on his chest; softened
last, the swells' edges go too. Fat also covers definition, and a groove
under a fifth of Jeff's depth is left out. A woman's pattern (hips,
buttocks, thighs, breasts, the backs of the upper arms, less round the
middle) comes with the women's base.

**Remodelling the next fighter, the recipe:**

1. Read their entry in `data/fighters.js`: build knobs, face values, outfit,
   look, palette and the character notes.
2. Clay their body (`--cast <dir> <id>`) beside Jeff's. If it is wrong, fix
   the knob's mapping for the whole cast (`Build`), never one fighter by hand.
3. Design their head in `lab/blender/fighters/<id>.py`: an original face to
   their notes, never a likeness, and eyewear if they wear it.
4. Dress them: their outfit in `OUTFITS`, if it is not there yet.
5. Register them in `SCULPTED` (`models3d.js`): leaf bones and joints' width
   from their build, their face centre and `layout` measured on their head,
   and their form.
6. Build (`-- <id> --rig`), look at them in the game's renderer
   (`lab/figure3d.js` with `models: ['sculpted']`, and `faces()`), and show
   the owner before the next stage.

**Adam** (`max`, the owner's pick, 2026-11-01). His body at his game size
was the first stage: 1.26 times Jeff's height, legs 1.23 times, widths 1.18,
his head about Jeff's, so he stands about 8.6 heads to Jeff's 7.4. The owner:
"the model is good", with the note on fat above.

His head (2026-11-02, `lab/blender/fighters/max.py`): an original face for
"manic", open where Jeff's is shut. A high rounded forehead, a light brow
ridge arched high, big eyes set shallow under thin lids, high cheekbones, a
long nose with a bump, a wide full mouth, a long heavy jaw and a round chin
with a cleft. Its first build showed black wedges from the eyes to the
nostrils in the game's light (the ink outline through a tight crease beside
a nose standing off the face); the nose now sits on broad side planes and a
lower lid fills under each eye. His cap is backwards, as in 2D: a crown a
little proud of the skull, a stiff brim over the nape, a button on top, in
`suit2` and `accent`, over short dark hair, the skin under both removed
(`headwear` in the design module: a `hair:cap` mesh, as his look's hair is
`cap`). The shared painter paints his face from his 2D values: wide eyes
that stare rather than squint (`smug` needs a narrowed lid), raised brows, a
loose grin at rest (`leer`, for a mouth curve of 2 or more, only his), and
stubble, a soft shade over the upper lip, round the mouth and down the jaw
(up the cheeks, it read as a mask). Until his hoodie is made he wears the
pipeline's base outfit, trousers and shoes (`OUTFITS.base`), so his head can
be judged in the game first. Registered as `sculpt:max`.

The owner on it: "facial expression, head size looks great. shoulder looks
like it is a bit forward". His 2D stance already slouches, and the sculpts'
usual lean (`fit.lean`, made for Jeff's boxer over bent knees) on top of it
rounded his back and brought his shoulders forward; his `fit.lean` is now a
little below zero, and he stands up straight with his chest up.

His clothes (2026-11-03, the owner: "looks good, continue"): his oversized
hoodie, baggy trousers and white sneakers, as in 2D (`OUTFITS.hoodie` in
fighter3d.py). An oversized top does not follow the body, so the hoodie is
made from the body as loose cloth lies over it (`_loose`): the forms blurred
away a couple of centimetres out, and below the chest each column falling
straight from the widest part above, as cloth hangs. The trunk and sleeves
are made apart and met a hand's width down the arm, a dropped shoulder:
blurred together, the cloth webbed from arm to side like a bat's wing and
stretched into a fin of cloth whenever the arm came up, and split at the
joint each sleeve was a puff on a vest. Under loose cloth the chest's weights
also reach out under each arm (`loose` outfits, `skin_weights`). In its
second colour (`suit2`) a ribbed band at the hem, ribbed cuffs, and the hood
lying down: a layer over the upper back with a U-shaped edge and a soft roll
round the back and sides of the neckline (a ring of beads read as a neck
pillow; carried round to the front, it rose under his chin like a beard). A
pouch pocket follows the front (a flat box on the curve stood out only at its
ends), and two drawstrings in `accent` lie on the cloth (projected onto it;
from too far out, where the field was never written, they landed anywhere).
The neckline is cut close and the collar stops at the base of the neck: wider,
the gap showed its inside as a black band under the jaw; kept up to the
shirt's line, it stood round his neck like a turtleneck. Trousers now come in
cuts (`LEG_CUTS`, from the 2D `costume.legs`): baggy legs widest at mid-thigh,
wide enough to hang clear of the thigh, and allowed further out to the side
(kept to the suit's limits, they were cut flat there in patches that read as
pockets). One material a palette role, shared by every piece (`material`): a
second of the same name came out as `suit2.001`, a role no palette has.
`test/sculpt3d.test.js` checks his roles, his cap and his bare fists.

His form (2026-11-04): brawling (`data/forms.js`), as his 2D style is a
brawler's. His guard is his own from 2D (fists low at the belly and too far
apart, the widest base in the cast), the fists out wider than his shoulders
(`handDepth` above 1), and at rest he rolls his weight: the shoulders turn
with the sway of his fists and the hips follow a beat behind (`roll`, a new
form setting, read in `computePose`). His punch is a haymaker, all wind-up
and no control: the fist back by his ear and the body turned away, the
deepest coil in the cast so everyone sees it coming, then round and through,
and on past the target off balance before he stumbles back. He covers up late
and badly, both forearms thrown up across his face from the belly, turned
away. Kicks, the slap and the launcher are still the shared tracks, blended
to his guard. `test/forms.test.js`.

**Carl** (`dex`, the owner's pick after Adam, 2026-11-04). His body came out
of the pipeline as it is: about Jeff's height, short in the leg, the heaviest
of the men (his `belly` 0.65), so the fat layer gives him his paunch, bull
neck and second chin. His head (`lab/blender/fighters/dex.py`): an original
face for "predator", an older man's heavy face, the lowest and heaviest brow
in the cast over deep-set heavy-lidded eyes with bags, a big fleshy nose,
deep folds to a thin pressed mouth, jowls at the jaw line and large ears. His
silver hair is combed straight back off a receding hairline, laid on his own
head's surface (sampled from the body's field) a few millimetres out, with
the comb's lines through it: on a skull of its own with volume behind, it
stood off his head like a helmet. He wears shades, made as Jeff's are; his
painted brows sit just above their bar (on the ridge, under it, they were
hidden). His 2D stance is a wrestler's, already hunched, so his sculpt adds
no lean of its own. Registered as `sculpt:dex`.

His suit (2026-11-04, `OUTFITS.pinstripe`): a dress shirt with a closed
collar, the pink tie, a jacket buttoned over his paunch, suit trousers and
shoes. The jacket is the body as cloth lies over it (`_drape`, the hoodie's
`_loose` made general: with Adam's numbers it gives his hoodie byte for
byte), a centimetre out with the sleeves set in near the shoulder, and never
nearer the body than that: draped alone, it dipped where the sleeves meet the
trunk and the shirt showed through at the shoulders. Only its front hangs
straight (`hang_back`): hung from the shoulder blades as well, its back stood
off the small of his back and folded into a corner there as he leant into his
stance. It opens in a V from the
button to the base of the neck, its collar stands round the back of the neck
under the shirt's, and below the button its fronts part over the paunch, as
the 2D jacket's do. The lapels widen from the button to a notch under the
collarbone, the collar narrower above it, a few millimetres proud of the
jacket and in the suit's colour in shade, as the 2D figure darkens it: a
material role can now ask for a palette colour in shade (`suit*0.78`,
`roleColour` in `gl3d/toon.js`), so the shade follows any palette. In
`suit2`, nearly black on Carl, the lapels read as a black stand-up collar.
The lapels are cut from the finished jacket: from its cloth uncut, the collar
ran on up the neck to the jaw. The tie is swept down the shirt as one ribbon:
a chain of flattened capsules, each turned to the shirt under it, stepped
over the paunch and read as beads. The shirt shows in the V and at the cuffs,
and its collar is kept to the neck: a band at the body's height, it ran out
over the tops of the shoulders, too near the jacket there to be hidden under
it, and showed through in flecks. Not yet: the pinstripes themselves (a
pattern, which the toon renderer has no way to paint) and a waistcoat (the V
shows only the shirt, as in 2D). `test/sculpt3d.test.js` checks his roles,
the lapels' shade against figure.js's, and his bare fists.

His briefcase (2026-11-04): props now come out of the pipeline as the
founder's model has them (`PROPS`, `props()` in fighter3d.py), a
`prop:<id>` mesh for each part the fighter carries, which the game shows in
that part's states, riding a grip bone that follows the fist but faces the
way the body faces. Carl's case hangs from his rear fist, and every sculpt
now raises the block briefcase in its lead fist (Jeff and Adam rebuilt with
it, nothing else in their models changed). Each is an original attache case
(`briefcase`): a hard leather shell with rounded corners and the seam where
its lid closes, a handle arched on two brass mounts, and brass latches,
sized as the founder's and hung with the handle in the fist: at the
founder's ten centimetres ahead of it, the fist floated beside the handle.
`test/sculpt3d.test.js`.

His form (2026-11-04): grappling (`data/forms.js`), as his 2D style is a
grappler's, from the guard his 2D figure stands in: hunched well forward over
a wide low base, chin down, the lead hand open and reaching at chest height,
the rear one low with the case, and a slow, heavy shift of his weight at
rest. His punch is a seizure: the weight sinks and the open hand draws in,
shoots out at the chest with the body behind it, closes on what it finds and
hauls it back in to his chest, the body turning away with the pull. He blocks
hunched behind the block briefcase. `test/forms.test.js`.

The open hand is new to the pipeline and serves every sculpt: the lead hand
comes in two shapes, `hand:fist` (the body's own, parted from the arm under
the sleeve, `_part_hands`) and `hand:open` (`open_hand`: the flat of the
hand, the fingers out together and a little curled, the thumb off it, its
wrist the body's own), and the renderer shows one by the pose (`P.hand`,
`conditions.hand` in `wearing`). A form names the states it holds the hand
open in (`open`), an attack track can open and close it on a key (`hand`,
switched as `face` is), and a slap opens it in every form, as the 2D figure
draws everyone's; anything else is a fist. Jeff and Adam were rebuilt with
it, so their slaps are open-handed now; nothing else in their models
changed. The first open hand was a skeleton's (thin fingers apart), and its
thumb was cut flat by the edge of its own field.

The owner on it: "It's good".

**Steve** (`kai`, the owner's pick after Carl, 2026-11-04). His body came
out of the pipeline as it is: 1.15 times Jeff's height and as long in the
leg, the narrowest chest and shoulders so far, little muscle on him and
carved shallow, his head about Jeff's. His head
(`lab/blender/fighters/kai.py`): an original face for "the showman", a long
lean face on a tall narrow skull, a high forehead, a light level brow over
deep-set eyes under heavy lids, high cheekbones, a long straight nose, a
small thin-lipped mouth and a narrow pointed chin. His grey hair is a quiff
(`headwear`, sampled from the head as Carl's is): volume over the whole top,
short at the sides, rolled up and forward off the front, the hairline curving
down past the temples to the sideburns (kept narrower than the head, the
quiff stood up as a crest; cut square, the hairline stepped down over the
temples). His glasses are new to the pipeline (`glasses` in fighter3d.py):
rounded-rectangle rims round clear lenses, as the 2D ones are drawn, the
lenses faint glass (`clear`) the painted eyes show through and the rims wire
drawn without the ink outline (`rim`, inkless for every sculpt): outlined,
the ink filled each lens black, as the founder's wire would be. The nose's
side planes are wide (narrower, the crease beside it went black, as Adam's
did). His 2D stance stands tall with the chest open, so his sculpt adds no
lean of its own. Registered as `sculpt:kai`. The owner: "Continue".

His clothes (2026-11-04, `OUTFITS.turtleneck`): a fitted teal turtleneck,
skinny trousers and his white sneakers, as in 2D. The knit is the body's own
shell softened only enough not to show every muscle (the 2D figure says the
chest and waist show through it) and never nearer the body than a few
millimetres (softened, it sank under the skin over the shoulders and lats).
The roll collar, in the second colour, is a tube round the neck sized to it,
up to under the jaw and higher behind, sitting on the shoulders: the neck's
own surface pushed out took the shoulders' slope with it and stood on them
as a plate, and blurred after it was cut out, it was eaten down to a ring.
The knit runs up under the collar and no further (open only round the neck,
it ran on up over his head and hid the face). Skinny legs are a new cut
(`LEG_CUTS.skinny`), under the leg's own shell so they hug it.

His device (2026-11-04): a thin slab with rounded corners held up at his
chest in the rear hand, the edge of its screen just drawn in, solid in his
palette's `accent` as the 2D part is (`device`; `PROPS` now names a maker for
each prop). The comb lines in his quiff were made shallow: deeper, the ink
drew them as black scribbles at game size.

His form (2026-11-04): showboating (`data/forms.js`), from his 2D guard: tall,
the chest open, the lead hand open, out and high, presenting, the device at
his chest. His punch is the big finish: a flourish, the open hand swept up
and back over his shoulder with the body turned away, the hand closing at the
top of it, the punch down at the chest, and the finish held a beat too long,
chin up, before he goes back to presenting. He blocks behind the briefcase in
the presenting hand. His keynote drift at rest is his own 2D idle.
`test/forms.test.js`, `test/sculpt3d.test.js`.

The owner: "Continue the work".

**Elo** (`elo`, 2026-11-04, after Steve). His body came out of the pipeline
as it is: the tallest, 1.28 times Jeff's height and as long in the leg, narrow
in the shoulder and heavy-set rather than built, a little belly, a small head
for his size. His head (`lab/blender/fighters/elo.py`): an original face for
"thin-skinned", a soft oval face, a high forehead, a light brow ridge set high
for brows up in grievance, big eyes set shallow and wide open, soft
cheekbones over full cheeks, a straight nose with a rounded tip, a small mouth
with a pouting lower lip and a broad rounded jaw; his brown hair a buzz cut
(`headwear`, sampled from the head, barely two millimetres out). His 2D
stance leans back, so his sculpt adds no lean of its own. Registered as
`sculpt:elo`.

His clothes (`OUTFITS.tee`): a black tee in a regular fit, stretched over the
middle as in 2D, short sleeves halfway to the elbow (`_sleeve_cut`), worn out
over baggy trousers and hanging a little looser toward the hem (as close as
above, the trousers' waistband stood out over it and the hem was lost); a
ribbed crew neck in the second colour, wide enough not to break into beads
and kept to the neckline (higher, it took in the soft under the chin, and so
did the tee itself until it stopped at the neckline); and the red diamond
the 2D figure draws, high in the middle of the chest (lower, his crossed arm
hid it but for a red spot at the elbow). His booster (`booster`, the first
prop worn rather than held): a red rocket stood upright off his back, a
pointed nose, a dark band, nozzle and fins, riding the chest bone.

His form (`shoulderRoll`, `data/forms.js`), from his 2D guard: the lead arm
low across the belly, the rear fist at the chin, chin up, weight back. His
punch is the glass cannon's whip: the low fist drawn back past the hip and
the body coiled away, the deepest wind-up after Adam's, then whipped up and
out at the head, held only while it can hit and snapped straight home. He
blocks by rolling the shot off the lead shoulder, turned well away.
`test/forms.test.js`, `test/sculpt3d.test.js`.

**Scam** (`scam`, 2026-11-04, after Elo, the last of the men). His body came
out of the pipeline as it is: about Jeff's height, soft all over, round
shoulders, a belly and nothing in the arms, his head a little bigger than
Jeff's. His head (`lab/blender/fighters/scam.py`): an original face for
"reasonable", the mildest in the cast, young, soft and rounded, a smooth
forehead, a low soft brow, eyes at an even depth under plain lids, round
cheeks, a short small nose, a small even mouth and a round chin. His brown
hair is a curly mop (`headwear`): a cap of his head's surface and over it
puffs laid evenly round the skull and brought down onto it, fullest on top,
big and run together as the 2D puffs are (small and apart, they read as a
bunch of grapes). His sculpt adds no lean of its own. Registered as
`sculpt:scam`.

His clothes (`OUTFITS.henley`): an oversized grey henley of the hoodie's
loose cloth, long in the hem as his 2D costume has it, long sleeves, a ribbed
neckline close round the neck and a placket down the front in the second
colour, with three white buttons (`button`, a role of their own, white as the
2D figure draws them); baggy trousers and white shoes. His paperclip
(`paperclip`): one enormous bent wire, three legs and the bends between
them, standing off his back face on to the camera's side, as the 2D one is
drawn flat behind him (laid flat across his back, the camera saw it edge on,
a white line), riding the chest.

His form (`fence`, `data/forms.js`), from his 2D guard: one hand in his
pocket, the other up open-palmed in front of his chest, placating and keeping
you at arm's length. His punch is the slip: barely any wind-up, the hand
closing only as it lands, lingering out after before it opens again; the
pocket hand stays at his side, going only with his lean. He blocks with the
briefcase in the fence hand. `test/forms.test.js`, `test/sculpt3d.test.js`.

All six men are now remodelled. The owner on Elo and Scam: "good".

**The women's base** (2026-11-04). The pipeline's body was a man's: pecs, a
man's shoulder girdle, Jeff's hips, the male fat pattern. A woman's frame
(`figure.frame` 'f', all three women) is now built into it, switched only by
that knob, so every man is exactly as he was (Jeff rebuilt byte-identical):
the shoulders narrower and the deltoids with them, as the 2D figure draws
hers (0.86, figure.js), a lighter neck; the pelvis wider by her `hips` (now
read, `Build.pelvis`) and wider again than a man's, through the trunk's girth
map so the seat and the hip joints come out with it; a modest bust over the
chest's muscle and none of a man's chest lines carved; and soft tissue a man
of the same build does not carry (`Build.soft`), laid in a woman's pattern
(`FAT_F`, `LIMB_FAT`: the hips and the seat most, then the thighs, the bust
and the backs of the upper arms, least round the middle), which softens the
muscle under it as fat does. Kept as modest as the 2D women are: in clay
the curves barely show in profile, and the clothes will cover them. In clay
beside Jeff and Steve, with plain placeholder heads
(`fighter3d.py -- --cast <dir> ava zara eleanor`).

The owner: "yes, looks good".

**Lizbeth** (`ava`, 2026-11-04), the first woman. Her body is the women's
base at her size: 1.13 times Jeff's height, slight. Her head
(`lab/blender/fighters/ava.py`): an original face for "the stare", a slim,
even face on a woman's narrower jaw, a light brow set high and level, big
eyes set shallow under thin lids raised high (carved, as Adam's stare is),
high cheekbones, a straight narrow nose, an even mouth and a narrow defined
chin. Her pale blonde hair is pulled back tight into a ponytail, smooth (the
comb's lines the men's hair has inked as black specks on hair this pale), a
tie at the back of the crown and the tail tapering down the back of the neck,
round and joined end to end without a blend (flattened, each length kinked
against the next, and blended, each join bulged: either way a string of
beads). Her visor is new to the pipeline (`visor`): a band of cyan glass
across the eyes, a slice of an upright elliptical cylinder clear of the nose,
ending in front of the ears (wider, it stood out past her temples like
goggles), drawn as glass in game (`visor`, as the founder's). Registered as
`sculpt:ava`.

Her clothes (`OUTFITS.blazer`): the suit's jacket worn open (`jacket(open_front)`,
`_vee(open_front)`: the fronts apart from the collar to the hem, no button,
the lapels down to where the button would be), shorter, over the fitted
white shirt, skinny trousers and white shoes. Her vial (`vial`): a big sample
vial stood upright behind her lead hip, in her accent with a white cap,
riding the hips bone (`JOINT_OF`: the bone is named apart from its joint).

Her form (`fencing`, `data/forms.js`), from her 2D guard: narrow, upright and
side on, both hands in on her centre line, the lead hand loose and open. Her
punch is the thrust: the hand barely draws back, then goes straight out along
its own line, fingers first, the lead foot stepping after it and nothing in
the hips, and straight back; the hand never closes. She parries with the
briefcase. `test/forms.test.js`, `test/sculpt3d.test.js` (her frame: narrower
in the shoulder against the hip than any man).

The owner: "good, continue".

**Kim** (`zara`, 2026-11-04), the second woman: the women's base at her
size, 0.98 times Jeff's height, curvy, her head oversized for her size. Her
head (`lab/blender/fighters/zara.py`): an original face for "bored of you", a
soft rounded face, a light flat brow, almond eyes under the heaviest lids in
the cast (carved heavy, as Steve's are), full round cheeks, a small nose, a
tiny mouth with full lips and a soft round chin. Her black hair is pulled up
into two puffs set back and low on the crown and run into the hair (high and
round on either side, they read from the front as a pair of cartoon ears),
and she wears round earrings in her accent (`accessory:earrings`, shown when
her look says so). Registered as `sculpt:zara`.

Her clothes (`OUTFITS.bomber`): a bomber in her pink, roomy through the body
and the sleeves (`_drape`, floored a centimetre off the body as the jacket's
is) and gathered over its last hand's width into a ribbed band in her green
accent at the waist (down at the top of the hips, the band was as wide as the
hips and the jacket hung straight to it, a sweatshirt; the band is kept to the
trunk, as the hands hang at its height in the rest pose and it took them in);
ribbed cuffs and a ribbed collar in the second colour, the collar a short
tube wide at its foot over the neckline (as close as the turtleneck's, the
cloth rising round the neckline buried it); a zip up the front, a dark line
of the second colour (`suit2*0.8`) in a fine field of its own. Flared
trousers (`LEG_CUTS.flared`): hugging the thigh to the knee, then flaring to
a wide hem that falls past the ankle (`low`) over the top of her green
sneakers. Her ring light (`ringlight`): a flat ring a little wider than her
head and hair, a hand's width behind it, in her accent, riding the head; built
square to the body it turned with her head and was seen nearly edge on, so it
is built pre-turned by the head's posed turn (`HEAD_TURN`, GL3D.YAW +
GL3D.HEAD_YAW, as the founder's is; the test checks the two agree).

Her form (`peekaboo`, `data/forms.js`), from her 2D guard: crouched in and
leaning forward, both fists high and tight in front of the jaw, her face just
above them, the shoulders weaving at rest over her own two bounces a breath.
Her punch is the snap: she bobs under the line, the fists staying at the jaw,
comes up with the jab already out, and has it home by 2.25 of the track, the
fastest reset in the game, the head slipping off the line as it comes back.
`test/forms.test.js`, `test/sculpt3d.test.js`.

**Cathie** (`eleanor`, 2026-11-04), the third woman and the last of the cast:
the women's base at her size, the tallest in the game at 1.3 times Jeff's
height, slim and straight-backed, her head small for her height. Her head
(`lab/blender/fighters/eleanor.py`): an original face for "serene", a calm
oval face older and softer than the other women's, a soft brow set a little
high, eyes open under plain lids, cheeks settled a little low, a straight nose
of a good length, a level mouth with thin lips, the folds from the nose to the
mouth just drawn in. Her cream bob: her head's surface pushed out and hung
straight down from wherever it is widest, as hair falls, to a level cut at
the jaw, fullest about the eyes and turned under at the ends, a fringe swept
down across the forehead from a side parting, the face cut clear between the
two sides, coming further forward toward the ends (hung straight and belled
out under a level fringe, it was a helmet; cut square in front, each side was
a flat plate down the cheek; thinner over the forehead, the ink broke the
fringe's edge into specks). Registered as `sculpt:eleanor`.

Her clothes (`OUTFITS.suit`): Carl's suit, the jacket buttoned over a shirt
and tie, as the 2D figure draws the two alike but for the stripes. Her brooch
is the first accessory worn on the clothes (`ACCESSORIES`): built on the
clothes as last dressed (`DRESS`), a domed pin with a stone high on the near
lapel where the 2D one is, its own mesh (`accessory:brooch`) riding the chest.
Her tablet (`tablet`): a slab bigger than Steve's device, in her accent, its
top leaning back as the 2D one is turned, gripped below its middle, with a
dark line chart falling from top left to bottom right across the face the
camera sees. Her coat (`coat`): the skirt of a long coat in her cream,
hanging from under the jacket's hem round her back and sides to above the
knee and flaring as it falls, open in front, riding the hips, as the 2D part
is drawn behind her (softened, a blur as wide as the cloth is thick took all
of it, and the test now catches a missing prop).

Her form (`taiChi`, `data/forms.js`), from her 2D guard: upright and tall,
the lead palm open and level in front of the chest, the tablet low at the
waist, breathing slowly. Her punch is the push, placed rather than thrown:
the palm drawn in as the weight settles back, then out level with the weight
moving behind it, no turn of the hips and hardly any of the shoulders, and
back the way it went; the hand never closes. She turns the block aside with
the briefcase. `test/forms.test.js`, `test/sculpt3d.test.js`.

All nine are remodelled.

**The review** (2026-11-04), once the cast was built: every sculpt in game in
every state (idle, walk, crouch, jump, block, slap, punch, kick, launch,
hitstun, a KO and victory), and the remodel's code read through by a
separate reviewer. Nothing reaches the simulation and nothing is shared
between fighters or builds; what it found, all fixed:

- Every form's punch jumped on its first frame and back on its last. The rear
  hand follows the head through a strike, measured from the stock guard
  (REST) even for a form's track, which starts in the fighter's own: it is
  now measured from the track's first key (`drawFighter.js` `trackStart`).
  The reach re-scale moved a form's guard keys with the strike (Cathie's palm
  11 px out on the first frame); for a form's track it now comes in over the
  wind-up and goes over the recovery. Jeff's straight was keyed at the stock
  height and lead foot, not his guard's (`GUARD_SY`), and Scam's slip had its
  head 2 px back (`F_HEADX`). A test now holds every sculpt's punch to its
  idle guard on its first and last frame, at the reach the game gives it
  (the old ones compared a punch with its own first frame, at the nominal
  reach, so none of this showed).
- A recoloured fighter took the first one's painted brows and lips: the
  face texture's key (`drawnFaceKey`) now holds the hair and skin colours the
  painters read.
- What keeps a form out of the 2D game is now tested where it lives, `form3D`.

The last two props are made. Jeff's parcel (`parcel`) is clamped against
his near side under the elbow, the rear arm his guard holds at his chin: in
his rear hand, as his 2D karate stance has it at the hip, it would cover his
face. Adam's mat (`mat`) is rolled and slung across his back from over the
far shoulder to past the near hip, white, two straps in his accent and the
spiral of the roll in each end. Both ride the chest and are placed where a
ray first meets the clothes (`_hit`): projected onto cloth that hangs, the
mat stood a hand's width off his back, which a test now catches.

Next: the owner's call on putting the sculpts in front of players.

**The kicks** (2026-11-05, after v3.14). Each form kicks its own way, from
its guard (each form's guard is now one constant, `<FORM>_AT`, where every
one of its tracks starts and ends): Jeff a boxer's push kick, the hands never
leaving the guard; Adam a door kick, wound up high and stumbling forward off
it; Carl a heavy push at the thigh, the open hand reaching with it; Steve a
crescent swept up high, arms wide, the finish held; Elo a roundhouse coiled
well away and snapped home; Scam a push to keep you off, the hand still in his
pocket; Lizbeth a line kick, straight out along its line; Kim a snap kick, the
fists at her jaw; Cathie a heel kick, placed, the arms opening. Adam's and
Elo's wind-ups first drew the leg back behind them, where the game's camera
could not see it, and Adam's lead arm thrown forward read as a punch; both
now lift the knee in front. The test that holds a punch to its guard now
holds every move a form has (and its lead hand), and each kick must be out
at the middle while it can hit.

**Gaps, now the whole cast is built:**

- `body.reach` is not read: the arms are as long as the fighter's height
  makes them, and the rig reaches them to the 2D fists.
- Outfits. Every roster outfit is made: Jeff's vest, Adam's hoodie, Carl's
  pinstripe (Cathie's suit is the same cut), Steve's turtleneck, Elo's tee,
  Scam's henley, Lizbeth's blazer and Kim's bomber. A player's founder can
  pick any of them in 2D; the 2D `costume` (`fit` tight to oversized, `legs`
  suit, skinny, baggy, flared) says how far each stands off the body and
  how the trousers fall.
- Hair and headwear. Adam's cap, Carl's slick, Steve's quiff, Elo's buzz,
  Scam's curly mop, Lizbeth's ponytail, Kim's puffs and Cathie's bob are
  made, each in its fighter's own module; a player's founder would need
  them as makers of their own.
- Accessories: shades, glasses, the visor, Kim's earrings and Cathie's
  brooch are made.
- Patterns, such as Carl's pinstripes: the toon renderer paints flat colour.
- Props. Every 2D part is made: the block briefcase, Jeff's parcel, Adam's
  mat, Carl's case, Steve's device, Elo's booster, Scam's paperclip,
  Lizbeth's vial, Kim's ring light and Cathie's tablet and coat. They are
  rigid on their bones: Cathie's coat drops with her hips in a crouch and
  stands out stiffly in a kick, where the 2D one trails.
- Forms: boxing (Jeff), brawling (Adam), grappling (Carl), showboating
  (Steve), the shoulder roll (Elo), the fence (Scam), fencing (Lizbeth), the
  peek-a-boo (Kim) and tai chi (Cathie). Every basic move has a track of
  its own in each: punch, kick, slap and launcher (the command normals and
  specials that borrow those tracks through `ATTACK_TRACK`, such as Kim's RUG
  PULL on the kick or Cathie's CONVICTION BUY on the slap, take them too).
  Block is each form's own, and since the reactions and the walks below, so
  are hit stun, the KO, victory, the walk, the jump, the crouch and the dash.

## After v3.17, for review (2026-11-05, on `claude/jeff-model`, not released)

The owner, releasing v3.17: "Push it live and continue"; then "complete all
the work in one go, so I can review it after all the work". Everything in
this section waits on that review.

### Each form's own knockout fall and juggle

A knocked-out fighter's arms and legs were each form's own (v3.16), but
everyone went over in the same 0.45 s along the same curve (`basePose`,
`P.rot`).

- **`ko.fall`** in `forms.js`: how long the fall takes, how far over, and
  how, by one of `drawFighter.js`'s eases: `inQuad` for a plank that topples
  (Jeff, Carl, Lizbeth), `outQuad` for a crash (Adam, Elo, Scam, Kim),
  `outBack` for Steve, who goes over too far and bounces back, `smooth` for
  Cathie, who settles slowly as if choosing to. Scam slumps rather than
  falls, never quite flat.
- Tests: every form has one, starts upright, ends at its own angle and stays
  there, and they all differ. Fails with the fall switched off. Both pixel
  checks identical; knockouts of Lizbeth and Cathie in real matches show the
  falls with no errors.

- **Hit in the air** (a juggle after a launcher), a fighter hung their legs
  straight down as if standing on the floor; they now take the form's own
  jump at that moment of the rise and fall (`formJump`), the hit's arms kept.
  Test: rising and falling, the jump's legs and the hit's arms, and on the
  ground the feet still on the floor; fails with the change switched off.
  Steve launched by Jeff in a real match shows it, with no errors.

### ROUND and FIGHT! over the fighters' heads

The round's announcements (`#announce`, a page element over the stage) were
centred on the screen, across the fighters' chests, and hid the gesture each
3D fighter opens the round with for its first second; FIGHT! sat in the same
place, so retiming the gestures would not have helped.

- `Game.updateIntro` now announces ROUND and FIGHT! with the `intro` class,
  which `styles.css` centres in a band of the stage's height (14% from the
  top to 52% from the bottom: below the top bar, above the heads), on a
  phone held sideways too. K.O.!, TIME UP and the winner stay centred.
- **Only in 3D**: the rule is `body.gl3d #announce.intro`, and `main.js`
  marks the page `gl3d` only when the 3D fighters are on in their own forms
  (a change in Settings reloads the page). The 2D game, where nobody
  gestures, keeps ROUND and FIGHT! centred as before. (It first moved in 2D
  too; the review below caught it.)
- Test (`rosterMoves.test.js`): a match's start announces ROUND 1 and FIGHT!
  with the class and K.O.! without it, every rule for the class is under
  `body.gl3d`, and `main.js` sets it from the forms being on; fails without
  the class, and with the rule unscoped. Screenshots at 1000 by 600 in 3D,
  and 844 by 390, show the text clear of the top bar and of the fighters.

### Adam's super from a squat

The super's banner (`FX_ART.CUTIN`) covers every fighter's head during the
freeze and shows their face as a portrait in the band instead, so a super
pose reads from the shoulders down. Adam, the tallest, put most of his into
it; he now roars from a wide squat, arms out, under it. Frames held at the
freeze in real matches show his, Steve's and Cathie's.

### Review fixes (an independent review of this section and of v3.17)

A fresh agent reviewed the work above and the forms released in v3.17
without seeing how they were built. What it found, and what changed:

- **Moves from a crouch hit where they did not look** (v3.17). The crouch
  dropped the whole move, so a crouching kick's foot went for the shins while
  its hitbox (which does not crouch) stayed at the standing kick's height,
  and a move already written low (Kim's RUG PULL) went below her crouch. Now
  the body drops to the crouch and no lower (a move that already dips, Carl's
  lunging punch, drops by what is left), and a hand or foot out in the move
  (`REACHED_OUT`, 30 px from its place in the guard; every basic's fist, palm
  and foot is at least 35 px out by the middle of its active window) stays
  exactly where the standing move puts it. A planted foot still widens to the
  crouch. Test: punch, slap and kick in every form leave from the crouch,
  stay down but never below it, and strike exactly where the standing move
  does; RUG PULL no lower than her crouch. Fails with the block off, and with
  the old drop-everything rule.
- **The walk jumped when a fighter turned round** (v3.17). Backing off ran
  the cycle backwards, so changing direction mid-step threw the feet up to
  28 px in a frame. The cycle now runs on whichever way they go, and backing
  off it is the foot travelling back that lifts, so a turn only swaps which
  foot is up (by no more than the form's `lift`). Test: at every phase, the
  feet, arms, hips and twist are the same either way; fails with the old
  cycle.
- **A super or stance-switch pose came back after it was broken off**
  (v3.17). Both read their timers, which keep counting through a
  strike, a block or a jump, so Scam slapping out of his switch snapped back
  into it when he stood, and a super pressed in the air popped in on landing.
  `heldUnbroken` in `drawFighter.js` remembers, per fighter and from the
  frames drawn, whether they have stayed standing since the pose went on
  (render-side only, nothing written to the fighter; a new trigger is the
  timer jumping back up). Test, drawn frame by frame on one fighter: Scam's
  slap out of the switch, a super pressed in the air, a walk and a crouch
  that keep it, a second switch that shows again. Fails without it.
- **The round-start gesture's wiring was untested**. Test: each of
  `render.js`'s three ways of drawing a match sets the round start next to
  the 3D clock, before it draws a fighter. Fails with one path unwired.
- **ROUND and FIGHT! moved in 2D too**: now 3D only (above).
- **Letting go of down mid-move pops the crouching move up**: left as it is,
  since the hurtbox stands up on that frame too; the v3.17 note that said
  the crouch held through the move is corrected.

### A game designer's review of the animation and characters (2026-11-06)

The owner: "let's check the work, animation, flow, characters, you can
introduce game designer (agent) to check and improve". A fresh agent, as a
fighting-game designer and animation director, posed every fighter through
every move in the shipping renderer, measured the poses against the hitboxes
and hurtboxes, and ranked what a player would notice. A second, on flow and
game feel, was stopped before it reported; a fresh one ran after (next section). What the
first found, and what changed (all render only: nothing in the simulation,
no `SIM_VERSION` change; 3D only, except Carl's briefcase):

- **Every walk skated.** The feet swung on a sine at a cadence of their own,
  short of the floor going by, so a planted foot slid along with the body at
  59 to 83% of its speed (Cathie 83%). The walk phase already runs with the
  distance walked (now `PHYS.WALK_PHASE`, the 11 that was in `fighter.js`), so
  a form's walk now says how far one cycle carries the body (`cycle`, px) and
  the cadence follows: a foot that is down goes back under the body at exactly
  its speed, on a triangle wave (the same shape either way, so a turn still
  only swaps which foot is up). Where a stance is too narrow for the step its
  cycle needs, the form chooses a glide (`slip`): Carl 30%, Scam 25%, Lizbeth
  30%, Kim 20%, Cathie 35%; the rest are locked. Steve, Elo and Kim now walk
  the quarter-cycle step-and-follow that Jeff, Scam and Lizbeth did. Test:
  measured on the floor as drawn, a planted foot moves no faster than its
  form's slip; fails with the old sine.
- **Low stances stood up to take a hit.** Hit stun started from the stock
  standing pose, so Adam, Carl and Kim popped up 14 to 17 px and narrowed
  their feet on every hit, and dropped back after it; Carl's hunch flipped to
  a lean back. A hit is now taken from the form's own guard (height, feet,
  lean), its arms carried down with it.
- **Stoic hits barely registered.** Lizbeth's, Cathie's and Carl's reactions
  were scaled down throughout. Every form now snaps fully on the impact (the
  first four frames) and the stoic ones recover composed. Test: every form
  leans back at least 0.18 and throws its head back 5 px on the impact.
- **Knocked-out bodies lay through the floor or on nothing.** The fall turns
  the standing pose about the feet, so the rear foot went 10 to 38 px through
  the floor and the back sank (Adam, Lizbeth) or hovered (Scam 25 to 50 px).
  `groundFall` brings whatever is lowest to the floor as the body goes over,
  then lays the back on it (`GL3D.LIE`), lifting any hand or foot still
  under it. Adam's knockout feet start on the floor. Test: through every
  fall, nothing under the floor, the back on it once down, the fall starting
  on its feet.
- **Strikes went over heads and past their boxes.** A tall fighter's straight
  went over a short one's head and still hit (Elo's fist 45 px over Kim's), and
  Cathie's and Adam's went 15 to 25 px past the box. `landStrike` brings a basic
  punch, slap or kick's fist or foot into the hitbox's height and no further
  out than its far edge (`GL3D.STRIKE_INSET`), pivoting at the shoulder or hip
  so the limb keeps its length, measured once a move at mid-active and eased in
  and out. Specials and command moves keep theirs. Test: every form's three
  basics land inside the box, the limb no longer, nothing moved at the first
  frame, specials untouched.
- **Limbs stretched like rubber.** A sculpted arm, or a lifted leg, now
  stretches at most 10% past its length (`GL3D.STRETCH_MOST`, `rig.js`); past
  that it falls short. Cathie's punch, slap and kick went from 1.19 to 1.28
  times their length to 1.07; Jeff's UNDERCUT, Carl's HOSTILE TAKEOVER and
  Adam's BURN IT ALL are capped the same way. A planted foot still reaches the
  floor. The stock founder model is unchanged. Test.
- **Crouching moves kept the standing move's stretch**, standing a crouching
  kick 12 to 22 px taller than the crouch. They now squash as the crouch does,
  the squash taken back off a hand or foot that is out, so it still strikes
  where it hits. Test, in the crouch test.
- **Launcher recoveries looked over too soon.** Elo's and Kim's whiffed
  launchers were back in their guard for three quarters of the recovery, so
  the punish window could not be seen. Elo's, Kim's and Jeff's now stay up
  and open, coming down slowly. Test: no form back in its guard for more than
  40% of the recovery. (The jabs still snap home: that is how they are
  written, and their recovery is 7 frames.)
- **Carl blocked holding two briefcases**: the guard's, raised in his lead
  hand, and his own. His own now goes while he blocks. Test (`gl3d.test.js`).
  This one shows in 2D too.
- **Five wins looked like guards**: Lizbeth's clasped hands, Cathie's arms
  opened a little, Elo's folded arms, Kim's nails at her jaw and Steve's
  presenting hand stayed within a few px of the guard. Lizbeth now clasps her
  hands under her chin and tilts her head, Cathie opens her arms all the way,
  Elo folds his arms high and leans back, Kim looks down at her nails with a
  hand on her hip, and Steve goes from a hand on his chest to both arms out to
  the crowd. Test: every win moves the hands 60 px from the guard or leans 0.12.

Not done, for the owner:

- **Kicks end short of their box** (Kim 36 px, Jeff 34, Carl 31, Scam 30):
  the leg is already straight, and reaching further needs the hips to go with
  it, which the 3D rig cannot do yet (the pelvis stays over the feet). A
  `hipX` in `solvePose` would let a kick drive the hips in.
- **Crouching heads stand 40 to 70 px above the crouched hurtbox**, so a
  launcher can whiff a crouching fighter while visibly going through the head.
  Either the crouches go much deeper (a style change for all nine), or the
  crouched hurtbox follows the drawn crouch (a gameplay change, `SIM_VERSION`).
- **Slap and punch look alike** for most of the cast: both an arm straight out
  at shoulder height. The slap tracks could become a wide arc with a
  follow-through across the body. A judgement call.
- Smaller: Kim's RUG PULL stops at her knees, Scam's SAFETY MEMO and bomb read
  as two straight arms, Carl's walk nearly kneels, several round-start
  gestures are small on a phone.

### A game designer's review of the flow and the feel (2026-11-06)

The owner: "yes, let's start a fresh one". A second fresh agent, as a game
designer for arcade fighters and first-time players, played from a cold load
to the results and back at 1280 by 720 and on a phone held sideways (844 by
390, touch), ran headless matches through the real `Game` to time the pacing,
and read the online code (it wrote nothing anywhere). What it found, and what
changed (UI, CSS and copy only: no simulation change, no `SIM_VERSION`):

- **The level changed unannounced.** The first Quick Fight was Rookie and
  every one after it Contender (`lastDifficulty` defaulted to `'founder'`),
  with nothing on screen saying so; its bots that win at Rookie won nothing at
  Contender unless they mashed. A new save now stays at Rookie (existing saves
  keep theirs). The VS splash says the level before every solo fight, the
  results show it (AI LEVEL, in place of the arena), and offer the next level
  up after a win or down after a loss (`levelOffer`, `src/ui/flow.js`), one
  tap into the next fight. Never changed without asking.
- **The select screen picked the wrong side.** CHOOSE RIVAL's first tap picked
  who you played as, and the rival stayed RANDOM; backing out still left Quick
  Fight playing as that pick; and a rival drawn at random could be yourself
  (the roster's own fighters have no `baseId`), Elo against Elo in the same
  colours. CHOOSE RIVAL and CHANGE RIVAL now open on the rival's side; Quick
  Fight, Next Fight and the live lobby fight as you last fought
  (`savedSelfDef`); a random rival is never you (`rosterIdOf`).
- **"3 HITS!" never went away**: it stayed up for the rest of the round and
  into the next. It now fades as the combo ends (`hud.js`).
- **The meter labels**: 8 px text in a 10 px bar, on the AI's bar too (naming
  the key U, read as an instruction), and in versus naming P2's key on P1's bar. The
  key now sits beside the bar at 11 px, only on a bar someone at this keyboard
  plays, with that side's own key (`meterKeysFor`).
- **A phone held sideways stretched the fight 22% wide**: the stage was let
  out 200 px past 16:9 and the game and the 3D layer filled it (the owner's
  iPhone included). It is now 16:9, the bars either side; the touch pads are
  see-through and blur nothing behind them (a fighter in a corner was a blur).
- **The phone's title could not scroll** to THE STORY, sign-out or the profile
  chip, and the results lost their top (VICTORY) above the scroll on a short
  window. Both now scroll from the top.
- **The results**: eleven buttons in five rows, MENU below the fold at 720p,
  and BEST COMBO the better of the two (often the rival's). Now NEXT FIGHT and
  REMATCH, the level offer, CHANGE RIVAL, FIGHT LIVE and MENU, then SHARE &
  BRAG (the LinkedIn, X, WhatsApp and copy links moved into the result card)
  and CHALLENGE A FRIEND; YOUR BEST COMBO.
- **The first run**: the story's button and the profile's SAVE were below the
  fold (SAVE 2,500 px down a form a new player must finish to fight). Both now
  stay on screen at the bottom while the page scrolls. The story still opens
  once by itself (that was the owner's design).
- **The tutorial**: never mentioned Launch, taught two right-hand clusters, and
  only ran before a fight with the AI, so FIGHT A REAL PLAYER sent a newcomer
  in untaught. It now says left hand on W A S D, right hand on H J K, teaches
  Launch and points to the fighter's own moves, and runs before the first
  lobby too. The in-fight tips come in the first three matches only.
- **The lobby with nobody in it** had no way on but CANCEL. After 20 s it
  offers FIGHT THE AI INSTEAD.
- Small: Esc on the VS splash let the match run behind it (now ignored there);
  the help said 💣 for the 25-meter move, ⚖️ everywhere else.

Tests: `test/hud.test.js` (the combo fade, the meter labels) and
`test/flow.test.js` (the level, the select screen, the results, the phone
layout, the splash, the lobby, the tips); each fails on the code before.

For the owner (gameplay, so `SIM_VERSION` and your say, or yours by design):

- **Specials and Unicorn come so often they stop being special**: in its
  simulated matches a Contender match had about 6.6 specials and 4.5 Unicorns,
  Unicorn on screen 36 to 52% of live time, and the cut-in band (top third,
  stage dimmed) every few seconds. Slowing the meter (`METER.HIT_TAKE` 8 to 4,
  `HIT_DEAL` 12 to 9, aiming at about one Unicorn a player a match) is a
  gameplay change. Keeping the full band only for Unicorn, and a nameplate for
  other specials, would be render only.
- **The wait after a knockout**: 4.65 s to control between rounds and 5.4 s to
  the results, unskippable; 26 to 37% of a match's time is cinematics. Trimming
  `ROUND.KO_SLOWMO_T` or `ROUND.ROUND_END_T` paces the lockstep simulation; a
  solo-only skip of the victory pose would not.
- **Sign-in before the first fight** (`AUTH.REQUIRED`) is the owner's; one
  unranked Rookie fight before it ("sign in to keep this win") was suggested.
- **Not done**: a mirror palette for a deliberate mirror pick; the touch pads
  still cover part of the stage's corners (smaller, see-through now); the
  select screen's dossier is small and the rival's special has no description;
  a few sound cues are borrowed (a briefcase landing plays the block sound);
  ROUND 1 on Demo Day sits over the stage's yellow sign; the 60 s clock never
  ran out in 1,200 simulated rounds.

### Nine faces that look like nine people (2026-11-06)

The owner: "can we make the characters look more real to the person they are
trying to be. Right now all the character's faces look very much the same".
Likenesses of the real people are out (rule 5: parodied by name only, never
depicted), so each fighter got a clearly different original face built from
their own character notes, never from the real person's looks. Why they
looked alike, and what changed (render only: no `SIM_VERSION`):

- **The painter drew one face nine times.** Every sculpted head was painted
  by the same strokes (Jeff's), moved only a little by each fighter's 2D face
  values. Each sculpted fighter now has a face design, `face.style` in
  `data/models3d.js`, painted by `faces3d.js`: the eyes' shape (round,
  hooded, a smile's crescent), the iris colour, lashes, the brows' arch,
  weight and lift, the mouth at rest (Steve's serene knowing smile, Elo's
  crooked half smile, Scam's innocent one, Lizbeth's flat line, Kim's bored
  set mouth, Cathie's warm open smile), lip colour, and what the skin
  carries (bags, lines at the brow, eyes and mouth, Carl's jowl lines,
  Scam's freckles and blush, Cathie's rosy cheeks). Scam, Lizbeth and Cathie
  are `calm`: their notes say they never glare, so angry and blocking keep
  their rest mouth and open eyes (the super's cut-in shows the angry face).
  The keys are listed above `FACE_STYLE_KEYS`.
- **The heads were close to one shape.** Seven head scripts are pushed
  further (`lab/blender/fighters/*.py`, rebuilt; Jeff and Adam kept): Steve a
  long V with a long chin, Elo a broad square jaw under a small skull, Scam
  round and soft with a button nose, Lizbeth narrow with high sharp
  cheekbones, Kim a heart shape, Cathie apple cheeks and a soft jaw, Carl
  heavier jowls. The eyes and mouth stay where the layouts say, so the
  registry numbers did not move.
- **The portraits were too far away to see a face.** At `GL3D.BUST.SPAN` the
  head was a quarter of the frame. A framed portrait (select screen, HUD, VS,
  results, share card) now uses `GL3D.BUST.CLOSE` (48 rig px across, the head
  centre 0.46 down), and a visor is lighter there (0.25 against 0.45) so
  Lizbeth's stare shows through it; in a match it stays the strong band. The
  super's cut-in keeps the old framing, which its band is set to.
- **Teeth were a black slot.** Under 2 px of white inside a 1.4 px outline,
  so every grin and snarl, the cut-in's included, read as a gasp. They are
  drawn 1.7 times taller under half the line.

A fresh agent, as an art director, then judged the nine at every size
players see them (portrait, HUD, cut-in, 1280 by 720 and a phone) against
before, and its findings are in the list above and here:

- **Taken out**: a painted beard on Adam (a brown smudge), a painted hollow
  under Steve's cheekbones (a bruise; his sculpt carries it), and Kim's
  winged liner, cat eye and glossy pout. Kim's notes say flat brows, the
  heaviest lids and bored contempt; glamour was her namesake's look, not
  her character's, so she has hooded eyes, flat brows and a set mouth.
- **Likeness**: none of the nine is recognisable at game sizes, but Carl was
  the closest, and pushing his nose, ears and brows bigger drew the usual
  caricature of the man he parodies. His nose and ears are back as they
  were and his brows are plain; his jowls stay (his notes).
- **Marks the reshaping left**: a dark mark beside Elo's mouth, there even
  with no paint at all (his broader face mass pressed the cheek against the
  nostril and left a pocket the outline showed through; the review blamed
  the nose tip, and taking that back did not clear it), an ink wedge on
  Steve's longer chin, and a mark under Cathie's eye from her cheeks. All
  three are reshaped and rebuilt.
- Elo's raised brow is now the near one (the turn hid the far one), and his
  brows thinner, apart from Scam's: the two were the closest pair.
- **Not done**: at 52 px the painted features barely show, and in a match
  the heads are told apart by hair, eyewear and build alone (Steve and Carl,
  grey hair and eyewear both, by colour). Jeff's shades leave ink streaks
  down his nose and Steve's quiff has black spikes; both were there before.

In a match at 1280 by 720 a head is about 20 px tall, so there the fighters
are still told apart by hair, eyewear, build and colour, as before; the faces
read in the portraits.

Tests (`test/faces3d.test.js`): every sculpted fighter has a design in keys
the painter knows; on one head with one set of 2D values the nine designs
paint nine different faces; the renderer passes the design to the painter;
the framed portrait comes in closer and the cut-in keeps its framing; the
portrait's visor is lighter and the match's is not; teeth show at least
2 px of white wherever they are bared; a calm face bares no teeth angry.
Each fails without its part of the change. `lab/pixels.js` is identical against
8bc360e with and without `--flags gl`; it reads the 2D canvas, so the 3D
fighters were checked by renders and five 3D matches with no page errors.

## v3.17, released 2026-11-05: every move in each form, and the dash fixed

The owner, after the round start and the moves from a crouch and in the air:
"Push it live and continue". Everything below, to the v3.16 heading, went out
together, the dash fix with it (`SIM_VERSION` 10, so a v3.16 tab and a v3.17
tab cannot play each other online). The sections were written as each piece
was built.

### Walk, jump, crouch and dash in each form

The owner, offered each fighter's own walk and jump after v3.16: "yes, let's
keep going". The shared walk was one shuffle for all nine, and it stood every
fighter up to the stock rest height at one lean the moment they moved (Carl's
hunch and Kim's crouch were gone until they stopped); the shared jump was one
tuck for all nine.

- **Written from the guard.** A form's `walk` and `jump` (`forms.js`) start
  from the fighter's idle guard (`restingGuard` in `drawFighter.js`: the idle
  pose's first frame), so the stance's height, lean and hands go with them.
- **The walk** is a few numbers on one gait (`formWalk`): cadence (`rate` on
  the walk phase, render-only), stride (capped so the feet stay 20 px apart),
  how far the rear foot lags the lead (half a cycle is a walk, a quarter a
  step-and-follow), foot lift, a dip with each step, the shoulders rolling
  against the hips, arm swing, a nod of the head, and the lead hand keeping
  time. Backing off, the cycle runs the other way, so the lifted foot is the
  travelling one (the shared walk lifts the planted one backing off; the 2D
  game still does).
- **The jump** (`formJump`) eases from the shape a form leaves the floor in
  (`up`) to the one it comes down in (`down`) as the rise turns to a fall:
  the legs, the lean and, where a form throws them, the arms. The shared
  stretch and squash stay, scaled by the form's `stretch`.
- **Each fighter:** Jeff a boxer's step-and-follow with a bounce, a tight
  tuck; Adam a heavy swagger, flinging himself up with his arms up and
  stomping down; Carl stalking, slow and hunched, and a heavy hop that barely
  leaves the floor; Steve a strut with high knees and a split leap, the
  presenting hand thrown up; Elo an unhurried glide, one knee up in the air;
  Scam a sliding sidle, a lazy two-footed hop; Lizbeth a fencer's advance,
  upright and level, straight up with the legs together and the lead foot
  reaching for the landing; Kim bobbing and weaving in, a tight ball in the
  air; Cathie a slow, level glide, and the crane in the air.
- Tests (`test/forms.test.js`): every form walks at its guard's height (within
  its own dip), at its own lean, the feet never within 20 px, never under the
  floor, and the lifted foot always the one travelling, forward and backing
  off; every jump leaves the floor in its `up` shape and lands in its `down`,
  at the guard's height, the feet off the floor throughout. Both fail with the
  `computePose` change reverted, and the backing-off check fails with only the
  reversed cycle reverted.
- Render-only, 3D only: `SIM_VERSION` stays 9, and both pixel checks are
  identical. Two real matches in the page (Carl against Kim, Steve against
  Cathie) walking, backing off, jumping and through a KO run with no errors.
  A walking or jumping fighter now poses their idle guard as well each frame
  (one more `basePose`); it is not measured on a phone, but it is the same
  cost as an idle fighter's pose.

**The crouch and the dash**, the owner's "not yet, keep going" after the
walks: the last of a fighter's moving states in the shared shapes.

- **Written from the guard too** (`fromGuard`): a held shape, the hips,
  shoulders and head dropped below the guard, the lean, the feet, and the
  hands as the guard carried down with the shoulders, moved from there (as a
  form's block moves them), so whatever a hand holds stays in it. The shared
  crouch dropped everyone from the stock rest height, so Carl and Kim, already
  low in their guards, hardly went down.
- **A dash back of its own.** The shared dash leans into a charge whichever
  way it goes; each form's `dash.back` leans away (a dash goes back when
  `dashDir` is not `facing`).
- **Each fighter:** Jeff ducks as a boxer, dashes in low behind the gloves
  and pulls straight back; Adam squats sumo-wide, charges shoulder first and
  stumbles back, arms out; Carl changes level like a wrestler, shoots in
  lower still and steps back heavily; Steve goes down as if taking a knee,
  sweeps in chest first, glides back; Elo sinks with his weight back, slides
  in and leans out; Scam squats with his hand in his pocket, scurries in,
  backs off; Lizbeth sinks into a low en garde, dashes in a lunge and
  retreats upright; Kim ducks deep and darts in off the line; Cathie sinks
  over her rear foot with the lead leg long, and glides in and out.
- Tests: every crouch at least 18 px below its guard's head and 15 below its
  hips, at its own lean, feet on the floor and apart, the hands where the
  guard carried down puts them; every dash in at its own lean and every dash
  back leaning away from it. Both fail with the `computePose` change reverted.
  Both pixel checks identical without the dash fix below; real matches
  crouching, dashing back and in, and through a KO (Adam against Lizbeth,
  Cathie against Jeff) run with no errors.

### A dash with a direction held runs (`SIM_VERSION` 10)

Found while driving the dashes in a real match: a dash pressed with a
direction held never ran. `startDash` set the dash, then the walk code in the
same frame saw the direction and set the walk over it, so the cooldown went,
the dust and the sound played, and the fighter walked. Only a dash with
nothing held worked (the only kind `rosterMoves.test.js` fired), so there was
no dash back at all, and the AI, which dashes as it walks (`ai.js` checks
where `walk || f.facing` takes it), lost every dash it threw. In the game
since v1.0.

- **The fix** (`fighter.js`): the walk does not take over on the frame a dash
  starts. A regression test dashes every fighter both ways with the direction
  held; it fails without the fix.
- **It changes fights**, so `SIM_VERSION` is 10. AI against AI
  (`lab/balance.js`, Mogul): on seed 7 at 10 a pair and seed 11 at 20 a pair,
  Scam falls about 10 points and Carl gains 5 to 12; the rest move within
  the noise between the two seeds. The spread from strongest to weakest is a
  little narrower (seed 11: 27.8 to 64.1 before, 30.6 to 66.9 after).
- The 2D pixel check differs on every frame with it, and only with it: the
  seeded matches play out differently once the AI's dashes run. Without it,
  both checks are identical.
- It was its own commit, so it could have been left out; the owner released it.

### Each fighter's signature special in their form

The owner, asked whether to release the moves and the dash fix: "not yet,
keep going". In 3D every special played the basic its kind borrows
(`ATTACK_TRACK` in `data/tracks.js`): Kim's GROWTH HACK rush was one punch
held for half a second, Cathie's FUNDING ROUND a slap, Steve's PITCH DECK
STRIKE a slap, and BURN IT ALL and SAME-DAY DELIVERY, whose kinds borrow
nothing, the old computed swing.

- **A track of its own** for each signature special, in its form (FORMS
  `specials`, by the special's id; `trackedAttackPose` looks for
  `special:<id>` first). Written at the special's own reach, since there is
  no nominal to scale from, on the usual clock and from the guard and back.
  A command normal carries its archetype's params as `special` too, with no
  id, so it never plays one.
- **Each:** Jeff (SAME-DAY DELIVERY) raises the lead hand and points the order
  down onto the rival's spot; Adam (BURN IT ALL) hauls both fists overhead
  and brings them down with a step, then is winded; Carl (HOSTILE TAKEOVER)
  sinks, lunges a long way with the open hand, closes it and hauls back;
  Steve (PITCH DECK STRIKE) flicks the presenting hand once per slide, timed
  to the three shots; Elo (BURN RATE BLAST) gathers low and throws himself
  open, arms wide; Lizbeth (PIVOT PUNCH) turns away on the spot and comes out
  in a lunge, fist first; Kim (GROWTH HACK) runs in throwing both hands in
  turn, eight punches over the rush, weaving; Cathie (FUNDING ROUND) lifts the
  lead hand palm up and sweeps it out over the rival. Scam's ALIGNMENT SHIFT
  is a stance switch that never becomes an attack, so it has none; a
  flourish for it would have to be read from the stance cooldown.
- Tests: every signature special but Scam's has its own valid track, starts
  and ends in the guard, differs from the borrowed basic in the middle, and a
  command normal of the same kind still plays the basic. Fails with the
  lookup reverted. Both pixel checks identical; real matches firing Kim's,
  Adam's and Cathie's run with no errors.

### The steal and the bomb in each form

The owner, again: "not yet, keep going". The two moves every fighter has
borrowed a basic in 3D: the energy steal the punch, the bomb the slap. A
throw needed nothing: only Carl throws, HOSTILE TAKEOVER has its own track
above, and his ASSET SEIZURE command grab plays his punch, which is already
a seizure.

- **By kind** (FORMS `moves`; `trackedAttackPose` looks for `kind:<kind>`
  after a signature special and before the borrowed basic). A steal reaches
  in at `STEAL.reach`, the hand closing on what it takes and bringing it
  home; a bomb is lobbed, leaving the hand as the active window opens, which
  is when `Game.spawnBomb` sends it.
- **Each:** Jeff snatches it like a jab and lobs overhand from beside his ear;
  Adam swipes across with his weight behind it and heaves overhand from a
  big wind-up; Carl takes it with the reaching hand and tosses underhand,
  the briefcase kept back; Steve lifts it and holds it up for the crowd, and
  flips the bomb up showily; Elo swipes lazily up from the dropped hand and
  flicks it sidearm; Scam's hand comes out of his pocket for both, and goes
  straight back in; Lizbeth thrusts the open hand along her line and throws
  like a dart; Kim darts in under it and flicks the bomb from her guard;
  Cathie reaches slowly, palm up, as if accepting it, and releases the bomb
  underhand.
- Tests: every form has both, valid, from its guard and back with the lead
  hand's shape, and neither is the borrowed basic in the middle. Fails with
  the lookup reverted, and with Adam's first key left without its fist (an
  unshaped first key takes the next key's open hand). Both pixel checks
  identical; real matches with Adam and Scam stealing and throwing run with
  no errors.

### The command moves in each form

"Not yet, keep going", once more. Each fighter's command moves (forward and a
basic) borrowed the form's basic for that button: Lizbeth's THE DEMO, a
counter that swings nothing, was her slap; Kim's RUG PULL, a trap laid on
the floor, her kick; Adam's BLITZSCALE rush one haymaker held for the run.

- **By input** (FORMS `commands`, keyed by the slot such as `fwd+kick`; a
  form is one fighter's, so the input names the move, for a human playing
  the fighter as for the computer). `trackedAttackPose` looks for
  `cmd:<slot>` after a signature special and before a move's kind.
- **Each:** Jeff (UNDERCUT) kicks low at the shins with his guard kept up;
  Adam (BLITZSCALE) runs you down throwing three haymakers; Steve (ONE MORE
  THING) raises the presenting hand beside his head, then drives the palm
  up; Elo (PLATFORM BURN) lifts the lead knee and stamps, the hands dropping
  open; Scam (SAFETY MEMO) flicks two memos from the pocket hand, timed to
  the two shots; Lizbeth (THE DEMO) holds the demo up palm out and waits
  through the counter's window; Kim (PUMP) throws a short shovel punch up
  from her crouch, and (RUG PULL) goes right down with both hands on the
  floor and yanks the rug back; Cathie (CONVICTION BUY) lifts the lead hand
  high, palm up, once. Carl's ASSET SEIZURE keeps his punch, a seizure
  already.
- Tests: nine command moves with their own valid tracks, built as
  `Fighter.startAttack` builds them, from the guard and back, none the
  borrowed basic in the middle. Fails with the lookup reverted. Both pixel
  checks identical; real matches firing Kim's RUG PULL, Jeff's UNDERCUT and
  Lizbeth's THE DEMO run with no errors.

### Going into the super in each form

The owner: "keep going without pushing", so from here the branch is
committed locally and not pushed until the owner says.

UNICORN MODE freezes the game for `UNICORN.POP_FREEZE` (0.45 s) with a
banner, and the fighter stood frozen in whatever they were doing.

- **Each form's own pose** (`super` in `forms.js`), held while the super's
  timer (`unicornT`) is full, which it is through the freeze, and eased out
  over `fade` seconds as it starts to run; only standing (idle, walk,
  crouch), never over a swing. Read from the timer, never written. The blend
  lands exactly on the pose at full weight (`a * (1 - w) + b * w`; the other
  form left Lizbeth's lean 1e-17 off).
- **Below the head.** The banner (`FX_ART.CUTIN.SUPER_DUR`, 1.1 s) covers the
  screen above the fighters' heads for longer than the pose lasts, so the
  first versions with the arms thrown up (Adam, Steve, Kim) showed nothing
  but a body. Every pose keeps the hands at or below the head, and a test
  holds it there. The banner covers every fighter's head during the freeze
  and shows their face as a portrait in the band instead, so a pose reads
  from the shoulders down; Adam's, standing, was lost in it, and after
  v3.17 he roars from a wide squat with his arms out, under it.
- **Each:** Jeff roars, fists clenched at his sides and chest out; Adam roars
  with his arms wide at his shoulders; Carl straightens up for once, the
  briefcase raised beside him; Steve takes a showman's bow; Elo opens up,
  arms flung out; Scam takes both hands out of his pockets, palms up, and
  shrugs; Lizbeth puts a hand on her hip and unveils with the other; Kim
  coils lower behind crossed forearms; Cathie opens her arms, palms up, and
  comes out of it slowest.
- Tests: the pose at a full timer, gone after `fade`, never over a punch,
  the hands below the head. Fails with the pose switched off. Both pixel
  checks identical; UNICORN MODE in two real matches runs with no errors.

### Opening the round in each form

The fighters stood idle and locked through ROUND and FIGHT! (1.55 s,
`ROUND.INTRO_ROUND_T` and `INTRO_FIGHT_T`), and the renderer was not told
the round was starting.

- **The round's start reaches the pose** as `setClock3D` reaches the 3D rig:
  the render loop calls `setRoundStart(game.state === 'intro' ? game.stateT
  : null)` before it draws the fighters (all three of `renderSharp`,
  `renderLayered`, `renderWorld`), and `drawFighter` passes it to
  `computePose` as its new last argument, `intro`. A form's `intro` track
  runs from 0 to 1 across the two, ends in the guard by 0.85 and hands over
  to the live idle by 1, so FIGHT! begins exactly as before. Only standing
  idle, only with a form: the 2D game never sees it.
- **Each:** Jeff taps his gloves together twice; Adam slaps his chest twice,
  head back; Carl stands straight to fix a cufflink, then hunches; Steve
  waves to the crowd; Elo beckons you on; Scam rocks on his heels with both
  hands in his pockets; Lizbeth gives a fencer's salute; Kim waves up and out
  at the camera, then drops into her shell; Cathie opens a tai chi form, the
  arms floating up and pressing down.
- The big ROUND text covers the fighters' upper bodies for its first second,
  so in play the gestures show around it more than under it; retiming them
  into FIGHT! is the lever if that matters.
- Tests: each form's gesture at the round's first frame, different from the
  idle part way, the live idle exactly by FIGHT!, nothing in a walk, nothing
  in 2D. Fails with the gesture switched off. Both pixel checks identical
  (their frames are mid-round); a real match through the round's start runs
  with no errors.

### Scam's ALIGNMENT SHIFT shows

The one signature special left without a pose: a stance switch never
becomes an attack (`Fighter.startSpecial` switches and goes back to idle),
so there was nothing to draw.

- **Read from the switch's cooldown** (`stanceCD`, `STANCE.CD` 0.8 s, and
  `stanceId` for which way), as the super's pose is from its timer: Scam's
  form (`shift` on the fence) holds a pose for the stance he switched to for
  `hold` seconds and eases it out over `fade`, well inside the cooldown.
  Into SAFETY he shows you his palms; into CAPABILITIES he leans in with his
  arms spread. Hands below the head, under the special's banner.
- The super's pose and this one share `holdPose` in `drawFighter.js`.
- Tests: each stance's pose as he switches and still `hold` seconds on, gone
  after `hold + fade`, the two different, nothing with no stance, no other
  form with one. Fails with the pose switched off. Both pixel checks
  identical; the switch in a real match runs with no errors.

### Moves thrown from a crouch, thrown low

Holding down and attacking keeps the hurtbox crouched through the move
(`Fighter.crouching` follows down every frame on the ground, attacks
included, and is cleared by a block), but the pose played the standing move:
the fighter stood up to swing while the game went on hitting them as a
crouching one. Letting go of down mid-move stands the hurtbox up, and the
pose with it. (Reworked after v3.17 so a fist or foot stays where it hits:
see the review fixes in the section above.)

- **In 3D, the same move from the form's crouch** (`computePose`, after the
  move is posed): the hips, shoulders, head and hands dropped by the crouch's
  drops and the lean moved by its lean, the planted feet widened to its
  stance, and a foot off the floor brought down with the hips but never
  through the floor, so a kick from a crouch is a low kick (left where it was,
  it rose above the hips it came from). The 2D game is untouched.
- Tests: for a punch and a kick in every form, the move leaves from the
  crouch's height and lean, is thrown its crouch's drop lower than standing,
  and a crouching kick rises no higher above the hips than a standing one.
  Fails with the change switched off. Both pixel checks identical.

### Moves thrown in the air, from each form's jump

A move in the air played the standing move with the legs tucked by the same
18 and 12 px for everyone, whatever their own jump looked like.

- **In 3D the legs a move does not use come from the form's own jump** at
  that moment of the rise and fall (`formJump`); a kick keeps its kicking
  leg. So Steve punches in his split, Kim in her tuck, Cathie in her crane,
  Lizbeth with her legs straight. The 2D game keeps the tuck.
- Tests: rising and falling, a punch and a slap carry both of the jump's
  legs, a kick the rear one and its own kicking leg. Fails with the change
  switched off. Both pixel checks identical.

## v3.16, released 2026-11-05: hit, KO and victory in each form

The owner, shown the v3.15 moves: "I like that, let's continue"; shown the
reactions, "Yes, push v3.16 live". The last
shared poses in the 3D cast were how a fighter takes a hit, goes down and
wins; now each form has its own (`hit`, `ko` and `victory` in `forms.js`,
applied in `computePose` after the block).

- **The timing stays shared.** The snap and settle of a hit and the fall of a
  KO are still `basePose`'s, as they are for everyone; a form says where the
  arms (and for a KO the legs) go, how far a hit throws the body (`hit.lean`
  scales the lean and the head), and the hand's shape. A victory is a loop of
  its own, `carried` keys from 0 to 1 at the form's `rate`.
- **Hit:** Jeff covers up, gloves at his face, moved less than most; Adam is
  thrown about, arms flung out; Carl barely moves, too heavy; Steve sells it,
  arms thrown up; Elo takes it badly, both hands to his face; Scam gives with
  it, a hand still in his pocket; Lizbeth hardly moves, upright and stiff;
  Kim shells up, fists at her jaw; Cathie sways back a little and no more.
- **KO:** Jeff with his guard still up, Adam spread out like a starfish, Carl
  heavily with his arms at his sides, Steve with his arms flung up over his
  head, Elo with one arm flung up, Scam with his hand still in his pocket,
  Lizbeth stiff as a board, Kim with her fists still at her jaw, Cathie
  composed, a palm on her chest.
- **Victory:** Jeff both fists overhead, up on his toes; Adam flexing both
  arms, roaring; Carl straightening his tie, the briefcase at his side
  (dusting off his hands, the case came up between them and he seemed to
  clap it); Steve presenting himself to the crowd, chin up; Elo arms crossed,
  chin up, swaying; Scam both hands in his pockets and a shrug; Lizbeth quite
  still, hands clasped in front of her, staring; Kim looking at her nails,
  the other hand on her hip; Cathie breathing slowly, the arms opening palms
  up and closing again.
- Tests (`test/forms.test.js`): every form has all three; over the shared
  timing the hit and the KO put the arms where the form says, a hit still
  knocks the fighter back and a KO still puts them down; each victory is a
  valid track that loops (its last key is its first) and moves; Kim's keeps
  her hand clear of her face. Both fail with the `computePose` change
  reverted.
- Render-only, 3D only: `SIM_VERSION` stays 9, and both pixel checks are
  identical. Two real matches in the page through a KO (Adam against Steve,
  Steve against Cathie) run with no errors and show the falls.

## v3.15, released 2026-11-05: every basic move in each form

The owner, shown the kicks: "wait and release them together with each
fighter's slap and uppercut".

- **The kicks** (above, under the remodel), **the slaps and the uppercuts**:
  each form's own, written from its guard (`<FORM>_SLAP`, `<FORM>_UPPER` in
  `forms.js`). Jeff a flicked backhand and a boxer's uppercut from a dip;
  Adam a roundhouse slap carried on past and an uppercut from the floor that
  lifts him; Carl the flat of his hand in your face and a heave, the open
  hand closing on its hold; Steve a slap from high over his head and a
  springing uppercut held up for the audience; Elo a backhand off his dropped
  hand and an uppercut whipped up off it; Scam a pat and a palm lifted under
  the chin; Lizbeth a flick and a hand sent straight up along its line; Kim
  a slap from beside her ear as she bobs and an uppercut out of her deepest
  bob; Cathie a palm placed at the face and one lifted slowly under the chin.
  A fist form's slap opens the hand after its first frame and closes it on
  its last (`hand` keys), so the guard is a fist at both ends.
- Tests: every move a form has leaves from its idle guard and comes back to
  it, lead hand included, at the game's reach; each kick is out at the
  middle, each slap open at the face, each uppercut up past the head.
- Render-only, 3D only: `SIM_VERSION` stays 9, and both pixel checks are
  identical. A real match in the page runs with no errors.

## v3.14, released 2026-11-05: 3D by default

The owner, after playing v3.13: "there is a big difference between 2D and 3D.
3D looks way better, it is not because of the graphics but the character
models are built well on 3D", and "on the phone, the 3d works really
work. so lets default to that".

- **3D unless the player chooses 2D** (`graphics.js`): `Save.settings.graphics`
  is `'3d'`, `'2d'` or not chosen, which is 3D wherever the browser has
  WebGL2 (`hasWebGL2`) and the classic 2D game where it has not. v3.13 saved
  `'classic'` as everyone's default, so it reads as not chosen: a player who
  chose Classic in v3.13's few hours live is back in 3D and can switch again.
  The switch now saves `'2d'`. `?gl=0` is the 2D game whatever was chosen.
- **The first visit downloads more:** the founder model (1.3 MB, preloaded),
  each sculpt the first time it is wanted (1.5 to 2 MB; the select screen's
  portraits want all nine, about 15 MB), and the stages (1.9 MB). The models
  could be made about half the size (quantized positions, normals and
  weights, which the game's own GLB reader would have to learn), if the
  owner wants it.
- Checked in a browser: a new player, a v3.13 player and one who chose 3D
  load in 3D; one who chose 2D, or `?gl=0`, in 2D; the switch goes to 2D,
  saves `'2d'` and reloads. `test/graphics.test.js` pins each case.

## v3.13, released 2026-11-05: 2D or 3D

The owner: "we can have 2D and a 3D options and will test it out on the live
site", and, asked what to release, everything on `claude/jeff-model`.

- **2D or 3D in Settings** ("Graphics: 2D / 3D", the v3.12 switch relabelled;
  the saved values are still `classic` and `3d`). In 3D the nine roster
  fighters wear their sculpted models and fight in their own forms
  (`graphics.js` `sculpts`, `gl3d` `sculpts3D`); a player's own founder keeps
  the founder model and their own looks. `?sculpts=0` puts the roster back in
  the founder model, and `?athlete` in the athlete bodies.
- **The guard pass** (below) is live in 2D too: every fighter stands in a
  guard. `lab/pixels.js` against v3.11 reports every frame different, which
  is that change; against the tree before the release, identical.
- **The figure** (`?figure`) and the athlete bodies (`?gl&athlete`) ship
  behind their flags, unchanged.
- **v3.12** (below) goes out with it: the Settings switch and the Rookie
  Lizbeth.
- Nothing in the simulation changed since v3.11 (`SIM_VERSION` stays 9): the
  AI change is single-player only.
- Checked in a real match in a headless browser, 2D and 3D: the sculpts load
  (about 1.5 to 2 MB each, fetched the first time a fighter is drawn), fight,
  fall in a KO and celebrate, with no errors. The portraits (HUD, versus,
  results) are the sculpts' busts. They were drawn in 2D and stayed so: a
  portrait drawn before the fight's first frame asked `pending3D`, which
  looked at the founder model (preloaded, ready) instead of the sculpt still
  to be fetched, so it never queued its redraw. `pending3D` now follows the
  fighter's own model and starts its fetch, as drawing does; checked in the
  browser, before and after. Not yet measured on a phone: the owner's test on
  the live site (`&perf` shows the 3D layer's cost a frame) is the first.

## v3.12, built 2026-10-30, released with v3.13: the 3D preview in Settings

- **A Settings switch for the 3D preview** ("Graphics: Classic / 3D preview").
  Players no longer need `?gl` to try it, so real usage can inform whether 3D
  becomes the default; `solo_results.three_d` records which look each
  single-player match was played in. `src/graphics.js` decides each renderer
  flag from the address and the choice; a change reloads the page.
  ARCHITECTURE section 7.
- **A Rookie Lizbeth closes in** (`ai.rangeAt`): about 40% at Rookie, from 30%,
  and the Rookie spread 20 to 23 points. Contender and Champion unchanged.
- **`lab/pixels.js`**: the before-and-after pixel check CLAUDE.md asks for, two
  commits in one headless browser (ARCHITECTURE section 10). Identical against
  v3.11 for this release, flags off and with `--flags gl`.

## v3.11, released 2026-10-29: Rookie and Contender play alike whoever you fight

Measured with `lab/balance.js` (AI against AI, 20 per pair, seeds 11 and 12):
at Rookie Adam won 96% of matches and Lizbeth 4%, a 92 point spread; at
Contender, 50 (Adam 82%); at Champion, 37. Neither of the global knobs tried
narrowed it: a level-wide appetite for a character's own move (Adam still
93% at a quarter of it), or how much a character's preferred range counts.
The easier levels cannot answer some kits at all (Adam's three-hit rush,
Carl's grab, Elo's burn: with every signature move off, Carl, Adam and Elo
still beat a base founder 80 to 90% at Rookie) and cannot play others (a
counter, a rain from range).

So each roster character now has its own hesitation at Rookie and Contender
(`ai.ease` in `fighters.js`, added to the level's `mistake`, capped at
`AI_EASE.MAX`, checked by the schema), and Champion has none. The values were
found by `lab/balance.js` iterated toward a 38 to 62% band (its new `--ease`
and `--patch` options try values without editing files) and checked on seeds
13 and 14. Spreads now: Rookie 27 to 31 points (Lizbeth 30%, the rest 47 to
62%), Contender 21 to 25, Champion 37 exactly as before. AI only and
single-player only, so `SIM_VERSION` stays 9; a player's ghost has no ease.
`test/ease.test.js` pins the mechanism, Champion and the schema.

## v3.10.2, released 2026-10-29: single-player results are noted

After a single-player match against the roster, the client reports how it
ended to `report_solo()` (Backend, below), so the difficulty levels can be
tuned on players rather than on AI stand-ins (decision 7). Nothing about the
player is kept. Applied to Supabase with the owner's OK on 2026-10-29.

## v3.10.1, released 2026-10-29: 3D that stays 3D

Two fixes to the 3D path, both render-only. A lost WebGL context (a phone
taking the GPU back) is now rebuilt when the browser restores it, where it
used to leave the fighters 2D for the rest of the session; and hair and coats
sway on the match's clock, so a hitstop freezes them and the KO slow motion
slows them. ARCHITECTURE section 7 has both. Also `lab/balance.js --against`,
which measures each roster AI against one opponent (decision 7).

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
1. **Whether 3D becomes the default.** Settled: the owner made it the default
   in v3.14, on how it ran on his iPhone. A mid-range phone is still unmeasured
   (Next steps, step 1). The 2D rig stays either way: it is the fallback without
   WebGL2 and when the GPU context is lost, and the Settings choice.
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
7. **Balance as the AI plays it.** Champion: Jeff (29%) and Elo (28%) are the
   bottom, Lizbeth, Steve, Scam and Cathie (62 to 65%) the top, a 37 point
   spread; untouched by v3.11. Rookie and Contender were evened out in v3.11
   (its section): a 92 point spread at Rookie and 50 at Contender, now about 30
   and 25. Lizbeth, the weakest at Rookie (about 30%, at the floor of the
   mechanism), now closes to mid range there (`ai.rangeAt`, v3.12): about 40%,
   and the Rookie spread 20 to 23. How hard the levels are for a person, as opposed to how alike
   they are, is what `solo_results` (v3.10.2) is for: the AI stand-in for a
   player (`--against b-neo:<level>`) still loses to almost the whole roster,
   but a base founder has no signature move, so it says little about people.
   `lab/balance.js` measures it all; it measures how well the AI plays each kit
   as much as the kits themselves.
8. **What a shield does to a throw.** When LEGAL SHIELD absorbs a grab, `doGrab`
   sends the victim toward the grabber (`def.vx = -dir * 220`) while the grabber
   recoils (`att.vx = -dir * 160`), so both slide the same way and end touching:
   Kim 60 px from Carl ends 51 px away, the minimum body gap. The other two
   OBJECTIONs (on a strike and on a steal) push the victim away. It reads like a
   slip of sign, but it may have been meant to let the victim punish a grabber
   stuck in a long recovery. Flipping it is one sign, but it changes what a live
   match computes, so it needs a `SIM_VERSION` bump (to 11: v3.17's dash fix
   took 10); left as it is.

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
   For the everyday check, that the classic game is unchanged, `lab/pixels.js`
   (2026-10-30) compares two commits in one browser and needs no baseline.

## Known limits

- Phone performance: measured only on the owner's iPhone, a recent and fast
  model (see Next steps, step 1). A mid-range phone, which the 2 ms budget is set
  for, is still unmeasured.
- The 3D layer differs from the copy path in three small ways: an aura drawn by
  the fighter in front does not wash over a 3D fighter behind it, every trail
  lies over every 3D fighter, and 3D edges are crisper (ARCHITECTURE section 7).
- Kim's ring light still sits off-square in a bust; body knobs still scale bones.
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
- `solo_results` (since v3.10.2) records how single-player matches against the
  roster AI end: opponent, level, win or loss, rounds, KO rounds, game version
  and whether 3D was on. No user id and nothing personal. RLS is on with no
  policies and no grants, so no client can read or write it; the
  security-definer RPC `report_solo()` writes it for a signed-in player, checks
  every field (a best of three, a known level, an id-shaped opponent), and
  refuses more than 120 rows a minute in all. Ghost challenges, two-player and
  online matches are not sent (`soloReport` in `src/net/cloud.js`). Only the
  owner reads it, from the dashboard's SQL editor, for example:
  `select opponent, level, count(*) as n, round(avg(won::int) * 100) as player_win_pct from solo_results group by 1, 2 order by 2, 4;`
  The security advisor flags its "RLS enabled, no policy" and the RPC being
  callable when signed in; both are intended, as for `report_match()`.
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
