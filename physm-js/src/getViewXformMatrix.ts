import * as mat3 from './Mat3';
import type { Mat3 } from './Mat3';

/**
 * World coordinates to a plot's, centred on the plot.
 *
 * The centre used to be a hardcoded `(300, 300)`, which put the scene outside
 * any plot shorter than about 600px -- it rendered blank, with everything drawn
 * below its bottom edge. It is the plot's own midpoint now, so a scene at the
 * world origin is visible whatever size the window is.
 *
 * `-scale` on the `y` axis because the world is `y`-up and SVG is `y`-down.
 *
 * Its own module rather than a local in `App.jsx` for two reasons: `App.jsx` is
 * `.jsx` and `checkJs` is off, so nothing there is type-checked; and a
 * non-component export beside a component trips `react-refresh`. Both of which
 * kept the one piece of arithmetic in the app from being testable.
 */
export default function getViewXformMatrix(
  translation: readonly [number, number],
  scale: number,
  [width, height]: readonly [number, number],
): Mat3 {
  return mat3.multiply(
    mat3.multiply(
      mat3.translation(width / 2, height / 2),
      mat3.scaling(scale, -scale),
    ),
    mat3.translation(translation[0], translation[1]),
  );
}
