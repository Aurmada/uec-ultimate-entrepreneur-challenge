// The moves a player can give their own founder.
//
// The Incubator lets an author type any frame data they like. A player gets a
// CURATED MENU instead — every entry here is a finished, sensible move with a
// clear identity, so nobody has to understand startup frames to build a fighter
// they enjoy.
//
// ---------------------------------------------------------------------------
// THE ZERO-BUDGET RULE
//
// Human fighters all share one stat line. That rule was written in v1.7 after a
// wardrobe choice turned out to be worth a 33% damage swing on a ranked ladder,
// and it still holds: a player's STYLE is always `balanced`.
//
// So a player's build is not "pick the strongest thing" — it is "spend a budget
// of zero". Every priced knob and every move here costs or refunds, and the
// total has to come back to roughly nothing. Want a launcher? Be a bigger
// target, or accept slower frames. That is a real character-building decision
// AND it is fair by construction, which is a much better answer than banning
// variety outright.
//
// Shoulders, stride and head are unpriced by the budget, so silhouette is
// always free. A player can look like nobody else at zero cost.
// ---------------------------------------------------------------------------

import { ATTACKS } from '../config.js';

// How close to zero a player's build has to land. Tighter than the authoring
// tool's clean band (±8) because this is the ranked ladder, not a design doc.
export const PLAYER_BUDGET = 3;

const punch = ATTACKS.punch, kick = ATTACKS.kick, slap = ATTACKS.slap, launch = ATTACKS.launch;

export const PLAYER_MOVES = [
  {
    id: 'uppercut',
    slot: 'fwd+punch', archetype: 'strike', displayName: 'DOWN ROUND',
    tags: ['launcher'],
    blurb: 'Pops them into the air so you can keep going. Costs the most: launching opens routes nothing else can.',
    frameData: {
      startup: punch.startup, active: punch.active, recovery: punch.recovery * 1.05,
      dmg: 8, reach: 84, hitY: -120, kb: 90, kbUp: -400, stun: 0.3,
    },
  },
  {
    id: 'haymaker',
    slot: 'fwd+punch', archetype: 'strike', displayName: 'BRIDGE ROUND',
    tags: ['punish'],
    blurb: 'Slow, obvious, and it hurts. Telegraphed enough that it pays you budget back.',
    frameData: {
      startup: punch.startup * 1.75, active: punch.active, recovery: punch.recovery * 1.6,
      dmg: 12, reach: 88, hitY: -104, kb: 220, kbUp: 0, stun: 0.3,
    },
  },
  {
    id: 'sweep',
    slot: 'fwd+kick', archetype: 'strike', displayName: 'RUNWAY SWEEP',
    tags: ['low'],
    blurb: 'Long and low. Keeps people honest at a range your punch cannot reach.',
    frameData: {
      startup: kick.startup * 1.15, active: kick.active, recovery: kick.recovery * 1.25,
      dmg: 10, reach: 122, hitY: -46, kb: 260, kbUp: 0, stun: 0.3,
    },
  },
  {
    id: 'shakedown',
    slot: 'fwd+kick', archetype: 'grab', displayName: 'DUE DILIGENCE',
    tags: ['command-grab'],
    blurb: 'Unblockable, but they can jump it, and you have to be close enough to smell the fear.',
    frameData: {
      startup: kick.startup * 1.25, active: kick.active, recovery: kick.recovery * 1.2,
      dmg: 15, reach: 88, hitY: -95, kb: 300, kbUp: -180, stun: 0.34,
    },
  },
  {
    id: 'stonewall',
    slot: 'fwd+launch', archetype: 'counter', displayName: 'LAWYERED',
    tags: ['counter'],
    blurb: 'A stance, not a swing. Read their attack and it goes back at them. Grabs still beat it.',
    frameData: {
      // A counter's startup is not a slope, it is a cliff: it must beat the
      // attack it means to turn back, or the attack simply lands first. At
      // 1.1x launch (0.066s) this was measured losing to slap, punch AND
      // launch and beating only kick — a counter that loses to the two most
      // pressed buttons in the game. 0.75x (0.045s) beats punch, kick and
      // launch. Slap, the fastest button, still goes through: reading a jab
      // with a counter should not be free.
      //
      // Speed is not cheap here: the budget prices startup as a ratio of the
      // slot's base, and fwd+launch starts from a slow 0.06s, so buying those
      // four frames roughly doubles the price. A counter is cheap on fwd+slap
      // and expensive here; that is the slot's character, not a bug.
      startup: launch.startup * 0.75, active: launch.active, recovery: launch.recovery * 1.15,
      dmg: launch.dmg, reach: launch.reach, kbUp: launch.kbUp,
    },
    // The counter pays for its new speed out of its own damage: 13 -> 11. At 13
    // the move cost 13 and NOTHING on the menu could be paired with it — one
    // legal build in the whole creator. Damage is the only lever the pricer
    // actually responds to (it does not price `window` at all), and 11 still
    // lands harder than any other counter in the game. Speed is what makes a
    // counter a counter; the last two points of damage are not.
    params: { window: 0.18, dmg: 11, kb: 300 },
  },
  {
    id: 'bananaskin',
    slot: 'fwd+kick', archetype: 'trap', displayName: 'POISON PILL',
    tags: ['trap'],
    blurb: 'Drop it and walk away. Denies the ground they were about to stand on.',
    frameData: {
      startup: kick.startup * 1.1, active: kick.active, recovery: kick.recovery * 1.1,
      dmg: kick.dmg, reach: 60,
    },
    params: { lifetime: 5.5, radius: 76, armTime: 0.35, dmg: 14, maxActive: 1 },
  },
  {
    id: 'papertrail',
    slot: 'fwd+slap', archetype: 'projectile', displayName: 'PAPER TRAIL',
    tags: ['ranged'],
    blurb: 'Throws the problem across the room. Weak, but it reaches.',
    frameData: {
      startup: slap.startup * 1.2, active: slap.active, recovery: slap.recovery * 1.2,
      dmg: 5, reach: 76, hitY: -108, kb: 90, kbUp: 0, stun: 0.22,
    },
    params: { count: 1, speed: 520, interval: 0.1, dmg: 5 },
  },
  {
    id: 'shoulder',
    slot: 'fwd+slap', archetype: 'strike', displayName: 'HARD PIVOT',
    tags: ['gapCloser'],
    blurb: 'A shoulder barge that closes distance. Cheap, because it barely hurts.',
    frameData: {
      startup: slap.startup * 1.3, active: slap.active, recovery: slap.recovery * 1.3,
      dmg: 5, reach: 70, hitY: -104, kb: 200, kbUp: 0, stun: 0.22,
    },
  },
];

export function getPlayerMove(id) {
  return PLAYER_MOVES.find(m => m.id === id) || null;
}

// Strips the menu-only fields so what reaches a character is a plain command
// normal, identical in shape to anything the Incubator produces.
export function toCommandNormal(move) {
  if (!move) return null;
  const { id, blurb, ...cn } = move;
  return cn;
}
