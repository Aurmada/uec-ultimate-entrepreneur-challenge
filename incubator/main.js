// THE INCUBATOR — character authoring for UEC.
//
// This is an admin surface. It is not linked from the game's navigation and it
// holds no secrets, but the repo is a published static site, so treat it as
// UNLISTED rather than private: anyone who guesses the URL can open it. It
// writes only through the local dev server's PUT, which does not exist in
// production, so the worst a stranger can do is author a character they cannot
// save anywhere.
//
// The draft IS a roster entry. Everything here edits the same object shape the
// shipped roster uses, validates it through the same validator the netcode and
// the challenge-link decoder use, and previews it through the real renderer.
// There is deliberately no second implementation of anything — a preview that
// could disagree with the game would be worse than no preview.

import {
  FIGHTERS, SPECIALS, LOOKS, LOOK_FIELDS, toCharacter, shade,
} from '../src/data/fighters.js';
import { STYLES, BODY, BUDGET, ATTACKS, AI_LEVELS } from '../src/config.js';
import {
  validateCharacter, budgetCost, commandCost, ARCHETYPES, COMMAND_SLOTS,
  slotButton, SLOT_GLYPH, MOVE_TAGS, DEFAULT_BODY,
} from '../src/data/schema.js';
import { drawFighter } from '../src/engine/drawFighter.js';
import { initAnimEditor, refreshSummary } from './animeditor.js';
import { Fighter } from '../src/engine/fighter.js';
import { REST } from '../src/engine/anim.js';

// A plain snapshot of the rig an authored track was posed against, taken at
// export time. Not a reference to REST — that object moves when the stance is
// retuned, and the whole point of stamping the base is that it must not.
const REST_SNAPSHOT = {
  hipY: REST.hipY, shoulderY: REST.shoulderY, headX: REST.headX, headY: REST.headY,
  rot: REST.rot, crouch: REST.crouch, bodyLean: REST.bodyLean, sx: REST.sx, sy: REST.sy,
  armF: { ...REST.armF }, armB: { ...REST.armB },
  legF: { ...REST.legF }, legB: { ...REST.legB },
};

const $ = (id) => document.getElementById(id);
const DRAFT_KEY = 'uec-incubator-draft-v1';

// ---------------------------------------------------------------- the draft

const BODY_KEYS = Object.keys(DEFAULT_BODY);
// Only these three are priced by the budget; the rest are free silhouette.
const PRICED = new Set(['height', 'build', 'reach']);
const FRAME_KEYS = ['startup', 'active', 'recovery', 'dmg', 'reach', 'kbUp'];

function blankDraft() {
  return {
    id: 'new-founder',
    name: 'NEW FOUNDER', title: 'THE UNKNOWN', company: 'STEALTH CO',
    tagline: 'Raised on a napkin. Spent it on a jet.',
    rap: 'No convictions — yet',
    special: 'pitchdeck', style: 'balanced',
    body: { ...DEFAULT_BODY },
    commandNormals: [],
    // No editor UI writes to this yet — there is no "add a prop" button. Parts
    // are hand-written directly into the draft object (console, or by loading
    // a roster fighter's def wholesale into window.INCUBATOR.draft) and then
    // previewed live here. That is the deliberate authoring model for this
    // vocabulary: hand-write the data, watch it render through the real
    // drawFighter and validateCharacter, build a dedicated editor later once
    // the vocabulary settles. Declaring the field here (rather than leaving it
    // undefined) is what lets a hand-authored draft round-trip through the
    // localStorage autosave without disappearing.
    parts: [],
    ai: { aggr: 0.6, jump: 0.35, prefRange: 'mid' },
    c: {
      skin: '#e8b48c', suit: '#3d5afe', suit2: '#2438b8', accent: '#29d9ff',
      hair: '#2b2b33', pants: '#232a45', shoe: '#eef1ff',
    },
    hairStyle: 'neat', outfit: 'blazer', headwear: 'none',
    eyewear: 'none', facialHair: 'none',
  };
}

let draft = load() || blankDraft();

function load() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    // Merge over a blank so a draft saved before a field existed still opens.
    const d = JSON.parse(raw);
    return { ...blankDraft(), ...d, body: { ...DEFAULT_BODY, ...(d.body || {}) }, c: { ...blankDraft().c, ...(d.c || {}) } };
  } catch (e) {
    return null;
  }
}

// Autosave on every change: a refresh must never cost work.
function save() {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch (e) { /* private mode */ }
}

