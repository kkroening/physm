from __future__ import print_function
from builtins import object
import os
import Pyro4
import socket


class GreetingMaker(object):
    def get_fortune(self, name):
        return "Hello, {0}. Here is your fortune message:\n" \
               "Behold the warranty -- the bold print giveth and the fine print taketh away.".format(name)


server_address = 'thing.sock'
try:
    os.unlink(server_address)
except OSError:
    if os.path.exists(server_address):
        raise
sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
sock.bind(server_address)
sock.listen(1)


connection, client_address = sock.accept()
try:
    daemon = Pyro4.Daemon(connected_socket=connection)
    uri = daemon.register(Pyro4.expose(GreetingMaker), objectId='stupid')
    daemon.requestLoop()
finally:
    connection.close()
    os.unlink(server_address)

