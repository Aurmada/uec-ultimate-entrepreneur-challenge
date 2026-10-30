# Builds assets/models/founder.glb: ONE modular, skinned model that every
# fighter wears, for the live 3D renderer (src/engine/gl3d). Offline tooling,
# like the rest of lab/; the game only ever loads the .glb this writes.
#
#   /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
#     -P lab/blender/build_founder.py -- assets/models/founder.glb
#
# The same script builds the athlete body (assets/models/athlete.glb), the
# owner's October 2026 ask for fuller, more realistic fighters: a chest,
# deltoids, traps and lats over a narrower waist, arms with biceps, triceps and
# a forearm that swells below the elbow, fists with knuckles, and clothes that
# follow the body under them instead of hiding it in a shell. The skeleton, the
# head and every look and prop are the founder's, so it is a drop-in model.
#
#   ... -P lab/blender/build_founder.py -- assets/models/athlete.glb athlete
#   ... -P lab/blender/build_founder.py -- assets/models/athlete-f.glb athlete-f
#
# Without Blender installed, the Python module works the same way:
#   pip install bpy && python lab/blender/build_founder.py -- <out.glb> [athlete]
#
# A fighter in this game is data: a hair style, headwear, eyewear, facial hair,
# an outfit, a palette, body proportions, and for the roster a few props. A
# player founder is the same data from the profile screen. So instead of a
# model per character, this builds a base body plus one named mesh per look
# option, and the runtime draws only the meshes a fighter's data selects.
#
# THE CONTRACT WITH THE RUNTIME (docs/ARCHITECTURE.md, "Live 3D fighters"):
#   * Units are rig units: 1.0 = 100 rig px. Blender Z is up, the character
#     faces +X, and its right side (.R) is -Y, which glTF export turns into +Z,
#     toward the renderer's camera.
#   * Joints: hips, spine, chest, neck, head, upper_arm.R/L, forearm.R/L,
#     thigh.R/L, shin.R/L, foot.R/L. The runtime reads only where each sits at
#     bind time, never bone rolls.
#   * Mesh objects are named for what selects them:
#       body          always drawn (skin, legs, shoes). The head is bare: the
#                     runtime projects each fighter's own drawn face onto it,
#                     in whatever expression the pose calls for
#       <slot>:<id>   drawn when the fighter's look picks that option; slots are
#                     hair, headwear, eyewear, facialHair, outfit, accessory
#       prop:<id>     drawn when the fighter carries a part with that id, in
#                     that part's states (the block briefcase, Adam's mat)
#       fx:<flag>     drawn while the fighter is in that condition (fx:unicorn,
#                     the golden horn of Unicorn Mode)
#   * Materials are named for the palette role they take their colour from
#     (skin, suit, suit2, accent, hair, pants, shoe); any other name keeps the
#     colour exported with it.
#
# Shapes are metaballs, as in the September 2026 art spike: every element of
# one (object, material) pair blends into one smooth surface. Each object is
# converted, decimated, joined by name, weighted to the bones by distance, and
# exported with its armature.
import bpy, math, os, sys
from mathutils import Vector as V, Matrix

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = os.path.abspath(ARGS[0] if ARGS else 'assets/models/founder.glb')
ATHLETE = len(ARGS) > 1 and ARGS[1] in ('athlete', 'athlete-f')
# The women's frame: narrower shoulders and lighter arms, a bust instead of
# pectorals, a narrower waist over wider hips.
FEM = len(ARGS) > 1 and ARGS[1] == 'athlete-f'

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

# Default colours for the exported roles (a neutral founder). The runtime
# replaces every role colour from the fighter's own palette.
ROLE_COLOUR = dict(skin='#e8b48c', suit='#5865f2', suit2='#3d47c9', accent='#29d9ff',
                   hair='#2a2320', pants='#23294f', shoe='#eef1ff')
FIXED = dict(sole='#9aa0aa', white='#fbf6ee', shirt='#f4f6ff',
             lens='#15171f', case='#6b4a2b', frame='#1b1a22', visor='#29d9ff', gold='#ffd23f', gold2='#c48a12')

# Decimation targets below are counted in the metaball mesh's quads; the
# decimated result is triangles, about twice as many. DETAIL scales every target.
DETAIL = 0.5
# The athlete's muscle forms need the triangles to show: a curve the decimator
# flattens is a muscle that is not there.
if ATHLETE:
    DETAIL = 0.9


def lin(h):
    h = h.lstrip('#')
    def c(v):
        v = int(v, 16) / 255
        return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
    return (c(h[0:2]), c(h[2:4]), c(h[4:6]), 1.0)


# ---------------------------------------------------------------- the skeleton
D45 = math.sqrt(0.5)
J = {
    'hip': V((0, 0, 0.88)), 'spine': V((0, 0, 1.02)), 'chest': V((0, 0, 1.24)),
    'neck': V((0, 0, 1.50)), 'head': V((0, 0, 1.62)), 'head_top': V((0, 0, 1.98)),
}
ARM_DIR = {}
for side, sy in (('R', -1), ('L', 1)):
    sh = V((0, 0.27 * sy, 1.46))
    d = V((0, D45 * sy, -D45))
    ARM_DIR[side] = d
    J['shoulder.' + side] = sh
    J['elbow.' + side] = sh + d * 0.40
    J['wrist.' + side] = sh + d * 0.78
    J['fist.' + side] = sh + d * 0.84
    J['hipj.' + side] = V((0, 0.10 * sy, 0.86))
    J['knee.' + side] = V((0, 0.105 * sy, 0.45))
    J['ankle.' + side] = V((0, 0.11 * sy, 0.06))
    J['toe.' + side] = V((0.17, 0.11 * sy, 0.02))
# A prop anchor: sits on the lead fist but keeps the body's orientation, the
# way the 2D rig places a held part (an offset from the hand, never rotated
# with the arm). Optional in the contract; the runtime poses it if present.
for side in ('L', 'R'):
    J['grip.' + side] = J['fist.' + side]
    J['grip_tip.' + side] = J['fist.' + side] + V((0.10, 0, 0))

