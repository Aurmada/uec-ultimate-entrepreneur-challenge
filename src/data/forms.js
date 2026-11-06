// Fighting forms: how a fighter stands, guards and throws, as a martial art
// rather than as a personality. Boxing first (November 2026), for the
// sculpted Jeff, then brawling, for Adam, grappling, for Carl, showboating,
// for Steve, the shoulder roll, for Elo, the fence, for Scam, fencing, for
// Lizbeth, the peek-a-boo, for Kim, and tai chi, for Cathie; karate, kung fu
// and the rest are each their own when a fighter takes them up.
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
// as tall as Jeff's style stands him (drawFighter.js STANCES, `poised`), which
// the boxing stance keeps: keyed at 1, he dropped 2% on the first frame of
// every straight and stood back up on the last
const GUARD_SY = 1.02;

// The guard: where each of this form's tracks starts and ends.
const BOX_AT = { armF: GUARD_F, armB: GUARD_B, hipY: HIP, shoulderY: SHOULDER, headY: HEAD,
  headX: 2, bodyLean: 0.12, twist: 0, hipTwist: 0, sx: 1, sy: GUARD_SY, legF: { x: 24, y: 0 }, legB: { x: -30, y: 0 } };

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
    { t: 0,    joints: BOX_AT },
    // load: sink a little and turn away, the fist staying home
    { t: 0.6,  joints: { armF: { x: 46, y: -170 }, hipY: HIP + 2, bodyLean: 0.1, twist: -0.12, hipTwist: -0.1, sx: 1.03, sy: 0.97 }, ease: 'outCubic' },
    { t: 0.95, joints: { armF: { x: 44, y: -169 }, hipY: HIP + 3, bodyLean: 0.09, twist: -0.16, hipTwist: -0.12, sx: 1.04, sy: 0.96 }, ease: 'outQuad' },
    // impact: the hips turn first and the shoulders follow them through
    { t: 1.15, joints: { armF: { x: 104, y: -164 }, hipY: HIP - 1, headX: 5, bodyLean: 0.22, twist: 0.26, hipTwist: 0.15, sx: 0.96, sy: 1.04, legB: { x: -27, y: 0 } }, ease: 'outBack', smear: true },
    { t: 2,    joints: { armF: { x: 100, y: -164 }, hipY: HIP - 1, headX: 5, bodyLean: 0.2, twist: 0.23, hipTwist: 0.13, sx: 0.97, sy: 1.03, legB: { x: -27, y: 0 } }, hold: true },
    // straight back to the guard, the body turning back with it
    { t: 2.4,  joints: { armF: { x: 66, y: -170 }, hipY: HIP, headX: 3, bodyLean: 0.14, twist: 0.06, hipTwist: 0.03, sx: 1, sy: 1 }, ease: 'outQuad' },
    { t: 3,    joints: { armF: GUARD_F, headX: 2, bodyLean: 0.12, twist: 0, hipTwist: 0, sy: GUARD_SY, legB: { x: -30, y: 0 } }, ease: 'inOutCubic' },
  ]),
};

// A boxer's kick, which is to say a push: the knee comes straight up in
// front of him, the hands never leaving the guard, and the foot is driven out
// flat at the belly with the hips behind it, then drawn back to the knee and
// set down where it came from. Nothing about it is pretty; all of it is
// efficient.
const BOX_KICK = {
  own: true,
  keys: carried([
    { t: 0,    joints: BOX_AT },
    { t: 0.5,  joints: { legF: { x: 32, y: -44 }, hipY: HIP - 1, bodyLean: 0.06, sx: 1.02 }, ease: 'outCubic' },
    { t: 0.95, joints: { legF: { x: 34, y: -58 }, bodyLean: 0.02 }, ease: 'outQuad' },
    // driven out, the hips through it
    { t: 1.15, joints: { legF: { x: 104, y: -74 }, legB: { x: -32, y: 0 }, hipY: HIP - 6, bodyLean: -0.08, twist: 0.08, hipTwist: 0.1, sx: 0.96, sy: 1.06 }, ease: 'outBack', smear: true },
    { t: 2,    joints: { legF: { x: 100, y: -72 }, bodyLean: -0.06 }, hold: true },
    // back to the knee before it comes down
    { t: 2.35, joints: { legF: { x: 40, y: -40 }, legB: { x: -30, y: 0 }, hipY: HIP - 2, bodyLean: 0.06, twist: 0, hipTwist: 0, sx: 1, sy: GUARD_SY }, ease: 'outQuad' },
    { t: 3,    joints: BOX_AT, ease: 'inOutCubic' },
  ]),
};

// A boxer's slap is a flicked backhand: the lead hand opens and turns out at
// the top of the guard, flicks across at the face with a little turn of the
// shoulders, and closes again on the way home. Dismissive, and over quickly.
const BOX_SLAP = {
  own: true,
  keys: carried([
    { t: 0,    hand: 'fist', joints: BOX_AT },
    { t: 0.6,  hand: 'open', joints: { armF: { x: 40, y: -182 }, bodyLean: 0.1, twist: -0.08 }, ease: 'outCubic' },
    { t: 0.95, hand: 'open', joints: { armF: { x: 34, y: -186 }, twist: -0.1 }, ease: 'outQuad' },
    { t: 1.15, hand: 'open', joints: { armF: { x: 98, y: -160 }, headX: 4, bodyLean: 0.16, twist: 0.14, hipTwist: 0.06 }, ease: 'outBack', smear: true },
    { t: 2,    hand: 'open', joints: { armF: { x: 94, y: -160 } }, hold: true },
    { t: 2.4,  hand: 'open', joints: { armF: { x: 60, y: -170 }, headX: 2, bodyLean: 0.13, twist: 0.04, hipTwist: 0.02 }, ease: 'outQuad' },
    { t: 3,    hand: 'fist', joints: BOX_AT, ease: 'inOutCubic' },
  ]),
};

// The uppercut, a boxer's: he dips at the knees with the lead fist dropped to
// the chest and the body turned away, then comes up through it, the fist
// rising past the chin with the hips and shoulders turning behind it, the
// feet planted and the rear fist at his chin throughout.
const BOX_UPPER = {
  own: true,
  keys: carried([
    { t: 0,    joints: BOX_AT },
    { t: 0.55, joints: { armF: { x: 40, y: -140 }, hipY: HIP + 8, shoulderY: SHOULDER + 8, headY: HEAD + 8, bodyLean: 0.18, twist: -0.15, hipTwist: -0.1, sx: 1.06, sy: 0.96 }, ease: 'outCubic' },
    { t: 0.95, joints: { armF: { x: 38, y: -134 }, hipY: HIP + 10, shoulderY: SHOULDER + 10, headY: HEAD + 10, twist: -0.2, hipTwist: -0.12 }, ease: 'outQuad' },
    { t: 1.15, joints: { armF: { x: 70, y: -214 }, hipY: HIP - 10, shoulderY: SHOULDER - 14, headY: HEAD - 14, bodyLean: 0, twist: 0.25, hipTwist: 0.15, sx: 0.94, sy: 1.08 }, ease: 'outBack', smear: true },
    { t: 2,    joints: { armF: { x: 68, y: -210 } }, hold: true },
    { t: 2.45, joints: { armF: { x: 56, y: -180 }, hipY: HIP - 2, shoulderY: SHOULDER - 3, headY: HEAD - 3, bodyLean: 0.08, twist: 0.06, hipTwist: 0.04, sx: 1, sy: GUARD_SY }, ease: 'outQuad' },
    { t: 3,    joints: BOX_AT, ease: 'inOutCubic' },
  ]),
};

// A bar-room brawler's guard, Adam's from 2D: slouched low on the hips, the
// fists down at the belly and too far apart, chin tucked, the widest base in
// the cast. Ready to fight, never once ready to defend.
const BRAWL_F = { x: 60, y: -126 };
const BRAWL_B = { x: 42, y: -134 };
const B_HIP = -70, B_SHOULDER = -148, B_HEAD = -168;    // REST lowered by the stance

// The guard: where each of this form's tracks starts and ends.
const BRAWL_AT = { armF: BRAWL_F, armB: BRAWL_B, hipY: B_HIP, shoulderY: B_SHOULDER, headY: B_HEAD,
  headX: 2, bodyLean: 0.14, twist: 0, hipTwist: 0, sx: 1.06, sy: 0.98, legF: { x: 33, y: 0 }, legB: { x: -31, y: 0 } };

// The haymaker: all wind-up and no control. The fist goes back by his ear
// and the whole body turns away with it, the deepest coil in the cast, so
// everyone sees it coming; then it swings round and through, the hips
// dragging the shoulders, and keeps going after the hit has landed, the body
// turned on past the target and off balance, before he stumbles back to his
// guard. The rear fist stays down at the belly, where his guard keeps it.
const HAYMAKER = {
  own: true,
  keys: carried([
    { t: 0,    joints: BRAWL_AT },
    // the wind-up: back past the ear, the body turned away
    { t: 0.6,  joints: { armF: { x: 16, y: -158 }, hipY: B_HIP + 4, headX: -1, bodyLean: 0.02, twist: -0.42, hipTwist: -0.22, sx: 1.08, sy: 0.95 }, ease: 'outCubic' },
    { t: 0.95, joints: { armF: { x: 6, y: -162 }, hipY: B_HIP + 5, bodyLean: -0.02, twist: -0.52, hipTwist: -0.28, sx: 1.09, sy: 0.94 }, ease: 'outQuad' },
    // the swing, round and through in one frame
    { t: 1.15, joints: { armF: { x: 104, y: -160 }, hipY: B_HIP - 2, headX: 7, bodyLean: 0.3, twist: 0.5, hipTwist: 0.3, sx: 0.95, sy: 1.05, legB: { x: -27, y: 0 } }, ease: 'outBack', smear: true },
    // and on past it
    { t: 2,    joints: { armF: { x: 92, y: -146 }, hipY: B_HIP, headX: 9, bodyLean: 0.36, twist: 0.66, hipTwist: 0.4, sx: 0.97, sy: 1.03, legB: { x: -24, y: -4 } }, hold: true },
    // the stumble back
    { t: 2.5,  joints: { armF: { x: 74, y: -134 }, hipY: B_HIP + 2, headX: 4, bodyLean: 0.2, twist: 0.3, hipTwist: 0.18, sx: 1.03, sy: 1, legB: { x: -29, y: 0 } }, ease: 'outQuad' },
    { t: 3,    joints: { armF: BRAWL_F, armB: BRAWL_B, hipY: B_HIP, headX: 2, bodyLean: 0.14, twist: 0, hipTwist: 0, sx: 1.06, sy: 0.98, legB: { x: -31, y: 0 } }, ease: 'inOutCubic' },
  ]),
};

// A brawler's kick is the haymaker with a foot: he hauls the knee up high,
// the body leaning back and turned away and the arms thrown up and out for
// balance, so anyone can see it coming (the lead arm forward read as a punch,
// and the leg drawn back behind him could not be seen), then stamps it
// through as if at a door, and keeps going after it lands, stumbling forward
// off the kick before he finds his feet.
const BRAWL_KICK = {
  own: true,
  keys: carried([
    { t: 0,    joints: BRAWL_AT },
    { t: 0.55, joints: { legF: { x: 30, y: -52 }, armF: { x: 56, y: -166 }, armB: { x: 16, y: -152 }, hipY: B_HIP + 2, bodyLean: -0.06, twist: -0.2, hipTwist: -0.15, sx: 1.08, sy: 0.96 }, ease: 'outCubic' },
    { t: 0.95, joints: { legF: { x: 28, y: -66 }, armF: { x: 54, y: -176 }, armB: { x: 8, y: -156 }, bodyLean: -0.14, twist: -0.28, hipTwist: -0.2 }, ease: 'outQuad' },
    // stamped through
    { t: 1.15, joints: { legF: { x: 108, y: -84 }, legB: { x: -28, y: 0 }, armF: { x: 60, y: -150 }, armB: { x: -4, y: -150 }, hipY: B_HIP - 10, bodyLean: -0.2, twist: 0.25, hipTwist: 0.3, sx: 0.94, sy: 1.06 }, ease: 'outBack', smear: true },
    { t: 2,    joints: { legF: { x: 104, y: -80 }, bodyLean: -0.16 }, hold: true },
    // and off balance after it
    { t: 2.5,  joints: { legF: { x: 58, y: -14 }, armF: { x: 70, y: -130 }, armB: { x: 36, y: -138 }, hipY: B_HIP - 2, bodyLean: 0.2, twist: 0.1, hipTwist: 0.1, sx: 1.04, sy: 0.98 }, ease: 'outQuad' },
    { t: 3,    joints: BRAWL_AT, ease: 'inOutCubic' },
  ]),
};

// The brawler's slap is a roundhouse with the flat of the hand: wound right
// back and up past his ear with the body turned away, swung all the way
// across and on past the target, the body carried round after it.
const BRAWL_SLAP = {
  own: true,
  keys: carried([
    { t: 0,    hand: 'fist', joints: BRAWL_AT },
    { t: 0.6,  hand: 'open', joints: { armF: { x: 10, y: -180 }, bodyLean: 0.02, twist: -0.35, hipTwist: -0.15, sx: 1.08, sy: 0.96 }, ease: 'outCubic' },
    { t: 0.95, hand: 'open', joints: { armF: { x: 0, y: -186 }, twist: -0.45, hipTwist: -0.2 }, ease: 'outQuad' },
    { t: 1.15, hand: 'open', joints: { armF: { x: 100, y: -154 }, headX: 6, bodyLean: 0.32, twist: 0.45, hipTwist: 0.25, sx: 0.95, sy: 1.04 }, ease: 'outBack', smear: true },
    { t: 2,    hand: 'open', joints: { armF: { x: 96, y: -150 }, twist: 0.55, hipTwist: 0.3 }, hold: true },
    { t: 2.5,  hand: 'open', joints: { armF: { x: 70, y: -130 }, headX: 4, bodyLean: 0.2, twist: 0.25, hipTwist: 0.12, sx: 1.04, sy: 0.98 }, ease: 'outQuad' },
    { t: 3,    hand: 'fist', joints: BRAWL_AT, ease: 'inOutCubic' },
  ]),
};

// His uppercut comes up from the floor: the fist dropped down by his knee
// and the body bent over and turned away, then one huge upward swing that
// lifts him off his feet, and the stumble after it.
const BRAWL_UPPER = {
  own: true,
  keys: carried([
    { t: 0,    joints: BRAWL_AT },
    { t: 0.55, joints: { armF: { x: 30, y: -96 }, hipY: B_HIP + 10, shoulderY: B_SHOULDER + 12, headY: B_HEAD + 12, bodyLean: 0.3, twist: -0.3, hipTwist: -0.15, sx: 1.1, sy: 0.92 }, ease: 'outCubic' },
    { t: 0.95, joints: { armF: { x: 26, y: -90 }, hipY: B_HIP + 12, shoulderY: B_SHOULDER + 14, headY: B_HEAD + 14, twist: -0.36 }, ease: 'outQuad' },
    { t: 1.15, joints: { armF: { x: 70, y: -230 }, legF: { x: 28, y: -16 }, hipY: B_HIP - 22, shoulderY: B_SHOULDER - 30, headY: B_HEAD - 34, bodyLean: -0.1, twist: 0.4, hipTwist: 0.25, sx: 0.9, sy: 1.12 }, ease: 'outBack', smear: true },
    { t: 2,    joints: { armF: { x: 68, y: -224 } }, hold: true },
    { t: 2.5,  joints: { armF: { x: 66, y: -170 }, legF: { x: 33, y: 0 }, hipY: B_HIP - 4, shoulderY: B_SHOULDER - 4, headY: B_HEAD - 4, bodyLean: 0.2, twist: 0.15, hipTwist: 0.08, sx: 1.04, sy: 0.98 }, ease: 'outQuad' },
    { t: 3,    joints: BRAWL_AT, ease: 'inOutCubic' },
  ]),
};

// A grappler's stance, Carl's from 2D: hunched well forward over a wide low
// base, chin down, the lead hand open and reaching at chest height for
// something to take hold of, the rear one low with his briefcase.
const GRAB_F = { x: 64, y: -134 };
const GRAB_B = { x: 44, y: -122 };
const G_HIP = -68, G_SHOULDER = -140, G_HEAD = -160;   // REST lowered by the stance

// The guard: where each of this form's tracks starts and ends.
const GRAB_AT = { armF: GRAB_F, armB: GRAB_B, hipY: G_HIP, shoulderY: G_SHOULDER, headY: G_HEAD,
  headX: 2, bodyLean: 0.22, twist: 0, hipTwist: 0, sx: 1.04, sy: 0.96, legF: { x: 31, y: 0 }, legB: { x: -29, y: 0 } };

// The seizure: a grappler does not hit you, he takes hold of you. The weight
// sinks and the open hand draws in, then shoots out at the chest with the
// body behind it, closes on whatever it finds (`hand`, the lead hand's shape
// in 3D) and hauls it back in to his chest, the body turning away with the
// pull, before he lets go and settles back. The rear hand keeps the case low
// throughout.
const SEIZE = {
  own: true,
  keys: carried([
    { t: 0,    hand: 'open', joints: GRAB_AT },
    // gathering: the hand drawn in a little, the weight sinking
    { t: 0.6,  hand: 'open', joints: { armF: { x: 58, y: -136 }, hipY: G_HIP + 3, bodyLean: 0.2, twist: -0.08, hipTwist: -0.05, sx: 1.06, sy: 0.94 }, ease: 'outCubic' },
    { t: 0.95, hand: 'open', joints: { armF: { x: 54, y: -138 }, hipY: G_HIP + 5, bodyLean: 0.19, twist: -0.12, hipTwist: -0.08, sx: 1.07, sy: 0.93 }, ease: 'outQuad' },
    // the lunge, the open hand out at the chest and the body behind it
    { t: 1.15, hand: 'open', joints: { armF: { x: 102, y: -146 }, hipY: G_HIP + 2, headX: 6, bodyLean: 0.34, twist: 0.22, hipTwist: 0.12, sx: 0.98, sy: 0.99, legB: { x: -26, y: 0 } }, ease: 'outBack', smear: true },
    // and it closes on what it found
    { t: 1.35, hand: 'fist', joints: { armF: { x: 100, y: -144 }, hipY: G_HIP + 3, bodyLean: 0.34, twist: 0.2 }, ease: 'outQuad' },
    { t: 2,    hand: 'fist', joints: { armF: { x: 98, y: -143 }, bodyLean: 0.33, twist: 0.19 }, hold: true },
    // the haul, back in to his chest, the body turning away with the pull
    { t: 2.45, hand: 'fist', joints: { armF: { x: 52, y: -138 }, hipY: G_HIP + 4, headX: 0, bodyLean: 0.16, twist: -0.18, hipTwist: -0.1, sx: 1.06, sy: 0.95, legB: { x: -31, y: 0 } }, ease: 'outCubic' },
    // he lets go and settles back into his stance
    { t: 3,    hand: 'open', joints: { armF: GRAB_F, hipY: G_HIP, headX: 2, bodyLean: 0.22, twist: 0, hipTwist: 0, sx: 1.04, sy: 0.96, legB: { x: -29, y: 0 } }, ease: 'inOutCubic' },
  ]),
};

// A grappler kicks to move you, not to hurt you: the knee lifts, then a heavy
// push at the thigh with the foot turned out, the body leaning in behind it
// and the open hand reaching forward with it for whatever comes loose. He
// sets it down and is still coming.
const GRAB_KICK = {
  own: true,
  keys: carried([
    { t: 0,    hand: 'open', joints: GRAB_AT },
    { t: 0.55, hand: 'open', joints: { legF: { x: 36, y: -50 }, armF: { x: 58, y: -140 }, hipY: G_HIP - 2, bodyLean: 0.12, sx: 1.04 }, ease: 'outCubic' },
    { t: 0.95, hand: 'open', joints: { legF: { x: 38, y: -62 }, bodyLean: 0.08 }, ease: 'outQuad' },
    // the push, the hand reaching with it
    { t: 1.15, hand: 'open', joints: { legF: { x: 100, y: -66 }, legB: { x: -28, y: 0 }, armF: { x: 74, y: -138 }, hipY: G_HIP - 6, bodyLean: 0.02, twist: 0.12, hipTwist: 0.16, sx: 0.96, sy: 1.02 }, ease: 'outBack', smear: true },
    { t: 2,    hand: 'open', joints: { legF: { x: 97, y: -64 } }, hold: true },
    // set down, still leaning in
    { t: 2.45, hand: 'open', joints: { legF: { x: 48, y: -26 }, armF: { x: 66, y: -136 }, hipY: G_HIP, bodyLean: 0.18, twist: 0.04, hipTwist: 0.04, sx: 1.04, sy: 0.96 }, ease: 'outQuad' },
    { t: 3,    hand: 'open', joints: GRAB_AT, ease: 'inOutCubic' },
  ]),
};

