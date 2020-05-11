from contextlib import contextmanager
from datetime import datetime
from matplotlib import animation
from matplotlib import pyplot as plt
import functools
import ipywidgets
import numpy as np


def memoize(func):
    info = {
        'args': None,
        'kwargs': None,
    }

    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        if args != info['args'] or kwargs != info['kwargs']:
            info.update({
                'args': args,
                'kwargs': kwargs,
                'value': func(*args, **kwargs),
            })

        return info['value']
    return wrapper


def fig2np(fig):
    fig.canvas.draw()
    width, height = fig.canvas.get_width_height()
    buf = fig.canvas.buffer_rgba()
    return (
        np
        .frombuffer(buf, dtype=np.uint8)
        .reshape(height, width, 4)
    )


def render_animation_iter(draw_func, max_time_index, sample_interval, fig=None):
    ax = None
    if fig is None:
        fig, ax = plt.subplots()
    plt.tight_layout()
    for time_index in range(max_time_index, sample_interval):
        if ax is not None:
            ax.clear()
        draw_func(ax, time_index)
        yield fig2np(fig)
    plt.close(fig)


@contextmanager
def renderer_scope(frames=[]):
    @contextmanager
    def frame_scope():
        ax.clear()
        yield ax
        frames.append(fig2np(fig))

    fig, ax = plt.subplots()
    plt.tight_layout()
    yield frame_scope
    plt.close(fig)


def render_animation(*args, **kwargs):
    frames = []
    for frame in render_animation_iter(*args, **kwargs):
        frames.append(frame)
    return np.stack(frames)


def do_render_animation(draw_func, max_time_index, sample_interval, fps=25, fig=None):
    ax = None
    if fig is None:
        fig, ax = plt.subplots()
    plt.tight_layout()

    def animate(i):
        if ax is not None:
            ax.clear()
        time_index = i * sample_interval
        draw_func(ax, time_index)
        return (fig,)

    anim = animation.FuncAnimation(
        fig,
        animate,
        frames=int(max_time_index / sample_interval),
        interval=int(1000/fps),
        blit=True,
    )
    plt.close(anim._fig)
    return anim


class RendererWidget(ipywidgets.VBox):
    def __init__(self):
        self.render_func = lambda: None
        self.__out = ipywidgets.Output()
        button = ipywidgets.Button(description='Render')
        button.on_click(self.__on_click)
        super(RendererWidget, self).__init__([button, self.__out])

    def __on_click(self, _):
        self.__out.clear_output()
        with self.__out:
            self.render_func()


@contextmanager
def timed():
    t1 = datetime.now()
    timing = []
    try:
        yield timing
    finally:
        t2 = datetime.now()
        duration = (t2 - t1).total_seconds()
        timing.append(duration)
