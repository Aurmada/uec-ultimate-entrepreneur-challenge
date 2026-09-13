// Poses a skinned 3D model from the 2D rig's pose. RENDER-ONLY.
//
// The procedural renderer draws a fighter from a flat pose object: hip and
// shoulder heights, a head position, a torso lean, and four TARGETS, the two
// hands and two feet. Elbows and knees are not stored; the renderer bends a
// limb toward whatever target it is given, stretching if it has to, which is
// how a zoner's jab visibly out-ranges a grappler's off the same keyframes.
//
// This does the same in 3D, so every authored track, stance, command normal
// and body knob animates the model without a single new keyframe:
//
//   * joints are placed from the pose (model units, 1 = GL3D.UNIT rig px);
//   * each limb is solved with two-bone IK aimed at its target, and stretches
//     past full length rather than falling short, so the fist still lands
//     where the hitbox is;
//   * each bone gets a frame (along the bone, plus a reference direction) and
//     a scale, and its skinning matrix maps the model's rest frame onto it.
//
// Coordinates: X toward the opponent, Y up, Z toward the camera. The chest is
// turned GL3D.YAW toward the camera, which puts the lead arm and lead leg
// (the pose's armF and legF) on the FAR side, the model's .L limbs.

import { GL3D, STYLIZE } from '../../config.js';
import { add, sub, scale, dist, normalize, rotZ, boneFrame, multiply, invertAffine } from './math.js';

export const BONES = [
  'hips', 'spine', 'chest', 'neck', 'head',
  'upper_arm.R', 'forearm.R', 'upper_arm.L', 'forearm.L',
  'thigh.R', 'shin.R', 'foot.R', 'thigh.L', 'shin.L', 'foot.L',
];

// Which way each bone's second axis points in the bind pose: the torso faces
// forward, elbows bend back, knees bend forward, and a foot's "up" is up.
const REST_REF = { torso: [1, 0, 0], arm: [-1, 0, 0], leg: [1, 0, 0], foot: [0, 1, 0] };

// Builds the rest frames a pose is measured against. `spec` is a MODELS3D
// entry: where the leaf bones end, and where the skull centre sits.
export function buildRig(model, spec) {
  const at = (name) => {
    const i = model.jointNames.indexOf(name);
    if (i < 0) throw new Error(`model has no "${name}" joint`);
    return model.restHeads[i];
  };
  const rest = {};
  const put = (name, head, tail, ref) => { rest[name] = { head, tail, ref, len: dist(head, tail) }; };
  put('hips', at('hips'), at('spine'), REST_REF.torso);
  put('spine', at('spine'), at('chest'), REST_REF.torso);
  put('chest', at('chest'), at('neck'), REST_REF.torso);
  put('neck', at('neck'), at('head'), REST_REF.torso);
  put('head', at('head'), add(at('head'), [0, spec.leaf.head, 0]), REST_REF.torso);
  for (const s of ['R', 'L']) {
    const sh = at(`upper_arm.${s}`), el = at(`forearm.${s}`);
    put(`upper_arm.${s}`, sh, el, REST_REF.arm);
    put(`forearm.${s}`, el, add(el, scale(normalize(sub(el, sh)), spec.leaf.forearm)), REST_REF.arm);
    const hj = at(`thigh.${s}`), kn = at(`shin.${s}`), an = at(`foot.${s}`);
    put(`thigh.${s}`, hj, kn, REST_REF.leg);
    put(`shin.${s}`, kn, an, REST_REF.leg);
    put(`foot.${s}`, an, add(an, spec.leaf.foot), REST_REF.foot);
  }

  const hip = at('hips');
  const shoulderY = (at('upper_arm.R')[1] + at('upper_arm.L')[1]) / 2;
  const shin = normalize(sub(rest['shin.R'].tail, rest['shin.R'].head));
  const foot = normalize(sub(rest['foot.R'].tail, rest['foot.R'].head));
  return {
    names: model.jointNames,
    rest,
    // A joint the contract does not name keeps the identity, so extra bones in
    // a hand-built model (fingers, a ponytail) ride along instead of breaking.
    inverse: model.jointNames.map((n) => (rest[n] ? invertAffine(boneFrame(rest[n].head, rest[n].tail, rest[n].ref)) : null)),
    torso: shoulderY - hip[1],
    spineOff: at('spine')[1] - hip[1],
    chestOff: at('chest')[1] - hip[1],
    neckOff: at('neck')[1] - hip[1],
    skull: spec.skull,
    // The rest foot's angle from its shin, so a posed foot keeps the same set.
    footAngle: Math.atan2(shin[0] * foot[1] - shin[1] * foot[0], shin[0] * foot[0] + shin[1] * foot[1]),
    matrices: new Float32Array(model.jointNames.length * 16),
  };
}

