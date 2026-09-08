import * as daglet from './daglet';
import * as tf from './tfjs';
import React from 'react';
import { coercePositionVector } from './utils';
import { invertXformMatrix } from './utils';
import { required } from './utils';
import { solveLinearSystem } from './utils';
import { CONSISTENCY_RELATIVE_TOLERANCE } from './Constraint';
import { ZERO_POS } from './utils';
import { ZERO_STATE } from './utils';

export const DEFAULT_GRAVITY = 10;

export default class Scene {
  constructor({
    decals = [],
    frames = [],
    springs = [],
    constraints = [],
    gravity = DEFAULT_GRAVITY,
  } = {}) {
    this.decals = decals;
    this.frames = frames;
    this.springs = springs;
    // Constraints are added below rather than assigned: `addConstraint` is
    // where a constraint is checked against the frame set and solved against
    // the pose, and a second door into this list would be one nobody has to
    // opt out of.
    this.constraints = [];
    this.gravity = gravity;

    const getFrameChildren = (frame) => frame.frames;
    const getFrameId = (frame) => frame.id;
    this.sortedFrames = daglet
      .toposort(this.frames, {
        getNodeParents: getFrameChildren,
        getNodeKey: getFrameId,
      })
      .reverse();
    this.frameMap = new Map(
      this.sortedFrames.map((frame) => [frame.id, frame]),
    );
    const frameIdParentsMap = daglet.getChildMap(this.sortedFrames, {
      getNodeParents: getFrameChildren,
      getNodeKey: getFrameId,
    });
    if ([...frameIdParentsMap.values()].some((parents) => parents.size > 1)) {
      throw new Error('Frames should only have one parent'); // TODO: use AssertionError?
    }
    this.frameIdParentMap = new Map(
      [...frameIdParentsMap].map(([frameId, parents]) => [
        frameId,
        parents.size ? [...parents][0].id : null,
      ]),
    );
    this.frameIdPathMap = daglet.transformNodes(this.sortedFrames, {
      getNodeParents: (frame) => [...frameIdParentsMap.get(frame.id)],
      getNodeKey: getFrameId,
      visitNode: (frame, parentPaths) =>
        parentPaths.length ? [...parentPaths[0], frame.id] : [frame.id],
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
      tf.dispose([...posMatMap.values()]);
    }
  }

  getPosMatrixMap(stateMap = null) {
    /**
     * The local->global position transformation matrix of every frame, indexed
     * by frame id — the scene's pose, as a function of its state.
     *
     * A frame missing from `stateMap` is read at its own `initialState` rather
     * than throwing, which is what makes this answerable about a scene that is
     * still being assembled — and which makes a partial map agree with an
     * omitted one, since omitting it is the same as mentioning nothing.
     *
     * The caller owns the returned tensors and must dispose them.
     */
    stateMap = stateMap || this.getInitialStateMap({ project: false });
    const posMatMap = new Map();
    for (let frame of this.sortedFrames) {
      const [q] = stateMap.get(frame.id) || frame.initialState;
      const parentId = this.frameIdParentMap.get(frame.id);
      const localPosMat = frame.getLocalPosMatrix(q);
      const globalPosMat = parentId
        ? posMatMap.get(parentId).matMul(localPosMat)
        : localPosMat.clone();
      localPosMat.dispose();
      posMatMap.set(frame.id, globalPosMat);
    }
    return posMatMap;
  }

  getWorldPosition(
    frameId = required('frameId'),
    position = ZERO_POS,
    { stateMap = null, posMatMap = null } = {},
  ) {
    /**
     * Where a frame-relative position lands in the world, as a plain `[x, y]`.
     *
     * Pass `posMatMap` to answer several of these against one pose without
     * recomputing it; otherwise one is computed and disposed internally.
     */
    // Checked before anything is allocated: `tf.tidy` only reclaims what is
    // created inside it, so a throw past this point would orphan the pose map.
    if (!this.frameMap.has(frameId)) {
      throw new Error(`No such frame in scene: ${frameId}`);
    }
    const owned = posMatMap ? null : this.getPosMatrixMap(stateMap);
    const result = tf.tidy(() => [
      ...(posMatMap || owned)
        .get(frameId)
        .matMul(coercePositionVector(position))
        .dataSync()
        .slice(0, 2),
    ]);
    owned && tf.dispose([...owned.values()]);
    return result;
  }

  getLocalPosition(
    frameId = required('frameId'),
    worldPosition = ZERO_POS,
    { stateMap = null, posMatMap = null } = {},
  ) {
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
    const owned = posMatMap ? null : this.getPosMatrixMap(stateMap);
    const result = tf.tidy(() => {
      const invPosMat = invertXformMatrix((posMatMap || owned).get(frameId));
      return [
        ...invPosMat
          .matMul(coercePositionVector(worldPosition))
          .dataSync()
          .slice(0, 2),
      ];
    });
    owned && tf.dispose([...owned.values()]);
    return result;
  }

  getSeparation(
    frameId1 = required('frameId1'),
    position1 = ZERO_POS,
    frameId2 = required('frameId2'),
    position2 = ZERO_POS,
    { stateMap = null, posMatMap = null } = {},
  ) {
    /**
     * The gap between two frame-relative positions: `{ vector, distance }`.
     *
     * `vector` is the constraint's own `d = x₁ − x₂` — first *minus* second,
     * matching `Constraint._separation` rather than reading left-to-right. Two
     * opposite conventions under one word is worse than either, and `d` is the
     * one with things depending on it: it is what `jacobianRows` contracts
     * against, and it is `CoincidenceConstraint.value` verbatim.
     */
    // Both ids checked before anything is allocated: `getWorldPosition` throws
    // for an unknown one, and a throw after the pose map exists would orphan it.
    for (let frameId of [frameId1, frameId2]) {
      if (!this.frameMap.has(frameId)) {
        throw new Error(`No such frame in scene: ${frameId}`);
      }
    }
    const owned = posMatMap ? null : this.getPosMatrixMap(stateMap);
    const shared = posMatMap || owned;
    const p = this.getWorldPosition(frameId1, position1, { posMatMap: shared });
    const q = this.getWorldPosition(frameId2, position2, { posMatMap: shared });
    owned && tf.dispose([...owned.values()]);
    const vector = [p[0] - q[0], p[1] - q[1]];
    return { vector, distance: Math.hypot(...vector) };
  }

  addConstraint(
    constraint = required('constraint'),
    { allowInitialViolation = false, posMatMap = null } = {},
  ) {
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
    for (let frameId of [frameId1, frameId2]) {
      if (!this.frameMap.has(frameId)) {
        throw new Error(
          `Constraint references a frame the scene does not contain: ` +
            `${frameId}. Add the frame first, or check the id.`,
        );
      }
    }
    const owned = posMatMap ? null : this.getPosMatrixMap();
    const shared = posMatMap || owned;

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
      // The tolerance scales with how far from the origin the scene works,
      // since that is what sets float32's resolution here.
      const scale = Math.max(...p.map(Math.abs), ...q.map(Math.abs), 1);
      constraint.resolveGeometry(Math.hypot(p[0] - q[0], p[1] - q[1]), scale);
    }
    owned && tf.dispose([...owned.values()]);
    this.constraints.push(constraint);
    constraint.allowInitialViolation = allowInitialViolation;
    return this;
  }

