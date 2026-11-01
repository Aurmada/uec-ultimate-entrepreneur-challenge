// Faces painted for sculpted heads (November 2026). RENDER-ONLY.
//
// The founder's head is shaped to the 2D face's layout, so the 2D painter
// (drawFighter.js drawFace) serves it. A sculpted head has a real brow, eyes
// set in sockets and a mouth where a mouth goes, and the 2D layout cannot sit
// on it: its eyes are mid-head, its mouth just under them, and no one scale
// puts both the brows and the mouth in place. So a sculpted model names its
// own painter (MODELS3D face `painter`), drawn to that sculpt.
//
// A painter is called once per expression, as the 2D one is (gl3d/index.js
// paintFaces): the canvas centred on the cell, in the 2D px the model's
// `face.px` turns into model units, y down, the drawn face as seen head-on
// (so the character's right is on the left). It paints only what the sculpt
// cannot hold: the eyes, the brow hair and the mouth, which are what change
// from one expression to the next. The forms under them are sculpted.
import { shade } from '../../data/fighters.js';

const INK = '#140c08';

// Jeff (lab/blender/sculpt_jeff.py), at 0.0035 model units a px, centred on
// the face at 1.79: the eyes 0.033 out and at 1.825, the lower edge of the brow
// at 1.842, the lips meeting at 1.7395.
const JEFF = {
  eye: { x: 9.4, y: -10, w: 3.7, h: 1.1 },      // centre, half-width, half-height of the open eye
  brow: { y: -14.9, inner: 3.0, outer: 17.2, w: 3.6 },
  mouth: { y: 14.4, w: 6.2 },
  // Strokes are bold: a fight-size head is about 26 px tall, and at the
  // texture's 0.35 screen px a stroke px, finer lines vanish in a match.
  lid: 1.7, line: 1.4,
  iris: '#47342a', white: '#eee5d6',
};

function paintJeff(g, def, expression) {
  const J = JEFF, c = def.c || {};
  const hair = c.hair || INK;
  const lips = shade(c.skin || '#e2ab84', -38);
  g.lineCap = 'round';
  g.lineJoin = 'round';

  // How each expression sets the features: how open the eyes are (1 his
  // narrowed rest), where the brows' inner ends sit (down is positive) and
  // their outer ends, and what the mouth does.
  const X = {
    idle:  { open: 1, inner: 0.6, outer: 0, mouth: 'set', squint: 1 },
    angry: { open: 0.75, inner: 2.6, outer: -0.6, mouth: 'snarl' },
    block: { open: 0.65, inner: 2.2, outer: -0.4, mouth: 'grit' },
    hurt:  { open: 0, inner: -2, outer: 1.2, mouth: 'grimace' },
    ko:    { open: 0, inner: -0.8, outer: 1, mouth: 'slack' },
    happy: { open: 0.9, inner: -0.6, outer: -0.6, mouth: 'grin', squint: 1 },
  }[expression] || { open: 1, inner: 0.6, outer: 0, mouth: 'set' };

  for (const s of [-1, 1]) {
    const ex = s * J.eye.x, ey = J.eye.y;
    if (X.open > 0) {
      // the white, an almond under a lid that sits low: he is never wide-eyed
      const h = J.eye.h * X.open;
      g.fillStyle = J.white;
      g.beginPath();
      const inner = -s;                       // toward the nose
      g.moveTo(ex + inner * J.eye.w, ey + 0.2);
      g.lineTo(ex + inner * J.eye.w * 0.3, ey - h * 1.5);
      g.lineTo(ex - inner * J.eye.w * 0.6, ey - h * 1.6);
      g.quadraticCurveTo(ex - inner * J.eye.w * 1.05, ey - h * 0.9, ex - inner * J.eye.w, ey + 0.2);
      g.quadraticCurveTo(ex, ey + h * 1.5, ex + inner * J.eye.w, ey + 0.2);
      g.fill();
      // the iris, clipped by the lids, looking straight ahead
      g.save();
      g.clip();
      g.fillStyle = J.iris;
      g.beginPath(); g.arc(ex, ey - 0.6, 1.9, 0, 7); g.fill();
      g.fillStyle = INK;
      g.beginPath(); g.arc(ex, ey - 0.6, 0.9, 0, 7); g.fill();
      // a catchlight: the difference between a glare and a tired stare
      g.fillStyle = J.white;
      g.beginPath(); g.arc(ex - 0.6, ey - 1.1, 0.42, 0, 7); g.fill();
      g.restore();
      // a confident squint: the lower lid pushed up under the outer half
      if (X.squint) {
        g.strokeStyle = INK;
        g.lineWidth = J.lid * 0.55;
        g.beginPath();
        g.moveTo(ex - inner * J.eye.w * 0.05, ey + h * 1.25);
        g.quadraticCurveTo(ex - inner * J.eye.w * 0.7, ey + h * 1.0, ex - inner * (J.eye.w + 0.2), ey + 0.1);
        g.stroke();
      }
      // the heavy upper lid line
      g.strokeStyle = INK;
      g.lineWidth = J.lid;
      g.beginPath();
      g.moveTo(ex + inner * (J.eye.w + 0.3), ey + 0.3);
      g.lineTo(ex + inner * J.eye.w * 0.3, ey - h * 1.5 - 0.2);
      g.lineTo(ex - inner * J.eye.w * 0.6, ey - h * 1.6 - 0.2);
      g.quadraticCurveTo(ex - inner * J.eye.w * 1.05, ey - h * 0.9, ex - inner * (J.eye.w + 0.4), ey + 0.4);
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
    // the brow: hard, flat and thick, along the lower edge of the ridge
    g.strokeStyle = hair;
    g.lineWidth = J.brow.w;
    g.beginPath();
    g.moveTo(s * J.brow.inner, J.brow.y + X.inner);
    g.lineTo(s * (J.brow.inner + J.brow.outer) * 0.55, J.brow.y + (X.inner + X.outer) * 0.35);
    g.lineTo(s * J.brow.outer, J.brow.y + X.outer - 0.4);
    g.stroke();
  }

  // the mouth
  const my = J.mouth.y, mw = J.mouth.w;
  g.strokeStyle = INK;
  g.lineWidth = J.line;
  const teeth = (top, bottom, w) => {
    g.fillStyle = J.white;
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
    // set, one corner up in a smirk: nothing about him is worried
    g.beginPath();
    g.moveTo(-mw, my + 0.2);
    g.quadraticCurveTo(0, my + 0.8, mw + 0.4, my - 1.3);
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
    // pleased with himself, which he usually is
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

export const SCULPTED_FACES = { jeff: paintJeff };
