// THE FIGURE: fighters drawn as anatomy rather than tubes (render-only,
// behind ?figure while it is reviewed).
//
// The tube rig drew a limb as two round strokes from shoulder to fist, with
// the elbow bowed out by a guess and no fixed length, a torso narrower than
// the head, no neck, ball hands and slab feet. However well it was posed it
// read as a mannequin. The genre draws people: a chest over a waist over
// hips, a neck with the traps sloping off it, arms of one length that bend
// at a real elbow, a fist with knuckles and a thumb, a shoe with a heel and a
// toe, and a light that gives every one of those forms a lit side and a
// shadow side.
//
// Same pose data in (computePose and applyProportions), so the fight cannot
// tell which renderer drew it. Nothing here reads or writes simulation state.
//
// Every shape is a closed spline through points built from the skeleton, so
// a pose, a body knob or a character's build moves the points and the shape
// follows. All the numbers are in FIGURE (config.js).

import { FIGURE as F, STYLIZE } from '../config.js';

const OUTLINE = '#0a0c16';

// ---- colour ---------------------------------------------------------------

const rgbOf = new Map();
function rgb(hex) {
  let v = rgbOf.get(hex);
  if (!v) {
    const n = parseInt(hex.slice(1, 7), 16);
    v = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    rgbOf.set(hex, v);
  }
  return v;
}
const mixed = new Map();
// a toward b by k. Cached: a match asks for the same few dozen every frame.
export function mix(a, b, k) {
  if (typeof a !== 'string' || a[0] !== '#' || a.length < 7) return a;
  const key = `${a}${b}${k}`;
  let out = mixed.get(key);
  if (!out) {
    const A = rgb(a), B = rgb(b);
    const c = A.map((x, i) => Math.round(x + (B[i] - x) * k));
    out = `#${((c[0] << 16) | (c[1] << 8) | c[2]).toString(16).padStart(6, '0')}`;
    if (mixed.size > 4096) mixed.clear();
    mixed.set(key, out);
  }
  return out;
}
// Paint the current path in shadow: multiplied, so detail under it survives.
function darken(ctx, skin, alpha = 1) {
  const was = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = alpha;
  ctx.fillStyle = skin ? F.SKIN_SHADE : F.SHADE;
  ctx.fill();
  ctx.globalCompositeOperation = was;
  ctx.globalAlpha = 1;
}
const hiliteOf = (col) => mix(col, F.HILITE, F.HILITE_AMT);

// ---- geometry -------------------------------------------------------------

const LX = F.LIGHT[0] / Math.hypot(...F.LIGHT), LY = F.LIGHT[1] / Math.hypot(...F.LIGHT);

// Two-bone IK in the plane: where the elbow (or knee) goes for a joint at
// (sx, sy) reaching (tx, ty), bones a and b, bending toward the pole. Out of
// reach, the limb straightens and both bones stretch to make up the gap: the
// fist has to land where the pose put it, because that is where the hit is.
export function solveJoint(sx, sy, tx, ty, a, b, px, py) {
  const dx = tx - sx, dy = ty - sy;
  const d = Math.hypot(dx, dy);
  if (d < 1e-3) return [sx + px * a, sy + py * a];
  if (d >= a + b) { const k = a / (a + b); return [sx + dx * k, sy + dy * k]; }
  const ux = dx / d, uy = dy / d;
  const x = Math.max(-a, Math.min(a, (a * a - b * b + d * d) / (2 * d)));
  const h = Math.sqrt(Math.max(0, a * a - x * x));
  let nx = -uy, ny = ux;
  if (nx * px + ny * py < 0) { nx = -nx; ny = -ny; }
  return [sx + ux * x + nx * h, sy + uy * x + ny * h];
}

function at(prof, t) {
  for (let i = 1; i < prof.length; i++) {
    if (t <= prof[i][0]) {
      const [t0, v0] = prof[i - 1], [t1, v1] = prof[i];
      return v0 + ((v1 - v0) * (t - t0)) / (t1 - t0 || 1);
    }
  }
  return prof[prof.length - 1][1];
}
// A profile with its bulges scaled about 1: 0 is a straight tube, 1 is as
// authored, more is a bodybuilder.
const flex = (prof, k) => prof.map(([t, v]) => [t, 1 + (v - 1) * k]);

// A closed Catmull-Rom spline through pts, as cubic Beziers.
function spline(ctx, pts) {
  const n = pts.length;
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    ctx.bezierCurveTo(
      p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6,
      p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6,
      p2[0], p2[1]);
  }
  ctx.closePath();
}
// The same, open, for a line drawn on a form (a fold, a seam).
function curve(ctx, pts) {
  ctx.moveTo(pts[0][0], pts[0][1]);
  if (pts.length === 2) { ctx.lineTo(pts[1][0], pts[1][1]); return; }
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
    ctx.quadraticCurveTo(pts[i][0], pts[i][1], i === pts.length - 2 ? pts[i + 1][0] : mx, i === pts.length - 2 ? pts[i + 1][1] : my);
  }
}

const STATIONS = [0, 0.2, 0.4, 0.6, 0.8, 1];

// One limb segment, a to b. (onx, ony) is the unit normal toward its outer
// side (the side the elbow or knee points); wo and wi are the half-widths on
// each side and po and pi their profiles. Ends are rounded.
function segment(ax, ay, bx, by, onx, ony, wo, po, wi, pi) {
  const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  const outer = [], inner = [];
  for (const t of STATIONS) {
    const cx = ax + dx * t, cy = ay + dy * t;
    const o = wo * at(po, t), i = wi * at(pi, t);
    outer.push([cx + onx * o, cy + ony * o]);
    inner.push([cx - onx * i, cy - ony * i]);
  }
  const cap = (x, y, o, i, dir) => {
    // a half round over the end, centred between its two edges
    const r = (o + i) / 2, cx = x + (onx * (o - i)) / 2, cy = y + (ony * (o - i)) / 2;
    const s = Math.SQRT1_2;
    return dir > 0
      ? [[cx + (ux * s + onx * s) * r, cy + (uy * s + ony * s) * r], [cx + ux * r, cy + uy * r], [cx + (ux * s - onx * s) * r, cy + (uy * s - ony * s) * r]]
      : [[cx + (-ux * s - onx * s) * r, cy + (-uy * s - ony * s) * r], [cx - ux * r, cy - uy * r], [cx + (-ux * s + onx * s) * r, cy + (-uy * s + ony * s) * r]];
  };
  const pts = [
    ...outer,
    ...cap(bx, by, wo * at(po, 1), wi * at(pi, 1), 1),
    ...[...inner].reverse(),
    ...cap(ax, ay, wo * at(po, 0), wi * at(pi, 0), -1),
  ];
  return { pts, outer, inner, onx, ony, ux, uy, ax, ay, bx, by, len, path: (c) => spline(c, pts) };
}

