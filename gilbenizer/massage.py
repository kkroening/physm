#!/usr/bin/env python
from multiprocessing import Pool
import argparse
import csv
import errno
import ffmpeg
import functools
import json
import logging
import os
import shutil
import subprocess
import sys
import textwrap


logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
_logger = logging.getLogger(__file__)
_logger.setLevel(logging.INFO)


DURATION_TOLERANCE = 0.01

DEFAULT_WORKER_COUNT = 20
DEFAULT_MAX_DURATION = 10.


parser = argparse.ArgumentParser('Combine speech JSON files into a single metadata.csv to be consumed by Tacotron')
parser.add_argument('--output-dir', help='Directory for output dataset')
parser.add_argument('in_filenames', nargs='+', help='List of JSON filenames')
parser.add_argument('--worker-count', default=DEFAULT_WORKER_COUNT, help='Number of parallel workers')
parser.add_argument('--max-duration', default=DEFAULT_MAX_DURATION, type=float, help='Omit clips that are longer than specified duration')
parser.add_argument('--lax', action='store_true', help='Keep going even if exceptions occur')


def _wrap_exceptions(func, arg, raise_exceptions):
    try:
        return func(arg)
    except Exception as e:
        _logger.exception(e)
        if raise_exceptions:
            raise


def _pmap(func, iterable, worker_count, raise_exceptions=True):
    """Run function in parallel using multiprocessing Pool.

    Fixes some BS around multiprocessing.Pool:
     - Log exceptions with reasonable stack traces.
     - Fix problem with ``.map`` hanging by using ``map_async`` followed by ``get``.
    """
    if worker_count <= 1:
        return map(func, iterable)
    else:
        pool = Pool(worker_count)
        wrapped = functools.partial(_wrap_exceptions, func, raise_exceptions=raise_exceptions)
        return pool.map_async(wrapped, iterable).get(99999999)


def _makedirs(path):
    """Python2-compatible version of ``os.makedirs(path, exist_ok=True)``."""
    try:
        if path:
            os.makedirs(path)
    except OSError as exc:
        if exc.errno != errno.EEXIST or not os.path.isdir(path):
            raise


def _indent(text):
    return '\n'.join(['  ' + x for x in text.splitlines()])


def _get_transcript(json_filename):
    with open(json_filename) as f:
        try:
            data = json.load(f)
        except ValueError:
            return None
    try:
        return data['results'][0]['alternatives'][0]['transcript']
    except KeyError:
        return None


def _get_duration(filename):
    duration = None
    try:
        data = ffmpeg.probe(filename)
        duration = float(data['format']['duration'])
    except ffmpeg.ProbeException as e:
        _logger.error('ffprobe failed for {}:\n{}'.format(filename, _indent(e.stderr_output)))
    except KeyError:
        _logger.error('Invalid ffprobe output: {!r}'.format(data))
    return duration


def _process_wav(src_filename, dest_filename):
    p = subprocess.Popen(
        (ffmpeg
            .input(src_filename)
            .output(dest_filename, ac=1, ar=22050)
            .overwrite_output()
            .compile()
        ),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE
    )
    out = p.communicate()
    if p.returncode != 0:
        sys.stderr.write(_indent(out[1]))
        raise Exception('fuck you')
        return False
    return True


def _process_item(json_filename, output_wavs_dir, max_duration):
    filename_base = os.path.splitext(json_filename)[0]
    clip_name = os.path.basename(filename_base)
    wav_filename = filename_base + '.wav'

    transcript = _get_transcript(json_filename)
    if transcript is None:
        _logger.warning('{} has invalid transcript'.format(clip_name))
        return None

    duration = _get_duration(wav_filename)
    if duration is None:
        return None
    elif duration > max_duration - DURATION_TOLERANCE:
        _logger.warning('Skipping clip {} with duration longer than {:.01f} seconds: {:.01f} seconds'.format(clip_name,
            max_duration, duration))
        return None

    output_wav_filename = os.path.join(output_wavs_dir, '{}.wav'.format(clip_name))
    if not os.path.exists(wav_filename):
        _logger.error('Missing audio file: {}'.format(wav_filename))
        return None
    if not _process_wav(wav_filename, output_wav_filename):
        _logger.error('Error processing {}'.format(wav_filename))
        return None

    return {
        'clip_name': clip_name,
        'duration': duration,
        'transcript': transcript,
        'wav_filename': wav_filename,
    }


def _process(json_filenames, output_wavs_dir, max_duration, worker_count, strict):
    _logger.info('Processing audio data...')
    func = functools.partial(_process_item, output_wavs_dir=output_wavs_dir, max_duration=max_duration)
    metadata = _pmap(func, json_filenames, worker_count, raise_exceptions=strict)
    metadata = [x for x in metadata if x is not None]
    return sorted(metadata, key=lambda x: x['clip_name'])


def _write_metadata(output_dir, metadata):
    metadata_filename = os.path.join(output_dir, 'metadata.csv')
    _logger.info('Writing {}...'.format(metadata_filename))
    with open(metadata_filename, 'wb') as csvfile:
        writer = csv.writer(csvfile, delimiter='|')
        for item in metadata:
            writer.writerow([item['clip_name'], item['transcript'], item['transcript']])


if __name__ == '__main__':
    args = parser.parse_args()
    output_wavs_dir = os.path.join(args.output_dir, 'wavs')
    _makedirs(output_wavs_dir)
    metadata = _process(
        args.in_filenames,
        output_wavs_dir,
        max_duration=args.max_duration,
        worker_count=args.worker_count,
        strict=not args.lax,
    )
    _write_metadata(args.output_dir, metadata)
    _logger.info('Done!')
