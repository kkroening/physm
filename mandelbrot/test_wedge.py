import numpy as np
import pytest
import tensorflow as tf
import wedge


sample_float1 = 3.14

sample_floats2 = [3.14, -5.6]
sample_floats3 = [[3.14, -5.6], [13.2, -100.0], [0.7, -0.2]]

sample_shapes = [(), (3,), (2, 3), (2, 3, 4)]

sample_dtype = wedge.DEFAULT_DTYPE
sample_base = wedge.get_base(sample_dtype)
sample_nparts = wedge.DEFAULT_NPARTS
sample_min = tf.cast(0, sample_dtype)
sample_max = sample_base - 1


def RandomTensorFactory(shape, seed=None):
    seed1 = seed
    seed2 = seed1 + 1 if seed1 is not None else None
    mantissa = tf.random.uniform(shape, -1, 1, seed=seed1)
    exponent = tf.random.uniform(shape, -30, 10, seed=seed2)
    return mantissa * 2 ** exponent


def test_chomp_morsel__shape0():
    assert wedge._chomp_morsel(sample_min) == sample_min
    assert wedge._chomp_morsel(sample_min + 1) == sample_min
    assert wedge._chomp_morsel(sample_base) == tf.cast(1, sample_dtype)
    assert wedge._chomp_morsel(5 * sample_base) == tf.cast(5, sample_dtype)


def test_chomp_morsel__shape1():
    input = tf.convert_to_tensor([sample_min, 5 * sample_base])
    expected = tf.convert_to_tensor([sample_min, 5])
    actual = wedge._chomp_morsel(input)
    assert tf.reduce_all(actual == expected)


@pytest.mark.parametrize(
    'input,expected',
    [
        (
            [sample_max] * (sample_nparts - 1) + [2.0],
            [sample_min] * (sample_nparts - 1) + [3.0],
        ),
        (
            [sample_max, 33.0] + [sample_max] * (sample_nparts - 3) + [2.0],
            [sample_min, 34.0] + [sample_max] * (sample_nparts - 3) + [2.0],
        ),
    ],
)
def test_micro_increment(input, expected):
    input = tf.convert_to_tensor(input)
    expected = tf.convert_to_tensor(expected)
    actual = wedge._micro_increment(input)
    assert tf.reduce_all(actual == expected)


def test_negate():
    # TODO
    pass


@pytest.mark.parametrize(
    'input,expected',
    [
        (sample_float1, tf.convert_to_tensor([0.0, 1804.0, 573.0, 3.0])),
        (
            tf.convert_to_tensor(sample_floats2),
            tf.convert_to_tensor(
                [
                    [0.0000000e00, 0.0000000e00],
                    [1.8040000e03, 1.6400000e03],
                    [5.7300000e02, 1.6384004e03],
                    [3.0000000e00, 4.0903999e03],
                ]
            ),
        ),
        (
            sample_floats3,
            [
                [
                    [0.0000000e00, 0.0000000e00],
                    [0.0000000e00, 0.0000000e00],
                    [0.0000000e00, 3.0720000e03],
                ],
                [
                    [1.8040000e03, 1.6400000e03],
                    [8.1600000e02, 0.0000000e00],
                    [8.1900000e02, 3.2767500e03],
                ],
                [
                    [5.7300000e02, 1.6384004e03],
                    [8.1900000e02, 0.0000000e00],
                    [2.8670000e03, 3.2768000e03],
                ],
                [
                    [3.0000000e00, 4.0903999e03],
                    [1.3000000e01, 3.9960000e03],
                    [0.0000000e00, 4.0958000e03],
                ],
            ],
        ),
    ],
)
def test_from_float(input, expected):
    input = tf.convert_to_tensor(input)
    actual = wedge.from_float(input)
    # tf.debugging.assert_near(actual, expected)


@pytest.mark.parametrize(
    'input,expected',
    [
        (sample_float1, False),
        (sample_floats2, [False, True]),
        (sample_floats3, [[False, True]]),
    ],
)
def test_get_sign(input, expected):
    w = wedge.from_float(input)
    actual = wedge.get_sign(w)
    assert tf.reduce_all(actual == expected)


@pytest.mark.parametrize(
    'input',
    [
        sample_float1,
        tf.convert_to_tensor(sample_float1),
        tf.convert_to_tensor(sample_floats2),
    ],
)
def test_to_float(input):
    input = tf.convert_to_tensor(input)
    output = wedge.to_float(wedge.from_float(input))
    assert np.isclose(input.numpy(), output.numpy(), rtol=0.05).all()


@pytest.mark.parametrize('shape', sample_shapes)
def test_add(shape):
    for i in range(10):
        input1 = RandomTensorFactory(shape)
        input2 = RandomTensorFactory(shape)
        parts1 = wedge.from_float(input1)
        parts2 = wedge.from_float(input2)
        parts3 = wedge.add(parts1, parts2)
        assert np.isclose(
            wedge.to_float(parts1).numpy(), input1.numpy(), rtol=0.05, atol=0.05
        ).all()
        assert np.isclose(
            wedge.to_float(parts2).numpy(), input2.numpy(), rtol=0.05, atol=0.05
        ).all()
        expected = input1 + input2
        actual = wedge.to_float(parts3)
        assert np.isclose(actual.numpy(), expected.numpy(), rtol=0.05, atol=0.05).all()


@pytest.mark.parametrize('shape', sample_shapes)
def test_multiply(shape):
    for i in range(10):
        input1 = RandomTensorFactory(shape)
        input2 = RandomTensorFactory(shape)
        parts1 = wedge.from_float(input1)
        parts2 = wedge.from_float(input2)
        parts3 = wedge.multiply(parts1, parts2)
        assert np.isclose(
            wedge.to_float(parts1).numpy(), input1.numpy(), rtol=0.05, atol=0.05
        ).all()
        assert np.isclose(
            wedge.to_float(parts2).numpy(), input2.numpy(), rtol=0.05, atol=0.05
        ).all()
        expected = (input1 * input2) % sample_base
        expected = tf.where(
            expected > sample_base // 2, expected - sample_base, expected
        )
        actual = wedge.to_float(parts3)
        assert np.isclose(actual.numpy(), expected.numpy(), rtol=0.05, atol=0.05).all()
