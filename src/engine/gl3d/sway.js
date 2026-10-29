// Secondary motion for the 3D fighters: what hangs (a ponytail, long hair, a
// coat) trails the part it hangs from instead of riding it rigidly. RENDER-ONLY.
//
// Each fighter keeps a spring per anchor (the head, the hips): a point mass
// that chases the anchor's place in the world. How far it lags is the sway,
// which the vertex shader adds to a hanging mesh, more the further a vertex
// hangs from its pivot (MODELS3D.founder.sway). At rest the lag is zero, so a
// fighter standing still looks exactly as the model was built.
//
// Like the 2D cloth lag (parts.js applyFollow) this is per-fighter state the
// simulation never sees, so it may differ between peers. In a match it runs on
// the match's simT (index.js setClock3D), so a hitstop freezes it too.

import { GL3D } from '../../config.js';

export const SWAY_ANCHORS = ['head', 'hips'];

// Where an anchor is in the pose, in rig px from the feet (y down).
export function anchorInPose(P, anchor) {
  if (anchor === 'head') return [P.headX ?? 0, P.headY ?? -150];
  return [0, P.hipY ?? -90];
}

// A fresh state for one fighter at `world` positions of each anchor.
export function swayState(world, facing, t) {
  const springs = {};
  for (const k of SWAY_ANCHORS) springs[k] = { tip: [...world[k]], vel: [0, 0] };
  return { springs, facing, t };
}

// Advances the springs to time t (seconds) toward the anchors at `world`, and
// returns each anchor's lag in model units, ready for the shader: x along the
// fighter's own forward, y up. A turn round or a jump of the anchor (a
// teleport, a new round) starts the springs over rather than flinging the hair.
export function stepSway(state, world, facing, t) {
  const S = GL3D.SWAY;
  const dt = Math.min(S.MAX_DT, Math.max(0, t - state.t));
  state.t = t;
  const out = {};
  const restart = facing !== state.facing;
  state.facing = facing;
  for (const k of SWAY_ANCHORS) {
    const s = state.springs[k], a = world[k];
    if (restart || Math.hypot(a[0] - s.tip[0], a[1] - s.tip[1]) > S.SNAP) {
      s.tip = [...a]; s.vel = [0, 0];
    }
    for (const i of [0, 1]) {
      s.vel[i] += (-S.K * (s.tip[i] - a[i]) - S.C * s.vel[i]) * dt;
      s.tip[i] += s.vel[i] * dt;
    }
    let dx = s.tip[0] - a[0], dy = s.tip[1] - a[1];
    const len = Math.hypot(dx, dy);
    if (len > S.MAX) {
      dx *= S.MAX / len; dy *= S.MAX / len;
      s.tip = [a[0] + dx, a[1] + dy];
    }
    out[k] = [(dx * facing) / GL3D.UNIT, -dy / GL3D.UNIT];
  }
  return out;
}
