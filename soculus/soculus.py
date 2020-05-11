import contextlib
import dill
import logging
import os
import shutil
import socket
import sys
import tempfile
import traceback


_AUTORUN = not os.environ.get('SOCULUS_NO_AUTORUN')
_DEFAULT_SOCKET_FILE = os.environ.get('SOCULUS_RPC_SOCKET')


_logger = logging.getLogger(__name__)

_log_tag = 'server'


## FIXME: dill doesn't like this.
#class RpcException(Exception):
#    def __init__(self, e, tb_text):
#        self.exception = e
#        self.tb_text = tb_text
#        super(RpcException, self).__init__('RPC call failed: {}: {}'.format(str(e), tb_text))
def RpcException(e, tb_text):
    return Exception('RPC call failed. {}'.format(tb_text))


@contextlib.contextmanager
def _tmpdir_scope():
    tmpdir = tempfile.mkdtemp()
    try:
        yield tmpdir
    finally:
        shutil.rmtree(tmpdir)


def _send_obj(sock, obj):
    data = dill.dumps(obj)
    header = len(data).to_bytes(8, 'little')
    message = header + data
    #_logger.info('send header + {} bytes'.format(len(data)))
    sock.sendall(message)
    #_logger.info('sent')


def prnt(msg):
    print('{}: {}'.format(_log_tag, msg))


def _recvall(sock, size, none_ok=False):
    data = b''
    while size:
        more_data = sock.recv(size)
        #_logger.info('got {}'.format(len(more_data)))
        if not more_data:
            if data or not none_ok:
                raise Exception('Incomplete message; expected {} more bytes'.format(size))
            else:
                data = None
            break
        data += more_data
        size -= len(more_data)
    return data


def _recv_obj(sock, none_ok=True):
    header = _recvall(sock, 8, none_ok=none_ok)
    if header is None:
        obj = None
    else:
        size = int.from_bytes(header, 'little')
        data = _recvall(sock, size)
        obj = dill.loads(data)
    return obj


def _communicate(sock, request):
    _logger.info('sending request')
    _send_obj(sock, request)
    _logger.info('sent request')
    _logger.info('receiving response')
    response = _recv_obj(sock)
    _logger.info('received response')
    return response


def _make_rpc(sock, func):
    response = _communicate(sock, func)
    if response is None:
        raise Exception('Socket closed before receiving a response')
    success, obj = response
    if not success:
        raise obj
    else:
        return obj


@contextlib.contextmanager
def _sock_scope(child_scope):
    with _tmpdir_scope() as tmpdir:
        socket_file = os.path.join(tmpdir, 'sock')
        sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        with contextlib.closing(sock):
            sock.bind(socket_file)
            sock.listen(1)
            with child_scope(socket_file):
                child_sock, client_address = sock.accept()
                with contextlib.closing(child_sock):
                    yield child_sock


class Connection(object):
    def __init__(self, sock):
        self._sock = sock

    def call(self, func):
        return _make_rpc(self._sock, func)


@contextlib.contextmanager
def connection_scope(child_scope):
    with _sock_scope(child_scope) as connection:
        yield Connection(connection)


def run_connector(socket_file=_DEFAULT_SOCKET_FILE):
    _logger.info('connector started')
    sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    try:
        sock.connect(socket_file)
    except socket.error as msg:
        # TODO: generalize this behavior for other applications.
        print(msg)
        sys.exit(1)

    with contextlib.closing(sock):
        while True:
            _logger.info('receiving request')
            func = _recv_obj(sock)
            _logger.info('received request')
            if func is None:
                break
            try:
                result = func()
                success = True
            except Exception as e:
                result = RpcException(e, traceback.format_exc())
                success = False
            response = (success, result)
            _logger.info('sending response')
            _send_obj(sock, response)
            _logger.info('sent response')

    _logger.info('connector finished')


if __name__ == '__main__' or _AUTORUN:
    if _DEFAULT_SOCKET_FILE:
        del os.environ['SOCULUS_RPC_SOCKET']  # FIXME: prevents double-loading.
        _log_tag = 'client'
        run_connector(_DEFAULT_SOCKET_FILE)
