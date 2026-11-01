// Fighting forms: how a fighter stands, guards and throws, as a martial art
// rather than as a personality. Boxing first (November 2026), for the
// sculpted Jeff; karate, kung fu and the rest are each their own when a
// fighter takes them up.
//
// RENDER-ONLY, the same contract as a fighter's stance and the attack tracks:
// nothing here reaches the simulation. Hits come from ATTACKS timing, never
// from where a fist is drawn.
//
// A form belongs to a model for now (models3d.js `form`), so it is only seen
// where that model is drawn: the 2D fighters keep their own stances. It
// stands in for the fighter's own stance, motion and attack tracks
// (drawFighter.js computePose), in the same units: 2D rig px before body
// proportions, hip, shoulder and head as deltas (down is positive), hands
// and feet absolute.

import { carried } from './tracks.js';

// A boxer's guard: hands up, the lead fist in front of the face and the rear
// one at the chin, elbows down over the ribs, chin down, knees bent, the feet
// a long stance apart with the rear one back.
const GUARD_F = { x: 50, y: -172 };
const GUARD_B = { x: 32, y: -162 };   // at the jaw, under the mouth, so the camera still sees it
const HIP = -82, SHOULDER = -148, HEAD = -176;   // REST lowered by the stance

// The lead straight, thrown from the guard and back to it along the same line.
// No wind-up of the fist: a boxer who draws his hand back before he punches
// is telling you it is coming. The weight comes from turning the body instead:
// the hips and shoulders load a little away from the target (twist below 0),
// then turn through it as the fist goes out (above 0, the lead side forward),
// the hips leading the shoulders. The rear fist never leaves the chin.
// `own` says the track is written in this guard's own positions, so it is not
// blended toward the fighter's stance the way the shared tracks are.
const LEAD_STRAIGHT = {
  own: true,
  keys: carried([
    { t: 0,    joints: { armF: GUARD_F, armB: GUARD_B, hipY: HIP, shoulderY: SHOULDER, headY: HEAD, headX: 2, bodyLean: 0.12, twist: 0, hipTwist: 0, sx: 1, sy: 1, legB: { x: -30, y: 0 } } },
    // load: sink a little and turn away, the fist staying home
    { t: 0.6,  joints: { armF: { x: 46, y: -170 }, hipY: HIP + 2, bodyLean: 0.1, twist: -0.12, hipTwist: -0.1, sx: 1.03, sy: 0.97 }, ease: 'outCubic' },
    { t: 0.95, joints: { armF: { x: 44, y: -169 }, hipY: HIP + 3, bodyLean: 0.09, twist: -0.16, hipTwist: -0.12, sx: 1.04, sy: 0.96 }, ease: 'outQuad' },
    // impact: the hips turn first and the shoulders follow them through
    { t: 1.15, joints: { armF: { x: 104, y: -164 }, hipY: HIP - 1, headX: 5, bodyLean: 0.22, twist: 0.26, hipTwist: 0.15, sx: 0.96, sy: 1.04, legB: { x: -27, y: 0 } }, ease: 'outBack', smear: true },
    { t: 2,    joints: { armF: { x: 100, y: -164 }, hipY: HIP - 1, headX: 5, bodyLean: 0.2, twist: 0.23, hipTwist: 0.13, sx: 0.97, sy: 1.03, legB: { x: -27, y: 0 } }, hold: true },
    // straight back to the guard, the body turning back with it
    { t: 2.4,  joints: { armF: { x: 66, y: -170 }, hipY: HIP, headX: 3, bodyLean: 0.14, twist: 0.06, hipTwist: 0.03, sx: 1, sy: 1 }, ease: 'outQuad' },
    { t: 3,    joints: { armF: GUARD_F, headX: 2, bodyLean: 0.12, twist: 0, hipTwist: 0, legB: { x: -30, y: 0 } }, ease: 'inOutCubic' },
  ]),
};

export const FORMS = {
  boxing: {
    stance: { hip: 4, shoulder: 4, head: 4, lean: 0.12, armF: GUARD_F, armB: GUARD_B,
      legF: { x: 24 }, legB: { x: -30 } },
    // Light on the feet: a small, steady bounce in the knees at rest.
    bounce: { px: 2, rate: 10 },
    // The block is a shell: both forearms up in front of the face, from the
    // guard, the lead shoulder turned in to cover the chin.
    block: { armF: { x: -6, y: -9 }, armB: { x: 0, y: -10 }, twist: 0.1 },
    // The fists come in to guard the face from in front of it, where the
    // shared rig holds them out over each shoulder (GL3D.HAND_DEPTH): the lead
    // one to the middle, the rear one to the side of the chin, so its elbow
    // stays down along the ribs instead of across the chest.
    handDepth: { F: 0.4, B: 0.7 },
    // The rear fist stays at the chin as the shoulders turn through a punch,
    // turning with them.
    guardTurn: 1,
    motion: { windup: 1, follow: 1, drop: 2, squash: 0.03, brace: 0, thrust: 2 },
    tracks: { punch: LEAD_STRAIGHT },
  },
};
