// FNV-1a over raw RGBA bytes. Zero dependency, stable across runs, and
// sensitive enough that a single changed pixel changes the hash.
export function hashPixels(data) {
  let h = 0x811c9dc5;
  for (let i = 0; i < data.length; i++) {
    h ^= data[i];
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

// Every fighter state worth pinning. `t` is animation time; attacks also pin
// stateT so the captured frame is inside the active window.
export const CASES = [
  { state: 'idle', t: 0 },
  { state: 'idle', t: 1.37 },
  { state: 'walk', t: 0.5, walkPhase: 2.1 },
  { state: 'crouch', t: 0.5, crouching: true },
  { state: 'jump', t: 0.5, airborne: true },
  { state: 'block', t: 0.5 },
  { state: 'hitstun', t: 0.5, stateT: 0.1 },
  { state: 'ko', t: 0.5, stateT: 0.4 },
  { state: 'victory', t: 0.9, stateT: 0.6 },
  { state: 'attack', t: 0.5, kind: 'slap', stateT: 0.07 },
  { state: 'attack', t: 0.5, kind: 'punch', stateT: 0.08 },
  { state: 'attack', t: 0.5, kind: 'kick', stateT: 0.14 },
  { state: 'attack', t: 0.5, kind: 'launch', stateT: 0.11 },
  // Parts ride the pose, so they need coverage in a state that MOVES the
  // anchors — an idle-only case would pass with a part welded to the origin.
  { state: 'walk', t: 0.9, walkPhase: 4.2 },
];
