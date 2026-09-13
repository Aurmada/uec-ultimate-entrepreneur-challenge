// The fighting-game effects (engine/vfx.js) in a real match, captured at the
// moments they exist for: a strike's trail, the burst when it lands, a guard
// flash, a parry, each kind of special's signature (a launch, a blast, a
// teleport, a rush, a stance, a counter), a special's cut-in, a super's.
// Run from the game page with the debug harness and the 3D prototype on:
//
//   http://localhost:4173/?gl&debug=1     (served by dev-server.py, for the PUT)
//   UEC.signInAs();
//   const v = await import('/lab/vfx.js');
//   await v.sheet();                      // lab/previews/vfx.jpg
//
// Both fighters are driven by scripts, frame by frame, so every run stages the
// same exchange; the capture waits for the effect, not for a guessed frame.

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Each scene: who fights where, what each presses on which frame, and the
// moments to capture, as tests run once per frame after it is drawn.
const SCENES = [
  {
    label: 'whiffed kick: the trail alone', p1: 'kai', p2: 'max', arena: 'garage', apart: 320,
    press: { 0: { 3: 'kick' } },
    shots: [['trail', (g) => g.fighters[0].state === 'attack' && g.fighters[0].stateT > (g.fighters[0].attack?.startup ?? 0) + 0.03]],
  },
  {
    label: 'punch: trail, then burst', p1: 'max', p2: 'dex', arena: 'garage',
    press: { 0: { 3: 'punch' } },
    shots: [
      ['trail', (g) => g.fighters[0].state === 'attack' && g.fighters[0].stateT > (g.fighters[0].attack?.startup ?? 0) + 0.02],
      ['burst', (g) => g.fx.bursts.some((b) => b.kind === 'hit' && b.t > b.dur * 0.25)],
    ],
  },
  {
    label: 'kick', p1: 'zara', p2: 'eleanor', arena: 'boardroom',
    press: { 0: { 3: 'kick' } },
    shots: [
      ['trail', (g) => g.fighters[0].state === 'attack' && g.fighters[0].stateT > (g.fighters[0].attack?.startup ?? 0) + 0.02],
      ['burst', (g) => g.fx.bursts.some((b) => b.kind === 'hit' && b.t > b.dur * 0.25)],
    ],
  },
  {
    label: 'block', p1: 'dex', p2: 'bozo', arena: 'exchange',
    hold: { 1: { from: 0, to: 60, key: 'block' } },
    press: { 0: { 40: 'punch' } },
    shots: [['guard', (g) => g.fx.bursts.some((b) => b.kind === 'guard' && b.t > b.dur * 0.3)]],
  },
  {
    // the block goes up just before the kick is out, inside the parry window
    label: 'parry', p1: 'elo', p2: 'kai', arena: 'unicorn',
    press: { 0: { 3: 'kick' } },
    react: (g) => {
      const a = g.fighters[0];
      return a.state === 'attack' && a.attack && a.stateT >= a.attack.startup - 0.06 ? { block: true } : {};
    },
    shots: [['parry', (g) => g.fx.bursts.some((b) => b.kind === 'parry' && b.t > b.dur * 0.3)]],
  },
  {
    label: 'special: cut-in, projectile', p1: 'kai', p2: 'max', arena: 'demoday', energy: 100, apart: 260,
    press: { 0: { 3: 'special' } },
    shots: [
      ['cut-in', (g) => g.fx.playing && g.fx.playing.t > 0.3],
      ['projectile', (g) => g.projectiles.some((p) => Math.abs(p.x - g.fighters[0].x) > 150)],
    ],
  },
  {
    label: 'super', p1: 'ava', p2: 'scam', arena: 'summit', energy: 100,
    press: { 0: { 3: 'super' } },
    shots: [['super cut-in', (g) => g.fx.playing && g.fx.playing.t > 0.35]],
  },
  {
    label: 'pitch deck', p1: 'kai', p2: 'dex', arena: 'exchange', energy: 100, apart: 300,
    press: { 0: { 3: 'special' } },
    shots: [['launch flash', (g) => g.fx.bursts.some((b) => b.kind === 'launch' && b.t > b.dur * 0.3)]],
  },
  {
    label: 'burn rate blast', p1: 'elo', p2: 'max', arena: 'garage', energy: 100, apart: 150,
    press: { 0: { 3: 'special' } },
    shots: [['blast', (g) => g.fx.bursts.some((b) => b.kind === 'blast' && b.t > b.dur * 0.3)]],
  },
  {
    label: 'pivot punch', p1: 'ava', p2: 'bozo', arena: 'boardroom', energy: 100, apart: 260,
    press: { 0: { 3: 'special' } },
    shots: [['teleport', (g) => g.fx.bursts.some((b) => b.kind === 'arrive' && b.t > b.dur * 0.15)]],
  },
  {
    label: 'growth hack', p1: 'zara', p2: 'eleanor', arena: 'unicorn', energy: 100, apart: 360,
    press: { 0: { 3: 'special' } },
    shots: [['rush', (g) => { const f = g.fighters[0]; return f.attack?.kind === 'rush' && f.stateT > f.attack.startup + 0.12; }]],
  },
  {
    label: 'alignment shift', p1: 'scam', p2: 'kai', arena: 'demoday', energy: 100, apart: 220,
    press: { 0: { 3: 'special' } },
    shots: [['stance aura', (g) => g.fighters[0].stanceId && !g.fx.playing]],
  },
  {
    label: 'the demo (counter)', p1: 'ava', p2: 'max', arena: 'summit', apart: 200,
    hold: { 0: { from: 0, to: 12, key: 'right' } },
    press: { 0: { 4: 'slap' } },
    shots: [['counter live', (g) => { const f = g.fighters[0]; return typeof f.counterActive === 'function' && !!f.counterActive(); }]],
  },
];

