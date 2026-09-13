// Persistent app state: profile, career stats, settings, tutorial flags.
// localStorage-backed with an in-memory fallback (private browsing, etc).

import { SAVE_KEY, POINTS, AI_LEVELS, STYLES, rankFor } from './config.js';
import { SEED_PLAYERS } from './data/seed.js';
import { DEFAULT_BASE_ID, SPECIALS, playerCommandNormals } from './data/fighters.js';
import { PLAYER_MOVES, getPlayerMove, toCommandNormal } from './data/playerMoves.js';
import {
  validateCharacter, SCHEMA_VERSION, COMMAND_SLOTS, ARCHETYPES,
} from './data/schema.js';
import { currentUser } from './auth.js';

const DEFAULTS = () => ({
  profile: null,           // { name, company, photo, baseId, c1, c2, special }
  stats: { wins: 0, losses: 0, kos: 0, streak: 0, bestStreak: 0, points: 0, matches: 0 },
  settings: { volume: 80, music: true, sfx: true },
  tutorialSeen: false,
  storySeen: false,        // the intro plays once, then lives under THE STORY
  lastSelf: 'custom',      // who you play AS (your founder, or a roster character)
  lastRival: 'random',     // who you faced
  lastDifficulty: 'founder',
});

let mem = null;

function read() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) return { ...DEFAULTS(), ...JSON.parse(raw) };
  } catch (e) { /* storage unavailable */ }
  return mem ? { ...mem } : DEFAULTS();
}

export const Save = {
  data: read(),

  persist() {
    mem = { ...this.data };
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.data)); } catch (e) { /* ok */ }
  },

  get profile() { return this.data.profile; },
  get stats() { return this.data.stats; },
  get settings() { return this.data.settings; },

  saveProfile(p) {
    this.data.profile = p;
    this.persist();
  },

  // Replace local ranked stats with the account's. The server owns these
  // (only report_match() can write them), so the cloud row is authoritative —
  // merging would let a stale device re-inflate points on every sign-in.
  adoptCloudStats(s) {
    this.data.stats = { ...this.data.stats, ...s };
    this.persist();
  },

  setSetting(key, val) {
    this.data.settings[key] = val;
    this.persist();
  },

  markTutorialSeen() {
    this.data.tutorialSeen = true;
    this.persist();
  },

  markStorySeen() {
    this.data.storySeen = true;
    this.persist();
  },

  rememberSelection(rivalId, difficulty, selfId) {
    if (selfId) this.data.lastSelf = selfId;
    if (rivalId) this.data.lastRival = rivalId;
    if (difficulty) this.data.lastDifficulty = difficulty;
    this.persist();
  },

  // Records a ranked match result. Returns a summary for the results screen.
  recordMatch({ won, koRounds, difficulty, isChallenge }) {
    const s = this.data.stats;
    const prevRank = rankFor(s.points);
    s.matches += 1;
    s.kos += koRounds;                       // KO rounds count even in losing efforts
    let gained = 0;
    if (won) {
      const mult = isChallenge ? POINTS.CHALLENGE_MULT : (AI_LEVELS[difficulty]?.mult ?? 1);
      s.wins += 1;
      s.streak += 1;
      s.bestStreak = Math.max(s.bestStreak, s.streak);
      gained = Math.round(POINTS.WIN_BASE * mult)
        + koRounds * POINTS.KO_BONUS
        + Math.min(POINTS.STREAK_CAP, s.streak * POINTS.STREAK_BONUS);
    } else {
      s.losses += 1;
      s.streak = 0;
      gained = POINTS.LOSS;
    }
    s.points += gained;
    this.persist();
    const rank = rankFor(s.points);
    return { gained, total: s.points, rank, streak: s.streak, rankUp: rank !== prevRank && won };
  },

  resetAll() {
    this.data = DEFAULTS();
    mem = null;
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ok */ }
  },

  // Seeds + local player merged, sorted by points.
  leaderboard() {
    const rows = SEED_PLAYERS.map(p => ({ ...p, you: false }));
    if (this.data.profile) {
      const s = this.data.stats;
      rows.push({
        id: 'you',
        fighter: this.data.profile.baseId || DEFAULT_BASE_ID,
        name: (this.data.profile.name || 'YOU').toUpperCase(),
        company: (this.data.profile.company || 'STEALTH STARTUP').toUpperCase(),
        photo: this.data.profile.photo || null,
        custom: true,
        wins: s.wins, losses: s.losses, kos: s.kos, streak: s.streak, points: s.points,
        you: true,
      });
    }
    return rows.sort((a, b) => b.points - a.points);
  },
};

// ---------------- Challenge links ----------------
//
// A challenge link carries a whole fighter in a URL. Everything here is
// attacker-controlled by construction — anyone can hand-edit the payload — so
// the decoder validates rather than trusts, and the schema validator is the
// line that stops inflated frame data from reaching a match.
//
// Animation is deliberately NOT carried. Keyframes are render-only, they would
// dwarf the link, and nothing about them can change a fight.

export const CODEC_VERSION = 2;

// Compact ids keep a link short enough to paste into a DM. These arrays are
// the wire contract: append only, never reorder.
const FRAME_KEYS = ['startup', 'active', 'recovery', 'dmg', 'reach', 'kbUp'];
const BODY_KEYS = ['height', 'build', 'reach', 'stride', 'shoulders', 'head'];

const r4 = (v) => (typeof v === 'number' && Number.isFinite(v) ? +v.toFixed(4) : null);

