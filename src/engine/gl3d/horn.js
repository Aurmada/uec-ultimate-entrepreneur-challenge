// UNICORN MODE's horn for a model built without one. RENDER-ONLY.
//
// The founder model carries the horn as a mesh of its own ('fx:unicorn',
// drawn only while the super runs: index.js `wearing`). The sculpted cast
// were built without it (lab/blender/fighter3d.py), and the 3D path draws no
// 2D horn, so in 3D nobody's super showed one, in the fight or in its cut-in.
// This makes the same horn in code, at the model's own crown: a gold cone
// out of the forehead, tilted a little forward, skinned wholly to the head so
// it goes where the head goes. Its proportions are the founder's horn's,
// scaled by how tall this head is against his (`leaf.head`).

const FOUNDER_HEAD = 0.36;        // the founder's head joint to crown (models3d.js leaf.head)
// On his head, in model units: the base 0.03 forward and 0.07 under the crown
// (inside the skull), the tip 0.09 forward and 0.22 over it, 0.036 round at
// the base (lab/blender/build_founder.py's horn, measured).
const BASE = [0.03, -0.07], TIP = [0.09, 0.22], RADIUS = 0.036;
const AROUND = 12, ALONG = 6;
const GOLD = [1, 0.8235, 0.247];

export function hornFor(model, spec) {
  if (model.primitives.some((p) => p.name === 'fx:unicorn')) return null;
  const head = model.jointNames.indexOf('head');
  const leaf = spec?.leaf?.head;
  if (head < 0 || !leaf) return null;
  const s = leaf / FOUNDER_HEAD;
  const [hx, hy, hz] = model.restHeads[head];
  const crown = [hx, hy + leaf, hz];
  const base = [crown[0] + BASE[0] * s, crown[1] + BASE[1] * s, crown[2]];
  const tip = [crown[0] + TIP[0] * s, crown[1] + TIP[1] * s, crown[2]];
  const ax = [tip[0] - base[0], tip[1] - base[1], 0];
  const len = Math.hypot(ax[0], ax[1]);
  const d = [ax[0] / len, ax[1] / len, 0];
  const u = [-d[1], d[0], 0], w = [0, 0, 1];          // across the axis, in the side plane and out of it
  const r0 = RADIUS * s;
  const slope = Math.atan2(r0, len);                  // how far a side normal tips toward the tip
  const positions = [], normals = [], indices = [];
  for (let i = 0; i < ALONG; i++) {
    const t = i / ALONG, r = r0 * (1 - t);
    for (let j = 0; j < AROUND; j++) {
      const a = (2 * Math.PI * j) / AROUND, c = Math.cos(a), sn = Math.sin(a);
      const radial = [u[0] * c + w[0] * sn, u[1] * c + w[1] * sn, u[2] * c + w[2] * sn];
      positions.push(base[0] + d[0] * len * t + radial[0] * r, base[1] + d[1] * len * t + radial[1] * r, base[2] + radial[2] * r);
      const n = radial.map((v, k) => v * Math.cos(slope) + d[k] * Math.sin(slope));
      normals.push(...n);
    }
  }
  const tipAt = positions.length / 3;
  positions.push(...tip);
  normals.push(...d);
  const baseAt = tipAt + 1;
  positions.push(...base);
  normals.push(-d[0], -d[1], -d[2]);
  for (let i = 0; i < ALONG; i++) {
    for (let j = 0; j < AROUND; j++) {
      const a = i * AROUND + j, b = i * AROUND + ((j + 1) % AROUND);
      if (i < ALONG - 1) {
        const c = a + AROUND, e = b + AROUND;
        indices.push(a, b, e, a, e, c);
      } else {
        indices.push(a, b, tipAt);
      }
    }
  }
  for (let j = 0; j < AROUND; j++) indices.push(baseAt, (j + 1) % AROUND, j);   // the base, closed
  const n = positions.length / 3;
  const joints = new Uint8Array(n * 4), weights = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) { joints[i * 4] = head; weights[i * 4] = 1; }
  return {
    name: 'fx:unicorn', role: 'gold', color: GOLD,
    positions: new Float32Array(positions), normals: new Float32Array(normals),
    joints, weights, indices: new Uint16Array(indices),
  };
}
