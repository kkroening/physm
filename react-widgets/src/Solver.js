import * as tf from './tfjs';
import { invertXformMatrix } from './utils';
import { required } from './utils';

export default class Solver {
  constructor(scene = required('scene')) {
    this.scene = scene;
  }

  _makeStateMap(qs = required('qs'), qds = required('qds')) {
    return new Map(
      this.scene.sortedFrames.map((frame, index) => [
        frame.id,
        [qs[index], qds[index]],
      ]),
    );
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
      const [_, qd] = stateMap.get(frame.id);
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

  _getWeightPosMap(posMatMap) {
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

  _isFrameDescendent(descendentFrame, ancestorFrame) {
    return (
      this.scene.frameIdPathMap
        .get(descendentFrame.id)
        .index(ancestorFrame.id) != -1
    );
  }

  _getDescendentFrame(frame1, frame2) {
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

  _getDescendentFrames(ancestorFrame) {
    return this.scene.sortedFrames.filter((frame) =>
      this.isFrameDescendent(frame, ancestorFrame),
    );
  }

  _getCoefficientMatrixEntry(rowIndex, colIndex, velMatMap, weightPosMap) {
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
        const pos = weightPosMap.get(frame3)[index];
        result +=
          weight.mass *
          tf
            .matMul(velMat2.matMul(pos), velMat1.matMul(pos), true)
            .dataSync()[0];
      }
    }
    return result;
  }

  _getCoefficientMatrix(velMatMap, weightPosMap) {
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
    baseFrame,
    velMatMap,
    velSumMatMap,
    accelSumMatMap,
    weightPosMap,
  ) {
    let result;
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
          weight.mass *
          weightBaseVel.matMul(weightChildAccelSum, true).dataSync()[0];
        const gravityForce =
          weight.mass * this.scene.gravity * weightBaseVel.dataSync()[1];
        const dragForce =
          weight.drag *
          weightBaseVel.matMul(weightChildVelSum, true).dataSync()[0];
        result -= kineticForce + dragForce + gravityForce;
      }
      const [, qd] = stateMap.get(baseFrame.id);
      const resistanceForce = baseFrame.resistance * qd;
      result -= resistanceForce;
    }
    return result;
  }

  _getForceVector(velMatMap, velSumMatMap, accelSumMatMap, weightPosMap) {
    const numFrames = this.scene.sortedFrames.length;
    const array = Array(numFrames);
    for (let index = 0; index < numFrames; index++) {
      array[index] = this._getForceVectorEntry(
        this.sortedFrames[index],
        baseFrame,
        velMatMap,
        velSumMatMap,
        accelSumMatMap,
        weightPosMap,
      );
    }
    return tf.tensor1d(array).reshape([numFrames, 1]);
  }

  _getSystemOfEquations(
    qs = required('qs'),
    qds = required('qds'),
    qfs = undefined,
  ) {
    const stateMap = this._makeStateMap(qs, qds);
    const numFrames = this.scene.sortedFrames.length;
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
      baseFrame,
      velMatMap,
      velSumMatMap,
      accelSumMatMap,
      weightPosMap,
    );
  }
}

