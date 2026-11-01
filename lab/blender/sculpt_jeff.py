"""Jeff Bozo's body, sculpted from scratch (lab/blender/sculpt.py), the first
fighter of the October 2026 remodel: one character at a time, built the way a
character artist builds one, to the heroic proportions of the modern arcade
fighters rather than the soft, fused shapes of the metaball bodies.

    python lab/blender/sculpt_jeff.py -- <out.glb> [--h 0.003] [--views <dir>]
    python lab/blender/sculpt_jeff.py -- assets/models/sculpt/jeff.glb --rig

Writes the body as a static mesh and, with --views, clay renders from the
front, three quarters, the side and the back. With --rig it writes the game
model instead: decimated, in fight shorts, weighted to the skeleton.

Proportions. About 7.5 heads tall: crown 1.955, chin 1.69, so a head of 0.265.
The crotch sits at half the height, the nipples a head below the chin, the
navel two. Shoulders about 2.3 heads across at the deltoids, a waist barely
wider than the head is tall, and limbs that taper hard: a forearm thick under
the elbow and slim at the wrist, a thigh full at the top and narrow above the
knee, a calf high and full over a slim ankle. Jeff is the gym rat of the cast,
so his muscles are big and every group reads on its own.

Coordinates are the model contract's (build_founder.py): model units, z up,
facing +x, his left (.L) on +y. Arms hang at 45 degrees, as the founder's do,
so the same skeleton can carry him into the game later. His face here is a
placeholder head; it is designed in its own stage, and like every face in the
game it is an original design, not a likeness.
"""

import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sculpt as sc  # noqa: E402

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = os.path.abspath(ARGS[0]) if ARGS and not ARGS[0].startswith('--') else None
def opt(name, default):
    return ARGS[ARGS.index(name) + 1] if name in ARGS else default
H = float(opt('--h', '0.003'))
VIEWS = opt('--views', None)

# How tightly forms meet. A crease between two muscles is a few millimetres;
# a muscle sitting into the mass under it a little more; a limb growing out of
# the trunk a few centimetres.
CREASE, SEAT, JOIN = 0.007, 0.014, 0.03

V = lambda *a: np.array(a, float)
lerp = lambda a, b, t: a + (b - a) * t
F = sc.Field(lo=(-0.22, -0.74, -0.01), hi=(0.30, 0.74, 1.985), h=H)


def E(c, r, axes=None, k=CREASE):
    F.add(sc.Ellipsoid(c, r, axes), k)


def C(a, b, r1, r2, k=SEAT, flat=None):
    F.add(sc.RoundCone(a, b, r1, r2, flat), k)


def limb(a, b, s):
    """A limb's frame: along it, forward, and out to the side it is on."""
    R = sc.frame(b - a, (1, 0, 0))
    u, v = R[:, 0], R[:, 1]
    lat = s * np.cross(v, u)
    return u, v, lat, np.stack([u, v, lat], axis=1)


# ================================================================ masses
# First the masses, blended broadly the way skin runs over them, so the
# silhouette is right before any detail: a deep chest, a waist that narrows
# under the lats, round shoulders, limbs that taper. Definition comes after,
# carved in (see "definition").

