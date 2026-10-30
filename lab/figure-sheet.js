// Contact sheets for the figure renderer (engine/figure.js): every fighter in
// a set of poses, the tube rig and the figure side by side, saved through
// dev-server.py's PUT handler.
//
//   const m = await import('/lab/figure-sheet.js');
//   await m.sheet('/lab/previews/figure-idle.png', { cases: ['idle'] });
//   await m.sheet('/lab/previews/figure-max.png', { ids: ['max'], cases: 'all', scale: 2 });
//
// Poses are staged the way lab/gl3d-gallery.js stages them, so a cell here
// is the frame the other lab sheets show.

import { drawFighter, STYLE } from '/src/engine/drawFighter.js';
import { FIGHTERS, getFighter, LOOKS } from '/src/data/fighters.js';
import { ATTACKS, FIGURE } from '/src/config.js';
import { clampBody } from '/src/engine/proportions.js';

export const CASES = {
  idle: { state: 'idle', t: 0 },
  walk: { state: 'walk', t: 0.5, walkPhase: 2.1 },
  crouch: { state: 'crouch', t: 0.5, crouching: true },
  jump: { state: 'jump', t: 0.5, airborne: true },
  block: { state: 'block', t: 0.5 },
  slap: { state: 'attack', t: 0.5, kind: 'slap', stateT: 0.07 },
  punch: { state: 'attack', t: 0.5, kind: 'punch', stateT: 0.08 },
  kick: { state: 'attack', t: 0.5, kind: 'kick', stateT: 0.14 },
  launch: { state: 'attack', t: 0.5, kind: 'launch', stateT: 0.11 },
  hitstun: { state: 'hitstun', t: 0.5, stateT: 0.1 },
  ko: { state: 'ko', t: 0.5, stateT: 0.4 },
  victory: { state: 'victory', t: 0.9, stateT: 0.6 },
};

function fighterIn(def, c, x, y) {
  return {
    def, body: clampBody(def.body), side: 0, x, y, facing: 1,
    state: c.state, stateT: c.stateT ?? 0, walkPhase: c.walkPhase ?? 0, vy: c.airborne ? -300 : 0,
    airborne: !!c.airborne, crouching: !!c.crouching, movingBack: false,
    unicornT: 0, flashT: 0,
    attack: c.kind ? { ...ATTACKS[c.kind], kind: c.kind, button: c.kind, hasHit: false } : null,
  };
}

// ids: fighter ids (default the roster). cases: names from CASES, or 'all'.
// modes: which renderers to show, a row each per fighter. cols: wrap the
// cells into that many columns instead, in reading order. tweak: FIGURE
// values to try for the sheet, e.g. { HEAD: 0.8 }, put back afterwards.
export async function sheet(path, { ids, cases = ['idle'], modes = ['tube', 'figure'], scale = 1, cols = 0, bg = '#141a2e', tweak = {} } = {}) {
  const saved = Object.fromEntries(Object.keys(tweak).map((k) => [k, FIGURE[k]]));
  Object.assign(FIGURE, tweak);
  try { return await draw(path, { ids, cases, modes, scale, cols, bg }); } finally { Object.assign(FIGURE, saved); }
}

async function draw(path, { ids, cases, modes, scale, cols, bg }) {
  const defs = (ids || FIGHTERS.map((d) => d.id)).map((id) => getFighter(id));
  const names = cases === 'all' ? Object.keys(CASES) : cases;
  const CW = 230 * scale, CH = 290 * scale, LAB = 18;
  const total = defs.length * modes.length * names.length;
  const across = cols || names.length;
  const rows = cols ? Math.ceil(total / cols) : defs.length * modes.length;
  const out = document.createElement('canvas');
  out.width = CW * across;
  out.height = rows * (CH + LAB);
  const oc = out.getContext('2d');
  oc.fillStyle = bg;
  oc.fillRect(0, 0, out.width, out.height);
  const cell = document.createElement('canvas');
  cell.width = CW; cell.height = CH;
  const cc = cell.getContext('2d');
  const realRandom = Math.random;
  const was = STYLE.figure;
  Math.random = () => 0.5;
  try {
    let row = 0, n = 0;
    for (const def of defs) {
      for (const mode of modes) {
        STYLE.figure = mode === 'figure';
        names.forEach((name, i) => {
          const c = CASES[name];
          cc.setTransform(1, 0, 0, 1, 0, 0);
          cc.clearRect(0, 0, CW, CH);
          cc.scale(scale, scale);
          drawFighter(cc, fighterIn(def, c, CW / scale / 2 - 30, CH / scale - 22), c.t);
          const col = cols ? n % cols : i, y = (cols ? Math.floor(n / cols) : row) * (CH + LAB);
          n++;
          oc.drawImage(cell, col * CW, y + LAB);
          oc.fillStyle = mode === 'figure' ? '#ffd23f' : '#9fb0d9';
          oc.font = '600 13px system-ui';
          oc.fillText(`${def.name.split(' ')[0]} ${mode} ${name}`, col * CW + 8, y + 14);
        });
        row++;
      }
    }
  } finally {
    Math.random = realRandom;
    STYLE.figure = was;
  }
  const blob = await new Promise((r) => out.toBlob(r, 'image/png'));
  const res = await fetch(path, { method: 'PUT', body: blob });
  return `${path} → ${res.status}`;
}

