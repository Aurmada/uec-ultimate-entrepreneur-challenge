// The match flow's small decisions, kept apart from the DOM so they can be
// tested: which AI level to offer after a solo fight, when the victory pose
// may be skipped, and the one fight a visitor may try before signing in.

import { AI_LEVELS, ROUND } from '../config.js';

// The AI levels, easiest first.
export const LEVEL_ORDER = Object.keys(AI_LEVELS);

// After a solo fight at `level`, the level to offer next, or null: one up
// after a win, one down after a loss, and nothing past either end. Offered on
// the results screen, never imposed (the level used to change unannounced).
export function levelOffer(level, won) {
  const i = LEVEL_ORDER.indexOf(level);
  if (i < 0) return null;
  const j = won ? i + 1 : i - 1;
  if (j < 0 || j >= LEVEL_ORDER.length) return null;
  return { to: LEVEL_ORDER[j], up: j > i };
}

// In single player, once the victory pose has played a moment, a key or a tap
// skips it to the results (main.js), and the HUD says so. Never online or in
// versus, where someone else is watching the same pose.
export function canSkipVictory(game) {
  return !!game && game.mode === 'solo' && game.state === 'matchEnd' && !game.finished
    && !game.paused && game.stateT >= ROUND.SKIP_AFTER;
}

// A visitor not signed in may try one fight first, once on this device:
// Rookie, unranked, a founder of the roster against another, then the results
// ask them to sign in. Sign-in came before any fight at all (a game
// designer's review, 2026-11-06). These are the screens that fight may show.
export const GUEST_SCREENS = new Set(['scr-fight', 'scr-results']);

export function guestFightOffered(save, user) {
  return !user && !save.data.guestFightUsed;
}

// The guest's founder and rival, two different ones of `ids`, at the easiest
// level.
export function pickGuestFight(ids, rand = Math.random) {
  const p1 = ids[Math.floor(rand() * ids.length)];
  const rest = ids.filter((id) => id !== p1);
  return { p1, p2: rest[Math.floor(rand() * rest.length)], difficulty: LEVEL_ORDER[0] };
}
