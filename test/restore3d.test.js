// A phone can take the GPU away from a page (the app sent to the background,
// memory pressure), and give it back later. The 3D renderer asks for it back,
// so when the browser restores the context, everything that lived on it (the
// programs, the mask, face textures, each model's buffers) has to be made
// again, or the fighters stay 2D for the rest of the session. There is no
// WebGL here, so this drives the renderer on a fake context that only counts
// what is made on it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createToon } from '../src/engine/gl3d/toon.js';

function fakeGL(made) {
  let next = 1;
  return new Proxy({}, {
    get(_, k) {
      if (typeof k !== 'string') return undefined;
      if (/^[A-Z0-9_]+$/.test(k)) return k.length;                 // any constant will do
      if (k.startsWith('create')) return () => { made[k] = (made[k] || 0) + 1; return { id: next++ }; };
      if (k === 'getShaderParameter' || k === 'getProgramParameter') return () => true;
      if (k === 'getUniformLocation') return () => ({});
      if (k === 'getExtension') return () => null;
      return () => {};
    },
  });
}

function fakeCanvas(made) {
  const on = {};
  return {
    width: 300, height: 150,
    addEventListener(type, fn) { (on[type] ||= []).push(fn); },
    fire(type, e = {}) { for (const fn of on[type] || []) fn(e); },
    getContext: (kind) => (kind === 'webgl2' ? fakeGL(made) : null),
  };
}

const MODEL = {
  primitives: [{
    positions: new Float32Array(9), normals: new Float32Array(9), joints: new Uint8Array(12),
    weights: new Float32Array(12), indices: new Uint16Array([0, 1, 2]), name: 'body', role: 'skin', color: [1, 1, 1],
  }],
};

test('a lost WebGL context comes back with everything on it made again', () => {
  const made = {};
  globalThis.document = { createElement: () => fakeCanvas(made) };
  const canvas = fakeCanvas(made);
  const r = createToon({ onScreen: canvas });
  assert.ok(r, 'no renderer on the fake context');

  const first = r.gpu(MODEL);
  assert.equal(r.gpu(MODEL), first, 'a model was uploaded twice on one context');
  r.uploadTexture('face:test', {});
  assert.ok(r.texture('face:test'));
  const programs = made.createProgram;

  let asked = false;
  canvas.fire('webglcontextlost', { preventDefault() { asked = true; } });
  assert.equal(r.lost, true);
  assert.ok(asked, 'the renderer did not ask for its context back');

  canvas.fire('webglcontextrestored');
  assert.equal(r.lost, false, 'the renderer stayed lost after the browser gave its context back');
  assert.ok(made.createProgram > programs, 'the programs were not made again on the restored context');
  assert.notEqual(r.gpu(MODEL), first, 'a model kept the buffers of the lost context');
  assert.equal(r.texture('face:test'), null, 'a face texture of the lost context was kept');
  assert.equal(r.gpu(MODEL), r.gpu(MODEL), 'a model was uploaded twice on the restored context');
});