# trunk
E(V(-0.006, 0, 1.425), (0.132, 0.162, 0.18), k=0.04)
E(V(0.0, 0, 1.54), (0.095, 0.145, 0.075), k=0.04)
E(V(0.012, 0, 1.2), (0.096, 0.122, 0.15), k=0.05)
E(V(0.0, 0, 1.0), (0.104, 0.155, 0.1), k=0.05)
E(V(-0.08, 0, 1.47), (0.032, 0.078, 0.1), k=0.03)
for s in (1, -1):
    E(V(0.076, s * 0.078, 1.47), (0.06, 0.098, 0.072), sc.rot(rx=s * 12), k=0.03)    # pectoral
    E(V(0.03, s * 0.158, 1.49), (0.045, 0.055, 0.055), k=0.03)                      # into the armpit
    # The pec's outer edge runs on into the arm as the fold at the front of the
    # armpit: a pec that just ended rounded into a hanging lobe as the arm moved.
    C(V(0.055, s * 0.15, 1.46), V(0.025, s * 0.205, 1.5), 0.028, 0.022, k=0.03)
    E(V(0.01, s * 0.103, 1.13), (0.07, 0.04, 0.085), k=0.04)                        # obliques
    C(V(-0.035, s * 0.15, 1.47), V(-0.05, s * 0.095, 1.18), 0.065, 0.035, k=0.04)   # lats
    # The traps run from the neck right out to the point of the shoulder, over a
    # solid shoulder girdle, and taper there onto the top of the deltoid. Short
    # and stopping above the shoulder, as they were, they left a notch and the
    # deltoid stood up beyond it as a ball.
    C(V(-0.03, s * 0.08, 1.58), V(-0.02, s * 0.19, 1.56), 0.05, 0.04, k=0.04)
    C(V(-0.03, s * 0.064, 1.636), V(-0.015, s * 0.205, 1.598), 0.046, 0.028, k=0.045)  # traps
    E(V(-0.088, s * 0.08, 1.44), (0.04, 0.075, 0.09), k=0.035)                      # shoulder blade
    E(V(-0.1, s * 0.115, 1.43), (0.03, 0.055, 0.06), k=0.025)                       # infraspinatus, on the blade
    E(V(-0.07, s * 0.16, 1.4), (0.03, 0.04, 0.032), k=0.025)                        # teres, from the blade to the armpit
    E(V(-0.08, s * 0.03, 1.2), (0.03, 0.032, 0.16), k=0.03)                         # erectors
    E(V(-0.05, s * 0.07, 0.955), (0.066, 0.076, 0.088), sc.rot(rx=s * 8), k=0.04)   # glutes

# neck: the column, the two muscles down its front to the notch between the
# collarbones, and the collarbones. The notch is kept wide: a narrow slot there
# let the ink outline show through as a black fleck at the base of the neck.
C(V(-0.014, 0, 1.58), V(-0.01, 0, 1.75), 0.078, 0.065, k=0.035)
for s in (1, -1):
    C(V(-0.025, s * 0.052, 1.765), V(0.042, s * 0.024, 1.6), 0.015, 0.011, k=0.02)
    C(V(0.042, s * 0.018, 1.588), V(0.0, s * 0.175, 1.605), 0.008, 0.008, k=0.02)

# A mannequin head for now, in proportion: the cranium, one smooth lower face
# and jaw, a brow, a plain nose and ears. The face is its own stage. The jaw
# goes on before the rest, met tightly by the neck, so the neck runs up under
# it with a line where they meet: blended broadly, the face melted down into
# the throat and the neck seemed to carry on into the chin.
E(V(0.022, 0, 1.736), (0.08, 0.066, 0.046), k=0.012)
for s in (1, -1):
    E(V(-0.012, s * 0.054, 1.738), (0.022, 0.016, 0.028), k=0.012)         # angle of the jaw
E(V(-0.01, 0, 1.86), (0.1, 0.082, 0.097), k=0.02)
E(V(0.042, 0, 1.8), (0.058, 0.064, 0.08), k=0.03)
E(V(0.086, 0, 1.858), (0.016, 0.058, 0.015), k=0.022)
C(V(0.097, 0, 1.848), V(0.11, 0, 1.795), 0.008, 0.011, k=0.014)
for s in (1, -1):
    E(V(-0.006, s * 0.084, 1.825), (0.022, 0.011, 0.03), sc.rot(ry=-10), k=0.01)

