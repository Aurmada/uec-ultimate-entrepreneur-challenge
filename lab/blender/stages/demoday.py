# DEMO DAY: the main stage of a startup conference, laid out like drawDemoDay
# in src/data/arenas.js (a giant LED screen behind the fighters, painted live by
# the game, lighting truss around it, sponsor screens on the speaker stacks).
# The crowd in front, the sweeping spotlights and the confetti stay procedural.
# Built by lab/blender/build_stage.py; units and axes are described there.
import math


def build(kit):
    m = kit.mat
    kit.sky('#140a2e', 0.6)
    kit.exposure(0.3)

    STEEL = m('#8c93a8', 0.35, 0.9)
    BLACK = m('#0b0a12', 0.5)

    # ---- the deck the fighters stand on, and the drapes behind everything
    kit.box((0, 1.0, -0.05), (22, 12.0, 0.1), m('#24123f', 0.35))
    kit.box((0, -2.6, -0.06), (22, 0.12, 0.02), m('#ff3d6e', 0.4, emit='#ff3d6e', strength=2.0, glow=False))  # deck edge strip
    DRAPE = m('#3a1766', 0.9)
    for i in range(64):                                           # folds
        x = -12.8 + i * 0.4
        kit.cylinder((x, 6.4 + 0.08 * math.sin(i * 1.7), 3.6), 0.23, 7.4, DRAPE, verts=12)

    # ---- the LED wall (live), framed, on a truss
    kit.box((0, 5.08, 3.85), (8.9, 0.12, 4.05), BLACK, 0.02)
    kit.screen('main', (0, 5.0, 3.85), (8.5, 3.65), '#1c1040')

    def truss(a, b, size=0.28, bars=10):
        """A square truss from a to b (axis-aligned), with a ladder of rungs."""
        axis = 0 if a[0] != b[0] else 2
        length = abs(b[axis] - a[axis])
        mid = [(a[k] + b[k]) / 2 for k in range(3)]
        for dy in (-size / 2, size / 2):
            for dz in (-size / 2, size / 2):
                c = list(mid)
                if axis == 0:
                    c[1] += dy; c[2] += dz
                    kit.box(c, (length, 0.04, 0.04), STEEL)
                else:
                    c[0] += dy; c[1] += dz
                    kit.box(c, (0.04, 0.04, length), STEEL)
        for i in range(bars + 1):
            c = list(a)
            c[axis] = a[axis] + (b[axis] - a[axis]) * i / bars
            if axis == 0:
                kit.box((c[0], c[1], c[2]), (0.03, size, size), STEEL)
            else:
                kit.box((c[0], c[1], c[2]), (size, size, 0.03), STEEL)

    for x in (-5.3, 5.3):
        truss((x, 4.6, 0), (x, 4.6, 6.1), bars=18)
    truss((-5.3, 4.6, 5.95), (5.3, 4.6, 5.95), bars=28)

    # moving heads along the top truss, lenses lit
    COLS = ['#ff3d6e', '#29d9ff', '#ffd23f', '#29d9ff', '#ff3d6e', '#29d9ff', '#ffd23f', '#29d9ff', '#ff3d6e']
    for i, col in enumerate(COLS):
        x = -4.4 + i * 1.1
        kit.box((x, 4.35, 5.6), (0.34, 0.3, 0.36), BLACK, 0.04)
        kit.cylinder((x, 4.18, 5.55), 0.11, 0.04, m(col, 0.3, emit=col, strength=3.0), rot=(math.radians(90), 0, 0))

    # ---- speaker stacks with the sponsor screens on top (live)
    for side in (-1, 1):
        x = side * 5.86
        kit.box((x, 4.5, 0.5), (1.9, 0.9, 1.0), BLACK, 0.03)
        for cx in (-0.45, 0.45):
            kit.cylinder((x + cx, 4.04, 0.5), 0.32, 0.03, m('#1a1a24', 0.6), rot=(math.radians(90), 0, 0))
        kit.box((x, 4.52, 1.32), (2.08, 0.1, 0.82), BLACK, 0.02)
        kit.screen('left' if side < 0 else 'right', (x, 4.46, 1.32), (1.98, 0.67))

    # ---- podium for the pitch, off to the side of the lane
    kit.box((3.9, 3.2, 0.55), (0.8, 0.55, 1.1), m('#1d1636', 0.4), 0.03)
    kit.box((3.9, 2.9, 0.75), (0.62, 0.02, 0.3), m('#ffd23f', 0.4, emit='#ffd23f', strength=1.2, glow=False))

    # ---- light: magenta and cyan washes on the drapes, a warm key on the deck
    kit.light('AREA', (-7.5, 3.0, 5.5), 1500, '#ff3d9a', 4.0, rot=(math.radians(-60), math.radians(-35), 0))
    kit.light('AREA', (7.5, 3.0, 5.5), 1500, '#29d9ff', 4.0, rot=(math.radians(-60), math.radians(35), 0))
    kit.light('AREA', (0, -6, 6.0), 900, '#ffe6d0', 12.0, rot=(math.radians(50), 0, 0))
    kit.light('POINT', (0, 3.8, 3.8), 400, '#7b5cff', 3.0, shadow=False)          # spill off the LED wall
