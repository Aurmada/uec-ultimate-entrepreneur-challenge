// The 2D fighters' shading only ever draws one way between its canvases. Round
// ten of the phone test found the key light and the rim held the iPhone 12
// Pro's 2D game to 19 fps (40 without either, 60 without both and the form),
// and what the two shared was a round trip: each copied the fighter's buffer
// into a scratch canvas and drew the scratch back into the buffer. v3.22.2
// draws each pass onto a fresh canvas instead, with the same pixels
// (lab/pixels.js). This draws a frame of the game onto canvases that record
// what is drawn from and onto each, and checks that, between one fighter
// reaching the frame and the next, no canvas is drawn on after it was drawn
// from.

import { test } from 'node:test';
import assert from 'node:assert/strict';

const LOG = [];
let named = 0;
function fakeCanvas() {
  const el = {
    name: `canvas ${++named}`,
    width: 300, height: 150, style: {}, setAttribute() {}, after() {}, parentNode: {},
    getContext(kind) { return kind === '2d' ? (this.ctx ||= fakeContext(this)) : null; },
  };
  return el;
}

const WRITES = ['fillRect', 'clearRect', 'fill', 'stroke', 'fillText', 'strokeText', 'putImageData'];
function fakeContext(canvas) {
  const own = {
    canvas,
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
    drawImage(src) { LOG.push({ onto: canvas, from: src?.getContext ? src : null }); },
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
    createPattern: () => ({}),
    measureText: () => ({ width: 10 }),
    getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
  };
  for (const k of WRITES) own[k] = () => LOG.push({ onto: canvas, from: null });
  return new Proxy(own, { get: (t, k) => (k in t ? t[k] : () => {}) });
}

async function frame() {
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
  const screen = fakeCanvas();
  const ctx = screen.getContext('2d');
  LOG.length = 0;
  renderGame(ctx, game);
  return { screen, log: [...LOG] };
}

test('the 2D shading never draws a canvas back into one it was drawn from', async () => {
  const { STYLE, SHADE_PASSES } = await import('../src/engine/drawFighter.js');
  assert.equal(STYLE.shaded, true);
  assert.deepEqual({ ...SHADE_PASSES }, { key: true, form: true, rim: true });
  const { screen, log } = await frame();
  // The frame: the screen and the world canvas renderGame draws into and
  // copies onto it. Anything drawn there ends a fighter's chain.
  const frameEls = new Set([screen, ...log.filter((e) => e.onto === screen && e.from).map((e) => e.from)]);
  let read = new Set(), chained = 0, landed = 0;
  const trips = [];
  for (const e of log) {
    if (frameEls.has(e.onto)) {
      if (e.from && !frameEls.has(e.from)) landed++;
      read = new Set();
      continue;
    }
    chained++;
    if (read.has(e.onto)) trips.push(`${e.onto.name} drawn on after it was drawn from`);
    if (e.from) read.add(e.from);
  }
  // the frame did draw fighters through their buffers: two bodies and two
  // key lines reached it
  assert.ok(chained > 20 && landed >= 4, `${chained} draws off the frame and ${landed} copies onto it`);
  assert.deepEqual(trips, [], 'a round trip between two canvases inside one fighter');
});