# arms
D45 = math.sqrt(0.5)
ARM = {}
for s in (1, -1):
    S = V(0.0, s * 0.2, 1.555)
    d = V(0, s * D45, -D45)
    El = S + d * 0.315
    W = El + d * 0.265
    ARM[s] = (S, El, W)
    u, v, lat, ax = limb(S, El, s)
    E(S, (0.055, 0.055, 0.055), k=0.03)
    E(S + u * 0.062 + lat * 0.03, (0.11, 0.08, 0.068), ax, k=0.03)    # deltoid, its top under the traps' end
    C(S, El, 0.062, 0.044, k=0.025)
    E(S + u * 0.18 + v * 0.032, (0.115, 0.052, 0.05), ax, k=0.025)    # biceps
    E(S + u * 0.13 - v * 0.038, (0.135, 0.056, 0.054), ax, k=0.025)   # triceps
    E(El, (0.042, 0.04, 0.042), ax, k=0.02)
    E(El - v * 0.032, (0.018, 0.018, 0.018), k=0.012)
    u, v, lat, ax = limb(El, W, s)
    C(El, W, 0.056, 0.034, k=0.02, flat=(lat, 0.8))
    E(El + u * 0.08 + v * 0.008, (0.13, 0.06, 0.058), ax, k=0.03)     # forearm muscles
    E(El + u * 0.07 + v * 0.022 + lat * 0.018, (0.1, 0.034, 0.034), ax, k=0.025)  # brachioradialis, the thumb side
    E(W, (0.022, 0.032, 0.024), ax, k=0.015)
    # a fist, palm toward the thigh: the back of the hand, a row of knuckles,
    # four fingers curled into the palm, the thumb across them
    F.add(sc.Box(W + u * 0.052, (0.054, 0.051, 0.027), 0.018, ax), 0.012)
    for o in (-0.036, -0.012, 0.012, 0.036):
        E(W + u * 0.103 + v * o + lat * 0.004, (0.015, 0.0135, 0.016), ax, k=0.004)
        C(W + u * 0.103 + v * o - lat * 0.01, W + u * 0.082 + v * o - lat * 0.036, 0.0135, 0.0125, k=0.004)
    C(W + u * 0.022 + v * 0.042 - lat * 0.011, W + u * 0.07 + v * 0.036 - lat * 0.043, 0.0145, 0.0125, k=0.006)

# legs
LEG = {}
for s in (1, -1):
    Hj = V(0.0, s * 0.095, 0.955)
    K = V(0.012, s * 0.1, 0.52)
    A = V(-0.008, s * 0.105, 0.085)
    LEG[s] = (Hj, K, A)
    u, v, lat, ax = limb(Hj, K, s)
    # the core a little oval and set out from the middle, so the thighs part
    # below the crotch: fused down to mid-thigh, they tore when the legs moved
    C(Hj + lat * 0.01, K + lat * 0.004, 0.105, 0.06, k=0.045, flat=(lat, 0.85))
    E(lerp(Hj, K, 0.45) + v * 0.036 + lat * 0.028, (0.22, 0.08, 0.078), ax, k=0.035)  # quadriceps
    E(lerp(Hj, K, 0.48) + v * 0.008 + lat * 0.062, (0.2, 0.05, 0.056), ax, k=0.035)  # the outer sweep
    E(lerp(Hj, K, 0.25) - lat * 0.036, (0.17, 0.062, 0.045), ax, k=0.035)          # adductors
    E(lerp(Hj, K, 0.45) - v * 0.04, (0.22, 0.064, 0.062), ax, k=0.035)             # hamstrings
    E(lerp(Hj, K, 0.8) + v * 0.02 - lat * 0.036, (0.09, 0.045, 0.048), ax, k=0.02) # vastus medialis
    E(K, (0.046, 0.048, 0.05), ax, k=0.025)
    E(K + v * 0.043 + V(0, 0, 0.012), (0.022, 0.02, 0.026), ax, k=0.012)          # kneecap
    u, v, lat, ax = limb(K, A, s)
    C(K, A, 0.056, 0.043, k=0.025)
    E(lerp(K, A, 0.3) - v * 0.04, (0.15, 0.064, 0.07), ax, k=0.03)                 # calf
    E(lerp(K, A, 0.3) - v * 0.03 - lat * 0.032, (0.13, 0.052, 0.052), ax, k=0.025)  # its inner head
    E(lerp(K, A, 0.26) - v * 0.03 + lat * 0.03, (0.12, 0.048, 0.048), ax, k=0.025)  # and outer
    E(lerp(K, A, 0.58) - v * 0.014, (0.15, 0.046, 0.056), ax, k=0.03)              # soleus, down to the ankle
    E(lerp(K, A, 0.35) + v * 0.02 + lat * 0.016, (0.14, 0.024, 0.024), ax, k=0.015)  # shin muscle
    C(lerp(K, A, 0.7) - v * 0.024, A - v * 0.034, 0.02, 0.015, k=0.018)            # Achilles
    for o in (-0.028, 0.028):
        E(A + lat * o, (0.019, 0.019, 0.019), k=0.012)
    E(A + V(-0.03, 0, -0.045), (0.046, 0.038, 0.04), k=0.026)
    F.add(sc.Box(A + V(0.06, 0, -0.058), (0.115, 0.047, 0.031), 0.026), 0.03)
    E(A + V(0.17, 0, -0.066), (0.035, 0.044, 0.018), k=0.014)