  getDomElement(
    stateMap = required('stateMap'),
    xformMatrix = tf.eye(3),
    { key = undefined } = {},
  ) {
    return (
      <g className="scene" key={key}>
        {this.decals.map((decal, index) =>
          decal.getDomElement(xformMatrix, { key: 'decal' + index }),
        )}
        {this.frames.map((frame, index) =>
          frame.getDomElement(stateMap, xformMatrix, { key: 'frame' + index }),
        )}
      </g>
    );
  }

  getInvPosMatrixMap(posMatMap = required('posMatMap')) {
    /**
     * The global->local ("inverse") transformation of every frame. The caller
     * owns the returned tensors.
     */
    return new Map(
      [...posMatMap].map(([frameId, posMat]) => [
        frameId,
        invertXformMatrix(posMat),
      ]),
    );
  }

  getVelMatrixMap(
    posMatMap = required('posMatMap'),
    invPosMatMap = required('invPosMatMap'),
    stateMap = null,
  ) {
    /**
     * The velocity field of every frame in global coordinates: right-multiply
     * one by a global position to get the global velocity of that point, per
     * unit of the frame's own coordinate. The caller owns the tensors.
     */
    stateMap = stateMap || this.getInitialStateMap({ project: false });
    return new Map(
      this.sortedFrames.map((frame) => {
        const [q] = stateMap.get(frame.id) || frame.initialState;
        const parentId = this.frameIdParentMap.get(frame.id);
        const localVelMat = frame.getLocalVelMatrix(q);
        const relVelMat = localVelMat.matMul(invPosMatMap.get(frame.id));
        const globalVelMat = parentId
          ? posMatMap.get(parentId).matMul(relVelMat)
          : relVelMat.clone();
        tf.dispose([localVelMat, relVelMat]);
        return [frame.id, globalVelMat];
      }),
    );
  }

  getConfigKinematics(stateMap = null) {
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
     * Dispose it with `disposeConfigKinematics`.
     */
    const posMatMap = this.getPosMatrixMap(stateMap);
    const invPosMatMap = this.getInvPosMatrixMap(posMatMap);
    const velMatMap = this.getVelMatrixMap(posMatMap, invPosMatMap, stateMap);
    tf.dispose([...invPosMatMap.values()]);
    return {
      sortedFrames: this.sortedFrames,
      frameIdPathMap: this.frameIdPathMap,
      posMatMap,
      velMatMap,
    };
  }

  disposeConfigKinematics(ctx = required('ctx')) {
    tf.dispose([...ctx.posMatMap.values(), ...ctx.velMatMap.values()]);
  }

