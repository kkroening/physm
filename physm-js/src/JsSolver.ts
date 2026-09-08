import * as mat3 from './Mat3';
import * as vec3 from './Vec3';
import Solver from './Solver';
import type { ConstraintCtx } from './Constraint';
import type Frame from './Frame';
import type { FrameId, StateMap } from './Frame';
import type { Mat3 } from './Mat3';
import type Scene from './Scene';
import type { Vec3 } from './Vec3';
import { checkStateMapValid } from './Solver';
import type { ExternalForceMap } from './Solver';
import { fromRows, solveLinearSystem } from './solveLinearSystem';

/** A lookup into a table this solver derived itself; a miss is a bug here. */
function mapGet<K, V>(map: Map<K, V>, key: K, what: string): V {
  const value = map.get(key);
  if (value === undefined) {
    throw new Error(`No ${what} for ${String(key)}`);
  }

  return value;
}

/** The array counterpart of `mapGet`; an out-of-range index is likewise a bug. */
function at<T>(array: readonly T[], index: number): T {
  const value = array[index];
  if (value === undefined) {
    throw new Error(`No entry at index ${index}`);
  }

  return value;
}

/**
 * A row of the KKT matrix being assembled.
 *
 * Separate from `at` only for the message: a missing row means the matrix was
 * sized wrong, and writing into a discarded `[]` -- as this did -- drops the
 * entry and leaves a silently under-constrained solve.
 */
function atRow(array: number[][], index: number): number[] {
  const row = array[index];
  if (row === undefined) {
    throw new Error(`KKT matrix has no row ${index}`);
  }

  return row;
}

export default class JsSolver extends Solver {
  readonly rungeKutta: boolean;
  stateMap: StateMap;

  constructor(scene: Scene, { rungeKutta = true }: { rungeKutta?: boolean } = {}) {
    super(scene);
    this.rungeKutta = rungeKutta;
    this.stateMap = scene.getInitialStateMap();
  }

  override getStateMap(): StateMap {
    return this.stateMap;
  }

  override setStateMap(stateMap: StateMap): void {
    this.stateMap = stateMap;
  }

  // The configuration sweeps live on `Scene`: they are questions about a pose,
  // and answering them does not imply simulating anything. These delegate so
  // that the solver and the scene queries cannot drift apart -- every tick runs
  // through the same code the query API exposes.

  _getPosMatMap(stateMap: StateMap): Map<FrameId, Mat3> {
    return this.scene.getPosMatrixMap(stateMap);
  }

  _getInvPosMatMap(posMatMap: Map<FrameId, Mat3>): Map<FrameId, Mat3> {
    return this.scene.getInvPosMatrixMap(posMatMap);
  }

  _getVelMatMap(
    posMatMap: Map<FrameId, Mat3>,
    invPosMatMap: Map<FrameId, Mat3>,
    stateMap: StateMap,
  ) {
    return this.scene.getVelMatrixMap(posMatMap, invPosMatMap, stateMap);
  }

  _getAccelMatMap(
    posMatMap: Map<FrameId, Mat3>,
    invPosMatMap: Map<FrameId, Mat3>,
    stateMap: StateMap,
  ) {
    /**
     * Global position -> global acceleration, indexed by frame, where each
     * matrix represents the acceleration field of the corresponding frame in
     * global coordinates.
     */
    return new Map(
      this.scene.sortedFrames.map((frame) => {
        const [q] = mapGet(stateMap, frame.id, 'state');
        const parentId = this.scene.frameIdParentMap.get(frame.id);
        const localAccelMat = frame.getLocalAccelMatrix(q);
        const relAccelMat = mat3.multiply(
          localAccelMat,
          mapGet(invPosMatMap, frame.id, 'inverse pose'),
        );
        const globalAccelMat = parentId
          ? mat3.multiply(mapGet(posMatMap, parentId, 'pose'), relAccelMat)
          : relAccelMat;
        return [frame.id, globalAccelMat];
      }),
    );
  }

  _getVelSumMatMap(
    posMatMap: Map<FrameId, Mat3>,
    velMatMap: Map<FrameId, Mat3>,
    stateMap: StateMap,
  ) {
    const velSumMatMap = new Map<FrameId, Mat3>();
    for (const frame of this.scene.sortedFrames) {
      const [, qd] = mapGet(stateMap, frame.id, 'state');
      const parentId = this.scene.frameIdParentMap.get(frame.id);
      const globalVelMat = mat3.scale(mapGet(velMatMap, frame.id, 'velocity matrix'), qd);
      const velSumMat = parentId
        ? mat3.add(globalVelMat, mapGet(velSumMatMap, parentId, 'velocity sum'))
        : globalVelMat;
      velSumMatMap.set(frame.id, velSumMat);
    }
    return velSumMatMap;
  }