// The grappler's slap is the flat of his open hand shoved into your face,
// more push than blow, the body leaning in behind it.
const GRAB_SLAP = {
  own: true,
  keys: carried([
    { t: 0,    hand: 'open', joints: GRAB_AT },
    { t: 0.6,  hand: 'open', joints: { armF: { x: 54, y: -150 }, bodyLean: 0.2, twist: -0.06 }, ease: 'outCubic' },
    { t: 0.95, hand: 'open', joints: { armF: { x: 50, y: -152 }, twist: -0.08 }, ease: 'outQuad' },
    { t: 1.15, hand: 'open', joints: { armF: { x: 100, y: -150 }, headX: 5, bodyLean: 0.32, twist: 0.16, hipTwist: 0.08 }, ease: 'outBack', smear: true },
    { t: 2,    hand: 'open', joints: { armF: { x: 97, y: -148 } }, hold: true },
    { t: 2.45, hand: 'open', joints: { armF: { x: 70, y: -140 }, headX: 3, bodyLean: 0.26, twist: 0.05, hipTwist: 0.03 }, ease: 'outQuad' },
    { t: 3,    hand: 'open', joints: GRAB_AT, ease: 'inOutCubic' },
  ]),
};

// His launcher is a heave, not a punch: he sinks with the open hand reaching
// low for a hold, closes it on what it finds and stands up with it, hauling
// it up and leaning back under the weight, then lets go.
const GRAB_UPPER = {
  own: true,
  keys: carried([
    { t: 0,    hand: 'open', joints: GRAB_AT },
    { t: 0.55, hand: 'open', joints: { armF: { x: 58, y: -112 }, hipY: G_HIP + 10, shoulderY: G_SHOULDER + 10, headY: G_HEAD + 10, bodyLean: 0.3, sx: 1.06, sy: 0.94 }, ease: 'outCubic' },
    { t: 0.95, hand: 'open', joints: { armF: { x: 56, y: -108 }, hipY: G_HIP + 12, shoulderY: G_SHOULDER + 12, headY: G_HEAD + 12 }, ease: 'outQuad' },
    { t: 1.15, hand: 'fist', joints: { armF: { x: 64, y: -206 }, hipY: G_HIP - 14, shoulderY: G_SHOULDER - 22, headY: G_HEAD - 24, bodyLean: -0.14, twist: 0.1, hipTwist: 0.06, sx: 0.94, sy: 1.1 }, ease: 'outBack', smear: true },
    { t: 2,    hand: 'fist', joints: { armF: { x: 63, y: -202 } }, hold: true },
    { t: 2.45, hand: 'open', joints: { armF: { x: 62, y: -150 }, hipY: G_HIP - 2, shoulderY: G_SHOULDER - 2, headY: G_HEAD - 2, bodyLean: 0.1, twist: 0.03, hipTwist: 0.02, sx: 1.02, sy: 0.98 }, ease: 'outQuad' },
    { t: 3,    hand: 'open', joints: GRAB_AT, ease: 'inOutCubic' },
  ]),
};

// A showman's guard, Steve's from 2D: mid-presentation, tall, the chest open,
// the lead hand open, out and high, showing you the thing, and the device
// held at the chest in the other.
const SHOW_F = { x: 66, y: -170 };
const SHOW_B = { x: 42, y: -142 };
const S_HIP = -84, S_SHOULDER = -152, S_HEAD = -183;   // REST, the head raised by the stance

// The guard: where each of this form's tracks starts and ends.
const SHOW_AT = { armF: SHOW_F, armB: SHOW_B, hipY: S_HIP, shoulderY: S_SHOULDER, headY: S_HEAD,
  headX: 2, bodyLean: -0.06, twist: 0, hipTwist: 0, sx: 1, sy: 1.02, legF: { x: 21, y: 0 }, legB: { x: -19, y: 0 } };

// The big finish: a flourish, the open hand swept up and back over his
// shoulder and the body turned away with it, the chest open to the
// audience; the hand closes at the top of it, and the punch comes down
// straight at the chest. Then he holds the finish a beat too long, chin up,
// because the swing is a demo and the demo needs an audience, before he
// opens the hand and goes back to presenting. The device stays at his chest.
const BIG_FINISH = {
  own: true,
  keys: carried([
    { t: 0,    hand: 'open', joints: SHOW_AT },
    // the flourish, up and back, the body turning away
    { t: 0.5,  hand: 'open', joints: { armF: { x: 30, y: -196 }, headX: -1, bodyLean: -0.12, twist: -0.3, hipTwist: -0.12 }, ease: 'outCubic' },
    { t: 0.95, hand: 'fist', joints: { armF: { x: 20, y: -192 }, headX: -2, bodyLean: -0.14, twist: -0.38, hipTwist: -0.16, sx: 1.02, sy: 1.03 }, ease: 'outQuad' },
    // down and straight through at the chest
    { t: 1.15, hand: 'fist', joints: { armF: { x: 104, y: -164 }, hipY: S_HIP + 2, headX: 4, bodyLean: 0.1, twist: 0.28, hipTwist: 0.14, sx: 0.98, sy: 1.01, legB: { x: -16, y: 0 } }, ease: 'outBack', smear: true },
    { t: 2,    hand: 'fist', joints: { armF: { x: 102, y: -165 }, headX: 4, bodyLean: 0.08, twist: 0.26, hipTwist: 0.13 }, hold: true },
    // the finish, held a beat too long, chin up to the audience
    { t: 2.55, hand: 'fist', joints: { armF: { x: 98, y: -167 }, hipY: S_HIP, headX: 3, bodyLean: -0.02, twist: 0.2, hipTwist: 0.1, sx: 1, sy: 1.02 }, ease: 'outQuad' },
    // and back to presenting
    { t: 3,    hand: 'open', joints: { armF: SHOW_F, headX: 2, bodyLean: -0.06, twist: 0, hipTwist: 0, legB: { x: -19, y: 0 } }, ease: 'inOutCubic' },
  ]),
};

// The showman's kick is a crescent: the leg swept up and round in an arc,
// high, the arms flung open wide as if he were unveiling it, and the finish
// held a beat too long, chin up, the presenting hand still out, before he
// remembers there is a fight on.
const SHOW_KICK = {
  own: true,
  keys: carried([
    { t: 0,    hand: 'open', joints: SHOW_AT },
    { t: 0.5,  hand: 'open', joints: { legF: { x: 40, y: -60 }, armF: { x: 74, y: -176 }, armB: { x: 30, y: -150 }, bodyLean: -0.1 }, ease: 'outCubic' },
    { t: 0.95, hand: 'open', joints: { legF: { x: 30, y: -92 }, bodyLean: -0.16, twist: -0.12 }, ease: 'outQuad' },
    // swept round and through, the arms wide
    { t: 1.15, hand: 'open', joints: { legF: { x: 104, y: -96 }, legB: { x: -18, y: 0 }, armF: { x: 84, y: -182 }, armB: { x: 14, y: -160 }, hipY: S_HIP - 8, bodyLean: -0.22, twist: 0.1, hipTwist: 0.08, sx: 0.94, sy: 1.08 }, ease: 'outBack', smear: true },
    { t: 2,    hand: 'open', joints: { legF: { x: 100, y: -92 }, bodyLean: -0.2 }, hold: true },
    // the finish, held, chin up
    { t: 2.55, hand: 'open', joints: { legF: { x: 56, y: -30 }, armF: { x: 80, y: -180 }, hipY: S_HIP - 2, headY: S_HEAD - 3, bodyLean: -0.1, twist: 0.04, hipTwist: 0.02, sx: 1, sy: 1.02 }, ease: 'outQuad' },
    { t: 3,    hand: 'open', joints: SHOW_AT, ease: 'inOutCubic' },
  ]),
};

// The showman's slap: the hand raised high over his head first, as if for a
// reveal, then swept down across in a long arc, and the follow-through held
// a beat too long, chin up.
const SHOW_SLAP = {
  own: true,
  keys: carried([
    { t: 0,    hand: 'open', joints: SHOW_AT },
    { t: 0.5,  hand: 'open', joints: { armF: { x: 40, y: -200 }, bodyLean: -0.12, twist: -0.2 }, ease: 'outCubic' },
    { t: 0.95, hand: 'open', joints: { armF: { x: 30, y: -206 }, twist: -0.26 }, ease: 'outQuad' },
    { t: 1.15, hand: 'open', joints: { armF: { x: 98, y: -146 }, headX: 4, bodyLean: 0.18, twist: 0.24, hipTwist: 0.1 }, ease: 'outBack', smear: true },
    { t: 2,    hand: 'open', joints: { armF: { x: 94, y: -144 } }, hold: true },
    { t: 2.55, hand: 'open', joints: { armF: { x: 90, y: -160 }, headY: S_HEAD - 3, headX: 3, bodyLean: 0.02, twist: 0.12, hipTwist: 0.05 }, ease: 'outQuad' },
    { t: 3,    hand: 'open', joints: SHOW_AT, ease: 'inOutCubic' },
  ]),
};

// His launcher is the big reveal: the hand drops and closes as he turns
// away, then he springs up off the floor with the fist thrown up high, and
// holds it there, up, for the audience, before he goes back to presenting.
const SHOW_UPPER = {
  own: true,
  keys: carried([
    { t: 0,    hand: 'open', joints: SHOW_AT },
    { t: 0.5,  hand: 'open', joints: { armF: { x: 44, y: -130 }, hipY: S_HIP + 8, shoulderY: S_SHOULDER + 8, headY: S_HEAD + 8, bodyLean: 0.08, twist: -0.3, sx: 1.06, sy: 0.96 }, ease: 'outCubic' },
    { t: 0.95, hand: 'fist', joints: { armF: { x: 40, y: -124 }, hipY: S_HIP + 10, shoulderY: S_SHOULDER + 10, headY: S_HEAD + 10, twist: -0.36 }, ease: 'outQuad' },
    { t: 1.15, hand: 'fist', joints: { armF: { x: 70, y: -232 }, legF: { x: 24, y: -20 }, hipY: S_HIP - 20, shoulderY: S_SHOULDER - 28, headY: S_HEAD - 30, bodyLean: -0.1, twist: 0.3, hipTwist: 0.15, sx: 0.9, sy: 1.12 }, ease: 'outBack', smear: true },
    { t: 2,    hand: 'fist', joints: { armF: { x: 70, y: -228 } }, hold: true },
    { t: 2.55, hand: 'fist', joints: { armF: { x: 72, y: -224 }, legF: { x: 21, y: 0 }, hipY: S_HIP - 4, shoulderY: S_SHOULDER - 6, headY: S_HEAD - 9, bodyLean: -0.08, twist: 0.12, hipTwist: 0.05, sx: 1, sy: 1.02 }, ease: 'outQuad' },
    { t: 3,    hand: 'open', joints: SHOW_AT, ease: 'inOutCubic' },
  ]),
};

// A shoulder roll, Elo's from 2D: the lead arm dropped low across the belly,
// the rear fist parked at the chin, chin up, weight back. The guard of
// someone who thinks you are not worth putting his hands up for.
const ROLL_F = { x: 30, y: -112 };
const ROLL_B = { x: 40, y: -160 };
const R_HIP = -84, R_SHOULDER = -152, R_HEAD = -180;   // REST, the head raised by the stance

// The guard: where each of this form's tracks starts and ends.
const ROLL_AT = { armF: ROLL_F, armB: ROLL_B, hipY: R_HIP, shoulderY: R_SHOULDER, headY: R_HEAD,
  headX: 2, bodyLean: -0.04, twist: 0, hipTwist: 0, sx: 1, sy: 1, legF: { x: 20, y: 0 }, legB: { x: -23, y: 0 } };

// The whip, a glass cannon's: power out of no mass. The low lead fist is
// drawn back past his hip and the body coils away with it, a huge wind-up
// anyone can read, then it whips up and out at the head, the body snapping
// round behind it, and is held out only as long as it can hit before it is
// snapped back home at once, which is why he is so punishable. The rear
// fist stays at his chin.
const WHIP = {
  own: true,
  keys: carried([
    { t: 0,    joints: ROLL_AT },
    // the wind-up, the fist back past the hip and the body coiled away
    { t: 0.55, joints: { armF: { x: -4, y: -116 }, headX: -1, bodyLean: -0.1, twist: -0.45, hipTwist: -0.2, sx: 1.02, sy: 0.98 }, ease: 'outCubic' },
    { t: 0.95, joints: { armF: { x: -12, y: -120 }, headX: -2, bodyLean: -0.12, twist: -0.55, hipTwist: -0.25, sx: 1.03, sy: 0.97 }, ease: 'outQuad' },
    // the whip, up and out at the head, the body snapping round behind it
    { t: 1.15, joints: { armF: { x: 102, y: -160 }, hipY: R_HIP + 1, headX: 5, bodyLean: 0.12, twist: 0.36, hipTwist: 0.18, sx: 0.98, sy: 1.02, legB: { x: -20, y: 0 } }, ease: 'outBack', smear: true },
    { t: 2,    joints: { armF: { x: 98, y: -158 }, bodyLean: 0.1, twist: 0.32, hipTwist: 0.16 }, hold: true },
    // and snapped straight back home
    { t: 2.3,  joints: { armF: { x: 36, y: -116 }, hipY: R_HIP, headX: 2, bodyLean: -0.03, twist: 0.04, hipTwist: 0.02, sx: 1, sy: 1, legB: { x: -23, y: 0 } }, ease: 'outCubic' },
    { t: 3,    joints: { armF: ROLL_F, bodyLean: -0.04, twist: 0, hipTwist: 0 }, ease: 'inOutCubic' },
  ]),
};

// The roundhouse, the whip with a leg: power out of no mass again. The lead
// knee is coiled up with the body turned well away (drawn back across him,
// the leg was hidden behind him and he seemed only to stand there), the
// dropped lead arm swinging back as he winds, then the leg whips round at the
// head with the body snapping round behind it, and is snapped straight home
// the moment it has landed.
const ROLL_KICK = {
  own: true,
  keys: carried([
    { t: 0,    joints: ROLL_AT },
    { t: 0.55, joints: { legF: { x: 22, y: -48 }, armF: { x: 24, y: -120 }, bodyLean: -0.08, twist: -0.35, hipTwist: -0.3 }, ease: 'outCubic' },
    { t: 0.95, joints: { legF: { x: 18, y: -64 }, bodyLean: -0.1, twist: -0.45, hipTwist: -0.36 }, ease: 'outQuad' },
    // the whip
    { t: 1.15, joints: { legF: { x: 108, y: -88 }, legB: { x: -20, y: 0 }, armF: { x: 10, y: -118 }, hipY: R_HIP - 6, bodyLean: -0.16, twist: 0.4, hipTwist: 0.45, sx: 0.95, sy: 1.06 }, ease: 'outBack', smear: true },
    { t: 2,    joints: { legF: { x: 104, y: -86 }, twist: 0.36, hipTwist: 0.4 }, hold: true },
    // snapped home
    { t: 2.3,  joints: { legF: { x: 34, y: -30 }, legB: { x: -23, y: 0 }, armF: { x: 30, y: -112 }, hipY: R_HIP, bodyLean: -0.04, twist: 0.04, hipTwist: 0.04, sx: 1, sy: 1 }, ease: 'outCubic' },
    { t: 3,    joints: ROLL_AT, ease: 'inOutCubic' },
  ]),
};

// A backhand off the dropped lead hand, the shoulder roll's insult: the low
// hand opens and flicks up and out at the face with a roll of the shoulder,
// and is back down at his belly at once.
const ROLL_SLAP = {
  own: true,
  keys: carried([
    { t: 0,    hand: 'fist', joints: ROLL_AT },
    { t: 0.55, hand: 'open', joints: { armF: { x: 24, y: -120 }, twist: -0.1 }, ease: 'outCubic' },
    { t: 0.95, hand: 'open', joints: { armF: { x: 20, y: -124 }, twist: -0.14 }, ease: 'outQuad' },
    { t: 1.15, hand: 'open', joints: { armF: { x: 100, y: -158 }, headX: 3, bodyLean: 0.04, twist: 0.2, hipTwist: 0.06 }, ease: 'outBack', smear: true },
    { t: 2,    hand: 'open', joints: { armF: { x: 96, y: -156 } }, hold: true },
    { t: 2.3,  hand: 'open', joints: { armF: { x: 36, y: -116 }, headX: 2, bodyLean: -0.03, twist: 0.02, hipTwist: 0.01 }, ease: 'outCubic' },
    { t: 3,    hand: 'fist', joints: ROLL_AT, ease: 'inOutCubic' },
  ]),
};

// The uppercut comes naturally off his low lead hand: a turn away, then the
// fist whips straight up the middle with the whole body snapping round
// behind it, and is snapped home the moment it has landed.
const ROLL_UPPER = {
  own: true,
  keys: carried([
    { t: 0,    joints: ROLL_AT },
    { t: 0.55, joints: { armF: { x: 26, y: -108 }, hipY: R_HIP + 6, shoulderY: R_SHOULDER + 6, headY: R_HEAD + 6, bodyLean: 0.06, twist: -0.3, hipTwist: -0.15 }, ease: 'outCubic' },
    { t: 0.95, joints: { armF: { x: 24, y: -104 }, twist: -0.38, hipTwist: -0.2 }, ease: 'outQuad' },
    { t: 1.15, joints: { armF: { x: 68, y: -222 }, hipY: R_HIP - 14, shoulderY: R_SHOULDER - 20, headY: R_HEAD - 20, bodyLean: -0.08, twist: 0.38, hipTwist: 0.2, sx: 0.92, sy: 1.1 }, ease: 'outBack', smear: true },
    { t: 2,    joints: { armF: { x: 66, y: -218 } }, hold: true },
    { t: 2.3,  joints: { armF: { x: 32, y: -114 }, hipY: R_HIP, shoulderY: R_SHOULDER, headY: R_HEAD, bodyLean: -0.04, twist: 0.04, hipTwist: 0.02, sx: 1, sy: 1 }, ease: 'outCubic' },
    { t: 3,    joints: ROLL_AT, ease: 'inOutCubic' },
  ]),
};

// The fence, Scam's from 2D: one hand in his pocket, the other up open-palmed
// in front of his chest, the placating gesture of a man explaining why it
// was fine, and also, quietly, a fence that keeps you at arm's length.
const FENCE_F = { x: 60, y: -146 };
const FENCE_B = { x: -6, y: -104 };
const F_HIP = -84, F_SHOULDER = -154, F_HEAD = -178;   // REST, the shoulders raised by the stance
// the head as far forward as the stance puts it, its own 3 on top of REST's 2
// (keyed at 3, it jumped 2 px back on the first frame of every slip)
const F_HEADX = 5;

// The guard: where each of this form's tracks starts and ends.
const FENCE_AT = { armF: FENCE_F, armB: FENCE_B, hipY: F_HIP, shoulderY: F_SHOULDER, headY: F_HEAD,
  headX: F_HEADX, bodyLean: 0.04, twist: 0, hipTwist: 0, sx: 1, sy: 1, legF: { x: 22, y: 0 }, legB: { x: -17, y: 0 } };

// The slip: understated on the way in, lingering on the way out. The open
// hand barely draws in, so it reads as less than it is, closes only as it
// lands, and stays out after the hit, unhurried, before it opens again
// into the same placating hand. The other hand never leaves his pocket.
const SLIP = {
  own: true,
  keys: carried([
    { t: 0,    hand: 'open', joints: FENCE_AT },
    // barely any wind-up
    { t: 0.6,  hand: 'open', joints: { armF: { x: 56, y: -147 }, bodyLean: 0.03, twist: -0.04 }, ease: 'outQuad' },
    { t: 0.95, hand: 'open', joints: { armF: { x: 54, y: -148 }, bodyLean: 0.03, twist: -0.06, hipTwist: -0.03 }, ease: 'outQuad' },
    // the hand closing as it lands
    { t: 1.15, hand: 'fist', joints: { armF: { x: 100, y: -150 }, headX: F_HEADX + 2, bodyLean: 0.12, twist: 0.2, hipTwist: 0.08, legB: { x: -15, y: 0 } }, ease: 'outBack', smear: true },
    { t: 2,    hand: 'fist', joints: { armF: { x: 98, y: -150 }, bodyLean: 0.11, twist: 0.18 }, hold: true },
    // and lingering out there
    { t: 2.6,  hand: 'fist', joints: { armF: { x: 90, y: -149 }, headX: F_HEADX + 1, bodyLean: 0.08, twist: 0.12, hipTwist: 0.05 }, ease: 'outQuad' },
    { t: 3,    hand: 'open', joints: { armF: FENCE_F, headX: F_HEADX, bodyLean: 0.04, twist: 0, hipTwist: 0, legB: { x: -17, y: 0 } }, ease: 'inOutCubic' },
  ]),
};

