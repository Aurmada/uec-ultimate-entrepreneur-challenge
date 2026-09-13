// Models for the live 3D renderer (?gl). Render-only data, like tracks.js.
//
// A model is a skinned glTF built to the contract in lab/blender/build_adam.py.
// glTF stores joints, not bone ends, so each model also records where its leaf
// bones end, and where the skull centre sits above the head joint.
export const MODELS3D = {
  adam: {
    url: 'assets/models/adam.glb',
    leaf: {
      forearm: 0.44,          // elbow to fist centre, which is what the pose aims
      head: 0.36,
      foot: [0.17, -0.04, 0],
    },
    skull: 0.18,              // head joint to skull centre
  },
};

// Which roster fighters have a model. ?gl=all puts every fighter in the first
// one, wearing their own palette, to show what the colour roles do.
export const FIGHTER_MODELS = { max: 'adam' };
