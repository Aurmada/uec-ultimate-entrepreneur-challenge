// Procedural fighter rendering: a posed vector rig with per-fighter outfits,
// hairstyles, faces (or an uploaded photo as the face), and comic outlines.
// Also renders the portrait busts used across the UI.

import { shade } from '../data/fighters.js';
import { STYLES, STYLIZE, GL3D, PHYS, UNICORN, ROUND, STANCE } from '../config.js';
import { clampBody, applyProportions, bufferMetrics } from './proportions.js';
import { loadSpriteSet, drawSprite } from './sprites.js';
import { samplePose, attackPhaseT, trackFor, addDelta, poseFrom, restPose, AUTHORED_REST, REST } from './anim.js';
import { BASE_TRACKS, ATTACK_TRACK, NOMINAL_REACH } from '../data/tracks.js';
import { resolveParts, drawParts, partLagState } from './parts.js';
import { has3D, form3D, pending3D, on3DReady, render3D, renderBust3D, mark2D, timing3D, layerActive3D, drawLayer3D, athlete3D } from './gl3d/index.js';
import { PAINTED_LOOKS, resolveLook3D } from '../data/models3d.js';
import { FX_STYLE } from './fx.js';
import { drawFigure, figureHead, figureFrame } from './figure.js';

// How many idle loops per second. The stock track is one breath.
const IDLE_RATE = 0.62;

const OUTLINE = '#0a0c16';
export const FILTER_OK = typeof CanvasRenderingContext2D !== 'undefined' && 'filter' in CanvasRenderingContext2D.prototype;

// dataURL → Image cache for photo faces
const photoCache = new Map();
let onPhotoReady = null;
// UI registers a callback so portraits re-render once an async photo decodes.
export function setPhotoReadyCallback(cb) { onPhotoReady = cb; }
export function getPhoto(dataUrl) {
  if (!dataUrl) return null;
  let img = photoCache.get(dataUrl);
  if (!img) {
    img = new Image();
    img.onload = () => { if (onPhotoReady) onPhotoReady(); };
    img.src = dataUrl;
    photoCache.set(dataUrl, img);
  }
  return img.complete && img.naturalWidth ? img : null;
}

// Warm the cache and resolve once the photo is decoded — call before rendering
// a one-shot canvas (e.g. the challenge card) so the photo shows on first paint.
export function ensurePhoto(dataUrl) {
  return new Promise((resolve) => {
    if (!dataUrl) return resolve(null);
    let img = photoCache.get(dataUrl);
    if (img && img.complete) return resolve(img.naturalWidth ? img : null);
    if (!img) {
      img = new Image();
      img.onload = () => { if (onPhotoReady) onPhotoReady(); };
      img.src = dataUrl;
      photoCache.set(dataUrl, img);
    }
    img.addEventListener('load', () => resolve(img.naturalWidth ? img : null), { once: true });
    img.addEventListener('error', () => resolve(null), { once: true });
  });
}

// INK scales the black outline weight. Bumped >1 while rendering the shaded
// fighter buffer for the bolder inked look; stays 1 for portraits/flat mode.
let INK = 1;

function capsule(ctx, x1, y1, x2, y2, w, color, outline = true) {
  ctx.lineCap = 'round';
  if (outline) {
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = w + 5 * INK;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }
  ctx.strokeStyle = color; ctx.lineWidth = w;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
}

// A limb with a joint in it. Two tapered segments meeting at an elbow/knee
// that bows perpendicular to the limb and straightens as the limb extends —
// so a guard has a bent arm and a landed punch has a straight one, for free,
// off the same two endpoints the poses already provide.
//
// `bend` is signed: arms bow one way, legs the other, which is what stops a
// kick from reading as a backwards knee.
// Sub-segments along a straight run, widths sampled from a profile.
function limbRun(out, ax, ay, bx, by, w, profile) {
  const n = profile.length - 1;
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n;
    out.push({
      x1: ax + (bx - ax) * t0, y1: ay + (by - ay) * t0,
      x2: ax + (bx - ax) * t1, y2: ay + (by - ay) * t1,
      w: w * (profile[i] + profile[i + 1]) * 0.5,
    });
  }
}

function jointed(ctx, x1, y1, x2, y2, wNear, wFar, color, bend, span) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 1) { capsule(ctx, x1, y1, x2, y2, wFar, color); return; }
  const slack = Math.max(0, 1 - len / span);        // 0 when fully extended
  const px = -dy / len, py = dx / len;              // perpendicular
  const ex = x1 + dx * 0.5 + px * bend * slack;
  const ey = y1 + dy * 0.5 + py * bend * slack;

  const segs = [];
  limbRun(segs, x1, y1, ex, ey, wNear, STYLIZE.LIMB_UPPER);
  limbRun(segs, ex, ey, x2, y2, wFar, STYLIZE.LIMB_LOWER);

  // Outline every sub-segment BEFORE filling any of them. Outline-then-fill
  // per segment (which is what capsule does alone) leaves each segment's dark
  // cap stamped across the middle of the next one, so a tapered limb comes out
  // banded like a caterpillar. Two passes make the whole limb one shape.
  ctx.lineCap = 'round';
  ctx.strokeStyle = OUTLINE;
  for (const s of segs) {
    ctx.lineWidth = s.w + 5 * INK;
    ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); ctx.stroke();
  }
  ctx.strokeStyle = color;
  for (const s of segs) {
    ctx.lineWidth = s.w;
    ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); ctx.stroke();
  }
}

// A boot that points where the leg points. Left axis-aligned, a horizontal
// kicking leg ends in a flat plate seen edge-on, and the whole limb reads as a
// plank; rotating it turns the sole toward the opponent, which is the single
// clearest signal that the thing coming at you is a foot.
//
// A standing leg points almost straight down, so the rotation there is a couple
// of degrees and the boot still sits flat on the floor.
function boot(ctx, hipX, hipY, footX, footY, w, h, color, anchor) {
  const rot = Math.atan2(footY - hipY, footX - hipX) - Math.PI / 2;
  ctx.save();
  ctx.translate(footX, footY);
  ctx.rotate(rot);
  blob(ctx, () => { ctx.roundRect(-w * anchor, -9, w, h, 5); }, color);
  ctx.restore();
}

function blob(ctx, drawPath, fill) {
  ctx.beginPath();
  drawPath();
  ctx.fillStyle = fill;
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 3.5 * INK;
  ctx.lineJoin = 'round';
  ctx.fill();
  ctx.stroke();
}

const ease = {
  outBack: (k) => 1 + 2.7 * Math.pow(k - 1, 3) + 1.7 * Math.pow(k - 1, 2),
  outQuad: (k) => 1 - (1 - k) * (1 - k),
  inQuad: (k) => k * k,
  smooth: (k) => k * k * (3 - 2 * k),
};

// ---------------------------------------------------------------- pose

// Samples the authored track for an attack, or null when there is none to use.
//
// Tracks are authored against a NOMINAL reach, so the strike is re-scaled to
// the move's real reach — a zoner visibly out-ranges a grappler off the same
// keyframes, and a command normal with its own reach extends to match. Only
// the forward limbs scale; the back arm and planted foot are posture, not range.
// They scale about where the hitbox starts (PHYS.HITBOX_LEAD), which is where
// a move of no reach at all would put the fist, so the fist and the hitbox's
// far edge move together. They used to scale about the rest pose's hand, and
// once the guard brought that hand forward to the chin, half the reach
// difference between a zoner and a grappler vanished from the screen.
//
// Tracks start and end in the stock guard (REST). A fighter whose own guard is
// elsewhere (Elo's dropped lead hand, Lizbeth's narrow feet) eases out of it
// through the wind-up and back into it through the recovery, so a swing leaves
// from the hands you were looking at and returns to them, instead of popping
// to the stock guard on the first frame and back on the last.
function trackedAttackPose(f, atk) {
  // A signature special a form has a track of its own for (forms.js
  // `specials`) plays it; every other move plays the basic its kind borrows,
  // as a signature special did before (Kim's whole GROWTH HACK rush was one
  // punch held for half a second). A command normal's archetype params ride
  // as `special` too, with no id, so they never match.
  // Then a command move, by its input (forms.js `commands`: a form is one
  // fighter's, so the input names the move), then the moves everyone has
  // (`moves`: the energy steal, the bomb) by their own kind, and only then
  // the basic the kind borrows.
  const over = f.def?.animOverrides;
  const own = atk.special && !atk.cmd && atk.special.id && `special:${atk.special.id}`;
  const cmd = atk.cmd && `cmd:${atk.cmd.slot}`, kind = `kind:${atk.kind}`;
  const name = own && over?.[own] ? own : cmd && over?.[cmd] ? cmd : over?.[kind] ? kind : ATTACK_TRACK[atk.kind];
  if (!name) return null;
  const track = trackFor(f.def, name, BASE_TRACKS);
  if (!track) return null;
  const t = attackPhaseT(f.stateT, atk.startup, atk.active, atk.recovery);
  const pose = samplePose(track, t);
  if (!pose) return null;

  const nominal = NOMINAL_REACH[name];
  const k = nominal && atk.reach ? atk.reach / nominal : 1;
  if (Math.abs(k - 1) > 0.01) {
    const A = PHYS.HITBOX_LEAD;
    // A track written in the fighter's own guard (a form's, data/forms.js)
    // starts and ends in it, which the re-scale would move, so the re-scale
    // comes in over the wind-up and goes over the recovery, whole only while
    // the move can hit: scaled throughout, Cathie's open palm jumped 11 px
    // out of her guard on the first frame of every push.
    const w = !track.own ? 1 : t < 1 ? ease.smooth(Math.max(0, t)) : t > 2 ? 1 - ease.smooth(Math.min(1, t - 2)) : 1;
    for (const limb of ['armF', 'legF']) {
      if (w === 1) pose[limb].x = A + (pose[limb].x - A) * k;
      else pose[limb].x += (A + (pose[limb].x - A) * k - pose[limb].x) * w;
    }
  }
  // A track written in the fighter's own guard starts and ends there already.
  if (f.def?.stance && !track.own) {
    const G = guardOf(f.def, (STYLES[f.def.style] || STYLES.balanced).stance);
    const dy = REST.shoulderY - G.shoulder;
    const own = t < 1 ? 1 - ease.smooth(Math.min(1, t / 0.9)) : t > 2.2 ? ease.smooth(Math.min(1, (t - 2.2) / 0.8)) : 0;
    // The rear hand is home for the whole swing: the tracks keep it at the
    // stock chin, so here it stays at the fighter's own, which is where any
    // prop they carry lives. Faded like the rest, the tablet and the parcel
    // rode up over their owners' faces on every strike.
    for (const limb of ['armF', 'armB', 'legF', 'legB']) {
      const w = limb === 'armB' ? 1 : own;
      if (!w) continue;
      pose[limb].x += (G[limb].x - REST[limb].x) * w;
      if (limb[0] === 'a') pose[limb].y += (G[limb].y + dy - REST[limb].y) * w;
    }
  }
  // An airborne attack tucks the planted leg — there is no floor to push off.
  if (f.airborne) { pose.legF.y -= 18; pose.legB.y -= 12; }
  applyMotion(pose, f.def, t);
  // The rear fist guards the chin, so it goes where the chin goes: a strike
  // drives the head forward through the shot, and a hand left behind ended up
  // on the face instead of beside it. (GL3D.HEAD_LEAN_PX is drawFighter's own
  // head lean, which the 3D rig copies.) As far as the head has moved from
  // where the track starts: the stock guard (REST) for the shared tracks, the
  // fighter's own for a form's, or measured from REST the rear hand left a
  // form's guard by up to 4 px on the first frame and came back on the last.
  const head = (P) => P.headX + (P.bodyLean || 0) * GL3D.HEAD_LEAN_PX;
  pose.armB.x += head(pose) - head(track.own ? trackStart(track) : REST);
  return pose;
}

// A form's signature specials, command moves and shared moves under the names
// trackedAttackPose looks them up by, made once per form.
const SPECIAL_TRACKS = new WeakMap();
function specialTracks(form) {
  if (!form.specials && !form.moves && !form.commands) return null;
  if (!SPECIAL_TRACKS.has(form)) {
    SPECIAL_TRACKS.set(form, Object.fromEntries([
      ...Object.entries(form.specials || {}).map(([id, track]) => [`special:${id}`, track]),
      ...Object.entries(form.commands || {}).map(([slot, track]) => [`cmd:${slot}`, track]),
      ...Object.entries(form.moves || {}).map(([kind, track]) => [`kind:${kind}`, track]),
    ]));
  }
  return SPECIAL_TRACKS.get(form);
}

const TRACK_START = new WeakMap();
function trackStart(track) {
  if (!TRACK_START.has(track)) TRACK_START.set(track, samplePose(track, 0));
  return TRACK_START.get(track);
}

// How this character throws a punch, as opposed to which punch they throw.
//
// All nine fighters shared one set of attack tracks, so every swing in the game
// moved identically — the STYLE multipliers changed how FAST a move was, which
// is simulation, but nothing changed how it looked. Carl's grab and Kim's jab
// were the same motion at different speeds.
//
// Shaping the shared tracks rather than authoring nine copies of each: four
// basics times nine fighters is thirty-six tracks to write and re-tune every
// time the rig moves, and the rig has moved three times this month.
//
// RENDER-ONLY. It reads `def.motion` and returns a pose; nothing here is
// visible to hit resolution, which still runs entirely off ATTACKS timing.
//
// The one hard rule: `armF.x` is NOT scaled during the active window. Reach is
// re-scaled just above so a zoner visibly out-ranges a grappler off the same
// keyframes, and stretching the strike arm for flavour would quietly relitigate
// that. Wind-up and follow-through are free to exaggerate — nothing is being
// measured there. The impact window only ever gets ADDITIVE weight.
function applyMotion(pose, def, t) {
  const M = def && def.motion;
  if (!M) return pose;

  if (t < 1 || t >= 2) {                       // coil, and follow-through
    const k = (t < 1 ? M.windup : M.follow) ?? 1;
    if (k !== 1) {
      for (const limb of ['armF', 'armB', 'legF', 'legB']) {
        pose[limb].x = REST[limb].x + (pose[limb].x - REST[limb].x) * k;
        pose[limb].y = REST[limb].y + (pose[limb].y - REST[limb].y) * k;
      }
      pose.bodyLean *= k;
      pose.hipY = REST.hipY + (pose.hipY - REST.hipY) * k;
    }
  } else {                                     // the hit itself
    const w = 1 - Math.min(1, Math.abs(t - 1.25) / 0.75);   // peaks on contact
    if (w > 0) {
      if (M.drop) pose.hipY += M.drop * w;
      // sy ONLY. sx scales the body horizontally about the feet, which drags
      // the strike hand with it — Carl's 0.12 squash would have thrown his fist
      // 12% past his own hitbox on every hit, which is the exact desync between
      // what you see and what hits you that the reach re-scale exists to stop.
      // Vertical compression plus the hip drop already read as weight.
      if (M.squash) pose.sy *= 1 - M.squash * 0.8 * w;
      // The back arm braces: the rear fist stays at the chin now, so it
      // tucks down tight to the chest as the hips turn, where it used to swing
      // back, which once the guard brought it to the chin meant into the face.
      if (M.brace) pose.armB.y += M.brace * 0.6 * w;
      if (M.thrust) pose.headX += M.thrust * w;  // head drives through the shot
    }
  }
  return pose;
}