// The fence's kick is a push to keep you at arm's length: hardly any lift,
// the foot set flat into your middle, unhurried, the open hand still out in
// front of him and the other still in his pocket, and left out there a moment
// after, as if to say there is no need for any of this.
const FENCE_KICK = {
  own: true,
  keys: carried([
    { t: 0,    hand: 'open', joints: FENCE_AT },
    { t: 0.6,  hand: 'open', joints: { legF: { x: 28, y: -36 }, bodyLean: 0.02 }, ease: 'outQuad' },
    { t: 0.95, hand: 'open', joints: { legF: { x: 30, y: -46 }, bodyLean: 0 }, ease: 'outQuad' },
    { t: 1.15, hand: 'open', joints: { legF: { x: 98, y: -70 }, legB: { x: -18, y: 0 }, hipY: F_HIP - 4, headX: F_HEADX + 1, bodyLean: -0.06, twist: 0.04, hipTwist: 0.06 }, ease: 'outCubic', smear: true },
    { t: 2,    hand: 'open', joints: { legF: { x: 96, y: -68 } }, hold: true },
    // and lingering out there
    { t: 2.6,  hand: 'open', joints: { legF: { x: 70, y: -50 }, legB: { x: -17, y: 0 }, hipY: F_HIP - 2, headX: F_HEADX, bodyLean: -0.02, twist: 0.02, hipTwist: 0.02 }, ease: 'outQuad' },
    { t: 3,    hand: 'open', joints: FENCE_AT, ease: 'inOutCubic' },
  ]),
};

// The fence's slap is barely one: the open hand that was out already pats
// you across the face, unhurried, and stays there a moment, placating.
const FENCE_SLAP = {
  own: true,
  keys: carried([
    { t: 0,    hand: 'open', joints: FENCE_AT },
    { t: 0.6,  hand: 'open', joints: { armF: { x: 56, y: -152 }, bodyLean: 0.03 }, ease: 'outQuad' },
    { t: 0.95, hand: 'open', joints: { armF: { x: 54, y: -154 }, twist: -0.04 }, ease: 'outQuad' },
    { t: 1.15, hand: 'open', joints: { armF: { x: 96, y: -150 }, headX: F_HEADX + 1, bodyLean: 0.1, twist: 0.1, hipTwist: 0.04 }, ease: 'outCubic', smear: true },
    { t: 2,    hand: 'open', joints: { armF: { x: 94, y: -150 } }, hold: true },
    { t: 2.6,  hand: 'open', joints: { armF: { x: 88, y: -150 }, headX: F_HEADX, bodyLean: 0.08, twist: 0.06, hipTwist: 0.02 }, ease: 'outQuad' },
    { t: 3,    hand: 'open', joints: FENCE_AT, ease: 'inOutCubic' },
  ]),
};

// His launcher is a palm lifted under your chin, as if helping you up: no
// wind-up to speak of, the body rising a little with it, and the hand left
// there after.
const FENCE_UPPER = {
  own: true,
  keys: carried([
    { t: 0,    hand: 'open', joints: FENCE_AT },
    { t: 0.6,  hand: 'open', joints: { armF: { x: 56, y: -130 }, hipY: F_HIP + 4, shoulderY: F_SHOULDER + 4, headY: F_HEAD + 4 }, ease: 'outQuad' },
    { t: 0.95, hand: 'open', joints: { armF: { x: 54, y: -128 } }, ease: 'outQuad' },
    { t: 1.15, hand: 'open', joints: { armF: { x: 72, y: -210 }, hipY: F_HIP - 8, shoulderY: F_SHOULDER - 10, headY: F_HEAD - 10, bodyLean: 0, twist: 0.08, hipTwist: 0.03 }, ease: 'outCubic', smear: true },
    { t: 2,    hand: 'open', joints: { armF: { x: 72, y: -206 } }, hold: true },
    { t: 2.6,  hand: 'open', joints: { armF: { x: 70, y: -190 }, hipY: F_HIP - 3, shoulderY: F_SHOULDER - 4, headY: F_HEAD - 4, bodyLean: 0.02, twist: 0.04, hipTwist: 0.01 }, ease: 'outQuad' },
    { t: 3,    hand: 'open', joints: FENCE_AT, ease: 'inOutCubic' },
  ]),
};

// A fencer's guard, Lizbeth's from 2D, and the stillest in the game: narrow
// and upright, side on, the lead hand loose and forward at the chest and the
// rear one close behind it, as if holding something fragile.
const EN_F = { x: 54, y: -136 };
const EN_B = { x: 40, y: -142 };
const E_HIP = -84, E_SHOULDER = -152, E_HEAD = -181;   // REST, the head raised by the stance

// The guard: where each of this form's tracks starts and ends.
const EN_AT = { armF: EN_F, armB: EN_B, hipY: E_HIP, shoulderY: E_SHOULDER, headY: E_HEAD,
  headX: 2, bodyLean: 0.02, twist: 0, hipTwist: 0, sx: 1, sy: 1.02, legF: { x: 17, y: 0 }, legB: { x: -17, y: 0 } };

// The thrust: economical to the point of eerie. The hand barely draws back,
// then goes straight out along its own line, fingers first, the lead foot
// stepping after it and nothing in the hips; it comes straight back the way
// it went. The hand never closes: nothing about it admits effort.
const THRUST = {
  own: true,
  keys: carried([
    { t: 0,    hand: 'open', joints: EN_AT },
    { t: 0.6,  hand: 'open', joints: { armF: { x: 50, y: -137 } }, ease: 'outQuad' },
    { t: 0.95, hand: 'open', joints: { armF: { x: 48, y: -137 }, bodyLean: 0.01 }, ease: 'outQuad' },
    // straight out along the line, the lead foot after it
    { t: 1.15, hand: 'open', joints: { armF: { x: 106, y: -140 }, headX: 3, bodyLean: 0.08, twist: 0.08, legF: { x: 29, y: 0 } }, ease: 'outCubic', smear: true },
    { t: 2,    hand: 'open', joints: { armF: { x: 104, y: -140 } }, hold: true },
    // and straight back the way it went
    { t: 2.45, hand: 'open', joints: { armF: { x: 62, y: -137 }, headX: 2, bodyLean: 0.03, twist: 0.01, legF: { x: 18, y: 0 } }, ease: 'inOutCubic' },
    { t: 3,    hand: 'open', joints: { armF: EN_F, bodyLean: 0.02, twist: 0, legF: { x: 17, y: 0 } }, ease: 'inOutCubic' },
  ]),
};

// A fencer's kick is the thrust again: the knee barely bends before the
// foot goes straight out along its own line, low and level, nothing in the
// hips, and straight back the way it went. The hands stay where they were.
const EN_KICK = {
  own: true,
  keys: carried([
    { t: 0,    hand: 'open', joints: EN_AT },
    { t: 0.6,  hand: 'open', joints: { legF: { x: 24, y: -30 } }, ease: 'outQuad' },
    { t: 0.95, hand: 'open', joints: { legF: { x: 26, y: -40 } }, ease: 'outQuad' },
    // straight out along the line
    { t: 1.15, hand: 'open', joints: { legF: { x: 106, y: -76 }, hipY: E_HIP - 4, bodyLean: -0.04 }, ease: 'outCubic', smear: true },
    { t: 2,    hand: 'open', joints: { legF: { x: 104, y: -76 } }, hold: true },
    // and straight back
    { t: 2.45, hand: 'open', joints: { legF: { x: 40, y: -36 }, hipY: E_HIP - 1, bodyLean: 0 }, ease: 'inOutCubic' },
    { t: 3,    hand: 'open', joints: EN_AT, ease: 'inOutCubic' },
  ]),
};

// Her slap is a flick of the fingers along a line at the face, the least
// motion that will do it, and straight back.
const EN_SLAP = {
  own: true,
  keys: carried([
    { t: 0,    hand: 'open', joints: EN_AT },
    { t: 0.6,  hand: 'open', joints: { armF: { x: 50, y: -140 } }, ease: 'outQuad' },
    { t: 0.95, hand: 'open', joints: { armF: { x: 48, y: -142 } }, ease: 'outQuad' },
    { t: 1.15, hand: 'open', joints: { armF: { x: 104, y: -148 }, headX: 3, bodyLean: 0.06, twist: 0.04 }, ease: 'outCubic', smear: true },
    { t: 2,    hand: 'open', joints: { armF: { x: 102, y: -148 } }, hold: true },
    { t: 2.45, hand: 'open', joints: { armF: { x: 60, y: -140 }, headX: 2, bodyLean: 0.03, twist: 0.01 }, ease: 'inOutCubic' },
    { t: 3,    hand: 'open', joints: EN_AT, ease: 'inOutCubic' },
  ]),
};

// Her launcher is the thrust turned upward: the hand goes straight up from
// the guard along a line, fingers first, the body rising only as far as it
// must, and straight back down.
const EN_UPPER = {
  own: true,
  keys: carried([
    { t: 0,    hand: 'open', joints: EN_AT },
    { t: 0.6,  hand: 'open', joints: { armF: { x: 54, y: -130 }, hipY: E_HIP + 3, shoulderY: E_SHOULDER + 3, headY: E_HEAD + 3 }, ease: 'outQuad' },
    { t: 0.95, hand: 'open', joints: { armF: { x: 54, y: -128 } }, ease: 'outQuad' },
    { t: 1.15, hand: 'open', joints: { armF: { x: 74, y: -220 }, hipY: E_HIP - 6, shoulderY: E_SHOULDER - 8, headY: E_HEAD - 8, bodyLean: -0.02 }, ease: 'outCubic', smear: true },
    { t: 2,    hand: 'open', joints: { armF: { x: 74, y: -218 } }, hold: true },
    { t: 2.45, hand: 'open', joints: { armF: { x: 60, y: -160 }, hipY: E_HIP - 1, shoulderY: E_SHOULDER - 1, headY: E_HEAD - 1, bodyLean: 0.01 }, ease: 'inOutCubic' },
    { t: 3,    hand: 'open', joints: EN_AT, ease: 'inOutCubic' },
  ]),
};

// A peek-a-boo guard, Kim's from 2D, the most compact outline in the game:
// crouched in and leaning forward, both fists high and tight in front of the
// jaw with the elbows tucked, the face just above them (over the face, the
// fists hid the one thing her character is about).
const PEEK_F = { x: 54, y: -150 };
const PEEK_B = { x: 43, y: -154 };
const K_HIP = -70, K_SHOULDER = -142, K_HEAD = -165;   // REST lowered by the coiled stance and hers

// The guard: where each of this form's tracks starts and ends.
const PEEK_AT = { armF: PEEK_F, armB: PEEK_B, hipY: K_HIP, shoulderY: K_SHOULDER, headY: K_HEAD,
  headX: 2, bodyLean: 0.18, twist: 0, hipTwist: 0, sx: 0.97, sy: 1, legF: { x: 22, y: 0 }, legB: { x: -20, y: 0 } };

// The snap: the shortest wind-up and the fastest reset in the game. She dips
// under the line first, the head and the knees bobbing down together and
// the fists staying at the jaw, then comes up out of the dip with the jab
// already out, straight from the chin, and has it back at the jaw before you
// have registered it left, the head slipping off the line again as it
// comes home.
const SNAP = {
  own: true,
  keys: carried([
    { t: 0,    joints: PEEK_AT },
    // the bob, under the line, the fists going down with the head
    { t: 0.6,  joints: { armF: { x: 52, y: -146 }, armB: { x: 42, y: -150 }, hipY: K_HIP + 5, shoulderY: K_SHOULDER + 5, headY: K_HEAD + 7, headX: 0, bodyLean: 0.24, twist: -0.06, hipTwist: -0.03, sx: 1, sy: 0.97 }, ease: 'outQuad' },
    { t: 0.95, joints: { armF: { x: 51, y: -145 }, armB: { x: 42, y: -149 }, hipY: K_HIP + 6, shoulderY: K_SHOULDER + 6, headY: K_HEAD + 9, bodyLean: 0.25, twist: -0.08, hipTwist: -0.04, sx: 1.01, sy: 0.96 }, ease: 'outQuad' },
    // up out of it with the jab already there
    { t: 1.15, joints: { armF: { x: 102, y: -158 }, armB: PEEK_B, hipY: K_HIP - 1, shoulderY: K_SHOULDER, headY: K_HEAD + 2, headX: 4, bodyLean: 0.24, twist: 0.22, hipTwist: 0.1, sx: 0.96, sy: 1.03, legB: { x: -18, y: 0 } }, ease: 'outBack', smear: true },
    { t: 2,    joints: { armF: { x: 100, y: -158 }, bodyLean: 0.23, twist: 0.2, hipTwist: 0.09 }, hold: true },
    // back at the jaw at once, the head slipping off the line
    { t: 2.25, joints: { armF: { x: 58, y: -151 }, hipY: K_HIP + 1, headY: K_HEAD + 3, headX: -1, bodyLean: 0.2, twist: -0.05, hipTwist: -0.02, sx: 0.98, sy: 1, legB: { x: -20, y: 0 } }, ease: 'outCubic' },
    { t: 3,    joints: { armF: PEEK_F, hipY: K_HIP, headY: K_HEAD, headX: 2, bodyLean: 0.18, twist: 0, hipTwist: 0, sx: 0.97 }, ease: 'inOutCubic' },
  ]),
};

// The snap kick: the least chamber in the game, the fists never leaving her
// jaw. The head bobs down as the knee comes up, the shin snaps out at the
// middle and is back on the floor before you have registered it left, the
// head slipping off the line on the way home, as her jab does.
const PEEK_KICK = {
  own: true,
  keys: carried([
    { t: 0,    joints: PEEK_AT },
    { t: 0.6,  joints: { legF: { x: 30, y: -40 }, hipY: K_HIP - 1, headY: K_HEAD + 2, bodyLean: 0.14 }, ease: 'outQuad' },
    { t: 0.95, joints: { legF: { x: 32, y: -50 }, bodyLean: 0.1 }, ease: 'outQuad' },
    { t: 1.15, joints: { legF: { x: 100, y: -78 }, legB: { x: -20, y: 0 }, hipY: K_HIP - 6, headY: K_HEAD, bodyLean: -0.04, twist: 0.1, hipTwist: 0.16, sx: 0.95, sy: 1.04 }, ease: 'outBack', smear: true },
    { t: 2,    joints: { legF: { x: 98, y: -76 } }, hold: true },
    // home at once, the head off the line
    { t: 2.25, joints: { legF: { x: 36, y: -28 }, hipY: K_HIP, headX: 0, bodyLean: 0.14, twist: 0, hipTwist: 0, sx: 0.97, sy: 1 }, ease: 'outCubic' },
    { t: 3,    joints: PEEK_AT, ease: 'inOutCubic' },
  ]),
};

// Kim's slap is contempt in one flick: the hand opens beside her ear as she
// bobs, cracks across the face and is back at her jaw, a fist again, before
// you have registered it left.
const PEEK_SLAP = {
  own: true,
  keys: carried([
    { t: 0,    hand: 'fist', joints: PEEK_AT },
    { t: 0.6,  hand: 'open', joints: { armF: { x: 48, y: -160 }, headY: K_HEAD + 4, bodyLean: 0.2, twist: -0.06 }, ease: 'outQuad' },
    { t: 0.95, hand: 'open', joints: { armF: { x: 46, y: -164 }, twist: -0.08 }, ease: 'outQuad' },
    { t: 1.15, hand: 'open', joints: { armF: { x: 98, y: -150 }, headY: K_HEAD, headX: 4, bodyLean: 0.24, twist: 0.16, hipTwist: 0.06 }, ease: 'outBack', smear: true },
    { t: 2,    hand: 'open', joints: { armF: { x: 96, y: -150 } }, hold: true },
    { t: 2.25, hand: 'open', joints: { armF: { x: 56, y: -152 }, headX: 0, bodyLean: 0.18, twist: 0, hipTwist: 0 }, ease: 'outCubic' },
    { t: 3,    hand: 'fist', joints: PEEK_AT, ease: 'inOutCubic' },
  ]),
};

// The peek-a-boo uppercut: the deepest bob she has, then up out of it like
// a spring, the fist driving up past the chin and her feet nearly leaving
// the floor, and back down into the guard at once.
const PEEK_UPPER = {
  own: true,
  keys: carried([
    { t: 0,    joints: PEEK_AT },
    { t: 0.6,  joints: { armF: { x: 48, y: -134 }, hipY: K_HIP + 10, shoulderY: K_SHOULDER + 10, headY: K_HEAD + 12, bodyLean: 0.26, twist: -0.12, sx: 1.02, sy: 0.95 }, ease: 'outQuad' },
    { t: 0.95, joints: { armF: { x: 46, y: -130 }, hipY: K_HIP + 12, shoulderY: K_SHOULDER + 12, headY: K_HEAD + 14, twist: -0.16 }, ease: 'outQuad' },
    { t: 1.15, joints: { armF: { x: 66, y: -214 }, legF: { x: 24, y: -14 }, hipY: K_HIP - 16, shoulderY: K_SHOULDER - 22, headY: K_HEAD - 22, bodyLean: 0.02, twist: 0.24, hipTwist: 0.16, sx: 0.92, sy: 1.1 }, ease: 'outBack', smear: true },
    { t: 2,    joints: { armF: { x: 64, y: -210 } }, hold: true },
    { t: 2.25, joints: { armF: { x: 56, y: -152 }, legF: { x: 22, y: 0 }, hipY: K_HIP, shoulderY: K_SHOULDER, headY: K_HEAD, headX: 0, bodyLean: 0.18, twist: 0, hipTwist: 0, sx: 0.97, sy: 1 }, ease: 'outCubic' },
    { t: 3,    joints: PEEK_AT, ease: 'inOutCubic' },
  ]),
};

// A tai chi ready stance, Cathie's from 2D, the calmest in the game: upright
// and tall, the lead palm open and level in front of the chest where it can
// keep you away, the rear hand low at the waist with the tablet, breathing
// slowly.
const CALM_F = { x: 66, y: -140 };
const CALM_B = { x: 42, y: -116 };
const T_HIP = -88, T_SHOULDER = -152, T_HEAD = -184;   // REST, the head raised by the stance

// The guard: where each of this form's tracks starts and ends.
const CALM_AT = { armF: CALM_F, armB: CALM_B, hipY: T_HIP, shoulderY: T_SHOULDER, headY: T_HEAD,
  headX: 2, bodyLean: -0.02, twist: 0, hipTwist: 0, sx: 1, sy: 1.04, legF: { x: 19, y: 0 }, legB: { x: -19, y: 0 } };

// The push: nothing is thrown, everything is placed. The palm draws in to
// the chest as the weight settles back, then goes out level and unhurried,
// the weight moving forward behind it and the body upright, the hips all
// but still and no turn of the shoulders; it rests out there, and comes back
// the way it went. The hand stays open throughout; the tablet stays low.
const PUSH = {
  own: true,
  keys: carried([
    { t: 0,    hand: 'open', joints: CALM_AT },
    // gathering: the palm drawn in, the weight settling back
    { t: 0.6,  hand: 'open', joints: { armF: { x: 56, y: -142 }, hipY: T_HIP + 2, headX: 0, bodyLean: -0.05 }, ease: 'inOutCubic' },
    { t: 0.95, hand: 'open', joints: { armF: { x: 52, y: -142 }, hipY: T_HIP + 3, headX: -1, bodyLean: -0.06 }, ease: 'inOutCubic' },
    // placed: out level, the weight forward behind it
    { t: 1.15, hand: 'open', joints: { armF: { x: 108, y: -142 }, hipY: T_HIP + 2, headX: 4, bodyLean: 0.06, twist: 0.04 }, ease: 'outCubic' },
    { t: 2,    hand: 'open', joints: { armF: { x: 106, y: -142 }, headX: 4, bodyLean: 0.06, twist: 0.04 }, hold: true },
    // and back the way it went
    { t: 2.55, hand: 'open', joints: { armF: { x: 78, y: -141 }, hipY: T_HIP + 1, headX: 3, bodyLean: 0.01, twist: 0.02 }, ease: 'inOutCubic' },
    { t: 3,    hand: 'open', joints: { armF: CALM_F, hipY: T_HIP, headX: 2, bodyLean: -0.02, twist: 0 }, ease: 'inOutCubic' },
  ]),
};

