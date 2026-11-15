// Which renderer pieces a page load turns on (src/graphics.js). The game is
// 3D, and only 3D (v3.22.4, the owner's call: "let's only have 3d"): the 3D
// fighters wherever the browser can draw them, and where it cannot, a notice
// rather than the 2D game (main.js). The address cannot turn the 3D fighters
// off any more; it still turns the other pieces on and off for the lab.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { graphicsFlags } from '../src/graphics.js';

const ALL_OFF = { gl: false, ids: [], sculpts: false, perf: false, sharp: false, stages: false, fx: false };

const ALL_3D = { gl: true, ids: [], sculpts: true, perf: false, sharp: true, stages: true, fx: true };

test('the game is 3D wherever it can be drawn, whatever the address asks', () => {
  assert.deepEqual(graphicsFlags(''), ALL_3D);
  assert.deepEqual(graphicsFlags('?debug=1'), ALL_3D);
  assert.deepEqual(graphicsFlags(undefined), ALL_3D);
  // ?gl=0 gave the 2D game, and ?gl=max,dex 3D for those two alone
  assert.deepEqual(graphicsFlags('?gl=0'), ALL_3D, '?gl=0 still turns the 3D fighters off');
  assert.deepEqual(graphicsFlags('?gl=max,dex'), ALL_3D, '?gl=max,dex still leaves the others in 2D');
  // a saved 2D choice (v3.13 to v3.22.1) is not read either
  assert.equal(graphicsFlags.length, 1, 'graphicsFlags takes the settings again');
  assert.deepEqual(graphicsFlags('', { graphics: '2d' }), ALL_3D);
  // and where it cannot be drawn, nothing is on: main.js shows the notice
  assert.deepEqual(graphicsFlags('', { webgl2: false }), ALL_OFF);
  assert.deepEqual(graphicsFlags('?gl', { webgl2: false }), ALL_OFF, 'the address turned on 3D that cannot be drawn');
});

test('where 3D cannot be drawn the page says so, and Settings offers no 2D', () => {
  const page = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(page, /<div id="no3d" class="no3d hidden" role="alert">/);
  assert.match(page, /needs WebGL2/);
  assert.ok(!/id="setGfx/.test(page), 'Settings still has the graphics button or its 2D line');
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(main, /const on3D = gfx\.gl && enable3D\(\{ ids: gfx\.ids, timing: gfx\.perf \}\);\s*(\/\/[^\n]*\n\s*)*\$\('no3d'\)\.classList\.toggle\('hidden', !!on3D\);/);
  assert.ok(!/graphicsFlags\([^)]*Save\.settings/.test(main), 'the game still reads the saved choice');
});

test('the address still turns the lab pieces on and off', () => {
  assert.deepEqual(graphicsFlags('?perf'), { ...ALL_3D, perf: true });
  assert.equal(graphicsFlags('?stages=0').stages, false);
  assert.equal(graphicsFlags('?fx=0').fx, false);
  assert.equal(graphicsFlags('?sharp=0').sharp, false);
  assert.deepEqual(graphicsFlags('?stages', { webgl2: false }), { ...ALL_OFF, stages: true });
});

// In 3D the roster wear their sculpted models; the address can still put
// them in the founder model, or in the athlete bodies on test.
test('3D is the sculpted roster, unless the address asks for another body', () => {
  assert.equal(graphicsFlags('?sculpts=0').sculpts, false);
  assert.equal(graphicsFlags('?athlete').sculpts, false, 'the sculpts hid the athlete bodies');
  assert.equal(graphicsFlags('?athlete&sculpts').sculpts, true);
  assert.equal(graphicsFlags('?sculpts', { webgl2: false }).sculpts, false, 'sculpts without 3D fighters');
});
