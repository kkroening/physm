import * as tf from './tfjs';
import { invertXformMatrix } from './utils';
import { required } from './utils';
import { solveLinearSystem } from './utils';

export default class Solver {
  constructor(scene = required('scene')) {
    this.scene = scene;
  }

  _getPosMatMap(stateMap = required('stateMap')) {
    /**
     * Determine all the local->global position transformation matrices,
     * indexed by frame.
     */
    const posMatMap = new Map();
    for (let frame of this.scene.sortedFrames) {
      const [q] = stateMap.get(frame.id);
      const parentId = this.scene.frameIdParentMap.get(frame.id);
      const localPosMat = frame.getLocalPosMatrix(q);
      const globalPosMat = parentId
        ? posMatMap.get(parentId).matMul(localPosMat)
        : localPosMat.clone();
      localPosMat.dispose();
      posMatMap.set(frame.id, globalPosMat);
    }
    return posMatMap;
  }

  _getInvPosMatMap(posMatMap = required('posMatMap')) {
    /**
     * Determine all the global->local ("inverse") position transformation
     * matrices, indexed by frame.
     */
    return new Map(
      [...posMatMap].map(([frameId, posMat]) => [
        frameId,
        invertXformMatrix(posMat),
      ]),
    );
  }

  _getVelMatMap(
    posMatMap = required('posMatMap'),
    invPosMatMap = required('invPosMatMap'),
    stateMap = required('stateMap'),
  ) {
    /**
     * Determine all the global position -> global velocity transformation
     * matrices, indexed by frame, where each matrix represents the velocity
     * field of the corresponding frame in global coordinates, such that
     * right-multiplying the matrix by a global position vector yields a global
     * velocity vector.
     */
    return new Map(
      this.scene.sortedFrames.map((frame) => {
        const [q] = stateMap.get(frame.id);
        const parentId = this.scene.frameIdParentMap.get(frame.id);
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

  _getAccelMatMap(
    posMatMap = required('posMatMap'),
    invPosMatMap = required('invPosMatMap'),
    stateMap = required('stateMap'),
  ) {
    /**
     * Global position -> global acceleration, indexed by frame, where each
     * matrix represents the acceleration field of the corresponding frame in
     * global coordinates.
     */
    return new Map(
      this.scene.sortedFrames.map((frame) => {
        const [q] = stateMap.get(frame.id);
        const parentId = this.scene.frameIdParentMap.get(frame.id);
        const localAccelMat = frame.getLocalAccelMatrix(q);
        const relAccelMat = localAccelMat.matMul(invPosMatMap.get(frame.id));
        const globalAccelMat = parentId
          ? posMatMap.get(parentId).matMul(relAccelMat)
          : relAccelMat.clone();
        tf.dispose([localAccelMat, relAccelMat]);
        return [frame.id, globalAccelMat];
      }),
    );
  }

  _getVelSumMatMap(
    posMatMap = required('posMatMap'),
    velMatMap = required('velMatMap'),
    stateMap = required('stateMap'),
  ) {
    const velSumMatMap = new Map();
    for (let frame of this.scene.sortedFrames) {
      const [, qd] = stateMap.get(frame.id);
      const parentId = this.scene.frameIdParentMap.get(frame.id);
      const globalVelMat = velMatMap.get(frame.id).mul(qd);
      const velSumMat = parentId
        ? globalVelMat.add(velSumMatMap.get(parentId))
        : globalVelMat;
      parentId && tf.dispose(globalVelMat);
      velSumMatMap.set(frame.id, velSumMat);
    }
    return velSumMatMap;
  }

  _getAccelSumMatMap(
    posMatMap = required('posMatMap'),
    velMatMap = required('velMatMap'),
    accelMatMap = required('accelMatMap'),
    velSumMatMap = required('velSumMatMap'),
    stateMap = required('stateMap'),
  ) {
    const accelSumMatMap = new Map();
    for (let frame of this.scene.sortedFrames) {
      const [, qd] = stateMap.get(frame.id);
      const parentId = this.scene.frameIdParentMap.get(frame.id);
      const accelSumMat = tf.tidy(() => {
        const globalAccelMat = accelMatMap.get(frame.id).mul(qd * qd);
        let accelSumMat;
        if (parentId) {
          const parentAccelSumMat = accelSumMatMap.get(parentId);
          const parentVelSumMat = velSumMatMap.get(parentId);
          const globalVelMat = velMatMap.get(frame.id).mul(2 * qd);
          const crossAccelMat = parentVelSumMat.matMul(globalVelMat);
          accelSumMat = globalAccelMat
            .add(crossAccelMat)
            .add(parentAccelSumMat);
        } else {
          accelSumMat = globalAccelMat;
        }
        return accelSumMat;
      });
      accelSumMatMap.set(frame.id, accelSumMat);
    }
    return accelSumMatMap;
  }

  _getWeightPosMap(posMatMap = required('posMatMap')) {
    /**
     * Transform all the weight positions of all the frames into global
     * positions, indexed by frame and mass reference.
     */
    return new Map(
      this.scene.sortedFrames.map((frame) => [
        frame.id,
        frame.weights.map((weight) =>
          posMatMap.get(frame.id).matMul(weight.position),
        ),
      ]),
    );
  }

  _isFrameDescendent(
    descendentFrame = required('descendentFrame'),
    ancestorFrame = required('ancestorFrame'),
  ) {
    return (
      this.scene.frameIdPathMap
        .get(descendentFrame.id)
        .indexOf(ancestorFrame.id) !== -1
    );
  }

  _getDescendentFrame(
    frame1 = required('frame1'),
    frame2 = required('frame2'),
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

  _getDescendentFrames(ancestorFrame = required('ancestorFrame')) {
    return this.scene.sortedFrames.filter((frame) =>
      this._isFrameDescendent(frame, ancestorFrame),
    );
  }

  _getCoefficientMatrixEntry(
    rowIndex = required('rowIndex'),
    colIndex = required('colIndex'),
    velMatMap = required('velMatMap'),
    weightPosMap = required('weightPosMap'),
  ) {
    const frame1 = this.scene.sortedFrames[rowIndex];
    const frame2 = this.scene.sortedFrames[colIndex];
    const velMat1 = velMatMap.get(frame1.id);
    const velMat2 = velMatMap.get(frame2.id);
    const baseFrame = this._getDescendentFrame(frame1, frame2);
    const descendentFrames = baseFrame
      ? this._getDescendentFrames(baseFrame)
      : [];
    let result = 0;
    for (let frame3 of descendentFrames) {
      for (let index = 0; index < frame3.weights.length; index++) {
        const weight = frame3.weights[index];
        const pos = weightPosMap.get(frame3.id)[index];
        const vel1 = velMat1.matMul(pos);
        const vel2 = velMat2.matMul(pos);
        const dot = tf.matMul(vel2, vel1, true);
        result += weight.mass * dot.dataSync()[0];
        tf.dispose([vel1, vel2, dot]);
      }
    }
    return result;
  }

  _getCoefficientMatrix(
    velMatMap = required('velMatMap'),
    weightPosMap = required('weightPosMap'),
  ) {
    const numFrames = this.scene.sortedFrames.length;
    const array = Array(numFrames);
    for (let rowIndex = 0; rowIndex < numFrames; rowIndex++) {
      const columns = Array(numFrames);
      for (let colIndex = 0; colIndex < numFrames; colIndex++) {
        columns[colIndex] = this._getCoefficientMatrixEntry(
          rowIndex,
          colIndex,
          velMatMap,
          weightPosMap,
        );
      }
      array[rowIndex] = columns;
    }
    return tf.tensor2d(array);
  }

  _getForceVectorEntry(
    baseFrame = required('baseFrame'),
    velMatMap = required('velMatMap'),
    velSumMatMap = required('velSumMatMap'),
    accelSumMatMap = required('accelSumMatMap'),
    weightPosMap = required('weightPosMap'),
    stateMap = required('stateMap'),
    externalForceMap = required('externalForceMap'),
  ) {
    let result = 0;
    const baseVelMat = velMatMap.get(baseFrame.id);
    for (let childFrame of this._getDescendentFrames(baseFrame)) {
      const childVelSumMat = velSumMatMap.get(childFrame.id);
      const childAccelSumMat = accelSumMatMap.get(childFrame.id);
      for (
        let weightIndex = 0;
        weightIndex < childFrame.weights.length;
        weightIndex++
      ) {
        const weight = childFrame.weights[weightIndex];
        const weightPos = weightPosMap.get(childFrame.id)[weightIndex];
        const weightBaseVel = baseVelMat.matMul(weightPos);
        const weightChildVelSum = childVelSumMat.matMul(weightPos);
        const weightChildAccelSum = childAccelSumMat.matMul(weightPos);
        const kineticMat = weightBaseVel.matMul(weightChildAccelSum, true);
        const kineticForce = -weight.mass * kineticMat.dataSync()[0];
        const gravityForce =
          -weight.mass * this.scene.gravity * weightBaseVel.dataSync()[1];
        const dragMat = weightBaseVel.matMul(weightChildVelSum, true);
        const dragForce = -weight.drag * dragMat.dataSync()[0];
        tf.dispose([
          weightBaseVel,
          weightChildVelSum,
          weightChildAccelSum,
          kineticMat,
          dragMat,
        ]);
        result = kineticForce + dragForce + gravityForce;
      }
      const [, qd] = stateMap.get(baseFrame.id);
      const resistanceForce = -baseFrame.resistance * qd;
      const externalForce =
        (externalForceMap && externalForceMap.get(baseFrame.id)) || 0;
      result += externalForce + resistanceForce;
    }
    return result;
  }

  _getForceVector(
    velMatMap = required('velMatMap'),
    velSumMatMap = required('velSumMatMap'),
    accelSumMatMap = required('accelSumMatMap'),
    weightPosMap = required('weightPosMap'),
    stateMap = required('stateMap'),
    externalForceMap = required('externalForceMap'),
  ) {
    const numFrames = this.scene.sortedFrames.length;
    const array = Array(numFrames);
    for (let index = 0; index < numFrames; index++) {
      array[index] = this._getForceVectorEntry(
        this.scene.sortedFrames[index],
        velMatMap,
        velSumMatMap,
        accelSumMatMap,
        weightPosMap,
        stateMap,
        externalForceMap,
      );
    }
    return tf.tensor2d(array, [numFrames, 1]);
  }

  _getSystemOfEquations(
    stateMap = required('stateMap'),
    externalForceMap = required('externalForceMap'),
  ) {
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
    const aMat = this._getCoefficientMatrix(velMatMap, weightPosMap);
    const bVec = this._getForceVector(
      velMatMap,
      velSumMatMap,
      accelSumMatMap,
      weightPosMap,
      stateMap,
      externalForceMap,
    );
    tf.dispose([
      ...posMatMap.values(),
      ...invPosMatMap.values(),
      ...velMatMap.values(),
      ...accelMatMap.values(),
      ...velSumMatMap.values(),
      ...accelSumMatMap.values(),
      ...weightPosMap.values(),
    ]);
    return [aMat, bVec];
  }

  _solve(
    stateMap = required('stateMap'),
    externalForceMap = required('externalForceMap'),
  ) {
    const [aMat, bVec] = this._getSystemOfEquations(stateMap, externalForceMap);
    const qddArray = solveLinearSystem(aMat, bVec, { asTensor: false });
    tf.dispose([aMat, bVec]);
    return qddArray;
  }

  _applyDeltas(
    stateMap = required('stateMap'),
    deltaTime = required('deltaTime'),
    deltaQddArray = required('deltaQddArray'),
    deltaQdArray = undefined,
    { inPlace = false } = {},
  ) {
    const newStateMap = inPlace ? stateMap : new Map();
    if (deltaQdArray == null) {
      deltaQdArray = [...stateMap].map(([frameId, [q, qd]]) => qd);
    }
    for (let index = 0; index < this.scene.sortedFrames.length; index++) {
      const frame = this.scene.sortedFrames[index];
      const [q, qd] = stateMap.get(frame.id);
      const deltaQd = deltaQdArray[index];
      const deltaQdd = deltaQddArray[index];
      const newQ = q + deltaQd * deltaTime;
      const newQd = qd + deltaQdd * deltaTime;
      newStateMap.set(frame.id, [newQ, newQd]);
    }
    return newStateMap;
  }

  _tickSimple(
    stateMap = required('stateMap'),
    deltaTime = required('deltaTime'),
    externalForceMap = required('externalForceMap'),
  ) {
    const qddArray = this._solve(stateMap, externalForceMap);
    return this._applyDeltas(stateMap, deltaTime, qddArray);
  }

  _tickRungeKutta(
    stateMap = required('stateMap'),
    deltaTime = required('deltaTime'),
    externalForceMap = required('externalForceMap'),
  ) {
    const solve = (stateMap) => this._solve(stateMap, externalForceMap);

    const sm0 = stateMap;
    const qds0 = [...sm0].map(([frameId, [q, qd]]) => qd);
    const qdds0 = solve(sm0);

    const sm1 = this._applyDeltas(sm0, deltaTime / 2, qdds0, qds0);
    const qds1 = [...sm1].map(([frameId, [q, qd]]) => qd);
    const qdds1 = solve(sm1);

    const sm2 = this._applyDeltas(sm0, deltaTime / 2, qdds1, qds1);
    const qds2 = [...sm2].map(([frameId, [q, qd]]) => qd);
    const qdds2 = solve(sm2);

    const sm3 = this._applyDeltas(sm0, deltaTime, qdds2, qds2);
    const qds3 = [...sm3].map(([frameId, [q, qd]]) => qd);
    const qdds3 = solve(sm3);

    const qds = this.scene.sortedFrames.map(
      (_, i) => (qds0[i] + 2 * qds1[i] + 2 * qds2[i] + qds3[i]) / 6,
    );
    const qdds = this.scene.sortedFrames.map(
      (_, i) => (qdds0[i] + 2 * qdds1[i] + 2 * qdds2[i] + qdds3[i]) / 6,
    );

    let sm = sm0;
    sm = this._applyDeltas(sm, deltaTime, qdds, qds);
    // sm = this._applyDeltas(sm, deltaTime / 3, qdds1, qds1 /*{inPlace: true}*/);
    // sm = this._applyDeltas(sm, deltaTime / 3, qdds2, qds2 /*{inPlace: true}*/);
    // sm = this._applyDeltas(sm, deltaTime / 6, qdds3, qds3 /*{inPlace: true}*/);
    return sm;
  }

  tick(
    stateMap = required('stateMap'),
    deltaTime = required('deltaTime'),
    externalForceMap = null,
    { rungeKutta = false } = {},
  ) {
    const doTick = rungeKutta ? this._tickRungeKutta : this._tickSimple;
    return doTick.bind(this)(stateMap, deltaTime, externalForceMap);
  }
}
