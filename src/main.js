// Boot, screen router, match lifecycle, render loop, menu background.

import { STAGE, DEBUG, VERSION } from './config.js';
import { Save, parseChallengeFromURL, buildChallengeLink } from './state.js';
import { FIGHTERS, DEFAULT_BASE_ID, pickLook, getFighter, buildCustomFighter, buildGhostFighter, toCharacter } from './data/fighters.js';
import { randomArena, getArena } from './data/arenas.js';
import { audio, installAudioUnlock } from './engine/audio.js';
import { input, HumanController, isTouchDevice } from './engine/input.js';
import { AIController } from './engine/ai.js';
import { Game } from './engine/game.js';
import { renderGame } from './engine/render.js';
import { drawPortrait, enableSprites, spritesReady } from './engine/drawFighter.js';
import { enable3D, stats3D } from './engine/gl3d/index.js';
import { hud } from './ui/hud.js';
import {
  initScreens, openSelect, sel, toast, updateTitleChip, showIncomingChallenge,
  showShareCard, openInvite, openModal, closeModals, renderProfile,
  showIncomingLive, setLiveStatus, confirmDialog, playerDef, showAbout,
  renderMoveCard,
} from './ui/screens.js';
import { shouldShowTutorial, showTutorial } from './ui/tutorial.js';
import { AUTH, initAuth, onAuthChange, signInGoogle, signInMicrosoft, signInEmail, signOut, currentUser, userHandle, __debugSignIn } from './auth.js';
import { syncProfileUp, syncProfileDown, reportOnlineMatch, fetchProfile } from './net/cloud.js';
import {
  NetSession, LobbySession, pairFromRoster, MaskController, makeRoomId, padToMask,
  STEP as NET_STEP, CHARACTER_WIRE_VERSION, SIM_VERSION, validatePeerCharacter,
} from './net/online.js';
import { SCHEMA_VERSION } from './data/schema.js';

const $ = (id) => document.getElementById(id);

let currentGame = null;
let currentSetup = null;
let lastResult = null;
let lastRanked = null;
let splashTimer = null;

// ---- live multiplayer state ----
let net = null;
let netPhase = 'idle';       // idle | waiting | picking | starting | playing | results
let netCtl = null;
let netLocalIdx = 0;
let netAccum = 0;
let netPickLocked = false;
let netArenaChoice = 'random';
let netAuto = false;         // true when the match came from the auto-pair lobby
let netRematch = { me: false, peer: false };
let guestTag = null;

// incoming invites parsed at boot, shown once past the sign-in gate
let pendingChallenge = null;
let pendingLive = null;
let firstTimeShown = false;

function invitesAllowed() {
  return !AUTH.REQUIRED || !!currentUser();
}

function maybeShowPendingInvite() {
  if (!invitesAllowed()) return;
  if (pendingLive) {
    const { hostName, roomId } = pendingLive;
    pendingLive = null;
    showIncomingLive(hostName, () => joinLiveRoom(roomId));
  } else if (pendingChallenge) {
    const ch = pendingChallenge;
    pendingChallenge = null;
    presentChallenge(ch);
  }
}

// Build the challenger's ghost — enriched with their real photo/colors from the
// cloud when the link carries their user id — then show the VS card.
async function presentChallenge(ch) {
  let data = { ...ch };
  if (ch.u) {
    const prof = await fetchProfile(ch.u);
    if (prof) {
      data = {
        n: prof.handle || ch.n, co: prof.company || ch.co,
        f: prof.base_id || ch.f, sp: prof.special || ch.sp,
        pts: prof.points ?? ch.pts,
        photo: prof.photo || null, skin: prof.skin || null, hair: prof.hair || null,
        c1: prof.c1 || null, c2: prof.c2 || null,
        ...(prof.look || {}),          // their hair / headwear / outfit choices
      };
    }
  }
  const ghostDef = buildGhostFighter(data);
  const pts = data.pts || 0;
  const difficulty = pts >= 1200 ? 'mogul' : pts >= 300 ? 'founder' : 'intern';
  showIncomingChallenge(ghostDef, { pts }, () => {
    sel.ghost = { def: ghostDef, difficulty, isChallenge: true };
    openSelect('solo');
  });
}

function identity() {
  const uid = currentUser()?.id || null;   // rooms carry auth ids so wins can be verified
  const p = Save.profile;
  if (p) return { n: p.name, co: p.company || 'Stealth Startup', pts: Save.stats.points, uid };
  if (!guestTag) guestTag = 'FOUNDER-' + Math.floor(1000 + Math.random() * 9000);
  return { n: guestTag, co: 'Stealth Startup', pts: Save.stats.points, uid };
}

// ---------------------------------------------------------------- router

// Screens a signed-in player may visit before they've built their founder.
const PRE_PROFILE_OK = new Set(['scr-auth', 'scr-profile', 'scr-help', 'scr-about']);

function showScreen(id) {
  // hard sign-in gate (only once providers are configured — see src/auth.js)
  if (AUTH.REQUIRED && !currentUser() && id !== 'scr-auth') id = 'scr-auth';
  // profile gate: you fight AS YOURSELF, so a founder profile isn't optional.
  // Anything else would put an unnamed, faceless player on the global ladder.
  else if (AUTH.REQUIRED && currentUser() && !Save.profile && !PRE_PROFILE_OK.has(id)) {
    id = 'scr-profile';
    renderProfile();
  }
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === id));
  input.enabled = id === 'scr-fight';
  if (id !== 'scr-fight') {
    audio.stopMusic();
    $('touchControls').classList.add('hidden');
  }
}

// ---------------------------------------------------------------- match lifecycle

function startMatch(cfg) {
  if (cfg.mode === 'solo' && shouldShowTutorial()) {
    showTutorial(() => reallyStartMatch(cfg));
    return;
  }
  reallyStartMatch(cfg);
}

