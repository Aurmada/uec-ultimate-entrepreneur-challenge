# THE BOARDROOM: a top-floor boardroom at night, laid out like drawBoardroom in
# src/data/arenas.js (a window wall onto the city behind the fighters, the moon
# up to the right, a wall TV with the live chart at the left, a sponsor display
# at the right, three pools of ceiling light on the floor).
# Built by lab/blender/build_stage.py; units and axes are described there.
import math
import random


def build(kit):
    m = kit.mat
    kit.sky('#1a2350', 1.2)
    kit.exposure(0.5)

    WALL = m('#343d66', 0.75)
    FRAME = m('#0a0d1c', 0.45, 0.3)
    BEZEL = m('#0b0d14', 0.35, 0.4)

    # ---- room: polished floor, the window wall at y 4.6 with panels either side
    kit.box((0, 1.0, -0.05), (20, 12.0, 0.1), m('#1f2649', 0.25))
    for x in (-6.6, 6.6):                                           # side panels
        kit.box((x, 4.7, 3.4), (3.2, 0.2, 7.0), WALL)
    kit.box((0, 4.7, 6.3), (10.2, 0.2, 1.4), WALL)                  # over the glass
    kit.box((0, 4.7, 0.42), (10.2, 0.2, 0.84), WALL)                # the sill wall
    kit.box((0, 4.55, 0.86), (10.2, 0.3, 0.06), FRAME)              # sill
    for x in (-5.0, -2.5, 0.0, 2.5, 5.0):                           # mullions
        kit.box((x, 4.6, 3.2), (0.14 if abs(x) < 5 else 0.24, 0.12, 4.8), FRAME)
    kit.box((0, 4.6, 5.62), (10.2, 0.12, 0.14), FRAME)              # head of the frame
    for x in (-7.2, -6.0, 6.0, 7.2):                                # panel seams
        kit.box((x, 4.58, 3.4), (0.025, 0.02, 7.0), FRAME)
    kit.box((0, 4.58, 0.95), (16, 0.03, 0.04), m('#9aa6d8', 0.3, 0.8))   # a brushed rail under the glass

    # ---- the night: a sky shading up from the city's glow, the city, the moon
    kit.box((0, 300, 60), (900, 1, 300), kit.gradient('#3a2560', '#0a1030', -20, 140, 1.8))
    rng = random.Random(7)
    lit = ['#ffd98a', '#ffe6b0', '#a9ccff', '#ffcf7a']
    rows = [  # depth band, count, width, height to, window cell, brightness
        ((110, 150), 34, (4, 9), (4, 30), (0.9, 0.7), 0.8),
        ((60, 90), 18, (3, 6), (-6, 12), (0.55, 0.42), 1.1),
        ((34, 46), 6, (2.5, 5), (-12, 2), (0.42, 0.32), 1.3),
    ]
    for (y0, y1), count, (w0, w1), (t0, t1), cell, strength in rows:
        for _ in range(count):
            x = rng.uniform(-y1 * 0.45, y1 * 0.45)
            y = rng.uniform(y0, y1)
            w, d = rng.uniform(w0, w1), rng.uniform(2.0, 4.0)
            top, base = rng.uniform(t0, t1), -60.0
            facade = rng.choice(['#0a0f24', '#0d1330', '#0b1028'])
            windows = kit.windows(facade, '#0c1226', rng.choice(lit), strength, cell=cell, bias=rng.uniform(0.15, 0.6))
            kit.box((x, y, (top + base) / 2), (w, d, top - base), windows)
    kit.sphere((34, 150, 42), 3.6, m('#f5efdc', 0.5, emit='#fff4dc', strength=1.6))

    # ---- a long boardroom table in front of the glass, and its chairs
    WALNUT = m('#5a3620', 0.3)
    kit.box((0, 3.1, 0.76), (6.8, 1.15, 0.07), WALNUT, 0.01)
    for x in (-2.2, 2.2):
        kit.box((x, 3.1, 0.38), (0.35, 0.7, 0.72), m('#231a24', 0.4), 0.01)
    LEATHER = m('#1d2030', 0.45)
    for i in range(7):
        x = -2.9 + i * (5.8 / 6)
        kit.box((x, 3.85, 1.12), (0.5, 0.12, 0.66), LEATHER, 0.08)
        kit.box((x, 3.75, 0.74), (0.5, 0.45, 0.1), LEATHER, 0.03)
    for x in (-1.6, 0.4, 2.1):                                       # papers and a glass or two
        kit.box((x, 2.9, 0.805), (0.34, 0.24, 0.005), m('#e9e6dc', 0.7))
    for x in (-0.9, 1.3):
        kit.cylinder((x, 2.8, 0.87), 0.05, 0.16, m('#bcd6e8', 0.05))

    # ---- the wall TV (the live chart) and the sponsor display, both painted by the game
    kit.box((-5.92, 4.56, 3.57), (1.9, 0.06, 1.3), BEZEL, 0.02)
    kit.screen('chart', (-5.92, 4.52, 3.57), (1.78, 1.18), '#0d2417')
    kit.box((5.99, 4.56, 2.2), (1.75, 0.06, 0.71), BEZEL, 0.02)
    kit.screen('sponsor', (5.99, 4.52, 2.2), (1.63, 0.59))

    # ---- light: three narrow ceiling spots pooling on the floor, washes on the
    # side walls, moonlight through the glass, and a fill from the camera side
    for x in (-2.4, 0.0, 2.4):
        spot = kit.light('SPOT', (x, 0.6, 6.8), 1800, '#e4eaff', 0.2)
        spot.data.spot_size, spot.data.spot_blend = math.radians(34), 0.35
    for x, turn in ((-6.4, -1), (6.4, 1)):
        kit.light('AREA', (x - turn * 1.2, 2.2, 6.2), 700, '#9fb0ff', 2.5,
                  rot=(math.radians(-35), turn * math.radians(-20), 0))
    kit.light('AREA', (0, 7.0, 4.0), 1200, '#6f8dff', 10.0, rot=(math.radians(-80), 0, 0))
    kit.light('AREA', (0, -6, 5.0), 700, '#c9d4ff', 12.0, rot=(math.radians(55), 0, 0))