BONES = [
    ('hips', 'hip', 'spine', None), ('spine', 'spine', 'chest', 'hips'),
    ('chest', 'chest', 'neck', 'spine'), ('neck', 'neck', 'head', 'chest'),
    ('head', 'head', 'head_top', 'neck'),
]
for s in ('R', 'L'):
    BONES += [
        ('upper_arm.' + s, 'shoulder.' + s, 'elbow.' + s, 'chest'),
        ('forearm.' + s, 'elbow.' + s, 'fist.' + s, 'upper_arm.' + s),
        ('thigh.' + s, 'hipj.' + s, 'knee.' + s, 'hips'),
        ('shin.' + s, 'knee.' + s, 'ankle.' + s, 'thigh.' + s),
        ('foot.' + s, 'ankle.' + s, 'toe.' + s, 'shin.' + s),
    ]
BONES += [('grip.L', 'grip.L', 'grip_tip.L', 'forearm.L'), ('grip.R', 'grip.R', 'grip_tip.R', 'forearm.R')]
TORSO_BONES = ['hips', 'spine', 'chest', 'neck', 'upper_arm.R', 'upper_arm.L', 'forearm.R', 'forearm.L']
HEAD = ['head']

# ---------------------------------------------------------------- metaballs
K = 0.685       # visible radius of an isolated element at stiffness 4
STIFF = 4.0


class Family:
    def __init__(self, obj, role, res):
        self.obj, self.role = obj, role
        self.mb = bpy.data.metaballs.new(f'{obj}/{role}')
        self.mb.resolution = res
        self.mb.render_resolution = res
        self.mb.threshold = 0.6
        self.ob = bpy.data.objects.new(f'{obj}/{role}', self.mb)
        scene.collection.objects.link(self.ob)

    def ball(self, co, r):
        e = self.mb.elements.new(type='BALL'); e.co = V(co); e.radius = r / K; e.stiffness = STIFF

    def ellip(self, co, size, rot=None):
        e = self.mb.elements.new(type='ELLIPSOID'); e.co = V(co); e.radius = 1 / K; e.stiffness = STIFF
        e.size_x, e.size_y, e.size_z = size
        if rot is not None: e.rotation = rot

    def bone(self, a, b, extra, r1, r2=None, t=0.5):
        a, b = V(a), V(b); d = b - a
        self.ellip(a + d * t, (d.length / 2 + extra, r1, r2 if r2 is not None else r1),
                   d.normalized().to_track_quat('X', 'Z'))

    def cube(self, co, half, rounding, rot=None):
        e = self.mb.elements.new(type='CUBE'); e.co = V(co); e.radius = rounding / K; e.stiffness = STIFF
        e.size_x, e.size_y, e.size_z = [max(0.001, h - rounding) for h in half]
        if rot is not None: e.rotation = rot

    def capsule(self, a, b, r):
        a, b = V(a), V(b); d = b - a
        e = self.mb.elements.new(type='CAPSULE'); e.co = (a + b) / 2; e.radius = r / K; e.stiffness = STIFF
        e.size_x = d.length / 2
        e.rotation = d.normalized().to_track_quat('X', 'Z')


FAMILIES = []      # (Family, faces, bones its vertices may use)


# Bones belong to each PART, not to the object it joins. The base body is four
# parts (skin, pants, shoes, soles) under one name; keyed by name,
# the last part's list won and the whole body was weighted to the feet.
def part(obj, role, bones, faces, res=0.010):
    f = Family(obj, role, res)
    FAMILIES.append((f, max(60, int(faces * DETAIL)), bones))
    return f


def Rx(deg): return Matrix.Rotation(math.radians(deg), 3, 'X')
def Ry(deg): return Matrix.Rotation(math.radians(deg), 3, 'Y')
def Rz(deg): return Matrix.Rotation(math.radians(deg), 3, 'Z')


hip, spine, chest, neck, head = J['hip'], J['spine'], J['chest'], J['neck'], J['head']
headc = head + V((0, 0, 0.18))          # skull centre, 1.80: the 2D rig's head sits at 1.82
H = lambda x, y, z: headc + V((x, y, z))

# ================================================================ BODY
BODY_BONES = ['chest', 'neck', 'head', 'upper_arm.R', 'upper_arm.L', 'forearm.R', 'forearm.L']
skin = part('body', 'skin', BODY_BONES + ['spine'], 4200 if not ATHLETE else 9000, res=0.008 if not ATHLETE else 0.006)
skin.capsule(neck, H(-0.01, 0, -0.07), 0.066)
skin.ellip(neck + V((0.05, 0, -0.05)), (0.10, 0.15, 0.08))           # fills any neckline


# ---- the athlete's anatomy. Each muscle is an ellipsoid along its bone, set
# to the front or back of it; metaballs blend them into one surface, and the
# toon shading's light and shadow bands find the forms. `pad` grows every
# element, which is how a sleeve or a shirt follows the arm or the chest under
# it: fitted cloth a little, a jacket more, and the more it grows, the softer
# the forms it shows.
def along(a, b, t, off, size, f, pad=0.0):
    a, b = V(a), V(b); d = b - a
    q = d.normalized().to_track_quat('X', 'Z')
    f.ellip(a + d * t + off, tuple(x + pad for x in size), q)


