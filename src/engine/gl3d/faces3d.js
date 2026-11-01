// Faces painted for sculpted heads (November 2026). RENDER-ONLY.
//
// The founder's head is shaped to the 2D face's layout, so the 2D painter
// (drawFighter.js drawFace) serves it. A sculpted head has a real brow, eyes
// set in sockets and a mouth where a mouth goes, and the 2D layout cannot sit
// on it: its eyes are mid-head, its mouth just under them, and no one scale
// puts both the brows and the mouth in place. So a sculpted model records
// where its features are (MODELS3D face `layout`), and this painter draws to
// that.
//
// It is called once per expression, as the 2D one is (gl3d/index.js
// paintFaces): the canvas centred on the cell, in the 2D px the model's
// `face.px` turns into model units, y down, the drawn face as seen head-on
// (so the character's right is on the left). It paints only what the sculpt
// cannot hold: the eyes, the brow hair and the mouth, which are what change
// from one expression to the next. The forms under them are sculpted.
//
// Two things decide a face. The layout is the head's: where its eyes, brow
// ridge and lips are, measured from the sculpt. The character is the
// fighter's own 2D face values (data/fighters.js `face`), the same knobs that
// tell nine 2D faces apart: how narrowed the eyes are, how big the irises,
// how heavy the brows and how hard they drop, how the mouth sets. The painter
// was drawn on Jeff, the first sculpted fighter, so his values are where each
// of those is pinned (FACE_REF) and another fighter's move it from there.
import { shade } from '../../data/fighters.js';
import { STYLIZE } from '../../config.js';

const INK = '#140c08';
const IRIS = '#47342a', WHITE = '#eee5d6';

// Jeff's 2D face values, where the painter's mappings are pinned.
export const FACE_REF = { LID_Y: 2.8, PUPIL_R: 2.1, BROW_TILT: 2.8, MOUTH_CURVE: 1.2 };

// The character, from the fighter's face values (the 2D defaults under any
// they leave out, as drawFace reads them), in this painter's px. Each moves
// only part of the way the 2D value does: the 2D face is drawn bold on a
// small head, and this one sits on sculpted forms that already carry a look.
export function character(def) {
  const F = { ...STYLIZE.FACE, ...(def.face || {}) };
  const d = (k) => F[k] - FACE_REF[k];
  return {
    open: 1.1 + d('LID_Y') * 0.25,              // half-height of the open eye: a heavy lid narrows it
    iris: 1.9 + d('PUPIL_R') * 0.5,
    pupil: 0.9 + d('PUPIL_R') * 0.24,
    brow: F.BROW_W,                             // stroke width, as in 2D
    tilt: d('BROW_TILT') * 0.5,                 // the inner ends drop by this more than Jeff's
    curve: d('MOUTH_CURVE'),                    // the set mouth, from Jeff's smirk
    // a fighter pleased with himself narrows his eyes at rest, as the
    // squint of a smile does
    smug: F.MOUTH_CURVE > 0,
  };
}

