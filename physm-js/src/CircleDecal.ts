import * as mat3 from './Mat3';
import * as vec3 from './Vec3';
import Decal from './Decal';
import type { DecalKind } from './Decal';
import type { Mat3 } from './Mat3';
import type { Vec3 } from './Vec3';

export interface CircleDecalOptions {
  position?: number | readonly number[] | Vec3;
  radius?: number;
  color?: string;
}

/** A filled disc at a frame-relative point. */
export default class CircleDecal extends Decal {
  override readonly kind: DecalKind = 'circle';
  readonly position: Vec3;
  readonly radius: number;
  readonly color: string;

  constructor({
    position = vec3.ORIGIN,
    radius = 1,
    color = 'black',
  }: CircleDecalOptions = {}) {
    super();
    this.position = vec3.coerce(position);
    this.radius = radius;
    this.color = color;
  }

  override xform(xformMatrix: Mat3): CircleDecal {
    return new CircleDecal({
      position: mat3.apply(xformMatrix, this.position),
      radius: this.radius * mat3.scaleFactor(xformMatrix),
      color: this.color,
    });
  }

}
