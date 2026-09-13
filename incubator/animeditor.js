// The animation timeline editor.
//
// Attack tracks are keyed in PHASE SPACE — 0–1 wind-up, 1–2 hitbox out, 2–3
// recovery — so the timeline is banded by phase rather than ruled in seconds.
// That is the whole reason a single track reads correctly on a 4-frame slap and
// a 12-frame kick, and an editor ruled in seconds would hide it. Loops are a
// plain 0–1.
//
// Everything authored here is RENDER-ONLY. It cannot reach the simulation, it
// is never carried by a challenge link, and a track broken badly enough falls
// back to the stock one rather than to a T-pose — so the worst outcome of a bad
// edit is a character who animates like everybody else.

import { drawFighter } from '../src/engine/drawFighter.js';
import { Fighter } from '../src/engine/fighter.js';
import { ATTACKS } from '../src/config.js';
import { EASE, REST, samplePose } from '../src/engine/anim.js';
import { BASE_TRACKS, ATTACK_TRACK } from '../src/data/tracks.js';

const $ = (id) => document.getElementById(id);

// Which states can be authored, and how their timeline is ruled.
export const ANIM_STATES = [
  { id: 'idle',   label: 'IDLE (loop)',  loop: true },
  { id: 'punch',  label: 'PUNCH',        loop: false },
  { id: 'kick',   label: 'KICK',         loop: false },
  { id: 'slap',   label: 'SLAP',         loop: false },
  { id: 'launch', label: 'LAUNCH',       loop: false },
];

// Limb endpoints are dragged directly; everything else is a slider, because a
// hip has no handle you could sensibly grab in a side view.
const HANDLES = [
  { key: 'armF', label: 'FRONT HAND', col: '#29d9ff' },
  { key: 'armB', label: 'BACK HAND',  col: '#7fb2c8' },
  { key: 'legF', label: 'FRONT FOOT', col: '#29d9ff' },
  { key: 'legB', label: 'BACK FOOT',  col: '#7fb2c8' },
];
const SCALARS = [
  ['hipY', -140, -20], ['shoulderY', -190, -60], ['headX', -30, 30], ['headY', -220, -80],
  ['bodyLean', -0.6, 0.6], ['sx', 0.8, 1.25], ['sy', 0.8, 1.25], ['rot', -1.6, 1.6],
];

const SCALE = 1.05;             // canvas px per pose unit
const ORIGIN_X = 0.42;          // where the feet sit across the canvas
const FOOT_PAD = 26;

let draft = null;               // the character being authored
let onChange = () => {};
let stateId = 'punch';
let track = null;               // the array being edited (live reference)
let selected = 0;               // index of the selected key
let scrubT = 0;
let playing = false;
let onion = true;
let raf = 0;
let dragging = null;

// ---------------------------------------------------------------- helpers

const isLoop = () => !!ANIM_STATES.find(s => s.id === stateId)?.loop;
const domainMax = () => (isLoop() ? 1 : 3);
const clone = (v) => JSON.parse(JSON.stringify(v));

// A track may be a bare array of keys or a { base, keys } pair — the stock
// idle declares a base so it contributes only breathing (see tracks.js). The
// editor works in keys, so unwrap. Missing this made every state that falls
// back to the idle track — idle itself, and anything with no track of its own,
// like walk — throw the moment the editor tried to sort it.
function keysOf(t) {
  return Array.isArray(t) ? t : ((t && t.keys) || []);
}

function baseTrack() {
  return keysOf(BASE_TRACKS[ATTACK_TRACK[stateId] || stateId] || BASE_TRACKS.idle);
}

// Editing starts from the stock track rather than from nothing: an author
// refining a punch wants the punch in front of them, not an empty timeline.
function ensureTrack() {
  draft.animOverrides = draft.animOverrides || {};
  // Reloading a character authored earlier hands us the { base, keys } form;
  // flatten it back to keys so the timeline can edit it. The base is re-stamped
  // on export from the rig in front of the author.
  const existing = keysOf(draft.animOverrides[stateId]);
  if (!existing.length) draft.animOverrides[stateId] = clone(baseTrack());
  else draft.animOverrides[stateId] = existing;
  track = draft.animOverrides[stateId];
  track.sort((a, b) => a.t - b.t);
  selected = Math.min(selected, track.length - 1);
  scrubT = track[selected].t;
}

// A fighter posed by the track under edit, so the canvas shows the real rig.
function posed(t) {
  const f = new Fighter(draft, 0, { update() {} });
  f.facing = 1; f.x = 0; f.y = 0;
  f.state = isLoop() ? 'idle' : 'attack';
  if (!isLoop()) {
    const base = ATTACKS[stateId] || ATTACKS.punch;
    f.attack = { ...base, kind: stateId, button: stateId, cmd: null, hasHit: false };
    f.stateT = t < 1 ? t * base.startup
             : t < 2 ? base.startup + (t - 1) * base.active
             : base.startup + base.active + Math.min(1, t - 2) * base.recovery;
  }
  return f;
}

