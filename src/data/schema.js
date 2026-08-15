// The character format, its validator, and the power budget.
//
// Shared by the game's load path and the Incubator authoring tool, so a
// character that validates here is playable there and vice versa.

import { BODY, BUDGET, ATTACKS, PARTS } from '../config.js';

export const SCHEMA_VERSION = 2;

// ---------------------------------------------------------------- command normals
//
// The universal grammar is identical for everyone: same movement, same block,
// same four basics, same three universal moves. A character's vocabulary is
// 2–3 command normals layered on those basics — holding a direction at the
// moment you press the button selects the variant.
//
// v1 is forward-only. `back+X` is deliberately held back: block is its own
// button today, so back is free, but committing to it before the animation
// work lands would freeze a layout we may still want to change. `down+X`
// needs its own pass on how it interacts with the crouch stance.
export const COMMAND_SLOTS = ['fwd+slap', 'fwd+punch', 'fwd+kick', 'fwd+launch'];

// The basic a slot overrides — also the move its cost is measured against.
export function slotButton(slot) {
  return typeof slot === 'string' ? slot.split('+')[1] : undefined;
}

// How an input reads on a move card. Shared so the game and the authoring tool
// can never disagree about what a player is supposed to press.
export const SLOT_GLYPH = {
  'fwd+slap':   '→ 🖐',
  'fwd+punch':  '→ 👊',
  'fwd+kick':   '→ 👟',
  'fwd+launch': '→ 🚀',
};

// Combo verbs. These drive AI preference and the move card's wording; they
// carry no frame data of their own, so a wrong tag is a mislabel, not a bug.
export const MOVE_TAGS = [
  'launcher', 'overhead', 'low', 'gapCloser', 'ranged', 'command-grab',
  'counter', 'trap', 'safe', 'punish',
];

const CMD_FRAME_KEYS = ['startup', 'active', 'recovery', 'dmg', 'reach'];

// Archetypes whose animation is not the threat: a counter absorbs, a trap
// places. Their reach describes a wind-up, not a swing.
// Archetypes whose MOVE is not the swing. For these, `params` carries the
// actual behaviour (a counter's window and payback, a trap's radius and
// lifetime) and `frameData` only describes the stance that sets it up — which
// is why they are priced off params rather than off the swing's numbers.
// fighter.js has to resolve them the same way round or the price is a lie.
export const NO_SWING = new Set(['counter', 'trap']);

// `stance` is deliberately NOT in NO_SWING, even though a stance is obviously
// not a swing. NO_SWING exists for PRICING — it tells commandCost to price off
// `params` rather than frame data — and a stance cannot be a command normal at
// all: validateCharacter rejects it outright below. Adding it here would imply
// a pricing rule that has no caller and no meaning. If stances ever become
// authorable as command normals, they need a real price first, and that
// decision is what puts them in this set.

