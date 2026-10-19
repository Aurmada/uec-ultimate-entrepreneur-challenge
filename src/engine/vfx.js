// Fighting-game effects for the live 3D prototype (?gl). RENDER-ONLY.
//
// engine/fx.js keeps the state (impact bursts, the cut-in), and the
// simulation reports hits and specials to it as it always has. This draws:
//   * impact bursts and guard flashes, in the world, over the fighters;
//   * the swipe that follows a striking limb, from the pose drawFighter drew;
//   * a glow and a wake behind every projectile;
//   * the stage dimmed behind the fighters while a cut-in plays;
//   * the cut-in: a band across the screen with the fighter and the move.
// Every function here returns at once while FX_STYLE.impact is off.

import { FX_ART } from '../config.js';
import { FX_STYLE } from './fx.js';
import { drawPortrait, poseOf } from './drawFighter.js';
import { hexToRGB } from './gl3d/toon.js';

const rgb = (hex) => hexToRGB(hex).map((v) => Math.round(v * 255) || 0);
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
    const draw = DRAW[b.kind] || drawGuard;
    draw(ctx, b.color ? b : { ...b, color: signatureColour(b.who) }, k, size, alpha);
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

// A projectile's flare: light thrown forward from where it left the hand.
function drawLaunch(ctx, b, k, size, alpha) {
  const r = b.r * size;
  const flare = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 2);
  flare.addColorStop(0, `rgba(255,255,255,${alpha})`);
  flare.addColorStop(0.3, rgba(b.color, 0.8 * alpha));
  flare.addColorStop(1, rgba(b.color, 0));
  ctx.fillStyle = flare;
  ctx.beginPath();
  ctx.moveTo(-b.dir * r * 0.3, 0);
  ctx.lineTo(b.dir * r * 2, -r * 0.7);
  ctx.quadraticCurveTo(b.dir * r * 2.4, 0, b.dir * r * 2, r * 0.7);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2);
  ctx.fill();
}

// Fire thrown up and forward: flame tongues from white through yellow to red,
// round a hot core, over a shock spreading along the floor below.
function drawBlast(ctx, b, k, size, alpha) {
  const r = b.r * size;
  ctx.save();
  ctx.scale(1, 0.22);
  ctx.strokeStyle = `rgba(255,157,26,${0.7 * alpha})`;
  ctx.lineWidth = 10 * (1 - k) + 2;
  ctx.beginPath();
  ctx.arc(0, 60 / 0.22 * 0.9, r * (0.6 + k * 1.6), 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  for (const p of b.petals) {
    const len = r * p.len * (0.7 + 0.6 * k), w = r * p.w;
    const cx = Math.cos(p.a), sy = Math.sin(p.a);
    const tip = [cx * len, sy * len];
    const g = ctx.createLinearGradient(0, 0, tip[0], tip[1]);
    g.addColorStop(0, `rgba(255,244,200,${alpha})`);
    g.addColorStop(0.35, `rgba(255,${190 - Math.round(p.hue * 60)},40,${0.9 * alpha})`);
    g.addColorStop(1, 'rgba(255,61,46,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-sy * w, cx * w);
    ctx.quadraticCurveTo(tip[0] * 0.55 - sy * w * 1.4, tip[1] * 0.55 + cx * w * 1.4, tip[0], tip[1]);
    ctx.quadraticCurveTo(tip[0] * 0.55 + sy * w * 1.4, tip[1] * 0.55 - cx * w * 1.4, sy * w, -cx * w);
    ctx.closePath();
    ctx.fill();
  }
  const core = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.55);
  core.addColorStop(0, `rgba(255,255,230,${alpha})`);
  core.addColorStop(1, 'rgba(255,157,26,0)');
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2);
  ctx.fill();
}

