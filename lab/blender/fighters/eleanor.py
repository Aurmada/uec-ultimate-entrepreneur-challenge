"""Cathie Woodz (id eleanor), the ninth fighter of the remodel and the third
woman (November 2026).

Her head is an original face built to the character notes in
data/fighters.js: serene, the one face in the cast that is not glaring, soft
raised brows, open eyes, a level mouth; absolute faith reads as calm, not
aggression. Tall, slim and straight-backed, with no hard edges anywhere. Not
a likeness: the woman she parodies is named, never drawn.

A calm oval face, older than the other women's and soft with it: a smooth
forehead, a soft brow ridge set a little high, eyes open under plain lids, soft
cheekbones over cheeks that have settled a little lower, a straight nose of a
good length, a level mouth with thin lips, a rounded chin and a soft jaw,
the folds from the nose to the mouth just drawn in. Her cream hair is a bob
(`headwear`): full over the crown, a fringe swept down across the forehead
from a side parting, falling to the jaw at the sides and the back, fullest
about the eyes and turned under at the ends, the face left clear between the
two sides, as the 2D bob is drawn wide.

Pushed further on 2026-11-06, when the nine faces read too alike: apple
cheeks and a soft jaw under them, a rounder nose and chin and larger ears,
so the face is the softest and kindest in the cast.

As for Jeff: head 0.265 tall in Jeff's space, only the forms sculpted, the
eyes, brows and mouth painted in game.
"""

import numpy as np

EYE_Z, EYE_Y = 1.828, 0.034


def head(fx):
    E, C, V, sc, F = fx.E, fx.C, fx.V, fx.sc, fx.F
    # The jaw first, met tightly by the neck (see Jeff's): soft, its angles
    # set in, a woman's.
    E(V(0.025, 0, 1.735), (0.071, 0.051, 0.048), k=0.012)
    for s in (1, -1):
        E(V(-0.012, s * 0.046, 1.731), (0.021, 0.017, 0.027), k=0.022)
    E(V(-0.014, 0, 1.866), (0.1, 0.079, 0.1), k=0.02)                             # cranium
    E(V(0.048, 0, 1.884), (0.05, 0.062, 0.058), k=0.03)                           # a smooth forehead
    E(V(0.044, 0, 1.8), (0.053, 0.061, 0.081), k=0.03)                            # the face's mass
    for s in (1, -1):
        E(V(0.0, s * 0.05, 1.765), (0.02, 0.007, 0.028), k=0.03)                 # chewing muscle, slight
        E(V(0.064, s * 0.049, 1.809), (0.017, 0.022, 0.011), k=0.025)            # soft cheekbones
        E(V(0.06, s * 0.048, 1.766), (0.023, 0.026, 0.028), k=0.03)              # apple cheeks, settled a little low
        E(V(0.045, s * 0.048, 1.728), (0.022, 0.022, 0.022), k=0.03)             # soft at the jaw
    # A soft brow ridge, set a little high and level: the raised brows are
    # painted, the ridge only gives them somewhere to sit.
    for s in (1, -1):
        C(V(0.088, s * 0.012, 1.86), V(0.075, s * 0.054, 1.858), 0.0062, 0.0052, k=0.02)
    # Eyes open under plain lids, a lower lid filling in under each (see
    # Adam's).
    for s in (1, -1):
        F.cut(sc.Ellipsoid(V(0.097, s * EYE_Y, EYE_Z + 0.006), (0.013, 0.02, 0.009)), 0.01)
    for s in (1, -1):
        E(V(0.077, s * EYE_Y, EYE_Z), (0.0145, 0.0145, 0.0145), k=0.004)          # eyeball
        E(V(0.082, s * EYE_Y, EYE_Z + 0.009), (0.009, 0.015, 0.0042), k=0.005)   # a plain upper lid, open
        E(V(0.083, s * EYE_Y, EYE_Z - 0.012), (0.008, 0.017, 0.006), k=0.008)    # the lower lid, into the cheek
    # A straight nose of a good length on side planes (see Adam's).
    E(V(0.091, 0, 1.81), (0.014, 0.026, 0.03), k=0.022)
    C(V(0.095, 0, 1.849), V(0.111, 0, 1.791), 0.0064, 0.0086, k=0.018)
    E(V(0.11, 0, 1.787), (0.0115, 0.0125, 0.0105), k=0.01)
    for s in (1, -1):
        E(V(0.1, s * 0.0135, 1.779), (0.0072, 0.007, 0.0065), k=0.008)           # nostril wings
    # A level mouth with thin lips, and a rounded chin.
    E(V(0.07, 0, 1.751), (0.024, 0.037, 0.027), k=0.03)
    E(V(0.092, 0, 1.749), (0.0042, 0.019, 0.0033), k=0.008)
    E(V(0.09, 0, 1.739), (0.0055, 0.017, 0.0044), k=0.008)
    E(V(0.078, 0, 1.709), (0.017, 0.025, 0.016), k=0.022)
    for s in (1, -1):
        E(V(-0.006, s * 0.08, 1.826), (0.022, 0.011, 0.033), sc.rot(ry=-10), k=0.01)     # ears, under the bob
        F.cut(sc.Ellipsoid(V(-0.002, s * 0.088, 1.822), (0.008, 0.005, 0.012)), 0.004)


