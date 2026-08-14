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
    case 'shoulder': return socket(-10, P.shoulderY + 8, P);
    case 'hip': return socket(-8, P.hipY, P);
    case 'torso': {
      const s = socket(-10, P.shoulderY + 8, P);
      const h = socket(-8, P.hipY, P);
      return { x: (s.x + h.x) / 2, y: (s.y + h.y) / 2 };
    }
    default: return { x: 0, y: 0 };
  }
}

const HEX = /^#[0-9a-fA-F]{6}$/;

// parts + pose + the character's palette => drawable descriptors.
// Author order is preserved inside each z layer.
export function resolveParts(parts, P, colours) {
  if (!parts || !parts.length) return [];
  const out = [];
  for (const p of parts) {
    if (p.states && !p.states.includes(P.partState)) continue;
    const at = anchorPoint(p.anchor, P);
    out.push({
      id: p.id,
      shape: p.shape,
      z: p.z,
      x: at.x + p.dx,
      y: at.y + p.dy,
      w: p.w, h: p.h, r: p.r, pts: p.pts,
      rot: p.rot || 0,
      fill: HEX.test(p.fill) ? p.fill : (colours[p.fill] || '#ff00ff'),
    });
  }
  return out;
}
