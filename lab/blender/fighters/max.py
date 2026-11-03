"""Adam Weumann (id max), the second fighter of the remodel (November 2026).

His head is an original face built to the character notes in
data/fighters.js: manic, brows up and apart, eyes wide, a wide loose mouth, a
heavy jaw; a man enjoying the fire. Not a likeness: the man he parodies is
named, never drawn. Where Jeff's face is shut (a heavy level brow, narrow
deep-set eyes, a flat nose, a square jaw), his is open: a high rounded
forehead, a light brow ridge arched high, big eyes set shallow, high
cheekbones, a long nose with a bump, a wide full mouth, and a long heavy jaw
ending in a round chin with a cleft.

As for Jeff: head 0.265 tall in Jeff's space (the pipeline sizes it to his
frame), only the forms sculpted, the eyes, brows, mouth and stubble painted
in game. He wears his cap backwards over short dark hair (`headwear`).
"""

import numpy as np

EYE_Z, EYE_Y = 1.828, 0.034


def head(fx):
    E, C, V, sc, F = fx.E, fx.C, fx.V, fx.sc, fx.F
    # The jaw first, met tightly by the neck (see Jeff's): long and heavy, its
    # angles set wide, rounder than Jeff's square one.
    E(V(0.024, 0, 1.732), (0.08, 0.058, 0.05), k=0.012)
    for s in (1, -1):
        E(V(-0.012, s * 0.054, 1.728), (0.024, 0.02, 0.03), k=0.018)
    E(V(-0.012, 0, 1.865), (0.102, 0.08, 0.1), k=0.02)                            # cranium
    E(V(0.05, 0, 1.885), (0.05, 0.064, 0.058), k=0.03)                            # a high, rounded forehead
    E(V(0.044, 0, 1.8), (0.055, 0.064, 0.085), k=0.03)                            # the face's mass
    for s in (1, -1):
        E(V(0.0, s * 0.056, 1.765), (0.024, 0.008, 0.03), k=0.03)                # chewing muscle
        E(V(0.068, s * 0.052, 1.812), (0.018, 0.024, 0.012), k=0.025)            # high cheekbones
        E(V(0.058, s * 0.046, 1.772), (0.018, 0.022, 0.026), k=0.03)             # the cheek under them
    # The brow: a light ridge, arched and lifted, the brows always up.
    for s in (1, -1):
        C(V(0.089, s * 0.012, 1.856), V(0.074, s * 0.056, 1.862), 0.009, 0.007, k=0.018)
    # Shallow sockets and big eyes set forward in them, the upper lids thin
    # and high: the stare is carved, as Jeff's narrowed look is.
    # The sockets are carved under the brow only, and a lower lid fills in
    # under each eye: carved lower, the hollow at the inner corner went black
    # in the game's light, a pit beside the nose.
    for s in (1, -1):
        F.cut(sc.Ellipsoid(V(0.097, s * EYE_Y, EYE_Z + 0.006), (0.013, 0.02, 0.009)), 0.01)
    for s in (1, -1):
        E(V(0.077, s * EYE_Y, EYE_Z), (0.0145, 0.0145, 0.0145), k=0.004)          # eyeball
        E(V(0.082, s * EYE_Y, EYE_Z + 0.009), (0.009, 0.015, 0.004), k=0.005)    # a thin upper lid
        E(V(0.083, s * EYE_Y, EYE_Z - 0.011), (0.008, 0.017, 0.006), k=0.008)   # the lower lid, into the cheek
    # A long nose with a bump on the bridge, set on broad side planes that run
    # out under the eyes: standing off the face in a tight crease, its sides
    # let the ink outline through as black wedges from the eyes to the nostrils.
    E(V(0.092, 0, 1.812), (0.014, 0.024, 0.028), k=0.02)
    C(V(0.097, 0, 1.848), V(0.118, 0, 1.787), 0.007, 0.0095, k=0.018)
    E(V(0.106, 0, 1.824), (0.006, 0.007, 0.008), k=0.006)
    E(V(0.116, 0, 1.783), (0.011, 0.012, 0.01), k=0.01)
    for s in (1, -1):
        E(V(0.101, s * 0.014, 1.779), (0.008, 0.0075, 0.007), k=0.008)            # nostril wings
    # A wide mouth with full lips, and a round, strong chin.
    E(V(0.07, 0, 1.75), (0.026, 0.046, 0.03), k=0.03)
    E(V(0.094, 0, 1.748), (0.006, 0.026, 0.005), k=0.008)
    E(V(0.092, 0, 1.734), (0.008, 0.023, 0.006), k=0.008)
    E(V(0.083, 0, 1.704), (0.016, 0.026, 0.016), k=0.02)
    for s in (1, -1):
        E(V(-0.006, s * 0.084, 1.825), (0.022, 0.011, 0.03), sc.rot(ry=-10), k=0.01)  # ear
        F.cut(sc.Ellipsoid(V(-0.002, s * 0.093, 1.82), (0.009, 0.006, 0.013)), 0.004)


