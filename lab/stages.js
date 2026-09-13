// Rendered stages in a real match: each arena that has one, drawn the way it
// ships (procedural) beside the rendered stage, same fighters, same moment.
// Run from the game page with the debug harness and the 3D prototype on:
//
//   http://localhost:4173/?gl&debug=1     (served by dev-server.py, for the PUT)
//   UEC.signInAs();
//   const s = await import('/lab/stages.js');
//   await s.compare();                          // every rendered stage
//   await s.compare(['garage'], ['max', 'dex']);
//
// Writes lab/previews/stages-<arena>.png, the procedural stage on top.

import { STAGES, stageFor } from '/src/engine/stage.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// The same, but both halves on the rendered stage: the fighters in the default
// light on top, in the stage's own light (`stage.light`) below.
export async function lighting(ids = null, fighters = ['max', 'dex']) {
  const { ARENAS } = await import('/src/data/arenas.js');
  const arenas = ARENAS.filter((a) => a.stage && (!ids || ids.includes(a.id)));
  const lights = new Map(arenas.map((a) => [a, a.stage.light]));
  return compare(ids, fighters, (id) => `/lab/previews/lighting-${id}.png`, (arena, second) => {
    STAGES.enabled = true;
    arena.stage.light = second ? lights.get(arena) : undefined;
  });
}

export async function compare(ids = null, fighters = ['max', 'dex'], path = (id) => `/lab/previews/stages-${id}.png`,
  setup = (arena, second) => { STAGES.enabled = second; }) {
  const { ARENAS } = await import('/src/data/arenas.js');
  const { getFighter } = await import('/src/data/fighters.js');
  const arenas = ARENAS.filter((a) => a.stage && (!ids || ids.includes(a.id)));
  const canvas = document.getElementById('gameCanvas');
  const results = {};
  for (const arena of arenas) {
    const frames = [];
    for (const rendered of [false, true]) {
      setup(arena, rendered);
      UEC.startMatch({ mode: 'solo', p1Def: getFighter(fighters[0]), p2Def: getFighter(fighters[1]), arena, difficulty: 'intern', isChallenge: false });
      await wait(300);
      UEC.skipSplash?.();
      stageFor(arena);                                   // start the load before stepping
      for (let i = 0; i < 60 && STAGES.enabled && !stageFor(arena); i++) await wait(50);
      // Pin the fight: same place, same pose, the camera settled.
      const g = UEC.game;
      g.fighters[0].x = 330; g.fighters[1].x = 630;
      for (let i = 0; i < 90; i++) UEC.step(1 / 60);
      const shot = document.createElement('canvas');
      shot.width = canvas.width; shot.height = canvas.height;
      shot.getContext('2d').drawImage(canvas, 0, 0);
      frames.push(shot);
    }
    const out = document.createElement('canvas');
    out.width = frames[0].width;
    out.height = frames[0].height * 2;
    const oc = out.getContext('2d');
    frames.forEach((f, i) => oc.drawImage(f, 0, i * f.height));
    const blob = await new Promise((r) => out.toBlob(r, 'image/png'));
    results[arena.id] = (await fetch(path(arena.id), { method: 'PUT', body: blob })).status;
  }
  STAGES.enabled = true;
  return results;
}
