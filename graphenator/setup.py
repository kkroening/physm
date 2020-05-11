from setuptools import setup
import os


here = os.path.abspath(os.path.dirname(__file__))
with open(os.path.join(here, 'VERSION')) as f:
    version = f.read()

setup(
    name='graphenator',
    author='Karl Kroening',
    version=version,
    packages=['graphenator'],
    install_requires=[
        'graphene',
    ],
    extras_require={
        'dev': [
            'mock',
            'pytest',
            'pytest-only',
            'Sphinx',
            'sphinx-rtd-theme',
            'sphinxcontrib-napoleon',
        ],
    },
)
