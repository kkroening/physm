from __future__ import absolute_import
from __future__ import division
from __future__ import print_function
from __future__ import unicode_literals

from builtins import range
from itertools import islice, count
import actorgraph as ag
import goless
import operator

str = type('')


def _dummy_actor_func(in_ch, out_ch):
    pass


def _chunks(l, n):
    if hasattr(l, '__len__'):
        for i in range(0, len(l), n):
            yield l[i:i+n]
    else:
        for i in count():
            more = list(islice(l, n))
            if len(more) != 0:
                yield more
            else:
                break


def test_fluent_equality():
    def dummy_actor_func2(in_ch, out_ch):
        pass
    base1 = ag.input()
    base2 = ag.input()
    a1 = base1.actor(_dummy_actor_func)
    a2 = base1.actor(_dummy_actor_func)
    a3 = base1.map(dummy_actor_func2)
    a4 = base2.map(_dummy_actor_func)
    assert a1 == a2
    assert a1 != a3
    assert a1 != a4


def test_repr():
    in_ = ag.input()
    a = in_.actor(_dummy_actor_func)
    c0 = a[0]
    c1 = a['foo']
    assert repr(in_) == 'input(id={!r}) <{}>'.format(in_._id, in_._short_hash)
    assert repr(a) == 'actor({!r}, input_names=[0]) <{}>'.format(_dummy_actor_func, a._short_hash)
    assert repr(c0) == 'channel(id=0) <{}>'.format(c0._short_hash)
    assert repr(c1) == "channel(id={!r}) <{}>".format('foo', c1._short_hash)


def test_transplant():
    def dummy_actor_func(in_ch, out_ch):
        pass
    in1 = ag.input()
    in2 = ag.input()
    a1 = ag.actor(in1, dummy_actor_func)
    a2 = ag.actor(in2, dummy_actor_func)
    assert a1.transplant([in2]) == a2


def test_actor_single_input_single_output():
    def actor_func(in_ch, out_ch):
        msg = in_ch.recv()
        out_ch.send(msg.lower())
        out_ch.close()

    in_ = ag.input()
    actor = in_.actor(actor_func)
    feed_list = ['Test1']
    assert ag.run(actor[0], feed_list) == ['test1']
    assert ag.run(actor['out'], feed_list) == ['test1']


def test_actor_no_input_single_output():
    def actor_func(out_ch):
        out_ch.send('test1')
        out_ch.close()

    actor = ag.actor(actor_func)
    assert ag.run(actor[0]) == ['test1']
    assert ag.run(actor['out']) == ['test1']


def test_actor_indexed_channels():
    def actor_func(in1_ch, in2_ch, out1_ch, out2_ch):
        msg1 = in1_ch.recv()
        msg2 = in2_ch.recv()
        out1_ch.send(msg1.lower())
        out1_ch.send(msg2.lower())
        out2_ch.send(msg1.upper())
        out2_ch.send(msg2.upper())
        out1_ch.close()
        out2_ch.close()

    in1 = ag.input()
    in2 = ag.input()
    actor = ag.actor(in1, in2, actor_func)
    out1 = actor[0]
    out2 = actor[1]
    in2_ch = goless.chan(1)
    in2_ch.send('test2')
    in2_ch.close()
    assert ag.run([out1, out2], {in1: ['test1'], in2: in2_ch}) == [['test1', 'test2'], ['TEST1', 'TEST2']]


def test_map():
    in_ = ag.input()
    out = in_.map(type('').lower)
    assert ag.run(out, {in_: ['Test']}) == ['test']


def test_chained_map():
    in_ = ag.input()
    out = (in_
        .map(str.upper)
        .map(lambda x: x + ' changed')
        .map(str.swapcase)
    )
    assert ag.run(out, {in_: ['Test']}) == ['test CHANGED']


def test_merge():
    in1 = ag.input()
    in2 = ag.input()
    out = ag.merge(in1, in2).map(str.lower)
    inputs = {in1: ['Test1'], in2: ['Test2']}
    assert sorted(ag.run(out, inputs)) == ['test1', 'test2']


def test_reduce():
    in_ = ag.input()
    out = (in_
        .reduce(operator.add)
    )
    assert ag.run(out, {in_: ['example1', 'example2']}) == ['example1example2']


def test_reduce_none():
    in_ = ag.input()
    out = (in_
        .reduce(operator.add)
    )
    assert ag.run(out, {in_: []}) == [None]


def test_decode():
    pass  # FIXME


def test_exec():
    in_ = ag.input()
    out = (in_
        .encode('utf-8')
        .exec_(['tr', '[:lower:]', '[:upper:]'])
        .stdout
        .decode('utf-8')
        .reduce(operator.add)
    )
    assert ag.run(out, {in_: ['example1', 'example2']}) == ['EXAMPLE1EXAMPLE2']