function reallyStartMatch(cfg) {
  clearTimeout(splashTimer);
  closeModals();
  currentSetup = cfg;
  lastResult = null;
  lastRanked = null;

  const p1Controller = new HumanController(0);
  const p2Controller = cfg.mode === 'versus'
    ? new HumanController(1)
    : new AIController(cfg.difficulty, cfg.p2Def);

  input.mode = cfg.mode === 'versus' ? 'versus' : 'solo';
  input.reset();

  currentGame = new Game({
    p1: { def: cfg.p1Def, controller: p1Controller },
    p2: { def: cfg.p2Def, controller: p2Controller },
    arena: cfg.arena,
    mode: cfg.mode,
    difficulty: cfg.difficulty,
    isChallenge: cfg.isChallenge,
    hud,
    onEnd: onMatchEnd,
  });

  hud.setup(currentGame);
  showScreen('scr-fight');

  // touch pads: solo only (2P shares one keyboard)
  const touch = isTouchDevice() || new URLSearchParams(location.search).has('touch');
  $('touchControls').classList.toggle('hidden', !(touch && cfg.mode !== 'versus'));
  // touch shows every button already — the controls card would just cover them
  document.body.classList.toggle('touch-active', touch && cfg.mode !== 'versus');

  // VS splash
  const vs = $('vsSplash');
  drawPortrait($('vsFace1'), cfg.p1Def);
  drawPortrait($('vsFace2'), cfg.p2Def);
  $('vsName1').textContent = cfg.p1Def.name;
  $('vsName2').textContent = cfg.p2Def.name;
  vs.classList.remove('hidden');
  currentGame.paused = true;

  const begin = () => {
    clearTimeout(splashTimer);
    vs.classList.add('hidden');
    vs.onclick = null;
    if (currentGame) {
      currentGame.paused = false;
      audio.startMusic(cfg.arena);
    }
  };
  vs.onclick = begin;
  splashTimer = setTimeout(begin, 1600);
}

function onMatchEnd(result) {
  lastResult = result;
  const ranked = result.mode === 'solo';
  if (ranked) {
    lastRanked = Save.recordMatch({
      won: result.winnerIdx === 0,
      koRounds: result.koRounds[0],
      difficulty: result.difficulty,
      isChallenge: result.isChallenge,
    });
    updateTitleChip();
  }
  renderResults();
  showScreen('scr-results');
}

function verdictText() {
  const r = lastResult;
  if (r.mode === 'versus') return r.winnerIdx === 0 ? 'P1 WINS!' : 'P2 WINS!';
  return r.winnerIdx === (r.localIdx ?? 0) ? 'VICTORY' : 'DEFEAT';
}

function renderResults() {
  const r = lastResult;
  const won = r.winnerIdx === (r.localIdx ?? 0);
  const v = $('result-verdict');
  v.textContent = verdictText();
  v.classList.toggle('lose', r.mode !== 'versus' && !won);

  const wDef = r.defs[r.winnerIdx];
  const lDef = r.defs[1 - r.winnerIdx];
  drawPortrait($('resFaceW'), wDef, { face: 'happy' });
  drawPortrait($('resFaceL'), lDef, { face: 'ko' });
  $('resNameW').textContent = wDef.name;
  $('resNameL').textContent = lDef.name;
  $('result-score').textContent = `${r.score[r.winnerIdx]} – ${r.score[1 - r.winnerIdx]}`;

  const stats = [
    [`${r.koRounds[r.winnerIdx]}`, 'KO ROUNDS'],
    [`${Math.max(r.maxCombo[0], r.maxCombo[1])}`, 'BEST COMBO'],
    [currentSetup.arena.name, 'ARENA'],
  ];
  $('result-stats').innerHTML = stats
    .map(([b, l]) => `<div class="rstat"><b>${b}</b><span>${l}</span></div>`).join('');

  const pts = $('result-points');
  if (lastRanked) {
    pts.classList.remove('hidden');
    pts.innerHTML =
      `<span class="pts">+${lastRanked.gained} PTS</span> → ${lastRanked.total} total · ` +
      `<span class="rank-chip">${lastRanked.rank}</span>` +
      (lastRanked.streak > 1 ? ` · 🔥 ${lastRanked.streak} WIN STREAK` : '') +
      (lastRanked.rankUp ? `<br>📈 RANK UP — welcome to <b>${lastRanked.rank}</b>. That belongs on LinkedIn. 👇` : '');
  } else {
    pts.classList.add('hidden');
  }

  $('result-cta').classList.toggle('hidden', !!Save.profile || r.mode === 'versus');

  // online: rematch needs both players; fighter change happens via a new room
  const online = r.mode === 'online';
  $('btn-changefighter').style.display = online ? 'none' : '';
  if (online) {
    const connected = !!net;
    $('btn-rematch').disabled = !connected || netRematch.me;
    $('btn-rematch').textContent = !connected ? 'RIVAL LEFT THE ROOM'
      : netRematch.me ? '⏳ WAITING FOR RIVAL…' : '🔁 REMATCH (LIVE)';
  } else {
    $('btn-rematch').disabled = false;
    $('btn-rematch').textContent = '🔁 REMATCH';
  }
}

function quickFight() {
  const p1Def = playerDef();                    // always you
  const pool = FIGHTERS.filter(f => f.id !== p1Def.baseId);
  const p2Def = pool[Math.floor(Math.random() * pool.length)];
  const difficulty = Save.data.tutorialSeen ? (Save.data.lastDifficulty || 'founder') : 'intern';
  startMatch({ mode: 'solo', p1Def, p2Def, arena: randomArena(), difficulty, isChallenge: false });
}

