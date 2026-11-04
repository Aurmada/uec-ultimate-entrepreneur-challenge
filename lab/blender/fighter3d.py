"""The sculpted fighters (November 2026): one pipeline for the whole roster,
each fighter built the same way from their own game data. Jeff was the first,
remodelled from scratch one stage at a time with the owner (HANDOFF); this is
his build made general, so the others follow without starting over.

    python lab/blender/fighter3d.py -- bozo --rig             # assets/models/sculpt/bozo.glb (or --out <path>)
    python lab/blender/fighter3d.py -- bozo --views <dir>     # the body in clay, four views
    python lab/blender/fighter3d.py -- --cast <dir> max kai bozo   # several, at their game heights
                                                    # (--engine CYCLES to light them for review)

A fighter is:

- their build: the body below, scaled by their own knobs in
  src/data/fighters.js (`figure`: muscle, chest, waist, belly, neck, jaw;
  `body`: shoulders), read from the game itself, so the 2D and 3D fighters are
  the same person (`Build`), at their own size and proportions (`Frame`:
  `body` height, stride, head and build), with the fat they carry (the
  2D `belly`) laid on where a man carries it, not only on the belly (`fat`);
- their head, eyewear and design notes: lab/blender/fighters/<id>.py, an
  original face built to their character notes, never a likeness;
- their clothes, from the game's `outfit` (`OUTFITS`), in their palette;
- their painted face, in game: src/engine/gl3d/faces3d.js, from their 2D face
  values, on the layout their model records (src/data/models3d.js).

Jeff's knobs are the reference: every factor of his build is exactly 1, so he
comes out exactly as he was sculpted.

The body is a man's. The women of the cast (`figure.frame` 'f') need a base
of their own, as the 2D figure has; that comes with the first of them.

Coordinates are the model contract's (build_founder.py): model units, z up,
facing +x, the fighter's left (.L) on +y. Arms hang at 45 degrees. About 7.5
heads tall: crown 1.955, chin 1.69. The crotch at half the height, the nipples
a head below the chin, the navel two; limbs that taper hard.
"""

import importlib
import json
import math
import os
import subprocess
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
import sculpt as sc  # noqa: E402

# How tightly forms meet. A crease between two muscles is a few millimetres;
# a muscle sitting into the mass under it a little more; a limb growing out of
# the trunk a few centimetres.
CREASE, SEAT, JOIN = 0.007, 0.014, 0.03

V = lambda *a: np.array(a, float)
lerp = lambda a, b, t: a + (b - a) * t
D45 = math.sqrt(0.5)

# The fighter being built, set by sculpt(): its field, limb joints, build and
# frame (their size and proportions).
F = None
ARM, LEG = {}, {}
B = None
FR = None
GAME = {}


