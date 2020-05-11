from setuptools import setup
from textwrap import dedent


version = '0.0.1'
download_url = 'https://github.com/kkroening/actorgraph/archive/v{}.zip'.format(version)

long_description = dedent("""\
    ActorGraph: graphs of concurrent actors

    Github: https://github.com/kkroening/actorgraph
    API Reference: https://kkroening.github.io/actorgraph/
""")


setup(
    name='actorgraph',
    packages=['actorgraph'],
    setup_requires=['pytest-runner'],
    tests_require=['pytest'],
    version=version,
    description='ActorGraph',
    author='Karl Kroening',
    author_email='karlk@kralnet.us',
    url='https://github.com/kkroening/actorgraph',
    download_url=download_url,
    classifiers=[],
    keywords=[],
    long_description=long_description,
)
