"""Kim Koindashian (id zara), the eighth fighter of the remodel and the second
woman (November 2026).

Her head is an original face built to the character notes in
data/fighters.js: bored of you, the heaviest lids in the game, flat brows, a
tiny mouth; contempt costs less effort than anger. Small and curvy, an
oversized head that reads young. Not a likeness: the woman she parodies is
named, never drawn.

A soft, rounded face: a smooth forehead, a light flat brow, almond eyes under
the heaviest lids in the cast (carved heavy, as Steve's are), full round
cheeks, a small nose, a tiny mouth with full lips, and a soft round chin.
Her black hair is pulled up into two puffs on top (`headwear`), as the 2D
ones are drawn, and she wears round earrings in her accent colour.

As for Jeff: head 0.265 tall in Jeff's space, only the forms sculpted, the
eyes, brows and mouth painted in game.
"""

import numpy as np

EYE_Z, EYE_Y = 1.826, 0.034


def head(fx):
    E, C, V, sc, F = fx.E, fx.C, fx.V, fx.sc, fx.F
    # The jaw first, met tightly by the neck (see Jeff's): soft and round.
    E(V(0.024, 0, 1.738), (0.07, 0.052, 0.046), k=0.012)
    for s in (1, -1):
        E(V(-0.012, s * 0.047, 1.733), (0.02, 0.017, 0.026), k=0.02)
    E(V(-0.014, 0, 1.866), (0.1, 0.08, 0.1), k=0.02)                              # cranium
    E(V(0.048, 0, 1.884), (0.05, 0.063, 0.058), k=0.03)                           # a smooth forehead
    E(V(0.044, 0, 1.8), (0.053, 0.062, 0.08), k=0.03)                             # the face's mass
    for s in (1, -1):
        E(V(0.0, s * 0.05, 1.766), (0.02, 0.007, 0.028), k=0.03)                 # chewing muscle, slight
        E(V(0.065, s * 0.05, 1.81), (0.017, 0.022, 0.011), k=0.025)              # cheekbones
        E(V(0.06, s * 0.047, 1.772), (0.021, 0.024, 0.026), k=0.03)              # full round cheeks
    # The brow: light and flat.
    for s in (1, -1):
        C(V(0.088, s * 0.012, 1.855), V(0.075, s * 0.055, 1.855), 0.0065, 0.0055, k=0.02)
    # Almond eyes under the heaviest lids in the game, a lower lid filling in
    # under each (see Adam's).
    for s in (1, -1):
        F.cut(sc.Ellipsoid(V(0.096, s * EYE_Y, EYE_Z + 0.005), (0.013, 0.02, 0.009)), 0.01)
    for s in (1, -1):
        E(V(0.076, s * EYE_Y, EYE_Z), (0.0145, 0.0145, 0.0145), k=0.004)          # eyeball
        E(V(0.081, s * EYE_Y, EYE_Z + 0.005), (0.0105, 0.017, 0.0065), k=0.006)  # the heaviest upper lid
        E(V(0.082, s * EYE_Y, EYE_Z - 0.011), (0.008, 0.017, 0.006), k=0.008)    # the lower lid, into the cheek
    # A small nose on side planes (see Adam's).
    E(V(0.091, 0, 1.81), (0.014, 0.027, 0.03), k=0.022)
    C(V(0.095, 0, 1.845), V(0.11, 0, 1.791), 0.0065, 0.0085, k=0.018)
    E(V(0.11, 0, 1.787), (0.0098, 0.0115, 0.009), k=0.01)
    for s in (1, -1):
        E(V(0.099, s * 0.0145, 1.78), (0.0078, 0.0078, 0.007), k=0.008)          # nostril wings
    # A tiny mouth with full lips, and a soft round chin.
    E(V(0.07, 0, 1.752), (0.024, 0.034, 0.027), k=0.03)
    E(V(0.093, 0, 1.75), (0.0055, 0.0145, 0.0045), k=0.008)
    E(V(0.091, 0, 1.739), (0.007, 0.0135, 0.0055), k=0.008)
    E(V(0.079, 0, 1.708), (0.015, 0.021, 0.016), k=0.022)
    for s in (1, -1):
        E(V(-0.006, s * 0.08, 1.826), (0.02, 0.01, 0.028), sc.rot(ry=-10), k=0.01)      # small ears
        F.cut(sc.Ellipsoid(V(-0.002, s * 0.088, 1.822), (0.008, 0.005, 0.012)), 0.004)


