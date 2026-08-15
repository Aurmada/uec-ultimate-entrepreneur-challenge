// AI behaviour driven through a real Game — not just the decision functions
// in isolation. ai.js has shipped decision branches that looked reasonable in
// a unit test (a stance string comes back, a threshold trips) and then did
// nothing, or worse, locked the whole controller, once actually stepped
// against a live opponent. This file drives the real pad path the way
// rosterMoves.test.js drives human input, but for the AIController side.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/engine/game.js';
import { AIController } from '../src/engine/ai.js';
import { FIGHTERS } from '../src/data/fighters.js';

const STUB_HUD = new Proxy({}, { get: () => () => {} });
const STUB_ARENA = { id: 'test', name: 'TEST', draw() {}, mood: 'none' };
const EMPTY = {
  left: false, right: false, up: false, down: false, block: false,
  slap: false, punch: false, kick: false, launch: false,
  special: false, super: false, bomb: false, dash: false, steal: false,
};
const idler = () => ({ isHuman: false, update(f) { f.pad = { ...EMPTY }; } });

// scam's special (ALIGNMENT SHIFT) is the only shipped `type: 'stance'`
// special, so it is the one archetype that exercises the AI's stance branch
// in decide() at all. A passive dummy opponent never attacks or blocks, so
// nothing but the AI's own decisions can produce an attack or any movement.
test('an AI whose special is a stance toggle still attacks and moves', () => {
  const scam = FIGHTERS.find(f => f.id === 'scam');
  const dummy = FIGHTERS.find(f => f.id === 'zara');
  const game = new Game({
    p1: { def: scam, controller: new AIController('founder', scam) },
    p2: { def: dummy, controller: idler() },
    arena: STUB_ARENA, mode: 'solo', difficulty: 'founder',
    hud: STUB_HUD, onEnd: () => {}, seed: 20260814,
  });
  const [ai] = game.fighters;
  const x0 = ai.x;
  let attacks = 0;
  let prevState = ai.state;
  for (let i = 0; i < 900; i++) {
    game.update(1 / 60);
    if (ai.state === 'attack' && prevState !== 'attack') attacks++;
    prevState = ai.state;
  }
  const walked = Math.abs(ai.x - x0);
  assert.ok(attacks > 0,
    `AI-controlled SCAM ALT never attacked over 900 frames (walked ${walked}px) — `
    + 'the stance branch in decide() is locking the controller');
  assert.ok(walked > 0, 'AI-controlled SCAM ALT never moved over 900 frames');
});
