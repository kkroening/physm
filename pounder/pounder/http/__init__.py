from __future__ import print_function
from __future__ import unicode_literals

from gevent import monkey
monkey.patch_all(thread=False)

from ..cli import parser_args as base_parser_args
from caliper import Benchmark
import argparse
import functools
import logging
import multiprocessing
import pounder
import requests
import socket

try:
    from StringIO import StringIO
except ImportError:
    from io import StringIO


LOG_FORMAT = '%(asctime)s:%(levelname)s:%(name)s:%(message)s'


parser_args = argparse.ArgumentParser(add_help=False, parents=[base_parser_args])
parser_args.add_argument('url')
parser_args.add_argument('-n', '--num-requests', help='Number of requests', type=int, required=True)
parser_args.add_argument('-b', '--body', help='HTTP POST/PUT body')
parser_args.add_argument('-m', '--method', help='HTTP request method', default='GET',
    choices=['GET', 'POST', 'PUT', 'DELETE', 'HEAD', 'OPTIONS'])
parser_args.add_argument('-H', '--header', help='Custom HTTP header', action='append', default=[])
parser_args.add_argument('-t', '--timeout', help='HTTP timeout in seconds', default=60, type=int)
parser_args.add_argument('--show-pid', help='Show PID column', action='store_true')
parser_args.add_argument('--show-hostname', help='Show hostname column', action='store_true')

parser = argparse.ArgumentParser(
    description='Pound HTTP endpoint',
    formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    parents=[parser_args],
)


def _parse_header_line(header):
    key, _, value = header.partition(':')
    return key, value[1:]


def _run_worker(args, headers, benchmark, item):
    with requests.Session() as session:
        kwargs = {}
        if args.show_pid:
            kwargs['pid'] = multiprocessing.current_process().pid
        if args.show_hostname:
            kwargs['hostname'] = socket.gethostname()
        with benchmark.http_scope(session, **kwargs):
            func = getattr(session, args.method.lower())
            kwargs = {}
            if args.body is not None:
                kwargs['data'] = args.body
            return func(args.url, headers=headers, timeout=args.timeout, **kwargs)


def main(args=None, parser=parser, benchmark=None):
    args = parser.parse_args(args)
    if args.verbose:
        logging.basicConfig(format=LOG_FORMAT, level=logging.DEBUG)

    benchmark = benchmark or Benchmark()
    if args.show_pid:
        benchmark.add_column('pid')
    if args.show_hostname:
        benchmark.add_column('hostname')

    headers = dict([_parse_header_line(x) for x in args.header])
    func = functools.partial(_run_worker, args, headers, benchmark)

    with benchmark:
        pounder.pound(
            func,
            range(args.num_requests),
            max_greenlets=args.max_greenlets,
            max_processes=args.max_processes,
            ramp_time=args.ramp_time,
            rate=args.rate,
            show_progress=args.progress,
        )
