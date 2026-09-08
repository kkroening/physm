import * as mat3 from './Mat3';
import * as vec3 from './Vec3';
import Decal from './Decal';
import type { DecalKind } from './Decal';
import type { Mat3 } from './Mat3';
import type { Vec3 } from './Vec3';

export interface LineDecalOptions {
  endPos: number | readonly number[] | Vec3;
  startPos?: number | readonly number[] | Vec3;
  lineWidth?: number;
  color?: string;
}

/** A straight segment between two frame-relative points. */
export default class LineDecal extends Decal {
  override readonly kind: DecalKind = 'line';
  readonly startPos: Vec3;
  readonly endPos: Vec3;
  readonly lineWidth: number;
  readonly color: string;

  constructor({
    endPos,
    startPos = vec3.ORIGIN,
    lineWidth = 1,
    color = 'black',
  }: LineDecalOptions) {
    super();
    this.startPos = vec3.coerce(startPos);
    this.endPos = vec3.coerce(endPos);
    this.lineWidth = lineWidth;
    this.color = color;
  }

  override xform(xformMatrix: Mat3): LineDecal {
    return new LineDecal({
      endPos: mat3.apply(xformMatrix, this.endPos),
      startPos: mat3.apply(xformMatrix, this.startPos),
      lineWidth: this.lineWidth * mat3.scaleFactor(xformMatrix),
      color: this.color,
    });
  }
}
