from ..draw_utils import draw_rect
from ..draw_utils import draw_spring_shape
from ..state import get_values
from ..state import set_values
from ..utils import do_render_animation
from ..utils import memoize
from functools import partial
import logging
import numpy as np


BLOCK_WIDTH = 1.
BLOCK_HEIGHT = 1.

WALL_WIDTH = 0.3
WALL_HEIGHT = 20.


BLOCK_STATE_PROPS = {
    'position',
    'velocity',
}
BLOCK_PARAM_PROPS = {
    'mass',
}
SPRING_PARAM_PROPS = {
    'eq_length',
    'stiffness',
    'strength',
}

logger = logging.getLogger(__name__)

get_block_state = partial(get_values, 'block', BLOCK_STATE_PROPS)
set_block_state = partial(set_values, 'block', BLOCK_STATE_PROPS)
get_block_params = partial(get_values, 'block', BLOCK_PARAM_PROPS)
set_block_params = partial(set_values, 'block', BLOCK_PARAM_PROPS)

get_spring_params = partial(get_values, 'spring', SPRING_PARAM_PROPS)
set_spring_params = partial(set_values, 'spring', SPRING_PARAM_PROPS)


def update_block_state(id, params, state, new_state):
    def get_spring_values(spring_id):
        spring_params = get_spring_params(spring_id, params)
        b = spring_params['stiffness']
        d = spring_params['eq_length']
        k = spring_params['strength']
        return b, d, k

    def get_block_values(block_id):
        block_params = get_block_params(block_id, params)
        block_state = get_block_state(block_id, state)
        m = block_params['mass']
        pos = block_state['position']
        vel = block_state['velocity']
        return m, pos, vel

    m2, pos2, vel2 = get_block_values(id)
    size2 = np.sqrt(m2)
    d_pos2 = vel2
    d_vel2 = 0.
    if id > 0:
        b1, d1, k1 = get_spring_values(id - 1)
        m1, pos1, vel1 = get_block_values(id - 1)
        d_vel2 -= b1/m2 * (vel2 - vel1) + k1/m2 * (pos2 - pos1 - d1)
    if id < params['block_count'] - 1:
        b2, d2, k2 = get_spring_values(id)
        m3, pos3, vel3 = get_block_values(id + 1)
        d_vel2 += b2/m2 * (vel3 - vel2) + k2/m2 * (pos3 - pos2 - d2)
    dt = params['dt']
    pos2 += d_pos2 * dt
    vel2 += d_vel2 * dt

    wall1_x = params.get('wall1_x')
    if wall1_x is not None:
        min_pos = wall1_x + WALL_WIDTH/2. + size2 / 2.
        if pos2 <= min_pos:
            pos2 = min_pos
            vel2 = -vel2

    wall2_x = params.get('wall2_x')
    if wall2_x is not None:
        max_pos2 = wall2_x - WALL_WIDTH/2. - size2 / 2.
        if pos2 >= max_pos2:
            pos2 = max_pos2
            vel2 = -vel2

    return set_block_state(id, new_state, position=pos2, velocity=vel2)


def tick(params, state):
    block_count = params['block_count']

    new_state = {}
    for block_id in range(block_count):
        update_block_state(block_id, params, state, new_state)

    return new_state


def draw_block(id, ax, params, state, scale):
    block_params = get_block_params(id, params)
    block_state = get_block_state(id, state)
    size = np.sqrt(block_params['mass'])
    draw_rect(
        ax,
        block_state['position'] - BLOCK_WIDTH / 2. * size,
        -BLOCK_HEIGHT / 2. * size,
        BLOCK_WIDTH * size,
        BLOCK_HEIGHT * size,
        scale,
    )


def draw_spring(id, ax, params, state, scale):
    block_states = [get_block_state(block_id, state) for block_id in [id, id+1]]
    block_params = [get_block_params(block_id, params) for block_id in [id, id+1]]
    pos1 = block_states[0]['position']
    pos2 = block_states[1]['position']
    size1 = np.sqrt(block_params[0]['mass'])
    size2 = np.sqrt(block_params[1]['mass'])
    x1 = pos1 + BLOCK_WIDTH / 2. * size1
    x2 = pos2 - BLOCK_WIDTH / 2. * size2
    draw_spring_shape(ax, x1, x2, scale)


def draw_wall(ax, x, scale):
    draw_rect(
        ax,
        x - WALL_WIDTH / 2.,
        -WALL_HEIGHT / 2.,
        WALL_WIDTH,
        WALL_HEIGHT,
        scale,
    )


def draw_world(ax, params, state, scale):
    ax.get_xaxis().set_visible(False)
    ax.get_yaxis().set_visible(False)
    ax.set_aspect('equal')
    ax.set_ylim(0.4, 0.6)

    block_count = params['block_count']
    spring_count = params['block_count'] - 1
    for block_id in range(block_count):
        draw_block(block_id, ax, params, state, scale)

    for spring_id in range(spring_count):
        draw_spring(spring_id, ax, params, state, scale)

    wall1_x = params.get('wall1_x')
    wall2_x = params.get('wall2_x')
    if wall1_x is not None:
        draw_wall(ax, wall1_x, scale)
    if wall2_x is not None:
        draw_wall(ax, wall2_x, scale)


@memoize
def simulate(params, initial_state):
    state = initial_state
    states = [initial_state]
    for i in range(params['max_time_index']):
        state = tick(params, state)
        states.append(state)
    return states


def render_animation(params, states, scale, sample_interval=1):
    render_func = lambda ax, time_index: draw_world(ax, params, states[time_index], scale)
    return do_render_animation(render_func, params['max_time_index'], sample_interval)


def init():
    block_count = 10
    params = {
        'dt': 0.01,
        'max_time_index': 1800,
        'block_count': block_count,
        'wall1_x': -5.,
        'wall2_x': 35.,
    }
    state = {}
    return params, state


def main():
    params, state = init()
    block_count = params['block_count']

    for i in range(block_count):
        set_block_params(i, params, mass=0.5)
        set_block_state(i, state, position=0. + i * 3, velocity=0.)

    set_block_state(block_count - 1, state, velocity=-40.)
    #set_block_state(block_count - 1, state, velocity=10.)

    spring_count = block_count - 1
    for i in range(spring_count):
        set_spring_params(i, params, strength=6., stiffness=0.4, eq_length=3.)

    scale = 0.012
    logger.info('Simulating...')
    states = simulate(params, state)

    logger.info('Rendering...')
    anim = render_animation(params, states, scale, sample_interval=9)
    anim.save('anim.mp4')
    logger.info('Done.')
