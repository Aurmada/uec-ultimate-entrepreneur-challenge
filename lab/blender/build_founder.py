# Builds assets/models/founder.glb: ONE modular, skinned model that every
# fighter wears, for the live 3D renderer (src/engine/gl3d). Offline tooling,
# like the rest of lab/; the game only ever loads the .glb this writes.
#
#   /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
#     -P lab/blender/build_founder.py -- assets/models/founder.glb
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
#       body          always drawn (skin, face, legs, shoes)
#       <slot>:<id>   drawn when the fighter's look picks that option; slots are
#                     hair, headwear, eyewear, facialHair, outfit, accessory
#       prop:<id>     drawn when the fighter carries a part with that id, in
#                     that part's states (the block briefcase, Adam's mat)
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

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

# Default colours for the exported roles (a neutral founder). The runtime
# replaces every role colour from the fighter's own palette.
ROLE_COLOUR = dict(skin='#e8b48c', suit='#5865f2', suit2='#3d47c9', accent='#29d9ff',
                   hair='#2a2320', pants='#23294f', shoe='#eef1ff')
FIXED = dict(sole='#9aa0aa', ink='#1b1210', white='#fbf6ee', shirt='#f4f6ff',
             lens='#15171f', case='#6b4a2b', frame='#1b1a22', visor='#29d9ff')
# Derived roles: the runtime computes these from the palette rather than
# storing a colour. skinShade is the skin darkened, which is what stubble is.
DERIVED = dict(skinShade='#9b7458')

# Decimation targets below are counted in the metaball mesh's quads; the
# decimated result is triangles, about twice as many. DETAIL scales every target.
DETAIL = 0.5


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
J['grip.L'] = J['fist.L']
J['grip_tip.L'] = J['fist.L'] + V((0.10, 0, 0))

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
BONES.append(('grip.L', 'grip.L', 'grip_tip.L', 'forearm.L'))
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


# Bones belong to each PART, not to the object it joins. The base body is six
# parts (skin, face, eyes, pants, shoes, soles) under one name; keyed by name,
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
skin = part('body', 'skin', BODY_BONES + ['spine'], 4200, res=0.008)
skin.capsule(neck, H(-0.01, 0, -0.07), 0.066)
skin.ellip(neck + V((0.05, 0, -0.05)), (0.10, 0.15, 0.08))           # fills any neckline
for s in ('R', 'L'):
    sh, el, wr = J['shoulder.' + s], J['elbow.' + s], J['wrist.' + s]
    d = ARM_DIR[s]
    q = d.to_track_quat('X', 'Z')
    skin.bone(sh, el, 0.0, 0.070, 0.064, t=0.45)                       # bare upper arm, under any sleeve
    skin.bone(el, wr, 0.0, 0.066, 0.058, t=0.34)                       # forearm
    skin.ball(wr, 0.042)
    skin.cube(wr + d * 0.075, (0.074, 0.062, 0.068), 0.032, q)          # fist
    skin.ellip(wr + d * 0.10 + q @ V((0, 0, 0.05)), (0.05, 0.058, 0.02), q)
skin.ellip(H(-0.01, 0, 0.025), (0.118, 0.103, 0.128))                  # cranium
skin.ellip(H(0.045, 0, -0.075), (0.088, 0.086, 0.066))                 # jaw
skin.ball(H(0.096, 0, -0.108), 0.038)                                    # chin
skin.ellip(H(0.122, 0, -0.005), (0.036, 0.021, 0.034))                 # nose
skin.ellip(H(0.10, 0, 0.042), (0.028, 0.088, 0.022))                   # brow ridge
for sy in (1, -1):
    skin.ball(H(0.082, 0.06 * sy, -0.014), 0.03)
    skin.ellip(H(-0.012, 0.104 * sy, -0.012), (0.028, 0.013, 0.039))

face = part('body', 'ink', HEAD, 500, res=0.005)
white = part('body', 'white', HEAD, 300, res=0.005)
for sy in (1, -1):
    face.ellip(H(0.116, 0.04 * sy, 0.056), (0.011, 0.032, 0.009), Rx(-10 * sy).to_quaternion())
    white.ellip(H(0.107, 0.038 * sy, 0.02), (0.009, 0.019, 0.014))
    face.ball(H(0.116, 0.036 * sy, 0.019), 0.008)
face.ellip(H(0.118, 0, -0.062), (0.009, 0.04, 0.014))

pants = part('body', 'pants', ['hips', 'thigh.R', 'thigh.L', 'shin.R', 'shin.L'], 2400, res=0.012)
shoe = part('body', 'shoe', ['shin.R', 'shin.L', 'foot.R', 'foot.L'], 1400)
sole = part('body', 'sole', ['foot.R', 'foot.L'], 500, res=0.009)
pants.ellip(hip + V((0, 0, -0.03)), (0.14, 0.18, 0.13))
for s, sy in (('R', -1), ('L', 1)):
    hj, kn, an = J['hipj.' + s], J['knee.' + s], J['ankle.' + s]
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
def torso(f, girth=1.0):
    g = girth
    f.ellip(chest + V((0.01, 0, 0.10)), (0.17 * g, 0.28 * g, 0.20 * g))
    f.ellip(spine + V((0.02, 0, 0.08)), (0.15 * g, 0.21 * g, 0.15 * g))
    f.ellip(hip + V((0, 0, 0.08)), (0.14 * g, 0.20 * g, 0.08))
    for s, sy in (('R', -1), ('L', 1)):
        f.ellip(J['shoulder.' + s] + V((0, 0.01 * sy, 0.01)), (0.115 * g, 0.11 * g, 0.105 * g))


