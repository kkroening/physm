from __future__ import absolute_import
from __future__ import division
from __future__ import print_function
from __future__ import unicode_literals

from future import standard_library
from gevent import monkey
standard_library.install_aliases()
monkey.patch_all()

import sys
import os
if '__pypy__' in sys.builtin_module_names and 'GOLESS_BACKEND' not in os.environ:
    # Make sure goless uses gevent on pypy.
    os.environ['GOLESS_BACKEND'] = 'gevent'

from builtins import str, next, zip, range, object
from goless.channels import GoChannel
from past.builtins import basestring
import codecs
import copy
import gevent
import goless
import hashlib
import operator
import subprocess
import uuid

ChannelClosed = goless.ChannelClosed  # export for convenience


def _recursive_repr(item):
    """Hack around python `repr` to deterministically represent dictionaries.

    This is able to represent more things than json.dumps, since it does not require things to be JSON serializable
    (e.g. datetimes).
    """
    if isinstance(item, basestring):
        result = str(item)
    elif isinstance(item, list):
        result = '[{}]'.format(', '.join([_recursive_repr(x) for x in item]))
    elif isinstance(item, dict):
        kv_pairs = ['{}: {}'.format(_recursive_repr(k), _recursive_repr(item[k])) for k in sorted(item)]
        result = '{' + ', '.join(kv_pairs) + '}'
    else:
        result = repr(item)
    return result


def _create_hash(item):
    hasher = hashlib.sha224()
    repr_ = _recursive_repr(item)
    hasher.update(repr_.encode('utf-8'))
    return hasher.hexdigest()


class Node(object):
    """Node base"""
    @property
    def hash(self):
        if self._hash is None:
            self._update_hash()
        return self._hash

    def __init__(self, parents, name):
        parent_hashes = [hash(parent) for parent in parents]
        assert len(parent_hashes) == len(set(parent_hashes)), 'Same node cannot be included as parent multiple times'
        self._parents = parents
        self._hash = None
        self._name = name

    def _transplant(self, new_parents):
        other = copy.copy(self)
        other._parents = copy.copy(new_parents)
        return other

    @property
    def _repr_args(self):
        return []

    @property
    def _repr_kwargs(self):
        return {}

    @property
    def _short_hash(self):
        return '{:x}'.format(abs(hash(self)))[:12]

    def __repr__(self):
        args = self._repr_args
        kwargs = self._repr_kwargs
        formatted_props = ['{!r}'.format(arg) for arg in args]
        formatted_props += ['{}={!r}'.format(key, kwargs[key]) for key in sorted(kwargs)]
        return '{}({}) <{}>'.format(self._name, ', '.join(formatted_props), self._short_hash)

    def __hash__(self):
        if self._hash is None:
            self._update_hash()
        return self._hash

    def __eq__(self, other):
        return hash(self) == hash(other)

    def _update_hash(self):
        props = {'args': self._repr_args, 'kwargs': self._repr_kwargs}
        my_hash = _create_hash(props)
        parent_hashes = [str(hash(parent)) for parent in self._parents]
        hashes = parent_hashes + [my_hash]
        hashes_str = ','.join(hashes).encode('utf-8')
        hash_str = hashlib.md5(hashes_str).hexdigest()
        self._hash = int(hash_str, base=16)



class ChannelableNode(object):
    """A node that supports `.channel()` operator and subscript indexing to extract particular outputs (e.g. actors and
    groups).
    """
    def __getitem__(self, id):
        return channel(self, id)

    def __getattr__(self, id):
        if not id.startswith('_'):
            return channel(self, id)
        else:
            raise AttributeError()


class ActorNode(Node, ChannelableNode):
    def __init__(self, parents, func, input_names, output_names):
        assert all([isinstance(x, ChannelNode) for x in parents]), 'Actor parents must be of type ChannelNode'
        super(ActorNode, self).__init__(parents, actor.__name__)
        self._func = func
        self._input_names = input_names
        self._output_names = output_names

    @property
    def _repr_args(self):
        return [self._func]

    @property
    def _repr_kwargs(self):
        out = {
            'input_names': self._input_names,
        }
        if self._output_names is not None:
            out.update({
                'output_names': self._output_names,
            })
        return out


class ChannelNode(Node):
    def __init__(self, parent, id):
        parents = [parent] if parent else []
        name = channel.__name__ if parents else input.__name__
        super(ChannelNode, self).__init__(parents, name)
        self._id = id

    @property
    def _repr_kwargs(self):
        return {'id': self._id}


