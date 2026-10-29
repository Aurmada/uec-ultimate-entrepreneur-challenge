# THE STOCK EXCHANGE: a trading hall, laid out like drawExchange in
# src/data/arenas.js (a column hall, a giant market board behind the fighters
# with the index above it, a ticker band running the width of the room, a
# sponsor kiosk at the right). The board, the ticker and the kiosk are painted
# live by the game. Built by lab/blender/build_stage.py; units and axes there.
import math


def build(kit):
    m = kit.mat
    kit.sky('#061018', 0.6)
    kit.exposure(0.35)

    STONE = m('#1a3a52', 0.55)
    STONE2 = m('#24506e', 0.5)
    BRASS = m('#b08a3e', 0.3, 0.9)
    BLACK = m('#05080e', 0.4, 0.2)

    # ---- marble floor with a brass inlay, the hall's back wall and entablature
    kit.box((0, 1.0, -0.05), (22, 12.0, 0.1), m('#12303f', 0.18))
    for x in (-8, -4, 0, 4, 8):
        kit.box((x, 1.0, 0.001), (0.05, 12.0, 0.004), BRASS)
    kit.box((0, 5.6, 3.4), (22, 0.3, 7.2), m('#0c2233', 0.7))
    kit.box((0, 5.1, 5.75), (22, 0.6, 0.5), STONE2, 0.02)
    kit.box((0, 5.0, 6.15), (22, 0.7, 0.3), STONE, 0.02)

    # ---- columns: base, fluted shaft, capital
    for x in (-6.1, -3.05, 0.0, 3.05, 6.1):
        kit.box((x, 5.1, 0.15), (0.95, 0.95, 0.3), STONE2, 0.02)
        kit.cylinder((x, 5.1, 2.9), 0.36, 5.2, STONE, verts=16)
        kit.box((x, 5.1, 5.45), (0.9, 0.9, 0.2), STONE2, 0.02)

    # ---- the market board (live) with the index strip above it
    kit.box((0, 4.66, 3.42), (8.84, 0.1, 3.8), m('#0f3852', 0.4, 0.3), 0.02)
    kit.screen('board', (0, 4.6, 3.42), (8.58, 3.55), '#04121c')

    # ---- the ticker band (live), the width of the hall, on a brass-edged rail
    kit.box((0, 4.44, 1.04), (16.4, 0.12, 0.62), BLACK, 0.01)
    kit.box((0, 4.4, 1.37), (16.4, 0.14, 0.04), BRASS)
    kit.box((0, 4.4, 0.71), (16.4, 0.14, 0.04), BRASS)
    kit.screen('ticker', (0, 4.37, 1.04), (13.8, 0.5))       # the band runs on past the frame; the text stays in it

    # ---- a trading desk with its monitors at the left, the sponsor kiosk at the right
    kit.box((-4.9, 3.0, 0.72), (2.6, 0.9, 0.06), m('#2a2f3a', 0.3, 0.5), 0.01)
    kit.box((-4.9, 3.2, 0.36), (2.5, 0.5, 0.7), m('#141a24', 0.5), 0.01)
    for i, col in enumerate(['#2ee66b', '#ff4757', '#29d9ff']):
        x = -5.7 + i * 0.8
        kit.box((x, 3.25, 1.12), (0.62, 0.05, 0.4), BLACK, 0.01)
        kit.box((x, 3.22, 1.12), (0.56, 0.01, 0.34), m('#08121c', 0.2, emit=col, strength=0.9))
        kit.box((x, 3.28, 0.86), (0.05, 0.05, 0.22), BLACK)
    kit.box((4.94, 2.55, 0.3), (0.12, 0.3, 0.6), m('#2a2f3a', 0.3, 0.6), 0.01)
    kit.box((4.94, 2.52, 0.36), (1.62, 0.12, 0.64), BLACK, 0.02)
    kit.screen('sponsor', (4.94, 2.45, 0.36), (1.51, 0.53))

    # ---- light: cool hall light from above, green spill off the board, warm spots on the floor
    kit.light('AREA', (0, 2.0, 7.0), 1400, '#8fd6ff', 12.0, rot=(math.radians(-20), 0, 0))
    kit.light('AREA', (0, 3.4, 3.4), 200, '#2ee66b', 8.0, rot=(math.radians(90), 0, 0))
    kit.light('AREA', (0, -6, 5.5), 700, '#d8f1ff', 12.0, rot=(math.radians(50), 0, 0))
    for x in (-3.0, 3.0):
        spot = kit.light('SPOT', (x, 0.5, 7.0), 1400, '#ffe2b0', 0.2)
        spot.data.spot_size, spot.data.spot_blend = math.radians(30), 0.4
