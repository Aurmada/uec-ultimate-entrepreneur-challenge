// Live 3D fighters, the prototype behind ?gl. RENDER-ONLY.
//
//   ?gl          every fighter renders in 3D, wearing their own look
//   ?gl=max,dex  only the fighters with those ids do (benchmarks, comparisons)
//   &perf        an on-screen timing readout, with gl.finish() so GPU time
//                is included (worst case, not typical)
//
// drawFighter asks has3D() per fighter and hands render3D() the same
// proportioned pose it would have drawn, plus its offscreen buffer. Until a
// model has loaded, or wherever WebGL2 is missing or the context is lost, the
// answer is no and the procedural rig draws instead. Nothing here is read by
// the simulation.

import { parseGLB, extractModel } from './glb.js';
import { buildRig, solvePose, transformPoint } from './rig.js';
import { createToon, hexToRGB, MAX_JOINTS } from './toon.js';
import { anchorInPose, swayState, stepSway, SWAY_ANCHORS } from './sway.js';
import { GL3D } from '../../config.js';
import {
  MODELS3D, DEFAULT_MODEL, FIGHTER_MODELS, resolveLook3D,
  FACE_STATES, FACE_GRID, faceCell, faceKey, drawnFaceKey,
} from '../../data/models3d.js';

let enabled = false;
let only = null;                          // fighter ids to render in 3D, or null for all
let perf = null;
let renderer = null;
const models = new Map();                // model id -> { ready, rig, gpu, failed }
const waiting = [];                      // callbacks for the next model to finish loading
let stageLight = null;                   // the light of the stage being fought on, if any

// The renderer sets this before drawing fighters on a rendered stage, and
// clears it (null) otherwise; portraits always take the default light.
export function setLight3D(light) { stageLight = light || null; }

export function enable3D({ ids = null, timing = false } = {}) {
  enabled = true;
  only = ids && ids.length ? new Set(ids) : null;
  if (timing && !perf) perf = startPerf();
  if (!renderer) {
    try { renderer = createToon(); } catch (e) { console.warn('[gl3d] no renderer:', e); }
  }
  if (!renderer) { enabled = false; return false; }
  for (const id of new Set([DEFAULT_MODEL, ...Object.values(FIGHTER_MODELS)])) load(id);
  return true;
}

export function disable3D() { enabled = false; }

function load(id) {
  if (models.has(id)) return models.get(id);
  const entry = { ready: false, failed: false };
  models.set(id, entry);
  const spec = MODELS3D[id];
  // Resolved against this module, not the page: the game, a lab page and a
  // Pages deploy under /<repo>/ all find the same file.
  fetch(new URL(`../../../${spec.url}`, import.meta.url))
    .then((r) => { if (!r.ok) throw new Error(`${spec.url}: ${r.status}`); return r.arrayBuffer(); })
    .then((buf) => {
      const model = extractModel(parseGLB(buf));
      if (model.jointNames.length > MAX_JOINTS) throw new Error(`${id} has more than ${MAX_JOINTS} joints`);
      entry.rig = buildRig(model, spec);
      entry.gpu = renderer.upload(model);
      entry.inkless = new Set(spec.inkless || []);
      entry.glass = new Map(Object.entries(spec.glass || {}));
      entry.sway = new Map(Object.entries(spec.sway || {}));
      entry.head = model.jointNames.indexOf('head');
      entry.skull = model.restHeads[entry.head].map((v, i) => v + (i === 1 ? spec.skull : 0));
      if (spec.face) entry.face = faceSlot(id, spec.face);
      entry.ready = true;
      for (const fn of waiting.splice(0)) fn();
    })
    .catch((e) => {
      entry.failed = true;
      console.warn('[gl3d] model failed:', e);
      // Whoever was waiting is told all the same: they draw again, in 2D
      // now, and anything queued for another model's load queues again.
      for (const fn of waiting.splice(0)) fn();
    });
  return entry;
}

function modelFor(def) {
  if (!enabled || !renderer || renderer.lost || !def) return null;
  if (only && !only.has(def.id)) return null;
  const entry = models.get(FIGHTER_MODELS[def.id] || DEFAULT_MODEL);
  return entry && entry.ready ? entry : null;
}