// Arcade continue: straight into a fresh fight vs a new random rival, no menus.
// Keeps the current difficulty and avoids repeating the rival you just faced.
function nextFight() {
  if (net) { net.sendQuit('left'); endNetSession(); }
  const p1Def = playerDef();
  const lastRivalId = lastResult?.defs?.[1 - (lastResult.localIdx ?? 0)]?.baseId
    || lastResult?.defs?.[1 - (lastResult.localIdx ?? 0)]?.id;
  let pool = FIGHTERS.filter(f => f.id !== p1Def.baseId && f.id !== lastRivalId);
  if (!pool.length) pool = FIGHTERS.filter(f => f.id !== p1Def.baseId);
  const p2Def = pool[Math.floor(Math.random() * pool.length)];
  const difficulty = Save.data.lastDifficulty || 'founder';
  startMatch({ mode: 'solo', p1Def, p2Def, arena: randomArena(), difficulty, isChallenge: false });
}

function quitMatch() {
  closeModals();
  currentGame = null;
  showScreen('scr-title');
}

// ---------------------------------------------------------------- live multiplayer

const netEvents = {
  onPeerJoin(meta) {
    audio.sfx('meterFull');
    // Lobby match: nothing to choose, so re-send our pick (covers the race
    // where one side locked in before the other had subscribed) and go.
    if (netAuto && netPhase === 'picking') {
      toast(`🥊 ${meta.n} is in — fight!`);
      net?.sendPick(defToSpec(playerDef()));
      maybeHostStart();
      return;
    }
    if (netPhase === 'waiting' || netPhase === 'picking') {
      netPhase = 'picking';
      netPickLocked = false;
      closeModals();
      toast(`🥊 ${meta.n} is here — pick your fighter!`);
      sel.ghost = null;
      openSelect('online');
    }
  },
  // Socket dropped (backgrounding the tab to go send the link does this).
  // We auto-rejoin, so tell the player it's recovering rather than dying.
  onNetWobble(n) {
    if (netPhase === 'waiting') setLiveStatus('wait', `Reconnecting to the room… (${n})`);
    else if (!currentGame) toast('📶 Reconnecting…');
  },
  onNetBack() {
    if (netPhase === 'waiting') setLiveStatus('wait', "Room is live — send the link. You'll know the second they join!");
    else toast('📶 Back online.');
  },
  onNetDown() {
    if (netPhase === 'waiting') setLiveStatus('wait', 'Lost the room — close this and start a new one.');
    else abortOnline('Connection lost.');
  },
  onPeerLeave() {
    if (netPhase === 'playing' || netPhase === 'picking' || netPhase === 'starting') {
      abortOnline('Your rival disconnected.');
    } else if (netPhase === 'results') {
      toast('Your rival left the room.');
      endNetSession();
      renderResults();
    }
  },
  onPeerPick(spec) {
    // Refuse at the handshake rather than at the first hit. A character we do
    // not agree to fight would otherwise desync the match several seconds in,
    // which reads to both players as a network fault.
    const why = specRejection(spec);
    if (why) { abortOnline(`⚠ Match refused — ${why}.`); return; }
    toast('⚔ Your rival locked in!');
    maybeHostStart();
  },
  onStart(cfg) {
    if (netPhase === 'picking' || netPhase === 'starting' || netPhase === 'results') {
      startOnlineMatch(cfg);
    }
  },
  onQuit() {
    if (netPhase === 'playing') abortOnline('Your rival left the match.');
    else if (netPhase === 'results') { toast('Your rival left the room.'); endNetSession(); renderResults(); }
    else abortOnline('Your rival left.');
  },
  onRematchWanted() {
    netRematch.peer = true;
    toast('🔁 Your rival wants a rematch!');
    tryOnlineRematch();
  },
  onDesync() {
    abortOnline('⚠ Desync detected — match void. Blame the wifi.');
  },
};

async function endNetSession() {
  netPhase = 'idle';
  netAuto = false;
  $('netStatus').classList.add('hidden');
  if (net) {
    const n = net;
    net = null;
    await n.close();
  }
}

// ---- matchmaking lobby ----
let lobby = null;
let lobbyPairing = false;

async function leaveLobby() {
  lobbyPairing = false;
  if (lobby) { const l = lobby; lobby = null; await l.leave(); }
}

function setLobbyStatus(kind, text, count) {
  $('lobbyDot').classList.toggle('ok', kind === 'ok');
  $('lobbyStatusText').textContent = text;
  $('lobbyCount').textContent = count == null ? ''
    : count <= 1 ? '1 founder in the lobby — you'
    : `${count} founders in the lobby`;
}

async function enterLobby() {
  await endNetSession();
  await leaveLobby();
  openModal('modal-lobby');
  setLobbyStatus('wait', 'Joining the lobby…', null);

  lobby = new LobbySession({
    me: identity(),
    onRoster: (roster) => {
      if (!lobby || lobbyPairing) return;
      const pair = pairFromRoster(roster, lobby.sid);
      if (!pair) {
        setLobbyStatus('wait', 'Waiting for fighters…', roster.length);
        return;
      }
      // Both sides compute the same pair, the same roles and the same room id,
      // so they meet without any handshake.
      lobbyPairing = true;
      const rival = roster.find(r => r.sid === pair.partner);
      setLobbyStatus('ok', `Matched with ${rival?.n || 'a founder'} — entering the arena…`, roster.length);
      startPairedMatch(pair);
    },
  });

  try {
    await lobby.join();
  } catch (e) {
    setLobbyStatus('wait', 'Could not reach the lobby — check your connection.', null);
    await leaveLobby();
  }
}