  getWeightPosMap(posMatMap = required('posMatMap')) {
    /**
     * Every point mass in world coordinates, grouped by the frame carrying it.
     * The caller owns the returned tensors.
     */
    return new Map(
      this.sortedFrames.map((frame) => [
        frame.id,
        frame.weights.map((weight) =>
          posMatMap.get(frame.id).matMul(weight.position),
        ),
      ]),
    );
  }

  isFrameDescendent(
    descendentId = required('descendentId'),
    ancestorId = required('ancestorId'),
  ) {
    return this.frameIdPathMap.get(descendentId).indexOf(ancestorId) !== -1;
  }

  getMassMatrixEntry(
    rowIndex = required('rowIndex'),
    colIndex = required('colIndex'),
    velMatMap = required('velMatMap'),
    weightPosMap = required('weightPosMap'),
  ) {
    /**
     * One entry of the metric: `g_ij = Σ_w m_w ⟨V_i x_w, V_j x_w⟩`, summed over
     * the weights both coordinates can move — which is the subtree below
     * whichever of the two is the descendant. Zero when they are incomparable,
     * since no weight is under both.
     */
    const frame1 = this.sortedFrames[rowIndex];
    const frame2 = this.sortedFrames[colIndex];
    const baseId = this.isFrameDescendent(frame1.id, frame2.id)
      ? frame1.id
      : this.isFrameDescendent(frame2.id, frame1.id)
        ? frame2.id
        : null;
    if (baseId === null) {
      return 0;
    }
    const velMat1 = velMatMap.get(frame1.id);
    const velMat2 = velMatMap.get(frame2.id);
    let result = 0;
    for (let frame of this.sortedFrames) {
      if (!this.isFrameDescendent(frame.id, baseId)) {
        continue;
      }
      frame.weights.forEach((weight, index) => {
        const pos = weightPosMap.get(frame.id)[index];
        result +=
          weight.mass *
          tf.tidy(
            () =>
              tf
                .matMul(velMat2.matMul(pos), velMat1.matMul(pos), true)
                .dataSync()[0],
          );
      });
    }
    return result;
  }

  getMassMatrix(stateMap = null) {
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
    tf.dispose([
      ...posMatMap.values(),
      ...invPosMatMap.values(),
      ...velMatMap.values(),
      ...weightPosMap.values(),
    ]);
    return tf.tensor2d(array);
  }

  _getProjectedVelocities(
    stateMap = required('stateMap'),
    constraints = required('constraints'),
  ) {
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
    let rows;
    try {
      rows = constraints.flatMap((constraint) => constraint.jacobianRows(ctx));
    } finally {
      this.disposeConfigKinematics(ctx);
    }
    const residual = rows.map((row) =>
      row.reduce((total, entry, index) => total + entry * qd[index], 0),
    );
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
          (total, entry, index) => total + Math.abs(entry * qd[index]),
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
    let correction;
    try {
      correction = tf.tidy(() => {
        // Inside the tidy: `solveLinearSystem` throws on a rank-deficient system,
        // which a taut chain reaches, and a tensor created out here would outlive
        // the throw.
        const massMatrix = this.getMassMatrix(stateMap);
        const jMat = tf.tensor2d(rows);
        // `g⁻¹Jᵀ`, column by column, rather than forming the inverse.
        const invMassJT = tf.concat(
          rows.map((row) =>
            solveLinearSystem(
              massMatrix,
              tf.tensor2d(row.map((entry) => [entry])),
            ),
          ),
          1,
        );
        const lambda = solveLinearSystem(
          jMat.matMul(invMassJT),
          tf.tensor2d(residual.map((entry) => [entry])),
        );
        return [...invMassJT.matMul(lambda).dataSync()];
      });
    } catch (error) {
      throw new Error(
        'No initial-velocity correction is determined for this scene. Either ' +
          'the constraint rows are not independent -- two constraints saying ' +
          'the same thing about one pair of frames, or a rig posed at a ' +
          'kinematic singularity -- or the scene is authored at a length ' +
          'scale this cannot resolve. The mass matrix mixes a prismatic ' +
          "coordinate's mass with a revolute one's mass-times-length-squared, " +
          'so its condition number grows with the square of the scale, and ' +
          'tfjs computes in float32: the usable band is roughly 1e-3 to 3e2 ' +
          'times the scale the scene is written at. Rescaling the scene is ' +
          `the fix for that one. (${error.message.split('\n')[0]})`,
      );
    }
    return qd.map((entry, index) => entry - correction[index]);
  }

  getInitialStateMap({ randomize = false, project = true } = {}) {
    let getInitialState;
    if (randomize) {
      const randPi = () => (Math.random() - 0.5) * Math.PI * 2; // TBD
      getInitialState = (frame) => [randPi(), randPi()];
    } else {
      getInitialState = (frame) => frame.initialState;
    }
    const stateMap = new Map(
      this.sortedFrames.map((frame) => [frame.id, getInitialState(frame)]),
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
      this.sortedFrames.map((frame, index) => [
        frame.id,
        [stateMap.get(frame.id)[0], projected[index]],
      ]),
    );
  }

  toJsonObj({ includeDecals = false } = {}) {
    const obj = {
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
