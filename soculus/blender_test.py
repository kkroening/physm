import contextlib
import copy
import functools
import inspect
import os
import pytest
import soculus
import subprocess
import sys


bpy = None


CHILD_PYTHONPATH = ':'.join([
    os.path.abspath('.'),
    os.path.abspath(os.path.join('.venv3', 'lib', 'python3.5', 'site-packages')),
])


@contextlib.contextmanager
def blender_scope():
    @contextlib.contextmanager
    def child_scope(socket_file):
        env = copy.copy(os.environ)
        env['PYTHONPATH'] = CHILD_PYTHONPATH
        env['SOCULUS_RPC_SOCKET'] = socket_file
        cmd = ['blender', '--background', '--python', os.path.abspath(soculus.__file__)]
        child = subprocess.Popen(
            cmd, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        try:
            yield
        finally:
            child.kill()
            child.wait()
            out, err = child.communicate()
            sys.stdout.write(out.decode())
            sys.stderr.write(err.decode())
    with soculus.connection_scope(child_scope) as blender:
        yield blender


@pytest.fixture()
def blender():
    with blender_scope() as blender:
        yield blender


def blender_rpc(func):
    """Decorator for making function calls automatically go through RPC."""
    # TODO: generalize this and move it to soculus.
    assert not inspect.isgeneratorfunction(func), \
        "Can't do RPC with generators yet. (Please remove any `yield` statements)"

    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        blender = kwargs['blender']
        kwargs['blender'] = None
        def wrapper2():
            import bpy
            globals()['bpy'] = bpy
            return func(*args, **kwargs)
        return blender.call(wrapper2)
    return wrapper


@blender_rpc
def make_thing(blender):
    bpy.ops.mesh.primitive_plane_add(view_align=False)
    return bpy.context.object.name


@blender_rpc
@pytest.fixture()
def example_plane_name(blender):
    bpy.ops.mesh.primitive_plane_add(view_align=False)
    return bpy.context.object.name


@blender_rpc
def test_hello(blender, example_plane_name):
    #bpy.ops.mesh.primitive_plane_add(view_align=False)
    plane = bpy.data.objects[example_plane_name]
    assert plane.type == 'MESH'


def test_rpc_decorator(blender):
    make_thing(blender=blender)


if __name__ == '__main__':
    with blender_scope() as b:
        test_hello(blender=b, example_plane='barf')
