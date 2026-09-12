import * as mat3 from './../Mat3';
import { gridStep } from './gridLines';
import * as vec3 from './../Vec3';
import type { Mat3 } from './../Mat3';
import type { ScreenPoint } from './placeGizmos';
import type { Vec3 } from './../Vec3';

/**
 * How near a line of the grid a dragged coordinate has to come to snap to it,
 * in pixels. Half a point's reach: at eight, the window either side of a line
 * would be wider than the closest the grid ever draws two of them, and nothing
 * could be placed between.
 */
const GRID_REACH = 4;

/**
 * ...and never more of a *step* than this, at any zoom.
 *
 * A reach in pixels alone was right while the scale was fixed. Every
 * coordinate is within half a step of a line, so a window as wide as the step
 * covers all of it and a drag can land on nothing but the grid. Holding the
 * reach to a quarter of the step from either side leaves half of every gap
 * free, whatever the step and whatever the scale.
 */
const GRID_REACH_STEPS = 0.25;

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

/**
 * Where a drag takes a `position`, as `movedPosition` has it -- but with each
 * coordinate that comes within `GRID_REACH` pixels of a drawn grid line
 * snapped to it. Each on its own, so a drag along a line keeps to it; and in
 * the parent's units, so the code gets round numbers however the parent is
 * placed.
 *
 * The lines are the ones `gridLines` draws, at multiples of the same
 * `gridStep` -- which is the point rather than a convenience. A snap to a
 * spacing the grid had stopped drawing would be a rule with nothing on screen
 * standing for it.
 */
export function griddedPosition(
  position: Vec3,
  parentXform: Mat3,
  from: ScreenPoint,
  to: ScreenPoint,
): [number, number] {
  const pixelsPerUnit = mat3.scaleFactor(parentXform);
  const step = gridStep(pixelsPerUnit);
  // In pixels, so the snap feels the same at every zoom -- but never more than
  // a quarter of a step, so a drag can always land between two lines. At the
  // scale the pane opens at the pixel reach is the smaller of the two, so
  // nothing about the usual case moves.
  const reach = Math.min(GRID_REACH, GRID_REACH_STEPS * step * pixelsPerUnit);
  const snapped = (value: number): number => {
    const line = Math.round(value / step) * step;

    return Math.abs(value - line) * pixelsPerUnit <= reach
      ? line || 0
      : rounded(value);
  };
  const [x, y] = moved(position, parentXform, from, to);

  return [snapped(x), snapped(y)];
}

/**
 * The grid a drag snaps to, as a transform to the screen: a unit of it for
 * each whole unit of the frame's `position`, placed where the frame's origin
 * goes at that value. That is the parent's own grid for a rotational frame; a
 * track frame's coordinate slides its origin along the track, and the grid
 * with it.
 */
export function positionGrid(
  position: Vec3,
  parentXform: Mat3,
  origin: ScreenPoint,
): Mat3 {
  const [x, y] = vec3.toPlanar(
    mat3.apply(mat3.invert(parentXform), vec3.point(origin[0], origin[1])),
  );
  const [px, py] = vec3.toPlanar(position);

  return mat3.multiply(parentXform, mat3.translation(x - px, y - py));
}
