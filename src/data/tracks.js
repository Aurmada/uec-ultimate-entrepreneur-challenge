// Base animation tracks — the stock set every character falls back to.
//
// RENDER-ONLY (see engine/anim.js). Attack tracks are keyed in phase space:
// 0–1 wind-up, 1–2 hitbox out, 2–3 recovery.
//
// The shape every attack follows is the classic arcade beat:
//
//   ANTICIPATION  coil back and down, squash, weight onto the back foot
//   IMPACT        explode through in one frame, stretch, overshoot, smear
//   RECOVERY      hold the extension so the commitment reads, then settle
//
// The old computed poses eased smoothly from wind-up to strike, which made
// every attack read as a push. The snap is the whole point: nearly all of the
// travel happens between t=0.95 and t=1.15, and then the pose is HELD.

// Reach the arm/leg extension is authored against. The renderer scales the
// extension by the move's real reach, so a zoner visibly out-ranges a
// grappler with the same track.
import { REST } from '../engine/anim.js';

export const NOMINAL_REACH = { slap: 78, punch: 84, kick: 106, launch: 74 };

// samplePose builds every key from REST, so a joint one key moved and the
// next key did not name snapped back to REST the moment that key was reached:
// the punch's back foot jumped 3 px at the end of the coil, and every hold
// dropped the strike's squash and the guard hand on the first frame of the
// recovery. Authoring every joint into every key is how that gets fixed by
// hand, and how it breaks again the next time a key gains a joint. So a key
// of an attack track keeps what the keys before it set, unless it says
// otherwise, which is what anyone writing one assumes it does.
export function carried(keys) {
  const held = {};
  return keys.map((key) => {
    for (const [j, v] of Object.entries(key.joints)) held[j] = v;
    return { ...key, joints: { ...held } };
  });
}

