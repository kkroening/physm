# actorgraph: graphs of concurrent actors

[![Build status](https://travis-ci.org/kkroening/actorgraph.svg?branch=master)](https://travis-ci.org/kkroening/actorgraph)

(Readme needs work)

## Overview

`ActorGraph` builds graph-based actor pipelines with a concise but powerful and extensible syntax.

## Quickstart

Simple string processing pipeline:
```
import actorgraph as ag

def actor_func(in_ch, out_ch):
    try:
        while True:
            line1 = in_ch.recv()
            line2 = in_ch.recv()
            out_ch.send(', '.join(line1, line2))
    except ag.ChannelClosed:
        out_ch.close()

in = ag.input()
out = (in
    .input()
    .map(str.upper)
    .map(lambda x: x + ' changed')
    .actor(actor_func)
    .map(lambda x: x + '!')
)

assert out.run({in: ['test1', 'test2', 'test3', 'test4']}) == [
    'TEST1 changed, TEST2 changed!',
    'TEST3 changed, TEST4 changed!'
]
```

## Examples

- Webcam + Social-media-feed -&gt; Preprocessing -&gt; TensorFlow -&gt; Live-stream

## Additional Resources

- [API Reference](https://kkroening.github.io/actorgraph/)
- [Tests](https://github.com/kkroening/actorgraph/blob/master/actorgraph/tests/test_actorgraph.py)
