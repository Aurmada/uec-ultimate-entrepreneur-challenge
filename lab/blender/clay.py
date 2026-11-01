"""Clay renders of a model: front, three quarters, side and back, orthographic,
in grey clay so the forms are judged and not the colours. For sculpting
(lab/blender/sculpt_jeff.py) and for setting a new body beside an old one.

    import clay
    clay.views([obj], 'out/dir', 'jeff')                   # quick, Workbench
    clay.views([obj], 'out/dir', 'jeff', engine='CYCLES')  # lit, for review

Models face +x with z up (the model contract). The side view looks at the
character's right, the side the game's camera sees.
"""

import math
import os

import bpy

VIEWS = {
    'front': 0.0,
    'three-quarter': -40.0,
    'side': -90.0,
    'back': 180.0,
}


def views(objs, out, name, engine='WORKBENCH', size=(720, 1000), span=2.12, centre=(0.0, 0.0, 0.99), samples=48):
    scene = bpy.context.scene
    os.makedirs(out, exist_ok=True)
    cam = bpy.data.cameras.new('clay-cam')
    cam.type = 'ORTHO'
    cam.ortho_scale = span
    co = bpy.data.objects.new('clay-cam', cam)
    scene.collection.objects.link(co)
    scene.camera = co
    r = scene.render
    r.resolution_x, r.resolution_y = size
    r.resolution_percentage = 100
    r.image_settings.file_format = 'PNG'
    r.film_transparent = False
    world = scene.world or bpy.data.worlds.new('clay-world')
    scene.world = world
    world.color = (0.035, 0.04, 0.06)
    if engine == 'WORKBENCH':
        r.engine = 'BLENDER_WORKBENCH'
        sh = scene.display.shading
        sh.light = 'STUDIO'
        sh.color_type = 'SINGLE'
        sh.single_color = (0.62, 0.58, 0.54)
        sh.show_cavity = True
        sh.cavity_type = 'BOTH'
        sh.cavity_ridge_factor = 1.0
        sh.cavity_valley_factor = 1.0
        sh.show_shadows = True
        scene.display.render_aa = '8'
    else:
        r.engine = 'CYCLES'
        scene.cycles.device = 'CPU'
        scene.cycles.samples = samples
        scene.cycles.use_denoising = True
        world.use_nodes = True
        world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.035, 0.04, 0.06, 1)
        world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.6
        clay = bpy.data.materials.new('clay')
        clay.use_nodes = True
        b = clay.node_tree.nodes['Principled BSDF']
        b.inputs['Base Color'].default_value = (0.42, 0.37, 0.33, 1)
        b.inputs['Roughness'].default_value = 0.55
        for o in objs:
            o.data.materials.clear()
            o.data.materials.append(clay)
        _lights(scene, centre)
    files = []
    for view, az in VIEWS.items():
        a = math.radians(az)
        # the camera circles the model at its own height, looking at the centre
        co.location = (centre[0] + 6 * math.cos(a), centre[1] + 6 * math.sin(a), centre[2])
        co.rotation_euler = (math.pi / 2, 0, a + math.pi / 2)
        path = os.path.join(out, f'{name}-{view}.png')
        r.filepath = path
        bpy.ops.render.render(write_still=True)
        files.append(path)
    return files


def _lights(scene, centre):
    """A key high on the front left, a fill on the right, and a rim behind:
    the usual sculpture lighting, so every form throws a shadow."""
    from mathutils import Vector
    for name, d, energy, size in (('key', (0.6, 0.55, 0.75), 900, 1.5),
                                  ('fill', (0.5, -0.8, 0.2), 250, 2.5),
                                  ('rim', (-0.8, 0.2, 0.6), 700, 1.0),
                                  ('rim2', (-0.6, -0.6, 0.4), 400, 1.0)):
        data = bpy.data.lights.new(name, 'AREA')
        data.energy = energy
        data.size = size
        o = bpy.data.objects.new(name, data)
        scene.collection.objects.link(o)
        v = Vector(d).normalized()
        o.location = Vector(centre) + v * 5
        o.rotation_euler = (-v).to_track_quat('-Z', 'Y').to_euler()
        # lights fixed to the model, not the camera: turning the camera shows
        # the lighting from the other side, as a turntable would