// The outer normal of a -> b: the side `ref` (a direction) points to.
function sideOf(ax, ay, bx, by, rx, ry) {
  const len = Math.hypot(bx - ax, by - ay) || 1;
  let nx = -(by - ay) / len, ny = (bx - ax) / len;
  if (nx * rx + ny * ry < 0) { nx = -nx; ny = -ny; }
  return [nx, ny];
}

// ---- painting -------------------------------------------------------------

let INK = 1;   // the caller's ink scale (the shaded buffer draws bolder)

// Ink the union of some shapes, then fill them: every outline is stroked at
// twice its width first and the fills then cover the inner half, so a limb
// made of four overlapping shapes comes out as one shape with one outline.
function inkFill(ctx, shapes) {
  ctx.lineJoin = 'round';
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = F.INK * INK * 2;
  for (const s of shapes) { ctx.beginPath(); s.path(ctx); ctx.stroke(); }
  for (const s of shapes) { ctx.beginPath(); s.path(ctx); ctx.fillStyle = s.fill; ctx.fill(); }
}

// Shadow and highlight on one segment, clipped to it: the side facing away
// from the light gets a hard-edged band of shadow, the lit side a thin glint.
function shadeSegment(ctx, seg, fill, skin, glint = 0.6) {
  const lit = seg.onx * LX + seg.ony * LY > 0;   // is the outer side lit?
  const dark = lit ? seg.inner : seg.outer;
  const light = lit ? seg.outer : seg.inner;
  ctx.save();
  ctx.beginPath(); seg.path(ctx); ctx.clip();
  const band = [];
  for (let k = 0; k < dark.length; k++) {
    const [x, y] = dark[k], [lx, ly] = light[k];
    // pushed past the edge so the clip, not the polygon, makes the silhouette
    band.push([x + (x - lx) * 0.4, y + (y - ly) * 0.4]);
  }
  for (let k = dark.length - 1; k >= 0; k--) {
    const [x, y] = dark[k], [lx, ly] = light[k];
    band.push([x + (lx - x) * F.CUT, y + (ly - y) * F.CUT]);
  }
  ctx.beginPath(); band.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath();
  darken(ctx, skin);
  if (glint > 0) {
    const g = [];
    for (let k = 1; k < light.length - 2; k++) {
      const [x, y] = light[k], [dx, dy] = dark[k];
      g.push([x + (dx - x) * 0.12, y + (dy - y) * 0.12]);
    }
    for (let k = light.length - 3; k >= 1; k--) {
      const [x, y] = light[k], [dx, dy] = dark[k];
      g.push([x + (dx - x) * 0.26, y + (dy - y) * 0.26]);
    }
    ctx.globalAlpha = glint;
    ctx.beginPath(); spline(ctx, g);
    ctx.fillStyle = hiliteOf(fill);
    ctx.fill();
  }
  ctx.restore();
}

function crease(ctx, pts, alpha = 0.7, w = F.CREASE) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = w * INK;
  ctx.lineCap = 'round';
  ctx.beginPath(); curve(ctx, pts); ctx.stroke();
  ctx.restore();
}

// A point on a segment: t along it, s across (in half-widths of `w`, toward
// the outer side when positive).
const on = (seg, t, s, w) => [
  seg.ax + (seg.bx - seg.ax) * t + seg.onx * s * w,
  seg.ay + (seg.by - seg.ay) * t + seg.ony * s * w,
];

// ---- hands and feet -------------------------------------------------------

// A fist at the wrist, knuckles along the forearm, palm toward `in`. In
// profile: the back of the hand, the knuckle ridge, the curled fingers under
// it and the thumb folded across them.
function fist(ctx, wx, wy, ux, uy, nx, ny, s, skin, open) {
  const L = F.HAND.LEN * s, H = F.HAND.H * s;
  const P = (x, y) => [wx + ux * x + nx * y, wy + uy * x + ny * y];
  let outline, extra;
  if (open) {
    // The flat of the hand, fingers out together, thumb off the palm.
    outline = [P(-1, -H * 0.38), P(L * 0.55, -H * 0.46), P(L * 1.35, -H * 0.36), P(L * 1.62, -H * 0.12),
      P(L * 1.5, H * 0.14), P(L * 0.9, H * 0.3), P(L * 0.7, H * 0.62), P(L * 0.42, H * 0.6), P(-1, H * 0.36)];
    extra = (c) => {
      crease(c, [P(L * 0.75, -H * 0.18), P(L * 1.4, -H * 0.12)], 0.6, 1.2);
      crease(c, [P(L * 0.75, H * 0.04), P(L * 1.36, H * 0.06)], 0.6, 1.2);
    };
  } else {
    // squared off: a flat knuckle face, the fingers folded under it
    outline = [P(-1, -H * 0.4), P(L * 0.5, -H * 0.5), P(L * 0.9, -H * 0.48), P(L * 1.04, -H * 0.24),
      P(L * 1.04, H * 0.22), P(L * 0.88, H * 0.5), P(L * 0.3, H * 0.52), P(-1, H * 0.36)];
    extra = (c) => {
      // the fold of the fingers, the knuckle ridge, and the thumb along the palm
      crease(c, [P(L * 1.0, -H * 0.2), P(L * 0.66, -H * 0.12), P(L * 0.62, H * 0.2)], 0.8, 1.4);
      crease(c, [P(L * 0.84, -H * 0.44), P(L * 0.84, -H * 0.28)], 0.55, 1.2);
      crease(c, [P(L * 0.3, H * 0.3), P(L * 0.62, H * 0.24), P(L * 0.84, H * 0.36)], 0.8, 1.4);
    };
  }
  const shape = { path: (c) => spline(c, outline), fill: skin };
  inkFill(ctx, [shape]);
  // shade the palm side when it faces down, the back when it faces down
  ctx.save();
  ctx.beginPath(); shape.path(ctx); ctx.clip();
  const darkSide = nx * LX + ny * LY > 0 ? -1 : 1;
  ctx.beginPath();
  spline(ctx, [P(-2, darkSide * H * 0.1), P(L * 0.6, darkSide * H * 0.16), P(L * 1.7, darkSide * H * 0.1), P(L * 1.7, darkSide * H), P(-2, darkSide * H)]);
  darken(ctx, true);
  ctx.restore();
  extra(ctx);
}

