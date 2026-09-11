import * as mat3 from './../Mat3';
import * as vec3 from './../Vec3';
import type { Mat3 } from './../Mat3';
import type { ScreenPoint } from './placeGizmos';
import type { Vec3 } from './../Vec3';

/** A value to the nearest hundredth. */
function rounded(value: number): number {
  return Math.round(value * 100) / 100 || 0;
}

/**
 * A value to the nearest billionth: exact, less the noise an inverse leaves in
 * its last digits, which would otherwise be written into the code. The `|| 0`
 * in each of these turns a negative zero positive.
 */
function settled(value: number): number {
  return Math.round(value * 1e9) / 1e9 || 0;
}

/**
 * A `position` moved by the screen motion from `from` to `to`, taken back
 * through the parent's transform -- its linear part only, since a motion has
 * no origin.
 */
function moved(
  position: Vec3,
  parentXform: Mat3,
  from: ScreenPoint,
  to: ScreenPoint,
): [number, number] {
  const [dx, dy] = mat3.apply(
    mat3.invert(parentXform),
    vec3.direction(to[0] - from[0], to[1] - from[1]),
  );
  const [x, y] = vec3.toPlanar(position);

  return [x + dx, y + dy];
}

/**
 * The `position` that takes a frame's origin from `origin` on screen to
 * `target`: exact, so that two frames snapped together coincide rather than
 * nearly do.
 */
export function placedPosition(
  position: Vec3,
  parentXform: Mat3,
  origin: ScreenPoint,
  target: ScreenPoint,
): [number, number] {
  const [x, y] = moved(position, parentXform, origin, target);

  return [settled(x), settled(y)];
}

/**
 * Where a drag from `from` to `to` on screen takes a `position` that is read in
 * a parent drawn under `parentXform`.
 *
 * The drag's motion, taken back through the parent's transform and added to
 * where the position started, so a frame moves with the pointer however far
 * from its origin it was grabbed. Rounded to a hundredth of a unit, finer than
 * a pointer can place it, so the code written from it stays readable.
 */
export default function movedPosition(
  position: Vec3,
  parentXform: Mat3,
  from: ScreenPoint,
  to: ScreenPoint,
): [number, number] {
  const [x, y] = moved(position, parentXform, from, to);

  return [rounded(x), rounded(y)];
}
