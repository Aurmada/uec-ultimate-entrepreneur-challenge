// CHARACTER PARTS — geometry a character carries outside its body outline.
//
// A held prop, a coat, a cape. All the same thing: a shape anchored to a rig
// joint. Props and garments differ only by anchor and z-layer, which is why
// this is one system rather than two.
//
// RENDER-ONLY, with no exceptions. A part is never a hurtbox and never reaches
// the simulation. If a prop should hit someone, that is a move.
//
// Split deliberately in two:
//   resolveParts()  pure — parts + pose => absolute coordinates. Unit-tested.
//   drawParts()     thin — paints resolved parts onto a canvas. Golden-tested.
//
// The split exists because `npm test` has no canvas. Everything worth asserting
// about placement is therefore assertable headless, and only the painting needs
// the browser harness.

import { STYLIZE } from '../config.js';

// The lean transform drawFighter applies to torso-mounted sockets. Limbs are
// posed in world space already, so they must NOT be leaned again.
function socket(x, y, P) {
  const lean = (P.bodyLean || 0) * 0.6;
  const cosL = Math.cos(lean), sinL = Math.sin(lean);
  const dy = y - P.hipY;
  return { x: x * cosL - dy * sinL, y: P.hipY + x * sinL + dy * cosL };
}

// Where a named anchor sits, in the same space drawFighter draws the body.
export function anchorPoint(anchor, P) {
  switch (anchor) {
    case 'armF': return { x: P.armF.x, y: P.armF.y };
    case 'armB': return { x: P.armB.x, y: P.armB.y };
    case 'legF': return { x: P.legF.x, y: P.legF.y };
    case 'legB': return { x: P.legB.x, y: P.legB.y };
    case 'head': {
      const headR = P.headR ?? STYLIZE.HEAD_R;
      const headTop = P.shoulderY - (headR - STYLIZE.NECK_OVERLAP);
      return { x: P.headX + (P.bodyLean || 0) * 26, y: Math.max(P.headY, headTop) };
    }
    // -10/-8 are drawFighter's BACK torso socket, not the front one. The back
    // socket is the canonical anchor for parts — picked once here so a coat
    // or strap doesn't visibly swap sides as the fighter turns.
    case 'shoulder': return socket(-10, P.shoulderY + 8, P);
    case 'hip': return socket(-8, P.hipY, P);
    case 'torso': {
      const s = socket(-10, P.shoulderY + 8, P);
      const h = socket(-8, P.hipY, P);
      return { x: (s.x + h.x) / 2, y: (s.y + h.y) / 2 };
    }
    // The vocabulary is closed and validated upstream (validateParts), so this
    // is unreachable through normal authoring. It still throws rather than
    // returning a plausible-looking (0,0): reject loudly, never silently repair.
    default: throw new Error(`unknown part anchor ${JSON.stringify(anchor)}`);
  }
}

const HEX = /^#[0-9a-fA-F]{6}$/;

// Cloth lag. A part with follow > 0 trails its anchor instead of riding it, so
// a coat swings when the fighter does.
//
// This is a RENDER-SIDE smoother holding per-fighter state, and it is allowed
// to be frame-rate dependent and non-deterministic precisely because nothing in
// the simulation can see it. That freedom is exactly what the structural guard
// in determinism.test.js exists to protect — if a part ever became a hurtbox,
// this smoother would desync a live match on the first swing.
export function partLagState() {
  return new Map();
}

export function applyFollow(state, id, target, follow) {
  if (!follow) return target;
  const prev = state.get(id);
  if (!prev) { state.set(id, { ...target }); return target; }
  // Exponential approach. follow 1 would never arrive, so cap the lag at 0.9.
  const k = 1 - Math.min(0.9, follow);
  const next = { x: prev.x + (target.x - prev.x) * k, y: prev.y + (target.y - prev.y) * k };
  state.set(id, next);
  return next;
}

// parts + pose + the character's palette => drawable descriptors.
// Author order is preserved inside each z layer.
export function resolveParts(parts, P, colours, lag) {
  if (!parts || !parts.length) return [];
  const out = [];
  for (const p of parts) {
    if (p.states && !p.states.includes(P.partState)) continue;
    const raw = anchorPoint(p.anchor, P);
    const at = (lag && p.follow) ? applyFollow(lag, p.id, raw, p.follow) : raw;
    out.push({
      id: p.id,
      shape: p.shape,
      z: p.z,
      x: at.x + p.dx,
      y: at.y + p.dy,
      w: p.w, h: p.h, r: p.r, pts: p.pts,
      rot: p.rot || 0,
      // '#ff00ff' is a deliberate loud visual signal for an unresolved fill
      // role, not an oversight against reject-loudly: this runs mid-frame in
      // the render path, where throwing would take down the whole draw call
      // over a colour. Magenta is easy to spot and cheap to ignore.
      fill: HEX.test(p.fill) ? p.fill : (colours[p.fill] || '#ff00ff'),
    });
  }
  return out;
}

// Paint resolved parts of one z layer.
//
// `blob` is passed in rather than imported: it lives in drawFighter.js and
// closes over that module's INK/OUTLINE state, so importing it here would be a
// cycle. Passing it also keeps this module free of canvas globals, which is
// what lets the half above stay pure.
//
// MUST be called INSIDE the offscreen buffer, before shadeBuffer(). That is the
// whole reason parts get cel shading, rim light and the key line for free, and
// the reason they join the silhouette instead of looking pasted on.
export function drawParts(ctx, resolved, layer, blob) {
  for (const p of resolved) {
    if (p.z !== layer) continue;
    ctx.save();
    ctx.translate(p.x, p.y);
    if (p.rot) ctx.rotate(p.rot);
    switch (p.shape) {
      case 'roundRect':
        blob(ctx, () => { ctx.roundRect(-p.w / 2, -p.h / 2, p.w, p.h, Math.min(5, p.w / 4)); }, p.fill);
        break;
      case 'ellipse':
        blob(ctx, () => { ctx.ellipse(0, 0, p.r, p.r, 0, 0, 7); }, p.fill);
        break;
      case 'capsule':
        blob(ctx, () => { ctx.roundRect(-p.w / 2, -p.h / 2, p.w, p.h, Math.min(p.w, p.h) / 2); }, p.fill);
        break;
      case 'path':
        blob(ctx, () => {
          ctx.moveTo(p.pts[0][0], p.pts[0][1]);
          for (let i = 1; i < p.pts.length; i++) ctx.lineTo(p.pts[i][0], p.pts[i][1]);
          ctx.closePath();
        }, p.fill);
        break;
    }
    ctx.restore();
  }
}