// Each fighting style's stance, as changes to REST: hip, shoulder and head
// heights are deltas (down is positive), the rest absolute. Every one of them
// is a guard (October 2026). They were personality poses, arms hanging or
// folded or out to the side, and a fighter standing like that reads as
// someone waiting for a bus. The genre's rule is that everyone is READY: knees
// bent, feet staggered, both hands where they can strike or cover. The
// personality lives in where the hands sit inside that rule, not in breaking
// it. Both fists stay forward of the chest, too: the back arm is drawn behind
// the torso, so a rear hand at the body's centre simply disappears, and no
// fist rises past the eyes, where it would hide the face.
const STANCES = {
  ready: {},
  coiled: {                                    // rushdown: low, hands high and tight, leaning in
    hip: 8, shoulder: 6, head: 7, lean: 0.16,
    armF: { x: 48, y: -152 }, armB: { x: 37, y: -156 }, legF: { x: 24, y: 0 }, legB: { x: -23, y: 0 },
  },
  heavy: {                                     // brawler: wide and low, fists at the chest, chin down
    hip: 6, shoulder: 4, head: 6, lean: 0.12, sx: 1.05, sy: 0.98,
    armF: { x: 56, y: -138 }, armB: { x: 40, y: -144 }, legF: { x: 30, y: 0 }, legB: { x: -29, y: 0 },
  },
  poised: {                                    // zoner: tall, the lead hand long to hold the range
    hip: -2, head: -2, lean: 0.02, sy: 1.02,
    armF: { x: 68, y: -146 }, armB: { x: 40, y: -160 }, legF: { x: 22, y: 0 }, legB: { x: -24, y: 0 },
  },
  loose: {                                     // trickster: lead hand dropped, rear fist home, swaying
    lean: 0.04, sway: true,
    armF: { x: 50, y: -126 }, armB: { x: 38, y: -156 }, legF: { x: 22, y: 0 }, legB: { x: -22, y: 0 },
  },
  flair: {                                     // showman: chest up, the lead hand open and presenting
    head: -2, lean: -0.04,
    armF: { x: 64, y: -168 }, armB: { x: 38, y: -158 }, legF: { x: 22, y: 0 }, legB: { x: -21, y: 0 },
  },
};

// A fighter's own guard: where the style, then the character, put the hands
// and feet at rest, and the shoulder height the hands were placed against.
// Idle shows it as it is. Walking, crouching, jumping and dashing carry it
// with them, so a fighter keeps their own hands (and whatever they hold)
// rather than every state snapping to one shared guard. Kim stays in her
// peek-a-boo on the move, and Cathie's tablet stays at her waist in a crouch
// instead of rising over her face.
function guardOf(def, stance) {
  const st = STANCES[stance] || STANCES.ready;
  const S = def?.stance || {};
  return {
    shoulder: REST.shoulderY + (st.shoulder || 0) + (S.shoulder || 0),
    armF: { ...REST.armF, ...st.armF, ...S.armF },
    armB: { ...REST.armB, ...st.armB, ...S.armB },
    legF: { ...REST.legF, ...st.legF, ...S.legF },
    legB: { ...REST.legB, ...st.legB, ...S.legB },
  };
}

// The guard's hands, moved with the shoulders to wherever this state put them.
function carryGuard(P, G, lift = 0) {
  const dy = P.shoulderY - G.shoulder - lift;
  P.armF = { x: G.armF.x, y: G.armF.y + dy };
  P.armB = { x: G.armB.x, y: G.armB.y + dy };
}

// Returns limb targets in local space (+x = facing direction, y up = negative, origin at feet).
// Exported for the tests and the lab, which check what a pose means (a guard,
// a punch) without a canvas; the game only ever reaches it through drawFighter.
//
// `form` is a fighting form (data/forms.js) the fighter is drawn in, which
// stands in for their own stance, motion and attack tracks. Only a 3D model
// carries one for now (gl3d form3D), so the 2D fighters never see it.
// `intro` is how far into the round's start (ROUND and FIGHT!) the game is,
// in seconds, or null once the round is live (setRoundStart).
export function computePose(f, t, form = null, intro = null) {
  if (!form) return basePose(f, t);
  const def = { ...f.def, stance: form.stance, motion: form.motion ?? f.def?.motion,
    animOverrides: { ...f.def?.animOverrides, ...form.tracks, ...specialTracks(form) } };
  const P = basePose({ ...f, def }, t);
  if (f.state === 'idle' && form.roll) {
    // the shoulders and hips roll with the weight, the hips a beat behind
    const w = t * form.roll.rate;
    P.twist = Math.sin(w) * form.roll.twist;
    P.hipTwist = Math.sin(w - 0.6) * (form.roll.hip ?? 0);
  }
  if (f.state === 'idle' && form.bounce) {
    // the whole body rides the knees, hands and all
    const b = Math.sin(t * form.bounce.rate) * form.bounce.px;
    P.hipY += b; P.shoulderY += b; P.headY += b;
    P.armF.y += b; P.armB.y += b;
  }
  if (f.state === 'block' && form.block) {
    const G = guardOf(def, (STYLES[def.style] || STYLES.balanced).stance);
    const dy = P.shoulderY - G.shoulder;
    for (const k of ['armF', 'armB']) {
      P[k] = { x: G[k].x + form.block[k].x, y: G[k].y + dy + form.block[k].y };
    }
    P.twist = form.block.twist ?? 0;
  }
  // How a form takes a hit, goes down and celebrates (forms.js `hit`, `ko`,
  // `victory`). The timing stays basePose's, as it is for everyone: the snap
  // and settle of a hit, the fall of a KO. What the form says is where the
  // arms go and how far a hit throws the body, and the celebration itself, a
  // loop of its own.
  // The hit is taken from the form's own guard: its height, its feet and its
  // lean, the snap thrown back from there. It started from the stock
  // standing pose, so a low stance (Adam, Carl, Kim) stood up and narrowed its
  // feet on every hit, and dropped back down after: two pops a hit, and Carl's
  // hunch flipped to a lean back. The form's arms are written for the stock
  // height, so they come down with the body.
  if (f.state === 'hitstun' && form.hit) {
    const H = form.hit, G = restingGuard({ ...f, def }), dy = G.hipY - P.hipY;
    P.hipY += dy; P.shoulderY += dy; P.headY += dy;
    // A stoic form (`lean` under 1: Lizbeth, Cathie, Carl) still snaps on the
    // impact, the first few frames; it is the recovery that is composed. Scaled
    // throughout, its hit hardly moved it and the hit effects carried it alone.
    const sc = H.lean ?? 1, snap = sc < 1 ? Math.max(0, 1 - f.stateT * 14) : 0;
    const by = sc + (1 - sc) * snap;
    P.bodyLean = G.bodyLean + P.bodyLean * by;
    P.headX = G.headX + P.headX * by;
    P.legF = { ...G.legF }; P.legB = { ...G.legB };
    for (const k of ['armF', 'armB']) if (H[k]) P[k] = { x: H[k].x, y: H[k].y + dy };
    if (H.hand) P.hand = H.hand;
  }
  // Hit in the air (a juggle), the legs hung straight down as if on the
  // floor; they take the form's own jump at that moment of the rise and fall.
  if (f.state === 'hitstun' && f.airborne && form.jump) {
    const J = formJump({ ...f, def }, form.jump);
    P.legF = { ...J.legF }; P.legB = { ...J.legB };
  }
  if (f.state === 'ko' && form.ko) {
    for (const k of ['armF', 'armB', 'legF', 'legB']) if (form.ko[k]) P[k] = { ...form.ko[k] };
    if (form.ko.hand) P.hand = form.ko.hand;
    // and goes down its own way (`fall`): how long the fall takes, how far
    // over, and how (an ease of ours: in for a plank that topples, out for a
    // crash, back for one that bounces), where everyone fell the same 0.45 s.
    const F = form.ko.fall;
    if (F) {
      P.fall = ease[F.ease || 'outQuad'](Math.min(1, f.stateT / F.time));
      P.rot = F.rot * P.fall;
    }
  }
  if (f.state === 'victory' && form.victory) {
    const V = form.victory;
    const S = samplePose(V, (t * V.rate) % 1);
    for (const j of Object.keys(V.keys[0].joints)) P[j] = typeof S[j] === 'object' ? { ...S[j] } : S[j];
    if (S.hand) P.hand = S.hand;
  }
  // A move thrown with down held (Fighter.crouching, set each frame down is
  // held on the ground, the hurtbox crouched with it) is thrown from the
  // form's crouch: it stood up to swing while the game hit it as a crouching
  // fighter. The body goes down by the crouch's drop, but never below the
  // crouch itself (a move already written low, Kim's RUG PULL, stays as
  // written), and the planted feet widen to its stance. A hand or foot out of
  // the guard stays where the move puts it, which is where it hits (the
  // hitbox does not crouch, Fighter.hitbox), reached from lower down; the
  // nearer the guard it is, the more it comes down with the body. Letting go
  // of down mid-move stands it up, as it does the hurtbox.
  if (f.state === 'attack' && f.crouching && !f.airborne && form.crouch) {
    const C = form.crouch, G = restingGuard({ ...f, def }), d0 = C.drop ?? 0;
    const full = C.hip ?? d0;
    const drop = Math.max(0, Math.min(full, G.hipY + full - P.hipY));
    const k = full ? drop / full : 0;
    const shoulder = (C.shoulder ?? d0) * k;
    P.hipY += drop; P.shoulderY += shoulder; P.headY += (C.head ?? d0) * k;
    P.bodyLean += ((C.lean ?? G.bodyLean) - G.bodyLean) * k;
    const out = (p, g) => Math.min(1, Math.hypot(p.x - g.x, p.y - g.y) / REACHED_OUT);
    const o = {};
    for (const a of ['armF', 'armB']) {
      o[a] = out(P[a], G[a]);
      P[a] = { x: P[a].x, y: P[a].y + shoulder * (1 - o[a]) };
    }
    for (const l of ['legF', 'legB']) {
      o[l] = P[l].y < 0 ? out(P[l], G[l]) : 0;
      if (P[l].y < 0) P[l] = { x: P[l].x, y: Math.min(0, P[l].y + drop * (1 - o[l])) };
      else if (C[l]) P[l] = { x: P[l].x + (C[l].x - G[l].x) * k, y: 0 };
    }
    // and squashes as the crouch does (the move's own stretch stood a
    // crouching kick 12 to 22 px taller than the crouch), the squash taken
    // back off a hand or foot that is out, so it still strikes where it hits
    const cx = 1 + ((C.sx ?? 1) - 1) * k, cy = 1 + ((C.sy ?? 1) - 1) * k;
    P.sx = (P.sx ?? 1) * cx; P.sy = (P.sy ?? 1) * cy;
    for (const l of ['armF', 'armB', 'legF', 'legB']) {
      if (o[l]) P[l] = { x: P[l].x / (1 + (cx - 1) * o[l]), y: P[l].y / (1 + (cy - 1) * o[l]) };
    }
  }
  // A move thrown in the air keeps the form's own jump in the legs it does
  // not use (all but a kick's kicking leg), where they were the standing
  // move's tucked up by the same amount for everyone.
  if (f.state === 'attack' && f.airborne && form.jump) {
    const J = formJump({ ...f, def }, form.jump);
    P.legB = { ...J.legB };
    if ((f.attack?.button || f.attack?.kind) !== 'kick') P.legF = { ...J.legF };
  }
  // The round's start (forms.js `intro`): the fighters stand locked through
  // ROUND and FIGHT!, and each form spends it on a gesture of its own, which
  // ends in the guard and hands over to the live idle by the time the round
  // goes live.
  if (intro !== null && f.state === 'idle' && form.intro) {
    const k = Math.min(1, intro / (ROUND.INTRO_ROUND_T + ROUND.INTRO_FIGHT_T));
    const w = k < 0.85 ? 1 : 1 - ease.smooth((k - 0.85) / 0.15);
    if (w > 0) {
      const S = samplePose(form.intro, k);
      const mix = (a, b) => a * (1 - w) + b * w;
      for (const j of Object.keys(form.intro.keys[0].joints)) {
        P[j] = typeof S[j] === 'object' ? { x: mix(P[j].x, S[j].x), y: mix(P[j].y, S[j].y) } : mix(P[j] ?? 0, S[j]);
      }
      if (S.hand && w > 0.5) P.hand = S.hand;
    }
  }
  if (f.state === 'walk' && form.walk) Object.assign(P, formWalk({ ...f, def }, form.walk));
  if (f.state === 'jump' && form.jump) Object.assign(P, formJump({ ...f, def }, form.jump));
  if (f.state === 'crouch' && form.crouch) Object.assign(P, fromGuard(restingGuard({ ...f, def }), form.crouch));
  if (f.state === 'dash' && form.dash) {
    // The shared dash leans into a charge whichever way it goes, so a dash
    // back came out as a fighter charging while being dragged backwards.
    const D = form.dash, away = f.dashDir !== undefined && f.dashDir !== f.facing;
    Object.assign(P, fromGuard(restingGuard({ ...f, def }), away && D.back ? { ...D, ...D.back } : D));
  }
  // The super going on (forms.js `super`): the game freezes for
  // UNICORN.POP_FREEZE as it does, and the fighter froze in whatever they were
  // doing. A form strikes its own pose instead, held while the super's timer is
  // full (it stands still through the freeze) and eased out over `fade`
  // seconds as it starts to run, from wherever they could press it on the
  // ground. Read from the timer, never written: render-only.
  if (form.super && f.unicornT > 0 && heldUnbroken(f, 'super', f.unicornT)) {
    const S = form.super;
    holdPose(P, S, (f.unicornT - (UNICORN.DURATION - S.fade)) / S.fade);
  }
  // A stance switch (forms.js `shift`, Scam's ALIGNMENT SHIFT): it never
  // becomes an attack, so it had nothing to show. The pose for the stance he
  // switched to, held for `hold` seconds of the switch's cooldown and eased
  // out over `fade`, read from the cooldown as the super's is from its timer.
  if (form.shift && f.stanceCD > 0 && form.shift[f.stanceId] && heldUnbroken(f, 'shift', f.stanceCD)) {
    const S = form.shift;
    holdPose(P, { ...S, ...S[f.stanceId] }, (f.stanceCD - (STANCE.CD - S.hold - S.fade)) / S.fade);
  }
  P.handDepth = form.handDepth;
  P.guardTurn = form.guardTurn;
  // The lead hand's shape, for a model that has more than a fist: what the
  // attack track says, else open for a slap (as figure.js draws everyone's)
  // or wherever the form holds it open.
  if (!P.hand) {
    const slap = f.state === 'attack' && f.attack && (f.attack.button || f.attack.kind) === 'slap';
    if (slap || form.open?.includes(f.state)) P.hand = 'open';
  }
  return P;
}

// A held pose `S` (joints, hand) laid over P at weight k, clamped and eased.
function holdPose(P, S, k) {
  const w = ease.smooth(Math.max(0, Math.min(1, k)));
  if (!(w > 0)) return;
  const mix = (a, b) => a * (1 - w) + b * w;   // exactly the pose at full weight
  for (const [j, v] of Object.entries(S.joints)) {
    P[j] = typeof v === 'object' ? { x: mix(P[j].x, v.x), y: mix(P[j].y, v.y) } : mix(P[j] ?? 0, v);
  }
  if (S.hand && w > 0.5) P.hand = S.hand;
}

// The states a super can go on from, standing (Fighter.update's actionable
// ones on the ground; an attack it cancels has become idle by the next draw).
const SUPER_STATES = ['idle', 'walk', 'crouch'];

// How far (px) a hand or foot has to be from its place in the guard to count
// as out in a move, where it hits: a move from a crouch leaves it there. Every
// form's fist, palm and foot is at least 35 px out by the middle of a basic's
// active window (the closest, Scam's slap and Steve's punch), and a guard hand
// moves a few.
const REACHED_OUT = 30;

