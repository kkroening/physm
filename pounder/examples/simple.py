from __future__ import print_function
from __future__ import unicode_literals

from gevent import monkey
monkey.patch_all()

import gevent
import pounder


def func(i):
    gevent.sleep(i / 10.)
    if i == 4:
        raise Exception('oops')
    return i


if __name__ == '__main__':
    items = pounder.pound(func, range(10), show_progress=True)
    print(items)
