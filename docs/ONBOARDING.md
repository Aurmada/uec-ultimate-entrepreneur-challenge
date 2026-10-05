# UEC: onboarding

You are picking up a browser fighting game. This document gets you from a fresh
clone to making a change with confidence. Read `ARCHITECTURE.md` afterwards when
you want to know why the code is shaped the way it is.

Expect to be productive within an hour. The codebase is roughly 11,000 lines of
plain JavaScript with no framework to learn.

---

## 1. Run it

You need Python 3 (for the dev server) and Node 21 or newer (for the tests; the
test script passes a quoted glob to `node --test`, which older versions reject).
Nothing else. There is no `npm install`, because there are no dependencies.

```bash
python3 dev-server.py 4173
```

Open `http://localhost:4173/?debug=1`.

That is the whole setup. The dev server is under 40 lines and does two things a plain
static server does not: it sends `Cache-Control: no-store` so a reload always
picks up your edit, and it accepts `PUT` so browser side tools can write files
back into the repo. Neither exists in production.

`?debug=1` exposes a `UEC` object on `window`, which is how you drive the game
from the console without clicking through menus. It is worth using from day one.

Run the tests:

```bash
npm test
```

324 tests on `main` at v3.8 and 374 on `live-3d` (October 2026), about a
second, no framework. They should all pass on a clean checkout. If they do not,
stop and find out why before changing anything.

---

## 2. What you are looking at

A 2D fighting game. Two founders, best of three rounds, sixty seconds each.
Single player against AI, or two players live over the network. The characters
are parodies of disgraced tech founders, and their moves are startup themed:
Pitch Deck Strike, Hostile Takeover, Unicorn Mode.

Live at
`https://firdous-aurmada.github.io/uec-ultimate-entrepreneur-challenge/`.

The important thing to understand before you open a file: **the repo is the
deployed artifact.** There is no build step. The browser loads `src/*.js` as
native ES modules, so the file you edit is literally the file that runs, and
deploying is `git push`. This is a deliberate constraint, not an oversight.

Two branches matter. `main` is the live game (v3.8): a push to it deploys.
`live-3d` is the 3D prototype (3D fighters, rendered stages, hit effects, all
behind `?gl`), built on top of `main` and not merged yet. Read
`docs/HANDOFF.md` before working on either: it says where things stand, what
is next, and which decisions belong to the owner.

---

## 3. Tour

Start with these five files, in this order. They will give you most of the mental
model.

| Read | Why |
| --- | --- |
| `src/config.js` | Every gameplay number in the game, heavily commented with the reasoning. Reads like design documentation. |
| `src/data/fighters.js` | The nine characters as plain data. Shows exactly what a character is. |
| `src/engine/fighter.js` | The fighter state machine. Where inputs become attacks. |
| `src/engine/game.js` | The match controller, and where hits are actually resolved. |
| `src/engine/drawFighter.js` | The renderer. The largest and most delicate file; skim it, do not study it yet. |

Everything else:

```
index.html      one page, every screen is a <section class="screen">
styles.css      all UI chrome. The fight itself is canvas.
src/main.js     app shell: routing, match lifecycle, the UEC debug object
src/state.js    save data, profile, challenge link encoding
src/engine/     simulation and rendering
src/data/       characters, arenas, moves, schema and power budget
src/ui/         HUD, screens, result card, tutorial
src/net/        live multiplayer, Supabase persistence
incubator/      character authoring tool (see section 9)
lab/            measurement harnesses
test/           node --test
```

---

## 4. Make your first change

A good first exercise, because it touches data only and the result is obvious.

Open `src/data/fighters.js`, find the entry with `id: 'zara'`, and change her
suit colour:

```js
c: { skin: '#8a5a3b', suit: '#e332a9', /* ... */ }
```

Reload the browser. That is the entire cycle. No build, no watcher, no restart.

To get into a fight quickly without clicking through the menus, open the console
and use the debug hooks. Sign in first:

```js
UEC.signInAs({ id: 'test-uid', email: 'you@example.com' });
```

