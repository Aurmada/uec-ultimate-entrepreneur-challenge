"""Sculpting by code: signed distance fields, tight blends and a mesher, in numpy.

The first 3D bodies were metaballs, which blend every element into its
neighbours over a wide radius: good for soft forms, and the reason those bodies
read as fused blobs, a sausage of an arm the same thickness from shoulder to
wrist. A sculptor builds a figure the other way round: a bony core, then each
muscle laid on as its own form, meeting its neighbours in a crease. This does
that in a distance field: every form is a primitive (an ellipsoid for a muscle
belly, a round cone for a tapering limb), and each is joined to the body with a
smooth union whose radius is set per form, a few millimetres where two muscles
should meet in a groove, a few centimetres where a limb grows out of the torso.

    import sculpt
    body = sculpt.Field(lo=(-0.25, -0.8, 0), hi=(0.25, 0.8, 2.0), h=0.003)
    body.add(sculpt.Ellipsoid(c, radii, frame), k=0.01)
    verts, quads = body.mesh()            # surface nets
    obj = sculpt.to_blender('body', verts, quads)

Units are model units (1.0 = 100 rig px, about a metre). Each primitive is
evaluated only over its own bounding box, so a field of a few hundred forms at
3 mm costs seconds, not minutes.
"""

import numpy as np


# ---------------------------------------------------------------- blends
def smin(a, b, k):
    """Smooth minimum: the union of two fields, filleted over about k."""
    if k <= 0:
        return np.minimum(a, b)
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0.0, 1.0)
    return b + (a - b) * h - k * h * (1.0 - h)


def smax(a, b, k):
    return -smin(-a, -b, k)


# ---------------------------------------------------------------- frames
def unit(v):
    v = np.asarray(v, float)
    return v / np.linalg.norm(v)


def frame(along, toward=(1, 0, 0)):
    """An orthonormal frame (3x3, columns u v w): u along `along`, v as near to
    `toward` as it can be while square to u, w = u x v."""
    u = unit(along)
    t = np.asarray(toward, float)
    v = t - u * np.dot(t, u)
    if np.linalg.norm(v) < 1e-6:
        v = np.array([0, 0, 1.0]) - u * u[2]
    v = unit(v)
    return np.stack([u, v, np.cross(u, v)], axis=1)


def rot(rx=0.0, ry=0.0, rz=0.0):
    """A rotation from degrees about x, then y, then z, as a 3x3."""
    a, b, c = np.radians([rx, ry, rz])
    X = np.array([[1, 0, 0], [0, np.cos(a), -np.sin(a)], [0, np.sin(a), np.cos(a)]])
    Y = np.array([[np.cos(b), 0, np.sin(b)], [0, 1, 0], [-np.sin(b), 0, np.cos(b)]])
    Z = np.array([[np.cos(c), -np.sin(c), 0], [np.sin(c), np.cos(c), 0], [0, 0, 1]])
    return Z @ Y @ X


# ---------------------------------------------------------------- primitives
class Ellipsoid:
    """A muscle belly, a bone end, a skull: centre c, semi-axes r along the
    columns of `axes` (identity: x, y, z)."""

    def __init__(self, c, r, axes=None):
        self.c = np.asarray(c, float)
        self.r = np.asarray(r, float)
        self.R = np.eye(3) if axes is None else np.asarray(axes, float)

    def bounds(self):
        m = self.r.max()
        return self.c - m, self.c + m

    def sdf(self, X, Y, Z):
        px, py, pz = X - self.c[0], Y - self.c[1], Z - self.c[2]
        R = self.R
        # into the ellipsoid's own axes
        lx = px * R[0, 0] + py * R[1, 0] + pz * R[2, 0]
        ly = px * R[0, 1] + py * R[1, 1] + pz * R[2, 1]
        lz = px * R[0, 2] + py * R[1, 2] + pz * R[2, 2]
        r = self.r
        k0 = np.sqrt((lx / r[0]) ** 2 + (ly / r[1]) ** 2 + (lz / r[2]) ** 2)
        k1 = np.sqrt((lx / r[0] ** 2) ** 2 + (ly / r[1] ** 2) ** 2 + (lz / r[2] ** 2) ** 2)
        return k0 * (k0 - 1.0) / np.maximum(k1, 1e-9)


