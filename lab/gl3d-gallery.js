// Pose gallery for the live 3D renderer: one fighter through every state,
// the procedural rig on top and the 3D model underneath, same pose data.
// Served by dev-server.py (it needs the PUT handler to save the sheet).
//
//   const m = await import('/lab/gl3d-gallery.js');
//   await m.gallery('max', '/lab/previews/gl3d-gallery.png');
//   await m.gallery('kai', '/lab/previews/gl3d-kai.png', { all: true });  // Adam's mesh, Steve's palette
//
// States are staged the same way test/golden/index.html stages them, so a
// cell here is the frame the golden check hashes.

import { drawFighter } from '/src/engine/drawFighter.js';
import { enable3D, disable3D, has3D } from '/src/engine/gl3d/index.js';
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

export async function gallery(id = 'max', path = '/lab/previews/gl3d-gallery.png', { all = false } = {}) {
  enable3D({ all });
  const def = getFighter(id);
  for (let i = 0; i < 100 && !has3D(def); i++) await new Promise((r) => setTimeout(r, 50));
  if (!has3D(def)) return `${id} has no 3D model (try { all: true })`;

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
      if (mode === '2d') disable3D(); else enable3D({ all });
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
    enable3D({ all });
  }
  const blob = await new Promise((r) => out.toBlob(r, 'image/png'));
  const res = await fetch(path, { method: 'PUT', body: blob });
  return `${path} → ${res.status}`;
}
