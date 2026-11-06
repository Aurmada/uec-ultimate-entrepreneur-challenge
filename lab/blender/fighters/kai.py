"""Steve Nojobs (id kai), the fourth fighter of the remodel (November 2026).

His head is an original face built to the character notes in
data/fighters.js: the showman, heavy lids, level brows, a small knowing
mouth, not angry, just certain you will buy it; rake thin. Not a likeness:
the man he parodies is named, never drawn.

A long, lean face: a tall narrow skull, a high forehead, a light level brow
over deep-set eyes under heavy lids, high cheekbones over a face that narrows
below them, a long straight nose, a small mouth with thin lips, and a narrow
pointed chin; ears flat to the head. His grey hair is a quiff, swept up and
forward off the forehead and cut short at the sides (`headwear`), and he
wears glasses, rounded rectangles round clear lenses, as in 2D (`eyewear`).

Pushed further on 2026-11-06, when the nine faces read too alike: the jaw
narrower, the cranium taller, the cheeks hollow under the cheekbones and the
chin longer, so the face is a long V.

As for Jeff: head 0.265 tall in Jeff's space, only the forms sculpted, the
eyes, brows and mouth painted in game, seen through the clear lenses.
"""

import numpy as np

EYE_Z, EYE_Y = 1.826, 0.033


def head(fx):
    E, C, V, sc, F = fx.E, fx.C, fx.V, fx.sc, fx.F
    # The jaw first, met tightly by the neck (see Jeff's): narrow, its angles
    # set in, running down to a pointed chin.
    E(V(0.024, 0, 1.732), (0.074, 0.044, 0.05), k=0.012)
    for s in (1, -1):
        E(V(-0.016, s * 0.041, 1.728), (0.02, 0.015, 0.027), k=0.018)
    E(V(-0.014, 0, 1.872), (0.099, 0.075, 0.108), k=0.02)                         # cranium, tall and narrow
    E(V(0.05, 0, 1.888), (0.048, 0.06, 0.056), k=0.03)                            # a high forehead
    E(V(0.043, 0, 1.8), (0.052, 0.058, 0.084), k=0.03)                            # the face's mass, long
    for s in (1, -1):
        E(V(0.0, s * 0.052, 1.765), (0.022, 0.007, 0.03), k=0.03)                # chewing muscle
        E(V(0.066, s * 0.049, 1.811), (0.017, 0.022, 0.011), k=0.025)            # high cheekbones
        E(V(0.05, s * 0.038, 1.772), (0.012, 0.015, 0.02), k=0.03)               # the cheek under them, hollow
    # The brow: light and level, right across.
    for s in (1, -1):
        C(V(0.088, s * 0.012, 1.852), V(0.076, s * 0.055, 1.853), 0.0085, 0.0072, k=0.018)
    # Deep-set eyes under heavy lids, a lower lid filling in under each (see
    # Adam's: carved lower, the inner corner went black in the game's light).
    for s in (1, -1):
        F.cut(sc.Ellipsoid(V(0.096, s * EYE_Y, EYE_Z + 0.005), (0.013, 0.019, 0.009)), 0.01)
    for s in (1, -1):
        E(V(0.075, s * EYE_Y, EYE_Z), (0.0135, 0.0135, 0.0135), k=0.004)         # eyeball
        E(V(0.081, s * EYE_Y, EYE_Z + 0.006), (0.01, 0.016, 0.006), k=0.006)     # the heavy upper lid
        E(V(0.082, s * EYE_Y, EYE_Z - 0.011), (0.008, 0.016, 0.006), k=0.008)    # the lower lid, into the cheek
    # A long, straight nose on side planes that run out under the eyes (see
    # Adam's; narrower, the crease beside the nose went black), narrow at the
    # tip.
    E(V(0.091, 0, 1.81), (0.014, 0.027, 0.03), k=0.022)
    C(V(0.095, 0, 1.849), V(0.118, 0, 1.786), 0.0072, 0.0088, k=0.018)
    E(V(0.117, 0, 1.783), (0.0095, 0.0105, 0.0092), k=0.01)
    for s in (1, -1):
        E(V(0.102, s * 0.0135, 1.778), (0.0075, 0.007, 0.0068), k=0.008)         # nostril wings
    # A small mouth with thin lips, and a narrow pointed chin.
    E(V(0.07, 0, 1.75), (0.024, 0.036, 0.028), k=0.03)
    E(V(0.093, 0, 1.748), (0.0045, 0.019, 0.0038), k=0.008)
    E(V(0.091, 0, 1.737), (0.0055, 0.017, 0.0045), k=0.008)
    E(V(0.082, 0, 1.692), (0.016, 0.016, 0.024), k=0.02)
    for s in (1, -1):
        E(V(-0.008, s * 0.08, 1.826), (0.021, 0.0095, 0.031), sc.rot(ry=-10), k=0.01)   # ears, flat to the head
        F.cut(sc.Ellipsoid(V(-0.004, s * 0.088, 1.822), (0.009, 0.005, 0.014)), 0.004)


