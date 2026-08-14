// ---------------------------------------------------------------------------
// LIVE MULTIPLAYER — Supabase Realtime rooms + delay-based lockstep.
//
// Transport: an ephemeral Realtime *broadcast* channel per room (no tables, no
// rows — nothing is stored). Presence announces who's in the room (that's how
// the inviter is notified the moment a rival joins). Both clients then run the
// same deterministic simulation at a fixed 60 Hz step and exchange only input
// bitmasks, delayed by INPUT_DELAY frames to hide network latency. A periodic
// state hash catches desyncs.
//
// The supabase-js client is loaded on demand from a CDN — offline/solo play
// never touches the network.
// ---------------------------------------------------------------------------

// Dedicated "uec-game" Supabase project (isolated from aurmada-main-site).
// Publishable key — safe to ship in client code; row-level security guards data.
import { validateCharacter, SCHEMA_VERSION } from '../data/schema.js';

const SUPABASE_URL = 'https://oqzxkzkyiiahxmppgrkn.supabase.co';
const SUPABASE_KEY = 'sb_publishable_hA-O1-vWIa40YOlyy3d0mA_Mf0zCrkO';

export const STEP = 1 / 60;          // fixed simulation timestep
// Input delay is felt directly as control lag, so it's kept as low as the
// transport allows: packets now go out every ~33 ms (was 60), which means 6
// frames covers batching + a normal one-way hop. Was 10 frames / 60 ms pacing
// ≈ 226 ms of lag; this is ≈ 133 ms. Both peers run the same constants, so
// lockstep determinism is unaffected. Late packets are still covered by the
// resend-window + heal logic rather than by padding every input.
export const INPUT_DELAY = 6;        // frames (~100 ms)
const SEND_MS = 33;                  // ~30 packets/s — still well under Realtime rate limits
const WINDOW_MAX = 60;               // max frames carried per packet
const SYNC_EVERY = 120;              // frames between state-hash checks

// NOTE: every gameplay pad key must appear here or it never reaches the peer —
// 'down' (crouch) was missing, so crouching didn't transmit in live matches.
const BITS = ['left', 'right', 'up', 'down', 'block', 'launch', 'punch', 'kick', 'special', 'super', 'bomb', 'dash', 'steal', 'slap'];

export function padToMask(pad) {
  let m = 0;
  for (let i = 0; i < BITS.length; i++) if (pad[BITS[i]]) m |= 1 << i;
  return m;
}

export function maskToPad(m) {
  const p = {};
  for (let i = 0; i < BITS.length; i++) p[BITS[i]] = !!(m & (1 << i));
  return p;
}

// Controller fed by the lockstep driver (implements the standard contract).
export class MaskController {
  constructor() { this.mask = 0; this.isHuman = false; }
  update(fighter) { fighter.pad = maskToPad(this.mask); }
}

// ---------------------------------------------------------------------------
// CHARACTER HANDSHAKE
//
// Both peers run the same deterministic simulation, so they must agree on every
// number that decides a fight. A `pick` therefore carries the sender's whole
// character, and the receiver validates it before agreeing to start.
//
// This is a trust boundary, not a formality: the peer's client is not ours, so
// its character is exactly as attacker-controlled as a challenge link. Refusing
// here is much better than the alternative, which is two clients quietly
// disagreeing until the desync detector voids the match several seconds in.
//
// Bump when the shape of the carried character changes. Peers on different
// versions refuse rather than guess.
export const CHARACTER_WIRE_VERSION = 1;

// The version of the SIMULATION itself, as distinct from the character payload
// format above. Two peers can agree perfectly on what a character IS and still
// disagree on what it DOES.
//
// BUMP THIS WHENEVER FIGHT BEHAVIOUR CHANGES — damage, frame data, hit
// resolution, how an archetype resolves. v2.8 is the case that forced it: the
// counter fix made LAWYERED deal the 13 damage it had always been priced at
// instead of 10. The character payload was byte-identical, so wv and sv both
// still matched, and a v2.7 client would have shaken hands with a v2.8 one
// happily and then diverged the instant either of them threw a counter — the
// state hash voiding the match about two seconds later, wearing the costume of
// a network fault. Refusing up front with an honest reason is the whole point.
// v3: projectile command normals fired nothing at all — the tick's counters were
// only seeded on the special path, so `undefined < count` was false every frame.
// Fixing it means a v2 client throws a harmless whiff where a v3 client throws
// two projectiles for 11 damage. Exactly the silent divergence this guards.
//
// v4: LAWYERED's startup 0.066s -> 0.045s, and its counter damage 13 -> 11 to
// pay for it. Worth noting WHY a menu move's numbers are a wire concern at all:
// packCommand sends curated moves as a bare id and
// unpackCommand rebuilds them from OUR table, deliberately, so the numbers can
// never be forged. The flip side is that each peer supplies its own — so a v3 and
// a v4 client would each run their own LAWYERED and diverge on the first read.
export const SIM_VERSION = 4;

