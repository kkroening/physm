from __future__ import absolute_import
from __future__ import print_function

import matplotlib
matplotlib.use("Agg")

import argparse
import numpy as np
import pandas as pd
import sys


parser = argparse.ArgumentParser(description='Process CSV stream using Pandas')
parser.add_argument('cmd', help='Pandas command (e.g. "df.iloc[0:5]")')
parser.add_argument('--input', nargs='?', type=argparse.FileType('r'), default=sys.stdin)
parser.add_argument('--output', nargs='?', type=argparse.FileType('w'), default=sys.stdout)
parser.add_argument('--keep-index', action='store_true', help='Keep index column')
parser.add_argument('--plot-file', default='plot.png', help='Default output plot file')


def hist(series, bin_count=10, normalize=True):
    mapping, bins = pd.cut(series, bins=bin_count, include_lowest=True, right=False, retbins=True)
    bin_midpoints = pd.Series((bins[:-1] + bins[1:]) / 2.)  # find midpoints of bins.
    counts = mapping.value_counts(sort=False).reset_index(drop=True)
    if normalize:
        bin_sizes = np.ediff1d(bins)
        counts /= bin_sizes
    return pd.concat([bin_midpoints, counts], axis=1, ignore_index=False, keys=[counts.name, 'count'])


def main():
    args = parser.parse_args()
    df = pd.read_csv(args.input)
    result = eval(args.cmd)
    if isinstance(result, (pd.DataFrame, pd.Series)):
        result.to_csv(args.output, index=args.keep_index)
    elif 'AxesSubplot' in str(type(result)):
        result.get_figure().savefig(args.plot_file)
    else:
        print(result)


if __name__ == '__main__':
    main()
