// Central tuning for the whole game. All gameplay numbers live here.

// Bump this on every release — it's rendered on the title screen.
export const VERSION = 'v3.4';

// Every player fights on identical footing. Your base character is pure
// cosmetics: it decides how you LOOK, never how hard you hit. Ranked points
// have to measure the player, not which silhouette they happened to click.
// (The roster keeps varied stats — but only ever as AI opponents.)
export const PLAYER_STATS = { speed: 1.0, power: 1.0, hp: 100 };

export const STAGE = {
  W: 960,
  H: 540,
  FLOOR: 480,          // y of the ground line (fighter feet)
  MIN_X: 70,
  MAX_X: 890,
  // Backdrop scrim: how far the arena is pushed down so the fighters read as
  // the subject. Render-only — the sim never sees it. Measured with
  // lab/contrast.js; see the note in render.js drawStageGrade.
  SCRIM: 0.42,
};

export const PHYS = {
  WALK: 250,           // px/s, scaled by fighter speed stat
  AIR_DRIFT: 0.78,     // fraction of walk speed while airborne
  JUMP_V: -760,
  GRAVITY: 2100,
  KB_DECAY: 7,         // knockback velocity decay per second (exponential)
  PUSH_APART: 340,     // separation speed when bodies overlap
  BODY_W: 56,          // hurtbox width
  BODY_H: 148,         // hurtbox height standing
};

export const ROUND = {
  TIME: 60,
  BEST_OF: 3,          // first to 2
  WINS_NEEDED: 2,
  INTRO_ROUND_T: 1.0,  // "ROUND N" duration
  INTRO_FIGHT_T: 0.55, // "FIGHT!" duration
  KO_SLOWMO_T: 1.15,
  ROUND_END_T: 1.6,
  VICTORY_T: 2.3,
};

export const METER = {
  MAX: 100,
  HIT_DEAL: 12,
  HIT_TAKE: 8,
  CHIP_DEAL: 3,
  BOMB_COST: 25,
  SPECIAL_COST: 50,
  SUPER_COST: 100,
};

export const BOMB = {
  dmg: 10, vx: 380, vy: -430, g: 1150, radius: 92,
  kb: 300, kbUp: -220, stun: 0.4,
  startup: 0.16, active: 0.05, recovery: 0.3,
};

export const DASH = {
  SPEED: 1450,
  DURATION: 0.16,
  COOLDOWN: 1.6,
  CANCEL_AFTER: 0.06,   // attacks can cancel the dash after this
};

// Mystery drops: seeded briefcases with hidden one-shot powers.
export const DROPS = {
  FIRST_AT: 5,          // seconds of fight time before a round's first drop
  FIRST_JITTER: 3,
  INTERVAL_MIN: 7,      // between drops within the same round
  INTERVAL_MAX: 12,
  FALL_SPEED: 320,
  LIFETIME: 7,          // seconds on the ground before vanishing
  PICKUP_RANGE: 46,
  BUFF_TIME: 5,
  BUFF_SPEED: 1.4,
  BUFF_DMG: 1.4,
  SHIELD_TIME: 8,
};

export const UNICORN = {
  DURATION: 6,
  DMG_MULT: 1.35,
  SPEED_MULT: 1.25,
  POP_FREEZE: 0.45,    // dramatic pause on activation
};

export const BLOCK = {
  CHIP: 0.15,          // fraction of damage taken while blocking
  PUSH: 120,           // pushback on blocked hit
};

// Chain combos: attacks cancel into the next tier ON HIT (whiffs stay punishable).
// slap → punch → kick → special / C&D / Unicorn. Later hits deal scaled damage.
export const COMBO = {
  SCALING: [1, 0.85, 0.7, 0.6, 0.5, 0.45, 0.4],  // damage mult by victim's chain depth
  JAB_CHAIN_KB: 0.55,                  // chained light hits shove less, so strings stay in range
  MILESTONES: { 3: 'COMBO!', 5: 'SYNERGY!', 7: 'DISRUPTED!', 10: 'ACQUIRED!' },
  // ONE RULE: when an attack lands, cancel it into ANY other basic — no ladder,
  // no order to memorise. The old rank system (slap<punch<kick, per-move caps)
  // was the "too complicated / wouldn't activate" complaint: players had to
  // remember which move could follow which, and a wrong guess did nothing.
  BASICS: ['slap', 'punch', 'kick', 'launch'],
  MAX_CHAIN: 5,          // basics per string before you must finish
};