  _getAccelSumMatMap(
    posMatMap: Map<FrameId, Mat3>,
    velMatMap: Map<FrameId, Mat3>,
    accelMatMap: Map<FrameId, Mat3>,
    velSumMatMap: Map<FrameId, Mat3>,
    stateMap: StateMap,
  ) {
    const accelSumMatMap = new Map<FrameId, Mat3>();
    for (const frame of this.scene.sortedFrames) {
      const [, qd] = mapGet(stateMap, frame.id, 'state');
      const parentId = this.scene.frameIdParentMap.get(frame.id);
      const accelSumMat = (() => {
        const globalAccelMat = mat3.scale(mapGet(accelMatMap, frame.id, 'acceleration matrix'), qd * qd);
        let accelSumMat;
        if (parentId) {
          const parentAccelSumMat = mapGet(accelSumMatMap, parentId, 'acceleration sum');
          const parentVelSumMat = mapGet(velSumMatMap, parentId, 'velocity sum');
          const globalVelMat = mat3.scale(mapGet(velMatMap, frame.id, 'velocity matrix'), 2 * qd);
          const crossAccelMat = mat3.multiply(parentVelSumMat, globalVelMat);
          accelSumMat = mat3.add(
            mat3.add(globalAccelMat, crossAccelMat),
            parentAccelSumMat,
          );
        } else {
          accelSumMat = globalAccelMat;
        }
        return accelSumMat;
      })();
      accelSumMatMap.set(frame.id, accelSumMat);
    }
    return accelSumMatMap;
  }

  _getWeightPosMap(posMatMap: Map<FrameId, Mat3>): Map<FrameId, Vec3[]> {
    return this.scene.getWeightPosMap(posMatMap);
  }

  _isFrameDescendent(
    descendentFrame: Frame,
    ancestorFrame: Frame,
  ) {
    return this.scene.isFrameDescendent(descendentFrame.id, ancestorFrame.id);
  }

  _getDescendentFrame(
    frame1: Frame,
    frame2: Frame,
  ) {
    let descendent;
    if (this._isFrameDescendent(frame1, frame2)) {
      descendent = frame1;
    } else if (this._isFrameDescendent(frame2, frame1)) {
      descendent = frame2;
    } else {
      descendent = null;
    }
    return descendent;
  }

  _getDescendentFrames(ancestorFrame: Frame) {
    return this.scene.sortedFrames.filter((frame) =>
      this._isFrameDescendent(frame, ancestorFrame),
    );
  }

  // The mass matrix is the scene's pullback metric, a function of `q` alone.

  _getCoefficientMatrixEntry(
    rowIndex: number,
    colIndex: number,
    velMatMap: Map<FrameId, Mat3>,
    weightPosMap: Map<FrameId, Vec3[]>,
  ) {
    return this.scene.getMassMatrixEntry(
      rowIndex,
      colIndex,
      velMatMap,
      weightPosMap,
    );
  }

  _getCoefficientMatrix(stateMap: StateMap): number[][] {
    return this.scene.getMassMatrix(stateMap);
  }

  _getForceVectorEntry(
    baseFrame: Frame,
    velMatMap: Map<FrameId, Mat3>,
    velSumMatMap: Map<FrameId, Mat3>,
    accelSumMatMap: Map<FrameId, Mat3>,
    weightPosMap: Map<FrameId, Vec3[]>,
    stateMap: StateMap,
    externalForceMap: ExternalForceMap,
  ) {
    let result = 0;
    const baseVelMat = mapGet(velMatMap, baseFrame.id, 'velocity matrix');
    for (const childFrame of this._getDescendentFrames(baseFrame)) {
      const childVelSumMat = mapGet(velSumMatMap, childFrame.id, 'velocity sum');
      const childAccelSumMat = mapGet(accelSumMatMap, childFrame.id, 'acceleration sum');
      for (
        let weightIndex = 0;
        weightIndex < childFrame.weights.length;
        weightIndex++
      ) {
        const weight = childFrame.weights[weightIndex];
        const weightPos = mapGet(
          weightPosMap,
          childFrame.id,
          'weight positions',
        )[weightIndex];
        if (!weight || !weightPos) {
          continue;
        }
        const weightBaseVel = mat3.apply(baseVelMat, weightPos);
        const weightChildVelSum = mat3.apply(childVelSumMat, weightPos);
        const weightChildAccelSum = mat3.apply(childAccelSumMat, weightPos);
        const kineticForce =
          -weight.mass * vec3.dot(weightBaseVel, weightChildAccelSum);
        const gravityForce =
          -weight.mass * this.scene.gravity * weightBaseVel[1];
        const dragForce =
          -weight.drag * vec3.dot(weightBaseVel, weightChildVelSum);
        result += kineticForce + dragForce + gravityForce;
      }
    }
    const [, qd] = mapGet(stateMap, baseFrame.id, 'state');
    const resistanceForce = -baseFrame.resistance * qd;
    const externalForce =
      (externalForceMap && externalForceMap.get(baseFrame.id)) || 0;
    result += externalForce + resistanceForce;
    return result;
  }

