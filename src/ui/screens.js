// All menu screens + modals: fighter select, profile (photo upload → avatar),
// challenges & invite links, leaderboard, help, settings/pause, share card.

import { FIGHTERS, BASE_CHARACTERS, DEFAULT_BASE_ID, SPECIALS, PLAYER_SPECIALS, playerSpecialId, UNICORN_META, LOOKS, pickLook, getFighter, buildCustomFighter, playerBuildCost } from '../data/fighters.js';
import { ARENAS, getArena, randomArena } from '../data/arenas.js';
import { Save, buildChallengeLink } from '../state.js';
import { STYLES, rankFor, AI_LEVELS, BODY } from '../config.js';
import { SLOT_GLYPH, commandCost } from '../data/schema.js';
import { PLAYER_MOVES, PLAYER_BUDGET, toCommandNormal } from '../data/playerMoves.js';
import { drawPortrait, setPhotoReadyCallback, ensurePhoto } from '../engine/drawFighter.js';
import { audio } from '../engine/audio.js';
import { KEY_LABELS } from '../engine/input.js';
import { renderResultCard, renderChallengeCard } from './resultCard.js';
import { detectFace } from './faceDetect.js';
import { fetchLeaderboard, syncProfileUp } from '../net/cloud.js';
import { currentUser } from '../auth.js';

const $ = (id) => document.getElementById(id);
let A = null;   // actions provided by main.js

// ---------------------------------------------------------------- selection state

export const sel = {
  mode: 'solo',
  p1: 'custom',         // always you — there is no "choose your fighter" any more
  p2: null,             // your rival: a roster fighter, 'random', or the live peer
  arena: 'random',
  difficulty: 'founder',
  ghost: null,          // { def, difficulty } for accepted challenges / rival fights
};

// One shared roster: your own founder first, then the disgraced-founder cast.
// Both sides of the select screen pick from it — you choose who you fight AS
// and who you fight AGAINST.
function tileDefs() {
  const list = [];
  if (Save.profile) list.push({ id: 'custom', def: buildCustomFighter(Save.profile), badge: 'YOU' });
  for (const f of FIGHTERS) list.push({ id: f.id, def: f, badge: f.cameo ? 'CAMEO' : null });
  list.push({ id: 'random', def: null, badge: null });
  return list;
}

// The local player's chosen fighter (defaults to their own founder).
export function playerDef() {
  return resolveDef(sel.p1 || 'custom');
}

// Your own founder, regardless of who you've picked to play as.
export function myFounderDef() {
  return Save.profile ? buildCustomFighter(Save.profile) : getFighter(DEFAULT_BASE_ID);
}

function resolveDef(id) {
  if (id === 'custom') return Save.profile ? buildCustomFighter(Save.profile) : getFighter(DEFAULT_BASE_ID);
  if (id === 'random') {
    const pool = FIGHTERS.map(f => f.id);
    return getFighter(pool[Math.floor(Math.random() * pool.length)]);
  }
  return getFighter(id);
}

function drawRandomTile(canvas) {
  const ctx = canvas.getContext('2d');
  const S = canvas.width;
  const g = ctx.createLinearGradient(0, 0, S, S);
  g.addColorStop(0, '#2a3358'); g.addColorStop(1, '#10152a');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.roundRect(0, 0, S, S, S * 0.12); ctx.fill();
  ctx.fillStyle = '#ffd23f';
  ctx.font = `900 italic ${S * 0.5}px system-ui`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('?', S / 2, S * 0.56);
}

// Which side of the select screen the next tile click fills.
let pickSide = 'p1';

export function openSelect(mode) {
  sel.mode = mode;
  sel.p1 = Save.data.lastSelf || 'custom';
  sel.p2 = mode === 'solo' ? (Save.data.lastRival || 'random') : null;
  pickSide = 'p1';
  if (!sel.ghost) sel.difficulty = Save.data.lastDifficulty || 'founder';
  renderSelect();
  A.showScreen('scr-select');
}

function selectTitle() {
  if (sel.mode === 'online') return '🔴 LIVE — PICK YOUR FIGHTER';
  if (sel.ghost) return `FACE ${sel.ghost.def.name}!`;
  return 'CHARACTER SELECT';
}

function renderSelect() {
  $('select-title').textContent = selectTitle();
  $('difficulty-row').style.display = (sel.mode !== 'solo' || sel.ghost) ? 'none' : '';
  // in live matches the host picks the arena
  const net = A.netInfo?.();
  document.querySelector('#arena-strip').parentElement.style.display =
    (sel.mode === 'online' && net?.role === 'guest') ? 'none' : '';

  // The rival side is fixed when the opponent is already decided — a live peer
  // or the founder who challenged you. You still choose who YOU play as.
  const rivalFixed = sel.mode === 'online' || !!sel.ghost;
  if (rivalFixed && pickSide === 'p2') pickSide = 'p1';

  // side toggle: which slot the next tile click fills
  const setSide = (s) => { pickSide = s; renderSelect(); };
  $('side-you').classList.toggle('active', pickSide === 'p1');
  $('side-rival').classList.toggle('active', pickSide === 'p2');
  $('side-rival').style.display = rivalFixed ? 'none' : '';
  $('side-you').onclick = () => { audio.sfx('click'); setSide('p1'); };
  $('side-rival').onclick = () => { audio.sfx('click'); setSide('p2'); };

  const grid = $('fighter-grid');
  grid.innerHTML = '';
  for (const t of tileDefs()) {
    // 'random' only makes sense for the rival, never for who you play as
    if (t.id === 'random' && pickSide === 'p1') continue;
    const tile = document.createElement('div');
    tile.className = 'f-tile';
    if (t.id === sel.p1) tile.classList.add('sel');
    if (t.id === sel.p2 && !rivalFixed) tile.classList.add('sel2');
    const c = document.createElement('canvas');
    c.width = c.height = 280;
    if (t.def) drawPortrait(c, t.def); else drawRandomTile(c);
    tile.appendChild(c);
    const name = document.createElement('div');
    name.className = 'f-name';
    name.textContent = t.def ? t.def.name.split(' ')[0] : 'RANDOM';
    tile.appendChild(name);
    if (t.badge) {
      const b = document.createElement('div');
      b.className = 'f-badge';
      b.textContent = t.badge;
      tile.appendChild(b);
    }
    tile.onclick = () => {
      audio.sfx('select');
      sel[pickSide] = t.id;
      // picking your own fighter naturally hands over to picking the rival
      if (pickSide === 'p1' && !rivalFixed) pickSide = 'p2';
      renderSelect();
    };
    grid.appendChild(tile);
  }

  // arena strip
  const strip = $('arena-strip');
  strip.innerHTML = '';
  const arenas = [{ id: 'random', name: 'RANDOM' }, ...ARENAS];
  for (const a of arenas) {
    const b = document.createElement('button');
    b.className = 'a-tile' + (sel.arena === a.id ? ' sel' : '');
    b.textContent = a.name;
    b.onclick = () => { audio.sfx('click'); sel.arena = a.id; renderSelect(); };
    strip.appendChild(b);
  }

  // difficulty seg
  document.querySelectorAll('#difficulty-seg button').forEach(b => {
    b.classList.toggle('on', b.dataset.diff === sel.difficulty);
    b.onclick = () => { audio.sfx('click'); sel.difficulty = b.dataset.diff; renderSelect(); };
  });

  renderPreview();

  if (sel.mode === 'online') {
    const locked = A.netInfo?.()?.pickLocked;
    $('btn-fight').disabled = !!locked;
    $('btn-fight').textContent = locked ? '✓ READY — WAITING FOR RIVAL…' : 'LOCK IN ➤';
    return;
  }
  const ready = !!sel.ghost || !!sel.p2;
  $('btn-fight').disabled = !ready;
  $('btn-fight').textContent = ready ? 'FIGHT ➤' : 'PICK A RIVAL…';
}