// One entry point for "something changed" — everything re-derives from the
// draft, so there is no path where the preview and the numbers disagree.
function changed() {
  save();
  try { refreshSummary(); } catch (e) { /* editor not booted yet */ }
  renderBudget();
  renderReport();
  renderPreview();
  renderSilhouette();
}

// ---------------------------------------------------------------- identity

const TEXT_FIELDS = [['fName', 'name'], ['fTitle', 'title'], ['fCompany', 'company'],
  ['fTagline', 'tagline'], ['fRap', 'rap']];

for (const [el, key] of TEXT_FIELDS) {
  $(el).value = draft[key] || '';
  $(el).oninput = () => { draft[key] = $(el).value; changed(); };
}
$('fId').value = draft.id;
$('fId').oninput = () => {
  // ids are a wire format (challenge links, roster keys), so normalise as typed
  draft.id = $('fId').value.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 24);
  if ($('fId').value !== draft.id) $('fId').value = draft.id;
  changed();
};

// ---------------------------------------------------------------- look

function buildLookPickers() {
  const host = $('lookPickers');
  host.textContent = '';
  for (const field of LOOK_FIELDS) {
    const row = document.createElement('label');
    row.className = 'row';
    const label = document.createElement('span');
    label.textContent = field.replace(/([A-Z])/g, ' $1').toUpperCase();
    const sel = document.createElement('select');
    for (const opt of LOOKS[field]) {
      const o = document.createElement('option');
      o.value = opt.id; o.textContent = opt.name;
      sel.appendChild(o);
    }
    sel.value = draft[field] || LOOKS[field][0].id;
    sel.onchange = () => { draft[field] = sel.value; changed(); };
    row.append(label, sel);
    host.appendChild(row);
  }
}

const SWATCHES = [['skin', 'SKIN'], ['hair', 'HAIR'], ['suit', 'SUIT'],
  ['accent', 'ACCENT'], ['pants', 'PANTS'], ['shoe', 'SHOE']];

function buildSwatches() {
  const host = $('swatches');
  host.textContent = '';
  for (const [key, label] of SWATCHES) {
    const box = document.createElement('div');
    box.className = 'sw';
    const inp = document.createElement('input');
    inp.type = 'color';
    inp.value = draft.c[key] || '#888888';
    inp.oninput = () => {
      draft.c[key] = inp.value;
      // suit2 is the shaded companion of suit everywhere else in the game, so
      // it is derived rather than authored — two pickers that must agree is a
      // way to end up with a character whose back arm is the wrong colour.
      if (key === 'suit') draft.c.suit2 = shade(inp.value, -28);
      changed();
    };
    const cap = document.createElement('label');
    cap.textContent = label;
    box.append(inp, cap);
    host.appendChild(box);
  }
}

// ---------------------------------------------------------------- body

function buildBodySliders() {
  const host = $('bodySliders');
  host.textContent = '';
  for (const key of BODY_KEYS) {
    const [lo, hi] = BODY[key];
    const row = document.createElement('div');
    row.className = 'slider' + (PRICED.has(key) ? '' : ' free');
    const label = document.createElement('span');
    label.textContent = key.toUpperCase();
    label.title = PRICED.has(key) ? 'priced by the power budget' : 'free — costs no budget';
    const rng = document.createElement('input');
    rng.type = 'range';
    rng.min = String(lo); rng.max = String(hi); rng.step = '0.01';
    rng.value = String(draft.body[key] ?? 1);
    const val = document.createElement('span');
    val.className = 'val';
    val.textContent = Number(rng.value).toFixed(2);
    rng.oninput = () => {
      draft.body[key] = Number(rng.value);
      val.textContent = Number(rng.value).toFixed(2);
      changed();
    };
    row.append(label, rng, val);
    host.appendChild(row);
  }
}

// ---------------------------------------------------------------- style

function buildStyle() {
  const sel = $('fStyle');
  sel.textContent = '';
  for (const [id, st] of Object.entries(STYLES)) {
    const o = document.createElement('option');
    o.value = id; o.textContent = st.name;
    sel.appendChild(o);
  }
  sel.value = draft.style;
  sel.onchange = () => { draft.style = sel.value; changed(); styleBlurb(); };
  styleBlurb();
}
function styleBlurb() {
  const st = STYLES[draft.style] || STYLES.balanced;
  $('styleBlurb').textContent = `${st.blurb}  ·  dmg ${st.dmg} · speed ${st.speed} · reach ${st.reach} · hp ${st.hp}`;
}

