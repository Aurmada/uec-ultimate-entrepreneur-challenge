# THE VC SUMMIT: a deck on a mountain top at sunset, laid out like drawSummit in
# src/data/arenas.js (a low sun between the peaks, snow caps, a banner strung
# between two poles above the fighters, pennants, a sponsor sign at the left).
# The banner and the sign are painted live by the game; the clouds stay
# procedural. Built by lab/blender/build_stage.py; units and axes are there.
import math
import random


def build(kit):
    m = kit.mat
    kit.sky('#2c1250', 0.6)
    kit.exposure(0.1)

    WOOD = m('#6b4432', 0.7)
    DARK = m('#2a1a14', 0.6)

    # ---- the sunset: a sky, a low sun
    kit.box((0, 420, 60), (1400, 1, 500), kit.gradient('#ff8f4d', '#2c1250', -10, 140, 2.2,
                                                       stops=[(0.3, '#c2406a')]))
    kit.sphere((6, 380, 22), 28, m('#ffd23f', 0.5, emit='#ffd23f', strength=2.2))

    # ---- mountains: a far range with snow, a nearer darker one below the deck
    rng = random.Random(11)
    FAR, NEAR, SNOW = m('#6a3a86', 0.85), m('#3d1a52', 0.85), m('#ffeef8', 0.6)

    def peak(x, y, base, h, r, mat, snow):
        # a ragged peak: a main cone and two shoulders, each turned at random
        for dx, k in ((0, 1.0), (-r * 0.55, 0.62), (r * 0.6, 0.55)):
            turn = rng.uniform(0, math.tau)
            kit.cone((x + dx, y + rng.uniform(-3, 3), base), r * k, h * k, mat, verts=5, rot=(0, 0, turn))
            if snow and k == 1.0:
                cap = h * 0.24
                kit.cone((x, y, base + h - cap), r * cap / h * 1.04, cap + 0.3, SNOW, verts=5, rot=(0, 0, turn))

    for x, h, r in ((-60, 34, 30), (-18, 44, 34), (32, 30, 28), (70, 38, 30), (-95, 28, 26), (105, 26, 26)):
        peak(x, 150, -10, h, r, FAR, True)
    for x, h, r in ((-34, 22, 20), (6, 26, 22), (44, 18, 18), (-70, 16, 18), (80, 20, 20)):
        peak(x, 70, -24, h, r, NEAR, False)

    # ---- the deck: planks, a rail at the back edge
    for i in range(-14, 15):
        kit.box((i * 0.42, 1.5, -0.05), (0.4, 11.0, 0.1), m('#5e3a2d' if i % 2 else '#654030', 0.75))
    kit.box((0, 3.6, 1.0), (14, 0.08, 0.08), WOOD, 0.01)
    kit.box((0, 3.6, 0.55), (14, 0.06, 0.06), WOOD, 0.01)
    for i in range(-7, 8):
        kit.box((i * 1.0, 3.6, 0.5), (0.1, 0.1, 1.0), DARK, 0.01)

    # ---- the banner between two poles (live), pennants on a line below it
    for x in (-5.1, 5.1):
        kit.cylinder((x, 4.0, 2.4), 0.07, 4.8, DARK, verts=12)
        kit.sphere((x, 4.0, 4.85), 0.1, m('#ffd23f', 0.3, 0.8))
    kit.screen('banner', (0, 4.0, 4.37), (10.2, 0.64), visible=False)
    COLS = ['#ffd23f', '#ff3d6e', '#29d9ff']
    for i in range(12):
        x = -4.6 + i * (9.2 / 11)
        z = 3.45 - math.sin((i / 11) * math.pi) * 0.25
        kit.cone((x, 3.98, z - 0.26), 0.13, 0.26, m(COLS[i % 3], 0.6), verts=3, rot=(math.radians(180), 0, 0))

    # ---- the sponsor sign at the left of the deck (live)
    kit.box((-4.71, 2.02, 0.41), (1.6, 0.1, 0.62), DARK, 0.02)
    kit.box((-4.71, 2.08, 0.05), (0.1, 0.1, 0.1), DARK)
    kit.screen('sponsor', (-4.71, 1.96, 0.41), (1.45, 0.48))

    # ---- light: the low sun behind, warm and raking; a violet sky fill; a soft front fill
    kit.light('SUN', (0, 0, 10), 3.5, '#ffb070', rot=(math.radians(-80), 0, 0))
    kit.light('SUN', (0, 0, 10), 1.6, '#c07aff', rot=(math.radians(70), 0, math.radians(15)))   # the sky, lighting the faces
    kit.light('AREA', (0, -6, 5.0), 500, '#ffd9c0', 12.0, rot=(math.radians(50), 0, 0))
    kit.light('AREA', (0, 8, 8), 600, '#8a5cff', 14.0, rot=(math.radians(-60), 0, 0))
