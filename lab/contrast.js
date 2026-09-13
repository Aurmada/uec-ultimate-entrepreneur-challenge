// Contrast probe: how well does a fighter separate from the stage behind it?
//
// The naive version of this — sample a fixed column and call it "the fighter" —
// lied to me for an entire session. It reported the fighter's own brightness
// changing per arena, which is impossible: the fighter is lit by its own cel
// shader, not by the stage. The column was landing on backdrop.
//
// So the fighter is located, not assumed. Render the scene twice with an
// identical camera, once with fighters and once without, and every pixel that
// differs is fighter. That mask is ground truth, and it also gives us the
// backdrop AS IT IS BEHIND THE FIGHTER — the pixels the fighter is actually
// competing with, which is the comparison the eye makes.
//
//   import { measure } from '/lab/contrast.js';
//   await measure();                       // all arenas, current scene

// Pin the cast. quickFight picks fighters at random, and a fighter's own
// palette moves these numbers by more than the stage grade does — a dark-suit
// founder and a bright-hoodie one differ by ~10 luminance. That made every
// figure comparable only WITHIN one page load. Start from here instead and a
// reading means the same thing tomorrow.
export const PINNED = ['ava', 'zara'];   // one dark-suit, one bright — worst and best case
export async function pin(ids = PINNED) {
  const { FIGHTERS, getFighter } = await import('/src/data/fighters.js');
  const { getArena } = await import('/src/data/arenas.js');
  const [p1, p2] = ids.map((id) => getFighter(id) || FIGHTERS[0]);
  UEC.startMatch({ mode: 'solo', p1Def: p1, p2Def: p2, arena: getArena('boardroom'),
                   difficulty: 'contender', isChallenge: false });
  for (let i = 0; i < 60 && (UEC.game?.fighters?.length ?? 0) < 2; i++) {
    await new Promise((r) => setTimeout(r, 50));
  }
  return { p1: p1.id, p2: p2.id };
}

const LUM = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const SRGB = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };

// WCAG contrast ratio, 1.0 (invisible) .. 21.0 (black on white)
export function ratio(l1, l2) {
  const hi = SRGB(Math.max(l1, l2)), lo = SRGB(Math.min(l1, l2));
  return +((hi + 0.05) / (lo + 0.05)).toFixed(2);
}

// Separable max-filter. Run on a quarter-res mask: a ~36px halo only needs
// radius 9 there, which turns a 280M-op dilation into a 5M-op one.
function dilate(src, w, h, r) {
  const tmp = new Uint8Array(w * h), dst = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let m = 0;
    for (let k = -r; k <= r; k++) { const xx = x + k; if (xx >= 0 && xx < w && src[y * w + xx]) { m = 1; break; } }
    tmp[y * w + x] = m;
  }
  for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) {
    let m = 0;
    for (let k = -r; k <= r; k++) { const yy = y + k; if (yy >= 0 && yy < h && tmp[yy * w + x]) { m = 1; break; } }
    dst[y * w + x] = m;
  }
  return dst;
}