// Paired via the lobby: connect to the shared room and lock in immediately —
// there's nothing left to choose (you always fight as yourself).
//
// We deliberately STAY tracked in the lobby until the match actually starts.
// Leaving on pairing raced the partner's presence sync: the first player to
// pair vanished from the roster before the second ever saw them, so the second
// sat on "waiting for fighters" forever.
async function startPairedMatch({ role, roomId }) {
  net = new NetSession({ role, roomId, me: identity(), ev: netEvents });
  netPhase = 'picking';
  try {
    await net.connect();
  } catch (e) {
    toast('Could not open the match room — try again.');
    await endNetSession();
    lobbyPairing = false;      // allow the next roster sync to re-pair us
    return;
  }
  netAuto = true;
  netArenaChoice = 'random';
  netPickLocked = true;
  net.sendPick(defToSpec(playerDef()));
  maybeHostStart();
}

async function createLiveRoom() {
  await endNetSession();
  openModal('modal-live');
  setLiveStatus('wait', 'Connecting…');
  $('liveLink').value = '';
  const roomId = makeRoomId();
  net = new NetSession({ role: 'host', roomId, me: identity(), ev: netEvents });
  netPhase = 'waiting';
  try {
    await net.connect();
  } catch (e) {
    setLiveStatus('wait', 'Connection failed — check your network and try again.');
    await endNetSession();
    return;
  }
  const url = new URL(location.origin + location.pathname);
  url.searchParams.set('room', roomId);
  url.searchParams.set('hn', identity().n);
  $('liveLink').value = url.toString();
  setLiveStatus('wait', "Room is live — send the link. You'll know the second they join!");
}

async function joinLiveRoom(roomId) {
  await endNetSession();
  openModal('modal-live');
  setLiveStatus('wait', 'Joining the room…');
  $('liveLink').value = '';
  net = new NetSession({ role: 'guest', roomId, me: identity(), ev: netEvents });
  netPhase = 'picking';
  try {
    await net.connect();
  } catch (e) {
    setLiveStatus('wait', 'Could not join — the room may be gone.');
    await endNetSession();
    return;
  }
  setLiveStatus('ok', 'Connected — looking for the host…');
  setTimeout(() => {
    if (net && !net.peer && netPhase === 'picking' && !currentGame) {
      setLiveStatus('wait', 'No host here — the room may have closed. You can cancel.');
    }
  }, 5000);
}

function defToSpec(def) {
  // Every pick carries the sender's whole character alongside the look, so the
  // receiver can check the numbers rather than resolve an id and hope. `wv`/`sv`
  // version the exchange; the receiver refuses on any mismatch.
  const base = { wv: CHARACTER_WIRE_VERSION, sv: SCHEMA_VERSION, simv: SIM_VERSION, ch: toCharacter(def) };
  if (def.id === 'custom' && Save.profile) {
    const p = Save.profile;
    return {
      ...base,
      kind: 'custom', name: p.name, company: p.company || 'Stealth Startup',
      baseId: p.baseId || DEFAULT_BASE_ID, c1: p.c1, c2: p.c2, special: p.special, photo: p.photo || null,
      // skin/hair/look too, or your rival fights a differently-coloured you
      skin: p.skin || null, hair: p.hair || null, ...pickLook(p),
    };
  }
  return { ...base, kind: 'roster', id: def.id };
}

// Returns a fighter def, or null if the peer's character is not one we agree to
// fight. Callers must treat null as "do not start".
function specToDef(spec) {
  const check = validatePeerCharacter(spec);
  if (!check.ok) {
    console.warn('[net] rejected peer character:', check.reason);
    return null;
  }
  if (spec.kind === 'custom') {
    const def = buildCustomFighter({
      name: spec.name, company: spec.company, baseId: spec.baseId,
      c1: spec.c1, c2: spec.c2, special: spec.special, photo: spec.photo || null,
      skin: spec.skin || null, hair: spec.hair || null, ...pickLook(spec),
    });
    // The validated character is authoritative for anything that decides a
    // fight; the look fields above only decide what it looks like.
    def.commandNormals = spec.ch.commandNormals || [];
    def.body = spec.ch.body;
    return def;
  }
  return getFighter(spec.id);
}

// Why a peer's pick was refused, or null if it is fine. Used to show the
// player a reason instead of a match that silently never starts.
function specRejection(spec) {
  const check = validatePeerCharacter(spec);
  return check.ok ? null : check.reason;
}

function onlinePick(def, arenaId) {
  if (!net) return;
  netPickLocked = true;
  if (net.role === 'host') netArenaChoice = arenaId || 'random';
  net.sendPick(defToSpec(def));
  toast(net.peerPick ? '⚔ Both locked in!' : '✓ Locked in — waiting for your rival…');
  maybeHostStart();
}

function maybeHostStart() {
  if (!net || net.role !== 'host' || netPhase !== 'picking') return;
  if (!net.myPick || !net.peerPick) return;
  netPhase = 'starting';
  const arena = netArenaChoice === 'random' ? randomArena().id : netArenaChoice;
  const cfg = {
    arena, host: net.myPick, guest: net.peerPick,
    seed: Math.floor(Math.random() * 0xffffffff),     // shared drop-RNG seed
  };
  net.sendStart(cfg);
  startOnlineMatch(cfg);
}

