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
import { resolveLook3D } from '../../data/models3d.js';

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
    // squint of a smile does; one whose eyes are wide (a high lid) stares
    smug: F.MOUTH_CURVE > 0 && F.LID_Y <= STYLIZE.FACE.LID_Y,
    // a mouth that lifts this far is a grin even at rest, teeth showing
    leer: F.MOUTH_CURVE >= 2,
  };
}

// What makes one painted face its own, beyond the 2D values: each sculpted
// fighter's `face.style` (data/models3d.js), an original design from their
// character, never a likeness. Every key is optional; left out, the face is
// drawn as Jeff's is.
//   eye     the eyes' shape: 'almond' (Jeff's), 'round', 'hooded' (a heavy
//           lid with its crease above), 'smile' (the lower lid pushed up,
//           always)
//   iris    the iris's colour; glint: false for no catchlight (a fixed stare)
//   lash    lashes, 0 to 2
//   bags    lines under the eyes, 0 to 1
//   brow    { arch: how far the middle rises, w: weight against the 2D one,
//           raise: [the character's right, left] lifted, inner: the inner
//           ends at rest (down is positive) }
//   mouth   the set mouth at rest: 'set' (from MOUTH_CURVE: Jeff's smirk, or a
//           frown), 'serene', 'crooked', 'innocent', 'line', 'warm'
//   calm    true for a face that does not glare: angry and blocking keep the
//           mouth at rest and the eyes open, the brows drawn in a little
//   lips    a colour for the lips (painted, not only the lower lip's shadow)
//   lines   { brow: forehead lines, crow: at the eyes' corners, smile: from the
//           nose to the mouth, jowl: true for lines down from the corners }
//   blush, freckles   rosy cheeks (0 to 1), how many freckles
// An art review (2026-11-06) took out what read badly or leaned toward a
// namesake's own look: a painted beard (a smudge), a painted hollow under
// the cheekbones (a bruise; the sculpt carries it), bushy brows, a winged
// liner, a cat eye and a glossy pout.
export const FACE_STYLE_KEYS = ['eye', 'iris', 'glint', 'lash', 'bags', 'brow', 'mouth', 'calm', 'lips', 'lines', 'blush', 'freckles'];
// The mouths a face can set at rest (`mouth`); the others are expressions'.
export const REST_MOUTHS = ['set', 'serene', 'crooked', 'innocent', 'line', 'warm'];

// The eyes' outline as points across the opening, for a shape: the upper
// lid's peak toward the nose (`ui`) and away from it (`uo`), the lower lid's
// depth (`lo`, below zero lifts it, a smile's crescent), the outer corner's
// drop (`od`, y down) and the height against the fighter's own (`hs`).
export const EYE_SHAPES = {
  almond: { ui: 1.5, uo: 1.6, lo: 1.5, od: 0.2, hs: 1 },
  round:  { ui: 1.8, uo: 1.8, lo: 1.8, od: 0.2, hs: 1.18 },
  hooded: { ui: 1.0, uo: 1.15, lo: 1.4, od: 0.6, hs: 1, crease: true },
  smile:  { ui: 1.6, uo: 1.6, lo: -0.4, od: -0.2, hs: 1, crescent: true },
};

