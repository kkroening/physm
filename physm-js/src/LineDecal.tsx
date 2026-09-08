import * as mat3 from './Mat3';
import * as vec3 from './Vec3';
import Decal from './Decal';
import type { DecalRenderOptions } from './Decal';
import type { Mat3 } from './Mat3';
import type { ReactElement, SVGProps } from 'react';
import type { Vec3 } from './Vec3';

export interface LineDecalOptions {
  endPos: number | readonly number[] | Vec3;
  startPos?: number | readonly number[] | Vec3;
  lineWidth?: number;
  color?: string;
}

/** A straight segment between two frame-relative points. */
export default class LineDecal extends Decal {
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

  override getDomElement(
    xformMatrix: Mat3,
    { key }: DecalRenderOptions = {},
  ): ReactElement<SVGProps<SVGElement>> {
    const start = mat3.apply(xformMatrix, this.startPos);
    const end = mat3.apply(xformMatrix, this.endPos);

    return (
      <line
        className="plot__line"
        x1={start[0]}
        y1={start[1]}
        x2={end[0]}
        y2={end[1]}
        strokeWidth={this.lineWidth * mat3.scaleFactor(xformMatrix)}
        stroke={this.color}
        key={key}
      />
    );
  }
}
