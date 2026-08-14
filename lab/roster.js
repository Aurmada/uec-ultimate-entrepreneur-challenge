// Roster contact sheet: every fighter, same pose, same stage, at two zooms —
// a face crop and a full body. Used to judge character-design changes against
// the whole cast at once rather than against whichever fighter happened to be
// on screen.
//
//   import { sheet } from '/lab/roster.js';
//   await sheet('/lab/roster-before.png', 'BEFORE');

// The WHOLE cast, not the six this started with — the cameo trio (elo/bozo/scam)
// are roster fighters too, and a sheet that quietly omits a third of the cast is
// the same failure this file warns about below.
const IDS = ['ava', 'max', 'kai', 'zara', 'eleanor', 'dex', 'elo', 'bozo', 'scam'];

// Find the fighter in the frame rather than assuming where they are.
//
// The first version of this cropped a FIXED window, and the moment a rig
// change made the cast taller their heads moved above it. The sheet showed six
// decapitated founders, I read that as the render buffer clipping them, and I
// reported a bug that did not exist — the buffer had 50-100px of headroom the
// whole time. A measuring tool that silently reframes is worse than no tool.
function bboxOf(ctx, W, H, drawWith, drawWithout) {
  drawWith();
  const A = ctx.getImageData(0, 0, W, H).data;
  drawWithout();
  const B = ctx.getImageData(0, 0, W, H).data;
  const L = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
  // Left half only. The rival is parked on the right and also differs between
  // the two renders, so scanning the full frame returns a box spanning BOTH
  // fighters — which crops to the empty stage between them.
  const XMAX = Math.floor(W * 0.5);
  let x0 = W, x1 = -1, y0 = H, y1 = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < XMAX; x++) {
      const i = (y * W + x) * 4;
      if (Math.abs(L(A[i], A[i + 1], A[i + 2]) - L(B[i], B[i + 1], B[i + 2])) > 6) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export async function sheet(path, label = '') {
  const R = await import('/src/engine/render.js');
  const { Save } = await import('/src/state.js');
  const { getArena } = await import('/src/data/arenas.js');
  const { getFighter } = await import('/src/data/fighters.js');
  Save.data.tutorialSeen = true;

  const cv = document.getElementById('gameCanvas');
  const ctx = cv.getContext('2d');
  const load = (u) => new Promise((r) => { const im = new Image(); im.onload = () => r(im); im.src = u; });
  const frames = [];

  for (const id of IDS) {
    UEC.startMatch({ mode: 'solo', p1Def: getFighter(id), p2Def: getFighter('dex'),
                     arena: getArena('boardroom'), difficulty: 'contender', isChallenge: false });
    for (let i = 0; i < 60 && (UEC.game?.fighters?.length ?? 0) < 2; i++) {
      await new Promise((r) => setTimeout(r, 50));
    }
    const g = UEC.game, [a, b] = g.fighters;
    g.state = 'fighting'; g.paused = false;
    a.state = b.state = 'idle'; a.attack = b.attack = null; a.hitstunT = 0;
    a.x = 300; b.x = 900; a.y = b.y = 480; a.vy = b.vy = 0;   // rival parked off-crop
    g.fx.particles.length = 0; g.fx.popups.length = 0; g.fx.shakeMag = 0;
    g.projectiles.length = 0; g.drops.length = 0;
    // Freeze on the same idle beat for every fighter, or the breathing phase
    // alone changes the pose and the comparison is worthless.
    g.t = 0;

    // Locate the fighter by diffing a with- and a without-fighters render, the
    // same trick lab/contrast.js uses, so the crop follows the body.
    const real = g.fighters;
    let hide = false, n = 0;
    Object.defineProperty(g, 'fighters', { configurable: true,
      get() { return (hide && n++ >= 2) ? [] : real; } });
    // The visible pass converges the camera over 30 frames; the hidden pass is
    // exactly ONE frame with the counter reset, because `n` counts accesses
    // across the whole pass — 30 hidden frames would starve the camera of its
    // fighters on frame two and throw.
    const withF = () => { hide = false; g.t = 0;
                          for (let i = 0; i < 30; i++) R.renderGame(ctx, g); };
    const withoutF = () => { hide = true; n = 0; R.renderGame(ctx, g); hide = false; };
    const box = bboxOf(ctx, cv.width, cv.height, withF, withoutF);
    hide = false; delete g.fighters; g.fighters = real;

    g.t = 0;
    for (let i = 0; i < 30; i++) R.renderGame(ctx, g);
    frames.push([getFighter(id).name.split(' ')[0], await load(cv.toDataURL('image/png')), box]);
  }

  // two rows: face crop on top, full body beneath
  const FW = 190, FH = 150, BW = 190, BH = 300, PAD = 8, LAB = 16;
  const out = document.createElement('canvas');
  out.width = PAD + IDS.length * (FW + PAD);
  out.height = PAD + LAB + FH + PAD + BH + PAD + 22;
  const cx = out.getContext('2d');
  cx.fillStyle = '#0b0e1a'; cx.fillRect(0, 0, out.width, out.height);
  cx.fillStyle = '#ffd23f'; cx.font = '700 14px system-ui';
  cx.fillText(label, PAD, 16);

  frames.forEach(([name, im, box], i) => {
    const x = PAD + i * (FW + PAD);
    cx.fillStyle = '#9fb0d9'; cx.font = '600 11px system-ui';
    cx.fillText(name + (box ? '' : '  (NOT FOUND)'), x, 22 + LAB - 2);
    if (!box) return;
    // face: the top of the measured silhouette, at the body's own aspect
    const faceH = box.h * 0.30, faceW = faceH * (FW / FH);
    cx.drawImage(im, box.x + box.w / 2 - faceW / 2, box.y - box.h * 0.02, faceW, faceH,
                 x, 22 + LAB, FW, FH);
    // body: the whole measured silhouette, with a little air around it
    const pad = box.h * 0.06;
    const bh = box.h + pad * 2, bw = bh * (BW / BH);
    cx.drawImage(im, box.x + box.w / 2 - bw / 2, box.y - pad, bw, bh,
                 x, 22 + LAB + FH + PAD, BW, BH);
  });

  const blob = await new Promise((r) => out.toBlob(r, 'image/png'));
  const res = await fetch(path, { method: 'PUT', body: blob });
  return `${path} → ${res.status}`;
}