export function paintSculpted(g, def, expression, layout) {
  const J = layout, K = character(def), c = def.c || {};
  const hair = c.hair || INK;
  const lips = shade(c.skin || '#e2ab84', -38);
  g.lineCap = 'round';
  g.lineJoin = 'round';

  // How each expression sets the features: how open the eyes are (1 the
  // fighter's own rest), where the brows' inner ends sit (down is positive)
  // and their outer ends, and what the mouth does. The table is Jeff's; a
  // fighter whose brows drop harder (BROW_TILT) carries that into every one.
  const X = {
    idle:  { open: 1, inner: 0.6, outer: 0, mouth: 'set', squint: K.smug },
    angry: { open: 0.75, inner: 2.6, outer: -0.6, mouth: 'snarl' },
    block: { open: 0.65, inner: 2.2, outer: -0.4, mouth: 'grit' },
    hurt:  { open: 0, inner: -2, outer: 1.2, mouth: 'grimace' },
    ko:    { open: 0, inner: -0.8, outer: 1, mouth: 'slack' },
    happy: { open: 0.9, inner: -0.6, outer: -0.6, mouth: 'grin', squint: true },
  }[expression] || { open: 1, inner: 0.6, outer: 0, mouth: 'set' };
  const inner = X.inner + K.tilt, outer = X.outer - K.tilt * 0.4;

  for (const s of [-1, 1]) {
    const ex = s * J.eye.x, ey = J.eye.y;
    if (X.open > 0) {
      // the white, an almond under a lid that sits low
      const h = K.open * X.open;
      g.fillStyle = WHITE;
      g.beginPath();
      const nose = -s;                         // toward the nose
      g.moveTo(ex + nose * J.eye.w, ey + 0.2);
      g.lineTo(ex + nose * J.eye.w * 0.3, ey - h * 1.5);
      g.lineTo(ex - nose * J.eye.w * 0.6, ey - h * 1.6);
      g.quadraticCurveTo(ex - nose * J.eye.w * 1.05, ey - h * 0.9, ex - nose * J.eye.w, ey + 0.2);
      g.quadraticCurveTo(ex, ey + h * 1.5, ex + nose * J.eye.w, ey + 0.2);
      g.fill();
      // the iris, clipped by the lids, looking straight ahead
      g.save();
      g.clip();
      g.fillStyle = IRIS;
      g.beginPath(); g.arc(ex, ey - 0.6, K.iris, 0, 7); g.fill();
      g.fillStyle = INK;
      g.beginPath(); g.arc(ex, ey - 0.6, K.pupil, 0, 7); g.fill();
      // a catchlight: the difference between a glare and a tired stare
      g.fillStyle = WHITE;
      g.beginPath(); g.arc(ex - 0.6, ey - 1.1, 0.42, 0, 7); g.fill();
      g.restore();
      // a squint: the lower lid pushed up under the outer half
      if (X.squint) {
        g.strokeStyle = INK;
        g.lineWidth = J.lid * 0.55;
        g.beginPath();
        g.moveTo(ex - nose * J.eye.w * 0.05, ey + h * 1.25);
        g.quadraticCurveTo(ex - nose * J.eye.w * 0.7, ey + h * 1.0, ex - nose * (J.eye.w + 0.2), ey + 0.1);
        g.stroke();
      }
      // the heavy upper lid line
      g.strokeStyle = INK;
      g.lineWidth = J.lid;
      g.beginPath();
      g.moveTo(ex + nose * (J.eye.w + 0.3), ey + 0.3);
      g.lineTo(ex + nose * J.eye.w * 0.3, ey - h * 1.5 - 0.2);
      g.lineTo(ex - nose * J.eye.w * 0.6, ey - h * 1.6 - 0.2);
      g.quadraticCurveTo(ex - nose * J.eye.w * 1.05, ey - h * 0.9, ex - nose * (J.eye.w + 0.4), ey + 0.4);
      g.stroke();
    } else {
      // shut: squeezed in pain, or closed out cold
      g.strokeStyle = INK;
      g.lineWidth = J.lid;
      g.beginPath();
      if (expression === 'hurt') {
        g.moveTo(ex - J.eye.w, ey - 0.6);
        g.quadraticCurveTo(ex, ey + 1.2, ex + J.eye.w, ey - 0.6);
      } else {
        g.moveTo(ex - J.eye.w, ey + 0.4);
        g.lineTo(ex + J.eye.w, ey + 0.4);
      }
      g.stroke();
    }
    // the brow, along the lower edge of the ridge
    g.strokeStyle = hair;
    g.lineWidth = K.brow;
    g.beginPath();
    g.moveTo(s * J.brow.inner, J.brow.y + inner);
    g.lineTo(s * (J.brow.inner + J.brow.outer) * 0.55, J.brow.y + (inner + outer) * 0.35);
    g.lineTo(s * J.brow.outer, J.brow.y + outer - 0.4);
    g.stroke();
  }

  // the mouth
  const my = J.mouth.y, mw = J.mouth.w;
  g.strokeStyle = INK;
  g.lineWidth = J.line;
  const teeth = (top, bottom, w) => {
    g.fillStyle = WHITE;
    g.beginPath();
    g.moveTo(-w, my + top * 0.3);
    g.quadraticCurveTo(0, my + top, w, my + top * 0.3);
    g.lineTo(w, my + bottom * 0.3);
    g.quadraticCurveTo(0, my + bottom, -w, my + bottom * 0.3);
    g.closePath();
    g.fill();
    g.stroke();
  };
  if (X.mouth === 'set') {
    // the fighter's own set: Jeff's is a smirk, one corner up; a lower
    // MOUTH_CURVE levels it, and below zero pulls both corners down
    const k = K.curve;
    g.beginPath();
    g.moveTo(-mw, my + 0.2 - k * 0.4);
    g.quadraticCurveTo(0, my + 0.8 + k * 0.5, mw + 0.4, my - 1.3 - k * 0.9);
    g.stroke();
    lip(g, lips, my, mw);
  } else if (X.mouth === 'snarl') {
    teeth(-1.4, 1.4, mw * 0.85);
    g.beginPath();
    g.moveTo(-mw, my + 1.4); g.quadraticCurveTo(0, my - 2.4, mw, my + 1.4);
    g.stroke();
  } else if (X.mouth === 'grit') {
    teeth(-1.1, 1.1, mw * 0.9);
    g.beginPath(); g.moveTo(-mw * 0.9, my); g.lineTo(mw * 0.9, my); g.stroke();
  } else if (X.mouth === 'grimace') {
    teeth(-1.6, 1.8, mw);
    g.beginPath(); g.moveTo(-mw * 0.95, my + 0.1); g.lineTo(mw * 0.95, my + 0.1); g.stroke();
  } else if (X.mouth === 'slack') {
    g.fillStyle = '#3a1a14';
    g.beginPath(); g.ellipse(0, my + 1.2, mw * 0.45, 2.2, 0, 0, 7); g.fill(); g.stroke();
  } else if (X.mouth === 'grin') {
    teeth(-0.9, 1.6, mw * 0.9);
    g.beginPath();
    g.moveTo(-mw - 0.4, my - 1.4); g.quadraticCurveTo(0, my + 2.6, mw + 0.4, my - 1.6);
    g.stroke();
  }
}

// The lower lip's shadow under a closed mouth, so the mouth reads as lips at
// fight size and not as a line drawn across the chin.
function lip(g, colour, my, mw) {
  g.fillStyle = colour;
  g.globalAlpha = 0.55;
  g.beginPath();
  g.moveTo(-mw * 0.7, my + 1.6);
  g.quadraticCurveTo(0, my + 3.4, mw * 0.7, my + 1.6);
  g.quadraticCurveTo(0, my + 2.2, -mw * 0.7, my + 1.6);
  g.fill();
  g.globalAlpha = 1;
}
