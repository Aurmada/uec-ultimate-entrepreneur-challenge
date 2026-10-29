// Pose gallery for the live 3D renderer: one fighter through every state,
// the procedural rig on top and the 3D model underneath, same pose data.
// Served by dev-server.py (it needs the PUT handler to save the sheet).
//
//   const m = await import('/lab/gl3d-gallery.js');
//   await m.gallery('max', '/lab/previews/gl3d-gallery.png');
//   await m.gallery('kai', '/lab/previews/gl3d-kai.png');
//
// States are staged the same way test/golden/index.html stages them, so a
// cell here is the frame the golden check hashes.

import { drawFighter } from '/src/engine/drawFighter.js';
import { enable3D, disable3D, has3D, debug3D } from '/src/engine/gl3d/index.js';
import { getFighter } from '/src/data/fighters.js';
import { ATTACKS } from '/src/config.js';
import { clampBody } from '/src/engine/proportions.js';

const CASES = [
  { label: 'idle', state: 'idle', t: 0 },
  { label: 'walk', state: 'walk', t: 0.5, walkPhase: 2.1 },
  { label: 'crouch', state: 'crouch', t: 0.5, crouching: true },
  { label: 'jump', state: 'jump', t: 0.5, airborne: true },
  { label: 'block', state: 'block', t: 0.5 },
  { label: 'slap', state: 'attack', t: 0.5, kind: 'slap', stateT: 0.07 },
  { label: 'punch', state: 'attack', t: 0.5, kind: 'punch', stateT: 0.08 },
  { label: 'kick', state: 'attack', t: 0.5, kind: 'kick', stateT: 0.14 },
  { label: 'launch', state: 'attack', t: 0.5, kind: 'launch', stateT: 0.11 },
  { label: 'hitstun', state: 'hitstun', t: 0.5, stateT: 0.1 },
  { label: 'ko', state: 'ko', t: 0.5, stateT: 0.4 },
  { label: 'victory', state: 'victory', t: 0.9, stateT: 0.6 },
];

export async function gallery(id = 'max', path = '/lab/previews/gl3d-gallery.png') {
  enable3D();
  const def = getFighter(id);
  for (let i = 0; i < 100 && !has3D(def); i++) await new Promise((r) => setTimeout(r, 50));
  if (!has3D(def)) return `${id} did not load a 3D model`;

  const CW = 300, CH = 340, LAB = 22;
  const out = document.createElement('canvas');
  out.width = CW * CASES.length;
  out.height = (CH + LAB) * 2;
  const oc = out.getContext('2d');
  oc.fillStyle = '#141a2e';
  oc.fillRect(0, 0, out.width, out.height);
  const cell = document.createElement('canvas');
  cell.width = CW; cell.height = CH;
  const cc = cell.getContext('2d');

  const realRandom = Math.random;
  Math.random = () => 0.5;             // hitstun jitter and the like, pinned
  try {
    for (const [row, mode] of [[0, '2d'], [1, '3d']]) {
      if (mode === '2d') disable3D(); else enable3D();
      CASES.forEach((c, i) => {
        cc.setTransform(1, 0, 0, 1, 0, 0);
        cc.clearRect(0, 0, CW, CH);
        drawFighter(cc, {
          def, body: clampBody(def.body), side: 0, x: CW / 2 - 30, y: CH - 24, facing: 1,
          state: c.state, stateT: c.stateT ?? 0, walkPhase: c.walkPhase ?? 0, vy: c.airborne ? -300 : 0,
          airborne: !!c.airborne, crouching: !!c.crouching, movingBack: false,
          unicornT: 0, flashT: 0,
          attack: c.kind ? { ...ATTACKS[c.kind], kind: c.kind, button: c.kind, hasHit: false } : null,
        }, c.t);
        oc.drawImage(cell, i * CW, row * (CH + LAB) + LAB);
        oc.fillStyle = mode === '3d' ? '#ffd23f' : '#9fb0d9';
        oc.font = '600 14px system-ui';
        oc.fillText(`${mode.toUpperCase()}  ${c.label}`, i * CW + 10, row * (CH + LAB) + 16);
      });
    }
  } finally {
    Math.random = realRandom;
    enable3D();
  }
  const blob = await new Promise((r) => out.toBlob(r, 'image/png'));
  const res = await fetch(path, { method: 'PUT', body: blob });
  return `${path} → ${res.status}`;
}

// Every roster fighter in idle: the 2D rig on top, the modular 3D model below.
// This is the sheet that answers "can one model be nine different people?".
//
//   await m.roster('/lab/previews/gl3d-roster.png');
export async function roster(path = '/lab/previews/gl3d-roster.png', state = 'idle') {
  const { FIGHTERS } = await import('/src/data/fighters.js');
  return sheet(path, FIGHTERS.map((def) => ({ def, label: def.name.split(' ')[0], state })), true);
}