function startOnlineMatch(cfg) {
  clearTimeout(splashTimer);
  leaveLobby();            // paired and playing — release our lobby slot
  closeModals();
  netPhase = 'playing';
  netRematch = { me: false, peer: false };
  netPickLocked = false;
  net.resetMatch();
  netAccum = 0;
  const hostDef = specToDef(cfg.host);
  const guestDef = specToDef(cfg.guest);
  // Both sides run this, so a character either peer rejects stops the match on
  // both clients rather than starting a fight only one of them believes in.
  if (!hostDef || !guestDef) {
    abortOnline('⚠ Match refused — a fighter failed validation.');
    return;
  }
  netLocalIdx = net.role === 'host' ? 0 : 1;
  netCtl = [new MaskController(), new MaskController()];
  ensureNetWorker();
  input.mode = 'solo';
  input.reset();
  currentSetup = { mode: 'online', arena: getArena(cfg.arena) };
  lastRanked = null;
  currentGame = new Game({
    p1: { def: hostDef, controller: netCtl[0] },
    p2: { def: guestDef, controller: netCtl[1] },
    arena: getArena(cfg.arena),
    mode: 'online',
    difficulty: 'founder',
    isChallenge: true,
    seed: cfg.seed,
    hud,
    onEnd: onOnlineMatchEnd,
  });
  hud.setup(currentGame);
  showScreen('scr-fight');
  $('netStatus').classList.remove('hidden');
  const touch = isTouchDevice() || new URLSearchParams(location.search).has('touch');
  $('touchControls').classList.toggle('hidden', !touch);
  document.body.classList.toggle('touch-active', !!touch);

  const vs = $('vsSplash');
  drawPortrait($('vsFace1'), hostDef);
  drawPortrait($('vsFace2'), guestDef);
  $('vsName1').textContent = hostDef.name;
  $('vsName2').textContent = guestDef.name;
  vs.classList.remove('hidden');
  currentGame.paused = true;
  const begin = () => {
    clearTimeout(splashTimer);
    vs.classList.add('hidden');
    vs.onclick = null;
    if (currentGame) {
      currentGame.paused = false;
      audio.startMusic(currentGame.arena);
    }
  };
  vs.onclick = begin;
  splashTimer = setTimeout(begin, 1600);
}

function onOnlineMatchEnd(result) {
  netPhase = 'results';
  $('netStatus').classList.add('hidden');
  result.localIdx = netLocalIdx;
  lastResult = result;
  lastRanked = Save.recordMatch({
    won: result.winnerIdx === netLocalIdx,
    koRounds: result.koRounds[netLocalIdx],
    difficulty: 'founder',
    isChallenge: true,
  });
  updateTitleChip();
  renderResults();
  showScreen('scr-results');

  // global-board reporting: only when BOTH players are signed in; the server
  // applies stats only once both reports agree
  const myUid = currentUser()?.id;
  const oppUid = net?.peer?.uid || null;
  if (myUid && oppUid && net) {
    reportOnlineMatch({
      roomId: net.roomId,
      opponentUid: oppUid,
      iWon: result.winnerIdx === netLocalIdx,
      myRounds: result.score[netLocalIdx],
      oppRounds: result.score[1 - netLocalIdx],
      koRounds: result.koRounds[netLocalIdx],
    }).then((status) => {
      if (status === 'applied') toast('🌍 Global leaderboard updated!');
      else if (status === 'pending') toast('🌍 Result recorded — waiting for your rival\'s confirmation.');
    });
  }
}

function requestOnlineRematch() {
  if (!net || netPhase !== 'results') return;
  netRematch.me = true;
  net.sendRematch();
  renderResults();
  tryOnlineRematch();
}

function tryOnlineRematch() {
  if (!net || !netRematch.me || !netRematch.peer) return;
  if (net.role === 'host' && netPhase === 'results') {
    const cfg = {
      arena: randomArena().id, host: net.myPick, guest: net.peerPick,
      seed: Math.floor(Math.random() * 0xffffffff),
    };
    net.sendStart(cfg);
    startOnlineMatch(cfg);
  }
}

function abortOnline(msg) {
  clearTimeout(splashTimer);
  currentGame = null;
  endNetSession();
  closeModals();
  audio.stopMusic();
  showScreen('scr-title');
  toast(msg);
}

function leaveOnlineMatch() {
  if (net) net.sendQuit('left');
  abortOnline('You left the live match.');
}

function netMatchActive() {
  return !!(net && netPhase === 'playing' && currentGame);
}

// Hidden tabs get no rAF and their timers are heavily throttled — a Worker's
// ticks are not, so a backgrounded player keeps simulating instead of
// freezing (and eventually dropping) their live opponent.
let netWorker = null;
let netWorkerLast = 0;
function ensureNetWorker() {
  if (netWorker) return;
  const src = 'setInterval(() => postMessage(0), 100);';
  netWorker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
  netWorkerLast = performance.now();
  netWorker.onmessage = () => {
    const now = performance.now();
    const dt = Math.min(1.5, (now - netWorkerLast) / 1000);
    netWorkerLast = now;
    if (document.hidden && netMatchActive()) {
      let left = dt;
      while (left > 0 && netMatchActive()) {
        netStep(Math.min(0.05, left));
        left -= 0.05;
      }
    }
  };
}

function netStep(rawDt) {
  if (!currentGame.paused) {
    netAccum = Math.min(netAccum + rawDt, 0.25);
    let steps = 0;
    while (netAccum >= NET_STEP && steps < 5) {
      if (!net.canStep()) break;
      if (DEBUG && window.__autoInput) window.__autoInput(currentGame, input.pads[0], net.frame);
      net.queueLocal(padToMask(input.samplePad(0)));
      const [lm, rm] = net.padsFor();
      netCtl[netLocalIdx].mask = lm;
      netCtl[1 - netLocalIdx].mask = rm;
      currentGame.update(NET_STEP);
      if (!currentGame) return;                      // match may have ended + aborted
      net.recordHash(currentGame);
      net.advance();
      netAccum -= NET_STEP;
      steps++;
    }
    // keep the pipe fed with paced backlog sends; heal (own clock) when stalled
    if (!net.canStep()) net.heal();
    else net.sendWindow();
  }
  const el = $('netStatus');
  const stalled = net.stalledMs > 700 && net.frame > 10;
  el.classList.toggle('warn', stalled);
  $('netStatusText').textContent = stalled ? 'SYNCING…' : 'LIVE';
  if (net.stalledMs > 20000) { abortOnline('Connection lost.'); return; }
  if (!document.hidden) renderGame(gctx, currentGame);
}

