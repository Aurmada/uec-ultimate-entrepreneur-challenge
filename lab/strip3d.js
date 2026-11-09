// A strip of frames of one fighter in 3D, posed as a match poses them
// (computePose, the proportions, the figure's legs, landStrike, a knockout's
// fall to the floor), with the floor and, through an attack, its hitbox drawn
// over: for judging a move, a walk or a gesture frame by frame on the
// sculpted cast. Saved through dev-server.py's PUT.
// Run from the game page with the debug harness (3D is the default):
//
//   http://localhost:4173/?debug=1
//   const s = await import('/lab/strip3d.js');
//   await s.strip('/lab/previews/strip-kick.png', { id: 'zara', move: { kind: 'kick' } });
//   await s.strip('/lab/previews/strip-rug.png', { id: 'zara', move: { cmd: 'fwd+kick' } });
//   await s.strip('/lab/previews/strip-walk.png', { id: 'dex', state: 'walk' });
//
// `move` is a basic (`kind`), a command move (`cmd`, its slot) or the
// signature special (`special: true`); `state` is any other state, sampled
// across `frames` points of `length` seconds (or of the walk's cycle).

import { computePose, landStrike, groundFall, FACE_PAINTER, setRoundStart } from '/src/engine/drawFighter.js';
import { applyProportions, clampBody } from '/src/engine/proportions.js';
import { figureFrame } from '/src/engine/figure.js';
import { enable3D, has3D, form3D, athlete3D, renderFull3D, sink3D } from '/src/engine/gl3d/index.js';
import { getFighter } from '/src/data/fighters.js';
import { Fighter } from '/src/engine/fighter.js';
import { ATTACKS, STYLES, BOMB, STEAL, GL3D } from '/src/config.js';
import { shapeAttack } from '/src/engine/moves.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// The attack as Fighter.startAttack builds it, for a basic or a command move.
function attackFor(def, move) {
  const style = STYLES[def.style] || STYLES.balanced;
  if (move.cmd) {
    const cn = (def.commandNormals || []).find((c) => c.slot === move.cmd);
    const button = cn.slot.split('+')[1];
    const fd = { ...ATTACKS[button], ...cn.frameData };
    const a = { ...fd, kind: cn.archetype !== 'strike' ? cn.archetype : button, button, cmd: cn, hasHit: false,
      startup: fd.startup * style.startup, recovery: fd.recovery * style.recovery, reach: (fd.reach || 84) * style.reach };
    a.special = { ...(cn.params || {}), ...cn.frameData, type: cn.archetype };
    shapeAttack(a, a.special);
    return a;
  }
  if (move.special) {
    const noop = () => {};
    const game = { audio: { sfx: noop }, fx: { dust: noop, burst: noop, ring: noop, text: noop, spark: noop }, onSpecialStart: noop, onSpecialDenied: noop, onUnicorn: noop, other: () => null };
    const f = new Fighter(def, 0, { update: noop });
    f.energy = 100;
    f.startSpecial(game);
    return f.attack;
  }
  // the bomb and the steal, as Fighter.startBomb and startSteal build them
  if (move.kind === 'bomb') return { kind: 'bomb', hasHit: false, hasFired: false, startup: BOMB.startup, active: BOMB.active, recovery: BOMB.recovery };
  if (move.kind === 'steal') return { kind: 'steal', hasHit: false, startup: STEAL.startup, active: STEAL.active, recovery: STEAL.recovery, reach: STEAL.reach, hitY: -95 };
  return { ...ATTACKS[move.kind], kind: move.kind, button: move.kind, hasHit: false };
}

export async function strip(path, { id = 'bozo', move = null, state = 'idle', frames = 8, length = 1, crouching = false, airborne = false, intro = null, size = 260, span = 300, extra = {} } = {}) {
  enable3D();
  const def = getFighter(id);
  for (let i = 0; i < 200 && !has3D(def); i++) await wait(50);
  const form = form3D(def), body = clampBody(def.body);
  const atk = move ? attackFor(def, move) : null;
  const total = atk ? atk.startup + atk.active + atk.recovery : length;
  const CW = size, CH = Math.round(size * 1.25), LAB = 20;
  const out = document.createElement('canvas');
  out.width = CW * frames;
  out.height = CH + LAB;
  const oc = out.getContext('2d');
  oc.fillStyle = '#141a2e';
  oc.fillRect(0, 0, out.width, out.height);
  const real = Math.random;
  Math.random = () => 0.5;
  try {
    for (let i = 0; i < frames; i++) {
      const t = (total * i) / (frames - 1);
      const f = {
        def, state: atk ? 'attack' : state, stateT: t, walkPhase: state === 'walk' ? (2 * Math.PI * i) / frames : 0,
        side: 0, vy: airborne ? -300 : 0, airborne, crouching, movingBack: false, attack: atk, facing: 1,
        x: 0, y: 0, hitbox: Fighter.prototype.hitbox, ...extra,
      };
      setRoundStart(intro === null ? null : intro + (length * i) / (frames - 1));
      const P = applyProportions(computePose(f, t, form, intro === null ? null : intro + (length * i) / (frames - 1)), body);
      if (athlete3D(def)) figureFrame(P);
      let gx = 0, gy = 0;
      if (P.fall !== undefined) {
        // laid as drawFighter lays it, by the model's own lowest point too
        const g = groundFall(P), under = sink3D(def, P);
        const lift = under === null ? 0 : Math.min(0, GL3D.LIE.SOLE - (under + g.shift));
        gx = g.x + lift * Math.sin(P.rot || 0); gy = g.y + lift * Math.cos(P.rot || 0);
      }
      if (form) landStrike(f, P, t, form, body, athlete3D(def));
      const rect = { x: i * CW, y: LAB, w: CW, h: CH };
      const w = span, h = (span * CH) / CW, k = CW / w;
      // the same framing renderFull3D uses with no focus: the feet at 42%, 12 px up
      const X = (x) => rect.x + (w * 0.42 + x) * k, Y = (y) => rect.y + (h - 12 + y) * k;
      // turned about the feet and laid, as the match's 2D transform does
      oc.save();
      oc.beginPath(); oc.rect(rect.x, rect.y, rect.w, rect.h); oc.clip();
      oc.translate(X(0), Y(0));
      if (P.rot) oc.rotate(P.rot);
      oc.translate(gx * k, gy * k);
      oc.translate(-X(0), -Y(0));
      renderFull3D(oc, rect, def, P, { state: f.state, face: FACE_PAINTER, span });
      oc.restore();
      oc.strokeStyle = 'rgba(255,255,255,0.35)';
      oc.beginPath(); oc.moveTo(rect.x, Y(0)); oc.lineTo(rect.x + CW, Y(0)); oc.stroke();
      if (atk && f.stateT >= atk.startup && f.stateT <= atk.startup + atk.active) {
        const b = f.hitbox.call(f);
        if (b) {
          oc.strokeStyle = '#ff3d6e';
          oc.strokeRect(X(b.x), Y(b.y), b.w * k, b.h * k);
        }
      }
      oc.fillStyle = '#ffd23f';
      oc.font = '600 13px system-ui';
      oc.fillText(`${def.name.split(' ')[0]} ${move ? move.cmd || move.kind || 'special' : state} ${t.toFixed(2)}s`, rect.x + 8, 14);
    }
  } finally {
    Math.random = real;
    setRoundStart(null);
  }
  const blob = await new Promise((r) => out.toBlob(r, 'image/png'));
  const res = await fetch(path, { method: 'PUT', body: blob });
  return `${path} → ${res.status}`;
}