// A heel kick, placed like the push: the knee lifts slowly as the arms open
// out, the palm forward and the tablet hand back, upright and balanced on
// one leg, then the heel is pressed out level, without hurry and without a
// turn of the hips, and drawn back the way it went.
const CALM_KICK = {
  own: true,
  keys: carried([
    { t: 0,    hand: 'open', joints: CALM_AT },
    { t: 0.6,  hand: 'open', joints: { legF: { x: 34, y: -54 }, armF: { x: 78, y: -150 }, armB: { x: 30, y: -128 } }, ease: 'inOutCubic' },
    { t: 0.95, hand: 'open', joints: { legF: { x: 36, y: -62 }, bodyLean: -0.03 }, ease: 'inOutCubic' },
    // pressed out, level
    { t: 1.15, hand: 'open', joints: { legF: { x: 106, y: -78 }, legB: { x: -19, y: 0 }, armF: { x: 88, y: -150 }, hipY: T_HIP - 6, bodyLean: -0.06 }, ease: 'outCubic' },
    { t: 2,    hand: 'open', joints: { legF: { x: 104, y: -78 } }, hold: true },
    // and drawn back the way it went
    { t: 2.55, hand: 'open', joints: { legF: { x: 50, y: -44 }, armF: { x: 74, y: -144 }, armB: { x: 36, y: -122 }, hipY: T_HIP - 2, bodyLean: -0.03 }, ease: 'inOutCubic' },
    { t: 3,    hand: 'open', joints: CALM_AT, ease: 'inOutCubic' },
  ]),
};

// Her slap is a palm placed at the face, rising a little on its way as if
// it were following a circle, without hurry and without a turn of the hips.
const CALM_SLAP = {
  own: true,
  keys: carried([
    { t: 0,    hand: 'open', joints: CALM_AT },
    { t: 0.6,  hand: 'open', joints: { armF: { x: 60, y: -160 } }, ease: 'inOutCubic' },
    { t: 0.95, hand: 'open', joints: { armF: { x: 56, y: -164 }, bodyLean: -0.03 }, ease: 'inOutCubic' },
    { t: 1.15, hand: 'open', joints: { armF: { x: 106, y: -150 }, headX: 3, bodyLean: 0.06 }, ease: 'outCubic' },
    { t: 2,    hand: 'open', joints: { armF: { x: 104, y: -150 } }, hold: true },
    { t: 2.55, hand: 'open', joints: { armF: { x: 78, y: -148 }, headX: 2, bodyLean: 0.01 }, ease: 'inOutCubic' },
    { t: 3,    hand: 'open', joints: CALM_AT, ease: 'inOutCubic' },
  ]),
};

// Her launcher lifts: she sinks a little, then the lead palm rises slowly up
// under the chin as she comes up onto her toes, the tablet hand rising a
// little with it, and settles back the way it came.
const CALM_UPPER = {
  own: true,
  keys: carried([
    { t: 0,    hand: 'open', joints: CALM_AT },
    { t: 0.6,  hand: 'open', joints: { armF: { x: 60, y: -128 }, hipY: T_HIP + 4, shoulderY: T_SHOULDER + 4, headY: T_HEAD + 4 }, ease: 'inOutCubic' },
    { t: 0.95, hand: 'open', joints: { armF: { x: 58, y: -124 }, hipY: T_HIP + 6, shoulderY: T_SHOULDER + 6, headY: T_HEAD + 6 }, ease: 'inOutCubic' },
    { t: 1.15, hand: 'open', joints: { armF: { x: 78, y: -212 }, armB: { x: 44, y: -126 }, hipY: T_HIP - 10, shoulderY: T_SHOULDER - 12, headY: T_HEAD - 12, bodyLean: -0.04 }, ease: 'outCubic' },
    { t: 2,    hand: 'open', joints: { armF: { x: 78, y: -210 } }, hold: true },
    { t: 2.55, hand: 'open', joints: { armF: { x: 74, y: -170 }, armB: { x: 42, y: -118 }, hipY: T_HIP - 3, shoulderY: T_SHOULDER - 3, headY: T_HEAD - 3, bodyLean: -0.03 }, ease: 'inOutCubic' },
    { t: 3,    hand: 'open', joints: CALM_AT, ease: 'inOutCubic' },
  ]),
};

// ---------------------------------------------------------------- signatures
// Each fighter's own signature special, in their form (FORMS `specials`, by
// the special's id). Until these, a signature special played the basic its
// kind borrows (data/tracks.js ATTACK_TRACK): Kim's GROWTH HACK rush was one
// punch held for half a second, Cathie's FUNDING ROUND a slap, and BURN IT
// ALL and SAME-DAY DELIVERY, whose kinds borrow nothing, the old computed
// swing. Written at the special's own reach (there is no nominal to scale
// from), on the same clock as every attack: wind-up 0 to 1, the special's
// active window 1 to 2, recovery 2 to 3, from the guard and back to it.

// SAME-DAY DELIVERY: he places the order. The lead hand goes up, open, then
// points the parcel down onto the rival's spot, and he leans in to watch it go.
const BOX_DELIVERY = {
  own: true,
  keys: carried([
    { t: 0,    hand: 'fist', joints: BOX_AT },
    { t: 0.5,  hand: 'open', joints: { armF: { x: 40, y: -228 }, bodyLean: 0.04, headX: 0, twist: -0.08 }, ease: 'outCubic' },
    { t: 0.95, hand: 'open', joints: { armF: { x: 44, y: -234 }, bodyLean: 0.02, twist: -0.1 }, ease: 'outQuad' },
    { t: 1.1,  hand: 'open', joints: { armF: { x: 106, y: -180 }, headX: 5, bodyLean: 0.18, twist: 0.2, hipTwist: 0.08 }, ease: 'outBack', smear: true },
    { t: 2,    hand: 'open', joints: { armF: { x: 104, y: -178 } }, hold: true },
    { t: 2.5,  hand: 'open', joints: { armF: { x: 70, y: -174 }, headX: 3, bodyLean: 0.14, twist: 0.06, hipTwist: 0.02 }, ease: 'outQuad' },
    { t: 3,    hand: 'fist', joints: BOX_AT, ease: 'inOutCubic' },
  ]),
};

// BURN IT ALL: both fists hauled up over his head, then brought down on you
// with everything, the step and the whole body behind them; winded after,
// bent over, before he straightens up.
const BRAWL_BURN = {
  own: true,
  keys: carried([
    { t: 0,    joints: BRAWL_AT },
    { t: 0.55, joints: { armF: { x: 30, y: -222 }, armB: { x: 10, y: -218 }, hipY: B_HIP - 4, headX: -2, bodyLean: -0.12, twist: -0.05, sx: 1, sy: 1.04 }, ease: 'outCubic' },
    { t: 0.95, joints: { armF: { x: 22, y: -230 }, armB: { x: 4, y: -226 }, bodyLean: -0.16, sy: 1.06 }, ease: 'outQuad' },
    { t: 1.12, joints: { armF: { x: 138, y: -112 }, armB: { x: 120, y: -116 }, hipY: B_HIP + 8, headX: 8, bodyLean: 0.5, twist: 0.04, sx: 1.1, sy: 0.92, legF: { x: 50, y: 0 }, legB: { x: -34, y: 0 } }, ease: 'outBack', smear: true },
    { t: 2,    joints: { armF: { x: 134, y: -110 }, armB: { x: 116, y: -114 } }, hold: true },
    { t: 2.5,  joints: { armF: { x: 72, y: -108 }, armB: { x: 52, y: -114 }, hipY: B_HIP + 4, headX: 6, bodyLean: 0.32, twist: 0, sx: 1.06, sy: 0.96, legF: { x: 40, y: 0 }, legB: { x: -32, y: 0 } }, ease: 'outQuad' },
    { t: 3,    joints: BRAWL_AT, ease: 'inOutCubic' },
  ]),
};

// HOSTILE TAKEOVER: he sinks and draws the open hand back, then lunges a long
// way after you; the hand closes on what it reaches and hauls it back to him.
// The briefcase stays in the rear hand throughout.
const GRAB_TAKEOVER = {
  own: true,
  keys: carried([
    { t: 0,    hand: 'open', joints: GRAB_AT },
    { t: 0.6,  hand: 'open', joints: { armF: { x: 40, y: -126 }, hipY: G_HIP + 6, bodyLean: 0.3, twist: -0.2, hipTwist: -0.1, sx: 1.08, sy: 0.92 }, ease: 'outCubic' },
    { t: 0.95, hand: 'open', joints: { armF: { x: 34, y: -124 }, hipY: G_HIP + 8, twist: -0.24 }, ease: 'outQuad' },
    { t: 1.1,  hand: 'open', joints: { armF: { x: 140, y: -126 }, headX: 8, bodyLean: 0.5, twist: 0.3, hipTwist: 0.15, legF: { x: 54, y: 0 }, legB: { x: -30, y: 0 } }, ease: 'outBack', smear: true },
    { t: 1.6,  hand: 'fist', joints: { armF: { x: 136, y: -124 } } },
    { t: 2,    hand: 'fist', joints: { armF: { x: 134, y: -124 } }, hold: true },
    { t: 2.45, hand: 'fist', joints: { armF: { x: 58, y: -132 }, hipY: G_HIP + 2, headX: 0, bodyLean: 0.14, twist: -0.18, hipTwist: -0.06, legF: { x: 36, y: 0 } }, ease: 'outCubic' },
    { t: 3,    hand: 'open', joints: GRAB_AT, ease: 'inOutCubic' },
  ]),
};

// PITCH DECK STRIKE: the presenting hand raised, then flicked at you once for
// each slide as it goes (the three leave 0.14 s apart, at 1, 1.3 and 1.6 of
// the clock), the tablet held in the other.
const SHOW_DECK = {
  own: true,
  keys: carried([
    { t: 0,    hand: 'open', joints: SHOW_AT },
    { t: 0.6,  hand: 'open', joints: { armF: { x: 40, y: -206 }, bodyLean: -0.12, twist: -0.15 }, ease: 'outCubic' },
    { t: 0.95, hand: 'open', joints: { armF: { x: 36, y: -210 }, twist: -0.18 }, ease: 'outQuad' },
    { t: 1.02, hand: 'open', joints: { armF: { x: 104, y: -170 }, bodyLean: 0, twist: 0.2 }, ease: 'outBack', smear: true },
    { t: 1.18, hand: 'open', joints: { armF: { x: 56, y: -196 }, twist: -0.1 }, ease: 'inOutCubic' },
    { t: 1.32, hand: 'open', joints: { armF: { x: 106, y: -168 }, twist: 0.22 }, ease: 'outBack', smear: true },
    { t: 1.48, hand: 'open', joints: { armF: { x: 56, y: -196 }, twist: -0.1 }, ease: 'inOutCubic' },
    { t: 1.62, hand: 'open', joints: { armF: { x: 108, y: -166 }, bodyLean: 0.02, twist: 0.24 }, ease: 'outBack', smear: true },
    { t: 2,    hand: 'open', joints: { armF: { x: 104, y: -166 } }, hold: true },
    { t: 2.5,  hand: 'open', joints: { armF: { x: 84, y: -172 }, bodyLean: -0.04, twist: 0.08 }, ease: 'outQuad' },
    { t: 3,    hand: 'open', joints: SHOW_AT, ease: 'inOutCubic' },
  ]),
};

// BURN RATE BLAST: he gathers himself, both fists drawn in low and the body
// wound away, then throws everything open at once, arms flung wide and the
// chest up, the inferno going out from him on all sides.
const ROLL_BLAST = {
  own: true,
  keys: carried([
    { t: 0,    hand: 'fist', joints: ROLL_AT },
    { t: 0.6,  hand: 'fist', joints: { armF: { x: 20, y: -110 }, armB: { x: 14, y: -118 }, hipY: R_HIP + 14, headX: 4, bodyLean: 0.2, twist: -0.3, hipTwist: -0.15, sx: 1.06, sy: 0.94 }, ease: 'outCubic' },
    { t: 0.95, hand: 'fist', joints: { armF: { x: 16, y: -106 }, armB: { x: 10, y: -114 }, hipY: R_HIP + 18, twist: -0.34, sx: 1.08, sy: 0.92 }, ease: 'outQuad' },
    { t: 1.1,  hand: 'open', joints: { armF: { x: 96, y: -190 }, armB: { x: -40, y: -186 }, hipY: R_HIP - 2, headX: -2, bodyLean: -0.14, twist: 0.1, hipTwist: 0, sx: 0.96, sy: 1.06 }, ease: 'outBack', smear: true },
    { t: 2,    hand: 'open', joints: { armF: { x: 98, y: -188 }, armB: { x: -42, y: -184 } }, hold: true },
    { t: 2.5,  hand: 'open', joints: { armF: { x: 48, y: -130 }, armB: { x: 30, y: -156 }, hipY: R_HIP + 2, headX: 1, bodyLean: -0.02, twist: 0.02, sx: 1, sy: 1 }, ease: 'outQuad' },
    { t: 3,    hand: 'fist', joints: ROLL_AT, ease: 'inOutCubic' },
  ]),
};

// PIVOT PUNCH: she turns away on the spot, the hands drawn in and closed, and
// comes out of the turn (and out of the air, behind you) in a lunge, fist
// first, along her line.
const EN_PIVOT = {
  own: true,
  keys: carried([
    { t: 0,    hand: 'open', joints: EN_AT },
    { t: 0.5,  hand: 'fist', joints: { armF: { x: 30, y: -150 }, armB: { x: 30, y: -150 }, bodyLean: -0.04, twist: -0.5, hipTwist: -0.35 }, ease: 'outCubic' },
    { t: 0.95, hand: 'fist', joints: { armF: { x: 24, y: -154 }, twist: -0.7, hipTwist: -0.5, sy: 1.04 }, ease: 'outQuad' },
    { t: 1.1,  hand: 'fist', joints: { armF: { x: 116, y: -150 }, armB: { x: 34, y: -146 }, hipY: E_HIP + 8, headX: 6, bodyLean: 0.16, twist: 0.3, hipTwist: 0.15, sy: 1, legF: { x: 44, y: 0 }, legB: { x: -34, y: 0 } }, ease: 'outBack', smear: true },
    { t: 2,    hand: 'fist', joints: { armF: { x: 112, y: -150 } }, hold: true },
    { t: 2.5,  hand: 'fist', joints: { armF: { x: 74, y: -140 }, armB: { x: 38, y: -144 }, hipY: E_HIP + 2, headX: 3, bodyLean: 0.06, twist: 0.06, hipTwist: 0.02, sy: 1.02, legF: { x: 26, y: 0 }, legB: { x: -22, y: 0 } }, ease: 'outQuad' },
    { t: 3,    hand: 'open', joints: EN_AT, ease: 'inOutCubic' },
  ]),
};

// GROWTH HACK: she drops into a deep crouch, then comes in on a run throwing
// both hands in turn, the body weaving from side to side behind them, eight
// punches across the rush (four of which the game counts as hits).
const PEEK_IN = { armF: { x: 96, y: -140 }, armB: { x: 38, y: -150 }, twist: 0.25, legF: { x: 34, y: -6 }, legB: { x: -18, y: 0 } };
const PEEK_OUT = { armF: { x: 50, y: -148 }, armB: { x: 92, y: -136 }, twist: -0.25, legF: { x: 18, y: 0 }, legB: { x: -26, y: -6 } };
const PEEK_RUSH = {
  own: true,
  keys: carried([
    { t: 0,    joints: PEEK_AT },
    { t: 0.6,  joints: { armF: { x: 48, y: -146 }, armB: { x: 40, y: -150 }, hipY: K_HIP + 8, bodyLean: 0.3, twist: -0.15, sx: 1, sy: 0.94 }, ease: 'outCubic' },
    { t: 0.95, joints: { hipY: K_HIP + 10, bodyLean: 0.34, twist: -0.2 }, ease: 'outQuad' },
    ...[1.06, 1.19, 1.31, 1.44, 1.56, 1.69, 1.81, 1.94].map((t, i) => ({ t, joints: i % 2 ? PEEK_OUT : PEEK_IN, ease: 'outCubic' })),
    { t: 2,    joints: PEEK_OUT, hold: true },
    { t: 2.4,  joints: { armF: { x: 60, y: -150 }, armB: { x: 44, y: -154 }, hipY: K_HIP + 4, bodyLean: 0.22, twist: 0, sy: 0.98, legF: { x: 22, y: 0 }, legB: { x: -20, y: 0 } }, ease: 'outQuad' },
    { t: 3,    joints: PEEK_AT, ease: 'inOutCubic' },
  ]),
};

// FUNDING ROUND: she lifts the lead hand slowly, palm up, high over her head,
// then sweeps it out over you and lets it rain, the tablet raised a little in
// the other as if reading the terms.
const CALM_ROUND = {
  own: true,
  keys: carried([
    { t: 0,    hand: 'open', joints: CALM_AT },
    { t: 0.5,  hand: 'open', joints: { armF: { x: 50, y: -190 }, armB: { x: 40, y: -130 }, hipY: T_HIP - 2, bodyLean: -0.06, sy: 1.05 }, ease: 'inOutCubic' },
    { t: 0.95, hand: 'open', joints: { armF: { x: 40, y: -226 }, armB: { x: 38, y: -136 }, headX: 0, bodyLean: -0.1 }, ease: 'outQuad' },
    { t: 1.15, hand: 'open', joints: { armF: { x: 104, y: -212 }, headX: 3, bodyLean: -0.02, twist: 0.12 }, ease: 'outCubic' },
    { t: 2,    hand: 'open', joints: { armF: { x: 110, y: -200 } }, hold: true },
    { t: 2.5,  hand: 'open', joints: { armF: { x: 86, y: -160 }, armB: { x: 40, y: -122 }, hipY: T_HIP, bodyLean: -0.02, twist: 0.04, sy: 1.04 }, ease: 'outQuad' },
    { t: 3,    hand: 'open', joints: CALM_AT, ease: 'inOutCubic' },
  ]),
};

// ---------------------------------------------------------------- shared moves
// The two moves every fighter has, in each form (FORMS `moves`, by kind):
// the energy steal, which borrowed the punch, and the bomb, which borrowed the
// slap. A steal reaches in at its own reach (STEAL.reach), the hand closing on
// what it takes and bringing it home; a bomb is lobbed, leaving the hand as
// the active window opens (Game.spawnBomb). From the guard and back.

// He snatches it the way he jabs, and tucks it into his chest.
const BOX_STEAL = {
  own: true,
  keys: carried([
    { t: 0, hand: 'fist', joints: BOX_AT },
    { t: 0.55, hand: 'open', joints: { armF: { x: 44, y: -166 }, bodyLean: 0.1, twist: -0.08 }, ease: 'outCubic' },
    { t: 0.95, hand: 'open', joints: { armF: { x: 40, y: -164 }, twist: -0.1 }, ease: 'outQuad' },
    { t: 1.1, hand: 'open', joints: { armF: { x: 108, y: -150 }, headX: 4, bodyLean: 0.2, twist: 0.18, hipTwist: 0.06 }, ease: 'outBack', smear: true },
    { t: 1.6, hand: 'fist', joints: { armF: { x: 104, y: -150 } } },
    { t: 2, hand: 'fist', joints: { armF: { x: 102, y: -150 } }, hold: true },
    { t: 2.45, hand: 'fist', joints: { armF: { x: 40, y: -150 }, headX: 2, bodyLean: 0.1, twist: -0.04, hipTwist: 0 }, ease: 'outCubic' },
    { t: 3, hand: 'fist', joints: BOX_AT, ease: 'inOutCubic' },
  ]),
};