// One plain founder wearing each look option in turn (hair, hats, eyewear,
// facial hair, outfits), the figure only: the check that every look the
// profile screen offers still sits right on the 3/4 head and torso.
//
//   await m.looks('/lab/previews/figure-looks.png');
export async function looks(path = '/lab/previews/figure-looks.png', { scale = 1.4, cols = 8 } = {}) {
  const base = { ...getFighter('b-neo'), accessory: null, parts: undefined };
  const defs = [];
  for (const [field, options] of Object.entries(LOOKS)) {
    for (const { id } of options) defs.push({ ...base, [field]: id, name: `${field} ${id}` });
  }
  const was = STYLE.figure;
  STYLE.figure = true;
  try {
    const CW = 230 * scale, CH = 290 * scale, LAB = 18;
    const out = document.createElement('canvas');
    out.width = CW * cols; out.height = Math.ceil(defs.length / cols) * (CH + LAB);
    const oc = out.getContext('2d');
    oc.fillStyle = '#141a2e'; oc.fillRect(0, 0, out.width, out.height);
    const cell = document.createElement('canvas');
    cell.width = CW; cell.height = CH;
    const cc = cell.getContext('2d');
    defs.forEach((def, n) => {
      cc.setTransform(1, 0, 0, 1, 0, 0);
      cc.clearRect(0, 0, CW, CH);
      cc.scale(scale, scale);
      drawFighter(cc, fighterIn(def, CASES.idle, CW / scale / 2 - 30, CH / scale - 22), 0);
      const x = (n % cols) * CW, y = Math.floor(n / cols) * (CH + LAB);
      oc.drawImage(cell, x, y + LAB);
      oc.fillStyle = '#ffd23f'; oc.font = '600 13px system-ui';
      oc.fillText(def.name, x + 8, y + 14);
    });
    const blob = await new Promise((r) => out.toBlob(r, 'image/png'));
    const res = await fetch(path, { method: 'PUT', body: blob });
    return `${path} → ${res.status}`;
  } finally {
    STYLE.figure = was;
  }
}

// Draw cost, the tube rig against the figure, per fighter draw, in whatever
// browser runs it. Relative numbers only: headless Chromium draws in software.
//
//   await m.bench();     // { tube: ms, figure: ms }
export async function bench({ n = 400, ids = ['max', 'dex', 'zara', 'bozo'], shaded = true } = {}) {
  const cell = document.createElement('canvas');
  cell.width = 300; cell.height = 360;
  const cc = cell.getContext('2d');
  const was = STYLE.figure, wasShaded = STYLE.shaded;
  STYLE.shaded = shaded;
  const out = {};
  try {
    for (const mode of ['tube', 'figure', 'tube', 'figure']) {
      STYLE.figure = mode === 'figure';
      const t0 = performance.now();
      for (let i = 0; i < n; i++) {
        const def = getFighter(ids[i % ids.length]);
        const c = Object.values(CASES)[i % 10];
        cc.setTransform(1, 0, 0, 1, 0, 0);
        drawFighter(cc, fighterIn(def, c, 120, 330), (i % 60) / 60);
      }
      cc.getImageData(0, 0, 1, 1);   // wait for the draws to land
      out[mode] = +((performance.now() - t0) / n).toFixed(3);
    }
  } finally {
    STYLE.figure = was;
    STYLE.shaded = wasShaded;
  }
  return out;
}
