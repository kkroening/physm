from mathutils import Euler, Vector
import bpy
import dpg
import json
import math
import numpy as np
import os
import pandas as pd
import pytest
import scipy.optimize
import skimage.io


@pytest.fixture(autouse=True)
def empty_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


@pytest.fixture(autouse=True)
def save_scene(tmpdir):
    try:
        yield
    finally:
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(str(tmpdir), 'scene.blend'))


@pytest.fixture()
def camera():
    bpy.ops.object.camera_add(
        enter_editmode=False,
        location=(0, 0, 0),
        rotation=(0, 0, 0))
    return bpy.context.object


@pytest.fixture()
def output_dir(tmpdir):
    return str(tmpdir)


def test_empty_scene():
    assert list(bpy.data.objects) == []


def test_camera(camera):
    assert camera.location == Vector((0., 0., 0.))
    assert camera.rotation_euler == Euler((0., 0., 0.), 'XYZ')
    return camera


def test_create_plane():
    bpy.ops.mesh.primitive_plane_add(view_align=False)
    plane = bpy.context.object
    assert plane.type == 'MESH'
    assert plane.location == Vector((0., 0., 0.))
    assert plane.rotation_euler == Euler((0.0, 0.0, 0.0), 'XYZ')
    assert plane.dimensions == Vector((2.0, 2.0, 0.0))
    assert list(bpy.data.objects) == [plane]


def test_render_depthmap(camera, output_dir):
    image_filename = dpg.get_image_filename(output_dir)
    depth_filename = dpg.get_depth_filename(output_dir)
    dpg.render_depthmap(camera, output_dir)

    assert os.path.exists(image_filename)
    assert os.path.exists(depth_filename)

    render = bpy.context.scene.render
    expected_width = int(render.resolution_x * render.resolution_percentage / 100.)
    expected_height = int(render.resolution_y * render.resolution_percentage / 100.)
    expected_size = [expected_width, expected_height]
    image = bpy.data.images.load(image_filename)
    depth = bpy.data.images.load(depth_filename)
    assert list(image.size) == expected_size
    assert list(depth.size) == expected_size


def convert_image_to_np(image):
    return (np
        .array(image.pixels)
        .reshape((image.size[1], image.size[0], 4))
    )


def render(camera, output_dir):
    dpg.render_depthmap(camera, output_dir)
    depthmap_filename = dpg.get_depth_filename(output_dir)
    depthmap_bpy = bpy.data.images.load(depthmap_filename)
    depthmap = convert_image_to_np(depthmap_bpy)

    # Depthmap RGB values should all be the same and alpha should be 1.
    assert np.all(depthmap[:,:,0] == depthmap[:,:,1])
    assert np.all(depthmap[:,:,0] == depthmap[:,:,2])
    assert np.all(depthmap[:,:,3] == 1)

    depthmap = depthmap[:,:,0]
    return depthmap


def test_depthmap_calibration(camera, output_dir):
    """Figure out how depthmap values correspond to distances.

    i.e. Is there a linear correlation between depthmap value
    and distance, or some nonlinear
    function (e.g. logarithmic)?
    """

    # Create plane parallel to camera view.
    bpy.ops.mesh.primitive_plane_add(view_align=False)
    plane = bpy.context.object
    plane.scale = (20, 20, 20)
    plane.rotation_euler = (math.pi / 2., 0, 0)

    # Render the plane at each distance and measure the depthmap.
    dists = np.arange(0., 15., 0.1)
    values = []
    for dist in dists:
        # Move plane.
        plane.location = (0, dist, 0)

        # Render depthmap.
        depthmap = render(camera, output_dir)

        ## Sanity check: all RGB values should be the same in each image, and
        ## alpha should always be 1.0.
        assert set(depthmap.pixels) == {depthmap.pixels[0], 1.}

        # Measure value.
        values.append(depthmap.pixels[0])

    df = pd.DataFrame([dists, values]).transpose()
    df.columns = ['distance', 'depthmap_value']
    df.to_csv(os.path.join(output_dir, 'depthmap_distance_train.csv'), index=False)

    def f_unoptimized(a, x):
        if a[0] - x <= 0 or a[1] == 0:
            return None
        return np.sqrt(a[0] - x) / a[1]

    def f_total_loss(a):
        guesses = df['distance'].map(lambda x: f_unoptimized(a, x))
        return (guesses - df['depthmap_value']).fillna(0.)

    guess_params = (12., 3.)
    optimal_params = scipy.optimize.least_squares(f_total_loss, guess_params).x

    loss = sum(f_total_loss(optimal_params) ** 2)
    calibration_info = {'x{}'.format(i): x for i, x in enumerate(optimal_params)}
    calibration_info['loss'] = loss
    with open(os.path.join(output_dir, 'depthmap_distance_params.json'), 'w') as f:
        json.dump(calibration_info, f)

    assert loss < 1.07


