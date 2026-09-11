import * as mat3 from './../Mat3';
import * as vec3 from './../Vec3';
import type { Mat3 } from './../Mat3';

/** One line of the grid: the whole unit of the world it marks, and where it is drawn on screen. */
export interface GridLine {
  readonly unit: number;
  readonly at: number;
}

/** The whole numbers from the lesser of `a` and `b` to the greater, both included. */
function wholeNumbersBetween(a: number, b: number): number[] {
  const from = Math.ceil(Math.min(a, b));
  const to = Math.floor(Math.max(a, b));

  // Between two units there are none: a negative length is an empty array.
  return Array.from({ length: to - from + 1 }, (_, index) => from + index);
}

/**
 * Where the grid's lines go across a pane: one at every whole unit of the
 * world in view -- `vertical` at each x, `horizontal` at each y -- with the
 * screen coordinate each is drawn at.
 *
 * The view scales and moves the world but never turns it, so a line of the
 * world's x is a line of the screen's, and the pane's corners bound the units
 * in view.
 */
export default function gridLines(
  xformMatrix: Mat3,
  [width, height]: readonly [number, number],
): { vertical: GridLine[]; horizontal: GridLine[] } {
  const toWorld = mat3.invert(xformMatrix);
  const [left, top] = mat3.apply(toWorld, vec3.point(0, 0));
  const [right, bottom] = mat3.apply(toWorld, vec3.point(width, height));

  return {
    vertical: wholeNumbersBetween(left, right).map((unit) => ({
      unit,
      at: mat3.apply(xformMatrix, vec3.point(unit, 0))[0],
    })),
    horizontal: wholeNumbersBetween(top, bottom).map((unit) => ({
      unit,
      at: mat3.apply(xformMatrix, vec3.point(0, unit))[1],
    })),
  };
}
