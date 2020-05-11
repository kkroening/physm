from setuptools import setup


setup(
    name='lolrscrape',
    version='0.0.1',
    description='lolrscrape',
    author='Karl Kroening',
    author_email='karlk@kralnet.us',
    url='https://github.com/kkroening/lolrscrape',
    packages=['lolrscrape'],
    tests_require=['pytest'],
    install_requires=[
        'bs4',
        'numpy==1.14.3',
        'pandas',
        'python-memo',
        'requests',
        'tenacity',
    ],
    entry_points={
        'console_scripts': [
            'lolrscrape=lolrscrape:main',
        ]
    },
    extras_require={
        'dev': [
            'wheelock',
        ],
    },
)
