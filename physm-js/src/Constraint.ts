import * as mat3 from './Mat3';
import * as vec3 from './Vec3';
import type Frame from './Frame';
import type { FrameId } from './Frame';
import type { Mat3 } from './Mat3';
import type { Vec3 } from './Vec3';
import { required } from './utils';

/** A position as a scene author may write it. */
export type PositionLike = number | readonly number[] | Vec3;

/**
 * Everything a constraint reads about a pose.
 *
 * `posMatMap` and `velMatMap` depend on `q` alone, so `value` and
 * `jacobianRows` are answerable at a trial configuration no solve was run at.
 * The velocity-dependent maps are absent there, and `bias` says so rather than
 * reading stale ones.
 */
export interface ConstraintCtx {
  sortedFrames: readonly Frame[];
  frameIdPathMap: Map<FrameId, FrameId[]>;
  posMatMap: Map<FrameId, Mat3>;
  velMatMap: Map<FrameId, Mat3>;
  velSumMatMap?: Map<FrameId, Mat3> | undefined;
  accelSumMatMap?: Map<FrameId, Mat3> | undefined;
}

export interface ConstraintOptions {
  frame1: FrameId | Frame;
  frame2: FrameId | Frame;
  position1?: PositionLike;
  position2?: PositionLike | null;
}

/** A `[x, y]` pair; the planar part of a separation or a Jacobian column. */
type Planar = [number, number];

// How far an authored value may sit from the geometry before it counts as a
// disagreement rather than rounding.
//
// Relative, not absolute: the residual between two points that *are* the same
// point grows with the scene's coordinate magnitude while an absolute threshold
// does not, so a fixed one refuses a geometrically correct rig as soon as it
// grows -- measured under float32, the demo stopped building at nine rope
// segments instead of five.
//
// It stays relative now that the arithmetic is float64, and stays at `1e-5`
// rather than tightening to match: what it guards is an *authoring* mistake, and
// a person placing frames by eye is not accurate to twelve digits.
export const CONSISTENCY_RELATIVE_TOLERANCE = 1e-5;

export function consistencyTolerance(scale = 0): number {
  // The floor keeps a scene authored near the origin from demanding exactness
  // no floating-point computation can deliver.
  return Math.max(1e-12, CONSISTENCY_RELATIVE_TOLERANCE * Math.abs(scale));
}

/** A map lookup that fails loudly rather than yielding `undefined`. */
function mapGet(map: Map<FrameId, Mat3>, frameId: FrameId): Mat3 {
  const value = map.get(frameId);
  if (!value) {
    throw new Error(`No entry for frame ${frameId}`);
  }

  return value;
}

/**
 * Add one attachment point's contribution along its root path.
 *
 * `(J_d)_i` is non-zero only for frames that can move the point, which is
 * exactly its inclusive ancestors.
 */
