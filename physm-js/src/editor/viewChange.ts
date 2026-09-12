import * as mat3 from './../Mat3';
import * as vec3 from './../Vec3';
import getViewXformMatrix from './../getViewXformMatrix';
import type { ScreenPoint } from './placeGizmos';

/**
 * Where the scene pane is looking: the view's own two degrees of freedom.
 *
 * `translation` is in world units and is added to a world point *before* the
 * scale, so the world point at the pane's centre is its negation -- not a
 * pixel offset, which is the easy thing to assume and the wrong one.
 */
export interface View {
  readonly translation: readonly [number, number];
  readonly scale: number;
}

/** Pixels to the world unit, as the pane opens. */
export const VIEW_SCALE = 18;

/** Where the view starts, and what `Reset view` returns to. */
export const HOME: View = { translation: [0, 0], scale: VIEW_SCALE };

/**
 * How far the view zooms, in pixels to the world unit.
 *
 * The lower bound is not taste. The grid draws a line at every whole unit and
 * a drag snaps to those units, so zooming out without bound either floods the
 * pane with lines or forces the grid to step -- and a stepped grid that went
 * on snapping to whole units would put the rule back out of sight of the mark
 * it stands for. A decade-stepped grid, snapping to the step it draws, is what
 * would let this widen.
 */
export const MIN_SCALE = 4;
export const MAX_SCALE = 120;

/**
 * Wheel travel, in pixels, that multiplies the scale by `e`.
 *
 * Exponential rather than linear because zoom is a ratio: the same notch
 * should double the scale whether it starts near or far, which linear steps do
 * not, and which is why `App.jsx` reaches for `Math.exp` too.
 */
const WHEEL_PER_E = 320;

function held(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

/** Whether the view is where it opened, so there is nothing to reset. */
export function isHome({ translation, scale }: View): boolean {
  return translation[0] === 0 && translation[1] === 0 && scale === VIEW_SCALE;
}

/** The world point drawn at `at`, under the view this one describes. */
function worldAt(
  view: View,
  at: ScreenPoint,
  size: readonly [number, number],
): readonly [number, number] {
  const toWorld = mat3.invert(
    getViewXformMatrix(view.translation, view.scale, size),
  );

  return vec3.toPlanar(mat3.apply(toWorld, vec3.point(at[0], at[1])));
}

/**
 * The view zoomed by `deltaY` of wheel, with the world point under `at` left
 * where it is on screen.
 *
 * Zooming about the pane's centre instead would carry whatever is being worked
 * on off the edge, since the thing under the pointer is the thing of interest.
 *
 * Holding that point fixed is one equation. The view puts a world point `q` at
 * `centre + S(s, -s) . (q + t)`, so keeping that fixed while `s` becomes `s'`
 * needs `q + t' = (s / s') . (q + t)` -- the same factor on both axes, the two
 * sign flips having cancelled. At either end of the clamp the factor is one
 * and the view does not move at all.
 */
export function zoomedAbout(
  view: View,
  at: ScreenPoint,
  deltaY: number,
  size: readonly [number, number],
): View {
  const scale = held(view.scale * Math.exp(-deltaY / WHEEL_PER_E));
  const factor = view.scale / scale;
  const [qx, qy] = worldAt(view, at, size);
  const [tx, ty] = view.translation;

  return {
    scale,
    translation: [factor * (qx + tx) - qx, factor * (qy + ty) - qy],
  };
}

/**
 * The view moved so that what was drawn under the pointer stays under it, for
 * a pointer that has travelled `[dx, dy]` across the pane.
 *
 * A screen distance over the scale is a world distance, and `y` flips because
 * the world is y-up and the screen y-down.
 */
export function pannedBy(view: View, [dx, dy]: ScreenPoint): View {
  const [tx, ty] = view.translation;

  return {
    scale: view.scale,
    translation: [tx + dx / view.scale, ty - dy / view.scale],
  };
}
