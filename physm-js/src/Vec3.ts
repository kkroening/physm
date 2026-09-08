/**
 * A homogeneous 2D position or direction, `[x, y, w]`.
 *
 * `w = 1` for a point and `w = 0` for a direction, which is what makes a single
 * 3×3 matrix express rotation and translation together. See `docs/algorithm.md`.
 *
 * Immutable, and a tuple rather than an array: a fixed length means every index
 * below is a literal, which is what keeps `noUncheckedIndexedAccess` honest
 * without a single non-null assertion.
 */
export type Vec3 = readonly [number, number, number];

export const ZERO: Vec3 = [0, 0, 0];

/** The origin, as a point rather than a direction. */
export const ORIGIN: Vec3 = [0, 0, 1];

/** A point at `(x, y)`. */
export function point(x: number, y: number): Vec3 {
  return [x, y, 1];
}

/** A direction, which translation does not move. */
export function direction(x: number, y: number): Vec3 {
  return [x, y, 0];
}

export function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function subtract(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function scale(v: Vec3, factor: number): Vec3 {
  return [v[0] * factor, v[1] * factor, v[2] * factor];
}

export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/**
 * The length of the `(x, y)` part, ignoring `w`.
 *
 * Which is what every caller wants: a separation between two points has `w = 0`
 * and a point's distance from the origin should not count its `w = 1`.
 */
export function planarLength(v: Vec3): number {
  return Math.hypot(v[0], v[1]);
}

/** The `(x, y)` part, for callers that have finished with homogeneity. */
export function toPlanar(v: Vec3): readonly [number, number] {
  return [v[0], v[1]];
}

/**
 * Accept the shapes a scene author writes a position in, and produce a point.
 *
 * A bare number is an offset along the frame's own axis, which is how a track
 * or a link length is usually written; an array is `[x, y]`, with a third
 * element tolerated and ignored since the result is a point either way.
 */
export function coerce(position: number | readonly number[] | Vec3): Vec3 {
  if (typeof position === 'number') {
    return point(position, 0);
  }

  if (position.length < 2 || position.length > 3) {
    throw new TypeError(
      `Expected a position of 2 or 3 elements; got ${JSON.stringify(position)}`,
    );
  }

  return point(position[0] ?? 0, position[1] ?? 0);
}
