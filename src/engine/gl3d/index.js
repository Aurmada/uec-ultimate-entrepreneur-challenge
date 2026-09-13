// Live 3D fighters, the prototype behind ?gl. RENDER-ONLY.
//
//   ?gl          fighters with a model (FIGHTER_MODELS) render in 3D
//   ?gl=all      every fighter wears the first model, in their own palette
//   &perf        an on-screen timing readout, with gl.finish() so GPU time
//                is included (worst case, not typical)
//
// drawFighter asks has3D() per fighter and hands render3D() the same
// proportioned pose it would have drawn, plus its offscreen buffer. Until a
// model has loaded, or wherever WebGL2 is missing or the context is lost, the
// answer is no and the procedural rig draws instead. Nothing here is read by
// the simulation.

import { parseGLB, extractModel } from './glb.js';
import { buildRig, solvePose } from './rig.js';
import { createToon, hexToRGB, MAX_JOINTS } from './toon.js';
import { MODELS3D, FIGHTER_MODELS } from '../../data/models3d.js';

let enabled = false;
let allFighters = false;
let perf = null;
let renderer = null;
const models = new Map();                // model id -> { ready, rig, gpu, failed }

export function enable3D({ all = false, timing = false } = {}) {
  enabled = true;
  allFighters = all;
  if (timing && !perf) perf = startPerf();
  if (!renderer) {
    try { renderer = createToon(); } catch (e) { console.warn('[gl3d] no renderer:', e); }
  }
  if (!renderer) { enabled = false; return false; }
  for (const id of new Set(Object.values(FIGHTER_MODELS))) load(id);
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
      entry.ready = true;
    })
    .catch((e) => { entry.failed = true; console.warn('[gl3d] model failed:', e); });
  return entry;
}

function modelFor(def) {
  if (!enabled || !renderer || renderer.lost || !def) return null;
  const id = FIGHTER_MODELS[def.id] || (allFighters ? Object.values(FIGHTER_MODELS)[0] : null);
  const entry = id && models.get(id);
  return entry && entry.ready ? entry : null;
}

export function has3D(def) { return !!modelFor(def); }

// The last pose rendered, and whether every bone matrix came out finite.
let last = null;
export const debug3D = () => last;

// Renders fighter f into B.buf, the same offscreen buffer the procedural rig
// fills, so the caller's key line, hit flash and blit stay exactly as they are.
export function render3D(B, f, P, { elbowF, elbowB, jitter = 0 }) {
  const entry = modelFor(f.def);
  if (!entry) return false;
  const t0 = performance.now();
  solvePose(entry.rig, P, { F: elbowF, B: elbowB });
  last = { id: f.def.id, state: f.state, P, finite: entry.rig.matrices.every(Number.isFinite) };
  const t1 = performance.now();
  const palette = f.def.c || {};
  const colourCache = new Map();
  const colours = (p) => {
    if (!colourCache.has(p.role)) colourCache.set(p.role, palette[p.role] ? hexToRGB(palette[p.role]) : p.color);
    return colourCache.get(p.role);
  };
  // A non-finite squash is ignored by ctx.scale, so the 2D rig never shows
  // one; in a projection matrix it blanks the fighter. A staged fighter with
  // no `vy` produces exactly that in the jump pose.
  const sq = (v) => (Number.isFinite(v) ? v : 1);
  const { vw, vh } = renderer.render(entry.gpu, entry.rig.matrices, colours,
    { ox: B.ox, oy: B.oy, w: B.w, h: B.h }, { x: sq(P.sx), y: sq(P.sy) }, jitter);
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

// The procedural rig reports its own cost here when timing is on, so the
// readout compares the two renderers in the same match.
export function mark2D(ms) { if (perf) perf.add('2d', { draw: ms }); }
export const timing3D = () => !!perf;

export function stats3D() {
  return {
    enabled, allFighters, renderer: !!renderer, lost: !!renderer?.lost,
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