// Returns { ok, reason }. Never throws — a malformed payload is a refusal.
export function validatePeerCharacter(spec) {
  if (!spec || typeof spec !== 'object') return { ok: false, reason: 'no character sent' };
  if (spec.wv !== CHARACTER_WIRE_VERSION) {
    return { ok: false, reason: 'your rival is on a different version of the game' };
  }
  if (spec.sv !== SCHEMA_VERSION) {
    return { ok: false, reason: 'your rival is on a different version of the game' };
  }
  // A peer that predates the sim-version field is by definition on an older
  // simulation, so an absent `simv` is a mismatch rather than a pass.
  if (spec.simv !== SIM_VERSION) {
    return { ok: false, reason: 'your rival is on a different version of the game' };
  }
  const ch = spec.ch;
  if (!ch) return { ok: false, reason: 'no character sent' };
  const r = validateCharacter(ch);
  if (!r.ok) return { ok: false, reason: `your rival's fighter was rejected (${r.errors[0]})` };
  return { ok: true, reason: null };
}

// Cheap deterministic state fingerprint for desync detection.
export function hashGameState(game) {
  const f = game.fighters;
  const q = (v) => Math.round(v * 8);
  let h = 0;
  const mix = (v) => { h = ((h * 31) + (v | 0) + 7) & 0x7fffffff; };
  for (const x of [
    q(f[0].x), q(f[0].y), q(f[0].hp), q(f[0].energy),
    q(f[1].x), q(f[1].y), q(f[1].hp), q(f[1].energy),
    q(game.timer), game.roundWins[0], game.roundWins[1],
    game.projectiles.length, game.drops.length,
  ]) mix(x);
  return h;
}

let sbPromise = null;
function loadClient() {
  if (!sbPromise) {
    sbPromise = import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm')
      .then(({ createClient }) => createClient(SUPABASE_URL, SUPABASE_KEY, {
        // persist so sign-in survives reloads; detect the OAuth redirect fragment
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
        // must exceed our send rate (1000/SEND_MS ≈ 30/s) or packets get throttled
        realtime: { params: { eventsPerSecond: 50 } },
      }));
  }
  return sbPromise;
}

// Shared client accessor (auth reuses the same Supabase project/connection).
export function getSupabase() { return loadClient(); }

export function makeRoomId() {
  const raw = (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '') : Math.random().toString(36).slice(2) + Date.now().toString(36));
  return raw.slice(0, 10);
}

// ---------------------------------------------------------------------------
// MATCHMAKING LOBBY
//
// One shared presence channel. Everyone waiting announces themselves; every
// client sees the same roster and independently runs the SAME pairing rule, so
// two players agree on who fights whom and which room to meet in — no server
// logic, no race to claim an opponent.
//
// Pairing: sort the roster by session id, take players in twos. The lower id
// hosts. Room id is derived from both ids, so both sides compute it identically.
// ---------------------------------------------------------------------------
export const LOBBY_CHANNEL = 'uec-lobby-v1';

export function pairFromRoster(roster, myId) {
  const ids = roster.map(r => r.sid).filter(Boolean).sort();
  const i = ids.indexOf(myId);
  if (i < 0) return null;
  const partnerIdx = i % 2 === 0 ? i + 1 : i - 1;   // 0↔1, 2↔3, …
  const partner = ids[partnerIdx];
  if (!partner) return null;                        // odd one out keeps waiting
  const [a, b] = [myId, partner].sort();
  return { partner, role: myId === a ? 'host' : 'guest', roomId: ('m' + a + b).slice(0, 24) };
}

export class LobbySession {
  constructor({ me, onRoster }) {
    this.me = me;
    this.onRoster = onRoster;
    this.sid = makeRoomId() + makeRoomId().slice(0, 4);   // unique per tab
    this.channel = null;
    this.closed = false;
  }

