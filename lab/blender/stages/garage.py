# THE STARTUP GARAGE: a lit single-car garage, laid out like drawGarage in
# src/data/arenas.js (roll-up door behind the fighters, whiteboard left, shelf
# and workbench right, string lights across the top, pizza boxes on the floor).
# Built by lab/blender/build_stage.py; units and axes are described there.
import math


def build(kit):
    m = kit.mat
    kit.sky('#101420', 0.35)
    kit.exposure(0.4)

    WALL = m('#6b5238', 0.85)
    TRIM = m('#2a1c10', 0.8)
    STEEL = m('#4b4f57', 0.4, 0.8)
    WOOD = m('#7b5230', 0.6)

    # ---- room: back wall at y 4.3, a concrete floor that runs under the camera
    kit.box((0, 4.3, 3.2), (16, 0.4, 7.6), WALL)
    kit.box((0, 0.5, -0.05), (18, 10.0, 0.1), m('#6e655c', 0.55))
    kit.box((0, 4.08, 0.12), (16, 0.06, 0.24), TRIM)
    for x in (-6.2, -3.4, 3.4, 6.2):                             # exposed studs
        kit.box((x, 4.06, 3.2), (0.16, 0.08, 7.6), m('#5a4128', 0.9), 0.01)

    # ---- the roll-up door: framed, slatted, four night windows in the top slat
    kit.box((0, 4.02, 2.1), (5.3, 0.12, 3.5), TRIM, 0.02)
    for i in range(5):
        z = 3.55 - i * 0.66
        kit.box((0, 3.97, z), (5.0, 0.05, 0.64), m('#8a6a42' if i % 2 else '#7a5c38', 0.6), 0.015)
        for dz in (0.2, -0.2):
            kit.box((0, 3.93, z + dz), (4.9, 0.01, 0.025), TRIM)
    for x in (-2.62, 2.62):
        kit.box((x, 3.9, 2.1), (0.1, 0.12, 3.5), STEEL, 0.01)
    kit.box((0, 3.9, 0.72), (0.5, 0.06, 0.08), STEEL, 0.02)
    for i in range(4):
        x = -1.8 + i * 1.2
        kit.box((x, 3.93, 3.55), (0.98, 0.04, 0.44), TRIM, 0.01)
        kit.box((x, 3.905, 3.55), (0.88, 0.02, 0.34), m('#0a1428', 0.05, emit='#13284d', strength=1.2, glow=False))

    # ---- whiteboard: the growth curve and "MVP!!"
    kit.box((-4.85, 3.98, 2.7), (1.55, 0.06, 1.12), m('#ecebe4', 0.25), 0.02)
    kit.box((-4.85, 4.0, 2.7), (1.65, 0.05, 1.22), m('#9b9384', 0.35, 0.6), 0.01)
    kit.tube([(-5.45, 3.9, 2.35), (-4.85, 3.9, 2.45), (-4.25, 3.9, 3.05)], 0.018, m('#d8322b', 0.4))
    kit.text('MVP!!', (-5.5, 3.9, 2.95), 0.26, m('#262626', 0.5))
    kit.text('users -> moon', (-5.5, 3.9, 2.78), 0.12, m('#1a6ed8', 0.5))

    # ---- the sponsor board, painted live by the game (arenas.js billboard)
    kit.box((-5.35, 4.02, 1.62), (1.86, 0.04, 0.72), TRIM, 0.01)
    kit.screen('sponsor', (-5.35, 3.99, 1.62), (1.7, 0.57))

    # ---- shelf, boxes and a red toolbox; the workbench and laptop under it
    kit.box((4.85, 3.85, 2.55), (1.8, 0.45, 0.08), TRIM, 0.01)
    kit.box((4.25, 3.85, 2.84), (0.55, 0.4, 0.5), m('#b8925a', 0.9), 0.02)
    kit.box((4.85, 3.85, 2.76), (0.4, 0.34, 0.34), m('#a37f4a', 0.9), 0.02)
    kit.box((5.4, 3.85, 2.8), (0.5, 0.3, 0.42), m('#b5392e', 0.35, 0.2), 0.03)
    kit.box((4.9, 3.6, 0.95), (2.2, 0.9, 0.12), WOOD, 0.02)
    for x in (3.95, 5.85):
        kit.box((x, 3.6, 0.45), (0.1, 0.8, 0.9), TRIM, 0.01)
    ALU = m('#a8a8b0', 0.3, 0.8)
    kit.box((4.6, 3.55, 1.05), (0.5, 0.35, 0.03), ALU, 0.01)
    kit.box((4.6, 3.73, 1.22), (0.5, 0.03, 0.34), ALU, 0.01)
    kit.box((4.6, 3.71, 1.22), (0.44, 0.01, 0.28), m('#0c1320', 0.2, emit='#3fa0ff', strength=2.2, glow=False))
    kit.box((5.3, 3.5, 1.08), (0.12, 0.12, 0.15), m('#e9e1d0', 0.4), 0.02)

    # ---- neon sign, pegboard of tools, a poster
    kit.text('DAY ONE', (-5.75, 3.9, 4.0), 0.36, m('#ff3d6e', 0.3, emit='#ff4f86', strength=6))
    kit.light('POINT', (-5.0, 3.6, 4.6), 60, '#ff3d6e', 0.3, shadow=False)
    kit.box((4.9, 4.0, 1.75), (2.0, 0.04, 1.1), m('#a9855a', 0.9), 0.01)
    for gx in range(14):
        for gz in range(7):
            kit.box((4.05 + gx * 0.13, 3.975, 1.3 + gz * 0.14), (0.025, 0.01, 0.025), TRIM)
    kit.box((4.3, 3.95, 1.8), (0.06, 0.03, 0.62), STEEL, 0.01, rot=(0, math.radians(18), 0))
    kit.box((4.95, 3.95, 2.12), (0.34, 0.05, 0.1), STEEL, 0.01)
    kit.box((4.95, 3.95, 1.8), (0.06, 0.04, 0.6), WOOD, 0.01)
    kit.box((5.55, 3.95, 1.75), (0.5, 0.02, 0.28), STEEL, 0.01)
    kit.box((-2.95, 4.05, 2.8), (0.62, 0.02, 0.86), m('#1f6f8b', 0.6), 0.01)
    kit.text('SHIP IT', (-3.2, 4.02, 2.95), 0.13, m('#ffd23f', 0.5))

    # ---- floor clutter: an oil stain in the lane, pizza boxes at the left edge
    stain = kit.cylinder((1.9, 1.6, 0.003), 0.9, 0.005, m('#2a2622', 0.15))
    stain.scale = (1.0, 0.35, 1.0)
    for i, (x, rot) in enumerate([(-4.9, 0.0), (-4.8, 0.12), (-4.95, -0.08)]):
        kit.box((x, 2.6, 0.06 + i * 0.12), (0.95, 0.95, 0.1), m('#caa262', 0.9), 0.01, rot=(0, 0, rot))

    # ---- a bare work lamp over the door, and the string lights
    cord = kit.box((0, 3.3, 5.0), (0.02, 0.02, 1.0), TRIM)
    cord.visible_shadow = False
    kit.sphere((0, 3.3, 4.45), 0.11, m('#fff4d8', 0.2, emit='#ffd48a', strength=14))
    kit.light('POINT', (0, 3.1, 4.3), 700, '#ffc978', 0.15)
    COLS = ['#ffd23f', '#ff3d6e', '#29d9ff', '#57ff8a']
    for i in range(18):
        x = -8 + i * (16 / 17)
        z = 5.4 - math.sin((i / 17) * math.pi) * 0.6
        # low enough that the bulbs keep their colour through the view transform
        kit.sphere((x, 3.7, z), 0.07, m(COLS[i % 4], 0.3, emit=COLS[i % 4], strength=0.9))
        kit.light('POINT', (x, 3.55, z - 0.05), 14, COLS[i % 4], 0.05, shadow=False)

    # ---- moonlight through the door windows, a warm fill from the camera side,
    # and a spot on the whiteboard
    kit.light('AREA', (0, 2.5, 3.6), 220, '#7ea6ff', 4.0, rot=(math.radians(-90), 0, 0))
    kit.light('AREA', (0, -4, 4.5), 260, '#ffe1b8', 9.0, rot=(math.radians(55), 0, 0))
    kit.light('SPOT', (-4.8, 1.5, 5.2), 350, '#fff1d6', 0.2, rot=(math.radians(20), 0, 0))
