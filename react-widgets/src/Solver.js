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
      let mat = frame.getPosMatrix(q);
      if (parentId) {
        mat = posMatMap.get(parentId).matMul(mat);
      }
      posMatMap.set(frame.id, mat);
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
        let mat = frame.getVelMatrix(q).matMul(invPosMatMap.get(frame.id));
        if (parentId) {
          mat = posMatMap.get(parentId).matMul(mat);
        }
        return [frame.id, mat];
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
        let mat = frame.getAccelMatrix(q).matMul(invPosMatMap.get(frame.id));
        if (parentId) {
          mat = posMatMap.get(parentId).matMul(mat);
        }
        return [frame.id, mat];
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
      let mat = velMatMap.get(frame.id).mul(qd);
      if (parentId) {
        mat = mat.add(velSumMatMap.get(parentId));
      }
      velSumMatMap.set(frame.id, mat);
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
      let mat = accelMatMap.get(frame.id).mul(qd * qd);
      if (parentId) {
        const parentAccelSumMat = accelSumMatMap.get(parentId);
        const parentVelSumMat = velSumMatMap.get(parentId);
        const velMat = velMatMap.get(frame.id);
        mat = mat
          .add(parentAccelSumMat)
          .add(parentVelSumMat.matMul(velMat).mul(2 * qd));
      }
      accelSumMatMap.set(frame.id, mat);
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
        result +=
          weight.mass *
          tf
            .matMul(velMat2.matMul(pos), velMat1.matMul(pos), true)
            .dataSync()[0];
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
        const kineticForce =
          -weight.mass *
          weightBaseVel.matMul(weightChildAccelSum, true).dataSync()[0];
        const gravityForce =
          -weight.mass * this.scene.gravity * weightBaseVel.dataSync()[1];
        const dragForce =
          -weight.drag *
          weightBaseVel.matMul(weightChildVelSum, true).dataSync()[0];
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
    return tf.tensor1d(array).reshape([numFrames, 1]);
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
    return [aMat, bVec];
  }

  _solve(
    stateMap = required('stateMap'),
    externalForceMap = required('externalForceMap'),
  ) {
    const [aMat, bVec] = this._getSystemOfEquations(stateMap, externalForceMap);
    return solveLinearSystem(aMat, bVec, { asTensor: false });
  }

  _applyDeltas(
    stateMap = required('stateMap'),
    deltaTime = required('deltaTime'),
    qddArray = required('qddArray'),
    qdArray = undefined,
    { inPlace = false } = {},
  ) {
    const newStateMap = inPlace ? stateMap : new Map();
    if (qdArray == null) {
      qdArray = [...stateMap].map(([frame, [q, qd]]) => qd);
    }
    for (let index = 0; index < this.scene.sortedFrames.length; index++) {
      const frame = this.scene.sortedFrames[index];
      const [q] = stateMap.get(frame.id);
      const qd = qdArray[index];
      const qdd = qddArray[index];
      const newQ = q + qd * deltaTime;
      const newQd = qd + qdd * deltaTime;
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

  _makeStateMap(qs = required('qs'), qds = required('qds')) {
    return new Map(
      this.scene.sortedFrames.map((frame, index) => [
        frame.id,
        [qs[index], qds[index]],
      ]),
    );
  }

  _tickRungeKutta(
    stateMap = required('stateMap'),
    deltaTime = required('deltaTime'),
    externalForceMap = required('externalForceMap'),
  ) {
    const solve = (stateMap) => this._solve(stateMap, externalForceMap);

    const sm0 = stateMap;
    const qds0 = [...sm0].map(([frame, [q, qd]]) => qd);
    const qdds0 = solve(sm0);

    const sm1 = this._applyDeltas(sm0, deltaTime / 2, qdds0, qds0);
    const qds1 = [...sm1].map(([frame, [q, qd]]) => qd);
    const qdds1 = solve(sm1);

    const sm2 = this._applyDeltas(sm0, deltaTime / 2, qdds1, qds1);
    const qds2 = [...sm2].map(([frame, [q, qd]]) => qd);
    const qdds2 = solve(sm2);

    const sm3 = this._applyDeltas(sm0, deltaTime / 2, qdds2, qds2);
    const qds3 = [...sm3].map(([frame, [q, qd]]) => qd);
    const qdds3 = solve(sm3);

    const sm4 = this._applyDeltas(sm0, deltaTime, qdds3, qds3);
    const qds4 = [...sm4].map(([frame, [q, qd]]) => qd);
    const qdds4 = solve(sm4);

    let sm = sm0;
    sm = this._applyDeltas(sm, deltaTime / 6, qdds1, qds1);
    sm = this._applyDeltas(sm, deltaTime / 3, qdds2, qds2 /*{inPlace: true}*/);
    sm = this._applyDeltas(sm, deltaTime / 3, qdds3, qds3 /*{inPlace: true}*/);
    sm = this._applyDeltas(sm, deltaTime / 6, qdds4, qds4 /*{inPlace: true}*/);
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