// ---------------------------------------------------------------- pause

function togglePause() {
  if (!currentGame || currentGame.finished) return;
  if (netMatchActive()) {
    // you can't pause a live opponent — offer to forfeit instead
    confirmDialog('LEAVE LIVE MATCH?', 'The fight keeps running — leaving now forfeits it.', leaveOnlineMatch);
    return;
  }
  if (currentGame.paused) {
    closeModals();
    currentGame.paused = false;
  } else {
    currentGame.paused = true;
    // Show YOUR moves, not the rival's — nobody memorises a move list from the
    // select screen thirty seconds before the fight starts.
    const mine = currentGame.fighters[netLocalIdx === 1 ? 1 : 0];
    const count = renderMoveCard(document.getElementById('pause-cmds'), mine?.def);
    document.getElementById('pause-moves').classList.toggle('hidden', count === 0);
    openModal('modal-pause');
  }
  audio.sfx('click');
}

// ---------------------------------------------------------------- brag sharing

// The share URL is your challenge link when you have a profile — so a friend
// clicking your brag gets *called out*, not just linked. That's the loop.
function shareUrl() {
  if (Save.profile) return buildChallengeLink();
  return location.origin + location.pathname;
}

function bragText() {
  const r = lastResult;
  const li = r.localIdx ?? 0;
  const won = r.winnerIdx === li;
  const me = r.defs[li];
  const opp = r.defs[1 - li];
  const score = `${r.score[r.winnerIdx]}–${r.score[1 - r.winnerIdx]}`;
  const kos = r.koRounds[r.winnerIdx];
  const arena = currentSetup?.arena?.name || 'the arena';
  const oppLabel = `${opp.name}${opp.company ? ' of ' + opp.company : ''}`;
  if (won) {
    const koBit = kos > 0 ? ` ${kos} KO${kos > 1 ? 's' : ''}.` : '';
    const rankBit = lastRanked ? ` Currently ranked ${lastRanked.rank} (${lastRanked.total} pts).` : '';
    return `Just took down ${oppLabel} ${score} at ${arena} in the Ultimate Entrepreneur Challenge.${koBit}${rankBit} Think you can beat me? Fight me here:`;
  }
  return `${oppLabel} just beat me ${score} in the Ultimate Entrepreneur Challenge. Avenge me (or laugh at me) here:`;
}

function wireShareStrip() {
  const enc = encodeURIComponent;
  $('sh-li').onclick = () => {
    audio.sfx('select');
    window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${enc(shareUrl())}`, '_blank', 'noopener');
    copyToClipboard(`${bragText()} ${shareUrl()}`);
    toast('🔗 Brag copied too — paste it into your LinkedIn post!');
  };
  $('sh-x').onclick = () => {
    audio.sfx('select');
    window.open(`https://twitter.com/intent/tweet?text=${enc(bragText())}&url=${enc(shareUrl())}`, '_blank', 'noopener');
  };
  $('sh-wa').onclick = () => {
    audio.sfx('select');
    window.open(`https://wa.me/?text=${enc(`${bragText()} ${shareUrl()}`)}`, '_blank', 'noopener');
  };
  $('sh-copy').onclick = async () => {
    audio.sfx('click');
    const ok = await copyToClipboard(`${bragText()} ${shareUrl()}`);
    toast(ok ? '⧉ Brag copied — paste it anywhere.' : 'Copy blocked — long-press to copy manually.');
  };
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    return false;
  }
}

// ---------------------------------------------------------------- share card

function shareCard() {
  const r = lastResult;
  const cleanUrl = location.host ? location.host + location.pathname.replace(/index\.html$/, '') : 'uec.game';
  showShareCard({
    verdict: verdictText().replace('!', ''),
    defs: r.defs,
    winnerIdx: r.winnerIdx,
    score: [r.score[r.winnerIdx], r.score[1 - r.winnerIdx]],
    kos: r.koRounds[r.winnerIdx],
    maxCombo: Math.max(r.maxCombo[0], r.maxCombo[1]),
    arenaName: currentSetup.arena.name,
    pointsLine: lastRanked ? `+${lastRanked.gained} PTS → ${lastRanked.total} · ${lastRanked.rank}` : null,
    url: cleanUrl.replace(/\/$/, ''),
  });
}

function downloadCard() {
  $('shareCanvas').toBlob((blob) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'uec-fight-result.png';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    toast('⬇ Result card downloaded.');
  }, 'image/png');
}

