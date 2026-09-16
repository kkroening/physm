import type { Mat3 } from './Mat3';
import type { Tick } from './expression';
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

/**
 * A decal in world coordinates, which is not a shape until the scene is posed.
 *
 * [0016 page 2](../../docs/issues/0016/02-values.md) reaches this from the
 * wish list's own example: a line between two points on different bodies has
 * no frame in which its endpoints are fixed, because their separation is a
 * function of the pose. So it is not a `Decal` with cleverer props -- it is a
 * decal that does not exist until something says where the scene has got to.
 *
 * Kept as a function rather than as a `Decal` subclass so that `Decal` stays
 * plain data: everything that reads one -- `xform`, the renderer's switch,
 * hit-testing, the snap points -- goes on holding a shape whose numbers are
 * numbers, and the pose enters at one place rather than at each of them.
 */
export type WorldDecal = (tick: Tick) => Decal;