/*
    const aMat = tf.tensor2d(
      this.scene.sortedFrames.map((frame1, index1) => {
        const path1 = this.scene.frameIdPathMap.get(frame1.id);
        const velMat1 = velMatMap.get(frame1.id);
        return this.scene.sortedFrames.map((frame2, index2) => {
          const path2 = this.scene.frameIdPathMap.get(frame2.id);
          if (path2.index(frame1.id) == -1 && path1.index(frame2.id) == -1) {
            return 0;
          }
          const velMat2 = velMatMap.get(frame2.id);
          return this.scene.sortedFrames
            .map((frame3) => {
              const path3 = this.scene.frameIdPathMap.get(frame3.id);
              if (
                path3.index(frame1.id) == -1 ||
                path3.index(frame2.id) == -1
              ) {
                return 0;
              }
              return frame3.weights
                .map(
                  (weight, weightIndex) =>
                    weight.mass *
                    tf
                      .matMul(
                        velMat2.matMul(weightPos),
                        velMat1.matMul(weightPos),
                        true,
                      )
                      .dataSync()[0],
                )
                .reduce((sum, term) => sum + term, 0);
            })
            .reduce((sum, term) => sum + term, 0);
        });
      }),
    );

    const bVec = tf.tensor1d(
      this.scene.sortedFrames.map((frame1, index1) => {
        const path1 = this.scene.frameIdPathMap.get(frame1.id);
        const velMat1 = velMatMap.get(frame1.id);
        const weightForce = this.scene.sortedFrames.map((frame2, index2) => {
          const path2 = this.scene.frameIdPathMap.get(frame2.id);
          if (path2.index(frame1.id) == -1) {
            return 0;
          }
          const velSumMat2 = velSumMatMap.get(frame2.id);
          const accelSumMat2 = accelSumMatMap.get(frame2.id);
          return frame2.weights
            .map((weight, weightIndex) => {
              const weightPos = weightPosMap.get(frame2.id)[weightIndex];
              const weightVel1 = velMat1.matMul(weightPos);
              const weightVelSum2 = velSumMat2.matMul(weightPos);
              const weightAccelSum2 = accelSumMat2.matMul(weightPos);
              const kineticForce =
                weight.mass *
                weightVel1.matMul(weightAccelSum2, true).dataSync()[0];
              const gravityForce =
                weight.mass * this.scene.gravity * weightVel1.dataSync()[1];
              const dragForce =
                weight.drag *
                weightVel1.matMul(weightVelSum2, true).dataSync()[0];
              return kineticForce + dragForce + gravityForce;
            })
            .reduce((sum, term) => sum + term, 0);
        });
        const [, qd1] = stateMap.get(frame1.id);
        const resistanceForce = frame1.resistance * qd1;
        return weightForce + resistanceForce;
      }),
    );
  }
}

    */

