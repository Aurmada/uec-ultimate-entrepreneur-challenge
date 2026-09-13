// Canvas compositor for the fight: arena → shadows → afterimages → fighters
// → projectiles → particles/popups → full-screen flashes.

import { STAGE } from '../config.js';
import { drawFighter } from './drawFighter.js';

const { W, H, FLOOR } = STAGE;

// ---- cinematic stage lighting (v2.0 art pass) -----------------------------
// A backdrop grade pushes the arena back and cool, so the lit fighters read as
// the foreground; a scene light + vignette over the top unifies everything.
// One system, applied to every arena — each arena keeps its own art underneath.

// ---- pseudo-3D floor -------------------------------------------------------
// A receding perspective grid + a reflective sheen under the fighters. This is
// what sells "3D" more than anything done to the characters: the eye reads the
// converging lines as depth and places the fight ON a stage rather than in
// front of a picture. Pure canvas — no engine, no dependency.
function drawPerspectiveFloor(ctx, t) {
  const horizon = FLOOR - 96;         // vanishing height above the floor line
  const vpx = W / 2;
  ctx.save();
  ctx.beginPath(); ctx.rect(0, FLOOR - 6, W, H - FLOOR + 6); ctx.clip();

  // floor plane
  const g = ctx.createLinearGradient(0, FLOOR - 10, 0, H);
  g.addColorStop(0, 'rgba(24,30,62,0.55)');
  g.addColorStop(1, 'rgba(6,8,20,0.92)');
  ctx.fillStyle = g;
  ctx.fillRect(0, FLOOR - 10, W, H - FLOOR + 10);

  // lines converging on the vanishing point → depth
  ctx.strokeStyle = 'rgba(120,150,255,0.16)';
  ctx.lineWidth = 1.5;
  for (let i = -14; i <= 14; i++) {
    ctx.beginPath();
    ctx.moveTo(vpx + i * 26, horizon);
    ctx.lineTo(vpx + i * 190, H + 40);
    ctx.stroke();
  }
  // horizontal rungs, spaced non-linearly so they compress toward the horizon
  for (let r = 1; r <= 9; r++) {
    const k = r / 9;
    const y = FLOOR + Math.pow(k, 2.1) * (H - FLOOR + 60);
    ctx.globalAlpha = 0.22 * (1 - k * 0.65);
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

// Mirror-ish sheen beneath a fighter — cheap, and it plants them on the plane.
function drawFloorSheen(ctx, f) {
  const airK = Math.max(0, Math.min(1, (FLOOR - f.y) / 260));
  if (airK > 0.75) return;
  // Do not "improve" this by making the pool bigger or brighter to light the
  // legs. Measured: raising the surface behind a fighter from 33.6 to 46.5
  // luminance took the Garage from 32.1% of the body near-invisible to 36.8%.
  // The legs are dark but they are a minority; the body is bright (~105), so
  // anything that lifts the backdrop costs the majority more than it pays the
  // legs. Contrast here is won by darkening the stage, not lighting the floor.
  ctx.save();
  ctx.globalAlpha = 0.16 * (1 - airK);
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createLinearGradient(f.x, FLOOR, f.x, FLOOR + 62);
  g.addColorStop(0, 'rgba(150,180,255,0.5)');
  g.addColorStop(1, 'rgba(150,180,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(f.x, FLOOR + 26, 40, 30, 0, 0, 7);
  ctx.fill();
  ctx.restore();
}

function drawStageGrade(ctx, t, arena) {
  // atmospheric haze rising off the floor + a top spotlight cone
  ctx.save();
  const key = ctx.createRadialGradient(W / 2, -60, 60, W / 2, 120, 640);
  key.addColorStop(0, 'rgba(255,244,214,0.10)');
  key.addColorStop(1, 'rgba(255,244,214,0)');
  ctx.fillStyle = key;
  ctx.fillRect(0, 0, W, H);
  // cool depth wash on the lower third so fighters pop off the backdrop
  const haze = ctx.createLinearGradient(0, FLOOR - 140, 0, FLOOR + 60);
  haze.addColorStop(0, 'rgba(18,26,60,0)');
  haze.addColorStop(1, 'rgba(10,14,34,0.42)');
  ctx.fillStyle = haze;
  ctx.fillRect(0, FLOOR - 140, W, 200);
  // Backdrop scrim across the whole play field. The arena is scenery; the
  // fighters are the subject. One fillRect, so it costs nothing. An arena that
  // is unusually bright behind the fighters can ask for more of it.
  const scrim = arena?.scrim ?? STAGE.SCRIM;
  if (scrim > 0) {
    ctx.fillStyle = `rgba(6,9,22,${scrim})`;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
}

// Foreground depth layer, drawn in FRONT of the fighters so the action sits
// inside the scene rather than on top of a flat backdrop. Driven by the
// arena's own `mood`, so each stage keeps its identity from one system.
function drawForeground(ctx, arena, t) {
  const mood = arena?.mood || 'dark';
  ctx.save();
  if (mood === 'hype' || mood === 'party') {
    // packed crowd silhouettes with the odd phone light held up
    ctx.fillStyle = 'rgba(3,4,12,0.94)';
    ctx.fillRect(0, H - 26, W, 26);
    for (let x = -20; x < W + 40; x += 52) {
      const bob = Math.sin(t * 1.6 + x * 0.05) * 3;
      const y = H - 24 + bob;
      ctx.fillStyle = 'rgba(3,4,12,0.94)';
      ctx.beginPath(); ctx.arc(x, y + 20, 20, Math.PI, 0); ctx.fill();
      ctx.beginPath(); ctx.arc(x, y + 1, 11, 0, 7); ctx.fill();
      if ((x / 52 | 0) % 3 === 0) {
        ctx.fillStyle = 'rgba(255,224,130,0.85)';
        ctx.fillRect(x - 2, y - 9, 4, 8);
      }
    }
  } else if (mood === 'tense' || mood === 'epic') {
    // out-of-focus pillars framing the arena
    ctx.fillStyle = 'rgba(4,6,16,0.82)';
    ctx.fillRect(0, 0, 26, H);
    ctx.fillRect(W - 26, 0, 26, H);
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.fillRect(18, 0, 5, H);
    ctx.fillRect(W - 23, 0, 5, H);
  } else {
    // dark / lofi: a soft foreground floor shelf for grounding
    const g = ctx.createLinearGradient(0, H - 30, 0, H);
    g.addColorStop(0, 'rgba(3,4,12,0)');
    g.addColorStop(1, 'rgba(3,4,12,0.85)');
    ctx.fillStyle = g;
    ctx.fillRect(0, H - 30, W, 30);
  }
  ctx.restore();
}

function drawStageLight(ctx) {
  // subtle top key glow
  ctx.save();
  ctx.globalCompositeOperation = 'soft-light';
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(255,238,205,0.5)');
  g.addColorStop(0.5, 'rgba(255,255,255,0)');
  g.addColorStop(1, 'rgba(6,8,22,0.6)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
  // vignette frames the action
  ctx.save();
  const v = ctx.createRadialGradient(W / 2, H * 0.46, H * 0.32, W / 2, H * 0.5, H * 0.92);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(3,4,12,0.5)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

// Contact shadow — softer, wider, layered so fighters feel planted on the floor.
function drawShadow(ctx, f) {
  const airK = Math.max(0, Math.min(1, (FLOOR - f.y) / 260));
  const s = 1 - airK * 0.45;
  ctx.save();
  ctx.filter = 'blur(3px)';
  ctx.fillStyle = `rgba(0,0,0,${0.30 * (1 - airK * 0.5)})`;
  ctx.beginPath();
  ctx.ellipse(f.x, FLOOR + 11, 50 * s, 11 * s, 0, 0, 7);
  ctx.fill();
  ctx.filter = 'none';
  // tight core shadow directly under the feet
  ctx.fillStyle = `rgba(0,0,0,${0.28 * (1 - airK * 0.6)})`;
  ctx.beginPath();
  ctx.ellipse(f.x, FLOOR + 11, 26 * s, 6 * s, 0, 0, 7);
  ctx.fill();
  ctx.restore();
}

function drawAfterimage(ctx, g) {
  ctx.save();
  ctx.globalAlpha = Math.max(0, g.life / 0.25) * 0.4;
  ctx.translate(g.x, g.y);
  ctx.scale(g.facing, 1);
  ctx.fillStyle = g.color;
  ctx.beginPath(); ctx.ellipse(0, -90, 24, 44, 0.1, 0, 7); ctx.fill();     // torso blur
  ctx.beginPath(); ctx.arc(2, -134, 20, 0, 7); ctx.fill();                 // head blur
  ctx.beginPath(); ctx.ellipse(-2, -30, 16, 32, -0.1, 0, 7); ctx.fill();   // legs blur
  ctx.restore();
}

function drawProjectile(ctx, p, t) {
  if (p.delay > 0) return;
  ctx.save();
  ctx.translate(p.x, p.y);
  if (p.type === 'slide') {
    ctx.rotate(Math.sin(t * 9 + p.x * 0.05) * 0.18);
    // glow
    ctx.fillStyle = 'rgba(41,217,255,0.25)';
    ctx.beginPath(); ctx.ellipse(0, 0, 30, 20, 0, 0, 7); ctx.fill();
    // the slide
    ctx.fillStyle = '#f4f6ff';
    ctx.strokeStyle = '#0a0c16';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.roundRect(-18, -13, 36, 26, 4); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#29d9ff';
    ctx.fillRect(-14, -9, 28, 4);
    ctx.strokeStyle = '#ff3d6e';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-13, 8); ctx.lineTo(-6, 2); ctx.lineTo(1, 6); ctx.lineTo(12, -4);
    ctx.stroke();
  } else if (p.type === 'bomb') {
    // cease & desist: a spinning legal envelope with a red wax seal
    ctx.rotate(Math.sin(t * 11 + p.x * 0.03) * 0.35);
    ctx.fillStyle = '#ece0bd';
    ctx.strokeStyle = '#0a0c16';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.roundRect(-17, -12, 34, 24, 3); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#b8a670';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-17, -12); ctx.lineTo(0, 2); ctx.lineTo(17, -12);
    ctx.stroke();
    ctx.fillStyle = '#c22836';
    ctx.beginPath(); ctx.arc(0, 4, 5.5, 0, 7); ctx.fill();
    ctx.strokeStyle = '#0a0c16'; ctx.lineWidth = 1.5; ctx.stroke();
  } else { // coin
    const squish = Math.abs(Math.sin(p.rot)) * 0.65 + 0.35;
    ctx.scale(squish, 1);
    ctx.fillStyle = '#ffd23f';
    ctx.strokeStyle = '#0a0c16';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, 15, 0, 7); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#c99e0a';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, 10, 0, 7); ctx.stroke();
    ctx.fillStyle = '#8a6d00';
    ctx.font = '900 14px system-ui';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('$', 0, 1);
  }
  ctx.restore();
}

// A placed trap. While arming it is faint and still; once armed it pulses, so
// the threat is legible from across the stage without cluttering the floor.
function drawTrap(ctx, tr, t) {
  const armed = tr.armT <= 0;
  const pulse = armed ? 0.55 + 0.45 * Math.sin(t * 7) : 0.25;
  const fade = Math.min(1, tr.life / 1.2);          // dims out as it expires
  const y = tr.y - 6;
  ctx.save();
  ctx.globalAlpha = pulse * fade;
  ctx.strokeStyle = armed ? '#ffd23f' : '#8b93ad';
  ctx.lineWidth = armed ? 3 : 2;
  ctx.beginPath();
  ctx.ellipse(tr.x, y, tr.radius, tr.radius * 0.26, 0, 0, Math.PI * 2);
  ctx.stroke();
  if (armed) {
    ctx.globalAlpha = 0.16 * pulse * fade;
    ctx.fillStyle = '#ffd23f';
    ctx.fill();
  }
  ctx.restore();
}

function drawDrop(ctx, d, t) {
  // blink during the last 2 seconds
  if (d.landed && d.lifeT < 2 && Math.floor(t * 8) % 2 === 0) return;
  ctx.save();
  ctx.translate(d.x, d.y);
  if (!d.landed) ctx.rotate(Math.sin(t * 6) * 0.14);
  // glow
  ctx.fillStyle = 'rgba(255,210,63,0.18)';
  ctx.beginPath(); ctx.arc(0, -16, 34 + Math.sin(t * 5) * 4, 0, 7); ctx.fill();
  // briefcase
  ctx.fillStyle = '#6b4a2b';
  ctx.strokeStyle = '#0a0c16';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.roundRect(-20, -30, 40, 30, 5); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#57391f';
  ctx.beginPath(); ctx.roundRect(-8, -36, 16, 8, 3); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#ffd23f';
  ctx.fillRect(-20, -18, 40, 5);
  // mystery mark
  ctx.font = '900 italic 19px system-ui';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 4;
  ctx.strokeText('?', 0, -13);
  ctx.fillStyle = ['#ffd23f', '#fff3c2'][Math.floor(t * 4) % 2];
  ctx.fillText('?', 0, -13);
  ctx.restore();
}

function drawBuffIcons(ctx, f) {
  const icons = [];
  if (f.speedBuffT > 0) icons.push(['⚡', f.speedBuffT]);
  if (f.dmgBuffT > 0) icons.push(['💪', f.dmgBuffT]);
  if (f.shieldT > 0) icons.push(['🛡', f.shieldT]);
  if (!icons.length) return;
  ctx.save();
  ctx.font = '16px system-ui';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const total = icons.length * 22;
  icons.forEach(([icon, timeLeft], i) => {
    ctx.globalAlpha = timeLeft < 1 ? 0.35 + 0.65 * Math.abs(Math.sin(timeLeft * 10)) : 0.95;
    ctx.fillText(icon, f.x - total / 2 + 11 + i * 22, f.y - 182);
  });
  ctx.restore();
}

// ---------------------------------------------------------------- camera
//
// The fight used to be framed by the stage rather than by the fighters: two
// characters in the bottom third with a large dead zone above and beside them,
// which is why the character work reads so much smaller in play than it does in
// a preview. This pushes in when they close and eases out when they separate.
//
// RENDER-ONLY. It is a transform applied at draw time; hitboxes and positions
// stay in world space and never see it, so nothing here can touch the
// simulation or desync a live match.
const CAM = {
  MIN_Z: 1.0,        // never wider than the stage — there is nothing out there
  // Held down deliberately. Pushing harder makes the fighters bigger but eats
  // the arena: the sponsor signage and ticker get cropped, and the stage stops
  // reading as a place. This is the most zoom the art can afford.
  MAX_Z: 1.26,
  MARGIN: 330,       // world padding kept either side of the pair
  EASE: 0.085,       // per-frame follow; low enough that it never feels grabby
  LIFT: 0.30,        // how much of a fighter's height above the floor to follow
  AIM: 86,           // sit the lens at chest height, not at the feet, for headroom
};
let cam = null;
let camFor = null;   // which Game the state belongs to, so a new match resets

function updateCamera(game) {
  if (camFor !== game) { cam = null; camFor = game; }
  const [a, b] = game.fighters;
  const gap = Math.abs(a.x - b.x);
  const want = {
    z: Math.max(CAM.MIN_Z, Math.min(CAM.MAX_Z, W / (gap + CAM.MARGIN * 2))),
    x: (a.x + b.x) / 2,
    // follow a jump partway up, so an anti-air stays in frame without the
    // whole stage lurching every time somebody hops
    y: STAGE.FLOOR - CAM.AIM - ((STAGE.FLOOR - Math.min(a.y, b.y)) * CAM.LIFT),
  };
  if (!cam) cam = { ...want };
  else for (const k of ['z', 'x', 'y']) cam[k] += (want[k] - cam[k]) * CAM.EASE;

  // Never show past the stage edges — the arena art simply stops there.
  const halfW = W / (2 * cam.z), halfH = H / (2 * cam.z);
  cam.x = Math.max(halfW, Math.min(W - halfW, cam.x));
  cam.y = Math.max(halfH, Math.min(H - halfH, cam.y));
  return cam;
}

// The world is always drawn at native size into this, then a sub-rectangle of
// it is blitted to the screen. Drawing the world UNDER a scale transform was
// the obvious implementation and it cost 3.4ms/frame — every gradient and the
// blurred contact shadows get re-rasterised at the new scale, which turned a
// 0.94ms render into 4.4ms. Cropping a native-size render is one drawImage.
let world = null;
function worldCanvas() {
  if (!world) {
    world = document.createElement('canvas');
    world.width = W; world.height = H;
  }
  return world;
}

// Sharp fighters (on with ?gl or ?sharp). The world above is drawn at native
// size and cropped, so anything in it, fighters included, reaches the screen
// scaled up by the camera and the device pixel ratio together, about 2.2x on a
// phone: the fighter's own 2x buffer is thrown away on the way. This path draws
// the world in two layers (everything behind the fighters, everything in front)
// and puts the fighters straight onto the screen between them, under the camera
// transform, so their buffers land at close to their own resolution. Still one
// cropped drawImage per layer; only the fighters are drawn under a scale, and a
// fighter is a couple of image blits, not gradients. Off by default until the
// cost is measured on phones.
export const RENDER = { sharpFighters: false };
let front = null;
function frontCanvas() {
  if (!front) {
    front = document.createElement('canvas');
    front.width = W; front.height = H;
  }
  return front;
}

export function renderGame(ctx, game) {
  const t = game.t;
  const c = updateCamera(game);
  if (RENDER.sharpFighters) { renderSharp(ctx, game, t, c); return; }
  const wc = worldCanvas();
  const wx = wc.getContext('2d');
  wx.setTransform(1, 0, 0, 1, 0, 0);
  wx.clearRect(0, 0, W, H);
  renderWorld(wx, game, t);

  ctx.save();
  ctx.translate(game.fx.shakeX, game.fx.shakeY);

  // The camera IS the crop: take the region it frames and stretch it to fill.
  const halfW = W / (2 * c.z), halfH = H / (2 * c.z);
  ctx.drawImage(wc, c.x - halfW, c.y - halfH, halfW * 2, halfH * 2, 0, 0, W, H);

  // Screen space: the vignette and key glow frame the SCREEN, not the stage —
  // zooming them would slide the darkening around as the fighters move.
  drawStageLight(ctx);
  ctx.restore();

  game.fx.drawOverlay(ctx, W, H);
}

function renderSharp(ctx, game, t, c) {
  const wc = worldCanvas(), wx = wc.getContext('2d');
  wx.setTransform(1, 0, 0, 1, 0, 0);
  wx.clearRect(0, 0, W, H);
  renderBehind(wx, game, t);
  const order = fighterOrder(game);
  const fc = frontCanvas(), fx = fc.getContext('2d');
  fx.setTransform(1, 0, 0, 1, 0, 0);
  fx.clearRect(0, 0, W, H);
  renderInFront(fx, game, t);

  ctx.save();
  ctx.translate(game.fx.shakeX, game.fx.shakeY);
  const halfW = W / (2 * c.z), halfH = H / (2 * c.z);
  ctx.drawImage(wc, c.x - halfW, c.y - halfH, halfW * 2, halfH * 2, 0, 0, W, H);
  ctx.save();
  // the crop above maps world (c.x - halfW, c.y - halfH) to the screen origin at scale c.z
  ctx.transform(c.z, 0, 0, c.z, -(c.x - halfW) * c.z, -(c.y - halfH) * c.z);
  for (const f of order) drawFighter(ctx, f, t);
  ctx.restore();
  ctx.drawImage(fc, c.x - halfW, c.y - halfH, halfW * 2, halfH * 2, 0, 0, W, H);
  drawStageLight(ctx);
  ctx.restore();

  game.fx.drawOverlay(ctx, W, H);
}

// renderWorld reads game.fighters in a fixed order (camera, then shadows, then
// bodies, then icons) that lab/contrast.js and lab/roster.js count on, so the
// split into these helpers keeps that order exactly.
function renderWorld(ctx, game, t) {
  renderBehind(ctx, game, t);
  for (const f of fighterOrder(game)) drawFighter(ctx, f, t);
  renderInFront(ctx, game, t);
}

function renderBehind(ctx, game, t) {
  game.arena.draw(ctx, t);
  drawStageGrade(ctx, t, game.arena);   // push the backdrop back + haze
  drawPerspectiveFloor(ctx, t);     // receding grid — the main depth cue

  // Traps sit on the floor, under everything, so they read as ground you must
  // avoid rather than an object in the fight.
  for (const tr of game.traps || []) drawTrap(ctx, tr, t);
  for (const d of game.drops) drawDrop(ctx, d, t);
  for (const f of game.fighters) { drawShadow(ctx, f); drawFloorSheen(ctx, f); }
  for (const g of game.afterimages) drawAfterimage(ctx, g);
}

// draw the fighter in hitstun/ko behind the attacker for cleaner overlaps
function fighterOrder(game) {
  return [...game.fighters].sort((a, b) => {
    const w = (f) => (f.state === 'attack' ? 2 : f.state === 'hitstun' || f.state === 'ko' ? 0 : 1);
    return w(a) - w(b);
  });
}

function renderInFront(ctx, game, t) {
  for (const f of game.fighters) drawBuffIcons(ctx, f);

  for (const p of game.projectiles) drawProjectile(ctx, p, t);

  drawForeground(ctx, game.arena, t);   // depth layer in front of the fighters
  game.fx.draw(ctx);                // sparks and words belong to the world
}