// A shoe with its ankle at (x, y), toe along +x of the rotated frame.
// `rot` turns it with the shin once the foot leaves the floor.
function shoe(ctx, x, y, rot, s, col, back) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(s, s);
  const A = F.ANKLE;
  const pts = [[-6, -4], [-9, 1], [-8.5, A - 1.5], [-5, A], [21, A], [26, A - 2.5], [24.5, 2], [15, -1.5], [6, -5], [1, -7]];
  const shape = { path: (c) => spline(c, pts), fill: col };
  const was = INK; INK /= s;          // the outline stays one weight however big the foot
  inkFill(ctx, [shape]);
  ctx.save();
  ctx.beginPath(); shape.path(ctx); ctx.clip();
  const light = (rgb(col)[0] + rgb(col)[1] + rgb(col)[2]) / 3 > 140;
  // the sole: a pale rubber band on a light trainer, a dark welt on a shoe
  ctx.fillStyle = light ? mix(col, '#9aa0b8', 0.5) : mix(col, '#000000', 0.5);
  ctx.fillRect(-12, A - 3, 42, 6);
  // the far side of the shoe, turned from the light
  ctx.beginPath(); ctx.moveTo(-12, -2); ctx.quadraticCurveTo(-4, 2, -6, A - 3); ctx.lineTo(-12, A - 3); ctx.closePath();
  darken(ctx, false);
  // a glint on the toe cap
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = hiliteOf(col);
  ctx.beginPath(); ctx.ellipse(17, 1.5, 5, 1.6, -0.25, 0, 7); ctx.fill();
  ctx.restore();
  ctx.strokeStyle = OUTLINE; ctx.globalAlpha = 0.8;
  ctx.lineWidth = 1.3 * INK;
  ctx.beginPath(); ctx.moveTo(-8.5, A - 3); ctx.lineTo(25.5, A - 3); ctx.stroke();
  if (light && !back) {
    ctx.beginPath(); ctx.moveTo(7, -3.5); ctx.lineTo(10, -1); ctx.moveTo(10.5, -2.5); ctx.lineTo(13.5, 0); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  INK = was;
  ctx.restore();
}

// ---- the body ---------------------------------------------------------------

// What a character's top does to the limbs: which colour each part of the arm
// is, and whether the cuff shows.
function garment(def) {
  const c = def.c;
  switch (def.outfit) {
    case 'tee': return { sleeve: c.suit, short: true, cuff: null, tight: 0.8 };
    case 'vest': return { sleeve: '#e8ecf4', cuff: null, tight: 0.5 };
    case 'suit': case 'pinstripe': case 'blazer': return { sleeve: c.suit, cuff: '#f4f6ff', tight: 0.3 };
    case 'hoodie': return { sleeve: c.suit, cuff: c.suit2, tight: 0.2, loose: true };
    case 'bomber': return { sleeve: c.suit, cuff: c.suit2, tight: 0.25, loose: true };
    case 'turtleneck': return { sleeve: c.suit, cuff: null, tight: 0.7 };
    default: return { sleeve: c.suit, cuff: null, tight: 0.55 };
  }
}

const FIG_DEFAULT = { chest: 1, waist: 1, hips: 1, belly: 0, muscle: 1, frame: 'm', neck: 1, jaw: 1 };
const figOf = (def) => ({ ...FIG_DEFAULT, ...(def.figure || {}) });

// The skeleton the figure is drawn over, solved from a pose: shoulder and hip
// sockets on the leaned torso, then each elbow and knee. Pure, so the tests
// can hold it to the anatomy without a canvas.
export function figureSkeleton(def, P) {
  const fig = figOf(def);
  const b = P.build ?? 1, reach = P.reach ?? 1, stride = P.stride ?? 1;
  const lean = (P.bodyLean || 0) * 0.6;
  const cosL = Math.cos(lean), sinL = Math.sin(lean);
  const socket = (x, y) => {
    const dy = y - P.hipY;
    return [x * cosL - dy * sinL, P.hipY + x * sinL + dy * cosL];
  };
  const sw = (P.shoulderW ?? 1) * b * (fig.frame === 'f' ? 0.86 : 1);
  const hw = b * fig.hips;
  const arm = (sx, sy, hx, hy) => {
    let [a1, a2] = [F.ARM[0] * reach, F.ARM[1] * reach];
    const out = Math.hypot(hx - sx, hy - sy) / (a1 + a2);
    if (out > F.ARM_LOCK[0]) {
      const k = Math.min(1, (out - F.ARM_LOCK[0]) / (F.ARM_LOCK[1] - F.ARM_LOCK[0]));
      const lock = 1 - k * k * (3 - 2 * k) * Math.max(0, 1 - out);
      a1 *= lock; a2 *= lock;
    }
    return { s: [sx, sy], e: solveJoint(sx, sy, hx, hy, a1, a2, F.ELBOW_POLE[0], F.ELBOW_POLE[1]), h: [hx, hy], len: a1 + a2 };
  };
  const leg = (hx, hy, fx, fy) => {
    const ax = fx, ay = fy - F.ANKLE * b;
    const [l1, l2] = [F.LEG[0] * stride, F.LEG[1] * stride];
    return { h: [hx, hy], k: solveJoint(hx, hy, ax, ay, l1, l2, F.KNEE_POLE[0], F.KNEE_POLE[1]), a: [ax, ay], f: [fx, fy], len: l1 + l2 };
  };
  return {
    fig,
    armF: arm(...socket(F.SOCKET_F[0] * sw, P.shoulderY + F.SOCKET_F[1]), P.armF.x, P.armF.y),
    armB: arm(...socket(F.SOCKET_B[0] * sw, P.shoulderY + F.SOCKET_B[1]), P.armB.x, P.armB.y),
    legF: leg(...socket(F.HIP_F * hw, P.hipY), P.legF.x, P.legF.y),
    legB: leg(...socket(F.HIP_B * hw, P.hipY), P.legB.x, P.legB.y),
  };
}

