import * as mat3 from './Mat3';
import * as vec3 from './Vec3';
import Frame from './Frame';
import type { FrameOptions } from './Frame';
import type { Mat3 } from './Mat3';

/**
 * A pin joint: the coordinate is an angle about the frame's own origin.
 *
 * Its local transform is a rotation followed by the fixed offset that places
 * the joint in its parent, which is why the position enters the translation
 * column and the angle only the linear block.
 */
export default class RotationalFrame extends Frame {
  constructor(options: FrameOptions = {}) {
    super({ ...options, typeName: 'RotationalFrame' });
  }

  override getLocalPosMatrix(q: number): Mat3 {
    const [x, y] = vec3.toPlanar(this.position);
    const cos = Math.cos(q);
    const sin = Math.sin(q);

    return [cos, -sin, x, sin, cos, y, 0, 0, 1];
  }

  override getLocalVelMatrix(q: number): Mat3 {
    const cos = Math.cos(q);
    const sin = Math.sin(q);

    return [-sin, -cos, 0, cos, -sin, 0, 0, 0, 0];
  }

  override getLocalAccelMatrix(q: number): Mat3 {
    const cos = Math.cos(q);
    const sin = Math.sin(q);

    return [-cos, sin, 0, -sin, -cos, 0, 0, 0, 0];
  }
}