export const ATTACKS = {
  // 🚀 LAUNCH — rising uppercut. The anti-air the game was missing: beats
  // jump-ins, launches on hit so you can follow up, but whiffs hard if you
  // throw it out at nothing (long recovery). Free, no meter.
  launch: { startup: 0.06, active: 0.10, recovery: 0.28, dmg: 10, reach: 74,  hitY: -150, kb: 150, kbUp: -420, stun: 0.36, shake: 8,  words: ['LAUNCH!', 'SHIPPED!', 'LIFTOFF!'] },
  slap:  { startup: 0.04, active: 0.06, recovery: 0.12, dmg: 4,  reach: 78,  hitY: -112, kb: 70,  kbUp: 0,    stun: 0.20, shake: 4,  words: ['SLAP!', 'SMACK!', 'DISRESPECT!'] },
  punch: { startup: 0.05, active: 0.06, recovery: 0.11, dmg: 7,  reach: 84,  hitY: -104, kb: 110, kbUp: 0,    stun: 0.24, shake: 6,  words: ['POW!', 'JAB!', 'BAM!'] },
  kick:  { startup: 0.10, active: 0.08, recovery: 0.17, dmg: 12, reach: 106, hitY: -78,  kb: 320, kbUp: -120, stun: 0.32, shake: 9,  words: ['WHAM!', 'SMACK!', 'BOOM!'] },
};

// ---------------------------------------------------------------------------
// FIGHTING STYLES
//
// Every character plays differently, not just looks different. A style scales
// the shared move set — speed, damage and reach — so the same three buttons
// feel like a different fighter in each pair of hands. Multipliers are kept
// mild and compensating (faster ⇒ weaker, stronger ⇒ slower) so distinctiveness
// never becomes a straight power advantage.
//
// `stance` drives the idle + crouch poses in drawFighter, so a character reads
// as themselves even while standing still.
// ---------------------------------------------------------------------------
export const STYLES = {
  balanced: {
    name: 'BALANCED', blurb: 'No holes, no gimmicks. Textbook.',
    startup: 1.00, dmg: 1.00, reach: 1.00, recovery: 1.00, speed: 1.00, hp: 1.00, stance: 'ready',
  },
  rushdown: {
    name: 'RUSHDOWN', blurb: 'Fastest hands and feet — but the thinnest skin.',
    startup: 0.82, dmg: 0.88, reach: 0.94, recovery: 0.90, speed: 1.12, hp: 0.93, stance: 'coiled',
  },
  brawler: {
    name: 'BRAWLER', blurb: 'Hits hardest and takes the most. Slow to start.',
    startup: 1.22, dmg: 1.18, reach: 1.04, recovery: 1.12, speed: 0.88, hp: 1.10, stance: 'heavy',
  },
  zoner: {
    name: 'ZONER', blurb: 'Longest reach. Keeps you at arm\'s length all day.',
    startup: 1.08, dmg: 0.96, reach: 1.22, recovery: 1.05, speed: 0.94, hp: 1.02, stance: 'poised',
  },
  trickster: {
    name: 'TRICKSTER', blurb: 'Slippery and quick to recover. Never where you swung.',
    startup: 0.90, dmg: 0.92, reach: 1.02, recovery: 0.84, speed: 1.06, hp: 0.96, stance: 'loose',
  },
  showman: {
    name: 'SHOWMAN', blurb: 'Flashy and well-rounded. Style is the damage.',
    startup: 0.94, dmg: 1.06, reach: 0.98, recovery: 0.98, speed: 1.00, hp: 0.99, stance: 'flair',
  },
  grappler: {
    name: 'GRAPPLER', blurb: 'Short reach, brutal up close. Get in or get nothing.',
    startup: 1.10, dmg: 1.22, reach: 0.86, recovery: 1.08, speed: 0.92, hp: 1.08, stance: 'heavy',
  },
  glass: {
    name: 'GLASS CANNON', blurb: 'Hits like a lawsuit. Folds like a startup.',
    startup: 0.96, dmg: 1.30, reach: 1.00, recovery: 1.14, speed: 1.02, hp: 0.86, stance: 'loose',
  },
  technical: {
    name: 'TECHNICAL', blurb: 'Fastest recovery. Chains longer than anyone.',
    startup: 1.00, dmg: 0.94, reach: 1.06, recovery: 0.78, speed: 0.98, hp: 1.00, stance: 'poised',
  },
  phantom: {
    name: 'PHANTOM', blurb: 'Barely there. Low damage, impossible to pin down.',
    startup: 0.86, dmg: 0.86, reach: 1.08, recovery: 0.82, speed: 1.10, hp: 0.92, stance: 'loose',
  },
};