# ================================================================ definition
# Carved, not added: each line is a shallow groove where two muscles meet,
# laid along the surface. This is what reads as muscle at game size, and it
# cannot bubble the way a form stuck on top does.
G = F.groove
STRONG = dict(depth=0.004, width=0.013, k=0.01)
LINE = dict(depth=0.003, width=0.01, k=0.008)
SOFT = dict(depth=0.002, width=0.011, k=0.008)

# chest and belly
G([(0.13, 0, 1.55), (0.13, 0, 1.47), (0.125, 0, 1.405)], **STRONG)
G([(0.122, 0, 1.385), (0.12, 0, 1.25), (0.115, 0, 1.08)], **LINE)
# The abs' rows and the lines down either side of them are soft: carved as
# deep as the midline, they broke into scattered dark chips through the game's
# flat light bands instead of reading as a six-pack.
for z in (1.3, 1.235, 1.17):
    G([(0.11, -0.058, z + 0.006), (0.118, -0.03, z), (0.12, 0, z - 0.004), (0.118, 0.03, z), (0.11, 0.058, z + 0.006)], **SOFT)
for s in (1, -1):
    G([(0.12, s * 0.008, 1.4), (0.118, s * 0.05, 1.388), (0.105, s * 0.1, 1.395), (0.075, s * 0.145, 1.42), (0.045, s * 0.17, 1.46)], **STRONG)
    G([(0.11, s * 0.066, 1.385), (0.112, s * 0.064, 1.25), (0.105, s * 0.058, 1.12), (0.095, s * 0.045, 1.04)], **SOFT)
    G([(0.07, s * 0.122, 1.08), (0.09, s * 0.09, 1.02), (0.1, s * 0.055, 0.96)], **SOFT)

# back: the spine, faint between the shoulder blades and deep between the
# muscles of the lower back; each shoulder blade's inner edge
# and the ridge across its top; the lat's edge, up into the armpit; the glute
# fold. Without them the back was one smooth slab.
G([(-0.09, 0, 1.58), (-0.115, 0, 1.48), (-0.12, 0, 1.36)], **SOFT)
G([(-0.12, 0, 1.36), (-0.11, 0, 1.22), (-0.1, 0, 1.1), (-0.1, 0, 1.02)], **LINE)
for s in (1, -1):
    G([(-0.12, s * 0.045, 1.55), (-0.125, s * 0.05, 1.45), (-0.12, s * 0.06, 1.37), (-0.11, s * 0.09, 1.32)], **LINE)
    G([(-0.11, s * 0.06, 1.53), (-0.08, s * 0.14, 1.555), (-0.045, s * 0.185, 1.575)], **SOFT)
    G([(-0.1, s * 0.04, 1.18), (-0.085, s * 0.1, 1.23), (-0.06, s * 0.145, 1.31), (-0.035, s * 0.168, 1.4)], **LINE)
    G([(-0.11, s * 0.03, 0.87), (-0.11, s * 0.07, 0.86), (-0.095, s * 0.11, 0.875)], **STRONG)

