import * as tf from './tfjs';
import { coercePositionVector } from './utils';
import { required } from './utils';

/**
 * Loop closure via Lagrange multipliers. See `docs/constraints.md`.
 *
 * The frame tree stays a tree; a relationship the tree cannot express — two
 * chains that must meet — enters as rows on an augmented system.
 *
 * Deliberately mirrors physm-rs's `Constraint` trait: `value` and
 * `jacobianRows` read only configuration-dependent quantities, so they are
 * evaluable at trial configurations no solve was run at, while `bias`
 * additionally needs the velocity-dependent sweeps.
 *
 * The context is a plain object supplying `sortedFrames`, `frameIdPathMap`,
 * `posMatMap` and `velMatMap`, plus `velSumMatMap` and `accelSumMatMap` when
 * the configuration has velocities attached to it.
 */
export default class Constraint {
  constructor({
    frame1 = required('frame1'),
    frame2 = required('frame2'),
    position1 = [0, 0],
    position2 = [0, 0],
  } = {}) {
    this.frameId1 = typeof frame1 === 'string' ? frame1 : frame1.id;
    this.frameId2 = typeof frame2 === 'string' ? frame2 : frame2.id;
    this.position1 = coercePositionVector(position1);
    this.position2 = coercePositionVector(position2);
  }

  get rowCount() {
    throw new Error('not implemented');
  }

  /**
   * World positions of the two attachment points, as `[3, 1]` tensors.
   *
   * Every quantity below is expressed in terms of these rather than the local
   * attachment vectors: `V_i`, `S_i` and `A_i` are all *spatial* operators, so
   * they act on a world point.
   */
  _worldPoints(ctx = required('ctx')) {
    return [
      ctx.posMatMap.get(this.frameId1).matMul(this.position1),
      ctx.posMatMap.get(this.frameId2).matMul(this.position2),
    ];
  }

  /** The separation `d = x_P − x_Q`, as a plain `[x, y]` pair. */
  _separation(xP = required('xP'), xQ = required('xQ')) {
    const p = xP.dataSync();
    const q = xQ.dataSync();
    return [p[0] - q[0], p[1] - q[1]];
  }

  /**
   * Rows of `J_d = ∂d/∂q`, one `[x, y]` pair per frame, indexed by frame id.
   *
   * `(J_d)_i = [i ⪯ a] V_i x_P − [i ⪯ b] V_i x_Q`, non-zero only on the union
   * of the two root paths — and the two contributions cancel on their shared
   * prefix, which is what makes a rope slung between two arms of the same cart
   * exert no net force on the cart.
   */
  _separationJacobian(
    ctx = required('ctx'),
    xP = required('xP'),
    xQ = required('xQ'),
  ) {
    const rows = new Map(ctx.sortedFrames.map((frame) => [frame.id, [0, 0]]));
    const accumulate = (frameId, point, sign) => {
      for (let pathFrameId of ctx.frameIdPathMap.get(frameId)) {
        const value = ctx.velMatMap.get(pathFrameId).matMul(point).dataSync();
        const row = rows.get(pathFrameId);
        row[0] += sign * value[0];
        row[1] += sign * value[1];
      }
    };
    accumulate(this.frameId1, xP, 1);
    accumulate(this.frameId2, xQ, -1);
    return rows;
  }

  _requireMap(map, name = required('name')) {
    // No `required()` default on `map`: an absent map is exactly the case this
    // guard exists to report, and the generic missing-argument error would
    // preempt it with a message that names nothing useful.
    if (!map) {
      throw new Error(
        `Constraint needs \`${name}\`; the context was built for a trial ` +
          'configuration, which carries no velocities',
      );
    }
    return map;
  }

  /** `ḋ = S_a x_P − S_b x_Q`, from the spatial twists. */
  _separationVelocity(
    ctx = required('ctx'),
    xP = required('xP'),
    xQ = required('xQ'),
  ) {
    const velSumMatMap = this._requireMap(ctx.velSumMatMap, 'velSumMatMap');
    const a = velSumMatMap.get(this.frameId1).matMul(xP).dataSync();
    const b = velSumMatMap.get(this.frameId2).matMul(xQ).dataSync();
    return [a[0] - b[0], a[1] - b[1]];
  }