export const BASE_TRACKS = {
  // ---------------------------------------------------------------- idle
  // Breathing, not swaying. Two beats: settle down, drift up.
  // Values restate REST, so they move with it — see the note on REST in
  // engine/anim.js for why the stance sits low and wide.
  //
  // `base: REST` is what keeps that true. addDelta subtracts a track's base, so
  // this one contributes ONLY the breathing and never a constant offset, no
  // matter where the stance sits. Character overrides deliberately do NOT get
  // this base — they were authored against AUTHORED_REST and stay measured
  // there, or moving the stance silently displaces every one of them.
  idle: {
    base: REST,
    keys: [
      { t: 0,    joints: { hipY: -84, shoulderY: -152, headY: -178, armF: { x: 58, y: -152 }, armB: { x: 41, y: -158 } } },
      { t: 0.5,  joints: { hipY: -81, shoulderY: -150, headY: -175, armF: { x: 57, y: -149 }, armB: { x: 40, y: -155 } }, ease: 'inOutCubic' },
      { t: 1,    joints: { hipY: -84, shoulderY: -152, headY: -178, armF: { x: 58, y: -152 }, armB: { x: 41, y: -158 } }, ease: 'inOutCubic' },
    ],
  },

  // A `hold` key is sampled on its own, from REST, so it has to name every
  // joint the strike moved: one that only named the arm let the squash, the
  // head and the back hand snap home on the first frame of every recovery.
  //
  // ---------------------------------------------------------------- punch
  // Thrown from the guard and back to it (October 2026). The lead fist cocks
  // at the chest, then the hips and shoulders turn it out; the rear fist never
  // leaves the chin. It used to swing behind the head on the wind-up and fly
  // out behind the body on the strike, which in 3D read as a flex, and left the
  // face open on every punch in the game.
  punch: carried([
    { t: 0,    joints: { armF: { x: 58, y: -152 }, armB: { x: 41, y: -158 }, bodyLean: 0.08, sx: 1, sy: 1 } },
    // coil: fist drawn back to the chest, weight sinks onto the back foot
    { t: 0.55, joints: { armF: { x: 22, y: -142 }, armB: { x: 40, y: -160 }, bodyLean: -0.04, hipY: -81, headX: 0, sx: 1.05, sy: 0.95, legB: { x: -28, y: 0 } }, ease: 'outCubic' },
    { t: 0.95, joints: { armF: { x: 12, y: -140 }, bodyLean: -0.08, hipY: -79, headX: -2, sx: 1.07, sy: 0.93 }, ease: 'outQuad' },
    // impact: everything travels here, in one frame, driven by the hips
    { t: 1.15, joints: { armF: { x: 106, y: -152 }, armB: { x: 40, y: -160 }, bodyLean: 0.28, hipY: -87, headX: 6, sx: 0.94, sy: 1.07, legB: { x: -22, y: 0 } }, ease: 'outBack', smear: true },
    { t: 2,    joints: { armF: { x: 100, y: -152 }, armB: { x: 40, y: -160 }, bodyLean: 0.24, hipY: -86, headX: 5, sx: 0.96, sy: 1.05, legB: { x: -22, y: 0 } }, hold: true },
    { t: 2.4,  joints: { armF: { x: 66, y: -150 }, bodyLean: 0.12, hipY: -84, headX: 3, sx: 1, sy: 1, legB: { x: -25, y: 0 } }, ease: 'outQuad' },
    { t: 3,    joints: { armF: { x: 58, y: -152 }, armB: { x: 41, y: -158 }, bodyLean: 0.08, headX: 2 }, ease: 'inOutCubic' },
  ]),

  // ---------------------------------------------------------------- kick
  // Chamber, extend, re-chamber: the knee comes up first and the foot snaps
  // out from it, the torso counter-leans to balance it, and both hands stay up.
  // It used to swing a straight leg up from the floor with the fists over the
  // face, which read as a stumble more than a kick.
  kick: carried([
    { t: 0,    joints: { legF: { x: 26, y: 0 }, legB: { x: -25, y: 0 }, armF: { x: 58, y: -152 }, armB: { x: 41, y: -158 }, bodyLean: 0.08 } },
    // the knee comes up, and the weight goes onto the back foot
    { t: 0.5,  joints: { legF: { x: 30, y: -40 }, legB: { x: -24, y: 0 }, armF: { x: 50, y: -150 }, armB: { x: 38, y: -160 }, bodyLean: -0.08, hipY: -83, sx: 1.04, sy: 0.96 }, ease: 'outCubic' },
    { t: 0.95, joints: { legF: { x: 28, y: -56 }, bodyLean: -0.12, hipY: -82, sx: 1.06, sy: 0.94 }, ease: 'outQuad' },
    // The counter-lean is what sells a kick's weight, but HELD at full depth it
    // reads as falling over backwards rather than committing to a kick, so the
    // hold sits shallower than the impact frame.
    { t: 1.15, joints: { legF: { x: 106, y: -80 }, legB: { x: -22, y: 0 }, armF: { x: 40, y: -146 }, armB: { x: 34, y: -160 }, bodyLean: -0.18, hipY: -92, sx: 0.93, sy: 1.08 }, ease: 'outBack', smear: true },
    { t: 2,    joints: { legF: { x: 100, y: -76 }, legB: { x: -22, y: 0 }, armF: { x: 40, y: -146 }, armB: { x: 34, y: -160 }, bodyLean: -0.12, hipY: -90, sx: 0.95, sy: 1.06 }, hold: true },
    // re-chamber before the foot comes down, so it lands under the body
    { t: 2.3,  joints: { legF: { x: 44, y: -36 }, armF: { x: 48, y: -150 }, bodyLean: -0.02, hipY: -86, sx: 1, sy: 1 }, ease: 'outQuad' },
    { t: 3,    joints: { legF: { x: 26, y: 0 }, legB: { x: -25, y: 0 }, armF: { x: 58, y: -152 }, armB: { x: 41, y: -158 }, bodyLean: 0.08, hipY: -84 }, ease: 'inOutCubic' },
  ]),

  // ---------------------------------------------------------------- slap
  // Cocked high beside the head, whips down and across. Fast in, fast out: it
  // is a taunt. The other hand stays at the chin.
  slap: carried([
    { t: 0,    joints: { armF: { x: 58, y: -152 }, armB: { x: 41, y: -158 }, bodyLean: 0.08 } },
    { t: 0.6,  joints: { armF: { x: 30, y: -188 }, armB: { x: 38, y: -158 }, bodyLean: -0.08, headX: -2, sx: 1.04, sy: 0.96 }, ease: 'outCubic' },
    { t: 0.95, joints: { armF: { x: 20, y: -196 }, bodyLean: -0.12 }, ease: 'outQuad' },
    { t: 1.15, joints: { armF: { x: 96, y: -142 }, armB: { x: 36, y: -160 }, bodyLean: 0.28, headX: 6, sx: 0.95, sy: 1.05 }, ease: 'outBack', smear: true },
    { t: 2,    joints: { armF: { x: 90, y: -142 }, armB: { x: 36, y: -160 }, bodyLean: 0.24, headX: 5, sx: 0.96, sy: 1.04 }, hold: true },
    { t: 2.5,  joints: { armF: { x: 64, y: -148 }, bodyLean: 0.12, headX: 3, sx: 1, sy: 1 }, ease: 'outQuad' },
    { t: 3,    joints: { armF: { x: 58, y: -152 }, armB: { x: 41, y: -158 }, bodyLean: 0.08, headX: 2 }, ease: 'inOutCubic' },
  ]),

  // ---------------------------------------------------------------- launch
  // Rising uppercut: sink hard with the fist dropped by the hip, then drive the
  // whole body up off the back foot so the fist rises in front of the face, the
  // elbow still bent. It used to throw the arm straight up from the shoulder,
  // which read as hailing a cab.
  launch: carried([
    { t: 0,    joints: { armF: { x: 58, y: -152 }, armB: { x: 41, y: -158 }, bodyLean: 0.08 } },
    { t: 0.55, joints: { armF: { x: 36, y: -118 }, armB: { x: 38, y: -142 }, hipY: -72, shoulderY: -142, headY: -168, bodyLean: 0.16, sx: 1.09, sy: 0.90 }, ease: 'outCubic' },
    { t: 0.95, joints: { armF: { x: 32, y: -110 }, hipY: -68, shoulderY: -138, headY: -164, bodyLean: 0.18, sx: 1.12, sy: 0.88 }, ease: 'outQuad' },
    // Rising off the back foot, not curling up: the hip climbs less than the
    // shoulders and head, or the torso compresses and he reads as hunched.
    { t: 1.15, joints: { armF: { x: 68, y: -226 }, armB: { x: 44, y: -186 }, legF: { x: 22, y: -18 }, hipY: -104, shoulderY: -184, headY: -216, bodyLean: -0.06, sx: 0.90, sy: 1.12 }, ease: 'outBack', smear: true },
    { t: 2,    joints: { armF: { x: 66, y: -220 }, armB: { x: 44, y: -182 }, legF: { x: 22, y: -18 }, hipY: -100, shoulderY: -180, headY: -212, bodyLean: -0.04, sx: 0.93, sy: 1.08 }, hold: true },
    { t: 2.35, joints: { armF: { x: 56, y: -180 }, armB: { x: 41, y: -164 }, legF: { x: 26, y: 0 }, hipY: -90, shoulderY: -160, headY: -186, bodyLean: 0.04, sx: 1, sy: 1 }, ease: 'outQuad' },
    { t: 3,    joints: { armF: { x: 58, y: -152 }, armB: { x: 41, y: -158 }, hipY: -84, shoulderY: -152, headY: -178, bodyLean: 0.08 }, ease: 'inOutCubic' },
  ]),
};

// Which base track an attack uses. Archetypes that have no track of their own
// borrow the nearest basic rather than falling back to no animation at all.
export const ATTACK_TRACK = {
  slap: 'slap', punch: 'punch', kick: 'kick', launch: 'launch',
  grab: 'punch', teleport: 'punch', rush: 'punch', steal: 'punch',
  aoe: 'kick', trap: 'kick',
  projectile: 'slap', rain: 'slap', bomb: 'slap', counter: 'slap',
};