`signInAs` takes a user **object**, not an email string. A string is truthy so it
appears to work, but `currentUser()` then returns the string and everything that
reads `user.id` (profile save, cloud reporting) silently gets `undefined`.

then start a match directly:

```js
const { getFighter } = await import('./src/data/fighters.js');
const { getArena }   = await import('./src/data/arenas.js');
const { Save }       = await import('./src/state.js');
Save.data.tutorialSeen = true;   // or startMatch shows the tutorial instead
UEC.startMatch({
  mode: 'solo',
  p1Def: getFighter('dex'),      // NOTE: p1Def is the HUMAN slot
  p2Def: getFighter('zara'),
  arena: getArena('boardroom'),
  difficulty: 'founder',         // KEY, not label. See below.
  isChallenge: false,
});
UEC.skipSplash();                // AFTER startMatch: it dismisses the VS splash
```

`skipSplash` only has something to skip once `startMatch` has put up the VS
splash; called before, it does nothing and the match sits paused for 1.6 seconds.
On a fresh save, `startMatch` shows the tutorial rather than a fight, which is
why the snippet marks the tutorial seen first.

Difficulty **keys** are `intern` / `founder` / `mogul`. The names on screen
(`ROOKIE` / `CONTENDER` / `CHAMPION`) are labels in `AI_LEVELS` and are not
accepted here. An unknown key falls back to `founder` without warning, so a
typo looks like it worked.

Other hooks that save time: `UEC.setHP(i, v)`, `UEC.setEnergy(i, v)`,
`UEC.setTimer(v)`, `UEC.game` (the live match object), and
`UEC.step(seconds = 1, dt = 1/60)` to advance the simulation by hand and render
the result.

---

## 5. Driving the game from a script

You will want this constantly, and there are four traps that will each cost you
half an hour if you meet them cold.

**The round opens in `intro` and throws away inputs pressed then.** Wait for
`game.state === 'fighting'` before pressing anything, or force it. A harness that
presses on frame 0 will report every move in the game as broken.

**To control a fighter, replace its controller.** `HumanController` overwrites
`fighter.pad` every frame, so setting the pad directly does nothing.

```js
const EMPTY = { left:0, right:0, up:0, down:0, block:0, slap:0, punch:0,
                kick:0, launch:0, special:0, super:0, bomb:0, dash:0, steal:0 };
fighter.controller = { isHuman: true, update(f) { f.pad = { ...EMPTY, punch: 1 }; } };
```

**`pressed()` is a rising edge.** Holding a button fires the move once. To fire
repeatedly, pulse it (a few frames on, a few off).

**Meter is `fighter.energy`, not `fighter.meter`.** Set it to `METER.MAX` before
testing a special, or the move will silently fail to fire and look broken.

---

## 6. Tests

```bash
npm test                                    # everything
node --test test/rosterMoves.test.js        # one file
```

The simulation is fully headless, so tests drive real matches rather than
mocking. `test/rosterMoves.test.js` is the best example to copy from: it builds a
`Game`, waits for the round to go live, presses a button, and checks something
happened.

Two habits this codebase expects:

**Test that the button does something.** Checking that a move's numbers are
well formed is not the same as checking it works. Three moves once shipped that
played their animation, printed their popup, and did nothing at all, for months,
with a green test suite.

**Verify your regression test fails without your fix.** Revert the fix, watch it
go red, restore it. A test that passes either way is documentation, not a guard.

---

## 7. Deploying

```bash
git push
```

GitHub Pages serves `main` at the repo root. A build takes 30 to 60 seconds.

Before you push:

1. `npm test` passes.
2. Bump `VERSION` in `src/config.js`. It renders on the title screen and it is
   how you tell what is actually live.
3. If you changed **fight behaviour** (damage, frame data, hit resolution, how an
   archetype resolves), also bump `SIM_VERSION` in `src/net/online.js`. See
   section 8.
4. Add a section to `README.md`. The existing ones are written for players, not
   engineers; match that voice.

Verify the deploy rather than trusting it. Fetch the deployed file and read the
value back:

```bash
curl -s "https://firdous-aurmada.github.io/uec-ultimate-entrepreneur-challenge/src/config.js?c=$RANDOM" | grep VERSION
```

