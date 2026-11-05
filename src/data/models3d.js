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
// The athlete (October 2026, on test): the founder's skeleton, head, looks and
// props over an anatomical body, a chest, deltoids and lats over a narrower
// waist, muscled arms, fists with knuckles, and clothes that follow the body
// (lab/blender/build_founder.py, `athlete`). Nobody wears it by default; the
// lab and the review page put fighters in it through FIGHTER_MODELS.
MODELS3D.athlete = { ...MODELS3D.founder, url: 'assets/models/athlete.glb' };
// The same, on the women's frame: lighter shoulders and arms, a bust, a
// narrower waist over wider hips (`athlete-f`).
MODELS3D['athlete-f'] = { ...MODELS3D.founder, url: 'assets/models/athlete-f.glb' };
// Which athlete body a fighter takes: the women's frame for a fighter whose
// 2D figure is drawn on it (fighters.js `figure.frame`).
export const athleteFor = (def) => (def?.figure?.frame === 'f' ? 'athlete-f' : 'athlete');

// Each roster fighter's own model (lab/blender/build_cast.mjs): their own body
// from their build, carrying only what they wear. With the new bodies on, a
// roster fighter wears theirs and a player's founder wears the athlete body.
export const CAST_MODELS = ['ava', 'max', 'kai', 'zara', 'eleanor', 'dex', 'elo', 'bozo', 'scam'];
for (const id of CAST_MODELS) MODELS3D[id] = { ...MODELS3D.founder, url: `assets/models/cast/${id}.glb` };
export const newBodyFor = (def) => (CAST_MODELS.includes(def?.id) ? def.id : athleteFor(def));

// The sculpted fighters (November 2026), the remodel, one at a time: each
// built from scratch from their own game data by one pipeline
// (lab/blender/fighter3d.py, their own head and design in
// lab/blender/fighters/<id>.py) and registered here as `sculpt:<id>`. On test:
// nobody wears one unless a lab page or the review page puts them in it.
//
// What every sculpted model shares. They are built to heroic proportions at
// their own size, so `fit` draws them as built (engine/gl3d/rig.js): their own
// torso, neck and head (the 2D pose only leans the torso and nods the head,
// at most `nod` radians: the 2D head throws itself forward on a punch, and a
// real neck following it pushed the head out ahead of the chest), a straight
// back leaned `lean` further over bent knees with the pelvis taking `pelvis`
// of it, and no girth or head pushed for game size. Their faces are sculpted,
// and the eyes, brows and mouth painted on (engine/gl3d/faces3d.js, from the
// head's `layout` and the fighter's own 2D face values), projected straight
// along the forward axis at 0.0035 model units a px: the 2D face's layout
// cannot sit on a real brow and mouth. Eyewear is a mesh of its own (as
// 'eyewear:shades'), its lenses dark glass the painted eyes show faintly
// through, as the 2D shades let them.
const SCULPTED_BASE = {
  fit: { girth: 1, head: 1, nod: 0.2, lean: 0.14, pelvis: 0.85 },
  face: { mesh: 'body', role: 'skin', turn: 0, px: [0.0035, 0.0035], front: 0.045, fade: [0.25, 0.0] },
  // clear lenses (glasses) as the 2D ones are filled: a faint sheen; a visor
  // a cyan tint the eyes show through, as the founder's
  glass: { lens: 0.84, clear: 0.14, visor: 0.45 },
  // glasses' rims are wire, too thin to outline: the ink filled the lenses
  inkless: ['rim'],
};