function b64urlEncode(str) {
  return btoa(unescape(encodeURIComponent(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(str) {
  const b = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = '='.repeat((4 - (b.length % 4)) % 4);
  return decodeURIComponent(escape(atob(b + pad)));
}

function packCommand(cn) {
  const out = {
    s: COMMAND_SLOTS.indexOf(cn.slot),
    a: ARCHETYPES.indexOf(cn.archetype),
    d: String(cn.displayName || '').slice(0, 24),
    f: FRAME_KEYS.map(k => r4(cn.frameData?.[k])),
  };
  // Menu moves travel as an ID. A counter's window and a trap's radius live in
  // `params`, and carrying those raw would both bloat the link and hand an
  // attacker a second set of numbers to forge. An id means the params come
  // from OUR code on the far side — smaller and strictly safer.
  const menu = matchPlayerMove(cn);
  if (menu) out.m = menu.id;
  return out;
}

// Is this command normal one of the curated player moves? Matched on slot and
// display name, which together are unique across the menu.
function matchPlayerMove(cn) {
  return PLAYER_MOVES.find(m => m.slot === cn.slot && m.displayName === cn.displayName) || null;
}

function unpackCommand(p) {
  if (!p || typeof p !== 'object') return null;
  // A known menu move is rebuilt from code, params and all.
  if (typeof p.m === 'string') {
    const cn = toCommandNormal(getPlayerMove(p.m));
    if (cn) return cn;
  }
  if (!Array.isArray(p.f)) return null;
  const frameData = {};
  FRAME_KEYS.forEach((k, i) => { if (typeof p.f[i] === 'number') frameData[k] = p.f[i]; });
  return {
    slot: COMMAND_SLOTS[p.s],           // undefined for a bogus index — validator catches it
    archetype: ARCHETYPES[p.a],
    displayName: String(p.d || '').slice(0, 24),
    frameData,
  };
}

// Builds the object that goes in the URL. Kept pure and separate from
// `location` so the round trip is testable off a browser.
export function challengePayload({ profile, points = 0, userId = null }) {
  const p = profile || {};
  const body = p.body || {};
  // A player's profile stores move IDS off the curated menu; an authored
  // character carries full command normals. Resolve the former so a founder
  // built in the profile screen fights with their own moves as a ghost —
  // otherwise the link promises a fighter it does not deliver.
  const cmds = p.commandNormals || playerCommandNormals(p.moves);
  return {
    v: CODEC_VERSION,
    n: p.name || 'A mystery founder',
    co: p.company || 'Stealth Startup',
    f: p.baseId || DEFAULT_BASE_ID,
    sp: p.special || null,
    st: p.style || 'balanced',
    bd: BODY_KEYS.map(k => r4(body[k]) ?? 1),
    cn: cmds.map(packCommand),
    pts: points,
    u: userId || undefined,             // lets the recipient fetch the real photo/colors
  };
}

// Decodes and VALIDATES. Returns null for anything malformed, unknown-version,
// or out of budget — a rejected link simply is not a challenge.
export function decodeChallenge(raw) {
  let data;
  try {
    data = JSON.parse(b64urlDecode(raw));
  } catch (e) {
    return null;
  }
  if (!data || (data.v !== 1 && data.v !== CODEC_VERSION)) return null;

  const out = {
    n: String(data.n || 'Rival').slice(0, 24),
    co: String(data.co || 'Rival Ventures').slice(0, 28),
    f: String(data.f || 'b-neo'),
    sp: data.sp ? String(data.sp) : null,
    pts: Math.max(0, Math.min(999999, Number(data.pts) || 0)),
    u: typeof data.u === 'string' && /^[0-9a-fA-F-]{10,40}$/.test(data.u) ? data.u : null,
    style: 'balanced',
    body: null,
    commandNormals: [],
  };

  // v1 links predate everything below and stay playable — they simply describe
  // a fighter with no proportions and no vocabulary of its own.
  if (data.v === 1) return out;

  const style = STYLES[data.st] ? data.st : 'balanced';
  const body = {};
  BODY_KEYS.forEach((k, i) => { body[k] = Number(data.bd?.[i]); });
  const commandNormals = Array.isArray(data.cn)
    ? data.cn.map(unpackCommand).filter(Boolean)
    : [];

  // The anti-cheat line. Everything above is cosmetic and clamped by slicing;
  // these are the numbers that decide a fight, so they go through the same
  // validator the authoring tool exports through.
  const st = STYLES[style];
  const check = validateCharacter({
    schema: SCHEMA_VERSION,
    id: 'challenger',
    identity: { name: out.n, title: 'CHALLENGER', company: out.co, tagline: '-', rap: '-' },
    body,
    look: {},
    fighting: {
      preset: style,
      startup: st.startup, dmg: st.dmg, reach: st.reach,
      recovery: st.recovery, speed: st.speed, hp: st.hp,
      moves: { special: { archetype: (SPECIALS[out.sp] || SPECIALS.pitchdeck).type }, signature: null },
    },
    commandNormals,
    ai: { aggr: 0.6, jump: 0.35, prefRange: 'mid' },
  });
  if (!check.ok) return null;

  out.style = style;
  out.body = body;
  out.commandNormals = commandNormals;
  return out;
}

export function buildChallengeLink() {
  const payload = challengePayload({
    profile: Save.profile,
    points: Save.stats.points || 0,
    userId: currentUser()?.id || null,
  });
  const url = new URL(location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('c', b64urlEncode(JSON.stringify(payload)));
  return url.toString();
}

export function parseChallengeFromURL() {
  try {
    const c = new URLSearchParams(location.search).get('c');
    return c ? decodeChallenge(c) : null;
  } catch (e) {
    return null;
  }
}

// The inverse of decodeChallenge's first step, for tests that round-trip a
// link. The live handshake does not use it: a peer's character is validated
// by validatePeerCharacter in net/online.js.
export function encodeChallengePayload(payload) {
  return b64urlEncode(JSON.stringify(payload));
}
