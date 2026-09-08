import type { Mat3 } from './Mat3';
import { NotImplementedError } from './utils';

/**
 * Which shape a decal is.
 *
 * A discriminant rather than a rendering method, because the core does not
 * know how to draw: `physm-js/src/react` owns the mapping from a kind to an
 * element, and a renderer for some other target would own a different one.
 */
export type DecalKind = 'box' | 'circle' | 'line';

/**
 * Something drawn in a frame's coordinates, carrying no mass and no dynamics.
 *
 * Decals exist for the picture only: nothing in the solver reads one.
 */
export default abstract class Decal {
  /** Which shape this is; see `DecalKind`. */
  abstract readonly kind: DecalKind;

  /** The same decal, expressed in coordinates a transform carries it into. */
  abstract xform(xformMatrix: Mat3): Decal;

  toJsonObj(): unknown {
    throw new NotImplementedError('TODO: implement');
  }
}
