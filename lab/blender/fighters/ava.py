"""Lizbeth Holmez (id ava), the seventh fighter of the remodel and the first
woman (November 2026).

Her head is an original face built to the character notes in
data/fighters.js: the stare, the only fighter whose lids are raised, brows
high and flat, pupils wide, the mouth a flat line; unblinking conviction.
Not a likeness: the woman she parodies is named, never drawn.

A slim, even face on a woman's narrower jaw: a smooth forehead, a light brow
ridge set high and level, big eyes set shallow under thin lids raised high
(the stare is carved, as Adam's is), high cheekbones, a straight narrow nose,
an even mouth and a narrow, defined chin; small ears. Her pale blonde hair is
pulled back tight into a ponytail (`headwear`), and she wears her visor, a
band of cyan glass across the eyes, as in 2D (`eyewear`).

As for Jeff: head 0.265 tall in Jeff's space, only the forms sculpted, the
eyes, brows and mouth painted in game, seen through the visor.
"""

import numpy as np

EYE_Z, EYE_Y = 1.828, 0.033


def head(fx):
    E, C, V, sc, F = fx.E, fx.C, fx.V, fx.sc, fx.F
    # The jaw first, met tightly by the neck (see Jeff's): narrow, its angles
    # set in, a woman's.
    E(V(0.026, 0, 1.736), (0.07, 0.05, 0.046), k=0.012)
    for s in (1, -1):
        E(V(-0.012, s * 0.046, 1.732), (0.02, 0.016, 0.026), k=0.02)
    E(V(-0.014, 0, 1.866), (0.1, 0.078, 0.1), k=0.02)                             # cranium
    E(V(0.048, 0, 1.884), (0.05, 0.062, 0.058), k=0.03)                           # a smooth forehead
    E(V(0.044, 0, 1.802), (0.052, 0.06, 0.08), k=0.03)                            # the face's mass
    for s in (1, -1):
        E(V(0.0, s * 0.05, 1.766), (0.02, 0.007, 0.028), k=0.03)                 # chewing muscle, slight
        E(V(0.066, s * 0.05, 1.812), (0.017, 0.022, 0.011), k=0.025)             # high cheekbones
        E(V(0.058, s * 0.043, 1.773), (0.018, 0.021, 0.024), k=0.03)             # the cheek under them
    # The brow: light, set high and level.
    for s in (1, -1):
        C(V(0.088, s * 0.012, 1.86), V(0.075, s * 0.054, 1.862), 0.0065, 0.0055, k=0.02)
    # Shallow sockets and big eyes set forward, the upper lids thin and raised
    # high: the stare, carved (see Adam's), a lower lid filling in under each.
    for s in (1, -1):
        F.cut(sc.Ellipsoid(V(0.097, s * EYE_Y, EYE_Z + 0.007), (0.013, 0.02, 0.009)), 0.01)
    for s in (1, -1):
        E(V(0.077, s * EYE_Y, EYE_Z), (0.015, 0.015, 0.015), k=0.004)            # eyeball
        E(V(0.082, s * EYE_Y, EYE_Z + 0.01), (0.009, 0.015, 0.0035), k=0.005)    # a thin upper lid, raised
        E(V(0.083, s * EYE_Y, EYE_Z - 0.012), (0.008, 0.017, 0.006), k=0.008)    # the lower lid, into the cheek
    # A straight, narrow nose on side planes (see Adam's).
    E(V(0.091, 0, 1.81), (0.013, 0.026, 0.03), k=0.022)
    C(V(0.095, 0, 1.848), V(0.113, 0, 1.791), 0.0062, 0.0078, k=0.018)
    E(V(0.112, 0, 1.787), (0.0092, 0.0102, 0.0088), k=0.01)
    for s in (1, -1):
        E(V(0.1, s * 0.0128, 1.781), (0.0068, 0.0068, 0.0062), k=0.008)          # nostril wings
    # An even mouth, and a narrow, defined chin.
    E(V(0.07, 0, 1.752), (0.024, 0.036, 0.027), k=0.03)
    E(V(0.092, 0, 1.75), (0.0045, 0.018, 0.0038), k=0.008)
    E(V(0.09, 0, 1.739), (0.006, 0.016, 0.005), k=0.008)
    E(V(0.08, 0, 1.708), (0.015, 0.02, 0.016), k=0.02)
    for s in (1, -1):
        E(V(-0.006, s * 0.08, 1.826), (0.02, 0.01, 0.028), sc.rot(ry=-10), k=0.01)      # small ears
        F.cut(sc.Ellipsoid(V(-0.002, s * 0.088, 1.822), (0.008, 0.005, 0.012)), 0.004)