async function stage(scene) {
  const { getFighter } = await import('/src/data/fighters.js');
  const { getArena } = await import('/src/data/arenas.js');
  const { stageFor } = await import('/src/engine/stage.js');
  UEC.startMatch({ mode: 'solo', p1Def: getFighter(scene.p1), p2Def: getFighter(scene.p2), arena: getArena(scene.arena), difficulty: 'intern', isChallenge: false });
  await wait(250);
  UEC.skipSplash?.();
  for (let i = 0; i < 60 && !stageFor(getArena(scene.arena)); i++) await wait(50);
  const g = UEC.game;
  for (let i = 0; i < 400 && g.state !== 'fighting'; i++) UEC.step(1 / 60);
  const apart = scene.apart ?? 96;
  g.fighters[0].x = 480 - apart / 2;
  g.fighters[1].x = 480 + apart / 2;
  let frame = 0;
  g.fighters.forEach((f, i) => {
    f.vx = 0;
    f.energy = i === 0 ? (scene.energy ?? f.energy) : f.energy;
    f.controller = {
      isHuman: true,
      update(fighter) {
        const pad = {};
        const tap = scene.press?.[i]?.[frame];
        if (tap) pad[tap] = true;
        const hold = scene.hold?.[i];
        if (hold && frame >= hold.from && frame <= hold.to) pad[hold.key] = true;
        if (i === 1 && scene.react) Object.assign(pad, scene.react(g));
        fighter.pad = pad;
      },
    };
  });
  return { g, next: () => { UEC.step(1 / 60); frame++; } };
}

export async function sheet(path = '/lab/previews/vfx.jpg', scenes = SCENES) {
  const canvas = document.getElementById('gameCanvas');
  const shots = [];
  for (const scene of scenes) {
    const { g, next } = await stage(scene);
    const pending = [...scene.shots];
    for (let i = 0; i < 240 && pending.length; i++) {
      next();
      const [label, ready] = pending[0];
      if (ready(g)) {
        const c = document.createElement('canvas');
        c.width = canvas.width; c.height = canvas.height;
        c.getContext('2d').drawImage(canvas, 0, 0);
        shots.push({ label: `${scene.label}: ${label}`, c });
        pending.shift();
      }
    }
    for (const [label] of pending) shots.push({ label: `${scene.label}: ${label} (never happened)`, c: null });
  }
  const TW = 960, TH = 540, LAB = 26, COLS = 2;
  const out = document.createElement('canvas');
  out.width = TW * COLS;
  out.height = Math.ceil(shots.length / COLS) * (TH + LAB);
  const oc = out.getContext('2d');
  oc.fillStyle = '#10141f';
  oc.fillRect(0, 0, out.width, out.height);
  shots.forEach((s, i) => {
    const x = (i % COLS) * TW, y = Math.floor(i / COLS) * (TH + LAB);
    oc.fillStyle = s.c ? '#ffd23f' : '#ff6b6b';
    oc.font = '600 16px system-ui';
    oc.fillText(s.label, x + 10, y + 18);
    if (s.c) oc.drawImage(s.c, x, y + LAB, TW, TH);
  });
  // JPEG: a sheet of full-size frames as PNG is past what dev-server.py accepts
  const blob = await new Promise((r) => out.toBlob(r, 'image/jpeg', 0.9));
  const res = await fetch(path, { method: 'PUT', body: blob });
  return { path, status: res.status, shots: shots.map((s) => s.label) };
}