# ================================================================ the fighter
def game_data(fid):
    """The fighter as the game has them, read from src/data/fighters.js."""
    js = (f"import {{ getFighter }} from '{ROOT}/src/data/fighters.js';"
          f"const d = getFighter('{fid}');"
          "console.log(JSON.stringify({ id: d.id, name: d.name, figure: d.figure || {}, body: d.body || {},"
          " face: d.face || {}, outfit: d.outfit, accessory: d.accessory, eyewear: d.eyewear,"
          " hairStyle: d.hairStyle, c: d.c }));")
    out = subprocess.run(['node', '--input-type=module', '-e', js], capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


# Jeff's knobs, the reference every factor is measured from. He is built
# 1.955 tall at his game height; the game draws each fighter at their own.
REF = {'muscle': 1.6, 'chest': 1.3, 'waist': 0.92, 'neck': 1.35, 'jaw': 1.1, 'shoulders': 1.2, 'height': 0.92}


class Build:
    """How far a fighter's body is from Jeff's, as factors on the sculpt's
    masses: 1 is Jeff. Each knob moves only part of the way its ratio says (the
    gains), since the 2D figure's knobs are drawn exaggerated."""

    def __init__(self, data):
        f, b = data.get('figure') or {}, data.get('body') or {}
        r = lambda k, v, gain: 1 + gain * (v / REF[k] - 1)
        self.muscle = r('muscle', f.get('muscle', 1), 0.35)     # the muscle bellies
        self.chest = r('chest', f.get('chest', 1), 0.6)         # the ribcage
        self.waist = r('waist', f.get('waist', 1), 1.0)         # the belly and flanks, across
        self.neck = r('neck', f.get('neck', 1), 0.5)
        self.jaw = r('jaw', f.get('jaw', 1), 0.6)
        self.shoulders = r('shoulders', b.get('shoulders', 1), 0.5)
        self.belly = f.get('belly', 0)
        # How much fat they carry. The 2D figure has one knob for it, the belly,
        # but fat is never only there (`fat`).
        self.fat = self.belly
        self.frame = f.get('frame', 'm')
        # how deep definition is carved: a soft body shows less of it, fat
        # covers more of it, and a belly hides the abs altogether
        self.definition = min(1.0, max(0.25, f.get('muscle', 1) / REF['muscle'])) * (1 - 0.9 * self.fat)
        self.abs = self.definition * max(0.0, 1 - 2 * self.belly)

    def girth(self, z):
        """How much wider (y) and deeper (x) than Jeff's the trunk is at height
        z: the hips as his, the waist's factor over the belly, the chest's over
        the ribcage, eased between them. Deeper only half as far: a broad chest
        is mostly broad."""
        ease = lambda a, b: (lambda t: t * t * (3 - 2 * t))(min(1.0, max(0.0, (z - a) / (b - a))))
        gy = 1 + (self.waist - 1) * ease(0.98, 1.12)
        gy = gy + (self.chest - gy) * ease(1.24, 1.38)
        return 1 + (gy - 1) * 0.5, gy


class Frame:
    """The fighter's size and proportions against Jeff's, as the game draws
    them (engine/proportions.js): legs as long as their `stride` makes them,
    the trunk, neck and arms by `height`, the head by `head` and their size
    together (as the 2D head is sized for the body under it), and every width
    by their size and `build`. Everything is built in Jeff's space and then
    warped to theirs (`warp`), meshes and joints alike, so no part of the
    build needs to know. The game's rig draws a sculpt's own trunk and head,
    but stretches its legs by the stride; `fit.legs` tells it they are built
    long already."""

    REF = {'height': 0.92, 'stride': 0.92, 'build': 1.14, 'head': 1.12}
    # where the legs end, the neck begins and the head begins. The neck is as
    # long as the head makes it and as thick as the trunk: lengthened with the
    # trunk, a tall fighter's neck stretched into a stalk under a small head.
    HIP, NECK_L, NECK, BAND = 0.955, 1.6, 1.70, 0.03

    def __init__(self, data):
        b = data.get('body') or {}
        g = lambda k: b.get(k, 1) / self.REF[k]
        self.size = g('height')
        self.legs = g('stride')
        self.wide = self.size * (1 + 0.5 * (g('build') - 1))
        self.head = g('head') * self.size
        self.identity = all(abs(v - 1) < 1e-12 for v in (self.size, self.legs, self.wide, self.head))
        # how much each height is lengthened and widened, eased across the
        # two boundaries, and the lengthening summed into a map of heights
        z = np.linspace(-0.1, 2.2, 23001)
        ease = lambda c: (lambda t: t * t * (3 - 2 * t))(np.clip((z - c + self.BAND) / (2 * self.BAND), 0, 1))
        sz = self.legs + (self.size - self.legs) * ease(self.HIP) + (self.head - self.size) * ease(self.NECK_L)
        self._w = self.wide + (self.head - self.wide) * ease(self.NECK)
        zp = np.concatenate([[0], np.cumsum((sz[1:] + sz[:-1]) / 2 * np.diff(z))])
        self._z, self._zp = z, zp - np.interp(0.0, z, zp)

    def warp(self, P):
        """Points in Jeff's space to the fighter's."""
        P = np.array(P, float)
        if self.identity:
            return P
        w = np.interp(P[..., 2], self._z, self._w)
        P[..., 2] = np.interp(P[..., 2], self._z, self._zp)
        P[..., 0] *= w
        P[..., 1] *= w
        return P

    def warp_mesh(self, obj):
        if self.identity:
            return
        co = np.zeros(len(obj.data.vertices) * 3)
        obj.data.vertices.foreach_get('co', co)
        obj.data.vertices.foreach_set('co', self.warp(co.reshape(-1, 3)).ravel())
        obj.data.update()


def scaled(r, *k):
    return tuple(a * b for a, b in zip(r, k))


def warped(c, r=None):
    """A trunk mass moved and sized to the fighter's girth where it sits."""
    gx, gy = B.girth(c[2])
    c = V(c[0] * gx, c[1] * gy, c[2])
    return c if r is None else (c, (r[0] * gx, r[1] * gy, r[2]))


def TE(c, r, axes=None, k=CREASE):
    E(*warped(c, r), axes, k=k)


def TC(a, b, r1, r2, k=SEAT, flat=None):
    g = lambda p: sum(B.girth(p[2])) / 2
    C(warped(a), warped(b), r1 * g(a), r2 * g(b), k=k, flat=flat)


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


class Placeholder:
    """A plain head for a fighter whose own is not designed yet: skull, jaw,
    ears and a nose to show which way it faces, and no face. Only so their
    body can be looked at; --rig refuses it."""

    @staticmethod
    def head(fx):
        E, V = fx.E, fx.V
        E(V(0.02, 0, 1.738), (0.075, 0.058 * fx.B.jaw, 0.046), k=0.012)
        E(V(-0.01, 0, 1.86), (0.1, 0.082, 0.097), k=0.02)
        E(V(0.042, 0, 1.8), (0.055, 0.064, 0.08), k=0.03)
        fx.C(V(0.09, 0, 1.835), V(0.1, 0, 1.795), 0.007, 0.009, k=0.016)
        for s in (1, -1):
            E(V(-0.006, s * 0.084, 1.825), (0.022, 0.011, 0.03), fx.sc.rot(ry=-10), k=0.01)

    @staticmethod
    def head_definition(fx):
        pass


def design(fid):
    """The fighter's own module (lab/blender/fighters/<id>.py), or the
    placeholder head while they have none."""
    try:
        return importlib.import_module(f'fighters.{fid}')
    except ModuleNotFoundError as e:
        if e.name != f'fighters.{fid}':
            raise
        return Placeholder


def sculpt(fid, h=0.003):
    """The fighter's body and head into the field F, in Jeff's space (the
    frame FR takes the meshes made from it to theirs)."""
    global F, B, FR, GAME
    data = game_data(fid)
    spec = design(fid)
    GAME = data
    B = Build(data)
    FR = Frame(data)
    _LOOSE.clear()
    F = sc.Field(lo=(-0.22, -0.74, -0.01), hi=(0.30, 0.74, 1.985), h=h)
    trunk()
    neck()
    spec.head(sys.modules[__name__])
    arms()
    legs()
    fat()
    definition(spec)
    return data, spec


# ================================================================ masses
# First the masses, blended broadly the way skin runs over them, so the
# silhouette is right before any detail: a deep chest, a waist that narrows
# under the lats, round shoulders, limbs that taper. Definition comes after,
# carved in (see "definition").
def trunk():
    # The ribcage, belly and hips, and the muscles over them, sized and placed
    # by the fighter's girth at their height (TE, TC): a narrower chest brings
    # its pecs, armpits and lats in with it. Sized alone, they stood out from
    # it in ridges. What runs out to the shoulders is placed by the shoulders.
    m, sh = B.muscle, B.shoulders
    TE(V(-0.006, 0, 1.425), (0.132, 0.162, 0.18), k=0.04)
    TE(V(0.0, 0, 1.54), (0.095, 0.145, 0.075), k=0.04)
    TE(V(0.012, 0, 1.2), (0.096, 0.122, 0.15), k=0.05)
    TE(V(0.0, 0, 1.0), (0.104, 0.155, 0.1), k=0.05)
    TE(V(-0.08, 0, 1.47), (0.032, 0.078, 0.1), k=0.03)
    for s in (1, -1):
        TE(V(0.076, s * 0.078, 1.47), scaled((0.06, 0.098, 0.072), m, m, m), sc.rot(rx=s * 12), k=0.03)    # pectoral
        TE(V(0.03, s * 0.158, 1.49), (0.045, 0.055, 0.055), k=0.03)                      # into the armpit
        # The pec's outer edge runs on into the arm as the fold at the front of the
        # armpit: a pec that just ended rounded into a hanging lobe as the arm moved.
        C(warped(V(0.055, s * 0.15, 1.46)), V(0.025, s * 0.205 * sh, 1.5), 0.028, 0.022, k=0.03)
        TE(V(0.01, s * 0.103, 1.13), scaled((0.07, 0.04, 0.085), m, m, 1), k=0.04)      # obliques
        TC(V(-0.035, s * 0.15, 1.47), V(-0.05, s * 0.095, 1.18), 0.065 * m, 0.035 * m, k=0.04)   # lats
        # The traps run from the neck right out to the point of the shoulder, over a
        # solid shoulder girdle, and taper there onto the top of the deltoid. Short
        # and stopping above the shoulder, as they were, they left a notch and the
        # deltoid stood up beyond it as a ball.
        C(V(-0.03, s * 0.08, 1.58), V(-0.02, s * 0.19 * sh, 1.56), 0.05, 0.04, k=0.04)
        C(V(-0.03, s * 0.064, 1.636), V(-0.015, s * 0.205 * sh, 1.598), 0.046 * m, 0.028 * m, k=0.045)  # traps
        TE(V(-0.088, s * 0.08, 1.44), scaled((0.04, 0.075, 0.09), m, 1, 1), k=0.035)    # shoulder blade
        TE(V(-0.1, s * 0.115, 1.43), scaled((0.03, 0.055, 0.06), m, m, m), k=0.025)      # infraspinatus, on the blade
        TE(V(-0.07, s * 0.16, 1.4), scaled((0.03, 0.04, 0.032), m, m, m), k=0.025)       # teres, from the blade to the armpit
        TE(V(-0.08, s * 0.03, 1.2), scaled((0.03, 0.032, 0.16), m, m, 1), k=0.03)        # erectors
        TE(V(-0.05, s * 0.07, 0.955), scaled((0.066, 0.076, 0.088), m, m, m), sc.rot(rx=s * 8), k=0.04)   # glutes
    if B.belly > 0:
        # a belly over the abs, hanging forward of them: Jeff has none. Blended
        # broadly up into the chest and round into the flanks: met tightly, it
        # stood off the body as a ball.
        b = B.belly
        E(V(0.035 + 0.03 * b, 0, 1.11), (0.075 + 0.04 * b, (0.105 + 0.03 * b) * B.waist, 0.13 + 0.02 * b), k=0.09)


def neck():
    """The column, the two muscles down its front to the notch between the
    collarbones, and the collarbones. The notch is kept wide: a narrow slot there
    let the ink outline show through as a black fleck at the base of the neck."""
    n, sh = B.neck, B.shoulders
    C(V(-0.014, 0, 1.58), V(-0.01, 0, 1.75), 0.078 * n, 0.061 * n, k=0.035)
    for s in (1, -1):
        C(V(-0.025, s * 0.052, 1.765), V(0.042, s * 0.024, 1.6), 0.015, 0.011, k=0.02)
        C(V(0.042, s * 0.018, 1.588), V(0.0, s * 0.175 * sh, 1.605), 0.008, 0.008, k=0.02)


def arms():
    # the limbs' cores thin a little with less muscle, as well as the muscle on them
    m = B.muscle
    mc = 1 + 0.4 * (m - 1)
    for s in (1, -1):
        S = V(0.0, s * 0.2 * B.shoulders, 1.555)
        d = V(0, s * D45, -D45)
        El = S + d * 0.315
        W = El + d * 0.265
        ARM[s] = (S, El, W)
        u, v, lat, ax = limb(S, El, s)
        E(S, (0.055, 0.055, 0.055), k=0.03)
        E(S + u * 0.062 + lat * 0.03, scaled((0.11, 0.08, 0.068), 1, m, m), ax, k=0.03)    # deltoid, its top under the traps' end
        C(S, El, 0.062 * mc, 0.044 * mc, k=0.025)
        E(S + u * 0.18 + v * 0.032, scaled((0.115, 0.052, 0.05), 1, m, m), ax, k=0.025)    # biceps
        E(S + u * 0.13 - v * 0.038, scaled((0.135, 0.056, 0.054), 1, m, m), ax, k=0.025)   # triceps
        E(El, (0.042, 0.04, 0.042), ax, k=0.02)
        E(El - v * 0.032, (0.018, 0.018, 0.018), k=0.012)
        u, v, lat, ax = limb(El, W, s)
        C(El, W, 0.056 * mc, 0.034 * mc, k=0.02, flat=(lat, 0.8))
        E(El + u * 0.08 + v * 0.008, scaled((0.13, 0.06, 0.058), 1, m, m), ax, k=0.03)     # forearm muscles
        E(El + u * 0.07 + v * 0.022 + lat * 0.018, scaled((0.1, 0.034, 0.034), 1, m, m), ax, k=0.025)  # brachioradialis, the thumb side
        E(W, (0.022, 0.032, 0.024), ax, k=0.015)
        # a fist, palm toward the thigh: the back of the hand, a row of knuckles,
        # four fingers curled into the palm, the thumb across them
        F.add(sc.Box(W + u * 0.052, (0.054, 0.051, 0.027), 0.018, ax), 0.012)
        for o in (-0.036, -0.012, 0.012, 0.036):
            E(W + u * 0.103 + v * o + lat * 0.004, (0.015, 0.0135, 0.016), ax, k=0.004)
            C(W + u * 0.103 + v * o - lat * 0.01, W + u * 0.082 + v * o - lat * 0.036, 0.0135, 0.0125, k=0.004)
        C(W + u * 0.022 + v * 0.042 - lat * 0.011, W + u * 0.07 + v * 0.036 - lat * 0.043, 0.0145, 0.0125, k=0.006)


def legs():
    m = B.muscle
    mc = 1 + 0.4 * (m - 1)
    for s in (1, -1):
        Hj = V(0.0, s * 0.095, 0.955)
        K = V(0.012, s * 0.1, 0.52)
        A = V(-0.008, s * 0.105, 0.085)
        LEG[s] = (Hj, K, A)
        u, v, lat, ax = limb(Hj, K, s)
        # the core a little oval and set out from the middle, so the thighs part
        # below the crotch: fused down to mid-thigh, they tore when the legs moved
        C(Hj + lat * 0.01, K + lat * 0.004, 0.105 * mc, 0.06 * mc, k=0.045, flat=(lat, 0.85))
        E(lerp(Hj, K, 0.45) + v * 0.036 + lat * 0.028, scaled((0.22, 0.08, 0.078), 1, m, m), ax, k=0.035)  # quadriceps
        E(lerp(Hj, K, 0.48) + v * 0.008 + lat * 0.062, scaled((0.2, 0.05, 0.056), 1, m, m), ax, k=0.035)  # the outer sweep
        E(lerp(Hj, K, 0.25) - lat * 0.036, (0.17, 0.062, 0.045), ax, k=0.035)          # adductors
        E(lerp(Hj, K, 0.45) - v * 0.04, scaled((0.22, 0.064, 0.062), 1, m, m), ax, k=0.035)  # hamstrings
        E(lerp(Hj, K, 0.8) + v * 0.02 - lat * 0.036, scaled((0.09, 0.045, 0.048), 1, m, m), ax, k=0.02)  # vastus medialis
        E(K, (0.046, 0.048, 0.05), ax, k=0.025)
        E(K + v * 0.043 + V(0, 0, 0.012), (0.022, 0.02, 0.026), ax, k=0.012)          # kneecap
        u, v, lat, ax = limb(K, A, s)
        C(K, A, 0.056 * mc, 0.043 * mc, k=0.025)
        E(lerp(K, A, 0.3) - v * 0.04, scaled((0.15, 0.064, 0.07), 1, m, m), ax, k=0.03)                 # calf
        E(lerp(K, A, 0.3) - v * 0.03 - lat * 0.032, scaled((0.13, 0.052, 0.052), 1, m, m), ax, k=0.025)  # its inner head
        E(lerp(K, A, 0.26) - v * 0.03 + lat * 0.03, scaled((0.12, 0.048, 0.048), 1, m, m), ax, k=0.025)  # and outer
        E(lerp(K, A, 0.58) - v * 0.014, scaled((0.15, 0.046, 0.056), 1, m, m), ax, k=0.03)              # soleus, down to the ankle
        E(lerp(K, A, 0.35) + v * 0.02 + lat * 0.016, (0.14, 0.024, 0.024), ax, k=0.015)  # shin muscle
        C(lerp(K, A, 0.7) - v * 0.024, A - v * 0.034, 0.02, 0.015, k=0.018)            # Achilles
        for o in (-0.028, 0.028):
            E(A + lat * o, (0.019, 0.019, 0.019), k=0.012)
        E(A + V(-0.03, 0, -0.045), (0.046, 0.038, 0.04), k=0.026)
        F.add(sc.Box(A + V(0.06, 0, -0.058), (0.115, 0.047, 0.031), 0.026), 0.03)
        E(A + V(0.17, 0, -0.066), (0.035, 0.044, 0.018), k=0.014)


# ================================================================ fat
# Fat is never only on the belly, and it is not a lump laid on muscle. It
# lies over the whole body as a layer, filling the creases between the
# muscles and rounding their shapes away, and it gathers where a man carries
# it: most round the middle, the flanks and the lower back, then the chest,
# under the chin, the back of the neck, the upper arms and thighs, least on
# the forearms and calves. None on the hands, the feet or the face (the face
# is the fighter's own design). So, scaled by how much the fighter carries:
#
#   1. a layer over all of it (Field.thicken);
#   2. the regions where it gathers (FAT_M), each a smooth swell
#      (Field.swell), its thickness at full fat in metres;
#   3. all of it softened (Field.soften), so the muscles under it no longer
#      read one by one: laid only as swells, they did, and a heavy man read
#      as a muscled one with a gut.
#
# The belly's own mass (trunk) is the gut under it.
#
# A woman carries it differently, mostly on the hips, buttocks and thighs,
# the breasts and the backs of the upper arms, and less round the middle:
# her regions come with the women's base.
FAT_M = [
    # (centre, radii, thickness), mirrored where y is not 0
    ((0.1, 0, 1.15), (0.1, 0.16, 0.17), 0.045),         # over the belly
    ((0.0, 0.13, 1.08), (0.12, 0.085, 0.11), 0.08),     # the flanks, rolling over the hips
    ((-0.09, 0, 1.12), (0.07, 0.14, 0.13), 0.045),      # the lower back
    ((0.085, 0.075, 1.4), (0.065, 0.09, 0.085), 0.05),  # the chest, heaviest at the pec's lower edge
    ((0.115, 0, 1.43), (0.04, 0.05, 0.08), 0.025),      # and between them, so they read as one soft chest
    ((0.0, 0.15, 1.38), (0.075, 0.05, 0.1), 0.04),      # the side of the chest, under the arm
    ((-0.1, 0, 1.47), (0.07, 0.15, 0.13), 0.03),        # the upper back
    ((-0.06, 0, 1.64), (0.055, 0.08, 0.065), 0.03),     # the back of the neck
    ((0.055, 0, 1.695), (0.055, 0.07, 0.045), 0.022),   # under the chin
    ((-0.06, 0.085, 0.95), (0.085, 0.1, 0.1), 0.03),    # the seat
]


def covered(X, Y, Z):
    """Where fat lies (0 to 1): everywhere but the head, the hands and the
    feet, eased in so no edge shows. In Jeff's space, as the field is."""
    ease = lambda v, a, b: (lambda u: u * u * (3 - 2 * u))(np.clip((v - a) / (b - a), 0, 1))
    return (1 - ease(Z, 1.66, 1.73)) * ease(Z, 0.1, 0.17) * (1 - ease(np.abs(Y), 0.53, 0.6))


def fat():
    t = B.fat
    if t <= 0:
        return
    F.thicken(0.016 * t, covered)
    for c, r, d in FAT_M:
        for s in ((1, -1) if c[1] else (1,)):
            F.swell(V(c[0], s * c[1], c[2]), r, d * t)
    for s in (1, -1):
        S, El, W = ARM[s]
        u, v, lat, ax = limb(S, El, s)
        F.swell(S + u * 0.17 - v * 0.015, (0.16, 0.085, 0.085), 0.04 * t, ax)        # the upper arm, most at the back
        u, v, lat, ax = limb(El, W, s)
        F.swell(El + u * 0.09, (0.12, 0.06, 0.06), 0.012 * t, ax)                   # the forearm, a little
        Hj, K, A = LEG[s]
        u, v, lat, ax = limb(Hj, K, s)
        F.swell(lerp(Hj, K, 0.35), (0.27, 0.12, 0.12), 0.04 * t, ax)                # the thigh
        F.swell(lerp(Hj, K, 0.3) - lat * 0.05, (0.2, 0.07, 0.06), 0.018 * t, ax)    # and its inside, where they meet
        u, v, lat, ax = limb(K, A, s)
        F.swell(lerp(K, A, 0.3), (0.15, 0.07, 0.07), 0.01 * t, ax)                  # the calf, least
    # last, so the swells' own edges soften too: softened first, the chest's
    # lower edge stood out as a ledge over the belly
    F.soften(0.008 + 0.014 * t, lambda X, Y, Z: np.float32(min(1.0, 1.6 * t)) * covered(X, Y, Z))


# ================================================================ definition
# Carved, not added: each line is a shallow groove where two muscles meet,
# laid along the surface. This is what reads as muscle at game size, and it
# cannot bubble the way a form stuck on top does. A softer body is carved
# shallower (Build.definition).
STRONG = dict(depth=0.004, width=0.013, k=0.01)
LINE = dict(depth=0.003, width=0.01, k=0.008)
SOFT = dict(depth=0.002, width=0.011, k=0.008)


def G(points, depth, width, k, f=None):
    """A groove at the fighter's definition (or `f`): shallower, and blended
    tighter, so a faint line stays a faint line and not a soft trench. Under
    a fifth of Jeff's, none at all: so faint, it was only a hairline scored
    across a soft chest."""
    f = B.definition if f is None else f
    if f >= 0.2:
        F.groove(points, depth=depth * f, width=width, k=k * f)


def definition(spec):
    spec.head_definition(sys.modules[__name__])

    # chest and belly
    G([(0.13, 0, 1.55), (0.13, 0, 1.47), (0.125, 0, 1.405)], **STRONG)
    G([(0.122, 0, 1.385), (0.12, 0, 1.25), (0.115, 0, 1.08)], **LINE, f=B.abs)
    # The abs' rows and the lines down either side of them are soft: carved as
    # deep as the midline, they broke into scattered dark chips through the game's
    # flat light bands instead of reading as a six-pack.
    for z in (1.3, 1.235, 1.17):
        G([(0.11, -0.058, z + 0.006), (0.118, -0.03, z), (0.12, 0, z - 0.004), (0.118, 0.03, z), (0.11, 0.058, z + 0.006)], **SOFT, f=B.abs)
    for s in (1, -1):
        G([(0.12, s * 0.008, 1.4), (0.118, s * 0.05, 1.388), (0.105, s * 0.1, 1.395), (0.075, s * 0.145, 1.42), (0.045, s * 0.17, 1.46)], **STRONG)
        G([(0.11, s * 0.066, 1.385), (0.112, s * 0.064, 1.25), (0.105, s * 0.058, 1.12), (0.095, s * 0.045, 1.04)], **SOFT, f=B.abs)
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


# ================================================================ clothes
# Clothes are the body's own surface pushed out and cut to their edges, so
# they fit whoever wears them, wherever he is built up; the skin each one
# covers is removed (`hidden`), so none of it can show through as the pieces
# move apart. A fighter's `outfit` in the game picks the pieces (OUTFITS).
WAIST, SHIRT_HEM, VEST_HEM, CUFF, ANKLE = 1.03, 1.0, 0.985, 0.012, 0.105


def _grid(sl=(slice(None),) * 3):
    """Coordinates of the body's field samples, broadcastable, for a slab."""
    ax = [F.lo[k] + np.arange(F.n[k])[sl[k]] * F.h for k in range(3)]
    return (ax[0][:, None, None].astype(np.float32), ax[1][None, :, None].astype(np.float32),
            ax[2][None, None, :].astype(np.float32))


def _zslab(z0, z1):
    k0 = max(0, int((z0 - F.lo[2]) / F.h))
    k1 = min(F.n[2], int((z1 - F.lo[2]) / F.h) + 2)
    return (slice(None), slice(None), slice(k0, k1))


def _shell(off):
    out = sc.Field(F.lo, F.lo + (F.n - 1) * F.h, F.h)
    out.d = F.d - np.float32(off)
    return out


def _keep_below(d, z):
    """Keeps the solid below height z."""
    np.maximum(d, (_grid()[2] - np.float32(z)), out=d)


def _keep_above(d, z):
    np.maximum(d, (np.float32(z) - _grid()[2]), out=d)


def shirt():
    """Fitted, long sleeves to the wrists, a round neck with a V at the front,
    tucked into the trousers."""
    S = _shell(0.004)
    d = S.d
    _keep_above(d, SHIRT_HEM)
    for s in (1, -1):                                   # the cuffs
        _, El, W = ARM[s]
        n = sc.unit(W - El)
        c = W - n * CUFF
        X, Y, Z = _grid()
        np.maximum(d, (X - c[0]) * n[0] + (Y - c[1]) * n[1] + (Z - c[2]) * n[2], out=d)
    _keep_below(d, 1.72)                                # nothing above the collar
    sl = _zslab(1.45, 1.73)                             # the neck
    X, Y, Z = _grid(sl)
    r = np.sqrt((X + 0.012) ** 2 + Y ** 2)
    neck = np.maximum(r - 0.084, 1.57 - Z)
    v = np.maximum(np.abs(Y) - (Z - 1.5) * 0.55, 0.02 - X)
    d[sl] = np.maximum(d[sl], -np.minimum(neck, v))
    return S


def vest():
    """A quilted vest, two centimetres thick, open down the front, with a
    collar standing up round the back of the neck and armholes at the
    shoulders."""
    S = _shell(0.02)
    d = S.d
    _keep_above(d, VEST_HEM)
    _keep_below(d, 1.72)
    X, Y, Z = _grid()
    np.maximum(d, np.abs(Y) - np.float32(0.185 * B.shoulders), out=d)     # armholes
    sl = _zslab(0.95, 1.8)
    X, Y, Z = _grid(sl)
    r = np.sqrt((X + 0.012) ** 2 + Y ** 2)
    neck = np.maximum(r - 0.092, 1.55 - Z)
    opening = np.maximum(np.abs(Y) - (0.028 + np.maximum(Z - 1.32, 0) * 0.16), 0.03 - X)
    d[sl] = np.maximum(d[sl], -np.minimum(neck, opening))
    # quilting: the surface drawn in along a channel every 6.5 cm
    for zi in np.arange(1.06, 1.66, 0.065):
        sl = _zslab(zi - 0.02, zi + 0.02)
        Z = _grid(sl)[2]
        d[sl] += np.float32(0.0035) * np.exp(-((Z - np.float32(zi)) / np.float32(0.004)) ** 2)
    return S


# How each cut of trousers in the game (`figure.costume.legs`) falls: the
# radius of its drape at the top of the thigh, the knee and the hem; how far
# out to the side they may reach, past which the arms are (kept to the
# suit's, baggy legs were cut flat there, and the flats read as pockets); how
# the thigh's fall of cloth meets the shin's at the knee (blended, the wide
# baggy legs bulged in a ring there); and for a wide cut, its widest at
# mid-thigh, so it hangs clear of the thigh (narrower, the thigh's own shape
# broke through above the knee in round patches) without flaring out at the
# hips past the hem of a top.
LEG_CUTS = {
    'suit': dict(top=0.09, knee=0.076, hem=0.066, side=0.25, k=0.03),
    'baggy': dict(top=0.1, mid=0.118, knee=0.106, hem=0.092, side=0.33, k=0.0),
}


def trousers():
    """Trousers: the hips fitted, the legs falling straight from the thigh to a
    hem over the shoe, so they read as cloth and not as skin, as wide as their
    cut (`LEG_CUTS`)."""
    # Each leg's fall of cloth is its own, met with the other's without any
    # blending, and set a little out from the middle: blended, the two legs
    # webbed together down to the knees and tore into black spikes between
    # them whenever the legs moved apart.
    cut = LEG_CUTS.get(((GAME.get('figure') or {}).get('costume') or {}).get('legs'), LEG_CUTS['suit'])
    top, knee, hem, side = cut['top'], cut['knee'], cut['hem'], cut['side']
    S = _shell(0.004)
    for s in (1, -1):
        Hj, K, A = LEG[s]
        out = V(0, s * 0.01, 0)
        leg = sc.Field(F.lo, F.lo + (F.n - 1) * F.h, F.h)
        if 'mid' in cut:
            M = lerp(Hj, K, 0.45) + out
            leg.add(sc.RoundCone(Hj + out + V(0, 0, -0.01), M, top, cut['mid']), 0.0)
            leg.add(sc.RoundCone(M, K + out, cut['mid'], knee), cut['k'])
        else:
            leg.add(sc.RoundCone(Hj + out + V(0, 0, -0.01), K + out, top, knee), 0.03)
        leg.add(sc.RoundCone(K + out, V(A[0], A[1] + out[1], ANKLE), knee, hem), cut['k'])
        np.minimum(S.d, leg.d, out=S.d)
        del leg
    # a waistband standing clear of the shirt tucked into it: at the same
    # offset, the shirt showed through as white flecks along the belt line
    sl = _zslab(0.9, WAIST + 0.01)
    Z = _grid(sl)[2]
    S.d[sl] -= np.float32(0.004) * np.clip((Z - 0.9) / 0.05, 0, 1)
    # and a slot down the middle below the crotch, so they never meet there
    sl = _zslab(-0.01, 0.86)
    Y = _grid(sl)[1]
    S.d[sl] = np.maximum(S.d[sl], np.float32(0.004) - np.abs(Y))
    d = S.d
    _keep_below(d, WAIST)
    _keep_above(d, ANKLE - 0.004)
    X, Y, Z = _grid()
    np.maximum(d, np.abs(Y) - np.float32(side), out=d)
    return S


def shoes():
    """Shoes: the foot pushed out, the sole flat on the floor."""
    S = _shell(0.008)
    d = S.d
    _keep_below(d, ANKLE + 0.02)
    _keep_above(d, -0.006)
    X, Y, Z = _grid()
    np.maximum(d, np.float32(0.03) - np.abs(Y), out=d)
    return S


# An oversized hoodie (data/fighters.js `outfit: 'hoodie'`, the 2D figure's
# fit 'oversized'): it does not follow the body's forms but hangs from the
# shoulders and the chest, with ribbed cuffs and a ribbed band at the hem, a
# hood bunched round the back of the neck, drawstrings and a pouch pocket.
HOODIE_HEM, HOODIE_BAND = 0.975, 0.925
_LOOSE = {}


def _loose():
    """An oversized top's cloth: two centimetres out, its forms well blurred,
    the sleeves dropped a hand's width down the arm (see _drape)."""
    return _drape(0.022, 0.02, 0.02, 0.014, 0.012, 0.1)


def _drape(off_t, off_a, blur_t, blur_a, blur_after, drop, hang_back=True):
    """The body as cloth lies over it: its forms blurred away (`blur_t` on
    the trunk, `blur_a` on the arms, `blur_after` again once hung), `off_t`
    and `off_a` out, and below the chest falling straight down from the
    widest part above it, as cloth hangs. The trunk and the arms are made
    apart and met where the sleeve is set in, `drop` down the arm from the
    shoulder joint: blurred together, the cloth webbed from the arm to the
    side like a bat's wing, and the web, half on the arm and half on the
    chest, stretched into a fin whenever the arm came up. Without
    `hang_back` only the front hangs, as a tailored back follows the small
    of the back. Made once a fighter for each cut."""
    key = (off_t, off_a, blur_t, blur_a, blur_after, drop, hang_back)
    if key in _LOOSE:
        return _LOOSE[key]
    T, A = _shell(0.0), _shell(0.0)
    away = np.float32(0.04)
    for sl, X, Y, Z in F._slabs():
        arm = np.zeros(F.d[sl].shape, bool)
        for s in (1, -1):
            S, El, W = ARM[s]
            u = sc.unit(W - S)
            px, py, pz = X - S[0], Y - S[1], Z - S[2]
            t = px * u[0] + py * u[1] + pz * u[2]
            far = np.sqrt((px - t * u[0]) ** 2 + (py - t * u[1]) ** 2 + (pz - t * u[2]) ** 2)
            # the arm's, past where the sleeve is set in (a loose top's is
            # dropped a hand's width down: split at the joint, each of its
            # sleeves was a puff set on a vest) and nearer its axis than the
            # trunk's
            arm |= (s * Y > 0.08) & (t > drop) & (far < 0.6 * np.sqrt(X ** 2 + Y ** 2))
        d = F.d[sl]
        T.d[sl] = np.where(arm, np.maximum(d, away), d)
        A.d[sl] = np.where(arm, d, np.maximum(d, away))
    every = lambda X, Y, Z: np.float32(1)
    T.soften(blur_t, every)
    A.soften(blur_a, every)
    T.d -= np.float32(off_t)
    A.d -= np.float32(off_a)
    # the hang: each column under the chest takes the widest the cloth is
    # above it, eased out toward the sides, then softened again: hung outright
    # and cut off at the sides, it was a box with an edge down each side
    k0, k1 = max(0, int((0.88 - F.lo[2]) / F.h)), int((1.42 - F.lo[2]) / F.h) + 1
    j0, j1 = int((-0.2 - F.lo[1]) / F.h), int((0.2 - F.lo[1]) / F.h) + 1
    blk = T.d[:, j0:j1, k0:k1]
    hung = np.minimum.accumulate(blk[:, :, ::-1], axis=2)[:, :, ::-1]
    y = np.abs(F.lo[1] + np.arange(j0, j1) * F.h)
    w = (1 - np.clip((y - 0.15) / 0.05, 0, 1) ** 2).astype(np.float32)[None, :, None]
    if not hang_back:
        # hung from the shoulder blades, a jacket's back stood off the small of
        # the back, and leaning into his stance it folded there into a corner
        x = F.lo[0] + np.arange(T.d.shape[0]) * F.h
        w = w * np.clip((x + 0.06) / 0.06, 0, 1).astype(np.float32)[:, None, None]
    T.d[:, j0:j1, k0:k1] = blk + w * (hung - blk)
    T.soften(blur_after, every)
    np.minimum(T.d, A.d, out=T.d)
    del A
    _LOOSE[key] = T
    return T


def _cuff_cut(d, at, keep_wrist_side=False):
    """Cuts the field at a plane across each forearm, `at` short of the wrist:
    the hand side goes, or with keep_wrist_side only that side stays, and only
    round the arms (a plane alone would keep the far side of the body too)."""
    X, Y, Z = _grid()
    keep = np.float32(1)
    for s in (1, -1):
        _, El, W = ARM[s]
        n = sc.unit(W - El)
        c = W - n * at
        side = (X - c[0]) * n[0] + (Y - c[1]) * n[1] + (Z - c[2]) * n[2]
        if keep_wrist_side:
            # within reach of the forearm: the plane runs on through the body,
            # and kept wherever it went, it laid a cuff's patch on the thigh
            u = X - El[0], Y - El[1], Z - El[2]
            along = u[0] * n[0] + u[1] * n[1] + u[2] * n[2]
            near = (u[0] - along * n[0]) ** 2 + (u[1] - along * n[1]) ** 2 + (u[2] - along * n[2]) ** 2 < 0.1 ** 2
            keep = np.where((s * Y > 0.2) & near, -side, keep)
        else:
            np.maximum(d, side, out=d)
    if keep_wrist_side:
        np.maximum(d, keep, out=d)


def _neck_cut(d, r, z):
    sl = _zslab(z - 0.01, 1.8)
    X, Y, Z = _grid(sl)
    neck = np.maximum(np.sqrt((X + 0.012) ** 2 + Y ** 2) - r, z - Z)
    d[sl] = np.maximum(d[sl], -neck)


def hoodie():
    """The hoodie's body and sleeves, cut at the band and the cuffs."""
    S = _shell(0.0)
    S.d[:] = _loose().d
    d = S.d
    _keep_above(d, HOODIE_HEM)
    # the collar stops at the base of the neck: kept up to the shirt's line,
    # the loose cloth stood round the neck to the jaw like a turtleneck
    _keep_below(d, 1.645)
    _cuff_cut(d, CUFF + 0.045)
    # the neckline close round the neck: cut wider, the gap between the loose
    # collar and the neck showed its inside as a black band under the jaw
    _neck_cut(d, 0.088, 1.55)
    # the pouch pocket, a panel of cloth a few millimetres proud of the front,
    # following it round: a flat box on the curve stood out only at its ends
    sl = _zslab(0.98, 1.12)
    X, Y, Z = _grid(sl)
    panel = sc.Box(V(0.2, 0, 1.05), (0.2, 0.085, 0.046), 0.012).sdf(X, Y, Z).astype(np.float32)
    d[sl] = np.minimum(d[sl], np.maximum(d[sl] - np.float32(0.005), np.maximum(panel, -X)))
    return S


def hoodie_rib():
    """The ribbed parts, in the hoodie's second colour: the band at the hem a
    little tighter than the cloth above it, the cuffs, and the hood bunched
    round the back of the neck, laid on the hoodie wherever it is."""
    L = _loose()
    S = _shell(0.0)
    S.d[:] = L.d + np.float32(0.004)
    d = S.d
    _keep_above(d, HOODIE_BAND)
    _keep_below(d, HOODIE_HEM + 0.008)
    cuffs = _shell(0.014)
    _cuff_cut(cuffs.d, CUFF)
    _cuff_cut(cuffs.d, CUFF + 0.05, keep_wrist_side=True)
    np.minimum(d, cuffs.d, out=d)
    del cuffs
    # The hood, lying down: a layer of cloth over the upper back, its lower
    # edge a rounded U, and a soft roll round the neckline where it opens, on
    # the hoodie wherever it is, ending at the sides of the neck. Made as a
    # ring of beads alone, it read as a pillow round his neck; carried round
    # to the front, its ends rose under the chin like a beard.
    sl = _zslab(1.4, 1.75)
    X, Y, Z = _grid(sl)
    U = sc.Ellipsoid(V(-0.13, 0, 1.6), (0.12, 0.135, 0.16)).sdf(X, Y, Z).astype(np.float32)
    region = np.maximum(U, np.maximum(X + np.float32(0.035), Z - np.float32(1.66)))
    d[sl] = np.minimum(d[sl], np.maximum(L.d[sl] - np.float32(0.011), region))
    ring = []
    for a in np.radians(np.linspace(-80, 80, 27)):
        x, y = -0.012 - 0.1 * np.cos(a), 0.1 * np.sin(a)
        zs = np.arange(1.72, 1.5, -0.001)
        col = L.sample(np.stack([np.full_like(zs, x), np.full_like(zs, y), zs], axis=1))
        z = zs[np.argmax(col < 0)]
        r = 0.012 + 0.012 * np.cos(a / 2) ** 2
        ring.append((V(x, y, z + r * 0.4), r))
    S.add(sc.Union(sc.RoundCone(a, b, ra, rb) for (a, ra), (b, rb) in zip(ring, ring[1:])), 0.02)
    return S


def hoodie_strings():
    """Two drawstrings hanging from the front of the neckline down the cloth,
    in a fine field of their own: the body's samples are too coarse for a
    cord. Each lies on the hoodie wherever it is (projected onto it), or a
    straight cord went into the cloth hanging out over the chest."""
    H = _shell(0.0)
    H.d[:] = _loose().d
    _neck_cut(H.d, 0.088, 1.55)
    S = None
    for s in (1, -1):
        # from just off the chest: projected from much further, out where the
        # field was never written, they landed anywhere
        P = np.array([[0.17, s * (0.032 + 0.006 * t), 1.565 - 0.155 * t] for t in np.linspace(0, 1, 8)])
        P = H.project(P)
        P = P + H.normal(P) * 0.004
        if S is None:
            S = sc.Field(lo=P.min(0) - 0.03 - V(0, 0.08, 0), hi=P.max(0) + 0.03 + V(0, 0.08, 0), h=0.0012)
        S.add(sc.Union(sc.RoundCone(a, b, 0.0045, 0.0045) for a, b in zip(P, P[1:])), 0.0)
        S.add(sc.RoundCone(P[-1], P[-1] + V(0, 0, -0.02), 0.006, 0.006), 0.002)     # the tip
    return S


# A suit for a man who never takes it off (data/fighters.js `outfit:
# 'pinstripe'`, Carl's): a dress shirt with a closed collar and a tie, under
# a jacket buttoned over his paunch, its lapels in the suit's second colour,
# the shirt showing in the V above the button and at the cuffs. The jacket
# is the body as cloth lies over it, a centimetre out and its forms blurred
# a little (_drape), its sleeves set in near the shoulder; it falls to cover
# the seat. The pinstripes themselves are a pattern, which the toon renderer
# has no way to paint yet: the cloth is the suit's colour.
JACKET_HEM, BUTTON, LAPEL = 0.885, 1.2, 'suit*0.78'


def _jacket():
    """The jacket's cloth: the body as cloth lies over it (_drape), and never
    nearer the body than a centimetre. Draped alone it dipped where the
    sleeves are set in (each side blurred against the other's absence), and
    the shirt showed through at the shoulders."""
    if 'jacket' not in _LOOSE:
        J = _shell(0.0085)
        np.minimum(J.d, _drape(0.011, 0.01, 0.012, 0.008, 0.008, 0.04, hang_back=False).d, out=J.d)
        _LOOSE['jacket'] = J
    return _LOOSE['jacket']
_NECK_AXIS = -0.012                     # as _neck_cut's


def _vee(Z):
    """Half the width of the jacket's opening at height Z: shut at the button,
    opening up to the base of the neck."""
    return np.float32(0.01) + np.maximum(Z - np.float32(BUTTON), 0) * np.float32(0.26)


def _front(X):
    return np.float32(0.01) - X


def dress_shirt():
    """A dress shirt with a closed collar round the neck, long sleeves to the
    wrists, tucked in."""
    S = _shell(0.004)
    d = S.d
    _keep_above(d, SHIRT_HEM)
    _cuff_cut(d, CUFF)
    _keep_below(d, 1.6)
    # the collar round the neck only: a band of the body's height, it ran out
    # over the tops of the shoulders, too near the jacket there to be hidden
    # under it, and showed through it in flecks
    collar = _shell(0.007)
    _keep_above(collar.d, 1.58)
    _keep_below(collar.d, 1.655)
    sl = _zslab(1.57, 1.67)
    X, Y, Z = _grid(sl)
    collar.d[sl] = np.maximum(collar.d[sl], np.sqrt((X - _NECK_AXIS) ** 2 + Y ** 2) - np.float32(0.115))
    np.minimum(d, collar.d, out=d)
    del collar
    _neck_cut(d, 0.07, 1.6)
    return S


def jacket():
    """The jacket: open in a V from the button to the base of the neck, its
    collar standing round the back of the neck, and below the button its
    fronts parting over the paunch, as the 2D jacket's do; sleeves stopping
    short of the shirt's cuffs; the button at the bottom of the V."""
    S = _shell(0.0)
    S.d[:] = _jacket().d
    d = S.d
    _keep_above(d, JACKET_HEM)
    _keep_below(d, 1.642)                   # under the shirt's collar
    _cuff_cut(d, CUFF + 0.03)
    _neck_cut(d, 0.092, 1.58)
    sl = _zslab(JACKET_HEM - 0.02, 1.7)
    X, Y, Z = _grid(sl)
    vee = np.maximum(np.abs(Y) - _vee(Z), np.float32(BUTTON) - Z)
    parted = np.maximum(np.abs(Y) - (np.float32(BUTTON - 0.03) - Z) * np.float32(0.11), Z - np.float32(BUTTON - 0.03))
    opening = np.maximum(np.minimum(vee, parted), _front(X))
    d[sl] = np.maximum(d[sl], -opening)
    p = S.project(np.array([[0.16, 0.0, BUTTON - 0.016]]))[0]
    S.add(sc.Ellipsoid(p, (0.004, 0.009, 0.009)), 0.002)
    return S


def jacket_lapels():
    """The lapels and the collar: a band of the jacket's cloth a few
    millimetres proud of it down each side of the V, widening from the button
    to a notch under the collarbone, then the collar's narrower band on up
    and round the back of the neck; in the suit's colour in shade (LAPEL), as
    the 2D figure's are: in its second colour, nearly black on Carl, they
    read as a black stand-up collar."""
    J = jacket()                            # cut as it is: the cloth uncut ran on up the neck to the jaw
    S = _shell(0.0)
    S.d[:] = np.float32(1)
    sl = _zslab(BUTTON - 0.01, 1.68)
    X, Y, Z = _grid(sl)
    v = _vee(Z)
    w = np.where(Z < np.float32(1.5), np.float32(0.012) + (Z - np.float32(BUTTON)) * np.float32(0.16), np.float32(0.034))
    lapel = np.maximum(np.maximum(v - np.abs(Y), np.abs(Y) - v - w),
                       np.maximum(np.float32(BUTTON) - Z, _front(X)))
    collar = np.maximum(np.float32(1.585) - Z, np.sqrt((X - _NECK_AXIS) ** 2 + Y ** 2) - np.float32(0.118))
    S.d[sl] = np.maximum(J.d[sl] - np.float32(0.003), np.minimum(lapel, collar))
    return S


def tie():
    """The tie: a knot at the collar and a blade widening down the shirt to
    the button, lying on the shirt wherever it is, in a fine field of its own
    (the body's samples are too coarse for it), kept thin so it stays under
    the jacket where the V closes. The blade is swept down its middle line as
    one ribbon: a chain of flattened capsules, each turned to the shirt under
    it, stepped wherever the shirt turned over the paunch, and read as beads."""
    H = _shell(0.004)
    zs = np.linspace(1.632, BUTTON - 0.012, 40)
    P = H.project(np.array([[0.14, 0.0, z] for z in zs]))
    N = H.normal(P)
    C = P + N * 0.0025
    C[:, 1] = 0.0
    lo, hi = C.min(0) - 0.03, C.max(0) + 0.03
    lo[1], hi[1] = -0.04, 0.04
    T = sc.Field(lo=lo, hi=hi, h=0.001)
    ax = [T.lo[k] + np.arange(T.n[k]) * T.h for k in range(3)]
    X, Z = ax[0][:, None], ax[2][None, :]
    # the distance from the middle line, in the side view, and how far down it
    # the nearest point is; the ribbon is then the same at every Y
    near = np.full((len(ax[0]), len(ax[2])), np.inf)
    along = np.zeros_like(near)
    run = np.r_[0, np.cumsum(np.linalg.norm(np.diff(C[:, [0, 2]], axis=0), axis=1))]
    for i in range(len(C) - 1):
        (x0, z0), (x1, z1) = C[i, [0, 2]], C[i + 1, [0, 2]]
        ex, ez = x1 - x0, z1 - z0
        L2 = ex * ex + ez * ez
        t = np.clip(((X - x0) * ex + (Z - z0) * ez) / L2, 0, 1)
        dist = np.hypot(X - x0 - t * ex, Z - z0 - t * ez)
        nearer = dist < near
        near = np.where(nearer, dist, near)
        along = np.where(nearer, run[i] + t * np.sqrt(L2), along)
    th = 0.0026                                                       # half its thickness
    w = np.interp(along / run[-1], [0, 1], [0.011, 0.03])             # half its width
    a = np.abs(ax[1])[None, :, None] - (w - th)[:, None, :]
    T.d = (np.sqrt(np.maximum(a, 0) ** 2 + near[:, None, :] ** 2) - th).astype(np.float32)
    T.add(sc.Ellipsoid(C[0] + N[0] * 0.002, (0.008, 0.014, 0.012)), 0.003)    # the knot
    return T


def srgb(h, k=1.0):
    """A palette hex as a glTF (linear) colour, darkened by k first as the
    game darkens it (in sRGB)."""
    return tuple(((k * int(h[i:i + 2], 16) / 255 + 0.055) / 1.055) ** 2.4 for i in (1, 3, 5)) + (1,)


# Each outfit in the game (data/fighters.js `outfit`): its pieces, outermost
# last, as (name, maker, material role, colour where the fighter's palette
# has none), and which pieces cover which. Jeff's, Adam's and Carl's so far;
# each of the others is added with the fighter who wears it.
OUTFITS = {
    # a shirt under a quilted vest that hangs open at the front (figure.js)
    'vest': {
        'pieces': [('shirt', shirt, 'shirt', '#e8ecf4'), ('vest', vest, 'suit', None),
                   ('trousers', trousers, 'pants', None), ('shoes', shoes, 'shoe', None)],
        'skin': ['shirt', 'trousers', 'shoes'],
        'covers': {'shirt': ['vest', 'trousers'], 'trousers': ['shoes']},
    },
    # an oversized hoodie over baggy trousers and sneakers (Adam's)
    'hoodie': {
        'pieces': [('hoodie', hoodie, 'suit', None), ('rib', hoodie_rib, 'suit2', None),
                   ('strings', hoodie_strings, 'accent', None),
                   ('trousers', trousers, 'pants', None), ('shoes', shoes, 'shoe', None)],
        'skin': ['hoodie', 'rib', 'trousers', 'shoes'],
        'covers': {'hoodie': ['rib'], 'trousers': ['hoodie', 'rib', 'shoes']},
        'loose': True,
    },
    # a buttoned suit over a shirt and tie (Carl's)
    'pinstripe': {
        'pieces': [('shirt', dress_shirt, 'shirt', '#f4f6ff'), ('tie', tie, 'accent', None),
                   ('jacket', jacket, 'suit', None), ('lapels', jacket_lapels, LAPEL, None),
                   ('trousers', trousers, 'pants', None), ('shoes', shoes, 'shoe', None)],
        'skin': ['shirt', 'jacket', 'trousers', 'shoes'],
        'covers': {'shirt': ['jacket', 'tie', 'trousers'], 'tie': ['jacket'], 'jacket': ['lapels'],
                   'trousers': ['jacket', 'shoes']},
        'loose': True,
    },
    # Trousers and shoes and nothing above the waist: what a fighter wears
    # until their own outfit is made, so their head and face can be judged in
    # the game before their clothes are.
    'base': {
        'pieces': [('trousers', trousers, 'pants', None), ('shoes', shoes, 'shoe', None)],
        'skin': ['trousers', 'shoes'],
        'covers': {'trousers': ['shoes']},
    },
}


def hidden(obj, covers, depth=0.0025, below=None):
    """Removes the faces of obj lying wholly inside any of `covers` (fields),
    by more than `depth`: skin under clothes, shirt under the vest. With
    `below`, everything of the body under that height goes too: the trousers
    and shoes cover all of it, and the skin left where the legs are joined at
    the crotch showed through the parting between the trouser legs."""
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    co = np.array([v.co[:] for v in bm.verts])
    inside = np.zeros(len(co), bool)
    for f in covers:
        inside |= f.sample(co) < -depth
    if below is not None:
        inside |= (co[:, 2] < below) & (np.abs(co[:, 1]) < 0.25)
    gone = [f for f in bm.faces if all(inside[v.index] for v in f.verts)]
    bmesh.ops.delete(bm, geom=gone, context='FACES')
    bm.to_mesh(obj.data)
    bm.free()


def dressed(data):
    """Body and clothes as Blender objects, the hidden parts removed:
    (body, [(object, role, colour)]), colours from the fighter's palette."""
    body = build()
    O = OUTFITS.get(data['outfit'])
    if O is None:
        print(f'[{data["id"]}] no {data["outfit"]} yet (OUTFITS): trousers and shoes for now', flush=True)
        O = OUTFITS['base']
    pieces = {n: make() for n, make, _, _ in O['pieces']}
    objs = {n: sc.to_blender(n, *f.mesh(), smooth=1) for n, f in pieces.items()}
    hidden(body, [pieces[n] for n in O['skin']], below=WAIST - 0.012)
    for n, over in O['covers'].items():
        hidden(objs[n], [pieces[o] for o in over])
    pal = data.get('c') or {}
    return body, [(objs[n], role, role_colour(pal, role, own)) for n, _, role, own in O['pieces']]


def role_colour(pal, role, own):
    """A piece's colour from the palette by role, as the game's roleColour
    (gl3d/toon.js) has it: 'suit*0.78' is the suit in shade."""
    base, _, k = role.partition('*')
    return srgb(pal.get(base) or own, float(k or 1))


# ================================================================ eyewear
def shades(lens_c, lens_r, lens_turn, bar, bridge, arm_from, arm_to):
    """Shades: two lenses (centre, radii, how far they wrap round), a bar of
    capsules across the brow, a bridge on the nose, arms back to the ears.
    Built in a fine field of their own: the body's 3 mm samples are too coarse
    for a frame. The fighter's module places them on his head."""
    import bpy
    lo, hi = (-0.03, -0.11, 1.795), (0.125, 0.11, 1.85)
    L = sc.Field(lo=lo, hi=hi, h=0.0012)
    for s in (1, -1):
        L.add(sc.Ellipsoid(V(lens_c[0], s * lens_c[1], lens_c[2]), lens_r, sc.rot(rz=s * lens_turn)), 0.0)
    lens = sc.to_blender('lens', *L.mesh(), smooth=1)
    R = sc.Field(lo=lo, hi=hi, h=0.0012)
    for a, b in zip(bar, bar[1:]):
        R.add(sc.RoundCone(a, b, 0.0032, 0.0032), 0.002)
    R.add(sc.RoundCone(*bridge, 0.0025, 0.0025), 0.002)
    for s in (1, -1):
        R.add(sc.RoundCone(V(arm_from[0], s * arm_from[1], arm_from[2]), V(arm_to[0], s * arm_to[1], arm_to[2]), 0.003, 0.0026), 0.002)
    frame = sc.to_blender('frame', *R.mesh(), smooth=1)
    for ob, role, colour in ((lens, 'lens', (0.02, 0.025, 0.045, 1)), (frame, 'frame', (0.012, 0.012, 0.016, 1))):
        m = bpy.data.materials.new(role)
        m.use_nodes = True
        m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = colour
        ob.data.materials.append(m)
    with bpy.context.temp_override(active_object=lens, selected_editable_objects=[lens, frame], selected_objects=[lens, frame]):
        bpy.ops.object.join()
    lens.name = lens.data.name = 'eyewear:shades'
    return lens


# ================================================================ into the game
# The live 3D renderer poses a model from the 2D pose through the founder's
# skeleton contract (build_founder.py): the same joint names, the body facing
# +x, his left on +y. Each fighter keeps his own joint positions, measured from
# his sculpt; models3d.js says where his leaf bones end and how to fit him.
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
    return {k: FR.warp(v) for k, v in J.items()}


BONES = [('hips', 'hip', 'spine', None), ('spine', 'spine', 'chest', 'hips'),
         ('chest', 'chest', 'neck', 'spine'), ('neck', 'neck', 'head', 'chest'), ('head', 'head', 'head_top', 'neck')]
for _s in ('R', 'L'):
    BONES += [('upper_arm.' + _s, 'shoulder.' + _s, 'elbow.' + _s, 'chest'),
              ('forearm.' + _s, 'elbow.' + _s, 'fist.' + _s, 'upper_arm.' + _s),
              ('thigh.' + _s, 'hipj.' + _s, 'knee.' + _s, 'hips'),
              ('shin.' + _s, 'knee.' + _s, 'ankle.' + _s, 'thigh.' + _s),
              ('foot.' + _s, 'ankle.' + _s, 'toe.' + _s, 'shin.' + _s)]
BONES += [('grip.L', 'grip.L', 'grip_tip.L', 'forearm.L'), ('grip.R', 'grip.R', 'grip_tip.R', 'forearm.R')]


def skin_weights(verts, edges, J, loose=False):
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
        seg['chest'].append((J['neck'], FR.warp(V(-0.015, s * 0.15 * B.shoulders, 1.62))))
        # Under loose cloth the chest also reaches out to each side under the
        # arm: the cloth there stands well off the body, nearer the upper arm
        # than the chest, and went with the arm, a fin of cloth stretched from
        # the back to the elbow whenever the arm came up.
        if loose:
            seg['chest'].append((FR.warp(V(0, 0, 1.36)), FR.warp(V(-0.04, s * 0.17, 1.38))))
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


def material(role, colour):
    """The material for a palette role: one each, shared by every piece in
    it. The game reads a mesh's role from its material's name, and a second
    material of the same name came out as 'suit2.001', a role no palette has."""
    import bpy
    m = bpy.data.materials.get(role)
    if m is None:
        m = bpy.data.materials.new(role)
        m.use_nodes = True
        m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = colour
        m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 1.0
    return m


def _decimate(ob, target):
    import bpy
    dec = ob.modifiers.new('Decimate', 'DECIMATE')
    dec.ratio = min(1.0, target / (2 * max(1, len(ob.data.polygons))))
    with bpy.context.temp_override(object=ob, active_object=ob, selected_objects=[ob]):
        bpy.ops.object.modifier_apply(modifier=dec.name)


def export_rigged(data, spec, path, tris=44000):
    """The fighter as a game model: dressed, decimated, weighted to the
    skeleton, with his eyewear riding his head."""
    import bpy
    if spec is Placeholder:
        sys.exit(f'{data["id"]} has no head of their own yet (lab/blender/fighters/{data["id"]}.py)')
    obj, clothes = dressed(data)
    # what rides the head (a cap, hair under it), and the skin it covers
    wears = spec.headwear(sys.modules[__name__]) if hasattr(spec, 'headwear') else []
    for _, covers in wears:
        hidden(obj, covers)
    parts = [(obj, 'skin', (0.75, 0.42, 0.25, 1))] + clothes
    for ob, _, _ in parts:
        FR.warp_mesh(ob)
    budget = {'skin': 0.3, 'shirt': 0.22, 'suit': 0.24, 'suit2': 0.1, LAPEL: 0.1, 'accent': 0.02, 'pants': 0.17, 'shoe': 0.07}
    for ob, role, colour in parts:
        _decimate(ob, tris * budget[role])
        # materials by palette role (the renderer takes the fighter's colour for
        # a role he has, else this one)
        ob.data.materials.append(material(role, colour))
    every = [p[0] for p in parts]
    with bpy.context.temp_override(active_object=obj, selected_editable_objects=every, selected_objects=every):
        bpy.ops.object.join()
    me = obj.data
    me.shade_smooth()
    J = joints()
    co = np.zeros(len(me.vertices) * 3)
    me.vertices.foreach_get('co', co)
    ed = np.zeros(len(me.edges) * 2, dtype=np.int64)
    me.edges.foreach_get('vertices', ed)
    names, W = skin_weights(co.reshape(-1, 3), ed.reshape(-1, 2), J, loose=OUTFITS.get(data['outfit'], {}).get('loose', False))
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
    # eyewear rides the head, wholly
    wear = spec.eyewear(sys.modules[__name__]) if hasattr(spec, 'eyewear') else None
    if wear is not None:
        FR.warp_mesh(wear)
        _decimate(wear, 3000)
        wear.data.shade_smooth()
        wear.vertex_groups.new(name='head').add(list(range(len(wear.data.vertices))), 1.0, 'REPLACE')
        mod = wear.modifiers.new('Armature', 'ARMATURE')
        mod.object = rig
        wear.parent = rig
    for wear, _ in wears:
        FR.warp_mesh(wear)
        _decimate(wear, 6000)
        wear.data.shade_smooth()
        wear.vertex_groups.new(name='head').add(list(range(len(wear.data.vertices))), 1.0, 'REPLACE')
        mod = wear.modifiers.new('Armature', 'ARMATURE')
        mod.object = rig
        wear.parent = rig
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=False,
        export_skins=True, export_animations=False, export_morph=False,
        export_materials='EXPORT', export_texcoords=False, export_yup=True,
        export_apply=False, export_def_bones=False,
    )
    print(f'[{data["id"]}] rigged: {len(me.polygons)} faces, {os.path.getsize(path)} bytes -> {path}', flush=True)
    print(model_numbers(J), flush=True)


