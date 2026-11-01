// Faces painted for sculpted heads (engine/gl3d/faces3d.js), from each head's
// layout and the fighter's own 2D face values (November 2026). Render-only,
// like every face.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { paintSculpted, character, FACE_REF } from '../src/engine/gl3d/faces3d.js';
import { MODELS3D, SCULPTED, FACE_STATES } from '../src/data/models3d.js';
import { getFighter, FIGHTERS } from '../src/data/fighters.js';
import { parseGLB, extractModel } from '../src/engine/gl3d/glb.js';
import { wearing } from '../src/engine/gl3d/index.js';

// A 2D context that records what is drawn, enough to tell one face from another.
function recorder() {
  const calls = [];
  const ctx = new Proxy({}, {
    get: (o, k) => (k in o ? o[k] : (...args) => { calls.push(`${String(k)}(${args.map((a) => +a.toFixed?.(2) || a).join(',')})`); }),
    set: (o, k, v) => { calls.push(`${String(k)}=${v}`); return true; },
  });
  return { ctx, calls };
}
const painted = (def, expression, layout = MODELS3D['sculpt:bozo'].face.layout) => {
  const { ctx, calls } = recorder();
  paintSculpted(ctx, def, expression, layout);
  return calls;
};

test('every sculpted fighter has their whole build: a fighter, a design, a model and a face layout', () => {
  assert.ok(Object.keys(SCULPTED).length > 0);
  for (const id of Object.keys(SCULPTED)) {
    assert.ok(FIGHTERS.some((d) => d.id === id), `${id} is not a fighter`);
    assert.ok(existsSync(new URL(`../lab/blender/fighters/${id}.py`, import.meta.url)), `${id} has no design in lab/blender/fighters`);
    const spec = MODELS3D[`sculpt:${id}`];
    assert.ok(existsSync(new URL(`../${spec.url}`, import.meta.url)), `${id}'s model is not built`);
    const L = spec.face?.layout;
    for (const k of ['eye', 'brow', 'mouth', 'lid', 'line']) assert.ok(L?.[k] !== undefined, `${id}'s face layout has no ${k}`);
  }
});

test("the sculpted Jeff's face paints every expression, each its own", () => {
  const def = getFighter('bozo');
  const drawn = FACE_STATES.map((expression) => {
    const calls = painted(def, expression);
    assert.ok(calls.length > 10, `${expression} draws next to nothing`);
    return calls.join(';');
  });
  assert.equal(new Set(drawn).size, FACE_STATES.length, 'two expressions paint the same face');
});

test("the painter is pinned on Jeff's face values, and another fighter's move it", () => {
  const jeff = getFighter('bozo');
  // his own values are the reference: nothing of his character moves
  const K = character(jeff);
  for (const [k, v] of Object.entries(FACE_REF)) assert.equal(jeff.face[k], v, `FACE_REF.${k} is not his`);
  assert.deepEqual([K.open, K.iris, K.pupil, K.tilt, K.curve], [1.1, 1.9, 0.9, 0, 0]);
  // on the same head, a wider-eyed fighter's eyes open wider, a scowler's set
  // mouth turns down, and a heavier brow drops harder: each 2D knob reaches
  // the painted face, in the same direction it moves the 2D one
  const as = (face) => ({ ...jeff, face: { ...jeff.face, ...face } });
  assert.ok(character(as({ LID_Y: 6 })).open > K.open);
  assert.ok(character(as({ PUPIL_R: 3.2 })).iris > K.iris);
  assert.ok(character(as({ BROW_TILT: 5 })).tilt > 0);
  // the set mouth's far corner, the one Jeff's smirk lifts (y is down)
  const corner = (def) => {
    const mw = MODELS3D['sculpt:bozo'].face.layout.mouth.w;
    const c = painted(def, 'idle').find((s) => s.startsWith('quadraticCurveTo(0,') && +s.split(',')[2] === +(mw + 0.4).toFixed(2));
    return +c.split(',')[3].replace(')', '');
  };
  assert.ok(corner(as({ MOUTH_CURVE: -2 })) > corner(jeff) + 2, 'a scowl does not pull the corner down');
  // every fighter of the cast paints a face of their own on it
  const faces = new Set(FIGHTERS.map((d) => painted({ ...jeff, face: d.face }, 'idle').join(';')));
  assert.equal(faces.size, new Set(FIGHTERS.map((d) => JSON.stringify(d.face))).size);
});

test('the sculpted Jeff wears his shades, dark glass over his eyes', () => {
  const spec = MODELS3D['sculpt:bozo'];
  const glb = readFileSync(new URL(`../${spec.url}`, import.meta.url));
  const model = extractModel(parseGLB(glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength)));
  const roles = model.primitives.filter((p) => p.name === 'eyewear:shades').map((p) => p.role).sort();
  assert.deepEqual(roles, ['frame', 'lens'], 'no shades mesh with a lens and a frame');
  assert.ok(wearing(getFighter('bozo'), 'idle')('eyewear:shades'), 'Jeff does not wear them');
  assert.ok(spec.glass?.lens > 0 && spec.glass.lens < 1, 'the lenses are not see-through glass');
});
