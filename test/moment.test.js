// v3.9.4: the AI picks its moment.
//
// Measured with lab/balance.js (AI against AI at Champion, every ordered pair
// of the roster): Carl's ASSET SEIZURE touched nobody four times in five,
// because a rival who saw it coming jumped it or it was thrown from out of
// reach, and Elo's PLATFORM BURN was parried three and a half times a match,
// because a rival who saw it coming parried it. Under both sat two reads the
// AI got wrong for everyone: a swing that had already missed still read as
// incoming, so the AI guarded through the whole of a whiff's recovery, and a
// held guard presses nothing, so a parry's stagger went unpunished. And the
// guard through Cathie's recovery had been hiding a third: of FUNDING ROUND's
// three coins the AI only ever saw the first.
//
// Each test here fails without its fix.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/engine/game.js';
import { AIController } from '../src/engine/ai.js';
import { FIGHTERS } from '../src/data/fighters.js';
import { METER, PARRY, AI_LEVELS } from '../src/config.js';
import { runMatch } from '../lab/balance.js';

const STUB_HUD = new Proxy({}, { get: () => () => {} });
const STUB_ARENA = { id: 'test', name: 'TEST', draw() {}, mood: 'none' };
const EMPTY = {
  left: false, right: false, up: false, down: false, block: false,
  slap: false, punch: false, kick: false, launch: false,
  special: false, super: false, bomb: false, dash: false, steal: false,
};
const idler = () => ({ isHuman: false, update(f) { f.pad = { ...EMPTY }; } });
const byId = (id) => FIGHTERS.find(f => f.id === id);
const ROSTER = FIGHTERS.filter(f => !f.base);

// A live round, both sides idle, with the fighters placed. The AI under test
// is attached by the caller, so nothing moves until it decides.
function staged(aiId, rivalId, { aiX = 400, rivalX = 480, level = 'mogul' } = {}) {
  const def = byId(aiId), rival = byId(rivalId);
  const game = new Game({
    p1: { def, controller: idler() }, p2: { def: rival, controller: idler() },
    arena: STUB_ARENA, mode: 'solo', difficulty: level,
    hud: STUB_HUD, onEnd: () => {}, seed: 20261028,
  });
  for (let i = 0; i < 600 && game.state !== 'fighting'; i++) game.update(1 / 60);
  const [ai, opp] = game.fighters;
  ai.x = aiX; opp.x = rivalX;
  ai.energy = 0; opp.energy = 0;
  const c = new AIController(level, def);
  ai.controller = c;
  return { game, ai, opp, c };
}

function pinned(value, fn) {
  const real = Math.random;
  Math.random = () => value;
  try { return fn(); } finally { Math.random = real; }
}

// A value past the hesitation roll (Champion mistake 0.05), and under every
// other gate a Champion has: block, notice, gamble and the aggression roll.
const PAST_HESITATION = 0.1;

// ---------------------------------------------------------- moveFrames

// Only the moves the AI measures: the ones that wait for their moment. A rush
// or a teleport has its reach reshaped by shapeAttack and is never read.
const MEASURED_CMDS = new Set(['strike', 'aoe', 'grab']);
const MEASURED_SPECIALS = new Set(['grab', 'aoe', 'burn']);

test('the AI reads a waiting move\'s startup and reach as the engine builds them', () => {
  let checked = 0;
  for (const def of FIGHTERS) {
    const moves = [...(def.commandNormals || []).filter(cn => cn && cn.slot && MEASURED_CMDS.has(cn.archetype)), null];
    for (const cn of moves) {
      const { game, ai, c } = staged(def.id, 'zara', { aiX: 300, rivalX: 700 });
      if (!cn && !MEASURED_SPECIALS.has(ai.special.type)) continue;
      checked++;
      ai.energy = METER.MAX;
      if (cn) ai.startAttack(cn, game);
      else ai.startSpecial(game);
      const want = c.moveFrames(ai, cn);
      const name = `${def.id} ${cn ? cn.displayName : ai.special.name}`;
      assert.ok(ai.attack, `${name} built no attack`);
      assert.ok(Math.abs(ai.attack.startup - want.startup) < 1e-9,
        `${name}: the engine starts it in ${ai.attack.startup}, the AI reads ${want.startup}`);
      assert.ok(Math.abs((ai.attack.reach || 82) - want.reach) < 1e-9,
        `${name}: the engine reaches ${ai.attack.reach}, the AI reads ${want.reach}`);
    }
  }
  assert.ok(checked >= 7, `only ${checked} moves checked`);
});

