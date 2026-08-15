// Every move of every fighter, fired in a live Game.
//
// The suite already checks that a character's numbers are well-formed
// (schema.test) and correctly priced (commandNormals.test). Neither notices a
// move that validates perfectly and then does nothing when you press the
// button — and that is the failure this project keeps hitting: command
// normals, the counter archetype, sim versioning and the Incubator each
// shipped valid and silently broken, found only by using them.
//
// So this drives the real pad path against a real Game. Two traps are baked in
// deliberately, because both cost real debugging time to find:
//
//   1. A round opens in `intro`. Inputs pressed then are discarded, so a
//      harness that presses on frame 0 reports the ENTIRE roster as dead.
//   2. Not every move sets `attack`. A dash changes state, a super sets a
//      buff timer, a steal moves meter. Watching `attack` alone reports those
//      as dead too.
//
// Assertions are "something happened", never exact damage — the numbers are
// balance and belong in config, not pinned here.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/engine/game.js';
import { FIGHTERS } from '../src/data/fighters.js';
import { METER } from '../src/config.js';
import { FIGHTER_STATE } from '../src/engine/fighterState.js';

// ALIGNMENT SHIFT (scam's special, fighter-state-foundation 2026-08-14) deals
// no damage, spawns no projectile and places no trap by design — it is a
// toggle. The old "did something" check (dmg > 0 || projectile || trap) can
// never see that, and cannot be patched with `archetype === 'stance'` either:
// that would re-open exactly the hole this file exists to close (see the file
// header) by letting a FUTURE stance move that does nothing sail through on
// its name alone rather than its behaviour.
//
// So the check is broadened structurally instead: snapshot every registry key
// that represents a real simulation effect, and compare before/after. `stateT`
// is deliberately excluded even though it is simulation state — it (and the
// other EFFECT_NOISE keys below) tick from merely BEING in an attack, which is
// precisely what the three moves in the file header did: play the animation,
// print the popup, change nothing that matters. Including it would make this
// check pass for a dead move exactly like the old one did.
const EFFECT_NOISE = new Set([
  'stateT', 'energy',                          // animation lifecycle; cost (checked separately)
  'walkPhase', 'movingBack', 'moveVx',          // movement intent/animation, not an effect
  'airborne', 'airAttackUsed',                  // recomputed from physics, not set by a move
  'comboDropT', 'comboTaken',                   // chain bookkeeping, implied by damage already
  'flashT',                                     // hit-flash render timer
]);
const EFFECT_KEYS = FIGHTER_STATE.map((e) => e.key).filter((k) => !EFFECT_NOISE.has(k));

const STUB_HUD = new Proxy({}, { get: () => () => {} });
const STUB_ARENA = { id: 'test', name: 'TEST', draw() {}, mood: 'none' };

const EMPTY = {
  left: false, right: false, up: false, down: false, block: false,
  slap: false, punch: false, kick: false, launch: false,
  special: false, super: false, bomb: false, dash: false, steal: false,
};

const idler = () => ({ isHuman: false, update(f) { f.pad = { ...EMPTY }; } });

// A real button press: down for a few frames, then released. Forward is held a
// touch longer so a command normal still resolves on the frame the button lands.
function presser(keys, hold = 4) {
  let i = 0;
  return { isHuman: false, update(f) {
    const on = i < hold; i++;
    f.pad = { ...EMPTY };
    for (const k of keys) f.pad[k] = on;
    if (keys.includes('right')) f.pad.right = i < hold + 2;
  } };
}
const holder = (keys) => ({ isHuman: false, update(f) {
  f.pad = { ...EMPTY };
  for (const k of keys) f.pad[k] = true;
} });

// Builds a match and runs it up to the first live frame of the round.
function liveMatch(def, opponentId = 'zara') {
  const game = new Game({
    p1: { def, controller: idler() },
    p2: { def: FIGHTERS.find(f => f.id === opponentId), controller: idler() },
    arena: STUB_ARENA, mode: 'solo', difficulty: 'founder',
    hud: STUB_HUD, onEnd: () => {}, seed: 20260802,
  });
  for (let i = 0; i < 600 && game.state !== 'fighting'; i++) game.update(1 / 60);
  assert.equal(game.state, 'fighting', 'round never went live');
  return game;
}