def model_numbers(J):
    """What src/data/models3d.js needs to know of the fighter's model, from
    their joints and frame, as Jeff's numbers carried into it: where the leaf
    bones end, the skull, the joints' width, the face's centre and scale."""
    r = lambda v: round(float(v), 4)
    arm = np.linalg.norm(J['fist.L'] - J['elbow.L']) / 0.317       # Jeff's elbow to fist
    foot = [r(0.18 * FR.wide), r(-0.065 * FR.legs), 0]           # the foot is all below the hip
    return ('  leaf: { forearm: %s, head: %s, foot: %s },\n  skull: %s,\n'
            '  fit: { shoulderHalf: %s, hipHalf: %s, legs: %s },\n  face: at [0, %s], px %s'
            % (r(0.367 * arm), r(0.255 * FR.head), foot, r(0.16 * FR.head),
               r(abs(J['shoulder.L'][1])), r(abs(J['hipj.L'][1])), r(FR.legs),
               r(FR.warp(V(0, 0, 1.79))[2]), r(0.0035 * FR.head)))


def cast(ids, out, engine='WORKBENCH'):
    """Clay views of each fighter's body at their own size, all at one scale,
    so the cast can be judged side by side as the game stands them."""
    import clay
    for fid in ids:
        sculpt(fid)
        obj = build()
        FR.warp_mesh(obj)
        clay.views([obj], out, fid, engine=engine, size=(640, 1000), span=2.8, centre=(0.0, 0.0, 1.3))


if __name__ == '__main__':
    ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    opt = lambda name, default: ARGS[ARGS.index(name) + 1] if name in ARGS else default
    if '--cast' in ARGS:
        cast([a for a in ARGS if not a.startswith('--') and a != opt('--cast', None) and a != opt('--engine', None)],
             opt('--cast', '.'), opt('--engine', 'WORKBENCH'))
        sys.exit()
    fid = ARGS[0]
    data, spec = sculpt(fid, float(opt('--h', '0.003')))
    if '--rig' in ARGS:
        export_rigged(data, spec, os.path.abspath(opt('--out', os.path.join(ROOT, 'assets', 'models', 'sculpt', f'{fid}.glb'))))
    elif '--views' in ARGS:
        # the body in clay, with whatever rides the head
        import clay
        obj = build()
        objs = [obj] + [w for w, _ in (spec.headwear(sys.modules[__name__]) if hasattr(spec, 'headwear') else [])]
        if hasattr(spec, 'eyewear'):
            objs.append(spec.eyewear(sys.modules[__name__]))
        for o in objs:
            FR.warp_mesh(o)
        clay.views(objs, opt('--views', '.'), fid)