// An overhand lob from beside his ear.
const BOX_BOMB = {
  own: true,
  keys: carried([
    { t: 0, hand: 'fist', joints: BOX_AT },
    { t: 0.55, hand: 'fist', joints: { armF: { x: 20, y: -200 }, bodyLean: 0.02, twist: -0.2 }, ease: 'outCubic' },
    { t: 0.95, hand: 'fist', joints: { armF: { x: 14, y: -206 }, twist: -0.24 }, ease: 'outQuad' },
    { t: 1.1, hand: 'open', joints: { armF: { x: 90, y: -196 }, headX: 4, bodyLean: 0.2, twist: 0.22, hipTwist: 0.08 }, ease: 'outBack', smear: true },
    { t: 2, hand: 'open', joints: { armF: { x: 92, y: -190 } }, hold: true },
    { t: 2.5, hand: 'open', joints: { armF: { x: 64, y: -176 }, headX: 2, bodyLean: 0.14, twist: 0.04, hipTwist: 0 }, ease: 'outQuad' },
    { t: 3, hand: 'fist', joints: BOX_AT, ease: 'inOutCubic' },
  ]),
};

// A grabby swipe across, his weight thrown in after it.
const BRAWL_STEAL = {
  own: true,
  keys: carried([
    { t: 0, hand: 'fist', joints: BRAWL_AT },
    { t: 0.55, hand: 'open', joints: { armF: { x: 40, y: -150 }, bodyLean: 0.1, twist: -0.15 }, ease: 'outCubic' },
    { t: 0.95, hand: 'open', joints: { armF: { x: 34, y: -154 }, twist: -0.2 }, ease: 'outQuad' },
    { t: 1.1, hand: 'open', joints: { armF: { x: 110, y: -128 }, headX: 6, bodyLean: 0.3, twist: 0.25, hipTwist: 0.1 }, ease: 'outBack', smear: true },
    { t: 1.6, hand: 'fist', joints: { armF: { x: 100, y: -122 } } },
    { t: 2, hand: 'fist', joints: { armF: { x: 98, y: -122 } }, hold: true },
    { t: 2.45, hand: 'fist', joints: { armF: { x: 48, y: -118 }, headX: 2, bodyLean: 0.16, twist: 0.02, hipTwist: 0 }, ease: 'outCubic' },
    { t: 3, hand: 'fist', joints: BRAWL_AT, ease: 'inOutCubic' },
  ]),
};

// Heaved overhand, wound right back first, the step and the body behind it.
const BRAWL_BOMB = {
  own: true,
  keys: carried([
    { t: 0, hand: 'fist', joints: BRAWL_AT },
    { t: 0.55, joints: { armF: { x: -10, y: -206 }, armB: { x: 50, y: -150 }, hipY: B_HIP - 4, bodyLean: -0.06, twist: -0.35, hipTwist: -0.15 }, ease: 'outCubic' },
    { t: 0.95, joints: { armF: { x: -18, y: -212 }, twist: -0.4 }, ease: 'outQuad' },
    { t: 1.1, hand: 'open', joints: { armF: { x: 100, y: -180 }, armB: { x: 20, y: -130 }, hipY: B_HIP, headX: 6, bodyLean: 0.34, twist: 0.35, hipTwist: 0.15, legF: { x: 44, y: 0 } }, ease: 'outBack', smear: true },
    { t: 2, hand: 'open', joints: { armF: { x: 100, y: -176 } }, hold: true },
    { t: 2.5, hand: 'fist', joints: { armF: { x: 70, y: -138 }, armB: { x: 40, y: -134 }, headX: 3, bodyLean: 0.2, twist: 0.05, hipTwist: 0, legF: { x: 36, y: 0 } }, ease: 'outQuad' },
    { t: 3, hand: 'fist', joints: BRAWL_AT, ease: 'inOutCubic' },
  ]),
};

// The reaching hand takes it, the briefcase kept back.
const GRAB_STEAL = {
  own: true,
  keys: carried([
    { t: 0, hand: 'open', joints: GRAB_AT },
    { t: 0.55, hand: 'open', joints: { armF: { x: 50, y: -130 }, hipY: G_HIP + 4, bodyLean: 0.26, twist: -0.12 }, ease: 'outCubic' },
    { t: 0.95, hand: 'open', joints: { armF: { x: 46, y: -128 }, twist: -0.15 }, ease: 'outQuad' },
    { t: 1.1, hand: 'open', joints: { armF: { x: 112, y: -128 }, headX: 6, bodyLean: 0.36, twist: 0.2, hipTwist: 0.08 }, ease: 'outBack', smear: true },
    { t: 1.6, hand: 'fist', joints: { armF: { x: 108, y: -126 } } },
    { t: 2, hand: 'fist', joints: { armF: { x: 106, y: -126 } }, hold: true },
    { t: 2.45, hand: 'fist', joints: { armF: { x: 50, y: -128 }, hipY: G_HIP, headX: 2, bodyLean: 0.22, twist: -0.06, hipTwist: 0 }, ease: 'outCubic' },
    { t: 3, hand: 'open', joints: GRAB_AT, ease: 'inOutCubic' },
  ]),
};

// Tossed underhand, low to high, the hunch kept.
const GRAB_BOMB = {
  own: true,
  keys: carried([
    { t: 0, hand: 'open', joints: GRAB_AT },
    { t: 0.55, hand: 'open', joints: { armF: { x: 20, y: -96 }, hipY: G_HIP + 6, bodyLean: 0.3, twist: -0.12 }, ease: 'outCubic' },
    { t: 0.95, hand: 'open', joints: { armF: { x: 12, y: -92 } }, ease: 'outQuad' },
    { t: 1.1, hand: 'open', joints: { armF: { x: 96, y: -158 }, hipY: G_HIP - 2, headX: 4, bodyLean: 0.2, twist: 0.14 }, ease: 'outBack', smear: true },
    { t: 2, hand: 'open', joints: { armF: { x: 96, y: -162 } }, hold: true },
    { t: 2.5, hand: 'open', joints: { armF: { x: 72, y: -142 }, hipY: G_HIP, headX: 2, bodyLean: 0.22, twist: 0.02 }, ease: 'outQuad' },
    { t: 3, hand: 'open', joints: GRAB_AT, ease: 'inOutCubic' },
  ]),
};

// He lifts it from you, then holds it up high for the crowd to see.
const SHOW_STEAL = {
  own: true,
  keys: carried([
    { t: 0, hand: 'open', joints: SHOW_AT },
    { t: 0.55, hand: 'open', joints: { armF: { x: 50, y: -160 }, bodyLean: -0.02, twist: -0.1 }, ease: 'outCubic' },
    { t: 0.95, hand: 'open', joints: { armF: { x: 46, y: -158 } }, ease: 'outQuad' },
    { t: 1.1, hand: 'open', joints: { armF: { x: 110, y: -150 }, headX: 4, bodyLean: 0.1, twist: 0.2 }, ease: 'outBack', smear: true },
    { t: 1.6, hand: 'fist', joints: { armF: { x: 106, y: -150 } } },
    { t: 2, hand: 'fist', joints: { armF: { x: 104, y: -150 } }, hold: true },
    { t: 2.45, hand: 'fist', joints: { armF: { x: 56, y: -224 }, headX: 0, bodyLean: -0.12, twist: -0.04 }, ease: 'outCubic' },
    { t: 3, hand: 'open', joints: SHOW_AT, ease: 'inOutCubic' },
  ]),
};

// Flipped up and over with the presenting hand, a little showily.
const SHOW_BOMB = {
  own: true,
  keys: carried([
    { t: 0, hand: 'open', joints: SHOW_AT },
    { t: 0.55, hand: 'open', joints: { armF: { x: 58, y: -140 }, bodyLean: -0.04, twist: -0.06 }, ease: 'outCubic' },
    { t: 0.95, hand: 'open', joints: { armF: { x: 54, y: -134 } }, ease: 'outQuad' },
    { t: 1.1, hand: 'open', joints: { armF: { x: 84, y: -216 }, headX: 1, bodyLean: -0.1, twist: 0.12 }, ease: 'outBack', smear: true },
    { t: 2, hand: 'open', joints: { armF: { x: 82, y: -218 } }, hold: true },
    { t: 2.5, hand: 'open', joints: { armF: { x: 72, y: -184 }, headX: 2, bodyLean: -0.06, twist: 0.03 }, ease: 'outQuad' },
    { t: 3, hand: 'open', joints: SHOW_AT, ease: 'inOutCubic' },
  ]),
};

// A lazy swipe up from the dropped hand.
const ROLL_STEAL = {
  own: true,
  keys: carried([
    { t: 0, hand: 'fist', joints: ROLL_AT },
    { t: 0.55, hand: 'open', joints: { armF: { x: 24, y: -108 }, bodyLean: 0.02, twist: -0.1 }, ease: 'outCubic' },
    { t: 0.95, hand: 'open', joints: { armF: { x: 20, y: -106 } }, ease: 'outQuad' },
    { t: 1.1, hand: 'open', joints: { armF: { x: 106, y: -122 }, headX: 3, bodyLean: 0.14, twist: 0.18 }, ease: 'outBack', smear: true },
    { t: 1.6, hand: 'fist', joints: { armF: { x: 100, y: -120 } } },
    { t: 2, hand: 'fist', joints: { armF: { x: 98, y: -120 } }, hold: true },
    { t: 2.45, hand: 'fist', joints: { armF: { x: 36, y: -110 }, headX: 2, bodyLean: -0.04, twist: 0 }, ease: 'outCubic' },
    { t: 3, hand: 'fist', joints: ROLL_AT, ease: 'inOutCubic' },
  ]),
};

// Flicked sidearm from the dropped hand.
const ROLL_BOMB = {
  own: true,
  keys: carried([
    { t: 0, hand: 'fist', joints: ROLL_AT },
    { t: 0.55, hand: 'fist', joints: { armF: { x: 0, y: -116 }, bodyLean: -0.02, twist: -0.25 }, ease: 'outCubic' },
    { t: 0.95, hand: 'fist', joints: { armF: { x: -6, y: -118 }, twist: -0.3 }, ease: 'outQuad' },
    { t: 1.1, hand: 'open', joints: { armF: { x: 96, y: -150 }, headX: 3, bodyLean: 0.1, twist: 0.22 }, ease: 'outBack', smear: true },
    { t: 2, hand: 'open', joints: { armF: { x: 94, y: -150 } }, hold: true },
    { t: 2.5, hand: 'open', joints: { armF: { x: 50, y: -122 }, headX: 2, bodyLean: -0.02, twist: 0.02 }, ease: 'outQuad' },
    { t: 3, hand: 'fist', joints: ROLL_AT, ease: 'inOutCubic' },
  ]),
};

// The hand comes out of the pocket for it, and goes back in with it.
const FENCE_STEAL = {
  own: true,
  keys: carried([
    { t: 0, hand: 'open', joints: FENCE_AT },
    { t: 0.55, hand: 'open', joints: { armB: { x: 6, y: -112 }, armF: { x: 58, y: -150 }, bodyLean: 0.06, twist: -0.15 }, ease: 'outCubic' },
    { t: 0.95, hand: 'open', joints: { armB: { x: 10, y: -114 }, twist: -0.18 }, ease: 'outQuad' },
    { t: 1.1, hand: 'open', joints: { armB: { x: 104, y: -128 }, armF: { x: 52, y: -140 }, headX: F_HEADX + 2, bodyLean: 0.16, twist: 0.3, hipTwist: 0.1 }, ease: 'outBack', smear: true },
    { t: 2, hand: 'open', joints: { armB: { x: 100, y: -128 } }, hold: true },
    { t: 2.45, hand: 'open', joints: { armB: { x: 8, y: -108 }, armF: { x: 60, y: -146 }, headX: F_HEADX, bodyLean: 0.06, twist: 0.02, hipTwist: 0 }, ease: 'outCubic' },
    { t: 3, hand: 'open', joints: FENCE_AT, ease: 'inOutCubic' },
  ]),
};

// Lobbed underhand by the pocket hand, which goes straight back in.
const FENCE_BOMB = {
  own: true,
  keys: carried([
    { t: 0, hand: 'open', joints: FENCE_AT },
    { t: 0.55, hand: 'open', joints: { armB: { x: -20, y: -98 }, twist: -0.12 }, ease: 'outCubic' },
    { t: 0.95, hand: 'open', joints: { armB: { x: -26, y: -96 } }, ease: 'outQuad' },
    { t: 1.1, hand: 'open', joints: { armB: { x: 80, y: -160 }, headX: F_HEADX + 1, bodyLean: 0.1, twist: 0.2 }, ease: 'outBack', smear: true },
    { t: 2, hand: 'open', joints: { armB: { x: 80, y: -162 } }, hold: true },
    { t: 2.5, hand: 'open', joints: { armB: { x: 6, y: -108 }, headX: F_HEADX, bodyLean: 0.04, twist: 0.02 }, ease: 'outQuad' },
    { t: 3, hand: 'open', joints: FENCE_AT, ease: 'inOutCubic' },
  ]),
};

// A precise thrust of the open hand along her line, and back.
const EN_STEAL = {
  own: true,
  keys: carried([
    { t: 0, hand: 'open', joints: EN_AT },
    { t: 0.55, hand: 'open', joints: { armF: { x: 44, y: -140 }, bodyLean: 0 }, ease: 'outCubic' },
    { t: 0.95, hand: 'open', joints: { armF: { x: 40, y: -140 } }, ease: 'outQuad' },
    { t: 1.1, hand: 'open', joints: { armF: { x: 112, y: -140 }, hipY: E_HIP + 4, headX: 4, bodyLean: 0.08, legF: { x: 34, y: 0 }, legB: { x: -22, y: 0 } }, ease: 'outBack', smear: true },
    { t: 1.6, hand: 'fist', joints: { armF: { x: 110, y: -140 } } },
    { t: 2, hand: 'fist', joints: { armF: { x: 108, y: -140 } }, hold: true },
    { t: 2.45, hand: 'fist', joints: { armF: { x: 50, y: -138 }, hipY: E_HIP, headX: 2, bodyLean: 0.02, legF: { x: 17, y: 0 }, legB: { x: -17, y: 0 } }, ease: 'outCubic' },
    { t: 3, hand: 'open', joints: EN_AT, ease: 'inOutCubic' },
  ]),
};

// Thrown overhand like a dart, exactly.
const EN_BOMB = {
  own: true,
  keys: carried([
    { t: 0, hand: 'open', joints: EN_AT },
    { t: 0.55, hand: 'open', joints: { armF: { x: 36, y: -188 }, bodyLean: -0.02, twist: -0.12 }, ease: 'outCubic' },
    { t: 0.95, hand: 'open', joints: { armF: { x: 32, y: -192 }, twist: -0.14 }, ease: 'outQuad' },
    { t: 1.1, hand: 'open', joints: { armF: { x: 100, y: -176 }, headX: 3, bodyLean: 0.08, twist: 0.14 }, ease: 'outBack', smear: true },
    { t: 2, hand: 'open', joints: { armF: { x: 100, y: -174 } }, hold: true },
    { t: 2.5, hand: 'open', joints: { armF: { x: 70, y: -150 }, headX: 2, bodyLean: 0.02, twist: 0.02 }, ease: 'outQuad' },
    { t: 3, hand: 'open', joints: EN_AT, ease: 'inOutCubic' },
  ]),
};

// She darts in under it, swipes, and is back in her shell.
const PEEK_STEAL = {
  own: true,
  keys: carried([
    { t: 0, hand: 'fist', joints: PEEK_AT },
    { t: 0.55, hand: 'open', joints: { armF: { x: 50, y: -146 }, hipY: K_HIP + 6, bodyLean: 0.26, twist: -0.1 }, ease: 'outCubic' },
    { t: 0.95, hand: 'open', joints: { armF: { x: 48, y: -144 }, hipY: K_HIP + 8 }, ease: 'outQuad' },
    { t: 1.1, hand: 'open', joints: { armF: { x: 104, y: -136 }, headX: 6, bodyLean: 0.34, twist: 0.2, legF: { x: 32, y: 0 } }, ease: 'outBack', smear: true },
    { t: 1.6, hand: 'fist', joints: { armF: { x: 100, y: -136 } } },
    { t: 2, hand: 'fist', joints: { armF: { x: 98, y: -136 } }, hold: true },
    { t: 2.45, hand: 'fist', joints: { armF: { x: 56, y: -150 }, hipY: K_HIP + 2, headX: 2, bodyLean: 0.2, twist: 0, legF: { x: 22, y: 0 } }, ease: 'outCubic' },
    { t: 3, hand: 'fist', joints: PEEK_AT, ease: 'inOutCubic' },
  ]),
};

// A short flick from the guard, the other fist never leaving her jaw.
const PEEK_BOMB = {
  own: true,
  keys: carried([
    { t: 0, hand: 'fist', joints: PEEK_AT },
    { t: 0.55, hand: 'fist', joints: { armF: { x: 46, y: -170 }, twist: -0.1 }, ease: 'outCubic' },
    { t: 0.95, hand: 'fist', joints: { armF: { x: 42, y: -174 } }, ease: 'outQuad' },
    { t: 1.1, hand: 'open', joints: { armF: { x: 94, y: -170 }, headX: 4, bodyLean: 0.24, twist: 0.16 }, ease: 'outBack', smear: true },
    { t: 2, hand: 'open', joints: { armF: { x: 92, y: -168 } }, hold: true },
    { t: 2.5, hand: 'fist', joints: { armF: { x: 62, y: -156 }, headX: 2, bodyLean: 0.2, twist: 0.02 }, ease: 'outQuad' },
    { t: 3, hand: 'fist', joints: PEEK_AT, ease: 'inOutCubic' },
  ]),
};

// A slow reach, palm up, as if accepting it, and it goes to her chest.
const CALM_STEAL = {
  own: true,
  keys: carried([
    { t: 0, hand: 'open', joints: CALM_AT },
    { t: 0.55, hand: 'open', joints: { armF: { x: 60, y: -136 }, bodyLean: -0.02 }, ease: 'outCubic' },
    { t: 0.95, hand: 'open', joints: { armF: { x: 58, y: -134 } }, ease: 'outQuad' },
    { t: 1.15, hand: 'open', joints: { armF: { x: 108, y: -132 }, headX: 3, bodyLean: 0.06, twist: 0.1 }, ease: 'outCubic' },
    { t: 2, hand: 'open', joints: { armF: { x: 106, y: -130 } }, hold: true },
    { t: 2.5, hand: 'open', joints: { armF: { x: 50, y: -150 }, headX: 2, bodyLean: -0.02, twist: 0 }, ease: 'outQuad' },
    { t: 3, hand: 'open', joints: CALM_AT, ease: 'inOutCubic' },
  ]),
};

// Released underhand, slowly, palm up.
const CALM_BOMB = {
  own: true,
  keys: carried([
    { t: 0, hand: 'open', joints: CALM_AT },
    { t: 0.55, hand: 'open', joints: { armF: { x: 50, y: -110 }, hipY: T_HIP + 2, bodyLean: -0.04 }, ease: 'outCubic' },
    { t: 0.95, hand: 'open', joints: { armF: { x: 44, y: -104 } }, ease: 'outQuad' },
    { t: 1.15, hand: 'open', joints: { armF: { x: 98, y: -170 }, hipY: T_HIP, headX: 3, bodyLean: 0.02, twist: 0.08 }, ease: 'outCubic' },
    { t: 2, hand: 'open', joints: { armF: { x: 100, y: -172 } }, hold: true },
    { t: 2.5, hand: 'open', joints: { armF: { x: 80, y: -150 }, headX: 2, bodyLean: -0.02, twist: 0.02 }, ease: 'outQuad' },
    { t: 3, hand: 'open', joints: CALM_AT, ease: 'inOutCubic' },
  ]),
};

// ---------------------------------------------------------------- command moves
// Each fighter's command moves (forward and a basic), in their form (FORMS
// `commands`, by the input). They borrowed the form's basic for that button:
// Lizbeth's THE DEMO, a counter that swings nothing, was her slap, and Kim's
// RUG PULL, a trap laid on the floor, her kick. Carl's ASSET SEIZURE keeps his
// punch, which is already a seizure. Timed to each move's own window, which
// for a counter is the time it waits and for a rush the run.

