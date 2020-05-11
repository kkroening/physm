from setuptools import setup

setup(
    name='fuzix',
    version='0.0.1',
    install_requires=[
        'ffmpeg-python',
        'ipympl',
        'ipywidgets',
        'jupyterlab',
        'matplotlib',
        'pandas',
        'tornado==5.1.1',  # See https://github.com/jupyterlab/jupyterlab/issues/6062
    ],
)
