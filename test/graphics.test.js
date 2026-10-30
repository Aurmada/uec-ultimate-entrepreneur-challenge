// Which renderer pieces a page load turns on (src/graphics.js): from the
// address, as the lab always has, or from the player's Settings choice. The
// one thing that must never move is the default: nothing in the address and
// no choice made is the classic game, every flag off.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { graphicsFlags, withoutGraphicsParams } from '../src/graphics.js';

const ALL_OFF = { gl: false, ids: [], perf: false, sharp: false, stages: false, fx: false };

test('with nothing asked for, the game is the classic one', () => {
  assert.deepEqual(graphicsFlags('', {}), ALL_OFF);
  assert.deepEqual(graphicsFlags('', { graphics: 'classic' }), ALL_OFF);
  assert.deepEqual(graphicsFlags('?debug=1', { volume: 80 }), ALL_OFF);
  assert.deepEqual(graphicsFlags(undefined, undefined), ALL_OFF);
});

test('choosing the 3D preview in Settings turns on what ?gl does', () => {
  const chosen = graphicsFlags('', { graphics: '3d' });
  assert.deepEqual(chosen, { ...graphicsFlags('?gl', {}), ids: [] });
  assert.deepEqual(chosen, { gl: true, ids: [], perf: false, sharp: true, stages: true, fx: true });
});

test('the address still works as before, and wins where it names a piece', () => {
  assert.deepEqual(graphicsFlags('?gl=max,dex&perf', {}),
    { gl: true, ids: ['max', 'dex'], perf: true, sharp: true, stages: true, fx: true });
  assert.equal(graphicsFlags('?gl&stages=0', {}).stages, false);
  assert.equal(graphicsFlags('?stages=0', { graphics: '3d' }).stages, false, 'the address lost to the setting');
  // one piece alone, with the 2D fighters
  assert.deepEqual(graphicsFlags('?sharp', {}), { ...ALL_OFF, sharp: true });
  assert.deepEqual(graphicsFlags('?fx', {}), { ...ALL_OFF, fx: true });
  assert.deepEqual(graphicsFlags('?stages', {}), { ...ALL_OFF, stages: true });
});

test('a reload after a change drops the graphics flags and keeps the rest', () => {
  assert.equal(withoutGraphicsParams('?gl&debug=1&stages=0&perf'), '?debug=1');
  assert.equal(withoutGraphicsParams('?gl=max'), '');
  assert.equal(withoutGraphicsParams(''), '');
  assert.equal(withoutGraphicsParams('?c=abc&fx'), '?c=abc');
});