export function paintSculpted(g, def, expression, layout, style = {}) {
  const J = layout, K = character(def), c = def.c || {}, St = style || {};
  const hair = c.hair || INK;
  const lips = shade(c.skin || '#e2ab84', -38);
  const B = St.brow || {}, L = St.lines || {};
  g.lineCap = 'round';
  g.lineJoin = 'round';

  // How each expression sets the features: how open the eyes are (1 the
  // fighter's own rest), where the brows' inner ends sit (down is positive)
  // and their outer ends, and what the mouth does. The table is Jeff's; a
  // fighter whose brows drop harder (BROW_TILT) carries that into every one.
  const rest = St.mouth && St.mouth !== 'set' ? St.mouth : (K.leer ? 'leer' : 'set');
  const X = {
    idle:  { open: 1, inner: 0.6 + (B.inner ?? 0), outer: 0, mouth: rest, squint: K.smug },
    angry: { open: 0.75, inner: 2.6, outer: -0.6, mouth: 'snarl' },
    block: { open: 0.65, inner: 2.2, outer: -0.4, mouth: 'grit' },
    hurt:  { open: 0, inner: -2, outer: 1.2, mouth: 'grimace' },
    ko:    { open: 0, inner: -0.8, outer: 1, mouth: 'slack' },
    happy: { open: 0.9, inner: -0.6, outer: -0.6, mouth: 'grin', squint: true },
  }[expression] || { open: 1, inner: 0.6, outer: 0, mouth: 'set' };
  // A calm face does not glare, even angry: the super's cut-in shows the angry
  // face, and three of the cast are written as never glaring.
  if (St.calm && (expression === 'angry' || expression === 'block')) {
    Object.assign(X, { open: 1, inner: 0.6 + (B.inner ?? 0) + 0.8, outer: 0, mouth: rest, squint: false });
  }
  const inner = X.inner + K.tilt, outer = X.outer - K.tilt * 0.4;

  // Under everything, what the skin carries: colour, then lines, then hair.
  marks(g, St, J, c, expression);
  if (resolveLook3D(def).facialHair === 'stubble') stubble(g, hair, J);

  const E = EYE_SHAPES[St.eye] || EYE_SHAPES.almond;
  for (const s of [-1, 1]) {
    const ex = s * J.eye.x, ey = J.eye.y, w = J.eye.w;
    const nose = -s;                           // toward the nose
    if (X.open > 0) {
      const h = K.open * X.open * E.hs;
      const oy = ey + E.od;                    // the outer corner
      const upper = (pad) => {
        g.moveTo(ex + nose * (w + pad), ey + 0.2 + pad);
        g.lineTo(ex + nose * w * 0.3, ey - h * E.ui - pad);
        g.lineTo(ex - nose * w * 0.6, ey - h * E.uo - pad);
        g.quadraticCurveTo(ex - nose * w * 1.05, oy - h * 0.9, ex - nose * (w + pad * 1.3), oy + pad);
      };
      // the white, under the lids
      g.fillStyle = WHITE;
      g.beginPath();
      upper(0);
      g.quadraticCurveTo(ex, ey + h * E.lo, ex + nose * w, ey + 0.2);
      g.fill();
      // the iris, clipped by the lids, looking straight ahead
      g.save();
      g.clip();
      g.fillStyle = St.iris || IRIS;
      g.beginPath(); g.arc(ex, ey - 0.6, K.iris, 0, 7); g.fill();
      g.fillStyle = INK;
      g.beginPath(); g.arc(ex, ey - 0.6, K.pupil, 0, 7); g.fill();
      // a catchlight: the difference between a glare and a tired stare
      if (St.glint !== false) {
        g.fillStyle = WHITE;
        g.beginPath(); g.arc(ex - 0.6, ey - 1.1, 0.42, 0, 7); g.fill();
      }
      g.restore();
      // a squint, or a smile's crescent: the lower lid pushed up
      if (X.squint || E.crescent) {
        g.strokeStyle = INK;
        g.lineWidth = J.lid * 0.55;
        g.beginPath();
        g.moveTo(ex - nose * w * 0.05, ey + h * Math.max(E.lo, 0.4) * 0.85);
        g.quadraticCurveTo(ex - nose * w * 0.7, ey + h * Math.max(E.lo, 0.4) * 0.65, ex - nose * (w + 0.2), oy + 0.1);
        g.stroke();
      }
      // the upper lid line, heavier
      g.strokeStyle = INK;
      g.lineWidth = J.lid;
      g.beginPath();
      upper(0.3);
      g.stroke();
      // a heavy lid's crease, above it
      if (E.crease) {
        g.lineWidth = J.lid * 0.5;
        g.beginPath();
        g.moveTo(ex + nose * w * 0.6, ey - h * E.ui - 1.6);
        g.quadraticCurveTo(ex - nose * w * 0.2, ey - h * E.uo - 2.3, ex - nose * (w + 0.6), oy - 0.9);
        g.stroke();
      }
      // lashes, flicked up and out from the outer half of the lid
      for (let i = 0; i < (St.lash || 0) * 2; i++) {
        const t = 0.25 + i * 0.22;
        const lx = ex - nose * w * (0.2 + t), ly = ey - h * E.uo * (1 - t * 0.35) - 0.3;
        g.lineWidth = J.lid * 0.45;
        g.beginPath(); g.moveTo(lx, ly); g.lineTo(lx - nose * 1.1, ly - 1.5 - (St.lash > 1 ? 0.6 : 0)); g.stroke();
      }
      // bags under the eyes: a tired line, or two
      if (St.bags) {
        g.save();
        g.globalAlpha = 0.25 + 0.4 * St.bags;
        g.lineWidth = J.lid * 0.45;
        g.beginPath();
        g.moveTo(ex + nose * w * 0.6, ey + h * E.lo + 1.2);
        g.quadraticCurveTo(ex - nose * w * 0.1, ey + h * E.lo + 2.6, ex - nose * (w + 0.4), ey + 0.9);
        g.stroke();
        g.restore();
      }
    } else {
      // shut: squeezed in pain, or closed out cold
      g.strokeStyle = INK;
      g.lineWidth = J.lid;
      g.beginPath();
      if (expression === 'hurt') {
        g.moveTo(ex - w, ey - 0.6);
        g.quadraticCurveTo(ex, ey + 1.2, ex + w, ey - 0.6);
      } else {
        g.moveTo(ex - w, ey + 0.4);
        g.lineTo(ex + w, ey + 0.4);
      }
      g.stroke();
    }
    // the brow, along the lower edge of the ridge: arched in the middle, and
    // on one side raised, where a style says so
    const lift = (B.raise ? B.raise[s < 0 ? 0 : 1] || 0 : 0);
    const by = J.brow.y - lift, mid = (inner + outer) * 0.35 - (B.arch || 0);
    g.strokeStyle = hair;
    g.lineWidth = K.brow * (B.w ?? 1);
    g.beginPath();
    g.moveTo(s * J.brow.inner, by + inner);
    g.quadraticCurveTo(s * (J.brow.inner + J.brow.outer) * 0.55, by + mid - (B.arch || 0) * 0.6, s * J.brow.outer, by + outer - 0.4);
    g.stroke();
  }

  // the mouth
  const my = J.mouth.y, mw = J.mouth.w;
  g.strokeStyle = INK;
  g.lineWidth = J.line;
  // The teeth, white between the lips. Drawn to the expressions' heights under
  // a full line they were a black slot (under 3 px of white inside a 1.4 px
  // outline), so every grin and snarl read as a gasp: they are drawn taller,
  // under a lighter line.
  const teeth = (top, bottom, w) => {
    top *= 1.7; bottom *= 1.7;
    g.fillStyle = WHITE;
    g.beginPath();
    g.moveTo(-w, my + top * 0.3);
    g.quadraticCurveTo(0, my + top, w, my + top * 0.3);
    g.lineTo(w, my + bottom * 0.3);
    g.quadraticCurveTo(0, my + bottom, -w, my + bottom * 0.3);
    g.closePath();
    g.fill();
    g.save();
    g.lineWidth = J.line * 0.5;
    g.stroke();
    g.restore();
  };
  // painted lips, where a style colours them: the upper lip's bow and the
  // fuller lower lip either side of the line the mouth draws
  const colour = (up, down, w) => {
    if (!St.lips) return;
    g.save();
    g.fillStyle = St.lips;
    g.beginPath();
    g.moveTo(-w, my);
    g.quadraticCurveTo(-w * 0.45, my - up * 1.1, 0, my - up * 0.7);
    g.quadraticCurveTo(w * 0.45, my - up * 1.1, w, my);
    g.quadraticCurveTo(0, my + down, -w, my);
    g.fill();
    g.restore();
  };
  if (X.mouth === 'set') {
    // the fighter's own set: Jeff's is a smirk, one corner up; a lower
    // MOUTH_CURVE levels it, and below zero pulls both corners down
    const k = K.curve;
    colour(1.6, 2.6, mw);
    g.beginPath();
    g.moveTo(-mw, my + 0.2 - k * 0.4);
    g.quadraticCurveTo(0, my + 0.8 + k * 0.5, mw + 0.4, my - 1.3 - k * 0.9);
    g.stroke();
    lip(g, lips, my, mw);
  } else if (X.mouth === 'leer') {
    // a loose grin at rest, lopsided, the far corner higher: enjoying it
    teeth(-1.3, 1.9, mw * 0.8);
    g.beginPath();
    g.moveTo(-mw - 0.2, my - 0.4); g.quadraticCurveTo(0, my + 2.2, mw + 0.5, my - 2.2);
    g.stroke();
  } else if (X.mouth === 'serene') {
    // a closed, even, knowing smile: both corners up, the lips together
    colour(1.4, 2.2, mw);
    g.beginPath();
    g.moveTo(-mw - 0.2, my - 1.1); g.quadraticCurveTo(0, my + 1.6, mw + 0.2, my - 1.1);
    g.stroke();
    lip(g, lips, my, mw);
  } else if (X.mouth === 'crooked') {
    // half a smile: the near corner flat, the far one pulled up and back
    colour(1.4, 2.2, mw);
    g.beginPath();
    g.moveTo(-mw * 0.9, my + 0.5); g.quadraticCurveTo(mw * 0.1, my + 0.9, mw + 1, my - 2.4);
    g.stroke();
    g.lineWidth = J.line * 0.6;
    g.beginPath(); g.moveTo(mw + 0.6, my - 2.6); g.lineTo(mw + 1.6, my - 1.6); g.stroke();   // the dimple
    lip(g, lips, my, mw);
  } else if (X.mouth === 'innocent') {
    // a small, sweet smile, narrower than the mouth: nothing to see here
    const w = mw * 0.7;
    colour(1.2, 2, w);
    g.beginPath();
    g.moveTo(-w, my - 0.6); g.quadraticCurveTo(0, my + 1.4, w, my - 0.6);
    g.stroke();
    lip(g, lips, my, w);
  } else if (X.mouth === 'line') {
    // pressed flat and straight, giving nothing away
    colour(1.1, 1.8, mw);
    g.beginPath(); g.moveTo(-mw, my); g.lineTo(mw, my); g.stroke();
  } else if (X.mouth === 'warm') {
    // an open, easy smile, the top teeth showing
    colour(1.6, 2.8, mw);
    teeth(-0.9, 0.8, mw * 0.78);
    g.beginPath();
    g.moveTo(-mw - 0.3, my - 1.0); g.quadraticCurveTo(0, my + 2.2, mw + 0.3, my - 1.0);
    g.stroke();
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

// What the skin carries under the features: rosy cheeks, freckles, a shadow
// under the cheekbones, and lines (the forehead's, the eyes' corners, from the
// nose down to the mouth, and jowls). Lines are ink at low alpha, so they read
// as age close up and drop out at fight size rather than smudging.
function marks(g, St, J, c, expression) {
  const L = St.lines || {}, my = J.mouth.y, mw = J.mouth.w;
  const ex = J.eye.x, ey = J.eye.y, w = J.eye.w;
  g.save();
  if (St.blush) {
    g.fillStyle = '#e8606a';
    g.globalAlpha = 0.28 * St.blush;
    g.filter = 'blur(1.6px)';
    for (const s of [-1, 1]) { g.beginPath(); g.ellipse(s * (ex + 1), ey + 8, 4.6, 2.6, 0, 0, 7); g.fill(); }
    g.filter = 'none';
  }
  if (St.freckles) {
    g.fillStyle = shade(c.skin || '#e2ab84', -55);
    g.globalAlpha = 0.65;
    // fixed spots across the nose and the cheeks, the same every frame
    const spots = [[-3, 4], [3, 4.4], [-1.2, 5.6], [1.4, 6], [-ex, 6.8], [ex, 7.2], [-ex - 2.4, 5.2], [ex + 2.2, 5.6], [-ex + 2.2, 8.4], [ex - 2, 8.8], [-ex - 0.6, 9.6], [ex + 0.8, 10]];
    for (const [x, y] of spots.slice(0, St.freckles)) { g.beginPath(); g.arc(x, ey + y, 0.55, 0, 7); g.fill(); }
  }
  g.strokeStyle = INK;
  g.lineCap = 'round';
  g.globalAlpha = 0.42;
  g.lineWidth = J.line * 0.5;
  for (let i = 0; i < (L.brow || 0); i++) {
    // across the forehead, shallow arcs, more raised when surprised
    const y = J.brow.y - 3.6 - i * 2.2 - (expression === 'hurt' ? 0.8 : 0), half = J.brow.outer * (0.55 - i * 0.08);
    g.beginPath(); g.moveTo(-half, y + 0.4); g.quadraticCurveTo(0, y - 0.8, half, y + 0.4); g.stroke();
  }
  for (const s of [-1, 1]) {
    for (let i = 0; i < (L.crow || 0); i++) {
      // fanned from the outer corner of the eye
      const x0 = s * (ex + w + 1.2), y0 = ey - 0.4 + i * 1.6;
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 + s * 2.4, y0 - 0.9 + i * 0.9); g.stroke();
    }
    if (L.smile) {
      // from beside the nose's wing to past the mouth's corner
      g.globalAlpha = 0.24 + 0.16 * L.smile;
      g.beginPath();
      g.moveTo(s * (mw * 0.75 + 0.8), my - 8.4);
      g.quadraticCurveTo(s * (mw + 2.6), my - 3.6, s * (mw + 1.6), my + 1.6 + L.smile * 0.6);
      g.stroke();
      g.globalAlpha = 0.42;
    }
    if (L.jowl) {
      g.beginPath();
      g.moveTo(s * (mw + 0.8), my + 2.4);
      g.quadraticCurveTo(s * (mw + 1.4), my + 5.6, s * (mw + 0.4), my + 8.2);
      g.stroke();
    }
  }
  g.restore();
}

// Stubble, as the 2D face has it: a translucent shade of the hair colour,
// soft-edged, over the upper lip, round the mouth and down the jaw to under
// the chin. Not up the cheeks: carried across them, its top edge read as a
// band, a mask over the lower face.
function stubble(g, colour, J) {
  const my = J.mouth.y, mw = J.mouth.w;
  g.save();
  g.fillStyle = colour;
  g.globalAlpha = 0.24;
  g.filter = 'blur(1.2px)';
  g.beginPath();
  g.moveTo(-mw * 0.95, my - 3.2);
  g.quadraticCurveTo(0, my - 6, mw * 0.95, my - 3.2);             // the upper lip, under the nose
  g.quadraticCurveTo(mw + 3.5, my + 0.5, mw + 7, my + 4);          // past the corner, down the jaw
  g.quadraticCurveTo(mw * 0.8, my + 15, 0, my + 15.5);             // under the chin
  g.quadraticCurveTo(-mw * 0.8, my + 15, -mw - 7, my + 4);
  g.quadraticCurveTo(-mw - 3.5, my + 0.5, -mw * 0.95, my - 3.2);
  g.fill();
  g.restore();
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