def arm_muscles(f, s, pad=0.0, upto='wrist'):
    sh, el, wr = J['shoulder.' + s], J['elbow.' + s], J['wrist.' + s]
    sy = -1 if s == 'R' else 1
    out = V((0, 0.012 * sy, 0))
    k = 0.86 if FEM else 1.0                 # lighter arms on the women's frame
    def limb(a, b, t, off, size, f, pad=0.0):
        along(a, b, t, off, (size[0], size[1] * k, size[2] * k), f, pad)
    # the deltoid caps the shoulder and runs a third of the way down the arm
    limb(sh, el, 0.10, V((0.0, 0.035 * sy, 0.0)), (0.115, 0.095, 0.09), f, pad)
    limb(sh, el, 0.5, V((0, 0, 0)), (0.20, 0.054, 0.052), f, pad)            # humerus core
    if upto == 'short':
        return
    limb(sh, el, 0.56, V((0.032, 0, 0)) + out, (0.13, 0.054, 0.056), f, pad)  # biceps, in front
    limb(sh, el, 0.42, V((-0.034, 0, 0)), (0.16, 0.058, 0.054), f, pad)       # triceps, behind
    f.ball(el, 0.046 + pad)
    if upto == 'elbow':
        return
    limb(el, wr, 0.24, V((0.014, 0, 0)) + out * 1.6, (0.13, 0.064, 0.058), f, pad)  # the forearm's swell
    limb(el, wr, 0.55, V((0, 0, 0)), (0.17, 0.044, 0.040), f, pad)                  # tapering to the wrist
    f.ball(wr, 0.034 + pad)


def fist(f, s):
    wr = J['wrist.' + s]
    d = ARM_DIR[s]
    q = d.to_track_quat('X', 'Z')
    f.cube(wr + d * 0.075, (0.08, 0.064, 0.072), 0.03, q)                      # the hand, big: it is what hits
    for x in (-0.042, -0.014, 0.014, 0.042):                                    # four knuckles, across
        f.ball(wr + d * 0.142 + V((x * 1.1, 0, 0)) + d.cross(V((1, 0, 0))) * 0.014, 0.024)
    f.ellip(wr + d * 0.085 + V((0.055, 0, 0)), (0.045, 0.024, 0.022), q)      # the thumb, across the front


def torso_muscles(f, pad=0.0, girth=1.0):
    g = girth
    gp = lambda size: (size[0] * g, size[1] * g, size[2])
    P_ = lambda size: tuple(x + pad for x in gp(size))
    if FEM:
        f.ellip(V((0.0, 0, 1.27)), P_((0.12, 0.165, 0.16)))                                     # ribcage
        for sy in (1, -1):
            f.ellip(V((0.07, 0.075 * sy, 1.29)), P_((0.066, 0.074, 0.068)))                     # bust
            f.ellip(V((-0.035, 0.095 * sy, 1.46)), P_((0.055, 0.095, 0.042)), Rx(22 * sy).to_quaternion())   # traps
            f.ellip(V((-0.045, 0.115 * sy, 1.23)), P_((0.06, 0.07, 0.15)), Rx(-10 * sy).to_quaternion())   # back
        f.capsule(V((0.03, -0.17, 1.43)), V((0.03, 0.17, 1.43)), 0.034 + pad)                   # the collarbones
        f.ellip(V((0.03, 0, 1.07)), P_((0.075, 0.095, 0.115)))                                  # the waist, narrow
        f.ellip(V((0.0, 0, 0.92)), P_((0.115, 0.172, 0.095)))                                   # wider hips
        return
    f.ellip(V((0.0, 0, 1.27)), P_((0.13, 0.185, 0.165)))                # ribcage
    for sy in (1, -1):
        f.ellip(V((0.075, 0.09 * sy, 1.33)), P_((0.07, 0.10, 0.066)),    # pectorals
                Rx(-10 * sy).to_quaternion())
        f.ellip(V((-0.035, 0.105 * sy, 1.46)), P_((0.065, 0.115, 0.052)), # traps, sloping
                Rx(24 * sy).to_quaternion())
        f.ellip(V((-0.05, 0.135 * sy, 1.23)), P_((0.07, 0.085, 0.17)),   # lats, tapering in
                Rx(-12 * sy).to_quaternion())
        f.ellip(V((0.0, 0.095 * sy, 1.03)), P_((0.06, 0.045, 0.085)))    # obliques
    f.capsule(V((0.03, -0.19, 1.43)), V((0.03, 0.19, 1.43)), 0.038 + pad)        # the collarbones
    f.ellip(V((0.035, 0, 1.07)), P_((0.08, 0.105, 0.115)))              # the waist, narrow
    f.ellip(V((0.0, 0, 0.92)), P_((0.11, 0.155, 0.09)))                 # pelvis


def leg_muscles(f, s, pad=0.0, trouser=True):
    hj, kn, an = J['hipj.' + s], J['knee.' + s], J['ankle.' + s]
    sy = -1 if s == 'R' else 1
    g = 1.12 if FEM else 1.0
    f.ellip(V((-0.06, 0.08 * sy, 0.84)), (0.07 * g + pad, 0.075 * g + pad, 0.085 * g + pad))   # glute
    along(hj, kn, 0.45, V((0.03, 0, 0)), (0.21, 0.064, 0.066), f, pad)                         # quads
    along(hj, kn, 0.80, V((0.02, -0.03 * sy, 0)), (0.07, 0.046, 0.046), f, pad)               # the teardrop over the knee
    along(hj, kn, 0.45, V((-0.03, 0, 0)), (0.20, 0.058, 0.06), f, pad)                        # hamstrings
    along(hj, kn, 0.25, V((0, -0.03 * sy, 0)), (0.12, 0.05, 0.05), f, pad)                    # adductors, inside
    f.ball(kn, 0.052 + pad)
    if trouser:
        # a trouser leg hangs straight from the knee rather than following the calf
        along(kn, an, 0.45, V((-0.005, 0, 0)), (0.22, 0.066 + pad, 0.064 + pad), f)
        f.ball(an + V((0, 0, 0.045)), 0.06 + pad)
    else:
        along(kn, an, 0.30, V((-0.035, 0, 0)), (0.12, 0.055, 0.055), f, pad)                 # calf
        along(kn, an, 0.6, V((0, 0, 0)), (0.2, 0.04, 0.036), f, pad)


for s in ('R', 'L'):
    sh, el, wr = J['shoulder.' + s], J['elbow.' + s], J['wrist.' + s]
    d = ARM_DIR[s]
    q = d.to_track_quat('X', 'Z')
    if ATHLETE:
        arm_muscles(skin, s)
        fist(skin, s)
        continue
    skin.bone(sh, el, 0.0, 0.070, 0.064, t=0.45)                       # bare upper arm, under any sleeve
    skin.bone(el, wr, 0.0, 0.066, 0.058, t=0.34)                       # forearm
    skin.ball(wr, 0.042)
    skin.cube(wr + d * 0.075, (0.074, 0.062, 0.068), 0.032, q)          # fist
    skin.ellip(wr + d * 0.10 + q @ V((0, 0, 0.05)), (0.05, 0.058, 0.02), q)
