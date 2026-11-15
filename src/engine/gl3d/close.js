// Up close, the guards keep to their own side. RENDER-ONLY.
//
// Two fighters part at their push halves (v3.21, fighters.js pushHalf), so
// their trunks no longer pass through each other; but a guard reaches 40 px
// or more in front of the trunk, and a lead foot 30, so at the closest range
// each fighter's lead fist stood in the other's chest and their feet crossed
// (the graphics reviews of v3.21 and v3.22.3). The fight is as it was: the
// hurtboxes, the push and every attack's reach are the simulation's. This
// only draws a fighter's hands and feet no further forward than the midpoint
// between the two, less a fist's or a toe's length, giving smoothly as they
// near it, and lifts a hand a little as it comes back, tucked toward the chin.
// Two guards then meet at the midpoint, as two boxers' gloves do.
//
// Only in the stances (GL3D.CLOSE.STATES): an attack reaches, and the hand
// eases out of the tuck over GL3D.CLOSE.EASE as the attack starts, so it
// does not jump. Poses are in the rig's own px: origin at the feet, +x toward
// the foe.

import { GL3D } from '../../config.js';

// x pulled back to stay under `lim`, untouched until `soft` px short of it.
export function give(x, lim, soft) {
  const start = lim - soft;
  if (!(x > start)) return x;
  return start + soft * (1 - Math.exp(-(x - start) / soft));
}

// P with its hands and feet kept to their side of the midpoint, `gap` px
// between the two fighters' centres, at strength `w` (0 to 1). A new object;
// P is untouched.
export function closeGuard(P, gap, w = 1) {
  const C = GL3D.CLOSE, room = gap / 2;
  if (!(w > 0) || !Number.isFinite(gap)) return P;
  const out = { ...P };
  for (const key of ['armF', 'armB']) {
    const h = P[key];
    if (!h || !Number.isFinite(h.x)) continue;
    const back = (h.x - give(h.x, room - C.HAND, C.SOFT)) * w;
    if (back > 0) out[key] = { ...h, x: h.x - back, y: h.y - back * C.LIFT };
  }
  for (const key of ['legF', 'legB']) {
    const ft = P[key];
    if (!ft || !Number.isFinite(ft.x)) continue;
    const back = (ft.x - give(ft.x, room - C.FOOT, C.SOFT)) * w;
    if (back > 0) out[key] = { ...ft, x: ft.x - back };
  }
  return out;
}

// How much of the tuck a fighter wears this frame: eased toward 1 in a
// stance and 0 out of one, on the draw's clock `t` (seconds). Kept per
// fighter, for drawing only.
const eased = new WeakMap();
export function tuckOf(f, t) {
  const C = GL3D.CLOSE, want = C.STATES.includes(f.state) ? 1 : 0;
  const was = eased.get(f);
  let w = want;
  if (was) {
    const dt = Math.min(0.1, Math.max(0, t - was.t));
    w = was.w + (want - was.w) * Math.min(1, dt / C.EASE);
  }
  eased.set(f, { w, t });
  return w;
}
