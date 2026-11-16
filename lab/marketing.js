// Marketing assets, rendered BY THE GAME so they cannot drift from the build.
//
// The previous set was cut on 2026-07-18 and was still live through v2.0's art
// pass, v2.4, v2.5 and v2.6 — four releases of character work that nobody
// sharing a link ever saw. Worse, the card had gone from stale to WRONG: it
// advertised "6 FIGHTERS" against a roster of nine, and "NO SIGNUP" against
// AUTH.REQUIRED = true. Anyone clicking through hit a sign-in wall the card
// had just promised them they would not.
//
// So the copy is derived from the data, not typed in. Add a fighter and the
// card counts it.
//
//   node lab/marketing-run.js     # writes og-image.jpg + shots/*.jpg (Playwright)
//
// or, in a browser at http://localhost:4173/?debug=1&res=2 :
//
//   import { renderAll } from '/lab/marketing.js';
//   await renderAll();
//
// Needs dev-server.py (its PUT handler is what puts bytes on disk), a
// signed-in profile (UEC.signInAs() in debug) and `?res=2`, so the frame is
// drawn at twice the stage's size.

const YELLOW = '#ffd23f', PINK = '#ff3d6e', CYAN = '#29d9ff', INK = '#05070f';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

async function put(path, cv, quality = 0.92) {
  const blob = await new Promise((r) => cv.toBlob(r, 'image/jpeg', quality));
  const res = await fetch(path, { method: 'PUT', body: blob });
  return `${path} → ${res.status} (${Math.round(blob.size / 1024)} KB)`;
}

