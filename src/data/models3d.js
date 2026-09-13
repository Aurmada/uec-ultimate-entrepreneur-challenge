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
  },
};
export const DEFAULT_MODEL = 'founder';

// A roster fighter may wear a model of their own; none does yet, and anyone
// not listed wears DEFAULT_MODEL.
export const FIGHTER_MODELS = {};

// The look slots a mesh name can select: "<slot>:<option>". A mesh with no
// colon is the base body and always draws; "prop:<id>" follows the fighter's
// parts (see index.js).
export const LOOK_SLOTS = ['hair', 'headwear', 'eyewear', 'facialHair', 'outfit', 'accessory'];

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

// Colours a model asks for by role but that no palette stores directly.
export const DERIVED_ROLES = {
  skinShade: { from: 'skin', k: 0.62 },     // stubble: the skin, darkened
};
