from mathutils import Vector
import bmesh
import bpy
import json
import math
import mathutils
import os
import uuid


#DPG_DIR = os.path.dirname(os.path.abspath(__file__))
DPG_DIR = '.'  # FIXME
CALIBRATION_DIR = os.path.join(DPG_DIR, 'calibration')


bl_info = {'name': 'DPG Tools', 'category': 'Object'}


with open(os.path.join(CALIBRATION_DIR, 'depthmap_distance_params.json')) as f:
    depthmap_distance_params = json.load(f)


_bpy_classes = []
def bpy_class(cls):
    _bpy_classes.append(cls)
    return cls


def distance_to_depthvalue(x):
    params = depthmap_distance_params
    a = params['x0']
    b = params['x1']
    if a - x <= 0 or b == 0:
        return None
    return math.sqrt(a - x) / params[1]


def depthvalue_to_distance(y):
    params = depthmap_distance_params
    a = params['x0']
    b = params['x1']
    return a - (y * b) ** 2


def create_line(p1, p2):
    """Hacky method for creating a line: start with a plane, delete two vertices, and move the
    remaining vertices to the desired coordinates.
    """
    bpy.ops.mesh.primitive_plane_add(view_align=False, location=p1)
    plane = bpy.context.object
    bm = bmesh.new()
    bm.from_mesh(plane.data)
    bm.verts.ensure_lookup_table()
    bm.verts[0].co = (0, 0, 0)
    bm.verts[1].co = Vector(p2) - Vector(p1)
    bm.verts.remove(bm.verts[3])
    bm.verts.ensure_lookup_table()
    bm.verts.remove(bm.verts[2])
    bm.to_mesh(plane.data)


def make_grid(vertices, y_size):
    """Source: https://blender.stackexchange.com/questions/76535/create-model-from-xyz-data-points/76629
    """
    polygons = [(i, i - 1, i - 1 + y_size, i + y_size) for i in range(1, len(vertices) - y_size) if i % y_size != 0]

    name = 'grid'
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    obj.hide_render = True

    obj.data.from_pydata(vertices, [], polygons)
    bpy.context.scene.objects.link(obj)
    bpy.context.scene.objects.active = obj
    bpy.ops.object.modifier_add(type='WIREFRAME')


def create_depthmap_plane(image, location, rotation_euler):
    texture = bpy.data.textures.new(name='test', type='IMAGE')
    texture.image = image
    mat = bpy.data.materials.new(name='test')
    mat.preview_render_type = 'FLAT'
    mat.use_shadeless = True
    mat.texture_slots.add().texture = texture
    bpy.ops.mesh.primitive_plane_add(view_align=False, location=location)
    plane = bpy.context.object
    plane.hide_render = True
    plane.dimensions = Vector((1.6, 0.9, 0.)) * 1.14
    plane.data.materials.append(mat)
    plane.rotation_euler = rotation_euler

    bpy.context.scene.objects.active = plane
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.uv.unwrap(method='ANGLE_BASED', margin=0.001)
    bpy.ops.object.mode_set(mode='OBJECT')


def _setup_node_tree():
    # Set up rendering of depth map:
    bpy.context.scene.use_nodes = True
    tree = bpy.context.scene.node_tree
    links = tree.links
    # clear default nodes
    for n in tree.nodes:
        tree.nodes.remove(n)
    # create input render layer node
    rl = tree.nodes.new('CompositorNodeRLayers')
    map = tree.nodes.new(type='CompositorNodeMapValue')
    # Size is chosen kind of arbitrarily, try out until you're satisfied with resulting depth map.
    map.size = [0.08]
    map.use_min = True
    map.min = [0]
    map.use_max = True
    map.max = [255]
    links.new(rl.outputs[2], map.inputs[0])
    invert = tree.nodes.new(type='CompositorNodeInvert')
    links.new(map.outputs[0], invert.inputs[1])
    # create a file output node and set the path
    depth_output = tree.nodes.new(type='CompositorNodeOutputFile')
    links.new(invert.outputs[0], depth_output.inputs[0])
    return depth_output


def get_image_filename(output_dir):
    base_name = '{:04d}.png'.format(bpy.context.scene.frame_current)
    return os.path.join(output_dir, 'image', base_name)


def get_depth_filename(output_dir):
    base_name = '{:04d}.png'.format(bpy.context.scene.frame_current)
    return os.path.join(output_dir, 'depth', base_name)


def render_depthmap(camera, output_dir):
    image_filename = get_image_filename(output_dir)
    depth_dir = os.path.dirname(get_depth_filename(output_dir))
    depth_output = _setup_node_tree()
    depth_output.base_path = depth_dir
    depth_output.file_slots[0].path = ''
    bpy.context.scene.render.filepath = image_filename
    bpy.context.scene.camera = camera
    bpy.ops.render.render(write_still=True)


