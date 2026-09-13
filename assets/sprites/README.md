# Baked fighter sprites

Generated offline by `lab/bake-all.html` from a rigged 3D model, then shipped
as plain PNG atlases. **The game never loads a GLB**, so nothing here adds a 3D
dependency to the bundle.

Each state is one horizontal strip of equal-width frames. `manifest.json`
carries the frame size, the frame count and loop flag per state, and the
`anchor`: the fighter's ground point within a frame, so sprites are positioned
by the feet exactly as the procedural renderer was.

## Status

Dormant. These atlases load only when the URL carries `?sprites`, and they then
replace every fighter with the same founder model. The experiment was paused in
July 2026; `docs/CHARACTER-ART-BRIEF.md` records why. The rig has grown since, so
this idle draws about 158px tall against a procedural fighter of about 200px
(see `SPRITE_HEIGHT` in `src/engine/drawFighter.js`).

## Regenerating

Not possible from a fresh clone. The bake reads `lab/assets/*.glb` and writes to
`lab/atlas/`, and both are gitignored: the models live only on the machine that
made them. With those files present, run `lab/bake-all.html` through
`python3 dev-server.py 4173`, then copy the output from `lab/atlas/` into this
folder by hand.

See `lab/jobs.json` for the animation clip ids, `lab/clip-map.json` for why each
was chosen, and `lab/glb.js` for the skinning and rasterizer.
