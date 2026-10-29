// Models for the live 3D renderer (?gl). Render-only data, like tracks.js.
//
// One modular model is worn by every fighter: a base body plus a named mesh per
// look option (lab/blender/build_founder.py). glTF stores joints, not bone ends,
// so a model also records where its leaf bones end and where the skull centre
// sits above the head joint.
export const MODELS3D = {
  founder: {
    url: 'assets/models/founder.glb',
    leaf: {
      forearm: 0.44,          // elbow to fist centre, which is what the pose aims
      head: 0.36,
      foot: [0.17, -0.04, 0],
    },
    skull: 0.18,              // head joint to skull centre
    // Where the 2D face lands. It is painted as drawFighter paints it on a
    // fight-size head and projected along the model's forward axis in BIND
    // space, so it rides the head bone however the head moves. The head's face
    // is sculpted to the 2D layout (no brow ridge, a button nose above the
    // mouth), which is what lets one scale serve every feature.
    face: {
      mesh: 'body', role: 'skin',
      // The projection points `turn` radians off straight ahead, toward the
      // camera's side. The camera sees that side of the face nearly square on,
      // so a straight-ahead projection spread its brow across it. Turned much
      // further, the far eye slides round to the silhouette in a match.
      turn: 0.15,
      // The 2D head centre, the eye line: across (in the turned projection)
      // and bind y. Across is where the centre of the face front (0.13 ahead
      // of the skull) falls once turned, plus 1 px to the near side: drawFace
      // sets most features 1 to 2 px toward the way the fighter faces, and
      // the 3D head turns for itself.
      at: [0.007 - 0.13 * Math.sin(0.15), 1.82],
      px: [0.0068, 0.0075],   // model units per 2D px, across and down
      front: 0.02,            // only surfaces this far ahead take it
      // The face fades as a surface turns away from the projection: full
      // strength down to the first facing (a normal's dot with the axis),
      // gone by the second, so it never smears down the side of the head.
      fade: [0.3, 0.0],
    },
    // Materials drawn without the ink outline: wire too thin to outline, which
    // the ink would swell into a black bar.
    inkless: ['frame'],
    // See-through materials and their opacity, drawn after everything opaque.
    // The 2D visor is a tint the eyes show through; so is this one.
    glass: { visor: 0.45 },
    // What hangs, and how (engine/gl3d/sway.js). Each mesh trails its anchor
    // (the head or the hips): a vertex moves with the anchor's lag by how far
    // it hangs from `pivot` along `dir` (bind space, x forward and y up),
    // squared, all of it at `reach` and beyond, times `gain`. Taken from
    // lab/blender/build_founder.py: the ponytail's tie, the long hair's nape,
    // the bob's sides, the coat's waist.
    sway: {
      'hair:ponytail': { anchor: 'head', pivot: [-0.13, 1.82], dir: [-0.25, -0.97], reach: 0.26, gain: 1 },
      'hair:long': { anchor: 'head', pivot: [-0.10, 1.78], dir: [-0.1, -0.995], reach: 0.32, gain: 1 },
      'hair:bob': { anchor: 'head', pivot: [0, 1.80], dir: [0, -1], reach: 0.16, gain: 0.5 },
      'prop:coat': { anchor: 'hips', pivot: [-0.10, 0.84], dir: [-0.1, -0.995], reach: 0.6, gain: 1 },
    },
  },
};
export const DEFAULT_MODEL = 'founder';

// A roster fighter may wear a model of their own; none does yet, and anyone
// not listed wears DEFAULT_MODEL.
export const FIGHTER_MODELS = {};

// The look slots a mesh name can select: "<slot>:<option>". A mesh with no
// colon is the base body and always draws; "prop:<id>" follows the fighter's
// parts and "fx:<condition>" what they are in the middle of (see index.js).
export const LOOK_SLOTS = ['hair', 'headwear', 'eyewear', 'facialHair', 'outfit', 'accessory'];

// The conditions an "fx:<condition>" mesh can wait for (see wearing() in index.js).
export const CONDITIONS = ['unicorn'];

// Look options that are painted into the face texture rather than modelled.
// In 2D, stubble is a translucent shade over the jaw, which a mesh can only fake.
export const PAINTED_LOOKS = { facialHair: ['stubble'] };

// Which option each slot shows, read the way drawFighter reads a look. The
// roster still carries two older conventions and this has to honour both:
// `hairStyle: 'cap'` is a backwards cap worn instead of hair (drawHair), and
// `accessory` doubles as eyewear and as stubble (drawEyewear, drawFacialHair).
export function resolveLook3D(def) {
  const acc = def.accessory || null;
  return {
    hair: def.hairStyle || 'short',
    headwear: def.headwear || 'none',
    eyewear: def.eyewear || (['visor', 'glasses', 'shades'].includes(acc) ? acc : 'none'),
    facialHair: def.facialHair || (acc === 'stubble' ? 'stubble' : 'none'),
    outfit: def.outfit || 'tee',
    accessory: ['earrings', 'brooch'].includes(acc) ? acc : 'none',
  };
}

// Every expression drawFighter's pose sets (P.face) or a portrait asks for.
// Each is one cell of a fighter's face texture; anything else shows idle.
export const FACE_STATES = ['idle', 'angry', 'block', 'hurt', 'ko', 'happy'];
export const FACE_GRID = [3, 2];            // columns, rows
const CELLS = FACE_STATES.map((_, i) => [
  (i % FACE_GRID[0]) / FACE_GRID[0], Math.floor(i / FACE_GRID[0]) / FACE_GRID[1],
  1 / FACE_GRID[0], 1 / FACE_GRID[1],
]);
export const faceCell = (state) => CELLS[Math.max(0, FACE_STATES.indexOf(state))];

// Fighters whose painted faces match share one texture. drawFace reads only
// the expression and the fighter's face values, and the painted look options
// read nothing but themselves, so those are the key of a drawn face. A photo
// founder's face is their photo, keyed by a short fingerprint of it (it is a
// data URL); until it decodes they wear their drawn face, under its own key.
const drawnKeys = new WeakMap();
export function drawnFaceKey(def) {
  if (!drawnKeys.has(def)) {
    const look = resolveLook3D(def);
    const painted = Object.entries(PAINTED_LOOKS).map(([slot, options]) => (options.includes(look[slot]) ? look[slot] : null));
    drawnKeys.set(def, JSON.stringify([def.face || null, ...painted]));
  }
  return drawnKeys.get(def);
}
const photoKeys = new WeakMap();
export function faceKey(def) {
  if (!def.photo) return drawnFaceKey(def);
  if (!photoKeys.has(def)) photoKeys.set(def, JSON.stringify(['photo', fingerprint(def.photo)]));
  return photoKeys.get(def);
}

// FNV-1a over a string: every character of its ends, and a sample of a long
// middle. Enough to tell photos apart without walking a 100 KB data URL.
function fingerprint(text) {
  let h = 0x811c9dc5;
  const mix = (i) => { h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0; };
  const END = 512, n = text.length;
  if (n <= END * 2) {
    for (let i = 0; i < n; i++) mix(i);
  } else {
    for (let i = 0; i < END; i++) mix(i);
    const step = Math.max(1, Math.floor((n - END * 2) / 4096));
    for (let i = END; i < n - END; i += step) mix(i);
    for (let i = n - END; i < n; i++) mix(i);
  }
  return `${n}:${h.toString(16)}`;
}