def camera_to_depthmap_plane(camera):
    output_dir = os.path.join('render', uuid.uuid4().hex)
    depth_filename = get_depth_filename(output_dir)

    render_depthmap(camera, output_dir)

    vec = mathutils.Vector((0.0, 0.0, 1.0))
    vec.rotate(camera.rotation_euler)
    location = camera.location + vec * -2.
    rotation_euler = camera.rotation_euler
    image = bpy.data.images.load(depth_filename)
    create_depthmap_plane(image, location, rotation_euler)

    #plane = create_subdivided_plane(2, (5, 0, 0))

    vertices = []
    XRES = 50
    YRES = 50
    xs = range(0, image.size[0], int(max(image.size[0] / XRES, 1)))
    ys = range(0, image.size[1], int(max(image.size[1] / YRES, 1)))
    for x in xs:
        for y in ys:
            u = (1.6 * x / float(image.size[0]) - 0.8) * 0.6
            v = (0.9 * y / float(image.size[1]) - 0.45) * 0.6
            w = -1.03
            vec = Vector((u, v, w))
            value = image.pixels[(y * image.size[0] + x) * 4]
            dist = depthvalue_to_distance(value)
            p2 = camera.matrix_world * (vec * dist)
            vertices.append(p2)
            if x in [xs[0], xs[-1]] and y in [ys[0], ys[-1]]:
                create_line(camera.location, p2)
    make_grid(vertices, len(ys))


def create_subdivided_plane(subdivisions, location):
    bpy.ops.mesh.primitive_plane_add(view_align=False, location=location)

    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.subdivide(number_cuts=subdivisions)
    bpy.ops.object.mode_set(mode='OBJECT')


@bpy_class
class DpgToolsPanel(bpy.types.Panel):
    bl_label = 'DPG Tools'
    bl_idname = 'OBJECT_PT_dpg_tools'
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'TOOLS'

    def draw(self, context):
        layout = self.layout
        #layout.row().operator(AddLineOperator.bl_idname, text='Create line')
        layout.row().operator(DoodadOperator.bl_idname, text='Doodad')
        layout.row().operator(ShowCameraProjectionOperator.bl_idname, text='Show camera projection')


@bpy_class
class AddLineOperator(bpy.types.Operator):
    """Tooltip"""
    bl_idname = 'dpg.primitive_line_add'
    bl_label = 'Create line'

    @classmethod
    def poll(cls, context):
        return True

    def execute(self, context):
        create_line((0,0,0), (10,0,0))
        return {'FINISHED'}


@bpy_class
class DoodadOperator(bpy.types.Operator):
    """Tooltip"""
    bl_idname = 'dpg.doodad'
    bl_label = 'Doodad'

    @classmethod
    def poll(cls, context):
        #return context.active_object is not None and context.active_object.type == 'CAMERA'
        return True

    def execute(self, context):
        if context.active_object is not None and context.active_object.type == 'CAMERA':
            bpy.context.scene.camera = context.active_object 
        camera_to_depthmap_plane(bpy.context.scene.camera)
        return {'FINISHED'}


@bpy_class
class ShowCameraProjectionOperator(bpy.types.Operator):
    """Tooltip"""
    bl_idname = 'dpg.show_camera_projection'
    bl_label = 'Show camera projection'

    @classmethod
    def poll(cls, context):
        return context.active_object is not None and context.active_object.type == 'CAMERA'

    def execute(self, context):
        camera = context.active_object

        render_depth_map(camera)

        #projection_matrix = camera.calc_matrix_camera(
        #    render.resolution_x,
        #    render.resolution_y,
        #    render.pixel_aspect_x,
        #    render.pixel_aspect_y,
        #)
        #deprojection_matrix = projection_matrix.invert()
        #deprojected = deprojection_matrix * projected

        #p2 = Vector(((p1.x/p1.w, p1.y/p1.w)))
        #p2 = camera.matrix_world * deprojected * -10
        z = -2.
        depth = 2.
        p1 = camera.location
        p2 = camera.matrix_world * (Vector((0, 0, z)) * depth)
        create_line(p1, p2)
        p2 = camera.matrix_world * (Vector((1, -1, z)) * depth)
        create_line(p1, p2)
        p2 = camera.matrix_world * (Vector((1, 1, z)) * depth)
        create_line(p1, p2)
        p2 = camera.matrix_world * (Vector((-1, 1, z)) * depth)
        create_line(p1, p2)
        p2 = camera.matrix_world * (Vector((-1, -1, z)) * depth)
        create_line(p1, p2)
        return {'FINISHED'}


def register():
    for cls in _bpy_classes:
        bpy.utils.register_class(cls)


def unregister():
    for cls in reversed(_bpy_classes):
        bpy.utils.unregister_class(cls)


if __name__ == '__main__':
    register()