// One arm over its joints `J`; `back` is the far arm.
function arm(ctx, def, P, fig, J, back, open) {
  const c = def.c, G = garment(def);
  const b = P.build ?? 1;
  const dim = (col) => (back ? mix(col, F.SHADOW, F.BACK_DIM) : col);
  const [sx, sy] = J.s, [ex, ey] = J.e, [hx, hy] = J.h;
  // muscle shows through cloth only as far as the cloth clings
  const m = fig.muscle * (G.short ? 1 : G.tight);
  const loose = G.loose ? F.CLOTH.LOOSE : 1;
  const wu = F.W.UPPER * b * (0.9 + 0.1 * fig.muscle) * loose;
  const wf = F.W.FORE * b * (0.92 + 0.08 * fig.muscle) * loose;
  // outer side = the elbow side of each bone
  const [un1x, un1y] = sideOf(sx, sy, ex, ey, ex - (sx + hx) / 2, ey - (sy + hy) / 2);
  const [un2x, un2y] = sideOf(ex, ey, hx, hy, ex - (sx + hx) / 2, ey - (sy + hy) / 2);
  const upper = segment(sx, sy, ex, ey, un1x || F.ELBOW_POLE[0], un1y || 1,
    wu, flex(F.PROFILE.UPPER_OUT, m), wu, flex(F.PROFILE.UPPER_IN, m));
  const fore = segment(ex, ey, hx, hy, un2x || F.ELBOW_POLE[0], un2y || 1,
    wf, flex(F.PROFILE.FORE_OUT, m), wf, flex(F.PROFILE.FORE_IN, m));
  const dr = F.W.DELTOID * b * (0.88 + 0.12 * fig.muscle) * (fig.frame === 'f' ? 0.86 : 1);
  const delt = { path: (cx) => cx.ellipse(sx - 1, sy - 2, dr, dr * 0.92, 0, 0, Math.PI * 2) };

  const sleeve = dim(G.sleeve), skin = dim(c.skin);
  upper.fill = G.short ? skin : sleeve;
  fore.fill = G.short ? skin : sleeve;
  delt.fill = sleeve;
  inkFill(ctx, [delt, upper, fore]);

  if (G.short) {
    // a short sleeve over the deltoid and the top of the arm
    ctx.save();
    ctx.beginPath(); upper.path(ctx); ctx.clip();
    const [p1x, p1y] = on(upper, 0.5, 2.4, wu), [p2x, p2y] = on(upper, 0.56, -2.4, wu);
    ctx.beginPath();
    ctx.moveTo(sx - upper.ux * 30, sy - upper.uy * 30);
    ctx.lineTo(p1x, p1y); ctx.lineTo(p2x, p2y); ctx.closePath();
    ctx.fillStyle = sleeve; ctx.fill();
    ctx.restore();
  }
  shadeSegment(ctx, upper, upper.fill, G.short, back ? 0 : 0.5);
  shadeSegment(ctx, fore, fore.fill, G.short, back ? 0 : 0.5);
  if (G.short) {
    crease(ctx, [on(upper, 0.5, 1.15, wu), on(upper, 0.56, -1.15, wu)], 0.9, 1.6);
  } else {
    // the fold at the inside of the elbow, deeper the more it bends
    const bend = 1 - Math.min(1, Math.hypot(hx - sx, hy - sy) / J.len);
    if (bend > 0.12) crease(ctx, [on(upper, 0.84, -0.9, wu), on(fore, 0.12, -0.5, wf)], 0.55);
  }
  if (G.cuff) {
    const cuff = segment(...on(fore, 0.84, 0, 0), hx, hy, fore.onx, fore.ony, wf * 0.66, [[0, 1], [1, 1]], wf * 0.66, [[0, 1], [1, 1]]);
    cuff.fill = dim(G.cuff);
    inkFill(ctx, [cuff]);
  }
  // the hand, palm toward the body's front-and-down
  const fx = fore.ux, fy = fore.uy;
  let [nx, ny] = [-fy, fx];
  if (nx * -0.6 + ny * 1 < 0) { nx = -nx; ny = -ny; }
  fist(ctx, hx - fx * 3, hy - fy * 3, fx, fy, nx, ny, (back ? F.HAND.BACK : 1) * b, dim(c.skin), open);
}

// One leg over its joints `J`; `back` is the far leg.
function leg(ctx, def, P, fig, J, back) {
  const c = def.c;
  const b = P.build ?? 1;
  const dim = (col) => (back ? mix(col, F.SHADOW, F.BACK_DIM) : col);
  const [hx, hy] = J.h, [kx, ky] = J.k, [ax, ay] = J.a, fy = J.f[1];
  const m = fig.muscle * 0.4;
  const wt = F.W.THIGH * b * (fig.frame === 'f' ? 1.02 : 1), ws = F.W.SHIN * b;
  const ref = [kx - (hx + ax) / 2, ky - (hy + ay) / 2];
  const [n1x, n1y] = sideOf(hx, hy, kx, ky, ...ref);
  const [n2x, n2y] = sideOf(kx, ky, ax, ay, ...ref);
  const thigh = segment(hx, hy, kx, ky, n1x || 1, n1y, wt, flex(F.PROFILE.THIGH_OUT, m), wt, flex(F.PROFILE.THIGH_IN, m));
  // trousers fall straight from the knee rather than following the calf
  const shin = segment(kx, ky, ax, ay, n2x || 1, n2y, ws, F.PROFILE.TROUSER, ws, F.PROFILE.TROUSER);
  // the foot: flat on the floor, turning with the shin as it lifts
  const lift = Math.max(0, Math.min(1, -fy / 12));
  const shinAng = Math.atan2(ay - ky, ax - kx) - Math.PI / 2;
  thigh.fill = shin.fill = dim(c.pants);
  inkFill(ctx, [thigh, shin]);
  shadeSegment(ctx, thigh, thigh.fill, false, back ? 0 : 0.35);
  shadeSegment(ctx, shin, shin.fill, false, back ? 0 : 0.35);
  // the shoe over the trouser hem, so the whole of it reads
  shoe(ctx, ax, ay, shinAng * lift, b * F.FOOT.SCALE * (back ? F.FOOT.BACK : 1), dim(c.shoe), back);
  // the knee, and the trousers breaking over the shoe
  const bend = 1 - Math.min(1, Math.hypot(ax - hx, ay - hy) / J.len);
  if (bend > 0.04) {
    crease(ctx, [on(thigh, 0.86, -0.85, wt), on(thigh, 0.97, -0.25, wt)], 0.55);
    crease(ctx, [on(shin, 0.08, -0.6, ws), on(shin, 0.18, -0.15, ws)], 0.45);
  }
}

// The torso in its own (leaned) frame: neck, shoulders, chest, waist, hips
// and the hem of whatever the fighter wears over them, as one outline.
function torsoShape(def, P, fig) {
  const T = F.TORSO, s = P.shoulderY, h = P.hipY, L = Math.max(30, h - s);
  const b = P.build ?? 1, sw = (P.shoulderW ?? 1) * (fig.frame === 'f' ? 0.86 : 1);
  const hem = F.HEM[def.outfit] ?? 5;
  const x = (pair, k) => [pair[0] * k, pair[1] * k];
  const [shF, shB] = x(T.SH, sw * b), [chF, chB] = x(T.CH, fig.chest * b * (0.6 + 0.4 * sw));
  const [waF, waB] = x(T.WA, fig.waist * b), [hiF, hiB] = x(T.HI, fig.hips * b);
  const belly = fig.belly * 11 * b;
  const y = (f) => s + L * f;
  const pts = [
    [5, s - 9],
    [shF * 0.6, s - 3.5],
    [shF, s + 4],
    [chF, y(T.Y_CH)],
    [chF * 0.86 + belly * 0.35, y(T.Y_RIB)],
    [waF + belly, y(T.Y_WA)],
    [hiF + belly * 0.3, h - 2],
    [hiF * 0.92, h + hem],
    [hiB * 0.92, h + hem],
    [hiB, h - 4],
    [waB, y(T.Y_WA - 0.02)],
    [chB, y(T.Y_CH + 0.1)],
    [shB, s + 4],
    [shB * 0.62, s - 3.5],
    [-5, s - 9],
  ];
  return { pts, s, h, L, y, hem, chF, chB, waF, waB, hiF, hiB, shF, shB, belly, path: (c) => spline(c, pts) };
}

