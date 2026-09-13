// Fighting-game effects for the live 3D prototype (?gl). RENDER-ONLY.
//
// engine/fx.js keeps the state (impact bursts, the cut-in, the stage dim), and
// the simulation reports hits and specials to it as it always has. This draws:
//   * impact bursts and guard flashes, in the world, over the fighters;
//   * the swipe that follows a striking limb, from the pose drawFighter drew;
//   * a glow and a wake behind every projectile;
//   * the stage dimmed behind the fighters while a cut-in plays;
//   * the cut-in: a band across the screen with the fighter and the move.
// Every function here returns at once while FX_STYLE.impact is off.

import { FX_ART } from '../config.js';
import { FX_STYLE } from './fx.js';
import { drawPortrait, poseOf } from './drawFighter.js';

const rgb = (hex) => {
  const h = String(hex || '#ffffff').replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) || 0);
};
const rgba = (hex, a) => `rgba(${rgb(hex).join(',')},${a})`;
// How saturated a colour is, 0 grey .. 1 pure.
const saturation = (hex) => {
  const c = rgb(hex), hi = Math.max(...c), lo = Math.min(...c);
  return hi === 0 ? 0 : (hi - lo) / hi;
};
// The colour an effect wears for a fighter: their accent, unless it is too
// washed out to read as a colour (Steve's is near white), then their suit.
export function signatureColour(def) {
  const c = def?.c || {};
  if (c.accent && saturation(c.accent) >= 0.35) return c.accent;
  return c.suit || c.accent || '#ffd23f';
}

// A colour taken toward black (k < 1) or toward white (k > 1).
const tone = (hex, k) => {
  const c = rgb(hex).map((v) => (k <= 1 ? v * k : v + (255 - v) * (k - 1)));
  return `rgb(${c.map((v) => Math.round(Math.max(0, Math.min(255, v)))).join(',')})`;
};

// ------------------------------------------------------------ impact bursts

// How far through its life a burst is, and how big and bright that makes it:
// a burst swells quickly, then fades as it keeps growing a little.
export function burstEnvelope(b) {
  const k = Math.min(1, b.t / b.dur);
  const G = FX_ART.IMPACT.GROW;
  return {
    k,
    size: k < G ? 0.45 + 0.55 * (k / G) : 1 + 0.15 * ((k - G) / (1 - G)),
    alpha: k < G ? 1 : 1 - (k - G) / (1 - G),
  };
}

export function drawBursts(ctx, fx) {
  if (!FX_STYLE.impact || !fx.bursts.length) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const b of fx.bursts) {
    const { k, size, alpha } = burstEnvelope(b);
    ctx.save();
    ctx.translate(b.x, b.y);
    if (b.kind === 'hit') drawHit(ctx, b, k, size, alpha);
    else drawGuard(ctx, b, k, size, alpha);
    ctx.restore();
  }
  ctx.restore();
}

function drawHit(ctx, b, k, size, alpha) {
  const r = b.r * size;
  // spikes, longest along the blow
  ctx.fillStyle = rgba(b.color, 0.85 * alpha);
  for (const s of b.spikes) {
    const len = r * s.len * 1.6, w = r * s.w;
    const cx = Math.cos(s.a), sy = Math.sin(s.a);
    ctx.beginPath();
    ctx.moveTo(-sy * w, cx * w);
    ctx.lineTo(cx * len, sy * len);
    ctx.lineTo(sy * w, -cx * w);
    ctx.closePath();
    ctx.fill();
  }
  // streaks thrown along the blow, racing outward
  ctx.strokeStyle = `rgba(255,255,255,${0.9 * alpha})`;
  ctx.lineCap = 'round';
  for (const s of b.streaks) {
    const head = b.dir * (r * 0.5 + k * r * 3.2 * s.speed);
    const tail = head - b.dir * r * s.len * 1.4;
    const y = s.dy * r * 0.55;
    ctx.lineWidth = Math.max(1, 3.5 * (1 - k));
    ctx.beginPath();
    ctx.moveTo(tail, y);
    ctx.lineTo(head, y);
    ctx.stroke();
  }
  // the white-hot core
  const core = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
  core.addColorStop(0, `rgba(255,255,255,${alpha})`);
  core.addColorStop(0.35, rgba(b.color, 0.9 * alpha));
  core.addColorStop(1, rgba(b.color, 0));
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
}

function hexagon(ctx, r, rot) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = rot + (i / 6) * Math.PI * 2;
    ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r * 1.15);
  }
  ctx.closePath();
}