// 💸 Acqui-Hire: close-range talent raid that siphons the rival's energy.
export const STEAL = {
  AMOUNT: 15, COOLDOWN: 3.5,
  startup: 0.12, active: 0.08, recovery: 0.3, reach: 92, stun: 0.18,
};

// Perfectly timed block (tap block just before impact) = parry.
export const PARRY = { WINDOW: 0.12, STAGGER: 0.5, ENERGY: 10 };

// Internal keys stay intern/founder/mogul (used everywhere); label is the
// display name shown to players.
export const AI_LEVELS = {
  intern:  { label: 'ROOKIE',    react: 0.42, blockProb: 0.16, aggr: 0.45, mistake: 0.30, specialProb: 0.25, chain: 0.2,  mult: 1.0 },
  founder: { label: 'CONTENDER', react: 0.26, blockProb: 0.38, aggr: 0.68, mistake: 0.14, specialProb: 0.55, chain: 0.5,  mult: 1.5 },
  mogul:   { label: 'CHAMPION',  react: 0.14, blockProb: 0.62, aggr: 0.85, mistake: 0.05, specialProb: 0.8,  chain: 0.85, mult: 2.5 },
};

export const POINTS = {
  WIN_BASE: 20,
  KO_BONUS: 5,          // per round won by KO
  STREAK_BONUS: 3,      // × current streak, capped
  STREAK_CAP: 15,
  LOSS: 3,
  CHALLENGE_MULT: 2.0,
};

export const RANKS = [
  { min: 0,    name: 'GARAGE DREAMER' },
  { min: 60,   name: 'BOOTSTRAPPER' },
  { min: 150,  name: 'SEED STAGE' },
  { min: 300,  name: 'SERIES A' },
  { min: 550,  name: 'SERIES B' },
  { min: 900,  name: 'GROWTH STAGE' },
  { min: 1400, name: 'PRE-IPO' },
  { min: 2000, name: 'UNICORN' },
  { min: 3200, name: 'DECACORN' },
];

export function rankFor(points) {
  let r = RANKS[0];
  for (const rank of RANKS) if (points >= rank.min) r = rank;
  return r.name;
}

export const SAVE_KEY = 'uec-save-v1';

export const DEBUG = typeof location !== 'undefined'
  && new URLSearchParams(location.search).has('debug');