if ATHLETE:
    # the throat and the top of the chest, for every neckline
    skin.ellip(neck + V((0.04, 0, -0.06)), (0.09, 0.14, 0.07))
skin.ellip(H(-0.01, 0, 0.025), (0.118, 0.103, 0.128))                  # cranium
skin.ellip(H(0.04, 0, -0.055), (0.092, 0.094, 0.064))                   # jaw, short and round
skin.ball(H(0.088, 0, -0.085), 0.034)                                    # chin
skin.ellip(H(0.07, 0, 0.0), (0.06, 0.09, 0.08))                         # face front, broad and flat
skin.ball(H(0.12, 0, 0.007), 0.015)                                      # button nose, clear of the mouth
for sy in (1, -1):
    skin.ellip(H(-0.012, 0.104 * sy, -0.012), (0.028, 0.013, 0.039))    # ears

# No brows, eyes or mouth here. A modelled face has one expression; the
# runtime paints drawFighter's face for every state (MODELS3D.founder.face says
# where it lands) so the head only has to give it a shape to sit on.

pants = part('body', 'pants', ['hips', 'thigh.R', 'thigh.L', 'shin.R', 'shin.L'], 2400 if not ATHLETE else 6000, res=0.012 if not ATHLETE else 0.008)
shoe = part('body', 'shoe', ['shin.R', 'shin.L', 'foot.R', 'foot.L'], 1400)
sole = part('body', 'sole', ['foot.R', 'foot.L'], 500, res=0.009)
if ATHLETE:
    pants.ellip(hip + V((0, 0, -0.01)), (0.12, 0.165, 0.11))
for s, sy in (('R', -1), ('L', 1)):
    hj, kn, an = J['hipj.' + s], J['knee.' + s], J['ankle.' + s]
    if ATHLETE:
        leg_muscles(pants, s, pad=0.02)
    else:
        if s == 'R':
            pants.ellip(hip + V((0, 0, -0.03)), (0.14, 0.18, 0.13))
        pants.bone(hj, kn, 0.03, 0.105, 0.10, t=0.40)
        pants.ball(kn, 0.074)
        pants.bone(kn, an, 0.0, 0.08, 0.074, t=0.36)
        pants.ball(an + V((0, 0, 0.045)), 0.058)
    o = an + V((-0.02, 0, -0.06))
    sole.cube(o + V((0.06, 0, 0.018)), (0.16, 0.07, 0.018), 0.012)
    shoe.cube(o + V((0.03, 0, 0.07)), (0.12, 0.064, 0.055), 0.042)
    shoe.ellip(o + V((0.14, 0, 0.055)), (0.075, 0.06, 0.042))
    shoe.ball(o + V((-0.02, 0, 0.12)), 0.058)

# ================================================================ OUTFITS
# Every outfit covers the torso and the upper arms; the base body's skin arms
# show wherever a sleeve stops. `girth` puffs the shell for padded jackets.
# How much each outfit stands off the athlete's body: fitted knits show the
# chest and arms, tailoring softens them, padded jackets hide most of them.
PAD = dict(tee=0.012, henley=0.014, turtleneck=0.014, suit=0.024, pinstripe=0.024, blazer=0.026,
           vest=0.03, hoodie=0.034, bomber=0.036)


def torso(f, girth=1.0):
    if ATHLETE:
        torso_muscles(f, PAD[CURRENT[0]], 1 + (girth - 1) * 0.5)
        return
    g = girth
    f.ellip(chest + V((0.01, 0, 0.10)), (0.17 * g, 0.28 * g, 0.20 * g))
    f.ellip(spine + V((0.02, 0, 0.08)), (0.15 * g, 0.21 * g, 0.15 * g))
    f.ellip(hip + V((0, 0, 0.08)), (0.14 * g, 0.20 * g, 0.08))
    for s, sy in (('R', -1), ('L', 1)):
        f.ellip(J['shoulder.' + s] + V((0, 0.01 * sy, 0.01)), (0.115 * g, 0.11 * g, 0.105 * g))


def sleeves(f, reach, radius=0.088):
    # reach: 'short' ends mid upper arm, 'pushed' just past the elbow, 'long' at the wrist
    if ATHLETE:
        for s in ('R', 'L'):
            arm_muscles(f, s, PAD[CURRENT[0]] + (radius - 0.088), {'short': 'short', 'pushed': 'elbow'}.get(reach, 'wrist'))
        return
    for s in ('R', 'L'):
        sh, el, wr = J['shoulder.' + s], J['elbow.' + s], J['wrist.' + s]
        d = ARM_DIR[s]
        if reach == 'short':
            f.bone(sh, sh + d * 0.22, 0.02, radius, radius * 0.97, t=0.5)
            f.ball(sh + d * 0.20, radius * 0.96)
            continue
        f.bone(sh, el, 0.02, radius, radius * 0.96, t=0.45)
        if reach == 'pushed':
            f.ball(el + d * 0.03, radius * 0.98)
        else:
            f.bone(el, wr, 0.0, radius * 0.86, radius * 0.78, t=0.4)
            f.ball(wr - d * 0.02, radius * 0.74)


CURRENT = ['tee']   # the outfit being built, for its PAD


def outfit(name, faces=2000):
    obj = 'outfit:' + name
    CURRENT[0] = name
    if ATHLETE:
        faces = int(faces * 2)
    return (part(obj, 'suit', TORSO_BONES, faces, res=0.010 if not ATHLETE else 0.007),
            lambda role, n=300, res=0.008: part(obj, role, TORSO_BONES, n, res=res))


def shirt_v(extra):
    sv = extra('shirt', 300)
    sv.ellip(neck + V((0.15, 0, -0.10)), (0.035, 0.07, 0.09), Ry(-18).to_quaternion())
    return sv