// UNDERCUT: a low kick in at the shins, his guard kept up over it.
const BOX_UNDERCUT = {
  own: true,
  keys: carried([
    { t: 0, hand: 'fist', joints: BOX_AT },
    { t: 0.55, hand: 'fist', joints: { legF: { x: 16, y: -20 }, hipY: HIP + 4, bodyLean: 0.18, twist: -0.08 }, ease: 'outCubic' },
    { t: 0.95, hand: 'fist', joints: { legF: { x: 12, y: -24 } }, ease: 'outQuad' },
    { t: 1.1, hand: 'fist', joints: { legF: { x: 118, y: -30 }, legB: { x: -36, y: 0 }, hipY: HIP + 10, headX: 4, bodyLean: 0.3, twist: 0.1 }, ease: 'outBack', smear: true },
    { t: 2, hand: 'fist', joints: { legF: { x: 116, y: -30 } }, hold: true },
    { t: 2.45, hand: 'fist', joints: { legF: { x: 40, y: -10 }, legB: { x: -30, y: 0 }, hipY: HIP + 4, headX: 2, bodyLean: 0.16, twist: 0.02 }, ease: 'outCubic' },
    { t: 3, hand: 'fist', joints: BOX_AT, ease: 'inOutCubic' },
  ]),
};

// BLITZSCALE: he runs you down throwing haymakers, three of them, left,
// right, left, the feet chopping under him.
const BRAWL_BLITZ = {
  own: true,
  keys: carried([
    { t: 0, hand: 'fist', joints: BRAWL_AT },
    { t: 0.6, hand: 'fist', joints: { armF: { x: 40, y: -140 }, armB: { x: 30, y: -146 }, hipY: B_HIP + 4, bodyLean: 0.3, twist: -0.2 }, ease: 'outCubic' },
    { t: 0.95, hand: 'fist', joints: { bodyLean: 0.34, twist: -0.24 }, ease: 'outQuad' },
    { t: 1.1, hand: 'fist', joints: { armF: { x: 108, y: -140 }, armB: { x: 34, y: -146 }, bodyLean: 0.42, twist: 0.3, legF: { x: 44, y: -6 }, legB: { x: -30, y: 0 } }, ease: 'outBack', smear: true },
    { t: 1.28, hand: 'fist', joints: { armF: { x: 50, y: -150 }, armB: { x: 40, y: -140 }, twist: -0.15, legF: { x: 30, y: 0 }, legB: { x: -38, y: -6 } }, ease: 'inOutCubic' },
    { t: 1.45, hand: 'fist', joints: { armF: { x: 44, y: -148 }, armB: { x: 104, y: -142 }, twist: -0.32, legF: { x: 44, y: -6 }, legB: { x: -30, y: 0 } }, ease: 'outBack', smear: true },
    { t: 1.62, hand: 'fist', joints: { armF: { x: 50, y: -150 }, armB: { x: 40, y: -140 }, twist: 0.1, legF: { x: 30, y: 0 }, legB: { x: -38, y: -6 } }, ease: 'inOutCubic' },
    { t: 1.8, hand: 'fist', joints: { armF: { x: 110, y: -140 }, armB: { x: 34, y: -146 }, twist: 0.32, legF: { x: 44, y: -6 }, legB: { x: -30, y: 0 } }, ease: 'outBack', smear: true },
    { t: 2, hand: 'fist', joints: { armF: { x: 108, y: -140 } }, hold: true },
    { t: 2.5, hand: 'fist', joints: { armF: { x: 70, y: -128 }, armB: { x: 44, y: -134 }, hipY: B_HIP + 2, bodyLean: 0.2, twist: 0.04, legF: { x: 33, y: 0 }, legB: { x: -31, y: 0 } }, ease: 'outQuad' },
    { t: 3, hand: 'fist', joints: BRAWL_AT, ease: 'inOutCubic' },
  ]),
};

// ONE MORE THING: the presenting hand raised beside his head, the pause,
// then out of nowhere (behind you) the palm driven up under the chin.
const SHOW_ONEMORE = {
  own: true,
  keys: carried([
    { t: 0, hand: 'open', joints: SHOW_AT },
    { t: 0.5, hand: 'open', joints: { armF: { x: 50, y: -214 }, headX: 0, bodyLean: -0.1, twist: -0.05 }, ease: 'outCubic' },
    { t: 0.95, hand: 'open', joints: { armF: { x: 48, y: -220 } }, ease: 'outQuad' },
    { t: 1.1, hand: 'open', joints: { armF: { x: 92, y: -224 }, hipY: S_HIP - 6, headX: 3, bodyLean: 0.04, twist: 0.2, sy: 1.06 }, ease: 'outBack', smear: true },
    { t: 2, hand: 'open', joints: { armF: { x: 90, y: -226 } }, hold: true },
    { t: 2.5, hand: 'open', joints: { armF: { x: 76, y: -186 }, hipY: S_HIP, headX: 2, bodyLean: -0.04, twist: 0.04, sy: 1.02 }, ease: 'outQuad' },
    { t: 3, hand: 'open', joints: SHOW_AT, ease: 'inOutCubic' },
  ]),
};

// PLATFORM BURN: the lead knee up, then stamped down, the hands dropping
// open, the fire going out along the floor.
const ROLL_PLATFORM = {
  own: true,
  keys: carried([
    { t: 0, hand: 'fist', joints: ROLL_AT },
    { t: 0.55, hand: 'fist', joints: { legF: { x: 26, y: -46 }, armF: { x: 24, y: -130 }, armB: { x: 36, y: -170 }, hipY: R_HIP - 2, bodyLean: -0.08, twist: -0.1 }, ease: 'outCubic' },
    { t: 0.95, hand: 'fist', joints: { legF: { x: 28, y: -52 } }, ease: 'outQuad' },
    { t: 1.1, hand: 'open', joints: { legF: { x: 40, y: 0 }, armF: { x: 60, y: -96 }, armB: { x: 20, y: -120 }, hipY: R_HIP + 16, headX: 5, bodyLean: 0.2, twist: 0, sx: 1.1, sy: 0.9 }, ease: 'outBack', smear: true },
    { t: 2, hand: 'open', joints: { legF: { x: 40, y: 0 } }, hold: true },
    { t: 2.5, hand: 'open', joints: { legF: { x: 24, y: 0 }, armF: { x: 32, y: -112 }, armB: { x: 40, y: -158 }, hipY: R_HIP + 4, headX: 2, bodyLean: 0, sx: 1, sy: 1 }, ease: 'outQuad' },
    { t: 3, hand: 'fist', joints: ROLL_AT, ease: 'inOutCubic' },
  ]),
};

// SAFETY MEMO: the pocket hand brings out the memo and flicks it at you,
// twice (they leave at 1 and 1.4 of the clock), then goes back in.
const FENCE_MEMO = {
  own: true,
  keys: carried([
    { t: 0, hand: 'open', joints: FENCE_AT },
    { t: 0.55, hand: 'open', joints: { armB: { x: 10, y: -150 }, twist: -0.12 }, ease: 'outCubic' },
    { t: 0.95, hand: 'open', joints: { armB: { x: 14, y: -160 } }, ease: 'outQuad' },
    { t: 1.03, hand: 'open', joints: { armB: { x: 84, y: -150 }, headX: F_HEADX + 1, bodyLean: 0.1, twist: 0.18 }, ease: 'outBack', smear: true },
    { t: 1.2, hand: 'open', joints: { armB: { x: 20, y: -156 }, twist: -0.08 }, ease: 'inOutCubic' },
    { t: 1.44, hand: 'open', joints: { armB: { x: 86, y: -148 }, twist: 0.2 }, ease: 'outBack', smear: true },
    { t: 2, hand: 'open', joints: { armB: { x: 84, y: -148 } }, hold: true },
    { t: 2.5, hand: 'open', joints: { armB: { x: 4, y: -108 }, headX: F_HEADX, bodyLean: 0.04, twist: 0.02 }, ease: 'outQuad' },
    { t: 3, hand: 'open', joints: FENCE_AT, ease: 'inOutCubic' },
  ]),
};

// THE DEMO: she holds up the demo, palm out, and waits, perfectly still,
// for you to hit it (the counter's window is 1 to 2).
const EN_DEMO = {
  own: true,
  keys: carried([
    { t: 0, hand: 'open', joints: EN_AT },
    { t: 0.5, hand: 'open', joints: { armF: { x: 70, y: -176 }, armB: { x: 36, y: -146 }, bodyLean: -0.04, twist: -0.15, hipTwist: -0.06 }, ease: 'outCubic' },
    { t: 0.95, hand: 'open', joints: { armF: { x: 74, y: -180 } }, ease: 'outQuad' },
    { t: 1.1, hand: 'open', joints: { armF: { x: 76, y: -182 } }, ease: 'outQuad' },
    { t: 2, hand: 'open', joints: { armF: { x: 76, y: -182 } }, hold: true },
    { t: 2.5, hand: 'open', joints: { armF: { x: 62, y: -150 }, armB: { x: 40, y: -142 }, bodyLean: 0, twist: -0.04, hipTwist: 0 }, ease: 'outQuad' },
    { t: 3, hand: 'open', joints: EN_AT, ease: 'inOutCubic' },
  ]),
};

// PUMP: a short shovel punch from her crouch, up under you.
const PEEK_PUMP = {
  own: true,
  keys: carried([
    { t: 0, hand: 'fist', joints: PEEK_AT },
    { t: 0.55, hand: 'fist', joints: { armF: { x: 40, y: -128 }, hipY: K_HIP + 8, bodyLean: 0.26, twist: -0.15, sx: 1, sy: 0.94 }, ease: 'outCubic' },
    { t: 0.95, hand: 'fist', joints: { armF: { x: 36, y: -124 }, hipY: K_HIP + 10 }, ease: 'outQuad' },
    { t: 1.1, hand: 'fist', joints: { armF: { x: 96, y: -176 }, hipY: K_HIP - 4, headX: 4, bodyLean: 0.1, twist: 0.24, sy: 1.04 }, ease: 'outBack', smear: true },
    { t: 2, hand: 'fist', joints: { armF: { x: 94, y: -178 } }, hold: true },
    { t: 2.45, hand: 'fist', joints: { armF: { x: 62, y: -158 }, hipY: K_HIP, headX: 2, bodyLean: 0.16, twist: 0.04, sx: 0.97, sy: 1 }, ease: 'outCubic' },
    { t: 3, hand: 'fist', joints: PEEK_AT, ease: 'inOutCubic' },
  ]),
};

// RUG PULL: down low, both hands on the floor in front of her, and the rug
// yanked back as she lays it.
const PEEK_RUG = {
  own: true,
  keys: carried([
    { t: 0, hand: 'fist', joints: PEEK_AT },
    { t: 0.55, hand: 'open', joints: { armF: { x: 62, y: -70 }, armB: { x: 52, y: -74 }, hipY: K_HIP + 24, shoulderY: K_SHOULDER + 30, headY: K_HEAD + 32, headX: 6, bodyLean: 0.5, sx: 1.06, sy: 0.9, legF: { x: 34, y: 0 }, legB: { x: -24, y: 0 } }, ease: 'outCubic' },
    { t: 0.95, hand: 'open', joints: { armF: { x: 66, y: -64 }, armB: { x: 56, y: -68 } }, ease: 'outQuad' },
    { t: 1.1, hand: 'fist', joints: { armF: { x: 20, y: -76 }, armB: { x: 10, y: -80 }, bodyLean: 0.3, twist: -0.2 }, ease: 'outBack', smear: true },
    { t: 2, hand: 'fist', joints: { armF: { x: 20, y: -76 } }, hold: true },
    { t: 2.5, hand: 'fist', joints: { armF: { x: 50, y: -130 }, armB: { x: 40, y: -140 }, hipY: K_HIP + 6, shoulderY: K_SHOULDER + 6, headY: K_HEAD + 6, headX: 2, bodyLean: 0.2, twist: 0, sx: 0.97, sy: 1, legF: { x: 22, y: 0 }, legB: { x: -20, y: 0 } }, ease: 'outQuad' },
    { t: 3, hand: 'fist', joints: PEEK_AT, ease: 'inOutCubic' },
  ]),
};

// CONVICTION BUY: one decisive lift of the lead hand, palm up, high.
const CALM_CONVICTION = {
  own: true,
  keys: carried([
    { t: 0, hand: 'open', joints: CALM_AT },
    { t: 0.55, hand: 'open', joints: { armF: { x: 56, y: -130 }, hipY: T_HIP + 4, bodyLean: 0.02, sy: 1.02 }, ease: 'outCubic' },
    { t: 0.95, hand: 'open', joints: { armF: { x: 52, y: -126 } }, ease: 'outQuad' },
    { t: 1.1, hand: 'open', joints: { armF: { x: 70, y: -232 }, hipY: T_HIP - 2, headX: 0, bodyLean: -0.08, sy: 1.06 }, ease: 'outBack', smear: true },
    { t: 2, hand: 'open', joints: { armF: { x: 70, y: -234 } }, hold: true },
    { t: 2.5, hand: 'open', joints: { armF: { x: 70, y: -180 }, hipY: T_HIP, headX: 2, bodyLean: -0.04, sy: 1.04 }, ease: 'outQuad' },
    { t: 3, hand: 'open', joints: CALM_AT, ease: 'inOutCubic' },
  ]),
};

// ---------------------------------------------------------------- round start
// What each form does while the round starts (FORMS `intro`), through ROUND
// and FIGHT!, when the fighters stand locked: a gesture of its own, from 0 to
// 1 across the two, ending in the guard by 0.85, after which computePose hands
// over to the live idle.

// He taps his gloves together twice in front of him and puts them up.
const BOX_INTRO = {
  keys: carried([
    { t: 0, joints: { ...BOX_AT, armF: { x: 40, y: -150 }, armB: { x: 34, y: -150 }, bodyLean: 0.08 } },
    { t: 0.2, joints: { armF: { x: 44, y: -160 }, armB: { x: 38, y: -160 } }, ease: 'inOutCubic' },
    { t: 0.3, joints: { armF: { x: 52, y: -150 }, armB: { x: 30, y: -150 } }, ease: 'inOutCubic' },
    { t: 0.42, joints: { armF: { x: 44, y: -160 }, armB: { x: 38, y: -160 } }, ease: 'inOutCubic' },
    { t: 0.6, joints: { armF: { x: 52, y: -150 }, armB: { x: 30, y: -150 } }, ease: 'inOutCubic' },
    { t: 0.85, joints: BOX_AT, ease: 'inOutCubic' },
  ]),
};

// He slaps his chest twice, the head back, and squares up.
const BRAWL_INTRO = {
  keys: carried([
    { t: 0, joints: { ...BRAWL_AT, armF: { x: 34, y: -156 }, armB: { x: 20, y: -146 }, headX: -2, bodyLean: 0.04 } },
    { t: 0.15, joints: { armF: { x: 16, y: -150 } }, ease: 'inOutCubic' },
    { t: 0.3, joints: { armF: { x: 44, y: -162 } }, ease: 'inOutCubic' },
    { t: 0.45, joints: { armF: { x: 16, y: -148 } }, ease: 'inOutCubic' },
    { t: 0.6, joints: { armF: { x: 44, y: -160 }, headX: 0 }, ease: 'inOutCubic' },
    { t: 0.85, joints: BRAWL_AT, ease: 'inOutCubic' },
  ]),
};

// He stands up straight to fix a cufflink, then settles into his hunch.
const GRAB_INTRO = {
  keys: carried([
    { t: 0, hand: 'open', joints: { ...GRAB_AT, armF: { x: 36, y: -122 }, armB: { x: 34, y: -120 }, hipY: -80, shoulderY: -150, headY: -176, headX: 2, bodyLean: 0.02, sx: 1, sy: 1 } },
    { t: 0.3, hand: 'open', joints: { armF: { x: 38, y: -124 } }, ease: 'inOutCubic' },
    { t: 0.55, hand: 'open', joints: { armF: { x: 34, y: -120 } }, ease: 'inOutCubic' },
    { t: 0.85, hand: 'open', joints: GRAB_AT, ease: 'inOutCubic' },
  ]),
};

// He waves to the crowd with the presenting hand high.
const SHOW_INTRO = {
  keys: carried([
    { t: 0, hand: 'open', joints: { ...SHOW_AT, armF: { x: 50, y: -206 }, bodyLean: -0.08, twist: -0.1 } },
    { t: 0.15, hand: 'open', joints: { armF: { x: 66, y: -210 } }, ease: 'inOutCubic' },
    { t: 0.3, hand: 'open', joints: { armF: { x: 44, y: -206 } }, ease: 'inOutCubic' },
    { t: 0.45, hand: 'open', joints: { armF: { x: 66, y: -210 } }, ease: 'inOutCubic' },
    { t: 0.6, hand: 'open', joints: { armF: { x: 50, y: -200 }, twist: -0.04 }, ease: 'inOutCubic' },
    { t: 0.85, hand: 'open', joints: SHOW_AT, ease: 'inOutCubic' },
  ]),
};

// He beckons you on with the lead hand, twice, then drops it.
const ROLL_INTRO = {
  keys: carried([
    { t: 0, hand: 'open', joints: { ...ROLL_AT, armF: { x: 60, y: -140 }, bodyLean: -0.06 } },
    { t: 0.2, hand: 'open', joints: { armF: { x: 44, y: -150 } }, ease: 'inOutCubic' },
    { t: 0.35, hand: 'open', joints: { armF: { x: 62, y: -140 } }, ease: 'inOutCubic' },
    { t: 0.5, hand: 'open', joints: { armF: { x: 44, y: -150 } }, ease: 'inOutCubic' },
    { t: 0.65, hand: 'open', joints: { armF: { x: 56, y: -134 } }, ease: 'inOutCubic' },
    { t: 0.85, hand: 'fist', joints: ROLL_AT, ease: 'inOutCubic' },
  ]),
};

// Both hands in his pockets, rocking on his heels, until he has to take
// one out.
const FENCE_INTRO = {
  keys: carried([
    { t: 0, hand: 'open', joints: { ...FENCE_AT, armF: { x: 6, y: -104 }, bodyLean: -0.04 } },
    { t: 0.25, hand: 'open', joints: { bodyLean: 0.05 }, ease: 'inOutCubic' },
    { t: 0.5, hand: 'open', joints: { bodyLean: -0.05 }, ease: 'inOutCubic' },
    { t: 0.7, hand: 'open', joints: { armF: { x: 40, y: -130 }, bodyLean: 0.02 }, ease: 'inOutCubic' },
    { t: 0.85, hand: 'open', joints: FENCE_AT, ease: 'inOutCubic' },
  ]),
};

// A fencer's salute: the hand raised before her face, then swept down and
// out, then en garde.
const EN_INTRO = {
  keys: carried([
    { t: 0, hand: 'open', joints: { ...EN_AT, armF: { x: 40, y: -150 }, bodyLean: 0 } },
    { t: 0.2, hand: 'open', joints: { armF: { x: 30, y: -190 }, sy: 1.04 }, ease: 'inOutCubic' },
    { t: 0.45, hand: 'open', joints: { armF: { x: 30, y: -192 } }, ease: 'inOutCubic' },
    { t: 0.62, hand: 'open', joints: { armF: { x: 80, y: -110 }, sy: 1.02 }, ease: 'inOutCubic' },
    { t: 0.85, hand: 'open', joints: EN_AT, ease: 'inOutCubic' },
  ]),
};

// Standing tall, she waves up and out at the camera, then drops into her
// shell (the hand kept clear of her face).
const PEEK_INTRO = {
  keys: carried([
    { t: 0, hand: 'open', joints: { ...PEEK_AT, armF: { x: 60, y: -196 }, hipY: -78, shoulderY: -148, headY: -172, bodyLean: 0.04 } },
    { t: 0.15, hand: 'open', joints: { armF: { x: 72, y: -200 } }, ease: 'inOutCubic' },
    { t: 0.3, hand: 'open', joints: { armF: { x: 58, y: -196 } }, ease: 'inOutCubic' },
    { t: 0.45, hand: 'open', joints: { armF: { x: 72, y: -200 } }, ease: 'inOutCubic' },
    { t: 0.6, hand: 'open', joints: { armF: { x: 60, y: -186 } }, ease: 'inOutCubic' },
    { t: 0.85, hand: 'fist', joints: PEEK_AT, ease: 'inOutCubic' },
  ]),
};

