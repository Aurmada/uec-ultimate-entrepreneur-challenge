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
#     assets/stages/<id>/stage.json  { size, floorY, horizon, screens: { id: quad },
#                                    screenP: { id: parallax }, layers: [...] }
#     assets/stages/<id>/far.webp, floor.webp, room<n>.webp and their -glow
#                                    the stage again in depth layers, for
#                                    parallax (see "depth layers" below)
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

    def gradient(self, bottom, top, z0, z1, strength, stops=()):
        """An emissive backdrop shading from `bottom` at world z0 to `top` at z1,
        through any (position, colour) `stops` between: a night sky, a sunset, a
        stage cyclorama. It gives off light but never glows."""
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
        ramp = nt.nodes.new('ShaderNodeValToRGB')
        els = ramp.color_ramp.elements
        els[0].position, els[0].color = 0.0, lin(bottom)
        els[1].position, els[1].color = 1.0, lin(top)
        for at, col in stops:
            els.new(at).color = lin(col)
        nt.links.new(coords.outputs['Object'], xyz.inputs[0])
        nt.links.new(xyz.outputs['Z'], span.inputs['Value'])
        nt.links.new(span.outputs['Result'], ramp.inputs['Fac'])
        nt.links.new(ramp.outputs['Color'], p.inputs['Emission Color'])
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

    def cone(self, center, radius, height, m, verts=6, rot=(0, 0, 0), scale=(1, 1, 1)):
        """A faceted cone standing on its base: low-poly mountains, pennants."""
        bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=radius, radius2=0, depth=height,
                                        location=(center[0], center[1], center[2] + height / 2))
        o = bpy.context.active_object
        o.rotation_euler, o.scale = rot, scale
        return self._finish(o, m)

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

    def screen(self, id, center, size, hexcol='#05070f', visible=True):
        """A dark panel facing the camera that the runtime paints live. An
        invisible one only marks the place: a banner the game draws whole,
        sag and all, has nothing behind it."""
        o = self.box(center, (size[0], 0.02, size[1]), self.mat(hexcol, 0.4))
        o.hide_render = not visible
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


# ---- depth layers, for parallax --------------------------------------------
#
# A single picture moves as one piece when the game's camera pans, so nothing
# in it reads as nearer or further. So the stage is also rendered in layers,
# each moved at its own rate by the runtime (src/engine/stage.js):
#
#   * far    everything whose nearest face is FAR_Y or deeper (a city, the
#            mountains) over the sky. Opaque and full frame: the bottom layer.
#   * floor  everything flat on the floor. The floor is a plane, and a plane
#            seen from a camera that slides sideways shears: each row moves at
#            the rate of its own depth, which is a straight line in the row,
#            so the runtime draws it as one skewed image. Rendered OVERSCAN px
#            past each side, because the rows nearer than the fight lane move
#            faster than the camera and would otherwise open a gap.
#   * room   everything else, grouped into bands of parallax no wider than
#            P_STEP, so two things in one band slide against each other by at
#            most P_STEP / 2 of a pan. Each band is cropped to what it covers.
#
# Each layer that holds an emitter also gets a glow, at the world's own size
# rather than twice it, since the runtime blurs it into a halo anyway.
#
# A layer is rendered with only its own objects visible to the camera; the
# rest still cast their light and shadows, so a layer is lit as it is in the
# whole picture. In a room band the floor is a holdout, which hides anything
# below floor level the way the floor does in the whole picture.
FAR_Y = 8.0
P_STEP = 0.03
OVERSCAN = 100
CROP_PAD = 4                # px of margin round a cropped band, for its soft edges


def parallax(depth):
    """How fast something at `depth` moves for a camera pan, against the fight
    lane at 1: further is slower, nearer is faster."""
    return DISTANCE / (DISTANCE + depth)


def renderables():
    return [o for o in sc.objects if o.type in ('MESH', 'CURVE', 'FONT') and not o.hide_render]


def world_bounds(o):
    bb = [o.matrix_world @ Vector(c) for c in o.bound_box]
    return (min(v.x for v in bb), min(v.y for v in bb), min(v.z for v in bb),
            max(v.x for v in bb), max(v.y for v in bb), max(v.z for v in bb)), bb