def test_buffer():
    in_ = ag.input()
    out = (in_
        .map(list)
        .buffer(operator.add, lambda x: _chunks(x, 4))
        .map(''.join)
    )
    assert ag.run(out, {in_: ['123', '45', '6789abcde', '']}) == [
        '1234',
        '5678',
        '9abc',
        'de',
    ]


def test_buffer_no_remainder():
    in_ = ag.input()
    out = (in_
        .map(list)
        .buffer(operator.add, lambda x: _chunks(x, 4), send_remainder=False)
        .map(''.join)
    )
    assert ag.run(out, {in_: ['123', '45', '6789abcde', '']}) == [
        '1234',
        '5678',
        '9abc',
    ]


def test_split():
    in_ = ag.input()
    out = in_.split('\n')
    assert ag.run(out, {in_: ['abc', 'de\n', 'fg\n\nh\ni', '\n']}) == [
        'abcde',
        'fg',
        '',
        'h',
        'i'
    ]


def test_exec_multi_output():
    in_ = ag.input()
    p = in_.exec_(['tr', '[:lower:]', '[:upper:]'])
    #out1 = (p
    #    .stdout
    #    .decode('utf-8')
    #    .reduce(operator.add)
    #)
    #out2 = (p
    #    .stderr
    #    .reduce(prefix_lines)
    #    .by_chunk(lambda x: x.split('\n')))
    #assert ag.run(out1, {in_: ['example1', 'example2']}) == ['EXAMPLE1EXAMPLE2']


#def test_filter():
#    in_ = ag.input()
#    out = in_.filter(lambda x: x.startswith('keep'))
#    inputs = {in_: ['keep me1', 'drop me2', 'keep me3', 'drop me4']}
#    assert ag.run(out, inputs) == ['keep me 1', 'keep me 3']


#def _generate_video(width, height, frame_count):
#    red = np.zeros([width, height, 1])
#    green = np.concatenate([np.arange(0, 1, 1.0 / width).reshape([width, 1])] * height) \
#        .reshape(width, height, 1)
#    blue = np.concatenate([np.arange(0, 1, 1.0 / height).reshape([height, 1])] * width) \
#        .transpose() \
#        .reshape(width, height, 1)
#    image = np.concatenate((red, green, blue), axis=2) * 256.0
#    images = [image.reshape([1, width, height, 3]) * i / float(frame_count - 1) for i in range(frame_count)]
#    return np.concatenate(images).astype('uint8')
#
#
#def _process_frame(frame):
#    width, height, _ = frame.shape
#    for x in range(width):
#        for y in range(height):
#            pixel = frame[x, y, :]
#            r, g, b = pixel
#            pixel.flat = g, r, b
#
#
#def _process_frames(frames):
#    frame_count, width, height, _ = frames.shape
#    for i in range(frame_count):
#        _process_frame(frames[i,:,:,:])
#    return frames
#
#
#def test_ffmpeg_pipeline():
#    width = 64
#    height = 64
#    frame_size = width * height * 3
#    frame_count = 10
#
#    in_frames = _generate_video(width, height, frame_count)
#    expected_frames = _process_frames(in_frames.copy())
#
#    ffmpeg_stdin = ffmpeg.input(
#        'pipe:0',
#        format='rawvideo',
#        pixel_format='rgb24',
#        video_size=(width, height),
#        framerate=10
#    )
#    ffmpeg_out1a = ffmpeg_stdin.output('pipe:1', format='rawvideo')
#    ffmpeg_out1b = ffmpeg_stdin.output('in.mp4', pix_fmt='yuv420p', overwrite_output=True)
#    ffmpeg_out1 = ffmpeg.merge_outputs(ffmpeg_out1a, ffmpeg_out1b)
#    ffmpeg_out2a = ffmpeg_stdin.output('pipe:1', format='rawvideo')
#    ffmpeg_out2b = ffmpeg_stdin.output('out.mp4', pix_fmt='yuv420p', overwrite_output=True)
#    ffmpeg_out2 = ffmpeg.merge_outputs(ffmpeg_out2a, ffmpeg_out2b)
#
#    actual_frames = (ag
#        .input()
#        .exec_(ffmpeg_out1.get_args())
#        .stdout()
#        .by_chunk(frame_size)
#        .map(lambda x: np.frombuffer(x, np.dtype('uint8')))
#        .map(lambda x: x.reshape([width, height, 3]))
#        .map(_process_frame)
#        .exec_(ffmpeg_out2.get_args())
#        .stdout()
#        .map(lambda x: np.frombuffer(x, np.dtype('uint8')))
#        .map(lambda x: x.reshape([frame_count, width, height, 3]))
#        .run()
#    )
#
#    assert np.array_equal(expected_frames, actual_frames)


