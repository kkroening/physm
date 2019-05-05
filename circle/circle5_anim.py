import sys
import time

try:
    import colorama
    colorama.init()
    COLOR_RED = colorama.Back.RED
    COLOR_RESET = colorama.Style.RESET_ALL
except ImportError:
    # Fallback in case colorama isn't installed.  May not work on Windows.
    COLOR_RED = '\x1b[41m'
    COLOR_RESET = '\x1b[0m'


C_MAJOR = ['C', 'D', 'E', 'F', 'G', 'A', 'B']


def sharpen(note):
    return note[:-1] if note.endswith('b') else note + '#'


def flatten(note):
    return note[:-1] if note.endswith('#') else note + 'b'


def flatten_one(scale, index):
    scale = scale.copy()
    scale[index] = flatten(scale[index])
    return scale


def sharpen_one(scale, index):
    scale = scale.copy()
    index = index % len(scale)
    scale[index] = sharpen(scale[index])
    return scale


def shift(scale, count):
    index = count % len(scale)
    return scale[index:] + scale[:index]


def modulate_up(scale):
    return sharpen_one(shift(scale, 4), -1)


def modulate_down(scale):
    return shift(flatten_one(scale, -1), -4)


def format_scale(scale, highlight_index=None, offset=0, include_name=True):
    fmt_notes = ['{:3s}'.format(x) for x in scale]
    prefix = '*' if scale == C_MAJOR and include_name else ' '
    prefix += ' ' * offset
    if highlight_index is not None:
        fmt_notes[highlight_index] = '{}{}{}'.format(
            COLOR_RED, fmt_notes[highlight_index], COLOR_RESET)
    scale_name = '{:2s} major:'.format(scale[0])
    if not include_name:
        scale_name = ' ' * len(scale_name)
    return '  '.join([prefix, scale_name] + fmt_notes)


def rank(scale):
    tonic = scale[0]
    base = float(ord(tonic[0]) - ord('A'))
    delta = {'#': 1, 'b': -1}.get(tonic[-1], 0)
    return base + delta * 0.01 * len(tonic)


def main(speed=5.):
    print()

    scale = C_MAJOR
    scale = [flatten(x) for x in scale]
    while scale[0] != 'B#':
        sys.stderr.write('\r' + format_scale(scale))
        print()
        time.sleep(1. / speed)
        sys.stderr.write('\r' + format_scale(scale, include_name=False) + '\r')
        time.sleep(1.5 / speed)
        for j in range(5):
            tmp_scale = shift(sharpen_one(scale, 3), j)
            offset_max = 4 if j != 0 else 0
            for k in range(offset_max, -1, -1):
                sys.stderr.write('\r' + format_scale(tmp_scale, 3-j, k, include_name=False) + ' \r')
                if j == 0 and k == 0:
                    time.sleep(1.5 / speed)
                time.sleep(0.1 / speed)
        scale = modulate_up(scale)
        sys.stderr.write('\r' + format_scale(scale) + '\r')
        time.sleep(1. / speed)

    print()
    print()

    time.sleep(1.)


main()
