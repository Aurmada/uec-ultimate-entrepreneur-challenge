# THE UNICORN CLUB: a members-only nightclub, laid out like drawUnicornClub in
# src/data/arenas.js (neon rainbow arcs behind the fighters, the neon unicorn
# sign above them, sponsor screens at either side, a lit dance floor). The
# sponsor screens are painted live by the game and the sparkles stay procedural.
# Built by lab/blender/build_stage.py; units and axes are described there.
import math


def build(kit):
    m = kit.mat
    kit.sky('#12041f', 0.5)
    kit.exposure(0.25)

    WALL = m('#1f0933', 0.8)
    BLACK = m('#0a0610', 0.45)

    # ---- the room: back wall, LED strips down it, a glossy dance floor of tiles
    kit.box((0, 5.3, 3.4), (22, 0.3, 7.2), WALL)
    for x in (-7.4, -6.6, 6.6, 7.4):
        kit.box((x, 5.1, 3.4), (0.06, 0.04, 7.2), m('#7b5cff', 0.3, emit='#7b5cff', strength=2.0))
    kit.box((0, 1.0, -0.06), (24, 12.0, 0.1), BLACK)
    HUES = ['#ff3d6e', '#7b5cff', '#29d9ff', '#57ff8a', '#ffd23f', '#ff9d1a']
    for gx in range(-11, 12):
        for gy in range(-4, 6):
            col = HUES[(gx * 3 + gy * 2) % len(HUES)]
            kit.box((gx * 0.9, gy * 0.9 + 0.45, -0.005), (0.84, 0.84, 0.01),
                    m('#120a1c', 0.25, emit=col, strength=0.06))

    # ---- neon rainbow arcs on the back wall
    cols = ['#ff3d6e', '#ff9d1a', '#ffd23f', '#57ff8a', '#29d9ff', '#7b5cff']
    for i, col in enumerate(cols):
        r = 4.87 - i * 0.395
        pts = [(r * math.cos(math.radians(a)), 5.1, r * math.sin(math.radians(a))) for a in range(14, 167, 8)]
        kit.tube(pts, 0.06, m(col, 0.3, emit=col, strength=4.0))

    # ---- the neon unicorn: the sign's outline from drawUnicornClub, in metres
    def q(p0, p1, p2, n=8):
        return [((1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0],
                 (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]) for t in (i / n for i in range(n + 1))]
    path = q((-46, 26), (-50, -6), (-22, -10)) + q((-22, -10), (-12, -30), (8, -22))[1:] + [(26, -46), (20, -16)] \
        + q((20, -16), (46, -6), (44, 26))[1:]
    k = 1 / 65.75
    PINK = m('#ff78f0', 0.3, emit='#ff78f0', strength=6.0)
    kit.tube([(x * k, 5.05, 5.62 - y * k) for x, y in path], 0.035, PINK)   # above the arcs
    kit.text('THE UNICORN CLUB', (0, 5.05, 2.35), 0.3, PINK, align='CENTER')     # inside them

    # ---- the DJ booth, the disco ball
    kit.box((0, 4.2, 0.55), (2.4, 0.9, 1.1), BLACK, 0.04)
    kit.box((0, 3.74, 0.6), (2.2, 0.02, 0.5), m('#0a3a4a', 0.3, emit='#29d9ff', strength=0.35))
    for x in (-0.6, 0.6):
        kit.cylinder((x, 4.2, 1.12), 0.3, 0.04, m('#222230', 0.3, 0.6))
    kit.box((-3.3, 3.2, 6.0), (0.02, 0.02, 1.4), BLACK)
    ball = kit.sphere((-3.3, 3.2, 5.1), 0.42, m('#dfe3ff', 0.08, 1.0))
    ball.data.polygons.foreach_set('use_smooth', [False] * len(ball.data.polygons))

    # ---- sponsor screens on the side walls (live)
    for side in (-1, 1):
        x = side * 5.87
        kit.box((x, 5.12, 1.18), (2.1, 0.08, 0.8), BLACK, 0.02)
        kit.screen('left' if side < 0 else 'right', (x, 5.06, 1.18), (1.95, 0.64))

    # ---- light: pink and violet washes, a spot on the ball, cyan from the booth
    kit.light('AREA', (-6.0, 2.5, 5.5), 1300, '#ff3d9a', 5.0, rot=(math.radians(-55), math.radians(-30), 0))
    kit.light('AREA', (6.0, 2.5, 5.5), 1300, '#7b5cff', 5.0, rot=(math.radians(-55), math.radians(30), 0))
    spot = kit.light('SPOT', (-3.3, 0.0, 7.5), 2500, '#ffffff', 0.1, rot=(math.radians(40), 0, 0))
    spot.data.spot_size = math.radians(12)
    kit.light('AREA', (0, -6, 5.5), 500, '#ffd0f0', 12.0, rot=(math.radians(50), 0, 0))