// ---------------------------------------------------------------------------
// BODY PROPORTIONS
//
// Bounded knobs, all defaulting to 1.0. Clamped rather than free so hurtbox
// and camera maths stay predictable and balance stays reasonable. Widening a
// range later is safe; the clamp is the only thing enforcing it.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// ARCADE PROPORTIONS
//
// An anatomically sane figure reads as a puppet at 196px. Arcade fighters read
// because the parts that DO things are oversized: gloves, boots, forearms.
// Everything here is exaggeration applied at draw time — hitboxes come from
// ATTACKS and the hurtbox comes from PHYS, so none of it touches balance.
//
// Limbs also taper. A single-width capsule from shoulder to hand is a stick;
// a thin upper arm running into a thick forearm running into a glove is a
// limb, and it costs one extra segment to draw.
// ---------------------------------------------------------------------------
export const STYLIZE = {
  HAND_F: 12.5,        // front glove — the thing that hits you
  HAND_B: 10.5,
  FOOT_W: 30, FOOT_H: 12,
  UPPER_ARM: 13,       // narrow at the shoulder…
  FOREARM: 16,         // …heavy at the glove
  THIGH: 24, SHIN: 17,   // legs must out-weigh arms or the figure reads top-heavy
  // Limb mass. A limb was two EVEN capsules — one tube shoulder to elbow, a
  // second elbow to wrist — which is why the cast still read as dolls with
  // arms pushed into them however good the shading got. These are width
  // multipliers sampled along each half: heavy at the shoulder and hip,
  // pinched at the elbow and knee, swelling again through the forearm and calf
  // before tapering to the wrist and ankle. Same anatomy every fighting game
  // exaggerates, and it is a couple of extra strokes per limb.
  LIMB_UPPER: [1.32, 1.10, 0.84],   // shoulder/hip → belly → elbow/knee
  LIMB_LOWER: [0.90, 1.08, 0.68],   // elbow/knee → belly → wrist/ankle
  // Deltoid cap as a multiple of the upper arm, drawn UNDER the limb so only
  // the part that protrudes past it shows. There was no shoulder at all before
  // — the arm socketed straight into the torso.
  DELTOID: 1.45,
  HEAD_R: 18,
  // How far a folded limb bows at the joint. Scales to zero as it straightens,
  // so a fully extended punch has a straight arm and a guard has a bent one.
  ELBOW: 14, KNEE: 12,
  ARM_SPAN: 130,       // limb length treated as fully extended
  LEG_SPAN: 138,
  // Shoulder-to-hip distance every torso DETAIL is authored against. Collars,
  // ties, lapels, plackets and hems were pinned at raw pixel offsets from the
  // collar, so a longer torso kept them all bunched at the neck above a blank
  // expanse — which is why a taller skeleton rendered as a slab instead of a
  // taller person. Detail is placed as a fraction of this now, so the outfit
  // stretches with the body.
  // = REST.hipY - REST.shoulderY on the stock rig, so k is exactly 1 and a
  // neutral body renders byte-identically to before this change. Move it if
  // the stance moves, or every outfit quietly shifts.
  TORSO_REF: 68,
  // How far the base of the skull sits BELOW the shoulder line. The neck gap
  // was a free number — headY and shoulderY were independent — so it only
  // looked attached by coincidence of the values chosen. Shrink the head
  // without moving headY and the skull floats clear of the body; on the stock
  // rig it happens to overlap by exactly this much, so deriving it changes
  // nothing today and makes the head impossible to detach tomorrow.
  NECK_OVERLAP: 4,
  // How much a body's head follows its overall height. At 0 the skull is a
  // fixed size that the `head` knob scales, independent of how tall the
  // character is — so a short founder with a big-head knob and a tall one with
  // a small-head knob compound, and the cast's heads-tall spread doubled the
  // moment the base skull shrank (0.93 -> 1.76 across six fighters). At 1 the
  // skull tracks the body, `head` becomes "how big is my head FOR MY SIZE",
  // and the spread comes only from that knob — which is what it always meant.
  HEAD_FOLLOW: 1,
  // Silhouette key line. Measured with lab/contrast.js: 39% of a fighter's
  // on-screen pixels sat within 1.5 contrast of the stage behind them, and
  // every one of those was in the 0–80 luminance band — the ink outline, the
  // hair, the shadow side. Dark character on dark stage. Brightening the whole
  // body would flatten the cel shading that gives it form, so instead a pale
  // line rides just OUTSIDE the silhouette: the edge always reads, and the
  // interior keeps its full range. Render-only; the sim never sees it.
  // 2.0px at 0.5 measured best and looked worst — the cast read as die-cut
  // stickers. The eye wins over the metric here: the line exists to make the
  // edge legible, not to be seen.
  KEYLINE_PX: 2.0,
  KEYLINE_COL: '#dce6ff',
  KEYLINE_A: 0.62,
  // The fighting face. Every founder used to stand in their idle wearing a
  // gentle closed-mouth smile — six disgraced executives beaming at the person
  // about to hit them. Nothing else on the character said "cartoon" as loudly.
  // Brows angle DOWN toward the nose, a heavy lid narrows the eye, and the
  // mouth is set rather than curved. Victory still smiles; that one is earned.
  FACE: {
    BROW_LEN: 5.5,      // half-length of the brow stroke
    BROW_Y: 8,          // height above eye centre
    BROW_TILT: 3.2,     // inner end drops this much — the whole expression
    BROW_TILT_HARD: 2.4,  // extra drop when angry or blocking
    BROW_W: 3.2,        // brows are heavier than the old hairline strokes
    LID_Y: 4.2,         // upper lid sits just above the pupil
    LID_W: 2.4,
    EYE_W: 4.4,         // lid half-width
    MOUTH_Y: 0.46,      // fraction of head radius below centre
    MOUTH_W: 6,
    // Defaults only — every roster fighter overrides these with its own face
    // (see `face:` on each entry in data/fighters.js). Render-only.
    PUPIL_R: 2.5,        // eye size: a slit at 1.6, a stare at 3.6
    MOUTH_CURVE: 1.8,    // < 0 scowls, > 0 is pleased with itself
  },
  // Vertical form shading: warm key at the head, crushing to near-black at the
  // feet. The crush looks like it must be the problem — the biggest single
  // source of near-invisible pixels is the lower body, 57% of all loss — so I
  // softened it and added a bounce light off the floor, which is what a real
  // lit stage does. Measured: loss got monotonically WORSE, 29.6% -> 33.2%.
  //
  // Re-run since, varying ONLY this alpha with the gradient shape untouched —
  // the first sweep had also moved the floor stop from 1.0 to 0.82, so its
  // "original" row was not the original. Same answer: 30.9% -> 34.1% as the
  // crush comes out. The direction is solid across both sweeps.
  //
  // I do not have a confirmed mechanism for it. An earlier revision asserted
  // the legs read against the lit perspective floor; that was a guess, and 68%
  // of all loss genuinely is in the legs. Treat 0.30 as measured, not
  // explained, and leave it alone until someone measures a reason to move it.
  SHADE_KEY: 0.46,      // warm key at the head
  // How the key is applied. 'source-atop' is a flat lerp and CONVERGES — it
  // pulled every dark hair in the roster to the same grey. 'screen' lifts
  // without collapsing the differences between them. See drawFighter.
  SHADE_KEY_MODE: 'overlay',
  SHADE_MID: 0.10,      // neutral through the torso
  SHADE_FLOOR: 0.30,    // crush at the feet — do not soften, see above
};