// ---------------------------------------------------------- command normals

function freeSlots() {
  const used = new Set(draft.commandNormals.map(c => c.slot));
  return COMMAND_SLOTS.filter(s => !used.has(s));
}

function newCommand() {
  const slot = freeSlots()[0] || COMMAND_SLOTS[0];
  const base = ATTACKS[slotButton(slot)];
  return {
    slot, archetype: 'strike', displayName: 'NEW MOVE', tags: [],
    frameData: { ...base },
  };
}

function buildCommands() {
  const host = $('cmdList');
  host.textContent = '';
  draft.commandNormals.forEach((cn, i) => host.appendChild(commandCard(cn, i)));
  $('btnAddCmd').disabled = draft.commandNormals.length >= BUDGET.CMD.MAX_SLOTS;
  $('btnAddCmd').textContent = draft.commandNormals.length >= BUDGET.CMD.MAX_SLOTS
    ? `MAX ${BUDGET.CMD.MAX_SLOTS} MOVES` : '+ ADD MOVE';
}

function commandCard(cn, i) {
  const card = document.createElement('div');
  card.className = 'cmd';

  const head = document.createElement('div');
  head.className = 'cmd-head';
  const slotSel = document.createElement('select');
  for (const s of COMMAND_SLOTS) {
    const o = document.createElement('option');
    o.value = s; o.textContent = `${SLOT_GLYPH[s] || s}  ${s}`;
    slotSel.appendChild(o);
  }
  slotSel.value = cn.slot;
  slotSel.onchange = () => {
    cn.slot = slotSel.value;
    // frame data is measured against the basic on this button, so re-seed it
    cn.frameData = { ...ATTACKS[slotButton(cn.slot)] };
    rebuildCommands();
  };
  const archSel = document.createElement('select');
  for (const a of ARCHETYPES) {
    const o = document.createElement('option');
    o.value = a; o.textContent = a;
    archSel.appendChild(o);
  }
  archSel.value = cn.archetype;
  archSel.onchange = () => { cn.archetype = archSel.value; rebuildCommands(); };
  const del = document.createElement('button');
  del.className = 'del'; del.textContent = '✕'; del.title = 'remove';
  del.onclick = () => { draft.commandNormals.splice(i, 1); rebuildCommands(); };
  head.append(slotSel, archSel, del);

  const name = document.createElement('input');
  name.className = 'name'; name.maxLength = 24; name.value = cn.displayName;
  name.placeholder = 'MOVE NAME — shown on impact';
  name.oninput = () => { cn.displayName = name.value; changed(); };

  const fd = document.createElement('div');
  fd.className = 'fd';
  const base = ATTACKS[slotButton(cn.slot)] || ATTACKS.punch;
  for (const key of FRAME_KEYS) {
    const wrap = document.createElement('label');
    const cap = document.createElement('span');
    cap.textContent = key;
    const inp = document.createElement('input');
    inp.type = 'number';
    inp.step = key === 'dmg' || key === 'reach' || key === 'kbUp' ? '1' : '0.005';
    inp.value = String(cn.frameData[key] ?? base[key] ?? 0);
    inp.oninput = () => {
      const v = Number(inp.value);
      cn.frameData[key] = Number.isFinite(v) ? v : 0;
      // live clamp feedback — these are hard-rejected by the validator, so the
      // author should see it while typing rather than at export
      const clamp = BUDGET.CMD.CLAMP[key];
      const ratio = base[key] ? v / base[key] : 1;
      inp.classList.toggle('bad', !!clamp && (ratio < clamp[0] || ratio > clamp[1]));
      changed();
      renderCommandCost(cost, cn);
    };
    wrap.append(cap, inp);
    fd.appendChild(wrap);
  }

  const tagRow = document.createElement('div');
  tagRow.className = 'row';
  const tagLabel = document.createElement('span');
  tagLabel.textContent = 'VERB';
  const tagSel = document.createElement('select');
  for (const t of ['', ...MOVE_TAGS]) {
    const o = document.createElement('option');
    o.value = t; o.textContent = t || '(none)';
    tagSel.appendChild(o);
  }
  tagSel.value = (cn.tags && cn.tags[0]) || '';
  tagSel.title = 'drives how the AI chooses to use this move';
  tagSel.onchange = () => { cn.tags = tagSel.value ? [tagSel.value] : []; changed(); };
  tagRow.append(tagLabel, tagSel);

  const cost = document.createElement('div');
  cost.className = 'cmd-cost';
  renderCommandCost(cost, cn);

  card.append(head, name, fd, tagRow, cost);
  return card;
}