function pelvis(ctx, def, P, fig, Tz) {
  const { h, y, waF, waB, hiF, hiB } = Tz;
  const pts = [[waF, y(0.66)], [hiF + 1, h - 1], [hiF * 0.72, h + 14], [0, h + 16], [hiB * 0.8, h + 13], [hiB - 1, h - 2], [waB, y(0.64)]];
  const shape = { path: (c) => spline(c, pts), fill: def.c.pants };
  inkFill(ctx, [shape]);
}

// The terminator across the torso: everything behind it is in shadow.
function shadeTorso(ctx, Tz, fill, skin) {
  const { s, h, y, shB, chB, waB, hiB, hem } = Tz;
  ctx.save();
  ctx.beginPath(); Tz.path(ctx); ctx.clip();
  ctx.beginPath();
  ctx.moveTo(-120, s - 30);
  ctx.lineTo(shB * 0.4, s - 30);
  ctx.quadraticCurveTo(shB + 12, s + 2, chB + 13, y(0.4));
  ctx.quadraticCurveTo(waB + 8, y(0.72), hiB + 11, h + hem + 20);
  ctx.lineTo(-120, h + hem + 20);
  ctx.closePath();
  darken(ctx, skin);
  // the waist turning away under the chest
  ctx.beginPath();
  ctx.moveTo(-60, h + hem + 20);
  ctx.lineTo(-60, h - 6);
  ctx.quadraticCurveTo(0, h + 2, 80, h - 8);
  ctx.lineTo(80, h + hem + 20);
  ctx.closePath();
  darken(ctx, skin, 0.55);
  // a rim of light down the chest
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = hiliteOf(fill);
  ctx.beginPath();
  spline(ctx, [[Tz.shF * 0.7, s - 2], [Tz.chF - 1, y(0.22)], [Tz.chF - 3, y(0.36)], [Tz.chF - 8, y(0.3)], [Tz.shF * 0.55, s + 3]]);
  ctx.fill();
  ctx.restore();
}

// The front of the clothes: the centre line of a 3/4 torso sits forward of
// the middle, so collars, ties, zips and plackets hang from it.
function outfit(ctx, def, P, Tz) {
  const c = def.c, { s, h, y, hem } = Tz;
  const cx = 6;                         // the sternum, seen from 3/4
  const line = (pts, col, w) => {
    ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round';
    ctx.beginPath(); curve(ctx, pts); ctx.stroke();
  };
  const fillShape = (pts, col) => {
    ctx.beginPath(); spline(ctx, pts);
    ctx.fillStyle = col; ctx.fill();
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1.6 * INK; ctx.stroke();
  };
  const fillPoly = (pts, col, inked = true) => {
    ctx.beginPath(); pts.forEach(([px, py], k) => (k ? ctx.lineTo(px, py) : ctx.moveTo(px, py))); ctx.closePath();
    ctx.fillStyle = col; ctx.fill();
    if (inked) { ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1.6 * INK; ctx.lineJoin = 'round'; ctx.stroke(); }
  };
  ctx.save();
  ctx.beginPath(); Tz.path(ctx); ctx.clip();
  switch (def.outfit) {
    case 'suit': case 'pinstripe': case 'blazer': {
      const open = def.outfit === 'blazer';
      if (def.outfit === 'pinstripe') {
        ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 1.3;
        for (let i = -6; i <= 6; i++) { ctx.beginPath(); ctx.moveTo(i * 5.5, s - 12); ctx.lineTo(i * 5.5 + 2, h + hem + 4); ctx.stroke(); }
      }
      // the shirt in the V of the jacket, all the way down when it hangs open
      const vy = y(open ? 1.2 : 0.46);
      fillPoly([[cx - 7, s - 9], [cx + 9, s - 9], [cx + 3, vy], [cx - 1, vy]], '#f4f6ff');
      if (!open) {
        // tie: knot, then the blade widening down the shirt
        fillPoly([[cx - 1.8, s - 6], [cx + 3.2, s - 6], [cx + 2.4, s - 1], [cx - 1, s - 1]], c.accent);
        fillPoly([[cx - 1, s - 1], [cx + 2.4, s - 1], [cx + 4, y(0.5)], [cx + 0.6, y(0.56)], [cx - 2, y(0.5)]], c.accent);
      }
      // lapels, the near one wide and the far one foreshortened
      const lap = mix(c.suit, '#000000', 0.22);
      fillPoly([[cx + 9, s - 9], [cx + 15, s - 5], [cx + 10, y(0.2)], [cx + 4, y(open ? 0.62 : 0.46)]], lap);
      fillPoly([[cx - 7, s - 9], [cx - 12, s - 4], [cx - 7, y(0.18)], [cx, y(open ? 0.6 : 0.46)]], lap);
      if (!open) {
        ctx.fillStyle = OUTLINE;
        ctx.beginPath(); ctx.arc(cx + 2.5, y(0.66), 1.7, 0, 7); ctx.fill();
        line([[cx + 2, y(0.46)], [cx + 2.5, y(0.8)], [cx - 1, h + hem]], 'rgba(10,12,22,0.55)', 1.4 * INK);
      }
      // the pocket welt
      line([[cx - 16, y(0.82)], [cx - 6, y(0.84)]], 'rgba(10,12,22,0.5)', 1.4 * INK);
      if (def.accessory === 'brooch') { ctx.fillStyle = c.accent; ctx.beginPath(); ctx.arc(cx + 11, y(0.12), 3.4, 0, 7); ctx.fill(); }
      break;
    }
    case 'hoodie': {
      // the pouch pocket across the belly and the strings hanging off the hood
      fillShape([[cx - 15, y(0.66)], [cx + 13, y(0.64)], [cx + 15, h - 1], [cx - 17, h]], mix(c.suit, '#000000', 0.08));
      line([[cx - 3, s - 6], [cx - 4, y(0.32)]], c.accent, 2.4 * INK);
      line([[cx + 5, s - 6], [cx + 6, y(0.3)]], c.accent, 2.4 * INK);
      // the ribbed band at the hem
      fillPoly([[-60, h + hem - 6], [60, h + hem - 6], [60, h + hem + 8], [-60, h + hem + 8]], c.suit2);
      line([[-60, h + hem - 6], [60, h + hem - 6]], OUTLINE, 1.4 * INK);
      break;
    }
    case 'bomber': {
      line([[cx + 1, s - 6], [cx + 2, h + hem]], mix(c.suit2, '#000000', 0.2), 2.2 * INK);
      fillPoly([[-60, h + hem - 7], [60, h + hem - 7], [60, h + hem + 8], [-60, h + hem + 8]], c.accent);
      line([[-60, h + hem - 7], [60, h + hem - 7]], OUTLINE, 1.4 * INK);
      fillShape([[cx - 10, s - 10], [cx + 9, s - 10], [cx + 10, s - 3], [cx - 11, s - 2]], c.suit2);
      break;
    }
    case 'turtleneck': {
      // fitted: the chest and the waist show through it
      line([[cx - 14, y(0.36)], [cx - 2, y(0.42)], [cx + 14, y(0.34)]], 'rgba(10,12,22,0.32)', 1.3 * INK);
      break;
    }
    case 'tee': {
      line([[cx - 8, s - 7], [cx, s - 1], [cx + 9, s - 8]], c.suit2, 2.6 * INK);
      ctx.fillStyle = c.accent;
      ctx.beginPath(); ctx.moveTo(cx + 2, y(0.22)); ctx.lineTo(cx + 6, y(0.34)); ctx.lineTo(cx + 2, y(0.46)); ctx.lineTo(cx - 2, y(0.34)); ctx.closePath(); ctx.fill();
      line([[cx - 14, y(0.36)], [cx - 2, y(0.42)], [cx + 14, y(0.34)]], 'rgba(10,12,22,0.28)', 1.3 * INK);
      break;
    }
    case 'vest': {
      // a shirt under a quilted vest that hangs open at the front
      const shirt = '#e8ecf4';
      fillPoly([[cx - 6, s - 10], [cx + 9, s - 10], [cx + 8, h + hem + 4], [cx - 5, h + hem + 4]], shirt, false);
      line([[cx - 6, s - 10], [cx - 4, h + hem + 4]], OUTLINE, 1.6 * INK);
      line([[cx + 9, s - 10], [cx + 8, h + hem + 4]], OUTLINE, 1.6 * INK);
      fillPoly([[cx - 6, s - 10], [cx + 1, s - 2], [cx + 9, s - 10]], shirt);
      for (let i = 1; i <= 4; i++) {
        const yy = s + (h + hem - s) * (i / 5);
        line([[-60, yy + 2], [cx - 6, yy]], 'rgba(10,12,22,0.4)', 1.3 * INK);
        line([[cx + 9, yy], [60, yy + 2]], 'rgba(10,12,22,0.4)', 1.3 * INK);
      }
      break;
    }
    case 'henley': {
      line([[cx - 8, s - 7], [cx, s - 2], [cx + 9, s - 8]], c.suit2, 2.4 * INK);
      line([[cx + 1, s - 2], [cx + 1.5, y(0.3)]], c.suit2, 2 * INK);
      ctx.fillStyle = c.suit2;
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(cx + 4, s + 2 + i * 6, 1.5, 0, 7); ctx.fill(); }
      break;
    }
    default: break;
  }
  ctx.restore();
}

