import * as daglet from './daglet';
import * as mat3 from './Mat3';
import * as vec3 from './Vec3';
import { CONSISTENCY_RELATIVE_TOLERANCE } from './Constraint';
import { ZERO_STATE } from './State';
import { SingularMatrixError } from './solveLinearSystem';
import { factor, fromRows, solveFactored } from './solveLinearSystem';
import type Constraint from './Constraint';
import type Decal from './Decal';
import type Frame from './Frame';
import type { ConstraintCtx } from './Constraint';
import type { FrameId, StateMap } from './Frame';
import type { Mat3 } from './Mat3';
import type { Vec3 } from './Vec3';
import type { State } from './State';

/**
 * A lookup into a table this class derived itself.
 *
 * Every such key is present by construction -- `sortedFrames` and the maps are
 * built together -- so a miss is a bug in this file rather than bad input, and
 * should say so rather than propagating an `undefined`.
 */
function mapGet<K, V>(map: Map<K, V>, key: K, what: string): V {
  const value = map.get(key);
  if (value === undefined) {
    throw new Error(`No ${what} for ${String(key)}`);
  }

  return value;
}

/**
 * An index into an array this class sized itself.
 *
 * The array counterpart of `mapGet`, and there for the same reason: every such
 * index is in range by construction, so a miss is a bug here rather than bad
 * input. A `?? 0` in its place would turn that bug into a plausible-looking
 * wrong number, which is the one outcome worth ruling out in a solver.
 */
function at<T>(array: readonly T[], index: number, what: string): T {
  const value = array[index];
  if (value === undefined) {
    throw new Error(`No ${what} at index ${index}`);
  }

  return value;
}