#class GroupNode(Node, ChannelableNode):
#    def __init__(self, parents, name, outputs, *args, **kwargs):
#        super(self, parents, name)
#        self._outputs = outputs
#        self._args = args
#        self._kwargs = kwargs
#
#    def _repr_args(self):
#        return self._args
#
#    def _repr_kwargs(self):
#        return self._kwargs


def node_operator(node_classes={ChannelNode}, name=None):
    def decorator(func):
        func_name = name or func.__name__
        [setattr(node_class, func_name, func) for node_class in node_classes]
        return func
    return decorator


@node_operator(node_classes={Node})
def transplant(parent, new_parents):
    """Copy node onto different parent(s)."""
    return parent._transplant(new_parents)


def input(id=None):
    id = id or uuid.uuid4().hex
    return ChannelNode(None, id=id)


@node_operator()
def actor(*args, **kwargs):
    if 'func' in kwargs:
        func = kwargs.pop('func')
    else:
        func = args[-1]
        args = args[:-1]

    parents = args
    input_names = kwargs.pop('input_names', list(range(len(parents))))
    assert len(input_names) == len(parents)

    output_names = kwargs.pop('output_names', None)

    assert len(kwargs) == 0, 'Invalid kwarg(s): {}'.format(', '.join(list(kwargs.keys())))
    return ActorNode(parents, func, input_names, output_names)


@node_operator(node_classes={ChannelableNode})
def channel(parent, id):
    return ChannelNode(parent, id)


#def group(parents, name, outputs, *args, **kwargs):
#    return GroupNode(parents, name, outputs, *args, **kwargs)


@node_operator()
def map(parent, func):
    def actor_func(in_ch, out_ch):
        try:
            while True:
                data = in_ch.recv()
                out_ch.send(func(data))
        except ChannelClosed:
            pass
        finally:
            out_ch.close()
    node = actor(parent, actor_func)[0]
    #return group(parent, map.__name__, func, outputs=node)
    return node


UNDEFINED = '<undefined>'

@node_operator()
def reduce(parent, func=None, initial=UNDEFINED):
    initial_valid = initial is not UNDEFINED
    def actor_func(in_ch, out_ch):
        valid = initial_valid
        acc = copy.copy(initial) if initial_valid else None
        try:
            while True:
                data = in_ch.recv()
                acc = func(acc, data) if valid else data
                valid = True
        except ChannelClosed:
            out_ch.send(acc)
        finally:
            out_ch.close()
    node = actor(parent, actor_func)[0]
    #return group(parent, map.__name__, func, outputs=node)
    return node


@node_operator()
def merge(*parents):
    def actor_func(*args):
        assert len(args) == len(parents) + 1
        in_chs = list(args[:-1])
        out_ch = args[-1]
        while len(in_chs):
            cases = [goless.rcase(in_ch) for in_ch in in_chs]
            case, val, ok = goless.select_ok(cases)
            if not ok:
                in_chs.remove(case.chan)
            else:
                out_ch.send(val)
        out_ch.close()
    args = list(parents) + [actor_func]
    node = actor(*args)[0]
    #return group(parent, map.__name__, func, outputs=node)
    return node


@node_operator()
def exec_(stdin_parent, args, capture_stderr=False):
    def actor_func(in_ch, stdout_ch, stderr_ch=None, status_ch=None):
        stderr = subprocess.PIPE if stderr_ch is not None or capture_stderr else None
        p = subprocess.Popen(args, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=stderr)

        if status_ch is not None:
            def watch_status():
                status_ch.send(p.wait())
                status_ch.close()
            goless.go(watch_status)

        def pipe_to_channel(f, ch):
            while True:
                gevent.select.select([f], [], [])
                data = gevent.os.nb_read(p.stdout.fileno(), 1000)
                if data:
                    ch.send(data)
                else:
                    break
            ch.close()

        goless.go(lambda: pipe_to_channel(p.stdout, stdout_ch))
        if stderr_ch is not None:
            goless.go(lambda: pipe_to_channel(p.stderr, stderr_ch))

        try:
            while True:
                data = in_ch.recv()
                if not isinstance(data, bytes):
                    data = data.encode('utf-8')
                p.stdin.write(data)
        except ChannelClosed:
            pass
        finally:
            p.stdin.close()

    node = actor(stdin_parent, actor_func)
    #return group(parent, map.__name__, func, outputs=node)
    return node