function drawGuard(ctx, b, k, size, alpha) {
  const r = b.r * size;
  const parry = b.kind === 'parry';
  hexagon(ctx, r, b.rot);
  ctx.fillStyle = rgba(b.color, (parry ? 0.3 : 0.18) * alpha);
  ctx.fill();
  ctx.strokeStyle = rgba(b.color, 0.95 * alpha);
  ctx.lineWidth = (parry ? 5 : 3.5) * (1 - k * 0.6);
  ctx.stroke();
  if (parry) {
    hexagon(ctx, r * 1.35, b.rot + 0.3);
    ctx.lineWidth = 2;
    ctx.stroke();
    const core = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.8);
    core.addColorStop(0, `rgba(255,255,255,${alpha})`);
    core.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.8, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ------------------------------------------------------------ strike trails

// The four limb targets of a pose, in world px: drawFighter's own transform
// (translate to the feet, flip for facing, turn by the pose's rotation).
export function limbsInWorld(f, P) {
  const cos = Math.cos(P.rot || 0), sin = Math.sin(P.rot || 0);
  return [P.armF, P.armB, P.legF, P.legB].map((p) => ({
    x: f.x + f.facing * (p.x * cos - p.y * sin),
    y: f.y + (p.x * sin + p.y * cos),
  }));
}

// Which limb is striking: the one that has travelled furthest in the window.
export function strikingLimb(histories) {
  let best = -1, travel = 0;
  histories.forEach((pts, i) => {
    let d = 0;
    for (let j = 1; j < pts.length; j++) d += Math.hypot(pts[j].x - pts[j - 1].x, pts[j].y - pts[j - 1].y);
    if (d > travel) { travel = d; best = i; }
  });
  return { limb: best, travel };
}

const trails = new WeakMap();                 // fighter -> { limbs: [[{x, y, t}] x 4], lastT }

// Call straight after drawFighter(f): it reads the pose just drawn, so the
// trail's head sits on the limb in this very frame.
export function drawTrail(ctx, f, t) {
  if (!FX_STYLE.impact) return;
  const T = FX_ART.TRAIL;
  let tr = trails.get(f);
  if (!tr) {
    tr = { limbs: [[], [], [], []], lastT: -1 };
    trails.set(f, tr);
  }
  const pose = poseOf(f);
  if (f.state === 'attack' && pose && pose.t > tr.lastT) {
    limbsInWorld(f, pose.P).forEach((p, i) => tr.limbs[i].push({ x: p.x, y: p.y, t: pose.t }));
    tr.lastT = pose.t;
  }
  // Points age out on game time, so a trail holds still through hitstop and
  // clears once the strike is over.
  for (const pts of tr.limbs) {
    while (pts.length && pts[0].t < t - T.SPAN) pts.shift();
  }
  const { limb, travel } = strikingLimb(tr.limbs);
  if (limb < 0 || travel < T.MIN_TRAVEL) return;
  ribbon(ctx, tr.limbs[limb], signatureColour(f.def), T);
}

function ribbon(ctx, pts, color, T) {
  const n = pts.length;
  if (n < 2) return;
  const left = [], right = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
    const half = (T.WIDTH / 2) * (i / (n - 1));          // nothing at the tail
    left.push([pts[i].x - (dy / len) * half, pts[i].y + (dx / len) * half]);
    right.push([pts[i].x + (dy / len) * half, pts[i].y - (dx / len) * half]);
  }
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const head = pts[n - 1], tail = pts[0];
  const g = ctx.createLinearGradient(tail.x, tail.y, head.x, head.y);
  g.addColorStop(0, rgba(color, 0));
  g.addColorStop(1, rgba(color, T.ALPHA));
  ctx.fillStyle = g;
  ctx.beginPath();
  left.forEach(([x, y], i) => ctx[i ? 'lineTo' : 'moveTo'](x, y));
  for (let i = n - 1; i >= 0; i--) ctx.lineTo(right[i][0], right[i][1]);
  ctx.closePath();
  ctx.fill();
  const core = ctx.createLinearGradient(tail.x, tail.y, head.x, head.y);
  core.addColorStop(0, 'rgba(255,255,255,0)');
  core.addColorStop(1, 'rgba(255,255,255,0.7)');
  ctx.strokeStyle = core;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  pts.forEach((p, i) => ctx[i ? 'lineTo' : 'moveTo'](p.x, p.y));
  ctx.stroke();
  ctx.restore();
}

// ------------------------------------------------------------ projectiles

const wakes = new WeakMap();                  // projectile -> [{x, y, t}]

