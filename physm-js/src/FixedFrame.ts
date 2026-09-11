import * as vec3 from './Vec3';
import Frame from './Frame';
import type { FrameOptions } from './Frame';
import type { Mat3 } from './Mat3';

export interface FixedFrameOptions extends Omit<
  FrameOptions,
  'initialState' | 'resistance'
> {
  angle?: number;
}

/**
 * A frame fixed to its parent: set at `position`, turned by `angle`, and moved
 * by nothing of its own.
 *
 * It is no joint, so its local transform is a constant, and its velocity and
 * acceleration matrices are the base class's zeros. It still has a coordinate,
 * as every frame does in a state map, but that coordinate moves nothing:
 * nothing acts on it, and the mass matrix gives it an inertia of its own, so
 * it stays at rest and the frame stays where it was put (`docs/algorithm.md`
 * §2). Its initial state is always zero, and it has no resistance to speak of.
 */
export default class FixedFrame extends Frame {
  readonly angle: number;

  constructor({ angle = 0, ...rest }: FixedFrameOptions = {}) {
    super({ ...rest, typeName: 'FixedFrame' });
    this.angle = angle;
  }

  override getLocalPosMatrix(_q: number): Mat3 {
    const [x, y] = vec3.toPlanar(this.position);
    const cos = Math.cos(this.angle);
    const sin = Math.sin(this.angle);

    return [cos, -sin, x, sin, cos, y, 0, 0, 1];
  }

  override isJoint(): boolean {
    return false;
  }

  override toJsonObj(
    options: { includeDecals?: boolean } = {},
  ): Record<string, unknown> {
    return { angle: this.angle, ...super.toJsonObj(options) };
  }
}