export async function measure({ arenas = null, converge = 60, halo = 9, diff = 4 } = {}) {
  const R = await import('/src/engine/render.js');
  const { STAGES, stageFor } = await import('/src/engine/stage.js');
  const { ARENAS } = await import('/src/data/arenas.js');
  const { STAGE } = await import('/src/config.js');
  const { FLOOR, H: SH } = STAGE;
  const g = UEC.game;
  const cv = document.getElementById('gameCanvas');
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  const [a, b] = g.fighters;

  // A still, neutral scene: any particle or shake would land in the diff mask
  // and be counted as fighter.
  const still = () => {
    g.state = 'fight'; g.paused = false;
    a.state = b.state = 'idle'; a.attack = b.attack = null;
    a.x = 400; b.x = 560; a.y = b.y = 480; a.vy = b.vy = 0;
    g.fx.particles.length = 0; g.fx.popups.length = 0; g.fx.shakeMag = 0;
    g.drops.length = 0; g.projectiles.length = 0;
  };
  still();

  // renderGame reads game.fighters in a fixed order:
  //   0 camera, 1 shadow+floor pool, 2 the bodies, 3 buff icons.
  //
  // Hiding everything from 1 onward was wrong. The contact shadow and the
  // floor pool are STAGE LIGHTING that happens to follow a fighter, not the
  // fighter — suppressing them in the second pass dumped a big soft halo of
  // deliberately-low-contrast pixels into the diff and scored it as character.
  // It made a brighter floor pool look like a catastrophe (33% -> 66% "lost")
  // when all it had done was add glow the mask then blamed on the body.
  // Keeping 0 and 1 in BOTH passes cancels the lighting and leaves the bodies.
  const KEEP = 2;
  const real = g.fighters;
  let hide = false, n = 0;
  Object.defineProperty(g, 'fighters', {
    configurable: true,
    get() { return (hide && n++ >= KEEP) ? [] : real; },
  });

  const W = cv.width, H = cv.height, DW = W >> 2, DH = H >> 2;
  const snap = () => ctx.getImageData(0, 0, W, H).data;
  const list = (arenas ? ARENAS.filter(x => arenas.includes(x.id)) : ARENAS);
  const out = {};

  try {
    for (const arena of list) {
      g.arena = arena;
      // With rendered stages on (?gl), wait for this arena's to load: until it
      // does the procedural stage draws, and that is what would get measured.
      for (let i = 0; STAGES.enabled && arena.stage && !stageFor(arena) && i < 200; i++) {
        await new Promise((r) => setTimeout(r, 25));
      }
      still();                    // the game kept running while it loaded
      for (let i = 0; i < converge; i++) { hide = false; R.renderGame(ctx, g); }
      hide = false; R.renderGame(ctx, g); const A = snap();
      hide = true; n = 0; R.renderGame(ctx, g); const B = snap();
      hide = false;

      // The contact shadow lives below the feet and is SUPPOSED to be a faint
      // darkening — scoring it as character made 100% of it read as "lost" and
      // put a permanent ~9% tax on every number here. The body is what has to
      // separate, so the character metrics stop at the floor line.
      const floorY = Math.round((FLOOR / SH) * H);
      const mask = new Uint8Array(DW * DH);
      let fS = 0, fN = 0, gS = 0, gN = 0, ppS = 0, lost = 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        const la = LUM(A[i], A[i + 1], A[i + 2]), lb = LUM(B[i], B[i + 1], B[i + 2]);
        if (Math.abs(la - lb) > diff) {
          mask[(y >> 2) * DW + (x >> 2)] = 1;
          if (y >= floorY) continue;       // contact shadow, not the character
          fS += la; fN++;
          // The truest separation measure: every fighter pixel against the
          // exact backdrop pixel it covers. No halo, no guessing.
          const r = ratio(la, lb);
          ppS += r;
          if (r < 1.5) lost++;             // this pixel is nearly camouflaged
        } else { gS += lb; gN++; }
      }

      const ring = dilate(mask, DW, DH, halo);
      let rS = 0, rN = 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const d = (y >> 2) * DW + (x >> 2);
        if (!ring[d] || mask[d]) continue;
        const i = (y * W + x) * 4;
        rS += LUM(B[i], B[i + 1], B[i + 2]); rN++;
      }

      const F = fS / Math.max(1, fN), L = rS / Math.max(1, rN), G = gS / Math.max(1, gN);
      out[arena.id] = {
        perPixel: +(ppS / Math.max(1, fN)).toFixed(2),   // headline: mean fighter-vs-what-it-covers
        lostPct: +(100 * lost / Math.max(1, fN)).toFixed(1), // share of the character that vanishes
        fighter: +F.toFixed(1),
        localBg: +L.toFixed(1),
        local: ratio(F, L),        // fighter vs the halo just outside the silhouette
        stageBg: +G.toFixed(1),
        stage: ratio(F, G),
        coverage: +(100 * fN / (fN + gN)).toFixed(1),
      };
    }
  } finally {
    delete g.fighters;
    g.fighters = real;
  }

  const vals = Object.values(out);
  const avg = (k) => +(vals.reduce((s, v) => s + v[k], 0) / vals.length).toFixed(2);
  out._perPixel = avg('perPixel');
  out._lostPct = avg('lostPct');
  out._localMin = Math.min(...vals.map(v => v.local));
  out._localMean = avg('local');
  return out;
}