@node_operator()
def encode(parent, charset='utf-8', errors='strict'):
    encoder = codecs.getincrementalencoder(charset)(errors=errors)
    def actor_func(in_ch, out_ch):
        try:
            while True:
                encoded = encoder.encode(in_ch.recv())
                if encoded:
                    out_ch.send(encoded)
        except ChannelClosed:
            pass
        finally:
            out_ch.close()
    node = actor(parent, actor_func)[0]
    #return group(parent, encode.__name__, func, outputs=node)
    return node


@node_operator()
def decode(parent, charset='utf-8', errors='strict'):
    decoder = codecs.getincrementaldecoder(charset)(errors=errors)
    def actor_func(in_ch, out_ch):
        try:
            while True:
                decoded = decoder.decode(in_ch.recv())
                if decoded:
                    out_ch.send(decoded)
        except ChannelClosed:
            pass
        finally:
            out_ch.close()
    node = actor(parent, actor_func)[0]
    #return group(parent, decode.__name__, func, outputs=node)
    return node


@node_operator()
def buffer(parent, append_func, split_func, send_remainder=True):
    def actor_func(in_ch, out_ch):
        buf = None
        try:
            while True:
                more = in_ch.recv()
                buf = append_func(buf, more) if buf is not None else more
                chunks = list(split_func(buf))
                for chunk in chunks[:-1]:
                    out_ch.send(chunk)
                buf = chunks[-1]
        except ChannelClosed:
            pass
        finally:
            if buf and send_remainder:
                out_ch.send(buf)
            out_ch.close()
    node = actor(parent, actor_func)[0]
    #return group(parent, decode.__name__, func, outputs=node)
    return node


@node_operator()
def split(parent, sep):
    #return group(parent, split.__name__, func, outputs=node)
    return buffer(parent, operator.add, lambda x: x.split(sep))



@node_operator()
def expand_groups(*parents):
    """Expand all groups in a node graph."""
    raise NotImplementedError()  # FIXME


def _topo_sort(start_nodes):
    # TODO: support cutoff_nodes param.
    marked_nodes = []
    sorted_nodes = []
    child_map = {}
    def visit(node, child):
        assert node not in marked_nodes, 'Graph is not a DAG'
        if child is not None:
            if node not in child_map:
                child_map[node] = []
            child_map[node].append(child)
        if node not in sorted_nodes:
            marked_nodes.append(node)
            [visit(parent, node) for parent in node._parents]
            marked_nodes.remove(node)
            sorted_nodes.append(node)
    unmarked_nodes = copy.copy(start_nodes)
    while unmarked_nodes:
        visit(unmarked_nodes.pop(), None)
    return sorted_nodes, child_map


def _make_actor_output_channels(actor_node, child_map, channel_map):
    output_nodes = child_map[actor_node]
    for output_node in output_nodes:
        channel_map[output_node] = goless.chan(1)


def _spawn_actor(actor_node, child_map, channel_map):
    input_nodes = list(actor_node._parents)
    output_nodes = child_map[actor_node]
    assert all([isinstance(x, ChannelNode) for x in input_nodes]), 'Actor inputs must be of type ChannelNode'
    assert all([isinstance(x, ChannelNode) for x in output_nodes]), 'Actor outputs must be of type ChannelNode'

    for node in input_nodes + output_nodes:
        if node not in channel_map:
            channel_map[node] = goless.chan(1)

    input_channels = [channel_map[x] for x in input_nodes]
    input_map = dict(list(zip(actor_node._input_names, input_channels)))
    output_map = {x._id: channel_map[x] for x in output_nodes}

    unnamed_inputs = [input_map[k] for k in sorted(input_map.keys()) if isinstance(k, int)]
    unnamed_outputs = [output_map[k] for k in sorted(output_map.keys()) if isinstance(k, int)]
    args = unnamed_inputs + unnamed_outputs

    named_input_map = {'{}_ch'.format(k): v for k, v in list(input_map.items()) if not isinstance(k, int)}
    named_output_map = {'{}_ch'.format(k): v for k, v in list(output_map.items()) if not isinstance(k, int)}
    kwargs = {}
    kwargs.update(named_input_map)
    kwargs.update(named_output_map)

    return goless.go(actor_node._func, *args, **kwargs)