export function refreshSelect() {
  if (document.getElementById('scr-select').classList.contains('active')) renderSelect();
}

// Fills one side of the VS banner (the big portrait + name + dossier).
function renderSide(prefix, def, fallbackLabel) {
  const pv = $(`${prefix}-portrait`);
  if (def) drawPortrait(pv, def); else drawRandomTile(pv);
  $(`${prefix}-name`).textContent = def ? def.name : fallbackLabel;
  $(`${prefix}-title`).textContent = def ? (def.title || '') : 'ROLL THE DICE';
  $(`${prefix}-co`).textContent = def ? def.company : 'Could be anyone…';
  const st = def ? (STYLES[def.style] || STYLES.balanced) : null;
  $(`${prefix}-style`).textContent = st ? st.name : '—';
  $(`${prefix}-rap`).textContent = def?.rap || (def?.id === 'custom' ? 'Unindicted · so far' : '');
  const sp = def ? SPECIALS[def.special] : null;
  $(`${prefix}-sp`).textContent = sp ? `${sp.icon} ${sp.name}` : '🎲 MYSTERY';

  renderMoveCard($(`${prefix}-cmds`), def);
}

// The 2–3 inputs that belong to this character and nobody else. Everyone
// shares the same buttons, so this is the only place the difference is legible
// outside of actually throwing the move.
export function renderMoveCard(el, def) {
  if (!el) return 0;
  el.textContent = '';
  const cmds = def?.commandNormals || [];
  for (const cn of cmds) {
    const row = document.createElement('div');
    row.className = 'pv-cmd';
    const key = document.createElement('span');
    key.className = 'pv-cmd-key';
    key.textContent = SLOT_GLYPH[cn.slot] || cn.slot;
    const name = document.createElement('span');
    name.className = 'pv-cmd-name';
    name.textContent = cn.displayName;
    row.append(key, name);
    el.appendChild(row);
  }
  return cmds.length;
}

function renderPreview() {
  const youDef = resolveDef(sel.p1 || 'custom');
  let rivalDef;
  if (sel.ghost) rivalDef = sel.ghost.def;
  else if (sel.mode === 'online') rivalDef = null;
  else rivalDef = (!sel.p2 || sel.p2 === 'random') ? null : resolveDef(sel.p2);

  renderSide('you', youDef, 'PICK YOU');
  renderSide('rival', rivalDef, sel.mode === 'online' ? 'YOUR RIVAL' : 'RANDOM');

  // style blurb explains what picking this character actually changes
  const st = STYLES[youDef?.style] || STYLES.balanced;
  $('style-blurb').textContent = `${st.name} — ${st.blurb}`;
}

function onFight() {
  audio.sfx('fight');
  const p1Def = playerDef();          // you are always you
  if (sel.mode === 'online') {
    A.onlinePick(p1Def, sel.arena);
    renderSelect();
    return;
  }
  let p2Def, difficulty = sel.difficulty, isChallenge = false;

  if (sel.ghost) {
    p2Def = sel.ghost.def;
    difficulty = sel.ghost.difficulty;
    isChallenge = !!sel.ghost.isChallenge;
    sel.ghost = null;
  } else {
    p2Def = resolveDef(sel.p2 || 'random');
  }

  const arena = sel.arena === 'random' ? randomArena() : getArena(sel.arena);
  Save.rememberSelection(sel.p2, sel.mode === 'solo' ? difficulty : null, sel.p1);
  A.startMatch({ mode: sel.mode, p1Def, p2Def, arena, difficulty, isChallenge });
}

// ---------------------------------------------------------------- profile

let draft = null;

function newDraft() {
  return Save.profile ? { ...Save.profile } : {
    name: '', company: '', photo: null, baseId: DEFAULT_BASE_ID,
    c1: '#5865f2', c2: '#ffd23f', special: 'pitchdeck',
    skin: null, hair: null,
    body: null, moves: [],
    // look layers stay unset until touched, so they inherit the base character
  };
}

