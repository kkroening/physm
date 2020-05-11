from setuptools import setup


setup(
    name='wheelock',
    version='0.0.1',
    description='wheelock',
    author='Karl Kroening',
    author_email='karlk@kralnet.us',
    url='https://github.com/kkroening/wheelock',
    packages=['wheelock'],
    entry_points={
        'console_scripts': [
            'wheelock=wheelock:main',
        ]
    },
)