// ---- CHARACTER PARTS -------------------------------------------------------
// Render-only geometry a character carries outside its body outline: a held
// prop, a coat, a cape. Limits live here rather than in the engine so a part
// can be swept without editing render code.
//
// MAX is deliberately small. Six shapes is more than enough for a readable
// silhouette, and a cap is what stops one character costing the frame budget.
export const PARTS = {
  MAX: 6,             // parts per character
  MAX_POINTS: 24,     // vertices in a `path` part
  MIN_POINTS: 3,
  OFFSET: [-120, 120], // dx / dy range, rig px
  SIZE: [1, 160],      // w / h / r range, rig px
  ROT: [-Math.PI, Math.PI],
  FOLLOW: [0, 1],      // cloth lag; 0 is rigid to the anchor
};

export const BODY = {
  height:    [0.82, 1.22],   // overall scale
  build:     [0.85, 1.25],   // torso + limb thickness
  reach:     [0.88, 1.20],   // arm length; feeds effective move reach
  stride:    [0.88, 1.18],   // leg length
  shoulders: [0.85, 1.25],
  head:      [0.90, 1.12],
};

// ---- STANCE SWITCH ---------------------------------------------------------
// A toggle, not a timer: you stay in a stance until you switch back, the round
// ends, or you are KO'd. Neither set is strictly better than neutral, which is
// what keeps a stance from being a free upgrade — `taken` is the price.
//
// These STACK multiplicatively with Unicorn Mode, deliberately. A stance is a
// trade and Unicorn is a pure buff, so capabilities+Unicorn is dangerous but
// also takes 15% extra damage for exactly the six seconds the opponent most
// wants to punish. This is the call in the design most likely to be wrong on
// contact with play; if it proves oppressive, make Unicorn force `safety`.
export const STANCE = {
  CD: 0.8,          // seconds between switches
  COST: 0,          // meter cost; 0 in v1 — pricing a toggle is unresolved
  SETS: {
    safety:       { startup: 1.15, dmg: 0.85, recovery: 0.90, speed: 0.95, taken: 0.85 },
    capabilities: { startup: 0.90, dmg: 1.20, recovery: 1.15, speed: 1.05, taken: 1.15 },
  },
};

