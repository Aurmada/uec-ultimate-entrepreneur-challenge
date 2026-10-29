// A roster character's own hesitation below Champion (fighters.js ai.ease,
// ai.js AIController). Measured with lab/balance.js, the easier levels did
// not play alike whoever you fought: at Rookie Adam won 96% of AI matches and
// Lizbeth 4%. Each character now hesitates by the level's amount plus its own,
// at Rookie and Contender only. These pin the mechanism, that Champion is
// left exactly as authored, and that the data stays inside what the schema
// allows. The balance itself is measured by the harness, not here.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/engine/game.js';
import { AIController } from '../src/engine/ai.js';
import { FIGHTERS, toCharacter } from '../src/data/fighters.js';
import { AI_LEVELS, AI_EASE } from '../src/config.js';
import { validateCharacter } from '../src/data/schema.js';

const ROSTER = FIGHTERS.filter((f) => !f.base);
const byId = (id) => FIGHTERS.find((f) => f.id === id);
const HUD = new Proxy({}, { get: () => () => {} });
const ARENA = { id: 'test', name: 'TEST', draw() {}, mood: 'none' };
const idler = () => ({ isHuman: false, update(f) { f.pad = {}; } });

test('Champion plays every roster character as authored', () => {
  for (const def of ROSTER) {
    assert.equal(new AIController('mogul', def).hesitation, AI_LEVELS.mogul.mistake, `${def.id} is eased at Champion`);
  }
});

test('below Champion a character hesitates by the level plus its own ease, within bounds', () => {
  for (const level of ['intern', 'founder']) {
    for (const def of ROSTER) {
      const want = AI_LEVELS[level].mistake + (def.ai.ease?.[level] ?? 0);
      const got = new AIController(level, def).hesitation;
      assert.equal(got, Math.min(AI_EASE.MAX, Math.max(0, want)), `${def.id} at ${level}`);
      assert.ok(got >= 0 && got <= AI_EASE.MAX);
    }
  }
  // The two the measurements were about: Adam holds back, Lizbeth does not.
  assert.ok(new AIController('intern', byId('max')).hesitation > AI_LEVELS.intern.mistake);
  assert.ok(new AIController('intern', byId('ava')).hesitation < AI_LEVELS.intern.mistake);
  // A character with no ease, a player's ghost say, is the level as it was.
  const plain = { ...byId('max'), ai: { aggr: 0.85, jump: 0.35, prefRange: 'close' } };
  assert.equal(new AIController('intern', plain).hesitation, AI_LEVELS.intern.mistake);
});

test('a decision passed up presses nothing, at the character\'s own rate', () => {
  // Stood toe to toe, where an AI that acts always does something. With its
  // hesitation at certainty it must never do anything; at none, it must.
  const def = byId('max');
  const game = new Game({
    p1: { def, controller: idler() }, p2: { def: byId('ava'), controller: idler() },
    arena: ARENA, mode: 'solo', difficulty: 'intern', hud: HUD, onEnd: () => {}, seed: 3,
  });
  for (let i = 0; i < 600 && game.state !== 'fighting'; i++) game.update(1 / 60);
  const [f, opp] = game.fighters;
  f.x = 400; opp.x = 470;
  const acts = (hesitation) => {
    let n = 0;
    for (let i = 0; i < 200; i++) {
      const c = new AIController('intern', def);
      c.hesitation = hesitation;
      c.decide(f, opp, game);
      if (c.dir !== 0 || Object.values(c.pulse).some(Boolean) || c.blockT > 0) n++;
    }
    return n;
  };
  assert.equal(acts(1), 0, 'an AI that always hesitates still acted');
  assert.ok(acts(0) > 100, 'an AI that never hesitates hardly acted');
});

test('the schema takes an ease for Rookie and Contender only, and in range', () => {
  const ch = toCharacter(byId('max'));
  assert.equal(validateCharacter(ch).ok, true, validateCharacter(ch).errors.join('; '));
  const withEase = (ease) => validateCharacter({ ...ch, ai: { ...ch.ai, ease } });
  assert.equal(withEase({ mogul: 0.1 }).ok, false, 'Champion was eased');
  assert.equal(withEase({ intern: 0.9 }).ok, false, 'an ease past the bound passed');
  assert.equal(withEase({ founder: 'a lot' }).ok, false, 'a word passed for a number');
  assert.equal(withEase({ intern: -0.2, founder: 0.1 }).ok, true);
});
