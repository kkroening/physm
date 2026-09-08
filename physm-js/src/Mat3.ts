import type { Vec3 } from './Vec3';

/**
 * A 3×3 matrix in row-major order, `[m00, m01, m02, m10, ...]`.
 *
 * Every product below is written out rather than looped. Three reasons, in
 * order of how much they matter here:
 *
 * 1. A fixed-size product has no loop worth writing — nine sums of three
 *    terms — and unrolling is what small-matrix libraries do because it beats
 *    the loop overhead and the bounds checks.
 * 2. Literal indices type-check under `noUncheckedIndexedAccess`; computed ones
 *    are `number | undefined` and no control flow narrows them, so a loop would
 *    need a non-null assertion at every access.
 * 3. It reads as the arithmetic it is.
 *
 * `physm-js` used TensorFlow.js for this, which meant float32 and manual
 * disposal. Both are gone; this is plain float64 with no lifetimes to manage.
 */
export type Mat3 = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

export const ZERO: Mat3 = [0, 0, 0, 0, 0, 0, 0, 0, 0];

export const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/** Rotation by `angle`, counter-clockwise. */
export function rotation(angle: number): Mat3 {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  return [cos, -sin, 0, sin, cos, 0, 0, 0, 1];
}

/**
 * The derivative of `rotation` with respect to its angle.
 *
 * Not a rotation itself: it is the generator, and `algorithm.md` §4 calls the
 * conjugated form of it `V_i`.
 */
export function rotationRate(angle: number): Mat3 {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  return [-sin, -cos, 0, cos, -sin, 0, 0, 0, 0];
}

export function translation(x: number, y: number): Mat3 {
  return [1, 0, x, 0, 1, y, 0, 0, 1];
}

export function scaling(x: number, y: number): Mat3 {
  return [x, 0, 0, 0, y, 0, 0, 0, 1];
}

export function add(a: Mat3, b: Mat3): Mat3 {
  return [
    a[0] + b[0],
    a[1] + b[1],
    a[2] + b[2],
    a[3] + b[3],
    a[4] + b[4],
    a[5] + b[5],
    a[6] + b[6],
    a[7] + b[7],
    a[8] + b[8],
  ];
}

export function subtract(a: Mat3, b: Mat3): Mat3 {
  return [
    a[0] - b[0],
    a[1] - b[1],
    a[2] - b[2],
    a[3] - b[3],
    a[4] - b[4],
    a[5] - b[5],
    a[6] - b[6],
    a[7] - b[7],
    a[8] - b[8],
  ];
}

export function scale(m: Mat3, factor: number): Mat3 {
  return [
    m[0] * factor,
    m[1] * factor,
    m[2] * factor,
    m[3] * factor,
    m[4] * factor,
    m[5] * factor,
    m[6] * factor,
    m[7] * factor,
    m[8] * factor,
  ];
}

export function transpose(m: Mat3): Mat3 {
  return [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
}

export function multiply(a: Mat3, b: Mat3): Mat3 {
  return [
    a[0] * b[0] + a[1] * b[3] + a[2] * b[6],
    a[0] * b[1] + a[1] * b[4] + a[2] * b[7],
    a[0] * b[2] + a[1] * b[5] + a[2] * b[8],

    a[3] * b[0] + a[4] * b[3] + a[5] * b[6],
    a[3] * b[1] + a[4] * b[4] + a[5] * b[7],
    a[3] * b[2] + a[4] * b[5] + a[5] * b[8],

    a[6] * b[0] + a[7] * b[3] + a[8] * b[6],
    a[6] * b[1] + a[7] * b[4] + a[8] * b[7],
    a[6] * b[2] + a[7] * b[5] + a[8] * b[8],
  ];
}

/** `m v`, the matrix applied to a homogeneous vector. */
export function apply(m: Mat3, v: Vec3): Vec3 {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ];
}

export function trace(m: Mat3): number {
  return m[0] + m[4] + m[8];
}

export function determinant(m: Mat3): number {
  return (
    m[0] * (m[4] * m[8] - m[5] * m[7]) -
    m[1] * (m[3] * m[8] - m[5] * m[6]) +
    m[2] * (m[3] * m[7] - m[4] * m[6])
  );
}

/**
 * The inverse of a rigid transform, `[Rᵀ | −Rᵀt]`.
 *
 * Every pose in this codebase is a product of rotations and translations, so it
 * is always in SE(2) and the general 3×3 inverse is wasted work -- which is
 * what `algorithm.md` §7 flags about `get_inv_pos_mats` taking one.
 *
 * The bottom row is assumed to be `[0, 0, 1]`; `invert` handles the general case.
 */
export function invertRigid(m: Mat3): Mat3 {
  const [r00, r01, tx, r10, r11, ty] = m;

  return [
    r00,
    r10,
    -(r00 * tx + r10 * ty),
    r01,
    r11,
    -(r01 * tx + r11 * ty),
    0,
    0,
    1,
  ];
}

/** The general inverse, for a matrix that is not known to be rigid. */
export function invert(m: Mat3): Mat3 {
  const det = determinant(m);
  if (det === 0) {
    throw new Error(`Matrix is singular; cannot invert ${JSON.stringify(m)}`);
  }

  const inverseDet = 1 / det;

  return [
    (m[4] * m[8] - m[5] * m[7]) * inverseDet,
    (m[2] * m[7] - m[1] * m[8]) * inverseDet,
    (m[1] * m[5] - m[2] * m[4]) * inverseDet,

    (m[5] * m[6] - m[3] * m[8]) * inverseDet,
    (m[0] * m[8] - m[2] * m[6]) * inverseDet,
    (m[2] * m[3] - m[0] * m[5]) * inverseDet,

    (m[3] * m[7] - m[4] * m[6]) * inverseDet,
    (m[1] * m[6] - m[0] * m[7]) * inverseDet,
    (m[0] * m[4] - m[1] * m[3]) * inverseDet,
  ];
}

/**
 * Whether two matrices agree to within `tolerance`, entry by entry.
 *
 * Differenced rather than indexed in parallel, so that no index is computed and
 * the module stays free of non-null assertions.
 */
export function equals(a: Mat3, b: Mat3, tolerance = 1e-9): boolean {
  return subtract(a, b).every((entry) => Math.abs(entry) <= tolerance);
}