# hoodie: pushed sleeves, bunched hood, drawstrings
f, extra = outfit('hoodie')
torso(f); sleeves(f, 'pushed')
extra('suit2', 400, res=0.010).ellip(neck + V((-0.09, 0, -0.03)), (0.08, 0.16, 0.08))
ds = extra('accent', 200)
for sy in (1, -1):
    top = neck + V((0.13, 0.05 * sy, -0.06))
    ds.capsule(top, top + V((0.02, 0.005 * sy, -0.16)), 0.009)

# tee: short sleeves, crew collar, a small rocket on the chest
f, extra = outfit('tee')
torso(f); sleeves(f, 'short')
extra('suit2', 300).ellip(neck + V((0.04, 0, -0.035)), (0.11, 0.125, 0.025))
extra('accent', 150).ellip(chest + V((0.185, 0.07, 0.12)), (0.012, 0.022, 0.045))

# henley: long sleeves, crew collar, a button placket
f, extra = outfit('henley')
torso(f); sleeves(f, 'long')
tr = extra('suit2', 300)
tr.ellip(neck + V((0.04, 0, -0.035)), (0.11, 0.125, 0.025))
for i in range(3):
    tr.ball(neck + V((0.17, 0.012, -0.10 - i * 0.05)), 0.011)

# turtleneck: long sleeves, a rolled high collar
f, extra = outfit('turtleneck')
torso(f); sleeves(f, 'long')
extra('suit2', 400, res=0.009).capsule(neck + V((0.0, 0, -0.02)), neck + V((0.01, 0, 0.09)), 0.082)

# blazer (open), suit (tie), pinstripe (tie and stripes): lapels over a shirt V
for name in ('blazer', 'suit', 'pinstripe'):
    f, extra = outfit(name)
    torso(f, 1.02); sleeves(f, 'long')
    shirt_v(extra)
    lap = extra('suit2', 300)
    for sy in (1, -1):
        lap.ellip(neck + V((0.155, 0.06 * sy, -0.12)), (0.02, 0.028, 0.11), Rx(16 * sy).to_quaternion())
    if name in ('suit', 'pinstripe'):
        extra('accent', 200).ellip(neck + V((0.19, 0, -0.20)), (0.012, 0.022, 0.13))
    if name == 'pinstripe':
        stripes = extra('suit2', 400, res=0.007)
        for y in (-0.16, -0.08, 0.08, 0.16):
            stripes.capsule(chest + V((0.17, y, 0.14)), spine + V((0.16, y * 0.8, 0.0)), 0.006)

# vest: a padded vest with quilting over shirt sleeves and a shirt V
f, extra = outfit('vest')
torso(f, 1.06); sleeves(f, 'long')
shirt_v(extra)
q = extra('suit2', 400, res=0.008)
for i in range(3):
    for sy in (1, -1):
        q.ellip(chest + V((0.175, 0.13 * sy, 0.10 - i * 0.12)), (0.012, 0.07, 0.008))

# bomber: puffed shell, ribbed collar and hem, a zip
f, extra = outfit('bomber')
torso(f, 1.08); sleeves(f, 'long', 0.095)
rib = extra('accent', 400, res=0.009)
rib.ellip(neck + V((0.02, 0, -0.03)), (0.12, 0.14, 0.03))
rib.ellip(hip + V((0, 0, 0.03)), (0.155, 0.22, 0.03))
rib.capsule(neck + V((0.19, 0, -0.08)), spine + V((0.17, 0, -0.08)), 0.007)

# ================================================================ HAIR
def hair(name, faces=700, res=0.009):
    return part('hair:' + name, 'hair', HEAD, faces, res=res)


def cap_shell(f, size=(0.13, 0.112, 0.105), at=(-0.03, 0, 0.065)):
    f.ellip(H(*at), size)
    f.ellip(H(-0.075, 0, -0.01), (0.07, 0.10, 0.10))


f = hair('short'); cap_shell(f)
for sy in (1, -1): f.ellip(H(0.02, 0.1 * sy, -0.03), (0.02, 0.012, 0.035))
f = hair('buzz'); cap_shell(f, size=(0.124, 0.106, 0.099), at=(-0.02, 0, 0.058))
f = hair('neat'); cap_shell(f)
f.ellip(H(-0.01, 0.03, 0.12), (0.10, 0.08, 0.05)); f.ellip(H(0.05, -0.02, 0.12), (0.05, 0.07, 0.035))
f = hair('slick')
f.ellip(H(-0.04, 0, 0.07), (0.14, 0.113, 0.10)); f.ellip(H(-0.11, 0, -0.02), (0.05, 0.09, 0.09))
f = hair('quiff'); cap_shell(f)
f.ellip(H(0.06, 0, 0.15), (0.075, 0.075, 0.05), Ry(-25).to_quaternion())
f = hair('curly', faces=1100, res=0.008)
for i in range(16):
    a = i / 16 * math.tau
    f.ball(H(-0.03 + 0.10 * math.cos(a) * 0.9, 0.10 * math.sin(a), 0.09), 0.045)
for i in range(8):
    a = i / 8 * math.tau
    f.ball(H(-0.03 + 0.05 * math.cos(a), 0.05 * math.sin(a), 0.145), 0.045)
f.ellip(H(-0.08, 0, -0.01), (0.06, 0.10, 0.10))
f = hair('afro', faces=900, res=0.012)
f.ellip(H(-0.05, 0, 0.10), (0.16, 0.17, 0.15))           # set back, so it frames the face
f = hair('bob', faces=900); cap_shell(f)
for sy in (1, -1): f.ellip(H(-0.01, 0.105 * sy, -0.04), (0.08, 0.035, 0.10))
f.ellip(H(-0.10, 0, -0.05), (0.05, 0.10, 0.10)); f.ellip(H(0.08, 0, 0.095), (0.04, 0.09, 0.03))
f = hair('long', faces=900); cap_shell(f)
f.ellip(H(-0.11, 0, -0.11), (0.066, 0.10, 0.096))
f.ellip(H(-0.125, 0, -0.21), (0.054, 0.09, 0.07))
f.ellip(H(-0.13, 0, -0.28), (0.04, 0.07, 0.05))
f = hair('ponytail', faces=900)
f.ellip(H(-0.04, 0, 0.07), (0.14, 0.113, 0.10))
f.ball(H(-0.13, 0, 0.02), 0.03)
for x, z, r in ((-0.17, -0.05, 0.045), (-0.19, -0.13, 0.04), (-0.19, -0.21, 0.03)):
    f.ball(H(x, 0, z), r)
