// THE SILHOUETTE TEST.
//
// Street Fighter differentiates characters by SHAPE — you know who it is from
// the outline. Classic Mortal Kombat differentiated by COSTUME — the original
// ninjas were one sprite in several colours. Those are opposite philosophies,
// and a cast can drift into the second one by accident, because colour is the
// easiest axis to vary and it flatters every screenshot.
//
// This harness removes colour entirely. It renders each fighter, isolates the
// body by diffing a with- and a without-fighters pass (the same trick
// lab/contrast.js and lab/roster.js use — never sample a fixed region, the cast
// moves), and paints the resulting mask as one flat fill. What survives is the
// only thing a silhouette carries: shape.
//
// If you cannot tell the cast apart here, the character design is doing its work
// in the palette rather than in the drawing.
//
//   import { silhouettes } from '/lab/silhouette.js';
//   await silhouettes('/shots/roster-silhouette.png', 'SILHOUETTE TEST');

const IDS = ['ava', 'max', 'kai', 'zara', 'eleanor', 'dex', 'elo', 'bozo', 'scam'];

// A pixel belongs to the fighter if the two passes disagree by more than this.
// Low enough to keep the soft key line, high enough to reject dither and the
// stage's own faint animation.
const DIFF = 18;

// Isolate the fighter as a boolean mask plus its bounding box.
//
// The contact shadow and the floor pool are STAGE LIGHTING drawn inside the
// fighter loop, so they move between the two passes and would be scored as
// character — that is what made an earlier contrast probe report a brighter
// floor as a 33%->66% win. renderGame reads game.fighters in a fixed order
// (0 camera, 1 shadow+pool, 2 bodies, 3 icons), so KEEP = 2 leaves the lighting
// in BOTH passes and it cancels in the diff.
const KEEP = 2;

function maskOf(ctx, W, H, drawWith, drawWithout) {
  drawWith();
  const a = ctx.getImageData(0, 0, W, H).data;
  drawWithout();
  const b = ctx.getImageData(0, 0, W, H).data;

  // Left half only, for the reason lab/roster.js records: the rival is parked on
  // the right and ALSO differs between the two passes, so scanning the whole
  // frame returns one region spanning both fighters. The first version of this
  // file did exactly that and produced nine cells each holding two thumbnail
  // figures with the empty stage between them.
  const XMAX = Math.floor(W * 0.5);

  const mask = new Uint8Array(W * H);
  let minX = W, minY = H, maxX = -1, maxY = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < XMAX; x++) {
      const i = y * W + x, p = i * 4;
      const d = Math.abs(a[p] - b[p]) + Math.abs(a[p + 1] - b[p + 1]) + Math.abs(a[p + 2] - b[p + 2]);
      if (d <= DIFF) continue;
      mask[i] = 1;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;
  return { mask, x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

export async function silhouettes(path, label = '', fill = '#e8ecff') {
  const R = await import('/src/engine/render.js');
  const { Save } = await import('/src/state.js');
  const { getArena } = await import('/src/data/arenas.js');
  const { getFighter } = await import('/src/data/fighters.js');
  Save.data.tutorialSeen = true;

  const cv = document.getElementById('gameCanvas');
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  const shots = [];

  for (const id of IDS) {
    UEC.startMatch({ mode: 'solo', p1Def: getFighter(id), p2Def: getFighter('dex'),
                     arena: getArena('boardroom'), difficulty: 'founder', isChallenge: false });
    for (let i = 0; i < 60 && (UEC.game?.fighters?.length ?? 0) < 2; i++) {
      await new Promise((r) => setTimeout(r, 50));
    }
    const g = UEC.game, [a, b] = g.fighters;
    // State LEAKS between shots because they reuse one live match — reset
    // anything that would put a fighter in the wrong pose or wear the wrong buff.
    g.state = 'fighting'; g.paused = false;
    a.state = b.state = 'idle'; a.attack = b.attack = null;
    a.hitstunT = b.hitstunT = 0; a.unicornT = b.unicornT = 0;
    a.x = 300; b.x = 900; a.y = b.y = 480; a.vy = b.vy = 0;
    g.fx.particles.length = 0; g.fx.popups.length = 0; g.fx.shakeMag = 0;
    g.projectiles.length = 0; g.drops.length = 0;
    g.t = 0;

    const real = g.fighters;
    let hide = false, n = 0;
    Object.defineProperty(g, 'fighters', { configurable: true,
      get() { return (hide && n++ >= KEEP) ? [] : real; } });
    // The visible pass converges the camera over 30 frames; the hidden pass is
    // exactly ONE frame with the counter reset, or the camera is starved of its
    // fighters on frame two and throws.
    const withF = () => { hide = false; g.t = 0;
                          for (let i = 0; i < 30; i++) R.renderGame(ctx, g); };
    const withoutF = () => { hide = true; n = 0; R.renderGame(ctx, g); hide = false; };
    const found = maskOf(ctx, W, H, withF, withoutF);
    hide = false; delete g.fighters; g.fighters = real;

    shots.push([getFighter(id).name.split(' ')[0], found]);
  }

  const CW = 190, CH = 300, PAD = 8, LAB = 18;
  const out = document.createElement('canvas');
  out.width = PAD + IDS.length * (CW + PAD);
  out.height = PAD + LAB + CH + PAD + 22;
  const cx = out.getContext('2d');
  cx.fillStyle = '#0b0e1a'; cx.fillRect(0, 0, out.width, out.height);
  cx.fillStyle = '#ffd23f'; cx.font = '700 14px system-ui';
  cx.fillText(label, PAD, 16);

  // Stamp each mask into its own cell, scaled to a common height so the
  // comparison is about SHAPE and not about who happens to stand closer.
  shots.forEach(([name, found], i) => {
    const ox = PAD + i * (CW + PAD), oy = PAD + LAB;
    cx.fillStyle = '#9fb0d9'; cx.font = '600 11px system-ui';
    cx.fillText(name + (found ? '' : '  (NOT FOUND)'), ox, oy - 4);
    if (!found) return;

    const cell = document.createElement('canvas');
    cell.width = found.w; cell.height = found.h;
    const cc = cell.getContext('2d');
    const img = cc.createImageData(found.w, found.h);
    const [r, gg, bb] = [fill.slice(1, 3), fill.slice(3, 5), fill.slice(5, 7)].map((h) => parseInt(h, 16));
    for (let y = 0; y < found.h; y++) {
      for (let x = 0; x < found.w; x++) {
        if (!found.mask[(found.y + y) * W + (found.x + x)]) continue;
        const p = (y * found.w + x) * 4;
        img.data[p] = r; img.data[p + 1] = gg; img.data[p + 2] = bb; img.data[p + 3] = 255;
      }
    }
    cc.putImageData(img, 0, 0);

    const pad = found.h * 0.06;
    const s = Math.min(CW / (found.w + pad * 2), CH / (found.h + pad * 2));
    const dw = found.w * s, dh = found.h * s;
    cx.drawImage(cell, ox + (CW - dw) / 2, oy + CH - dh, dw, dh);
  });

  const blob = await new Promise((r) => out.toBlob(r, 'image/png'));
  const res = await fetch(path, { method: 'PUT', body: blob });
  return `${path} → ${res.status}`;
}