// Each fighter's own: where their leaf bones end and their skull sits, their
// shoulder and hip width (the joints of their sculpt), where their face is
// centred and where its features are on their head (`layout`, in the
// painter's px from that centre, y down: the eyes' centre and half-width,
// the lower edge of the brow ridge and how far it runs from the middle, the
// lips' line and half-width, and stroke widths), and how they fight (`form`,
// data/forms.js), which their guard, punch and block follow wherever the
// model draws them.
export const SCULPTED = {
  // Jeff, the first. The eyes 0.033 out and at 1.825, the lower edge of the
  // brow at 1.842, the lips meeting at 1.7395. Strokes are bold: a fight-size
  // head is about 26 px tall, and at the texture's 0.35 screen px a stroke px,
  // finer lines vanish in a match. He boxes.
  bozo: {
    leaf: { forearm: 0.367, head: 0.255, foot: [0.18, -0.065, 0] },
    skull: 0.16,
    fit: { shoulderHalf: 0.2, hipHalf: 0.095 },
    face: {
      at: [0, 1.79],
      layout: {
        eye: { x: 9.4, y: -10, w: 3.7 },
        brow: { y: -14.9, inner: 3.0, outer: 17.2 },
        mouth: { y: 14.4, w: 6.2 },
        lid: 1.7, line: 1.4,
      },
    },
    form: 'boxing',
  },
  // Adam, the second (`max`), at his own size: a quarter taller than Jeff,
  // so his numbers are Jeff's carried through his frame (fighter3d.py prints
  // them). Wide eyes 0.034 out at 1.828, the brow ridge's lower edge at about
  // 1.851, arched and lifted, the lips meeting at 1.741 and wider than Jeff's;
  // the painter takes his stare, raised brows and loose smirk from his 2D face
  // values. He brawls (`form`, data/forms.js): his own 2D guard, rolling his
  // weight, and a haymaker that winds up and swings through.
  // His 2D stance already slouches, so his sculpt leans back from it a little
  // (`lean` below zero) rather than further over: on top of the slouch, the
  // sculpts' usual lean rounded his back and brought his shoulders forward.
  max: {
    leaf: { forearm: 0.4488, head: 0.2641, foot: [0.213, -0.0798, 0] },
    skull: 0.1657,
    fit: { shoulderHalf: 0.2416, hipHalf: 0.1124, legs: 1.2283, lean: -0.06 },
    face: {
      at: [0, 2.183], px: [0.003625, 0.003625],
      layout: {
        eye: { x: 9.7, y: -10.9, w: 4.0 },
        brow: { y: -17.4, inner: 3.4, outer: 16.0 },
        mouth: { y: 14.0, w: 7.4 },
        lid: 1.7, line: 1.4,
      },
    },
    form: 'brawling',
  },
  // Carl, the third (`dex`): about Jeff's height, short in the leg. His eyes
  // 0.034 out at 1.822 under the lowest brow in the cast, its painted line
  // just above the bar of his shades at 1.842 (on the ridge, under the bar,
  // his brows were hidden); thin lips meeting at 1.7415. His 2D stance is a
  // wrestler's, already hunched well forward, so his sculpt adds no lean of
  // its own (see Adam's). He grapples (data/forms.js), the lead hand open.
  dex: {
    leaf: { forearm: 0.3701, head: 0.2466, foot: [0.1791, -0.0636, 0] },
    skull: 0.1547,
    fit: { shoulderHalf: 0.2031, hipHalf: 0.0945, legs: 0.9783, lean: 0 },
    face: {
      at: [0, 1.777], px: [0.003385, 0.003385],
      layout: {
        eye: { x: 9.7, y: -9.1, w: 3.6 },
        brow: { y: -14.8, inner: 3.0, outer: 17.5 },
        mouth: { y: 13.9, w: 6.3 },
        lid: 1.7, line: 1.4,
      },
    },
    form: 'grappling',
  },
  // Steve (kai, 2026-11-04): tall and rake thin, 1.15 times Jeff's height and
  // as long in the leg, his head about Jeff's (lab/blender/fighters/kai.py):
  // eyes 0.033 out at 1.826 behind clear glasses, a light level brow, its
  // painted line just over the rims at 1.848, thin lips meeting at 1.742.
  // His 2D stance stands tall with the chest open, so his sculpt adds no lean
  // of its own (see Adam's and Carl's). He showboats (data/forms.js).
  kai: {
    leaf: { forearm: 0.4083, head: 0.2518, foot: [0.1928, -0.0749, 0] },
    skull: 0.158,
    fit: { shoulderHalf: 0.1893, hipHalf: 0.1018, legs: 1.1522, lean: 0 },
    face: {
      at: [0, 2.0311], px: [0.003457, 0.003457],
      layout: {
        eye: { x: 9.4, y: -10.3, w: 3.8 },
        brow: { y: -16.5, inner: 3.4, outer: 15.7 },
        mouth: { y: 13.7, w: 5.4 },
        lid: 1.7, line: 1.4,
      },
    },
    form: 'showboating',
  },
  // Elo (2026-11-04): the tallest, 1.28 times Jeff's height and as long in the
  // leg, heavy-set, a small head for his size (lab/blender/fighters/elo.py):
  // big eyes 0.034 out at 1.828 under a brow ridge set high, its painted line
  // at 1.855; a small mouth meeting at 1.7425. His 2D stance leans back, chin
  // up, so his sculpt adds no lean of its own. A shoulder roll (data/forms.js).
  elo: {
    leaf: { forearm: 0.4525, head: 0.2628, foot: [0.2126, -0.0834, 0] },
    skull: 0.1649,
    fit: { shoulderHalf: 0.2028, hipHalf: 0.1122, legs: 1.2826, lean: 0 },
    face: {
      at: [0, 2.248], px: [0.003607, 0.003607],
      layout: {
        eye: { x: 9.7, y: -10.9, w: 4.0 },
        brow: { y: -18.6, inner: 3.1, outer: 15.7 },
        mouth: { y: 13.6, w: 5.1 },
        lid: 1.7, line: 1.4,
      },
    },
    form: 'shoulderRoll',
  },
  // Scam (2026-11-04): Jeff's height or a little more, soft all over, his head
  // a little bigger than Jeff's (lab/blender/fighters/scam.py): eyes 0.034 out
  // at 1.826 at an even depth, a low soft brow ridge, its painted line at
  // 1.851; a small even mouth meeting at 1.744. Unbothered, he stands easy,
  // so his sculpt adds no lean of its own. He fences (data/forms.js).
  scam: {
    leaf: { forearm: 0.3909, head: 0.2619, foot: [0.1917, -0.0664, 0] },
    skull: 0.1643,
    fit: { shoulderHalf: 0.2024, hipHalf: 0.1012, legs: 1.0217, lean: 0 },
    face: {
      at: [0, 1.858], px: [0.003595, 0.003595],
      layout: {
        eye: { x: 9.7, y: -10.3, w: 4.0 },
        brow: { y: -17.4, inner: 3.4, outer: 15.7 },
        mouth: { y: 13.1, w: 5.1 },
        lid: 1.7, line: 1.4,
      },
    },
    form: 'fence',
  },
  // Lizbeth (ava, 2026-11-04), the first woman (the pipeline's frame 'f'):
  // 1.13 times Jeff's height, slight, her head about Jeff's
  // (lab/blender/fighters/ava.py): big eyes 0.033 out at 1.828 behind her
  // visor, a light brow set high and level, its painted line at 1.857 above
  // the visor; an even mouth meeting at 1.744. Her fencer's guard is upright,
  // so her sculpt adds no lean of its own. She fences (data/forms.js).
  ava: {
    leaf: { forearm: 0.4077, head: 0.2625, foot: [0.1963, -0.0721, 0] },
    skull: 0.1647,
    fit: { shoulderHalf: 0.1626, hipHalf: 0.1106, legs: 1.1087, lean: 0 },
    face: {
      at: [0, 1.9835], px: [0.003603, 0.003603],
      layout: {
        eye: { x: 9.4, y: -10.9, w: 4.3 },
        brow: { y: -19.1, inner: 3.4, outer: 15.4 },
        mouth: { y: 13.1, w: 5.1 },
        lid: 1.7, line: 1.4,
      },
    },
    form: 'fencing',
  },
  // Kim (zara, 2026-11-04), the second woman: small, 0.98 times Jeff's height,
  // curvy, her head oversized for her size (lab/blender/fighters/zara.py):
  // almond eyes 0.034 out at 1.826 under the heaviest lids, a light flat
  // brow, its painted line at 1.851; a tiny mouth meeting at 1.744. A bomber
  // zipped over flared trousers, the ring light behind her head (fighter3d.py
  // `bomber`, `ringlight`). Her guard is already crouched in, so her sculpt
  // adds no lean of its own; she fights from a peek-a-boo (forms.js).
  zara: {
    leaf: { forearm: 0.3421, head: 0.2472, foot: [0.1591, -0.0622, 0] },
    skull: 0.1551,
    fit: { shoulderHalf: 0.133, hipHalf: 0.0948, legs: 0.9565, lean: 0 },
    face: {
      at: [0, 1.7287], px: [0.003393, 0.003393],
      layout: {
        eye: { x: 9.7, y: -10.3, w: 4.1 },
        brow: { y: -17.4, inner: 3.4, outer: 15.7 },
        mouth: { y: 13.1, w: 4.1 },
        lid: 1.7, line: 1.4,
      },
    },
    form: 'peekaboo',
  },
};
for (const [id, own] of Object.entries(SCULPTED)) {
  MODELS3D[`sculpt:${id}`] = {
    url: `assets/models/sculpt/${id}.glb`, ...SCULPTED_BASE, ...own,
    fit: { ...SCULPTED_BASE.fit, ...own.fit },
    face: { ...SCULPTED_BASE.face, ...own.face },
  };
}

export const DEFAULT_MODEL = 'founder';

// A roster fighter may wear a model of their own; none does yet, and anyone
// not listed wears DEFAULT_MODEL.
export const FIGHTER_MODELS = {};

// The look slots a mesh name can select: "<slot>:<option>". A mesh with no
// colon is the base body and always draws; "prop:<id>" follows the fighter's
// parts, "fx:<condition>" what they are in the middle of and "hand:<shape>"
// the lead hand's shape in the pose (see index.js).
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

// Every piece a fighter can be seen wearing: their look (one piece a slot),
// their parts, and what every fighter carries (the block briefcase, Unicorn
// Mode's horn). A roster fighter's own model is built with exactly these
// (lab/blender/build_cast.mjs) and tested against them.
export function piecesFor(def) {
  const look = resolveLook3D(def);
  const out = ['body', ...LOOK_SLOTS.filter((slot) => look[slot] && look[slot] !== 'none').map((slot) => `${slot}:${look[slot]}`)];
  for (const part of def.parts || []) out.push(`prop:${part.id}`);
  out.push('prop:guard-case', 'fx:unicorn');
  return [...new Set(out)];
}