// Whether a held pose (the super's going on, a stance switch) is unbroken:
// the fighter has stayed standing (SUPER_STATES) since it went on. Without
// this a pose broken off by a strike, a block or a jump came back at
// whatever weight its timer still gave when the fighter stood again (Scam
// slapping out of his switch and snapping back into it), and a super pressed
// in the air popped in on landing. The game keeps no history of states, so it
// is remembered here, per fighter, from the frames drawn: render-side only,
// never written to the fighter. A new trigger is its timer jumping back up.
const HELD = new WeakMap();   // fighter -> { [which]: { last, broken } }
function heldUnbroken(f, which, timer) {
  let all = HELD.get(f);
  if (!all) HELD.set(f, all = {});
  let h = all[which];
  if (!h || timer > h.last + 1e-9) h = all[which] = { last: timer, broken: false };
  h.last = timer;
  if (!SUPER_STATES.includes(f.state)) h.broken = true;
  return !h.broken;
}

// A form's walk and jump are written from the fighter's idle guard, its
// first frame (no breathing, no roll): the shared walk and jump start from the
// stock rest height, so every fighter stood up straight the moment they moved,
// Carl's hunch and Kim's crouch gone until they stopped again.
const restingGuard = (f) => basePose({ ...f, state: 'idle', stateT: 0, side: 0 }, 0);

// A knockout in a form (forms.js `ko.fall`) turns the whole body over about
// its feet, and the floor came out wherever the standing pose put it: the
// legs keep their stance, so the rear foot went 10 to 38 px through the floor
// and the back lay on nothing or half under it (Adam and Lizbeth sank, Scam
// reclined 25 to 50 px up). Here, as it falls, whatever is lowest comes to
// rest on the floor; once down (`P.fall` 1), the back does (the hip,
// shoulders and head, by GL3D.LIE), and a hand or foot that would still be
// under the floor is lifted onto it. `P` is the pose as drawn (after the
// proportions and the figure's legs); returns how far to move the drawing,
// in the turned frame it is drawn in. Render only.
export function groundFall(P) {
  const L = GL3D.LIE, c = Math.cos(P.rot || 0), s = Math.sin(P.rot || 0);
  const sx = P.sx ?? 1, sy = P.sy ?? 1;
  const lean = (P.bodyLean || 0) * GL3D.LEAN, cl = Math.cos(lean), sl = Math.sin(lean);
  const socket = (x, y) => [x * cl - (y - P.hipY) * sl, P.hipY + x * sl + (y - P.hipY) * cl];
  const down = ([x, y]) => x * sx * s + y * sy * c;     // how far below the feet, once turned
  const torso = [[[0, P.hipY], L.BACK], [socket(0, P.shoulderY), L.BACK], [socket(P.headX || 0, P.headY), L.HEAD]];
  const limbs = ['legF', 'legB', 'armF', 'armB'].filter((k) => P[k]);
  const back = Math.max(...torso.map(([p, r]) => down(p) + r));
  // a foot's point is its sole, a hand's the middle of the fist
  const r = (k) => (k[0] === 'l' ? 0 : L.LIMB);
  const all = Math.max(back, ...limbs.map((k) => down([P[k].x, P[k].y]) + r(k)));
  const k = Math.max(0, Math.min(1, P.fall ?? 1));
  const shift = -(all + (back - all) * k * k);
  for (const l of limbs) {
    const under = down([P[l].x, P[l].y]) + r(l) + shift;
    if (under > 0) P[l] = { x: P[l].x - (under * s) / sx, y: P[l].y - (under * c) / sy };
  }
  return { x: shift * s, y: shift * c };
}

// A basic punch, slap or kick lands where it hits. The forms write their
// strikes for a body of no particular size, and the hitbox does not know the
// size either (Fighter.hitbox: the move's reach and height from the feet), so
// a tall fighter's straight went over a short one's head and still hit (Elo's
// fist 45 px over Kim's), and a long arm (Cathie's, Adam's) went 15 to 25 px
// past the box, stretched to get there. Here the fist or foot, as drawn, is
// brought into the box's height and no further out than its far edge,
// pivoting about the shoulder or hip so the limb keeps its length. It is
// measured once a move, in the middle of its active window, and the same
// correction eased in over the wind-up and out over the recovery, so the
// move keeps its shape. Specials and command moves keep theirs as written.
// A kick that ends short of its box stays short: the leg cannot reach further
// without the hips going with it. Render only: the hitbox is untouched.
const STRIKE_LIMB = { punch: 'armF', slap: 'armF', kick: 'legF' };
const LANDING = new WeakMap();      // attack -> { limb, dx, dy }
export function landStrike(f, P, t, form, body, athlete) {
  const atk = f.attack;
  if (f.state !== 'attack' || !atk || atk.cmd || atk.special || !STRIKE_LIMB[atk.kind] || typeof f.hitbox !== 'function') return;
  let L = LANDING.get(atk);
  if (!L) {
    const mid = atk.startup + atk.active / 2, limb = STRIKE_LIMB[atk.kind];
    const Q = applyProportions(computePose({ ...f, stateT: mid }, t, form, roundStart), body);
    if (athlete) figureFrame(Q);
    const box = f.hitbox.call({ attack: atk, stateT: mid, x: 0, y: 0, facing: 1 });
    const m = GL3D.STRIKE_INSET, sx = Q.sx ?? 1, sy = Q.sy ?? 1;
    const x = Q[limb].x * sx, y = Q[limb].y * sy;
    // the shoulder socket (turned with the lean, as the 3D rig turns it) or the hip
    const lean = (Q.bodyLean || 0) * GL3D.LEAN, dy0 = Q.shoulderY + GL3D.SOCKET_DROP - Q.hipY;
    const [ox, oy] = limb === 'armF' ? [-dy0 * Math.sin(lean) * sx, (Q.hipY + dy0 * Math.cos(lean)) * sy] : [0, Q.hipY * sy];
    let tx = x, ty = Math.max(box.y + m, Math.min(box.y + box.h - m, y));
    if (ty !== y) {
      const r = Math.hypot(x - ox, y - oy), up = ty - oy;
      tx = ox + Math.sqrt(Math.max(0, r * r - up * up));
    }
    tx = Math.min(tx, box.x + box.w - m);
    L = { limb, dx: (tx - x) / sx, dy: (ty - y) / sy };
    LANDING.set(atk, L);
  }
  if (!L.dx && !L.dy) return;
  const k = attackPhaseT(f.stateT, atk.startup, atk.active, atk.recovery);
  const w = k < 1 ? ease.smooth(k) : k <= 2 ? 1 : 1 - ease.smooth(k - 2);
  P[L.limb] = { x: P[L.limb].x + L.dx * w, y: P[L.limb].y + L.dy * w };
}

// A form's own walk (forms.js `walk`): the feet staggered where the stance put
// them, never meeting, the rear foot `lag` behind the lead (half a cycle is a
// walk, a quarter the step-and-follow of a boxer or a fencer), lifted `lift`
// as it travels; the body `low`er than the guard and dipping `bob` with each
// step, the shoulders rolling against the hips (`roll`, `hip`), the arms
// swinging `swing` either side of the guard, the head nodding `nod`, the lead
// hand keeping time `beat`.
//
// A planted foot stays where it was put. The walk phase runs with the distance
// walked (PHYS.WALK_PHASE radians for every PHYS.WALK px), so a form says how
// far one whole cycle carries the body (`cycle`, px) and the cadence follows
// from it: each foot travels back under the body at exactly the body's speed
// while it is down, and swings forward while it is up. The feet used to swing
// on a sine at a cadence of their own, short of the ground going by, and slid
// along with the body at 59 to 83% of its speed: every walk skated. Where a
// stance is too narrow for the step its cycle needs, the step is cut to keep
// the feet apart and the rest is `slip`, a glide the form chooses (Cathie's).
const WALK_PX = PHYS.WALK / PHYS.WALK_PHASE;     // px walked per radian of the walk phase
// A triangle wave, -1 to 1: back at one speed, forward at the same, so it is
// the same shape whichever way the fighter goes, and a turn swaps only which
// foot is up.
const tri = (p) => (2 / Math.PI) * Math.asin(Math.sin(p));
function formWalk(f, W) {
  const G = restingGuard(f);
  const lag = W.lag ?? Math.PI;
  // the legs are drawn `stride` times as wide (applyProportions)
  const sp = (f.body || clampBody(f.def?.body)).stride || 1;
  const cycle = W.cycle ?? (2 * Math.PI * WALK_PX) / (W.rate ?? 1);
  const ph = f.walkPhase * (2 * Math.PI * WALK_PX) / cycle, lifts = f.movingBack ? -1 : 1;
  // Down for half the cycle, carried back the body's distance (less the
  // slip): each foot's step either side of where the stance put it. As far as
  // the feet can go and still stay 20 px apart at their nearest.
  const want = ((1 - (W.slip ?? 0)) * cycle) / (4 * sp);
  const step = Math.min(want, ((G.legF.x - G.legB.x - 20) * Math.PI) / (2 * lag));
  const foot = (x, p) => ({ x: x + tri(p) * step, y: -Math.max(0, lifts * Math.cos(p)) * (W.lift ?? 0) });
  const dip = (W.low ?? 0) + (W.bob ?? 0) * Math.sin(ph) ** 2;
  const s = Math.sin(ph);
  return {
    legF: foot(G.legF.x, ph), legB: foot(G.legB.x, ph - lag),
    hipY: G.hipY + dip, shoulderY: G.shoulderY + dip, headY: G.headY + dip,
    headX: G.headX + s * (W.nod ?? 0),
    bodyLean: f.movingBack ? (W.back ?? G.bodyLean) : (W.lean ?? G.bodyLean),
    sx: G.sx, sy: G.sy,
    twist: -s * (W.roll ?? 0), hipTwist: s * (W.hip ?? 0),
    armF: { x: G.armF.x - s * (W.swing ?? 0), y: G.armF.y + dip - Math.sin(2 * ph) * (W.beat ?? 0) },
    armB: { x: G.armB.x + s * (W.swing ?? 0), y: G.armB.y + dip },
  };
}

// A form's own jump (forms.js `jump`): the shape it leaves the floor in (`up`)
// eased into the one it comes down in (`down`) as the rise turns to a fall;
// the legs, the lean and, where a form throws them, the arms (else the guard,
// carried with the shoulders). The stretch going up and squash coming down are
// the shared ones, by the form's `stretch`.
function formJump(f, J) {
  const G = restingGuard(f);
  const rise = Math.max(-1, Math.min(1, -f.vy / 700));
  const k = ease.smooth((1 - rise) / 2);
  const U = J.up, D = J.down ?? J.up;
  const mix = (a, b) => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
  const lean = (S) => S.lean ?? G.bodyLean;
  const s = J.stretch ?? 1;
  return {
    legF: mix(U.legF, D.legF), legB: mix(U.legB, D.legB),
    armF: mix(U.armF ?? G.armF, D.armF ?? G.armF), armB: mix(U.armB ?? G.armB, D.armB ?? G.armB),
    hipY: G.hipY, shoulderY: G.shoulderY, headY: G.headY, headX: G.headX,
    bodyLean: lean(U) + (lean(D) - lean(U)) * k,
    sx: G.sx * (1 - 0.08 * s * rise), sy: G.sy * (1 + 0.10 * s * rise),
    twist: 0, hipTwist: 0,
  };
}

// A form's own crouch or dash (forms.js `crouch`, `dash`), a held shape
// written from the guard G: the hips, shoulders and head dropped below it
// (`hip`, `shoulder`, `head`, or all three by `drop`), the lean, the feet
// (else the guard's), and the hands as the guard carried down with the
// shoulders, moved by `armF`, `armB` from there (as a form's block moves
// them), so whatever a hand holds stays in it. The shared crouch drops
// everyone from the stock rest height, so a fighter already low in their
// guard, Carl or Kim, hardly went down.
function fromGuard(G, S) {
  const d = S.drop ?? 0;
  const shoulderY = G.shoulderY + (S.shoulder ?? d);
  const arm = (g, o) => ({ x: g.x + (o?.x ?? 0), y: g.y + shoulderY - G.shoulderY + (o?.y ?? 0) });
  return {
    hipY: G.hipY + (S.hip ?? d), shoulderY, headY: G.headY + (S.head ?? d),
    headX: G.headX + (S.headX ?? 0), bodyLean: S.lean ?? G.bodyLean,
    sx: S.sx ?? G.sx, sy: S.sy ?? G.sy, twist: S.twist ?? 0, hipTwist: 0,
    legF: { ...(S.legF ?? G.legF) }, legB: { ...(S.legB ?? G.legB) },
    armF: arm(G.armF, S.armF), armB: arm(G.armB, S.armB),
  };
}

