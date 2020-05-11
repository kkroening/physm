from functools import reduce
from fuzix.draw_utils import draw_circle
from fuzix.draw_utils import draw_line
from fuzix.draw_utils import draw_rect
from fuzix.draw_utils import draw_spring_shape
from fuzix.utils import do_render_animation
from fuzix.utils import RendererWidget
from fuzix.utils import timed
from IPython.display import display
from ipywidgets import interact
from matplotlib import pyplot as plt
from sympy.physics.mechanics import dynamicsymbols
import daglet
import numpy as np
import operator
import sympy as sp


DT = 0.01
GRAVITY = 10.  # FIXME
MAX_TIME = 1000
SAMPLE_INTERVAL = 8


param_id_counter = 0
def Param():
    global param_id_counter
    id = param_id_counter
    param_id_counter += 1
    return sp.Symbol('alpha_param{}'.format(id))


state_id_counter = 0
def State():
    global state_id_counter
    id = state_id_counter
    state_id_counter += 1
    return dynamicsymbols('beta_state{}'.format(id))


def bind_params(expr, params):
    return float(sp.sympify(expr).subs(params.items()))


class Connector(object):
    def __init__(self, parents=[], spec=None):
        self.parents = parents
        self.spec = spec

    def __or__(self, other):
        if self.spec is not None:
            parents = [self]
        else:
            parents = self.parents
        return other.connector_cls(parents, other)

    def to_world_pos(self, pos=None, parent_num=0):
        if pos is None:
            pos = sp.Matrix([0., 0.])
        pos = self.spec.xform_pos(pos)
        if self.parents:
            assert parent_num in range(len(self.parents))
            pos = self.parents[parent_num].to_world_pos(pos)
        return pos

    def to_world_pos_val(self, params, state, pos=None, parent_num=0):
        # TODO: memoize this.
        return (
            self
            .to_world_pos(pos, parent_num)
            .subs(params.items())
            .subs(state.items())
        )

    def get_energy_expr(self, t):
        return self.spec.get_energy_expr(self, t)

    def draw(self, ax, params, state):
        return self.spec.draw(self, ax, params, state)


class CoasterConnector(Connector):
    def __init__(self, parents, spec):
        assert isinstance(spec, Coaster)
        assert len(parents) == 1
        assert isinstance(parents[0].spec, Track)
        super(CoasterConnector, self).__init__(parents, spec)

    def to_world_pos(self, pos=None):
        if pos is None:
            pos = sp.Matrix([0., 0.])
        pos = self.spec.xform_pos(pos)
        pos = self.parents[0].spec.xform_coaster_pos(self.spec.x, pos)
        return pos


class SpringConnector(Connector):
    def __init__(self, parents, spec):
        assert isinstance(spec, Spring)
        assert len(parents) == 2
        super(SpringConnector, self).__init__(parents, spec)


class Spec(object):
    COUNTER = 0

    connector_cls = Connector

    @classmethod
    def _alloc_id(cls):
        id = cls.COUNTER
        cls.COUNTER += 1
        return '{}{}'.format(cls.__name__.lower(), id)

    def __init__(self, param_symbols=[], state_symbols=[]):
        self.param_symbols = param_symbols
        self.state_symbols = state_symbols

    def xform_pos(self, pos):
        return pos

    def get_energy_expr(self, connector, t):
        return 0.

    def draw(self, connector, ax, params, state):
        pass


class World(Spec):
    def __init__(self):
        self.gravity = sp.Symbol('g')
        params = [(self.gravity, 10.)]
        super(World, self).__init__(params)


class Coaster(Spec):
    connector_cls = CoasterConnector

    def __init__(self, x=None, id=None):
        if id is None:
            id = self._alloc_id()
        if x is None:
            x = dynamicsymbols('x_{}'.format(id))
        states = [(x, 0.)]
        self.x = x
        super(Coaster, self).__init__([], states)


class Track(Spec):
    def __init__(self):
        super(Track, self).__init__()

    def coaster(self, *args, **kwargs):
        return Coaster(self, *args, **kwargs)

    def xform_coaster_pos(self, x, pos):
        raise NotImplementedError('Implemented in subclass')