// Punchy display text: dark outline under a flat fill, the same treatment the
// in-game popups and the challenge card use.
function shout(ctx, text, x, y, size, fill, { align = 'center', weight = '900 italic', stroke = 9 } = {}) {
  ctx.save();
  ctx.textAlign = align;
  ctx.font = `${weight} ${size}px system-ui`;
  ctx.lineJoin = 'round';
  if (stroke) { ctx.strokeStyle = INK; ctx.lineWidth = stroke; ctx.strokeText(text, x, y); }
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function backdrop(ctx, W, H) {
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#0b0e1a'); g.addColorStop(0.5, '#1a1030'); g.addColorStop(1, '#241238');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

  ctx.save();                                   // burst rays
  ctx.translate(W / 2, H * 0.46);
  ctx.globalAlpha = 0.075; ctx.fillStyle = YELLOW;
  for (let i = 0; i < 14; i++) {
    ctx.rotate(Math.PI / 7);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-46, 900); ctx.lineTo(46, 900); ctx.closePath(); ctx.fill();
  }
  ctx.restore();

  ctx.save();                                   // corner stripes
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = PINK;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(120, 0); ctx.lineTo(40, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fill();
  ctx.fillStyle = YELLOW;
  ctx.beginPath(); ctx.moveTo(W, H); ctx.lineTo(W - 120, H); ctx.lineTo(W - 40, 0); ctx.lineTo(W, 0); ctx.closePath(); ctx.fill();
  ctx.restore();
}

// The share card: a real frame of the 3D game, with the words beside it.
//
// Until v3.22.5 it was two portraits either side of the title, and they were
// the 2D busts: drawPortrait run before any model had loaded. The game had
// been 3D for three weeks and 3D only for a day, and the card every shared
// link shows was still the cartoon faces of October (seen 2026-11-15). So it
// is cut from a frame of the fight itself, which cannot be drawn without the
// models: the fighters on the right, the words over a dark fall-off on the
// left.
export async function renderOg(path = '/og-image.jpg') {
  const { FIGHTERS } = await import('/src/data/fighters.js');
  const { ARENAS } = await import('/src/data/arenas.js');
  const { STAGE, UNICORN } = await import('/src/config.js');

  const W = 1200, H = 630;
  const cv = canvas(W, H);
  const ctx = cv.getContext('2d');

  const frame = await gameShot({
    arena: 'unicorn', p1: 'ava', p2: 'zara',
    setup: (g, a, b) => {
      a.x = 520; b.x = 640;
      a.unicornT = UNICORN.DURATION; a.energy = 100;
      a.startAttack('punch', g);
    },
    steps: 4,
    // the hit's white flash off her: it bleaches the face the card is there to show
    dress: (g, a, b) => { g.fx.shakeMag = 0; b.flashT = 0; g.fx.sparkles(600, 400, 10); },
  });
  // The part of the stage the card shows, in stage px: the fighters land in
  // the right half, a head's room over them.
  const k = frame.width / STAGE.W;
  const view = { x: 112, y: 196, w: 640, h: 336 };
  ctx.drawImage(frame, view.x * k, view.y * k, view.w * k, view.h * k, 0, 0, W, H);

  // the words' side falls off to the card's ink, and the bottom edge a little
  const fall = ctx.createLinearGradient(0, 0, W, 0);
  fall.addColorStop(0, 'rgba(5,7,15,0.96)'); fall.addColorStop(0.36, 'rgba(5,7,15,0.9)');
  fall.addColorStop(0.58, 'rgba(5,7,15,0.25)'); fall.addColorStop(0.72, 'rgba(5,7,15,0)');
  ctx.fillStyle = fall; ctx.fillRect(0, 0, W, H);
  const foot = ctx.createLinearGradient(0, H - 150, 0, H);
  foot.addColorStop(0, 'rgba(5,7,15,0)'); foot.addColorStop(1, 'rgba(5,7,15,0.9)');
  ctx.fillStyle = foot; ctx.fillRect(0, H - 150, W, 150);

  ctx.save();                                   // the corner stripes of the old card
  ctx.fillStyle = PINK;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(54, 0); ctx.lineTo(18, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fill();
  ctx.fillStyle = YELLOW;
  ctx.beginPath(); ctx.moveTo(W, H); ctx.lineTo(W - 54, H); ctx.lineTo(W - 18, 0); ctx.lineTo(W, 0); ctx.closePath(); ctx.fill();
  ctx.restore();

  ctx.textBaseline = 'alphabetic';
  const L = 84;
  ctx.save();                                   // the logo, as the title screen draws it
  ctx.font = '900 italic 190px system-ui'; ctx.lineJoin = 'round';
  ctx.fillStyle = PINK; ctx.fillText('UEC', L + 9, 239);
  ctx.strokeStyle = INK; ctx.lineWidth = 12; ctx.strokeText('UEC', L, 230);
  ctx.fillStyle = YELLOW; ctx.fillText('UEC', L, 230);
  ctx.restore();
  shout(ctx, 'ULTIMATE ENTREPRENEUR', L + 4, 292, 34, CYAN, { align: 'left', stroke: 8 });
  shout(ctx, 'CHALLENGE', L + 4, 332, 34, CYAN, { align: 'left', stroke: 8 });
  shout(ctx, 'FOUNDERS FIGHT. VALUATIONS FALL.', L + 4, 384, 25, '#e3e9ff', { align: 'left', stroke: 7 });

  // CTA. It does not claim "no signup": AUTH.REQUIRED is true, and the card
  // once sent people to a sign-in wall it had promised did not exist.
  const label = 'PLAY FREE IN YOUR BROWSER';
  ctx.font = '900 italic 27px system-ui';
  const pw = ctx.measureText(label).width + 64;
  const py = 420;
  ctx.save();
  ctx.fillStyle = YELLOW; ctx.strokeStyle = INK; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.roundRect(L, py, pw, 60, 16); ctx.fill(); ctx.stroke();
  ctx.restore();
  shout(ctx, label, L + pw / 2, py + 40, 27, INK, { stroke: 0 });

  // Counted, not typed: this is how the card went wrong the time before.
  const bullets = [
    `${FIGHTERS.length} FIGHTERS`,
    `${ARENAS.length} ARENAS`,
    'BUILD YOUR OWN FOUNDER',
    'FIGHT FRIENDS LIVE',
  ].join('  ·  ');
  shout(ctx, bullets, L + 4, 574, 23, '#c9d4f5', { align: 'left', stroke: 6 });

  return put(path, cv);
}

// A real frame of the real game, captured through the real render path.
//
// Two things this has to do that are easy to miss. Every shot reuses the same
// live match, so state LEAKS — the first cut of these had a fighter still
// wearing the Unicorn Mode horn on the Demo Day stage and the rival stuck in a
// hitstun grimace it had earned two screenshots earlier. And renderGame only
// draws; it does not advance anything, so an attack started and never stepped
// is frozen in its wind-up. A punch that never extends is not an action shot.
function reset(g, a, b) {
  for (const f of [a, b]) {
    f.state = 'idle'; f.attack = null; f.hitstunT = 0; f.unicornT = 0;
    f.energy = 0; f.vx = 0; f.vy = 0; f.y = 480; f.flashT = 0; f.comboTaken = 0;
    f.hp = f.maxHp ?? 100;
  }
  g.projectiles.length = 0; g.traps.length = 0; g.afterimages.length = 0;
  g.fx.particles.length = 0; g.fx.popups.length = 0; g.fx.rings.length = 0;
  g.fx.shakeMag = 0; g.fx.hitstopT = 0; g.fx.flashA = 0;
  g.drops.length = 0;
}

// Start a match with a chosen pair. A fighter resolves its `special` when it is
// CONSTRUCTED, so you cannot hand someone else's move to an existing fighter —
// the volley shot has to be cast with the founder who actually owns it.
async function cast(p1, p2, arenaId) {
  const { Save } = await import('/src/state.js');
  const { getArena } = await import('/src/data/arenas.js');
  const { getFighter } = await import('/src/data/fighters.js');
  Save.data.tutorialSeen = true;          // else startMatch defers to onboarding
  UEC.startMatch({ mode: 'solo', p1Def: getFighter(p1), p2Def: getFighter(p2),
                   arena: getArena(arenaId), difficulty: 'contender', isChallenge: false });
  for (let i = 0; i < 60 && (UEC.game?.fighters?.length ?? 0) < 2; i++) {
    await new Promise((r) => setTimeout(r, 50));
  }
  return UEC.game;
}

async function gameShot({ arena, p1, p2, setup, steps = 0, dress = null }) {
  const R = await import('/src/engine/render.js');
  const G3 = await import('/src/engine/gl3d/index.js');
  const { GL3D } = await import('/src/config.js');
  const { stageFor } = await import('/src/engine/stage.js');
  const g = await cast(p1, p2, arena);
  // The game is 3D: the shot waits for both models and the stage's pictures,
  // and the fighters are drawn into the game canvas (not on the 3D layer over
  // it) so the frame is one picture, as lab/pixels.js does it.
  const wait = async (ok) => { for (let i = 0; i < 300 && !ok(); i++) await new Promise((r) => setTimeout(r, 100)); };
  await wait(() => g.fighters.every((f) => G3.has3D(f.def)));
  await wait(() => stageFor(g.arena));
  if (!g.fighters.every((f) => G3.has3D(f.def))) throw new Error('the 3D fighters did not load: no shot without them');
  const layer = GL3D.LAYER;
  GL3D.LAYER = false;
  const cv = document.getElementById('gameCanvas');
  const ctx = cv.getContext('2d');
  const [a, b] = g.fighters;

  // 'fighting', not 'fight'. An unrecognised state leaves the update loop
  // skipping the fighters entirely: the attack starts, never advances, and
  // every shot comes out frozen in its wind-up looking like a guard.
  g.state = 'fighting'; g.paused = false;
  reset(g, a, b);
  setup(g, a, b);

  // Advance the actual simulation so poses, projectiles and impacts are real.
  for (let i = 0; i < steps; i++) UEC.step(1 / 60);
  if (dress) dress(g, a, b);              // garnish AFTER stepping, so it survives

  R.renderGame(ctx, g);
  const out = canvas(cv.width, cv.height);
  out.getContext('2d').drawImage(cv, 0, 0);
  GL3D.LAYER = layer;
  return out;
}

export async function renderShots() {
  const { UNICORN } = await import('/src/config.js');
  const results = [];

  // Unicorn mode landing a hit. Stepped far enough for the punch to be OUT and
  // to have connected, so the impact FX are the game's own, not dressing.
  // gap 100 / 4 steps is the frame where the punch is OUT and has connected —
  // found by stepping the sim and watching hasHit, not by eye.
  results.push(await put('/shots/unicorn-brawl.jpg', await gameShot({
    arena: 'unicorn', p1: 'ava', p2: 'zara',
    setup: (g, a, b) => {
      a.x = 430; b.x = 530;
      a.unicornT = UNICORN.DURATION; a.energy = 100;
      a.startAttack('punch', g);
    },
    steps: 4,
    dress: (g) => {
      g.fx.shakeMag = 0;                  // a shaky frame just looks blurry
      g.fx.sparkles(500, 420, 10);
    },
  })));

  // The volley mid-flight. Cast on Steve Nojobs because PITCH DECK STRIKE is
  // his — the first cut used a founder whose special is a melee pivot and the
  // "volley" screenshot had no projectile in it at all.
  results.push(await put('/shots/pitch-deck.jpg', await gameShot({
    arena: 'demoday', p1: 'kai', p2: 'dex',
    setup: (g, a, b) => {
      a.x = 320; b.x = 670;
      a.energy = 100;
      a.startSpecial(g);
    },
    steps: 26,
    dress: (g) => { g.fx.shakeMag = 0; },
  })));

  return results;
}

export async function renderAll() {
  return [await renderOg(), ...(await renderShots())];
}
