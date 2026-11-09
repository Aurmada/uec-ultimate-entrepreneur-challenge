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

// Both sides the same fighter (picked on purpose; a random rival is never
// you) fought in the same colours, so nobody could tell which was theirs. The
// second takes a colourway of its own: the clothes turned round the colour
// wheel, or, where they are nearly grey, light for dark; the skin and hair
// stay, so it is still the same person. Render only: the colours are not in
// the simulation, and both peers make the same one from the same fighter.
// Same fighter means the same id in the same colours: every player's own
// founder has the id 'custom', and compared by id alone two different players
// online had the guest's chosen colours turned round the wheel.
const MIRRORED = ['suit', 'suit2', 'accent', 'pants', 'shoe'];
const sameColours = (a, b) => !!a && !!b && Object.keys({ ...a, ...b }).every((k) => a[k] === b[k]);
export function mirrorDef(mine, theirs) {
  if (!mine || !theirs || mine.id !== theirs.id || !sameColours(mine.c, theirs.c)) return theirs;
  const c = { ...theirs.c };
  for (const k of MIRRORED) if (c[k]) c[k] = mirrorColour(c[k]);
  return { ...theirs, c, mirrored: true };
}

export function mirrorColour(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  let h = 0, s = 0;
  if (d) {
    s = d / (1 - Math.abs(2 * l - 1));
    h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
  }
  let H = h, L = l;
  // a grey goes at least a third of the way from dark to light, or a mid
  // grey (Scam's suit) would come back nearly as it was; a dark colour comes
  // up a little too, or a navy came back a dark olive no easier to tell apart
  if (s >= 0.2) {
    H = (h + 180) % 360;
    if (l < 0.3) L = l + 0.2;
  } else L = Math.min(0.88, Math.max(0.12, l < 0.5 ? Math.max(l + 0.35, 1 - l) : Math.min(l - 0.35, 1 - l)));
  const C = (1 - Math.abs(2 * L - 1)) * s, X = C * (1 - Math.abs(((H / 60) % 2) - 1)), m = L - C / 2;
  const [R, G, B] = H < 60 ? [C, X, 0] : H < 120 ? [X, C, 0] : H < 180 ? [0, C, X] : H < 240 ? [0, X, C] : H < 300 ? [X, 0, C] : [C, 0, X];
  const to = (v) => Math.round(Math.min(1, Math.max(0, v + m)) * 255).toString(16).padStart(2, '0');
  return `#${to(R)}${to(G)}${to(B)}`;
}
