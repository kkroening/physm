from __future__ import absolute_import, print_function, unicode_literals

from gevent import monkey
monkey.patch_all(thread=False)

from datetime import datetime, timedelta
from tqdm import tqdm
import functools
import gevent.lock
import gevent.pool
import gevent.queue
import itertools
import logging
import multiprocess
import traceback


logging.basicConfig(level=logging.INFO, format='%(message)s')
logger = logging.getLogger(__file__)
logger.setLevel(logging.INFO)


def _log_error(item, e):
    logger.exception('Encountered error while processing item {}'.format(item))


def _wrap_progress(func, total, log_errors):
    count = [0]
    tqdm.monitor_interval = 0  # WAR for `'tqdm' object has no attribute 'miniters'` race condition; see tqdm issue 404
    progress_bar = tqdm(total=total)
    lock = gevent.lock.Semaphore()

    def wrapper(item):
        try:
            return func(item), None, None
        except Exception as e:
            if log_errors:
                with lock:
                    progress_bar.clear()
                    _log_error(item, e)
                    progress_bar.refresh()
            tb = traceback.format_exc()
            return None, e, tb
        finally:
            with lock:
                count[0] += 1
                progress_bar.update()
                if count[0] >= total:
                    progress_bar.close()
    return wrapper


def _wrap_errors(func, log_errors):
    def wrapper(item):
        try:
            return func(item), None, None
        except Exception as e:
            if log_errors:
                _log_error(item, e)
            tb = traceback.format_exc()
            return None, e, tb
    return wrapper


class PoundError(Exception):
    def __init__(self, values, exceptions, tracebacks):
        self.values = values
        self.exceptions = exceptions
        self.tracebacks = tracebacks
        messages = ['  Item {}: {}\n'.format(i, str(e)) for i, e in enumerate(exceptions) if e is not None]
        message = 'Encountered {} exception(s):\n{}'.format(len(messages), '\n'.join(messages))
        super(PoundError, self).__init__(message)


def _schedule_items(count, start_time, rate):
    delay = 1 / float(rate) if rate > 0 else 0
    return [start_time + timedelta(seconds=delay*i) for i in range(count)]


def _schedule_items_with_ramping(count, start_time, rate, ramp_time=None, ramp_bin_count=10):
    """Calculate a set of timestamps that honors a specified number of requests per second, with optional linear
    ramping.
    """
    total_count = count
    times = []
    if ramp_time is not None:
        bin_duration = ramp_time / float(ramp_bin_count)
        for bin_num in range(ramp_bin_count):
            ramp_percentage = bin_num / float(ramp_bin_count)
            bin_delay = ramp_percentage * ramp_time
            bin_start_time = start_time + timedelta(seconds=bin_delay)
            bin_rate = ramp_percentage * rate 
            bin_item_count = int(bin_duration * bin_rate)
            times += _schedule_items(bin_item_count, bin_start_time, bin_rate)
        start_time += timedelta(seconds=ramp_time)
        count -= len(times)
    times += _schedule_items(count, start_time, rate)
    return times[:total_count]


def run_gevent(func, scheduled_items, max_greenlets=None):
    gevent.monkey.patch_thread()
    pool = gevent.pool.Pool(max_greenlets) if max_greenlets is not None else gevent
    now = datetime.now()
    greenlets = []
    for item, scheduled_time in scheduled_items:
        if scheduled_time > now:
            now = datetime.now()
            gevent.sleep((scheduled_time - now).total_seconds())
        greenlets.append(pool.spawn(func, item))
    gevent.joinall(greenlets)
    return [x.value for x in greenlets]


def _divide_items(items, num_workers):
    """Divide a set of items up among a set of workers.  Each item is dished out to a worker in a round-robin
    manner.

    Example::
        In: _divide_items(range(10), 3)
        Out: [[0, 3, 6, 9], [1, 4, 7], [2, 5, 8]]
    """
    return [[items[j] for j in range(i, len(items), num_workers)] for i in range(num_workers)]


def _roundrobin(*iterables):
    """Join a set of iterables in a round-robin manner.  See `itertools recipes`_.

    Recipe credited to George Sakkis

    Example::
        In: roundrobin('ABC', 'D', 'EF')
        Out: ['A', 'D', 'E', 'B', 'F', 'C']

    .. _itertools recipes: https://docs.python.org/2/library/itertools.html
    """
    pending = len(iterables)
    nexts = itertools.cycle(iter(it).next for it in iterables)
    while pending:
        try:
            for next in nexts:
                yield next()
        except StopIteration:
            pending -= 1
            nexts = itertools.cycle(itertools.islice(nexts, pending))


def run_ppool(func, scheduled_items, max_processes=None, max_greenlets=None):
    num_processes = min(max_processes, len(scheduled_items))
    scheduled_items_per_process = _divide_items(scheduled_items, num_processes)
    pool = multiprocess.Pool(processes=max_processes)
    worker_func = functools.partial(run_gevent, func, max_greenlets=max_greenlets)
    boxed_values_per_process = pool.map_async(worker_func, scheduled_items_per_process).get(99999999999)
    boxed_values = _roundrobin(*boxed_values_per_process)
    return list(boxed_values)


def pound(func, items, rate=None, ramp_time=None, max_greenlets=None, max_processes=1, show_progress=False,
        count=None, log_errors=True):
    count = count or len(items)
    if show_progress:
        func = _wrap_progress(func, count, log_errors)
    else:
        func = _wrap_errors(func, log_errors)

    now = datetime.now()
    scheduled_times = _schedule_items_with_ramping(count, now, rate, ramp_time)
    scheduled_items = zip(items, scheduled_times)

    if max_processes > 1:
        boxed_values = run_ppool(func, scheduled_items, max_processes, max_greenlets)
    else:
        boxed_values = run_gevent(func, scheduled_items, max_greenlets)

    values = [value for value, _, _ in boxed_values]
    errors = [error for _, error, _ in boxed_values]
    tracebacks = [traceback for _, _, tracebacks in boxed_values]
    if any(errors):
        raise PoundError(values, errors, tracebacks)
    return values


from .cli import parser_args, main

__all__ = [
    'logger',
    'main',
    'parser_args',
    'pound',
    'PoundError',
]