export function has3D(def) { return !!modelFor(def); }

// True while def would render in 3D but its model is still on the way.
// Screens drawn in that window can ask to be drawn again (on3DReady).
export function pending3D(def) {
  if (!enabled || !renderer || renderer.lost || !def || (only && !only.has(def.id))) return false;
  const entry = models.get(FIGHTER_MODELS[def.id] || DEFAULT_MODEL);
  return !!entry && !entry.ready && !entry.failed;
}
export function on3DReady(fn) { waiting.push(fn); }

// The last pose rendered, for probes and the lab: whose, in what state, and
// whether every bone matrix came out finite. Worked out when asked, not per
// frame.
const last = { id: null, state: null, P: null, matrices: null };
export const debug3D = () => (last.matrices
  ? { id: last.id, state: last.state, P: last.P, finite: last.matrices.every(Number.isFinite) }
  : null);

// Renders fighter f into B.buf, the same offscreen buffer the procedural rig
// fills, so the caller's key line, hit flash and blit stay exactly as they are.
// `face` is drawFighter's face painter: { paint(ctx, def, expression, r,
// photo), photo(def) }, the second giving a founder's decoded photo or null.
// Without it the head is bare.
export function render3D(B, f, P, { elbowF, elbowB, jitter = 0, face = null }) {
  const entry = modelFor(f.def);
  if (!entry) return false;
  const t0 = performance.now();
  solvePose(entry.rig, P, { F: elbowF, B: elbowB });
  last.id = f.def.id; last.state = f.state; last.P = P; last.matrices = entry.rig.matrices;
  const t1 = performance.now();
  // A non-finite squash is ignored by ctx.scale, so the 2D rig never shows
  // one; in a projection matrix it blanks the fighter. A staged fighter with
  // no `vy` produces exactly that in the jump pose.
  const sq = (v) => (Number.isFinite(v) ? v : 1);
  const lags = swayOf(f, P);
  const { vw, vh } = drawModel(entry, f.def, f.state, f.unicornT > 0, P.face, face, {
    box: { ox: B.ox, oy: B.oy, w: B.w, h: B.h }, squash: { x: sq(P.sx), y: sq(P.sy) }, jitter, light: stageLight,
    sway: entry.sway.size ? (p) => hangOf(entry, p, lags) : null,
  });
  if (perf) renderer.finish();
  const t2 = performance.now();
  const g = B.buf.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, B.buf.width, B.buf.height);
  g.drawImage(renderer.canvas, 0, 0, vw, vh, 0, 0, B.buf.width, B.buf.height);
  const t3 = performance.now();
  if (perf) perf.add('3d', { solve: t1 - t0, gpu: t2 - t1, blit: t3 - t2 });
  return true;
}

