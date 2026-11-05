"""Scam Alt (id scam), the sixth fighter of the remodel (November 2026).

His head is an original face built to the character notes in
data/fighters.js: reasonable, deliberately the mildest face here, soft
brows, neutral eyes, a small even mouth; the unreadable one is the point.
Soft all over. Not a likeness: the man he parodies is named, never drawn.

A young, soft, rounded face: a smooth forehead, a low soft brow ridge, eyes
set at an even depth under plain lids, round cheeks, a short small nose, a
small even mouth and a round chin on a narrowish jaw. Nothing in it is
pushed. His brown hair is a curly mop (`headwear`), puffs over the whole
head and fullest on top, as the 2D one is drawn.

As for Jeff: head 0.265 tall in Jeff's space, only the forms sculpted, the
eyes, brows and mouth painted in game.
"""

import math

import numpy as np

EYE_Z, EYE_Y = 1.826, 0.034


def head(fx):
    E, C, V, sc, F = fx.E, fx.C, fx.V, fx.sc, fx.F
    # The jaw first, met tightly by the neck (see Jeff's): narrowish, soft.
    E(V(0.024, 0, 1.734), (0.074, 0.054, 0.05), k=0.012)
    for s in (1, -1):
        E(V(-0.012, s * 0.05, 1.73), (0.022, 0.019, 0.028), k=0.02)
    E(V(-0.012, 0, 1.866), (0.1, 0.081, 0.1), k=0.02)                             # cranium
    E(V(0.048, 0, 1.884), (0.05, 0.064, 0.058), k=0.03)                           # a smooth forehead
    E(V(0.044, 0, 1.8), (0.054, 0.062, 0.082), k=0.03)                            # the face's mass
    for s in (1, -1):
        E(V(0.0, s * 0.054, 1.765), (0.022, 0.008, 0.03), k=0.03)                # chewing muscle
        E(V(0.063, s * 0.049, 1.808), (0.018, 0.022, 0.012), k=0.025)            # soft cheekbones
        E(V(0.058, s * 0.046, 1.77), (0.022, 0.024, 0.027), k=0.03)              # round cheeks
    # A low, soft brow ridge, level.
    for s in (1, -1):
        C(V(0.089, s * 0.012, 1.856), V(0.076, s * 0.055, 1.856), 0.0075, 0.0065, k=0.02)
    # Eyes at an even depth under plain lids, a lower lid filling in under
    # each (see Adam's).
    for s in (1, -1):
        F.cut(sc.Ellipsoid(V(0.097, s * EYE_Y, EYE_Z + 0.006), (0.013, 0.02, 0.009)), 0.01)
    for s in (1, -1):
        E(V(0.076, s * EYE_Y, EYE_Z), (0.014, 0.014, 0.014), k=0.004)            # eyeball
        E(V(0.081, s * EYE_Y, EYE_Z + 0.008), (0.009, 0.015, 0.005), k=0.005)    # a plain upper lid
        E(V(0.082, s * EYE_Y, EYE_Z - 0.011), (0.008, 0.017, 0.006), k=0.008)    # the lower lid, into the cheek
    # A short, small nose on side planes (see Adam's and Steve's).
    E(V(0.091, 0, 1.81), (0.014, 0.027, 0.03), k=0.022)
    C(V(0.095, 0, 1.847), V(0.112, 0, 1.79), 0.007, 0.009, k=0.018)
    E(V(0.112, 0, 1.786), (0.0105, 0.012, 0.0098), k=0.01)
    for s in (1, -1):
        E(V(0.1, s * 0.0145, 1.779), (0.0078, 0.0075, 0.007), k=0.008)            # nostril wings
    # A small, even mouth and a round chin.
    E(V(0.07, 0, 1.751), (0.024, 0.038, 0.028), k=0.03)
    E(V(0.092, 0, 1.749), (0.0045, 0.018, 0.0037), k=0.008)
    E(V(0.09, 0, 1.739), (0.006, 0.017, 0.0045), k=0.008)
    E(V(0.078, 0, 1.707), (0.016, 0.024, 0.017), k=0.022)
    for s in (1, -1):
        E(V(-0.006, s * 0.083, 1.826), (0.022, 0.011, 0.031), sc.rot(ry=-10), k=0.01)  # ear
        F.cut(sc.Ellipsoid(V(-0.002, s * 0.092, 1.821), (0.009, 0.006, 0.013)), 0.004)


