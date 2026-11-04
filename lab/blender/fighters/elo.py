"""Elo Ma (id elo), the fifth fighter of the remodel (November 2026).

His head is an original face built to the character notes in
data/fighters.js: thin-skinned, brows up in permanent grievance, a small
mouth, eyes certain they are the smartest thing on the stage; tall and
heavy-set rather than built. Not a likeness: the man he parodies is named,
never drawn.

A soft oval face on a small head: a high forehead, a light brow ridge set
high with its inner ends lifted, big eyes set shallow and wide open under
thin lids, soft cheekbones over full cheeks, a straight nose with a rounded
tip, a small mouth with a pouting lower lip, and a broad rounded jaw. The fat
the pipeline lays on (his `belly`) softens the jaw line and the neck. His
brown hair is a buzz cut (`headwear`).

As for Jeff: head 0.265 tall in Jeff's space, only the forms sculpted, the
eyes, brows and mouth painted in game.
"""

import numpy as np

EYE_Z, EYE_Y = 1.828, 0.034


def head(fx):
    E, C, V, sc, F = fx.E, fx.C, fx.V, fx.sc, fx.F
    # The jaw first, met tightly by the neck (see Jeff's): broad and rounded.
    E(V(0.022, 0, 1.732), (0.078, 0.06, 0.05), k=0.012)
    for s in (1, -1):
        E(V(-0.012, s * 0.054, 1.728), (0.024, 0.02, 0.03), k=0.02)
    E(V(-0.012, 0, 1.864), (0.1, 0.08, 0.1), k=0.02)                              # cranium
    E(V(0.048, 0, 1.884), (0.05, 0.064, 0.06), k=0.03)                            # a high forehead
    E(V(0.044, 0, 1.8), (0.054, 0.064, 0.082), k=0.03)                            # the face's mass
    for s in (1, -1):
        E(V(0.0, s * 0.056, 1.765), (0.024, 0.008, 0.03), k=0.03)                # chewing muscle
        E(V(0.064, s * 0.05, 1.808), (0.018, 0.022, 0.012), k=0.025)             # soft cheekbones
        E(V(0.058, s * 0.048, 1.768), (0.022, 0.024, 0.028), k=0.03)             # full cheeks under them
    # The brow: a light ridge set high, its inner ends lifted: the grievance
    # is in the painted brows, the ridge only gives them somewhere to sit.
    for s in (1, -1):
        C(V(0.09, s * 0.011, 1.862), V(0.077, s * 0.055, 1.857), 0.008, 0.007, k=0.018)
    # Shallow sockets, carved under the brow only, and big eyes set forward,
    # a lower lid filling in under each (see Adam's: the stare is carved).
    for s in (1, -1):
        F.cut(sc.Ellipsoid(V(0.097, s * EYE_Y, EYE_Z + 0.006), (0.013, 0.02, 0.009)), 0.01)
    for s in (1, -1):
        E(V(0.077, s * EYE_Y, EYE_Z), (0.0145, 0.0145, 0.0145), k=0.004)          # eyeball
        E(V(0.082, s * EYE_Y, EYE_Z + 0.009), (0.009, 0.015, 0.004), k=0.005)    # a thin upper lid
        E(V(0.083, s * EYE_Y, EYE_Z - 0.011), (0.008, 0.017, 0.006), k=0.008)    # the lower lid, into the cheek
    # A straight nose with a rounded tip, on side planes that run out under
    # the eyes (see Adam's and Steve's: without them the crease went black).
    E(V(0.092, 0, 1.81), (0.014, 0.027, 0.03), k=0.022)
    C(V(0.096, 0, 1.848), V(0.115, 0, 1.788), 0.0075, 0.0095, k=0.018)
    E(V(0.115, 0, 1.784), (0.011, 0.0125, 0.0105), k=0.01)
    for s in (1, -1):
        E(V(0.102, s * 0.015, 1.778), (0.008, 0.0078, 0.0072), k=0.008)          # nostril wings
    # A small mouth on its barrel, the lower lip pouting, and a rounded chin.
    E(V(0.07, 0, 1.75), (0.025, 0.04, 0.028), k=0.03)
    E(V(0.093, 0, 1.748), (0.0045, 0.018, 0.0036), k=0.008)
    E(V(0.092, 0, 1.736), (0.007, 0.017, 0.0055), k=0.008)
    E(V(0.08, 0, 1.704), (0.017, 0.026, 0.017), k=0.022)
    for s in (1, -1):
        E(V(-0.006, s * 0.084, 1.826), (0.022, 0.011, 0.031), sc.rot(ry=-10), k=0.01)  # ear
        F.cut(sc.Ellipsoid(V(-0.002, s * 0.093, 1.821), (0.009, 0.006, 0.013)), 0.004)


def head_definition(fx):
    G, LINE = fx.F.groove, fx.LINE
    G([(0.097, -0.018, 1.7425), (0.1015, 0, 1.742), (0.097, 0.018, 1.7425)], **LINE)   # where the lips meet


def headwear(fx):
    """His brown hair, a buzz cut: [(object, fields it covers)]. His own
    head's surface (sampled from the body's field, as Carl's and Steve's
    hair are) pushed out barely two millimetres, cut to a hairline across
    the forehead, a little higher at the temples, curving down to the
    sideburns in front of the ears, and lower at the nape. In a fine field
    of its own, riding the head."""
    V, sc = fx.V, fx.sc
    lo, hi = (-0.14, -0.11, 1.76), (0.12, 0.11, 2.0)
    hair = sc.Field(lo=lo, hi=hi, h=0.0012)
    X, Y, Z = _grid(hair)
    P = np.stack(np.broadcast_arrays(X, Y, Z), axis=-1).reshape(-1, 3)
    hair.d = (fx.F.sample(P).reshape(hair.d.shape) - 0.0018).astype(np.float32)
    front = 1.888 + 0.012 * np.clip((np.abs(Y) - 0.025) / 0.04, 0, 1)
    t = np.clip((X + 0.005) / 0.06, 0, 1)
    side = 1.8 - 0.03 * np.clip(-X / 0.1, 0, 1)
    hair.d = np.maximum(hair.d, side + (front - side) * (t * t * (3 - 2 * t)) - Z).astype(np.float32)
    for s in (1, -1):
        hair.cut(sc.Ellipsoid(V(-0.006, s * 0.084, 1.826), (0.03, 0.03, 0.044)), 0.004)
    obj = sc.to_blender('hair:buzz', *hair.mesh(), smooth=1)
    obj.data.materials.append(fx.material('hair', (0.1, 0.045, 0.016, 1)))
    return [(obj, [hair])]


def _grid(f):
    ax = [f.lo[k] + np.arange(f.n[k]) * f.h for k in range(3)]
    return (ax[0][:, None, None].astype(np.float32), ax[1][None, :, None].astype(np.float32),
            ax[2][None, None, :].astype(np.float32))