// The figure's proportions, applied to the pose before anything reads it:
// the hip rides higher, so the legs are about half the fighter's height and
// the torso shortens to meet them. The tube rig put the hip at 42% and every
// fighter read as squat however the knees were bent. Feet stay where the pose
// put them; a lifted foot rises with the hip.
export function figureFrame(P) {
  P.hipY *= F.LEGS;
  P.legF.y *= F.LEGS;
  P.legB.y *= F.LEGS;
  return P;
}

// Where the figure puts the head: on a neck, not sunk into the collar.
export function figureHead(P) {
  const r = (P.headR ?? STYLIZE.HEAD_R) * F.HEAD;
  const lowest = P.shoulderY - r - F.NECK;
  return { x: P.headX + (P.bodyLean || 0) * 26, y: Math.max(P.headY, lowest), r };
}

// ---- the head, turned 3/4 toward the opponent ------------------------------
// The tube rig's head was a ball with a front-on face painted across it, on a
// body seen from the side. Here the face is turned the way the body is: the
// skull, with brow, nose, lips and chin standing proud of its front edge, an
// ear on the near side, the near eye full and the far one foreshortened past
// the bridge of the nose. Hair and hats are the tube rig's own (they sit on
// the skull either way), kept off the face.

// The face, in head radii from the middle of the skull. `jaw` deepens the chin.
function faceMask(r, jaw, frame) {
  const f = frame === 'f';
  return [
    [0.5, -0.86], [0.9, -0.5], [0.99, -0.22],
    [0.97, -0.06], [1.17, 0.2], [1.0, 0.31],
    [1.04, 0.44], [0.98, 0.56],
    [f ? 0.9 : 0.95, 0.76 * jaw], [f ? 0.64 : 0.72, 0.97 * jaw],
    [f ? 0.22 : 0.16, (f ? 0.86 : 0.93) * jaw], [f ? -0.1 : -0.26, (f ? 0.6 : 0.7) * jaw],
    [-0.5, 0.5],
  ].map(([x, y]) => [x * r, y * r]);
}
// Where hair may not go: the eyes, nose, mouth and chin.
const FACE_ZONE = [[0.1, -0.44], [1.8, -0.44], [1.8, 1.6], [0, 1.6], [-0.1, 0.3]];