// ------------------------------------------------------------ incoming

test('an AI does not raise its guard against a swing that has already missed', () => {
  // The rival's punch whiffed and is in its recovery, 150 px away: nothing is
  // coming. The guard used to go up for the rest of that recovery and more.
  const raised = ROSTER.filter(def => {
    const { game, ai, opp, c } = staged(def.id, 'zara', { aiX: 330, rivalX: 480 });
    opp.state = 'attack';
    opp.attack = { kind: 'punch', startup: 0.05, active: 0.06, recovery: 0.11, hasHit: false };
    opp.stateT = 0.13;                              // past startup and active
    pinned(PAST_HESITATION, () => c.decide(ai, opp, game));
    return c.blockT > 0;
  }).map(d => d.id);
  assert.deepEqual(raised, [], `guarded against a whiff in its recovery: ${raised.join(', ')}`);
});

test('an AI still guards a swing that is on its way', () => {
  const { game, ai, opp, c } = staged('kai', 'zara', { aiX: 330, rivalX: 420 });
  opp.state = 'attack';
  opp.attack = { kind: 'kick', startup: 0.10, active: 0.08, recovery: 0.17, hasHit: false };
  opp.stateT = 0.04;
  pinned(PAST_HESITATION, () => c.decide(ai, opp, game));
  assert.ok(c.blockT > 0, 'did not guard a kick in its startup');
});

// ------------------------------------------------------- the open rival

test('an AI that parried drops its guard and punishes the stagger', () => {
  // The moment just after a parry: the AI is holding the guard it parried
  // with, and the rival staggers for PARRY.STAGGER. A guard held for the rest
  // of blockT pressed nothing until the rival had recovered.
  let punished = 0, tries = 0;
  for (const def of ROSTER) {
    for (let k = 0; k < 4; k++) {
      const { game, ai, opp, c } = staged(def.id, 'zara', { aiX: 400, rivalX: 470 });
      ai.setState('block');
      c.blockT = 0.45;
      c.decideT = c.level.react * (k + 1) / 5;        // its next look, somewhere in its cadence
      opp.setState('hitstun');
      opp.stunT = PARRY.STAGGER;
      const hp = opp.hp;
      for (let i = 0; i < Math.round(PARRY.STAGGER * 60); i++) game.update(1 / 60);
      tries++;
      if (opp.hp < hp) punished++;
    }
  }
  assert.ok(punished >= tries * 0.75, `punished a parried rival in only ${punished} of ${tries} staggers`);
});

// --------------------------------------------------------------- grabs

test('Carl does not throw ASSET SEIZURE at a rival out of its reach', () => {
  // It connects out to about 96 px; it used to be thrown from anywhere inside 130.
  const { game, ai, opp, c } = staged('dex', 'zara', { aiX: 400, rivalX: 520 });
  pinned(PAST_HESITATION, () => c.decide(ai, opp, game));
  assert.ok(!(c.pulse.kick && c.dir === 1), 'threw ASSET SEIZURE from 120 px');
});

test('Carl takes a rival holding a guard with ASSET SEIZURE', () => {
  // A held guard presses nothing, so it cannot jump: the grab is what it is for.
  const { game, ai, opp, c } = staged('dex', 'zara', { aiX: 400, rivalX: 480 });
  opp.setState('block');
  // Pinned past the aggression roll (0.35 + aggr 0.8 * 0.45 = 0.71) and under
  // the champion's notice (0.87): an open moment is taken whatever the appetite.
  pinned(0.8, () => c.tryCommand(80, 1, ai, opp, game));
  assert.ok(c.pulse.kick && c.dir === 1, 'did not grab a guarding rival in reach');
});