  async join() {
    const sb = await loadClient();
    this.channel = sb.channel(LOBBY_CHANNEL, {
      config: { broadcast: { self: false }, presence: { key: this.sid } },
    });
    this.channel.on('presence', { event: 'sync' }, () => {
      if (this.closed) return;
      const state = this.channel.presenceState();
      const roster = Object.values(state).map(arr => arr[0]).filter(Boolean);
      this.onRoster?.(roster);
    });
    await new Promise((resolve, reject) => {
      const to = setTimeout(() => reject(new Error('timeout')), 12000);
      this.channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          clearTimeout(to);
          await this.channel.track({ ...this.me, sid: this.sid });
          resolve();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          clearTimeout(to); reject(new Error(status));
        }
      });
    });
  }

  async leave() {
    this.closed = true;
    try { await this.channel?.unsubscribe(); } catch (e) { /* already gone */ }
    this.channel = null;
  }
}

export class NetSession {
  /**
   * role: 'host' | 'guest' — host is fighter[0] and picks the arena.
   * me:   { n, co, pts } — display identity.
   * ev:   { onPeerJoin, onPeerLeave, onPeerPick, onStart, onQuit,
   *         onRematchWanted, onDesync }
   */
  constructor({ role, roomId, me, ev }) {
    this.role = role;
    this.roomId = roomId;
    this.me = me;
    this.ev = ev;
    this.channel = null;
    this.peer = null;
    this.myPick = null;
    this.peerPick = null;
    this.closed = false;

    // lockstep buffers
    this.localQ = new Map();
    this.remoteQ = new Map();
    this.frame = 0;          // next frame to simulate
    this.queued = 0;         // local frames queued so far
    this.lastRemoteAt = 0;
    this.lastSentEnd = INPUT_DELAY;
    this.lastSendAt = 0;
    this.peerFrame = 0;
    this.hashes = new Map(); // frame -> local hash (for desync checks)
    this.stats = { sent: 0, recv: 0, failed: 0, lastFail: null };
  }

