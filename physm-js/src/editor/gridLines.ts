import * as mat3 from './../Mat3';
import * as vec3 from './../Vec3';
import type { Mat3 } from './../Mat3';
import type { ScreenPoint } from './placeGizmos';

/** One line of a grid: the whole unit it marks, and its two ends on screen. */
export interface GridLine {
  readonly unit: number;
  readonly from: ScreenPoint;
  readonly to: ScreenPoint;
}

/** The whole numbers from `low` to `high`, both included. */
function wholeNumbersBetween(low: number, high: number): number[] {
  const from = Math.ceil(low);

  // Between two units there are none: the floor of `high` is then `from - 1`,
  // a length of zero.
  return Array.from(
    { length: Math.floor(high) - from + 1 },
    (_, index) => from + index,
  );
}

/**
 * The lines of a grid across a pane: one at every whole unit the pane reaches
 * -- `xLines` at each x, `yLines` at each y -- with its ends on screen.
 *
 * `lattice` takes the grid's units to the screen: the view itself for the
 * world's grid, or a turned and moved one for a frame's parent. The pane's
 * corners, taken into the grid's units, bound the lines, so a turned grid's
 * run past the pane's edges, where the SVG clips them.
 */
export default function gridLines(
  lattice: Mat3,
  [width, height]: readonly [number, number],
): { xLines: GridLine[]; yLines: GridLine[] } {
  const toUnits = mat3.invert(lattice);
  const corners = [
    [0, 0],
    [width, 0],
    [0, height],
    [width, height],
  ].map(([x, y]) => mat3.apply(toUnits, vec3.point(x!, y!)));
  const left = Math.min(...corners.map(([x]) => x));
  const right = Math.max(...corners.map(([x]) => x));
  const bottom = Math.min(...corners.map(([, y]) => y));
  const top = Math.max(...corners.map(([, y]) => y));
  const onScreen = (x: number, y: number): ScreenPoint =>
    vec3.toPlanar(mat3.apply(lattice, vec3.point(x, y)));

  return {
    xLines: wholeNumbersBetween(left, right).map((unit) => ({
      unit,
      from: onScreen(unit, bottom),
      to: onScreen(unit, top),
    })),
    yLines: wholeNumbersBetween(bottom, top).map((unit) => ({
      unit,
      from: onScreen(left, unit),
      to: onScreen(right, unit),
    })),
  };
}
