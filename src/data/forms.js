// Fighting forms: how a fighter stands, guards and throws, as a martial art
// rather than as a personality. Boxing first (November 2026), for the
// sculpted Jeff, then brawling, for Adam, grappling, for Carl, showboating,
// for Steve, and the shoulder roll, for Elo; karate, kung fu and the rest are
// each their own when a fighter takes them up.
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

// A bar-room brawler's guard, Adam's from 2D: slouched low on the hips, the
// fists down at the belly and too far apart, chin tucked, the widest base in
// the cast. Ready to fight, never once ready to defend.
const BRAWL_F = { x: 60, y: -126 };
const BRAWL_B = { x: 42, y: -134 };
const B_HIP = -70, B_SHOULDER = -148, B_HEAD = -168;    // REST lowered by the stance

// The haymaker: all wind-up and no control. The fist goes back by his ear
// and the whole body turns away with it, the deepest coil in the cast, so
// everyone sees it coming; then it swings round and through, the hips
// dragging the shoulders, and keeps going after the hit has landed, the body
// turned on past the target and off balance, before he stumbles back to his
// guard. The rear fist stays down at the belly, where his guard keeps it.
const HAYMAKER = {
  own: true,
  keys: carried([
    { t: 0,    joints: { armF: BRAWL_F, armB: BRAWL_B, hipY: B_HIP, shoulderY: B_SHOULDER, headY: B_HEAD, headX: 2, bodyLean: 0.14, twist: 0, hipTwist: 0, sx: 1.06, sy: 0.98, legF: { x: 33, y: 0 }, legB: { x: -31, y: 0 } } },
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

// A grappler's stance, Carl's from 2D: hunched well forward over a wide low
// base, chin down, the lead hand open and reaching at chest height for
// something to take hold of, the rear one low with his briefcase.
const GRAB_F = { x: 64, y: -134 };
const GRAB_B = { x: 44, y: -122 };
const G_HIP = -68, G_SHOULDER = -140, G_HEAD = -160;   // REST lowered by the stance

// The seizure: a grappler does not hit you, he takes hold of you. The weight
// sinks and the open hand draws in, then shoots out at the chest with the
// body behind it, closes on whatever it finds (`hand`, the lead hand's shape
// in 3D) and hauls it back in to his chest, the body turning away with the
// pull, before he lets go and settles back. The rear hand keeps the case low
// throughout.
const SEIZE = {
  own: true,
  keys: carried([
    { t: 0,    hand: 'open', joints: { armF: GRAB_F, armB: GRAB_B, hipY: G_HIP, shoulderY: G_SHOULDER, headY: G_HEAD, headX: 2, bodyLean: 0.22, twist: 0, hipTwist: 0, sx: 1.04, sy: 0.96, legF: { x: 31, y: 0 }, legB: { x: -29, y: 0 } } },
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

// A showman's guard, Steve's from 2D: mid-presentation, tall, the chest open,
// the lead hand open, out and high, showing you the thing, and the device
// held at the chest in the other.
const SHOW_F = { x: 66, y: -170 };
const SHOW_B = { x: 42, y: -142 };
const S_HIP = -84, S_SHOULDER = -152, S_HEAD = -183;   // REST, the head raised by the stance

// The big finish: a flourish, the open hand swept up and back over his
// shoulder and the body turned away with it, the chest open to the
// audience; the hand closes at the top of it, and the punch comes down
// straight at the chest. Then he holds the finish a beat too long, chin up,
// because the swing is a demo and the demo needs an audience, before he
// opens the hand and goes back to presenting. The device stays at his chest.
const BIG_FINISH = {
  own: true,
  keys: carried([
    { t: 0,    hand: 'open', joints: { armF: SHOW_F, armB: SHOW_B, hipY: S_HIP, shoulderY: S_SHOULDER, headY: S_HEAD, headX: 2, bodyLean: -0.06, twist: 0, hipTwist: 0, sx: 1, sy: 1.02, legF: { x: 21, y: 0 }, legB: { x: -19, y: 0 } } },
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

// A shoulder roll, Elo's from 2D: the lead arm dropped low across the belly,
// the rear fist parked at the chin, chin up, weight back. The guard of
// someone who thinks you are not worth putting his hands up for.
const ROLL_F = { x: 30, y: -112 };
const ROLL_B = { x: 40, y: -160 };
const R_HIP = -84, R_SHOULDER = -152, R_HEAD = -180;   // REST, the head raised by the stance

// The whip, a glass cannon's: power out of no mass. The low lead fist is
// drawn back past his hip and the body coils away with it, a huge wind-up
// anyone can read, then it whips up and out at the head, the body snapping
// round behind it, and is held out only as long as it can hit before it is
// snapped back home at once, which is why he is so punishable. The rear
// fist stays at his chin.
const WHIP = {
  own: true,
  keys: carried([
    { t: 0,    joints: { armF: ROLL_F, armB: ROLL_B, hipY: R_HIP, shoulderY: R_SHOULDER, headY: R_HEAD, headX: 2, bodyLean: -0.04, twist: 0, hipTwist: 0, sx: 1, sy: 1, legF: { x: 20, y: 0 }, legB: { x: -23, y: 0 } } },
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
    tracks: { punch: HAYMAKER },
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
    tracks: { punch: SEIZE },
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
    tracks: { punch: BIG_FINISH },
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
    tracks: { punch: WHIP },
  },
};
