import type { ReactElement, SVGProps } from 'react';
import type { Mat3 } from './Mat3';
import { NotImplementedError } from './utils';

export interface DecalRenderOptions {
  key?: string | undefined;
}

/**
 * Something drawn in a frame's coordinates, carrying no mass and no dynamics.
 *
 * Decals exist for the picture only: nothing in the solver reads one.
 */
export default abstract class Decal {
  /** The same decal, expressed in coordinates a transform carries it into. */
  abstract xform(xformMatrix: Mat3): Decal;

  abstract getDomElement(
    xformMatrix: Mat3,
    options?: DecalRenderOptions,
  ): ReactElement<SVGProps<SVGElement>>;

  toJsonObj(): unknown {
    throw new NotImplementedError('TODO: implement');
  }
}