// Two-bone IK from a toward t, bending toward `pole`. Past full reach both
// segments stretch equally, as the 2D rig's limbs do.
export function ik(a, t, l1, l2, pole) {
  const d = sub(t, a);
  let reach = Math.hypot(d[0], d[1], d[2]);
  const u = normalize(d, [0, -1, 0]);
  const s = Math.max(1, reach / ((l1 + l2) * 0.999));
  const L1 = l1 * s, L2 = l2 * s;
  reach = Math.min(Math.max(reach, Math.abs(L1 - L2) + 1e-4), (L1 + L2) * 0.9999);
  const ca = Math.max(-1, Math.min(1, (L1 * L1 + reach * reach - L2 * L2) / (2 * L1 * reach)));
  const sa = Math.sqrt(1 - ca * ca);
  const along = pole[0] * u[0] + pole[1] * u[1] + pole[2] * u[2];
  const bend = normalize(sub(pole, scale(u, along)), Math.abs(u[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]);
  const mid = add(a, add(scale(u, L1 * ca), scale(bend, L1 * sa)));
  return { mid, end: add(a, scale(u, reach)), bend, stretch: s };
}

// Writes one skinning matrix per joint into rig.matrices and returns it.
// `P` is the proportioned 2D pose; `elbow` carries the per-state bend signs
// drawFighter uses ({ F, B }).
export function solvePose(rig, P, elbow = {}) {
  const U = GL3D.UNIT;
  const pt = (x, y, z = 0) => [x / U, -y / U, z];
  const leanRad = (P.bodyLean || 0) * GL3D.LEAN;
  const cl = Math.cos(leanRad), sl = Math.sin(leanRad);
  // The same socket rotation drawFighter applies to the torso, about the hip.
  const socket = (x, y) => {
    const dy = y - P.hipY;
    return [x * cl - dy * sl, P.hipY + x * sl + dy * cl];
  };
  const tip = (v, a) => rotZ(v, -a);         // positive lean tips forward

  const yc = GL3D.YAW, yp = GL3D.HIP_YAW, yh = GL3D.YAW + GL3D.HEAD_YAW;
  const chestFwd = tip([Math.cos(yc), 0, Math.sin(yc)], leanRad);
  const chestLat = tip([-Math.sin(yc), 0, Math.cos(yc)], leanRad);   // toward the near side
  const chestUp = tip([0, 1, 0], leanRad);
  const pl = leanRad * GL3D.PELVIS_LEAN;
  const pelFwd = tip([Math.cos(yp), 0, Math.sin(yp)], pl);
  const pelLat = tip([-Math.sin(yp), 0, Math.cos(yp)], pl);
  const pelUp = tip([0, 1, 0], pl);
  const headFwd = tip([Math.cos(yh), 0, Math.sin(yh)], leanRad);

  const build = P.build ?? 1;
  const wide = P.shoulderW ?? 1;
  const pose = {};
  const set = (name, head, tail, ref, sx, sy = build, sz = build) => {
    pose[name] = { head, tail, ref, sx, sy, sz };
  };

  // ---- torso: joints spaced along the leaned torso, stretched to its length
  const hip = pt(0, P.hipY);
  const [scx, scy] = socket(0, P.shoulderY + GL3D.SOCKET_DROP);
  const shoulderC = pt(scx, scy);
  const ts = dist(hip, shoulderC) / rig.torso;
  const spineJ = add(hip, scale(pelUp, rig.spineOff * ts));
  const chestJ = add(hip, scale(chestUp, rig.chestOff * ts));
  const neckJ = add(hip, scale(chestUp, rig.neckOff * ts));

  const headR = P.headR ?? STYLIZE.HEAD_R;
  const hs = (headR / STYLIZE.HEAD_R) * GL3D.HEAD_SCALE;
  const headTop = P.shoulderY - (headR - STYLIZE.NECK_OVERLAP);
  const [hx, hy] = socket(P.headX + (P.bodyLean || 0) * GL3D.HEAD_LEAN_PX, Math.max(P.headY, headTop));
  const headBase = sub(pt(hx, hy), scale(chestUp, rig.skull * hs));
  const headTail = add(headBase, scale(chestUp, rig.rest.head.len * hs));

  const torso = build * GL3D.TORSO_GIRTH;
  set('hips', hip, spineJ, pelFwd, dist(hip, spineJ) / rig.rest.hips.len, torso, torso);
  set('spine', spineJ, chestJ, normalize(add(pelFwd, chestFwd)),
      dist(spineJ, chestJ) / rig.rest.spine.len, torso, torso * (1 + wide) / 2);
  set('chest', chestJ, neckJ, chestFwd, dist(chestJ, neckJ) / rig.rest.chest.len, torso, torso * wide);
  set('neck', neckJ, headBase, chestFwd, dist(neckJ, headBase) / rig.rest.neck.len);
  set('head', headBase, headTail, headFwd, hs, hs, hs);

  // ---- arms: the lead hand (armF) on the far shoulder, the rear hand near
  const half = GL3D.SHOULDER_HALF * wide;
  const arm = (side, shoulder, hand, bendSign, flare) => {
    const target = pt(hand.x, hand.y, shoulder[2] * GL3D.HAND_DEPTH);
    // Elbows point down and back, and out a little. drawFighter bends toward
    // the perpendicular of shoulder-to-hand instead, which flips sign when a
    // hand passes behind the body; at 2D's gentle bend that reads fine, but a
    // real upper arm folds hard and the flip becomes a chicken wing. The
    // per-character sign is kept: a negative bend swings the elbow forward.
    const k = Math.sign(bendSign) || 1;
    const pole = normalize(add([-GL3D.ELBOW_BACK * k, -1, 0], scale(chestLat, flare * GL3D.ELBOW_FLARE)));
    const up = rig.rest[`upper_arm.${side}`], lo = rig.rest[`forearm.${side}`];
    const s = ik(shoulder, target, up.len, lo.len, pole);
    const girth = build * GL3D.ARM_GIRTH;
    set(`upper_arm.${side}`, shoulder, s.mid, s.bend, dist(shoulder, s.mid) / up.len, girth, girth);
    set(`forearm.${side}`, s.mid, s.end, s.bend, dist(s.mid, s.end) / lo.len, girth, girth);
  };
  arm('L', sub(shoulderC, scale(chestLat, half)), P.armF, elbow.F ?? STYLIZE.ELBOW, -1);
  arm('R', add(shoulderC, scale(chestLat, half)), P.armB, elbow.B ?? STYLIZE.ELBOW, 1);

  // ---- legs: knees forward and a little out, feet set like the rest pose
  const hipBase = sub(hip, scale(pelUp, GL3D.HIP_DROP));
  const leg = (side, hipJ, foot, flare) => {
    const target = pt(foot.x, foot.y - GL3D.ANKLE_PX, hipJ[2] * GL3D.FOOT_DEPTH);
    const pole = normalize(add([1, 0, 0], scale(pelLat, flare * GL3D.KNEE_FLARE)));
    const th = rig.rest[`thigh.${side}`], sn = rig.rest[`shin.${side}`], ft = rig.rest[`foot.${side}`];
    const s = ik(hipJ, target, th.len, sn.len, pole);
    const girth = build * GL3D.LEG_GIRTH;
    set(`thigh.${side}`, hipJ, s.mid, s.bend, dist(hipJ, s.mid) / th.len, girth, girth);
    set(`shin.${side}`, s.mid, s.end, s.bend, dist(s.mid, s.end) / sn.len, girth, girth);
    const shinDir = normalize(sub(s.end, s.mid));
    const toe = normalize(rotZ(shinDir, rig.footAngle));
    const fs = build * GL3D.FOOT_SCALE;
    set(`foot.${side}`, s.end, add(s.end, scale(toe, ft.len * fs)), scale(shinDir, -1), fs, fs, fs);
  };
  leg('L', sub(hipBase, scale(pelLat, GL3D.HIP_HALF)), P.legF, -1);
  leg('R', add(hipBase, scale(pelLat, GL3D.HIP_HALF)), P.legB, 1);

  const out = rig.matrices;
  const scratch = new Array(16);
  rig.names.forEach((name, i) => {
    const b = pose[name];
    if (!b || !rig.inverse[i]) {
      for (let k = 0; k < 16; k++) out[i * 16 + k] = k % 5 === 0 ? 1 : 0;
      return;
    }
    multiply(boneFrame(b.head, b.tail, b.ref, b.sx, b.sy, b.sz), rig.inverse[i], scratch);
    for (let k = 0; k < 16; k++) out[i * 16 + k] = scratch[k];
  });
  return out;
}

// Where a rest-space point lands under joint i's matrix. For tests and probes.
export function transformPoint(matrices, i, p) {
  const m = matrices.subarray(i * 16, i * 16 + 16);
  return [
    m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
    m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
    m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
  ];
}
