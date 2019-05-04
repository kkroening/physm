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

def rotate(scale, count):
    index = count % len(scale)
    return scale[index:] + scale[:index]

def modulate_up(scale):
    return sharpen_one(rotate(scale, 4), -1)

def modulate_down(scale):
    return rotate(flatten_one(scale, -1), -4)

def format_scale(scale):
    formatted_notes = ['{:3s}'.format(x) for x in scale]
    prefix = '*' if scale[0] == C_MAJOR[0] else ' '
    scale_name = '{:2s} major:'.format(scale[0])
    return '  '.join([prefix, scale_name] + formatted_notes)

def rank(scale):
    tonic = scale[0]
    base = float(ord(tonic[0]) - ord('A'))
    delta = {'#': 1, 'b': -1}.get(tonic[-1], 0)
    return base + delta * 0.01 * len(tonic)


scale = [flatten(x) for x in C_MAJOR]
scales = []
while scale[0] != 'B#':
    scale = modulate_up(scale)
    scales.append(scale)

sorted_scales = sorted(scales, key=rank)


print('Circle of fifths scales:')
for scale in scales:
    print(format_scale(scale))

print('')
print('Sorted scales:')
for scale in sorted_scales:
    print(format_scale(scale))
