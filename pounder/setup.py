#!/usr/bin/env python
from setuptools import setup


setup(
    name='pounder',
    version='0.0.1',
    description='Gevent-based work scheduler',
    author='Karl Kroening',
    author_email='karlk@kralnet.us',
    url='https://github.com/kkroening/pounder',
    packages=['pounder'],
    tests_require=['pytest'],
    install_requires=[
        'gevent',
        'multiprocess',
        'six',
        'tqdm',
    ],
    dependency_links=[],
    entry_points={
        'console_scripts': [
            'pounder-http=pounder.http:main',
            'pounder-plot=pounder.plot:main',
        ],
    },
)
