// Balance harness: the roster against itself, AI against AI, headless.
//
// Every balance figure in HANDOFF.md came from a scratch harness that was never
// kept, so each session rebuilt one and the numbers were only comparable
// within a session. This is that harness, kept. It runs whole best-of-three
// matches through the real Game with an AIController on both sides, seeds both
// the game and Math.random per match so a run reproduces, and reports win
// rates by fighter and by pair, plus, for the fighters named with --focus, how
// often each of their moves came out and how each one ended (hit, blocked,
// parried, countered, shielded, or never touched anyone).
//
//   node lab/balance.js                          # Champion, 20 per ordered pair
//   node lab/balance.js --level founder --n 40 --seed 7
//   node lab/balance.js --focus elo,dex          # move breakdowns for two fighters
//   node lab/balance.js --only elo               # only pairs with Elo in them
//   node lab/balance.js --json out.json          # the raw tallies as well
//
// It measures how well the AI plays each kit as much as the kits themselves:
// both sides are the same AI at the same level, on roster stats. Read it that
// way. Nothing here touches the simulation; it only drives it.

import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROSTER_IDS = ['ava', 'max', 'kai', 'zara', 'eleanor', 'dex', 'elo', 'bozo', 'scam'];
// Long enough for three full 60 s rounds with their intros and banners, at
// 60 Hz. A match that has not finished by then is reported, not hidden.
const FRAME_CAP = 60 * 60 * 4;

// The same mulberry32 the tests seed with, so a fixture lifted from here into
// a test reproduces.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// What to call an attack in the tallies: a command normal by its name, a
// special by its archetype, a basic by its button.
function label(a) {
  if (!a) return '?';
  if (a.cmd) return `cmd:${a.cmd.displayName || a.kind}`;
  if (a.special && a.kind !== 'bomb') return `sp:${a.kind}`;
  return a.kind;
}

export async function runMatch(p1id, p2id, level, seed, mods = {}) {
  const { Game } = await import('../src/engine/game.js');
  const { AIController } = await import('../src/engine/ai.js');
  const { FIGHTERS } = await import('../src/data/fighters.js');
  const { PARRY } = await import('../src/config.js');
  const defs = [p1id, p2id].map(id => FIGHTERS.find(f => f.id === id));
  const hud = new Proxy({}, { get: () => () => {} });
  const arena = { id: 'test', name: 'TEST', draw() {}, mood: 'none' };
  let result = null;
  const realRandom = Math.random;
  Math.random = rng(seed ^ 0x9E3779B9);
  try {
    const game = new Game({
      p1: { def: defs[0], controller: new AIController(level, defs[0]) },
      p2: { def: defs[1], controller: new AIController(level, defs[1]) },
      arena, mode: 'versus', difficulty: level, hud,
      onEnd: (r) => { result = r; }, seed,
    });
    if (mods.setup) mods.setup(game);
    const tally = [0, 1].map(() => ({ starts: {}, out: {}, dmg: 0, specials: 0 }));
    const bump = (o, k, n = 1) => { o[k] = (o[k] || 0) + n; };
    const outcome = (who, lab, how) => {
      const o = tally[who].out[lab] || (tally[who].out[lab] = {});
      bump(o, how);
    };
    const idx = (f) => game.fighters.indexOf(f);

    const strike = game.strike.bind(game);
    game.strike = (att, def, a, fromProjectile = false) => {
      const lab = fromProjectile ? `proj:${a.kind || a.type || '?'}` : label(a);
      let how = 'hit';
      if (def.shieldT > 0) how = 'shield';
      else if (def.counterActive() && a.kind !== 'grab' && !fromProjectile) how = 'countered';
      else if (def.state === 'block' && def.grounded) {
        how = def.stateT <= PARRY.WINDOW && a.kind !== 'grab' ? 'parried' : 'blocked';
      }
      outcome(idx(att), lab, how);
      return strike(att, def, a, fromProjectile);
    };
    const grab = game.doGrab.bind(game);
    game.doGrab = (att, def, a) => {
      outcome(idx(att), label(a), def.shieldT > 0 ? 'shield' : 'hit');
      return grab(att, def, a);
    };

    const steal = game.doSteal.bind(game);
    game.doSteal = (att, def) => {
      const how = def.shieldT > 0 ? 'shield'
        : def.state === 'block' && def.grounded ? (def.stateT <= PARRY.WINDOW ? 'parried' : 'blocked') : 'hit';
      outcome(idx(att), 'steal', how);
      return steal(att, def);
    };

    const seen = [null, null];
    const hp = game.fighters.map(f => f.hp);
    let frames = 0;
    while (!result && frames < FRAME_CAP) {
      game.update(1 / 60);
      frames++;
      game.fighters.forEach((f, i) => {
        if (f.state === 'attack' && f.attack && f.attack !== seen[i]) {
          seen[i] = f.attack;
          const lab = label(f.attack);
          bump(tally[i].starts, lab);
          if (lab.startsWith('sp:')) tally[i].specials++;
        }
        if (f.state !== 'attack') seen[i] = null;
        const o = game.fighters[1 - i];
        if (o.hp < hp[1 - i]) tally[i].dmg += hp[1 - i] - o.hp;
      });
      game.fighters.forEach((f, i) => { hp[i] = f.hp; });
    }
    return {
      p1: p1id, p2: p2id, seed, frames,
      winner: result ? result.winnerIdx : -2,
      score: result ? result.score : game.roundWins,
      tally,
    };
  } finally {
    Math.random = realRandom;
  }
}

// --------------------------------------------------------------- reporting