function head3q(g, def, cx, cy, r, face, t, fig, hook) {
  const c = def.c;
  const L = { ...STYLIZE.FACE, ...(def.face || {}) };
  const k = r / STYLIZE.HEAD_R;                     // features were sized for the stock head
  g.save();
  g.translate(cx, cy);
  const mask = faceMask(r, fig.jaw ?? 1, fig.frame);
  const skull = { path: (q) => q.arc(0, 0, r, 0, Math.PI * 2), fill: c.skin };
  const front = { path: (q) => spline(q, mask), fill: c.skin };
  inkFill(g, [skull, front]);
  const headPath = (q) => { q.beginPath(); skull.path(q); front.path(q); };
  // the back of the skull turned from the light
  const backPath = (q) => {
    q.moveTo(r * 0.02, -r * 1.5);
    q.quadraticCurveTo(-r * 0.55, -r * 0.1, r * 0.1, r * 1.3);
    q.lineTo(-r * 2.5, r * 1.3); q.lineTo(-r * 2.5, -r * 1.5); q.closePath();
  };
  g.save();
  headPath(g); g.clip();
  g.beginPath(); backPath(g); darken(g, true);
  // under the brow and the side of the nose
  g.beginPath(); g.ellipse(r * 0.72, r * 0.1, r * 0.1, r * 0.2, 0.2, 0, Math.PI * 2); darken(g, true, 0.6);
  // under the chin
  g.beginPath(); g.moveTo(-r, r * 0.62); g.quadraticCurveTo(r * 0.4, r * 0.98, r * 1.2, r * 0.82); g.lineTo(r * 1.2, r * 1.4); g.lineTo(-r, r * 1.4); g.closePath();
  darken(g, true, 0.7);
  g.restore();

  // the ear, on the near side: small and lightly drawn, or at fight size it
  // reads as a goggle
  g.beginPath(); g.ellipse(-r * 0.2, r * 0.2, r * 0.13, r * 0.2, -0.2, 0, Math.PI * 2);
  g.fillStyle = mix(c.skin, F.SKIN_SHADE, 0.3); g.fill();
  g.strokeStyle = OUTLINE; g.lineWidth = 1.5 * INK; g.stroke();
  crease(g, [[-r * 0.15, r * 0.08], [-r * 0.24, r * 0.18], [-r * 0.17, r * 0.3]], 0.45, 1.1);

  // hair and hats, kept off the face; then again in shadow over the back
  const zone = (q) => {
    q.beginPath();
    q.rect(-r * 4, -r * 4, r * 8, r * 8);
    FACE_ZONE.forEach(([x, y], i) => (i ? q.lineTo(x * r, y * r) : q.moveTo(x * r, y * r)));
    q.closePath();
  };
  g.save();
  zone(g); g.clip('evenodd');
  hook.hair(g, 0, 0, r, def);
  g.beginPath(); backPath(g); g.clip();
  const dk = (col) => (col ? mix(col, F.SHADOW, 0.42) : col);
  hook.hair(g, 0, 0, r, { ...def, c: { ...c, hair: dk(c.hair), suit2: dk(c.suit2), accent: dk(c.accent) } });
  g.restore();

  facialHair3q(g, def, r);
  features3q(g, face, L, r, k);
  eyewear3q(g, def, r);
  hook.headwear(g, 0, 0, r, def);
  if (def.accessory === 'earrings') {
    g.fillStyle = c.accent;
    g.beginPath(); g.arc(-r * 0.2, r * 0.44, 3.2 * k, 0, Math.PI * 2); g.fill();
    g.strokeStyle = OUTLINE; g.lineWidth = 1.2; g.stroke();
  }
  g.restore();
}

