// Authored keyframe animation.
//
// RENDER-ONLY. Nothing here may be read by fighter.js, game.js, hit
// resolution, or anything that crosses the wire. Live matches are
// deterministic lockstep: the instant a pose can influence the simulation,
// two peers running different animation data diverge, and it surfaces as a
// voided match that looks like a network fault. test/determinism.test.js
// pins this, including a structural check that no sim module imports us.
//
// ---------------------------------------------------------------------------
// TIMING
//
// Attack tracks are keyed in PHASE SPACE, not in seconds and not in a flat
// 0..1:
//
//     t ∈ [0,1)  startup   — the wind-up
//     t ∈ [1,2)  active    — the hitbox is out
//     t ∈ [2,3]  recovery  — the commitment you pay for
//
// This matters because startup/active/recovery differ per move, per style and
// per character. A flat 0..1 track would smear the impact across whichever
// phase happened to be longest, which is precisely how the old uniform-time
// sprite playback flattened a punch into a shove. In phase space a key at
// t=0.9 is "just before the hitbox comes out" for every move in the game.
//
// Everything else (idle, walk, block, ko…) is keyed 0..1 across the state.

// The joint set a pose is made of — the same flat shape the renderer has
// always consumed, so a track and a computed pose are interchangeable.
// The neutral stance every pose is measured from.
//
// It used to be a person standing up straight with their hands out: feet 29px
// apart on a ~209px figure, hips high, torso vertical, back hand down by the
// waist. Fighting games do not stand like that — they sit low, wide and
// coiled, weight between the feet, back hand up near the chin. Feet are 51px
// apart now, hips and shoulders drop, the torso leans in, and the rear hand
// comes up to guard.
//
// Attack tracks mostly do not key the legs, so they inherit this width and get
// stancier for free. Render-only: hurtboxes come from ATTACKS, never the pose.
//
// The guard (October 2026): both fists up where they protect the face, the
// lead one forward of the chin and the rear one by the cheek, elbows down. The
// rear fist used to sit at x 13, which is inside the torso, and the back arm
// is drawn behind the torso, so a fighter's second hand simply never showed.
// It now sits in front of the face, clear of the head, where it reads. Chin
// tucked a little forward over a slightly deeper lean, and the whole body set
// 4px lower, so the knees bend instead of standing on straight legs.
export const REST = {
  hipY: -84, shoulderY: -152, headX: 2, headY: -178, rot: 0, crouch: 0,
  armF: { x: 58, y: -152 }, armB: { x: 41, y: -158 },
  legF: { x: 26, y: 0 }, legB: { x: -25, y: 0 },
  bodyLean: 0.08, sx: 1, sy: 1,
  twist: 0, hipTwist: 0,
};

const VEC_KEYS = ['armF', 'armB', 'legF', 'legB'];
// twist and hipTwist turn the shoulders and the hips about the spine, in
// radians, positive bringing the lead side forward. Only the 3D rig can show
// a turn (engine/gl3d/rig.js), so they are 0 except where a fighting form
// keys them (data/forms.js); the 2D figure ignores them.
const NUM_KEYS = ['hipY', 'shoulderY', 'headX', 'headY', 'rot', 'crouch', 'bodyLean', 'sx', 'sy', 'twist', 'hipTwist'];

export const EASE = {
  linear:  (k) => k,
  inQuad:  (k) => k * k,
  outQuad: (k) => 1 - (1 - k) * (1 - k),
  inCubic: (k) => k * k * k,
  outCubic: (k) => 1 - Math.pow(1 - k, 3),
  inOutCubic: (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2),
  // overshoot, for the snap on impact
  outBack: (k) => 1 + 2.7 * Math.pow(k - 1, 3) + 1.7 * Math.pow(k - 1, 2),
};

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a, b, k) => a + (b - a) * k;

// A fresh, freely mutable copy of any rig. The source is never handed out.
export function poseFrom(src = REST) {
  return {
    ...src,
    armF: { ...src.armF }, armB: { ...src.armB },
    legF: { ...src.legF }, legB: { ...src.legB },
  };
}

// A fresh pose at rest. Callers mutate freely; REST is never handed out.
export function restPose() { return poseFrom(REST); }

// Blend b into a by k, in place on a. Only joints present in b move, so a
// sparse keyframe means "leave everything else alone" rather than "snap the
// rest to zero" — which is what lets a character override two joints without
// re-authoring a whole pose.
export function blendInto(a, b, k) {
  if (!b) return a;
  for (const key of NUM_KEYS) {
    if (typeof b[key] === 'number') a[key] = lerp(a[key], b[key], k);
  }
  for (const key of VEC_KEYS) {
    const v = b[key];
    if (!v) continue;
    if (typeof v.x === 'number') a[key].x = lerp(a[key].x, v.x, k);
    if (typeof v.y === 'number') a[key].y = lerp(a[key].y, v.y, k);
  }
  return a;
}

