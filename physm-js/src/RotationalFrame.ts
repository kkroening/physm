import * as mat3 from './Mat3';
import * as vec3 from './Vec3';
import Frame from './Frame';
import type { FrameOptions } from './Frame';
import type { Mat3 } from './Mat3';

export interface RotationalFrameOptions extends FrameOptions {
  restAngle?: number | null;
}

/**
 * A pin joint: the coordinate is an angle about the frame's own origin.
 *
 * Its local transform is a rotation followed by the fixed offset that places
 * the joint in its parent, which is why the position enters the translation
 * column and the angle only the linear block.
 */
export default class RotationalFrame extends Frame {
  /**
   * The direction in the *world* this frame's spring is slack toward, or
   * `null` for a spring slack at its own zero.
   *
   * What "keep the crane arm horizontal" needs, and what a local spring cannot
   * express: horizontal is a world direction, so the rest orientation depends
   * on everything the arm hangs from. Written as a constant world angle and
   * compared against the frame's accumulated pose each tick, which is why it
   * needs no expression -- the solver already knows where the frame got to,
   * and a value carried across a solver batch would be a tick behind in
   * exactly the situation it exists for.
   */
  readonly restAngle: number | null;

  constructor({ restAngle = null, ...rest }: RotationalFrameOptions = {}) {
    super({ ...rest, typeName: 'RotationalFrame' });
    this.restAngle = restAngle;
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

  override isJoint(): boolean {
    return true;
  }

  /**
   * `stiffness` times the turn from where this frame points to where it should.
   *
   * The same spring as the base's, with the rest position given in the world
   * rather than in the frame's own coordinate -- `-stiffness * q` is this with
   * a rest of zero, measured locally.
   *
   * The difference is wrapped, so the spring always takes the short way round:
   * without that, a frame a hair past a half turn from its rest would be
   * driven the long way, which looks like the rig snapping rather than
   * settling.
   */
  override springForce(q: number, pose: Mat3): number {
    return this.restAngle === null
      ? super.springForce(q, pose)
      : this.stiffness *
          mat3.wrapAngle(this.restAngle - mat3.orientation(pose));
  }

  override toJsonObj(options?: Parameters<Frame['toJsonObj']>[0]) {
    return { ...super.toJsonObj(options), restAngle: this.restAngle };
  }
}