function basePose(f, t) {
  // sx/sy = squash & stretch, applied around the feet in drawFighter. Purely
  // visual weight — hitboxes come from ATTACKS timing, never from the pose.
  // The rig comes from REST — the ONE place the stance is defined. This used to
  // be a second copy of those numbers written out inline, and when the stance
  // was retuned for v2.7's proportions only the copy in anim.js moved. Tracked
  // attacks sample from REST, everything else came from here, so a fighter
  // stood at the old skeleton and grew 54px the instant they threw a punch.
  const P = {
    ...restPose(),
    face: 'idle',
  };
  const st = f.state;

  // Each fighting style has its own silhouette at rest and in a crouch — you
  // can tell who someone is picking before they throw a single button.
  const stance = (STYLES[f.def?.style] || STYLES.balanced).stance;

  if (st === 'idle') {
    // Stance first — this is the per-character silhouette, and it is the whole
    // reason you can tell who someone picked before they throw a button.
    const st = STANCES[stance] || STANCES.ready;
    P.hipY += st.hip || 0; P.shoulderY += st.shoulder || 0; P.headY += st.head || 0;
    if (st.lean !== undefined) P.bodyLean = st.lean;
    if (st.sx !== undefined) P.sx = st.sx;
    if (st.sy !== undefined) P.sy = st.sy;
    for (const k of ['armF', 'armB', 'legF', 'legB']) if (st[k]) P[k] = { ...st[k] };
    if (st.sway) {
      const sway = Math.sin(t * 2.6) * 4;
      P.bodyLean += Math.sin(t * 2.2) * 0.04;
      P.headX += sway * 0.5;
      P.armF.x += sway; P.armB.x -= sway * 0.5;
    }

    // The character's OWN stance, layered over the style's. Five stances were
    // being shared by nine fighters — Lizbeth, Elo and Scam stood identically,
    // as did Adam and Carl, and Cathie and Jeff — so the silhouette, which is
    // the first thing you read at a distance, said almost nothing about who you
    // had picked. The style stance still sets the base (a rushdown IS coiled);
    // this makes each fighter a specific person standing in it.
    //
    // RENDER-ONLY, same contract as `face`: read here and nowhere else.
    // Vectors are absolute because the block above writes them absolutely;
    // hip/head are deltas because the block above adds to them. Mixing those
    // two conventions silently is what produced the two-skeleton bug, so it is
    // spelled out rather than inferred.
    const S = f.def?.stance;
    if (S) {
      if (S.hip !== undefined) P.hipY += S.hip;
      if (S.head !== undefined) P.headY += S.head;
      if (S.shoulder !== undefined) P.shoulderY += S.shoulder;
      if (S.headX !== undefined) P.headX = (P.headX || 0) + S.headX;
      if (S.lean !== undefined) P.bodyLean = S.lean;
      if (S.sx !== undefined) P.sx = S.sx;
      if (S.sy !== undefined) P.sy = S.sy;
      for (const k of ['armF', 'armB', 'legF', 'legB']) {
        if (S[k]) P[k] = { ...P[k], ...S[k] };
      }
      // A character may breathe with its own amplitude and speed — a still
      // fighter and a swaying one read as different people before either moves
      // a limb. Applied here so it rides on top of the authored idle loop.
      if (S.swayX || S.swayY) {
        const w = t * (S.swayRate || 2.4);
        if (S.swayX) { P.armF.x += Math.sin(w) * S.swayX; P.armB.x -= Math.sin(w) * S.swayX * 0.6; }
        if (S.swayY) { P.shoulderY += Math.sin(w * 0.8) * S.swayY; P.headY += Math.sin(w * 0.8) * S.swayY; }
      }
    }
    // Breathing comes from an authored loop, layered as a DELTA so it adds to
    // whatever the stance produced instead of overwriting it. This replaces the
    // old hardcoded `bob`, and it is what makes a per-character idle possible
    // without giving up the stance silhouettes.
    const idle = trackFor(f.def, 'idle', BASE_TRACKS);
    if (idle) {
      // side offset so two fighters facing off never breathe in lockstep
      const phase = (t * IDLE_RATE + (f.side === 0 ? 0 : 0.42)) % 1;
      // A track may declare the rig it was authored against; without one it
      // predates AUTHORED_REST and is measured there. Never against the live
      // REST — see the note on AUTHORED_REST in anim.js.
      //
      // Sample ONTO that same base, not onto the live rest pose. A sparse
      // override only keys a few joints and samplePose fills the rest from
      // whatever it started on; starting from REST and subtracting
      // AUTHORED_REST gave every untouched joint a spurious delta of the
      // difference between the two rigs — 42px on the shoulders, which put one
      // character's head below her own collarbone.
      const base = idle.base || AUTHORED_REST;
      addDelta(P, samplePose(idle, (phase + 1) % 1, poseFrom(base)), base);
    }
  } else if (st === 'walk') {
    // A fighter's walk is a shuffle, not a stroll: the feet stay staggered
    // where the stance put them and never cross, the lead foot reaching and
    // the rear one following, and the guard stays up. It used to swing the
    // feet past each other like someone crossing a car park, arms pumping.
    const ph = f.walkPhase;
    const G = guardOf(f.def, stance);
    // A narrow stance takes shorter steps, so the feet still never meet.
    const step = Math.min(11, (G.legF.x - G.legB.x - 20) / 2);
    P.legF = { x: G.legF.x + Math.sin(ph) * step, y: -Math.max(0, Math.sin(ph + 1.5)) * 7 };
    P.legB = { x: G.legB.x + Math.sin(ph + Math.PI) * step, y: -Math.max(0, Math.sin(ph + Math.PI + 1.5)) * 7 };
    carryGuard(P, G);
    P.armF.x += Math.sin(ph + Math.PI) * 3;
    P.armB.x += Math.sin(ph) * 3;
    P.hipY += Math.abs(Math.sin(ph)) * 2;
    P.headY += Math.abs(Math.sin(ph)) * 2;
    P.bodyLean = f.movingBack ? 0 : 0.1;
  } else if (st === 'jump') {
    // Knees tucked under, guard kept. The arms used to fly up and out, a
    // two-fisted flex in the air, which left the face open on every jump.
    P.legF = { x: 20, y: -30 }; P.legB = { x: -8, y: -20 };
    carryGuard(P, guardOf(f.def, stance), 4);
    P.bodyLean = 0.1;
    // stretch on the way up, squash as gravity takes over — reads as real air time
    const rise = Math.max(-1, Math.min(1, -f.vy / 700));
    P.sy = 1 + 0.10 * rise; P.sx = 1 - 0.08 * rise;
  } else if (st === 'attack') {
    const atk = f.attack;
    // Authored keyframes take over where a track exists. Phase-space timing
    // means the same track reads correctly on a 4-frame slap and a 12-frame
    // kick; the computed chain below stays as the fallback, so an archetype
    // with no track — or a character with a broken override — still animates.
    const posed = trackedAttackPose(f, atk);
    if (posed) {
      posed.face = 'angry';
      return posed;
    }
    const total = atk.startup + atk.active + atk.recovery;
    const k = Math.min(1, f.stateT / total);
    const inStartup = f.stateT < atk.startup;
    const inActive = !inStartup && f.stateT < atk.startup + atk.active;
    const antK = inStartup ? f.stateT / atk.startup : 0;      // 0→1 through the wind-up
    const hitK = inStartup
      ? antK * -0.30                                          // anticipation: deeper coil back
      : inActive
        ? 0.30 + 1.06 * ease.outBack(Math.min(1, (f.stateT - atk.startup) / atk.active))
        : 1 - ease.inQuad((f.stateT - atk.startup - atk.active) / atk.recovery);
    P.face = 'angry';
    // Whole-body commitment: coil down + back on the wind-up, then drive up and
    // through on the strike. This is what makes a hit feel like it has weight.
    if (inStartup) {
      P.sx = 1 + 0.07 * antK; P.sy = 1 - 0.07 * antK;         // squash: gathering
      P.hipY += 5 * antK;
      P.headX -= 3 * antK;
    } else if (inActive) {
      const ext = Math.min(1, (f.stateT - atk.startup) / atk.active);
      P.sx = 1 - 0.05 * ext; P.sy = 1 + 0.06 * ext;           // stretch: releasing
      P.hipY -= 3 * ext;
    }
    if (atk.kind === 'kick') {
      const reach = (atk.reach || 100) * 0.92;
      P.legF = { x: 6 + reach * hitK, y: -70 * hitK - (f.airborne ? 20 : 0) };
      P.legB = { x: -12, y: 0 };
      P.armF = { x: 44, y: -148 }; P.armB = { x: 36, y: -160 };
      P.bodyLean = -0.22 * hitK;
      P.hipY += 4 * hitK;
    } else if (atk.kind === 'grab') {
      P.armF = { x: 20 + 46 * hitK, y: -148 };
      P.armB = { x: 16 + 44 * hitK, y: -140 };
      P.bodyLean = 0.24 * hitK;
      P.face = 'angry';
    } else if (atk.kind === 'rain' || atk.kind === 'bomb') {
      P.armF = { x: 12, y: -148 - 66 * hitK };
      P.armB = { x: -12, y: -146 };
      P.bodyLean = -0.1 * hitK;
    } else if (atk.kind === 'aoe') {
      P.armF = { x: 44 * hitK, y: -144 };
      P.armB = { x: -30 * hitK, y: -150 };
      P.bodyLean = 0.12 * hitK;
      P.hipY += 6 * hitK;
    } else if (atk.kind === 'rush') {
      const ph = t * 26;
      P.bodyLean = 0.5;
      P.legF = { x: 15 + Math.sin(ph) * 20, y: -Math.max(0, Math.sin(ph + 1.5)) * 12 };
      P.legB = { x: -14 + Math.sin(ph + Math.PI) * 20, y: -Math.max(0, Math.sin(ph + Math.PI + 1.5)) * 12 };
      P.armF = { x: 48, y: -144 }; P.armB = { x: -30, y: -134 };
    } else if (atk.kind === 'launch') {
      // rising uppercut: fist punches skyward, body lifts off the back foot
      const rise = Math.max(0, hitK);
      P.armF = { x: 16 + 26 * rise, y: -168 - 74 * rise };
      P.armB = { x: 40, y: -160 - 30 * rise };
      P.legF = { x: 22, y: -18 * rise };
      P.legB = { x: -16, y: 0 };
      P.hipY -= 30 * rise; P.shoulderY -= 22 * rise; P.headY -= 30 * rise;
      P.bodyLean = -0.16 * rise;
      P.sy = 1 + 0.10 * rise; P.sx = 1 - 0.07 * rise;
    } else if (atk.kind === 'slap') {
      // open-hand backhand: arm swings high and across, big shoulder rotation
      const reach = (atk.reach || 78) * 0.95;
      const swing = hitK;                                    // 0→1 across the swing
      P.armF = { x: 8 + reach * swing, y: -176 + 30 * swing };  // starts cocked high, whips down-across
      P.armB = { x: 38, y: -158 };
      P.bodyLean = 0.26 * swing;
      P.headX = 3 * swing;
    } else { // punch / projectile / teleport strike
      const reach = (atk.kind === 'punch' ? (atk.reach || 82) : 88) * 0.95;
      P.armF = { x: 22 + reach * hitK, y: -152 };
      P.armB = { x: 40, y: -160 };
      P.bodyLean = 0.2 * hitK;
    }
  } else if (st === 'dash') {
    // Low and driving forward behind the guard, the rear leg pushing off.
    P.bodyLean = 0.36;
    P.hipY += 6; P.shoulderY += 6; P.headY += 6;
    P.legF = { x: 36, y: -6 };
    P.legB = { x: -30, y: -2 };
    carryGuard(P, guardOf(f.def, stance));
    P.face = 'angry';
  } else if (st === 'crouch') {
    // low stance you can still attack from: knees bent, guard up, head down.
    // The body is the style's; the hands are the fighter's own guard, carried
    // down with the shoulders, so the fists stay at the chin and a held prop
    // stays where it was instead of rising over the face.
    P.hipY += 26; P.shoulderY += 22; P.headY += 26; P.headX = 3;
    P.legF = { x: 28, y: 0 }; P.legB = { x: -24, y: 0 };
    P.sx = 1.08; P.sy = 0.92;
    P.bodyLean = 0.12;
    // …and each style crouches in character, too
    if (stance === 'coiled') {                 // sprinter's crouch, ready to burst
      P.hipY += 4; P.bodyLean = 0.22; P.headX = 6;
      P.legF = { x: 30, y: 0 }; P.legB = { x: -18, y: 0 };
      P.sx = 1.06; P.sy = 0.92;
    } else if (stance === 'heavy') {           // sumo-wide
      P.hipY += 6; P.bodyLean = 0.10;
      P.legF = { x: 34, y: 0 }; P.legB = { x: -32, y: 0 };
      P.sx = 1.16; P.sy = 0.88;
    } else if (stance === 'poised') {          // low but tall-backed
      P.hipY -= 2; P.bodyLean = 0.02;
      P.legF = { x: 24, y: 0 }; P.legB = { x: -26, y: 0 };
      P.sx = 1.06; P.sy = 0.94;
    } else if (stance === 'loose') {           // weight on the back foot
      P.bodyLean = 0.0; P.headX = 0;
      P.legF = { x: 30, y: 0 }; P.legB = { x: -20, y: 0 };
      P.sx = 1.10; P.sy = 0.90;
    } else if (stance === 'flair') {           // a low, theatrical set
      P.bodyLean = 0.04;
      P.legF = { x: 26, y: 0 }; P.legB = { x: -26, y: 0 };
      P.sx = 1.08; P.sy = 0.91;
    }
    carryGuard(P, guardOf(f.def, stance));
  } else if (st === 'block') {
    // Shell up: both forearms pulled tight in front of the face, chin down,
    // weight rocked onto the back foot. The rear fist used to sit inside the
    // torso, where the back arm is drawn behind it and never showed.
    // The rear hand stays in the fighter's own guard, with whatever it holds.
    P.crouch = 8; P.hipY += 8; P.headY += 10; P.shoulderY += 8;
    carryGuard(P, guardOf(f.def, stance));
    P.armF = { x: 44, y: P.shoulderY - 6 };
    P.legF = { x: 22, y: 0 }; P.legB = { x: -24, y: 0 };
    P.face = 'block'; P.bodyLean = -0.06;
  } else if (st === 'hitstun') {
    const k = Math.min(1, f.stateT * 10);
    // snap hard on impact, then settle — the recoil sells the hit landing
    const impact = Math.max(0, 1 - f.stateT * 14);
    P.bodyLean = -0.3 * k - 0.22 * impact;
    P.headX = -6 * k - 7 * impact; P.headY += 4 * k;
    // The arms go limp and fly forward as the head snaps back. The rear one
    // used to be flung up behind the head, which in 3D was a wave.
    P.armF = { x: 32, y: -122 }; P.armB = { x: 26, y: -134 };
    P.legF = { x: 24, y: 0 }; P.legB = { x: -24, y: 0 };
    P.sx = 1 + 0.13 * impact; P.sy = 1 - 0.13 * impact;   // squash on contact
    P.face = 'hurt';
  } else if (st === 'ko') {
    const k = Math.min(1, f.stateT / 0.45);
    P.rot = -1.45 * ease.outQuad(k);
    P.armF = { x: 30, y: -108 }; P.armB = { x: -30, y: -124 };
    P.legF = { x: 26, y: -4 }; P.legB = { x: -18, y: -2 };
    P.face = 'ko';
  } else if (st === 'victory') {
    const pump = Math.abs(Math.sin(t * 6));
    P.armF = { x: 20, y: -198 - pump * 14 };
    P.armB = { x: -18, y: -146 };
    P.headY -= pump * 4; P.hipY -= pump * 3;
    P.face = 'happy';
  }
  return P;
}

// ---------------------------------------------------------------- head & face

// The face alone, for the 3D renderer's face textures: centred on the origin
// of a head of radius r (a fight-size head unless the model asks otherwise),
// exactly as drawHead would draw it there, with any look the model paints on
// rather than models (stubble) over it in the same order. Given a decoded
// `photo`, the face is the photo, which has no expressions.
function paintFace3D(ctx, def, face, r = STYLIZE.HEAD_R, photo = null) {
  if (photo) {
    paintPhotoFace(ctx, photo, r);
    return;
  }
  drawFace(ctx, 0, 0, r, face, def.c, def.face);
  if (PAINTED_LOOKS.facialHair.includes(resolveLook3D(def).facialHair)) drawFacialHair(ctx, 0, 0, r, def);
}

// What the 3D renderer paints faces with: the painter above, and a founder's
// photo once it has decoded (null until then, and for good if it never does,
// when the 3D head keeps the drawn face just as drawHead does in 2D).
export const FACE_PAINTER = {
  paint: paintFace3D,
  photo: (def) => (def.photo ? getPhoto(def.photo) : null),
};

// The face out of a profile photo, feathered so only the face itself lands on
// the 3D head: projected whole, the photo's background showed as a grey patch
// down the side of the head. See GL3D.PHOTO.
function paintPhotoFace(ctx, photo, r) {
  const P = GL3D.PHOTO;
  const crop = (r * P.SIZE) / P.FACE;                   // the whole photo, px
  const n = Math.max(8, Math.ceil(crop * (ctx.getTransform().a || 1)));   // in texels
  const tmp = document.createElement('canvas');
  tmp.width = tmp.height = n;
  const t = tmp.getContext('2d');
  t.imageSmoothingQuality = 'high';
  t.drawImage(photo, 0, 0, n, n);
  const cx = n / 2, cy = n / 2 + n * P.FACE_DROP, fr = (n * P.FACE) / 2;
  const mask = t.createRadialGradient(cx, cy, fr * P.FEATHER[0], cx, cy, fr * P.FEATHER[1]);
  mask.addColorStop(0, '#000');
  mask.addColorStop(1, 'rgba(0,0,0,0)');
  t.globalCompositeOperation = 'destination-in';
  t.fillStyle = mask;
  t.fillRect(0, 0, n, n);
  ctx.drawImage(tmp, -crop / 2, r * P.FACE_Y - crop * (0.5 + P.FACE_DROP), crop, crop);
}

