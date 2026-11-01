// The 3D models side by side, large: a fighter in today's founder body and in
// the athlete body (lab/blender/build_founder.py), in the same poses, drawn by
// the same toon renderer a match uses. Saved through dev-server.py's PUT.
//
//   const m = await import('/lab/figure3d.js');
//   await m.sheet('/lab/previews/figure3d.png', { ids: ['bozo', 'max'] });
//
// Poses are computed as drawFighter computes them for the 3D path.

import { computePose, FACE_PAINTER } from '/src/engine/drawFighter.js';
import { applyProportions, clampBody } from '/src/engine/proportions.js';
import { enable3D, has3D, form3D, preload3D, renderFull3D } from '/src/engine/gl3d/index.js';
import { FIGHTER_MODELS, athleteFor } from '/src/data/models3d.js';
// `models` entries: 'founder' (today's), 'athlete' (the shared new body), 'own' (each fighter's own),
// 'sculpted' (each fighter's sculpt, `sculpt:<id>`, for those remodelled so far).
const modelId = (model, def) => (model === 'athlete' ? athleteFor(def) : model === 'own' ? def.id
  : model === 'sculpted' ? `sculpt:${def.id}` : model);
const LABEL = { founder: 'today', athlete: 'shared new body', own: 'own body', sculpted: 'sculpted' };
import { getFighter } from '/src/data/fighters.js';
import { ATTACKS } from '/src/config.js';
import { CASES } from '/lab/figure-sheet.js';
import { figureFrame } from '/src/engine/figure.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export async function sheet(path, { ids = ['bozo'], cases = ['idle', 'punch', 'kick', 'launch'], models = ['founder', 'athlete'], size = 360, span = 250, cols = 0, frame = false } = {}) {
  enable3D();
  for (const m of [...models, 'athlete-f']) preload3D(m);
  const saved = { ...FIGHTER_MODELS };
  const CW = size, CH = Math.round(size * 1.3), LAB = 20;
  const out = document.createElement('canvas');
  out.width = CW * cases.length;
  out.height = ids.length * models.length * (CH + LAB);
  const oc = out.getContext('2d');
  oc.fillStyle = '#141a2e';
  oc.fillRect(0, 0, out.width, out.height);
  const real = Math.random;
  Math.random = () => 0.5;
  try {
    let row = 0;
    for (const id of ids) {
      const def = getFighter(id);
      for (const model of models) {
        FIGHTER_MODELS[id] = modelId(model, def);
        for (let i = 0; i < 200 && !has3D(def); i++) await wait(50);
        cases.forEach((name, i) => {
          const c = CASES[name];
          const f = {
            def, state: c.state, stateT: c.stateT ?? 0, walkPhase: c.walkPhase ?? 0, side: 0,
            vy: c.airborne ? -300 : 0, airborne: !!c.airborne, crouching: !!c.crouching, movingBack: false,
            attack: c.kind ? { ...ATTACKS[c.kind], kind: c.kind, button: c.kind, hasHit: false } : null,
          };
          const P = applyProportions(computePose(f, c.t, form3D(def)), clampBody(def.body));
          if (frame && model !== 'founder') figureFrame(P);     // as the game stands the new bodies
          const y = row * (CH + LAB);
          renderFull3D(oc, { x: i * CW, y: y + LAB, w: CW, h: CH }, def, P, { state: c.state, face: FACE_PAINTER, span });
          oc.fillStyle = model === 'founder' ? '#9fb0d9' : '#ffd23f';
          oc.font = '600 14px system-ui';
          oc.fillText(`${def.name.split(' ')[0]}  ${LABEL[model] || model}  ${name}`, i * CW + 10, y + 15);
        });
        row++;
      }
    }
  } finally {
    Math.random = real;
    for (const k of Object.keys(FIGHTER_MODELS)) delete FIGHTER_MODELS[k];
    Object.assign(FIGHTER_MODELS, saved);
  }
  const blob = await new Promise((r) => out.toBlob(r, 'image/png'));
  const res = await fetch(path, { method: 'PUT', body: blob });
  return `${path} → ${res.status}`;
}