// Presses `keys` at `gap` distance and reports everything that moved.
function fire(def, keys, { energy = 0, gap = 90, dummyEnergy = 0, dummy = idler(), frames = 100 } = {}) {
  const game = liveMatch(def);
  const [a, b] = game.fighters;
  a.controller = presser(keys);
  b.controller = dummy;
  a.x = 480; b.x = 480 + gap; a.y = b.y = 480;
  a.energy = energy; b.energy = dummyEnergy;
  const hp0 = b.hp, ahp0 = a.hp, x0 = a.x;
  const effectBefore = EFFECT_KEYS.map((k) => a[k]);
  const states = new Set();
  let spent = 0, unicorn = 0, projectile = false, trap = false, drained = 0;
  for (let i = 0; i < frames; i++) {
    const e0 = a.energy, be0 = b.energy;
    game.update(1 / 60);
    if (a.energy < e0) spent += e0 - a.energy;
    if (b.energy < be0) drained += be0 - b.energy;
    unicorn = Math.max(unicorn, a.unicornT || 0);
    states.add(a.state);
    if ((game.projectiles || []).length) projectile = true;
    if ((game.traps || []).length) trap = true;
    b.x = a.x + gap; b.vx = 0;           // hold range; knockback is not a dud move
  }
  const stateChanged = EFFECT_KEYS.some((k, i) => a[k] !== effectBefore[i]);
  return {
    dmg: hp0 - b.hp, selfDmg: ahp0 - a.hp, spent, unicorn, projectile, trap,
    drained, states, moved: Math.abs(a.x - x0), stateChanged,
  };
}

for (const def of FIGHTERS) {
  test(`${def.id}: every basic connects`, () => {
    for (const basic of ['slap', 'punch', 'kick', 'launch']) {
      const r = fire(def, [basic]);
      assert.ok(r.dmg > 0, `${def.id} ${basic} did no damage to a dummy in range`);
    }
  });

  test(`${def.id}: meter moves spend and do something`, () => {
    const sp = fire(def, ['special'], { energy: METER.MAX });
    assert.equal(sp.spent, METER.SPECIAL_COST, `${def.id} special did not charge meter`);
    // A special passes by dealing damage, spawning a projectile, placing a
    // trap, OR leaving some other real mark on simulation state (stateChanged
    // — see EFFECT_KEYS above). scam's ALIGNMENT SHIFT is a toggle: it clears
    // this bar via stanceId changing, not via any of the first three.
    assert.ok(sp.dmg > 0 || sp.projectile || sp.trap || sp.stateChanged,
      `${def.id} special spent ${METER.SPECIAL_COST} and produced nothing`);

    const bomb = fire(def, ['bomb'], { energy: METER.MAX });
    assert.equal(bomb.spent, METER.BOMB_COST, `${def.id} bomb did not charge meter`);
    assert.ok(bomb.dmg > 0 || bomb.projectile || bomb.trap,
      `${def.id} bomb spent ${METER.BOMB_COST} and produced nothing`);

    // A super is a buff, not a swing — it never sets `attack`.
    const sup = fire(def, ['super'], { energy: METER.MAX });
    assert.equal(sup.spent, METER.SUPER_COST, `${def.id} super did not charge meter`);
    assert.ok(sup.unicorn > 0, `${def.id} super spent full meter without granting unicorn`);
  });

  test(`${def.id}: dash travels and steal drains`, () => {
    // A dash changes state and position; it has no hitbox to watch.
    const d = fire(def, ['dash']);
    assert.ok(d.states.has('dash'), `${def.id} never entered the dash state`);
    assert.ok(d.moved > 50, `${def.id} dash moved only ${d.moved.toFixed(0)}px`);

    // Steal needs something to take — against an empty opponent it correctly
    // does nothing, which is why the dummy is charged here.
    const s = fire(def, ['steal'], { gap: 50, dummyEnergy: METER.MAX });
    assert.ok(s.drained > 0, `${def.id} steal took nothing from a charged opponent`);
  });

  const cmds = def.commandNormals || [];
  if (cmds.length) {
    test(`${def.id}: every command normal does its job`, () => {
      for (const cn of cmds) {
        const button = cn.slot.split('+')[1];
        if (cn.archetype === 'counter') {
          // A counter has nothing to answer unless the opponent commits, so it
          // only proves itself against a dummy that is actually swinging. Note
          // NO_SWING covers counter AND trap, but that set is about PRICING —
          // a trap is placed whether or not anyone attacks, and an attacking
          // opponent actually beats it out of its startup.
          const r = fire(def, ['right', button], {
            gap: 65, dummy: holder(['punch']), frames: 200,
          });
          assert.ok(r.dmg > 0,
            `${def.id} ${cn.slot} (counter) never punished an attacking opponent`);
        } else {
          // Command normals are tuned tighter than the basics they replace
          // (reach 60-78 against a basic's 78-106), so they are tested at a
          // range they are actually meant to work at.
          const r = fire(def, ['right', button], { gap: 60 });
          assert.ok(r.dmg > 0 || r.projectile || r.trap,
            `${def.id} ${cn.slot} (${cn.archetype}) did nothing`);
        }
      }
    });
  }
}