test('a champion Carl lands his grabs and a champion Elo is not parried', () => {
  // Whole matches against every rival, both slots, at Champion. Before v3.9.4,
  // 78% of ASSET SEIZUREs touched nobody and 31% of PLATFORM BURNs were parried.
  const tally = { grab: 0, grabbed: 0, burn: 0, parried: 0 };
  return (async () => {
    for (const rival of ROSTER.filter(f => f.id !== 'dex' && f.id !== 'elo')) {
      for (let k = 0; k < 2; k++) {
        for (const [me, slot] of [['dex', 0], ['dex', 1], ['elo', 0], ['elo', 1]]) {
          const ids = slot === 0 ? [me, rival.id] : [rival.id, me];
          const r = await runMatch(ids[0], ids[1], 'mogul', 7919 * (k + 1) + rival.id.length * 31 + slot);
          const t = r.tally[slot];
          if (me === 'dex') {
            tally.grab += t.starts['cmd:ASSET SEIZURE'] || 0;
            tally.grabbed += Object.values(t.out['cmd:ASSET SEIZURE'] || {}).reduce((a, b) => a + b, 0);
          } else {
            tally.burn += t.starts['cmd:PLATFORM BURN'] || 0;
            tally.parried += (t.out['cmd:PLATFORM BURN'] || {}).parried || 0;
          }
        }
      }
    }
    assert.ok(tally.grab > 20, `the fixture threw only ${tally.grab} grabs`);
    assert.ok(tally.grabbed >= tally.grab * 0.6,
      `ASSET SEIZURE touched someone ${tally.grabbed} times in ${tally.grab}`);
    assert.ok(tally.burn > 20, `the fixture threw only ${tally.burn} PLATFORM BURNs`);
    assert.ok(tally.parried <= tally.burn * 0.2,
      `PLATFORM BURN was parried ${tally.parried} times in ${tally.burn}`);
  })();
});

// --------------------------------------------------------------- strings

// The AI mid-string: its punch has just connected as the third in a row, so
// the chain reflex's next press is the kick.
function midString(id, rivalX, dir) {
  const run = staged(id, 'zara', { aiX: 400, rivalX });
  const { ai, opp, c } = run;
  ai.state = 'attack';
  ai.attack = { kind: 'punch', button: 'punch', hasHit: true, chainN: 3, startup: 0.05, active: 0.06, recovery: 0.11 };
  opp.setState('hitstun');
  opp.stunT = 0.3;
  c.dir = dir;
  pinned(0, () => c.update(ai, run.game));
  return run;
}

test('Elo finishes a string with PLATFORM BURN when it will reach', () => {
  const near = midString('elo', 480, 0);
  assert.ok(near.c.pulse.kick, 'the chain reflex did not press kick');
  assert.equal(near.c.dir, 1, 'did not hold forward for PLATFORM BURN with the rival in reach');
  const far = midString('elo', 600, 1);
  assert.equal(far.c.dir, 0, 'held forward for a PLATFORM BURN that would touch nobody');
});

test('a string by someone with no such move is left as it was', () => {
  // Kim's fwd+kick is RUG PULL, a trap: not a heavier finish.
  const run = midString('zara', 480, 0);
  assert.equal(run.c.dir, 0, 'the chain reflex took over the direction of a string it should leave alone');
});

// A real kick, not a stand-in: a kick lifts the rival (kbUp), so on the frame
// the chain reflex decides the rival is in the air, and slides away under its
// knockback. Found in review: a fixture with a grounded rival hid that the
// grab after a kick was never pressed at all, though it lands every time.
function kickThenSee(rivalX) {
  const run = staged('dex', 'zara', { aiX: 400, rivalX });
  const { game, ai } = run;
  ai.energy = METER.SPECIAL_COST + 10;
  let grabbed = 0, thrown = 0;
  const doGrab = game.doGrab.bind(game);
  game.doGrab = (att, def, a) => { if (att === ai) grabbed++; return doGrab(att, def, a); };
  pinned(0, () => {
    ai.startAttack('kick', game);
    let seen = null;
    for (let i = 0; i < 60; i++) {
      game.update(1 / 60);
      if (ai.attack && ai.attack !== seen) {
        seen = ai.attack;
        if (seen.kind === 'grab' && !seen.cmd) thrown++;
      }
    }
  });
  return { grabbed, thrown };
}