// What one command normal costs, priced against the neutral basic it replaces.
// Zero means "this is that basic, on a direction" — which is exactly free.
export function commandCost(cmd) {
  const C = BUDGET.CMD, W = BUDGET.W;
  const base = ATTACKS[slotButton(cmd?.slot)];
  if (!base) return 0;
  const fd = cmd.frameData || {};
  const r = (k) => (typeof fd[k] === 'number' && base[k] ? fd[k] / base[k] : 1);

  let cost = C.ARCHETYPE[cmd.archetype] ?? 0;
  // Launching is priced as a capability, not a number: it only counts when the
  // base move could not already do it.
  if ((fd.kbUp || 0) < 0 && !(base.kbUp < 0)) cost += C.LAUNCHER;

  // Committing to a move you cannot cancel is the cost the frame data captures.
  const commitment =
      W.startup  * (1 - r('startup'))
    + W.recovery * (1 - r('recovery'));

  if (NO_SWING.has(cmd.archetype)) {
    // Charge the hazard's damage, not the placing animation's, and charge no
    // reach at all — a trap laid at your feet is not weak for being close, and
    // refunding it for that made a trap cheaper than having no move.
    const p = cmd.params || {};
    const dmgR = (typeof p.dmg === 'number' ? p.dmg : base.dmg) / base.dmg;

    // For these two archetypes the MOVE lives in params, and until now params
    // carried no price beyond damage. A counter with a 0.05s window and one
    // with a 60s window cost the same; so did a 78px trap and a 400px one that
    // could stack twenty deep. Frame data is clamped by CMD.CLAMP, but params
    // are not validated at all, so this was the one unbounded direction in the
    // whole budget — the axis to push if you wanted something for nothing.
    const N = BUDGET.NOMINAL;
    const rel = (v, nom) => (typeof v === 'number' && v > 0 ? v / nom : 1);
    let params = 0;
    if (cmd.archetype === 'counter') {
      params = W.window * (rel(p.window, N.window) - 1);
    } else if (cmd.archetype === 'trap') {
      params =
          W.trapRadius * (rel(p.radius, N.trapRadius) - 1)
        + W.trapLife   * (rel(p.lifetime, N.trapLife) - 1)
        + W.trapCount  * (rel(p.maxActive, N.trapCount) - 1)
        // arming is inverted: a trap that goes live sooner is the better trap
        + W.trapArm    * (1 - rel(p.armTime, N.trapArm));
    }
    return cost + C.SCALE * (W.dmg * (dmgR - 1) + commitment + params) * 100;
  }

  const deltas =
      W.dmg   * (r('dmg')   - 1)
    + W.reach * (r('reach') - 1)
    + commitment;
  return cost + C.SCALE * deltas * 100;
}

// Cost in budget points. Positive = net advantage, negative = net handicap.
// Zero is the balanced baseline. Command normals are optional so the shipped
// styles keep pricing exactly as they did before they existed.
export function budgetCost(fighting, body, commandNormals = []) {
  const W = BUDGET.W;
  const f = fighting, b = body;
  const sum =
      W.dmg      * (f.dmg      - 1)
    + W.hp       * (f.hp       - 1)
    + W.speed    * (f.speed    - 1)
    + W.reach    * (f.reach    - 1)
    + W.startup  * (1 - f.startup)
    + W.recovery * (1 - f.recovery)
    + W.bodyReach * (b.reach - 1)
    + W.hurtbox   * (b.height * b.build - 1);
  const cmds = (commandNormals || []).reduce((t, c) => t + commandCost(c), 0);
  return sum * 100 + cmds;
}

export function budgetBand(cost) {
  const m = Math.abs(cost);
  if (m <= BUDGET.WARN) return 'clean';
  if (m <= BUDGET.BLOCK) return 'warn';
  return 'block';
}

export const DEFAULT_BODY = { height: 1, build: 1, reach: 1, stride: 1, shoulders: 1, head: 1 };

// `aoe` is a live special type (Burn Rate Blast) and stays its own archetype
// rather than folding into `strike`, because the shipped behaviour must be
// preserved exactly. `counter` and `trap` are the two new fight patterns —
// they exist so the roster can hold characters that differ in kind, not
// merely in degree. `stance` is the tenth, added for ALIGNMENT SHIFT
// (fighter-state-foundation, 2026-08-14): a toggle that changes `stanceId`
// rather than swinging, hitting or placing anything. `burn` is the eleventh,
// added for BURN IT ALL (runway-resource, 2026-08-15): a strike that reads
// its damage from the thrower's RUNWAY at the moment of contact and empties
// that runway by connecting. Both are known archetypes for
// `fighting.moves.special`/`signature` only — see the commandNormals guard
// below for why each is rejected as a command-normal archetype.
//
// APPEND ONLY. state.js packs a command normal's archetype as an index into
// this array and unpacks it the same way, so the order is a shipped wire
// format: inserting anywhere but the end re-points every challenge link that
// already exists.
export const ARCHETYPES = [
  'strike', 'projectile', 'aoe', 'rush', 'grab', 'teleport', 'rain', 'counter', 'trap', 'stance',
  'burn',
];
export const STANCES = ['ready', 'coiled', 'heavy', 'poised', 'loose', 'flair'];
export const PREF_RANGES = ['close', 'mid', 'far'];

