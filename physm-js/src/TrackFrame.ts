import * as mat3 from './Mat3';
import * as vec3 from './Vec3';
import Frame from './Frame';
import type { FrameOptions } from './Frame';
import type { Mat3 } from './Mat3';

export interface TrackFrameOptions extends FrameOptions {
  angle?: number;
}

/**
 * A prismatic joint: the coordinate is a distance along a fixed direction.
 *
 * Because the motion is a pure translation, the velocity matrix has no
 * rotational part -- which is what makes a constraint's contribution to a
 * shared prismatic ancestor cancel exactly. See `Constraint._separationJacobian`.
 */
export default class TrackFrame extends Frame {
  readonly angle: number;

  constructor({ angle = 0, ...rest }: TrackFrameOptions = {}) {
    super({ ...rest, typeName: 'TrackFrame' });
    this.angle = angle;
  }

  override getLocalPosMatrix(q: number): Mat3 {
    const [x, y] = vec3.toPlanar(this.position);

    return mat3.translation(
      x + q * Math.cos(this.angle),
      y + q * Math.sin(this.angle),
    );
  }

  override getLocalVelMatrix(_q: number): Mat3 {
    return [0, 0, Math.cos(this.angle), 0, 0, Math.sin(this.angle), 0, 0, 0];
  }

  override toJsonObj(
    options: { includeDecals?: boolean } = {},
  ): Record<string, unknown> {
    return { angle: this.angle, ...super.toJsonObj(options) };
  }
}