// A model's face up close in every expression, standing in its idle pose, as
// the renderer paints it: for judging a sculpted head and its painted face.
//
//   await m.faces('/lab/previews/faces.png', { id: 'bozo' });   // their sculpt, `sculpt:<id>`
export async function faces(path, { id = 'bozo', model = `sculpt:${id}`, size = 360, span = 52, focus = [14, -168], turn = null } = {}) {
  const { FACE_STATES } = await import('/src/data/models3d.js');
  const { GL3D } = await import('/src/config.js');
  enable3D();
  preload3D(model);
  const saved = { ...FIGHTER_MODELS }, yaw = { YAW: GL3D.YAW, HIP_YAW: GL3D.HIP_YAW, HEAD_YAW: GL3D.HEAD_YAW };
  const def = getFighter(id);
  const out = document.createElement('canvas');
  out.width = size * FACE_STATES.length;
  out.height = size + 20;
  const oc = out.getContext('2d');
  oc.fillStyle = '#141a2e';
  oc.fillRect(0, 0, out.width, out.height);
  try {
    FIGHTER_MODELS[id] = model;
    // `turn` faces the body toward the viewer, as a portrait does
    if (turn) Object.assign(GL3D, turn);
    for (let i = 0; i < 200 && !has3D(def); i++) await wait(50);
    FACE_STATES.forEach((expression, i) => {
      const f = { def, state: 'idle', stateT: 0, walkPhase: 0, side: 0, vy: 0, airborne: false, crouching: false, movingBack: false, attack: null };
      const P = applyProportions(computePose(f, 0, form3D(def)), clampBody(def.body));
      figureFrame(P);
      P.face = expression;
      renderFull3D(oc, { x: i * size, y: 20, w: size, h: size }, def, P, { face: FACE_PAINTER, span, focus });
      oc.fillStyle = '#ffd23f';
      oc.font = '600 14px system-ui';
      oc.fillText(expression, i * size + 10, 15);
    });
  } finally {
    Object.assign(GL3D, yaw);
    for (const k of Object.keys(FIGHTER_MODELS)) delete FIGHTER_MODELS[k];
    Object.assign(FIGHTER_MODELS, saved);
  }
  const blob = await new Promise((r) => out.toBlob(r, 'image/png'));
  const res = await fetch(path, { method: 'PUT', body: blob });
  return `${path} → ${res.status}`;
}

// The cast in one pose, a row per body: today's founder over the athlete.
//
//   await m.cast('/lab/previews/figure3d-cast.png', { pose: 'idle' });
export async function cast(path, { ids, pose = 'idle', models = ['founder', 'athlete'], size = 300, span = 210, frame = false } = {}) {
  const { FIGHTERS } = await import('/src/data/fighters.js');
  ids ||= FIGHTERS.map((d) => d.id);
  enable3D();
  for (const m of [...models, 'athlete-f']) preload3D(m);
  const saved = { ...FIGHTER_MODELS };
  const CW = size, CH = Math.round(size * 1.35), LAB = 20;
  const out = document.createElement('canvas');
  out.width = CW * ids.length;
  out.height = models.length * (CH + LAB);
  const oc = out.getContext('2d');
  oc.fillStyle = '#141a2e';
  oc.fillRect(0, 0, out.width, out.height);
  const real = Math.random;
  Math.random = () => 0.5;
  try {
    for (const [row, model] of models.entries()) {
      for (const [i, id] of ids.entries()) {
        const def = getFighter(id);
        FIGHTER_MODELS[id] = modelId(model, def);
        for (let k = 0; k < 200 && !has3D(def); k++) await wait(50);
        const c = CASES[pose];
        const f = {
          def, state: c.state, stateT: c.stateT ?? 0, walkPhase: c.walkPhase ?? 0, side: 0,
          vy: c.airborne ? -300 : 0, airborne: !!c.airborne, crouching: !!c.crouching, movingBack: false,
          attack: c.kind ? { ...ATTACKS[c.kind], kind: c.kind, button: c.kind, hasHit: false } : null,
        };
        const P = applyProportions(computePose(f, c.t, form3D(def)), clampBody(def.body));
        if (frame && model !== 'founder') figureFrame(P);
        const y = row * (CH + LAB);
        renderFull3D(oc, { x: i * CW, y: y + LAB, w: CW, h: CH }, def, P, { state: c.state, face: FACE_PAINTER, span });
        oc.fillStyle = model === 'founder' ? '#9fb0d9' : '#ffd23f';
        oc.font = '600 14px system-ui';
        oc.fillText(`${def.name.split(' ')[0]}  ${LABEL[model] || model}`, i * CW + 10, y + 15);
      }
    }
  } finally {
    Math.random = real;
    for (const k of Object.keys(FIGHTER_MODELS)) delete FIGHTER_MODELS[k];
    Object.assign(FIGHTER_MODELS, saved);
  }
  const blob = await new Promise((r) => out.toBlob(r, 'image/png'));
  const res = await fetch(path, { method: 'PUT', body: blob });
  return `${path} → ${res.status}`;
}
