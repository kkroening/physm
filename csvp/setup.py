#!/usr/bin/env python
from setuptools import setup


setup(
    name='csvp',
    version='0.0.1',
    description='process CSV file from command-line with pandas',
    author='Karl Kroening',
    author_email='karlk@kralnet.us',
    url='https://github.com/kkroening/csvp',
    packages=['csvp'],
    tests_require=[],
    install_requires=[
        'pandas',
    ],
    entry_points={
        'console_scripts': [
            'csvp=csvp.__main__:main',
        ],
    },
)
