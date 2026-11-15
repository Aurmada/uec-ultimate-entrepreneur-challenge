// Round ten of the phone test (lab/phone-test.html) switches off the pieces of
// the two parts round nine found slow: the 2D fighters' shading passes
// (drawFighter.js SHADE_PASSES) and the 3D fighters' antialiasing, ink outline
// and silhouette mask (gl3d/toon.js TOON). Each is on in the game, and each
// switch leaves out its own piece and nothing else, or the page would time the
// wrong thing. There is no page or WebGL here, so the fighters are drawn onto
// fake contexts that record what is done to them.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { STYLIZE } from '../src/config.js';

// ---- 2D: a frame of the game onto canvases that log every fill and copy ----
// One log for every canvas: a fighter's buffers are made once and kept
// (drawFighter's _buffers), so they outlive the frame that made them.

const LOG = [];
function fakeCanvas(log = LOG) {
  const el = {
    width: 300, height: 150, style: {}, setAttribute() {}, after() {}, parentNode: {},
    getContext(kind) { return kind === '2d' ? (this.ctx ||= fakeContext(this, log)) : null; },
  };
  return el;
}

function fakeContext(canvas, log) {
  const own = {
    canvas,
    globalCompositeOperation: 'source-over',
    saved: [],
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
    save() { own.saved.push(own.globalCompositeOperation); },
    restore() { if (own.saved.length) own.globalCompositeOperation = own.saved.pop(); },
    fillRect() { log.push(`fill ${own.globalCompositeOperation}`); },
    drawImage() { log.push(`copy ${own.globalCompositeOperation}`); },
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
    createPattern: () => ({}),
    measureText: () => ({ width: 10 }),
    getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
  };
  return new Proxy(own, { get: (t, k) => (k in t ? t[k] : () => {}) });
}

async function frame2D() {
  const log = LOG;
  globalThis.document = { createElement: () => fakeCanvas() };
  const { renderGame } = await import('../src/engine/render.js');
  const { Game } = await import('../src/engine/game.js');
  const { FIGHTERS } = await import('../src/data/fighters.js');
  const idle = { isHuman: false, update(f) { f.pad = {}; } };
  const game = new Game({
    p1: { def: FIGHTERS[0], controller: idle }, p2: { def: FIGHTERS[1], controller: idle },
    arena: { id: 'test', name: 'TEST', draw() {}, mood: 'none' }, mode: 'versus',
    hud: new Proxy({}, { get: () => () => {} }), onEnd: () => {}, seed: 7,
  });
  for (let i = 0; i < 30; i++) game.update(1 / 60);
  const ctx = fakeCanvas().getContext('2d');
  log.length = 0;
  renderGame(ctx, game);
  const count = {};
  for (const e of log) count[e] = (count[e] || 0) + 1;
  return count;
}

// What one switch changed: the ops a frame lost or gained, by kind.
function lost(on, off) {
  const out = {};
  for (const k of new Set([...Object.keys(on), ...Object.keys(off)])) {
    const d = (on[k] || 0) - (off[k] || 0);
    if (d) out[k] = d;
  }
  return out;
}

