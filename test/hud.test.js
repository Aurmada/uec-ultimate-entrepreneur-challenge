// The HUD, drawn into stand-in elements: what it shows, not how it looks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HUD, meterKeysFor } from '../src/ui/hud.js';
import { METER } from '../src/config.js';

class El {
  constructor() { this.textContent = ''; this.style = {}; this.offsetWidth = 1; this.set = new Set(); this.children = []; }
  get classList() {
    const s = this.set;
    return {
      add: (...c) => c.forEach((x) => s.add(x)),
      remove: (...c) => c.forEach((x) => s.delete(x)),
      contains: (c) => s.has(c),
      toggle: (c, on) => { if (on === undefined ? !s.has(c) : on) s.add(c); else s.delete(c); },
    };
  }
  animate() {}
}
const pair = () => [new El(), new El()];
const hudWith = (mode, localIdx = 0) => {
  const h = new HUD();
  h.el = { hp: pair(), ghost: pair(), en: pair(), enTrack: pair(), enSpark: pair(), rwTrack: pair(), rw: pair(), pips: pair(), timer: new El(), combo: pair(), costBtns: [] };
  h.touch = false;
  h.comboOn = [false, false];
  h.lastRunway = [null, null];
  h.meterKeys = meterKeysFor(mode, localIdx);
  return h;
};
const fighter = (o = {}) => ({ hp: 100, maxHp: 100, energy: 0, usesRunway: false, comboTaken: 0, ...o });
const game = (f0, f1, o = {}) => ({ fighters: [f0, f1], roundWins: [0, 0], timer: 50, state: 'fighting', ...o });

// "3 HITS!" stayed on screen through the rest of the round, and into the
// next: the pop animation holds it (`forwards`) and only a new match cleared it.
test('a combo count goes when the combo is over', () => {
  const h = hudWith('solo'), victim = fighter({ comboTaken: 3 });
  h.combo(0, 3);
  h.update(game(fighter(), victim));
  assert.ok(h.el.combo[0].classList.contains('show') && !h.el.combo[0].classList.contains('out'), 'the count is gone while the combo runs');
  victim.comboTaken = 0;                       // dropped, or a new round
  h.update(game(fighter(), victim));
  assert.ok(h.el.combo[0].classList.contains('out'), 'the count stays up after the combo');
  // and the next combo shows again
  victim.comboTaken = 2;
  h.combo(0, 2);
  assert.ok(!h.el.combo[0].classList.contains('out'));
});

// The meter names the key to press only on a bar someone here plays, with
// that side's own key: the AI's bar named the key U as if to the player, and
// in versus P1's bar named P2's keys.
test('only a human side is told which key fires its meter, and its own key', () => {
  const full = fighter({ energy: METER.MAX }), half = fighter({ energy: METER.SPECIAL_COST });
  const text = (mode, localIdx, f0, f1) => { const h = hudWith(mode, localIdx); h.update(game(f0, f1)); return h.el.enSpark.map((e) => e.textContent); };
  assert.deepEqual(text('solo', 0, full, full), ['🦄 U', ''], 'solo: the AI is told what to press');
  assert.deepEqual(text('solo', 0, half, half), ['⚡ L', '']);
  assert.deepEqual(text('versus', 0, full, half), ['🦄 G', '⚡ L'], "versus: P1's bar names P2's key");
  assert.deepEqual(text('online', 1, half, full), ['', '🦄 U'], 'online: the far player is labelled');
  assert.deepEqual(text('solo', 0, fighter(), fighter()), ['', ''], 'an empty meter is labelled');
});