function renderCommandCost(el, cn) {
  const c = commandCost(cn);
  el.innerHTML = `costs <b>${c >= 0 ? '+' : ''}${c.toFixed(1)}</b> of budget`;
}

function rebuildCommands() { buildCommands(); changed(); }

$('btnAddCmd').onclick = () => {
  if (draft.commandNormals.length >= BUDGET.CMD.MAX_SLOTS) return;
  draft.commandNormals.push(newCommand());
  rebuildCommands();
};

// ---------------------------------------------------------------- budget

function renderBudget() {
  const ch = toCharacter(draft);
  const cost = budgetCost(ch.fighting, ch.body, ch.commandNormals);
  const band = Math.abs(cost) <= BUDGET.WARN ? 'clean'
             : Math.abs(cost) <= BUDGET.BLOCK ? 'warn' : 'block';
  $('budgetCost').textContent = (cost >= 0 ? '+' : '') + cost.toFixed(1);
  const bandEl = $('budgetBand');
  bandEl.textContent = band;
  bandEl.className = 'band ' + band;
  // needle maps ±30 across the bar, clamped so a wild draft still points the way
  const pct = Math.max(0, Math.min(100, 50 + (cost / 30) * 50));
  $('needle').style.left = `calc(${pct}% - 1.5px)`;
  $('btnExport').disabled = band === 'block';
}

function renderReport() {
  const r = validateCharacter(toCharacter(draft));
  const el = $('report');
  el.textContent = '';
  const line = (cls, text) => {
    const d = document.createElement('div');
    d.className = cls; d.textContent = text;
    el.appendChild(d);
  };
  if (r.errors.length) r.errors.forEach(e => line('err', '✕ ' + e));
  if (r.warnings.length) r.warnings.forEach(w => line('warn', '! ' + w));
  if (!r.errors.length && !r.warnings.length) line('ok', '✓ clean — ready to export');
  else if (!r.errors.length) line('ok', '✓ exports, with warnings');
}

// ---------------------------------------------------------------- preview

const POSES = [
  ['GUARD', { state: 'idle' }],
  ['WALK', { state: 'walk', walkPhase: 2.1 }],
  ['SLAP', { state: 'attack', kind: 'slap', phase: 1.1 }],
  ['PUNCH', { state: 'attack', kind: 'punch', phase: 1.1 }],
  ['KICK', { state: 'attack', kind: 'kick', phase: 1.1 }],
  ['LAUNCH', { state: 'attack', kind: 'launch', phase: 1.1 }],
  ['CROUCH', { state: 'crouch', crouching: true }],
  ['BLOCK', { state: 'block' }],
  ['HIT', { state: 'hitstun', stateT: 0.08 }],
  ['KO', { state: 'ko', stateT: 0.4 }],
  ['WIN', { state: 'victory', stateT: 0.6 }],
];
let shownPoses = ['GUARD', 'PUNCH', 'KICK'];

function buildPoseTabs() {
  const host = $('poseTabs');
  host.textContent = '';
  for (const [label] of POSES) {
    const b = document.createElement('button');
    b.textContent = label;
    b.className = shownPoses.includes(label) ? 'on' : '';
    b.onclick = () => {
      shownPoses = shownPoses.includes(label)
        ? shownPoses.filter(p => p !== label)
        : [...shownPoses, label];
      if (!shownPoses.length) shownPoses = [label];
      buildPoseTabs();
      renderPreview();
    };
    host.appendChild(b);
  }
}

// Builds a fighter the renderer will accept. Not a Game — computePose reads
// plain fields, so a real Fighter with its state poked is enough and keeps us
// honest about using the shipping code path.
function previewFighter(spec) {
  const f = new Fighter(draft, 0, { update() {} });
  f.facing = 1; f.x = 0; f.y = 0;
  f.state = spec.state;
  f.stateT = spec.stateT ?? 0;
  f.walkPhase = spec.walkPhase ?? 0;
  f.crouching = !!spec.crouching;
  if (spec.kind) {
    const b = ATTACKS[spec.kind];
    // a command normal on this button previews as itself, which is the point
    const cn = draft.commandNormals.find(c => slotButton(c.slot) === spec.kind);
    f.startAttack(cn || spec.kind, { audio: { sfx() {} } });
    const a = f.attack;
    const p = spec.phase ?? 1.1;
    f.stateT = p < 1 ? p * a.startup
             : p < 2 ? a.startup + (p - 1) * a.active
             : a.startup + a.active + (p - 2) * a.recovery;
  }
  return f;
}