test("the 2D shading's passes are all on in the game, and each switch leaves out only its own", async () => {
  const { SHADE_PASSES, STYLE, RIG2D } = await import('../src/engine/drawFighter.js');
  RIG2D.on = true;                   // the 2D rig is the lab's since v3.22.4
  assert.deepEqual({ ...SHADE_PASSES }, { key: true, form: true, rim: true }, 'a shading pass is off in the game');
  assert.equal(STYLE.shaded, true);
  assert.equal(STYLIZE.SHADE_KEY_MODE, 'overlay');
  const all = await frame2D();
  const key = STYLIZE.SHADE_KEY_MODE;
  // two fighters, each shaded once in its buffer
  assert.equal(all[`fill ${key}`], 2, 'the key light is not drawn once a fighter');
  assert.equal(all['copy lighter'], 2, 'the rim is not added once a fighter');
  try {
    SHADE_PASSES.key = false;
    // the gradient, and the mask built for it and the copy back inside the lines
    assert.deepEqual(lost(all, await frame2D()), { [`fill ${key}`]: 2, 'copy source-over': 2, 'copy destination-in': 2 });
    SHADE_PASSES.key = true;
    SHADE_PASSES.form = false;
    assert.deepEqual(lost(all, await frame2D()), { 'fill source-atop': 4 }, 'without the form, more or less than its two gradients went');
    SHADE_PASSES.form = true;
    SHADE_PASSES.rim = false;
    // the warm silhouette, the copies that carve it, and its add
    assert.deepEqual(lost(all, await frame2D()), { 'fill source-in': 2, 'copy source-over': 2, 'copy destination-out': 2, 'copy lighter': 2 });
    SHADE_PASSES.rim = true;
    // the plain blend: the key light's fill changes mode and nothing else does
    STYLIZE.SHADE_KEY_MODE = 'source-atop';
    assert.deepEqual(lost(all, await frame2D()), { 'fill overlay': 2, 'fill source-atop': -2 });
  } finally {
    SHADE_PASSES.key = SHADE_PASSES.form = SHADE_PASSES.rim = true;
    STYLIZE.SHADE_KEY_MODE = key;
    RIG2D.on = false;
  }
});