def find_rendered_plane_coords(image):
    """Find the coordinates of the upper right corner of a square in a
    rendered image.

    The image's coordinate space is considered to be u,v,w where u is
    horizontal, v is vertical, and w is the depth value.

    Coordinates are found by examining a horizontal strip of pixels
    through the center of the image and finding the highest coordinate
    value that has a non-zero depthap value.  The same is done for the
    vrtical axis.

    Some extra assertions are made as sanity checks to ensure that the
    square is actually centered on the middle of the image.
    """
    width = image.shape[1]
    height = image.shape[0]
    u_pixel_strip = image[int(height/2),:]
    v_pixel_strip = image[:,int(width/2)]
    u_coords = np.nonzero(u_pixel_strip)[0]
    v_coords = np.nonzero(v_pixel_strip)[0]

    if u_coords.size == 0:
        assert v_coords.size == 0
        assert np.all(image == 0)
        u = np.nan
        v = np.nan
        w = np.nan
    else:
        u_min = u_coords.min()
        u_max = u_coords.max()
        v_min = v_coords.min()
        v_max = v_coords.max()
        u_avg = (u_min + u_max) / 2
        v_avg = (v_min + v_max) / 2
        u_center = width / 2
        v_center = height / 2
        assert abs(u_avg - u_center) < 1.5
        assert abs(v_avg - v_center) < 1.5
        u = u_max
        v = v_max
        w = image[int(height/2),int(width/2)]
    return u, v, w


@pytest.mark.only
def test_calibration(camera, output_dir):
    # Create plane parallel to camera view.
    bpy.ops.mesh.primitive_plane_add(view_align=False)
    plane = bpy.context.object

    z_values = np.arange(0., -15., -0.1)
    items = []
    for z in z_values:
        plane.location = (0, 0, z)
        depthmap = render(camera, output_dir)
        skimage.io.imsave('foo.png', depthmap)
        u, v, w = find_rendered_plane_coords(depthmap)
        items.append(dict(x=1, y=1, z=z, u=u, v=v, w=w))

    df = pd.DataFrame(items, columns=['x', 'y', 'z', 'u', 'v', 'w'])
    df.to_csv(os.path.join(output_dir, 'calibration_train.csv'), index=False)

    assert 0
    def f_unoptimized(a, x):
        if a[0] - x <= 0 or a[1] == 0:
            return None
        return np.sqrt(a[0] - x) / a[1]

    def f_total_loss(a):
        guesses = df['distance'].map(lambda x: f_unoptimized(a, x))
        return (guesses - df['depthmap_value']).fillna(0.)

    guess_params = (12., 3.)
    optimal_params = scipy.optimize.least_squares(f_total_loss, guess_params).x

    loss = sum(f_total_loss(optimal_params) ** 2)
    calibration_info = {'x{}'.format(i): x for i, x in enumerate(optimal_params)}
    calibration_info['loss'] = loss
    with open(os.path.join(output_dir, 'depthmap_distance_params.json'), 'w') as f:
        json.dump(calibration_info, f)

    assert loss < 1.07