// `look` is the character's own facial geometry, layered over STYLIZE.FACE.
// RENDER-ONLY: it is read here and nowhere else — never by the state machine,
// hit resolution, the budget, or the codec. A face cannot change a fight.
export function drawFace(ctx, cx, cy, r, face, c, look) {
  ctx.lineCap = 'round';
  const e = r * 0.34;                       // eye offset
  ctx.strokeStyle = OUTLINE; ctx.fillStyle = OUTLINE;
  ctx.lineWidth = 2.6;
  if (face === 'ko') {
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx + s * e - 4, cy - 4); ctx.lineTo(cx + s * e + 4, cy + 4);
      ctx.moveTo(cx + s * e + 4, cy - 4); ctx.lineTo(cx + s * e - 4, cy + 4);
      ctx.stroke();
    }
    // Out cold, mouth open. This used to be an upward arc — a knocked-out
    // founder lying there grinning, which is the same cartoon tell the idle
    // smile was, and it survived the face pass because it lives in its own
    // branch. Every state got looked at after that.
    ctx.beginPath(); ctx.ellipse(cx + 1, cy + r * 0.46, 4, 5.5, 0, 0, 7); ctx.stroke();
  } else if (face === 'happy') {
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.arc(cx + s * e, cy - 1, 4.5, Math.PI, 0); ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(cx, cy + r * 0.34, 6, 0.15, Math.PI - 0.15); ctx.stroke();
  } else if (face === 'hurt') {
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx + s * e - 4, cy - 3); ctx.lineTo(cx + s * e + 4, cy + 1);
      ctx.moveTo(cx + s * e - 4, cy + 3); ctx.lineTo(cx + s * e + 4, cy - 1);
      ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(cx + 1, cy + r * 0.5, 4, Math.PI, 0); ctx.stroke();
  } else {
    // idle / angry / block — the fighting face.
    //
    // This used to be dot eyes, a flat hairline brow and a SMILE, which is the
    // single loudest cartoon signal on the whole character. Three changes:
    // brows angle down toward the nose, a heavy lid narrows the eye so the
    // fighter is glaring rather than gazing, and the mouth is set instead of
    // curved upward.
    // Every fighter used to share one face: same brow angle, same lid, same
    // mouth, so nine characters wore one expression and were told apart only by
    // hair and jacket. The knobs are the same, the VALUES are now the
    // character's — Carl narrows to a slit, Lizbeth does not blink, Cathie is
    // the only one in the game who is not glaring.
    const F = { ...STYLIZE.FACE, ...(look || {}) };
    const tilt = F.BROW_TILT + (face === 'angry' || face === 'block' ? F.BROW_TILT_HARD : 0);

    // pupil, sitting high in the eye — looking AT something
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.arc(cx + s * e + 2, cy + 0.6, F.PUPIL_R, 0, 7); ctx.fill();
    }

    // heavy upper lid: the difference between open-eyed and narrowed
    ctx.lineWidth = F.LID_W;
    for (const s of [-1, 1]) {
      const ex = cx + s * e + 2;
      ctx.beginPath();
      ctx.moveTo(ex - F.EYE_W, cy - F.LID_Y);
      ctx.lineTo(ex + F.EYE_W, cy - F.LID_Y);
      ctx.stroke();
    }

    // brows — inner end LOWER than outer, which is the whole expression
    ctx.lineWidth = F.BROW_W;
    for (const s of [-1, 1]) {
      const ex = cx + s * e + 2;
      ctx.beginPath();
      ctx.moveTo(ex - s * F.BROW_LEN, cy - F.BROW_Y + tilt);     // inner, dropped
      ctx.lineTo(ex + s * F.BROW_LEN, cy - F.BROW_Y - tilt * 0.45);
      ctx.stroke();
    }

    // mouth: set, never smiling
    ctx.lineWidth = 2.6;
    const my = cy + r * F.MOUTH_Y, mw = F.MOUTH_W;
    ctx.beginPath();
    if (face === 'block') {                       // gritted, teeth together
      ctx.moveTo(cx - mw, my); ctx.lineTo(cx + mw + 2, my);
    } else if (face === 'angry') {                // snarl — corners pulled down
      // Canvas y runs DOWN: corners below the control point make a frown.
      // This had the signs the other way round, a U, so every fighter grinned
      // through every attack while the comment promised a snarl.
      ctx.moveTo(cx - mw, my + 2.4);
      ctx.quadraticCurveTo(cx + 2, my - 2.8, cx + mw + 2, my + 2.4);
    } else {
      // idle: the character's own set. MOUTH_CURVE < 0 pulls the corners down
      // into a scowl, > 0 lets one or two of them look pleased with themselves.
      // Nobody gets a full smile — that was the loudest cartoon tell of all.
      const k = F.MOUTH_CURVE;
      ctx.moveTo(cx - mw, my - k * 0.55);
      ctx.quadraticCurveTo(cx + 2, my + k, cx + mw + 2, my - k * 0.55);
    }
    ctx.stroke();
  }
}

// Hair is the roster's cheapest silhouette lever, and for most of this set it
// was doing nothing: nearly every style was an arc of radius ~1.0r hugging the
// skull, so it changed the colour of the head and not its shape. At 196px the
// head outline is a big share of what tells two fighters apart, so the styles
// that are SUPPOSED to have volume now actually leave it.
function drawHair(ctx, cx, cy, r, def, t) {
  const c = def.c;
  const style = def.hairStyle;
  ctx.lineJoin = 'round';
  if (style === 'ponytail') {
    blob(ctx, () => {
      ctx.arc(cx, cy - r * 0.24, r * 1.02, Math.PI * 0.95, Math.PI * 2.05);
    }, c.hair);
    // a longer, heavier tail — the whole point of the style is the outline
    const sway = Math.sin(t * 5) * 5;
    blob(ctx, () => {
      ctx.moveTo(cx - r * 0.8, cy - r * 0.62);
      ctx.quadraticCurveTo(cx - r * 2.5, cy - r * 0.15 + sway, cx - r * 1.9, cy + r * 1.35 + sway);
      ctx.quadraticCurveTo(cx - r * 1.25, cy + r * 0.8, cx - r * 0.92, cy + r * 0.05);
    }, c.hair);
  } else if (style === 'quiff') {
    // swept up and forward — reads as height on a head that is otherwise round,
    // which is the one outline this set had no example of
    blob(ctx, () => { ctx.arc(cx, cy - r * 0.22, r * 1.02, Math.PI * 0.96, Math.PI * 2.04); }, c.hair);
    blob(ctx, () => {
      ctx.moveTo(cx - r * 0.72, cy - r * 0.72);
      ctx.quadraticCurveTo(cx - r * 0.5, cy - r * 2.15, cx + r * 0.62, cy - r * 1.95);
      ctx.quadraticCurveTo(cx + r * 1.16, cy - r * 1.72, cx + r * 0.92, cy - r * 0.66);
      ctx.quadraticCurveTo(cx + r * 0.2, cy - r * 1.12, cx - r * 0.72, cy - r * 0.72);
      ctx.closePath();
    }, c.hair);
  } else if (style === 'cap') {
    blob(ctx, () => { ctx.arc(cx, cy - r * 0.34, r * 1.06, Math.PI, 0); }, c.suit2);
    // a brim long enough to break the round outline
    blob(ctx, () => {
      ctx.moveTo(cx - r * 1.0, cy - r * 0.32);
      ctx.lineTo(cx - r * 2.25, cy - r * 0.12);
      ctx.lineTo(cx - r * 2.2, cy + r * 0.16);
      ctx.lineTo(cx - r * 1.0, cy - r * 0.02);
    }, c.suit2);
    ctx.fillStyle = c.accent;
    ctx.beginPath(); ctx.arc(cx, cy - r * 0.68, r * 0.2, 0, 7); ctx.fill();
  } else if (style === 'neat') {
    blob(ctx, () => {
      ctx.arc(cx, cy - r * 0.3, r * 1.0, Math.PI * 0.92, Math.PI * 2.02);
      ctx.quadraticCurveTo(cx + r * 0.9, cy - r * 0.1, cx + r * 0.7, cy - r * 0.35);
    }, c.hair);
  } else if (style === 'puffs') {
    blob(ctx, () => { ctx.arc(cx - r * 0.62, cy - r * 0.95, r * 0.52, 0, 7); }, c.hair);
    blob(ctx, () => { ctx.arc(cx + r * 0.62, cy - r * 0.95, r * 0.52, 0, 7); }, c.hair);
    blob(ctx, () => { ctx.arc(cx, cy - r * 0.35, r * 0.98, Math.PI, 0); }, c.hair);
  } else if (style === 'bob') {
    // crown sweep — stays above the brow line
    blob(ctx, () => { ctx.arc(cx, cy - r * 0.3, r * 1.08, Math.PI * 0.94, Math.PI * 2.06); }, c.hair);
    // Curtains pushed well outboard: a bob is a WIDE outline or it is nothing.
    // Eyes and mouth still stay clear — the volume goes sideways, not down.
    for (const sgn of [-1, 1]) {
      blob(ctx, () => {
        ctx.moveTo(cx + sgn * r * 0.68, cy - r * 0.78);
        ctx.quadraticCurveTo(cx + sgn * r * 1.72, cy - r * 0.3, cx + sgn * r * 1.38, cy + r * 0.72);
        ctx.lineTo(cx + sgn * r * 0.86, cy + r * 0.48);
        ctx.quadraticCurveTo(cx + sgn * r * 1.06, cy - r * 0.18, cx + sgn * r * 0.56, cy - r * 0.58);
        ctx.closePath();
      }, c.hair);
    }
  } else if (style === 'slick') {
    blob(ctx, () => {
      ctx.moveTo(cx + r * 0.95, cy - r * 0.4);
      ctx.quadraticCurveTo(cx + r * 0.4, cy - r * 1.28, cx - r * 0.6, cy - r * 1.05);
      ctx.quadraticCurveTo(cx - r * 1.25, cy - r * 0.8, cx - r * 0.95, cy - r * 0.1);
      ctx.quadraticCurveTo(cx - r * 0.3, cy - r * 0.72, cx + r * 0.55, cy - r * 0.62);
    }, c.hair);
  } else if (style === 'short') {
    // close-crop: low flat cap hugging the skull
    blob(ctx, () => {
      ctx.arc(cx, cy - r * 0.18, r * 0.99, Math.PI * 1.02, Math.PI * 1.98);
      ctx.closePath();
    }, c.hair);
  } else if (style === 'curly') {
    // fluffy mop: overlapping puffs across the crown
    for (const [ox, oy, s] of [[-0.62, -0.62, 0.46], [-0.2, -0.86, 0.5], [0.28, -0.84, 0.48], [0.66, -0.58, 0.42], [0, -0.62, 0.55]]) {
      blob(ctx, () => { ctx.arc(cx + r * ox, cy + r * oy, r * s, 0, 7); }, c.hair);
    }
  } else if (style === 'afro') {
    // big round halo well clear of the brow
    blob(ctx, () => { ctx.arc(cx, cy - r * 0.42, r * 1.32, 0, 7); }, c.hair);
  } else if (style === 'long') {
    // crown plus two lengths falling past the jaw
    blob(ctx, () => { ctx.arc(cx, cy - r * 0.26, r * 1.04, Math.PI * 0.94, Math.PI * 2.06); }, c.hair);
    for (const sgn of [-1, 1]) {
      blob(ctx, () => {
        ctx.moveTo(cx + sgn * r * 0.74, cy - r * 0.66);
        ctx.quadraticCurveTo(cx + sgn * r * 1.3, cy + r * 0.3, cx + sgn * r * 1.02, cy + r * 1.32);
        ctx.lineTo(cx + sgn * r * 0.68, cy + r * 1.22);
        ctx.quadraticCurveTo(cx + sgn * r * 0.94, cy + r * 0.25, cx + sgn * r * 0.6, cy - r * 0.5);
        ctx.closePath();
      }, c.hair);
    }
  } else if (style === 'buzz') {
    // very close crop — a thin shadow following the skull
    blob(ctx, () => {
      ctx.arc(cx, cy - r * 0.1, r * 0.96, Math.PI * 1.06, Math.PI * 1.94);
      ctx.closePath();
    }, c.hair);
  } else if (style === 'topknot') {
    blob(ctx, () => { ctx.arc(cx, cy - r * 0.24, r * 1.0, Math.PI * 0.98, Math.PI * 2.02); }, c.hair);
    // knot raised clear of the crown, on a visible stalk, so it reads at size
    blob(ctx, () => { ctx.roundRect(cx - r * 0.16, cy - r * 1.34, r * 0.32, r * 0.42, r * 0.1); }, c.hair);
    blob(ctx, () => { ctx.arc(cx + r * 0.04, cy - r * 1.5, r * 0.46, 0, 7); }, c.hair);
  } else if (style === 'bald') {
    // proudly bald: just a shine
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx - r * 0.25, cy - r * 0.45, r * 0.42, Math.PI * 1.15, Math.PI * 1.6);
    ctx.stroke();
  }
}

// Headwear sits ABOVE everything — including an uploaded photo — because a hat
// on a real face has to read as a hat, not get clipped away by the face circle.
function drawHeadwear(ctx, cx, cy, r, def) {
  const c = def.c;
  const h = def.headwear;
  if (!h || h === 'none') return;
  // Eyes sit at ~cy on a drawn face and on an auto-framed photo crop alike, so
  // every piece here stays above the brow line (~cy - r*0.4). Hats that ride
  // down over the eyes was the single worst thing about the old avatars.
  const BROW = cy - r * 0.42;
  if (h === 'headband') {
    ctx.strokeStyle = c.accent; ctx.lineWidth = r * 0.22;
    ctx.beginPath(); ctx.arc(cx, cy, r + 0.5, Math.PI * 1.16, Math.PI * 1.84); ctx.stroke();
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(cx, cy + r * 0.11, r + 0.5, Math.PI * 1.18, Math.PI * 1.82); ctx.stroke();
  } else if (h === 'cap') {
    blob(ctx, () => {                                   // crown
      ctx.moveTo(cx - r * 1.02, BROW);
      ctx.quadraticCurveTo(cx - r * 1.0, cy - r * 1.5, cx, cy - r * 1.48);
      ctx.quadraticCurveTo(cx + r * 1.0, cy - r * 1.5, cx + r * 1.02, BROW);
      ctx.closePath();
    }, c.suit2);
    blob(ctx, () => {                                   // brim, forward and clear of the eyes
      ctx.moveTo(cx + r * 0.1, BROW - r * 0.06);
      ctx.quadraticCurveTo(cx + r * 1.5, BROW - r * 0.2, cx + r * 1.62, BROW + r * 0.1);
      ctx.quadraticCurveTo(cx + r * 1.2, BROW + r * 0.24, cx + r * 0.1, BROW + r * 0.16);
      ctx.closePath();
    }, shade(c.suit2, -16));
    ctx.fillStyle = c.accent;
    ctx.beginPath(); ctx.arc(cx, cy - r * 1.06, r * 0.16, 0, 7); ctx.fill();
  } else if (h === 'beanie') {
    blob(ctx, () => {
      ctx.moveTo(cx - r * 1.04, BROW);
      ctx.quadraticCurveTo(cx - r * 1.02, cy - r * 1.56, cx, cy - r * 1.54);
      ctx.quadraticCurveTo(cx + r * 1.02, cy - r * 1.56, cx + r * 1.04, BROW);
      ctx.closePath();
    }, c.suit);
    blob(ctx, () => {                                   // folded cuff, above the brow
      ctx.roundRect(cx - r * 1.08, BROW - r * 0.26, r * 2.16, r * 0.3, r * 0.1);
    }, c.accent);
    blob(ctx, () => { ctx.arc(cx, cy - r * 1.62, r * 0.19, 0, 7); }, c.accent);   // bobble
  } else if (h === 'bandana') {
    blob(ctx, () => {
      ctx.moveTo(cx - r * 1.02, BROW - r * 0.02);
      ctx.quadraticCurveTo(cx, cy - r * 1.44, cx + r * 1.02, BROW - r * 0.02);
      ctx.quadraticCurveTo(cx, BROW - r * 0.3, cx - r * 1.02, BROW - r * 0.02);
      ctx.closePath();
    }, c.accent);
    blob(ctx, () => {                                   // knot tail, swept back
      ctx.moveTo(cx - r * 0.96, BROW - r * 0.1);
      ctx.lineTo(cx - r * 1.52, BROW + r * 0.02);
      ctx.lineTo(cx - r * 1.38, BROW + r * 0.3);
      ctx.lineTo(cx - r * 0.9, BROW + r * 0.12);
      ctx.closePath();
    }, shade(c.accent, -18));
  }
}

