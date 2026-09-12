import * as mat3 from './../Mat3';
import * as vec3 from './../Vec3';
import type { Mat3 } from './../Mat3';
import type { ScreenPoint } from './placeGizmos';

/** One line of a grid: the coordinate it marks, and its two ends on screen. */
export interface GridLine {
  readonly unit: number;
  readonly from: ScreenPoint;
  readonly to: ScreenPoint;
}

/**
 * How near each other the grid's lines may be drawn, in pixels.
 *
 * Two things bound this, and twelve is a pick inside both rather than a value
 * either of them forces.
 *
 * **At most eighteen**, which is what the pane opens at: any minimum above it
 * steps the grid at the default view, and a line at every whole unit there is
 * the grid this editor has always drawn.
 *
 * **Under sixteen**, or `griddedPosition`'s cap on its reach stops existing.
 * That cap is a quarter of a step, and a step's spacing is never below this
 * minimum -- so from sixteen up, a quarter of the spacing always clears the
 * four-pixel reach and the cap can never be the smaller of the two.
 */
const MIN_SPACING = 12;

/** The rungs of the ladder within each decade: 1, 2 and 5, then 10 again. */
const RUNGS = [1, 2, 5] as const;

/**
 * How far apart the grid's lines stand, in the lattice's own units.
 *
 * The smallest rung of the 1-2-5 ladder whose lines clear `MIN_SPACING`, so
 * the grid keeps its shape however far the view pulls back instead of flooding
 * the pane with a line per unit. A drag snaps to this same step --
 * `griddedPosition` reads it from here -- so the rule a person feels is always
 * the one they can see.
 *
 * 1-2-5 rather than powers of ten alone, because the snap rides this ladder
 * too. A decade ladder leaves the spacing to grow tenfold before the next rung
 * arrives, which as drawing is merely crowded at one end and sparse at the
 * other -- but as *snapping* it means one wheel notch takes a person from
 * placing on tens to placing on hundreds, with nothing in between, and that is
 * what gets written into the code. No two rungs here are further apart than
 * two and a half.
 *
 * Never finer than a unit, even zoomed well in: positions are written to
 * hundredths, so a step below one would want that rounding to follow it, which
 * is a change to the writing rather than to the grid.
 */
export function gridStep(pixelsPerUnit: number): number {
  const wanted = MIN_SPACING / pixelsPerUnit;
  if (wanted <= 1) {
    return 1;
  }

  const decade = 10 ** Math.floor(Math.log10(wanted));

  return (
    RUNGS.map((rung) => rung * decade).find((step) => step >= wanted) ??
    10 * decade
  );
}

/** The multiples of `step` from `low` to `high`, both included. */
function multiplesBetween(step: number, low: number, high: number): number[] {
  const from = Math.ceil(low / step);

  // Between two of them there are none: the floor of `high` is then `from - 1`,
  // a length of zero.
  return Array.from(
    { length: Math.floor(high / step) - from + 1 },
    (_, index) => (from + index) * step,
  );
}

/**
 * The lines of a grid across a pane: one at every multiple of `gridStep` the
 * pane reaches -- `xLines` at each x, `yLines` at each y -- with its ends on
 * screen.
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
  const step = gridStep(mat3.scaleFactor(lattice));

  return {
    xLines: multiplesBetween(step, left, right).map((unit) => ({
      unit,
      from: onScreen(unit, bottom),
      to: onScreen(unit, top),
    })),
    yLines: multiplesBetween(step, bottom, top).map((unit) => ({
      unit,
      from: onScreen(left, unit),
      to: onScreen(right, unit),
    })),
  };
}