class LineTrack(Track):
    def draw(self, connector, ax, params, state):
        pos1 = sp.Matrix([-20., 0.])
        pos2 = sp.Matrix([20., 0.])
        x1, y1 = connector.to_world_pos_val(params, state, pos1)
        x2, y2 = connector.to_world_pos_val(params, state, pos2)
        draw_line(
            ax,
            x1, y1,
            x2, y2,
            1.,
        )

    def xform_coaster_pos(self, x, pos=None):
        if pos is None:
            pos = sp.Matrix([0., 0.])
        return sp.Matrix([x, 0.]) + pos


class CurvedTrack(Track):
    def __init__(self, t_min=0., t_max=1.):
        super(CurvedTrack, self).__init__()
        self.t_min = t_min
        self.t_max = t_max

    def draw(self, connector, ax, params, state):
        t = np.linspace(self.t_min, self.t_max, 30)
        for t1, t2 in zip(t[:-1], t[1:]):
            pos1 = self.xform_coaster_pos(t1)
            pos2 = self.xform_coaster_pos(t2)
            x1, y1 = connector.to_world_pos_val(params, state, pos1)
            x2, y2 = connector.to_world_pos_val(params, state, pos2)
            draw_line(
                ax,
                x1, y1,
                x2, y2,
                1.,
            )


class CircleTrack(CurvedTrack):
    def __init__(self, radius=3.):
        super(CircleTrack, self).__init__(0., 2.*np.pi)
        self.radius = radius

    def xform_coaster_pos(self, theta, pos=None):
        if pos is None:
            pos = sp.Matrix([0., 0.])
        return self.radius * sp.Matrix([sp.cos(-theta), sp.sin(theta)]) + pos


class MassSpec(Spec):
    def __init__(self, mass=None, id=None):
        if id is None:
            id = self._alloc_id()
        if mass is None:
            mass = sp.Symbol('m_{}'.format(id))
        params = []
        if isinstance(mass, sp.Symbol):
            params += [(mass, 1.)]
        self.mass = mass
        super(MassSpec, self).__init__(params)

    def get_energy_expr(self, connector, t):
        q = connector.to_world_pos()
        dq = q.diff(t)
        kinetic = 0.5 * self.mass * (dq[0]**2 + dq[1]**2)
        potential = q[1] * GRAVITY * self.mass
        return kinetic - potential


class Block(MassSpec):
    def draw(self, connector, ax, params, state):
        x, y = connector.to_world_pos_val(params, state)
        mass = bind_params(self.mass, params)
        size = np.sqrt(2 * mass)
        draw_rect(
            ax,
            x - size/2.,
            y - size/4.,
            size,
            size / 2.,
            1.,
        )


class Hinge(Spec):
    def __init__(self, angle=None, id=None):
        if id is None:
            id = self._alloc_id()
        if angle is None:
            angle = dynamicsymbols('theta_{}'.format(id))
        params = []
        states = [(angle, 1.)]
        self.angle = angle
        super(Hinge, self).__init__(params, states)

    def xform_pos(self, pos):
        return sp.rot_axis3(-self.angle)[:2,:2] * pos



class HingeRod(Spec):
    """A combination of a Hinge and a Rod, but potentially more computationally
    efficient because downstream coordinate systems are translated instead of
    rotated.
    """
    def __init__(self, length=None, angle=None, id=None):
        if id is None:
            id = self._alloc_id()
        if length is None:
            length = sp.Symbol('l_{}'.format(id))
        if angle is None:
            angle = dynamicsymbols('theta_{}'.format(id))
        params = []
        if isinstance(length, sp.Symbol):
            params += [(length, 3.)]
        states = [(angle, 1.)]
        self.length = length
        self.angle = angle
        super(HingeRod, self).__init__(params, states)

    def xform_pos(self, pos):
        return self.length * sp.Matrix([sp.sin(self.angle), sp.cos(-self.angle)]) + pos

    def draw(self, connector, ax, params, state):
        pos1 = sp.Matrix([0., 0.])
        pos2 = -self.xform_pos(pos1)
        x1, y1 = connector.to_world_pos_val(params, state, pos1)
        x2, y2 = connector.to_world_pos_val(params, state, pos2)
        draw_line(
            ax,
            x1, y1,
            x2, y2,
            1.,
        )