// One plain founder wearing each look option in turn, 3D only, a row per slot.
// `bust` draws each as its portrait instead, which is the way to judge what
// sits on the head against the painted face.
//
//   await m.looks('/lab/previews/gl3d-looks.png');
//   await m.looks('/lab/previews/gl3d-looks-bust.png', { bust: true });
export async function looks(path = '/lab/previews/gl3d-looks.png', { bust = false } = {}) {
  const { LOOKS, getFighter } = await import('/src/data/fighters.js');
  const base = { ...getFighter('b-neo'), accessory: null, parts: undefined };
  const cells = [];
  for (const [field, options] of Object.entries(LOOKS)) {
    for (const { id } of options) {
      cells.push({ def: { ...base, [field]: id }, label: `${field} ${id}`, state: 'idle', row: field });
    }
  }
  return bust ? bustSheet(path, cells) : sheet(path, cells, false);
}

async function bustSheet(path, cells, size = 160) {
  const { drawPortrait } = await import('/src/engine/drawFighter.js');
  enable3D();
  for (let i = 0; i < 100 && !has3D(cells[0].def); i++) await new Promise((r) => setTimeout(r, 50));
  const rows = [...new Set(cells.map((c) => c.row))];
  const cols = Math.max(...rows.map((r) => cells.filter((c) => c.row === r).length));
  const LAB = 18, GAP = 6;
  const out = document.createElement('canvas');
  out.width = cols * (size + GAP) + GAP;
  out.height = rows.length * (size + LAB + GAP);
  const oc = out.getContext('2d');
  oc.fillStyle = '#141a2e';
  oc.fillRect(0, 0, out.width, out.height);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  rows.forEach((row, r) => {
    cells.filter((cell) => cell.row === row).forEach((cell, i) => {
      const x = GAP + i * (size + GAP), y = r * (size + LAB + GAP);
      drawPortrait(c, cell.def);
      oc.drawImage(c, x, y + LAB);
      oc.fillStyle = '#ffd23f';
      oc.font = '600 12px system-ui';
      oc.fillText(cell.label, x + 4, y + 13);
    });
  });
  const blob = await new Promise((res) => out.toBlob(res, 'image/png'));
  const res = await fetch(path, { method: 'PUT', body: blob });
  return `${path} → ${res.status}`;
}

// Every roster fighter's head in each expression state, close up: a 2D and a
// 3D crop side by side per state, a row per fighter. Crops are enlarged from
// the fight-size render, so this is what a face looks like in a match.
//
//   await m.faces('/lab/previews/gl3d-faces.png');
const EXPRESSIONS = [
  { label: 'idle', state: 'idle', t: 0 },
  { label: 'attack', state: 'attack', t: 0.5, kind: 'punch', stateT: 0.08 },
  { label: 'block', state: 'block', t: 0.5 },
  { label: 'hitstun', state: 'hitstun', t: 0.5, stateT: 0.1 },
  { label: 'ko', state: 'ko', t: 0.5, stateT: 0.4 },
  { label: 'victory', state: 'victory', t: 0.9, stateT: 0.6 },
];
export async function faces(path = '/lab/previews/gl3d-faces.png', ids = null) {
  const { FIGHTERS } = await import('/src/data/fighters.js');
  const defs = ids ? ids.map((id) => getFighter(id)) : FIGHTERS;
  enable3D();
  for (let i = 0; i < 100 && !has3D(defs[0]); i++) await new Promise((r) => setTimeout(r, 50));
  const CW = 560, CH = 340, CROP = 64, ZOOM = 2.5, TILE = CROP * ZOOM, LAB = 20, NAME = 90;
  const out = document.createElement('canvas');
  out.width = NAME + EXPRESSIONS.length * TILE * 2;
  out.height = LAB + defs.length * TILE;
  const oc = out.getContext('2d');
  oc.fillStyle = '#141a2e';
  oc.fillRect(0, 0, out.width, out.height);
  oc.imageSmoothingQuality = 'high';
  const cell = document.createElement('canvas');
  cell.width = CW; cell.height = CH;
  const cc = cell.getContext('2d');
  const realRandom = Math.random;
  Math.random = () => 0.5;
  try {
    defs.forEach((def, row) => {
      oc.fillStyle = '#9fb0d9';
      oc.font = '600 13px system-ui';
      oc.fillText(def.name.split(' ')[0], 8, LAB + row * TILE + TILE / 2);
      EXPRESSIONS.forEach((c, col) => {
        let head = null;
        for (const [k, mode] of [[1, '3d'], [0, '2d']]) {
          if (mode === '2d') disable3D(); else enable3D();
          cc.setTransform(1, 0, 0, 1, 0, 0);
          cc.clearRect(0, 0, CW, CH);
          const f = {
            def, body: clampBody(def.body), side: 0, x: CW / 2, y: CH - 40, facing: 1,
            state: c.state, stateT: c.stateT ?? 0, walkPhase: 0, vy: 0, airborne: false, crouching: false,
            movingBack: false, unicornT: 0, flashT: 0,
            attack: c.kind ? { ...ATTACKS[c.kind], kind: c.kind, button: c.kind, hasHit: false } : null,
          };
          drawFighter(cc, f, c.t);
          if (mode === '3d') {
            // the head centre, from the pose the 3D path just used (both rows share it)
            const P = debug3D().P, hx = P.headX + P.bodyLean * 26, hy = P.headY;
            const cos = Math.cos(P.rot || 0), sin = Math.sin(P.rot || 0);
            head = [f.x + hx * cos - hy * sin, f.y + hx * sin + hy * cos];
          }
          oc.drawImage(cell, head[0] - CROP / 2, head[1] - CROP / 2, CROP, CROP,
            NAME + (col * 2 + k) * TILE, LAB + row * TILE, TILE, TILE);
        }
        if (row === 0) {
          oc.fillStyle = '#ffd23f';
          oc.fillText(`${c.label}  2D | 3D`, NAME + col * 2 * TILE + 8, 15);
        }
      });
    });
  } finally {
    Math.random = realRandom;
    enable3D();
  }
  const blob = await new Promise((r) => out.toBlob(r, 'image/png'));
  const res = await fetch(path, { method: 'PUT', body: blob });
  return `${path} → ${res.status}`;
}