def head_definition(fx):
    G, LINE, SOFT = fx.F.groove, fx.LINE, fx.SOFT
    G([(0.0965, -0.019, 1.7435), (0.1005, 0, 1.743), (0.0965, 0.019, 1.7435)], **LINE)   # where the lips meet
    for s in (1, -1):
        # the folds from the wings of the nose to the corners of the mouth,
        # only just there
        G([(0.098, s * 0.021, 1.777), (0.094, s * 0.028, 1.762), (0.089, s * 0.031, 1.749)], **SOFT)


def headwear(fx):
    """Her cream hair, a bob: [(object, fields it covers)]. Her own head's
    surface (sampled from the body's field, as the others' hair is) pushed
    out a little, fuller on the crown; hung straight down from wherever it is
    widest, as hair falls, to a level cut at the jaw, a little shorter at the
    back; fullest about the eyes, as the 2D curtains are, and turned under at
    the ends (hung straight and belled out, with a level fringe, it was a
    helmet); then the face cut clear below a fringe swept down across the
    forehead from a side parting, the two sides framing it. In a fine field
    of its own, riding the head."""
    V, sc = fx.V, fx.sc
    lo, hi = (-0.16, -0.15, 1.66), (0.14, 0.15, 2.02)
    hair = sc.Field(lo=lo, hi=hi, h=0.0013)
    X, Y, Z = _grid(hair)
    P = np.stack(np.broadcast_arrays(X, Y, Z), axis=-1).reshape(-1, 3)
    # as thick over the forehead as anywhere: thinner, the fringe's edge came
    # so near the skin that the ink broke it into specks
    off = 0.008 + 0.008 * np.clip((Z - 1.86) / 0.1, 0, 1)
    d = fx.F.sample(P).reshape(hair.d.shape) - off
    # the fall: each column takes the widest the hair is above it
    d = np.minimum.accumulate(d[:, :, ::-1], axis=2)[:, :, ::-1]
    # fullest about the eyes, back in at the ends
    t = np.clip((Z - 1.725) / 0.15, 0, 1)
    d = d - 0.02 * np.sin(np.pi * t) * np.clip(-X / 0.03 + 1.5, 0, 1)
    # the ends, level at the jaw and a little shorter at the back
    end = 1.722 + 0.016 * np.clip(-X / 0.1, 0, 1)
    d = np.maximum(d, end - Z)
    # the face cut clear below the fringe, which sweeps down from a parting
    # over her left eye to her right temple (the side the camera sees):
    # between the two sides, and anything forward of the temples, the sides
    # coming further forward toward the ends (cut square, the front of each
    # side was a flat plate down the cheek)
    u = np.clip((0.035 - Y) / 0.1, 0, 1)
    fringe = 1.89 - 0.036 * u ** 1.3
    between = np.maximum(-X, np.abs(Y) - 0.064)
    forward = 0.045 + 0.03 * np.clip((1.86 - Z) / 0.13, 0, 1) - X
    face = np.maximum(np.minimum(between, forward), Z - fringe)
    d = np.maximum(d, -face)
    hair.d = d.astype(np.float32)
    hair.soften(0.006, lambda X, Y, Z: np.float32(1))
    obj = sc.to_blender('hair:bob', *hair.mesh(), smooth=1)
    obj.data.materials.append(fx.material('hair', (0.88, 0.84, 0.75, 1)))
    return [(obj, [hair])]


def _grid(f):
    ax = [f.lo[k] + np.arange(f.n[k]) * f.h for k in range(3)]
    return (ax[0][:, None, None].astype(np.float32), ax[1][None, :, None].astype(np.float32),
            ax[2][None, None, :].astype(np.float32))
