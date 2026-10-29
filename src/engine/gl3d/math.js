// Small vector and matrix helpers for the 3D rig. Plain arrays, column-major
// 4x4 matrices (the WebGL convention). RENDER-ONLY.

export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const length = (a) => Math.hypot(a[0], a[1], a[2]);
export const dist = (a, b) => length(sub(a, b));
export function normalize(a, fallback = [1, 0, 0]) {
  const l = length(a);
  return l > 1e-9 ? [a[0] / l, a[1] / l, a[2] / l] : fallback.slice();
}

// Rotation about +Z (the axis toward the camera). Positive is counter-clockwise
// seen from the camera, so a negative angle tips +Y toward +X.
export function rotZ(v, a) {
  const c = Math.cos(a), s = Math.sin(a);
  return [v[0] * c - v[1] * s, v[0] * s + v[1] * c, v[2]];
}

// An orthonormal frame whose x runs along a bone and whose y is the reference
// direction made perpendicular to it. Returned as a column-major 4x4 with the
// bone head as its translation, each axis scaled by sx, sy, sz.
export function boneFrame(head, tail, ref, sx = 1, sy = 1, sz = 1) {
  const x = normalize(sub(tail, head));
  let y = sub(ref, scale(x, dot(ref, x)));
  if (length(y) < 1e-6) {
    // The reference ran along the bone. Any perpendicular keeps the matrix
    // valid; the pose solver avoids this case, it just must not produce NaN.
    y = Math.abs(x[1]) < 0.9 ? cross(x, [0, 1, 0]) : cross(x, [1, 0, 0]);
  }
  y = normalize(y);
  const z = cross(x, y);
  return [
    x[0] * sx, x[1] * sx, x[2] * sx, 0,
    y[0] * sy, y[1] * sy, y[2] * sy, 0,
    z[0] * sz, z[1] * sz, z[2] * sz, 0,
    head[0], head[1], head[2], 1,
  ];
}

export function multiply(a, b, out = new Array(16)) {
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      out[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1]
        + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
  }
  return out;
}

// Inverse of an affine matrix whose upper 3x3 may carry scale.
export function invertAffine(m) {
  const a = m[0], b = m[4], c = m[8];
  const d = m[1], e = m[5], f = m[9];
  const g = m[2], h = m[6], i = m[10];
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) throw new Error('singular bone matrix');
  const k = 1 / det;
  const r = [
    A * k, B * k, C * k,
    -(b * i - c * h) * k, (a * i - c * g) * k, -(a * h - b * g) * k,
    (b * f - c * e) * k, -(a * f - c * d) * k, (a * e - b * d) * k,
  ];
  // r holds the inverse's columns in order (the cofactors of each row of m).
  const inv = [
    r[0], r[1], r[2], 0,
    r[3], r[4], r[5], 0,
    r[6], r[7], r[8], 0,
    0, 0, 0, 1,
  ];
  const t = [m[12], m[13], m[14]];
  inv[12] = -(inv[0] * t[0] + inv[4] * t[1] + inv[8] * t[2]);
  inv[13] = -(inv[1] * t[0] + inv[5] * t[1] + inv[9] * t[2]);
  inv[14] = -(inv[2] * t[0] + inv[6] * t[1] + inv[10] * t[2]);
  return inv;
}

export const translationOf = (m) => [m[12], m[13], m[14]];