# arms: the deltoid's edge front and back to where it inserts, and the line
# between biceps and triceps either side
for s in (1, -1):
    S, El, W = ARM[s]
    u, v, lat, ax = limb(S, El, s)
    ins = S + u * 0.17 + lat * 0.04
    G([S + v * 0.06 + u * 0.06, S + u * 0.1 + v * 0.055 + lat * 0.02, ins + v * 0.015], **LINE)
    G([S - v * 0.06 + u * 0.06, S + u * 0.1 - v * 0.055 + lat * 0.02, ins - v * 0.015], **LINE)
    G([S + u * 0.17 + lat * 0.05, S + u * 0.25 + lat * 0.045, El + lat * 0.035 - u * 0.01], **LINE)
    G([S + u * 0.1 - lat * 0.04, S + u * 0.2 - lat * 0.045, El - lat * 0.035], **LINE)
    u, v, lat, ax = limb(El, W, s)

# legs: the teardrop over the knee, and where the calf ends
for s in (1, -1):
    Hj, K, A = LEG[s]
    u, v, lat, ax = limb(Hj, K, s)
    L = lambda t: lerp(Hj, K, t)
    G([L(0.62) + v * 0.065 - lat * 0.015, L(0.78) + v * 0.05 - lat * 0.04, L(0.93) + v * 0.035 - lat * 0.038], **LINE)
    u, v, lat, ax = limb(K, A, s)
    L = lambda t: lerp(K, A, t)
    G([L(0.45) - v * 0.03 + lat * 0.04, L(0.53) - v * 0.05, L(0.45) - v * 0.03 - lat * 0.04], **SOFT)


def build():
    import bpy
    bpy.ops.wm.read_factory_settings(use_empty=True)
    verts, quads = F.mesh()
    return sc.to_blender('body', verts, quads)


SHORTS_HEM, SHORTS_WAIST, SHORTS_HALF = 0.8, 1.075, 0.25


def shorts():
    """Fight shorts: the body's own surface pushed out 7 mm and cut flat at
    the waistband and at both hems, so the edges are clean lines that move with
    the legs, where painting the body's faces left a ragged edge."""
    Y = F.lo[1] + np.arange(F.n[1]) * F.h
    Z = F.lo[2] + np.arange(F.n[2]) * F.h
    shell = sc.Field(F.lo, F.lo + (F.n - 1) * F.h, F.h)
    d = F.d - np.float32(0.007)
    np.maximum(d, np.maximum(Z - SHORTS_WAIST, SHORTS_HEM - Z).astype(np.float32)[None, None, :], out=d)
    np.maximum(d, (np.abs(Y) - SHORTS_HALF).astype(np.float32)[None, :, None], out=d)
    shell.d = d
    verts, quads = shell.mesh()
    return sc.to_blender('shorts', verts, quads, smooth=1)


if __name__ == '__main__' and '--rig' in ARGS:
    pass       # handled below, once everything is defined
elif __name__ == '__main__':
    import time
    t0 = time.time()
    obj = build()
    print(f'[jeff] {len(obj.data.vertices)} vertices, {len(obj.data.polygons)} faces in {time.time() - t0:.1f} s', flush=True)
    import bpy
    if OUT:
        bpy.ops.object.select_all(action='SELECT')
        bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True)
    if VIEWS:
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        import clay
        clay.views([obj], VIEWS, 'jeff')