  _getForceVector(
    velMatMap: Map<FrameId, Mat3>,
    velSumMatMap: Map<FrameId, Mat3>,
    accelSumMatMap: Map<FrameId, Mat3>,
    weightPosMap: Map<FrameId, Vec3[]>,
    stateMap: StateMap,
    externalForceMap: ExternalForceMap,
  ) {
    const numFrames = this.scene.sortedFrames.length;
    const array = new Array<number>(numFrames).fill(0);
    for (let index = 0; index < numFrames; index++) {
      const frame = this.scene.sortedFrames[index];
      if (!frame) {
        continue;
      }

      array[index] = this._getForceVectorEntry(
        frame,
        velMatMap,
        velSumMatMap,
        accelSumMatMap,
        weightPosMap,
        stateMap,
        externalForceMap,
      );
    }
    return array;
  }

  _getConfigKinematics(stateMap: StateMap): ConstraintCtx {
    return this.scene.getConfigKinematics(stateMap);
  }

  _augmentWithConstraints(
    massMatrix: number[][],
    forceVector: number[],
    ctx: ConstraintCtx,
  ): [number[][], number[]] {
    /**
     * Grow the `n`-by-`n` system into the `(n + m)`-by-`(n + m)` KKT
     * saddle-point system, where `m` is the total constraint row count:
     *
     *     [ g  Jᵀ ] [ q̈ ]   [   f   ]
     *     [ J  0  ] [ λ ] = [ -J̇q̇ ]
     *
     * The block is symmetric but *indefinite*, which is why `solveLinearSystem`
     * being QR-based rather than a Cholesky matters. See `docs/constraints.md`.
     */
    const numFrames = this.scene.sortedFrames.length;
    const size =
      numFrames +
      this.scene.constraints.reduce(
        (total, constraint) => total + constraint.rowCount,
        0,
      );
    const array = Array.from({ length: size }, (unused, rowIndex) =>
      Array.from({ length: size }, (unused2, colIndex) =>
        rowIndex < numFrames && colIndex < numFrames
          ? at(atRow(massMatrix, rowIndex), colIndex)
          : 0,
      ),
    );
    const vector = Array.from({ length: size }, (unused, rowIndex) =>
      rowIndex < numFrames ? at(forceVector, rowIndex) : 0,
    );

    let row = numFrames;
    for (const constraint of this.scene.constraints) {
      const jacobianRows = constraint.jacobianRows(ctx);
      const bias = constraint.bias(ctx);

      jacobianRows.forEach((jacobianRow, index) => {
        jacobianRow.forEach((entry, colIndex) => {
          // Written into both triangles as it goes, so symmetry holds by
          // construction rather than by a fill-in pass.
          atRow(array, row)[colIndex] = entry;
          atRow(array, colIndex)[row] = entry;
        });
        vector[row] = -at(bias, index);
        row++;
      });
    }

    return [array, vector];
  }