def head_definition(fx):
    G, LINE, SOFT = fx.F.groove, fx.LINE, fx.SOFT
    G([(0.1, -0.026, 1.742), (0.106, 0, 1.741), (0.1, 0.026, 1.742)], **LINE)    # where the lips meet
    G([(0.098, 0, 1.712), (0.099, 0, 1.698)], **SOFT)                           # the cleft in his chin


def headwear(fx):
    """His cap, backwards, over short dark hair: [(object, fields it covers)].

    The cap is a crown a little proud of his skull, cut level at a band round
    the forehead and back of the head, a stiff brim out over the nape (it is
    on backwards) and a button on top,
    in the 2D cap's colours (`suit2`, the button `accent`). Under it, his hair
    is the skull's own surface pushed out a few millimetres, cut to a line
    above the ears and at the nape and kept off his face. Both are built in
    fine fields of their own and ride the head, as the shades do."""
    import bpy
    V, sc = fx.V, fx.sc
    lo, hi = (-0.25, -0.115, 1.74), (0.15, 0.115, 2.0)
    cap = sc.Field(lo=lo, hi=hi, h=0.0015)
    cap.add(sc.Ellipsoid(V(-0.012, 0, 1.868), (0.111, 0.089, 0.11)), 0.0)
    cap.add(sc.Ellipsoid(V(0.05, 0, 1.887), (0.059, 0.073, 0.066)), 0.02)
    # cut level at the band: across the forehead at 1.872, dipping to 1.85 behind
    X, Y, Z = _grid(cap)
    cap.d = np.maximum(cap.d, (1.861 + 0.011 * np.clip(X / 0.1, -1, 1)) - Z).astype(np.float32)
    # the brim, a stiff half-oval out over the back of the neck, tipped down:
    # thinner, flat and level, it read as a blade stuck in his head
    cap.add(sc.Ellipsoid(V(-0.13, 0, 1.851), (0.075, 0.072, 0.0065), sc.rot(ry=-10)), 0.008)
    crown = fx.sc.to_blender('cap', *cap.mesh(), smooth=1)
    btn = sc.Field(lo=(-0.03, -0.02, 1.95), hi=(0.01, 0.02, 1.995), h=0.0012)
    btn.add(sc.Ellipsoid(V(-0.012, 0, 1.977), (0.009, 0.009, 0.006)), 0.0)
    button = fx.sc.to_blender('button', *btn.mesh(), smooth=1)

    hair = sc.Field(lo=lo, hi=hi, h=0.0015)
    hair.add(sc.Ellipsoid(V(-0.012, 0, 1.865), (0.106, 0.084, 0.104)), 0.0)
    X, Y, Z = _grid(hair)
    keep = np.maximum(np.maximum(
        1.788 + 0.03 * np.clip(-X / 0.08, 0, 1) - Z,         # down to above the ears, the nape lower
        X - 0.035),                                         # off the face: sideburns at most
        Z - 1.875)                                          # into the cap
    hair.d = np.maximum(hair.d, keep).astype(np.float32)
    # clear of the ears
    for s in (1, -1):
        hair.cut(sc.Ellipsoid(V(-0.006, s * 0.084, 1.825), (0.03, 0.03, 0.04)), 0.004)
    fuzz = fx.sc.to_blender('hair', *hair.mesh(), smooth=1)

    for ob, role, colour in ((crown, 'suit2', (0.64, 0.09, 0.0, 1)), (button, 'accent', (1.0, 0.65, 0.02, 1)),
                             (fuzz, 'hair', (0.04, 0.025, 0.012, 1))):
        ob.data.materials.append(fx.material(role, colour))
    objs = [crown, button, fuzz]
    with bpy.context.temp_override(active_object=crown, selected_editable_objects=objs, selected_objects=objs):
        bpy.ops.object.join()
    crown.name = crown.data.name = 'hair:cap'
    return [(crown, [cap, hair])]


def _grid(f):
    ax = [f.lo[k] + np.arange(f.n[k]) * f.h for k in range(3)]
    return (ax[0][:, None, None].astype(np.float32), ax[1][None, :, None].astype(np.float32),
            ax[2][None, None, :].astype(np.float32))