class Spring(Spec):
    def __init__(self, length=None, strength=None, id=None):
        if id is None:
            id = self._alloc_id()
        if length is None:
            length = sp.Symbol('l_{}'.format(id))
        self.length = length
        if strength is None:
            strength = sp.Symbol('k_{}'.format(id))
        self.strength = strength
        params = []
        if isinstance(length, sp.Symbol):
            params += [(length, 3.)]
        if isinstance(strength, sp.Symbol):
            params += [(strength, 1.)]
        super(Spring, self).__init__(params)

    def get_energy_expr(self, connector, t):
        x1 = connector.to_world_pos(parent_num=0)
        x2 = connector.to_world_pos(parent_num=1)
        x = x2 - x1
        d = (x.T * x)[0,0] - self.length
        potential = 0.5 * self.strength * d**2
        return - potential

    def draw(self, connector, ax, params, state):
        x1, y1 = connector.to_world_pos_val(params, state, parent_num=0)
        x2, y2 = connector.to_world_pos_val(params, state, parent_num=1)
        draw_spring_shape(
            ax,
            x1, y1,
            x2, y2,
            1.,
        )


class Pivot(Spec):
    def __init__(self, angle=None, id=None):
        if id is None:
            id = self._alloc_id()
        if angle is None:
            angle = sp.Symbol('theta_{}'.format(id))
        params = []
        if isinstance(angle, sp.Symbol):
            params += [(angle, np.pi/2.)]
        self.angle = angle
        super(Pivot, self).__init__(params)

    def xform_pos(self, pos):
        return sp.rot_axis3(-self.angle)[:2,:2] * pos


class Rod(Spec):
    def __init__(self, length=None, id=None):
        if id is None:
            id = self._alloc_id()
        if length is None:
            length = sp.Symbol('l_{}'.format(id))
        params = []
        if isinstance(length, sp.Symbol):
            params += [(length, 3.)]
        self.length = length
        super(Rod, self).__init__(params)

    def xform_pos(self, pos):
        return sp.Matrix([0., -self.length]) + pos

    def draw(self, connector, ax, params, state):
        length = bind_params(self.length, params)
        pos1 = sp.Matrix([0., 0.])
        pos2 = sp.Matrix([0., length])
        x1, y1 = connector.to_world_pos_val(params, state, pos1)
        x2, y2 = connector.to_world_pos_val(params, state, pos2)
        draw_line(
            ax,
            x1, y1,
            x2, y2,
            1.,
        )


class Ball(MassSpec):
    def draw(self, connector, ax, params, state):
        pos = connector.to_world_pos_val(params, state)
        x, y = pos
        mass = bind_params(self.mass, params)
        radius = np.sqrt(mass) / 2.
        draw_circle(ax, x, y, radius, 1.)


class Scene(object):  # FIXME: make this into a kind of connector.
    def __init__(self, connectors):
        self.connectors = connectors
        self.connectors = daglet.toposort(connectors, lambda x: x.parents)
        self.specs = [x.spec for x in self.connectors]
        self.param_symbols = reduce(operator.add, [x.param_symbols for x in self.specs])
        self.state_symbols = reduce(operator.add, [x.state_symbols for x in self.specs])
        self.time = sp.Symbol('t')
        self.Q = [symbol for symbol, _ in self.state_symbols]
        self.dQ = [q.diff(self.time) for q in self.Q]

    def get_energy_expr(self, t):
        energy = 0.
        for connector in self.connectors:
            energy += connector.get_energy_expr(t)
        return energy

    def get_default_params(self, params={}):
        default_params = {symbol: default_value for symbol, default_value in self.param_symbols}
        default_params.update(params)
        return default_params

    def get_default_initial_state(self, initial_state={}):
        default_initial_state = {}
        default_initial_state.update(
            {symbol: default_value for symbol, default_value in self.state_symbols})
        default_initial_state.update(
            {symbol.diff(self.time): 0. for symbol, _ in self.state_symbols})
        default_initial_state.update(initial_state)
        return default_initial_state

    def draw(self, ax=None, params={}, state={}, scale=1.):
        if ax is None:
            _, ax = plt.subplots()
        params = self.get_default_params(params)
        state = self.get_default_initial_state(state)

        ax.set_xlim(-8. / scale, 8. / scale)
        ax.set_ylim(-8. / scale, 6. / scale)
        ax.set_aspect('equal')

        for connector in self.connectors:
            connector.draw(ax, params, state)