// ---- photo → fighter coloring (all on-device) ----
const DEFAULT_SUIT = '#5865f2';
function lum([r, g, b]) { return 0.299 * r + 0.587 * g + 0.114 * b; }
function medianCh(vals) { vals.sort((a, b) => a - b); return vals[vals.length >> 1]; }
function rgbHex([r, g, b]) {
  return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, v | 0)).toString(16).padStart(2, '0')).join('');
}
// Sample skin / hair / clothing tones from a face-framed crop. The crop is
// centered on the face (see the crop modal), so fixed sample regions are
// reliable: mid = skin, top = hair, bottom corners = shoulders/clothing.
function samplePhotoColors(source) {
  const S = 64;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, S, S);
  const d = ctx.getImageData(0, 0, S, S).data;
  const at = (fx, fy) => {
    const i = (Math.round(fy * (S - 1)) * S + Math.round(fx * (S - 1))) * 4;
    return [d[i], d[i + 1], d[i + 2]];
  };
  const med = (regions) => [
    medianCh(regions.map(p => p[0])), medianCh(regions.map(p => p[1])), medianCh(regions.map(p => p[2])),
  ];
  const skin = med([[0.5, 0.52], [0.42, 0.5], [0.58, 0.5], [0.5, 0.44], [0.5, 0.6], [0.4, 0.58], [0.6, 0.58], [0.46, 0.47], [0.54, 0.47]].map(([x, y]) => at(x, y)));
  const hair = med([[0.5, 0.08], [0.4, 0.1], [0.6, 0.1], [0.5, 0.14], [0.34, 0.14], [0.66, 0.14]].map(([x, y]) => at(x, y)));
  const cloth = med([[0.12, 0.92], [0.88, 0.92], [0.22, 0.97], [0.78, 0.97], [0.5, 0.96]].map(([x, y]) => at(x, y)));
  return { skin, hair, cloth };
}
// Apply sampled colors to the draft. Skin always (drives the hands). Hair only
// when it reads as actual hair (darker than the face — else it's background/bald).
// Clothing only fills the suit if the player hasn't picked their own color yet.
function applyPhotoColors(source) {
  const { skin, hair, cloth } = samplePhotoColors(source);
  draft.skin = rgbHex(skin);
  draft.hair = lum(hair) < lum(skin) - 12 ? rgbHex(hair) : null;
  if (!draft.c1 || draft.c1.toLowerCase() === DEFAULT_SUIT) {
    const clothHex = rgbHex(cloth);
    // ignore near-black/near-white shirts that would read as a void
    if (lum(cloth) > 28 && lum(cloth) < 232) {
      draft.c1 = clothHex;
      $('inp-c1').value = clothHex;
      draft.c2 = rgbHex([255, 210, 63]);   // keep a bright accent so it pops
      $('inp-c2').value = '#ffd23f';
    }
  }
}

export function renderProfile() {
  draft = newDraft();
  $('inp-name').value = draft.name || '';
  $('inp-company').value = draft.company || '';
  $('inp-c1').value = draft.c1 || '#5865f2';
  $('inp-c2').value = draft.c2 || '#ffd23f';
  $('inp-hair').value = draft.hair || getFighter(draft.baseId || DEFAULT_BASE_ID).c.hair;

  const spSel = $('inp-special');
  spSel.innerHTML = '';
  // PLAYER_SPECIALS, not SPECIALS — a roster-only move must not be offered.
  // The codec enforces the same rule; this menu is only the polite half.
  for (const sp of Object.values(PLAYER_SPECIALS)) {
    const o = document.createElement('option');
    o.value = sp.id;
    o.textContent = `${sp.icon} ${sp.name}`;
    spSel.appendChild(o);
  }
  // A founder saved before a move went roster-only still carries its id, and
  // a <select> with no matching option reads back '' — which made this line
  // throw and left the profile screen unopenable. Normalise the draft, so the
  // next save writes a legal special too.
  draft.special = playerSpecialId(draft.special);
  spSel.value = draft.special;
  $('special-desc').textContent = SPECIALS[spSel.value].desc;

  renderStyleGrid();
  renderLookRows();
  renderBuild();
  renderAvatarPreview();
  renderCareer();

  // photo saved before color-matching existed → derive colors from it now
  if (draft.photo && !draft.skin) {
    const img = new Image();
    img.onload = () => {
      if (draft.photo !== img.src) return;   // profile changed while loading
      applyPhotoColors(img);
      renderAvatarPreview();
      renderStyleGrid();
    };
    img.src = draft.photo;
  }
}

function renderStyleGrid() {
  const grid = $('style-grid');
  grid.innerHTML = '';
  for (const f of BASE_CHARACTERS) {
    // pick a body/silhouette; your photo + colors are layered on in the preview
    const tile = document.createElement('div');
    tile.className = 'f-tile' + (draft.baseId === f.id ? ' sel' : '');
    const c = document.createElement('canvas');
    c.width = c.height = 180;
    drawPortrait(c, f);
    tile.appendChild(c);
    tile.onclick = () => {
      audio.sfx('click');
      draft.baseId = f.id;
      renderStyleGrid();
      renderLookRows();     // unset layers follow the new base character
      renderAvatarPreview();
    };
    grid.appendChild(tile);
  }
}

// Which layer each row edits, and what to call it on screen.
const LOOK_ROWS = [
  { key: 'hairStyle', label: 'HAIR' },
  { key: 'headwear', label: 'HEADWEAR' },
  { key: 'eyewear', label: 'EYEWEAR' },
  { key: 'facialHair', label: 'FACIAL' },
  { key: 'outfit', label: 'OUTFIT' },
];

// Eyewear and facial hair are drawn on a *drawn* face. Over an uploaded photo
// they'd float free of the real features, so the renderer skips them and we
// grey the rows out rather than offering a control that does nothing.
function looksDisabledByPhoto(key) {
  return !!draft.photo && (key === 'eyewear' || key === 'facialHair');
}

// What a layer resolves to when the player hasn't touched it. Mirrors the
// renderer's own fallback, which reads the base character's legacy `accessory`
// field — otherwise the row reads NONE while the avatar clearly wears glasses.
function baseLookValue(base, key) {
  if (key === 'eyewear') return ['visor', 'glasses', 'shades'].includes(base.accessory) ? base.accessory : 'none';
  if (key === 'facialHair') return base.accessory === 'stubble' ? 'stubble' : 'none';
  return base[key] || 'none';
}

function renderLookRows() {
  const host = $('look-rows');
  host.innerHTML = '';
  const base = getFighter(draft.baseId || DEFAULT_BASE_ID);
  for (const { key, label } of LOOK_ROWS) {
    const row = document.createElement('div');
    row.className = 'pick-row' + (looksDisabledByPhoto(key) ? ' disabled' : '');
    const lab = document.createElement('div');
    lab.className = 'pick-label';
    lab.textContent = label;
    row.appendChild(lab);
    const strip = document.createElement('div');
    strip.className = 'arena-strip';
    // unset → whatever the chosen base character already wears
    const current = draft[key] || baseLookValue(base, key);
    for (const opt of LOOKS[key]) {
      const b = document.createElement('button');
      b.className = 'a-tile' + (current === opt.id ? ' sel' : '');
      b.textContent = opt.name;
      b.onclick = () => {
        audio.sfx('click');
        draft[key] = opt.id;
        renderLookRows();
        renderAvatarPreview();
      };
      strip.appendChild(b);
    }
    row.appendChild(strip);
    host.appendChild(row);
  }
  $('look-hint').textContent = draft.photo
    ? 'Your photo is your face — hair sits behind it and headwear on top. Eyewear and facial hair come from the photo itself.'
    : 'Customise every layer — all cosmetic, none of it changes your stats.';
}

