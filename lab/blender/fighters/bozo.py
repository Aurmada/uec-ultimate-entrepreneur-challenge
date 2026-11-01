"""Jeff Bozo (id bozo), the first fighter of the remodel (November 2026).

His head is an original face built to the character notes in data/fighters.js:
hard flat brows, narrow eyes, a wide set jaw, nothing about it worried. Not a
likeness: the man he parodies is named, never drawn.

Head 0.265 tall, the eyes halfway down it (1.825), the face in the usual
thirds: brow to the base of the nose (1.778), nose to chin (1.69). Only the
forms are sculpted; the eyes, brow hair and mouth are painted on in game by a
painter made for this head (src/engine/gl3d/faces3d.js), which is what lets
them change with his expression.
"""

EYE_Z, EYE_Y = 1.825, 0.033


def head(fx):
    E, C, V, sc, F = fx.E, fx.C, fx.V, fx.sc, fx.F
    # The jaw goes on before the rest, met tightly by the neck, so the neck runs
    # up under it with a line where they meet: blended broadly, the face melted
    # down into the throat and the neck seemed to carry on into the chin.
    E(V(0.022, 0, 1.736), (0.08, 0.062, 0.046), k=0.012)                          # the jaw, wide set
    for s in (1, -1):
        E(V(-0.014, s * 0.056, 1.732), (0.022, 0.018, 0.026), k=0.018)           # its angles
    E(V(-0.01, 0, 1.86), (0.1, 0.082, 0.097), k=0.02)                             # cranium
    E(V(0.042, 0, 1.8), (0.055, 0.066, 0.08), k=0.03)                             # the face's mass
    for s in (1, -1):
        E(V(0.0, s * 0.056, 1.765), (0.024, 0.008, 0.03), k=0.03)                # chewing muscle over the jaw
        E(V(0.063, s * 0.05, 1.806), (0.02, 0.022, 0.012), k=0.025)             # cheekbone
        E(V(0.055, s * 0.046, 1.772), (0.02, 0.022, 0.026), k=0.03)              # the cheek, a plane under it, not a hollow
    # The brow: one heavy, level shelf, the painted brows sit along its lower edge.
    for s in (1, -1):
        E(V(0.08, s * 0.031, 1.852), (0.016, 0.036, 0.015), k=0.022)
    E(V(0.088, 0, 1.849), (0.01, 0.016, 0.013), k=0.016)
    # Sockets under it, then the eyes set back in them under heavy lids: the
    # narrowed look is carved, so it holds whatever the painted eye is doing.
    # The hollow is under the brow, not the eye: carved lower, it read as bags
    # under his eyes and made him look tired.
    for s in (1, -1):
        F.cut(sc.Ellipsoid(V(0.095, s * EYE_Y, EYE_Z + 0.004), (0.016, 0.02, 0.01)), 0.012)
    for s in (1, -1):
        E(V(0.074, s * EYE_Y, EYE_Z), (0.0135, 0.0135, 0.0135), k=0.004)          # eyeball
        E(V(0.078, s * EYE_Y, EYE_Z + 0.005), (0.011, 0.016, 0.006), k=0.006)    # heavy upper lid
    # A broad, straight nose, a little flattened: he has been hit before.
    C(V(0.096, 0, 1.842), V(0.113, 0, 1.79), 0.0085, 0.011, k=0.012)
    E(V(0.112, 0, 1.785), (0.012, 0.0145, 0.011), k=0.01)
    for s in (1, -1):
        E(V(0.099, s * 0.015, 1.779), (0.009, 0.008, 0.008), k=0.008)            # nostril wings
    # The mouth: the barrel it sits on, two firm lips, and a square chin.
    E(V(0.068, 0, 1.75), (0.026, 0.04, 0.028), k=0.03)
    E(V(0.091, 0, 1.746), (0.006, 0.022, 0.005), k=0.008)
    E(V(0.089, 0, 1.733), (0.007, 0.019, 0.005), k=0.008)
    F.add(sc.Box(V(0.081, 0, 1.706), (0.013, 0.025, 0.012), 0.013), 0.022)     # square, not a ball in profile
    for s in (1, -1):
        E(V(-0.006, s * 0.084, 1.825), (0.022, 0.011, 0.03), sc.rot(ry=-10), k=0.01)  # ear
        F.cut(sc.Ellipsoid(V(-0.002, s * 0.093, 1.82), (0.009, 0.006, 0.013)), 0.004)  # and its bowl


def head_definition(fx):
    # where the lips meet: a face line, carved the same on any build
    fx.F.groove([(0.098, -0.022, 1.74), (0.104, 0, 1.739), (0.098, 0.022, 1.74)], **fx.LINE)


def eyewear(fx):
    """His shades (the owner: keep them): two wraparound lenses on a bar
    across the brow, a bridge on the nose and arms back to the ears. The bar
    sits under the painted brows, so his brows still carry his expression
    above it and his mouth below."""
    V = fx.V
    bar = [V(0.08, -0.062, 1.834), V(0.1, -0.034, 1.837), V(0.107, 0, 1.835), V(0.1, 0.034, 1.837), V(0.08, 0.062, 1.834)]
    return fx.shades(lens_c=(0.104, 0.031, 1.822), lens_r=(0.0028, 0.025, 0.0135), lens_turn=18,
                     bar=bar, bridge=(V(0.107, -0.008, 1.828), V(0.107, 0.008, 1.828)),
                     arm_from=(0.08, 0.062, 1.834), arm_to=(-0.012, 0.09, 1.826))