// A head-and-shoulders render for a portrait: def in pose P, turned by
// GL3D.BUST.TURN, framed on the head and drawn into ctx over rect
// ({ x, y, w, h } in canvas px), mirrored if asked. False wherever render3D
// would be, so the caller draws its 2D bust instead.
export function renderBust3D(ctx, rect, def, P, { expression = 'idle', face = null, mirror = false, unicorn = false } = {}) {
  const entry = modelFor(def);
  if (!entry) return false;
  const U = GL3D.UNIT, BUST = GL3D.BUST;
  solvePose(entry.rig, P, {}, BUST.TURN);
  const [hx, hy] = transformPoint(entry.rig.matrices, entry.head, entry.skull);
  const w = BUST.SPAN, h = (BUST.SPAN * rect.h) / rect.w;
  const box = { ox: w * BUST.HEAD_AT[0] - hx * U, oy: h * BUST.HEAD_AT[1] + hy * U, w, h };
  const { vw, vh } = drawModel(entry, def, 'idle', unicorn, expression, face, { box, ss: rect.w / w });
  ctx.save();
  if (mirror) {
    ctx.translate(2 * rect.x + rect.w, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(renderer.canvas, 0, 0, vw, vh, rect.x, rect.y, rect.w, rect.h);
  ctx.restore();
  return true;
}

// Secondary motion. Each fighter's springs live here, keyed by the fighter, so
// nothing is added to the Fighter (whose own properties are all simulation
// state, by test). A staged fighter drawn once, as the lab and portraits do,
// starts at rest and so does not sway at all.
const sways = new WeakMap();
function swayOf(f, P) {
  const t = performance.now() / 1000;
  const facing = f.facing || 1;
  const world = {};
  for (const k of SWAY_ANCHORS) {
    const [ax, ay] = anchorInPose(P, k);
    world[k] = [(f.x || 0) + facing * ax, (f.y || 0) + ay];
  }
  let s = sways.get(f);
  if (!s) {
    sways.set(f, swayState(world, facing, t));
    return null;
  }
  return stepSway(s, world, facing, t);
}

function hangOf(entry, p, lags) {
  const h = lags && entry.sway.get(p.name);
  if (!h) return null;
  const lag = lags[h.anchor];
  return { lag: [lag[0] * h.gain, lag[1] * h.gain], pivot: h.pivot, dir: h.dir, reach: h.reach };
}

// One posed model onto the renderer's canvas: the fighter's palette, what
// they wear in this state and condition, and their face in this expression.
function drawModel(entry, def, state, unicorn, expression, painter, view) {
  const memo = memoFor(def);
  const palette = def.c || {};
  const colours = (p) => {
    let rgb = memo.colours.get(p.role);
    if (!rgb) {
      rgb = palette[p.role] ? hexToRGB(palette[p.role]) : p.color;
      memo.colours.set(p.role, rgb);
    }
    return rgb;
  };
  const photo = def.photo && painter ? painter.photo(def) : null;
  const face = entry.face && painter ? faceFor(entry.face, def, expression, painter, photo) : null;
  const wkey = `${state}|${unicorn ? 'u' : ''}|${photo ? 'p' : ''}`;
  let wears = memo.wears.get(wkey);
  if (!wears) {
    wears = wearing(def, state, { unicorn, photo: !!photo });
    memo.wears.set(wkey, wears);
  }
  return renderer.render(entry.gpu, entry.rig.matrices, {
    ...view, colours, visible: (p) => wears(p.name), face, inkless: entry.inkless, glass: entry.glass,
  });
}

// A def's look and palette do not change once it is drawn (a new look is a
// new def), so its colours and what it wears in each state are worked out
// once, not every frame on the per-fighter path.
const memos = new WeakMap();
function memoFor(def) {
  let m = memos.get(def);
  if (!m) {
    m = { colours: new Map(), wears: new Map() };
    memos.set(def, m);
  }
  return m;
}

// What the renderer needs to put a model's face on (see MODELS3D.face). The
// texture and cell are filled in per fighter as each is drawn.
function faceSlot(id, F) {
  const S = GL3D.FACE_SPAN;
  return {
    texture: null, cell: null, key: `face:${id}:`, r: F.r,
    map: [F.at[0], F.at[1], 2 * S * F.px[0], 2 * S * F.px[1]],
    axis: [Math.cos(F.turn || 0), Math.sin(F.turn || 0)],
    front: F.front, fade: F.fade, mesh: F.mesh, role: F.role,
  };
}

// The model's face slot, filled in for this fighter and expression. A photo
// founder wears their photo once it has decoded (`photo`) and their drawn
// face until then, as drawHead does in 2D, so a photo that never decodes
// still leaves a face. Each is its own cached texture, so neither is painted
// more than once. Render is synchronous, so one slot per model serves every
// fighter wearing it.
function faceFor(slot, def, expression, painter, photo) {
  const key = slot.key + (photo ? faceKey(def) : drawnFaceKey(def));
  slot.texture = renderer.texture(key) || renderer.uploadTexture(key, paintFaces(slot, def, painter.paint, photo));
  slot.cell = faceCell(expression);
  return slot;
}

// Every expression, one cell each, drawn by the same painter the 2D rig uses.
// Cells are clipped so a long stroke never reaches its neighbour.
let faceCanvas = null;
function paintFaces(slot, def, paint, photo) {
  const C = GL3D.FACE_CELL, S = GL3D.FACE_SPAN, [cols, rows] = FACE_GRID;
  faceCanvas ||= document.createElement('canvas');
  faceCanvas.width = C * cols;              // resizing also clears it
  faceCanvas.height = C * rows;
  const g = faceCanvas.getContext('2d');
  FACE_STATES.forEach((expression, i) => {
    g.setTransform(C / (2 * S), 0, 0, C / (2 * S), (i % cols + 0.5) * C, (Math.floor(i / cols) + 0.5) * C);
    g.save();
    g.beginPath();
    g.rect(-S, -S, 2 * S, 2 * S);
    g.clip();
    paint(g, def, expression, slot.r, photo);
    g.restore();
  });
  return faceCanvas;
}

// The procedural rig reports its own cost here when timing is on, so the
// readout compares the two renderers in the same match.
export function mark2D(ms) { if (perf) perf.add('2d', { draw: ms }); }
export const timing3D = () => !!perf;

// Which of a model's meshes a fighter wears right now. The base body always;
// "<slot>:<option>" when their look picks that option; "prop:<id>" when they
// carry a part with that id, in that part's states, exactly as the 2D parts
// system gates it (the block briefcase only shows while blocking).
// "fx:<flag>" when the fighter is in that condition right now (`conditions`,
// such as { unicorn: true } in Unicorn Mode). While a founder's face is their
// photo (`conditions.photo`) they wear no modelled eyewear or facial hair, as
// drawHead draws none over a photo: the person's own are in it.
export function wearing(def, state, conditions = {}) {
  const look = resolveLook3D(def);
  const cache = new Map();
  return (name) => {
    if (cache.has(name)) return cache.get(name);
    const colon = name.indexOf(':');
    let on = true;
    if (colon >= 0) {
      const slot = name.slice(0, colon), option = name.slice(colon + 1);
      if (slot === 'prop') {
        const part = (def.parts || []).find((p) => p.id === option);
        on = !!part && (!part.states || part.states.includes(state));
      } else if (slot === 'fx') {
        on = !!conditions[option];
      } else if (conditions.photo && (slot === 'eyewear' || slot === 'facialHair')) {
        on = false;
      } else {
        on = look[slot] === option;
      }
    }
    cache.set(name, on);
    return on;
  };
}

export function stats3D() {
  return {
    enabled, only: only ? [...only] : null, renderer: !!renderer, lost: !!renderer?.lost,
    models: Object.fromEntries([...models].map(([id, e]) => [id, e.ready ? 'ready' : e.failed ? 'failed' : 'loading'])),
    timing: perf ? perf.summary() : null,
  };
}

function startPerf() {
  const samples = { '3d': [], '2d': [] };
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:99;padding:6px 8px;border-radius:6px;'
    + 'background:rgba(0,0,0,.72);color:#9fe;font:12px/1.35 ui-monospace,monospace;white-space:pre;pointer-events:none';
  document.body.appendChild(el);
  const avg = (list, key) => (list.length ? list.reduce((s, x) => s + x[key], 0) / list.length : 0);
  const p = {
    add(kind, s) {
      const list = samples[kind];
      list.push(s);
      if (list.length > 120) list.shift();
    },
    summary() {
      const d3 = samples['3d'], d2 = samples['2d'];
      return {
        fighter3d: d3.length ? {
          solve: avg(d3, 'solve'), gpu: avg(d3, 'gpu'), blit: avg(d3, 'blit'),
          total: avg(d3, 'solve') + avg(d3, 'gpu') + avg(d3, 'blit'),
        } : null,
        fighter2d: d2.length ? { draw: avg(d2, 'draw') } : null,
      };
    },
  };
  setInterval(() => {
    const s = p.summary();
    const f = (v) => v.toFixed(2).padStart(5);
    el.textContent = [
      '3D fighter (ms, with gl.finish)',
      s.fighter3d ? `  solve ${f(s.fighter3d.solve)}  gpu ${f(s.fighter3d.gpu)}  blit ${f(s.fighter3d.blit)}  = ${f(s.fighter3d.total)}` : '  (none on screen)',
      '2D fighter (ms)',
      s.fighter2d ? `  draw  ${f(s.fighter2d.draw)}` : '  (none on screen)',
    ].join('\n');
  }, 500);
  return p;
}