const TEXT_CAPS = { name: 22, title: 24, company: 20, tagline: 64, rap: 40 };
const FIGHTING_KEYS = ['startup', 'dmg', 'reach', 'recovery', 'speed', 'hp'];

// ---------------------------------------------------------------- parts
//
// RENDER-ONLY geometry a character carries outside its body: a held prop, a
// coat, a cape. Never priced by the budget (like shoulders, stride and head),
// never read by the simulation, never a hurtbox. If a prop should hit someone
// that is a MOVE, and moves are priced.
export const PART_SHAPES = ['roundRect', 'ellipse', 'capsule', 'path'];
export const PART_ANCHORS = ['armF', 'armB', 'legF', 'legB', 'head', 'shoulder', 'hip', 'torso'];

// A part's colour is a ROLE, not a hex, so it recolours with the character —
// including a player founder whose palette was sampled from their photo. A
// literal hex stays legal for something genuinely fixed, like leather.
export const FILL_ROLES = ['skin', 'suit', 'suit2', 'accent', 'hair', 'pants', 'shoe'];

const PART_Z = ['front', 'behind'];
const HEX = /^#[0-9a-fA-F]{6}$/;

// The pose states a part can be restricted to. Closed, because `states: ['blok']`
// would otherwise validate clean and make the part permanently invisible — the
// same present-but-invisible failure the fill and occlusion bugs produced.
//
// This is the real set Fighter.state is ever assigned, not a guess: fighter.js's
// setState() calls and drawFighter.js's computePose() branches on `st ===` both
// agree on these ten. (`dash` and `victory` are easy to miss if you only skim
// fighter.js's own state checks — victory is set from game.js on the winner.)
export const POSE_STATES = [
  'idle', 'walk', 'jump', 'crouch', 'block', 'attack', 'dash', 'hitstun', 'ko', 'victory',
];

function inRange(v, [lo, hi]) {
  return typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
}