// The pose the CURRENT track produces at t — not what the game would show, but
// what this edit will make the game show.
function poseAt(t) {
  return samplePose(track, t) || samplePose(baseTrack(), t);
}

// ---------------------------------------------------------------- drawing

function toScreen(cv, x, y) {
  return [cv.width * ORIGIN_X + x * SCALE, cv.height - FOOT_PAD + y * SCALE];
}
function toPose(cv, sx, sy) {
  return [(sx - cv.width * ORIGIN_X) / SCALE, (sy - (cv.height - FOOT_PAD)) / SCALE];
}

function drawStage() {
  const cv = $('animCanvas');
  const g = cv.getContext('2d');
  g.clearRect(0, 0, cv.width, cv.height);

  // floor line, so vertical edits have something to sit on
  g.strokeStyle = '#2b3348'; g.lineWidth = 1;
  g.beginPath();
  g.moveTo(0, cv.height - FOOT_PAD); g.lineTo(cv.width, cv.height - FOOT_PAD); g.stroke();

  const paint = (t, alpha) => {
    g.save();
    g.globalAlpha = alpha;
    g.translate(cv.width * ORIGIN_X, cv.height - FOOT_PAD);
    g.scale(SCALE, SCALE);
    try { drawFighter(g, posed(t), 0.4); } catch (e) { /* mid-edit */ }
    g.restore();
  };

  // onion skin: the keys either side, so an author can see what they are
  // easing FROM and TO instead of guessing between scrubs
  if (onion && !playing) {
    if (track[selected - 1]) paint(track[selected - 1].t, 0.16);
    if (track[selected + 1]) paint(track[selected + 1].t, 0.16);
  }
  paint(scrubT, 1);

  if (playing) return;                       // handles would strobe during playback

  // drag handles at the live limb endpoints
  const p = poseAt(scrubT);
  for (const h of HANDLES) {
    const [sx, sy] = toScreen(cv, p[h.key].x, p[h.key].y);
    g.beginPath(); g.arc(sx, sy, 9, 0, 7);
    g.fillStyle = 'rgba(10,14,26,.75)'; g.fill();
    g.lineWidth = 2; g.strokeStyle = h.col; g.stroke();
    g.beginPath(); g.arc(sx, sy, 2.5, 0, 7); g.fillStyle = h.col; g.fill();
  }
}

function drawTimeline() {
  const cv = $('tlCanvas');
  const g = cv.getContext('2d');
  const W = cv.width, H = cv.height, max = domainMax();
  const x = (t) => 14 + (t / max) * (W - 28);
  g.clearRect(0, 0, W, H);

  if (!isLoop()) {
    // phase bands — the same colours the filmstrip uses, so the two agree
    const bands = [[0, 1, 'rgba(143,216,255,.14)', 'WIND-UP'],
                   [1, 2, 'rgba(255,61,110,.16)', 'HITBOX OUT'],
                   [2, 3, 'rgba(255,210,63,.13)', 'RECOVERY']];
    for (const [a, b, col, label] of bands) {
      g.fillStyle = col;
      g.fillRect(x(a), 8, x(b) - x(a), H - 30);
      g.fillStyle = '#8b93ad';
      g.font = '700 9px ui-monospace, monospace';
      g.fillText(label, x(a) + 6, H - 8);
    }
    g.strokeStyle = 'rgba(255,255,255,.28)';
    for (const t of [1, 2]) {
      g.beginPath(); g.moveTo(x(t), 8); g.lineTo(x(t), H - 22); g.stroke();
    }
  } else {
    g.fillStyle = 'rgba(87,255,138,.10)';
    g.fillRect(x(0), 8, x(1) - x(0), H - 30);
    g.fillStyle = '#8b93ad'; g.font = '700 9px ui-monospace, monospace';
    g.fillText('LOOP — first and last key should match', x(0) + 6, H - 8);
  }

  // scrub head
  g.strokeStyle = '#eef1ff'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(x(scrubT), 4); g.lineTo(x(scrubT), H - 20); g.stroke();

  // keys
  track.forEach((k, i) => {
    const kx = x(k.t), ky = 30;
    g.beginPath();
    g.moveTo(kx, ky - 8); g.lineTo(kx + 8, ky); g.lineTo(kx, ky + 8); g.lineTo(kx - 8, ky);
    g.closePath();
    g.fillStyle = i === selected ? '#29d9ff' : k.hold ? '#ffd23f' : '#8b93ad';
    g.fill();
    if (k.smear) {
      g.strokeStyle = '#ff3d6e'; g.lineWidth = 2;
      g.beginPath(); g.arc(kx, ky, 12, 0, 7); g.stroke();
    }
  });
}

