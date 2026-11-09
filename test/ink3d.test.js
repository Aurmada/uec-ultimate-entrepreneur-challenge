// The 3D ink outline is the back faces pushed out along their normals. In a
// hollow (a crease by Jeff's nose, the comb lines on Steve's quiff) or under a
// frame lying on the skin (his shades), the pushed-out faces came through the
// surface in front of them as black streaks and spikes. The ink pass now sets
// the outline back by GL3D.INK_BIAS, so it stays behind a surface it only
// grazes; the body and glass passes are not moved. There is no WebGL here, so
// this drives the renderer on a fake context that records each draw.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createToon } from '../src/engine/gl3d/toon.js';
import { GL3D } from '../src/config.js';

function recordingGL(log) {
  const now = {};
  let source = '';
  return new Proxy({}, {
    get(_, k) {
      if (typeof k !== 'string') return undefined;
      if (/^[A-Z0-9_]+$/.test(k)) return k.length;
      if (k.startsWith('create')) return () => ({});
      if (k === 'getShaderParameter' || k === 'getProgramParameter') return () => true;
      if (k === 'getUniformLocation') return (_p, name) => ({ name });
      if (k === 'getExtension') return () => null;
      if (k === 'shaderSource') return (_s, src) => { source += src; log.source = source; };
      if (k === 'uniform1f') return (loc, v) => { if (loc?.name) now[loc.name] = v; };
      if (k === 'drawElements') return () => log.draws.push({ ...now });
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

test('the ink outline is set back behind the surface in front of it, and nothing else is', () => {
  const log = { draws: [], source: '' };
  const canvas = { width: 300, height: 150, addEventListener() {}, getContext: (k) => (k === 'webgl2' ? recordingGL(log) : null) };
  globalThis.document = { createElement: () => canvas };
  const r = createToon({});
  const gpu = r.gpu(MODEL);
  const matrices = new Float32Array(16 * 32);
  for (let i = 0; i < 32; i++) matrices[i * 16] = matrices[i * 16 + 5] = matrices[i * 16 + 10] = matrices[i * 16 + 15] = 1;
  r.render(gpu, matrices, { colours: () => [1, 1, 1], box: { ox: 100, oy: 280, w: 250, h: 300 } });
  assert.ok(GL3D.INK_BIAS > 0, 'the outline is not set back');
  assert.match(log.source, /p\.z -= uInkBias/, 'the vertex shader does not set the ink back');
  const ink = log.draws.filter((d) => d.uInflate > 0), rest = log.draws.filter((d) => !(d.uInflate > 0));
  assert.ok(ink.length && rest.length, `${ink.length} ink and ${rest.length} other draws`);
  for (const d of ink) assert.equal(d.uInkBias, GL3D.INK_BIAS, 'an ink draw is not set back');
  for (const d of rest) assert.equal(d.uInkBias ?? 0, 0, 'a body draw is set back');
});