function renderAvatarPreview() {
  drawPortrait($('avatarPreview'), buildCustomFighter(draft));
  $('dock-name').textContent = (draft.name || '').trim().toUpperCase() || 'YOUR FOUNDER';
}

// ---------------------------------------------------------------- your build
//
// Everyone hits the same — a player cannot buy an advantage, and that rule is
// enforced in buildCustomFighter, not here. What this panel offers is a TRADE:
// silhouette is free, and anything that changes how you fight has to balance
// back to roughly zero. The meter is deliberately a balance, not a score, so
// both sides of centre read as equally unfinished.

const FREE_KNOBS = [['shoulders', 'SHOULDERS'], ['stride', 'LEG LENGTH'], ['head', 'HEAD SIZE']];
const PRICED_KNOBS = [['height', 'HEIGHT'], ['build', 'BUILD'], ['reach', 'ARM REACH']];

function buildSliders(hostId, knobs) {
  const host = $(hostId);
  host.innerHTML = '';
  for (const [key, label] of knobs) {
    const [lo, hi] = BODY[key];
    const row = document.createElement('div');
    row.className = 'build-slider';
    const lab = document.createElement('label');
    lab.textContent = label;
    const rng = document.createElement('input');
    rng.type = 'range'; rng.min = String(lo); rng.max = String(hi); rng.step = '0.01';
    rng.value = String((draft.body && draft.body[key]) ?? 1);
    rng.oninput = () => {
      draft.body = { ...(draft.body || {}), [key]: Number(rng.value) };
      renderAvatarPreview();
      renderBuildMeter();
    };
    row.append(lab, rng);
    host.appendChild(row);
  }
}

function renderMoveMenu() {
  const host = $('moveMenu');
  host.innerHTML = '';
  const chosen = new Set(draft.moves || []);
  for (const m of PLAYER_MOVES) {
    const cost = commandCost(toCommandNormal(m));
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'move-card' + (chosen.has(m.id) ? ' on' : '');
    const top = document.createElement('div');
    top.className = 'mc-top';
    const key = document.createElement('span');
    key.className = 'mc-key';
    key.textContent = SLOT_GLYPH[m.slot] || m.slot;
    const name = document.createElement('span');
    name.className = 'mc-name';
    name.textContent = m.displayName;
    const c = document.createElement('span');
    c.className = 'mc-cost ' + (cost >= 0 ? 'plus' : 'minus');
    // Shown in plain language: a refunding move BUYS you something else.
    c.textContent = cost >= 0 ? `costs ${cost.toFixed(1)}` : `frees ${Math.abs(cost).toFixed(1)}`;
    top.append(key, name, c);
    const blurb = document.createElement('div');
    blurb.className = 'mc-blurb';
    blurb.textContent = m.blurb;
    card.append(top, blurb);
    card.onclick = () => {
      const list = new Set(draft.moves || []);
      if (list.has(m.id)) list.delete(m.id);
      else {
        // one move per input — taking a second on the same button replaces it
        for (const other of PLAYER_MOVES) {
          if (other.slot === m.slot && list.has(other.id)) list.delete(other.id);
        }
        list.add(m.id);
      }
      draft.moves = [...list].slice(0, 3);
      audio.sfx('click');
      renderMoveMenu();
      renderBuildMeter();
    };
    host.appendChild(card);
  }
}

function renderBuildMeter() {
  const cost = playerBuildCost(draft);
  const ok = Math.abs(cost) <= PLAYER_BUDGET;
  // ±15 spans the bar, so an unbalanced build is visibly off-centre
  const pct = Math.max(2, Math.min(98, 50 + (cost / 15) * 50));
  $('bmNeedle').style.left = `calc(${pct}% - 1.5px)`;
  const read = $('bmRead') || $('bmCost').parentElement;
  $('bmCost').textContent = ok
    ? 'BALANCED'
    : cost > 0 ? `OVER BY ${cost.toFixed(1)}` : `UNDER BY ${Math.abs(cost).toFixed(1)}`;
  read.className = 'bm-read ' + (ok ? 'ok' : 'over');
  $('btn-save-profile').disabled = !ok;
  $('btn-save-profile').title = ok ? '' : 'Balance your build before saving';
}

// A build seeded from the profile itself, so two people who type different
// names get different suggestions and nobody starts on the same fighter.
function suggestBuild() {
  let h = 2166136261;
  for (const ch of ((draft.name || '') + (draft.company || '') + 'uec')) {
    h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0;
  }
  const pick = (n) => { h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0; return h % n; };

  // Take one move that costs, then settle the bill with shape and a refund.
  const costly = PLAYER_MOVES.filter(m => commandCost(toCommandNormal(m)) > 1);
  const refund = PLAYER_MOVES.filter(m => commandCost(toCommandNormal(m)) < -1);
  const want = costly[pick(costly.length)];
  const pay = refund.filter(m => m.slot !== want.slot);
  draft.moves = [want.id, pay[pick(pay.length)].id];

  // Free silhouette is rolled wide — this is where a founder gets to look odd.
  draft.body = {
    shoulders: +(0.88 + (pick(100) / 100) * 0.36).toFixed(2),
    stride:    +(0.90 + (pick(100) / 100) * 0.26).toFixed(2),
    head:      +(0.92 + (pick(100) / 100) * 0.19).toFixed(2),
    height: 1, build: 1, reach: 1,
  };
  // then nudge the priced frame until the bill is settled
  for (let i = 0; i < 40 && Math.abs(playerBuildCost(draft)) > PLAYER_BUDGET * 0.6; i++) {
    const over = playerBuildCost(draft) > 0;
    draft.body.build = Math.min(BODY.build[1], Math.max(BODY.build[0], draft.body.build + (over ? 0.01 : -0.01)));
    draft.body.height = Math.min(BODY.height[1], Math.max(BODY.height[0], draft.body.height + (over ? 0.01 : -0.01)));
  }
  buildSliders('buildFree', FREE_KNOBS);
  buildSliders('buildPriced', PRICED_KNOBS);
  renderMoveMenu();
  renderBuildMeter();
  renderAvatarPreview();
  audio.sfx('select');
}