// Portraits as the UI draws them, a row per roster fighter: the 2D bust, then
// the 3D bust in each expression a screen asks for.
//
//   await m.portraits('/lab/previews/gl3d-portraits.png');
export async function portraits(path = '/lab/previews/gl3d-portraits.png', size = 240, ids = null) {
  const { FIGHTERS } = await import('/src/data/fighters.js');
  const { drawPortrait } = await import('/src/engine/drawFighter.js');
  const defs = ids ? ids.map((id) => getFighter(id)) : FIGHTERS;
  const faces = ['idle', 'angry', 'block', 'hurt', 'ko', 'happy'];
  enable3D();
  for (let i = 0; i < 100 && !has3D(defs[0]); i++) await new Promise((r) => setTimeout(r, 50));
  const GAP = 8, LAB = 20;
  const out = document.createElement('canvas');
  out.width = (faces.length + 1) * (size + GAP) + GAP;
  out.height = LAB + defs.length * (size + GAP) + GAP;
  const oc = out.getContext('2d');
  oc.fillStyle = '#141a2e';
  oc.fillRect(0, 0, out.width, out.height);
  oc.fillStyle = '#ffd23f';
  oc.font = '600 13px system-ui';
  ['2D idle', ...faces.map((f) => `3D ${f}`)].forEach((l, i) => oc.fillText(l, GAP + i * (size + GAP) + 4, 15));
  const c = document.createElement('canvas');
  c.width = c.height = size;
  try {
    defs.forEach((def, row) => {
      const y = LAB + row * (size + GAP);
      disable3D();
      drawPortrait(c, def);
      oc.drawImage(c, GAP, y);
      enable3D();
      faces.forEach((face, i) => {
        drawPortrait(c, def, { face });
        oc.drawImage(c, GAP + (i + 1) * (size + GAP), y);
      });
    });
  } finally {
    enable3D();
  }
  const blob = await new Promise((r) => out.toBlob(r, 'image/png'));
  const res = await fetch(path, { method: 'PUT', body: blob });
  return `${path} → ${res.status}`;
}

async function sheet(path, cells, withTwoD) {
  enable3D();
  for (let i = 0; i < 100 && !has3D(cells[0].def); i++) await new Promise((r) => setTimeout(r, 50));
  const CW = 230, CH = 300, LAB = 20;
  const rows = withTwoD ? [['2d', cells], ['3d', cells]]
    : [...new Set(cells.map((c) => c.row))].map((r) => ['3d', cells.filter((c) => c.row === r)]);
  const cols = Math.max(...rows.map(([, cs]) => cs.length));
  const out = document.createElement('canvas');
  out.width = CW * cols;
  out.height = (CH + LAB) * rows.length;
  const oc = out.getContext('2d');
  oc.fillStyle = '#141a2e';
  oc.fillRect(0, 0, out.width, out.height);
  const cell = document.createElement('canvas');
  cell.width = CW; cell.height = CH;
  const cc = cell.getContext('2d');
  const realRandom = Math.random;
  Math.random = () => 0.5;
  try {
    rows.forEach(([mode, cs], row) => {
      if (mode === '2d') disable3D(); else enable3D();
      cs.forEach((c, i) => {
        cc.setTransform(1, 0, 0, 1, 0, 0);
        cc.clearRect(0, 0, CW, CH);
        drawFighter(cc, {
          def: c.def, body: clampBody(c.def.body), side: 0, x: CW / 2, y: CH - 18, facing: 1,
          state: c.state, stateT: 0, walkPhase: 0, vy: 0, airborne: false, crouching: false,
          movingBack: false, unicornT: 0, flashT: 0, attack: null,
        }, 0);
        oc.drawImage(cell, i * CW, row * (CH + LAB) + LAB);
        oc.fillStyle = mode === '3d' ? '#ffd23f' : '#9fb0d9';
        oc.font = '600 13px system-ui';
        oc.fillText(`${mode.toUpperCase()}  ${c.label}`, i * CW + 8, row * (CH + LAB) + 15);
      });
    });
  } finally {
    Math.random = realRandom;
    enable3D();
  }
  const blob = await new Promise((r) => out.toBlob(r, 'image/png'));
  const res = await fetch(path, { method: 'PUT', body: blob });
  return `${path} → ${res.status}`;
}
