// Block and parry are two different answers to the same button.
//
// A parry is a read: start blocking no more than PARRY.WINDOW before the hit
// and the attacker staggers while you bank energy. A block is a commitment:
// hold it and you take chip instead. From v1.4 to v3.8 the two were the same
// thing. The actionable branch re-entered `setState('block')` on every frame
// the button was held, which reset `stateT` to 0, and nothing in that branch
// advanced it either, so `stateT <= PARRY.WINDOW` was always true and every
// held block parried. Chip damage, and the stance and winded multipliers
// applied to it, could never happen.
//
// These drive the real Game rather than poking Fighter fields, because the
// bug lived in how the state machine and the hit resolver meet.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/engine/game.js';
import { getFighter } from '../src/data/fighters.js';
import { PARRY, METER } from '../src/config.js';

const STUB_HUD = new Proxy({}, { get: () => () => {} });
const STUB_ARENA = { id: 'test', name: 'TEST', draw() {}, mood: 'none' };
const EMPTY = {
  left: false, right: false, up: false, down: false, block: false,
  slap: false, punch: false, kick: false, launch: false,
  special: false, super: false, bomb: false, dash: false, steal: false,
};
const FRAME = 1 / 60;

// A controller that plays a per-frame function of its own frame counter,
// counted from the first LIVE frame (the round opens in `intro`, which
// discards input, and a script that starts counting there presses nothing).
function scripted(fn) {
  let i = -1;
  return { isHuman: false, update(f, game) {
    if (!game || game.state === 'fighting') i++;
    f.pad = { ...EMPTY, ...(i >= 0 ? fn(i) : {}) };
  } };
}

// Attacker on the left punches once on frame `punchAt`; the defender follows
// `blockFn`. Returns what the defender and attacker went through.
function exchange({ punchAt, blockFn, frames = 90 }) {
  const game = new Game({
    p1: { def: getFighter('zara'), controller: scripted((i) => ({ punch: i >= punchAt && i < punchAt + 3 })) },
    p2: { def: getFighter('kai'), controller: scripted(blockFn) },
    arena: STUB_ARENA, mode: 'solo', difficulty: 'founder',
    hud: STUB_HUD, onEnd: () => {}, seed: 20260913,
  });
  for (let i = 0; i < 600 && game.state !== 'fighting'; i++) game.update(FRAME);
  assert.equal(game.state, 'fighting', 'round never went live');
  const [att, def] = game.fighters;
  att.x = 480; def.x = 550; att.y = def.y = 480;
  att.energy = 0; def.energy = 0;
  const hp0 = def.hp;
  let staggered = false, blocked = false;
  for (let i = 0; i < frames; i++) {
    game.update(FRAME);
    if (att.state === 'hitstun' && att.stunT === PARRY.STAGGER) staggered = true;
    if (def.state === 'block') blocked = true;
    def.x = att.x + 70; def.vx = 0;          // hold range; pushback is not a miss
  }
  return { lost: hp0 - def.hp, staggered, blocked, defEnergy: def.energy, attEnergy: att.energy };
}

test('a block held well before the hit takes chip, not a parry', () => {
  const r = exchange({ punchAt: 30, blockFn: () => ({ block: true }) });
  assert.ok(r.blocked, 'the fixture must actually be blocking');
  assert.equal(r.staggered, false, 'a half-second-old block staggered the attacker: that is a parry');
  assert.equal(r.defEnergy, 0, 'a held block banked parry energy');
  assert.ok(r.lost >= 1, 'a held block took no chip at all');
  assert.ok(r.lost <= 2, `a blocked punch cost ${r.lost} HP, which is a clean hit, not chip`);
  assert.equal(r.attEnergy, METER.CHIP_DEAL, 'chip pays the attacker CHIP_DEAL');
});

test('a block started just before the hit parries', () => {
  // The punch starts on frame 30 and its hitbox comes out a few frames later;
  // pressing block on the same frame lands the hit well inside the window.
  const r = exchange({ punchAt: 30, blockFn: (i) => ({ block: i >= 30 }) });
  assert.equal(r.lost, 0, 'a parry took damage');
  assert.ok(r.staggered, 'a parry did not stagger the attacker');
  assert.equal(r.defEnergy, PARRY.ENERGY, 'a parry did not bank its energy');
});

test('letting go and pressing again opens a fresh parry window', () => {
  // Held for half a second, released for two frames, pressed again as the
  // punch starts. The long hold must not count against the new press.
  const r = exchange({ punchAt: 32, blockFn: (i) => ({ block: i < 30 || i >= 32 }) });
  assert.equal(r.lost, 0, 'a re-pressed block took damage');
  assert.ok(r.staggered, 'a re-pressed block did not parry');
});