// Returns an array of error strings. Empty means valid.
export function validateParts(parts) {
  if (parts === undefined || parts === null) return [];
  if (!Array.isArray(parts)) return ['parts must be an array'];

  const errors = [];
  if (parts.length > PARTS.MAX) errors.push(`parts: at most ${PARTS.MAX} per character`);
  const seen = new Set();

  parts.forEach((p, i) => {
    const at = `parts[${i}]`;
    if (!p || typeof p !== 'object') { errors.push(`${at} is not an object`); return; }

    if (typeof p.id !== 'string' || !/^[a-z0-9-]{2,16}$/.test(p.id)) {
      errors.push(`${at}.id must match [a-z0-9-]{2,16}`);
    } else if (seen.has(p.id)) {
      errors.push(`${at}.id ${JSON.stringify(p.id)} is a duplicate`);
    } else {
      seen.add(p.id);
    }

    if (!PART_SHAPES.includes(p.shape)) {
      errors.push(`${at}.shape ${JSON.stringify(p.shape)} is not one of ${PART_SHAPES.join(', ')}`);
    }
    if (!PART_ANCHORS.includes(p.anchor)) {
      errors.push(`${at}.anchor ${JSON.stringify(p.anchor)} is not one of ${PART_ANCHORS.join(', ')}`);
    }
    if (!PART_Z.includes(p.z)) {
      errors.push(`${at}.z ${JSON.stringify(p.z)} must be 'front' or 'behind'`);
    }
    if (typeof p.fill !== 'string' || (!FILL_ROLES.includes(p.fill) && !HEX.test(p.fill))) {
      errors.push(`${at}.fill ${JSON.stringify(p.fill)} must be a role (${FILL_ROLES.join(', ')}) or a #rrggbb hex`);
    }

    for (const k of ['dx', 'dy']) {
      if (!inRange(p[k], PARTS.OFFSET)) {
        errors.push(`${at}.${k} ${p[k]} outside [${PARTS.OFFSET[0]}, ${PARTS.OFFSET[1]}]`);
      }
    }
    if (p.rot !== undefined && !inRange(p.rot, PARTS.ROT)) {
      errors.push(`${at}.rot ${p.rot} outside [-π, π]`);
    }
    if (p.follow !== undefined && !inRange(p.follow, PARTS.FOLLOW)) {
      errors.push(`${at}.follow ${p.follow} outside [0, 1]`);
    }
    if (p.states !== undefined) {
      if (!Array.isArray(p.states) || !p.states.length) {
        errors.push(`${at}.states ${JSON.stringify(p.states)} must be a non-empty array of pose states`);
      } else {
        for (const s of p.states) {
          if (!POSE_STATES.includes(s)) {
            errors.push(`${at}.states contains ${JSON.stringify(s)}, not one of ${POSE_STATES.join(', ')}`);
          }
        }
      }
    }

    if (p.shape === 'path') {
      const n = Array.isArray(p.pts) ? p.pts.length : 0;
      if (n < PARTS.MIN_POINTS || n > PARTS.MAX_POINTS) {
        errors.push(`${at}.pts needs ${PARTS.MIN_POINTS}-${PARTS.MAX_POINTS} points, got ${n}`);
      } else if (!p.pts.every((q) => Array.isArray(q) && q.length === 2
                              && inRange(q[0], PARTS.OFFSET) && inRange(q[1], PARTS.OFFSET))) {
        errors.push(`${at}.pts must be [x, y] pairs inside the offset range`);
      }
    } else if (p.shape === 'ellipse') {
      if (!inRange(p.r, PARTS.SIZE)) errors.push(`${at}.r ${p.r} outside [${PARTS.SIZE[0]}, ${PARTS.SIZE[1]}]`);
    } else {
      for (const k of ['w', 'h']) {
        if (!inRange(p[k], PARTS.SIZE)) {
          errors.push(`${at}.${k} ${p[k]} outside [${PARTS.SIZE[0]}, ${PARTS.SIZE[1]}]`);
        }
      }
    }
  });

  return errors;
}