// Where a keyframe track sits at time `t`, expressed in that track's own
// timebase. Returns a pose plus whatever flags the surrounding keys carry.
//
// Returns null for an unusable track, which is deliberate: the caller then
// falls back to the computed pose, so a malformed override degrades to the
// stock animation rather than to a T-pose.
export function samplePose(track, t, base) {
  const keys = Array.isArray(track) ? track : (track && track.keys);
  if (!Array.isArray(keys) || keys.length === 0) return null;

  const pose = base ? base : restPose();
  let lo = keys[0];
  let hi = keys[keys.length - 1];
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    if (!k || typeof k.t !== 'number') return null;      // malformed → fall back
    if (k.t <= t) { lo = k; hi = keys[i + 1] || k; }
  }

  // A held key pins its pose until the next one is reached, which is how a
  // recovery reads as a real commitment instead of drifting back to idle.
  let k = 0;
  if (hi !== lo && !lo.hold) {
    const span = hi.t - lo.t;
    k = span > 0 ? clamp01((t - lo.t) / span) : 1;
    const fn = EASE[hi.ease] || EASE[lo.ease] || EASE.linear;
    k = fn(k);
  }

  blendInto(pose, lo.joints, 1);
  if (hi !== lo && !lo.hold) blendInto(pose, hi.joints, k);

  // `smear` marks the frames worth stretching — the draw layer reads it, the
  // simulation never sees it.
  pose.smear = !!(lo.smear || (hi.smear && k > 0.35));
  if (lo.face || hi.face) pose.face = (k > 0.5 && hi.face) ? hi.face : (lo.face || hi.face);
  return pose;
}

// Adds a sampled pose into `P` as a DELTA FROM REST, rather than replacing it.
//
// This is what lets an authored loop coexist with a hand-tuned stance. Idle
// poses carry per-character silhouettes — a rushdown crouches like a sprinter,
// a brawler like a sumo — and a track that overwrote the pose would flatten all
// of that into one shape. Layering the delta means the track supplies the
// BREATHING and the stance keeps the identity.
// The rig every existing character idle was authored against.
//
// Those overrides are ABSOLUTE joint positions that happen to sit near the old
// neutral pose, and addDelta turns them into deltas by subtracting a base. If
// that base is the LIVE rest pose, then moving the stance silently rewrites
// every override: retuning REST.headY from -134 to -182 turned Kim's idle from
// "head 0px from neutral" into "head 48px lower", which drove her head into
// her own chest, and dropped four characters' hands off their arms. Nothing
// warned, because the data was still perfectly valid — it was measured against
// a rig that no longer existed.
//
// A track may declare its own `base`; otherwise it is assumed to predate this
// and is measured against the rig below, which must never change.
export const AUTHORED_REST = Object.freeze({
  hipY: -66, shoulderY: -114, headX: 0, headY: -134, rot: 0, crouch: 0,
  armF: Object.freeze({ x: 30, y: -98 }), armB: Object.freeze({ x: 18, y: -90 }),
  legF: Object.freeze({ x: 15, y: 0 }), legB: Object.freeze({ x: -14, y: 0 }),
  bodyLean: 0, sx: 1, sy: 1,
  twist: 0, hipTwist: 0,     // added with the joints, at the zero every pose then had
});

export function addDelta(P, pose, base) {
  if (!P || !pose) return P;
  // Per-key fallback: a partial base is a silent NaN factory otherwise, since
  // the sampled pose always carries every joint even when the base does not.
  const B = base || AUTHORED_REST;
  const at = (k) => (B[k] !== undefined ? B[k] : AUTHORED_REST[k]);
  for (const key of NUM_KEYS) {
    if (typeof pose[key] === 'number') P[key] += pose[key] - at(key);
  }
  for (const key of VEC_KEYS) {
    const v = pose[key];
    if (!v) continue;
    const b = at(key);
    P[key].x += v.x - b.x;
    P[key].y += v.y - b.y;
  }
  return P;
}

// Maps an attack's real elapsed time into phase space (see the header).
export function attackPhaseT(stateT, startup, active, recovery) {
  if (stateT < startup) return startup > 0 ? clamp01(stateT / startup) : 1;
  const a = stateT - startup;
  if (a < active) return 1 + (active > 0 ? clamp01(a / active) : 1);
  const r = a - active;
  return 2 + (recovery > 0 ? clamp01(r / recovery) : 1);
}

// The track a character uses for a state: their own override, else the base
// set, else nothing (and the caller keeps its computed pose). A character can
// therefore never end up without an animation.
export function trackFor(def, state, baseTracks) {
  const over = def && def.animOverrides;
  const own = over && over[state];
  if (Array.isArray(own) || (own && Array.isArray(own.keys))) return own;
  return (baseTracks && baseTracks[state]) || null;
}

// Attacks must telegraph. An attack track with no wind-up keys reads as a
// move that simply happens, which is the single biggest difference between a
// stylised fighter and a puppet snapping between positions.
export const MIN_ANTICIPATION_KEYS = 2;

export function validateTrack(name, track, { attack = false } = {}) {
  const errors = [];
  const keys = Array.isArray(track) ? track : (track && track.keys);
  if (!Array.isArray(keys) || !keys.length) {
    errors.push(`${name}: track has no keys`);
    return errors;
  }
  let last = -Infinity;
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    if (!k || typeof k.t !== 'number' || !Number.isFinite(k.t)) {
      errors.push(`${name}[${i}]: t must be a finite number`);
      continue;
    }
    if (k.t < last) errors.push(`${name}[${i}]: keys must be ordered by t`);
    last = k.t;
    if (k.ease && !EASE[k.ease]) errors.push(`${name}[${i}]: unknown ease ${k.ease}`);
    if (k.joints && typeof k.joints !== 'object') errors.push(`${name}[${i}]: joints must be an object`);
  }
  if (attack) {
    const windUp = keys.filter(k => typeof k.t === 'number' && k.t < 1).length;
    if (windUp < MIN_ANTICIPATION_KEYS) {
      errors.push(`${name}: needs at least ${MIN_ANTICIPATION_KEYS} wind-up keys before the hitbox (t < 1), has ${windUp}`);
    }
    if (!keys.some(k => typeof k.t === 'number' && k.t >= 2)) {
      errors.push(`${name}: needs a recovery key (t >= 2)`);
    }
  }
  return errors;
}