function accumulateRootPath(
  ctx: ConstraintCtx,
  rows: Map<FrameId, Planar>,
  frameId: FrameId,
  point: Vec3,
  sign: number,
): void {
  for (const pathFrameId of ctx.frameIdPathMap.get(frameId) ?? []) {
    const velocity = mat3.apply(mapGet(ctx.velMatMap, pathFrameId), point);
    const row = rows.get(pathFrameId);
    if (!row) {
      continue;
    }

    row[0] += sign * velocity[0];
    row[1] += sign * velocity[1];
  }
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
  readonly frameId1: FrameId;
  readonly frameId2: FrameId;
  readonly position1: Vec3;
  position2: Vec3;

  /** Set by `Scene.addConstraint` when the author opted out of the check. */
  allowInitialViolation = false;

  /**
   * The free parameter each type leaves unspecified, declared here because
   * `Scene.addConstraint` is what fills them in and needs one interface to do
   * it against. A type that has neither simply leaves both undefined.
   */
  length?: number | null;
  inferPosition2?: boolean;

  /** Overridden by every concrete type; the base is not instantiable in use. */
  get typeName(): string {
    return this.constructor.name;
  }

  get rowCount(): number {
    throw new Error('not implemented');
  }

  /** The shape a scene serializes this constraint as. */
  toJsonObj(): Record<string, unknown> {
    throw new Error('not implemented');
  }

  /** `C(q)`, one entry per row. Zero when the constraint is satisfied. */
  value(_ctx: ConstraintCtx): number[] {
    throw new Error('not implemented');
  }

  /** `J = ∂C/∂q`, one row per constraint row and one column per coordinate. */
  jacobianRows(_ctx: ConstraintCtx): number[][] {
    throw new Error('not implemented');
  }

  /** `J̇q̇`, which the augmented system negates onto its right-hand side. */
  bias(_ctx: ConstraintCtx): number[] {
    throw new Error('not implemented');
  }

  /**
   * Reconcile the constraint with the gap the scene places between its two
   * attachment points, now that there is a scene to measure.
   *
   * The base behaviour is the coincidence one: the two points have to be the
   * same point, so a gap is a violation. A type with a free parameter to solve
   * for overrides this and solves for it instead.
   */
  resolveGeometry(measured: number, scale = 1): this {
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
    frame1,
    frame2,
    position1 = [0, 0],
    position2 = [0, 0],
  }: ConstraintOptions) {
    this.frameId1 = typeof frame1 === 'string' ? frame1 : frame1.id;
    this.frameId2 = typeof frame2 === 'string' ? frame2 : frame2.id;
    this.position1 = vec3.coerce(position1);
    this.position2 = vec3.coerce(position2 ?? [0, 0]);
  }

  /**
   * World positions of the two attachment points, as `[3, 1]` tensors.
   *
   * Every quantity below is expressed in terms of these rather than the local
   * attachment vectors: `V_i`, `S_i` and `A_i` are all *spatial* operators, so
   * they act on a world point.
   */
  _worldPoints(ctx: ConstraintCtx): [Vec3, Vec3] {
    return [
      mat3.apply(this._poseOf(ctx, this.frameId1), this.position1),
      mat3.apply(this._poseOf(ctx, this.frameId2), this.position2),
    ];
  }

  _poseOf(ctx: ConstraintCtx, frameId: FrameId): Mat3 {
    const pose = ctx.posMatMap.get(frameId);
    if (!pose) {
      throw new Error(
        `Constraint references a frame not in the pose: ${frameId}`,
      );
    }

    return pose;
  }

  /** The separation `d = x_P − x_Q`, as a plain `[x, y]` pair. */
  _separation(xP: Vec3, xQ: Vec3): Planar {
    return [xP[0] - xQ[0], xP[1] - xQ[1]];
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
    ctx: ConstraintCtx,
    xP: Vec3,
    xQ: Vec3,
  ): Map<FrameId, Planar> {
    const rows = new Map<FrameId, Planar>(
      ctx.sortedFrames.map((frame) => [frame.id, [0, 0]]),
    );

    accumulateRootPath(ctx, rows, this.frameId1, xP, 1);
    accumulateRootPath(ctx, rows, this.frameId2, xQ, -1);

    return rows;
  }

  _requireMap<T>(map: T | undefined, name: string): T {
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
  _separationVelocity(ctx: ConstraintCtx, xP: Vec3, xQ: Vec3): Planar {
    const velSumMatMap = this._requireMap(ctx.velSumMatMap, 'velSumMatMap');
    const a = mat3.apply(mapGet(velSumMatMap, this.frameId1), xP);
    const b = mat3.apply(mapGet(velSumMatMap, this.frameId2), xQ);

    return [a[0] - b[0], a[1] - b[1]];
  }

  /**
   * `J̇_d q̇ = A_a x_P − A_b x_Q`, from the bias accelerations.
   *
   * This is the *separation's* bias. Each constraint type derives its own
   * `J̇q̇` from it, and they differ — conflating the two is the error
   * `docs/constraints.md` §4 exists to prevent.
   */
  _separationBias(ctx: ConstraintCtx, xP: Vec3, xQ: Vec3): Planar {
    const accelSumMatMap = this._requireMap(
      ctx.accelSumMatMap,
      'accelSumMatMap',
    );
    const a = mat3.apply(mapGet(accelSumMatMap, this.frameId1), xP);
    const b = mat3.apply(mapGet(accelSumMatMap, this.frameId2), xQ);

    return [a[0] - b[0], a[1] - b[1]];
  }

  /** Install a solved attachment point, replacing the placeholder. */
  setPosition2(position: PositionLike): this {
    this.position2 = vec3.coerce(position);

    return this;
  }

  /** The attachment points as plain `[x, y]`, in their own frames' coordinates. */
  get localPosition1(): readonly [number, number] {
    return vec3.toPlanar(this.position1);
  }

  get localPosition2(): readonly [number, number] {
    return vec3.toPlanar(this.position2);
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
export interface DistanceConstraintOptions extends ConstraintOptions {
  length?: number | null;
}

export class DistanceConstraint extends Constraint {
  /** `null` until `Scene.addConstraint` measures it against the pose. */
  override length: number | null;

  constructor({ length = null, ...rest }: DistanceConstraintOptions) {
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

  override resolveGeometry(measured: number, scale = 1): this {
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

  override get typeName(): string {
    return 'DistanceConstraint';
  }

  override get rowCount(): number {
    return 1;
  }

  override value(ctx: ConstraintCtx): number[] {
    const d = this._separation(...this._worldPoints(ctx));
    return [0.5 * (d[0] * d[0] + d[1] * d[1] - (this.length ?? 0) ** 2)];
  }

  override jacobianRows(ctx: ConstraintCtx): number[][] {
    const [xP, xQ] = this._worldPoints(ctx);
    const d = this._separation(xP, xQ);
    // ∂C/∂qⁱ = dᵀ (J_d)_i
    const columns = this._separationJacobian(ctx, xP, xQ);
    return [
      ctx.sortedFrames.map((frame) => {
        const column = columns.get(frame.id) ?? [0, 0];

        return d[0] * column[0] + d[1] * column[1];
      }),
    ];
  }

  override bias(ctx: ConstraintCtx): number[] {
    const [xP, xQ] = this._worldPoints(ctx);
    const d = this._separation(xP, xQ);
    const dDot = this._separationVelocity(ctx, xP, xQ);
    const beta = this._separationBias(ctx, xP, xQ);
    // J̇q̇ = ‖ḋ‖² + dᵀ(A_a x_P − A_b x_Q). The ‖ḋ‖² term is what
    // distinguishes this from the coincidence case.
    return [
      dDot[0] * dDot[0] + dDot[1] * dDot[1] + d[0] * beta[0] + d[1] * beta[1],
    ];
  }

  override toJsonObj() {
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
  /** Whether `Scene.addConstraint` should solve for the second attachment. */
  override readonly inferPosition2: boolean;

  constructor({ position2 = null, ...rest }: ConstraintOptions) {
    super({ ...rest, position2: position2 ?? vec3.ORIGIN });
    // `null` means "wherever frame 2 has to be touched for this to hold" —
    // solved for by `Scene.addConstraint`, which is the first moment there is a
    // pose to solve against.
    this.inferPosition2 = position2 == null;
  }

  override get typeName(): string {
    return 'CoincidenceConstraint';
  }

  override get rowCount(): number {
    return 2;
  }

  override value(ctx: ConstraintCtx): number[] {
    return this._separation(...this._worldPoints(ctx));
  }

  override jacobianRows(ctx: ConstraintCtx): number[][] {
    // `C = d`, so the Jacobian *is* `J_d`: one row per axis, taken straight.
    const columns = this._separationJacobian(ctx, ...this._worldPoints(ctx));

    return [0, 1].map((axis) =>
      ctx.sortedFrames.map((frame) => {
        const column = columns.get(frame.id) ?? [0, 0];

        return axis === 0 ? column[0] : column[1];
      }),
    );
  }

  override bias(ctx: ConstraintCtx): number[] {
    return this._separationBias(ctx, ...this._worldPoints(ctx));
  }

  override toJsonObj(): Record<string, unknown> {
    return {
      frame1: this.frameId1,
      frame2: this.frameId2,
      ...this._positionsJsonObj(),
      type: this.typeName,
    };
  }
}