// Returns { ok, errors[], warnings[], cost, band }.
// `ok` is false for anything that must not reach the game; warn-band
// characters are ok:true with a warning attached.
export function validateCharacter(ch) {
  const errors = [];
  const warnings = [];

  if (!ch || typeof ch !== 'object') {
    return { ok: false, errors: ['character is not an object'], warnings, cost: 0, band: 'block' };
  }
  if (ch.schema !== SCHEMA_VERSION) {
    errors.push(`unknown schema version ${ch.schema} (expected ${SCHEMA_VERSION})`);
  }
  if (typeof ch.id !== 'string' || !/^[a-z0-9-]{2,24}$/.test(ch.id)) {
    errors.push(`id ${JSON.stringify(ch.id)} must match [a-z0-9-]{2,24}`);
  }

  const idn = ch.identity || {};
  for (const [key, cap] of Object.entries(TEXT_CAPS)) {
    const v = idn[key];
    if (typeof v !== 'string' || !v.length) errors.push(`identity.${key} is required`);
    else if (v.length > cap) errors.push(`identity.${key} exceeds ${cap} chars`);
  }

  const body = { ...DEFAULT_BODY, ...(ch.body || {}) };
  for (const [key, [lo, hi]] of Object.entries(BODY)) {
    const v = body[key];
    if (typeof v !== 'number' || !Number.isFinite(v)) errors.push(`body.${key} must be a number`);
    else if (v < lo || v > hi) errors.push(`body.${key} ${v} outside [${lo}, ${hi}]`);
  }

  const look = ch.look || {};
  if (look.stance !== undefined && !STANCES.includes(look.stance)) {
    errors.push(`look.stance ${JSON.stringify(look.stance)} is not a known stance`);
  }

  // Render-only, but still authored data — so it is validated, and never
  // priced. Nothing below adds to `cost`.
  errors.push(...validateParts(ch.parts));

  const fighting = ch.fighting || {};
  for (const key of FIGHTING_KEYS) {
    const v = fighting[key];
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) {
      errors.push(`fighting.${key} must be a positive number`);
    }
  }

  const moves = fighting.moves || {};
  if (!moves.special || !ARCHETYPES.includes(moves.special.archetype)) {
    errors.push(`fighting.moves.special.archetype must be one of ${ARCHETYPES.join(', ')}`);
  }
  if (moves.signature) {
    if (!ARCHETYPES.includes(moves.signature.archetype)) {
      errors.push('fighting.moves.signature.archetype is not a known archetype');
    }
    if (!['slap', 'punch', 'kick', 'launch'].includes(moves.signature.replaces)) {
      errors.push('fighting.moves.signature.replaces must name a basic attack');
    }
  }

  // ---- command normals ----
  // Optional: a character with none plays the universal grammar and nothing
  // else, which is a valid character, not a broken one.
  const cmds = ch.commandNormals;
  let cmdsOk = true;
  if (cmds !== undefined && cmds !== null) {
    if (!Array.isArray(cmds)) {
      errors.push('commandNormals must be an array');
      cmdsOk = false;
    } else {
      if (cmds.length > BUDGET.CMD.MAX_SLOTS) {
        errors.push(`commandNormals holds ${cmds.length} moves; at most ${BUDGET.CMD.MAX_SLOTS} are allowed`);
      }
      const seen = new Set();
      cmds.forEach((cn, i) => {
        const at = `commandNormals[${i}]`;
        if (!cn || typeof cn !== 'object') { errors.push(`${at} is not an object`); cmdsOk = false; return; }
        if (!COMMAND_SLOTS.includes(cn.slot)) {
          errors.push(`${at}.slot ${JSON.stringify(cn.slot)} must be one of ${COMMAND_SLOTS.join(', ')}`);
          cmdsOk = false;
        } else if (seen.has(cn.slot)) {
          errors.push(`${at}.slot ${cn.slot} is a duplicate — one move per input`);
        } else {
          seen.add(cn.slot);
        }
        if (!ARCHETYPES.includes(cn.archetype)) {
          errors.push(`${at}.archetype ${JSON.stringify(cn.archetype)} is not a known archetype`);
          cmdsOk = false;
        } else if (cn.archetype === 'stance' || cn.archetype === 'burn') {
          // A stance is a toggle, not a swing, and neither half of the command
          // normal machinery knows what to do with one: BUDGET.CMD.ARCHETYPE
          // has no entry for it (it would silently price as free, same as
          // `strike`), and fighter.js only intercepts `type: 'stance'` for a
          // character's special — a command normal's archetype instead becomes
          // its attack `kind` with no engine branch to run it. That is the
          // shipped-valid-and-silently-broken failure this whole test suite
          // exists to catch, so it is rejected here rather than left to be
          // found by rosterMoves.test.js. Roster-only for now; see
          // docs/superpowers/specs/2026-08-14-fighter-state-foundation-design.md §7.
          //
          // `burn` fails for the same two reasons as `stance`, plus a third:
          // its damage comes from the thrower's RUNWAY, and runway is a
          // roster-only opt-in (`usesRunway`) that the power budget has no
          // axis to price. An authored burn normal would be free, and either
          // permanently weak or a resource handed out for nothing.
          errors.push(`${at}.archetype '${cn.archetype}' is not usable as a command normal yet`);
          cmdsOk = false;
        }
        if (typeof cn.displayName !== 'string' || !cn.displayName.length) {
          errors.push(`${at}.displayName is required`);
        } else if (cn.displayName.length > 24) {
          errors.push(`${at}.displayName exceeds 24 chars`);
        }
        if (Array.isArray(cn.tags)) {
          for (const t of cn.tags) {
            if (!MOVE_TAGS.includes(t)) errors.push(`${at}.tags contains unknown tag ${JSON.stringify(t)}`);
          }
        } else if (cn.tags !== undefined) {
          errors.push(`${at}.tags must be an array`);
        }

        // Frame data is clamped as a ratio of the basic it overrides. This is
        // the anti-cheat line: these numbers arrive over the wire in a
        // challenge link, so an out-of-range value is rejected outright rather
        // than merely priced into the budget.
        const base = ATTACKS[slotButton(cn.slot)];
        const fd = cn.frameData;
        if (!fd || typeof fd !== 'object') {
          errors.push(`${at}.frameData is required`);
          cmdsOk = false;
        } else if (base) {
          for (const key of CMD_FRAME_KEYS) {
            const v = fd[key];
            if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) {
              errors.push(`${at}.frameData.${key} must be a positive number`);
              cmdsOk = false;
              continue;
            }
            const [lo, hi] = BUDGET.CMD.CLAMP[key];
            const ratio = v / base[key];
            if (ratio < lo || ratio > hi) {
              errors.push(`${at}.frameData.${key} is ${ratio.toFixed(2)}× its base, outside [${lo}, ${hi}]`);
            }
          }
        }
      });
    }
  }

  // ---- animation overrides ----
  //
  // Render-only, and NOT carried by the codec or the netcode handshake — a pose
  // cannot change a fight, and shipping keyframes over a URL would dwarf it.
  // They are still validated here so the authoring tool catches a broken track
  // at export rather than at the moment a character T-poses in a match.
  //
  // Anything malformed is a WARNING, not an error: the renderer falls back to
  // the base track, so a bad override costs a character its flourish, not its
  // playability. Refusing to load a character over an animation typo would be
  // a worse failure than the typo.
  if (ch.animOverrides !== undefined && ch.animOverrides !== null) {
    if (typeof ch.animOverrides !== 'object' || Array.isArray(ch.animOverrides)) {
      warnings.push('animOverrides must be an object keyed by state; ignoring it');
    } else {
      for (const [state, track] of Object.entries(ch.animOverrides)) {
        const keys = Array.isArray(track) ? track : (track && track.keys);
        if (!Array.isArray(keys) || !keys.length) {
          warnings.push(`animOverrides.${state} has no keys; the base track will be used`);
          continue;
        }
        let last = -Infinity, bad = false;
        for (const k of keys) {
          if (!k || typeof k.t !== 'number' || !Number.isFinite(k.t)) { bad = true; break; }
          if (k.t < last) { bad = true; break; }
          last = k.t;
        }
        if (bad) warnings.push(`animOverrides.${state} keys must be finite and ordered by t; the base track will be used`);
      }
    }
  }

  const ai = ch.ai || {};
  if (!PREF_RANGES.includes(ai.prefRange)) errors.push('ai.prefRange must be close, mid or far');
  for (const key of ['aggr', 'jump']) {
    const v = ai[key];
    if (typeof v !== 'number' || v < 0 || v > 1) errors.push(`ai.${key} must be between 0 and 1`);
  }

  // Budget only means something once the numbers it reads are well-formed.
  let cost = 0, band = 'clean';
  const numbersOk = FIGHTING_KEYS.every(k => typeof fighting[k] === 'number')
    && Object.keys(BODY).every(k => typeof body[k] === 'number');
  if (numbersOk) {
    cost = budgetCost(fighting, body, cmdsOk && Array.isArray(cmds) ? cmds : []);
    band = budgetBand(cost);
    if (band === 'block') errors.push(`power budget ${cost.toFixed(1)} exceeds ±${BUDGET.BLOCK}`);
    else if (band === 'warn') warnings.push(`power budget ${cost.toFixed(1)} is outside ±${BUDGET.WARN}`);
  }

  return { ok: errors.length === 0, errors, warnings, cost, band };
}
