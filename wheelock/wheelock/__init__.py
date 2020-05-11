#!/usr/bin/env python
from __future__ import absolute_import, print_function, unicode_literals
import argparse
import contextlib
import hashlib
import os
import re
import shutil
import subprocess
import sys
import tempfile
import textwrap


DEFAULT_PYTHON_VERSION = '3.6.4'
DOCKER_IMAGE_TAG_FORMAT = 'wheelock-py{python_version}'


parser = argparse.ArgumentParser(
    description='Build python package inside a Docker container')
parser.add_argument('src_dir')
parser.add_argument('out_dir')
parser.add_argument(
    '--python-version', default=DEFAULT_PYTHON_VERSION,
    help='Python version (e.g. {})'.format(DEFAULT_PYTHON_VERSION))


def get_dockerfile(python_version):
    return textwrap.dedent('''\
        FROM python:{python_version}
        RUN pip install -U pip
        RUN pip install -U virtualenv
        RUN virtualenv /build_venv
        RUN virtualenv /install_venv
        RUN . /build_venv/bin/activate && pip install wheel

        ENV WHEELHOUSE=/wheelhouse
        ENV PIP_WHEEL_DIR=/wheelhouse
        ENV PIP_FIND_LINKS=/wheelhouse

        VOLUME /out
        VOLUME /src

        ENTRYPOINT \
            . /build_venv/bin/activate && \
            cd /src && \
            pip wheel . && \
            cp /wheelhouse/* /out && \
            . /install_venv/bin/activate && \
            pip install --no-index /wheelhouse/*.whl && \
            pip freeze | grep -v '^-f /wheelhouse$' > /out/requirements.txt
    ''').format(
        python_version=python_version,
    )


@contextlib.contextmanager
def tempdir(*args, **kwargs):
    d = tempfile.mkdtemp(*args, **kwargs)
    try:
        yield d
    finally:
        shutil.rmtree(d)


def get_docker_image_tag(python_version):
    return DOCKER_IMAGE_TAG_FORMAT.format(python_version=python_version)


def build_docker_image(python_version):
    tag = get_docker_image_tag(python_version)
    dockerfile = get_dockerfile(python_version)
    with tempdir() as context_dir:
        dockerfile_path = os.path.join(context_dir, 'Dockerfile')
        with open(dockerfile_path, 'w') as f:
            f.write(dockerfile)
        cmd = [
            'docker',
            'build',
            '-t', tag,
            context_dir,
        ]
        subprocess.check_output(cmd)
        return tag


def _get_wheel_prefix(requirement):
    name, version = requirement.split('==')
    base = re.sub('[^\w\d.]+', '_', name, re.UNICODE)
    return '{}-{}-'.format(base, version)


def _get_hash(filename):
    with open(filename, 'rb') as f:
        return hashlib.sha256(f.read()).hexdigest()


def _ammend_requirement(out_dir, wheels, requirement):
    prefix = _get_wheel_prefix(requirement)
    matched_wheels = [x for x in wheels if x.startswith(prefix)]
    assert len(matched_wheels) == 1
    filename = os.path.join(out_dir, matched_wheels[0])
    sha = _get_hash(filename)
    return '{} --hash=sha256:{}'.format(requirement, sha)


def _pin_hashes(out_dir):
    wheels = os.listdir(out_dir)
    wheels = [x for x in wheels if x.endswith('.whl')]
    requirements_file = os.path.join(out_dir, 'requirements.txt')
    with open(requirements_file) as f:
        requirements = f.read().strip().split('\n')
    ammend_requirement = lambda requirement: _ammend_requirement(out_dir, wheels, requirement)
    requirements = map(ammend_requirement, requirements)
    with open(requirements_file, 'w') as f:
        f.write('\n'.join(requirements))


def run(src_dir, out_dir, python_version=DEFAULT_PYTHON_VERSION):
    src_dir = os.path.abspath(src_dir)
    out_dir = os.path.abspath(out_dir)
    tag = build_docker_image(python_version)
    cmd = [
        'docker',
        'run',
        '-v', '{}:/src:ro'.format(src_dir),
        '-v', '{}:/out'.format(out_dir),
        tag,
    ]
    subprocess.check_call(cmd)
    _pin_hashes(out_dir)


def main():
    args = parser.parse_args()
    try:
        run(args.src_dir, args.out_dir, args.python_version)
    except subprocess.CalledProcessError as e:
        print(e.output.decode(), file=sys.stderr)
        sys.exit(e.returncode)
