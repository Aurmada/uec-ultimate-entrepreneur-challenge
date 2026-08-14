// WHAT THE SIMULATION REMEMBERS ABOUT A FIGHTER.
//
// Persistent per-fighter state used to live in two hand-maintained lists:
// resetForRound() named 20 fields, hashGameState() named 13 values, and eight
// constructor fields had already drifted out of the first one. None was
// live-broken — each was masked by `state` resetting to 'idle', or recomputed
// every frame — but none was DECIDED either, and `energy` turned out to encode
// a real balance rule (meter carries between rounds) recorded nowhere but the
// absence of a line.
//
// So: one declaration per field, and the two opt-outs cost a sentence.
// `round: 'keep'` and `hash: false` both require a `why`. That is the whole
// mechanism — an opt-out that costs a justification is one people take
// deliberately.
//
// RENDER-ONLY state does not belong here. Pose, parts and animation are
// governed by the boundary in test/determinism.test.js; this registry is for
// state the SIMULATION reads.

export const FIGHTER_STATE = [
  // ---- combat timers -------------------------------------------------------
  { key: 'stateT',        init: 0,     round: 'reset', hash: 'q8' },
  { key: 'stunT',         init: 0,     round: 'reset', hash: 'q8' },
  { key: 'flashT',        init: 0,     round: 'reset', hash: false,
    why: 'hit-flash timer; drives a render filter only and is never read by the sim' },
  { key: 'unicornT',      init: 0,     round: 'reset', hash: 'q8', ai: 'unicorn' },
  { key: 'speedBuffT',    init: 0,     round: 'reset', hash: 'q8' },
  { key: 'dmgBuffT',      init: 0,     round: 'reset', hash: 'q8' },
  { key: 'shieldT',       init: 0,     round: 'reset', hash: 'q8' },
  { key: 'dashCD',        init: 0,     round: 'reset', hash: 'q8' },
  { key: 'stealCD',       init: 0,     round: 'reset', hash: 'q8' },

  // ---- combo bookkeeping ---------------------------------------------------
  { key: 'comboTaken',    init: 0,     round: 'reset', hash: 'int' },
  { key: 'comboDropT',    init: 0,     round: 'reset', hash: 'q8' },

  // ---- stance (see config STANCE) -----------------------------------------
  { key: 'stanceId',      init: null,  round: 'reset', hash: 'enum', ai: 'stance' },
  { key: 'stanceCD',      init: 0,     round: 'reset', hash: 'q8' },

  // ---- movement ------------------------------------------------------------
  { key: 'airborne',      init: false, round: 'reset', hash: 'int' },
  { key: 'airAttackUsed', init: false, round: 'reset', hash: 'int' },

  // ---- declared KEEPs ------------------------------------------------------
  { key: 'energy',        init: 0,     round: 'keep',  hash: 'q8',
    why: 'meter CARRIES BETWEEN ROUNDS. A real balance rule that shapes round two, '
       + 'and until this registry existed the only record of it was the absence of a '
       + 'line in resetForRound' },
  { key: 'walkPhase',     init: 0,     round: 'keep',  hash: false,
    why: 'animation phase; render-only in effect, and snapping it to zero looks worse '
       + 'than letting it run' },
  { key: 'movingBack',    init: false, round: 'keep',  hash: false,
    why: 'recomputed from the pad every frame before any read' },
  { key: 'moveVx',        init: 0,     round: 'keep',  hash: false,
    why: 'walk intent, zeroed at the top of every update() before use' },
  { key: 'dashDir',       init: 1,     round: 'keep',  hash: false,
    why: 'a direction, meaningless until a dash starts, and a dash always sets it' },
];

export const RESET_KEYS = FIGHTER_STATE.filter((e) => e.round === 'reset').map((e) => e.key);
export const HASH_KEYS = FIGHTER_STATE.filter((e) => e.hash).map((e) => e.key);



// Stable string -> integer for hashing. Sorted so the mapping does not depend
// on registry order, which would make the fingerprint depend on source layout.
const ENUM_VALUES = [null, 'safety', 'capabilities'];

// Mirrors the quantisation hashGameState already used: q8 is the existing q().
export function quantise(kind, v) {
  if (kind === 'q8') return Math.round((v || 0) * 8);
  if (kind === 'int') return (v | 0);
  if (kind === 'enum') {
    const i = ENUM_VALUES.indexOf(v ?? null);
    return i < 0 ? 0 : i;
  }
  return 0;
}

// Apply every `init` to a fresh fighter.
export function initState(f) {
  for (const e of FIGHTER_STATE) f[e.key] = typeof e.init === 'function' ? e.init() : e.init;
}

// Apply every `round: 'reset'` default. Positional state (hp, x, y, facing)
// is NOT here — it depends on which side the fighter starts on.
export function resetState(f) {
  for (const e of FIGHTER_STATE) {
    if (e.round === 'reset') f[e.key] = typeof e.init === 'function' ? e.init() : e.init;
  }
}

// The hashable values for one fighter, in registry order.
export function hashValues(f) {
  const out = [];
  for (const e of FIGHTER_STATE) if (e.hash) out.push(quantise(e.hash, f[e.key]));
  return out;
}
