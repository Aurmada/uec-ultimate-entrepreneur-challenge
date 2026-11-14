// The fight's drawing resolution on a slow phone (engine/resolution.js,
// RESOLUTION in config.js). Round seven of the phone test found a budget
// Android at 21 fps drawn at 2x and 31 at 1x: the game steps down by itself.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ResolutionGovernor, resolutionSteps } from '../src/engine/resolution.js';
import { RESOLUTION } from '../src/config.js';

// Frames for `ms` ms, `gap` ms apart, or as far apart as `gap(scale)` says at
// the scale being drawn; the scales it changed to, in order.
const feed = (g, gap, ms) => {
  const out = [];
  const at = typeof gap === 'function' ? gap : () => gap;
  for (let t = 0; t < ms;) {
    const d = at(g.scale);
    t += d;
    const s = g.sample(d);
    if (s) out.push(s);
  }
  return out;
};
// A phone's frame rate at each scale, as the phone test measured it.
const phone = (fps) => (scale) => 1000 / fps[scale];
const AHLO_3D = phone({ 2: 21, 1.5: 26, 1: 31 });          // round eight, 1.5 between
const IPHONE_2D = phone({ 2: 19.1, 1.5: 19.8, 1: 20.6 });  // round eight
const CAPPED_30 = phone({ 2: 30, 1.5: 30, 1: 30 });        // Low Power Mode

test('the steps start at the device ratio, capped at 2, and go down to 1', () => {
  assert.deepEqual(resolutionSteps(3), [2, 1.5, 1]);
  assert.deepEqual(resolutionSteps(2), [2, 1.5, 1]);
  assert.deepEqual(resolutionSteps(1.5), [1.5, 1]);
  assert.deepEqual(resolutionSteps(1.25), [1.25, 1]);
  assert.deepEqual(resolutionSteps(1), [1]);
  assert.deepEqual(resolutionSteps(undefined), [1]);
});

test('a phone holding 60, or 50, is never touched', () => {
  const g = new ResolutionGovernor(2);
  assert.deepEqual(feed(g, 1000 / 60, 60000), []);
  assert.deepEqual(feed(g, 1000 / 51, 60000), []);
  assert.equal(g.scale, 2);
});

test('a phone at 21 fps steps down to 1.5, then to 1, and stops there', () => {
  const g = new ResolutionGovernor(2);
  assert.deepEqual(feed(g, AHLO_3D, 60000), [1.5, 1]);
  assert.equal(g.scale, 1);
  // and judges nothing in the first SETTLE ms of a match, or of a new scale
  const h = new ResolutionGovernor(2);
  assert.deepEqual(feed(h, 1000 / 21, RESOLUTION.SETTLE + RESOLUTION.WINDOW - 60), []);
});

// Round eight's iPhone 12 Pro drew 2D at 19 fps whatever the resolution, and
// Low Power Mode holds a phone to 30: there a step blurs the fight for nothing.
test('a step that does not raise the frame rate is taken back, and nothing more is judged', () => {
  for (const [name, fps] of [['the iPhone in 2D', IPHONE_2D], ['a phone held to 30', CAPPED_30]]) {
    const g = new ResolutionGovernor(2);
    assert.deepEqual(feed(g, fps, 60000), [1.5, 2], name);
    assert.equal(g.scale, 2, name);
    g.restart();                           // the next match
    assert.deepEqual(feed(g, fps, 60000), [], `${name}: judged again after a step was taken back`);
  }
  // a step that pays only a little is not worth the softness either
  const g = new ResolutionGovernor(2);
  assert.deepEqual(feed(g, phone({ 2: 40, 1.5: 40 * (1 + RESOLUTION.MIN_GAIN) - 1 }), 60000), [1.5, 2]);
  const h = new ResolutionGovernor(2);
  assert.deepEqual(feed(h, phone({ 2: 40, 1.5: 40 * (1 + RESOLUTION.MIN_GAIN) + 1, 1: 60 }), 60000), [1.5, 1]);
});

test('it never steps back up, and keeps its step into the next match', () => {
  const g = new ResolutionGovernor(2);
  feed(g, 1000 / 21, RESOLUTION.SETTLE + RESOLUTION.WINDOW + 100);
  assert.equal(g.scale, 1.5);
  g.restart();                             // a new match
  assert.deepEqual(feed(g, 1000 / 60, 60000), []);
  assert.equal(g.scale, 1.5);
});

test('a stall (a tab switch, a pause) is not the phone being slow', () => {
  const g = new ResolutionGovernor(2);
  for (let i = 0; i < 200; i++) { g.sample(1000 / 60); g.sample(RESOLUTION.STALL + 1); }
  assert.equal(g.scale, 2);
  assert.equal(g.sample(0), null);
  assert.equal(g.sample(NaN), null);
});

test('the game sizes its canvas from the governor and feeds it only a round being fought', () => {
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(main, /setGameResolution\(resolution\.scale\);/);
  assert.match(main, /canvas\.width = Math\.round\(STAGE\.W \* scale\);\s*canvas\.height = Math\.round\(STAGE\.H \* scale\);\s*gctx\.setTransform\(scale, 0, 0, scale, 0, 0\);/);
  assert.match(main, /const judged = fightActive && currentGame\?\.state === 'fighting' && !currentGame\.paused && !document\.hidden;\s*if \(judged && !fixedRes\) \{\s*const scale = resolution\.sample\(gap\);\s*if \(scale\) setGameResolution\(scale\);/);
  assert.equal((main.match(/resolution\.restart\(\);[^\n]*\n\s*currentGame = new Game\(\{/g) || []).length, 2, 'a match, solo or online, is not judged afresh');
});
