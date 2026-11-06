// The match flow's small decisions, kept apart from the DOM so they can be
// tested: which AI level to offer after a solo fight.

import { AI_LEVELS } from '../config.js';

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
