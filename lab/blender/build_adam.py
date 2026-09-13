# Builds assets/models/adam.glb: Adam Weumann as a skinned, toon-ready model
# for the live 3D renderer (src/engine/gl3d). Offline tooling, like the rest of
# lab/; the game only ever loads the .glb this writes.
#
#   /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
#     -P lab/blender/build_adam.py -- assets/models/adam.glb
#
# THE CONTRACT WITH THE RUNTIME (src/data/rig3d.js holds the same names):
#   * Units are rig units: 1.0 = 100 rig px, the same scale the 2D pose uses,
#     so a fist the pose puts at x = 84 px lands at 0.84.
#   * Blender Z is up and the character faces +X. Its right side (.R) is -Y,
#     which glTF export turns into +Z, toward the renderer's camera.
#   * Bones are named below. The runtime reads only each joint's REST POSITION
#     (from the inverse bind matrices), never bone rolls, so an artist can
#     rebuild this model by hand in Blender as long as the names and the rough
#     bind pose (standing, arms down and out) match.
#   * Every material is named for the palette role it takes its colour from
#     (suit, suit2, skin, pants, shoe, hair, accent). Any other name keeps the
#     colour exported with it. That is what lets one mesh wear any fighter's
#     palette, including a player founder's.
#
# The shape itself is metaballs, as in the September 2026 art spike: one
# metaball object per material, so each family blends into one smooth surface,
# converted to a mesh, decimated, and weighted to the bones by distance.
import bpy, math, os, sys
from mathutils import Vector as V, Matrix

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = os.path.abspath(ARGS[0] if ARGS else 'assets/models/adam.glb')

# Adam Weumann's palette, from src/data/fighters.js. Exported as each role's
# default; the runtime overrides every role material from the fighter's `c`.
PAL = dict(skin='#c68a5a', suit='#ff7a1a', suit2='#d15505', accent='#ffd23f',
           hair='#3b2a1c', pants='#33241d', shoe='#f5f5f5')

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene


def lin(h):
    h = h.lstrip('#')
    def c(v):
        v = int(v, 16) / 255
        return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
    return (c(h[0:2]), c(h[2:4]), c(h[4:6]), 1.0)


# ---------------------------------------------------------------- the skeleton
# Bind pose: standing straight, arms down and out at 45 degrees, facing +X.
D45 = math.sqrt(0.5)
J = {
    'hip': V((0, 0, 0.88)), 'spine': V((0, 0, 1.02)), 'chest': V((0, 0, 1.24)),
    'neck': V((0, 0, 1.50)), 'head': V((0, 0, 1.62)), 'head_top': V((0, 0, 1.98)),
}
for side, sy in (('R', -1), ('L', 1)):
    sh = V((0, 0.27 * sy, 1.46))
    d = V((0, D45 * sy, -D45))
    J['shoulder.' + side] = sh
    J['elbow.' + side] = sh + d * 0.40
    J['wrist.' + side] = sh + d * 0.78
    J['fist.' + side] = sh + d * 0.84
    J['hipj.' + side] = V((0, 0.10 * sy, 0.86))
    J['knee.' + side] = V((0, 0.105 * sy, 0.45))
    J['ankle.' + side] = V((0, 0.11 * sy, 0.06))
    J['toe.' + side] = V((0.17, 0.11 * sy, 0.02))

