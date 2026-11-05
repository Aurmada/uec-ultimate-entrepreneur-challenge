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
    { t: 0,    joints: { armF: GUARD_F, armB: GUARD_B, hipY: HIP, shoulderY: SHOULDER, headY: HEAD, headX: 2, bodyLean: 0.12, twist: 0, hipTwist: 0, sx: 1, sy: GUARD_SY, legF: { x: 24, y: 0 }, legB: { x: -30, y: 0 } } },
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

// The fence, Scam's from 2D: one hand in his pocket, the other up open-palmed
// in front of his chest, the placating gesture of a man explaining why it
// was fine, and also, quietly, a fence that keeps you at arm's length.
const FENCE_F = { x: 60, y: -146 };
const FENCE_B = { x: -6, y: -104 };
const F_HIP = -84, F_SHOULDER = -154, F_HEAD = -178;   // REST, the shoulders raised by the stance
// the head as far forward as the stance puts it, its own 3 on top of REST's 2
// (keyed at 3, it jumped 2 px back on the first frame of every slip)
const F_HEADX = 5;

// The slip: understated on the way in, lingering on the way out. The open
// hand barely draws in, so it reads as less than it is, closes only as it
// lands, and stays out after the hit, unhurried, before it opens again
// into the same placating hand. The other hand never leaves his pocket.
const SLIP = {
  own: true,
  keys: carried([
    { t: 0,    hand: 'open', joints: { armF: FENCE_F, armB: FENCE_B, hipY: F_HIP, shoulderY: F_SHOULDER, headY: F_HEAD, headX: F_HEADX, bodyLean: 0.04, twist: 0, hipTwist: 0, sx: 1, sy: 1, legF: { x: 22, y: 0 }, legB: { x: -17, y: 0 } } },
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

// A fencer's guard, Lizbeth's from 2D, and the stillest in the game: narrow
// and upright, side on, the lead hand loose and forward at the chest and the
// rear one close behind it, as if holding something fragile.
const EN_F = { x: 54, y: -136 };
const EN_B = { x: 40, y: -142 };
const E_HIP = -84, E_SHOULDER = -152, E_HEAD = -181;   // REST, the head raised by the stance

// The thrust: economical to the point of eerie. The hand barely draws back,
// then goes straight out along its own line, fingers first, the lead foot
// stepping after it and nothing in the hips; it comes straight back the way
// it went. The hand never closes: nothing about it admits effort.
const THRUST = {
  own: true,
  keys: carried([
    { t: 0,    hand: 'open', joints: { armF: EN_F, armB: EN_B, hipY: E_HIP, shoulderY: E_SHOULDER, headY: E_HEAD, headX: 2, bodyLean: 0.02, twist: 0, hipTwist: 0, sx: 1, sy: 1.02, legF: { x: 17, y: 0 }, legB: { x: -17, y: 0 } } },
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

// A peek-a-boo guard, Kim's from 2D, the most compact outline in the game:
// crouched in and leaning forward, both fists high and tight in front of the
// jaw with the elbows tucked, the face just above them (over the face, the
// fists hid the one thing her character is about).
const PEEK_F = { x: 54, y: -150 };
const PEEK_B = { x: 43, y: -154 };
const K_HIP = -70, K_SHOULDER = -142, K_HEAD = -165;   // REST lowered by the coiled stance and hers

// The snap: the shortest wind-up and the fastest reset in the game. She dips
// under the line first, the head and the knees bobbing down together and
// the fists staying at the jaw, then comes up out of the dip with the jab
// already out, straight from the chin, and has it back at the jaw before you
// have registered it left, the head slipping off the line again as it
// comes home.
const SNAP = {
  own: true,
  keys: carried([
    { t: 0,    joints: { armF: PEEK_F, armB: PEEK_B, hipY: K_HIP, shoulderY: K_SHOULDER, headY: K_HEAD, headX: 2, bodyLean: 0.18, twist: 0, hipTwist: 0, sx: 0.97, sy: 1, legF: { x: 22, y: 0 }, legB: { x: -20, y: 0 } } },
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

// A tai chi ready stance, Cathie's from 2D, the calmest in the game: upright
// and tall, the lead palm open and level in front of the chest where it can
// keep you away, the rear hand low at the waist with the tablet, breathing
// slowly.
const CALM_F = { x: 66, y: -140 };
const CALM_B = { x: 42, y: -116 };
const T_HIP = -88, T_SHOULDER = -152, T_HEAD = -184;   // REST, the head raised by the stance

// The push: nothing is thrown, everything is placed. The palm draws in to
// the chest as the weight settles back, then goes out level and unhurried,
// the weight moving forward behind it and the body upright, the hips all
// but still and no turn of the shoulders; it rests out there, and comes back
// the way it went. The hand stays open throughout; the tablet stays low.
const PUSH = {
  own: true,
  keys: carried([
    { t: 0,    hand: 'open', joints: { armF: CALM_F, armB: CALM_B, hipY: T_HIP, shoulderY: T_SHOULDER, headY: T_HEAD, headX: 2, bodyLean: -0.02, twist: 0, hipTwist: 0, sx: 1, sy: 1.04, legF: { x: 19, y: 0 }, legB: { x: -19, y: 0 } } },
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
    tracks: { punch: SLIP },
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
    tracks: { punch: THRUST },
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
    tracks: { punch: SNAP },
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
    tracks: { punch: PUSH },
  },
};