def _get_node_spec_as_list(node_spec):
    if isinstance(node_spec, (list, tuple)):
        nodes = node_spec
    elif isinstance(node_spec, dict):
        nodes = list(node_spec.values())
    else:
        assert isinstance(node_spec, Node), 'node_spec must be a list, tuple, dict, or node'
        nodes = [node_spec]
    return nodes


def _prepare_inputs(input_map, input_nodes):
    channel_map = {}
    input_node_values = {}
    for k, v in list(input_map.items()):
        if isinstance(k, basestring):
            input_node = next((x for x in input_nodes if x._id == k), None)
        elif isinstance(k, Node):
            input_node = k
        else:
            input_node = None
        assert input_node is not None, 'Invalid input node/ID: {}'.format(k)
        if isinstance(v, GoChannel):
            channel_map[input_node] = v
        else:
            input_node_values[input_node] = v
    return channel_map, input_node_values


def _feed_input(input_node, values, channel_map):
    input_channel = channel_map[input_node]
    def func():
        [input_channel.send(value) for value in values]
        input_channel.close()
    return goless.go(func)


def _feed_inputs(input_node_values, channel_map):
    actors = []
    for input_node, values in list(input_node_values.items()):
        actors.append(_feed_input(input_node, values, channel_map))
    return actors


def _get_channel_spec(node_spec, channel_map):
    if isinstance(node_spec, (list, tuple)):
        channel_spec = [channel_map[x] for x in node_spec]
    elif isinstance(node_spec, dict):
        channel_spec = {k: channel_map[v] for k, v in list(node_spec.items())}
    else:
        channel_spec = channel_map[node_spec]
    return channel_spec


@node_operator(node_classes={ChannelNode})
def run_async(node_spec, inputs={}):
    nodes = _get_node_spec_as_list(node_spec)

    # TODO: flatten graph.

    assert [isinstance(x, ChannelNode) for x in nodes], 'Can only run channel nodes'
    sorted_nodes, child_map = _topo_sort(nodes)

    actor_nodes = [x for x in sorted_nodes if isinstance(x, ActorNode)]
    input_nodes = [x for x in sorted_nodes if isinstance(x, ChannelNode) and len(x._parents) == 0]

    if isinstance(inputs, (list, tuple)):
        assert len(input_nodes) == 1, "`inputs` must be a dict when multiple inputs are present"
        input_map = {input_nodes[0]: inputs}
    else:
        assert isinstance(inputs, dict), "`inputs` must be a dict, list, or tuple"
        input_map = inputs
    channel_map, input_values_map = _prepare_inputs(input_map, input_nodes)

    actors = [_spawn_actor(actor_node, child_map, channel_map) for actor_node in actor_nodes]
    actors += _feed_inputs(input_values_map, channel_map)

    channel_spec = _get_channel_spec(node_spec, channel_map)
    return actors, channel_spec


def _get_channel_spec_as_list(channel_spec):
    if isinstance(channel_spec, (list, tuple)):
        nodes = channel_spec
    elif isinstance(channel_spec, dict):
        nodes = list(channel_spec.values())
    else:
        assert isinstance(channel_spec, GoChannel)
        nodes = [channel_spec]
    return nodes


def _recv_all(in_ch, out_ch):
    values = []
    try:
        while True:
            values.append(in_ch.recv())
    except ChannelClosed:
        out_ch.send(values)
    finally:
        out_ch.close()


def _get_output_spec(channel_spec, values_map):
    if isinstance(channel_spec, (list, tuple)):
        channel_spec = [values_map[x] for x in channel_spec]
    elif isinstance(channel_spec, dict):
        channel_spec = {k: values_map[v] for k, v in list(channel_spec.items())}
    else:
        channel_spec = values_map[channel_spec]
    return channel_spec


@node_operator(node_classes={ChannelNode})
def run(node_spec, inputs={}):
    actors, channel_spec = run_async(node_spec, inputs)
    in_channels = _get_channel_spec_as_list(channel_spec)
    out_channels = [goless.chan(1) for _ in range(len(in_channels))]
    channels = list(zip(in_channels, out_channels))
    [goless.go(_recv_all, in_ch, out_ch) for in_ch, out_ch in channels]
    values_map = {in_ch: out_ch.recv() for in_ch, out_ch in channels}
    return _get_output_spec(channel_spec, values_map)