  /**
   * `J̇_d q̇ = A_a x_P − A_b x_Q`, from the bias accelerations.
   *
   * This is the *separation's* bias. Each constraint type derives its own
   * `J̇q̇` from it, and they differ — conflating the two is the error
   * `docs/constraints.md` §4 exists to prevent.
   */
  _separationBias(
    ctx = required('ctx'),
    xP = required('xP'),
    xQ = required('xQ'),
  ) {
    const accelSumMatMap = this._requireMap(
      ctx.accelSumMatMap,
      'accelSumMatMap',
    );
    const a = accelSumMatMap.get(this.frameId1).matMul(xP).dataSync();
    const b = accelSumMatMap.get(this.frameId2).matMul(xQ).dataSync();
    return [a[0] - b[0], a[1] - b[1]];
  }

  dispose() {
    this.position1.dispose();
    this.position2.dispose();
  }

  _positionsJsonObj() {
    return tf.tidy(() => ({
      position1: [...this.position1.dataSync().slice(0, 2)],
      position2: [...this.position2.dataSync().slice(0, 2)],
    }));
  }
}

/**
 * `C = ½(‖d‖² − L²)` — one row. A rigid massless link, free to swing about
 * both ends; the rope of a cart-and-poles rig.
 *
 * Degenerates as `‖d‖ → 0`, where the gradient vanishes and the row goes
 * blank, so `length` must be positive.
 */
export class DistanceConstraint extends Constraint {
  constructor({ length = required('length'), ...rest } = {}) {
    super(rest);
    if (!(length > 0)) {
      throw new Error(
        `DistanceConstraint length must be positive; got ${length}`,
      );
    }
    this.length = length;
  }

  get typeName() {
    return 'DistanceConstraint';
  }

  get rowCount() {
    return 1;
  }

  value(ctx = required('ctx')) {
    return tf.tidy(() => {
      const d = this._separation(...this._worldPoints(ctx));
      return [0.5 * (d[0] * d[0] + d[1] * d[1] - this.length * this.length)];
    });
  }

  jacobianRows(ctx = required('ctx')) {
    return tf.tidy(() => {
      const [xP, xQ] = this._worldPoints(ctx);
      const d = this._separation(xP, xQ);
      // ∂C/∂qⁱ = dᵀ (J_d)_i
      const columns = this._separationJacobian(ctx, xP, xQ);
      return [
        ctx.sortedFrames.map((frame) => {
          const column = columns.get(frame.id);
          return d[0] * column[0] + d[1] * column[1];
        }),
      ];
    });
  }

  bias(ctx = required('ctx')) {
    return tf.tidy(() => {
      const [xP, xQ] = this._worldPoints(ctx);
      const d = this._separation(xP, xQ);
      const dDot = this._separationVelocity(ctx, xP, xQ);
      const beta = this._separationBias(ctx, xP, xQ);
      // J̇q̇ = ‖ḋ‖² + dᵀ(A_a x_P − A_b x_Q). The ‖ḋ‖² term is what
      // distinguishes this from the coincidence case.
      return [
        dDot[0] * dDot[0] + dDot[1] * dDot[1] + d[0] * beta[0] + d[1] * beta[1],
      ];
    });
  }

  toJsonObj() {
    return {
      frame1: this.frameId1,
      frame2: this.frameId2,
      length: this.length,
      ...this._positionsJsonObj(),
      type: this.typeName,
    };
  }
}

/**
 * `C = d = 0` — two rows. A true pin joint, welding the two attachment points
 * together.
 *
 * Linear in `d`, so unlike the distance form there is no degeneracy at the
 * target; the price is that it removes two degrees of freedom rather than one.
 */
export class CoincidenceConstraint extends Constraint {
  get typeName() {
    return 'CoincidenceConstraint';
  }

  get rowCount() {
    return 2;
  }

  value(ctx = required('ctx')) {
    return tf.tidy(() => this._separation(...this._worldPoints(ctx)));
  }

  jacobianRows(ctx = required('ctx')) {
    return tf.tidy(() => {
      const columns = this._separationJacobian(ctx, ...this._worldPoints(ctx));
      return [0, 1].map((axis) =>
        ctx.sortedFrames.map((frame) => columns.get(frame.id)[axis]),
      );
    });
  }

  bias(ctx = required('ctx')) {
    return tf.tidy(() =>
      this._separationBias(ctx, ...this._worldPoints(ctx)),
    );
  }

  toJsonObj() {
    return {
      frame1: this.frameId1,
      frame2: this.frameId2,
      ...this._positionsJsonObj(),
      type: this.typeName,
    };
  }
}
