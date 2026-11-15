// Which renderer pieces a page load turns on (src/graphics.js). One version,
// 3D, wherever the browser can draw it (since v3.22.2, the owner's call), and
// otherwise the classic 2D game, every flag off. The address still turns the
// pieces on and off for the lab; nothing a player saved does.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { graphicsFlags } from '../src/graphics.js';

const ALL_OFF = { gl: false, ids: [], sculpts: false, perf: false, sharp: false, stages: false, fx: false };

const ALL_3D = { gl: true, ids: [], sculpts: true, perf: false, sharp: true, stages: true, fx: true };

test('the game is 3D, or the classic one without WebGL2', () => {
  assert.deepEqual(graphicsFlags(''), ALL_3D);
  assert.deepEqual(graphicsFlags('?debug=1'), ALL_3D);
  assert.deepEqual(graphicsFlags(undefined), ALL_3D);
  const none = { webgl2: false };
  assert.deepEqual(graphicsFlags('', none), ALL_OFF);
  assert.deepEqual(graphicsFlags('?debug=1', none), ALL_OFF);
  assert.deepEqual(graphicsFlags(undefined, none), ALL_OFF);
  // the address turns 3D off for the lab, to see the fallback
  assert.deepEqual(graphicsFlags('?gl=0'), ALL_OFF);
});

// From v3.13 to v3.22.1, Settings had a 2D or 3D choice and saved it as
// settings.graphics. The choice is gone; a saved 2D is not read, and Settings
// has no button for it.
test('there is no 2D choice: not in Settings, and not in what a player saved', () => {
  assert.equal(graphicsFlags.length, 1, 'graphicsFlags takes the settings again');
  assert.deepEqual(graphicsFlags('', { graphics: '2d' }), ALL_3D, 'a saved 2D choice still turns 3D off');
  const page = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(!/id="setGfx"/.test(page), 'Settings still has the GRAPHICS button');
  assert.ok(!/GRAPHICS:/.test(page), 'Settings still offers 2D or 3D');
  const screens = readFileSync(new URL('../src/ui/screens.js', import.meta.url), 'utf8');
  assert.ok(!/setSetting\('graphics'/.test(screens), 'Settings still saves a graphics choice');
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.ok(!/graphicsFlags\([^)]*Save\.settings/.test(main), 'the game still reads the saved choice');
});

test('the address still works as before, and wins where it names a piece', () => {
  assert.deepEqual(graphicsFlags('?gl=max,dex&perf'),
    { gl: true, ids: ['max', 'dex'], sculpts: true, perf: true, sharp: true, stages: true, fx: true });
  assert.equal(graphicsFlags('?gl&stages=0').stages, false);
  assert.equal(graphicsFlags('?stages=0').stages, false);
  // one piece alone, with the 2D fighters
  assert.deepEqual(graphicsFlags('?gl=0&sharp'), { ...ALL_OFF, sharp: true });
  assert.deepEqual(graphicsFlags('?gl=0&fx'), { ...ALL_OFF, fx: true });
  assert.deepEqual(graphicsFlags('?stages', { webgl2: false }), { ...ALL_OFF, stages: true });
});

// In 3D the roster wear their sculpted models; the address can still put
// them back in the founder model, or in the athlete bodies on test, and the
// sculpts never come on without the 3D fighters.
test('3D is the sculpted roster, unless the address asks for another body', () => {
  assert.equal(graphicsFlags('?gl&sculpts=0').sculpts, false);
  assert.equal(graphicsFlags('?sculpts=0').sculpts, false);
  assert.equal(graphicsFlags('?gl&athlete').sculpts, false, 'the sculpts hid the athlete bodies');
  assert.equal(graphicsFlags('?gl=0&sculpts').sculpts, false, 'sculpts without 3D fighters');
  assert.equal(graphicsFlags('?gl&athlete&sculpts').sculpts, true);
});
