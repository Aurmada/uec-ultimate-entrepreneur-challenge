// The balance pass of v3.22: Jeff and Elo, the two weakest at Champion. In
// lab/balance.js (Champion, AI against AI, 40 a pairing) Elo won 28% and Jeff
// 34%, the roster's last two, with Steve on 64%. Elo's PLATFORM BURN came out
// faster and hit harder, and Jeff's UNDERCUT hit harder (fighters.js has why);
// now about 40% and 39%. The harness is the measure. This is a small seeded
// sample of it, kept so a change that undoes the pass is noticed: the two
// against the rest of the roster from both sides, 33% together before, about
// 40% now. Seeded, so it does not flake; if it fails after another change to
// the fight, measure again with lab/balance.js before moving the line.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runMatch } from '../lab/balance.js';

const ROSTER = ['ava', 'max', 'kai', 'zara', 'eleanor', 'dex', 'elo', 'bozo', 'scam'];
const PER = 16;

async function record(id) {
  let won = 0, played = 0;
  for (const opp of ROSTER) {
    if (opp === id) continue;
    for (let k = 0; k < PER; k++) {
      const side = k % 2;            // from each side in turn
      const r = await runMatch(side ? opp : id, side ? id : opp, 'mogul', 9100 + ROSTER.indexOf(opp) * 101 + k);
      played++;
      if (r.winner === side) won++;
    }
  }
  return { won, played };
}

test('Jeff and Elo hold their own at Champion against the rest of the roster', async () => {
  const jeff = await record('bozo'), elo = await record('elo');
  const both = (jeff.won + elo.won) / (jeff.played + elo.played);
  assert.ok(both >= 0.37, `Jeff and Elo won ${(100 * both).toFixed(1)}% together (33% before the pass)`);
  assert.ok(elo.won / elo.played >= 0.36, `Elo won ${(100 * elo.won / elo.played).toFixed(1)}% (31% before the pass)`);
});