// Glasses/shades/visor. Skipped over an uploaded photo — the real face already
// has whatever the person actually wears, and drawn lenses never line up.
function drawEyewear(ctx, cx, cy, r, def) {
  const e = def.eyewear || (['visor', 'glasses', 'shades'].includes(def.accessory) ? def.accessory : 'none');
  if (!e || e === 'none') return;
  drawAccessory(ctx, cx, cy, r, { ...def, accessory: e });
}

function drawFacialHair(ctx, cx, cy, r, def) {
  const c = def.c;
  const fh = def.facialHair || (def.accessory === 'stubble' ? 'stubble' : 'none');
  if (!fh || fh === 'none') return;
  if (fh === 'stubble') {
    ctx.fillStyle = 'rgba(30,30,40,0.25)';
    ctx.beginPath(); ctx.arc(cx, cy + r * 0.5, r * 0.55, 0, Math.PI); ctx.fill();
  } else if (fh === 'moustache') {
    blob(ctx, () => {
      ctx.moveTo(cx - r * 0.34, cy + r * 0.26);
      ctx.quadraticCurveTo(cx, cy + r * 0.1, cx + r * 0.38, cy + r * 0.26);
      ctx.quadraticCurveTo(cx, cy + r * 0.44, cx - r * 0.34, cy + r * 0.26);
      ctx.closePath();
    }, c.hair);
  } else if (fh === 'beard') {
    blob(ctx, () => {
      ctx.moveTo(cx - r * 0.86, cy + r * 0.02);
      ctx.quadraticCurveTo(cx - r * 0.7, cy + r * 1.16, cx + r * 0.06, cy + r * 1.18);
      ctx.quadraticCurveTo(cx + r * 0.78, cy + r * 1.12, cx + r * 0.9, cy + r * 0.02);
      ctx.quadraticCurveTo(cx + r * 0.5, cy + r * 0.52, cx + r * 0.02, cy + r * 0.5);
      ctx.quadraticCurveTo(cx - r * 0.5, cy + r * 0.5, cx - r * 0.86, cy + r * 0.02);
      ctx.closePath();
    }, c.hair);
  } else if (fh === 'goatee') {
    blob(ctx, () => {
      ctx.moveTo(cx - r * 0.3, cy + r * 0.46);
      ctx.quadraticCurveTo(cx + r * 0.04, cy + r * 1.06, cx + r * 0.34, cy + r * 0.46);
      ctx.quadraticCurveTo(cx + r * 0.04, cy + r * 0.62, cx - r * 0.3, cy + r * 0.46);
      ctx.closePath();
    }, c.hair);
  }
}

function drawAccessory(ctx, cx, cy, r, def) {
  const c = def.c;
  const a = def.accessory;
  if (a === 'visor') {
    // translucent AR visor — eyes stay visible through the tint
    ctx.fillStyle = 'rgba(41,217,255,0.32)';
    ctx.strokeStyle = 'rgba(41,217,255,0.95)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.roundRect(cx - r * 0.58, cy - r * 0.24, r * 1.16, r * 0.44, r * 0.17);
    ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(cx - r * 0.4, cy - r * 0.12); ctx.lineTo(cx - r * 0.02, cy - r * 0.12); ctx.stroke();
  } else if (a === 'glasses') {
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2.5;
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    for (const s of [0.12, 0.78]) {
      ctx.beginPath(); ctx.roundRect(cx - r * 0.28 + r * s, cy - r * 0.18, r * 0.42, r * 0.36, 3); ctx.fill(); ctx.stroke();
    }
  } else if (a === 'shades') {
    // two slim tinted lenses — brows above, eyes faintly visible through
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2.5;
    ctx.fillStyle = 'rgba(16,18,28,0.58)';
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.roundRect(cx + s * r * 0.36 - r * 0.27, cy - r * 0.16, r * 0.54, r * 0.34, r * 0.13);
      ctx.fill(); ctx.stroke();
    }
    ctx.beginPath(); ctx.moveTo(cx - r * 0.1, cy - r * 0.04); ctx.lineTo(cx + r * 0.1, cy - r * 0.04); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx + r * 0.63, cy - r * 0.06); ctx.lineTo(cx + r * 0.94, cy - r * 0.14); ctx.stroke();
  } else if (a === 'stubble') {
    ctx.fillStyle = 'rgba(30,30,40,0.25)';
    ctx.beginPath(); ctx.arc(cx, cy + r * 0.5, r * 0.55, 0, Math.PI); ctx.fill();
  } else if (a === 'earrings') {
    ctx.fillStyle = c.accent;
    ctx.beginPath(); ctx.arc(cx - r * 0.92, cy + r * 0.35, 3.4, 0, 7); ctx.fill();
  } else if (a === 'brooch') {
    // drawn on torso elsewhere; nothing on the head
  }
}

// Draws head at (cx, cy) with radius r.
//
// A photo only replaces the FACE, never the whole head — hair is drawn behind
// it (slightly oversized so it frames the circular crop) and headwear on top.
// Drawing the photo alone is what used to make uploaded faces look bald.
function drawHead(ctx, def, cx, cy, r, face, t, unicorn) {
  const photo = def.photo ? getPhoto(def.photo) : null;
  if (photo) {
    ctx.save();
    ctx.translate(cx, cy); ctx.scale(1.1, 1.1); ctx.translate(-cx, -cy);
    drawHair(ctx, cx, cy, r, def, t);
    ctx.restore();

    ctx.save();
    ctx.imageSmoothingQuality = 'high';
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.closePath(); ctx.clip();
    ctx.drawImage(photo, cx - r, cy - r, r * 2, r * 2);
    ctx.restore();
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 3.5;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.stroke();

    drawHeadwear(ctx, cx, cy, r, def);
    if (def.accessory === 'earrings') drawAccessory(ctx, cx, cy, r, def);
  } else {
    blob(ctx, () => { ctx.arc(cx, cy, r, 0, 7); }, def.c.skin);
    drawFace(ctx, cx, cy, r, face, def.c, def.face);
    drawFacialHair(ctx, cx, cy, r, def);
    drawHair(ctx, cx, cy, r, def, t);
    drawEyewear(ctx, cx, cy, r, def);
    drawHeadwear(ctx, cx, cy, r, def);
    if (def.accessory === 'earrings' || def.accessory === 'brooch') drawAccessory(ctx, cx, cy, r, def);
  }
  if (unicorn) drawHorn(ctx, cx, cy, r);
}

// The golden horn a unicorn-state fighter wears.
function drawHorn(ctx, cx, cy, r) {
  ctx.save();
  ctx.translate(cx + r * 0.15, cy - r * 0.92);
  ctx.rotate(0.18);
  blob(ctx, () => {
    ctx.moveTo(-6, 0); ctx.lineTo(6, 0); ctx.lineTo(0, -r * 1.05); ctx.closePath();
  }, '#ffd23f');
  ctx.restore();
}

// ---------------------------------------------------------------- body

function drawTorso(ctx, def, P) {
  const c = def.c;
  // Shoulders drive the torso's width, so a heavy build actually reads heavy
  // rather than being a normal torso with thicker arms bolted on.
  const w = 24 * (P.shoulderW ?? 1) * (0.5 + 0.5 * (P.build ?? 1));
  const topY = P.shoulderY, botY = P.hipY;

  // Every detail below is authored against a STYLIZE.TORSO_REF-tall torso.
  // `ty` places one a fraction of the way down from the collar instead of a
  // fixed number of pixels, so a longer torso carries its collar, tie, lapels
  // and hem down with it rather than stranding them at the neck above a blank
  // slab. `by` does the same from the waist up.
  const k = Math.max(1, botY - topY) / STYLIZE.TORSO_REF;
  const ty = (d) => topY + d * k;
  const by = (d) => botY + d * k;

  blob(ctx, () => {
    ctx.moveTo(-w + 3, by(8));
    ctx.quadraticCurveTo(-w - 4, (topY + botY) / 2, -w + 2, ty(2));
    ctx.quadraticCurveTo(0, ty(-10), w + 2, ty(4));
    ctx.quadraticCurveTo(w + 7, (topY + botY) / 2, w - 2, by(8));
    ctx.closePath();
  }, c.suit);
  if (def.outfit === 'blazer' || def.outfit === 'suit' || def.outfit === 'pinstripe') {
    // shirt V + lapels
    blob(ctx, () => {
      ctx.moveTo(-7, ty(2)); ctx.lineTo(0, ty(22)); ctx.lineTo(7, ty(2)); ctx.closePath();
    }, '#f4f6ff');
    if (def.outfit === 'pinstripe') {
      ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 1.5;
      for (let i = -3; i <= 3; i++) {
        ctx.beginPath(); ctx.moveTo(i * 7, ty(2)); ctx.lineTo(i * 7, by(4)); ctx.stroke();
      }
    }
    // suit and pinstripe wear a tie; a blazer is worn open
    if (def.outfit === 'pinstripe' || def.outfit === 'suit') {
      blob(ctx, () => {
        ctx.moveTo(-3, ty(14)); ctx.lineTo(3, ty(14)); ctx.lineTo(1, ty(38)); ctx.lineTo(-1, ty(38)); ctx.closePath();
      }, c.accent);
    }
    ctx.strokeStyle = c.suit2; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-8, ty(2)); ctx.lineTo(-2, ty(16)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(8, ty(2)); ctx.lineTo(2, ty(16)); ctx.stroke();
  } else if (def.outfit === 'hoodie') {
    // hood behind neck + pocket + strings
    blob(ctx, () => { ctx.arc(-14, ty(6), 11, Math.PI * 0.6, Math.PI * 1.9); }, c.suit2);
    ctx.strokeStyle = c.accent; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(-4, ty(8)); ctx.lineTo(-4, ty(22)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(4, ty(8)); ctx.lineTo(4, ty(22)); ctx.stroke();
    ctx.strokeStyle = c.suit2; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-14, by(-2)); ctx.quadraticCurveTo(0, by(8), 14, by(-2)); ctx.stroke();
  } else if (def.outfit === 'turtleneck') {
    blob(ctx, () => { ctx.roundRect(-11, ty(-6), 22, 10, 3); }, c.suit2);
  } else if (def.outfit === 'tee') {
    // plain crew-neck tee with a tiny rocket doodle
    ctx.strokeStyle = c.suit2; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, ty(3), 8, 0.25, Math.PI - 0.25); ctx.stroke();
    ctx.fillStyle = c.accent;
    ctx.beginPath();
    ctx.moveTo(0, ty(16)); ctx.lineTo(4, ty(26)); ctx.lineTo(0, ty(36)); ctx.lineTo(-4, ty(26));
    ctx.closePath(); ctx.fill();
  } else if (def.outfit === 'vest') {
    // shirt + puffer vest panels
    blob(ctx, () => {
      ctx.moveTo(-7, ty(2)); ctx.lineTo(0, ty(18)); ctx.lineTo(7, ty(2)); ctx.closePath();
    }, '#e8ecf4');
    ctx.strokeStyle = c.suit2; ctx.lineWidth = 4;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(s * 9, ty(2));
      ctx.quadraticCurveTo(s * 15, (topY + botY) / 2, s * 11, by(4));
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath(); ctx.moveTo(-16, ty(14 + i * 12)); ctx.lineTo(-9, ty(14 + i * 12)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(9, ty(14 + i * 12)); ctx.lineTo(16, ty(14 + i * 12)); ctx.stroke();
    }
  } else if (def.outfit === 'henley') {
    // crew neck + button placket
    ctx.strokeStyle = c.suit2; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, ty(3), 8, 0.25, Math.PI - 0.25); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, ty(10)); ctx.lineTo(0, ty(26)); ctx.stroke();
    ctx.fillStyle = c.suit2;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath(); ctx.arc(3, ty(13 + i * 6), 1.6, 0, 7); ctx.fill();
    }
  } else if (def.outfit === 'bomber') {
    ctx.strokeStyle = c.accent; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-w + 3, by(4)); ctx.lineTo(w - 2, by(4)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, ty(4)); ctx.lineTo(0, by(4)); ctx.stroke();
  }
  if (def.accessory === 'brooch') {
    ctx.fillStyle = c.accent;
    ctx.beginPath(); ctx.arc(10, ty(10), 3.6, 0, 7); ctx.fill();
  }
}

// ---- Street-Fighter-style shading -----------------------------------------
// The fighter is rendered once into an offscreen buffer, then a cel-shading +
// directional-light pass is composited over the whole silhouette at once. Doing
// it as a post-pass (not per-shape) means it's pose-independent: every current
// and future animation frame gets the same lit-from-above, warm-key/cool-fill
// look for free. Toggle with STYLE.shaded so we can A/B the old flat look.
// `figure` draws the body as anatomy (engine/figure.js) instead of the tube
// rig: ?figure, off by default while it is reviewed.
export const STYLE = { shaded: true, sprites: false, figure: false };

// Baked sprite atlases. Opt-in: the procedural renderer stays the default and
// the fallback, because a player's own founder is drawn from their photo and
// look choices, which no pre-baked sheet can represent.
// Frame height in px, before body.height. Tuned in July 2026 so the founder
// atlas's idle measured the 160px of the procedural fighter at the time. The
// rig has grown since (v2.7): measured in September, that idle draws 158px
// against a procedural fighter of about 200px, so re-tune against the atlas
// in use before comparing the two paths.
export const SPRITE_HEIGHT = 202;
let _spriteSet = null;
export function enableSprites(on = true, base = 'assets/sprites/founder') {
  STYLE.sprites = !!on;
  if (on && !_spriteSet) _spriteSet = loadSpriteSet('founder', base);
  return _spriteSet;
}
export function spritesReady() { return !!(_spriteSet && _spriteSet.ready); }
const SS = 2;
// One buffer per distinct body size, cached by size.
//
// A single grow-only buffer was wrong. shadeBuffer fills its gradients over
// the whole buffer rect, so enlarging the buffer for one big character shifts
// every OTHER character's shading very slightly (~0.01% — invisible to the
// eye, but real). That made a fighter's appearance depend on who else happened
// to be on screen, and made no render reproducible. Keying by size keeps each
// body deterministic, and a neutral body always lands on the historical
// 280×300 at (130, 250). At most two are live in a match.
const _buffers = new Map();
function fighterBuffer(m) {
  if (typeof document === 'undefined') return null;
  const key = `${m.w}x${m.h}@${m.ox},${m.oy}`;
  let rec = _buffers.get(key);
  if (!rec) {
    const buf = document.createElement('canvas');
    const tmp = document.createElement('canvas');
    const out = document.createElement('canvas');   // key-line scratch
    buf.width = tmp.width = out.width = m.w * SS;
    buf.height = tmp.height = out.height = m.h * SS;
    rec = { buf, tmp, out, ox: m.ox, oy: m.oy, w: m.w, h: m.h };
    _buffers.set(key, rec);
  }
  return rec;
}
// A pale line just outside the silhouette, drawn UNDER the fighter so only the
// sliver that pokes past the body is visible. The shape is dilated by stamping
// the finished fighter around a small ring and keeping the union — six taps is
// enough for a 2px line to close without corner gaps, and it is six drawImages
// of an already-rasterised buffer rather than any per-pixel work.
function keyLine(ctx, B) {
  const r = STYLIZE.KEYLINE_PX * SS;
  const o = B.out, oc = o.getContext('2d');
  oc.setTransform(1, 0, 0, 1, 0, 0);
  oc.globalCompositeOperation = 'source-over';
  oc.clearRect(0, 0, o.width, o.height);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    oc.drawImage(B.buf, Math.cos(a) * r, Math.sin(a) * r);
  }
  oc.globalCompositeOperation = 'source-in';       // recolour the union flat
  oc.fillStyle = STYLIZE.KEYLINE_COL;
  oc.fillRect(0, 0, o.width, o.height);
  oc.globalCompositeOperation = 'source-over';

  ctx.save();
  ctx.globalAlpha = STYLIZE.KEYLINE_A;
  ctx.drawImage(o, 0, 0, o.width, o.height, -B.ox, -B.oy, B.w, B.h);
  ctx.restore();
}