// Eyes, brows, nose and mouth. The near eye sits back on the cheek, the far
// eye just inside the profile line, and both look at the opponent.
function features3q(g, face, L, r, k) {
  const E = [[r * 0.36, r * 0.02, 1], [r * 0.85, 0, 0.62]];   // x, y, foreshortening
  g.lineCap = 'round';
  g.strokeStyle = OUTLINE; g.fillStyle = OUTLINE;
  const my = r * L.MOUTH_Y + r * 0.08, mx = r * 0.76, mw = L.MOUTH_W * 0.62 * k;
  // the nostril, under the tip
  g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(r * 0.88, r * 0.3); g.quadraticCurveTo(r * 0.96, r * 0.34, r * 1.04, r * 0.3); g.stroke();
  if (face === 'ko') {
    g.lineWidth = 2.4;
    for (const [x, y, s] of E) {
      const a = 3.6 * k * s, b = 3.6 * k;
      g.beginPath(); g.moveTo(x - a, y - b); g.lineTo(x + a, y + b); g.moveTo(x + a, y - b); g.lineTo(x - a, y + b); g.stroke();
    }
    g.beginPath(); g.ellipse(mx, my + 1, 3 * k, 4.5 * k, 0, 0, Math.PI * 2); g.stroke();
    return;
  }
  if (face === 'happy') {
    g.lineWidth = 2.4;
    for (const [x, y, s] of E) { g.beginPath(); g.ellipse(x, y, 4 * k * s, 3.6 * k, 0, Math.PI, 0); g.stroke(); }
    g.beginPath(); g.moveTo(mx - mw, my - 1); g.quadraticCurveTo(mx, my + 5 * k, mx + mw, my - 2); g.stroke();
    return;
  }
  if (face === 'hurt') {
    g.lineWidth = 2.4;
    for (const [x, y, s] of E) {
      const a = 3.6 * k * s;
      g.beginPath(); g.moveTo(x - a, y - 3 * k); g.lineTo(x + a, y); g.lineTo(x - a, y + 3 * k); g.stroke();
    }
    g.beginPath(); g.ellipse(mx, my + 1, 2.6 * k, 3.4 * k, 0, 0, Math.PI * 2); g.stroke();
    return;
  }
  // the fighting face: the character's own knobs, as the tube rig drew them
  const hard = face === 'angry' || face === 'block';
  const tilt = L.BROW_TILT + (hard ? L.BROW_TILT_HARD : 0);
  for (const [x, y, s] of E) {
    // the white of the eye, an almond under the lid
    g.fillStyle = '#f6f2ea';
    g.beginPath(); g.ellipse(x + 0.6, y + 0.8, L.EYE_W * k * s * 0.86, (L.PUPIL_R + 0.8) * k * 0.78, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = OUTLINE;
    g.beginPath(); g.ellipse(x + 1.6 * s, y + 0.8, L.PUPIL_R * k * s * 0.9, L.PUPIL_R * k * 0.95, 0, 0, Math.PI * 2); g.fill();
    g.lineWidth = L.LID_W;
    g.beginPath(); g.moveTo(x - L.EYE_W * k * s, y - L.LID_Y * k * 0.7); g.quadraticCurveTo(x, y - L.LID_Y * k * 1.05, x + L.EYE_W * k * s * 1.1, y - L.LID_Y * k * 0.5); g.stroke();
  }
  // brows: the inner end, toward the nose, drops
  g.lineWidth = L.BROW_W;
  const by = -L.BROW_Y * k;
  const [n, f] = E;
  g.beginPath();
  g.moveTo(n[0] - L.BROW_LEN * k, n[1] + by - tilt * 0.45);
  g.lineTo(n[0] + L.BROW_LEN * k * 0.9, n[1] + by + tilt);
  g.moveTo(f[0] - L.BROW_LEN * k * 0.45, f[1] + by + tilt);
  g.lineTo(f[0] + L.BROW_LEN * k * 0.5, f[1] + by - tilt * 0.3);
  g.stroke();
  g.lineWidth = 2.4;
  g.beginPath();
  if (face === 'block') {
    g.moveTo(mx - mw, my); g.lineTo(mx + mw, my);
  } else if (face === 'angry') {
    g.moveTo(mx - mw, my + 2.2); g.quadraticCurveTo(mx, my - 2.6, mx + mw, my + 1.6);
  } else {
    const q = L.MOUTH_CURVE;
    g.moveTo(mx - mw, my - q * 0.5); g.quadraticCurveTo(mx, my + q * 0.9, mx + mw, my - q * 0.4);
  }
  g.stroke();
}

function facialHair3q(g, def, r) {
  const fh = def.facialHair || (def.accessory === 'stubble' ? 'stubble' : 'none');
  if (!fh || fh === 'none') return;
  const P = (pts) => pts.map(([x, y]) => [x * r, y * r]);
  const shape = (pts, fill) => {
    const s = { path: (q) => spline(q, P(pts)), fill };
    inkFill(g, [s]);
  };
  if (fh === 'stubble') {
    g.save();
    g.beginPath(); spline(g, faceMask(r, 1, 'm')); g.clip();
    g.beginPath(); spline(g, P([[-0.3, 0.3], [0.3, 0.42], [0.66, 0.5], [1.0, 0.62], [1.1, 1.2], [-0.4, 1.2]]));
    g.fillStyle = 'rgba(30,30,40,0.26)'; g.fill();
    g.restore();
  } else if (fh === 'moustache') {
    shape([[0.62, 0.42], [0.86, 0.33], [1.04, 0.4], [0.96, 0.48], [0.72, 0.5]], def.c.hair);
  } else if (fh === 'beard') {
    shape([[-0.32, 0.22], [-0.3, 0.66], [0.12, 1.04], [0.74, 1.12], [1.02, 0.78], [1.0, 0.56], [0.74, 0.66], [0.5, 0.56], [0.1, 0.44]], def.c.hair);
  } else if (fh === 'goatee') {
    shape([[0.62, 0.66], [0.94, 0.66], [0.9, 0.98], [0.7, 1.06]], def.c.hair);
  }
}

function eyewear3q(g, def, r) {
  const e = def.eyewear || (['visor', 'glasses', 'shades'].includes(def.accessory) ? def.accessory : 'none');
  if (!e || e === 'none') return;
  g.save();
  g.lineJoin = 'round';
  if (e === 'visor') {
    g.fillStyle = 'rgba(41,217,255,0.34)';
    g.strokeStyle = 'rgba(41,217,255,0.95)';
    g.lineWidth = 2.4;
    g.beginPath(); g.roundRect(r * 0.1, -r * 0.24, r * 1.0, r * 0.44, r * 0.16); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(r * 0.1, -r * 0.06); g.lineTo(-r * 0.2, r * 0.02); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(r * 0.24, -r * 0.12); g.lineTo(r * 0.6, -r * 0.12); g.stroke();
  } else {
    const dark = e === 'shades';
    g.strokeStyle = OUTLINE; g.lineWidth = 2.2;
    g.fillStyle = dark ? 'rgba(16,18,28,0.72)' : 'rgba(255,255,255,0.16)';
    // near lens, far lens narrowed past the bridge, the arm back to the ear
    g.beginPath(); g.roundRect(r * 0.12, -r * 0.2, r * 0.5, r * 0.38, r * (dark ? 0.14 : 0.08)); g.fill(); g.stroke();
    g.beginPath(); g.roundRect(r * 0.74, -r * 0.2, r * 0.26, r * 0.36, r * 0.08); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(r * 0.62, -r * 0.08); g.lineTo(r * 0.74, -r * 0.08); g.moveTo(r * 0.12, -r * 0.08); g.lineTo(-r * 0.1, r * 0.02); g.stroke();
    if (dark) {
      g.strokeStyle = 'rgba(255,255,255,0.45)'; g.lineWidth = 1.4;
      g.beginPath(); g.moveTo(r * 0.2, -r * 0.1); g.lineTo(r * 0.36, -r * 0.1); g.stroke();
    }
  }
  g.restore();
}

// A hood for a hoodie, bunched behind the neck.
function hood(g, def, P, head) {
  const s = P.shoulderY;
  const pts = [[-4, s - 6], [-10, head.y + head.r * 0.4], [-20, head.y + head.r * 0.8], [-27, s - 2], [-22, s + 8], [-8, s + 6]];
  const shape = { path: (q) => spline(q, pts), fill: def.c.suit2 };
  inkFill(g, [shape]);
  crease(g, [[-12, s - 2], [-18, s + 2]], 0.5);
}

// The whole fighter, in the order a figure turned 3/4 toward the camera
// overlaps itself: far arm, far leg, hips, near leg, neck, torso, head, then
// the near (striking) arm over everything.
//
// `hook` carries what lives in drawFighter: hair, hats, the photo head, the
// motion smear and the parts.
export function drawFigure(g, def, P, f, t, ink, hook) {
  INK = ink;
  const K = figureSkeleton(def, P), fig = K.fig;
  const lean = (P.bodyLean || 0) * 0.6;
  const open = f.state === 'attack' && f.attack && (f.attack.button || f.attack.kind) === 'slap';

  hook.behind();
  arm(g, def, P, fig, K.armB, true, false);
  leg(g, def, P, fig, K.legB, true);

  const Tz = torsoShape(def, P, fig);
  const head = figureHead(P);
  const leaned = () => { if (lean) { g.translate(0, P.hipY); g.rotate(lean); g.translate(0, -P.hipY); } };
  g.save(); leaned();
  pelvis(g, def, P, fig, Tz);
  g.restore();

  hook.smear(...K.armF.s, ...K.legF.h);
  leg(g, def, P, fig, K.legF, false);

  g.save(); leaned();
  if (def.outfit === 'hoodie') hood(g, def, P, head);
  // the neck, with the traps flaring into the shoulders at its base
  const nw = F.W.NECK * (P.build ?? 1) * fig.neck;
  const neck = segment(1, P.shoulderY + 2, head.x - 1, head.y + head.r * 0.3, 1, 0,
    nw, [[0, 1.3], [0.4, 1], [1, 0.95]], nw, [[0, 1.5], [0.4, 1.02], [1, 0.95]]);
  neck.fill = def.c.skin;
  inkFill(g, [neck]);
  shadeSegment(g, neck, def.c.skin, true, 0);

  const top = def.outfit === 'vest' ? '#e8ecf4' : def.c.suit;
  const torso = { path: Tz.path, fill: def.c.suit };
  inkFill(g, [torso]);
  outfit(g, def, P, Tz);
  shadeTorso(g, Tz, top, false);
  if (def.outfit === 'turtleneck') {
    // the roll collar, up the neck
    const roll = segment(1, P.shoulderY - 4, head.x - 1, head.y + head.r * 0.8, 1, 0,
      nw * 1.2, [[0, 1.22], [1, 1.04]], nw * 1.2, [[0, 1.22], [1, 1.04]]);
    roll.fill = def.c.suit2;
    inkFill(g, [roll]);
    shadeSegment(g, roll, def.c.suit2, false, 0);
  }
  if (def.photo) hook.photoHead(g, head.x, head.y, head.r);
  else head3q(g, def, head.x, head.y, head.r, P.face, t, fig, hook);
  hook.horn?.(g, head.x, head.y, head.r);
  g.restore();

  arm(g, def, P, fig, K.armF, false, open);
  hook.front();
}