def head_definition(fx):
    G, LINE, SOFT = fx.F.groove, fx.LINE, fx.SOFT
    G([(0.097, -0.019, 1.7425), (0.1012, 0, 1.742), (0.097, 0.019, 1.7425)], **LINE)   # where the lips meet
    for s in (1, -1):
        # faint folds from the nose's wings toward the corners of the mouth: an
        # older man's face, thinner than Carl's deep ones
        G([(0.105, s * 0.02, 1.776), (0.099, s * 0.026, 1.76)], **SOFT)


def eyewear(fx):
    """His glasses (fx.glasses): rounded rectangles round clear lenses, in
    front of his eyes, the bridge over his nose, the arms back to his ears."""
    V = fx.V
    return fx.glasses(lens_c=(0.104, 0.034, EYE_Z + 0.001), lens_half=(0.0215, 0.0145), lens_turn=14,
                      bridge=(V(0.112, -0.012, EYE_Z + 0.004), V(0.112, 0.012, EYE_Z + 0.004)),
                      arm_from=(0.098, 0.056, EYE_Z + 0.006), arm_to=(-0.006, 0.084, EYE_Z + 0.002))


def headwear(fx):
    """His grey hair, a quiff: [(object, fields it covers)]. His own head's
    surface (sampled from the body's field, as Carl's slick hair is) a few
    millimetres out and cut to the hairline, above the ears and at the nape;
    on top of it, at the front, the quiff swept up and forward off the
    forehead and back over the crown, as the 2D quiff reads as height on a
    round head. Combed lines run back through it. In a fine field of its own,
    riding the head."""
    V, sc = fx.V, fx.sc
    lo, hi = (-0.14, -0.11, 1.76), (0.13, 0.11, 2.03)
    hair = sc.Field(lo=lo, hi=hi, h=0.0012)
    X, Y, Z = _grid(hair)
    P = np.stack(np.broadcast_arrays(X, Y, Z), axis=-1).reshape(-1, 3)
    hair.d = (fx.F.sample(P).reshape(hair.d.shape) - 0.003).astype(np.float32)
    # the hairline: across the forehead, curving down past the temples to
    # the sideburns in front of the ears, and lower at the nape. Cut square
    # where the forehead met the side, it stepped down over the temple.
    front = 1.884 + 0.01 * np.clip((np.abs(Y) - 0.03) / 0.04, 0, 1)
    t = np.clip((X + 0.005) / 0.06, 0, 1)
    side = 1.8 - 0.03 * np.clip(-X / 0.1, 0, 1)
    hair.d = np.maximum(hair.d, side + (front - side) * (t * t * (3 - 2 * t)) - Z).astype(np.float32)
    # the quiff: volume over the whole top, wider than the skull up there and
    # short at the sides, rolled up and forward off the front: kept narrower
    # than the head, it stood up as a crest
    hair.add(sc.Ellipsoid(V(-0.012, 0, 1.94), (0.1, 0.071, 0.045)), 0.02)
    hair.add(sc.Ellipsoid(V(0.054, 0, 1.952), (0.046, 0.066, 0.033), sc.rot(ry=-25)), 0.02)
    for s in (1, -1):
        hair.cut(sc.Ellipsoid(V(-0.008, s * 0.08, 1.826), (0.03, 0.03, 0.044)), 0.004)
    # the comb's lines, up off the front of the quiff and back over it, shallow:
    # deeper, the ink drew them as black scribbles at game size
    for y in (-0.036, -0.012, 0.012, 0.036):
        hair.groove([(0.09, y * 0.9, 1.94), (0.05, y, 1.982), (-0.01, y * 1.05, 1.99), (-0.07, y * 1.1, 1.965)],
                    depth=0.0007, width=0.0024, k=0.0015)
    obj = sc.to_blender('hair:quiff', *hair.mesh(), smooth=1)
    obj.data.materials.append(fx.material('hair', (0.26, 0.27, 0.32, 1)))
    return [(obj, [hair])]


def _grid(f):
    ax = [f.lo[k] + np.arange(f.n[k]) * f.h for k in range(3)]
    return (ax[0][:, None, None].astype(np.float32), ax[1][None, :, None].astype(np.float32),
            ax[2][None, None, :].astype(np.float32))