function renderPreview() {
  const host = $('poses');
  host.textContent = '';
  for (const [label, spec] of POSES) {
    if (!shownPoses.includes(label)) continue;
    const cv = document.createElement('canvas');
    cv.width = 190; cv.height = 260;
    cv.title = label;
    const g = cv.getContext('2d');
    g.save();
    g.translate(cv.width * 0.42, cv.height - 18);
    g.scale(0.78, 0.78);
    try { drawFighter(g, previewFighter(spec), 0.4); } catch (e) { /* mid-edit draft */ }
    g.restore();
    g.fillStyle = '#8b93ad';
    g.font = '700 9px ui-monospace, monospace';
    g.fillText(label, 6, 13);
    host.appendChild(cv);
  }
}

function renderSilhouette() {
  const cv = $('silhouette');
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.clearRect(0, 0, cv.width, cv.height);
  g.save();
  g.translate(cv.width / 2, cv.height - 18);
  g.scale(0.86, 0.86);
  try { drawFighter(g, previewFighter({ state: 'idle' }), 0.4); } catch (e) { /* ignore */ }
  g.restore();
  const d = g.getImageData(0, 0, cv.width, cv.height);
  const px = d.data;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] > 24) { px[i] = 255; px[i + 1] = 210; px[i + 2] = 63; px[i + 3] = 255; }
    else px[i + 3] = 0;
  }
  g.putImageData(d, 0, 0);
}

// ---------------------------------------------------------------- surprise

const rnd = (arr) => arr[(Math.random() * arr.length) | 0];
const rndHex = () => '#' + Array.from({ length: 3 }, () =>
  Math.floor(40 + Math.random() * 200).toString(16).padStart(2, '0')).join('');

$('btnRandom').onclick = () => {
  for (const field of LOOK_FIELDS) draft[field] = rnd(LOOKS[field]).id;
  draft.style = rnd(Object.keys(STYLES));
  draft.special = rnd(Object.keys(SPECIALS));
  draft.c.suit = rndHex();
  draft.c.suit2 = shade(draft.c.suit, -28);
  draft.c.accent = rndHex();
  draft.c.pants = shade(draft.c.suit, -55);
  // Roll proportions inside their real bounds, then let the budget meter tell
  // the author what it cost. Rolling only "safe" bodies would hide the trade.
  for (const key of BODY_KEYS) {
    const [lo, hi] = BODY[key];
    draft.body[key] = +(lo + Math.random() * (hi - lo)).toFixed(2);
  }
  buildLookPickers(); buildSwatches(); buildBodySliders(); buildStyle();
  changed();
};

// ---------------------------------------------------------------- export

function toModule() {
  const clean = {
    id: draft.id, name: draft.name, title: draft.title, company: draft.company,
    tagline: draft.tagline, rap: draft.rap,
    special: draft.special, style: draft.style,
    body: draft.body,
    ai: draft.ai,
    c: draft.c,
    hairStyle: draft.hairStyle, outfit: draft.outfit,
    headwear: draft.headwear, eyewear: draft.eyewear, facialHair: draft.facialHair,
  };
  if (draft.commandNormals.length) clean.commandNormals = draft.commandNormals;
  if (draft.parts && draft.parts.length) clean.parts = draft.parts;
  // Render-only, but it belongs to the character, so it ships in the module.
  //
  // Each track is stamped with the rig it was posed against. The editor seeds
  // keys from the LIVE rest pose, while addDelta measures an undeclared track
  // against the frozen AUTHORED_REST — so without this stamp a character
  // authored today would render with a constant offset the moment the stance
  // moved again (22px at the hip, 48px at the head, last time). Declaring the
  // base is what lets the stance keep changing without rewriting the roster.
  if (draft.animOverrides && Object.keys(draft.animOverrides).length) {
    clean.animOverrides = {};
    for (const [state, t] of Object.entries(draft.animOverrides)) {
      const keys = Array.isArray(t) ? t : (t && t.keys) || [];
      if (keys.length) clean.animOverrides[state] = { base: { ...REST_SNAPSHOT }, keys };
    }
  }
  const body = JSON.stringify(clean, null, 2).replace(/^/gm, '  ');
  return `// Authored in THE INCUBATOR. Plain data — diff it, review it, commit it.
// Drop into FIGHTERS in src/data/fighters.js, or import and spread it there.
export const AUTHORED = [
${body},
];
`;
}