// A teleport: a pillar of light standing where the fighter is, narrowing to
// nothing as they vanish, opening then fading as they arrive.
function drawWarp(ctx, b, k) {
  const Wp = FX_ART.WARP;
  const vanish = b.kind === 'vanish';
  const width = vanish ? b.r * (1 - k) : b.r * Math.min(1, k * 4) * (1 - 0.4 * k);
  const a = vanish ? 1 - k * 0.5 : 1 - k;
  if (width <= 0.5 || a <= 0) return;
  const cy = -Wp.H / 2;
  for (const [scale, alpha] of [[2.2, 0.35 * a], [1, 0.9 * a]]) {
    const g = ctx.createLinearGradient(-width * scale, 0, width * scale, 0);
    g.addColorStop(0, rgba(b.color, 0));
    g.addColorStop(0.5, scale > 1 ? rgba(b.color, alpha) : `rgba(255,255,255,${alpha})`);
    g.addColorStop(1, rgba(b.color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, cy, width * scale, Wp.H / 2 * (vanish ? 1 : 0.7 + 0.3 * Math.min(1, k * 4)), 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = rgba(b.color, 0.8 * a);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(0, -4, b.r * (1.2 + k * 1.8), b.r * 0.3 * (1.2 + k * 1.8), 0, 0, Math.PI * 2);
  ctx.stroke();
}

// A parcel landing: a shock spreading flat across the floor in the thrower's
// colour, dust rays fanned upward round the box, and a white flash where it
// struck. Drawn flat (scaled in y) because it happens ON the floor.
function drawSlam(ctx, b, k, size, alpha) {
  const r = b.r * size;
  ctx.save();
  ctx.scale(1, 0.24);
  ctx.strokeStyle = rgba(b.color, 0.85 * alpha);
  ctx.lineWidth = 12 * (1 - k) + 2;
  ctx.beginPath();
  ctx.arc(0, 0, r * (0.5 + k * 1.3), 0, Math.PI * 2);
  ctx.stroke();
  const pool = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.9);
  pool.addColorStop(0, `rgba(255,255,255,${0.8 * alpha * (1 - k)})`);
  pool.addColorStop(1, rgba(b.color, 0));
  ctx.fillStyle = pool;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.9, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = `rgba(235,225,200,${0.75 * alpha})`;
  ctx.lineCap = 'round';
  for (const ray of b.rays) {
    const from = r * (0.25 + 0.5 * k), to = from + r * ray.len * (0.6 + 0.6 * k);
    const cx = Math.cos(ray.a), sy = Math.sin(ray.a);
    ctx.lineWidth = Math.max(1, r * ray.w * (1 - k));
    ctx.beginPath();
    ctx.moveTo(cx * from, sy * from * 0.8);
    ctx.lineTo(cx * to, sy * to * 0.8);
    ctx.stroke();
  }
}

const DRAW = { hit: drawHit, guard: drawGuard, parry: drawGuard, launch: drawLaunch, blast: drawBlast, vanish: drawWarp, arrive: drawWarp, slam: drawSlam };

// ------------------------------------------------------------ auras

// What a fighter is in the middle of, drawn behind them: the glow of their
// ALIGNMENT SHIFT stance, a flicker while a counter is live, speed lines
// behind a rush. Read straight from the fighter each frame; nothing stored.
export function drawAura(ctx, f, t) {
  if (!FX_STYLE.impact || f.state === 'ko') return;
  const A = FX_ART.AURA;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  if (f.stanceId) {
    const S = A.STANCE;
    const color = f.stanceId === 'safety' ? S.SAFETY : S.CAPABILITIES;
    const pulse = 0.75 + 0.25 * Math.sin(t * S.RATE);
    const g = ctx.createRadialGradient(f.x, f.y - 95, 10, f.x, f.y - 95, S.R);
    g.addColorStop(0, rgba(color, S.ALPHA * pulse));
    g.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(f.x - S.R, f.y - 95 - S.R, S.R * 2, S.R * 2);
    // and a stance circle on the floor, which reads even against a bright stage
    ctx.strokeStyle = rgba(color, 0.7 * pulse);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(f.x, f.y - 2, 62, 14, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (typeof f.counterActive === 'function' && f.counterActive()) {
    const C = A.COUNTER;
    const flick = 0.55 + 0.45 * Math.abs(Math.sin(t * C.RATE));
    ctx.strokeStyle = rgba(C.COLOR, 0.85 * flick);
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(f.x, f.y - 92, 58, 104, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(f.x, f.y - 92, 70, 118, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  const a = f.attack;
  if (f.state === 'attack' && a?.kind === 'rush' && f.stateT >= a.startup) {
    const R = A.RUSH;
    const color = signatureColour(f.def);
    for (let i = 0; i < R.LINES; i++) {
      const y = f.y - 20 - ((i * 37) % 150);
      const len = R.LENGTH * (0.5 + ((i * 53) % 50) / 100);
      const x0 = f.x - f.facing * (30 + ((i * 29 + t * 900) % 60));
      const g = ctx.createLinearGradient(x0, y, x0 - f.facing * len, y);
      g.addColorStop(0, i % 2 ? rgba(color, 0.8) : 'rgba(255,255,255,0.7)');
      g.addColorStop(1, rgba(color, 0));
      ctx.strokeStyle = g;
      ctx.lineWidth = i % 3 === 0 ? 3 : 1.5;
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x0 - f.facing * len, y);
      ctx.stroke();
    }
  }
  ctx.restore();
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
// trail's head sits on the limb in this very frame. `clock` is game.simT, the
// time the poses move on: it stops for hitstop, so the trail holds still
// through the freeze instead of draining away, and clears once the strike is
// over. (game.t keeps running during hitstop, which is why it is not used.)
export function drawTrail(ctx, f, clock) {
  if (!FX_STYLE.impact) return;
  const T = FX_ART.TRAIL;
  let tr = trails.get(f);
  if (!tr) {
    tr = { limbs: [[], [], [], []], lastT: -1 };
    trails.set(f, tr);
  }
  const pose = poseOf(f);
  if (f.state === 'attack' && pose && clock > tr.lastT) {
    limbsInWorld(f, pose.P).forEach((p, i) => tr.limbs[i].push({ x: p.x, y: p.y, t: clock }));
    tr.lastT = clock;
  }
  for (const pts of tr.limbs) {
    while (pts.length && pts[0].t < clock - T.SPAN) pts.shift();
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
// of fading echoes along the path it has flown. `clock` is game.simT, as for
// trails, so a wake holds its shape through hitstop.
export function drawProjectileGlow(ctx, p, clock) {
  if (!FX_STYLE.impact || p.delay > 0) return;
  const P = FX_ART.PROJECTILE;
  const color = signatureColour(p.owner?.def);
  let wake = wakes.get(p);
  if (!wake) {
    wake = [];
    wakes.set(p, wake);
  }
  const last = wake[wake.length - 1];
  if (!last || clock - last.t >= P.SPACING) {
    wake.push({ x: p.x, y: p.y, t: clock });
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