def head_definition(fx):
    G, LINE = fx.F.groove, fx.LINE
    G([(0.0975, -0.0145, 1.7445), (0.1015, 0, 1.744), (0.0975, 0.0145, 1.7445)], **LINE)   # where the lips meet


def headwear(fx):
    """Her black hair, pulled up into two puffs, and her earrings:
    [(object, fields it covers)]. The hair is her own head's surface (sampled
    from the body's field) a couple of millimetres out, cut to the hairline,
    round the ears and at the nape, smooth as it is drawn up; the puffs two
    big round masses at the back of the crown either side, run into it.
    The earrings are round drops at the lobes in her accent colour, their
    own mesh (`accessory:earrings`), so they show when her look says so.
    Both in fine fields of their own, riding the head."""
    V, sc = fx.V, fx.sc
    lo, hi = (-0.15, -0.14, 1.76), (0.12, 0.14, 2.08)
    hair = sc.Field(lo=lo, hi=hi, h=0.0013)
    X, Y, Z = _grid(hair)
    P = np.stack(np.broadcast_arrays(X, Y, Z), axis=-1).reshape(-1, 3)
    hair.d = (fx.F.sample(P).reshape(hair.d.shape) - 0.0025).astype(np.float32)
    front = 1.886 + 0.006 * np.clip((np.abs(Y) - 0.03) / 0.04, 0, 1)
    t = np.clip((X + 0.005) / 0.06, 0, 1)
    side = 1.808 - 0.03 * np.clip(-X / 0.1, 0, 1)
    hair.d = np.maximum(hair.d, side + (front - side) * (t * t * (3 - 2 * t)) - Z).astype(np.float32)
    for s in (1, -1):
        hair.cut(sc.Ellipsoid(V(-0.006, s * 0.08, 1.826), (0.028, 0.028, 0.04)), 0.004)
        # a puff, set back and low on the crown and run into the hair (high
        # and round on either side, the two read from the front as a pair of
        # cartoon ears)
        hair.add(sc.Ellipsoid(V(-0.052, s * 0.046, 1.948), (0.05, 0.044, 0.042), sc.rot(rx=s * 18)), 0.026)
    obj = sc.to_blender('hair:puffs', *hair.mesh(), smooth=1)
    obj.data.materials.append(fx.material('hair', (0.004, 0.003, 0.006, 1)))

    rings = sc.Field(lo=(-0.03, -0.11, 1.76), hi=(0.02, 0.11, 1.81), h=0.0008)
    for s in (1, -1):
        rings.add(sc.Ellipsoid(V(-0.004, s * 0.086, 1.787), (0.0095, 0.0055, 0.0095)), 0.0)
        rings.add(sc.RoundCone(V(-0.004, s * 0.085, 1.799), V(-0.004, s * 0.086, 1.79), 0.002, 0.002), 0.001)
    ear = sc.to_blender('accessory:earrings', *rings.mesh(), smooth=1)
    ear.data.materials.append(fx.material('accent', (0.09, 1.0, 0.25, 1)))
    return [(obj, [hair]), (ear, [])]


def _grid(f):
    ax = [f.lo[k] + np.arange(f.n[k]) * f.h for k in range(3)]
    return (ax[0][:, None, None].astype(np.float32), ax[1][None, :, None].astype(np.float32),
            ax[2][None, None, :].astype(np.float32))
