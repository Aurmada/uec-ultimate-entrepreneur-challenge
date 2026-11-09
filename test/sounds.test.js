// A briefcase dropped onto the stage played the block's tick as it hit the
// floor, as if somebody had blocked. It has a thump of its own now, and a
// block still sounds like a block.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game } from '../src/engine/game.js';
import { FIGHTERS } from '../src/data/fighters.js';

const STUB_HUD = new Proxy({}, { get: () => () => {} });
const idler = () => ({ isHuman: false, update(f) { f.pad = {}; } });

test('a dropped briefcase lands with its own sound, not the block', () => {
  const byId = (id) => FIGHTERS.find((d) => d.id === id);
  const game = new Game({
    p1: { def: byId('bozo'), controller: idler() }, p2: { def: byId('kai'), controller: idler() },
    arena: { id: 'garage', name: 'GARAGE', bg: ['#000', '#000'], floor: '#111' }, mode: 'solo', difficulty: 'intern',
    hud: STUB_HUD, onEnd: () => {}, seed: 7,
  });
  const played = [];
  game.audio = { sfx: (n) => played.push(n) };
  for (let i = 0; i < 600 && game.state !== 'fighting'; i++) game.update(1 / 60);
  game.drops.length = 0;
  game.dropClock = 0;
  game.nextDropAt = 0;
  played.length = 0;
  let landed = false;
  for (let i = 0; i < 600 && !landed; i++) {
    game.update(1 / 60);
    landed = game.drops.some((d) => d.landed);
  }
  assert.ok(landed, 'no briefcase dropped');
  assert.ok(played.includes('drop'), `the landing played ${JSON.stringify(played)}`);
  assert.ok(!played.includes('block'), 'the landing played the block');
  const audio = readFileSync(new URL('../src/engine/audio.js', import.meta.url), 'utf8');
  assert.match(audio, /\n\s+drop: +\(\) => \{/, 'there is no drop sound');
});