#
#def test_ffmpeg_pipeline2():
#    (ffmpeg
#        .input(
#            data=in_frames.tobytes(),
#            format='rawvideo',
#            pixel_format='rgb24',
#            video_size=(width, height),
#            framerate=10
#        )
#        .map_frames(_process_frame)
#        .output('out.mkv')
#    )


#def test_
#    (ag
#        .from_text(in_frames.tobytes())
#        .ffmpeg()
#        .input(format='rawvideo', pixel_format='rgb24', video_size=(64, 64)) \
#        .map_frames(process_frame)  # has to keep track of frame size somehow.  could require `video_size` to be
#                                    # specified above or params or have auto-detect
#        .output(pix_fmt='yuv420p', format='mp4')
#        .to_


#def test_gevent_ffmpeg_pipeline_non_fluent():
#    width = 64
#    height = 64
#    frame_size = width * height * 3
#    frame_count = 10
#
#    def generate_video(width, height, frame_count):
#        red = np.zeros([width, height, 1])
#        green = np.concatenate([np.arange(0, 1, 1.0 / width).reshape([width, 1])] * height) \
#            .reshape(width, height, 1)
#        blue = np.concatenate([np.arange(0, 1, 1.0 / height).reshape([height, 1])] * width) \
#            .transpose() \
#            .reshape(width, height, 1)
#        image = np.concatenate((red, green, blue), axis=2) * 256.0
#        images = [image.reshape([1, width, height, 3]) * i / float(frame_count - 1) for i in range(frame_count)]
#        return np.concatenate(images).astype('uint8')
#
#    def write_raw_video_as_mp4(frames, filename):
#        fileout_ffmpeg_args = stdin_ffmpeg_args + ['-pix_fmt', 'yuv420p', '-y']
#        p = subprocess.Popen(fileout_ffmpeg_args + [filename], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
#            stderr=subprocess.PIPE)
#        p.stdin.write(frames.tobytes())
#        p.stdin.close()
#        p.wait()
#
#    in_frames = generate_video(width, height, frame_count)
#
#    stdin_ffmpeg_args = ['ffmpeg', '-f', 'rawvideo', '-pixel_format', 'rgb24', '-video_size',
#        '{}x{}'.format(width, height), '-framerate', '10', '-i', 'pipe:0']
#    stdout_ffmpeg_args = stdin_ffmpeg_args + ['-f', 'rawvideo', 'pipe:1']
#    p1 = subprocess.Popen(stdout_ffmpeg_args, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
#    p2 = subprocess.Popen(stdout_ffmpeg_args, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
#
#    def process_frame(frame):
#        pixels = frame.reshape([width * height, 3])
#        pixels = [pixels[i,:] for i in range(width * height)]
#        for pixel in pixels:
#            r, g, b = pixel
#            pixel.flat = g, r, b
#
#    expected_frames = in_frames.copy()
#    for i in range(frame_count):
#        process_frame(expected_frames[i,:,:,:])
#
#    def feed_input():
#        data = in_frames.tobytes()
#        print 'feed_input: starting'
#        p1.stdin.write(data)
#        print 'feed_input: wrote {} bytes'.format(len(data))
#        p1.stdin.close()
#        print 'feed_input: done'
#
#    def process_frames():
#        print 'process_frames: starting'
#        processed = 0
#        while True:
#            frame_buf = bytearray(p1.stdout.read(frame_size))
#            if not frame_buf:
#                break
#            frame = np.frombuffer(frame_buf, np.dtype('uint8')).reshape([width, height, 3])
#            process_frame(frame)
#            p2.stdin.write(frame.tobytes())
#            processed += len(frame_buf)
#        p2.stdin.close()
#        print 'process_frames: processed {} bytes'.format(processed)
#        print 'process_frames: done'
#
#    def feed_output():
#        print 'feed_output: starting'
#        data = p2.stdout.read()
#        print 'feed_output: done'
#        return data
#
#    print 'main: starting'
#    g1 = gevent.spawn(feed_input)
#    g2 = gevent.spawn(process_frames)
#    g3 = gevent.spawn(feed_output)
#    gevent.joinall([g1, g2, g3], raise_error=True)
#    print 'main: done'
#
#    actual_frames = np.frombuffer(g3.value, np.dtype('uint8')).reshape([frame_count, width, height, 3])
#
#    def write_debug_data():
#        with open('in.dat', 'w') as f:
#            f.write(in_frames.tobytes())
#        with open('out_expected.dat', 'w') as f:
#            f.write(expected_frames.tobytes())
#        with open('out_actual.dat', 'w') as f:
#            f.write(g3.value)
#
#        write_raw_video_as_mp4(in_frames, 'in.mp4')
#        write_raw_video_as_mp4(expected_frames, 'out_expected.mp4')
#        write_raw_video_as_mp4(actual_frames, 'out_actual.mp4')
#
#    write_debug_data()
#
#    assert np.array_equal(expected_frames, actual_frames)
