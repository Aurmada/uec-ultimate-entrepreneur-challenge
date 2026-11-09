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
import { add, sub, scale, cross, dist, normalize, rotZ, boneFrame, multiply, invertAffine } from './math.js';

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
  // Optional prop anchors on the fists, facing forward with the body.
  for (const g of ['grip.L', 'grip.R']) {
    if (model.jointNames.includes(g)) put(g, at(g), add(at(g), [0.1, 0, 0]), [0, 1, 0]);
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
    // A model sculpted to its own size and build (models3d.js `fit`) is drawn
    // as built: its own torso, neck and head, no girth or head pushed for game
    // size, its own shoulders and hips, and no build or shoulder knob from the
    // 2D body on top.
    fit: spec.fit || null,
    // The rest foot's angle from its shin, so a lifted foot keeps the same set,
    // and the rest foot itself, which is how a planted one lies on the floor.
    footAngle: Math.atan2(shin[0] * foot[1] - shin[1] * foot[0], shin[0] * foot[0] + shin[1] * foot[1]),
    footRest: [foot[0], foot[1], 0],
    matrices: new Float32Array(model.jointNames.length * 16),
  };
}

// Two-bone IK from a toward t, bending toward `pole`. Past full reach both
// segments stretch equally, as the 2D rig's limbs do, up to `most` times
// their length (then the limb falls short of t).
export function ik(a, t, l1, l2, pole, most = Infinity, floor = -Infinity) {
  const d = sub(t, a);
  let reach = Math.hypot(d[0], d[1], d[2]);
  const u = normalize(d, [0, -1, 0]);
  const s = Math.min(most, Math.max(1, reach / ((l1 + l2) * 0.999)));
  const L1 = l1 * s, L2 = l2 * s;
  reach = Math.min(Math.max(reach, Math.abs(L1 - L2) + 1e-4), (L1 + L2) * 0.9999);
  const ca = Math.max(-1, Math.min(1, (L1 * L1 + reach * reach - L2 * L2) / (2 * L1 * reach)));
  const sa = Math.sqrt(1 - ca * ca);
  const along = pole[0] * u[0] + pole[1] * u[1] + pole[2] * u[2];
  let bend = normalize(sub(pole, scale(u, along)), Math.abs(u[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]);
  const centre = add(a, scale(u, L1 * ca)), rad = L1 * sa;
  // The joint may turn about the limb's own line, a circle of places it can
  // be: a knee bent toward its pole under hips this low went through the
  // floor (Adam's 14 px, a graphics review, 2026-11-09). Turned the least way
  // round that circle that keeps it at `floor` or above, the knee goes out to
  // the side instead, as a real one does.
  if (centre[1] + bend[1] * rad < floor && rad > 1e-6) {
    const side = cross(u, bend);
    const A = bend[1], B = side[1], Rr = Math.hypot(A, B), q = (floor - centre[1]) / rad;
    const phi = Math.atan2(B, A);
    let th = phi;
    if (Rr > 1e-9 && q / Rr <= 1) {
      const w = Math.acos(Math.max(-1, q / Rr));
      const near = (x) => Math.abs(Math.atan2(Math.sin(x), Math.cos(x)));
      th = near(phi - w) < near(phi + w) ? phi - w : phi + w;
    }
    bend = normalize(add(scale(bend, Math.cos(th)), scale(side, Math.sin(th))));
  }
  const mid = add(centre, scale(bend, rad));
  // The hinge the joint turns about. Both bones of the limb twist from this one
  // axis: u and bend are perpendicular, so it never degenerates, where using
  // `bend` itself as each bone's reference did whenever a forearm swung into
  // line with it (a tight guard), flipping everything strapped to the forearm.
  return { mid, end: add(a, scale(u, reach)), bend, hinge: cross(u, bend), stretch: s };
}

// A limb bone's twist reference: perpendicular to the bone, in the plane of
// the bend. At rest (hinge = restDir x REST_REF) this is exactly REST_REF.
const onHinge = (hinge, from, to) => cross(hinge, normalize(sub(to, from)));

// Writes one skinning matrix per joint into rig.matrices and returns it.
// `P` is the proportioned 2D pose; `elbow` carries the per-state bend signs
// drawFighter uses ({ F, B }). `turn` can replace GL3D's YAW, HIP_YAW and
// HEAD_YAW ({ yaw, hipYaw, headYaw }), as a portrait does to face the viewer.
export function solvePose(rig, P, elbow = {}, turn = null) {
  const U = GL3D.UNIT;
  const pt = (x, y, z = 0) => [x / U, -y / U, z];
  // The body over the feet, moved forward by P.hipX (a kick driving the hips
  // in after the foot, drawFighter's landStrike): the hips, the trunk, the
  // head and the hands go with it; the feet stay where the pose puts them.
  const hx = P.hipX || 0;
  const bt = (x, y, z = 0) => pt(x + hx, y, z);
  const fit = rig.fit;
  const own = !!fit;
  const lean2D = (P.bodyLean || 0) * GL3D.LEAN;
  // A sculpted body leans its straight back a little further over bent knees
  // than the 2D figure does (fit.lean), its pelvis going with it (fit.pelvis),
  // or the knees bend under an upright trunk and the seat juts out behind.
  const leanRad = lean2D + (own ? fit.lean ?? 0 : 0);
  const cl = Math.cos(lean2D), sl = Math.sin(lean2D);
  // The same socket rotation drawFighter applies to the torso, about the hip.
  const socket = (x, y) => {
    const dy = y - P.hipY;
    return [x * cl - dy * sl, P.hipY + x * sl + dy * cl];
  };
  const tip = (v, a) => rotZ(v, -a);         // positive lean tips forward

  // A fighting form can turn the shoulders and hips through a move (P.twist,
  // P.hipTwist, data/forms.js): a boxer's punch is thrown by turning the
  // body into it. The head turns only a little with them, eyes on the target.
  const tw = P.twist || 0;
  const yc = (turn?.yaw ?? GL3D.YAW) + tw, yp = (turn?.hipYaw ?? GL3D.HIP_YAW) + (P.hipTwist || 0);
  const yh = yc - tw * GL3D.TWIST_HEAD_STAYS + (turn?.headYaw ?? GL3D.HEAD_YAW);
  const chestFwd = tip([Math.cos(yc), 0, Math.sin(yc)], leanRad);
  const chestLat = tip([-Math.sin(yc), 0, Math.cos(yc)], leanRad);   // toward the near side
  const chestUp = tip([0, 1, 0], leanRad);
  const pl = leanRad * (own ? fit.pelvis ?? GL3D.PELVIS_LEAN : GL3D.PELVIS_LEAN);
  const pelFwd = tip([Math.cos(yp), 0, Math.sin(yp)], pl);
  const pelLat = tip([-Math.sin(yp), 0, Math.cos(yp)], pl);
  const pelUp = tip([0, 1, 0], pl);
  const headFwd = tip([Math.cos(yh), 0, Math.sin(yh)], leanRad);

  // A sculpted body's arms and legs stretch only a little past their length
  // (GL3D.STRETCH_MOST): reaching for a strike placed for a longer limb, they
  // grew by up to a third (Cathie's punch and kick, Jeff's UNDERCUT, Carl's
  // HOSTILE TAKEOVER), and read as rubber. Past that they fall short.
  const most = own ? GL3D.STRETCH_MOST : Infinity;
  const build = own ? 1 : (P.build ?? 1);
  const wide = own ? 1 : (P.shoulderW ?? 1);
  const G = (k) => (own ? fit.girth ?? 1 : GL3D[k]);
  const pose = {};
  const set = (name, head, tail, ref, sx, sy = build, sz = build) => {
    pose[name] = { head, tail, ref, sx, sy, sz };
  };

  // ---- torso: joints spaced along the leaned torso, stretched to its length
  const hip = bt(0, P.hipY);
  const [scx, scy] = socket(0, P.shoulderY + GL3D.SOCKET_DROP);
  // A model sculpted to its own proportions keeps its own torso: the 2D
  // figure's is shorter, built under a head three times the size, and
  // stretching a real body to it squashed the spine into a hunch.
  const shoulderC = own ? add(hip, scale(chestUp, rig.torso)) : bt(scx, scy);
  const ts = own ? 1 : dist(hip, shoulderC) / rig.torso;
  const spineJ = add(hip, scale(pelUp, rig.spineOff * ts));
  const chestJ = add(hip, scale(chestUp, rig.chestOff * ts));
  const neckJ = add(hip, scale(chestUp, rig.neckOff * ts));

  const headR = P.headR ?? STYLIZE.HEAD_R;
  const headTop = P.shoulderY - (headR - STYLIZE.NECK_OVERLAP);
  const [headX, headY] = socket(P.headX + (P.bodyLean || 0) * GL3D.HEAD_LEAN_PX, Math.max(P.headY, headTop));
  let hs, headBase, headTail, neckFwd = chestFwd, faceFwd = headFwd;
  if (own) {
    // ...and its head stays on its own neck. From the 2D pose it takes only
    // how far the head is thrown forward of the torso or snapped back, as a
    // nod at the base of the neck, never more than fit.nod: placed at the 2D
    // head's centre, the neck was dragged out to reach it, and a punch's
    // forward drive stretched it to nearly twice its length.
    // A fighter leaning in keeps his head level, eyes on the opponent: the
    // neck takes part of the trunk's lean and the head little of it, so the
    // head does not jut forward with the shoulders. A snap back from a hit
    // goes less far than a nod forward.
    const h2 = sub(pt(headX, headY), pt(scx, scy));
    const lim = fit.nod ?? 0.35;
    const nod = Math.max(-lim * 0.7, Math.min(lim, Math.atan2(h2[0], h2[1]) - lean2D));
    const neckUp = tip([0, 1, 0], leanRad * 0.6 + nod);
    const headUp = tip([0, 1, 0], leanRad * 0.15 + nod);
    hs = fit.head ?? 1;
    headBase = add(neckJ, scale(neckUp, rig.rest.neck.len));
    headTail = add(headBase, scale(headUp, rig.rest.head.len * hs));
    neckFwd = tip([Math.cos(yc), 0, Math.sin(yc)], leanRad * 0.6 + nod);
    faceFwd = tip([Math.cos(yh), 0, Math.sin(yh)], leanRad * 0.15 + nod);
  } else {
    hs = (headR / STYLIZE.HEAD_R) * GL3D.HEAD_SCALE;
    headBase = sub(bt(headX, headY), scale(chestUp, rig.skull * hs));
    headTail = add(headBase, scale(chestUp, rig.rest.head.len * hs));
  }

  const torso = build * G('TORSO_GIRTH');
  set('hips', hip, spineJ, pelFwd, dist(hip, spineJ) / rig.rest.hips.len, torso, torso);
  set('spine', spineJ, chestJ, normalize(add(pelFwd, chestFwd)),
      dist(spineJ, chestJ) / rig.rest.spine.len, torso, torso * (1 + wide) / 2);
  set('chest', chestJ, neckJ, chestFwd, dist(chestJ, neckJ) / rig.rest.chest.len, torso, torso * wide);
  set('neck', neckJ, headBase, neckFwd, dist(neckJ, headBase) / rig.rest.neck.len);
  set('head', headBase, headTail, faceFwd, hs, hs, hs);

  // ---- arms: the lead hand (armF) on the far shoulder, the rear hand near
  const half = (own ? fit.shoulderHalf ?? GL3D.SHOULDER_HALF : GL3D.SHOULDER_HALF) * wide;
  const fists = {};
  const arm = (side, shoulder, hand, bendSign, flare, depth = GL3D.HAND_DEPTH, turn = 0) => {
    // A guard hand can turn with the shoulders (a form's P.guardTurn), fist
    // and elbow both, so a rear fist kept at the chin keeps its place against
    // the chest as the shoulders turn through a punch, instead of being left
    // behind while the shoulder it hangs from swings back. It is placed as
    // though the shoulders were square, then turned about the spine as the
    // chest is: upright, then leaned again.
    const a = tw * turn;
    const turned = (v, by, o = [0, 0, 0]) => {
      const u = tip(sub(v, o), -leanRad), c = Math.cos(by), sn = Math.sin(by);
      return add(o, tip([u[0] * c - u[2] * sn, u[1], u[0] * sn + u[2] * c], leanRad));
    };
    const depthOf = a ? turned(shoulder, -a, shoulderC) : shoulder;
    let target = bt(hand.x, hand.y, depthOf[2] * depth);
    if (a) target = turned(target, a, shoulderC);
    // Elbows point down and back, and out a little. drawFighter bends toward
    // the perpendicular of shoulder-to-hand instead, which flips sign when a
    // hand passes behind the body; at 2D's gentle bend that reads fine, but a
    // real upper arm folds hard and the flip becomes a chicken wing. The
    // per-character sign is kept: a negative bend swings the elbow forward.
    const k = Math.sign(bendSign) || 1;
    const back = [-GL3D.ELBOW_BACK * k, -1, 0];
    const pole = normalize(add(a ? turned(back, a) : back, scale(chestLat, flare * GL3D.ELBOW_FLARE)));
    const up = rig.rest[`upper_arm.${side}`], lo = rig.rest[`forearm.${side}`];
    const s = ik(shoulder, target, up.len, lo.len, pole, most);
    const girth = build * G('ARM_GIRTH');
    set(`upper_arm.${side}`, shoulder, s.mid, onHinge(s.hinge, shoulder, s.mid), dist(shoulder, s.mid) / up.len, girth, girth);
    set(`forearm.${side}`, s.mid, s.end, onHinge(s.hinge, s.mid, s.end), dist(s.mid, s.end) / lo.len, girth, girth);
    fists[side] = s.end;
  };
  // A form can bring the hands in toward the middle (P.handDepth, lead and
  // rear): a boxer's fists guard the face from in front of it, not out over
  // each shoulder.
  arm('L', sub(shoulderC, scale(chestLat, half)), P.armF, elbow.F ?? STYLIZE.ELBOW, -1, P.handDepth?.F);
  arm('R', add(shoulderC, scale(chestLat, half)), P.armB, elbow.B ?? STYLIZE.ELBOW, 1, P.handDepth?.B, P.guardTurn);
  // A held prop rides a fist but faces the way the body faces, as a 2D part is
  // an unrotated offset from the hand, instead of turning with the arm.
  for (const side of ['L', 'R']) {
    const g = `grip.${side}`;
    if (rig.rest[g]) set(g, fists[side], add(fists[side], scale(chestFwd, 0.1)), chestUp, 1, 1, 1);
  }

  // ---- legs: knees forward and a little out, feet set like the rest pose
  const hipBase = sub(hip, scale(pelUp, GL3D.HIP_DROP));
  // A body's stride sets its hip height in 2D, where the legs are drawn to fit.
  // The model's legs are fixed, so without this a short stride (Kim, Carl)
  // bent them into a squat at rest and a long one (Cathie, Elo) stood them
  // straight and stretched them. Scaled bones keep every fighter's knees at
  // the same bend.
  // LEG_SLACK makes them a little longer than the hip height needs, so the
  // knees always carry some bend: legs locked straight read as standing about.
  // A sculpt built to the fighter's own stride already has legs that long
  // (fit.legs, as many times Jeff's as the stride makes them), so only the
  // rest of the stride is left to scale.
  const stride = (P.stride ?? 1) * GL3D.LEG_SLACK / (own ? fit.legs ?? 1 : 1);
  const leg = (side, hipJ, foot, flare) => {
    const target = pt(foot.x, foot.y - GL3D.ANKLE_PX, hipJ[2] * GL3D.FOOT_DEPTH);
    const pole = normalize(add([1, 0, 0], scale(pelLat, flare * GL3D.KNEE_FLARE)));
    const th = rig.rest[`thigh.${side}`], sn = rig.rest[`shin.${side}`], ft = rig.rest[`foot.${side}`];
    // Hips driven in after a kick would pull a planted foot behind them out
    // past the leg's length (Jeff's by a tenth): the foot skids in after them
    // instead, no further than they went, so the leg stays a leg.
    if (hx > 0 && foot.y >= 0 && target[0] < hipJ[0]) {
      const reach = (th.len + sn.len) * stride * GL3D.SKID_REACH;
      const across = (target[1] - hipJ[1]) ** 2 + (target[2] - hipJ[2]) ** 2;
      if (reach * reach > across) {
        const most = hipJ[0] - Math.sqrt(reach * reach - across);
        if (most > target[0]) target[0] = Math.min(most, target[0] + hx / U);
      }
    }
    // a planted foot always reaches the floor
    const s = ik(hipJ, target, th.len * stride, sn.len * stride, pole, foot.y < 0 ? most : Infinity,
      P.rot ? -Infinity : GL3D.KNEE_FLOOR);   // not in a fall, where the model is turned off its feet
    const girth = build * G('LEG_GIRTH');
    set(`thigh.${side}`, hipJ, s.mid, onHinge(s.hinge, hipJ, s.mid), dist(hipJ, s.mid) / th.len, girth, girth);
    set(`shin.${side}`, s.mid, s.end, onHinge(s.hinge, s.mid, s.end), dist(s.mid, s.end) / sn.len, girth, girth);
    const shinDir = normalize(sub(s.end, s.mid));
    // A foot on the floor lies flat on it, as the rest foot does, whatever
    // the shin is doing. It used to keep its rest angle to the shin, so a bent
    // knee (any crouched stance) tipped the toes down and the fighter seemed
    // to be on tiptoe, mid-jump, standing still. Lifted, it hangs off the shin
    // as before, and in between it rolls from one to the other.
    const lift = Math.min(1, Math.max(0, -foot.y / GL3D.FOOT_LIFT));
    const hang = normalize(rotZ(shinDir, rig.footAngle));
    const toe = normalize(add(scale(rig.footRest, 1 - lift), scale(hang, lift)));
    const up = normalize(add(scale([0, 1, 0], 1 - lift), scale(shinDir, -lift)), [0, 1, 0]);
    const fs = build * G('FOOT_SCALE');
    set(`foot.${side}`, s.end, add(s.end, scale(toe, ft.len * fs)), up, fs, fs, fs);
  };
  const hipHalf = own ? fit.hipHalf ?? GL3D.HIP_HALF : GL3D.HIP_HALF;
  leg('L', sub(hipBase, scale(pelLat, hipHalf)), P.legF, -1);
  leg('R', add(hipBase, scale(pelLat, hipHalf)), P.legB, 1);

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