async function nativeShareCard() {
  const canvas = $('shareCanvas');
  const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
  const file = new File([blob], 'uec-result.png', { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    navigator.share({ files: [file], title: 'UEC fight result' }).catch(() => {});
  } else if (navigator.share) {
    navigator.share({ title: 'UEC', text: 'I just fought in the Ultimate Entrepreneur Challenge 🥊', url: location.href.split('?')[0] }).catch(() => {});
  } else {
    downloadCard();
  }
}

// ---------------------------------------------------------------- menu background

const bg = { canvas: null, ctx: null, orbs: [] };

function setupBg() {
  bg.canvas = $('bgCanvas');
  bg.ctx = bg.canvas.getContext('2d');
  for (let i = 0; i < 26; i++) {
    bg.orbs.push({
      x: Math.random(), y: Math.random(),
      r: 1 + Math.random() * 2.5, s: 0.008 + Math.random() * 0.02,
      hue: [45, 330, 190, 265][i % 4], p: Math.random() * 7,
    });
  }
  const resize = () => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    bg.w = innerWidth;
    bg.h = innerHeight;
    bg.canvas.width = Math.round(innerWidth * dpr);
    bg.canvas.height = Math.round(innerHeight * dpr);
    bg.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  window.addEventListener('resize', resize);
}

function drawBg(t) {
  const { ctx } = bg;
  const W = bg.w, H = bg.h;
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#0b0e1a');
  g.addColorStop(0.6, '#10152a');
  g.addColorStop(1, '#1a1030');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // perspective grid floor
  ctx.strokeStyle = 'rgba(123,92,255,0.10)';
  ctx.lineWidth = 1;
  const horizon = H * 0.72;
  for (let i = 0; i < 14; i++) {
    const y = horizon + Math.pow(i / 14, 1.7) * (H - horizon);
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
  for (let i = -10; i <= 10; i++) {
    ctx.beginPath();
    ctx.moveTo(W / 2 + i * 60, horizon);
    ctx.lineTo(W / 2 + i * 260, H);
    ctx.stroke();
  }
  // rising chart line
  ctx.strokeStyle = 'rgba(46,230,107,0.16)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i <= 30; i++) {
    const x = (i / 30) * W;
    const y = H * 0.55 - i * (H * 0.012) + Math.sin(i * 1.1 + t * 0.9) * 14;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.stroke();
  // floating sparks
  for (const o of bg.orbs) {
    o.y -= o.s * 0.016;
    if (o.y < -0.05) { o.y = 1.05; o.x = Math.random(); }
    const a = 0.25 + 0.2 * Math.sin(t * 2 + o.p);
    ctx.fillStyle = `hsla(${o.hue}, 90%, 65%, ${a})`;
    ctx.beginPath();
    ctx.arc(o.x * W, o.y * H, o.r, 0, 7);
    ctx.fill();
  }
}

// ---------------------------------------------------------------- game canvas

let gctx = null;

function setupGameCanvas() {
  const canvas = $('gameCanvas');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = STAGE.W * dpr;
  canvas.height = STAGE.H * dpr;
  gctx = canvas.getContext('2d');
  gctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

// ---------------------------------------------------------------- loop

let lastT = performance.now();

function loop(now) {
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  const fightActive = document.getElementById('scr-fight').classList.contains('active');
  if (fightActive && currentGame) {
    if (netMatchActive()) {
      netStep(dt);
    } else {
      currentGame.update(dt);
      renderGame(gctx, currentGame);
    }
  } else {
    drawBg(now / 1000);
  }
  requestAnimationFrame(loop);
}

// ---------------------------------------------------------------- boot

function boot() {
  setupBg();
  setupGameCanvas();
  installAudioUnlock();
  input.init();
  hud.bind();
  input.attachTouch($('touchControls'));

  initScreens({
    showScreen,
    startMatch,
    quickFight,
    createLiveRoom,
    cancelLiveRoom: () => endNetSession(),
    onlinePick,
    netInfo: () => (net ? { role: net.role, pickLocked: netPickLocked } : null),
    onModalClosed: () => { /* settings/invite closed — nothing to resume */ },
    // Their first founder just went in — release them from the profile gate and
    // deliver any invite that arrived while they were still building.
    onFirstProfile: () => {
      showScreen('scr-title');
      maybeShowPendingInvite();
    },
  });

  $('app-version').textContent = VERSION;   // single source of truth: config.js

  // block pinch + double-tap zoom (game chrome, not form fields)
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('dblclick', (e) => {
    if (!e.target.closest('input, textarea')) e.preventDefault();
  });

  $('btn-title-live').onclick = () => { audio.sfx('select'); enterLobby(); };
  $('btn-lobby-cancel').onclick = () => { audio.sfx('back'); leaveLobby(); closeModals(); };

  input.onPause = togglePause;
  $('btn-moves').onclick = () => { audio.sfx('click'); $('movesCard').classList.toggle('hidden'); };
  $('btn-pause').onclick = togglePause;
  $('btn-resume').onclick = togglePause;
  $('btn-restart').onclick = () => { audio.sfx('fight'); reallyStartMatch(currentSetup); };
  $('btn-quit').onclick = () => { audio.sfx('back'); quitMatch(); };

  // results buttons
  $('btn-next').onclick = () => { audio.sfx('fight'); nextFight(); };
  $('btn-fight-live').onclick = () => {
    audio.sfx('select');
    if (net) { net.sendQuit('left'); endNetSession(); }
    enterLobby();                        // auto-pair against a real player
  };
  $('btn-rematch').onclick = () => {
    audio.sfx('fight');
    if (lastResult?.mode === 'online') requestOnlineRematch();
    else reallyStartMatch(currentSetup);
  };
  $('btn-changefighter').onclick = () => { audio.sfx('select'); openSelect(currentSetup.mode); };
  $('btn-res-menu').onclick = () => {
    audio.sfx('back');
    if (net) { net.sendQuit('left'); endNetSession(); }
    showScreen('scr-title');
  };
  $('btn-sharecard').onclick = shareCard;
  $('btn-res-invite').onclick = () => openInvite();
  $('btn-res-profile').onclick = () => { renderProfile(); showScreen('scr-profile'); };
  $('btn-dl-card').onclick = downloadCard;
  $('btn-share-card').onclick = nativeShareCard;
  wireShareStrip();

  // ---- sign in ----
  const authFail = (e) => toast(
    /not enabled|unsupported|disabled/i.test(e?.message || '')
      ? '🔐 That provider isn\'t switched on yet — see README → Enabling sign-in.'
      : `Sign-in failed: ${e?.message || e}`);
  $('btn-account').onclick = () => {
    audio.sfx('click');
    if (currentUser()) {
      confirmDialog('SIGN OUT?', currentUser().email || 'Signed in', () => { signOut(); toast('Signed out.'); });
    } else {
      showScreen('scr-auth');
    }
  };
  $('btn-auth-google').onclick = () => { audio.sfx('click'); signInGoogle().catch(authFail); };
  $('btn-auth-ms').onclick = () => { audio.sfx('click'); signInMicrosoft().catch(authFail); };
  $('btn-auth-email').onclick = () => {
    audio.sfx('click');
    const email = $('authEmail').value.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { toast('Enter a valid email first.'); return; }
    signInEmail(email)
      .then(() => toast('📬 Magic link sent — check your inbox!'))
      .catch(authFail);
  };
  $('btn-auth-back').onclick = () => { audio.sfx('back'); if (!AUTH.REQUIRED || currentUser()) showScreen('scr-title'); };
  onAuthChange((session) => {
    $('btn-account').textContent = session ? `👤 ${userHandle()} · SIGN OUT` : '🔐 SIGN IN';
    // hard gate: no escape hatch until signed in, so hide the dead BACK control
    $('btn-auth-back').style.display = (AUTH.REQUIRED && !session) ? 'none' : '';
    if (session && document.getElementById('scr-auth').classList.contains('active')) showScreen('scr-title');
    if (session) {
      // Pull the account down FIRST so this device adopts your real founder and
      // rank (phone and laptop used to disagree because stats were per-device).
      // Only push up if there was nothing in the cloud yet.
      syncProfileDown().then((adopted) => {
        if (adopted) {
          updateTitleChip();
          if ($('scr-profile').classList.contains('active')) renderProfile();
        } else if (Save.profile) {
          syncProfileUp();
        }
      });
      // Brand-new player: set the scene once. The story stays available any
      // time from THE STORY on the menu, but never auto-plays again.
      if (!Save.data.storySeen && !pendingChallenge && !pendingLive) {
        Save.markStorySeen();
        showAbout();
        return;
      }
      if (!Save.profile) {
        // First time in: the profile gate in showScreen() already routes them to
        // the builder — this just explains why they're staring at it.
        showScreen('scr-profile');
        if (!firstTimeShown) {
          firstTimeShown = true;
          toast('👋 Welcome, founder! Build your fighter — you fight as yourself.');
        }
      } else if (pendingChallenge || pendingLive) {
        maybeShowPendingInvite();
      }
    }
  });
  initAuth();
  if (AUTH.REQUIRED && !currentUser()) showScreen('scr-auth');

  showScreen('scr-title');

  // incoming links: parse now, but only surface once the player is past the
  // sign-in gate (so the challenge card isn't buried under the auth screen)
  const qs = new URLSearchParams(location.search);
  const roomParam = qs.get('room');
  const cleanURL = () => history.replaceState(null, '', location.pathname + (DEBUG ? '?debug=1' : ''));
  if (roomParam) {
    pendingLive = { hostName: (qs.get('hn') || 'A founder').slice(0, 24), roomId: roomParam };
    cleanURL();
  } else {
    const ch = parseChallengeFromURL();
    if (ch) { pendingChallenge = ch; cleanURL(); }
  }
  maybeShowPendingInvite();

  requestAnimationFrame(loop);

  // auto-pause if the tab is hidden mid-fight (rAF throttling would stall it anyway)
  document.addEventListener('visibilitychange', () => {
    // Coming back to the tab: the OS may have quietly killed our socket while
    // the host was off in a messaging app sending the invite link. Verify and
    // rejoin so the room is still there when the guest arrives.
    if (!document.hidden && net) net.ensureAlive();
    if (DEBUG) return;                                  // test harness drives time manually
    if (document.hidden && currentGame && !currentGame.paused && !currentGame.finished
      && currentGame.state !== 'matchEnd'
      && $('scr-fight').classList.contains('active')) {
      togglePause();
    }
  });

  // Baked sprite fighters, opt-in via ?sprites while the art pass is in
  // progress. Off by default: the procedural renderer is still what draws a
  // player's own founder from their photo and look choices.
  if (new URLSearchParams(location.search).has('sprites')) enableSprites(true);

  // Live 3D fighters, the prototype: ?gl (fighters with a model), ?gl=all
  // (everyone in the first model, own palette), &perf for a timing readout.
  const glParam = new URLSearchParams(location.search);
  if (glParam.has('gl')) enable3D({ all: glParam.get('gl') === 'all', timing: glParam.has('perf') });

  if (DEBUG) {
    window.UEC = {
      get game() { return currentGame; },
      enableSprites,
      spritesReady,
      enable3D,
      stats3D,
      Save,
      input,
      startMatch,
      quickFight,
      showScreen,
      setHP(i, v) { currentGame.fighters[i].hp = v; },
      setEnergy(i, v) { currentGame.fighters[i].energy = v; },
      setTimer(v) { currentGame.timer = v; },
      skipSplash() { clearTimeout(splashTimer); $('vsSplash').onclick?.(); },
      // simulate sign-in/out so the auth-gated flows are testable without OAuth
      signInAs(user = { id: 'test-uid', email: 'test@example.com' }) { return __debugSignIn(user); },
      signOutTest() { return __debugSignIn(null); },
      get net() { return net; },
      get netPhase() { return netPhase; },
      // pump the lockstep driver manually (rAF is throttled in headless tests)
      netPump(s = 1) {
        let left = s;
        while (left > 0 && netMatchActive()) {
          netStep(Math.min(0.05, left));
          left -= 0.05;
        }
      },
      // Deterministic stepper for automated tests (rAF may be throttled headless).
      step(s = 1, dt = 1 / 60) {
        const n = Math.max(1, Math.round(s / dt));
        for (let i = 0; i < n; i++) currentGame?.update(dt);
        if (currentGame) renderGame(gctx, currentGame);
      },
    };
  }
}

boot();