function renderBuild() {
  buildSliders('buildFree', FREE_KNOBS);
  buildSliders('buildPriced', PRICED_KNOBS);
  renderMoveMenu();
  renderBuildMeter();
}


function renderCareer() {
  const s = Save.stats;
  const rows = [
    [s.wins, 'WINS'], [s.losses, 'LOSSES'], [s.kos, 'KOs'],
    [s.streak, 'STREAK'], [s.bestStreak, 'BEST STREAK'], [s.points, 'POINTS'],
  ];
  $('profile-stats').innerHTML =
    rows.map(([v, l]) => `<div class="rstat"><b>${v}</b><span>${l}</span></div>`).join('') +
    `<div class="rstat"><b style="font-size:13px">${rankFor(s.points)}</b><span>RANK</span></div>`;
}

// ---------------- face-only photo crop ----------------
// Upload → "Frame your face" modal: drag to pan, pinch/slider to zoom,
// FaceDetector auto-centering where the browser supports it.

const crop = { img: null, cx: 0, cy: 0, zoom: 1.3 };

function readFileToImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const cropSrcSize = () => Math.min(crop.img.width, crop.img.height) / crop.zoom;

function clampCrop() {
  const half = cropSrcSize() / 2;
  crop.cx = Math.max(half, Math.min(crop.img.width - half, crop.cx));
  crop.cy = Math.max(half, Math.min(crop.img.height - half, crop.cy));
}

function renderCrop() {
  const cv = $('cropCanvas');
  const ctx = cv.getContext('2d');
  const S = cv.width;
  const src = cropSrcSize();
  ctx.clearRect(0, 0, S, S);
  ctx.drawImage(crop.img, crop.cx - src / 2, crop.cy - src / 2, src, src, 0, 0, S, S);
  ctx.beginPath();
  ctx.rect(0, 0, S, S);
  ctx.arc(S / 2, S / 2, S / 2 - 8, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(5,7,15,0.62)';
  ctx.fill('evenodd');
  ctx.strokeStyle = '#ffd23f';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2 - 8, 0, Math.PI * 2); ctx.stroke();
}

async function autoFrameFace() {
  try {
    const face = await detectFace(crop.img);
    if (!face) return false;
    crop.cx = face.cx;
    crop.cy = face.cy - face.size * 0.12;                // bias up so forehead/hair fit
    const minSide = Math.min(crop.img.width, crop.img.height);
    // the avatar is a CIRCLE inscribed in the crop square, so pad enough that the
    // whole head (taller/wider than the detection box) sits inside the circle,
    // not clipped in the square's corners
    crop.zoom = Math.max(1, Math.min(4.2, minSide / (face.size * 1.9)));
    return true;
  } catch (e) {
    return false;
  }
}

async function openCropModal(img) {
  crop.img = img;
  crop.cx = img.width / 2;
  crop.cy = img.height / 2;
  crop.zoom = 1.7;                            // fallback (no face found): assume centred, zoom in
  const found = await autoFrameFace();
  clampCrop();
  $('cropZoom').value = Math.round(crop.zoom * 100);
  renderCrop();
  openModal('modal-crop');
  if (found) toast('🙂 Face found — fine-tune if you like.');
}

function wireCrop() {
  const cv = $('cropCanvas');
  const pts = new Map();
  cv.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    try { cv.setPointerCapture(e.pointerId); } catch (err) { /* best-effort */ }
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    cv.classList.add('dragging');
  });
  cv.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId) || !crop.img) return;
    if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      const dPrev = Math.hypot(a.x - b.x, a.y - b.y);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const [a2, b2] = [...pts.values()];
      const dNow = Math.hypot(a2.x - b2.x, a2.y - b2.y);
      if (dPrev > 4) {
        crop.zoom = Math.max(1, Math.min(4.2, crop.zoom * (dNow / dPrev)));
        $('cropZoom').value = Math.round(crop.zoom * 100);
        clampCrop(); renderCrop();
      }
      return;
    }
    const prev = pts.get(e.pointerId);
    const scale = cropSrcSize() / cv.getBoundingClientRect().width;
    crop.cx -= (e.clientX - prev.x) * scale;
    crop.cy -= (e.clientY - prev.y) * scale;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    clampCrop(); renderCrop();
  });
  const lift = (e) => { pts.delete(e.pointerId); if (!pts.size) cv.classList.remove('dragging'); };
  cv.addEventListener('pointerup', lift);
  cv.addEventListener('pointercancel', lift);
  $('cropZoom').oninput = (e) => {
    crop.zoom = Math.max(1, +e.target.value / 100);
    clampCrop(); renderCrop();
  };
  $('btn-crop-apply').onclick = () => {
    if (!crop.img) return;
    const S = 320;
    const out = document.createElement('canvas');
    out.width = out.height = S;
    const src = cropSrcSize();
    out.getContext('2d').drawImage(crop.img, crop.cx - src / 2, crop.cy - src / 2, src, src, 0, 0, S, S);
    draft.photo = out.toDataURL('image/jpeg', 0.85);
    applyPhotoColors(out);                  // skin/hair/outfit derived from the photo
    crop.img = null;
    closeModals();
    if (draft.hair) $('inp-hair').value = draft.hair;
    renderAvatarPreview();
    renderStyleGrid();
    renderLookRows();     // photo now drives the face; hint + disabled rows update
    toast('📷 Face locked in — now pick your hair and headwear below.');
    audio.sfx('select');
  };
}