// The opening of a tai chi form: the arms float up to her shoulders, press
// down as the knees sink, and come round into her guard.
const CALM_INTRO = {
  keys: carried([
    { t: 0, hand: 'open', joints: { ...CALM_AT, armF: { x: 50, y: -110 }, armB: { x: 36, y: -108 } } },
    { t: 0.35, hand: 'open', joints: { armF: { x: 72, y: -150 }, armB: { x: 56, y: -148 } }, ease: 'inOutCubic' },
    { t: 0.6, hand: 'open', joints: { armF: { x: 64, y: -120 }, armB: { x: 50, y: -118 }, hipY: -84 }, ease: 'inOutCubic' },
    { t: 0.85, hand: 'open', joints: CALM_AT, ease: 'inOutCubic' },
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
    tracks: { punch: LEAD_STRAIGHT, kick: BOX_KICK, slap: BOX_SLAP, launch: BOX_UPPER },
    // Hit, he covers up: the gloves stay up at his face and the hit moves him
    // less than most. Out cold, his guard is still up. He wins with both fists
    // over his head, up on his toes.
    hit: { lean: 0.8, armF: { x: 42, y: -160 }, armB: { x: 30, y: -160 } },
    // The fall: he goes over like a felled tree, the guard still up.
    ko: { armF: { x: 34, y: -150 }, armB: { x: 22, y: -148 }, fall: { time: 0.5, rot: -1.5, ease: 'inQuad' } },
    victory: {
      rate: 1.6,
      keys: carried([
        { t: 0,   joints: { armF: { x: 24, y: -226 }, armB: { x: -8, y: -222 }, hipY: -84, shoulderY: -152, headY: -180, headX: 2, bodyLean: -0.04, sy: 1.02 } },
        { t: 0.5, joints: { armF: { x: 28, y: -232 }, armB: { x: -4, y: -228 }, hipY: -90, shoulderY: -158, headY: -186, headX: 2, bodyLean: -0.04, sy: 1.04 }, ease: 'inOutCubic' },
        { t: 1,   joints: { armF: { x: 24, y: -226 }, armB: { x: -8, y: -222 }, hipY: -84, shoulderY: -152, headY: -180, headX: 2, bodyLean: -0.04, sy: 1.02 }, ease: 'inOutCubic' },
      ]),
    },
    // He walks a boxer's step-and-follow on the balls of his feet: the lead
    // foot steps, the rear one follows, a bounce in every step and the guard
    // tight. He jumps tucked, the gloves up, and comes down on his toes.
    walk: { rate: 1.2, stride: 12, lag: Math.PI / 2, lift: 5, bob: 4, back: 0.06, roll: 0.04 },
    jump: {
      up: { legF: { x: 20, y: -34 }, legB: { x: -6, y: -26 } },
      down: { legF: { x: 22, y: -14 }, legB: { x: -22, y: -10 } },
    },
    // He crouches as a boxer ducks: knees deep, the gloves still at his face,
    // chin tucked over them. He dashes in low behind the gloves, and pulls
    // straight back out, upright, the gloves still up.
    crouch: { hip: 24, shoulder: 24, head: 26, headX: 4, lean: 0.22, sx: 1.04, sy: 0.94, legF: { x: 30, y: 0 }, legB: { x: -32, y: 0 } },
    dash: {
      drop: 8, lean: 0.3, headX: 2, legF: { x: 38, y: -4 }, legB: { x: -34, y: -8 },
      back: { drop: 2, lean: -0.08, headX: 0, legF: { x: 22, y: -8 }, legB: { x: -36, y: -2 } },
    },
    // Its signature special, in its own form (above).
    specials: { sameday: BOX_DELIVERY },
    // The steal and the bomb everyone has, in its own way (above).
    moves: { steal: BOX_STEAL, bomb: BOX_BOMB },
    // Its command moves, by input (above).
    commands: { 'fwd+kick': BOX_UNDERCUT },
    // UNICORN MODE going on. He goes into his super with a roar, the fists
    // clenched down at his sides and the chest out.
    super: { fade: 0.3, joints: { armF: { x: 28, y: -118 }, armB: { x: 10, y: -116 }, hipY: -84, shoulderY: -152, headY: -180, headX: -2, bodyLean: -0.1, sx: 1.02, sy: 1.04 } },
    // How it opens the round (above).
    intro: BOX_INTRO,
  },
  brawling: {
    stance: { hip: 8, head: 4, lean: 0.14, armF: BRAWL_F, armB: BRAWL_B,
      legF: { x: 33 }, legB: { x: -31 }, sx: 1.06, swayX: 2.2, swayRate: 1.6 },
    // Rolling his weight at rest: the shoulders swing with the sway of the
    // fists and the hips follow a beat behind (radians, at the sway's rate).
    roll: { twist: 0.08, hip: 0.04, rate: 1.6 },
    // He covers up, late and badly: both forearms thrown up across the face
    // from the belly, the body turned away from the hit.
    block: { armF: { x: -16, y: -46 }, armB: { x: -12, y: -36 }, twist: -0.15 },
    // The fists out wider than his shoulders (the shared rig keeps a hand at
    // 0.85 of its shoulder's depth): too far apart, an open door down the middle.
    handDepth: { F: 1.2, B: 1.1 },
    // The rear fist only half follows the chest round as he swings.
    guardTurn: 0.5,
    // The exaggeration is written into the haymaker itself, so the swing is
    // not scaled again; the hit lands with his weight.
    motion: { windup: 1, follow: 1, drop: 7, squash: 0.06, brace: 6, thrust: 5 },
    tracks: { punch: HAYMAKER, kick: BRAWL_KICK, slap: BRAWL_SLAP, launch: BRAWL_UPPER },
    // Hit, he is thrown about, the arms flung out. He goes down spread out
    // like a starfish, and wins flexing both arms, roaring.
    hit: { lean: 1.3, armF: { x: 54, y: -130 }, armB: { x: -10, y: -150 } },
    // The fall: he crashes down hard and fast.
    ko: { armF: { x: 60, y: -160 }, armB: { x: -48, y: -160 }, legF: { x: 40, y: -6 }, legB: { x: -34, y: -4 }, fall: { time: 0.4, rot: -1.55, ease: 'outQuad' } },
    victory: {
      rate: 1.2,
      keys: carried([
        { t: 0,   joints: { armF: { x: 44, y: -188 }, armB: { x: -34, y: -186 }, hipY: -78, shoulderY: -148, headY: -174, headX: 2, bodyLean: 0.04, sx: 1.06, sy: 0.98 } },
        { t: 0.5, joints: { armF: { x: 48, y: -196 }, armB: { x: -38, y: -194 }, hipY: -76, shoulderY: -146, headY: -172, headX: -1, bodyLean: 0.02, sx: 1.1, sy: 0.96 }, ease: 'inOutCubic' },
        { t: 1,   joints: { armF: { x: 44, y: -188 }, armB: { x: -34, y: -186 }, hipY: -78, shoulderY: -148, headY: -174, headX: 2, bodyLean: 0.04, sx: 1.06, sy: 0.98 }, ease: 'inOutCubic' },
      ]),
    },
    // He swaggers: wide, heavy steps, the shoulders rolling with each one and
    // the fists swinging low. He throws himself into the air, legs flung
    // apart and both arms up, and comes down in a stomp.
    walk: { rate: 0.9, stride: 14, lift: 8, bob: 5, lean: 0.16, back: 0.08, roll: 0.14, hip: 0.06, swing: 6 },
    jump: {
      up: { legF: { x: 38, y: -30 }, legB: { x: -34, y: -22 }, armF: { x: 50, y: -196 }, armB: { x: -14, y: -190 }, lean: -0.06 },
      down: { legF: { x: 32, y: -10 }, legB: { x: -30, y: -8 } },
    },
    // He squats sumo-wide, the fists dropping in front of him. He charges
    // head down, the lead shoulder first and the fists low, and stumbles back
    // with his arms flung out.
    crouch: { hip: 20, shoulder: 22, head: 22, lean: 0.12, sx: 1.14, sy: 0.9, legF: { x: 40, y: 0 }, legB: { x: -38, y: 0 }, armF: { x: -4, y: 8 }, armB: { x: -2, y: 8 } },
    dash: {
      drop: 10, lean: 0.5, twist: 0.25, legF: { x: 42, y: -10 }, legB: { x: -36, y: -4 }, armF: { x: -10, y: 16 }, armB: { x: -6, y: 12 },
      back: { drop: 4, lean: -0.16, twist: 0, legF: { x: 24, y: -12 }, legB: { x: -38, y: -2 }, armF: { x: 8, y: -20 }, armB: { x: -20, y: -16 } },
    },
    // Its signature special, in its own form (above).
    specials: { burnitall: BRAWL_BURN },
    // The steal and the bomb everyone has, in its own way (above).
    moves: { steal: BRAWL_STEAL, bomb: BRAWL_BOMB },
    // Its command moves, by input (above).
    commands: { 'fwd+punch': BRAWL_BLITZ },
    // UNICORN MODE going on. He drops into a wide squat and roars, arms thrown
    // out at his shoulders. (Low: the super's banner covers the screen above
    // the fighters' heads for longer than the pose lasts, and standing he is
    // tall enough to put his head into it.)
    super: { fade: 0.3, joints: { armF: { x: 66, y: -150 }, armB: { x: -34, y: -146 }, hipY: -54, shoulderY: -128, headY: -146, headX: 2, bodyLean: 0.06, sx: 1.14, sy: 0.94, legF: { x: 40, y: 0 }, legB: { x: -38, y: 0 } } },
    // How it opens the round (above).
    intro: BRAWL_INTRO,
  },
  grappling: {
    stance: { hip: 10, shoulder: 8, head: 12, lean: 0.22, armF: GRAB_F, armB: GRAB_B,
      legF: { x: 31 }, legB: { x: -29 }, sx: 1.04, sy: 0.96 },
    // The states his lead hand is held open in, reaching; it closes to hold
    // the block briefcase, and his seizure opens and closes it itself.
    open: ['idle', 'walk', 'dash', 'crouch', 'jump'],
    // He does not fidget, he waits: a slow, heavy shift of his weight.
    roll: { twist: 0.04, hip: 0.03, rate: 0.9 },
    // He hunches behind the briefcase, the lead hand up at the chest with it
    // and the shoulders turned a little away.
    block: { armF: { x: -8, y: -22 }, armB: { x: -6, y: -10 }, twist: -0.1 },
    // The open hand reaches in toward the middle, at what it means to take;
    // the case hangs at his side.
    handDepth: { F: 0.6, B: 0.95 },
    guardTurn: 0.6,
    // The seizure is written whole; the hit lands with his weight.
    motion: { windup: 1, follow: 1, drop: 8, squash: 0.08, brace: 4, thrust: 5 },
    tracks: { punch: SEIZE, kick: GRAB_KICK, slap: GRAB_SLAP, launch: GRAB_UPPER },
    // Hit, he barely moves: too heavy to throw about. He goes down heavily,
    // the arms at his sides, and wins straightening his tie, the lead hand
    // snugging the knot up under his chin, the briefcase (in the rear hand)
    // hanging at his side: dusting off his hands, the case came up between
    // them and he seemed to be clapping it.
    hit: { lean: 0.6, armF: { x: 50, y: -120 }, armB: { x: 36, y: -116 }, hand: 'open' },
    // The fall: he topples slowly, all his weight going at once.
    ko: { armF: { x: 26, y: -112 }, armB: { x: -10, y: -110 }, hand: 'open', fall: { time: 0.7, rot: -1.5, ease: 'inQuad' } },
    victory: {
      rate: 0.8,
      keys: carried([
        { t: 0,   hand: 'fist', joints: { armF: { x: 14, y: -144 }, armB: { x: -4, y: -100 }, hipY: -84, shoulderY: -152, headY: -178, headX: 2, bodyLean: -0.02, sy: 1.02 } },
        { t: 0.5, hand: 'fist', joints: { armF: { x: 14, y: -151 }, armB: { x: -4, y: -100 }, hipY: -84, shoulderY: -153, headY: -180, headX: 0, bodyLean: -0.03, sy: 1.02 }, ease: 'inOutCubic' },
        { t: 1,   hand: 'fist', joints: { armF: { x: 14, y: -144 }, armB: { x: -4, y: -100 }, hipY: -84, shoulderY: -152, headY: -178, headX: 2, bodyLean: -0.02, sy: 1.02 }, ease: 'inOutCubic' },
      ]),
    },
    // He stalks you, slow and heavy: hunched lower than he stands, his weight
    // rolling from foot to foot, the open hand pushing out with each step.
    // He barely leaves the floor and does not look as if he means to: a
    // heavy hop, the knees only bent, the hunch kept.
    walk: { rate: 0.7, stride: 12, lift: 4, bob: 4, low: 4, lean: 0.26, back: 0.18, roll: 0.06, hip: 0.04, swing: 4 },
    jump: {
      up: { legF: { x: 28, y: -18 }, legB: { x: -22, y: -14 }, lean: 0.26 },
      down: { legF: { x: 30, y: -8 }, legB: { x: -26, y: -6 }, lean: 0.28 },
      stretch: 0.5,
    },
    // He crouches as a wrestler changes level, hunched further over, the open
    // hand reaching low for the legs. He shoots in for the takedown lower
    // still, and steps back heavily, still hunched.
    crouch: { hip: 18, shoulder: 20, head: 20, lean: 0.34, sx: 1.08, sy: 0.92, legF: { x: 38, y: 0 }, legB: { x: -32, y: 0 }, armF: { x: 6, y: 14 } },
    dash: {
      drop: 16, lean: 0.46, legF: { x: 42, y: -4 }, legB: { x: -36, y: -2 }, armF: { x: 16, y: 12 },
      back: { drop: 6, lean: 0.14, legF: { x: 24, y: -4 }, legB: { x: -36, y: -4 }, armF: { x: 0, y: 0 } },
    },
    // Its signature special, in its own form (above).
    specials: { takeover: GRAB_TAKEOVER },
    // The steal and the bomb everyone has, in its own way (above).
    moves: { steal: GRAB_STEAL, bomb: GRAB_BOMB },
    // UNICORN MODE going on. He straightens up to his full height for once,
    // the briefcase raised beside him.
    super: { fade: 0.3, hand: 'open', joints: { armF: { x: 70, y: -150 }, armB: { x: 20, y: -170 }, hipY: -80, shoulderY: -150, headY: -176, headX: 0, bodyLean: 0, sx: 1, sy: 1 } },
    // How it opens the round (above).
    intro: GRAB_INTRO,
  },
  showboating: {
    stance: { head: -3, lean: -0.06, armF: SHOW_F, armB: SHOW_B, legF: { x: 21 }, legB: { x: -19 }, sy: 1.02 },
    // The lead hand open, presenting, wherever he is not hitting or holding
    // the block briefcase. His keynote drift at rest (the presenting hand
    // rising on "one more thing") is his own 2D idle, which the form keeps.
    open: ['idle', 'walk', 'dash', 'crouch', 'jump'],
    // He covers behind the briefcase raised in the presenting hand, the
    // shoulders turned a little away.
    block: { armF: { x: -10, y: 6 }, armB: { x: -4, y: -6 }, twist: -0.12 },
    // The presenting hand out in front of him, the device at the middle of
    // his chest.
    handDepth: { F: 0.8, B: 0.75 },
    guardTurn: 0.7,
    // The flourish and the held finish are written into the punch itself.
    motion: { windup: 1, follow: 1, drop: 3, squash: 0.04, brace: 0, thrust: 3 },
    tracks: { punch: BIG_FINISH, kick: SHOW_KICK, slap: SHOW_SLAP, launch: SHOW_UPPER },
    // Hit, he sells it, the arms thrown up. He goes down with them flung up
    // over his head, and wins presenting himself to the crowd, chin up, the
    // presenting hand sweeping up.
    hit: { lean: 1.2, armF: { x: 50, y: -176 }, armB: { x: 14, y: -166 }, hand: 'open' },
    // The fall: he sells it, going over too far and bouncing back.
    ko: { armF: { x: 24, y: -210 }, armB: { x: -20, y: -200 }, hand: 'open', fall: { time: 0.55, rot: -1.5, ease: 'outBack' } },
    victory: {
      rate: 0.8,
      keys: carried([
        { t: 0,   hand: 'open', joints: { armF: { x: 70, y: -176 }, armB: { x: 30, y: -150 }, hipY: -84, shoulderY: -152, headY: -182, headX: 2, bodyLean: -0.08 } },
        { t: 0.5, hand: 'open', joints: { armF: { x: 78, y: -196 }, armB: { x: 30, y: -150 }, hipY: -84, shoulderY: -152, headY: -184, headX: 2, bodyLean: -0.1 }, ease: 'inOutCubic' },
        { t: 1,   hand: 'open', joints: { armF: { x: 70, y: -176 }, armB: { x: 30, y: -150 }, hipY: -84, shoulderY: -152, headY: -182, headX: 2, bodyLean: -0.08 }, ease: 'inOutCubic' },
      ]),
    },
    // He struts: tall, the chest out, the knees lifting high, the presenting
    // hand keeping time. He jumps in a split for the crowd, the presenting
    // hand thrown up, and gathers his legs to land.
    walk: { stride: 10, lift: 14, bob: 3, lean: -0.08, back: -0.1, roll: 0.06, hip: 0.08, swing: 4, beat: 6 },
    jump: {
      up: { legF: { x: 46, y: -36 }, legB: { x: -42, y: -30 }, armF: { x: 60, y: -214 }, lean: -0.1 },
      down: { legF: { x: 22, y: -20 }, legB: { x: -14, y: -14 }, lean: -0.06 },
    },
    // He goes down as if taking a knee for the crowd, deep and upright. He
    // sweeps in chest first, the presenting hand out in front, and glides
    // back, leaning away.
    crouch: { hip: 32, shoulder: 30, head: 31, lean: -0.04, sx: 1.04, sy: 0.94, legF: { x: 30, y: 0 }, legB: { x: -34, y: 0 }, armF: { x: 0, y: -6 } },
    dash: {
      drop: 2, lean: -0.06, legF: { x: 34, y: -16 }, legB: { x: -30, y: 0 }, armF: { x: 8, y: -12 },
      back: { drop: 0, lean: -0.14, legF: { x: 14, y: 0 }, legB: { x: -24, y: -8 }, armF: { x: 0, y: 0 } },
    },
    // Its signature special, in its own form (above).
    specials: { pitchdeck: SHOW_DECK },
    // The steal and the bomb everyone has, in its own way (above).
    moves: { steal: SHOW_STEAL, bomb: SHOW_BOMB },
    // Its command moves, by input (above).
    commands: { 'fwd+launch': SHOW_ONEMORE },
    // UNICORN MODE going on. He takes a showman's bow, the presenting hand
    // swept low across him and the tablet held out behind.
    super: { fade: 0.3, hand: 'open', joints: { armF: { x: 60, y: -110 }, armB: { x: -20, y: -140 }, hipY: -84, shoulderY: -150, headY: -178, headX: 8, bodyLean: 0.45, sy: 1.02 } },
    // How it opens the round (above).
    intro: SHOW_INTRO,
  },
  shoulderRoll: {
    stance: { head: -2, lean: -0.04, armF: ROLL_F, armB: ROLL_B, legF: { x: 20 }, legB: { x: -23 } },
    // He blocks the way the guard means to, rolling the shot off the lead
    // shoulder: the body turned well away, that shoulder up, the hands where
    // they were.
    block: { armF: { x: 4, y: -12 }, armB: { x: 0, y: -4 }, twist: -0.28 },
    // The lead fist across the belly toward the middle, the rear one at the
    // chin, turning with the chest.
    handDepth: { F: 0.7, B: 0.8 },
    guardTurn: 1,
    // The coil and the snap back are written into the whip itself.
    motion: { windup: 1, follow: 1, drop: 3, squash: 0.06, brace: 6, thrust: 4 },
    tracks: { punch: WHIP, kick: ROLL_KICK, slap: ROLL_SLAP, launch: ROLL_UPPER },
    // Hit, he takes it badly, both hands to his face. He goes down with one
    // arm flung up, and wins with his arms crossed and his chin up, swaying.
    hit: { lean: 1.3, armF: { x: 36, y: -164 }, armB: { x: 30, y: -168 } },
    // The fall: he drops quickly.
    ko: { armF: { x: 40, y: -190 }, armB: { x: -30, y: -120 }, fall: { time: 0.38, rot: -1.45, ease: 'outQuad' } },
    victory: {
      rate: 0.6,
      keys: carried([
        { t: 0,   joints: { armF: { x: 20, y: -140 }, armB: { x: 28, y: -142 }, hipY: -84, shoulderY: -152, headY: -181, headX: 2, bodyLean: -0.06 } },
        { t: 0.5, joints: { armF: { x: 22, y: -142 }, armB: { x: 30, y: -144 }, hipY: -84, shoulderY: -152, headY: -182, headX: 0, bodyLean: -0.02 }, ease: 'inOutCubic' },
        { t: 1,   joints: { armF: { x: 20, y: -140 }, armB: { x: 28, y: -142 }, hipY: -84, shoulderY: -152, headY: -181, headX: 2, bodyLean: -0.06 }, ease: 'inOutCubic' },
      ]),
    },
    // He glides in, unhurried: the lead hand low and loose, the shoulders
    // rolling. He jumps with one knee up and the other leg hanging, no
    // effort in it.
    walk: { rate: 0.85, stride: 11, lift: 5, bob: 2, back: -0.06, roll: 0.1, hip: 0.03, swing: 5 },
    jump: {
      up: { legF: { x: 26, y: -40 }, legB: { x: -14, y: -6 } },
      down: { legF: { x: 22, y: -16 }, legB: { x: -18, y: -4 } },
    },
    // He sinks with his weight back, the lead hand still low. He slides in
    // low and easy, and leans back out of range as he goes.
    crouch: { hip: 24, shoulder: 24, head: 26, headX: -2, lean: 0, sx: 1.08, sy: 0.92, legF: { x: 30, y: 0 }, legB: { x: -22, y: 0 } },
    dash: {
      drop: 8, lean: 0.22, legF: { x: 36, y: -4 }, legB: { x: -32, y: -6 },
      back: { drop: 4, lean: -0.22, twist: -0.1, legF: { x: 26, y: -2 }, legB: { x: -30, y: -6 } },
    },
    // Its signature special, in its own form (above).
    specials: { burnrate: ROLL_BLAST },
    // The steal and the bomb everyone has, in its own way (above).
    moves: { steal: ROLL_STEAL, bomb: ROLL_BOMB },
    // Its command moves, by input (above).
    commands: { 'fwd+kick': ROLL_PLATFORM },
    // UNICORN MODE going on. He opens up, arms flung out and the chest
    // forward.
    super: { fade: 0.3, hand: 'open', joints: { armF: { x: 50, y: -170 }, armB: { x: -30, y: -170 }, hipY: -84, shoulderY: -152, headY: -182, headX: -2, bodyLean: -0.14, sy: 1.02 } },
    // How it opens the round (above).
    intro: ROLL_INTRO,
  },
  fence: {
    stance: { lean: 0.04, headX: 3, shoulder: -2, armF: FENCE_F, armB: FENCE_B, legF: { x: 22 }, legB: { x: -17 } },
    // The fence hand open wherever he is not hitting or holding the block
    // briefcase in it.
    open: ['idle', 'walk', 'dash', 'crouch', 'jump'],
    // He brings the briefcase in front of his chest in the fence hand and
    // turns a little away; the other hand stays in the pocket.
    block: { armF: { x: -6, y: -8 }, armB: { x: 0, y: 0 }, twist: -0.1 },
    // The fence hand out in front of the middle of his chest, the pocket hand
    // at his side.
    handDepth: { F: 0.75, B: 1 },
    // The pocket hand follows the chest round only a little.
    guardTurn: 0.3,
    // The slip is written whole; nothing about it should look heavy.
    motion: { windup: 1, follow: 1, drop: 2, squash: 0.03, brace: 0, thrust: 2 },
    tracks: { punch: SLIP, kick: FENCE_KICK, slap: FENCE_SLAP, launch: FENCE_UPPER },
    // Hit, he gives with it, the hand still in his pocket. He goes down with
    // it there too, and wins with both hands in his pockets and a shrug.
    hit: { lean: 0.8, armF: { x: 44, y: -136 }, armB: { x: -6, y: -104 }, hand: 'open' },
    // The fall: he slumps rather than falls, never quite flat.
    ko: { armF: { x: 30, y: -112 }, armB: { x: -6, y: -104 }, hand: 'open', fall: { time: 0.5, rot: -1.3, ease: 'outQuad' } },
    victory: {
      rate: 0.7,
      keys: carried([
        { t: 0,   hand: 'fist', joints: { armF: { x: 6, y: -104 }, armB: { x: -6, y: -104 }, hipY: -84, shoulderY: -152, headY: -178, headX: 2, bodyLean: 0 } },
        { t: 0.5, hand: 'fist', joints: { armF: { x: 6, y: -106 }, armB: { x: -6, y: -106 }, hipY: -84, shoulderY: -156, headY: -180, headX: 2, bodyLean: 0 }, ease: 'inOutCubic' },
        { t: 1,   hand: 'fist', joints: { armF: { x: 6, y: -104 }, armB: { x: -6, y: -104 }, hipY: -84, shoulderY: -152, headY: -178, headX: 2, bodyLean: 0 }, ease: 'inOutCubic' },
      ]),
    },
    // He sidles: a sliding shuffle, the feet hardly leaving the floor, the
    // hand in his pocket and the head bobbing. He hops, both feet together,
    // the hand still in his pocket.
    walk: { rate: 1.1, stride: 9, lag: Math.PI / 2, lift: 2, bob: 2, lean: 0.06, back: -0.02, roll: 0.04, swing: 3, nod: 2 },
    jump: {
      up: { legF: { x: 8, y: -10 }, legB: { x: -4, y: -8 } },
      down: { legF: { x: 6, y: -4 }, legB: { x: -4, y: -3 } },
    },
    // He squats, knees out, the hand still in his pocket. He scurries in
    // hunched, and backs off as if he had never been there.
    crouch: { hip: 30, shoulder: 26, head: 26, lean: 0.1, sx: 1.1, sy: 0.9, legF: { x: 26, y: 0 }, legB: { x: -22, y: 0 } },
    dash: {
      drop: 10, lean: 0.3, legF: { x: 30, y: -8 }, legB: { x: -26, y: -6 },
      back: { drop: 2, lean: -0.06, legF: { x: 16, y: -4 }, legB: { x: -26, y: -6 } },
    },
    // The steal and the bomb everyone has, in its own way (above).
    moves: { steal: FENCE_STEAL, bomb: FENCE_BOMB },
    // Its command moves, by input (above).
    commands: { 'fwd+slap': FENCE_MEMO },
    // UNICORN MODE going on. Both hands out of his pockets at last, palms up,
    // and a shrug: trust me.
    super: { fade: 0.3, hand: 'open', joints: { armF: { x: 44, y: -132 }, armB: { x: 26, y: -134 }, hipY: -84, shoulderY: -158, headY: -178, headX: 3, bodyLean: 0 } },
    // How it opens the round (above).
    intro: FENCE_INTRO,
    // ALIGNMENT SHIFT, the stance switch, which swings nothing: into SAFETY
    // he shows you his palms, safety first; into CAPABILITIES he leans in
    // with his arms spread, think bigger. Below the head, where the special's
    // banner does not cover them.
    shift: {
      hold: 0.25, fade: 0.25, hand: 'open',
      safety: { joints: { armF: { x: 46, y: -150 }, armB: { x: 32, y: -146 }, headX: 0, bodyLean: -0.12 } },
      capabilities: { joints: { armF: { x: 78, y: -150 }, armB: { x: -24, y: -140 }, headX: 8, bodyLean: 0.14 } },
    },
  },
  fencing: {
    stance: { lean: 0.02, head: -3, armF: EN_F, armB: EN_B, legF: { x: 17 }, legB: { x: -17 }, sy: 1.02 },
    // The lead hand loose and open wherever she is not holding the block
    // briefcase in it; her thrust keeps it open too.
    open: ['idle', 'walk', 'dash', 'crouch', 'jump'],
    // She parries: the lead hand, and the briefcase in it, swept in across her
    // line, the shoulders turned a touch away.
    block: { armF: { x: -8, y: -10 }, armB: { x: -2, y: -4 }, twist: -0.06 },
    // Side on: both hands in on her centre line, one behind the other.
    handDepth: { F: 0.5, B: 0.6 },
    guardTurn: 1,
    // Nothing in the hips, nothing that admits effort.
    motion: { windup: 1, follow: 1, drop: 0, squash: 0.02, brace: 0, thrust: 1 },
    tracks: { punch: THRUST, kick: EN_KICK, slap: EN_SLAP, launch: EN_UPPER },
    // Hit, she hardly moves, upright and stiff. She goes down stiff as a
    // board, and wins standing quite still, hands clasped in front of her,
    // staring.
    hit: { lean: 0.5, armF: { x: 46, y: -132 }, armB: { x: 36, y: -138 }, hand: 'open' },
    // The fall: stiff as a board, slow to start and then all the way flat.
    ko: { armF: { x: 12, y: -106 }, armB: { x: -8, y: -106 }, legF: { x: 12, y: -2 }, legB: { x: -10, y: -2 }, hand: 'open', fall: { time: 0.6, rot: -1.57, ease: 'inQuad' } },
    victory: {
      rate: 0.4,
      keys: carried([
        { t: 0,   hand: 'open', joints: { armF: { x: 26, y: -118 }, armB: { x: 20, y: -120 }, hipY: -86, shoulderY: -154, headY: -182, headX: 2, bodyLean: 0, sy: 1.02 } },
        { t: 0.5, hand: 'open', joints: { armF: { x: 26, y: -119 }, armB: { x: 20, y: -121 }, hipY: -87, shoulderY: -155, headY: -183, headX: 2, bodyLean: 0, sy: 1.02 }, ease: 'inOutCubic' },
        { t: 1,   hand: 'open', joints: { armF: { x: 26, y: -118 }, armB: { x: 20, y: -120 }, hipY: -86, shoulderY: -154, headY: -182, headX: 2, bodyLean: 0, sy: 1.02 }, ease: 'inOutCubic' },
      ]),
    },
    // She advances as a fencer does, the lead foot stepping and the rear one
    // following, upright and level: no bob, nothing in the arms. She jumps
    // straight up, the legs straight and together, and reaches for the floor
    // with the lead foot, as for a lunge.
    walk: { rate: 1.1, stride: 10, lag: Math.PI / 2, lift: 6, lean: 0.02, back: 0 },
    jump: {
      up: { legF: { x: 10, y: -6 }, legB: { x: -10, y: -6 } },
      down: { legF: { x: 28, y: -8 }, legB: { x: -20, y: -10 } },
      stretch: 0.3,
    },
    // She sinks into a low en garde, the feet long apart and the back
    // straight. She dashes in a lunge, the lead hand going out with it, and
    // retreats as a fencer does, upright.
    crouch: { hip: 26, shoulder: 26, head: 26, lean: 0.02, sx: 1.06, sy: 0.94, legF: { x: 36, y: 0 }, legB: { x: -34, y: 0 } },
    dash: {
      drop: 10, lean: 0.1, legF: { x: 52, y: -2 }, legB: { x: -40, y: 0 }, armF: { x: 22, y: 0 },
      back: { drop: 6, lean: 0.02, legF: { x: 22, y: 0 }, legB: { x: -34, y: -6 }, armF: { x: 0, y: 0 } },
    },
    // Its signature special, in its own form (above).
    specials: { pivot: EN_PIVOT },
    // The steal and the bomb everyone has, in its own way (above).
    moves: { steal: EN_STEAL, bomb: EN_BOMB },
    // Its command moves, by input (above).
    commands: { 'fwd+slap': EN_DEMO },
    // UNICORN MODE going on. A hand on her hip and the other raised palm up at
    // her shoulder, unveiling it.
    super: { fade: 0.3, hand: 'open', joints: { armF: { x: 64, y: -178 }, armB: { x: 6, y: -112 }, hipY: -84, shoulderY: -152, headY: -183, headX: 0, bodyLean: -0.04, sy: 1.04 } },
    // How it opens the round (above).
    intro: EN_INTRO,
  },
  peekaboo: {
    stance: { hip: 6, shoulder: 4, head: 6, lean: 0.18, armF: PEEK_F, armB: PEEK_B,
      legF: { x: 22 }, legB: { x: -20 }, sx: 0.97 },
    // The weave: the shoulders rolling a little from side to side at rest, the
    // hips a beat behind, quicker than anyone else's, on top of her own 2D
    // idle's two bounces a breath, which the form keeps.
    roll: { twist: 0.07, hip: 0.03, rate: 3.2 },
    // She shells up tighter still: both gloves up to the cheeks, the forearms
    // in front of the chin, turning a little into the hit.
    block: { armF: { x: -6, y: -10 }, armB: { x: -2, y: -8 }, twist: 0.06 },
    // Both fists in on her centre line in front of the jaw, the lead one a
    // little further out than the rear.
    handDepth: { F: 0.35, B: 0.5 },
    guardTurn: 1,
    // The bob and the snap back are written into the jab itself.
    motion: { windup: 1, follow: 1, drop: 2, squash: 0.05, brace: 4, thrust: 2 },
    tracks: { punch: SNAP, kick: PEEK_KICK, slap: PEEK_SLAP, launch: PEEK_UPPER },
    // Hit, she shells up, the fists staying at her jaw. She goes down with
    // them there, and wins looking at her nails, the other hand on her hip
    // (the nails held out in front of her chest: up by her face, the hand
    // hid it).
    hit: { lean: 0.7, armF: { x: 52, y: -150 }, armB: { x: 42, y: -154 } },
    // The fall: she crumples inside her shell.
    ko: { armF: { x: 50, y: -150 }, armB: { x: 40, y: -154 }, fall: { time: 0.42, rot: -1.4, ease: 'outQuad' } },
    victory: {
      rate: 0.5,
      keys: carried([
        { t: 0,   hand: 'open', joints: { armF: { x: 58, y: -150 }, armB: { x: 14, y: -110 }, hipY: -82, shoulderY: -150, headY: -176, headX: 3, bodyLean: 0.02 } },
        { t: 0.5, hand: 'open', joints: { armF: { x: 60, y: -153 }, armB: { x: 14, y: -110 }, hipY: -82, shoulderY: -150, headY: -176, headX: 4, bodyLean: 0.03 }, ease: 'inOutCubic' },
        { t: 1,   hand: 'open', joints: { armF: { x: 58, y: -150 }, armB: { x: 14, y: -110 }, hipY: -82, shoulderY: -150, headY: -176, headX: 3, bodyLean: 0.02 }, ease: 'inOutCubic' },
      ]),
    },
    // She comes in bobbing and weaving: low, the head dipping under with
    // every step and the shoulders turning it, the fists at her jaw. She
    // jumps in a tight ball, the knees to her chest.
    walk: { rate: 1.3, stride: 9, lift: 5, bob: 7, back: 0.12, roll: 0.12, hip: 0.04, nod: 4 },
    jump: {
      up: { legF: { x: 18, y: -48 }, legB: { x: 4, y: -42 }, lean: 0.24 },
      down: { legF: { x: 22, y: -18 }, legB: { x: -16, y: -14 } },
    },
    // She ducks deep, tight behind the fists, the head forward over them. She
    // darts in low, the head moved off the line, and pulls straight back.
    crouch: { hip: 22, shoulder: 26, head: 27, headX: 4, lean: 0.32, sx: 1.04, sy: 0.92, legF: { x: 28, y: 0 }, legB: { x: -24, y: 0 } },
    dash: {
      drop: 14, lean: 0.34, twist: 0.12, legF: { x: 34, y: -6 }, legB: { x: -30, y: -4 },
      back: { drop: 8, lean: -0.06, twist: 0, legF: { x: 20, y: -4 }, legB: { x: -32, y: -6 } },
    },
    // Its signature special, in its own form (above).
    specials: { growthhack: PEEK_RUSH },
    // The steal and the bomb everyone has, in its own way (above).
    moves: { steal: PEEK_STEAL, bomb: PEEK_BOMB },
    // Its command moves, by input (above).
    commands: { 'fwd+punch': PEEK_PUMP, 'fwd+kick': PEEK_RUG },
    // UNICORN MODE going on. She coils lower behind her forearms crossed in
    // front of her, and comes out of it as it fades.
    super: { fade: 0.3, joints: { armF: { x: 22, y: -146 }, armB: { x: 32, y: -144 }, hipY: -64, shoulderY: -136, headY: -158, headX: 4, bodyLean: 0.22, sy: 0.96 } },
    // How it opens the round (above).
    intro: PEEK_INTRO,
  },
  taiChi: {
    stance: { hip: -2, head: -4, lean: -0.02, armF: CALM_F, armB: CALM_B, legF: { x: 19 }, legB: { x: -19 },
      sy: 1.04, swayY: 1.1, swayRate: 1.3 },
    // The lead palm open wherever she is not holding the block briefcase in
    // it; her push keeps it open too.
    open: ['idle', 'walk', 'dash', 'crouch', 'jump'],
    // She turns the hit aside rather than meeting it: the lead hand, and the
    // briefcase in it, raised and drawn in across her, the shoulders turning
    // a little away with it.
    block: { armF: { x: -12, y: -14 }, armB: { x: 0, y: 0 }, twist: -0.08 },
    // The palm out in front of the middle of her chest, the tablet at her
    // side.
    handDepth: { F: 0.6, B: 0.95 },
    // The tablet hand follows the chest round only a little.
    guardTurn: 0.3,
    // Nothing thrown, the hips barely moving.
    motion: { windup: 1, follow: 1, drop: 1, squash: 0.02, brace: 0, thrust: 1 },
    tracks: { punch: PUSH, kick: CALM_KICK, slap: CALM_SLAP, launch: CALM_UPPER },
    // Hit, she sways back a little and no more. She goes down composed, a
    // palm on her chest, and wins breathing slowly, the arms opening palms up
    // and closing again.
    hit: { lean: 0.5, armF: { x: 56, y: -136 }, armB: { x: 38, y: -116 }, hand: 'open' },
    // The fall: she settles to the floor slowly, as if choosing to.
    ko: { armF: { x: 28, y: -140 }, armB: { x: 16, y: -122 }, hand: 'open', fall: { time: 0.85, rot: -1.45, ease: 'smooth' } },
    victory: {
      rate: 0.35,
      keys: carried([
        { t: 0,   hand: 'open', joints: { armF: { x: 50, y: -130 }, armB: { x: 30, y: -126 }, hipY: -88, shoulderY: -154, headY: -186, headX: 2, bodyLean: -0.02 } },
        { t: 0.5, hand: 'open', joints: { armF: { x: 70, y: -150 }, armB: { x: 40, y: -140 }, hipY: -90, shoulderY: -156, headY: -188, headX: 2, bodyLean: -0.02 }, ease: 'inOutCubic' },
        { t: 1,   hand: 'open', joints: { armF: { x: 50, y: -130 }, armB: { x: 30, y: -126 }, hipY: -88, shoulderY: -154, headY: -186, headX: 2, bodyLean: -0.02 }, ease: 'inOutCubic' },
      ]),
    },
    // She glides, slow and level: each foot placed before her weight goes onto
    // it, the head never rising or falling, the arms drifting. She leaves the
    // floor as a crane stands, the lead knee lifted high and the rear leg long
    // beneath her, the lead hand opening.
    walk: { rate: 0.6, stride: 9, lift: 4, back: -0.04, roll: 0.05, hip: 0.05, swing: 4 },
    jump: {
      up: { legF: { x: 22, y: -58 }, legB: { x: -6, y: -2 }, armF: { x: 70, y: -176 } },
      down: { legF: { x: 20, y: -30 }, legB: { x: -10, y: -4 } },
      stretch: 0.5,
    },
    // She sinks low over the rear foot with the lead leg stretched out long in
    // front of her, the lead hand following it down. She glides in and out,
    // level, as she walks.
    crouch: { hip: 34, shoulder: 30, head: 32, lean: 0.06, sx: 1.06, sy: 0.94, legF: { x: 46, y: 0 }, legB: { x: -20, y: 0 }, armF: { x: 6, y: 10 } },
    dash: {
      drop: 4, lean: 0.02, legF: { x: 34, y: -4 }, legB: { x: -30, y: -2 }, armF: { x: 10, y: -4 },
      back: { drop: 4, lean: -0.04, legF: { x: 18, y: -2 }, legB: { x: -32, y: -4 }, armF: { x: 0, y: 0 } },
    },
    // Its signature special, in its own form (above).
    specials: { fundinground: CALM_ROUND },
    // The steal and the bomb everyone has, in its own way (above).
    moves: { steal: CALM_STEAL, bomb: CALM_BOMB },
    // Its command moves, by input (above).
    commands: { 'fwd+launch': CALM_CONVICTION },
    // UNICORN MODE going on. The arms opening wide, palms up, the chin raised,
    // and slower out of it than anyone.
    super: { fade: 0.45, hand: 'open', joints: { armF: { x: 70, y: -176 }, armB: { x: -10, y: -150 }, hipY: -90, shoulderY: -154, headY: -186, headX: -1, bodyLean: -0.08, sy: 1.05 } },
    // How it opens the round (above).
    intro: CALM_INTRO,
  },
};