function shadeBuffer(b, B) {
  const _buf = B.buf, _tmp = B.tmp;
  const W = _buf.width, H = _buf.height, oy = B.oy * SS, ox = B.ox * SS;

  const tc = _tmp.getContext('2d');

  // ---- key light ----
  // Runs FIRST, and borrows _tmp as a silhouette mask before the rim needs it.
  //
  // This used to be one stop of the shading gradient below, filled with
  // source-atop. source-atop is a flat lerp toward the fill colour, and a flat
  // lerp CONVERGES: at 0.46 toward a warm white, every colour moved 46% of the
  // way to the same value. Six characters with near-black hair (17-56
  // luminance) all landed on 110-144 — the same grey. Nobody in the game had
  // dark hair, and the cast read as one silver-haired person in nine jackets.
  //
  // `overlay` multiplies where the base is dark and screens where it is light,
  // so material colour survives the light. The catch, and it is the whole
  // reason this is three statements instead of one: source-atop clips itself
  // to existing pixels, and overlay does NOT — it paints the full rect. Left
  // unclipped it fills the buffer with a grey slab, which is both visibly wrong
  // and quietly poisonous, because lab/contrast.js then measures the slab
  // instead of the fighter and reports a contrast WIN. Hence destination-in.
  tc.setTransform(1, 0, 0, 1, 0, 0);
  tc.clearRect(0, 0, W, H);
  tc.globalCompositeOperation = 'source-over';
  tc.drawImage(_buf, 0, 0);                            // mask: the raw silhouette

  b.save();
  b.globalCompositeOperation = STYLIZE.SHADE_KEY_MODE;
  const gk = b.createLinearGradient(0, oy - 178 * SS, 0, oy - 40 * SS);
  gk.addColorStop(0, `rgba(255,246,224,${STYLIZE.SHADE_KEY})`);
  gk.addColorStop(1, 'rgba(255,246,224,0)');
  b.fillStyle = gk; b.fillRect(0, 0, W, H);
  b.globalCompositeOperation = 'destination-in';       // ...and back inside the lines
  b.drawImage(_tmp, 0, 0);
  b.restore();

  // ---- rim light: a warm crescent on the upper-key edge of the silhouette ----
  // built as (white silhouette) minus (white silhouette shifted toward shadow),
  // which leaves just the lit contour.
  tc.setTransform(1, 0, 0, 1, 0, 0);
  tc.clearRect(0, 0, W, H);
  tc.globalCompositeOperation = 'source-over';
  tc.drawImage(_buf, 0, 0);
  tc.globalCompositeOperation = 'source-in';
  tc.fillStyle = '#fff5df'; tc.fillRect(0, 0, W, H);   // warm-white silhouette
  tc.globalCompositeOperation = 'destination-out';
  tc.drawImage(_buf, -5 * SS, 6 * SS);                 // carve → rim on upper-right

  // ---- form + directional shading, clipped to the fighter ----
  b.save();
  b.globalCompositeOperation = 'source-atop';
  // Key light up, floor crush down, so the character is the brightest thing on
  // screen. The old pair was +0.32 / -0.52.
  //
  // The numbers that first justified this change were junk: the probe sampled a
  // fixed screen column and called it "the fighter", and the column was mostly
  // backdrop. It reported the fighter's own brightness changing per arena,
  // which cannot happen — this shader does not know what stage it is on.
  // lab/contrast.js now locates the fighter by diffing a with- and a
  // without-fighters render, and is the only thing worth trusting here.
  //
  // The key light moved OUT of this gradient (see the key pass above) — it and
  // the floor want opposite blend modes, and sharing one fill meant the key's
  // flat lerp was flattening the whole palette. What is left here is the mid
  // and the floor crush, which genuinely do want to converge toward a colour,
  // and which were tuned against measurement. Left alone.
  const g = b.createLinearGradient(0, oy - 178 * SS, 0, oy + 8 * SS);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.44, `rgba(255,255,255,${STYLIZE.SHADE_MID})`);
  g.addColorStop(1, `rgba(5,5,16,${STYLIZE.SHADE_FLOOR})`);
  b.fillStyle = g; b.fillRect(0, 0, W, H);
  const g2 = b.createLinearGradient(ox - 84 * SS, 0, ox + 84 * SS, 0);
  g2.addColorStop(0, 'rgba(26,42,104,0.30)');
  g2.addColorStop(0.5, 'rgba(0,0,0,0)');
  g2.addColorStop(1, 'rgba(255,166,72,0.17)');
  b.fillStyle = g2; b.fillRect(0, 0, W, H);
  b.restore();

  // ---- add the rim on top, additively (kept restrained so heads don't halo) ----
  b.save();
  b.globalCompositeOperation = 'lighter';
  b.globalAlpha = 0.55;
  b.drawImage(_tmp, 0, 0);
  b.restore();
}

// Motion smear behind the striking limb: the arc it swept through, drawn as
// a wedge. Which frames smear is now ANIMATION DATA (`smear` on a keyframe)
// rather than a hardcoded list of attack kinds, so an authored track decides
// it, and a command normal or a signature special can smear without the
// renderer knowing anything about them.
function drawSmear(g, P, f, c, shFx, shFy, hipFx, hipFy) {
  if (!(P.smear && f.state === 'attack' && f.attack)) return;
  const isLeg = (f.attack.button || f.attack.kind) === 'kick';
  const ox = isLeg ? hipFx : shFx;
  const oy = isLeg ? hipFy : shFy;
  const tx = isLeg ? P.legF.x : P.armF.x;
  const ty = isLeg ? P.legF.y - 6 : P.armF.y;
  const rad = Math.hypot(tx - ox, ty - oy);
  const ang = Math.atan2(ty - oy, tx - ox);
  g.save();
  // two wedges: a wide faint one for the sweep, a tight bright one at the tip
  for (const [span, alpha, inner] of [[1.15, 0.20, 0.34], [0.5, 0.34, 0.62]]) {
    g.globalAlpha = alpha;
    g.fillStyle = c.accent;
    g.beginPath();
    g.arc(ox, oy, rad, ang - span, ang + 0.06);
    g.arc(ox, oy, rad * inner, ang + 0.06, ang - span, true);
    g.closePath();
    g.fill();
  }
  g.restore();
}

// Main world-space fighter draw. f: Fighter instance.
// The last pose each fighter was drawn in, for effects that follow a limb
// (engine/vfx.js). Kept only while those effects are on.
const lastPoses = new WeakMap();
export const poseOf = (f) => lastPoses.get(f);

// How far into the round's start the game being drawn is, in seconds, or
// null once it is live: set by the render loop before it draws the fighters,
// as setClock3D is, so a form can open the round in its own way.
let roundStart = null;
export function setRoundStart(sec) { roundStart = sec; }

export function drawFighter(ctx, f, t) {
  const tDraw = timing3D() ? performance.now() : 0;
  const def = f.def;
  const body = f.body || clampBody(def.body);
  const P = applyProportions(computePose(f, t, form3D(def), roundStart), body);
  if (FX_STYLE.impact) lastPoses.set(f, { P, t });
  const c = def.c;
  ctx.save();
  ctx.translate(f.x, f.y);

  // unicorn aura behind body (world space, never shaded)
  if (f.unicornT > 0) {
    const hue = (t * 260) % 360;
    const g = ctx.createRadialGradient(0, -74, 8, 0, -74, 108);
    g.addColorStop(0, `hsla(${hue}, 95%, 65%, 0.5)`);
    g.addColorStop(1, 'hsla(0, 0%, 100%, 0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, -74, 108, 0, 7); ctx.fill();
  }

  ctx.scale(f.facing, 1);
  if (P.rot) ctx.rotate(P.rot);

  // Live 3D path (?gl, prototype). The model is posed from this same P and
  // rendered into the same offscreen buffer, so the key line, hit flash and
  // blit are shared with the procedural rig below. Parts are not drawn yet.
  if (has3D(def)) {
    if (athlete3D(def)) figureFrame(P);    // the athlete body stands on the figure's longer legs
    if (P.fall !== undefined) {
      const g = groundFall(P);
      ctx.translate(g.x, g.y);
    }
    if (form3D(def)) landStrike(f, P, t, form3D(def), body, athlete3D(def));
    const metrics = bufferMetrics(body);
    const stanceEl = f.state === 'idle' ? (def.stance || null) : null;
    // On the 3D layer (GL3D.LAYER, set up by render.js for this frame): drawn
    // straight onto the WebGL canvas on screen at the place the buffer would
    // go, key line and hit flash included, so nothing is copied back.
    if (layerActive3D() && drawLayer3D(f, P, ctx.getTransform(), metrics, {
      elbowF: stanceEl?.elbowF ?? STYLIZE.ELBOW,
      elbowB: stanceEl?.elbowB ?? STYLIZE.ELBOW,
      jitter: f.state === 'hitstun' ? (Math.random() - 0.5) * 3 : 0,
      face: FACE_PAINTER,
      flash: f.flashT > 0,
      keyline: STYLIZE.KEYLINE_A > 0 ? { px: STYLIZE.KEYLINE_PX, color: STYLIZE.KEYLINE_COL, alpha: STYLIZE.KEYLINE_A } : null,
    })) {
      ctx.restore();
      return;
    }
    const B = fighterBuffer(metrics);
    if (B && render3D(B, f, P, {
      elbowF: stanceEl?.elbowF ?? STYLIZE.ELBOW,
      elbowB: stanceEl?.elbowB ?? STYLIZE.ELBOW,
      jitter: f.state === 'hitstun' ? (Math.random() - 0.5) * 3 : 0,
      face: FACE_PAINTER,
    })) {
      if (STYLIZE.KEYLINE_A > 0) keyLine(ctx, B);
      if (f.flashT > 0 && FILTER_OK) ctx.filter = 'brightness(2.2) saturate(0.4)';
      ctx.drawImage(B.buf, 0, 0, B.buf.width, B.buf.height, -B.ox, -B.oy, B.w, B.h);
      ctx.filter = 'none';
      ctx.restore();
      return;
    }
  }

  // Baked sprite path. Body proportions scale the sheet rather than re-posing
  // a rig, so the P1 knobs still give a lanky zoner and a squat grappler.
  if (STYLE.sprites && _spriteSet) {
    const drew = drawSprite(ctx, _spriteSet, f, t, {
      height: SPRITE_HEIGHT * body.height,
      scaleX: body.build,
      scaleY: 1,
    });
    if (drew) {
      if (f.flashT > 0 && FILTER_OK) {
        ctx.save();
        ctx.globalCompositeOperation = 'source-atop';
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.fillRect(-200, -260, 400, 300);
        ctx.restore();
      }
      ctx.filter = 'none';
      ctx.restore();
      return;
    }
    // not loaded yet (or no frame for this state) — fall through to procedural
  }

  const B = STYLE.shaded ? fighterBuffer(bufferMetrics(body)) : null;
  // Render the body either into the shading buffer (local, upright, facing +x)
  // or straight to the world ctx when shading is off.
  let g = ctx;
  if (B) {
    g = B.buf.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, B.buf.width, B.buf.height);
    g.save();
    g.scale(SS, SS);
    g.translate(B.ox, B.oy);
    INK = 1.32;                 // bolder ink for the buffer render only
  } else if (f.flashT > 0 && FILTER_OK) {
    ctx.filter = 'brightness(2.2) saturate(0.4)';
  }

  const hitJitter = f.state === 'hitstun' ? (Math.random() - 0.5) * 3 : 0;
  g.translate(hitJitter, 0);
  // squash & stretch, anchored at the feet so the fighter never floats
  if (P.sx !== 1 || P.sy !== 1) g.scale(P.sx, P.sy);

  // Limb gauges. Body build scales them; STYLIZE sets the arcade baseline.
  const bw = (P.build ?? 1);
  const upperArm = STYLIZE.UPPER_ARM * bw, foreArm = STYLIZE.FOREARM * bw;
  const thigh = STYLIZE.THIGH * bw, shin = STYLIZE.SHIN * bw;
  const handF = STYLIZE.HAND_F * bw, handB = STYLIZE.HAND_B * bw;
  const footW = STYLIZE.FOOT_W * bw, footH = STYLIZE.FOOT_H * bw;

  // Limbs socket into the LEANED torso, not the upright one. The torso rotates
  // about the hip, so a strong lean swings the shoulders several pixels — thin
  // limbs hid the gap, thick ones do not, and a kicking leg that starts in
  // mid-air is the first thing the eye catches.
  const lean = (P.bodyLean || 0) * 0.6;
  const cosL = Math.cos(lean), sinL = Math.sin(lean);
  const socket = (x, y) => {
    const dy = y - P.hipY;
    return [x * cosL - dy * sinL, P.hipY + x * sinL + dy * cosL];
  };
  const [shFx, shFy] = socket(10, P.shoulderY + 8);
  const [shBx, shBy] = socket(-10, P.shoulderY + 8);
  const [hipFx, hipFy] = socket(8, P.hipY);
  const [hipBx, hipBy] = socket(-8, P.hipY);

  // Resolved once and reused by both layers. `c` is the character's live
  // palette, so a part with a role fill recolours with the fighter — including
  // a player founder whose colours were sampled from their photo.
  P.partState = f.state;
  // The figure has its own proportions and sits the head on a neck; parts
  // anchored to the hip or the head follow both.
  if (STYLE.figure) { figureFrame(P); P.headAt = figureHead(P); }
  f._partLag ||= partLagState();
  const parts = resolveParts(def.parts, P, c, f._partLag);

  if (STYLE.figure) {
    drawFigure(g, def, P, f, t, INK, {
      behind: () => { if (parts.length) drawParts(g, parts, 'behind', blob); },
      front: () => { if (parts.length) drawParts(g, parts, 'front', blob); },
      hair: (gg, x, y, r, d) => drawHair(gg, x, y, r, d, t),
      headwear: (gg, x, y, r, d) => drawHeadwear(gg, x, y, r, d),
      photoHead: (gg, x, y, r) => drawHead(gg, def, x, y, r, P.face, t, f.unicornT > 0),
      horn: (gg, x, y, r) => { if (f.unicornT > 0 && !def.photo) drawHorn(gg, x, y, r); },
      smear: (sx, sy, hx, hy) => drawSmear(g, P, f, c, sx, sy, hx, hy),
    });
  } else {

  // Elbow bow, per character. One global ELBOW meant both arms bent the same
  // way, so an arm folded close to the body just fused into the torso and the
  // silhouette lost it — "hands on hips" and "arms crossed" were invisible.
  // Splaying them needs OPPOSITE signs, which a single constant cannot express.
  // jointed() bends by bend*slack and slack rises as the hand nears the
  // shoulder, so a tucked arm is exactly where this matters most.
  const stanceEl = f.state === 'idle' ? (f.def?.stance || null) : null;
  const elbowF = stanceEl?.elbowF ?? STYLIZE.ELBOW;
  const elbowB = stanceEl?.elbowB ?? STYLIZE.ELBOW;

  // BEHIND the body: capes, coat tails, anything the torso should overlap.
  if (parts.length) drawParts(g, parts, 'behind', blob);

  // back arm, back leg — one shade back so the near side reads in front
  blob(g, () => { g.arc(shBx, shBy, upperArm * 0.9 * STYLIZE.DELTOID * 0.5, 0, 7); }, c.suit2);
  jointed(g, shBx, shBy, P.armB.x, P.armB.y, upperArm * 0.9, foreArm * 0.9,
          c.suit2, elbowB, STYLIZE.ARM_SPAN);
  blob(g, () => { g.arc(P.armB.x, P.armB.y, handB, 0, 7); }, c.skin);
  jointed(g, hipBx, hipBy, P.legB.x, P.legB.y - 6, thigh * 0.92, shin * 0.92,
          c.pants, -STYLIZE.KNEE, STYLIZE.LEG_SPAN);
  boot(g, hipBx, hipBy, P.legB.x, P.legB.y, footW, footH, c.shoe, 0.34);

  // torso (with lean)
  g.save();
  if (P.bodyLean) {
    g.translate(0, P.hipY);
    g.rotate(P.bodyLean * 0.6);
    g.translate(0, -P.hipY);
  }
  drawTorso(g, def, P);
  // Keep the skull on the neck. headY and shoulderY are independent joints, so
  // a smaller head or a longer torso can leave it floating clear of the body —
  // never lower it, only stop it drifting up off the shoulders.
  const headR = P.headR ?? STYLIZE.HEAD_R;
  const headTop = P.shoulderY - (headR - STYLIZE.NECK_OVERLAP);
  drawHead(g, def, P.headX + (P.bodyLean * 26), Math.max(P.headY, headTop), headR, P.face, t, f.unicornT > 0);
  g.restore();

  drawSmear(g, P, f, c, shFx, shFy, hipFx, hipFy);

  // front leg, front arm — the striking limbs, so the heaviest gauge
  jointed(g, hipFx, hipFy, P.legF.x, P.legF.y - 6, thigh, shin,
          c.pants, -STYLIZE.KNEE, STYLIZE.LEG_SPAN);
  boot(g, hipFx, hipFy, P.legF.x, P.legF.y, footW, footH, c.shoe, 0.26);
  // Deltoid first, then the arm over it — the cap only shows where it actually
  // protrudes, and the limb's own outline stays clean.
  blob(g, () => { g.arc(shFx, shFy, upperArm * STYLIZE.DELTOID * 0.5, 0, 7); }, c.suit);
  jointed(g, shFx, shFy, P.armF.x, P.armF.y, upperArm, foreArm,
          c.suit, elbowF, STYLIZE.ARM_SPAN);
  blob(g, () => { g.arc(P.armF.x, P.armF.y, handF, 0, 7); }, c.skin);

  // IN FRONT of the body: held props. Still inside the buffer, so the shading
  // pass and key line treat them as part of the silhouette.
  if (parts.length) drawParts(g, parts, 'front', blob);
  }

  if (B) {
    INK = 1;                   // reset before shading/blit
    g.restore();               // undo scale/translate
    shadeBuffer(g, B);         // cel-shade the whole silhouette at once
    if (STYLIZE.KEYLINE_A > 0) keyLine(ctx, B);   // separation, under the body
    ctx.save();
    if (f.flashT > 0 && FILTER_OK) ctx.filter = 'brightness(2.2) saturate(0.4)';
    ctx.drawImage(B.buf, 0, 0, B.buf.width, B.buf.height, -B.ox, -B.oy, B.w, B.h);
    ctx.restore();
  }

  ctx.filter = 'none';
  ctx.restore();
  if (tDraw) mark2D(performance.now() - tDraw);
}