// ---------------------------------------------------------------------------
// POWER BUDGET
//
// v2.3 shipped Carl Icahnt at +58% damage AND +10% HP because nothing stopped
// style multipliers from compounding. This makes that class of error
// structurally impossible instead of something review has to catch.
//
// speed is weighted above 1.0 because movement advantage compounds with
// everything else. startup/recovery sit below 1.0 to avoid double-counting
// frame advantage. hurtbox is a REFUND — a bigger body is easier to hit, so
// size is partly self-balancing.
// ---------------------------------------------------------------------------
export const BUDGET = {
  W: {
    dmg: 1.0, hp: 1.0, speed: 1.2, reach: 1.0,
    startup: 0.7, recovery: 0.5,
    bodyReach: 0.8, hurtbox: -0.6,
    // A counter and a trap put their power in `params`, not in frame data, and
    // for a long time NOTHING in params was priced — a 0.05s counter window and
    // a 60s one cost exactly the same, as did a 78px trap and a 400px one.
    // These are the axes that actually make those two archetypes stronger.
    // Below dmg, because a window is opportunity rather than output; above
    // recovery, because opportunity on defence is worth more than frames back.
    window: 0.6,        // counter: how long the turn-back stays open
    trapRadius: 0.5,    // trap: how much ground it denies
    trapLife: 0.35,     // trap: how long it denies it for
    trapArm: 0.3,       // trap: how fast it goes live (INVERTED — sooner is better)
    trapCount: 0.8,     // trap: how many can be out at once. Stacking is the strong one.
  },
  // The reference move for each params axis: the shipped design that is, by
  // definition, priced at zero. Deviation from these is what costs.
  NOMINAL: {
    window: 0.18,       // LAWYERED, the counter a player can actually pick
    trapRadius: 78, trapLife: 5.5, trapArm: 0.35, trapCount: 1,   // RUG PULL
  },
  WARN: 8,     // |cost| above this warns
  BLOCK: 15,   // |cost| above this blocks export

  // ---- command normals ----
  // A command normal is priced against the neutral basic on its own button, so
  // "free" means "that basic, on a direction". Two things are charged: what the
  // archetype can do at all, and how much better its frame data is.
  CMD: {
    MAX_SLOTS: 3,
    // Situational: a command normal only comes out with a direction held, so an
    // equal frame-data edge is worth far less here than on a global multiplier.
    // Pricing it at full weight would make every command normal unaffordable.
    SCALE: 0.25,
    // Turning a grounded basic into a launcher opens combo routes the base move
    // has no access to, which the frame-data deltas alone do not capture.
    LAUNCHER: 3,
    ARCHETYPE: {
      strike: 0,
      aoe: 2.5, counter: 3, trap: 3.5, rush: 3.5,
      projectile: 4, teleport: 4, rain: 4.5, grab: 5,
    },
    // Ratio bounds against the base move. Frame data crosses the wire in a
    // challenge link, so these are a hard reject, not merely an expensive price.
    CLAMP: {
      startup: [0.5, 2.0], active: [0.5, 2.5], recovery: [0.5, 2.0],
      dmg: [0.4, 2.0], reach: [0.5, 1.8],
    },
  },
};
