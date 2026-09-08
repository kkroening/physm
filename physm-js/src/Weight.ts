import * as mat3 from './Mat3';
import * as vec3 from './Vec3';
import type { Mat3 } from './Mat3';
import type { Vec3 } from './Vec3';

export interface WeightOptions {
  position?: number | readonly number[] | Vec3;
  drag?: number;
}

export interface WeightJson {
  mass: number;
  position: readonly [number, number];
  drag: number;
}

/**
 * A point mass fixed in a frame's coordinates.
 *
 * `drag` is a linear resistance proportional to the point's world velocity, as
 * distinct from a frame's `resistance`, which acts on its coordinate.
 */
export default class Weight {
  readonly mass: number;
  readonly position: Vec3;
  readonly drag: number;

  constructor(mass = 1, { position = vec3.ORIGIN, drag = 0 }: WeightOptions = {}) {
    this.mass = mass;
    this.position = vec3.coerce(position);
    this.drag = drag;
  }

  /** The same mass, its position carried through a transform. */
  xform(xformMatrix: Mat3): Weight {
    return new Weight(this.mass, {
      position: mat3.apply(xformMatrix, this.position),
      drag: this.drag,
    });
  }

  toJsonObj(): WeightJson {
    return {
      mass: this.mass,
      position: vec3.toPlanar(this.position),
      drag: this.drag,
    };
  }
}
