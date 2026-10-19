// Rendered stages: the arenas of the live 3D prototype (?gl). RENDER-ONLY.
//
// An arena with a `stage` entry has been built in Blender
// (lab/blender/build_stage.py) into three files: a picture of the stage, a
// glow layer holding only what gives off light, and where its live screens
// sit. The renderer draws those in place of the arena's procedural backdrop:
// the picture, the glow breathing over it, and each screen painted live by the
// arena, so a sponsor board keeps cycling sponsors. With the flag off, or until
// the files arrive, the procedural arena draws exactly as before.
//
// Parallax. A stage built with depth layers is drawn from them instead of the
// one picture: the far distance, the floor, and bands of the room, each moved
// against the fight lane by its own depth when the camera pans (STAGE_ART
// PARALLAX). Nothing moves until the camera does, so a still frame is the
// picture. Only the layers are loaded then, never the picture as well.

import { STAGE, STAGE_ART } from '../config.js';
import { FILTER_OK } from './drawFighter.js';

const { W, H } = STAGE;

export const STAGES = { enabled: false };
const stages = new Map();                 // arena id -> { ready, failed, spec, back, glow }, least recent first

// The arena's stage once it has loaded, else null (and it starts loading).
export function stageFor(arena) {
  if (!STAGES.enabled || !arena?.stage) return null;
  let s = stages.get(arena.id);
  if (!s) {
    s = load(arena);
    stages.set(arena.id, s);
    for (const id of stages.keys()) {
      if (stages.size <= STAGE_ART.KEEP) break;
      stages.delete(id);                  // its images go with it
    }
  } else if (stages.size > 1) {
    stages.delete(arena.id);              // most recently used goes last
    stages.set(arena.id, s);
  }
  return s.ready ? s : null;
}

function load(arena) {
  const s = { ready: false, failed: false, arena };
  // Resolved against this module, not the page, as gl3d resolves its models.
  const dir = new URL(`../../${arena.stage.dir}/`, import.meta.url);
  const image = (name) => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`${arena.stage.dir}/${name} did not load`));
    img.src = new URL(name, dir).href;
  });
  fetch(new URL('stage.json', dir))
    .then((r) => {
      if (!r.ok) throw new Error(`${arena.stage.dir}/stage.json: ${r.status}`);
      return r.json();
    })
    .then((spec) => {
      if (STAGE_ART.PARALLAX && spec.layers?.length) {
        return Promise.all(spec.layers.map((L) => Promise.all([
          image(L.file),
          L.glow ? image(L.glow) : null,
        ]).then(([img, glow]) => ({ ...L, img, glow: glow && soften(glow, L.rect) }))))
          .then((layers) => Object.assign(s, { spec, layers, ready: true }));
      }
      return Promise.all([image('back.webp'), image('glow.webp')])
        .then(([back, glow]) => Object.assign(s, { spec, back, glow: soften(glow), ready: true }));
    })
    .catch((e) => {
      s.failed = true;
      console.warn('[stage]', e);
    });
  return s;
}

// The glow is blurred once, here, into a halo at world size (it needs no more
// resolution than that); per frame it is only blended. A layer's glow covers
// only the layer's rect, so its halo gets a margin to spread into, and
// `rect` comes back with it. Without canvas filters it stays sharp.
function soften(img, rect = [0, 0, W, H]) {
  if (!FILTER_OK) return { img, rect };
  const pad = rect[2] >= W && rect[3] >= H ? 0 : STAGE_ART.GLOW_BLUR * 3;
  const c = document.createElement('canvas');
  c.width = Math.ceil(rect[2] + pad * 2);
  c.height = Math.ceil(rect[3] + pad * 2);
  const g = c.getContext('2d');
  g.filter = `blur(${STAGE_ART.GLOW_BLUR}px)`;
  g.drawImage(img, pad, pad, rect[2], rect[3]);
  return { img: c, rect: [rect[0] - pad, rect[1] - pad, c.width, c.height] };
}

// How far a layer at parallax `p` is moved against the fight lane when the
// camera has panned `pan` world px from the centre the stage was rendered
// for: the lane (1) not at all, the sky (0) all the way with the camera.
export function layerShift(p, pan) {
  return pan * (1 - p);
}

// The floor shears: each row moves at the rate of its own depth, which is a
// straight line in the row, 0 at the horizon and 1 at the floor line. As a
// canvas transform that is one skew, x += shift(row).
export function floorSkew(spec, pan) {
  const k = pan / (STAGE.FLOOR - spec.horizon);
  return [1, 0, -k, 1, k * STAGE.FLOOR, 0];
}

// How bright the glow is at time t: it breathes between LOW and HIGH.
export function glowAt(stage, t) {
  const G = { ...STAGE_ART.GLOW, ...(stage.arena.stage.glow || {}) };
  return G.LOW + (G.HIGH - G.LOW) * (0.5 + 0.5 * Math.sin(t * G.RATE));
}

function drawGlow(ctx, glow, alpha, dx = 0) {
  if (!glow || alpha <= 0) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = alpha;
  const [x, y, w, h] = glow.rect;
  ctx.drawImage(glow.img, x + dx, y, w, h);
  ctx.restore();
}

// Draws the stage over the world rect (0, 0, W, H) in world px, under whatever
// transform ctx already carries: the native world canvas, or the screen under
// the camera for sharp fighters. `pan` is how far the camera has moved from
// the centre of the stage, in world px: what the layers move by.
export function drawStage(ctx, stage, t, pan = 0) {
  const glow = glowAt(stage, t);
  if (stage.layers) {
    for (const L of stage.layers) {
      const [x, y, w, h] = L.rect;
      if (L.kind === 'floor') {
        ctx.save();
        ctx.transform(...floorSkew(stage.spec, pan));
        ctx.drawImage(L.img, x, y, w, h);
        drawGlow(ctx, L.glow, glow);
        ctx.restore();
      } else {
        const dx = layerShift(L.p, pan);
        ctx.drawImage(L.img, x + dx, y, w, h);
        drawGlow(ctx, L.glow, glow, dx);
      }
    }
  } else {
    ctx.drawImage(stage.back, 0, 0, W, H);
    drawGlow(ctx, stage.glow, glow);
  }
  const painters = stage.arena.stage.screens || {};
  for (const [id, quad] of Object.entries(stage.spec.screens)) {
    const paint = painters[id];
    if (!paint) continue;
    // A screen faces the camera, so its quad is a rectangle, possibly scaled:
    // map a w x h box onto it from three corners. It moves with the layer it
    // hangs in.
    const [tl, tr, , bl] = quad;
    const w = Math.hypot(tr[0] - tl[0], tr[1] - tl[1]);
    const h = Math.hypot(bl[0] - tl[0], bl[1] - tl[1]);
    const dx = stage.layers ? layerShift(stage.spec.screenP?.[id] ?? 1, pan) : 0;
    ctx.save();
    ctx.transform((tr[0] - tl[0]) / w, (tr[1] - tl[1]) / w, (bl[0] - tl[0]) / h, (bl[1] - tl[1]) / h, tl[0] + dx, tl[1]);
    paint(ctx, w, h, t);
    ctx.restore();
  }
  // What a still picture cannot hold (confetti, drifting clouds), in world px,
  // at the depth the arena gives it (`overlayP`, the fight lane by default).
  const overlay = stage.arena.stage.overlay;
  if (overlay) {
    ctx.save();
    if (stage.layers) ctx.translate(layerShift(stage.arena.stage.overlayP ?? 1, pan), 0);
    overlay(ctx, t);
    ctx.restore();
  }
}