BONES = [  # name, head joint, tail joint, parent
    ('hips', 'hip', 'spine', None),
    ('spine', 'spine', 'chest', 'hips'),
    ('chest', 'chest', 'neck', 'spine'),
    ('neck', 'neck', 'head', 'chest'),
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

# ---------------------------------------------------------------- metaballs
K = 0.685      # visible radius of an isolated element at stiffness 4
STIFF = 4.0


class Family:
    def __init__(self, name, res):
        self.name = name
        self.mb = bpy.data.metaballs.new(name)
        self.mb.resolution = res
        self.mb.render_resolution = res
        self.mb.threshold = 0.6
        self.ob = bpy.data.objects.new(name, self.mb)
        scene.collection.objects.link(self.ob)

    def ball(self, co, r):
        e = self.mb.elements.new(type='BALL'); e.co = V(co); e.radius = r / K; e.stiffness = STIFF

    def ellip(self, co, size, rot=None):
        e = self.mb.elements.new(type='ELLIPSOID'); e.co = V(co); e.radius = 1 / K; e.stiffness = STIFF
        e.size_x, e.size_y, e.size_z = size
        if rot is not None: e.rotation = rot

    def bone(self, a, b, extra, r1, r2=None, t=0.5):
        a, b = V(a), V(b); d = b - a
        q = d.normalized().to_track_quat('X', 'Z')
        self.ellip(a + d * t, (d.length / 2 + extra, r1, r2 if r2 is not None else r1), q)

    def cube(self, co, half, rounding, rot=None):
        e = self.mb.elements.new(type='CUBE'); e.co = V(co); e.radius = rounding / K; e.stiffness = STIFF
        e.size_x, e.size_y, e.size_z = [max(0.001, h - rounding) for h in half]
        if rot is not None: e.rotation = rot

    def capsule(self, a, b, r):
        a, b = V(a), V(b); d = b - a
        e = self.mb.elements.new(type='CAPSULE'); e.co = (a + b) / 2; e.radius = r / K; e.stiffness = STIFF
        e.size_x = d.length / 2
        e.rotation = d.normalized().to_track_quat('X', 'Z')


def Rx(deg): return Matrix.Rotation(math.radians(deg), 3, 'X')
def Ry(deg): return Matrix.Rotation(math.radians(deg), 3, 'Y')


FAM = {}
def fam(name, res):
    FAM[name] = Family(name, res)
    return FAM[name]

# Material role for each family, and a face budget for its decimated mesh.
ROLE = dict(Hoodie='suit', Skin='skin', Pants='pants', Shoe='shoe', Sole='sole', Hair='hair',
            Beard='beard', Cap='suit2', Face='ink', White='white', Mat='mat', Strap='accent')
FACES = dict(Hoodie=3200, Skin=3600, Pants=2400, Shoe=1400, Sole=500, Hair=700,
             Beard=400, Cap=700, Face=500, White=300, Mat=500, Strap=900)
FIXED = dict(sole='#9aa0aa', beard='#6e4a30', ink='#1b1210', white='#fbf6ee', mat='#cfc3ee')

H = fam('Hoodie', 0.012); S = fam('Skin', 0.008); PA = fam('Pants', 0.012)
SH = fam('Shoe', 0.010); SO = fam('Sole', 0.009); HR = fam('Hair', 0.011)
BD = fam('Beard', 0.009); C = fam('Cap', 0.008); F = fam('Face', 0.005)
W = fam('White', 0.005); M = fam('Mat', 0.012); ST = fam('Strap', 0.008)

hip, spine, chest, neck, head = J['hip'], J['spine'], J['chest'], J['neck'], J['head']
headc = head + V((0, 0, 0.18))          # skull centre, 1.80: the 2D rig's head sits at 1.82

# ---- hoodie: a heavy, boxy torso that tapers hard to the waist
H.ellip(chest + V((0.01, 0, 0.10)), (0.17, 0.28, 0.20))
H.ellip(spine + V((0.02, 0, 0.08)), (0.15, 0.21, 0.15))
H.ellip(hip + V((0, 0, 0.08)), (0.14, 0.20, 0.08))
H.ellip(neck + V((-0.09, 0, -0.03)), (0.08, 0.16, 0.08))           # the bunched hood
for s, sy in (('R', -1), ('L', 1)):
    sh, el = J['shoulder.' + s], J['elbow.' + s]
    H.ellip(sh + V((0, 0.01 * sy, 0.01)), (0.115, 0.11, 0.105))     # deltoid
    H.bone(sh, el, 0.02, 0.088, 0.084, t=0.45)                       # sleeve
    H.ball(el + (el - sh).normalized() * 0.03, 0.086)                # pushed-up cuff
    top = neck + V((0.13, 0.05 * sy, -0.06))
    ST.capsule(top, top + V((0.02, 0.005 * sy, -0.16)), 0.009)       # drawstrings

# ---- skin: neck, forearms, fists, head
S.capsule(neck, headc + V((-0.01, 0, -0.07)), 0.066)
for s in ('R', 'L'):
    el, wr = J['elbow.' + s], J['wrist.' + s]
    d = (wr - el).normalized()
    q = d.to_track_quat('X', 'Z')
    S.bone(el, wr, 0.0, 0.066, 0.058, t=0.34)
    S.ball(wr, 0.042)
    S.cube(wr + d * 0.075, (0.074, 0.062, 0.068), 0.032, q)
    S.ellip(wr + d * 0.10 + q @ V((0, 0, 0.05)), (0.05, 0.058, 0.02), q)
S.ellip(headc + V((-0.01, 0, 0.025)), (0.118, 0.103, 0.128))       # cranium
S.ellip(headc + V((0.045, 0, -0.075)), (0.088, 0.086, 0.066))      # square jaw
S.ball(headc + V((0.096, 0, -0.108)), 0.038)                         # chin
S.ellip(headc + V((0.122, 0, -0.005)), (0.036, 0.021, 0.034))      # nose
S.ellip(headc + V((0.10, 0, 0.042)), (0.028, 0.088, 0.022))        # brow ridge
for sy in (1, -1):
    S.ball(headc + V((0.082, 0.06 * sy, -0.014)), 0.03)
    S.ellip(headc + V((-0.012, 0.104 * sy, -0.012)), (0.028, 0.013, 0.039))

# ---- stubble, long hair, a backwards cap
BD.ellip(headc + V((0.05, 0, -0.084)), (0.085, 0.09, 0.061))
BD.ball(headc + V((0.10, 0, -0.114)), 0.04)
HR.ellip(headc + V((-0.065, 0, 0.0)), (0.086, 0.108, 0.108))
HR.ellip(headc + V((-0.11, 0, -0.11)), (0.066, 0.10, 0.096))
HR.ellip(headc + V((-0.125, 0, -0.21)), (0.054, 0.09, 0.07))
C.ellip(headc + V((-0.005, 0, 0.065)), (0.128, 0.115, 0.092))
C.cube(headc + V((-0.165, 0, 0.05)), (0.082, 0.088, 0.01), 0.008, Ry(-12).to_quaternion())
ST.ball(headc + V((-0.005, 0, 0.158)), 0.014)

# ---- face: heavy brows, wide eyes, a manic grin
for sy in (1, -1):
    F.ellip(headc + V((0.116, 0.04 * sy, 0.056)), (0.011, 0.032, 0.009), Rx(-10 * sy).to_quaternion())
    W.ellip(headc + V((0.107, 0.038 * sy, 0.02)), (0.009, 0.019, 0.014))
    F.ball(headc + V((0.116, 0.036 * sy, 0.019)), 0.008)
F.ellip(headc + V((0.118, 0, -0.062)), (0.009, 0.04, 0.014))
W.ellip(headc + V((0.124, 0, -0.056)), (0.005, 0.034, 0.006))

# ---- joggers and high-top sneakers
PA.ellip(hip + V((0, 0, -0.03)), (0.14, 0.18, 0.13))
for s, sy in (('R', -1), ('L', 1)):
    hj, kn, an = J['hipj.' + s], J['knee.' + s], J['ankle.' + s]
    PA.bone(hj, kn, 0.03, 0.105, 0.10, t=0.40)
    PA.ball(kn, 0.074)
    PA.bone(kn, an, 0.0, 0.08, 0.074, t=0.36)
    PA.ball(an + V((0, 0, 0.045)), 0.058)
    o = an + V((-0.02, 0, -0.06))
    SO.cube(o + V((0.06, 0, 0.018)), (0.16, 0.07, 0.018), 0.012)
    SH.cube(o + V((0.03, 0, 0.07)), (0.12, 0.064, 0.055), 0.042)
    SH.ellip(o + V((0.14, 0, 0.055)), (0.075, 0.06, 0.042))
    SH.ball(o + V((-0.02, 0, 0.12)), 0.058)
    ST.ellip(o + V((0.02, 0.066 * sy, 0.07)), (0.06, 0.006, 0.02))

# ---- the rolled yoga mat across his back, with its strap
a, b = V((-0.23, 0.26, 1.50)), V((-0.23, -0.24, 1.04))
M.capsule(a, b, 0.088)
for t in (0.22, 0.78):
    p = a.lerp(b, t)
    ST.capsule(p + V((-0.02, 0, 0)), p + V((0.20, 0, 0)), 0.013)

# ---------------------------------------------------------------- meshes
def material(role):
    m = bpy.data.materials.new(role)
    try: m.use_nodes = True
    except Exception: pass
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = lin(PAL.get(role) or FIXED[role])
    p.inputs['Roughness'].default_value = 1.0
    return m


bpy.context.view_layer.update()
dg = bpy.context.evaluated_depsgraph_get()
MESHES = {}
for name, f in FAM.items():
    me = bpy.data.meshes.new_from_object(f.ob.evaluated_get(dg))
    ob = bpy.data.objects.new(name.lower(), me)
    scene.collection.objects.link(ob)
    me.materials.append(material(ROLE[name]))
    faces = len(me.polygons)
    if faces > FACES[name]:
        dec = ob.modifiers.new('Decimate', 'DECIMATE')
        dec.ratio = FACES[name] / faces
        with bpy.context.temp_override(object=ob, active_object=ob, selected_objects=[ob]):
            bpy.ops.object.modifier_apply(modifier=dec.name)
    me.shade_smooth()
    MESHES[name] = ob
    print(f'[adam] {name}: {faces} -> {len(me.polygons)} faces')
for f in FAM.values():
    bpy.data.objects.remove(f.ob)

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

# ---------------------------------------------------------------- weights
# Inverse-distance weights to bone segments, three influences at most. Which
# bones a family may use keeps a sleeve off the legs and a shoe off the hips,
# and a vertex never takes a limb bone from the opposite side: without that,
# the inner thighs are almost equidistant from both legs and webbed together
# the first time the stance widened.
SEG = {name: (J[hj], J[tj]) for name, hj, tj, _ in BONES}
ALLOW = {
    'Hoodie': ['hips', 'spine', 'chest', 'neck', 'upper_arm.R', 'upper_arm.L', 'forearm.R', 'forearm.L'],
    'Skin': ['chest', 'neck', 'head', 'upper_arm.R', 'upper_arm.L', 'forearm.R', 'forearm.L'],
    'Pants': ['hips', 'thigh.R', 'thigh.L', 'shin.R', 'shin.L'],
    'Shoe': ['shin.R', 'shin.L', 'foot.R', 'foot.L'],
    'Sole': ['foot.R', 'foot.L'],
    'Hair': ['head'], 'Beard': ['head'], 'Cap': ['head'], 'Face': ['head'], 'White': ['head'],
    'Mat': ['chest'],
    'Strap': [n for n, *_ in BONES],
}


def seg_dist(p, a, b):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / ab.length_squared))
    return (p - (a + ab * t)).length


for name, ob in MESHES.items():
    groups = {bn: ob.vertex_groups.new(name=bn) for bn in ALLOW[name]}
    for v in ob.data.vertices:
        p = v.co
        cands = []
        for bn in ALLOW[name]:
            if bn.endswith('.R') and p.y > 0.02: continue
            if bn.endswith('.L') and p.y < -0.02: continue
            cands.append((seg_dist(p, *SEG[bn]), bn))
        cands.sort()
        top = cands[:3]
        ws = [(1.0 / (d + 0.02) ** 4, bn) for d, bn in top]
        total = sum(w for w, _ in ws)
        ws = [(w / total, bn) for w, bn in ws]
        ws = [(w, bn) for w, bn in ws if w >= 0.03]
        total = sum(w for w, _ in ws)
        for w, bn in ws:
            groups[bn].add([v.index], w / total, 'REPLACE')
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
total = sum(len(ob.data.polygons) for ob in MESHES.values())
print(f'[adam] {total} faces, {os.path.getsize(OUT)} bytes -> {OUT}')
