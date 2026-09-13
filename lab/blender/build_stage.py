# Builds one arena as a rendered stage for the live 3D prototype: a lit Blender
# scene rendered to the images and data src/engine/stage.js draws behind the
# fighters. Offline tooling, like build_founder.py; the game only loads what
# this writes.
#
#   /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
#     -P lab/blender/build_stage.py -- garage
#
# The scene itself lives in lab/blender/stages/<arena id>.py, as a function
# build(kit). This file is the part every stage shares: the camera, the
# helpers, the renders and the data file.
#
# THE CONTRACT WITH THE RUNTIME (docs/ARCHITECTURE.md, "Rendered stages"):
#   * World units are rig units: 1.0 = 100 stage px, the scale the fighters are
#     modelled in. Blender Z is up, X runs from stage left to stage right, and
#     +Y goes away from the camera. The fight lane is the plane Y = 0 and its
#     floor is Z = 0.
#   * The camera looks straight down +Y, never tilted, so walls stay upright.
#     Its lens and height put the fight lane exactly where the game draws it:
#     100 stage px to a unit, and the floor at STAGE.FLOOR. It is checked by
#     projection after the build and the build fails if it drifts.
#   * assets/stages/<id>/back.webp   the stage, opaque, 2x the 960x540 world
#     assets/stages/<id>/glow.webp   only what emits light, on transparent, for
#                                    the runtime to pulse over the stage
#     assets/stages/<id>/stage.json  { size, floorY, screens: { id: quad } }
#   * A screen is a flat panel facing the camera that the runtime paints live
#     (a sponsor board, a chart). Its quad is four corners in world px, in the
#     order top left, top right, bottom right, bottom left.
import bpy, importlib.util, json, math, os, sys
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
if not ARGS:
    raise SystemExit('usage: build_stage.py -- <arena id> [out dir]')
STAGE_ID = ARGS[0]
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.abspath(ARGS[1] if len(ARGS) > 1 else os.path.join(ROOT, 'assets', 'stages', STAGE_ID))

# The game's world, as src/config.js STAGE has it.
W, H, FLOOR = 960, 540, 480
UNIT = 100                 # stage px per unit at the fight lane
SCALE = 2                  # images are rendered at twice the world
DISTANCE = 9.6             # camera to fight lane; with a 36 mm sensor, lens = 3.75 * DISTANCE
EYE = 1.5                  # camera height: the horizon sits 150 px above the floor line

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.engine = 'BLENDER_EEVEE'
sc.render.resolution_x, sc.render.resolution_y = W * SCALE, H * SCALE
sc.render.resolution_percentage = 100
sc.eevee.taa_render_samples = 64
sc.eevee.use_raytracing = True
sc.view_settings.view_transform = 'AgX'
sc.view_settings.look = 'AgX - Punchy'


def lin(h):
    h = h.lstrip('#')

    def c(v):
        v = int(v, 16) / 255
        return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
    return (c(h[0:2]), c(h[2:4]), c(h[4:6]), 1.0)


