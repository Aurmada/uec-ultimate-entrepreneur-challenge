// Which renderer pieces a page load turns on (src/graphics.js): from the
// address, as the lab always has, or from the player's Settings choice. With
// neither, the game is 3D (since v3.14) wherever the browser can draw it, and
// otherwise the classic 2D game, every flag off; choosing 2D is that game too.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { graphicsFlags, withoutGraphicsParams } from '../src/graphics.js';

const ALL_OFF = { gl: false, ids: [], sculpts: false, perf: false, sharp: false, stages: false, fx: false };

const ALL_3D = { gl: true, ids: [], sculpts: true, perf: false, sharp: true, stages: true, fx: true };

test('with nothing asked for, the game is 3D, or the classic one without WebGL2', () => {
  assert.deepEqual(graphicsFlags('', {}), ALL_3D);
  assert.deepEqual(graphicsFlags('?debug=1', { volume: 80 }), ALL_3D);
  assert.deepEqual(graphicsFlags(undefined, undefined), ALL_3D);
  const none = { webgl2: false };
  assert.deepEqual(graphicsFlags('', {}, none), ALL_OFF);
  assert.deepEqual(graphicsFlags('?debug=1', { volume: 80 }, none), ALL_OFF);
  assert.deepEqual(graphicsFlags(undefined, undefined, none), ALL_OFF);
});

test('choosing 2D in Settings is the classic game, and 3D is what ?gl does', () => {
  // v3.13 saved 'classic' for everyone as the default: it is no choice
  assert.deepEqual(graphicsFlags('', { graphics: 'classic' }), ALL_3D);
  assert.deepEqual(graphicsFlags('', { graphics: null }), ALL_3D);
  assert.deepEqual(graphicsFlags('', { graphics: '2d' }), ALL_OFF);
  assert.deepEqual(graphicsFlags('?debug=1', { graphics: '2d' }), ALL_OFF);
  assert.deepEqual(graphicsFlags('', { graphics: '3d' }), ALL_3D);
  assert.deepEqual(graphicsFlags('', { graphics: '3d' }), { ...graphicsFlags('?gl', { graphics: '2d' }), ids: [] });
  // the address turns 3D off for the lab whatever was chosen
  assert.deepEqual(graphicsFlags('?gl=0', {}), ALL_OFF);
  assert.deepEqual(graphicsFlags('?gl=0', { graphics: '3d' }), ALL_OFF);
});

test('the address still works as before, and wins where it names a piece', () => {
  assert.deepEqual(graphicsFlags('?gl=max,dex&perf', {}),
    { gl: true, ids: ['max', 'dex'], sculpts: true, perf: true, sharp: true, stages: true, fx: true });
  assert.equal(graphicsFlags('?gl&stages=0', {}).stages, false);
  assert.equal(graphicsFlags('?stages=0', { graphics: '3d' }).stages, false, 'the address lost to the setting');
  // one piece alone, with the 2D fighters
  assert.deepEqual(graphicsFlags('?gl=0&sharp', {}), { ...ALL_OFF, sharp: true });
  assert.deepEqual(graphicsFlags('?fx', { graphics: '2d' }), { ...ALL_OFF, fx: true });
  assert.deepEqual(graphicsFlags('?stages', {}, { webgl2: false }), { ...ALL_OFF, stages: true });
});

// In 3D the roster wear their sculpted models; the address can still put
// them back in the founder model, or in the athlete bodies on test, and the
// sculpts never come on without the 3D fighters.
test('3D is the sculpted roster, unless the address asks for another body', () => {
  assert.equal(graphicsFlags('?gl&sculpts=0', {}).sculpts, false);
  assert.equal(graphicsFlags('?sculpts=0', { graphics: '3d' }).sculpts, false, 'the address lost to the setting');
  assert.equal(graphicsFlags('?gl&athlete', {}).sculpts, false, 'the sculpts hid the athlete bodies');
  assert.equal(graphicsFlags('?sculpts', { graphics: '2d' }).sculpts, false, 'sculpts without 3D fighters');
  assert.equal(graphicsFlags('?gl&athlete&sculpts', {}).sculpts, true);
});

test('a reload after a change drops the graphics flags and keeps the rest', () => {
  assert.equal(withoutGraphicsParams('?gl&debug=1&stages=0&perf&sculpts=0'), '?debug=1');
  assert.equal(withoutGraphicsParams('?gl=max'), '');
  assert.equal(withoutGraphicsParams(''), '');
  assert.equal(withoutGraphicsParams('?c=abc&fx'), '?c=abc');
});
