#!/usr/bin/env python
'''
A Python class implementing KBHIT, the standard keyboard-interrupt poller.
Works transparently on Windows and Posix (Linux, Mac OS X).  Doesn't work
with IDLE.

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Lesser General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.


Adapted from http://home.wlu.edu/~levys/software/kbhit.py
- Added __enter__ and __exit__ methods.
- Added stdin tty detection
- Clean up code
'''

import os

# Windows
if os.name == 'nt':
    import msvcrt

# Posix (Linux, OS X)
else:
    from select import select
    import atexit
    import sys
    import termios


class KBHit:
    def __init__(self):
        self._enabled = sys.stdin.isatty()
        if self._enabled:
            if os.name == 'nt':
                self._enabled = False
            else:
                # Save the terminal settings
                self.fd = sys.stdin.fileno()
                self.old_term = termios.tcgetattr(self.fd)
                new_term = self.old_term

                # New terminal setting unbuffered
                new_term[3] = (new_term[3] & ~termios.ICANON & ~termios.ECHO)
                termios.tcsetattr(self.fd, termios.TCSAFLUSH, new_term)

                # Support normal-terminal reset at exit
                atexit.register(self.reset)

    def reset(self):
        if self._enabled and os.name != 'nt':
            termios.tcsetattr(self.fd, termios.TCSAFLUSH, self.old_term)
        self._enabled = False

    def getch(self):
        ''' Returns a keyboard character after kbhit() has been called.
            Should not be called in the same program as getarrow().
        '''
        if not self._enabled:
            return None
        elif os.name == 'nt':
            return msvcrt.getch().decode('utf-8')
        else:
            return sys.stdin.read(1)

    def getarrow(self):
        ''' Returns an arrow-key code after kbhit() has been called. Codes are
        0 : up
        1 : right
        2 : down
        3 : left
        Should not be called in the same program as getch().
        '''
        if not self._enabled:
            return False
        elif os.name == 'nt':
            msvcrt.getch() # skip 0xE0
            c = msvcrt.getch()
            vals = [72, 77, 80, 75]
        else:
            c = sys.stdin.read(3)[2]
            vals = [65, 67, 66, 68]
        return vals.index(ord(c.decode('utf-8')))

    def kbhit(self):
        ''' Returns True if keyboard character was hit, False otherwise.
        '''
        if not self._enabled:
            return False
        elif os.name == 'nt':
            return msvcrt.kbhit()
        else:
            dr,dw,de = select([sys.stdin], [], [], 0)
            return dr != []

    def __enter__(self):
        return self

    def __exit__(self, type, value, traceback):
        self.reset()


# Test
if __name__ == "__main__":
    import time
    print('Hit any key, or ESC to exit')

    with KBHit() as kb:
        while True:
            if kb.kbhit():
                c = kb.getch()
                if ord(c) == 27: # ESC
                    break
                print(c)
            time.sleep(0.1)