class RoundCone:
    """A limb segment: a capsule from a (radius r1) to b (radius r2), exact.
    `flat` squashes it across one direction (a forearm is wider than deep):
    (direction, scale), scale below 1 for flatter."""

    def __init__(self, a, b, r1, r2, flat=None):
        self.a, self.b = np.asarray(a, float), np.asarray(b, float)
        self.r1, self.r2 = float(r1), float(r2)
        self.flat = None
        if flat is not None:
            d, s = flat
            self.flat = (unit(d), float(s))

    def bounds(self):
        r = max(self.r1, self.r2)
        return np.minimum(self.a, self.b) - r, np.maximum(self.a, self.b) + r

    def sdf(self, X, Y, Z):
        a, b = self.a, self.b
        px, py, pz = X - a[0], Y - a[1], Z - a[2]
        if self.flat is not None:
            # stretch space along the flat direction about the segment's axis,
            # so the round section reads as an ellipse
            (dx, dy, dz), s = self.flat
            ax = unit(b - a)
            dd = np.array([dx, dy, dz]) - ax * np.dot([dx, dy, dz], ax)
            dd = dd / max(np.linalg.norm(dd), 1e-9)
            t = (px * dd[0] + py * dd[1] + pz * dd[2]) * (1.0 / s - 1.0)
            px, py, pz = px + t * dd[0], py + t * dd[1], pz + t * dd[2]
        ba = b - a
        l2 = float(np.dot(ba, ba))
        rr = self.r1 - self.r2
        a2 = l2 - rr * rr
        il2 = 1.0 / l2
        y = px * ba[0] + py * ba[1] + pz * ba[2]
        z = y - l2
        qx, qy, qz = px * l2 - ba[0] * y, py * l2 - ba[1] * y, pz * l2 - ba[2] * y
        x2 = qx * qx + qy * qy + qz * qz
        y2 = y * y * l2
        z2 = z * z * l2
        k = np.sign(rr) * rr * rr * x2
        d_end = np.sqrt(x2 + z2) * il2 - self.r2
        d_start = np.sqrt(x2 + y2) * il2 - self.r1
        d_side = (np.sqrt(x2 * a2 * il2) + y * rr) * il2 - self.r1
        return np.where(np.sign(z) * a2 * z2 > k, d_end, np.where(np.sign(y) * a2 * y2 < k, d_start, d_side))


class Box:
    """A rounded box: centre c, half-extents e, corner radius rad, in `axes`."""

    def __init__(self, c, e, rad=0.0, axes=None):
        self.c = np.asarray(c, float)
        self.e = np.asarray(e, float)
        self.rad = float(rad)
        self.R = np.eye(3) if axes is None else np.asarray(axes, float)

    def bounds(self):
        m = np.linalg.norm(self.e) + self.rad
        return self.c - m, self.c + m

    def sdf(self, X, Y, Z):
        px, py, pz = X - self.c[0], Y - self.c[1], Z - self.c[2]
        R = self.R
        l = [px * R[0, i] + py * R[1, i] + pz * R[2, i] for i in range(3)]
        q = [np.abs(l[i]) - (self.e[i] - self.rad) for i in range(3)]
        out = np.sqrt(sum(np.maximum(qi, 0.0) ** 2 for qi in q))
        inside = np.minimum(np.maximum(q[0], np.maximum(q[1], q[2])), 0.0)
        return out + inside - self.rad


class Union:
    """Several forms as one, joined hard: a groove's segments, so the groove is
    carved once and is the same depth along its length, where cutting each
    segment on its own deepened every joint between them into a bead."""

    def __init__(self, shapes):
        self.shapes = list(shapes)

    def bounds(self):
        b = [sh.bounds() for sh in self.shapes]
        return np.min([x[0] for x in b], axis=0), np.max([x[1] for x in b], axis=0)

    def sdf(self, X, Y, Z):
        out = None
        for sh in self.shapes:
            d = sh.sdf(X, Y, Z)
            out = d if out is None else np.minimum(out, d)
        return out