class Kit:
    """What a stage script builds with. Everything is in world units."""

    def __init__(self):
        self.materials = {}
        self.emissive = set()          # material names that give off light
        self.glowing = set()           # the ones that also go in the glow layer
        self.screens = {}              # id -> object
        world = bpy.data.worlds.new('world')
        sc.world = world
        world.use_nodes = True
        self.background = world.node_tree.nodes.get('Background')
        self.exposure(0.0)
        self.sky('#0c0f1a', 0.3)

    def exposure(self, stops):
        sc.view_settings.exposure = stops

    def sky(self, hexcol, strength):
        self.background.inputs[0].default_value = lin(hexcol)
        self.background.inputs[1].default_value = strength

    def mat(self, hexcol, rough=0.7, metal=0.0, emit=None, strength=0.0, glow=True):
        """A plain material. `emit` makes it give off light; `glow=False` keeps
        a dim emitter (a night window, a screen) out of the pulsing glow layer."""
        key = (hexcol, rough, metal, emit, strength, glow)
        if key in self.materials:
            return self.materials[key]
        m = bpy.data.materials.new(f'm{len(self.materials)}')
        m.use_nodes = True
        p = m.node_tree.nodes.get('Principled BSDF')
        p.inputs['Base Color'].default_value = lin(hexcol)
        p.inputs['Roughness'].default_value = rough
        p.inputs['Metallic'].default_value = metal
        if emit:
            p.inputs['Emission Color'].default_value = lin(emit)
            p.inputs['Emission Strength'].default_value = strength
            self.emissive.add(m.name)
            if glow:
                self.glowing.add(m.name)
        self.materials[key] = m
        return m

    def gradient(self, bottom, top, z0, z1, strength):
        """An emissive backdrop shading from `bottom` at world z0 to `top` at z1:
        a night sky, a stage cyclorama. It gives off light but never glows."""
        m = bpy.data.materials.new(f'gradient{len(self.materials)}')
        self.materials[m.name] = m
        m.use_nodes = True
        nt = m.node_tree
        p = nt.nodes.get('Principled BSDF')
        p.inputs['Base Color'].default_value = (0, 0, 0, 1)
        coords = nt.nodes.new('ShaderNodeTexCoord')
        xyz = nt.nodes.new('ShaderNodeSeparateXYZ')
        span = nt.nodes.new('ShaderNodeMapRange')
        span.inputs['From Min'].default_value, span.inputs['From Max'].default_value = z0, z1
        mix = nt.nodes.new('ShaderNodeMix')
        mix.data_type = 'RGBA'
        mix.inputs[6].default_value, mix.inputs[7].default_value = lin(bottom), lin(top)
        nt.links.new(coords.outputs['Object'], xyz.inputs[0])
        nt.links.new(xyz.outputs['Z'], span.inputs['Value'])
        nt.links.new(span.outputs['Result'], mix.inputs[0])
        nt.links.new(mix.outputs[2], p.inputs['Emission Color'])
        p.inputs['Emission Strength'].default_value = strength
        self.emissive.add(m.name)
        return m

    def windows(self, facade, glass, lit, strength, cell=(0.3, 0.2), bias=0.0):
        """A facade of lit windows: a grid of `cell` (width, height) panes,
        each lit to a random share of `lit` (bias -1 all lit .. 1 all dark)."""
        m = bpy.data.materials.new(f'windows{len(self.materials)}')
        self.materials[m.name] = m
        m.use_nodes = True
        nt = m.node_tree
        p = nt.nodes.get('Principled BSDF')
        coords = nt.nodes.new('ShaderNodeTexCoord')
        mapping = nt.nodes.new('ShaderNodeMapping')
        mapping.inputs['Rotation'].default_value = (math.radians(-90), 0, 0)   # facade X, Z -> texture X, Y
        bricks = nt.nodes.new('ShaderNodeTexBrick')
        bricks.offset, bricks.squash = 0.0, 1.0
        bricks.inputs['Scale'].default_value = 1.0
        bricks.inputs['Brick Width'].default_value = cell[0]
        bricks.inputs['Row Height'].default_value = cell[1]
        bricks.inputs['Mortar Size'].default_value = min(cell) * 0.28
        bricks.inputs['Mortar Smooth'].default_value = 0.0
        bricks.inputs['Bias'].default_value = bias
        bricks.inputs['Color1'].default_value = lin(lit)
        bricks.inputs['Color2'].default_value = (0, 0, 0, 1)
        bricks.inputs['Mortar'].default_value = (0, 0, 0, 1)
        mix = nt.nodes.new('ShaderNodeMix')
        mix.data_type = 'RGBA'
        mix.inputs[6].default_value = lin(glass)      # A: the pane
        mix.inputs[7].default_value = lin(facade)     # B: the frame between panes
        nt.links.new(coords.outputs['Object'], mapping.inputs['Vector'])
        nt.links.new(mapping.outputs['Vector'], bricks.inputs['Vector'])
        nt.links.new(bricks.outputs['Factor'], mix.inputs[0])
        nt.links.new(mix.outputs[2], p.inputs['Base Color'])
        nt.links.new(bricks.outputs['Color'], p.inputs['Emission Color'])
        p.inputs['Emission Strength'].default_value = strength
        p.inputs['Roughness'].default_value = 0.6
        self.emissive.add(m.name)
        self.glowing.add(m.name)
        return m

    def _finish(self, o, m, smooth=False):
        o.data.materials.append(m)
        for poly in o.data.polygons:
            poly.use_smooth = smooth
        # Anything that gives off light casts no shadow: a bulb inside its own
        # lamp's light otherwise throws a dark blot across the wall behind it.
        if m.name in self.emissive:
            o.visible_shadow = False
        return o

    def box(self, center, size, m, bevel=0.0, rot=(0, 0, 0)):
        bpy.ops.mesh.primitive_cube_add(size=1, location=center)
        o = bpy.context.active_object
        o.scale = size
        bpy.ops.object.transform_apply(scale=True)
        o.rotation_euler = rot
        if bevel:
            b = o.modifiers.new('bevel', 'BEVEL')
            b.width, b.segments = bevel, 2
        return self._finish(o, m)

    def cylinder(self, center, radius, depth, m, rot=(0, 0, 0), verts=32):
        bpy.ops.mesh.primitive_cylinder_add(radius=radius, depth=depth, location=center, vertices=verts)
        o = bpy.context.active_object
        o.rotation_euler = rot
        return self._finish(o, m, smooth=True)

    def sphere(self, center, radius, m):
        bpy.ops.mesh.primitive_uv_sphere_add(radius=radius, location=center, segments=24, ring_count=12)
        return self._finish(bpy.context.active_object, m, smooth=True)

    def text(self, body, loc, size, m, align='LEFT', extrude=0.004):
        t = bpy.data.curves.new('text', 'FONT')
        t.body, t.size, t.extrude, t.align_x = body, size, extrude, align
        o = bpy.data.objects.new('text', t)
        sc.collection.objects.link(o)
        o.location = loc
        o.rotation_euler = (math.radians(90), 0, 0)     # face the camera
        t.materials.append(m)
        if m.name in self.emissive:
            o.visible_shadow = False
        return o

    def tube(self, points, radius, m):
        curve = bpy.data.curves.new('tube', 'CURVE')
        curve.dimensions, curve.bevel_depth = '3D', radius
        spline = curve.splines.new('BEZIER')
        spline.bezier_points.add(len(points) - 1)
        for bp, p in zip(spline.bezier_points, points):
            bp.co = p
            bp.handle_left_type = bp.handle_right_type = 'AUTO'
        o = bpy.data.objects.new('tube', curve)
        sc.collection.objects.link(o)
        curve.materials.append(m)
        return o

    def light(self, kind, loc, energy, hexcol='#ffffff', size=0.2, rot=(0, 0, 0), shadow=True):
        L = bpy.data.lights.new(f'{kind}{len(bpy.data.lights)}', kind)
        L.energy, L.color = energy, lin(hexcol)[:3]
        L.use_shadow = shadow
        if kind in ('POINT', 'SPOT'):
            L.shadow_soft_size = size
        if kind == 'AREA':
            L.size = size
        o = bpy.data.objects.new(L.name, L)
        sc.collection.objects.link(o)
        o.location, o.rotation_euler = loc, rot
        return o

    def screen(self, id, center, size, hexcol='#05070f'):
        """A dark panel facing the camera that the runtime paints live."""
        o = self.box(center, (size[0], 0.02, size[1]), self.mat(hexcol, 0.4))
        self.screens[id] = o
        return o


