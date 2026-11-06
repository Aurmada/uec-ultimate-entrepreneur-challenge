"""Carl Icahnt (id dex), the third fighter of the remodel (November 2026).

His head is an original face built to the character notes in
data/fighters.js: a predator, the lowest and heaviest brow in the cast, eyes
down to slits, a mouth that is a thin hard line, already valuing the parts
of you; a bull neck and jowls, gone to seed. Not a likeness: the man he
parodies is named, never drawn.

An older man's heavy face: a broad skull, a low shelf of brow over deep-set,
heavy-lidded eyes with bags under them, a big fleshy nose, deep folds from
its wings to the corners of a thin, pressed mouth, jowls hanging at the jaw
line, and large ears. The fat the pipeline lays on (his `belly`) gives him
the bull neck and the second chin. His silver hair is combed straight back
off a receding hairline (`headwear`), and he wears shades, as in 2D.

Pushed further on 2026-11-06, when the nine faces read too alike: heavier
jowls. A bigger nose and ears were tried and taken back: with the bushy
brows they drew the usual caricature of the man he parodies.

As for Jeff: head 0.265 tall in Jeff's space, only the forms sculpted, the
eyes, brows and mouth painted in game, mostly behind the shades.
"""

import numpy as np

EYE_Z, EYE_Y = 1.822, 0.034


def head(fx):
    E, C, V, sc, F = fx.E, fx.C, fx.V, fx.sc, fx.F
    # The jaw first, met tightly by the neck (see Jeff's): wide and heavy.
    E(V(0.02, 0, 1.732), (0.082, 0.066, 0.05), k=0.012)
    for s in (1, -1):
        E(V(-0.016, s * 0.058, 1.728), (0.024, 0.02, 0.03), k=0.018)
    E(V(-0.012, 0, 1.86), (0.1, 0.083, 0.096), k=0.02)                            # cranium
    E(V(0.042, 0, 1.8), (0.056, 0.068, 0.08), k=0.03)                             # the face's mass
    for s in (1, -1):
        E(V(0.0, s * 0.058, 1.765), (0.024, 0.009, 0.03), k=0.03)                # chewing muscle
        E(V(0.06, s * 0.048, 1.775), (0.024, 0.026, 0.03), k=0.03)               # heavy cheeks
        E(V(0.046, s * 0.055, 1.714), (0.034, 0.031, 0.034), k=0.03)             # the jowls, hanging at the jaw line
    # The brow: the lowest and heaviest in the cast, one shelf right across.
    for s in (1, -1):
        E(V(0.083, s * 0.032, 1.846), (0.018, 0.038, 0.016), k=0.022)
    E(V(0.09, 0, 1.842), (0.012, 0.018, 0.014), k=0.016)
    # Deep sockets under it, small eyes under heavy lids, bags beneath.
    for s in (1, -1):
        F.cut(sc.Ellipsoid(V(0.095, s * EYE_Y, EYE_Z + 0.004), (0.015, 0.02, 0.009)), 0.012)
    for s in (1, -1):
        E(V(0.074, s * EYE_Y, EYE_Z), (0.013, 0.013, 0.013), k=0.004)            # eyeball
        E(V(0.079, s * EYE_Y, EYE_Z + 0.004), (0.011, 0.016, 0.007), k=0.006)    # the heavy upper lid
        E(V(0.08, s * EYE_Y, EYE_Z - 0.011), (0.009, 0.017, 0.006), k=0.008)     # and the bag under it
    # A big, fleshy nose.
    C(V(0.095, 0, 1.84), V(0.112, 0, 1.788), 0.009, 0.012, k=0.016)
    E(V(0.115, 0, 1.782), (0.015, 0.017, 0.014), k=0.012)
    for s in (1, -1):
        E(V(0.101, s * 0.018, 1.777), (0.01, 0.01, 0.009), k=0.008)              # nostril wings
    # A thin, pressed mouth on its barrel, and a heavy chin.
    E(V(0.068, 0, 1.75), (0.026, 0.042, 0.028), k=0.03)
    E(V(0.092, 0, 1.746), (0.004, 0.022, 0.0035), k=0.008)
    E(V(0.09, 0, 1.737), (0.005, 0.02, 0.004), k=0.008)
    E(V(0.08, 0, 1.705), (0.017, 0.03, 0.017), k=0.022)
    for s in (1, -1):
        E(V(-0.006, s * 0.086, 1.822), (0.024, 0.012, 0.034), sc.rot(ry=-10), k=0.01)  # large ears
        F.cut(sc.Ellipsoid(V(-0.002, s * 0.095, 1.818), (0.01, 0.006, 0.015)), 0.004)


