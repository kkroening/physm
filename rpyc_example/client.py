from __future__ import absolute_import
from multiprocessing import Process
import contextlib
import os
import rpyc
import signal
import time
import uuid


class Sandbox(object):
    def _run(self):
        import server
        server.SandboxService.run(self.__socket_path)

    def _start(self):
        self.__process = Process(target=self._run)
        self.__process.start()
        time.sleep(0.5)  # FIXME
        # (Alternatively, start an actual subprocess)

    def __init__(self, socket_path=None):
        self.__socket_path = socket_path or 'sandbox_{}.sock'.format(uuid.uuid4().hex)
        self._start()
        client = rpyc.utils.factory.unix_connect(self.__socket_path)
        self.__client = client

    def close(self):
        if self.__client:
            self.__client.close()
            os.kill(self.__process.pid, signal.SIGUSR1)
            self.__process.join()
            self.__client = None

    @property
    def root(self):
        assert self.__client is not None, 'Sandbox already destroyed'
        return self.__client.root


if __name__ == '__main__':
    with contextlib.closing(Sandbox()) as sandbox:
        service_adapter = sandbox.root.service_adapter
        print(service_adapter.thing(5))