function wireProfile() {
  $('inp-name').oninput = (e) => {
    draft.name = e.target.value;
    $('dock-name').textContent = draft.name.trim().toUpperCase() || 'YOUR FOUNDER';
  };
  $('inp-company').oninput = (e) => { draft.company = e.target.value; };
  $('inp-c1').oninput = (e) => { draft.c1 = e.target.value; renderStyleGrid(); renderAvatarPreview(); };
  $('inp-c2').oninput = (e) => { draft.c2 = e.target.value; renderStyleGrid(); renderAvatarPreview(); };
  $('inp-hair').oninput = (e) => { draft.hair = e.target.value; renderAvatarPreview(); };
  $('btn-look-random').onclick = () => {
    audio.sfx('select');
    for (const { key } of LOOK_ROWS) {
      if (looksDisabledByPhoto(key)) continue;
      const opts = LOOKS[key];
      draft[key] = opts[Math.floor(Math.random() * opts.length)].id;
    }
    renderLookRows();
    renderAvatarPreview();
  };
  $('inp-special').onchange = (e) => {
    draft.special = e.target.value;
    $('special-desc').textContent = SPECIALS[draft.special].desc;
  };
  $('photoInput').onchange = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      const img = await readFileToImage(file);
      await openCropModal(img);
    } catch (err) {
      toast('Could not read that image — try another file.');
    }
    e.target.value = '';
  };
  $('btn-photo-clear').onclick = () => {
    draft.photo = null;
    renderAvatarPreview();
    renderStyleGrid();
    renderLookRows();          // eyewear / facial hair become editable again
    audio.sfx('back');
  };
  $('btn-save-profile').onclick = () => {
    if (!draft.name.trim()) { toast('Give your founder a name first!'); $('inp-name').focus(); return; }
    const wasFirst = !Save.profile;     // they were held here by the profile gate
    Save.saveProfile({ ...draft, name: draft.name.trim(), company: draft.company.trim() });
    updateTitleChip();
    audio.sfx('victory');
    toast('💾 Profile saved. The ladder awaits.');
    if (currentUser()) {
      syncProfileUp().then((ok) => toast(ok
        ? '☁️ Profile synced to your account.'
        : '⚠️ Cloud sync failed — will retry on your next sign-in.'));
    }
    // First founder: the gate was holding them here, so let them out.
    if (wasFirst) A.onFirstProfile?.();
  };
  $('btn-build-suggest').onclick = () => suggestBuild();
  $('btn-invite').onclick = () => openInvite();
  $('btn-reset').onclick = () => {
    openConfirm('RESET EVERYTHING?', 'Profile, record, points — all gone. This cannot be undone.', () => {
      Save.resetAll();
      location.reload();
    });
  };
}

// ---------------------------------------------------------------- leaderboard

// Escape anything user-authored before it touches innerHTML. Handles from the
// cloud and names from challenge links are untrusted.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
));

let lbTab = 'global';

function lbRow(i, def, { name, company, points, wins, losses, kos, streak, you }) {
  const row = document.createElement('div');
  row.className = 'lb-row' + (you ? ' you' : '');
  const c = document.createElement('canvas');
  c.width = c.height = 80;
  drawPortrait(c, def);
  row.innerHTML = `<div class="lb-rank">${i + 1}</div>`;
  row.appendChild(c);
  row.insertAdjacentHTML('beforeend', `
    <div class="lb-main">
      <div class="lb-name">${esc(name)}${you ? ' ◂ YOU' : ''}</div>
      <div class="lb-co">${esc(company)} · ${rankFor(points)}</div>
    </div>
    <div class="lb-cell">${wins | 0}-${losses | 0}<span>W-L</span></div>
    <div class="lb-cell opt">${kos | 0}<span>KO</span></div>
    <div class="lb-cell opt">${streak | 0}<span>STRK</span></div>
    <div class="lb-pts">${points | 0}</div>`);
  return row;
}

export function renderLeaderboard() {
  document.querySelectorAll('#lb-seg button').forEach(b => {
    b.classList.toggle('on', b.dataset.lb === lbTab);
    b.onclick = () => { audio.sfx('click'); lbTab = b.dataset.lb; renderLeaderboard(); };
  });
  $('lb-note').textContent = lbTab === 'global'
    ? '🌍 Signed-in founders only — confirmed live matches vs real players.'
    : '🏠 Practice season on this device (AI fights & call-outs).';
  if (lbTab === 'global') renderGlobalBoard();
  else renderLocalBoard();
}

function renderLocalBoard() {
  const list = $('lb-list');
  list.innerHTML = '';
  Save.leaderboard().forEach((r, i) => {
    const def = r.custom && Save.profile ? buildCustomFighter(Save.profile) : getFighter(r.fighter);
    list.appendChild(lbRow(i, def, r));
  });
}

async function renderGlobalBoard() {
  const list = $('lb-list');
  list.innerHTML = '<div class="hint center">Fetching the global ladder…</div>';
  let rows;
  try {
    rows = await fetchLeaderboard();
  } catch (e) {
    if (lbTab !== 'global') return;
    list.innerHTML = '<div class="hint center">Couldn\'t reach the global ladder — check your connection and try again.</div>';
    return;
  }
  if (lbTab !== 'global') return;                     // switched tabs mid-fetch
  if (!rows.length) {
    list.innerHTML = '<div class="hint center">Nobody on the global board yet. Sign in, win a 🔴 LIVE match, and claim the crown. 👑</div>';
    return;
  }
  list.innerHTML = '';
  const myId = currentUser()?.id;
  rows.forEach((r, i) => {
    const base = getFighter(r.base_id);
    // skin/hair come from the rival's photo-derived palette, so their board
    // avatar matches the person, not the stock base character.
    const def = { ...base, ...pickLook(r.look), c: {
      ...base.c,
      suit: r.c1 || base.c.suit, accent: r.c2 || base.c.accent,
      skin: r.skin || base.c.skin, hair: r.hair || base.c.hair,
    } };
    list.appendChild(lbRow(i, def, {
      name: r.handle, company: r.company || 'Stealth Startup', points: r.points,
      wins: r.wins, losses: r.losses, kos: r.kos, streak: r.streak,
      you: myId && r.id === myId,
    }));
  });
}

// ---------------------------------------------------------------- challenges

function tierFor(points) {
  return points >= 1500 ? 'mogul' : points >= 500 ? 'founder' : 'intern';
}

export function renderChallenges() {
  const list = $('rival-list');
  list.innerHTML = '';
  for (const r of Save.leaderboard().filter(r => !r.you)) {
    const row = document.createElement('div');
    row.className = 'rival';
    const c = document.createElement('canvas');
    c.width = c.height = 112;
    drawPortrait(c, getFighter(r.fighter));
    row.appendChild(c);
    row.insertAdjacentHTML('beforeend', `
      <div class="rival-info">
        <div class="rival-name">${esc(r.name)}</div>
        <div class="rival-sub">${esc(r.company)} · ${AI_LEVELS[tierFor(r.points)].label} AI</div>
      </div>
      <div class="rival-pts">${r.points | 0}<span>PTS</span></div>`);
    const btn = document.createElement('button');
    btn.className = 'btn btn-sm btn-primary';
    btn.textContent = 'FIGHT';
    btn.onclick = () => {
      audio.sfx('select');
      const base = getFighter(r.fighter);
      sel.ghost = {
        def: { ...base, name: r.name, company: r.company, title: 'RIVAL' },
        difficulty: tierFor(r.points),
        isChallenge: false,
      };
      openSelect('solo');
    };
    row.appendChild(btn);
    list.appendChild(row);
  }
}

