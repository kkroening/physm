def get_prop_key(type, id, prop):
    return '{}{}_{}'.format(type, id, prop)


def get_values(type, props, id, d):
    get_value = lambda prop: d[get_prop_key(type, id, prop)]
    return {prop: get_value(prop) for prop in props}


def set_values(type, props, id, d, **kwargs):
    extra_keys = set(kwargs.keys()).difference(props)
    assert not extra_keys, 'Unexpected key(s): {}'.format(', '.join(extra_keys))
    for prop, value in kwargs.items():
        d[get_prop_key(type, id, prop)] = value
    return d
