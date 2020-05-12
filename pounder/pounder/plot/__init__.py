# TODO: possibly move this to caliper repo.
from __future__ import absolute_import, print_function, unicode_literals

import matplotlib
matplotlib.use('Agg')  # FIXME: only do this in __main__.py.

from matplotlib import pyplot as plt
import argparse
import numpy as np
import pandas as pd
import sys


def hist(series, bin_count=10, normalize=True):
    mapping, bins = pd.cut(series, bins=bin_count, include_lowest=True, right=False, retbins=True)
    bin_midpoints = pd.Series((bins[:-1] + bins[1:]) / 2.)  # find midpoints of bins.
    counts = mapping.value_counts(sort=False).reset_index(drop=True)
    if normalize:
        bin_sizes = np.ediff1d(bins)
        counts /= bin_sizes
    return pd.concat([bin_midpoints, counts], axis=1, ignore_index=False, keys=[counts.name, 'rate'])


def plot(data, out_file=None):
    start_times = pd.to_datetime(data['start_time'])
    end_times = pd.to_datetime(data['end_time'])
    min_start = start_times.min()
    start_seconds = (start_times - min_start).map(lambda x: x.total_seconds())
    end_seconds = (end_times - min_start).map(lambda x: x.total_seconds())

    fig, axes = plt.subplots(nrows=2, ncols=2, figsize=(20, 10))

    #data.groupby('status')['duration'].hist(ax=axes[0, 0], bins=20, stacked=True)
    data['duration'].hist(ax=axes[0, 0], bins=20)
    axes[0, 0].set_title('Duration');

    data['status'].value_counts().plot(ax=axes[0, 1], kind='bar')
    axes[0, 1].set_title('Status codes')

    hist(start_seconds, 50).set_index('start_time').plot(ax=axes[1, 0])
    axes[1, 0].set_title('Items started per sec')

    hist(end_seconds, 50).set_index('end_time').plot(ax=axes[1, 1])
    axes[1, 1].set_title('Items finished per sec')

    if out_file is not None:
        fig.savefig(out_file)

    return fig


def main():
    parser = argparse.ArgumentParser(description='Plot pounder benchmark CSV result graphs to image file')
    parser.add_argument('input', type=argparse.FileType('r'), help='Input csv filename (`-` for stdin)')
    parser.add_argument('output', type=argparse.FileType('w'), default=sys.stdout,
        help='Output filename (e.g. `out.png`)')

    args = parser.parse_args()
    data = pd.read_csv(args.input)
    plot(data, args.output)