// Since v3.22.4 the game is 3D only: a fighter with no 3D model to draw (here,
// with no WebGL at all) is not drawn, rather than drawn by the 2D rig, which
// only the lab turns on (RIG2D). Nor is a portrait given the 2D bust, unless
// the founder's photo is the face; and a match waits for its fighters.
test('with no 3D model to draw, a fighter is not drawn in 2D, and a match waits for its fighters', async () => {
  const { RIG2D } = await import('../src/engine/drawFighter.js');
  assert.equal(RIG2D.on, false, 'the 2D rig is on in the game');
  const none = await frame2D();
  const key = STYLIZE.SHADE_KEY_MODE;
  assert.equal(none[`fill ${key}`] || 0, 0, 'a fighter was shaded in 2D');
  assert.equal(none['copy lighter'] || 0, 0, 'a fighter was given a 2D rim');
  RIG2D.on = true;
  try {
    assert.equal((await frame2D())[`fill ${key}`], 2, 'the lab lost the 2D rig');
  } finally {
    RIG2D.on = false;
  }
  const src = readFileSync(new URL('../src/engine/drawFighter.js', import.meta.url), 'utf8');
  assert.match(src, /if \(!drawBust3D\(canvas, ctx, def, opts\) && \(def\.photo \|\| RIG2D\.on\)\) \{/);
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.equal((main.match(/whenFightersReady\(\[/g) || []).length, 2, 'a match, offline or online, starts without waiting for its fighters');
  assert.match(main, /if \(defs\.some\(\(d\) => pending3D\(d\)\)\) \{ on3DReady\(check\); return; \}/);
});

// ---- 3D: the renderer on a fake WebGL context that logs its draws ----

function recordingGL(log) {
  const now = {};
  return new Proxy({}, {
    get(_, k) {
      if (typeof k !== 'string') return undefined;
      if (k === 'FRAMEBUFFER') return 'FRAMEBUFFER';
      if (/^[A-Z0-9_]+$/.test(k)) return k.length;
      if (k.startsWith('create')) return () => ({ kind: k });
      if (k === 'getShaderParameter' || k === 'getProgramParameter') return () => true;
      if (k === 'getUniformLocation') return (_p, name) => ({ name });
      if (k === 'getExtension') return () => null;
      if (k === 'uniform1f') return (loc, v) => { if (loc?.name) now[loc.name] = v; };
      if (k === 'uniform4fv') return (loc, v) => { if (loc?.name === 'uTurn') now.uTurn = [...v]; };
      if (k === 'bindFramebuffer') return (_t, fb) => log.targets.push(fb ? 'mask' : 'screen');
      if (k === 'drawElements') return () => {
        log.draws.push(now.uMaskPass > 0.5 ? 'mask' : now.uInk > 0.5 ? 'ink' : 'body');
        log.turns.push(now.uTurn);
      };
      if (k === 'drawArrays') return () => log.draws.push('key line');
      return () => {};
    },
  });
}

const MODEL = {
  primitives: [{
    positions: new Float32Array(9), normals: new Float32Array(9), joints: new Uint8Array(12),
    weights: new Float32Array(12), indices: new Uint16Array([0, 1, 2]), name: 'body', role: 'skin', color: [1, 1, 1],
  }],
};

async function frame3D(turn = null) {
  const { createToon } = await import('../src/engine/gl3d/toon.js');
  const log = { draws: [], targets: [], attrs: null, turns: [] };
  const canvas = {
    width: 1920, height: 1080, addEventListener() {},
    getContext: (k, attrs) => { log.attrs = attrs; return k === 'webgl2' ? recordingGL(log) : null; },
  };
  const r = createToon({ onScreen: canvas });
  const gpu = r.gpu(MODEL);
  const matrices = new Float32Array(16 * 32);
  for (let i = 0; i < 32; i++) matrices[i * 16] = matrices[i * 16 + 5] = matrices[i * 16 + 10] = matrices[i * 16 + 15] = 1;
  const draw = () => r.render(gpu, matrices, {
    colours: () => [1, 1, 1], box: { ox: 100, oy: 280, w: 250, h: 300 },
    screen: { m: [2, 0, 0, 2, 800, 900], flash: false, keyline: { px: 2, color: '#ffffff', alpha: 0.5 } },
    turn,
  });
  draw();             // the first frame also sizes the mask, which binds it to do so
  log.draws.length = log.targets.length = log.turns.length = 0;
  draw();
  return log;
}

test("the 3D fighters' antialiasing, ink and mask are on in the game, and each switch leaves out only its own", async () => {
  const { TOON } = await import('../src/engine/gl3d/toon.js');
  assert.deepEqual({ ...TOON }, { antialias: true, ink: true, mask: true }, 'a part of the 3D fighters is off in the game');
  const all = await frame3D();
  assert.equal(all.attrs.antialias, true);
  assert.deepEqual(all.draws, ['mask', 'key line', 'ink', 'body']);
  assert.deepEqual(all.targets, ['mask', 'screen'], 'the mask is not drawn on a target of its own');
  try {
    TOON.ink = false;
    assert.deepEqual((await frame3D()).draws, ['mask', 'key line', 'body'], 'without the ink, more or less than the ink went');
    TOON.ink = true;
    TOON.mask = false;
    const unmasked = await frame3D();
    // the key line reads the mask, so it goes with it; and the frame never
    // leaves the screen, which is the point of the switch
    assert.deepEqual(unmasked.draws, ['ink', 'body']);
    assert.deepEqual(unmasked.targets, [], 'the frame still changes target without the mask');
    TOON.mask = true;
    TOON.antialias = false;
    const plain = await frame3D();
    assert.equal(plain.attrs.antialias, false, 'the context was made antialiased all the same');
    assert.deepEqual(plain.draws, all.draws);
  } finally {
    TOON.antialias = TOON.ink = TOON.mask = true;
  }
});

// A part a portrait turns (Kim's ring light, gl3d/index.js bustTurn) is
// turned in every pass that draws it, and every other part, and every part
// in a match, is drawn with no turn at all: the shader skips the turn when its
// sine is 0, so the game's pixels stay as they were.
test('a turned part is turned in every pass, and nothing else is', async () => {
  const none = await frame3D();
  assert.ok(none.turns.length > 0 && none.turns.every((t) => t && t[3] === 0 && t[2] === 1), 'a part was turned with no turn asked for');
  const turned = await frame3D((p) => (p.name === 'body' ? [0.1, -0.2, 0.33] : null));
  assert.equal(turned.turns.length, none.turns.length);
  for (const t of turned.turns) {
    assert.deepEqual(t.map((v) => +v.toFixed(6)), [0.1, -0.2, +Math.cos(0.33).toFixed(6), +Math.sin(0.33).toFixed(6)]);
  }
  const elsewhere = await frame3D((p) => (p.name === 'prop:ringlight' ? [0, 0, 0.33] : null));
  assert.ok(elsewhere.turns.every((t) => t[3] === 0), 'a part not named was turned');
});