$('btnExport').onclick = () => {
  const r = validateCharacter(toCharacter(draft));
  const msg = $('exportMsg');
  msg.textContent = '';
  const line = (cls, text) => {
    const d = document.createElement('div'); d.className = cls; d.textContent = text; msg.appendChild(d);
  };
  if (!r.ok) {
    r.errors.forEach(e => line('err', '✕ ' + e));
    line('err', 'Export blocked. Fix the errors above.');
    $('exportOut').value = '';
    $('btnWrite').disabled = true;
  } else {
    r.warnings.forEach(w => line('warn', '! ' + w));
    line('ok', `✓ valid · budget ${r.cost.toFixed(1)} (${r.band})`);
    $('exportOut').value = toModule();
    $('btnWrite').disabled = false;
  }
  $('exportBack').classList.remove('hidden');
};
$('exportClose').onclick = () => $('exportBack').classList.add('hidden');
$('btnCopy').onclick = async () => {
  try { await navigator.clipboard.writeText($('exportOut').value); $('btnCopy').textContent = 'COPIED'; }
  catch (e) { $('exportOut').select(); }
  setTimeout(() => { $('btnCopy').textContent = 'COPY'; }, 1200);
};
$('btnWrite').onclick = async () => {
  // The dev server accepts PUT; a published copy of this page does not, so the
  // download is the honest fallback rather than a silent failure.
  try {
    const res = await fetch('/src/data/authored.js', { method: 'PUT', body: $('exportOut').value });
    if (!res.ok) throw new Error(String(res.status));
    $('btnWrite').textContent = 'WRITTEN ✓';
  } catch (e) {
    const url = URL.createObjectURL(new Blob([$('exportOut').value], { type: 'text/javascript' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'authored.js'; a.click();
    URL.revokeObjectURL(url);
    $('btnWrite').textContent = 'DOWNLOADED ✓';
  }
  setTimeout(() => { $('btnWrite').textContent = 'WRITE TO src/data/authored.js'; }, 1600);
};

// ---------------------------------------------------------------- spar
//
// A real Game with the real AI. Loaded on demand so the tool opens instantly
// and so an authoring session that never spars never touches the audio graph.

let spar = null;

$('btnSpar').onclick = async () => {
  const sel = $('sparRival');
  if (!sel.options.length) {
    for (const f of FIGHTERS) {
      const o = document.createElement('option');
      o.value = f.id; o.textContent = f.name;
      sel.appendChild(o);
    }
  }
  $('sparBack').classList.remove('hidden');
  await startSpar();
};
$('sparClose').onclick = () => { stopSpar(); $('sparBack').classList.add('hidden'); };
$('sparRival').onchange = () => startSpar();
$('sparLevel').onchange = () => startSpar();

async function startSpar() {
  stopSpar();
  const [{ Game }, { AIController }, { input, HumanController }, { renderGame }, { getArena }] =
    await Promise.all([
      import('../src/engine/game.js'),
      import('../src/engine/ai.js'),
      import('../src/engine/input.js'),
      import('../src/engine/render.js'),
      import('../src/data/arenas.js'),
    ]);
  const rivalDef = FIGHTERS.find(f => f.id === $('sparRival').value) || FIGHTERS[0];
  input.enabled = true;
  input.mode = 'solo';
  if (!input._wired) { input.init(); input._wired = true; }

  const game = new Game({
    p1: { def: draft, controller: new HumanController(0) },
    p2: { def: rivalDef, controller: new AIController($('sparLevel').value, rivalDef) },
    arena: getArena('boardroom'),
    mode: 'solo', difficulty: $('sparLevel').value,
    hud: new Proxy({}, { get: () => () => {} }),
    onEnd: () => {},
    seed: 1,
  });
  const ctx = $('sparCanvas').getContext('2d');
  let last = performance.now(), raf = 0;
  const loop = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    game.update(dt);
    renderGame(ctx, game);
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  spar = { stop: () => { cancelAnimationFrame(raf); input.enabled = false; } };
}

function stopSpar() { if (spar) { spar.stop(); spar = null; } }

// ---------------------------------------------------------------- boot

buildLookPickers();
buildSwatches();
buildBodySliders();
buildStyle();
buildCommands();
buildPoseTabs();
initAnimEditor(draft, changed);
changed();

// handy for driving the tool from a console or a test
window.INCUBATOR = { get draft() { return draft; }, set draft(d) { draft = d; changed(); }, toModule };