// ---------------------------------------------------------------- portraits

// Bust portrait onto a square canvas 2d context (UI panels, HUD, cards).
// Portraits are where players actually look at themselves — the profile
// preview, leaderboard rows and challenge cards. Without this every outfit
// collapsed into "has a collar" / "doesn't", so the choice was invisible.
function drawPortraitNeckline(ctx, def, S, k) {
  const O = def.outfit;
  const white = '#f4f6ff';
  const shoulders = () => {
    ctx.moveTo(S * 0.1, S * 1.05);
    ctx.quadraticCurveTo(S * 0.12, S * 0.68, S * 0.5, S * 0.66);
    ctx.quadraticCurveTo(S * 0.88, S * 0.68, S * 0.9, S * 1.05);
    ctx.closePath();
  };
  const vCollar = (fill) => blob(ctx, () => {
    ctx.moveTo(S * 0.4, S * 0.67); ctx.lineTo(S * 0.5, S * 0.87); ctx.lineTo(S * 0.6, S * 0.67); ctx.closePath();
  }, fill);

  if (O === 'pinstripe') {
    ctx.save();
    ctx.beginPath(); shoulders(); ctx.clip();
    ctx.strokeStyle = 'rgba(255,255,255,0.32)'; ctx.lineWidth = 1.3 * k;
    for (let x = S * 0.13; x < S * 0.92; x += S * 0.075) {
      ctx.beginPath(); ctx.moveTo(x, S * 0.6); ctx.lineTo(x, S * 1.06); ctx.stroke();
    }
    ctx.restore();
  }

  if (O === 'blazer' || O === 'suit' || O === 'pinstripe') {
    vCollar(white);
    if (O === 'suit') {                                   // tie down the shirt
      blob(ctx, () => {
        ctx.moveTo(S * 0.5, S * 0.75); ctx.lineTo(S * 0.545, S * 0.82);
        ctx.lineTo(S * 0.525, S * 1.04); ctx.lineTo(S * 0.475, S * 1.04);
        ctx.lineTo(S * 0.455, S * 0.82); ctx.closePath();
      }, def.c.accent);
    }
  } else if (O === 'vest') {
    vCollar(white);                                       // shirt under the vest
    blob(ctx, () => {                                     // vest opening
      ctx.moveTo(S * 0.36, S * 0.7); ctx.lineTo(S * 0.5, S * 0.98);
      ctx.lineTo(S * 0.64, S * 0.7); ctx.lineTo(S * 0.6, S * 0.68);
      ctx.lineTo(S * 0.5, S * 0.9); ctx.lineTo(S * 0.4, S * 0.68); ctx.closePath();
    }, shade(def.c.suit, -30));
  } else if (O === 'turtleneck') {
    blob(ctx, () => {
      ctx.roundRect(S * 0.36, S * 0.62, S * 0.28, S * 0.16, S * 0.05);
    }, shade(def.c.suit, 20));
  } else if (O === 'hoodie') {
    blob(ctx, () => {                                     // hood behind the head
      ctx.moveTo(S * 0.2, S * 0.86);
      ctx.quadraticCurveTo(S * 0.14, S * 0.34, S * 0.5, S * 0.3);
      ctx.quadraticCurveTo(S * 0.86, S * 0.34, S * 0.8, S * 0.86);
      ctx.quadraticCurveTo(S * 0.5, S * 0.7, S * 0.2, S * 0.86);
      ctx.closePath();
    }, shade(def.c.suit, -22));
    ctx.strokeStyle = white; ctx.lineWidth = 2.2 * k; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(S * 0.44, S * 0.76); ctx.lineTo(S * 0.42, S * 0.98);
    ctx.moveTo(S * 0.56, S * 0.76); ctx.lineTo(S * 0.58, S * 0.98);
    ctx.stroke();
  } else if (O === 'bomber') {
    blob(ctx, () => {                                     // ribbed collar band
      ctx.roundRect(S * 0.3, S * 0.68, S * 0.4, S * 0.1, S * 0.04);
    }, def.c.accent);
    ctx.strokeStyle = shade(def.c.suit, -34); ctx.lineWidth = 2 * k;
    ctx.beginPath(); ctx.moveTo(S * 0.5, S * 0.78); ctx.lineTo(S * 0.5, S * 1.05); ctx.stroke();
  } else if (O === 'henley') {
    blob(ctx, () => {                                     // placket
      ctx.roundRect(S * 0.44, S * 0.68, S * 0.12, S * 0.24, S * 0.03);
    }, shade(def.c.suit, 26));
    ctx.fillStyle = white;
    for (const y of [0.74, 0.83]) { ctx.beginPath(); ctx.arc(S * 0.5, S * y, 1.6 * k, 0, 7); ctx.fill(); }
  } else if (O === 'tee') {
    blob(ctx, () => {                                     // crew neck
      ctx.moveTo(S * 0.38, S * 0.67);
      ctx.quadraticCurveTo(S * 0.5, S * 0.8, S * 0.62, S * 0.67);
      ctx.quadraticCurveTo(S * 0.5, S * 0.73, S * 0.38, S * 0.67);
      ctx.closePath();
    }, shade(def.c.suit, 30));
  }
}

// The 3D bust, when the live 3D renderer (?gl) has this fighter: the model
// and face they fight with, turned toward the viewer, hands down below the
// frame where a guard would cover the face. `opts.mirror` turns them to face
// left. A photo founder keeps the 2D bust, since the photo is the face.
//
// A portrait drawn while the model is still loading is drawn in 2D, and again
// once the model lands (or fails, when it simply stays 2D). Only the latest
// thing drawn into a canvas counts: drawPortrait cancels a queued redraw of
// its canvas, and anything else that draws into a portrait canvas (the
// RANDOM tile) calls releasePortrait, or the late redraw would paint over it.
const bustRedraws = new Map();          // canvas -> [def, opts]
let redrawArmed = false;
export function releasePortrait(canvas) { bustRedraws.delete(canvas); }
function drawBust3D(canvas, ctx, def, opts) {
  if (def.photo) return false;
  if (pending3D(def)) {
    bustRedraws.set(canvas, [def, opts]);
    if (!redrawArmed) {
      redrawArmed = true;
      on3DReady(() => {
        redrawArmed = false;
        const queued = [...bustRedraws];
        bustRedraws.clear();
        for (const [c, [d, o]] of queued) drawPortrait(c, d, o);
      });
    }
    return false;
  }
  if (!has3D(def)) return false;
  const body = clampBody(def.body);
  const P = applyProportions(computePose({
    def, body, side: 0, x: 0, y: 0, facing: 1, state: 'idle', stateT: 0, walkPhase: 0, vy: 0,
    airborne: false, crouching: false, movingBack: false, unicornT: 0, flashT: 0, attack: null,
  }, 0), body);
  const { HAND_F: hf, HAND_B: hb } = GL3D.BUST;
  P.armF = { x: hf[0], y: P.hipY + hf[1] };
  P.armB = { x: hb[0], y: P.hipY + hb[1] };
  return renderBust3D(ctx, { x: 0, y: 0, w: canvas.width, h: canvas.height }, def, P, {
    expression: opts.face || 'idle', face: FACE_PAINTER, mirror: !!opts.mirror, unicorn: !!opts.unicorn,
    close: !opts.bare,                     // the cut-in brings its own band and framing
  });
}

// `opts.bare` draws the bust alone on a transparent canvas, with no backdrop,
// grade or frame: for a cut-in that brings its own (engine/vfx.js).
export function drawPortrait(canvas, def, opts = {}) {
  releasePortrait(canvas);                 // this call supersedes any queued redraw
  const ctx = canvas.getContext('2d');
  const S = canvas.width;
  const k = S / 100;
  ctx.clearRect(0, 0, S, S);
  if (!opts.bare) {
    // backdrop — lifted so dark suits still read against dark UI
    const g = ctx.createLinearGradient(0, 0, S, S);
    g.addColorStop(0, shade(def.c.suit, 34));
    g.addColorStop(1, '#1a2138');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.roundRect(0, 0, S, S, 12 * k); ctx.fill();
  }
  // burst rays
  ctx.save();
  ctx.beginPath(); ctx.roundRect(0, 0, S, S, 12 * k); ctx.clip();
  if (!opts.bare) {
    ctx.globalAlpha = 0.14;
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 9; i++) {
      ctx.save();
      ctx.translate(S / 2, S * 0.62);
      ctx.rotate((i / 9) * Math.PI * 2 + 0.3);
      ctx.fillRect(-4 * k, 0, 8 * k, S);
      ctx.restore();
    }
  }
  ctx.globalAlpha = 1;
  if (!drawBust3D(canvas, ctx, def, opts)) {
    // shoulders
    blob(ctx, () => {
      ctx.moveTo(S * 0.1, S * 1.05);
      ctx.quadraticCurveTo(S * 0.12, S * 0.68, S * 0.5, S * 0.66);
      ctx.quadraticCurveTo(S * 0.88, S * 0.68, S * 0.9, S * 1.05);
      ctx.closePath();
    }, def.c.suit);
    drawPortraitNeckline(ctx, def, S, k);
    ctx.save();
    ctx.translate(0, 0);
    const headR = S * 0.24;
    const scale = headR / 22;
    ctx.translate(S / 2, S * 0.42);
    ctx.scale(scale, scale);
    ctx.translate(0, 0);
    drawHead(ctx, def, 0, 0, 22, opts.face || 'idle', opts.t || 1, !!opts.unicorn);
    ctx.restore();
  }
  if (opts.bare) {
    ctx.restore();                // release the clip; no grade, no frame
    return;
  }

  // ---- cinematic light, matching the in-fight fighter shading (v2.0) ----
  // Still inside the rounded-rect clip, so it lights the whole bust + backdrop
  // as one image instead of looking like a sticker on a panel.
  // Kept deliberately light: portraits are small and often dark-suited, so a
  // heavy grade turns Steve/Carl/Elo into mud. Enough to feel lit, not enough
  // to lose the outfit.
  const lit = ctx.createLinearGradient(0, 0, 0, S);
  lit.addColorStop(0, 'rgba(255,243,216,0.15)');
  lit.addColorStop(0.5, 'rgba(255,255,255,0)');
  lit.addColorStop(1, 'rgba(5,5,16,0.20)');
  ctx.fillStyle = lit;
  ctx.fillRect(0, 0, S, S);
  const side = ctx.createLinearGradient(0, 0, S, 0);
  side.addColorStop(0, 'rgba(26,42,104,0.16)');
  side.addColorStop(0.55, 'rgba(0,0,0,0)');
  side.addColorStop(1, 'rgba(255,166,72,0.13)');
  ctx.fillStyle = side;
  ctx.fillRect(0, 0, S, S);
  // corner vignette so the bust sits in its frame
  const vig = ctx.createRadialGradient(S / 2, S * 0.46, S * 0.34, S / 2, S * 0.5, S * 0.82);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(3,4,12,0.30)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, S, S);
  ctx.restore();   // release the rounded-rect clip

  // frame: dark ink + a subtle inner gold sheen to match the arcade chrome
  ctx.strokeStyle = 'rgba(5,7,15,0.9)'; ctx.lineWidth = 3 * k;
  ctx.beginPath(); ctx.roundRect(1.5 * k, 1.5 * k, S - 3 * k, S - 3 * k, 11 * k); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,210,63,0.20)'; ctx.lineWidth = 1.2 * k;
  ctx.beginPath(); ctx.roundRect(3.6 * k, 3.6 * k, S - 7.2 * k, S - 7.2 * k, 9 * k); ctx.stroke();
}