def get_lagrange_eq(L, q, t):
    dq = q.diff(t)
    eq = sp.Eq(L.diff(dq).diff(t) - L.diff(q), 0)
    return eq


def get_lagrange_eqs(L, Q, t):
    return [get_lagrange_eq(L, q, t) for q in Q]


def solve_lagrange_eqs(eqs, Q, t):
    ddQ = [q.diff(t, 2) for q in Q]
    solutions = sp.linsolve(eqs, ddQ)
    assert len(solutions) == 1
    return dict(zip(ddQ, list(solutions)[0]))


def solve_lagrangian(L, Q, t):
    eqs = [get_lagrange_eq(L, q, t) for q in Q]
    return solve_lagrange_eqs(eqs, Q, t)


def analyze_scene(scene):
    print('Determining Lagrangian')
    with timed() as timing:
        L = scene.get_energy_expr(scene.time)
    print(' - Finished in {} seconds'.format(timing[0]))

    print('Deriving Lagrange equations')
    with timed() as timing:
        eqs = get_lagrange_eqs(L, scene.Q, scene.time)
    print(' - Finished in {} seconds'.format(timing[0]))

    print('Solving Lagrange equations')
    with timed() as timing:
        eqs = solve_lagrangian(L, scene.Q, scene.time)
    print(' - Finished in {} seconds'.format(timing[0]))

    return eqs


def compile_eqs(scene, eqs, params):
    delta_map = {}
    dQ = []
    for i, q in enumerate(scene.Q):
        dq = sp.Symbol('dq_{}'.format(i))
        delta_map[q.diff(scene.time)] = dq
        dQ.append(dq)

    funcs = []
    for q in scene.Q:
        eq = eqs[q.diff(scene.time, 2)]
        eq = eq.subs(list(params.items()) + list(delta_map.items()))
        funcs.append(sp.lambdify(scene.Q + dQ, eq))
    return funcs


class Simulator(object):
    def __init__(self, scene, analyze=True):
        self.scene = scene
        if analyze:
            self.eqs = analyze_scene(scene)
        else:
            self.eqs = None

    def tick(self, funcs, state, dt):
        q_vals = [state[q] for q in self.scene.Q]
        dq_vals = [state[dq] for dq in self.scene.dQ]
        args = q_vals + dq_vals
        new_state = {}
        for q, dq, q_val, dq_val, func in zip(self.scene.Q, self.scene.dQ, q_vals, dq_vals, funcs):
            ddq_val = func(*args)
            new_state[q] = q_val + dq_val * dt
            new_state[q.diff(self.scene.time)] = dq_val + ddq_val * dt
        return new_state

    def iterate(self, params={}, initial_state={}, max_time=MAX_TIME, dt=DT, funcs=None):
        params = self.scene.get_default_params(params)
        state = self.scene.get_default_initial_state(initial_state)
        if funcs is None:
            funcs = compile_eqs(self.scene, self.eqs, params)
        else:
            assert len(funcs) == len(self.scene.Q)
        for time in range(max_time):
            state = self.tick(funcs, state, dt)
            yield state

    def run(self, params={}, initial_state={}, max_time=MAX_TIME, dt=DT, funcs=None):
        return list(self.iterate(params, initial_state, max_time, dt, funcs))


def show_scene_viewer(scene, params, states, scale=1.):
    @interact(time_index=(0, len(states) - 1))
    def f(time_index=0):
        _, ax = plt.subplots()
        scene.draw(ax, params, states[time_index], scale=scale)


def show_renderer(scene, params, states, sample_interval=SAMPLE_INTERVAL, scale=1.):
    def render():
        draw_func = lambda ax, time_index: scene.draw(ax, params, states[time_index], scale=scale)
        anim = do_render_animation(draw_func, len(states), sample_interval)
        anim.save('anim.mp4')
        display(anim)

    renderer_widget = RendererWidget()
    renderer_widget.render_func = render
    display(renderer_widget)
