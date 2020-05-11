from matplotlib import pyplot as plt
from matplotlib.lines import Line2D
import matplotlib.patches as patches
import numpy as np


DEFAULT_ZIGZAG_PADDING = 0.2
DEFAULT_ZIGZAG_HEIGHT = 0.6
DEFAULT_ZIGZAG_COUNT = 5


def draw_circle(ax, x, y, radius, scale=1., **kwargs):
    ax.add_artist(
        plt.Circle(
            (x * scale + 0.5, y * scale + 0.5),
            radius * scale,
            color='k',
            **kwargs
        )
    )


def draw_line(ax, x1, y1, x2, y2, scale=1., style='-'):
    ax.add_line(
        Line2D(
            (x1 * scale + 0.5, x2 * scale + 0.5),
            (y1 * scale + 0.5, y2 * scale + 0.5),
            linestyle=style,
            linewidth=0.5,
            color='k',
        )
    )


def draw_rect(ax, x, y, width, height, scale=1.):
    ax.add_patch(patches.Rectangle(
        (x * scale + 0.5, y * scale + 0.5),
        width * scale,
        height * scale,
        color='k'
    ))


def get_zigzag(x1, x2, height):
    zzw = x2 - x1
    zzh = height / 2.
    zig_x1 = x1
    zig_x2 = zig_x1 + zzw / 4.
    zag_x1 = zig_x1 + zzw * 3. / 4.
    zag_x2 = x2
    return [
        [zig_x1, 0.],
        [zig_x2, zzh],
        [zag_x1, -zzh],
        [zag_x2, 0.],
    ]



def draw_spring_shape(
        ax,
        x1, y1,
        x2, y2,
        scale=1.,
        zigzag_count=DEFAULT_ZIGZAG_COUNT,
        zigzag_height=DEFAULT_ZIGZAG_HEIGHT,
        padding=DEFAULT_ZIGZAG_PADDING
):
    points = np.matrix([
        [0., 0.],
        [padding, 0.],
    ])
    zigpoints = np.linspace(
        padding,
        1. - padding,
        num=zigzag_count+1,
    )
    for zig_x1, zag_x2 in zip(zigpoints[:-1], zigpoints[1:]):
        points = np.vstack([points, get_zigzag(x1, x2, zigzag_height)])

    points = np.vstack([points, [
        [1. - padding, 0.],
        [1., 0.],
    ]])
    points2 = []

    dx = x2 - x1
    dy = y2 - y1
    angle = np.arctan2(float(dx), float(dy))
    c = np.cos(angle)
    s = np.sin(angle)
    rot = np.matrix([[c, -s], [s, c]])
    trans = np.matrix([[-x1], [-y1]])
    for point in points:
        point2 = (rot * (point.T * dx) + trans).T
        points2.append(point2)
    for p1, p2 in zip(points[:-1], points[1:]):
        x1 = p1[0, 0]
        y1 = p1[0, 1]
        x2 = p1[0, 0]
        y2 = p1[0, 1]
        draw_line(ax, x1, y1, x2, y2, scale)