test('Carl follows a kick with HOSTILE TAKEOVER when the rival will be down and in reach', () => {
  const near = kickThenSee(470);
  assert.equal(near.thrown, 1, 'did not end the string in HOSTILE TAKEOVER');
  assert.equal(near.grabbed, 1, 'threw HOSTILE TAKEOVER and it missed');
});

test('Carl does not follow a kick with HOSTILE TAKEOVER the rival has slid out of', () => {
  // Kicked from 125 px, the rival slides on past the grab's reach.
  const far = kickThenSee(525);
  assert.equal(far.thrown, 0, 'threw HOSTILE TAKEOVER at a rival sliding out of reach');
});

// ------------------------------------------- the guard: found in review

test('an AI keeps its guard up while a projectile is still coming', () => {
  // The rival is recovering from the throw, so it reads as open, but the
  // slide it threw is still on its way. Pinned between blockProb and the
  // notice roll, the one band where a dropped guard was not raised again.
  const { game, ai, opp, c } = staged('kai', 'scam', { aiX: 300, rivalX: 600 });
  ai.setState('block');
  c.blockT = 0.4;
  opp.state = 'attack';
  opp.attack = { kind: 'projectile', startup: 0.07, active: 0.1, recovery: 0.3, hasHit: false };
  opp.stateT = 0.25;
  game.projectiles.push({ type: 'slide', owner: opp, delay: 0, x: 420, y: 370, vx: -520, vy: 0,
    dmg: 6, kb: 220, kbUp: 0, stun: 0.24, dead: false });
  pinned(0.7, () => c.decide(ai, opp, game));
  assert.ok(c.blockT > 0, 'dropped its guard with a slide 120 px away and coming');
});

test('an AI keeps its guard up after blocking a basic that can still cancel', () => {
  // A blocked jab can cancel into the next basic for its whole recovery, so
  // the rival is not open: a guard dropped here eats the second jab.
  const { game, ai, opp, c } = staged('elo', 'zara', { aiX: 400, rivalX: 470 });
  ai.setState('block');
  c.blockT = 0.4;
  opp.state = 'attack';
  opp.attack = { kind: 'punch', button: 'punch', startup: 0.05, active: 0.06, recovery: 0.11, hasHit: true, chainN: 1 };
  opp.stateT = 0.13;
  pinned(PAST_HESITATION, () => c.decide(ai, opp, game));
  assert.ok(c.blockT > 0, 'dropped its guard against a jab string that can still cancel');
});

// ----------------------------------------------------------------- rain

test('an AI guards a FUNDING ROUND coin falling on it', () => {
  // The second coin of three: laid with a delay that has since counted down
  // past zero, falling straight down onto the AI. Neither half of that was read.
  const { game, ai, opp, c } = staged('kai', 'eleanor', { aiX: 400, rivalX: 700 });
  game.projectiles.push({
    type: 'coin', owner: opp, delay: -0.004, x: ai.x + 10, y: 200, vx: 0, vy: 660,
    dmg: 7, kb: 120, kbUp: 0, stun: 0.3, dead: false,
  });
  pinned(PAST_HESITATION, () => c.decide(ai, opp, game));
  assert.ok(c.blockT > 0, 'did not guard a coin falling on it');
});

test('every level has a gamble, and a champion gambles least', () => {
  const g = Object.values(AI_LEVELS).map(l => l.gamble);
  assert.ok(g.every(x => typeof x === 'number' && x >= 0 && x <= 1), `gamble out of range: ${g}`);
  assert.ok(AI_LEVELS.mogul.gamble < AI_LEVELS.founder.gamble && AI_LEVELS.founder.gamble <= AI_LEVELS.intern.gamble);
});
