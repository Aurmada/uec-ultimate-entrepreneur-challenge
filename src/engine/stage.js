// Rendered stages: the arenas of the live 3D prototype (?gl). RENDER-ONLY.
//
// An arena with a `stage` entry has been built in Blender
// (lab/blender/build_stage.py) into three files: a picture of the stage, a
// glow layer holding only what gives off light, and where its live screens
// sit. The renderer draws those in place of the arena's procedural backdrop:
// the picture, the glow breathing over it, and each screen painted live by the
// arena, so a sponsor board keeps cycling sponsors. With the flag off, or until
// the files arrive, the procedural arena draws exactly as before.

import { STAGE, STAGE_ART } from '../config.js';

const { W, H } = STAGE;

export const STAGES = { enabled: false };
const stages = new Map();                 // arena id -> { ready, failed, spec, back, glow }

// The arena's stage once it has loaded, else null (and it starts loading).
export function stageFor(arena) {
  if (!STAGES.enabled || !arena?.stage) return null;
  let s = stages.get(arena.id);
  if (!s) {
    s = load(arena);
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
  Promise.all([
    fetch(new URL('stage.json', dir)).then((r) => {
      if (!r.ok) throw new Error(`${arena.stage.dir}/stage.json: ${r.status}`);
      return r.json();
    }),
    image('back.webp'),
    image('glow.webp'),
  ])
    .then(([spec, back, glow]) => {
      Object.assign(s, { spec, back, glow: soften(glow), ready: true });
    })
    .catch((e) => {
      s.failed = true;
      console.warn('[stage]', e);
    });
  return s;
}

// The glow is blurred once, here, into a halo; per frame it is only blended.
const FILTER_OK = typeof CanvasRenderingContext2D !== 'undefined' && 'filter' in CanvasRenderingContext2D.prototype;
function soften(img) {
  if (!FILTER_OK) return img;
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const g = c.getContext('2d');
  g.filter = `blur(${STAGE_ART.GLOW_BLUR * (img.naturalWidth / W)}px)`;
  g.drawImage(img, 0, 0);
  return c;
}

// How bright the glow is at time t: it breathes between LOW and HIGH.
export function glowAt(stage, t) {
  const G = { ...STAGE_ART.GLOW, ...(stage.arena.stage.glow || {}) };
  return G.LOW + (G.HIGH - G.LOW) * (0.5 + 0.5 * Math.sin(t * G.RATE));
}

// Draws the stage over the world rect (0, 0, W, H) in world px, under whatever
// transform ctx already carries: the native world canvas, or the screen under
// the camera for sharp fighters.
export function drawStage(ctx, stage, t) {
  ctx.drawImage(stage.back, 0, 0, W, H);
  const glow = glowAt(stage, t);
  if (glow > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = glow;
    ctx.drawImage(stage.glow, 0, 0, W, H);
    ctx.restore();
  }
  const painters = stage.arena.stage.screens || {};
  for (const [id, quad] of Object.entries(stage.spec.screens)) {
    const paint = painters[id];
    if (!paint) continue;
    // A screen faces the camera, so its quad is a rectangle, possibly scaled:
    // map a w x h box onto it from three corners.
    const [tl, tr, , bl] = quad;
    const w = Math.hypot(tr[0] - tl[0], tr[1] - tl[1]);
    const h = Math.hypot(bl[0] - tl[0], bl[1] - tl[1]);
    ctx.save();
    ctx.transform((tr[0] - tl[0]) / w, (tr[1] - tl[1]) / w, (bl[0] - tl[0]) / h, (bl[1] - tl[1]) / h, tl[0], tl[1]);
    paint(ctx, w, h, t);
    ctx.restore();
  }
}