def sleeves(f, reach, radius=0.088):
    # reach: 'short' ends mid upper arm, 'pushed' just past the elbow, 'long' at the wrist
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


def outfit(name, faces=2000):
    obj = 'outfit:' + name
    return (part(obj, 'suit', TORSO_BONES, faces),
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
f.ellip(H(-0.02, 0, 0.09), (0.17, 0.17, 0.16))
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
f = part('hair:cap', 'suit2', HEAD, 800, res=0.008)
f.ellip(H(-0.005, 0, 0.065), (0.128, 0.115, 0.092))
f.cube(H(-0.165, 0, 0.05), (0.082, 0.088, 0.01), 0.008, Ry(-12).to_quaternion())

# ================================================================ HEADWEAR
# player cap: brim forward and clear of the eyes, as drawHeadwear draws it
f = part('headwear:cap', 'suit2', HEAD, 800, res=0.008)
f.ellip(H(-0.01, 0, 0.07), (0.128, 0.115, 0.09))
f.cube(H(0.15, 0, 0.065), (0.08, 0.088, 0.01), 0.008, Ry(10).to_quaternion())
f = part('headwear:beanie', 'suit', HEAD, 800, res=0.009)
f.ellip(H(-0.02, 0, 0.08), (0.132, 0.118, 0.12))
band = part('headwear:beanie', 'accent', HEAD, 500, res=0.008)
band.ellip(H(0.0, 0, 0.055), (0.13, 0.12, 0.03))
band.ball(H(-0.02, 0, 0.215), 0.035)                                     # bobble
f = part('headwear:headband', 'accent', HEAD, 400, res=0.007)
for i in range(18):
    a = i / 18 * math.tau
    f.ball(H(-0.01 + 0.118 * math.cos(a), 0.108 * math.sin(a), 0.075), 0.017)
f = part('headwear:bandana', 'accent', HEAD, 500, res=0.007)
for i in range(18):
    a = i / 18 * math.tau
    f.ball(H(-0.01 + 0.12 * math.cos(a), 0.11 * math.sin(a), 0.07), 0.02)
f.ball(H(-0.14, 0, 0.06), 0.03)
f.capsule(H(-0.15, 0, 0.05), H(-0.20, 0.02, -0.03), 0.014)

# ================================================================ EYEWEAR
f = part('eyewear:glasses', 'frame', HEAD, 400, res=0.005)
for sy in (1, -1):
    for i in range(12):
        a = i / 12 * math.tau
        f.ball(H(0.13, 0.04 * sy + 0.022 * math.cos(a), 0.02 + 0.016 * math.sin(a)), 0.0045)
    f.capsule(H(0.125, 0.064 * sy, 0.025), H(-0.01, 0.106 * sy, 0.02), 0.004)
f.capsule(H(0.132, -0.018, 0.028), H(0.132, 0.018, 0.028), 0.004)
f = part('eyewear:shades', 'lens', HEAD, 300, res=0.005)
for sy in (1, -1): f.ellip(H(0.128, 0.04 * sy, 0.02), (0.012, 0.028, 0.02))
g = part('eyewear:shades', 'frame', HEAD, 200, res=0.005)
g.capsule(H(0.132, -0.02, 0.03), H(0.132, 0.02, 0.03), 0.005)
for sy in (1, -1): g.capsule(H(0.12, 0.066 * sy, 0.028), H(-0.01, 0.106 * sy, 0.02), 0.004)
f = part('eyewear:visor', 'visor', HEAD, 400, res=0.006)
f.ellip(H(0.10, 0, 0.022), (0.04, 0.118, 0.026))

# ================================================================ FACIAL HAIR
f = part('facialHair:stubble', 'skinShade', HEAD, 400, res=0.008)
f.ellip(H(0.05, 0, -0.084), (0.085, 0.09, 0.061)); f.ball(H(0.10, 0, -0.114), 0.04)
f = part('facialHair:moustache', 'hair', HEAD, 250, res=0.005)
f.ellip(H(0.128, 0, -0.035), (0.015, 0.042, 0.012))
f = part('facialHair:goatee', 'hair', HEAD, 350, res=0.006)
f.ellip(H(0.128, 0, -0.035), (0.015, 0.042, 0.012)); f.ellip(H(0.105, 0, -0.115), (0.035, 0.035, 0.032))
f = part('facialHair:beard', 'hair', HEAD, 500, res=0.008)
f.ellip(H(0.05, 0, -0.09), (0.092, 0.098, 0.07)); f.ball(H(0.105, 0, -0.13), 0.048)
f.ellip(H(0.128, 0, -0.035), (0.015, 0.045, 0.013))

# ================================================================ ACCESSORIES
f = part('accessory:earrings', 'accent', HEAD, 200, res=0.005)
for sy in (1, -1): f.ball(H(-0.01, 0.112 * sy, -0.05), 0.013)
f = part('accessory:brooch', 'accent', ['chest'], 150, res=0.006)
f.ball(chest + V((0.185, 0.09, 0.16)), 0.02)

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


# ---------------------------------------------------------------- meshes
MATERIALS = {}
def material(role):
    if role not in MATERIALS:
        m = bpy.data.materials.new(role)
        try: m.use_nodes = True
        except Exception: pass
        p = m.node_tree.nodes.get('Principled BSDF')
        p.inputs['Base Color'].default_value = lin(ROLE_COLOUR.get(role) or FIXED.get(role) or DERIVED[role])
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