def plan_layers():
    """Every renderable object into the far distance, the floor, or a band of
    room depth. Returns the layers back to front."""
    far, floor, room = [], [], []
    for o in renderables():
        (x0, y0, z0, x1, y1, z1), _ = world_bounds(o)
        if z1 <= 0.06 and z0 >= -0.15 and z1 - z0 < 0.16:
            floor.append(o)
        elif y0 >= FAR_Y:
            far.append((parallax(y0), o))
        else:
            room.append((parallax(max(y0, 0.0)), o))
    far_p = sorted(p for p, _ in far)[len(far) // 2] if far else 0.0
    layers = [{'id': 'far', 'kind': 'far', 'p': round(far_p, 4), 'objects': [o for _, o in far]},
              {'id': 'floor', 'kind': 'floor', 'objects': floor}]
    bands = []
    for p, o in sorted(room, key=lambda r: r[0]):
        if not bands or p - bands[-1]['lo'] > P_STEP:
            bands.append({'lo': p, 'ps': [], 'objects': []})
        bands[-1]['ps'].append(p)
        bands[-1]['objects'].append(o)
    for i, b in enumerate(bands):
        layers.append({'id': f'room{i + 1}', 'kind': 'room',
                       'p': round((b['lo'] + max(b['ps'])) / 2, 4), 'objects': b['objects']})
    return layers, floor


def crop_box(camera, objects, res_x, res_y):
    """The px rectangle (x0, y0, x1, y1, top down) the objects cover in a
    res_x x res_y render, padded and clamped to it."""
    xs, ys = [], []
    for o in objects:
        for c in world_bounds(o)[1]:
            v = world_to_camera_view(sc, camera, c)
            if v.z <= 0:
                continue
            xs.append(v.x * res_x)
            ys.append((1 - v.y) * res_y)
    if not xs:
        return None
    x0 = max(0, int(math.floor(min(xs))) - CROP_PAD)
    y0 = max(0, int(math.floor(min(ys))) - CROP_PAD)
    x1 = min(res_x, int(math.ceil(max(xs))) + CROP_PAD)
    y1 = min(res_y, int(math.ceil(max(ys))) + CROP_PAD)
    return (x0, y0, x1, y1) if x1 > x0 and y1 > y0 else None


def set_border(box, res_x, res_y):
    r = sc.render
    if box is None:
        r.use_border = False
        return
    x0, y0, x1, y1 = box
    r.use_border, r.use_crop_to_border = True, True
    # Blender's border runs bottom up, in fractions of the frame.
    r.border_min_x, r.border_max_x = x0 / res_x, x1 / res_x
    r.border_min_y, r.border_max_y = 1 - y1 / res_y, 1 - y0 / res_y


def show_only(layer, everything, floor):
    """Camera sees the layer's own objects (and, for a room band, the floor
    as a holdout); everything else is hidden from it but still lights it."""
    mine = set(layer['objects'])
    hold = set(floor) if layer['kind'] == 'room' else set()
    for o in everything:
        o.visible_camera = o in mine or o in hold
        o.is_holdout = o in hold


class FloorCamera:
    """The fight camera widened by OVERSCAN each side, at the same scale: the
    sensor widens with the image and the lens stays put."""

    def __init__(self, camera):
        self.cam = camera.data
        self.wide = W + 2 * OVERSCAN

    def __enter__(self):
        self.sensor, self.shift = self.cam.sensor_width, self.cam.shift_y
        self.cam.sensor_width = self.sensor * self.wide / W
        self.cam.shift_y = self.shift * W / self.wide
        sc.render.resolution_x = self.wide * SCALE
        return self

    def __exit__(self, *exc):
        self.cam.sensor_width, self.cam.shift_y = self.sensor, self.shift
        sc.render.resolution_x = W * SCALE


def render_layer(camera, layer, path, rgba):
    """Renders one layer (its visibility already set) to `path`, cropped to
    its box, and returns its rect in world px: [x, y, w, h]."""
    res_x, res_y = W * SCALE, H * SCALE
    if layer['kind'] == 'far':
        set_border(None, res_x, res_y)
        render(path, rgba)
        return [0, 0, W, H]
    if layer['kind'] == 'floor':
        with FloorCamera(camera) as fc:
            wide_x = fc.wide * SCALE
            box = layer.get('box') or crop_box(camera, layer['objects'], wide_x, res_y)
            box = (0, box[1], wide_x, box[3])
            layer['box'] = box
            set_border(box, wide_x, res_y)
            render(path, rgba)
        return [-OVERSCAN, box[1] / SCALE, fc.wide, (box[3] - box[1]) / SCALE]
    box = layer.get('box') or crop_box(camera, layer['objects'], res_x, res_y)
    layer['box'] = box
    set_border(box, res_x, res_y)
    render(path, rgba)
    return [box[0] / SCALE, box[1] / SCALE, (box[2] - box[0]) / SCALE, (box[3] - box[1]) / SCALE]


def render_layers(kit, camera, out):
    layers, floor = plan_layers()
    everything = renderables()
    res_x, res_y = W * SCALE, H * SCALE
    written = []
    for layer in layers:
        if layer['kind'] != 'far' and not layer['objects']:
            continue
        if layer['kind'] == 'room' and crop_box(camera, layer['objects'], res_x, res_y) is None:
            continue                       # entirely out of shot
        show_only(layer, everything, floor)
        layer['file'] = f"{layer['id']}.webp"
        layer['rect'] = render_layer(camera, layer, os.path.join(out, layer['file']), rgba=layer['kind'] != 'far')
        written.append(layer)

    # The glow of each layer: only its own emitters, on transparent, cut by
    # whatever stands in front of them inside the layer, as the whole-picture
    # glow is cut by the whole picture.
    kit.sky('#000000', 0.0)
    for layer in written:
        mine = set(layer['objects'])
        glowing = {o for o in mine if {m.name for m in o.data.materials if m} & kit.glowing}
        layer['glow'] = None
        if not glowing:
            continue
        show_only(layer, everything, floor)
        for o in mine - glowing:
            o.is_holdout = True
        layer['glow'] = f"{layer['id']}-glow.webp"
        # At the world's own size, not twice it: the runtime blurs a glow into
        # a soft halo before it is ever drawn, so the extra pixels are bytes
        # nobody sees (the boardroom's lit city was 300 KB at twice).
        sc.render.resolution_percentage = 100 // SCALE
        render_layer(camera, layer, os.path.join(out, layer['glow']), rgba=True)
        sc.render.resolution_percentage = 100
    set_border(None, res_x, res_y)
    for o in everything:
        o.visible_camera, o.is_holdout = True, False
    keep = ('id', 'kind', 'p', 'rect', 'file', 'glow')
    return [{k: L[k] for k in keep if k in L} for L in written]


def main():
    sys.dont_write_bytecode = True          # no __pycache__ beside the stage scripts
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
    for name in os.listdir(OUT):           # layers from an earlier build may no longer exist
        if name.endswith('.webp') and name not in ('back.webp', 'glow.webp'):
            os.remove(os.path.join(OUT, name))
    render(os.path.join(OUT, 'back.webp'), rgba=False)
    layers = render_layers(kit, camera, OUT)

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
        # The row where the floor's parallax reaches 0: the horizon, EYE above
        # the floor line. The runtime skews the floor layer about it.
        'horizon': round(to_world_px(camera, (0, 1e6, 0))[1], 2),
        'screens': {id: quad(camera, o) for id, o in sorted(kit.screens.items())},
        # How fast each screen moves for a pan, as its layer would.
        'screenP': {id: round(parallax(max(world_bounds(o)[0][1], 0.0)), 4) for id, o in sorted(kit.screens.items())},
        'layers': layers,
    }
    with open(os.path.join(OUT, 'stage.json'), 'w') as f:
        json.dump(data, f, indent=2)
        f.write('\n')
    print(f'[stage] {STAGE_ID}: floor {floor_y}px, {len(kit.screens)} screens, '
          f'{len(layers)} layers ({", ".join(L["id"] + (" p" + str(L["p"]) if "p" in L else "") for L in layers)}) -> {OUT}')


main()
