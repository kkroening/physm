#!/usr/bin/env python
from split_silence import split_audio
import multiprocessing
import os
import pandas as pd


SILENCE_DURATION = 0.3
SILENCE_THRESHOLD = -30
PADDING = 0.2
MIN_CHUNK_TIME = 6.
MAX_SILENCE_TIME = 0.5


chapter_count = 32
chapters = range(1, chapter_count + 1)


def process_chapter(chapter_num):
    chapter_text = 'ch{:02d}'.format(chapter_num)
    in_filename = 'orig_data/{}.mp3'.format(chapter_text)
    out_dir = os.path.join('data', chapter_text)
    out_pattern = os.path.join(out_dir, chapter_text + '_{:04d}.wav')
    metadata_filename = os.path.join('data', '{}_meta.json'.format(chapter_text))

    split_audio(
        in_filename,
        out_pattern,
        silence_threshold=SILENCE_THRESHOLD,
        silence_duration=SILENCE_DURATION,
        padding=PADDING,
        min_chunk_time=MIN_CHUNK_TIME,
        max_silence_time=MAX_SILENCE_TIME,
        metadata_filename=metadata_filename,
    )

    meta = pd.read_json(metadata_filename)
    return meta


if __name__ == '__main__':
    p = multiprocessing.Pool(5)
    metas = p.map_async(process_chapter, chapters).get()
