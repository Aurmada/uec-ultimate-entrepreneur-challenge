# UEC: Ultimate Entrepreneur Challenge

A browser arcade fighter in vanilla JavaScript, Canvas and Web Audio, with no build step. The repo is the deployed site: GitHub Pages serves `main`, so **a push to `main` is a release**.

Read in this order: `docs/HANDOFF.md` (where things stand, what is next, what the owner still has to decide), `docs/ONBOARDING.md` (run it, drive it from a script, test it), `docs/ARCHITECTURE.md` (why it is shaped this way, and the hazards).

## Branches

- `main`: the live game (see `VERSION` in `src/config.js`; v3.9.3 in late October 2026). `docs/HANDOFF.md` lists the other branches and which are released.
- `live-3d`: the 3D prototype (3D fighters, Blender-rendered stages, fighting-game effects, all behind `?gl`). Built on top of `main`, pushed, **not merged**. Prototype work continues here.

## Run and test

```bash
python3 dev-server.py 4173    # then http://localhost:4173/?debug=1  (add &gl for the 3D prototype)
npm test                      # Node 21+, no npm install: there are no dependencies
```

- Use `dev-server.py`, not `python3 -m http.server`: it sends no-cache headers (plain servers serve stale modules) and accepts `PUT`, which the `lab/` tools use to save images. Large `PUT` bodies are rejected, so lab sheets save as JPEG.
- `.claude/launch.json` defines the same server for preview tools.
- `?debug=1` exposes `window.UEC`. ONBOARDING section 5 lists the traps (the sign-in and profile gates, the tutorial gate, `p1Def` is the human slot, wait for `game.state === 'fighting'`).

## Rules (the owner's, all standing)

1. **Zero dependencies, zero build step.** No npm runtime packages, bundler, framework or 3D library. The only external load is the Supabase client from the jsDelivr CDN.
2. **Determinism.** Live matches are 60 Hz lockstep. Anything that affects the simulation (frame data, hurtboxes, damage, stats, move properties) lives in `src/config.js` or the character schema and is identical on both peers. Rendering, animation poses, the 3D path, stages and effects are render-only and never feed back into the simulation; `test/determinism.test.js` enforces part of this structurally. Render code must never call `fx.hitstop`: it is simulation time.
3. **Bump `SIM_VERSION`** in `src/net/online.js` whenever fight behaviour changes, and **`VERSION`** in `src/config.js` for every release.
4. **All gameplay numbers** live in `src/config.js` or the schema. No magic numbers in engine files.
5. **Originality.** Every character, name, piece of art and sound is original. No Street Fighter, Mortal Kombat or other franchise characters, names, named moves, sounds or assets: those games are genre inspiration only. Real people are parodied by name only, never depicted. No generative asset services; art is code or scripted Blender.
6. **Privacy and safety.** Never put emails in the world-readable `profiles` table. Every user-authored string goes through `esc()` before `innerHTML`.
7. **Push or deploy only when the owner explicitly asks.** Anything that creates or changes paid resources (Supabase) needs the owner's OK first.
8. **Writing.** Docs and comments in Canadian English, no em dashes. Comments explain why, in the voice already in the file.
9. **Performance.** The 3D rig should stay within about 2 ms a frame, worst case, on a mid-range phone. Not yet measured on a phone.

## Before calling something done

- `npm test` passes, and a regression test you add fails without your fix (revert the fix and watch it fail).
- With the flags off, the default game must look exactly as it did. Pixel baselines are machine-specific, so compare before and after in the same browser (ARCHITECTURE section 10).
- Markdown in this repo is published by GitHub Pages' Jekyll build, which reads Liquid tags first: two opening curly braces in a row, or an opening curly brace followed by a percent sign, anywhere in a `.md` file (code spans included) can fail the deploy. Write them some other way.

## Environment

- Blender 5.0 is needed only to rebuild the prototype's model and stages on `live-3d` (`assets/models/founder.glb`, `assets/stages/`, scripts in `lab/blender/`). The built files are committed.
- Keep the checkout out of iCloud-synced folders (`~/Documents`, `~/Desktop`): iCloud evicts files from `.git` and git hangs. See HANDOFF.