# ---------------------------------------------------------------- the field
class Field:
    """A sampled distance field over a box, built up one form at a time."""

    def __init__(self, lo, hi, h):
        self.lo = np.asarray(lo, float)
        self.h = float(h)
        self.n = (np.ceil((np.asarray(hi, float) - self.lo) / h).astype(int) + 1)
        self.d = np.full(tuple(self.n), 1.0, dtype=np.float32)

    def _block(self, lo, hi):
        i0 = np.clip(np.floor((lo - self.lo) / self.h).astype(int), 0, self.n - 1)
        i1 = np.clip(np.ceil((hi - self.lo) / self.h).astype(int) + 1, 0, self.n)
        sl = tuple(slice(int(a), int(b)) for a, b in zip(i0, i1))
        ax = [self.lo[k] + np.arange(i0[k], i1[k]) * self.h for k in range(3)]
        X, Y, Z = np.meshgrid(*ax, indexing='ij')
        return sl, X, Y, Z

    def apply(self, shape, k=0.0, op='union'):
        """Adds (op 'union') or carves ('cut') a form, blended over k."""
        lo, hi = shape.bounds()
        pad = 2 * max(k, self.h) + 0.01
        sl, X, Y, Z = self._block(lo - pad, hi + pad)
        if X.size == 0:
            return
        d = shape.sdf(X, Y, Z).astype(np.float32)
        cur = self.d[sl]
        self.d[sl] = smin(cur, d, k) if op == 'union' else smax(cur, -d, k)

    def add(self, shape, k=0.0):
        self.apply(shape, k, 'union')

    def cut(self, shape, k=0.0):
        self.apply(shape, k, 'cut')

    def swell(self, c, r, t, axes=None):
        """Pushes the surface out by up to t around c, easing to nothing at the
        edge of the ellipsoid (c, r, axes as Ellipsoid's): soft tissue laid
        over the forms already there, such as fat. Overlapping swells add."""
        c, r = np.asarray(c, float), np.asarray(r, float)
        R = np.eye(3) if axes is None else np.asarray(axes, float)
        ext = np.abs(R) @ r
        sl, X, Y, Z = self._block(c - ext, c + ext)
        if X.size == 0:
            return
        px, py, pz = X - c[0], Y - c[1], Z - c[2]
        q = sum(((px * R[0, i] + py * R[1, i] + pz * R[2, i]) / r[i]) ** 2 for i in range(3))
        self.d[sl] -= (t * np.clip(1 - q, 0, 1) ** 2).astype(np.float32)

    # ------------------------------------------------------------ carving
    def sample(self, P):
        """The field at points P (n, 3), interpolated between samples."""
        g = (np.asarray(P, float) - self.lo) / self.h
        i0 = np.clip(np.floor(g).astype(int), 0, self.n - 2)
        t = np.clip(g - i0, 0.0, 1.0)
        out = np.zeros(len(g))
        for dx in (0, 1):
            for dy in (0, 1):
                for dz in (0, 1):
                    w = ((t[:, 0] if dx else 1 - t[:, 0]) * (t[:, 1] if dy else 1 - t[:, 1])
                         * (t[:, 2] if dz else 1 - t[:, 2]))
                    out += w * self.d[i0[:, 0] + dx, i0[:, 1] + dy, i0[:, 2] + dz]
        return out

    def normal(self, P):
        e = self.h
        P = np.asarray(P, float)
        g = np.stack([self.sample(P + o) - self.sample(P - o) for o in np.eye(3) * e], axis=1)
        return g / np.maximum(np.linalg.norm(g, axis=1, keepdims=True), 1e-9)

    def project(self, P, iters=8):
        """Points moved onto the surface along the field's gradient."""
        P = np.asarray(P, float).copy()
        for _ in range(iters):
            P -= self.sample(P)[:, None] * self.normal(P)
        return P

    def groove(self, points, depth=0.004, width=0.005, k=0.006, steps=6):
        """Carves a groove along a path on the surface: the separation between
        two muscles, the line under a pectoral. `points` only need to be near
        the surface; they are projected onto it, the path between them is
        smoothed (Catmull-Rom), and a capsule of radius `width` is sunk `depth`
        into the skin along it and blended out over k."""
        P = self.project(np.asarray(points, float))
        if len(P) > 2:
            ext = np.vstack([2 * P[0] - P[1], P, 2 * P[-1] - P[-2]])
            dense = []
            for i in range(1, len(ext) - 2):
                p0, p1, p2, p3 = ext[i - 1], ext[i], ext[i + 1], ext[i + 2]
                for t in np.linspace(0, 1, steps, endpoint=False):
                    t2, t3 = t * t, t * t * t
                    dense.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
                                        + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
            dense.append(ext[-2])
            P = self.project(np.asarray(dense))
        N = self.normal(P)
        C = P + N * (width - depth)
        self.cut(Union(RoundCone(a, b, width, width) for a, b in zip(C[:-1], C[1:])), k)

    def raise_(self, c, r, axes=None, lift=0.004, k=0.01):
        """A shallow form laid on the surface near c: an ellipsoid sunk so it
        stands only `lift` proud of the skin under it. For definition (a vein,
        a tendon, the head of a muscle) without a bubble."""
        p = self.project(np.asarray([c], float))[0]
        n = self.normal(np.asarray([p]))[0]
        R = np.eye(3) if axes is None else np.asarray(axes, float)
        # how far the ellipsoid reaches along the normal (its support distance)
        reach = np.sqrt(np.sum(((R.T @ n) * np.asarray(r, float)) ** 2))
        self.add(Ellipsoid(p + n * (lift - reach), r, R), k)

    # ------------------------------------------------------------ meshing
    def mesh(self):
        """Naive surface nets: a vertex in every cell the surface passes
        through, at the mean of where it crosses the cell's edges, and a quad
        across every grid edge it crosses. Watertight wherever the field is
        closed inside the box."""
        D = self.d
        s = D < 0
        nx, ny, nz = D.shape
        corners = [(i, j, k) for i in (0, 1) for j in (0, 1) for k in (0, 1)]
        anyc = np.zeros((nx - 1, ny - 1, nz - 1), bool)
        allc = np.ones((nx - 1, ny - 1, nz - 1), bool)
        for (i, j, k) in corners:
            c = s[i:nx - 1 + i, j:ny - 1 + j, k:nz - 1 + k]
            anyc |= c
            allc &= c
        idx = np.argwhere(anyc & ~allc)          # cells the surface crosses, in C order
        del anyc, allc
        acc = np.zeros((len(idx), 3))
        cnt = np.zeros(len(idx))
        edges = [((0, 0, 0), (1, 0, 0)), ((0, 1, 0), (1, 1, 0)), ((0, 0, 1), (1, 0, 1)), ((0, 1, 1), (1, 1, 1)),
                 ((0, 0, 0), (0, 1, 0)), ((1, 0, 0), (1, 1, 0)), ((0, 0, 1), (0, 1, 1)), ((1, 0, 1), (1, 1, 1)),
                 ((0, 0, 0), (0, 0, 1)), ((1, 0, 0), (1, 0, 1)), ((0, 1, 0), (0, 1, 1)), ((1, 1, 0), (1, 1, 1))]
        for a, b in edges:
            ia, ib = idx + a, idx + b
            da = D[ia[:, 0], ia[:, 1], ia[:, 2]]
            db = D[ib[:, 0], ib[:, 1], ib[:, 2]]
            m = (da < 0) != (db < 0)
            t = da[m] / (da[m] - db[m])
            acc[m] += np.asarray(a, float) + t[:, None] * (np.asarray(b, float) - np.asarray(a, float))
            cnt[m] += 1
        verts = self.lo + (idx + acc / cnt[:, None]) * self.h

        lin = (idx[:, 0] * (ny - 1) + idx[:, 1]) * (nz - 1) + idx[:, 2]

        def vid(ci, cj, ck):
            q = (ci * (ny - 1) + cj) * (nz - 1) + ck
            return np.searchsorted(lin, q)

        quads = []
        # x edges: (i,j,k)-(i+1,j,k), shared by cells (i, j-1..j, k-1..k)
        e = s[:-1, 1:-1, 1:-1] != s[1:, 1:-1, 1:-1]
        i, j, k = np.nonzero(e)
        j, k = j + 1, k + 1
        f = np.stack([vid(i, j - 1, k - 1), vid(i, j, k - 1), vid(i, j, k), vid(i, j - 1, k)], 1)
        quads.append(np.where(s[i, j, k][:, None], f, f[:, ::-1]))
        # y edges: (i,j,k)-(i,j+1,k), cells (i-1..i, j, k-1..k)
        e = s[1:-1, :-1, 1:-1] != s[1:-1, 1:, 1:-1]
        i, j, k = np.nonzero(e)
        i, k = i + 1, k + 1
        f = np.stack([vid(i - 1, j, k - 1), vid(i - 1, j, k), vid(i, j, k), vid(i, j, k - 1)], 1)
        quads.append(np.where(s[i, j, k][:, None], f, f[:, ::-1]))
        # z edges: (i,j,k)-(i,j,k+1), cells (i-1..i, j-1..j, k)
        e = s[1:-1, 1:-1, :-1] != s[1:-1, 1:-1, 1:]
        i, j, k = np.nonzero(e)
        i, j = i + 1, j + 1
        f = np.stack([vid(i - 1, j - 1, k), vid(i, j - 1, k), vid(i, j, k), vid(i - 1, j, k)], 1)
        quads.append(np.where(s[i, j, k][:, None], f, f[:, ::-1]))
        return verts, np.concatenate(quads)


def to_blender(name, verts, quads, smooth=2):
    """A Blender mesh object from surface-nets output: normals out, shaded
    smooth, and `smooth` passes of volume-keeping smoothing to take off the
    voxel stepping."""
    import bpy
    import bmesh
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts.tolist(), [], quads.tolist())
    me.update()
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for _ in range(smooth):
        # Taubin: a step in, a slightly larger step back out, so it smooths
        # without shrinking the forms
        bmesh.ops.smooth_vert(bm, verts=bm.verts, factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
        co = [v.co.copy() for v in bm.verts]
        bmesh.ops.smooth_vert(bm, verts=bm.verts, factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
        for v, c in zip(bm.verts, co):
            v.co = c + (c - v.co) * 1.06
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    return obj
