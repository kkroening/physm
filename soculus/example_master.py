import contextlib
import os
import soculus
import subprocess


@contextlib.contextmanager
def child_scope(socket_file):
    p = subprocess.Popen(['python', 'example_slave.py', socket_file])
    try:
        yield p
    finally:
        p.kill()
        p.wait()


with soculus.connection_scope(child_scope) as connection:
    master_pid = os.getpid()
    slave_pid = connection.call(os.getpid)
    print('master pid: {}'.format(master_pid))
    print('slave pid: {}'.format(slave_pid))
