import * as tf from './tfjs';
import { coercePositionVector } from './utils';
import { required } from './utils';
import { ZERO_POS } from './utils';

// How far an authored value may sit from the geometry before it counts as a
// disagreement rather than rounding.
//
// Relative, not absolute. Poses are measured through tfjs, which is float32, so
// the residual between two points that *are* the same point grows with the
// scene's coordinate magnitude while an absolute threshold does not. A fixed
// `1e-6` is about two ULP at the demo's scale, and refuses a geometrically
// correct rig as soon as it grows: measured, the demo stops building at nine
// rope segments instead of five, and a rig authored in millimetres rather than
// metres is judged differently from the same rig.
export const CONSISTENCY_RELATIVE_TOLERANCE = 1e-5;

export function consistencyTolerance(scale = 0) {
  // The floor keeps a scene authored near the origin from demanding exactness
  // no float32 computation can deliver.
  return Math.max(1e-9, CONSISTENCY_RELATIVE_TOLERANCE * Math.abs(scale));
}

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
  /**
   * Reconcile the constraint with the gap the scene places between its two
   * attachment points, now that there is a scene to measure.
   *
   * The base behaviour is the coincidence one: the two points have to be the
   * same point, so a gap is a violation. A type with a free parameter to solve
   * for overrides this and solves for it instead.
   */
  resolveGeometry(measured = required('measured'), scale = 1) {
    // `scale` is the magnitude of the coordinates involved, never `measured`
    // itself: `measured` is the quantity being tested against zero, so a
    // tolerance derived from it would reject every non-zero value.
    if (measured > consistencyTolerance(scale)) {
      throw new Error(
        `${this.typeName} joins two points the scene places ${measured} ` +
          'apart. Constraint violation is conserved, not corrected, so they ' +
          'would never actually meet. Omit `position2` to have it solved for, ' +
          'or move the frames together.',
      );
    }
    return this;
  }

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
   * of the two root paths.
   *
   * On the shared prefix both indicators fire, so the column collapses to
   * `V_i d` — a function of the gap alone, wherever the two points sit. For a
   * *prismatic* ancestor `V_i` has no rotational part and that is exactly
   * zero, which is why a rope slung between two arms of the same cart exerts
   * no net generalized force on the cart. For a *revolute* one it does not
   * vanish, and should not: the two equal-and-opposite constraint forces act
   * at different points and leave a couple.
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

  setPosition2(position = required('position')) {
    /** Install a solved attachment point, replacing the placeholder. */
    this.position2.dispose();
    this.position2 = coercePositionVector(position);
    return this;
  }

  dispose() {
    this.position1.dispose();
    this.position2.dispose();
  }

  /** The attachment points as plain `[x, y]`, in their own frames' coordinates. */
  get localPosition1() {
    return tf.tidy(() => [...this.position1.dataSync().slice(0, 2)]);
  }

  get localPosition2() {
    return tf.tidy(() => [...this.position2.dataSync().slice(0, 2)]);
  }

  _positionsJsonObj() {
    return {
      position1: this.localPosition1,
      position2: this.localPosition2,
    };
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
  constructor({ length = null, ...rest } = {}) {
    super(rest);
    if (length != null && !(length > 0)) {
      throw new Error(
        `DistanceConstraint length must be positive; got ${length}`,
      );
    }
    // `null` means "however far apart the scene places them" — resolved by
    // `Scene.addConstraint`, which is the first moment there is a scene to
    // measure. Until then the constraint is well-formed but not yet answerable.
    this.length = length;
  }

  resolveGeometry(measured = required('measured'), scale = 1) {
    /**
     * Fix the rest length against the geometry the scene actually places.
     *
     * An unset `length` adopts the measurement, which is the ergonomic default:
     * a rope authored between two points is as long as the gap between them. An
     * explicit one is checked against it, because a `length` that disagrees
     * with the pose is an inconsistent initial condition, and this formulation
     * has no way to work one off — `C` keeps whatever value it starts with, so
     * the disagreement is permanent and silent.
     */
    if (this.length == null) {
      if (!(measured > 0)) {
        throw new Error(
          'DistanceConstraint has no length and the scene places its two ' +
            `attachment points ${measured} apart, which is degenerate; ` +
            'separate them, or set an explicit length',
        );
      }
      this.length = measured;
    } else if (
      Math.abs(this.length - measured) >
      consistencyTolerance(Math.max(this.length, measured, scale))
    ) {
      throw new Error(
        `DistanceConstraint length ${this.length} disagrees with the ` +
          `${measured} the scene places between its attachment points. ` +
          'Constraint violation is conserved, not corrected, so the gap ' +
          'would persist for the life of the simulation; move the frames, ' +
          'or drop the explicit length to adopt the measured one.',
      );
    }
    return this;
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
    if (this.length == null) {
      throw new Error(
        'DistanceConstraint has no length yet, so there is nothing to ' +
          'serialize. A length is resolved by `Scene.addConstraint`, against ' +
          'the geometry the scene places.',
      );
    }
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
  constructor({ position2 = null, ...rest } = {}) {
    super({ ...rest, position2: position2 == null ? ZERO_POS : position2 });
    // `null` means "wherever frame 2 has to be touched for this to hold" —
    // solved for by `Scene.addConstraint`, which is the first moment there is a
    // pose to solve against.
    this.inferPosition2 = position2 == null;
  }

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