// Draw before the projectile itself: a halo in its owner's colour and a wake
// of fading echoes along the path it has flown.
export function drawProjectileGlow(ctx, p, t) {
  if (!FX_STYLE.impact || p.delay > 0) return;
  const P = FX_ART.PROJECTILE;
  const color = signatureColour(p.owner?.def);
  let wake = wakes.get(p);
  if (!wake) {
    wake = [];
    wakes.set(p, wake);
  }
  const last = wake[wake.length - 1];
  if (!last || t - last.t >= P.SPACING) {
    wake.push({ x: p.x, y: p.y, t });
    if (wake.length > P.ECHOES) wake.shift();
  }
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = color;
  wake.forEach((w, i) => {
    const k = (i + 1) / wake.length;
    ctx.globalAlpha = 0.3 * k;
    ctx.beginPath();
    ctx.arc(w.x, w.y, 5 + 13 * k, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
  const halo = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, P.GLOW);
  halo.addColorStop(0, rgba(color, 0.6));
  halo.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(p.x, p.y, P.GLOW, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ------------------------------------------------------------ cut-ins

// How far in and out a cut-in is at its time t: 0 fully off, 1 fully shown.
export function cutInEnvelope(c) {
  const C = FX_ART.CUTIN;
  const ease = (k) => 1 - Math.pow(1 - Math.min(1, Math.max(0, k)), 3);
  return { enter: ease(c.t / C.IN), leave: ease((c.t - (c.dur - C.OUT)) / C.OUT) };
}

// The stage behind the fighters goes dark while a cut-in plays. Drawn in the
// world layer after the grade, before the fighters, so they stay lit.
export function drawStageDim(ctx, fx, W, H) {
  if (!FX_STYLE.impact || !fx.playing) return;
  const { enter, leave } = cutInEnvelope(fx.playing);
  const a = FX_ART.CUTIN.DIM * enter * (1 - leave);
  if (a <= 0) return;
  ctx.fillStyle = `rgba(4,6,16,${a})`;
  ctx.fillRect(0, 0, W, H);
}

// Screen space, over everything but the full-screen flash.
export function drawCutIn(ctx, fx, W, H) {
  const c = fx.playing;
  if (!FX_STYLE.impact || !c) return;
  const C = FX_ART.CUTIN;
  const { enter, leave } = cutInEnvelope(c);
  const color = c.color || signatureColour(c.fighter.def);
  // In from the fighter's side, out through the other.
  const slide = (1 - enter) * c.side * W - leave * c.side * W;
  const y0 = C.Y - C.H / 2, y1 = C.Y + C.H / 2, shear = C.SKEW * C.H;
  const band = () => {
    ctx.beginPath();
    ctx.moveTo(-60 + shear, y0);
    ctx.lineTo(W + 60 + shear, y0);
    ctx.lineTo(W + 60, y1);
    ctx.lineTo(-60, y1);
    ctx.closePath();
  };
  ctx.save();
  ctx.translate(slide, 0);

  const fill = ctx.createLinearGradient(0, y0, 0, y1);
  fill.addColorStop(0, tone(color, 0.8));
  fill.addColorStop(0.45, tone(color, 0.28));
  fill.addColorStop(1, tone(color, 0.55));
  band();
  ctx.fillStyle = fill;
  ctx.fill();

  ctx.save();
  band();
  ctx.clip();
  // speed lines, rushing the way the band came in
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 18; i++) {
    const w = 50 + ((i * 53) % 140);
    const x = ((i * 211 - c.side * c.t * 1500) % (W + 300) + W + 300) % (W + 300) - 150;
    ctx.fillStyle = `rgba(255,255,255,${0.08 + ((i * 7) % 5) * 0.03})`;
    ctx.fillRect(x, y0 + 8 + ((i * 37) % (C.H - 16)), w, 2);
  }
  ctx.globalCompositeOperation = 'source-over';
  // the fighter, on their own side, facing into the screen
  const size = Math.round(C.H * C.BUST);
  if (!c.bust && typeof document !== 'undefined') {
    c.bust = document.createElement('canvas');
    c.bust.width = c.bust.height = size;
    drawPortrait(c.bust, c.fighter.def, { face: 'angry', bare: true, mirror: c.side > 0 });
  }
  if (c.bust) {
    // the portrait puts the head 42% of the way down, so that is the band's centre
    const bx = c.side < 0 ? 20 : W - 20 - size;
    ctx.drawImage(c.bust, bx + c.t * 30 * -c.side, C.Y - size * 0.42, size, size);
  }
  // the move's name, on the other side
  const title = c.name.toUpperCase();
  ctx.font = `900 italic ${c.big ? 58 : 48}px system-ui, sans-serif`;
  ctx.textAlign = c.side < 0 ? 'right' : 'left';
  ctx.textBaseline = 'middle';
  const tx = (c.side < 0 ? W - 70 : 70) + c.t * 20 * c.side;
  ctx.lineJoin = 'round';
  ctx.lineWidth = 8;
  ctx.strokeStyle = '#05070f';
  ctx.strokeText(title, tx, C.Y + 4);
  ctx.fillStyle = tone(color, 1.55);
  ctx.fillText(title, tx, C.Y + 4);
  ctx.restore();

  // edges
  ctx.strokeStyle = tone(color, 1.3);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-60 + shear, y0); ctx.lineTo(W + 60 + shear, y0);
  ctx.moveTo(-60, y1); ctx.lineTo(W + 60, y1);
  ctx.stroke();
  ctx.restore();
}