# ================================================================ into the game
# The live 3D renderer poses a model from the 2D pose through the founder's
# skeleton contract (build_founder.py): the same joint names, the body facing
# +x, his left on +y. Jeff keeps his own joint positions, measured from his
# sculpt; models3d.js says where his leaf bones end and how to fit him.
def joints():
    J = {'hip': V(0, 0, 0.98), 'spine': V(0, 0, 1.12), 'chest': V(0, 0, 1.32),
         'neck': V(0, 0, 1.585), 'head': V(0, 0, 1.7), 'head_top': V(0, 0, 1.955)}
    for side, s in (('R', -1), ('L', 1)):
        S, El, W = ARM[s]
        fist = W + sc.unit(El - S) * 0.052
        J.update({'shoulder.' + side: S, 'elbow.' + side: El, 'fist.' + side: fist,
                  'grip.' + side: fist, 'grip_tip.' + side: fist + V(0.1, 0, 0)})
        Hj, K, A = LEG[s]
        J.update({'hipj.' + side: Hj, 'knee.' + side: K, 'ankle.' + side: A, 'toe.' + side: A + V(0.18, 0, -0.065)})
    return J


BONES = [('hips', 'hip', 'spine', None), ('spine', 'spine', 'chest', 'hips'),
         ('chest', 'chest', 'neck', 'spine'), ('neck', 'neck', 'head', 'chest'), ('head', 'head', 'head_top', 'neck')]
for _s in ('R', 'L'):
    BONES += [('upper_arm.' + _s, 'shoulder.' + _s, 'elbow.' + _s, 'chest'),
              ('forearm.' + _s, 'elbow.' + _s, 'fist.' + _s, 'upper_arm.' + _s),
              ('thigh.' + _s, 'hipj.' + _s, 'knee.' + _s, 'hips'),
              ('shin.' + _s, 'knee.' + _s, 'ankle.' + _s, 'thigh.' + _s),
              ('foot.' + _s, 'ankle.' + _s, 'toe.' + _s, 'shin.' + _s)]
BONES += [('grip.L', 'grip.L', 'grip_tip.L', 'forearm.L'), ('grip.R', 'grip.R', 'grip_tip.R', 'forearm.R')]


def skin_weights(verts, edges, J):
    """Weights by distance to each bone, among the nearest bone and those
    joined to it (so a forearm never pulls on the chest), three at most,
    then smoothed over the mesh so the joints bend without creasing. A vertex
    never takes a limb bone from the other side, or the thighs web together."""
    names = [b[0] for b in BONES if not b[0].startswith('grip')]
    parent = {b[0]: b[3] for b in BONES}
    seg = {b[0]: [(J[b[1]], J[b[2]])] for b in BONES}
    # The skeleton has no collarbones, so the chest reaches out along where
    # they would be, most of the way to each shoulder: by distance to its own
    # bone alone, the traps went to the neck and the upper arms, and rose and
    # fell with every nod and swing of the arm, a lump at the side of the neck.
    for s in (1, -1):
        seg['chest'].append((J['neck'], V(-0.015, s * 0.15, 1.62)))
    D = np.empty((len(verts), len(names)))
    for i, n in enumerate(names):
        D[:, i] = np.inf
        for a, b in seg[n]:
            ab = b - a
            t = np.clip(((verts - a) @ ab) / (ab @ ab), 0, 1)
            D[:, i] = np.minimum(D[:, i], np.linalg.norm(verts - (a + t[:, None] * ab), axis=1))
        if n.endswith('.L'):
            D[verts[:, 1] < -0.02, i] = np.inf
        if n.endswith('.R'):
            D[verts[:, 1] > 0.02, i] = np.inf
    near = np.zeros((len(names), len(names)), bool)
    for i, n in enumerate(names):
        for j, m in enumerate(names):
            near[i, j] = n == m or parent[n] == m or parent[m] == n
    D[~near[np.argmin(D, axis=1)]] = np.inf
    W = np.where(np.isfinite(D), 1.0 / (D + 0.02) ** 4, 0.0)

    def top3(W):
        cut = np.sort(W, axis=1)[:, -3][:, None]
        W = np.where(W >= cut, W, 0.0)
        return W / np.maximum(W.sum(1, keepdims=True), 1e-12)

    W = top3(W)
    a, b = edges[:, 0], edges[:, 1]
    deg = np.bincount(np.concatenate([a, b]), minlength=len(verts))[:, None]
    for _ in range(3):
        acc = np.zeros_like(W)
        np.add.at(acc, a, W[b])
        np.add.at(acc, b, W[a])
        W = top3(0.5 * W + 0.5 * acc / np.maximum(deg, 1))
    return names, W