// ---------------------------------------------------------------- help

export function renderHelp() {
  const keys = (rows) => rows.map(([label, k]) =>
    `<div class="keyrow"><span class="klabel">${label}</span>${
      k.split(' / ').map(x => `<span class="kbd">${x}</span>`).join('')
    }</div>`).join('');
  $('keys-solo').innerHTML = keys(KEY_LABELS.solo);

  const list = $('ability-list');
  list.innerHTML = '';
  for (const f of FIGHTERS) {
    const sp = SPECIALS[f.special];
    const row = document.createElement('div');
    row.className = 'ability';
    const c = document.createElement('canvas');
    c.width = c.height = 96;
    drawPortrait(c, f);
    row.appendChild(c);
    row.insertAdjacentHTML('beforeend', `
      <div>
        <div class="ab-name">${sp.icon} ${sp.name}</div>
        <div class="ab-owner">${f.name} · ${f.company}</div>
        <div class="ab-desc">${sp.desc}</div>
      </div>`);
    list.appendChild(row);
  }
  const universals = [
    ['⚖️', 'CEASE & DESIST — EVERYONE', '25 ENERGY', 'Hurl legal paperwork in a vicious arc. You have been served — and knocked down.'],
    ['💸', 'ACQUI-HIRE — EVERYONE', 'FREE · COOLDOWN', 'Raid their team at close range and siphon their energy into your meter. Blockable, parryable, extremely rude.'],
    ['🛡', 'PARRY — EVERYONE', 'TAP BLOCK LAST-INSTANT', 'A perfectly timed block turns the attack away: the attacker staggers, you gain energy. Grabs cannot be parried.'],
    ['💨', 'HUSTLE DASH — EVERYONE', 'FREE · SHORT COOLDOWN', 'A burst of pure grind. Closes gaps fast and cancels straight into attacks.'],
    ['🦄', `${UNICORN_META.name} — EVERYONE`, 'FULL METER SUPER', UNICORN_META.desc],
    ['💼', 'MYSTERY DROPS', 'RANDOM BRIEFCASES', 'Briefcases fall mid-round with hidden powers: secret funding, 10x engineers, legal shields, rockets… and the occasional toxic asset. Race your rival to them — or let them gamble.'],
  ];
  for (const [icon, name, owner, desc] of universals) {
    const row = document.createElement('div');
    row.className = 'ability';
    row.innerHTML = `
      <div style="font-size:34px;width:44px;text-align:center">${icon}</div>
      <div>
        <div class="ab-name">${name}</div>
        <div class="ab-owner">${owner}</div>
        <div class="ab-desc">${desc}</div>
      </div>`;
    list.appendChild(row);
  }
}

// ---------------------------------------------------------------- modals

export function openModal(id) {
  $('modal-root').classList.remove('hidden');
  document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
  $(id).classList.remove('hidden');
}

export function closeModals() {
  $('modal-root').classList.add('hidden');
  document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
}

export function isModalOpen(id) {
  return !$(id).classList.contains('hidden') && !$('modal-root').classList.contains('hidden');
}

let confirmCb = null;
function openConfirm(title, text, cb) {
  $('confirmTitle').textContent = title;
  $('confirmText').textContent = text;
  confirmCb = cb;
  openModal('modal-confirm');
}
export const confirmDialog = openConfirm;

export function openInvite() {
  const link = buildChallengeLink();
  $('inviteLink').value = link;
  $('btn-nativeshare').style.display = navigator.share ? '' : 'none';
  openModal('modal-invite');
  audio.sfx('select');
}

// Opens the story. The CTA is derived from state every time — it used to be
// set once on first launch, so returning players saw a stale "BUILD YOUR
// FOUNDER" button long after they'd built one.
export function showAbout() {
  $('btn-about-fight').textContent = Save.profile ? '⚡ ENTER THE ARENA' : '⚡ BUILD YOUR FOUNDER';
  A.showScreen('scr-about');
}

// The recipient's own fighter for the right side of a challenge card.
// This must be YOUR founder, not whoever you last picked to play as —
// a challenge card is an identity card, so it always shows your face.
function myFighterDef() {
  return myFounderDef();
}
function myFighterName() {
  return Save.profile ? (Save.profile.name || 'YOU').toUpperCase() : 'YOU';
}

export async function showIncomingLive(hostName, onJoin) {
  const you = myFighterDef();
  await ensurePhoto(you.photo);
  renderChallengeCard($('challengeCard'),
    { def: null, name: String(hostName || 'A FOUNDER').toUpperCase(), sub: '🔴 LIVE ROOM · WAITING' },
    { def: you, name: myFighterName(), sub: 'FIGHT LIVE' });
  $('btn-accept').textContent = '🔴 JOIN LIVE ROOM';
  $('btn-accept').onclick = () => {
    audio.sfx('fight');
    closeModals();
    $('btn-accept').textContent = '🥊 ACCEPT CHALLENGE';
    onJoin();
  };
  openModal('modal-incoming');
}

export function setLiveStatus(kind, text) {
  const dot = $('liveDot');
  dot.classList.toggle('ok', kind === 'ok');
  $('liveStatusText').textContent = text;
}

export async function showIncomingChallenge(ghostDef, ch, onAccept) {
  const you = myFighterDef();
  await Promise.all([ensurePhoto(ghostDef.photo), ensurePhoto(you.photo)]);   // photos ready before the one-shot render
  renderChallengeCard($('challengeCard'),
    { def: ghostDef, name: ghostDef.name, sub: `${ghostDef.company} · ${ch.pts | 0} PTS · ${rankFor(ch.pts)}` },
    { def: you, name: myFighterName(), sub: 'DEFEND YOUR HONOR' });
  $('btn-accept').textContent = '🥊 ACCEPT CHALLENGE';
  $('btn-accept').onclick = () => { audio.sfx('fight'); closeModals(); onAccept(); };
  openModal('modal-incoming');
}

export function showShareCard(cardData) {
  renderResultCard($('shareCanvas'), cardData);
  openModal('modal-card');
  audio.sfx('select');
}

async function copyText(text, input) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    if (input) {
      input.focus(); input.select();
      try { return document.execCommand('copy'); } catch (e2) { return false; }
    }
    return false;
  }
}