f = hair('topknot')
f.ellip(H(-0.04, 0, 0.07), (0.14, 0.113, 0.10)); f.ball(H(-0.03, 0, 0.19), 0.055)
f = hair('puffs')
f.ellip(H(-0.04, 0, 0.07), (0.14, 0.113, 0.10))
for sy in (1, -1): f.ball(H(-0.02, 0.11 * sy, 0.10), 0.06)
# bald has no mesh: the base skull is the look
# 'cap' is a HAIR style on the roster (Adam, Carl): a backwards cap and no
# hair, exactly as drawHair draws it. The player-facing cap is headwear below.
# Crowns are pitched back, so they sit on the brow line at the front (where
# drawHeadwear puts a 2D crown's edge, clear of the eyes) and low at the back.
f = part('hair:cap', 'suit2', HEAD, 800, res=0.008)
f.ellip(H(-0.01, 0, 0.075), (0.13, 0.116, 0.09), Ry(-14).to_quaternion())
f.cube(H(-0.165, 0, 0.05), (0.082, 0.088, 0.01), 0.008, Ry(-12).to_quaternion())

# ================================================================ HEADWEAR
# player cap: brim forward and clear of the eyes, as drawHeadwear draws it
f = part('headwear:cap', 'suit2', HEAD, 800, res=0.008)
f.ellip(H(-0.01, 0, 0.078), (0.13, 0.116, 0.09), Ry(-14).to_quaternion())
f.cube(H(0.15, 0, 0.078), (0.08, 0.088, 0.01), 0.008, Ry(4).to_quaternion())
f = part('headwear:beanie', 'suit', HEAD, 800, res=0.009)
f.ellip(H(-0.02, 0, 0.09), (0.132, 0.118, 0.12), Ry(-10).to_quaternion())
band = part('headwear:beanie', 'accent', HEAD, 500, res=0.008)
band.ellip(H(0.0, 0, 0.075), (0.13, 0.12, 0.03), Ry(-10).to_quaternion())
band.ball(H(-0.03, 0, 0.225), 0.035)                                     # bobble
# Bands ride higher at the front than the back, above the brows as in 2D, and
# are capsules end to end: a ring of balls reads as beads once decimated.
def band_ring(f, rx, ry, z, lift, r, n=18):
    pts = [H(-0.01 + rx * math.cos(i / n * math.tau), ry * math.sin(i / n * math.tau),
             z + lift * math.cos(i / n * math.tau)) for i in range(n)]
    for a, b in zip(pts, pts[1:] + pts[:1]):
        f.capsule(a, b, r)


f = part('headwear:headband', 'accent', HEAD, 400, res=0.007)
band_ring(f, 0.118, 0.108, 0.078, 0.01, 0.015)
f = part('headwear:bandana', 'accent', HEAD, 500, res=0.007)
band_ring(f, 0.12, 0.11, 0.075, 0.012, 0.019)
f.ball(H(-0.14, 0, 0.06), 0.03)
f.capsule(H(-0.15, 0, 0.05), H(-0.20, 0.02, -0.03), 0.014)

# ================================================================ EYEWEAR
# Rings and lenses sit where MODELS3D.founder.face projects the drawn eyes (the
# eye line at H z = 0.02, about 0.045 either side), just proud of the face.
f = part('eyewear:glasses', 'frame', HEAD, 700, res=0.004)
for sy in (1, -1):
    ring = [H(0.142, 0.045 * sy + 0.024 * math.cos(i / 16 * math.tau), 0.02 + 0.02 * math.sin(i / 16 * math.tau))
            for i in range(16)]
    for a, b in zip(ring, ring[1:] + ring[:1]):
        f.capsule(a, b, 0.004)
    f.capsule(H(0.132, 0.07 * sy, 0.025), H(-0.01, 0.106 * sy, 0.02), 0.004)
f.capsule(H(0.146, -0.021, 0.028), H(0.146, 0.021, 0.028), 0.004)
f = part('eyewear:shades', 'lens', HEAD, 300, res=0.005)
for sy in (1, -1): f.ellip(H(0.14, 0.045 * sy, 0.02), (0.012, 0.03, 0.022))
g = part('eyewear:shades', 'frame', HEAD, 200, res=0.005)
g.capsule(H(0.148, -0.02, 0.032), H(0.148, 0.02, 0.032), 0.005)
for sy in (1, -1): g.capsule(H(0.13, 0.072 * sy, 0.03), H(-0.01, 0.106 * sy, 0.02), 0.004)
f = part('eyewear:visor', 'visor', HEAD, 400, res=0.006)
f.ellip(H(0.11, 0, 0.022), (0.04, 0.118, 0.032))

# ================================================================ FACIAL HAIR
# All of it stays clear of the drawn mouth (H z -0.022 to -0.061 at the
# centre) so every expression reads; test/gl3d.test.js holds it to that.
# Stubble has no mesh: in 2D it is a translucent shade, so the runtime paints
# it into the face texture instead.
f = part('facialHair:moustache', 'hair', HEAD, 250, res=0.005)
f.ellip(H(0.137, 0, -0.0145), (0.013, 0.05, 0.0075))
f = part('facialHair:goatee', 'hair', HEAD, 350, res=0.006)
f.ellip(H(0.112, 0, -0.094), (0.028, 0.034, 0.03))
f = part('facialHair:beard', 'hair', HEAD, 500, res=0.008)
f.ellip(H(0.045, 0, -0.094), (0.098, 0.102, 0.058)); f.ball(H(0.098, 0, -0.118), 0.04)
for sy in (1, -1): f.ellip(H(0.03, 0.098 * sy, -0.03), (0.035, 0.018, 0.045))

