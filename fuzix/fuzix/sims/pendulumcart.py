from ..draw_utils import draw_circle
from ..draw_utils import draw_line
from ..draw_utils import draw_rect
from ..utils import do_render_animation
from ..utils import memoize
import copy
import logging
import numpy as np


GRAVITY = 10.

CART_WIDTH = 1.
CART_HEIGHT = 0.5

BALL_RADIUS = 1/2.


logger = logging.getLogger(__name__)


def tick(params, state):
    new_state = copy.copy(state)

    length = params['length']
    cart_mass = params['cart_mass']
    ball_mass = params['ball_mass']

    cart_dx = state['cart_dx']
    theta = state['theta']
    dtheta = state['dtheta']

    version = 2
    if version == 0:
        cart_mass_ratio = cart_mass / (ball_mass + cart_mass)
        ball_mass_ratio = ball_mass / (ball_mass + cart_mass)
        d2theta_n = (
            (cart_mass_ratio - 1) * (dtheta ** 2)
            - GRAVITY / (ball_mass * length * np.cos(theta))
        )
        d2theta_d = cart_mass_ratio / np.tan(theta) + np.tan(theta)
        d2theta = d2theta_n / d2theta_d
        cart_d2x = - ball_mass_ratio * length * (d2theta * np.cos(theta) - (dtheta ** 2) * np.sin(theta))
    elif version == 1:
        d2theta_n = (
            (dtheta ** 2) * np.sin(theta) * np.cos(theta)
            + (cart_mass + ball_mass) / (ball_mass * length) * np.sin(theta) * (GRAVITY + cart_dx * dtheta - cart_dx)
        )
        d2theta_d = (np.cos(theta) ** 2) - (cart_mass + ball_mass) / (ball_mass ** 2)
        d2theta = d2theta_n / d2theta_d
        cart_d2x = - ball_mass / (cart_mass + ball_mass) * length * (d2theta * np.cos(theta) - (dtheta ** 2) * np.sin(theta))
    else:
        d2theta_n = - (GRAVITY * (ball_mass + cart_mass) + length * ball_mass * np.cos(theta) * dtheta ** 2) * np.sin(theta)
        d2theta_d = length * (ball_mass * np.sin(theta)**2 + cart_mass)
        d2theta = d2theta_n / d2theta_d
        cart_d2x_n = ball_mass * (GRAVITY * np.cos(theta) + length * dtheta **2) * np.sin(theta)
        cart_d2x_d = ball_mass * np.sin(theta)**2 + cart_mass
        cart_d2x = cart_d2x_n / cart_d2x_d

    dt = params['dt']
    new_state['time'] += dt
    new_state['dtheta'] += d2theta * dt
    new_state['theta'] += dtheta * dt
    new_state['cart_d2x'] = cart_d2x
    new_state['cart_dx'] += cart_d2x * dt
    new_state['cart_x'] += cart_dx * dt
    return new_state


def draw_cart(ax, mass, cart_x, scale):
    size = np.sqrt(2 * mass)
    draw_rect(
        ax,
        cart_x - CART_WIDTH / 2. * size,
        -CART_HEIGHT / 2. * size,
        CART_WIDTH * size,
        CART_HEIGHT * size,
        scale,
    )


def draw_ball(ax, mass, length, cart_x, theta, scale):
    size = np.sqrt(mass)
    radius = BALL_RADIUS * size
    x = cart_x + length * np.sin(theta)
    y = length * -np.cos(theta)
    draw_circle(ax, x, y, radius, scale)
    draw_line(
        ax,
        cart_x, 0,
        x, y,
        scale,
    )


def draw_world(ax, params, state, scale):
    ax.get_xaxis().set_visible(False)
    ax.get_yaxis().set_visible(False)
    ax.set_aspect('equal')

    draw_line(ax, -10., 0., 10., 0., scale)
    draw_cart(ax, params['cart_mass'], state['cart_x'], scale)
    draw_ball(ax, params['ball_mass'], params['length'], state['cart_x'], state['theta'], scale)


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
    params = {
        'dt': 0.01,
        'max_time_index': 300,
        'length': 3.,
        'cart_mass': 1.,
        'ball_mass': 1.,
    }
    state = {
        'time': 0.,
        'theta': 0.,
        'dtheta': -1.,
        'cart_x': 0.,
        'cart_dx': 0.5,
    }
    return params, state


def main():
    params, state = init()
    scale = 0.08
    logger.info('Simulating...')
    states = simulate(params, state)

    logger.info('Rendering...')
    anim = render_animation(params, states, scale, sample_interval=8)
    anim.save('anim.mp4')
    logger.info('Done.')


if __name__ == '__main__':
    main()