function redraw() { drawStage(); drawTimeline(); }

// ---------------------------------------------------------------- inspector

function buildEase() {
  const sel = $('keyEase');
  sel.textContent = '';
  for (const name of ['', ...Object.keys(EASE)]) {
    const o = document.createElement('option');
    o.value = name; o.textContent = name || '(linear)';
    sel.appendChild(o);
  }
}

function syncInspector() {
  const k = track[selected];
  if (!k) return;
  $('keyT').value = k.t.toFixed(2);
  $('keyT').max = String(domainMax());
  $('keyEase').value = k.ease || '';
  $('keyHold').checked = !!k.hold;
  $('keySmear').checked = !!k.smear;
  $('keyDel').disabled = track.length <= 2;

  const host = $('keyJoints');
  host.textContent = '';
  const pose = poseAt(k.t);
  for (const [name, lo, hi] of SCALARS) {
    const row = document.createElement('div');
    // authored on this key vs inherited from a neighbour — worth seeing
    const authored = k.joints && typeof k.joints[name] === 'number';
    row.className = 'slider' + (authored ? ' set' : '');
    const label = document.createElement('span');
    label.textContent = name;
    const rng = document.createElement('input');
    rng.type = 'range'; rng.min = String(lo); rng.max = String(hi);
    rng.step = String((hi - lo) / 200);
    rng.value = String(authored ? k.joints[name] : (pose[name] ?? REST[name] ?? 0));
    const val = document.createElement('span');
    val.className = 'val';
    val.textContent = Number(rng.value).toFixed(2);
    rng.oninput = () => {
      k.joints = k.joints || {};
      k.joints[name] = Number(rng.value);
      val.textContent = Number(rng.value).toFixed(2);
      row.classList.add('set');
      scrubT = k.t;
      redraw(); onChange();
    };
    row.append(label, rng, val);
    host.appendChild(row);
  }
}

// ---------------------------------------------------------------- events

function selectKey(i) {
  selected = Math.max(0, Math.min(track.length - 1, i));
  scrubT = track[selected].t;
  syncInspector(); redraw();
}

function wireStage() {
  const cv = $('animCanvas');
  const nearestHandle = (mx, my) => {
    const p = poseAt(scrubT);
    let best = null, bestD = 18;
    for (const h of HANDLES) {
      const [sx, sy] = toScreen(cv, p[h.key].x, p[h.key].y);
      const d = Math.hypot(sx - mx, sy - my);
      if (d < bestD) { bestD = d; best = h.key; }
    }
    return best;
  };
  const local = (e) => {
    const r = cv.getBoundingClientRect();
    return [(e.clientX - r.left) * (cv.width / r.width), (e.clientY - r.top) * (cv.height / r.height)];
  };
  cv.addEventListener('pointerdown', (e) => {
    const [mx, my] = local(e);
    const hit = nearestHandle(mx, my);
    if (!hit) return;
    // Dragging always writes to the SELECTED key, and scrubbing snaps to it, so
    // there is never a drag that silently edits a pose you cannot see.
    dragging = hit;
    scrubT = track[selected].t;
    cv.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  cv.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const [mx, my] = local(e);
    const [px, py] = toPose(cv, mx, my);
    const k = track[selected];
    k.joints = k.joints || {};
    k.joints[dragging] = { x: Math.round(px), y: Math.round(py) };
    redraw(); onChange();
  });
  const end = () => { if (dragging) { dragging = null; syncInspector(); } };
  cv.addEventListener('pointerup', end);
  cv.addEventListener('pointercancel', end);
}

function wireTimeline() {
  const cv = $('tlCanvas');
  const at = (e) => {
    const r = cv.getBoundingClientRect();
    const px = (e.clientX - r.left) * (cv.width / r.width);
    return Math.max(0, Math.min(domainMax(), ((px - 14) / (cv.width - 28)) * domainMax()));
  };
  cv.addEventListener('pointerdown', (e) => {
    const t = at(e);
    // clicking near a key selects it; clicking empty space just scrubs
    let near = -1, best = domainMax() * 0.02;
    track.forEach((k, i) => { const d = Math.abs(k.t - t); if (d < best) { best = d; near = i; } });
    if (near >= 0) selectKey(near);
    else { scrubT = t; playing = false; redraw(); }
  });
}

// ---------------------------------------------------------------- playback

function tick() {
  if (!playing) return;
  const max = domainMax();
  scrubT += 0.016 * (isLoop() ? 0.9 : 1.6);
  if (scrubT > max) scrubT = 0;
  redraw();
  raf = requestAnimationFrame(tick);
}

// ---------------------------------------------------------------- public