---

## 8. The one rule that will bite you

**The simulation decides what happens. Rendering decides what it looks like.
Never let render data flow back into the simulation.**

Live matches are 60 Hz lockstep: both peers run the same simulation from the same
inputs and compare a state hash every 120 frames. If a pose can influence a
hitbox, two clients with different animation data diverge, and it surfaces two
seconds later as a voided match that looks like a network fault.

Colours, faces, stances, motion shaping and lighting are render only. You can
change any of them freely with no version bump. Frame data, damage, reach,
archetype behaviour and body proportions are simulation.

If you change fight behaviour, bump `SIM_VERSION`. It is easy to skip because
the character data can be byte identical while the behaviour differs, in which
case mismatched clients shake hands happily and then diverge on the first use of
the changed move.

---

## 9. The Incubator, and what is not finished

`incubator/index.html` is the character authoring tool. It is an admin surface,
not linked from the game, and it holds no secrets, but the repo is a published
static site, so treat it as unlisted rather than private.

It is genuinely good at what it does. It edits the same object shape the shipped
roster uses, validates through the same validator the netcode uses, prices
through the same budget, and previews through the real renderer. There is no
second implementation of anything.

**And then the character goes nowhere.**

This is the known, deliberate gap, and it is the most important thing to
understand if you are picking up the character engine:

* The Incubator writes to `src/data/authored.js` through the dev server's `PUT`.
* `authored.js` exports `AUTHORED`, an array with one authored character in it.
* **Nothing imports `AUTHORED`.** Confirm it yourself: `grep -rn "AUTHORED" src/`
  returns only the export itself and unrelated matches for `AUTHORED_REST`.

So the pipeline is: author a character, validate it, price it, preview it,
export it, and then it is a file no code reads. To actually field one you must
hand copy it into the `FIGHTERS` array in `src/data/fighters.js`.

That last step, wiring authored characters into the game as a first class thing
rather than a copy and paste, is what "the character engine" still needs. Related
open questions the next person should expect to answer:

* Where do authored characters live at run time? Spread into `FIGHTERS`, or a
  separate pool the select screen merges?
* How does the roster stay balanced when it can grow? The budget prices a
  character, but nothing currently gates a roster entry on its band.
* How do authored characters travel over the network? The codec handles curated
  player moves by id (so the numbers cannot be forged), but an arbitrary authored
  character has no id on the far side.
* Does an authored character need its own art, or does it compose from the
  existing hair, outfit and accessory sets?

---

## 10. A pattern to expect

Six separate defects found in this codebase in a single week were all the same
shape: **a system built correctly, then fed nothing.**

* Command normals: the resolution system worked; two of nine characters used it.
* Animation overrides: the mechanism worked, with validation and tests; four of
  nine characters used it, all only for the idle pose.
* Facial expressions: the system worked; all nine characters shared one set of
  values, so the cast had one face.
* Stances: keyed to fighting style, so nine fighters shared five postures.
* Projectile command normals: the tick ran, but its counters were seeded on one
  code path and not the other, so the move fired nothing, ever.
* The power budget: it read a move's `params` but priced only damage, so a
  0.05 second counter window and a 60 second one cost the same.

The features here are generally in better shape than the data flowing into them.
When something feels generic or broken, check whether the mechanism exists and is
simply unused before you build a new one. It usually does.

---

## 11. Further reading

| Document | Contents |
| --- | --- |
| `docs/HANDOFF.md` | Where the project stands, what is next, open decisions, and what lives only outside the repo. Start here. |
| `docs/ARCHITECTURE.md` | System design, the simulation and rendering boundary, netcode protocol, the budget, rendering pipeline, known hazards. On `live-3d`, section 7 also covers the 3D prototype. |
| `docs/GAME-MATH.md` | Damage, combos, stats, progression. The balance maths. |
| `docs/CHARACTER-ART-BRIEF.md` | The art direction problem, written for an outside reviewer. |
| `docs/AUTH-SETUP.md` | Google and Microsoft sign in credentials for Supabase. |
| `README.md` | Player facing. Also the release history, newest first. |