def head_definition(fx):
    G, LINE = fx.F.groove, fx.LINE
    G([(0.096, -0.018, 1.7445), (0.1, 0, 1.744), (0.096, 0.018, 1.7445)], **LINE)   # where the lips meet


def headwear(fx):
    """His brown hair, a curly mop: [(object, fields it covers)]. A cap of
    his own head's surface (sampled from the body's field) cut to the
    hairline, above the ears and at the nape, and over it puffs, each a curl
    or a clump of them, laid evenly over the cap and standing furthest off
    it on top, as the 2D mop is drawn with its puffs across the crown. In a
    fine field of its own, riding the head."""
    V, sc = fx.V, fx.sc
    lo, hi = (-0.17, -0.14, 1.76), (0.17, 0.14, 2.06)                    # room for the front puffs: closer, one was cut flat
    hair = sc.Field(lo=lo, hi=hi, h=0.0015)
    X, Y, Z = _grid(hair)
    P = np.stack(np.broadcast_arrays(X, Y, Z), axis=-1).reshape(-1, 3)
    hair.d = (fx.F.sample(P).reshape(hair.d.shape) - 0.006).astype(np.float32)

    def bottom(x, y):
        """The cap's lower edge: the hairline across the forehead, curving
        down past the temples to above the ears, lower at the nape."""
        front = 1.878 + 0.008 * np.clip((np.abs(y) - 0.03) / 0.04, 0, 1)
        t = np.clip((x + 0.005) / 0.06, 0, 1)
        side = 1.805 - 0.025 * np.clip(-x / 0.1, 0, 1)
        return side + (front - side) * (t * t * (3 - 2 * t))

    hair.d = np.maximum(hair.d, bottom(X, Y) - Z).astype(np.float32)
    # the puffs, laid evenly over a sphere round the skull (a golden-angle
    # spiral) and brought down onto the head, kept to the cap: big and run
    # together, as the 2D puffs are (small and apart, they read as a bunch
    # of grapes)
    c0, n = V(-0.012, 0, 1.866), 44
    golden = math.pi * (3 - math.sqrt(5))
    dirs = []
    for i in range(n):
        z = 1 - 2 * (i + 0.5) / n
        r = math.sqrt(1 - z * z)
        dirs.append(V(r * math.cos(i * golden), r * math.sin(i * golden), z))
    pts = fx.F.project(np.array([c0 + d * 0.125 for d in dirs]))
    nrm = fx.F.normal(pts)
    for i, (p, nv) in enumerate(zip(pts, nrm)):
        if p[2] < bottom(p[0], p[1]) + 0.006:
            continue
        top = np.clip((p[2] - 1.86) / 0.09, 0, 1)
        r = 0.025 + 0.007 * ((i * 7919) % 11) / 10 + 0.005 * top
        hair.add(sc.Ellipsoid(p + nv * (0.004 + 0.012 * top), (r, r * 0.95, r * 0.9)), 0.012)
    for s in (1, -1):
        hair.cut(sc.Ellipsoid(V(-0.006, s * 0.083, 1.826), (0.03, 0.03, 0.044)), 0.004)
    obj = sc.to_blender('hair:curly', *hair.mesh(), smooth=1)
    obj.data.materials.append(fx.material('hair', (0.19, 0.085, 0.03, 1)))
    return [(obj, [hair])]


def _grid(f):
    ax = [f.lo[k] + np.arange(f.n[k]) * f.h for k in range(3)]
    return (ax[0][:, None, None].astype(np.float32), ax[1][None, :, None].astype(np.float32),
            ax[2][None, None, :].astype(np.float32))
