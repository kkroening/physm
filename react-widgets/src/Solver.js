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

  _getWeightVelMap(velSumMatMap, weightPosMap) {
    /**
     * Transform all the weight positions of all the frames into global
     * positions, indexed by frame and mass reference.
     */
    return new Map(
      this.scene.sortedFrames.map((frame) => [
        frame.id,
        frame.weights.map((weight, index) =>
          velSumMatMap.get(frame.id).matMul(weightPosMap.get(frame.id)[index]),
        ),
      ]),
    );
  }
}

/*
    def get_system_of_equations(this, qs, qds, qfs=None):
        state_map = this._make_state_map(qs, qds)
        nframes = len(this.scene.sorted_frames)
        ncoeffs = nframes
        a_mat = np.zeros((ncoeffs, ncoeffs))
        b_vec = np.zeros((ncoeffs))

        pos_mat_map = this._get_pos_mat_map(state_map)
        inv_pos_mat_map = this._get_inv_pos_mat_map(pos_mat_map)
        vel_mat_map = this._get_vel_mat_map(pos_mat_map, inv_pos_mat_map, state_map)
        accel_mat_map = this._get_accel_mat_map(pos_mat_map, inv_pos_mat_map, state_map)
        vel_sum_mat_map = this._get_vel_sum_mat_map(
            pos_mat_map, vel_mat_map, state_map
        )
        accel_sum_mat_map = this._get_accel_sum_mat_map(
            pos_mat_map, vel_mat_map, accel_mat_map, vel_sum_mat_map, state_map
        )
        mass_pos_map = this._get_mass_pos_map(pos_mat_map)
        mass_vel_map = this._get_mass_vel_map(vel_sum_mat_map, mass_pos_map)

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