def fight_camera():
    cam = bpy.data.cameras.new('camera')
    cam.sensor_fit, cam.sensor_width = 'HORIZONTAL', 36
    cam.lens = 36 * DISTANCE * UNIT / W
    # Lens shift moves the frame without tilting: the floor of the lane sits
    # EYE * UNIT px below the image centre, and FLOOR wants it lower still.
    cam.shift_y = (FLOOR - H / 2 - EYE * UNIT) / W
    o = bpy.data.objects.new('camera', cam)
    sc.collection.objects.link(o)
    o.location = (0, -DISTANCE, EYE)
    o.rotation_euler = (math.radians(90), 0, 0)
    sc.camera = o
    return o


def to_world_px(camera, p):
    v = world_to_camera_view(sc, camera, Vector(p))
    return [round(v.x * W, 2), round((1 - v.y) * H, 2)]


def quad(camera, o):
    """The camera-facing side of a screen panel, in world px."""
    bb = [o.matrix_world @ Vector(c) for c in o.bound_box]
    x0, x1 = min(v.x for v in bb), max(v.x for v in bb)
    z0, z1 = min(v.z for v in bb), max(v.z for v in bb)
    y = min(v.y for v in bb)
    return [to_world_px(camera, p) for p in ((x0, y, z1), (x1, y, z1), (x1, y, z0), (x0, y, z0))]


def render(path, rgba):
    s = sc.render.image_settings
    s.file_format, s.color_mode, s.quality = 'WEBP', 'RGBA' if rgba else 'RGB', 90
    sc.render.film_transparent = rgba
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)


def main():
    spec = importlib.util.spec_from_file_location('stage', os.path.join(HERE, 'stages', f'{STAGE_ID}.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    kit = Kit()
    camera = fight_camera()
    module.build(kit)

    floor_y = to_world_px(camera, (0, 0, 0))[1]
    lane_px = to_world_px(camera, (1, 0, 0))[0] - to_world_px(camera, (0, 0, 0))[0]
    if abs(floor_y - FLOOR) > 0.5 or abs(lane_px - UNIT) > 0.5:
        raise SystemExit(f'camera drifted: floor at {floor_y}, {lane_px} px per unit')

    os.makedirs(OUT, exist_ok=True)
    render(os.path.join(OUT, 'back.webp'), rgba=False)

    # Glow: only emissive surfaces, everything else cut out but still hiding
    # what it stands in front of, on transparent.
    for o in sc.objects:
        if o.type in ('MESH', 'CURVE', 'FONT'):
            names = {m.name for m in o.data.materials if m}
            o.is_holdout = not (names & kit.glowing)
    kit.sky('#000000', 0.0)
    render(os.path.join(OUT, 'glow.webp'), rgba=True)

    data = {
        'size': [W * SCALE, H * SCALE],
        'floorY': floor_y,
        'screens': {id: quad(camera, o) for id, o in sorted(kit.screens.items())},
    }
    with open(os.path.join(OUT, 'stage.json'), 'w') as f:
        json.dump(data, f, indent=2)
        f.write('\n')
    print(f'[stage] {STAGE_ID}: floor {floor_y}px, {len(kit.screens)} screens -> {OUT}')


main()
