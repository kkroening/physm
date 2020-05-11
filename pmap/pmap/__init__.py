from __future__ import absolute_import

from .contrib.kbhit import KBHit
from .utils import indent
from datetime import datetime
from functools import partial
from multiprocessing.pool import ThreadPool
from Queue import Empty
from tqdm import tqdm
import multiprocessing
import operator
import os
import sys
import time
import traceback


DEFAULT_THREAD_COUNT = multiprocessing.cpu_count() * 2


def _identity(arg):
    return arg


def _wrap_progress(func, key_func, progress_func, item):
    key = key_func(item)
    progress_func('started', key)
    try:
        result = func(item)
        progress_func('finished', key, result)
    except Exception as e:
        progress_func('exception', key, e)
        raise
    return result


def _wrap_returns(func, arg, key_func=None):
    key_func = key_func or _identity
    try:
        data = func(arg)
        result = {'data': data}
    except Exception as e:
        result = {
            'error': {
                'exception': repr(e),
                'message': e.message,
                'traceback': traceback.format_exc()
            },
        }
    if key_func is not None:
        result['key'] = key_func(arg)
    return result


class PmapException(Exception):
    def __init__(self, results):
        messages = ['{}: {}\n{}'.format(x['key'], x['error']['message'], indent(x['error']['traceback'],
            ' '*4)) for x in results if 'error' in x]
        message = 'Encountered {} exception(s) during pmap:\n{}'.format(len(messages),
            indent('\n'.join(messages), ' '*4))
        super(PmapException, self).__init__(message)
        self.results = results

    @property
    def detail(self):
        details = []
        for i in range(len(self.results)):
            result = self.results[i]
            if 'error' in result:
                detail = 'Process {}:\n{}\n'.format(i, result['error']['traceback'])
                details.append(detail)
        return '\n'.join(details)


def _handle_progress(progress_queue, *args):
    progress_queue.put_nowait(args)




def _pmap(func, iterable, thread_count, progress_func=None, key_func=None, use_gevent=False):
    key_func = key_func or _identity
    if use_gevent or thread_count:
        if progress_func is not None:
            if use_gevent:
                import gevent.queue
                progress_queue = gevent.queue.Queue()
            else:
                manager = multiprocessing.Manager()
                progress_queue = manager.Queue()
            finished_count = 0
            func = partial(_wrap_progress, func, key_func, partial(_handle_progress, progress_queue))
            iterable = list(iterable)  # turn it into a list so we can find the length

        func = partial(_wrap_returns, func, key_func=key_func)
        if use_gevent:
            import gevent
            import gevent.pool
            pool = gevent.pool.Pool(thread_count) if thread_count else gevent.pool.Group()
            sleep_func = gevent.sleep
        else:
            #pool = Pool(thread_count)
            pool = ThreadPool(thread_count)
            sleep_func = time.sleep

        future = pool.map_async(func, iterable)

        if progress_func is not None:
            # Pump progress items through queue and feed to callback.
            while finished_count < len(iterable):
                while True:
                    try:
                        progress_args = progress_queue.get_nowait()
                        if progress_args[0] in ['finished', 'exception']:
                            finished_count += 1
                        progress_func(*progress_args)
                    except Empty:
                        break
                progress_func('waiting')
                sleep_func(0.1)
        results = future.get(9999999999999)

        errors = len([None for x in results if 'error' in x])
        if errors:
            raise PmapException(results)
        return [x['data'] for x in results]
    else:
        if progress_func is not None:
            func = partial(_wrap_progress, func, key_func, lambda *args: progress_func(*args))
        return [func(x) for x in iterable]


class Progressor(object):
    def _show_pending_items(self, now):
        sys.stderr.write('In-progress:\n')
        for key, start_time, in reversed(sorted(self._info['in_progress'].items(), key=operator.itemgetter(1))):
            sys.stderr.write('  {}    {}\n'.format(now - start_time, key))

    def _clear_bar(self):
        if self._bar is not None:
            self._bar.clear()

    def _refresh_bar(self):
        if self._bar is not None:
            self._bar.refresh()

    def _update_bar(self):
        if self._bar is not None:
            self._bar.update()

    def _handle_progress(self, status, key=None, value=None):
        now = datetime.now()
        if status == 'waiting':
            if self._kbhit.kbhit():
                c = self._kbhit.getch()
                if c == '?':
                    self._clear_bar()
                    self._show_pending_items(now)
                    self._refresh_bar()
        else:
            if status == 'started':
                if self._show_starting:
                    self._clear_bar()
                    sys.stderr.write('Starting: {}\n'.format(key))
                    self._refresh_bar()
                self._info['in_progress'][key] = now
                pass
            elif status == 'finished':
                self._info['count'] += 1
                duration = now - self._info['in_progress'][key]
                self._clear_bar()
                if self._show_starting:
                    sys.stderr.write('Completed: {} ({})\n'.format(key, duration))
                del(self._info['in_progress'][key])
                self._update_bar()
                self._refresh_bar()
            elif status == 'exception':
                self._info['count'] += 1
                del(self._info['in_progress'][key])
                self._clear_bar()
                sys.stderr.write('Exception: {} - {}'.format(key, value))
                self._update_bar()
                self._refresh_bar()

    def _do_run(self, func, items, thread_count, key_func, use_gevent):
        return _pmap(func, items, thread_count, progress_func=self._handle_progress, key_func=key_func,
            use_gevent=use_gevent)

    def __init__(self, func, items, thread_count, key_func=None, use_gevent=False, show_starting=False):
        self._bar = None
        self._show_starting = show_starting

        key_func = key_func or _identity
        self._info = {
            'count': 0,
            'in_progress': {},
        }
        if thread_count is not None or use_gevent:
            try:
                with KBHit() as kbhit:
                    with tqdm(total=len(items)) as bar:
                        self._kbhit = kbhit
                        self._bar = bar
                        return self._do_run(func, items, thread_count, key_func, use_gevent)
            finally:
                os.system('stty sane')  # FIXME: remove this hack; terminal does not get reset (at least on osx)
        else:
            return self._do_run(func, items, thread_count, key_func, use_gevent)


def pmap(func, iterable, thread_count=DEFAULT_THREAD_COUNT, key_func=None, show_progress=False):
    if show_progress:
        results = Progressor(func, iterable, thread_count)
    else:
        results = _pmap(func, iterable, thread_count, key_func=key_func)
    return results
