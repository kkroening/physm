from __future__ import print_function
import graphene
import inspect


class _FuncInfo(object):
    def __init__(self, func):
        self.func = func
        self.response_type = None
        self.arg_type_map = {}

    def _get_request_arg_type(self, spec, i):
        name = spec.args[i]
        if name in self.arg_type_map:
            type = self.arg_type_map[name]
        else:
            defaults_index = i - (len(spec.args) - len(spec.defaults or []))
            if defaults_index < 0:
                #raise IndexError('Missing default value for argument: {}'.format(name))
                default_value = None
                required = True
            else:
                default_value = spec.defaults[defaults_index]
                required = False
            type = graphene.String(default_value=default_value, required=required)
        return type

    def _get_request_arg_type_map(self, func):
        spec = inspect.getfullargspec(func)
        return {arg: self._get_request_arg_type(spec, i) for i, arg in enumerate(spec.args)}

    @property
    def name(self):
        return self.func.__name__

    def Field(self):
        response_type = self.response_type or graphene.String()
        response_type.kwargs['args'] = self._get_request_arg_type_map(self.func)
        response_type.kwargs.setdefault('description', self.func.__doc__)
        return response_type.mount_as(graphene.Field)

    def resolve(self, *args, **kwargs):
        return self.func(**kwargs)


class Graphenator(object):
    def __init__(self):
        self._func_info_map = {}

    def _get_func_info(self, func):
        self._func_info_map.setdefault(func, _FuncInfo(func))
        return self._func_info_map[func]

    def __call__(self, func):
        self._get_func_info(func)
        return func

    def args(self, **kwargs):
        def decorate(func):
            func_info = self._get_func_info(func)
            func_info.arg_type_map.update(kwargs)
            return func
        return decorate

    def returns(self, response_type):
        def decorate(func):
            func_info = self._get_func_info(func)
            func_info.response_type = response_type
            return func
        return decorate

    @property
    def QueryMixin(self):
        attr_map = {}
        for func_info in self._func_info_map.values():
            attr_map[func_info.name] = func_info.Field()
            attr_map['resolve_{}'.format(func_info.name)] = func_info.resolve
        return type('QueryMixin', (), attr_map)

    @property
    def Query(self):
        return type('Query', (graphene.ObjectType, self.QueryMixin), {})

    @property
    def Schema(self):
        return graphene.Schema(query=self.Query)