def head_definition(fx):
    G, LINE, SOFT = fx.F.groove, fx.LINE, fx.SOFT
    G([(0.096, -0.022, 1.7415), (0.101, 0, 1.741), (0.096, 0.022, 1.7415)], **LINE)    # where the lips meet
    for s in (1, -1):
        # the folds from the nose's wings to the corners of the mouth
        G([(0.104, s * 0.024, 1.776), (0.098, s * 0.03, 1.758), (0.09, s * 0.03, 1.738)], **SOFT)


def eyewear(fx):
    """His shades, as Jeff's are made (fx.shades), set on his lower brow and
    his ears."""
    V = fx.V
    bar = [V(0.08, -0.062, 1.83), V(0.1, -0.034, 1.833), V(0.107, 0, 1.831), V(0.1, 0.034, 1.833), V(0.08, 0.062, 1.83)]
    return fx.shades(lens_c=(0.104, 0.032, 1.818), lens_r=(0.0028, 0.025, 0.0125), lens_turn=18,
                     bar=bar, bridge=(V(0.107, -0.008, 1.824), V(0.107, 0.008, 1.824)),
                     arm_from=(0.08, 0.062, 1.83), arm_to=(-0.012, 0.092, 1.822))


def headwear(fx):
    """His silver hair, combed straight back off a receding hairline:
    [(object, fields it covers)]. His own head's surface (sampled from the
    body's field, so it fits whatever the head is) pushed out a few
    millimetres, cut to the hairline (high at the temples), above the ears
    and at the nape, with the comb's lines running back through it. Laid on
    a skull of its own, with volume added behind, it stood off his head like
    a helmet and its cut front edge was a step. In a fine field of its own,
    riding the head."""
    V, sc = fx.V, fx.sc
    lo, hi = (-0.14, -0.11, 1.76), (0.12, 0.11, 1.98)
    hair = sc.Field(lo=lo, hi=hi, h=0.0012)
    X, Y, Z = _grid(hair)
    P = np.stack(np.broadcast_arrays(X, Y, Z), axis=-1).reshape(-1, 3)
    hair.d = (fx.F.sample(P).reshape(hair.d.shape) - 0.0035).astype(np.float32)
    hairline = 1.89 + 0.03 * np.clip((np.abs(Y) - 0.02) / 0.05, 0, 1)             # receding: higher at the temples
    keep = np.maximum(np.maximum(
        np.where(X > 0.0, hairline - Z, np.float32(-1)),                         # the hairline, at the front
        1.79 + 0.04 * np.clip(-X / 0.08, 0, 1) - Z),                             # above the ears, the nape lower
        X - 0.075)
    hair.d = np.maximum(hair.d, keep).astype(np.float32)
    for s in (1, -1):
        hair.cut(sc.Ellipsoid(V(-0.006, s * 0.086, 1.822), (0.032, 0.03, 0.045)), 0.004)
    # the comb's lines, from the hairline back over the crown
    for y in (-0.036, -0.012, 0.012, 0.036):
        hair.groove([(0.06, y, 1.92), (0.0, y * 1.1, 1.955), (-0.07, y * 1.15, 1.93), (-0.11, y * 1.1, 1.86)],
                    depth=0.001, width=0.0025, k=0.0015)
    obj = sc.to_blender('hair:slick', *hair.mesh(), smooth=1)
    obj.data.materials.append(fx.material('hair', (0.48, 0.5, 0.55, 1)))
    return [(obj, [hair])]


def _grid(f):
    ax = [f.lo[k] + np.arange(f.n[k]) * f.h for k in range(3)]
    return (ax[0][:, None, None].astype(np.float32), ax[1][None, :, None].astype(np.float32),
            ax[2][None, None, :].astype(np.float32))