def hide_under_shorts(obj):
    """Removes the skin the shorts cover, a little inside their hems. Left in,
    it showed through them wherever a bent leg or a turned waist moved the two
    surfaces apart by more than the 7 mm between them, as patches of skin on
    the shorts. The shorts are a closed solid, so nothing shows through the
    hole."""
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    lo, hi = SHORTS_HEM + 0.015, SHORTS_WAIST - 0.015
    gone = [f for f in bm.faces
            if all(lo < v.co.z < hi and abs(v.co.y) < SHORTS_HALF - 0.01 for v in f.verts)]
    bmesh.ops.delete(bm, geom=gone, context='FACES')
    bm.to_mesh(obj.data)
    bm.free()


def export_rigged(path, tris=40000):
    """Jeff as a game model: decimated, in shorts, weighted to the skeleton."""
    import bpy
    obj = build()
    pants = shorts()
    hide_under_shorts(obj)
    for ob, n in ((obj, tris * 0.86), (pants, tris * 0.14)):
        dec = ob.modifiers.new('Decimate', 'DECIMATE')
        dec.ratio = n / (2 * len(ob.data.polygons))
        with bpy.context.temp_override(object=ob, active_object=ob, selected_objects=[ob]):
            bpy.ops.object.modifier_apply(modifier=dec.name)
    # materials by palette role: skin, and the shorts in his trousers' colour
    for ob, role, colour in ((obj, 'skin', (0.75, 0.42, 0.25, 1)), (pants, 'pants', (0.03, 0.035, 0.06, 1))):
        m = bpy.data.materials.new(role)
        m.use_nodes = True
        m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = colour
        m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 1.0
        ob.data.materials.append(m)
    with bpy.context.temp_override(active_object=obj, selected_editable_objects=[obj, pants], selected_objects=[obj, pants]):
        bpy.ops.object.join()
    me = obj.data
    me.shade_smooth()
    J = joints()
    co = np.zeros(len(me.vertices) * 3)
    me.vertices.foreach_get('co', co)
    ed = np.zeros(len(me.edges) * 2, dtype=np.int64)
    me.edges.foreach_get('vertices', ed)
    names, W = skin_weights(co.reshape(-1, 3), ed.reshape(-1, 2), J)
    groups = {n: obj.vertex_groups.new(name=n) for n in names}
    for i, n in enumerate(names):
        idx = np.nonzero(W[:, i] > 0.01)[0]
        for vi, w in zip(idx.tolist(), W[idx, i].tolist()):
            groups[n].add([vi], w, 'REPLACE')
    arm = bpy.data.armatures.new('rig')
    rig = bpy.data.objects.new('rig', arm)
    bpy.context.scene.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    for name, hj, tj, par in BONES:
        eb = arm.edit_bones.new(name)
        eb.head, eb.tail = tuple(J[hj]), tuple(J[tj])
        if par:
            eb.parent = arm.edit_bones[par]
    bpy.ops.object.mode_set(mode='OBJECT')
    mod = obj.modifiers.new('Armature', 'ARMATURE')
    mod.object = rig
    obj.parent = rig
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=False,
        export_skins=True, export_animations=False, export_morph=False,
        export_materials='EXPORT', export_texcoords=False, export_yup=True,
        export_apply=False, export_def_bones=False,
    )
    print(f'[jeff] rigged: {len(me.polygons)} faces, {os.path.getsize(path)} bytes -> {path}', flush=True)


if __name__ == '__main__' and '--rig' in ARGS:
    export_rigged(OUT)
