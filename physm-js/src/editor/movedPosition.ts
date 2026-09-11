import * as mat3 from './../Mat3';
import * as vec3 from './../Vec3';
import type { Mat3 } from './../Mat3';
import type { ScreenPoint } from './placeGizmos';
import type { Vec3 } from './../Vec3';

/** A value to the nearest hundredth. */
function rounded(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Where a drag from `from` to `to` on screen takes a `position` that is read in
 * a parent drawn under `parentXform`.
 *
 * The drag's motion, taken back through the parent's transform -- its linear
 * part only, since a motion has no origin -- and added to where the position
 * started, so a frame moves with the pointer however far from its origin it
 * was grabbed. Rounded to a hundredth of a unit, finer than a pointer can place
 * it, so the code written from it stays readable.
 */
export default function movedPosition(
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

  return [rounded(x + dx), rounded(y + dy)];
}
