import * as daglet from './daglet';
import * as tf from './tfjs';
import React from 'react';
import { coercePositionVector } from './utils';
import { invertXformMatrix } from './utils';
import { required } from './utils';
import { solveLinearSystem } from './utils';
import { CONSISTENCY_TOLERANCE } from './Constraint';
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
    this.constraints = constraints;
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
  }

  getPosMatrixMap(stateMap = null) {
    /**
     * The local->global position transformation matrix of every frame, indexed
     * by frame id — the scene's pose, as a function of its state.
     *
     * A frame missing from `stateMap` is read at its rest coordinate rather
     * than throwing, which is what makes this answerable about a scene that is
     * still being assembled. Omit `stateMap` entirely for the initial state.
     *
     * The caller owns the returned tensors and must dispose them.
     */
    stateMap = stateMap || this.getInitialStateMap({ project: false });
    const posMatMap = new Map();
    for (let frame of this.sortedFrames) {
      const [q] = stateMap.get(frame.id) || ZERO_STATE;
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
    const owned = posMatMap ? null : this.getPosMatrixMap(stateMap);
    const result = tf.tidy(() => {
      const posMat = (posMatMap || owned).get(frameId);
      if (!posMat) {
        throw new Error(`No such frame in scene: ${frameId}`);
      }
      return [
        ...posMat.matMul(coercePositionVector(position)).dataSync().slice(0, 2),
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
    { stateMap = null } = {},
  ) {
    /**
     * The gap between two frame-relative positions: `{ vector, distance }`,
     * where `vector` points from the first to the second.
     *
     * This is the measurement a `DistanceConstraint` is built around, which is
     * why it is a method rather than something every caller derives.
     */
    const posMatMap = this.getPosMatrixMap(stateMap);
    const p = this.getWorldPosition(frameId1, position1, { posMatMap });
    const q = this.getWorldPosition(frameId2, position2, { posMatMap });
    tf.dispose([...posMatMap.values()]);
    const vector = [q[0] - p[0], q[1] - p[1]];
    return { vector, distance: Math.hypot(...vector) };
  }

  addConstraint(
    constraint = required('constraint'),
    { allowInitialViolation = false } = {},
  ) {
    /**
     * Add a loop-closure constraint, mirroring `Scene::add_constraint` in
     * physm-rs. Chainable, and it must be called after the frames it names are
     * in the scene, because this is where the constraint is measured against
     * them.
     *
     * That measurement is the position half of the consistency step in
     * `docs/constraints.md` §7: an unset `length` adopts the gap the scene
     * actually places, and an explicit one that disagrees with it is rejected
     * here rather than becoming a permanent, silent violation. The velocity
     * half lives in `getInitialStateMap`.
     *
     * `allowInitialViolation` skips the check and keeps the authored `length`.
     * It exists for tests of the formulation itself — `C` being *conserved*
     * rather than *small* is only observable from a scene that starts
     * violated. It is not an escape hatch for a scene that failed the check:
     * nothing downstream will repair the violation, so what it buys is a rig
     * that is permanently wrong instead of one that refused to build.
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
    // An unset length is measured either way: the constraint has no answer for
    // `C` without one, and a length nobody authored is a length nothing can
    // disagree with — so there is no violation to allow.
    const unresolved = constraint.length === null;
    if (unresolved || !allowInitialViolation) {
      const { distance } = this.getSeparation(
        frameId1,
        constraint.localPosition1,
        frameId2,
        constraint.localPosition2,
      );
      if (allowInitialViolation) {
        constraint.length = distance;
      } else {
        constraint.resolveLength(distance);
      }
    }
    this.constraints.push(constraint);
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
        const [q] = stateMap.get(frame.id) || ZERO_STATE;
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

  _getProjectedVelocities(stateMap = required('stateMap')) {
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
     * The correction is the least-norm one, `q̇ ← q̇ − Jᵀ(JJᵀ)⁻¹J q̇`, so a
     * consistent `q̇₀` is left exactly alone and an inconsistent one moves as
     * little as the constraint allows.
     */
    const qd = this.sortedFrames.map(
      (frame) => (stateMap.get(frame.id) || ZERO_STATE)[1],
    );
    const ctx = this.getConfigKinematics(stateMap);
    const rows = this.constraints.flatMap((constraint) =>
      constraint.jacobianRows(ctx),
    );
    this.disposeConfigKinematics(ctx);
    const residual = rows.map((row) =>
      row.reduce((total, entry, index) => total + entry * qd[index], 0),
    );
    if (Math.max(...residual.map(Math.abs)) <= CONSISTENCY_TOLERANCE) {
      return qd; // already consistent — don't perturb it with a needless solve
    }
    // Solve `J Jᵀ λ = J q̇`, then subtract `Jᵀλ`. The Gram matrix is small —
    // one row per constraint row — and positive definite exactly when `J` has
    // full row rank, which is the condition the augmented system needs anyway.
    const correction = tf.tidy(() => {
      const jMat = tf.tensor2d(rows);
      const lambda = solveLinearSystem(
        jMat.matMul(jMat, false, true),
        tf.tensor2d(residual.map((entry) => [entry])),
      );
      return [...jMat.transpose().matMul(lambda).dataSync()];
    });
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
    if (!project || !this.constraints.length) {
      return stateMap;
    }
    // Both solvers seed from here, so projecting once at the source is what
    // keeps them from disagreeing about what "the initial state" means.
    // `project: false` is for the queries above, which have to be answerable
    // about a scene whose constraints are not resolved yet -- and which the
    // projection itself calls, so leaving it on would not terminate.
    const projected = this._getProjectedVelocities(stateMap);
    return new Map(
      this.sortedFrames.map((frame, index) => [
        frame.id,
        [stateMap.get(frame.id)[0], projected[index]],
      ]),
    );
  }

  toJsonObj({includeDecals = false} = {}) {
    const obj = {
      frames: this.frames.map((frame) => frame.toJsonObj({includeDecals: includeDecals})),
      gravity: this.gravity,
    }
    if (this.constraints.length) {
      obj.constraints = this.constraints.map((constraint) => constraint.toJsonObj())
    }
    if (includeDecals) {
      obj.decals = this.decals.map((decal) => decal.toJsonObj())
    }
    return obj;
  }
}
