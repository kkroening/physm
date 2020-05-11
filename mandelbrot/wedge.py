import tensorflow as tf


DEFAULT_NPARTS = 4
DEFAULT_DTYPE = tf.float32


float_dtypes = [tf.float32, tf.float64, tf.complex64, tf.complex128]

dtype_nbits_map = {
    tf.float32: 11,
    tf.float64: 25,
    tf.complex64: 11,
    tf.complex128: 25,
    tf.int32: 15,
    tf.int64: 31,
}


def get_nbits(part_or_parts):
    return dtype_nbits_map[part_or_parts.dtype]


def get_nparts(parts):
    return parts.shape[0]


def get_base(dtype):
    nbits = dtype_nbits_map[dtype]
    return tf.cast(1 << nbits, dtype)


def get_base_like(part_or_parts):
    return get_base(part_or_parts.dtype)


def get_half_base(part_or_parts):
    nbits = dtype_nbits_map[part_or_parts.dtype]
    return tf.cast(1 << (nbits - 1), part_or_parts.dtype)


def _zero_morsel(parts):
    return tf.zeros_like(parts[0])


def _one_morsel(parts):
    return tf.ones_like(parts[0])


def _chomp_morsel(morsel):
    if morsel.dtype in float_dtypes:
        base = get_base_like(morsel)
        morsel = tf.floor(morsel * (1.0 / base))
    else:
        nbits = get_nbits(morsel)
        morsel = tf.bitwise.right_shift(morsel, nbits)
    return morsel


def _micro_increment(parts):
    nparts = len(parts)
    base = get_base(parts[0].dtype)
    carry = _one_morsel(parts)
    out = [None] * nparts
    for i in range(nparts):
        carry = carry + parts[i]
        out[i] = carry % base
        carry = _chomp_morsel(carry)
    return tf.stack(out)


def negate(parts):
    base = get_base_like(parts)
    return _micro_increment(base - parts - 1)


def from_float(f, nparts=DEFAULT_NPARTS, dtype=DEFAULT_DTYPE):
    base = get_base(dtype)
    f = tf.convert_to_tensor(f)
    sign = f < 0
    f = tf.where(sign, -f, f)
    out = [None] * nparts
    for i in range(nparts):
        floor = tf.floor(f)
        out[nparts - i - 1] = tf.cast(floor, dtype)
        f = (f - floor) * base
    out = tf.stack(out)
    out = tf.where(sign, negate(out), out)
    return out


def get_sign(parts):
    return parts[-1] >= get_half_base(parts)


def to_float(parts, dtype=tf.float32):
    base = get_base(dtype)
    nparts = get_nparts(parts)
    sign = get_sign(parts)
    parts = tf.where(sign, negate(parts), parts)
    out = tf.zeros(parts.shape[1:], dtype)
    for i, part in enumerate(parts):
        out += tf.cast(part, dtype) * base ** (i - nparts + 1)
    return tf.where(sign, -out, out)


def _check_compatibility(parts1, parts2):
    return get_nparts(parts1) == get_nparts(parts2) and parts1.dtype == parts2.dtype


def add(parts1, parts2):
    assert _check_compatibility(parts1, parts2)
    base = get_base_like(parts1)
    nparts = get_nparts(parts2)
    carry = _zero_morsel(parts1)
    out = [None] * nparts
    for i in range(nparts):
        carry = carry + parts1[i] + parts2[i]
        out[i] = carry % base
        carry = _chomp_morsel(carry)
    return tf.stack(out)


def sub(parts1, parts2):
    return add(parts1, negate(parts2))


def less(a, b):
    return get_sign(sub(a, b))


def greater(a, b):
    return get_sign(sub(b, a))


def less_equal(a, b):
    return greater(a, b)


def greater_equal(a, b):
    return less(b, a)


def multiply_positive_overflow(a, b):
    #assert _check_compatibility(a, b)
    nparts = get_nparts(a)
    base = get_base_like(a)
    out = [None] * (nparts * 2)
    carry = _zero_morsel(a)
    overflow = _zero_morsel(a)
    for i in range(nparts * 2):
        min_j = max(i - nparts + 1, 0)
        max_j = min(i, nparts - 1)
        for j in range(min_j, max_j + 1):
            product = a[j] * b[i - j]
            #assert tf.reduce_all(product < base ** 2)
            carry = carry + product
            overflow += carry // base
            carry = carry % base
        #assert tf.reduce_all(carry < base)
        #assert tf.reduce_all(overflow < base ** 2)
        out[i] = carry
        carry = overflow % base
        overflow = overflow // base
    #assert tf.reduce_all(carry == 0)
    #assert tf.reduce_all(overflow == 0)
    return tf.stack(out)


def multiply_overflow(parts1, parts2):
    sign1 = get_sign(parts1)
    sign2 = get_sign(parts2)
    parts1 = tf.where(sign1, negate(parts1), parts1)
    parts2 = tf.where(sign2, negate(parts2), parts2)
    parts3 = multiply_positive_overflow(parts1, parts2)
    return tf.where(sign1 ^ sign2, negate(parts3), parts3)


def multiply(parts1, parts2):
    assert _check_compatibility(parts1, parts2)
    nparts = get_nparts(parts1)
    parts3 = multiply_overflow(parts1, parts2)
    return parts3[:-1][-nparts:]


def square(i):
    return multiply(i, i)


def complex_multiply(i1, j1, i2, j2):
    return (
        sub(multiply(i1, i2), multiply(j1, j2)),
        add(multiply(i1, j2), multiply(i2, j1)),
    )


def complex_square(i, j):
    return complex_multiply(i, j, i, j)


def complex_abs(i, j):
    return add(square(i), square(j))
