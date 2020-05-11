from __future__ import absolute_import
import rpyc
from rpyc.utils.server import ThreadedServer


def rpyc_expose(cls):
    def _rpyc_getattr(self, name):
        if name.startswith('_'):
            raise AttributeError(
                "'{}' object has no attribute '{}'".format(self.__class__.__name__, name))
        return getattr(self, name)

    assert not hasattr(cls, '_rpyc_getattr'), \
        "'{}' class already has '_rpyc_getattr'".format(cls.__name__)
    setattr(cls, '_rpyc_getattr', _rpyc_getattr)
    return cls


@rpyc_expose
class ServiceAdapter(object):
    def thing(self, x):
        return x * 3


class SandboxService(rpyc.Service):
    @staticmethod
    def run(socket_path, adapter_factory=None):
        adapter = adapter_factory() if adapter_factory else None
        ThreadedServer(SandboxService, socket_path=socket_path, adapter=adapter).start()

    def on_connect(self):
        self.exposed_service_adapter = ServiceAdapter()
