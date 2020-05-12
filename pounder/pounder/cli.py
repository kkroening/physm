from __future__ import absolute_import, print_function, unicode_literals

from . import pound
import argparse
import functools


parser_args = argparse.ArgumentParser(add_help=False)
parser_args.add_argument('-r', '--rate', help='Requests per second (0 to send all requests at once)', type=float,
    default=10)
parser_args.add_argument('-R', '--ramp-time', help='Time to linearly ramp up to target rate', type=float)
parser_args.add_argument('-g', '--max-greenlets', help='Limit number of concurrent greenlets', default=None, type=int)
parser_args.add_argument('-p', '--max-processes', help='Limit number of concurrent processes', default=1, type=int)
parser_args.add_argument('-v', '--verbose', action='store_true', help='Verbose mode')
parser_args.add_argument('--progress', action='store_true', help='Show progress')


def main(parser, get_items_func, worker_func, *extra_args, **extra_kwargs):
    """Parse command-line arguments, create a set of items, and run each one in ``worker_func``.

    This is meant to simplify making command-line tools that follow a common pattern, but is a completely optional
    piece of pounder.

    Args:
        get_items_func(args): create a set of items based on command-line arguments.
        worker_func(args, item): process one item.
    """
    args = parser.parse_args()
    items = get_items_func(args)
    func = functools.partial(worker_func, args, *extra_args, **extra_kwargs)
    return pound(func, items, show_progress=args.progress, max_greenlets=args.max_greenlets, rate=args.rate)