/** The dot product of two equal-length rows. */
function dotRows(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Row length mismatch: ${a.length} vs ${b.length}`);
  }

  return a.reduce(
    (total, entry, index) => total + entry * at(b, index, 'row entry'),
    0,
  );
}

export const DEFAULT_GRAVITY = 10;

export interface SceneOptions {
  decals?: Decal[];
  frames?: Frame[];
  springs?: unknown[];
  constraints?: Constraint[];
  gravity?: number;
}

export interface AddConstraintOptions {
  allowInitialViolation?: boolean;
  posMatMap?: Map<FrameId, Mat3> | null;
}

/** A point, as any of the shapes the query API accepts for one. */
export type PositionLike = number | readonly number[] | Vec3;

/** What `getSeparation` reports: the vector `d = x₁ − x₂`, and its length. */
export interface Separation {
  vector: readonly [number, number];
  distance: number;
}

export interface PoseQueryOptions {
  stateMap?: StateMap | null;
  posMatMap?: Map<FrameId, Mat3> | null;
}

export default class Scene {
  readonly decals: Decal[];
  readonly frames: Frame[];
  readonly springs: unknown[];
  readonly constraints: Constraint[];
  readonly gravity: number;
  readonly sortedFrames: Frame[];
  readonly frameMap: Map<FrameId, Frame>;
  readonly frameIdParentMap: Map<FrameId, FrameId | null>;
  readonly frameIdPathMap: Map<FrameId, FrameId[]>;

  constructor({
    decals = [],
    frames = [],
    springs = [],
    constraints = [],
    gravity = DEFAULT_GRAVITY,
  }: SceneOptions = {}) {
    this.decals = decals;
    this.frames = frames;
    this.springs = springs;
    // Constraints are added below rather than assigned: `addConstraint` is
    // where a constraint is checked against the frame set and solved against
    // the pose, and a second door into this list would be one nobody has to
    // opt out of.
    this.constraints = [];
    this.gravity = gravity;

    const getFrameChildren = (frame: Frame): Frame[] => frame.frames;
    const getFrameId = (frame: Frame): FrameId => frame.id;
    this.sortedFrames = daglet
      .toposort(this.frames, {
        getNodeParents: getFrameChildren,
        getNodeKey: getFrameId,
      })
      .reverse();
    this.frameMap = new Map(
      this.sortedFrames.map((frame): [FrameId, Frame] => [frame.id, frame]),
    );
    const frameIdParentsMap = daglet.getChildMap(this.sortedFrames, {
      getNodeParents: getFrameChildren,
      getNodeKey: getFrameId,
    });
    if ([...frameIdParentsMap.values()].some((parents) => parents.size > 1)) {
      throw new Error('Frames should only have one parent'); // TODO: use AssertionError?
    }
    this.frameIdParentMap = new Map(
      [...frameIdParentsMap].map(
        ([frameId, parents]): [FrameId, FrameId | null] => [
          frameId,
          parents.size ? ([...parents][0]?.id ?? null) : null,
        ],
      ),
    );
    this.frameIdPathMap = daglet.transformNodes(this.sortedFrames, {
      getNodeParents: (frame: Frame) => [
        ...(frameIdParentsMap.get(frame.id) ?? []),
      ],
      getNodeKey: getFrameId,
      visitNode: (frame: Frame, parentPaths: readonly FrameId[][]) =>
        parentPaths.length
          ? [...at(parentPaths, 0, 'parent path'), frame.id]
          : [frame.id],
    });
    // ...only now, with the derived tables built, is there a pose to solve
    // constraints against. One pose for the whole list: `addConstraint` moves
    // the constraint, never the scene, so re-sweeping per constraint would
    // re-derive the same matrices.
    if (constraints.length) {
      const posMatMap = this.getPosMatrixMap();
      constraints.forEach((constraint) =>
        this.addConstraint(constraint, { posMatMap }),
      );
    }
  }

  getPosMatrixMap(stateMap: StateMap | null = null): Map<FrameId, Mat3> {
    /**
     * The local->global position transformation matrix of every frame, indexed
     * by frame id — the scene's pose, as a function of its state.
     *
     * A frame missing from `stateMap` is read at its own `initialState` rather
     * than throwing, which is what makes this answerable about a scene that is
     * still being assembled — and which makes a partial map agree with an
     * omitted one, since omitting it is the same as mentioning nothing.
     */
    stateMap = stateMap || this.getInitialStateMap({ project: false });
    const posMatMap = new Map();
    for (const frame of this.sortedFrames) {
      const [q] = stateMap.get(frame.id) || frame.initialState;
      const parentId = this.frameIdParentMap.get(frame.id) ?? null;
      const localPosMat = frame.getLocalPosMatrix(q);
      const globalPosMat = parentId
        ? mat3.multiply(mapGet(posMatMap, parentId, 'pose'), localPosMat)
        : localPosMat;
      posMatMap.set(frame.id, globalPosMat);
    }
    return posMatMap;
  }

  getWorldPosition(
    frameId: FrameId,
    position: number | readonly number[] | Vec3 = vec3.ORIGIN,
    { stateMap = null, posMatMap = null }: PoseQueryOptions = {},
  ): readonly [number, number] {
    /**
     * Where a frame-relative position lands in the world, as a plain `[x, y]`.
     *
     * Pass `posMatMap` to answer several of these against one pose without
     * recomputing it; otherwise one is computed for this call alone.
     */
    if (!this.frameMap.has(frameId)) {
      throw new Error(`No such frame in scene: ${frameId}`);
    }

    const poses = posMatMap ?? this.getPosMatrixMap(stateMap);
    const pose = mapGet(poses, frameId, 'pose');

    return vec3.toPlanar(mat3.apply(pose, vec3.coerce(position)));
  }

  getLocalPosition(
    frameId: FrameId,
    worldPosition: number | readonly number[] | Vec3 = vec3.ORIGIN,
    { stateMap = null, posMatMap = null }: PoseQueryOptions = {},
  ): readonly [number, number] {
    /**
     * The inverse of `getWorldPosition`: where a world point sits in a frame's
     * own coordinates.
     *
     * This is what makes a coincidence constraint constructible without the
     * author solving any geometry. Pin frame `b` to a chosen point on frame
     * `a`, and the attachment on `b` is `M_b⁻¹ M_a r_a` — exact, always
     * defined, and satisfied at `t = 0` by construction rather than by check.
     */
    if (!this.frameMap.has(frameId)) {
      throw new Error(`No such frame in scene: ${frameId}`);
    }
    const poses = posMatMap ?? this.getPosMatrixMap(stateMap);
    const pose = mapGet(poses, frameId, 'pose');

    return vec3.toPlanar(
      mat3.apply(mat3.invertRigid(pose), vec3.coerce(worldPosition)),
    );
  }

  /** Frame origins to frame origins, the common case. */
  getSeparation(
    frameId1: FrameId,
    frameId2: FrameId,
    options?: PoseQueryOptions,
  ): Separation;

  /** Named points on each frame. */
  getSeparation(
    frameId1: FrameId,
    position1: PositionLike,
    frameId2: FrameId,
    position2?: PositionLike,
    options?: PoseQueryOptions,
  ): Separation;

  getSeparation(frameId1: FrameId, ...rest: unknown[]): Separation {
    /**
     * The gap between two frame-relative positions: `{ vector, distance }`.
     *
     * `vector` is the constraint's own `d = x₁ − x₂` — first *minus* second,
     * matching `Constraint._separation` rather than reading left-to-right. Two
     * opposite conventions under one word is worse than either, and `d` is the
     * one with things depending on it: it is what `jacobianRows` contracts
     * against, and it is `CoincidenceConstraint.value` verbatim.
     *
     * The two-id form is the ergonomic probe a scene builder wants — "how far
     * apart are these two frames?" should not require naming two origins. It is
     * an overload rather than a defaulted parameter because a default would
     * make `frameId2` optional to the compiler, putting a required argument
     * back behind a runtime check.
     */
    const twoIds = typeof rest[0] === 'string';
    const [position1, frameId2, position2, options] = twoIds
      ? [vec3.ORIGIN, rest[0] as FrameId, vec3.ORIGIN, rest[1]]
      : [
          rest[0] as PositionLike,
          rest[1] as FrameId,
          rest[2] ?? vec3.ORIGIN,
          rest[3],
        ];
    const { stateMap = null, posMatMap = null } =
      (options as PoseQueryOptions | undefined) ?? {};

    // Both ids checked before anything is allocated, so an unknown one fails
    // before any work is done rather than partway through it.
    for (const frameId of [frameId1, frameId2]) {
      if (!this.frameMap.has(frameId)) {
        throw new Error(`No such frame in scene: ${frameId}`);
      }
    }
    const shared = posMatMap ?? this.getPosMatrixMap(stateMap);
    const p = this.getWorldPosition(frameId1, position1 as PositionLike, {
      posMatMap: shared,
    });
    const q = this.getWorldPosition(frameId2, position2 as PositionLike, {
      posMatMap: shared,
    });
    const vector: readonly [number, number] = [p[0] - q[0], p[1] - q[1]];

    return { vector, distance: Math.hypot(...vector) };
  }

  addConstraint(
    constraint: Constraint,
    {
      allowInitialViolation = false,
      posMatMap = null,
    }: AddConstraintOptions = {},
  ): this {
    /**
     * Add a loop-closure constraint, mirroring `Scene::add_constraint` in
     * physm-rs. Must be called after the frames it names are in the scene,
     * because this is where the constraint is *solved against* them.
     *
     * Each constraint type leaves one thing unspecified, and this is where it
     * gets filled in from the pose the scene is actually in:
     *
     * | type | free parameter | resolved to |
     * | --- | --- | --- |
     * | `DistanceConstraint` | `length` | the gap between the two attachments |
     * | `CoincidenceConstraint` | `position2` | `M₂⁻¹ M₁ r₁` |
     *
     * That is the position half of `docs/constraints.md` §7, and solving beats
     * checking: an author places the frames wherever they belong and names one
     * attachment point, and the constraint holds at `t = 0` by construction.
     * There is no geometry to get right, so there is nothing to reject — which
     * matters most for a scene nobody typed, where "move the frames until the
     * points coincide" is not advice anything can act on.
     *
     * A value the author *does* supply is still checked against the pose,
     * because a stated one that disagrees is a violation this formulation
     * conserves rather than corrects.
     *
     * `allowInitialViolation` keeps an authored value that disagrees, and
     * suppresses the velocity projection in `getInitialStateMap` too, so the
     * flag means one thing: this scene is inconsistent on purpose. The tests
     * for this formulation need it — `C(t) = C₀ + Ċ₀t` is only observable from
     * a scene where those are non-zero.
     */
    const [frameId1, frameId2] = [constraint.frameId1, constraint.frameId2];
    for (const frameId of [frameId1, frameId2]) {
      if (!this.frameMap.has(frameId)) {
        throw new Error(
          `Constraint references a frame the scene does not contain: ` +
            `${frameId}. Add the frame first, or check the id.`,
        );
      }
    }
    const shared = posMatMap ?? this.getPosMatrixMap();

    if (constraint.inferPosition2) {
      // Solve for the attachment on frame 2 that puts it on frame 1's chosen
      // point. Exact, and defined however far apart the two frames happen to
      // be -- the constraint absorbs the gap instead of the author closing it.
      constraint.setPosition2(
        this.getLocalPosition(
          frameId2,
          this.getWorldPosition(frameId1, constraint.localPosition1, {
            posMatMap: shared,
          }),
          { posMatMap: shared },
        ),
      );
    }

    // `CoincidenceConstraint` has no `length`, so `undefined === null` is false
    // and this reduces to the authored-value check it never needs.
    if (constraint.length === null || !allowInitialViolation) {
      const p = this.getWorldPosition(frameId1, constraint.localPosition1, {
        posMatMap: shared,
      });
      const q = this.getWorldPosition(frameId2, constraint.localPosition2, {
        posMatMap: shared,
      });
      // The tolerance scales with how far from the origin the scene works.
      // Floating point resolves a fixed number of significant figures, not a
      // fixed absolute step, so a gap that is negligible for a scene spanning
      // thousands is a real separation for one spanning fractions.
      const scale = Math.max(...p.map(Math.abs), ...q.map(Math.abs), 1);
      constraint.resolveGeometry(Math.hypot(p[0] - q[0], p[1] - q[1]), scale);
    }
    this.constraints.push(constraint);
    constraint.allowInitialViolation = allowInitialViolation;
    return this;
  }

  getInvPosMatrixMap(posMatMap: Map<FrameId, Mat3>): Map<FrameId, Mat3> {
    /**
     * The global->local ("inverse") transformation of every frame.
     *
     * `invertRigid`, not the general `invert`: every pose matrix is a product
     * of `C_k exp(q^k zeta_k)` and so is rigid by construction. The general
     * path has to decide whether a determinant is meaningfully non-zero, and
     * a rigid transform carrying a large translation is the input it finds
     * hardest -- while the rigid path transposes the rotation block and is
     * exact for any translation at all.
     */
    return new Map(
      [...posMatMap].map(([frameId, posMat]) => [
        frameId,
        mat3.invertRigid(posMat),
      ]),
    );
  }

  getVelMatrixMap(
    posMatMap: Map<FrameId, Mat3>,
    invPosMatMap: Map<FrameId, Mat3>,
    stateMap: StateMap | null = null,
  ): Map<FrameId, Mat3> {
    /**
     * The velocity field of every frame in global coordinates: right-multiply
     * one by a global position to get the global velocity of that point, per
     * unit of the frame's own coordinate.
     */
    stateMap = stateMap || this.getInitialStateMap({ project: false });
    return new Map(
      this.sortedFrames.map((frame) => {
        const [q] = stateMap.get(frame.id) || frame.initialState;
        const parentId = this.frameIdParentMap.get(frame.id) ?? null;
        const localVelMat = frame.getLocalVelMatrix(q);
        const relVelMat = mat3.multiply(
          localVelMat,
          mapGet(invPosMatMap, frame.id, 'inverse pose'),
        );
        const globalVelMat = parentId
          ? mat3.multiply(mapGet(posMatMap, parentId, 'pose'), relVelMat)
          : relVelMat;
        return [frame.id, globalVelMat];
      }),
    );
  }

  getConfigKinematics(stateMap: StateMap | null = null): ConstraintCtx {
    /**
     * Everything a constraint's `value` and `jacobianRows` read, as a function
     * of `q` alone — see `docs/constraints.md` §7.
     *
     * It lives on the scene rather than the solver because it is a question
     * about a *pose*, and asking it does not imply simulating anything: a
     * trial configuration no solve was run at is a perfectly good input, which
     * is what makes position projection implementable later.
     *
     * The result carries no velocity-dependent maps, so `bias` throws on it.
     */
    const posMatMap = this.getPosMatrixMap(stateMap);
    const invPosMatMap = this.getInvPosMatrixMap(posMatMap);
    const velMatMap = this.getVelMatrixMap(posMatMap, invPosMatMap, stateMap);
    return {
      sortedFrames: this.sortedFrames,
      frameIdPathMap: this.frameIdPathMap,
      posMatMap,
      velMatMap,
    };
  }

  getWeightPosMap(posMatMap: Map<FrameId, Mat3>): Map<FrameId, Vec3[]> {
    /**
     * Every point mass in world coordinates, grouped by the frame carrying it.
     */
    return new Map(
      this.sortedFrames.map((frame) => [
        frame.id,
        frame.weights.map((weight) =>
          mat3.apply(mapGet(posMatMap, frame.id, 'pose'), weight.position),
        ),
      ]),
    );
  }

  isFrameDescendent(descendentId: FrameId, ancestorId: FrameId): boolean {
    return (
      mapGet(this.frameIdPathMap, descendentId, 'frame path').indexOf(
        ancestorId,
      ) !== -1
    );
  }

  getMassMatrixEntry(
    rowIndex: number,
    colIndex: number,
    velMatMap: Map<FrameId, Mat3>,
    weightPosMap: Map<FrameId, Vec3[]>,
  ): number {
    /**
     * One entry of the metric: `g_ij = Σ_w m_w ⟨V_i x_w, V_j x_w⟩`, summed over
     * the weights both coordinates can move — which is the subtree below
     * whichever of the two is the descendant. Zero when they are incomparable,
     * since no weight is under both.
     */
    const frame1 = this.sortedFrames[rowIndex];
    const frame2 = this.sortedFrames[colIndex];
    if (!frame1 || !frame2) {
      throw new RangeError(
        `(${rowIndex}, ${colIndex}) is outside a ` +
          `${this.sortedFrames.length}-frame scene`,
      );
    }
    const baseId = this.isFrameDescendent(frame1.id, frame2.id)
      ? frame1.id
      : this.isFrameDescendent(frame2.id, frame1.id)
        ? frame2.id
        : null;
    if (baseId === null) {
      return 0;
    }
    const velMat1 = mapGet(velMatMap, frame1.id, 'velocity matrix');
    const velMat2 = mapGet(velMatMap, frame2.id, 'velocity matrix');
    let result = 0;
    for (const frame of this.sortedFrames) {
      if (!this.isFrameDescendent(frame.id, baseId)) {
        continue;
      }
      frame.weights.forEach((weight, index) => {
        const pos = at(
          mapGet(weightPosMap, frame.id, 'weight positions'),
          index,
          'weight position',
        );
        result +=
          weight.mass *
          vec3.dot(mat3.apply(velMat2, pos), mat3.apply(velMat1, pos));
      });
    }
    return result;
  }

  getMassMatrix(stateMap: StateMap | null = null): number[][] {
    /**
     * The mass matrix `g` at a pose — which `docs/algorithm.md` §5 identifies
     * as the **mass-weighted pullback metric**, `g_ij = Σ m_w ⟨V_i x_w, V_j x_w⟩`.
     *
     * It is a metric on configuration space and a function of `q` alone, which
     * is what puts it here rather than on the solver: the solver *uses* it to
     * turn forces into accelerations, but the object itself is geometry. The
     * projection below needs it for exactly that reason — orthogonality only
     * means something relative to a metric, and this is the scene's.
     */
    const posMatMap = this.getPosMatrixMap(stateMap);
    const invPosMatMap = this.getInvPosMatrixMap(posMatMap);
    const velMatMap = this.getVelMatrixMap(posMatMap, invPosMatMap, stateMap);
    const weightPosMap = this.getWeightPosMap(posMatMap);
    const array = this.sortedFrames.map((unused1, rowIndex) =>
      this.sortedFrames.map((unused2, colIndex) =>
        this.getMassMatrixEntry(rowIndex, colIndex, velMatMap, weightPosMap),
      ),
    );
    return array;
  }

  _getProjectedVelocities(
    stateMap: StateMap,
    constraints: readonly Constraint[],
  ): number[] {
    /**
     * The velocity half of the consistency step (`docs/constraints.md` §7):
     * the smallest correction to `q̇₀` that satisfies `J q̇ = 0`.
     *
     * `C(t) = C₀ + Ċ₀t` exactly under this formulation, so an initial velocity
     * that violates the constraint does not settle — it separates the rig
     * linearly, forever, at a rate nobody chose. And the symptom is a slow
     * drift, indistinguishable at a glance from the numerical drift a
     * stabilizer is meant to fix: the predicted behaviour arrives on schedule
     * and confirms the wrong diagnosis.
     *
     * The correction is `q̇ ← q̇ − g⁻¹Jᵀ(Jg⁻¹Jᵀ)⁻¹J q̇` — orthogonal with respect
     * to the scene's own metric `g`, not to the Euclidean one.
     *
     * That distinction is the whole of it. A plain least-norm correction
     * minimises `‖Δq̇‖₂`, which adds a `TrackFrame`'s metres per second to a
     * `RotationalFrame`'s radians per second and so has no physical meaning:
     * measured, the same rig authored in millimetres, metres and kilometres
     * gets three different answers, one of which stops the pendulum dead. The
     * metric version minimises `½Δq̇ᵀgΔq̇` instead — the kinetic energy of the
     * correction, which is Gauss's principle of least constraint — and being
     * an energy it does not care what unit anybody authored lengths in.
     *
     * It is also the same object the solver applies every step: `Δq̇ = g⁻¹Jᵀλ`
     * is a generalized *force* along `Jᵀ`, not a velocity along it.
     */
    const qd = this.sortedFrames.map(
      (frame) => (stateMap.get(frame.id) || frame.initialState)[1],
    );
    const ctx = this.getConfigKinematics(stateMap);
    const rows = constraints.flatMap((constraint) =>
      constraint.jacobianRows(ctx),
    );
    const residual = rows.map((row) => dotRows(row, qd));
    // `J q` is a sum of signed terms, so what makes a residual meaningful is
    // how much cancellation produced it -- not how big it is. An absolute
    // threshold here would be a length squared in disguise for a
    // `DistanceConstraint`, which is the unit-dependence the projection below
    // was reformulated to remove: measured, it made the correction
    // discontinuous in the authored velocity, halving one value and passing the
    // next one through untouched on the same rig.
    const termScale = Math.max(
      ...rows.map((row) =>
        row.reduce(
          (total: number, entry: number, index: number) =>
            total + Math.abs(entry * at(qd, index, 'velocity')),
          0,
        ),
      ),
    );
    // A pure ratio, with no absolute floor: residual and termScale scale
    // together, so the floor in `consistencyTolerance` -- which exists to keep a
    // scene near the origin from being asked for exactness -- would reassert the
    // absolute comparison this is here to avoid. Measured, the floor alone made
    // the projection skip below about `1e-4` of the demo's scale.
    if (
      termScale === 0 ||
      Math.max(...residual.map(Math.abs)) <=
        CONSISTENCY_RELATIVE_TOLERANCE * termScale
    ) {
      return qd; // already consistent — don't perturb it with a needless solve
    }
    // Solve `(J g⁻¹ Jᵀ) λ = J q̇`, then subtract `g⁻¹Jᵀλ`. The middle matrix is
    // small -- one row per constraint row -- and positive definite exactly when
    // `J` has full row rank, which is the condition the augmented system needs
    // anyway.
    const rowCount = rows.length;
    if (rowCount > this.sortedFrames.length) {
      throw new Error(
        `Scene is over-determined: ${rowCount} constraint rows against ` +
          `${this.sortedFrames.length} coordinates. Some of these constraints ` +
          'cannot hold at the same time.',
      );
    }
    let correction: number[];
    try {
      // One factorization of `g` serves every constraint row. Re-factorizing per
      // row would be `m` times the work, and -- since factorization consumes its
      // matrix -- would return `R⁻¹b` on every row after the first: finite,
      // plausible, and wrong.
      const massFactorization = factor(fromRows(this.getMassMatrix(stateMap)));

      // `g⁻¹Jᵀ`, column by column, rather than forming the inverse.
      const invMassJT = rows.map((row) =>
        solveFactored(massFactorization, row),
      );

      const gram = rows.map((row) =>
        invMassJT.map((column) => dotRows(row, column)),
      );
      const lambda = solveFactored(factor(fromRows(gram)), residual);

      correction = this.sortedFrames.map((unused, index) =>
        invMassJT.reduce(
          (total, column, row) =>
            total +
            at(column, index, 'inverse-mass column') *
              at(lambda, row, 'multiplier'),
          0,
        ),
      );
    } catch (error) {
      // Only the singular case gets re-diagnosed. The block also runs `dotRows`
      // and the indexed accessors, whose throws mean the Jacobian was assembled
      // wrong -- a bug here, with nothing to do with conditioning. Wrapping
      // those in "rescale your scene" would send someone a long way in the
      // wrong direction, and it is the one place this file would turn a loud
      // failure back into a misleading one.
      if (!(error instanceof SingularMatrixError)) {
        throw error;
      }

      throw new Error(
        'No initial-velocity correction is determined for this scene. Either ' +
          'the constraint rows are not independent -- two constraints saying ' +
          'the same thing about one pair of frames, or a rig posed at a ' +
          'kinematic singularity -- or the scene is authored at a length ' +
          'scale this cannot resolve. The mass matrix mixes a prismatic ' +
          "coordinate's mass with a revolute one's mass-times-length-squared, " +
          'so its condition number grows with the square of the scale. In ' +
          'float64 the usable band runs roughly 1e-5 to 1e5 times the scale ' +
          'the scene is written at -- ten orders, measured. Rescaling the ' +
          `scene is the fix for that one. (${String(error)})`,
      );
    }
    return qd.map(
      (entry, index) => entry - at(correction, index, 'velocity correction'),
    );
  }

  getInitialStateMap({
    randomize = false,
    project = true,
  }: { randomize?: boolean; project?: boolean } = {}): StateMap {
    const randomAngle = (): number => (Math.random() - 0.5) * Math.PI * 2;
    const getInitialState = (frame: Frame): State =>
      randomize ? [randomAngle(), randomAngle()] : frame.initialState;

    const stateMap: StateMap = new Map(
      this.sortedFrames.map((frame): [FrameId, State] => [
        frame.id,
        getInitialState(frame),
      ]),
    );
    // A constraint added with `allowInitialViolation` says *that constraint* is
    // violated on purpose, so it is dropped from the projection rather than
    // switching the projection off. A flag reaching sideways into constraints it
    // was never passed to would be a scene-global effect wearing a per-call
    // argument's clothes.
    //
    // Dropping it rather than ignoring it is what keeps a non-zero initial
    // constraint velocity reachable, and with it the linear half of
    // `C(t) = C0 + Cdot0 * t`.
    const enforced = this.constraints.filter(
      (constraint) => !constraint.allowInitialViolation,
    );
    if (!project || !enforced.length) {
      return stateMap;
    }
    const projected = this._getProjectedVelocities(stateMap, enforced);
    return new Map(
      this.sortedFrames.map((frame, index): [FrameId, State] => [
        frame.id,
        [
          mapGet(stateMap, frame.id, 'state')[0],
          at(projected, index, 'projected velocity'),
        ],
      ]),
    );
  }

  toJsonObj({
    includeDecals = false,
  }: { includeDecals?: boolean } = {}): Record<string, unknown> {
    const obj: Record<string, unknown> = {
      frames: this.frames.map((frame) =>
        frame.toJsonObj({ includeDecals: includeDecals }),
      ),
      gravity: this.gravity,
    };
    if (this.constraints.length) {
      obj.constraints = this.constraints.map((constraint) =>
        constraint.toJsonObj(),
      );
    }
    if (includeDecals) {
      obj.decals = this.decals.map((decal) => decal.toJsonObj());
    }
    return obj;
  }
}
