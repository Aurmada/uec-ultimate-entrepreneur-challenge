// Builds one 3D model per roster fighter: their own body from their build
// (the `figure` numbers in data/fighters.js, the same ones the 2D figure
// draws), carrying only the pieces they wear (their look as the runtime reads
// it, their props, the block briefcase and Unicorn Mode's horn). In the
// arcade fighters no two characters share a silhouette; here, with one body
// for everyone, none of them had their own.
//
//   UEC_BLENDER=/Applications/Blender.app/Contents/MacOS/Blender node lab/blender/build_cast.mjs
//   UEC_BLENDER=/path/to/venv/bin/python node lab/blender/build_cast.mjs     # pip install bpy
//   ... node lab/blender/build_cast.mjs max dex                             # just those
//
// Writes assets/models/cast/<id>.glb. models3d.js lists them.

import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { FIGHTERS } from '../../src/data/fighters.js';
import { piecesFor } from '../../src/data/models3d.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRIPT = join(ROOT, 'lab', 'blender', 'build_founder.py');
const BLENDER = process.env.UEC_BLENDER || 'blender';
const only = process.argv.slice(2);
const tmp = mkdtempSync(join(tmpdir(), 'uec-cast-'));
mkdirSync(join(ROOT, 'assets', 'models', 'cast'), { recursive: true });

const isPython = /python/.test(basename(BLENDER));
for (const def of FIGHTERS) {
  if (only.length && !only.includes(def.id)) continue;
  const { costume, ...build } = def.figure || {};
  const spec = { id: def.id, frame: build.frame || 'm', figure: build, costume: costume || {}, meshes: piecesFor(def) };
  const json = join(tmp, `${def.id}.json`);
  writeFileSync(json, JSON.stringify(spec));
  const out = join(ROOT, 'assets', 'models', 'cast', `${def.id}.glb`);
  const args = [SCRIPT, '--', out, 'character', json];
  const run = spawnSync(BLENDER, isPython ? args : ['-b', '--factory-startup', '-P', ...args], { encoding: 'utf8' });
  const done = (run.stdout || '').split('\n').find((l) => l.startsWith('[founder]') && l.includes('meshes'));
  if (run.status !== 0 || !done) {
    console.error(`${def.id}: failed\n${(run.stderr || '').slice(-2000)}${(run.stdout || '').slice(-2000)}`);
    process.exitCode = 1;
    continue;
  }
  console.log(`${def.id.padEnd(8)} ${done.replace('[founder] ', '')}`);
}