function parseArgs(argv) {
  const o = { level: 'mogul', n: 20, seed: 1, focus: [], only: [], json: null, workers: availableParallelism() };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i], v = argv[i + 1];
    if (k === '--level') { o.level = v; i++; }
    else if (k === '--n') { o.n = +v; i++; }
    else if (k === '--seed') { o.seed = +v; i++; }
    else if (k === '--focus') { o.focus = v.split(','); i++; }
    else if (k === '--only') { o.only = v.split(','); i++; }
    else if (k === '--json') { o.json = v; i++; }
    else if (k === '--workers') { o.workers = +v; i++; }
  }
  return o;
}

function jobs(o) {
  const out = [];
  for (const a of ROSTER_IDS) for (const b of ROSTER_IDS) {
    if (a === b) continue;
    if (o.only.length && !o.only.includes(a) && !o.only.includes(b)) continue;
    for (let k = 0; k < o.n; k++) {
      // A seed per (pair, match), stable however the jobs are split.
      const seed = (o.seed * 1000003 + ROSTER_IDS.indexOf(a) * 7919
        + ROSTER_IDS.indexOf(b) * 104729 + k * 15485863) >>> 0;
      out.push([a, b, seed]);
    }
  }
  return out;
}

function report(results, o) {
  const win = {}, play = {}, pair = {};
  let unfinished = 0;
  for (const r of results) {
    if (r.winner === -2) unfinished++;
    for (const [i, id] of [[0, r.p1], [1, r.p2]]) {
      play[id] = (play[id] || 0) + 1;
      if (r.winner === i) win[id] = (win[id] || 0) + 1;
    }
    const k = `${r.p1}>${r.p2}`;
    pair[k] = pair[k] || { w: 0, n: 0 };
    pair[k].n++;
    if (r.winner === 0) pair[k].w++;
  }
  const pct = (w, n) => (n ? (100 * w / n).toFixed(1) : '-').padStart(5);
  console.log(`\n${o.level}, ${o.n} per ordered pair, seed ${o.seed}: ${results.length} matches`
    + (unfinished ? `, ${unfinished} unfinished` : ''));
  console.log('\nwin rate by fighter (both slots):');
  const ids = ROSTER_IDS.filter(id => play[id]);
  for (const id of [...ids].sort((a, b) => (win[b] || 0) / play[b] - (win[a] || 0) / play[a])) {
    console.log(`  ${id.padEnd(8)} ${pct(win[id] || 0, play[id])}%  (${play[id]} matches)`);
  }
  console.log('\nrow beats column (row in either slot):');
  console.log('         ' + ids.map(id => id.slice(0, 5).padStart(6)).join(''));
  for (const a of ids) {
    const cells = ids.map(b => {
      if (a === b) return '     .';
      const x = pair[`${a}>${b}`] || { w: 0, n: 0 }, y = pair[`${b}>${a}`] || { w: 0, n: 0 };
      const w = x.w + (y.n - y.w), n = x.n + y.n;
      return n ? pct(w, n).padStart(6) : '     -';
    });
    console.log(`  ${a.padEnd(7)}${cells.join('')}`);
  }
  for (const id of o.focus) {
    const starts = {}, out = {};
    let dmg = 0, n = 0, specials = 0;
    for (const r of results) for (const [i, pid] of [[0, r.p1], [1, r.p2]]) {
      if (pid !== id) continue;
      n++;
      const t = r.tally[i];
      dmg += t.dmg; specials += t.specials;
      for (const [k, v] of Object.entries(t.starts)) starts[k] = (starts[k] || 0) + v;
      for (const [k, v] of Object.entries(t.out)) {
        out[k] = out[k] || {};
        for (const [h, c] of Object.entries(v)) out[k][h] = (out[k][h] || 0) + c;
      }
    }
    if (!n) continue;
    console.log(`\n${id}: ${n} matches, ${(dmg / n).toFixed(0)} damage dealt a match, ${(specials / n).toFixed(1)} specials a match`);
    const keys = [...new Set([...Object.keys(starts), ...Object.keys(out)])]
      .sort((a, b) => (starts[b] || 0) - (starts[a] || 0));
    for (const k of keys) {
      const s = starts[k] || 0, oc = out[k] || {};
      const touched = Object.values(oc).reduce((x, y) => x + y, 0);
      const parts = Object.entries(oc).map(([h, c]) => `${h} ${(c / n).toFixed(2)}`).join(', ');
      console.log(`  ${k.padEnd(26)} ${(s / n).toFixed(2).padStart(6)} a match`
        + (s && !k.startsWith('proj:') ? `, ${(100 * (1 - Math.min(touched, s) / s)).toFixed(0)}% touched nobody` : '')
        + (parts ? `  [${parts}]` : ''));
    }
  }
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const all = jobs(o);
  const nw = Math.max(1, Math.min(o.workers, all.length));
  const chunks = Array.from({ length: nw }, (_, i) => all.filter((_, j) => j % nw === i));
  const t0 = Date.now();
  const parts = await Promise.all(chunks.map(chunk => new Promise((resolve, reject) => {
    const w = new Worker(fileURLToPath(import.meta.url), { workerData: { chunk, level: o.level } });
    w.on('message', resolve);
    w.on('error', reject);
  })));
  const results = parts.flat();
  report(results, o);
  console.log(`\n${((Date.now() - t0) / 1000).toFixed(1)} s on ${nw} worker${nw > 1 ? 's' : ''}`);
  if (o.json) writeFileSync(o.json, JSON.stringify(results));
}

if (isMainThread) {
  if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
} else {
  const { chunk, level } = workerData;
  const out = [];
  for (const [a, b, seed] of chunk) out.push(await runMatch(a, b, level, seed));
  parentPort.postMessage(out);
}