  async connect() {
    const sb = await loadClient();
    this.channel = sb.channel('uec-room-' + this.roomId, {
      config: { broadcast: { self: false, ack: false }, presence: { key: this.role } },
    });
    this.channel
      .on('presence', { event: 'sync' }, () => this.handlePresence())
      .on('broadcast', { event: 'pick' }, ({ payload }) => {
        this.peerPick = payload;
        this.ev.onPeerPick?.(payload);
      })
      .on('broadcast', { event: 'start' }, ({ payload }) => this.ev.onStart?.(payload))
      .on('broadcast', { event: 'input' }, ({ payload }) => this.onInput(payload))
      .on('broadcast', { event: 'sync' }, ({ payload }) => this.onSync(payload))
      .on('broadcast', { event: 'quit' }, ({ payload }) => this.ev.onQuit?.(payload))
      .on('broadcast', { event: 'rematch' }, () => this.ev.onRematchWanted?.());

    await new Promise((resolve, reject) => {
      let settled = false;
      const timeout = setTimeout(() => { settled = true; reject(new Error('timeout')); }, 12000);
      this.channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          clearTimeout(timeout);
          await this.channel.track({ ...this.me, role: this.role });
          this.retries = 0;
          if (!settled) { settled = true; resolve(); }
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          clearTimeout(timeout);
          // Before we're connected this is a hard failure. AFTER we're
          // connected it's a dropped socket — which is the normal case for a
          // host who switches apps to send the invite link. Without a rejoin
          // the room silently dies and the guest sees "no host here".
          if (!settled) { settled = true; reject(new Error(status)); }
          else this.scheduleRejoin();
        }
      });
    });
  }

  // Re-subscribe after a dropped socket, with backoff. Presence is re-tracked
  // by connect(), so the peer sees us reappear instead of a dead room.
  scheduleRejoin() {
    if (this.closed || this.rejoinTimer) return;
    this.retries = (this.retries || 0) + 1;
    if (this.retries > 6) { this.ev.onNetDown?.(); return; }
    const wait = Math.min(8000, 500 * Math.pow(2, this.retries - 1));
    this.ev.onNetWobble?.(this.retries);
    this.rejoinTimer = setTimeout(async () => {
      this.rejoinTimer = null;
      if (this.closed) return;
      try {
        try { await this.channel?.unsubscribe(); } catch (e) { /* already gone */ }
        this.peer = null;
        await this.connect();
        this.ev.onNetBack?.();
      } catch (e) {
        this.scheduleRejoin();
      }
    }, wait);
  }

  // Called when the tab comes back to the foreground: verify we're still
  // actually subscribed, and rejoin if the OS quietly killed the socket.
  ensureAlive() {
    if (this.closed) return;
    const st = this.channel?.state;
    if (st !== 'joined' && st !== 'joining') this.scheduleRejoin();
  }

  handlePresence() {
    if (this.closed) return;
    const state = this.channel.presenceState();
    const other = this.role === 'host' ? 'guest' : 'host';
    const meta = state[other] && state[other][0];
    if (meta && !this.peer) {
      this.peer = meta;
      this.ev.onPeerJoin?.(meta);
    } else if (!meta && this.peer) {
      this.peer = null;
      this.ev.onPeerLeave?.();
    }
  }

  send(event, payload) {
    if (this.channel && !this.closed) {
      const p = this.channel.send({ type: 'broadcast', event, payload });
      if (p && p.then) p.then((res) => {
        if (res !== 'ok') { this.stats.failed++; this.stats.lastFail = `${event}:${res}`; }
      }).catch(() => { this.stats.failed++; });
    }
  }

  sendPick(spec) { this.myPick = spec; this.send('pick', spec); }
  sendStart(cfg) { this.send('start', cfg); }
  sendQuit(reason = 'left') { this.send('quit', { reason }); }
  sendRematch() { this.send('rematch', {}); }

  // ---------------- lockstep ----------------

  resetMatch() {
    this.localQ.clear();
    this.remoteQ.clear();
    this.hashes.clear();
    this.frame = 0;
    this.queued = 0;
    this.lastSentEnd = INPUT_DELAY;
    this.peerFrame = 0;
    for (let i = 0; i < INPUT_DELAY; i++) {
      this.localQ.set(i, 0);
      this.remoteQ.set(i, 0);
    }
    this.lastRemoteAt = performance.now();
    this.lastSendAt = 0;
  }

  queueLocal(mask) {
    this.localQ.set(INPUT_DELAY + this.queued, mask);
    this.queued++;
    this.sendWindow();
  }

  // Input packets are wall-clock paced (never floods the realtime rate limit)
  // and contiguous by construction — the window starts where the last one
  // ended (small overlap), and the cap trims its END, never its start.
  // Loss healing: keepalive packets (force=true, sent while stalled) re-anchor
  // at the frame the peer last reported, re-covering anything they missed.
  sendWindow(force = false) {
    const end = INPUT_DELAY + this.queued;           // exclusive
    if (end <= INPUT_DELAY) return;
    const now = performance.now();
    if (!force && now - this.lastSendAt < SEND_MS) return;
    let start = this.lastSentEnd - 2;
    if (force) start = Math.min(start, this.peerFrame);
    start = Math.max(INPUT_DELAY, start);
    if (start >= end) return;
    const sendEnd = Math.min(end, start + WINDOW_MAX);
    const m = [];
    for (let f = start; f < sendEnd; f++) m.push(this.localQ.get(f) ?? 0);
    this.send('input', { f: start, m, a: this.frame });
    this.stats.sent++;
    this.lastSentEnd = Math.max(this.lastSentEnd, sendEnd);
    this.lastSendAt = now;
  }

  flush() { this.sendWindow(); }

  // Stall recovery on its own clock (regular paced sends must never starve it):
  // re-anchors at the peer's last reported frame, re-covering whatever they lost.
  heal() {
    const now = performance.now();
    if (now - (this.lastHealAt || 0) < 300) return;
    this.lastHealAt = now;
    this.sendWindow(true);
  }

  get msSinceSend() { return performance.now() - this.lastSendAt; }

  onInput({ f, m, a }) {
    for (let i = 0; i < m.length; i++) this.remoteQ.set(f + i, m[i]);
    if (typeof a === 'number') this.peerFrame = Math.max(this.peerFrame, a);
    this.stats.recv++;
    this.lastRemoteAt = performance.now();
  }

  canStep() { return this.localQ.has(this.frame) && this.remoteQ.has(this.frame); }

  padsFor() { return [this.localQ.get(this.frame), this.remoteQ.get(this.frame)]; }

  advance() {
    this.localQ.delete(this.frame - 180);
    this.remoteQ.delete(this.frame - 180);
    this.frame++;
  }

  get stalledMs() { return performance.now() - this.lastRemoteAt; }

  // ---------------- desync detection ----------------

  recordHash(game) {
    if (this.frame % SYNC_EVERY !== 0 || this.frame === 0) return;
    const h = hashGameState(game);
    this.hashes.set(this.frame, h);
    this.send('sync', { f: this.frame, h });
    for (const k of this.hashes.keys()) if (k < this.frame - 1200) this.hashes.delete(k);
  }

  onSync({ f, h }) {
    const mine = this.hashes.get(f);
    if (mine !== undefined && mine !== h) this.ev.onDesync?.(f);
  }

  async close() {
    this.closed = true;
    if (this.rejoinTimer) { clearTimeout(this.rejoinTimer); this.rejoinTimer = null; }
    try { await this.channel?.unsubscribe(); } catch (e) { /* already gone */ }
    this.channel = null;
  }
}