# ================================================================ ACCESSORIES
f = part('accessory:earrings', 'accent', HEAD, 200, res=0.005)
for sy in (1, -1): f.ball(H(-0.01, 0.112 * sy, -0.05), 0.013)
f = part('accessory:brooch', 'accent', ['chest'], 150, res=0.006)
f.ball(chest + V((0.185, 0.09, 0.16)), 0.02)

# ================================================================ CONDITIONS
# Unicorn Mode's golden horn, as drawHead draws it: out of the top of the head,
# tipped a little forward. A slim tapering core wound with a darker spiral.
f = part('fx:unicorn', 'gold', HEAD, 600, res=0.005)
g = part('fx:unicorn', 'gold2', HEAD, 400, res=0.004)
base, tip = H(0.04, 0, 0.12), H(0.09, 0, 0.40)
axis = (tip - base).normalized()
side = axis.cross(V((0, 1, 0))).normalized()
for i in range(13):
    k = i / 12
    f.ball(base.lerp(tip, k), 0.03 * (1 - k) + 0.005)
for i in range(22):
    k = i / 21
    a = k * math.tau * 2.5
    ring = V((0, 1, 0)) * math.cos(a) + side * math.sin(a)
    g.ball(base.lerp(tip, k) + ring * (0.026 * (1 - k) + 0.004), 0.009 * (1 - k) + 0.003)

# ================================================================ PROPS
# prop:<id> matches a part id in src/data/fighters.js, and inherits its states.
# The block briefcase, on the grip: hanging below and just ahead of the lead
# fist with its broad side to the camera, where the 2D part draws it (armF +
# (8, 52) px). Strapped to the forearm instead, it turned with the arm and a
# tight guard swung it behind the arm into the body.
grip = J['grip.L']
centre = grip + V((0.08, 0, -0.24))
f = part('prop:guard-case', 'case', ['grip.L'], 400, res=0.009)
f.cube(centre, (0.19, 0.045, 0.15), 0.02)
part('prop:guard-case', 'frame', ['grip.L'], 150, res=0.006).capsule(
    grip + V((0.02, 0, -0.06)), grip + V((0.14, 0, -0.06)), 0.012)
a, b = V((-0.23, 0.26, 1.50)), V((-0.23, -0.24, 1.04))
part('prop:mat', 'shoe', ['chest'], 500, res=0.012).capsule(a, b, 0.088)
st = part('prop:mat', 'accent', ['chest'], 300, res=0.008)
for t in (0.22, 0.78):
    p = a.lerp(b, t)
    st.capsule(p + V((-0.02, 0, 0)), p + V((0.20, 0, 0)), 0.013)


# The roster's signature props, one per fighter, placed where each 2D part
# sits (src/data/fighters.js `parts`). `armB` parts are held in the rear hand,
# on grip.R; `shoulder` and `hip` parts hang off the back, on the torso.
grip_r = J['grip.R']
BACK = ['chest']

# ava: a vial of the blood test that never worked, on the back of the hip
f = part('prop:vial', 'accent', ['hips'], 300, res=0.009)
f.capsule(hip + V((-0.20, 0.10, 0.15)), hip + V((-0.20, 0.10, -0.17)), 0.065)
part('prop:vial', 'white', ['hips'], 150, res=0.007).ellip(hip + V((-0.20, 0.10, 0.23)), (0.05, 0.05, 0.035))

# kai: the device, up in the rear hand, face to the camera. Solid accent, as
# the 2D part is: a dark screen on the camera side hid the colour that makes
# these props read at game size.
f = part('prop:device', 'accent', ['grip.R'], 250, res=0.007)
f.cube(grip_r + V((0.06, -0.01, 0.06)), (0.08, 0.018, 0.13), 0.02)

# zara: a ring light, a halo behind her head. The head is posed turned toward
# the camera (GL3D.YAW + GL3D.HEAD_YAW, 0.92 rad in src/config.js), and a ring
# built square to the bind pose turns with it and reads as a sideways bead
# chain, so it is built pre-turned by that angle. Change those two constants
# and this angle must follow.
HEAD_TURN = 0.92
normal = V((-math.sin(HEAD_TURN), math.cos(HEAD_TURN), 0))      # away from the camera once posed
across = V((math.cos(HEAD_TURN), math.sin(HEAD_TURN), 0))
ring_c = H(-0.01, 0, 0.03) + normal * 0.17
f = part('prop:ringlight', 'accent', HEAD, 700, res=0.008)
for i in range(30):
    a = i / 30 * math.tau
    f.ball(ring_c + across * (0.26 * math.cos(a)) + V((0, 0, 0.26 * math.sin(a))), 0.028)

# eleanor: a tablet held up in the rear hand, and a long coat behind the legs
f = part('prop:tablet', 'accent', ['grip.R'], 300, res=0.007)
f.cube(grip_r + V((0.10, -0.04, 0.10)), (0.12, 0.016, 0.16), 0.02, Ry(-11).to_quaternion())
f = part('prop:coat', 'hair', ['hips'], 700, res=0.012)
f.ellip(hip + V((-0.10, 0, -0.10)), (0.07, 0.20, 0.14))
f.ellip(hip + V((-0.13, 0, -0.40)), (0.06, 0.28, 0.24))

# dex: the asset he just stripped, hanging from the rear hand
f = part('prop:case', 'case', ['grip.R'], 400, res=0.009)
f.cube(grip_r + V((0.10, 0, -0.26)), (0.21, 0.05, 0.16), 0.02)
part('prop:case', 'frame', ['grip.R'], 150, res=0.006).capsule(
    grip_r + V((0.04, 0, -0.07)), grip_r + V((0.16, 0, -0.07)), 0.012)

