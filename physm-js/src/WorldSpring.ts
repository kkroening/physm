import * as mat3 from './Mat3';
import type { Mat3 } from './Mat3';

export interface WorldSpringJson {
  stiffness: number;
  restAngle: number;
}

/**
 * A torsion spring between a frame and the world, slack at `restAngle`.
 *
 * What "keep the crane arm horizontal" needs, and what a `Spring` cannot say:
 * horizontal is a direction in the *world*, so where the arm should sit
 * depends on everything it hangs from. Written as a constant world angle and
 * compared against the frame's accumulated pose every tick -- so it needs no
 * expression, because the solver walks state to pose anyway, and a value
 * carried across a solver batch would be a tick behind in exactly the case
 * this exists for.
 *
 * **It is a different device from a `Spring`, not a variant of one**, and the
 * generalised force is where that shows. A joint spring acts on one
 * coordinate. This one is anchored to the world, so it resists *any* rotation
 * of the frame it is on -- including rotation the frame inherits from
 * something above it. Its torque therefore enters the row of every rotational
 * frame between the world and this one, which is `U = k(theta_world - rest)^2
 * / 2` differentiated honestly: `d(theta_world)/dq` is 1 for each of them.
 *
 * Getting that wrong is not a rounding-off. A torque in the frame's own row
 * alone is a joint *actuator* with a world-referenced set-point -- physically
 * real, and what a gyro-levelled crane is -- but it is not conservative, and
 * it can put energy into a rig without bound.
 */
export default class WorldSpring {
  readonly stiffness: number;

  /** The direction in the world this spring is slack toward, in radians. */
  readonly restAngle: number;

  constructor(stiffness = 0, restAngle = 0) {
    this.stiffness = stiffness;
    this.restAngle = restAngle;
  }

  /**
   * The torque it applies, given where its frame has got to.
   *
   * Wrapped, so the spring always takes the short way round: without that, a
   * frame a hair past a half turn from its rest is driven the long way, which
   * looks like the rig snapping rather than settling.
   */
  torque(pose: Mat3): number {
    return (
      this.stiffness * mat3.wrapAngle(this.restAngle - mat3.orientation(pose))
    );
  }

  toJsonObj(): WorldSpringJson {
    return { stiffness: this.stiffness, restAngle: this.restAngle };
  }
}