export function initAnimEditor(theDraft, changed) {
  draft = theDraft;
  onChange = changed;

  const sel = $('animState');
  sel.textContent = '';
  for (const s of ANIM_STATES) {
    const o = document.createElement('option');
    o.value = s.id; o.textContent = s.label;
    sel.appendChild(o);
  }
  sel.value = stateId;
  sel.onchange = () => { stateId = sel.value; refreshSummary(); };

  buildEase();
  wireStage();
  wireTimeline();

  $('btnAnim').onclick = () => {
    ensureTrack();          // seeds the override, so the summary changes on open
    selected = 0;
    $('animTitle').textContent = ANIM_STATES.find(s => s.id === stateId).label;
    $('animBack').classList.remove('hidden');
    syncInspector(); redraw(); refreshSummary(); onChange();
  };
  $('animClose').onclick = () => {
    playing = false; cancelAnimationFrame(raf);
    $('animBack').classList.add('hidden');
    refreshSummary(); onChange();
  };
  $('animPlay').onclick = () => {
    playing = !playing;
    $('animPlay').textContent = playing ? '❚❚ PAUSE' : '▶ PLAY';
    cancelAnimationFrame(raf);
    if (playing) raf = requestAnimationFrame(tick); else { selectKey(selected); }
  };
  $('animOnion').onclick = () => {
    onion = !onion;
    $('animOnion').textContent = 'ONION: ' + (onion ? 'ON' : 'OFF');
    redraw();
  };
  $('animReset').onclick = () => {
    // back to the stock track — the escape hatch when an edit has gone wrong
    draft.animOverrides[stateId] = clone(baseTrack());
    track = draft.animOverrides[stateId];
    selectKey(0); onChange(); refreshSummary();
  };

  $('keyT').oninput = () => {
    const k = track[selected];
    k.t = Math.max(0, Math.min(domainMax(), Number($('keyT').value) || 0));
    // keys must stay ordered or sampling walks them wrong
    track.sort((a, b) => a.t - b.t);
    selected = track.indexOf(k);
    scrubT = k.t;
    redraw(); onChange();
  };
  $('keyEase').onchange = () => {
    const v = $('keyEase').value;
    if (v) track[selected].ease = v; else delete track[selected].ease;
    redraw(); onChange();
  };
  $('keyHold').onchange = () => {
    if ($('keyHold').checked) track[selected].hold = true; else delete track[selected].hold;
    redraw(); onChange();
  };
  $('keySmear').onchange = () => {
    if ($('keySmear').checked) track[selected].smear = true; else delete track[selected].smear;
    redraw(); onChange();
  };

  $('keyAdd').onclick = () => {
    // a new key starts at the pose already showing, so adding one never moves
    // the character — it only gives you somewhere to edit from
    const p = poseAt(scrubT);
    const joints = {};
    for (const h of HANDLES) joints[h.key] = { x: Math.round(p[h.key].x), y: Math.round(p[h.key].y) };
    for (const [name] of SCALARS) joints[name] = +Number(p[name] ?? REST[name] ?? 0).toFixed(3);
    track.push({ t: +scrubT.toFixed(3), joints });
    track.sort((a, b) => a.t - b.t);
    selectKey(track.findIndex(k => Math.abs(k.t - scrubT) < 1e-6));
    onChange();
  };
  $('keyDup').onclick = () => {
    const k = clone(track[selected]);
    k.t = Math.min(domainMax(), k.t + domainMax() * 0.06);
    track.push(k);
    track.sort((a, b) => a.t - b.t);
    selectKey(track.indexOf(k));
    onChange();
  };
  $('keyMirror').onclick = () => {
    // Side-view mirroring swaps the near and far limbs. It is how you get a
    // left jab out of a right one without re-posing anything.
    const k = track[selected];
    k.joints = k.joints || {};
    const swap = (a, b) => {
      const A = k.joints[a], B = k.joints[b];
      if (A) k.joints[b] = A; else delete k.joints[b];
      if (B) k.joints[a] = B; else delete k.joints[a];
    };
    swap('armF', 'armB');
    swap('legF', 'legB');
    if (typeof k.joints.bodyLean === 'number') k.joints.bodyLean *= -1;
    syncInspector(); redraw(); onChange();
  };
  $('keyDel').onclick = () => {
    if (track.length <= 2) return;             // a track needs two keys to interpolate
    track.splice(selected, 1);
    selectKey(Math.max(0, selected - 1));
    onChange();
  };

  refreshSummary();
}

// Which states this character has taken over, shown on the main page so an
// author can see at a glance what is theirs and what is stock.
export function refreshSummary() {
  const over = draft.animOverrides || {};
  const mine = ANIM_STATES.filter(s => Array.isArray(over[s.id]) && over[s.id].length);
  $('animSummary').textContent = mine.length
    ? `authored: ${mine.map(s => s.id).join(', ')} — the rest use the stock tracks`
    : 'all states use the stock tracks';
}
