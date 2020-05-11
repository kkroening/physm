from __future__ import print_function
from builtins import input
import Pyro4
import socket
import sys


sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)

server_address = 'thing.sock'
sock.connect(server_address)


#uri = input("What is the Pyro uri of the greeting object? ").strip()
name = input("What is your name? ").strip()

greeting_maker = Pyro4.Proxy('stupid', connected_socket=sock)
print(greeting_maker.get_fortune(name))