# elo: a rocket booster strapped to the back
f = part('prop:booster', 'accent', BACK + ['spine'], 500, res=0.010)
f.capsule(chest + V((-0.25, 0, 0.30)), chest + V((-0.25, 0, -0.34)), 0.095)
f.ellip(chest + V((-0.25, 0, 0.36)), (0.07, 0.07, 0.09))
part('prop:booster', 'frame', BACK + ['spine'], 200, res=0.008).ellip(chest + V((-0.25, 0, -0.42)), (0.08, 0.08, 0.05))

# bozo: a parcel tucked under the rear arm
f = part('prop:parcel', 'hair', ['grip.R'], 300, res=0.009)
f.cube(grip_r + V((-0.05, 0, -0.04)), (0.19, 0.11, 0.15), 0.02, Ry(9).to_quaternion())
part('prop:parcel', 'shoe', ['grip.R'], 150, res=0.006).cube(
    grip_r + V((-0.05, 0, 0.115)), (0.195, 0.115, 0.012), 0.006, Ry(9).to_quaternion())

# scam: one enormous paperclip, on his back
f = part('prop:clip', 'shoe', BACK + ['spine'], 600, res=0.007)
top, x = chest + V((-0.28, 0, 0.40)), -0.28
def wire(a, b): f.capsule(chest + V((x, 0, a[1])) + V((0, a[0], 0)), chest + V((x, 0, b[1])) + V((0, b[0], 0)), 0.014)
for a, b in (((-0.11, 0.40), (0.11, 0.40)), ((0.11, 0.40), (0.11, -0.26)), ((-0.11, 0.40), (-0.11, -0.26)),
             ((-0.11, -0.26), (-0.04, -0.26)), ((-0.04, -0.26), (-0.04, 0.31)), ((-0.04, 0.31), (0.03, 0.31)),
             ((0.03, 0.31), (0.03, -0.26))):
    wire(a, b)

# ---------------------------------------------------------------- meshes
MATERIALS = {}
def material(role):
    if role not in MATERIALS:
        m = bpy.data.materials.new(role)
        try: m.use_nodes = True
        except Exception: pass
        p = m.node_tree.nodes.get('Principled BSDF')
        p.inputs['Base Color'].default_value = lin(ROLE_COLOUR.get(role) or FIXED[role])
        p.inputs['Roughness'].default_value = 1.0
        MATERIALS[role] = m
    return MATERIALS[role]


SEG = {name: (J[hj], J[tj]) for name, hj, tj, _ in BONES}


def seg_dist(p, a, b):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / ab.length_squared))
    return (p - (a + ab * t)).length


def weigh(ob, allowed):
    # Inverse-distance weights to bone segments, three influences at most. A
    # vertex never takes a limb bone from the opposite side, or the inner
    # thighs web together the first time the stance widens. Joining parts
    # later merges these groups by bone name.
    groups = {bn: ob.vertex_groups.new(name=bn) for bn in allowed}
    for v in ob.data.vertices:
        p = v.co
        cands = []
        for bn in allowed:
            if bn.endswith('.R') and p.y > 0.02: continue
            if bn.endswith('.L') and p.y < -0.02: continue
            cands.append((seg_dist(p, *SEG[bn]), bn))
        if not cands:
            cands = [(seg_dist(p, *SEG[bn]), bn) for bn in allowed]
        cands.sort()
        ws = [(1.0 / (d + 0.02) ** 4, bn) for d, bn in cands[:3]]
        total = sum(w for w, _ in ws)
        ws = [(w / total, bn) for w, bn in ws if w / total >= 0.03]
        total = sum(w for w, _ in ws)
        for w, bn in ws:
            groups[bn].add([v.index], w / total, 'REPLACE')


bpy.context.view_layer.update()
dg = bpy.context.evaluated_depsgraph_get()
by_object = {}
for fam, faces, bones in FAMILIES:
    me = bpy.data.meshes.new_from_object(fam.ob.evaluated_get(dg))
    ob = bpy.data.objects.new(fam.ob.name, me)
    scene.collection.objects.link(ob)
    me.materials.append(material(fam.role))
    n = len(me.polygons)
    if n > faces:
        dec = ob.modifiers.new('Decimate', 'DECIMATE')
        dec.ratio = faces / n
        with bpy.context.temp_override(object=ob, active_object=ob, selected_objects=[ob]):
            bpy.ops.object.modifier_apply(modifier=dec.name)
    me.shade_smooth()
    weigh(ob, bones)
    by_object.setdefault(fam.obj, []).append(ob)
for fam, _, _ in FAMILIES:
    bpy.data.objects.remove(fam.ob)

JOINED = {}
for obj, parts in by_object.items():
    target = parts[0]
    if len(parts) > 1:
        with bpy.context.temp_override(active_object=target, selected_editable_objects=parts, selected_objects=parts):
            bpy.ops.object.join()
    target.name = obj
    target.data.name = obj
    JOINED[obj] = target

# ---------------------------------------------------------------- armature
arm = bpy.data.armatures.new('rig')
rig = bpy.data.objects.new('rig', arm)
scene.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig
rig.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
for name, hj, tj, parent in BONES:
    eb = arm.edit_bones.new(name)
    eb.head, eb.tail = J[hj], J[tj]
    if parent:
        eb.parent = arm.edit_bones[parent]
bpy.ops.object.mode_set(mode='OBJECT')

# ---------------------------------------------------------------- skinning
for obj, ob in JOINED.items():
    mod = ob.modifiers.new('Armature', 'ARMATURE')
    mod.object = rig
    ob.parent = rig

# ---------------------------------------------------------------- export
os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=OUT, export_format='GLB', use_selection=False,
    export_skins=True, export_animations=False, export_morph=False,
    export_materials='EXPORT', export_texcoords=False, export_yup=True,
    export_apply=False, export_def_bones=False,
)
total = sum(len(ob.data.polygons) for ob in JOINED.values())
print(f'[founder] {len(JOINED)} meshes, {total} faces, {os.path.getsize(OUT)} bytes -> {OUT}')
for obj, ob in sorted(JOINED.items()):
    print(f'[founder]   {obj}: {len(ob.data.polygons)}')
