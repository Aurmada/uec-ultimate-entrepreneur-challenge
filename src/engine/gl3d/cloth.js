// A skirt that follows the legs, for a model built with one riding the hips.
// RENDER-ONLY.
//
// Cathie's coat (lab/blender/fighter3d.py `coat`) is built as one piece,
// skinned wholly to the hips: in a crouch it stayed a stiff cone behind her
// while her thighs came up through it, and lying knocked out it poked through
// the floor (a graphics review, 2026-11-09). Cloth would drape; this is the
// cheap stand-in that keeps the mesh as built, vertex for vertex: as the
// skirt falls away from the waist, more of each vertex is handed from the
// hips to the thighs, the side panels to their own leg and the back shared
// between both, as a long coat is pulled by whichever leg it hangs over. The
// waist stays on the hips, so the hem under the jacket never moves.
//
// What to loosen, and how, is the model's own data (models3d.js `cloth`):
//   { anchor, legs: [left, right], from, to, follow, back }
// `from` and `to` are bind heights (model units, y up): above `from` a vertex
// rides the anchor alone, below `to` it gives the legs `follow` of itself,
// and in between the share eases in. Which leg is the leg nearer it across
// (z), at the legs' own spacing, so a vertex midway between takes half of
// each. The back hangs behind both legs rather than over either: shared
// between them it was swung forward under the thighs in a crouch, wrapped
// round the knees like shorts, so straight behind the anchor a vertex gives
// the legs only `back` of that share, and the full share at the sides.

const smooth = (t) => t * t * (3 - 2 * t);

// Re-weights each primitive named in `spec.cloth`, in place. Returns the
// names it changed, for the knockout's sampling (index.js sinkOf).
export function clothFor(model, spec) {
  const done = [];
  for (const [name, c] of Object.entries(spec?.cloth || {})) {
    const p = model.primitives.find((q) => q.name === name);
    const anchor = model.jointNames.indexOf(c.anchor);
    const [left, right] = c.legs.map((n) => model.jointNames.indexOf(n));
    if (!p || anchor < 0 || left < 0 || right < 0) continue;
    const zl = model.restHeads[left][2], zr = model.restHeads[right][2];
    const [ax, , az] = model.restHeads[anchor];
    for (let v = 0; v < p.positions.length / 3; v++) {
      const x = p.positions[v * 3], y = p.positions[v * 3 + 1], z = p.positions[v * 3 + 2];
      const down = smooth(Math.min(1, Math.max(0, (c.from - y) / (c.from - c.to))));
      // how far round from straight behind the anchor: 0 there, 1 at the side
      const side = Math.abs(z - az) / (Math.hypot(x - ax, z - az) || 1);
      const legs = c.follow * down * (c.back + (1 - c.back) * side);
      const r = Math.min(1, Math.max(0, (z - zl) / (zr - zl)));   // 0 over the left leg, 1 over the right
      p.joints.set([anchor, left, right, 0], v * 4);
      p.weights.set([1 - legs, legs * (1 - r), legs * r, 0], v * 4);
    }
    done.push(name);
  }
  return done;
}