// ---------------------------------------------------------------- sound

export function syncSoundUI() {
  const s = Save.settings;
  const muted = !s.sfx && !s.music;
  $('btn-sound').textContent = muted ? '🔇' : '🔊';
  $('setVol').value = s.volume;
  $('pauseVol').value = s.volume;
  $('setMusic').textContent = `MUSIC: ${s.music ? 'ON' : 'OFF'}`;
  $('pauseMusic').textContent = `MUSIC: ${s.music ? 'ON' : 'OFF'}`;
  $('setSfx').textContent = `SFX: ${s.sfx ? 'ON' : 'OFF'}`;
  $('pauseSfx').textContent = `SFX: ${s.sfx ? 'ON' : 'OFF'}`;
  audio.applySettings();
}

function wireSound() {
  const setVol = (v) => { Save.setSetting('volume', +v); syncSoundUI(); };
  $('setVol').oninput = (e) => setVol(e.target.value);
  $('pauseVol').oninput = (e) => setVol(e.target.value);
  const flip = (key) => { Save.setSetting(key, !Save.settings[key]); syncSoundUI(); audio.sfx('click'); };
  $('setMusic').onclick = () => flip('music');
  $('pauseMusic').onclick = () => flip('music');
  $('setSfx').onclick = () => flip('sfx');
  $('pauseSfx').onclick = () => flip('sfx');
  $('btn-sound').onclick = () => {
    const anyOn = Save.settings.sfx || Save.settings.music;
    Save.setSetting('sfx', !anyOn);
    Save.setSetting('music', !anyOn);
    syncSoundUI();
    audio.sfx('click');
  };
  $('btn-settings').onclick = () => { audio.sfx('click'); openModal('modal-settings'); };
}

// ---------------------------------------------------------------- misc

let toastTimer = null;
export function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 2400);
}

export function updateTitleChip() {
  const p = Save.profile;
  const chip = $('title-profile-chip');
  if (p) {
    chip.classList.remove('hidden');
    $('chipName').textContent = p.name || 'FOUNDER';
    $('chipRank').textContent = `${Save.stats.points} PTS · ${rankFor(Save.stats.points)}`;
    drawPortrait($('chipFace'), buildCustomFighter(p));
    $('btn-profile').textContent = '👤 MY PROFILE';
  } else {
    chip.classList.add('hidden');
    $('btn-profile').textContent = '👤 CREATE PROFILE';
  }
}

// ---------------------------------------------------------------- init

export function initScreens(actions) {
  A = actions;

  // title nav
  $('btn-quick').onclick = () => { audio.sfx('fight'); A.quickFight(); };
  $('btn-arcade').onclick = () => { audio.sfx('select'); sel.ghost = null; openSelect('solo'); };
  $('btn-challenges').onclick = () => { audio.sfx('select'); renderChallenges(); A.showScreen('scr-challenge'); };
  $('btn-leaderboard').onclick = () => { audio.sfx('select'); renderLeaderboard(); A.showScreen('scr-leaderboard'); };
  $('btn-profile').onclick = () => { audio.sfx('select'); renderProfile(); A.showScreen('scr-profile'); };
  $('btn-help').onclick = () => { audio.sfx('select'); renderHelp(); A.showScreen('scr-help'); };
  $('btn-about').onclick = () => { audio.sfx('select'); showAbout(); };
  $('btn-about-fight').onclick = () => {
    audio.sfx('fight');
    // Straight from the story into building your founder if you haven't yet.
    if (!Save.profile) { renderProfile(); A.showScreen('scr-profile'); return; }
    A.quickFight();
  };
  $('title-profile-chip').onclick = () => { audio.sfx('select'); renderProfile(); A.showScreen('scr-profile'); };

  // back buttons
  document.querySelectorAll('[data-back]').forEach(b => {
    b.onclick = () => { audio.sfx('back'); sel.ghost = null; A.showScreen('scr-title'); };
  });

  // select
  $('btn-fight').onclick = onFight;

  // challenge invite
  $('btn-ch-invite').onclick = () => openInvite();

  // live rooms
  $('btn-live-create').onclick = () => { audio.sfx('select'); A.createLiveRoom(); };
  $('btn-live-copy').onclick = async () => {
    const ok = await copyText($('liveLink').value, $('liveLink'));
    toast(ok ? '🔗 Live link copied — send it now!' : 'Link selected — press Ctrl/Cmd+C to copy.');
    audio.sfx('click');
  };
  $('btn-live-share').onclick = () => {
    navigator.share?.({
      title: 'UEC — fight me LIVE',
      text: 'I\'m in the arena right now. Join my live room and fight me. 🥊',
      url: $('liveLink').value,
    }).catch(() => {});
  };
  $('btn-live-cancel').onclick = () => { audio.sfx('back'); closeModals(); A.cancelLiveRoom(); };

  // profile + face crop
  wireProfile();
  wireCrop();

  // sound + settings
  wireSound();
  syncSoundUI();

  // modal chrome
  document.querySelectorAll('[data-close]').forEach(b => {
    b.onclick = () => { audio.sfx('back'); closeModals(); A.onModalClosed?.(); };
  });
  document.querySelector('.modal-backdrop').onclick = () => {
    // these require an explicit button choice
    if (isModalOpen('modal-pause') || isModalOpen('modal-live')) return;
    closeModals();
    A.onModalClosed?.();
  };
  $('btn-confirm-yes').onclick = () => { const cb = confirmCb; confirmCb = null; closeModals(); cb?.(); };

  // invite modal
  $('btn-copylink').onclick = async () => {
    const ok = await copyText($('inviteLink').value, $('inviteLink'));
    toast(ok ? '🔗 Link copied — go start a rivalry.' : 'Link selected — press Ctrl/Cmd+C to copy.');
    audio.sfx('click');
  };
  $('btn-nativeshare').onclick = () => {
    navigator.share?.({
      title: 'UEC — Ultimate Entrepreneur Challenge',
      text: 'I challenge you to a founder fight. Winner takes the valuation. 🥊',
      url: $('inviteLink').value,
    }).catch(() => {});
  };

  // once an uploaded photo finishes decoding, refresh any portraits drawn without it
  setPhotoReadyCallback(() => {
    updateTitleChip();
    if (document.getElementById('scr-profile').classList.contains('active') && draft) {
      renderStyleGrid();
      renderAvatarPreview();
    }
  });

  updateTitleChip();
}