/*
    for index_i, frame_i in enumerate(this.scene.sorted_frames):
        frame_i_path = this.scene.frame_path_map[frame_i]
        vel_mat_i = vel_mat_map[frame_i]
        for index_h, frame_h in enumerate(this.scene.sorted_frames):
            frame_h_path = this.scene.frame_path_map[frame_h]
            if frame_i not in frame_h_path and frame_h not in frame_i_path:
                continue
            qdd_coeff = 0.
            vel_mat_h = vel_mat_map[frame_h]
            min_index_j = min(index_i, index_h)
            for index_j, frame_j in enumerate(this.scene.sorted_frames[min_index_j:], min_index_j):
                frame_j_path = this.scene.frame_path_map[frame_j]
                if frame_i not in frame_j_path or frame_h not in frame_j_path:
                    continue
                for mass in frame_j.masses:
                    mass_pos = mass_pos_map[frame_j][mass]
                    qdd_coeff += mass.mass * ((vel_mat_h @ mass_pos).transpose() @ (vel_mat_i @ mass_pos))

            a_mat[index_i, index_h] = qdd_coeff

        for index_j, frame_j in enumerate(this.scene.sorted_frames):  # [index_i:], index_i):
            frame_j_path = this.scene.frame_path_map[frame_j]
            if frame_i not in frame_j_path:
                continue
            vel_sum_mat_j = vel_sum_mat_map[frame_j]
            accel_sum_mat_j = accel_sum_mat_map[frame_j]
            for mass in frame_j.masses:
                mass_pos = mass_pos_map[frame_j][mass]
                mass_vel_i = vel_mat_i @ mass_pos
                mass_vel_sum_j = vel_sum_mat_j @ mass_pos
                mass_accel_sum_j = accel_sum_mat_j @ mass_pos
                b_vec[index_i] -= mass.mass * (mass_vel_i.transpose() @ mass_accel_sum_j)
                b_vec[index_i] -= mass.drag * (mass_vel_i.transpose() @ mass_vel_sum_j)
                b_vec[index_i] -= mass.mass * this.scene.gravity * mass_vel_i[1]

        _, qd_i = state_map[frame_i]
        b_vec[index_i] -= frame_i.resistance * qd_i

        if qfs is not None:
            b_vec[index_i] += qfs[index_i]

        for spring in this.scene.springs:
            path1 = this.scene.frame_path_map[spring.frame1]
            path2 = this.scene.frame_path_map[spring.frame2]
            if frame_i not in path1 and frame_i not in path2:
                continue
            pos1 = pos_mat_map[spring.frame1] @ spring.position1
            pos2 = pos_mat_map[spring.frame2] @ spring.position2
            vel1 = vel_sum_mat_map[spring.frame1] @ pos1
            vel2 = vel_sum_mat_map[spring.frame2] @ pos2
            pos_diff = pos1 - pos2
            vel_diff = vel1 - vel2
            perturb = np.zeros((3, 1))
            if frame_i in path1:
                perturb += (vel_mat_i @ pos1)
            if frame_i in path2:
                perturb -= (vel_mat_i @ pos2)
            b_vec[index_i] -= (pos_diff.transpose() @ perturb) * spring.k
            b_vec[index_i] -= (vel_diff.transpose() @ perturb) * spring.damping

    if False:
        def format_mat_map(mat_map):
            return '\n'.join([f'{k}: {repr(v)}' for k, v in mat_map.items()])
        print('=== vel_mat_map:\n', format_mat_map(vel_mat_map))
        print('=== accel_mat_map:\n', format_mat_map(accel_mat_map))
        print('=== vel_sum_mat_map:\n', format_mat_map(vel_sum_mat_map))
        print('=== accel_sum_mat_map:\n', format_mat_map(accel_sum_mat_map))
        #assert 0

    #assert np.all(np.linalg.eigvals(a_mat) > 0)
    #print(np.det(a_mat))
    #print(np.linalg.eigvals(a_mat))

    return a_mat, b_vec
  }


    def _solve(this, qs, qds, qfs):
        a_mat, b_vec = this.get_system_of_equations(qs, qds, qfs)

        qdds = np.linalg.solve(a_mat, b_vec)
        #norm = np.linalg.norm(qdds)
        #OVERFLOW = 10000.  # tbd
        #if norm > OVERFLOW:
        #    qdds /= (norm / OVERFLOW)

        #qdds[qdds > OVERFLOW] = OVERFLOW
        #qdds[qdds < -OVERFLOW] = -OVERFLOW

        #print(qdds)
        nframes = len(this.scene.sorted_frames)
        return qdds[:nframes]

    def tick_simple(this, state_map, delta_time, force_map={}):
        qs = np.array([state_map[frame][0] for frame in this.scene.sorted_frames])
        qds = np.array([state_map[frame][1] for frame in this.scene.sorted_frames])
        qfs = np.array([force_map.get(frame, 0.) for frame in this.scene.sorted_frames])
        qdds = this._solve(qs, qds, qfs)
        new_qs = qs + qds * delta_time
        new_qds = qds + qdds * delta_time
        return this._make_state_map(new_qs, new_qds)

    def tick(this, state_map, delta_time, force_map={}):
        def f1(qs, qds, qfs):
            return qds

        def f2(qs, qds, qfs):
            return this._solve(qs, qds, qfs)

        qs0 = np.array([state_map[frame][0] for frame in this.scene.sorted_frames])
        qds0 = np.array([state_map[frame][1] for frame in this.scene.sorted_frames])
        qfs = np.array([force_map.get(frame, 0.) for frame in this.scene.sorted_frames])
        k1_qs = f1(qs0, qds0, qfs) * delta_time
        k1_qds = f2(qs0, qds0, qfs) * delta_time
        k2_qs = f1(qs0 + 0.5 * k1_qs, qds0 + 0.5 * k1_qds, qfs) * delta_time
        k2_qds = f2(qs0 + 0.5 * k1_qs, qds0 + 0.5 * k1_qds, qfs) * delta_time
        k3_qs = f1(qs0 + 0.5 * k2_qs, qds0 + 0.5 * k2_qds, qfs) * delta_time
        k3_qds = f2(qs0 + 0.5 * k2_qs, qds0 + 0.5 * k2_qds, qfs) * delta_time
        k4_qs = f1(qs0 + k3_qs, qds0 + k3_qds, qfs) * delta_time
        k4_qds = f2(qs0 + k3_qs, qds0 + k3_qds, qfs) * delta_time
        new_qs = qs0 + (k1_qs + 2 * k2_qs + 2 * k3_qs + k4_qs) / 6.
        new_qds = qds0 + (k1_qds + 2 * k2_qds + 2 * k3_qds + k4_qds) / 6.
        return this._make_state_map(new_qs, new_qds)
*/
