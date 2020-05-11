# Note: be careful not to introduce extra local variables since this script is run inside an `exec`.
from os import path as __osp
import sys as __sys

if (__osp.realpath(__sys.prefix) !=
        __osp.realpath(__osp.join(__osp.dirname(__osp.realpath(__file__)), vars().get('venv_dir', 'venv')))):
    # Not in correct virtualenv; make sure venv is setup and then os.execv into venv python.
    import os
    import shutil
    import subprocess

    def install_requirements(script_dir, venv_dir, requirements):
        if requirements is None:
            requirements = ['-r', __osp.join(script_dir, 'requirements.txt')]
        subprocess.check_output([__osp.join(venv_dir, 'bin', 'pip'), 'install'] + requirements)

    def check_python(python_exe):
        if not __osp.exists(python_exe):
            __sys.stderr.write('Python executable not found in virtualenv: {}'.format(python_exe))
            exit(1)

    script_dir = __osp.dirname(__osp.realpath(__file__))
    venv_dir = __osp.join(script_dir, vars().get('venv_dir', 'venv'))
    python_exe = __osp.join(venv_dir, 'bin', 'python')

    created_venv_dir = False

    if not __osp.exists(venv_dir):
        subprocess.check_output(['virtualenv', venv_dir, '--no-site-packages'])
        created_venv_dir = True
    if not __osp.exists(venv_dir):
        raise AssertionError('Expected virtualenv directory to exist: {}'.format(venv_dir))

    try:
        install_requirements(script_dir, venv_dir, vars().get('requirements'))
        check_python(python_exe)
        args = [python_exe, __file__] + __sys.argv[1:]
        os.execv(python_exe, args)
    finally:
        # Note: if the execv happened correctly we shouldn't end up here.
        if created_venv_dir:
            shutil.rmtree(venv_dir)