  _getSystemOfEquations(
    stateMap: StateMap,
    externalForceMap: ExternalForceMap,
  ): [number[][], number[]] {
    const posMatMap = this._getPosMatMap(stateMap);
    const invPosMatMap = this._getInvPosMatMap(posMatMap);
    const velMatMap = this._getVelMatMap(posMatMap, invPosMatMap, stateMap);
    const accelMatMap = this._getAccelMatMap(posMatMap, invPosMatMap, stateMap);
    const velSumMatMap = this._getVelSumMatMap(posMatMap, velMatMap, stateMap);
    const accelSumMatMap = this._getAccelSumMatMap(
      posMatMap,
      velMatMap,
      accelMatMap,
      velSumMatMap,
      stateMap,
    );
    const weightPosMap = this._getWeightPosMap(posMatMap);
    // console.log(
    //   '[js] accelSumMatMap:',
    //   [...accelSumMatMap].map(([frameId, m]) => [...m.dataSync()]),
    // );
    // console.log(
    //   '[js] weightPosMap:',
    //   [...weightPosMap].flatMap(([frameId, ms]) =>
    //     ms.map((m) => [...m.dataSync()]),
    //   ),
    // );
    let massMatrix: number[][] = this._getCoefficientMatrix(stateMap);
    let forceVector: number[] = this._getForceVector(
      velMatMap,
      velSumMatMap,
      accelSumMatMap,
      weightPosMap,
      stateMap,
      externalForceMap,
    );
    if (this.scene.constraints.length) {
      [massMatrix, forceVector] = this._augmentWithConstraints(
        massMatrix,
        forceVector,
        {
        sortedFrames: this.scene.sortedFrames,
        frameIdPathMap: this.scene.frameIdPathMap,
        posMatMap,
        velMatMap,
        velSumMatMap,
        accelSumMatMap,
      });
    }
    return [massMatrix, forceVector];
  }

  _solve(
    stateMap: StateMap,
    externalForceMap: ExternalForceMap,
  ) {
    const [rows, vector] = this._getSystemOfEquations(
      stateMap,
      externalForceMap,
    );

    // The tail of the solution vector holds the Lagrange multipliers `λ`, which
    // the integrator has no use for; only the leading `q̈` is returned.
    return solveLinearSystem(fromRows(rows), vector).slice(
      0,
      this.scene.sortedFrames.length,
    );
  }

  _applyDeltas(
    stateMap: StateMap,
    deltaTime: number,
    deltaQddArray: readonly number[],
    deltaQdArray: readonly number[] | null = null,
    { inPlace = false }: { inPlace?: boolean } = {},
  ): StateMap {
    const newStateMap: StateMap = inPlace ? stateMap : new Map();
    const velocities =
      deltaQdArray ?? [...stateMap].map(([, [, qd]]) => qd);

    this.scene.sortedFrames.forEach((frame, index) => {
      const [q, qd] = mapGet(stateMap, frame.id, 'state');

      newStateMap.set(frame.id, [
        q + at(velocities, index) * deltaTime,
        qd + at(deltaQddArray, index) * deltaTime,
      ]);
    });

    return newStateMap;
  }

  _tickSimple(
    stateMap: StateMap,
    deltaTime: number,
    externalForceMap: ExternalForceMap,
  ) {
    const qddArray = this._solve(stateMap, externalForceMap);
    return this._applyDeltas(stateMap, deltaTime, qddArray);
  }

  _tickRungeKutta(
    stateMap: StateMap,
    deltaTime: number,
    externalForceMap: ExternalForceMap,
  ) {
    const solve = (state: StateMap): number[] =>
      this._solve(state, externalForceMap);

    const stateMap0 = stateMap;
    const qds0 = [...stateMap0].map(([frameId, [q, qd]]) => qd);
    const qdds0 = solve(stateMap0);

    const stateMap1 = this._applyDeltas(stateMap0, deltaTime / 2, qdds0, qds0);
    const qds1 = [...stateMap1].map(([frameId, [q, qd]]) => qd);
    const qdds1 = solve(stateMap1);

    const stateMap2 = this._applyDeltas(stateMap0, deltaTime / 2, qdds1, qds1);
    const qds2 = [...stateMap2].map(([frameId, [q, qd]]) => qd);
    const qdds2 = solve(stateMap2);

    const stateMap3 = this._applyDeltas(stateMap0, deltaTime, qdds2, qds2);
    const qds3 = [...stateMap3].map(([frameId, [q, qd]]) => qd);
    const qdds3 = solve(stateMap3);

    const qds = this.scene.sortedFrames.map(
      (unused, i) =>
        (at(qds0, i) + 2 * at(qds1, i) + 2 * at(qds2, i) + at(qds3, i)) / 6,
    );
    const qdds = this.scene.sortedFrames.map(
      (unused, i) =>
        (at(qdds0, i) + 2 * at(qdds1, i) + 2 * at(qdds2, i) + at(qdds3, i)) /
        6,
    );

    return this._applyDeltas(stateMap0, deltaTime, qdds, qds);
  }

  override tick(
    deltaTime: number,
    tickCount = 1,
    externalForceMap: ExternalForceMap = null,
  ): void {
    const doTick = (this.rungeKutta
      ? this._tickRungeKutta
      : this._tickSimple
    ).bind(this);
    for (let i = 0; i < tickCount; i++) {
      this.stateMap = doTick(this.stateMap, deltaTime, externalForceMap);
      checkStateMapValid(this.stateMap);
    }
  }
}
