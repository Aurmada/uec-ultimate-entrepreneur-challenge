// Faces painted for sculpted heads (engine/gl3d/faces3d.js): the sculpted
// Jeff's face (November 2026). Render-only, like every face.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCULPTED_FACES } from '../src/engine/gl3d/faces3d.js';
import { MODELS3D, FACE_STATES } from '../src/data/models3d.js';
import { getFighter } from '../src/data/fighters.js';
import { readFileSync } from 'node:fs';
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

test('every model that names a face painter names one that exists', () => {
  for (const [id, spec] of Object.entries(MODELS3D)) {
    if (spec.face?.painter) assert.ok(SCULPTED_FACES[spec.face.painter], `${id} names a painter that is not there`);
  }
  assert.equal(MODELS3D['jeff-sculpt'].face?.painter, 'jeff');
});

test("the sculpted Jeff's face paints every expression, each its own", () => {
  const def = getFighter('bozo');
  const drawn = FACE_STATES.map((expression) => {
    const { ctx, calls } = recorder();
    SCULPTED_FACES.jeff(ctx, def, expression);
    assert.ok(calls.length > 10, `${expression} draws next to nothing`);
    return calls.join(';');
  });
  assert.equal(new Set(drawn).size, FACE_STATES.length, 'two expressions paint the same face');
});

test('the sculpted Jeff wears his shades, dark glass over his eyes', () => {
  const spec = MODELS3D['jeff-sculpt'];
  const glb = readFileSync(new URL(`../${spec.url}`, import.meta.url));
  const model = extractModel(parseGLB(glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength)));
  const roles = model.primitives.filter((p) => p.name === 'eyewear:shades').map((p) => p.role).sort();
  assert.deepEqual(roles, ['frame', 'lens'], 'no shades mesh with a lens and a frame');
  assert.ok(wearing(getFighter('bozo'), 'idle')('eyewear:shades'), 'Jeff does not wear them');
  assert.ok(spec.glass?.lens > 0 && spec.glass.lens < 1, 'the lenses are not see-through glass');
});
