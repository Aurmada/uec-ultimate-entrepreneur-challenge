// Cloud persistence on the dedicated uec-game Supabase project:
// profile sync, the global leaderboard, and live-match result reporting.
//
// Trust model: clients may edit their own identity columns only. Stats are
// written exclusively by the report_match() RPC on the server, and a match
// only counts when BOTH signed-in players independently report mirror-image
// results for the same room — so the global board reflects real, confirmed
// human-vs-human matches and can't be inflated from the console.

import { getSupabase } from './online.js';
import { currentUser } from '../auth.js';
import { Save } from '../state.js';

import { DEFAULT_BASE_ID, pickLook } from '../data/fighters.js';

// Push the local profile's identity (never stats) up to the cloud.
export async function syncProfileUp() {
  const user = currentUser();
  const p = Save.profile;
  if (!user || !p) return false;
  let handle = (p.name || '').trim().slice(0, 18);
  if (handle.length < 2) handle = 'Founder';
  try {
    const sb = await getSupabase();
    const { error } = await sb.from('profiles').upsert({
      id: user.id,
      handle,
      company: (p.company || '').trim().slice(0, 22) || null,
      base_id: p.baseId || DEFAULT_BASE_ID,
      c1: /^#[0-9a-fA-F]{6}$/.test(p.c1 || '') ? p.c1 : null,
      c2: /^#[0-9a-fA-F]{6}$/.test(p.c2 || '') ? p.c2 : null,
      special: p.special || null,
      photo: p.photo && p.photo.length < 100000 && p.photo.startsWith('data:image/') ? p.photo : null,
      skin: /^#[0-9a-fA-F]{6}$/.test(p.skin || '') ? p.skin : null,
      hair: /^#[0-9a-fA-F]{6}$/.test(p.hair || '') ? p.hair : null,
      // pickLook() whitelists against the catalogue, so nothing arbitrary lands
      // in a world-readable column
      look: (() => { const l = pickLook(p); return Object.keys(l).length ? l : null; })(),
    });
    return !error;
  } catch (e) {
    return false;
  }
}

// Fetch one founder's public profile (for showing a challenger's real avatar).
export async function fetchProfile(id) {
  if (!id) return null;
  try {
    const sb = await getSupabase();
    const { data, error } = await sb.from('profiles')
      .select('handle, company, base_id, c1, c2, special, photo, skin, hair, look, points')
      .eq('id', id).maybeSingle();
    return error ? null : data;
  } catch (e) {
    return null;
  }
}

// Pull YOUR account down onto this device.
//
// Your account is the source of truth, not the browser you happen to be on:
// stats used to live only in per-device localStorage, so the same founder
// showed a different look and a different rank on phone vs laptop.
// Returns true if anything was adopted.
export async function syncProfileDown() {
  const user = currentUser();
  if (!user) return false;
  try {
    const sb = await getSupabase();
    const { data, error } = await sb.from('profiles')
      .select('handle, company, base_id, c1, c2, special, photo, skin, hair, look, wins, losses, kos, streak, best_streak, points, matches')
      .eq('id', user.id).maybeSingle();
    if (error || !data) return false;

    // identity + look
    const p = Save.profile || {};
    Save.saveProfile({
      ...p,
      name: data.handle || p.name || 'Founder',
      company: data.company ?? p.company ?? '',
      baseId: data.base_id || p.baseId,
      c1: data.c1 || p.c1, c2: data.c2 || p.c2,
      special: data.special || p.special,
      photo: data.photo ?? p.photo ?? null,
      skin: data.skin ?? p.skin ?? null,
      hair: data.hair ?? p.hair ?? null,
      ...(data.look || {}),
    });

    // Ranked stats are server-owned (only report_match() can write them), so
    // the cloud row always wins — never merge, or a stale device inflates them.
    Save.adoptCloudStats({
      wins: data.wins | 0, losses: data.losses | 0, kos: data.kos | 0,
      streak: data.streak | 0, bestStreak: data.best_streak | 0,
      points: data.points | 0, matches: data.matches | 0,
    });
    return true;
  } catch (e) {
    return false;
  }
}

// Global board rows (view already filters to matches > 0 and caps at 200).
export async function fetchLeaderboard() {
  const sb = await getSupabase();
  const { data, error } = await sb.from('leaderboard').select('*');
  if (error) throw error;
  return data || [];
}

// Report a finished LIVE match. Returns the server's verdict:
// 'applied' (both sides agreed — stats updated) · 'pending' (waiting for the
// rival's report) · 'already-applied' · 'error' / validation codes.
export async function reportOnlineMatch({ roomId, opponentUid, iWon, myRounds, oppRounds, koRounds }) {
  try {
    const sb = await getSupabase();
    const { data, error } = await sb.rpc('report_match', {
      p_room_id: roomId,
      p_opponent: opponentUid,
      p_i_won: iWon,
      p_rounds_won: myRounds,
      p_rounds_lost: oppRounds,
      p_ko_rounds: koRounds,
    });
    return error ? 'error' : data;
  } catch (e) {
    return 'error';
  }
}

// ---- single-player results, for tuning the difficulty levels ----
// How a match against a roster AI went: whom, at which level, and the score.
// Nothing about the player is sent, and the table keeps no user id
// (report_solo on the server, which also checks every field). Only the owner
// reads it. A ghost challenge is a player's build, not the roster, so it is
// left out, as is anything that is not single-player.
export function soloReport(result, { version, threeD = false } = {}) {
  if (!result || result.mode !== 'solo' || result.isChallenge) return null;
  const opponent = result.defs?.[1]?.id;
  if (!opponent) return null;
  return {
    p_opponent: opponent,
    p_level: result.difficulty,
    p_won: result.winnerIdx === 0,
    p_rounds_won: result.score[0],
    p_rounds_lost: result.score[1],
    p_ko_rounds: result.koRounds[0],
    p_version: version,
    p_three_d: !!threeD,
  };
}

// Sends it. Fire and forget: a match that cannot be reported changes nothing
// for the player. Returns the server's word ('recorded', 'invalid', 'busy',
// 'not-signed-in') or 'error', for the console and the lab.
export async function reportSoloMatch(result, opts) {
  const payload = soloReport(result, opts);
  if (!payload) return 'skipped';
  if (!currentUser()) return 'not-signed-in';
  try {
    const sb = await getSupabase();
    const { data, error } = await sb.rpc('report_solo', payload);
    return error ? 'error' : data;
  } catch (e) {
    return 'error';
  }
}