def head_definition(fx):
    G, LINE = fx.F.groove, fx.LINE
    G([(0.096, -0.018, 1.7445), (0.1, 0, 1.744), (0.096, 0.018, 1.7445)], **LINE)   # where the lips meet


def eyewear(fx):
    """Her visor (fx.visor): a band of cyan glass across the eyes from temple
    to temple, clear of the nose, the painted eyes showing through it,
    ending in front of the ears (wider and wrapping further, it stood out
    past her temples like a pair of goggles)."""
    return fx.visor(centre=(-0.004, 0.0, EYE_Z + 0.002), radii=(0.124, 0.086), half_height=0.017, back=0.0)


def headwear(fx):
    """Her pale blonde hair, pulled back tight into a ponytail: [(object,
    fields it covers)]. Her own head's surface (sampled from the body's
    field, as the men's hair is) pushed out a couple of millimetres and cut to
    the hairline, round the ears and at the nape, smooth (the comb's lines
    through it, as the men's have, inked as black specks on hair this
    pale); a tie at the back of the crown, and the tail from it falling
    down the back of the neck, thick at the tie and tapering. In a fine
    field of its own, riding the head."""
    V, sc = fx.V, fx.sc
    lo, hi = (-0.2, -0.11, 1.56), (0.12, 0.11, 2.0)
    hair = sc.Field(lo=lo, hi=hi, h=0.0013)
    X, Y, Z = _grid(hair)
    P = np.stack(np.broadcast_arrays(X, Y, Z), axis=-1).reshape(-1, 3)
    hair.d = (fx.F.sample(P).reshape(hair.d.shape) - 0.0025).astype(np.float32)
    front = 1.888 + 0.006 * np.clip((np.abs(Y) - 0.03) / 0.04, 0, 1)
    t = np.clip((X + 0.005) / 0.06, 0, 1)
    side = 1.808 - 0.03 * np.clip(-X / 0.1, 0, 1)
    hair.d = np.maximum(hair.d, side + (front - side) * (t * t * (3 - 2 * t)) - Z).astype(np.float32)
    for s in (1, -1):
        hair.cut(sc.Ellipsoid(V(-0.006, s * 0.08, 1.826), (0.028, 0.028, 0.04)), 0.004)
    # the tie, and the tail falling from it
    hair.add(sc.Ellipsoid(V(-0.106, 0, 1.878), (0.018, 0.024, 0.02)), 0.006)
    # round in section and joined end to end without a blend: flattened, each
    # length kinked against the next, and blended, each join bulged, and
    # either way the tail read as a string of beads
    tail = [V(-0.112, 0, 1.874), V(-0.128, 0, 1.832), V(-0.132, 0, 1.77), V(-0.126, 0, 1.705), V(-0.116, 0, 1.645)]
    radii = [0.021, 0.022, 0.018, 0.012, 0.006]
    for a, b, r1, r2 in zip(tail, tail[1:], radii, radii[1:]):
        hair.add(sc.RoundCone(a, b, r1, r2), 0.0)
    obj = sc.to_blender('hair:ponytail', *hair.mesh(), smooth=1)
    obj.data.materials.append(fx.material('hair', (0.8, 0.72, 0.53, 1)))
    return [(obj, [hair])]


def _grid(f):
    ax = [f.lo[k] + np.arange(f.n[k]) * f.h for k in range(3)]
    return (ax[0][:, None, None].astype(np.float32), ax[1][None, :, None].astype(np.float32),
            ax[2][None, None, :].astype(np.float32))
