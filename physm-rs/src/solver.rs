use std::collections::HashMap;
use std::iter;

use crate::constraint::ConstraintCtx;
use crate::ConstraintBox;
use crate::FrameBox;
use crate::FrameId;
use crate::Mat3;
use crate::Scene;
use crate::State;
use crate::Vec3;

#[derive(Debug)]
pub struct Solver {
    pub scene: Scene,
    pub runge_kutta: bool,
    /// Whether to project the state back onto the constraint manifold after each
    /// step. On by default, matching `Solver` in `physm-js` -- an unstabilized rig
    /// looks correct for a minute and then comes apart, which is quiet and looks
    /// like a modelling mistake, while stabilizing a scene that did not need it
    /// costs a solve per step and shows up in a profile. See `stabilize_mut`.
    pub stabilize: bool,
}

type FrameIndex = usize;
type FramePath = Vec<FrameIndex>;
type FrameIdIndexMap<'a> = HashMap<&'a FrameId, FrameIndex>;
type FrameIndexPathMap = HashMap<FrameIndex, Vec<FrameIndex>>;

type CoefficientMatrix = nalgebra::DMatrix<f64>;
type ForceVector = nalgebra::DVector<f64>;

fn sort_frames(frames: &[FrameBox]) -> Vec<&FrameBox> {
    fn visit<'a>(frame: &'a FrameBox, sorted_frames: &mut Vec<&'a FrameBox>) {
        frame
            .get_children()
            .iter()
            .for_each(|child| visit(child, sorted_frames));
        sorted_frames.push(frame);
    }

    let mut sorted_frames = Vec::new();
    frames
        .iter()
        .for_each(|frame| visit(&frame, &mut sorted_frames));
    sorted_frames.reverse();
    sorted_frames
}

fn get_id_index_map<'a>(frames: &'a [&FrameBox]) -> FrameIdIndexMap<'a> {
    let mut id_index_map = FrameIdIndexMap::new();
    id_index_map.reserve(frames.len());
    frames.iter().enumerate().for_each(|(index, frame)| {
        id_index_map.insert(frame.get_id(), index);
    });
    id_index_map
}

fn get_index_path_map(frames: &[&FrameBox]) -> FrameIndexPathMap {
    fn visit(
        frame: &FrameBox,
        mut path: FramePath,
        id_index_map: &FrameIdIndexMap,
        index_path_map: &mut FrameIndexPathMap,
    ) {
        let index = id_index_map[frame.get_id()];
        if !index_path_map.contains_key(&index) {
            path.push(index);
            index_path_map.insert(index, path);
            frame.get_children().iter().for_each(|child| {
                visit(
                    child,
                    index_path_map.get(&index).unwrap().to_owned(),
                    id_index_map,
                    index_path_map,
                )
            });
        }
    }

    let id_index_map = get_id_index_map(frames);
    let mut index_path_map = HashMap::new();
    index_path_map.reserve(frames.len());
    frames
        .iter()
        .for_each(|frame| visit(&frame, Vec::new(), &id_index_map, &mut index_path_map));
    index_path_map
}

fn get_parent_index(
    child_index: FrameIndex,
    index_path_map: &FrameIndexPathMap,
) -> Option<FrameIndex> {
    let path = &index_path_map[&child_index];
    match path.len() > 1 {
        true => Some(path[path.len() - 2]),
        false => None,
    }
}

fn get_pos_mats(
    frames: &[&FrameBox],
    index_path_map: &FrameIndexPathMap,
    states: &[State],
) -> Vec<Mat3> {
    debug_assert_eq!(index_path_map.len(), frames.len());
    debug_assert_eq!(states.len(), frames.len());
    let get_parent_index = |index| get_parent_index(index, index_path_map);
    let mut pos_mats = Vec::<Mat3>::new();
    pos_mats.reserve(frames.len());
    frames.iter().enumerate().for_each(|(index, frame)| {
        let local_pos_mat = frame.get_local_pos_matrix(states[index].q);
        let pos_mat = match get_parent_index(index) {
            None => local_pos_mat,
            Some(parent_index) => pos_mats[parent_index] * local_pos_mat,
        };
        pos_mats.push(pos_mat);
    });
    pos_mats
}

fn get_inv_pos_mats(pos_mats: &[Mat3]) -> Vec<Mat3> {
    pos_mats
        .iter()
        .map(|mat| mat.try_inverse().unwrap())
        .collect()
}

fn get_vel_mats(
    frames: &[&FrameBox],
    index_path_map: &FrameIndexPathMap,
    pos_mats: &[Mat3],
    inv_pos_mats: &[Mat3],
    states: &[State],
) -> Vec<Mat3> {
    debug_assert_eq!(index_path_map.len(), frames.len());
    debug_assert_eq!(pos_mats.len(), frames.len());
    debug_assert_eq!(inv_pos_mats.len(), frames.len());
    debug_assert_eq!(states.len(), frames.len());
    let get_parent_index = |index| get_parent_index(index, index_path_map);
    frames
        .iter()
        .enumerate()
        .map(|(index, frame)| {
            let inv_pos_mat = &inv_pos_mats[index];
            let local_vel_mat = frame.get_local_vel_matrix(states[index].q);
            let rel_vel_mat = local_vel_mat * inv_pos_mat;
            let vel_mat = match get_parent_index(index) {
                None => rel_vel_mat,
                Some(parent_index) => pos_mats[parent_index] * rel_vel_mat,
            };
            vel_mat
        })
        .collect()
}

fn get_accel_mats(
    frames: &[&FrameBox],
    index_path_map: &FrameIndexPathMap,
    pos_mats: &[Mat3],
    inv_pos_mats: &[Mat3],
    states: &[State],
) -> Vec<Mat3> {
    debug_assert_eq!(index_path_map.len(), frames.len());
    debug_assert_eq!(pos_mats.len(), frames.len());
    debug_assert_eq!(inv_pos_mats.len(), frames.len());
    debug_assert_eq!(states.len(), frames.len());
    let get_parent_index = |index| get_parent_index(index, index_path_map);
    frames
        .iter()
        .enumerate()
        .map(|(index, frame)| {
            let inv_pos_mat = &inv_pos_mats[index];
            let local_accel_mat = frame.get_local_accel_matrix(states[index].q);
            let rel_accel_mat = local_accel_mat * inv_pos_mat;
            let accel_mat = match get_parent_index(index) {
                None => rel_accel_mat,
                Some(parent_index) => pos_mats[parent_index] * rel_accel_mat,
            };
            accel_mat
        })
        .collect()
}

fn get_vel_sum_mats(
    frames: &[&FrameBox],
    index_path_map: &FrameIndexPathMap,
    pos_mats: &[Mat3],
    vel_mats: &[Mat3],
    states: &[State],
) -> Vec<Mat3> {
    debug_assert_eq!(index_path_map.len(), frames.len());
    debug_assert_eq!(pos_mats.len(), frames.len());
    debug_assert_eq!(vel_mats.len(), frames.len());
    debug_assert_eq!(states.len(), frames.len());
    let get_parent_index = |index| get_parent_index(index, index_path_map);
    let mut vel_sum_mats = Vec::<Mat3>::new();
    vel_sum_mats.reserve(frames.len());
    for index in 0..frames.len() {
        let qd_vel_mat = states[index].qd * vel_mats[index];
        let vel_sum_mat = match get_parent_index(index) {
            None => qd_vel_mat,
            Some(parent_index) => qd_vel_mat + vel_sum_mats[parent_index],
        };
        vel_sum_mats.push(vel_sum_mat);
    }
    vel_sum_mats
}

fn get_accel_sum_mats(
    frames: &[&FrameBox],
    index_path_map: &FrameIndexPathMap,
    pos_mats: &[Mat3],
    vel_mats: &[Mat3],
    accel_mats: &[Mat3],
    vel_sum_mats: &[Mat3],
    states: &[State],
) -> Vec<Mat3> {
    debug_assert_eq!(index_path_map.len(), frames.len());
    debug_assert_eq!(pos_mats.len(), frames.len());
    debug_assert_eq!(vel_mats.len(), frames.len());
    debug_assert_eq!(accel_mats.len(), frames.len());
    debug_assert_eq!(vel_sum_mats.len(), frames.len());
    debug_assert_eq!(states.len(), frames.len());
    let get_parent_index = |index| get_parent_index(index, index_path_map);
    let mut accel_sum_mats = Vec::<Mat3>::new();
    accel_sum_mats.reserve(frames.len());
    for index in 0..frames.len() {
        let qd = states[index].qd;
        let accel_sum_mat = match get_parent_index(index) {
            None => qd * qd * accel_mats[index],
            Some(parent_index) => {
                accel_sum_mats[parent_index]
                    + qd * qd * accel_mats[index]
                    + 2. * qd * vel_sum_mats[parent_index] * vel_mats[index]
            }
        };
        accel_sum_mats.push(accel_sum_mat);
    }
    accel_sum_mats
}

fn get_weight_offsets(frames: &[&FrameBox]) -> Vec<FrameIndex> {
    iter::once(0)
        .chain(frames.iter().map(|frame| frame.get_weights().len()))
        .scan(0, |acc, x| {
            *acc += x;
            Some(*acc)
        })
        .collect()
}

fn get_weight_pos_vecs(frames: &[&FrameBox], pos_mats: &[Mat3]) -> Vec<Vec3> {
    debug_assert_eq!(pos_mats.len(), frames.len());
    frames
        .iter()
        .zip(pos_mats.iter())
        .map(|(frame, pos_mat)| {
            frame
                .get_weights()
                .iter()
                .map(|weight| pos_mat * weight.position.to_vec3())
                .collect::<Vec<Vec3>>()
        })
        .flatten()
        .collect()
}

fn path_contains(path: &FramePath, parent_index: FrameIndex) -> bool {
    path.iter().any(|index| *index == parent_index)
}

/// The configuration-only sweeps: everything a constraint's `value` and
/// `jacobian_rows` read, as a function of `q` alone.
///
/// Extracted rather than left inline so those can be evaluated at trial
/// configurations no solve was run at — which is what a projection stabilization
/// pass iterates over, and what an interface that only ever handed out a solve's
/// own sweeps would quietly prevent (`docs/constraints.md` §7, seam 4).
fn get_config_kinematics(
    frames: &[&FrameBox],
    index_path_map: &FrameIndexPathMap,
    states: &[State],
) -> (Vec<Mat3>, Vec<Mat3>) {
    let pos_mats = get_pos_mats(frames, index_path_map, states);
    let inv_pos_mats = get_inv_pos_mats(&pos_mats);
    let vel_mats = get_vel_mats(frames, index_path_map, &pos_mats, &inv_pos_mats, states);
    (pos_mats, vel_mats)
}

/// Resolves each constraint's two frame ids to sorted-frame indices.
///
/// Fails loudly rather than skipping: a constraint naming a frame that is not in
/// the scene is an authoring error, and silently dropping it would leave a loop
/// open with nothing to show for it.
fn get_constraint_frame_indices(
    frames: &[&FrameBox],
    constraints: &[ConstraintBox],
) -> Vec<(FrameIndex, FrameIndex)> {
    let id_index_map = get_id_index_map(frames);
    constraints
        .iter()
        .map(|constraint| {
            let (id1, id2) = constraint.frame_ids();
            let lookup = |id: &FrameId| {
                *id_index_map
                    .get(id)
                    .unwrap_or_else(|| panic!("constraint references unknown frame id: {}", id))
            };
            (lookup(id1), lookup(id2))
        })
        .collect()
}

fn get_composite_moment_mats(
    frames: &[&FrameBox],
    index_path_map: &FrameIndexPathMap,
    weight_offsets: &[FrameIndex],
    weight_pos_vecs: &[Vec3],
) -> Vec<Mat3> {
    debug_assert_eq!(index_path_map.len(), frames.len());
    debug_assert_eq!(weight_offsets.len() - 1, frames.len());
    debug_assert_eq!(weight_pos_vecs.len(), *weight_offsets.last().unwrap());
    let mut moment_mats = vec![Mat3::zeros(); frames.len()];
    for index in (0..frames.len()).rev() {
        let offset = weight_offsets[index];
        let own_moment = frames[index].get_weights().iter().enumerate().fold(
            Mat3::zeros(),
            |acc, (weight_index, weight)| {
                let pos = weight_pos_vecs[offset + weight_index];
                acc + (weight.mass * pos) * pos.transpose()
            },
        );
        moment_mats[index] += own_moment;
        if let Some(parent_index) = get_parent_index(index, index_path_map) {
            let subtree_moment = moment_mats[index];
            moment_mats[parent_index] += subtree_moment;
        }
    }
    moment_mats
}

fn get_composite_force_mats(
    frames: &[&FrameBox],
    index_path_map: &FrameIndexPathMap,
    vel_sum_mats: &[Mat3],
    accel_sum_mats: &[Mat3],
    weight_offsets: &[FrameIndex],
    weight_pos_vecs: &[Vec3],
    gravity: &Vec3,
) -> Vec<Mat3> {
    debug_assert_eq!(index_path_map.len(), frames.len());
    debug_assert_eq!(vel_sum_mats.len(), frames.len());
    debug_assert_eq!(accel_sum_mats.len(), frames.len());
    debug_assert_eq!(weight_offsets.len() - 1, frames.len());
    debug_assert_eq!(weight_pos_vecs.len(), *weight_offsets.last().unwrap());
    let mut force_mats = vec![Mat3::zeros(); frames.len()];
    for index in (0..frames.len()).rev() {
        let offset = weight_offsets[index];
        let own_force = frames[index].get_weights().iter().enumerate().fold(
            Mat3::zeros(),
            |acc, (weight_index, weight)| {
                let pos = weight_pos_vecs[offset + weight_index];
                let force_vec = weight.mass * gravity
                    - weight.mass * accel_sum_mats[index] * pos
                    - weight.drag * vel_sum_mats[index] * pos;
                acc + force_vec * pos.transpose()
            },
        );
        force_mats[index] += own_force;
        if let Some(parent_index) = get_parent_index(index, index_path_map) {
            let subtree_force = force_mats[index];
            force_mats[parent_index] += subtree_force;
        }
    }
    force_mats
}

/// Requires `row_index` to be an inclusive ancestor of `col_index`.
///
/// Off that relation the contraction is against the wrong subtree's composite moment and
/// returns a plausible but meaningless number rather than the structural zero the entry
/// actually has. `get_coefficient_matrix` only ever asks for pairs drawn from a column's
/// root path, so the precondition holds by construction there.
fn get_coefficient_matrix_entry(
    row_index: FrameIndex,
    col_index: FrameIndex,
    index_path_map: &FrameIndexPathMap,
    vel_mats: &[Mat3],
    composite_moment_mats: &[Mat3],
) -> f64 {
    debug_assert!(row_index < vel_mats.len());
    debug_assert!(col_index < vel_mats.len());
    debug_assert_eq!(composite_moment_mats.len(), vel_mats.len());
    debug_assert!(path_contains(&index_path_map[&col_index], row_index));
    (vel_mats[row_index].transpose() * vel_mats[col_index] * composite_moment_mats[col_index])
        .trace()
}

fn get_coefficient_matrix(
    frames: &[&FrameBox],
    index_path_map: &FrameIndexPathMap,
    vel_mats: &[Mat3],
    composite_moment_mats: &[Mat3],
) -> CoefficientMatrix {
    debug_assert_eq!(index_path_map.len(), frames.len());
    debug_assert_eq!(vel_mats.len(), frames.len());
    debug_assert_eq!(composite_moment_mats.len(), frames.len());
    let size = frames.len();
    let mut coefficient_matrix = CoefficientMatrix::zeros(size, size);
    for col_index in 0..size {
        for &row_index in index_path_map[&col_index].iter() {
            let entry = get_coefficient_matrix_entry(
                row_index,
                col_index,
                index_path_map,
                vel_mats,
                composite_moment_mats,
            );
            coefficient_matrix[(row_index, col_index)] = entry;
            coefficient_matrix[(col_index, row_index)] = entry;
        }
    }

    // A coordinate that moves nothing -- a fixed frame's -- has a row and a
    // column of zeros, which would leave the system singular. It is given an
    // inertia of its own instead. That changes nothing else: it stays
    // decoupled, and with nothing acting on it, it stays at rest. It is the
    // largest joint's, matching `Scene.getMassMatrix`, so the relative
    // singularity test finds nothing small in it.
    let largest = (0..size)
        .filter(|&index| frames[index].is_joint())
        .map(|index| coefficient_matrix[(index, index)])
        .fold(0., f64::max);
    let inertia = if largest > 0. { largest } else { 1. };
    for index in (0..size).filter(|&index| !frames[index].is_joint()) {
        coefficient_matrix[(index, index)] = inertia;
    }
    coefficient_matrix
}

fn get_force_vector_entry(
    row_index: FrameIndex,
    frames: &[&FrameBox],
    vel_mats: &[Mat3],
    composite_force_mats: &[Mat3],
    states: &[State],
    external_forces: &[f64],
) -> f64 {
    debug_assert!(row_index < frames.len());
    debug_assert_eq!(vel_mats.len(), frames.len());
    debug_assert_eq!(composite_force_mats.len(), frames.len());
    debug_assert_eq!(states.len(), frames.len());
    debug_assert_eq!(external_forces.len(), frames.len());
    let weight_force = (vel_mats[row_index].transpose() * composite_force_mats[row_index]).trace();
    let resistance_force = -states[row_index].qd * frames[row_index].get_resistance();
    resistance_force + weight_force + external_forces[row_index]
}

fn get_force_vector(
    frames: &[&FrameBox],
    vel_mats: &[Mat3],
    composite_force_mats: &[Mat3],
    states: &[State],
    external_forces: &[f64],
) -> ForceVector {
    let get_entry = |row, col| {
        debug_assert_eq!(col, 0);
        get_force_vector_entry(
            row,
            frames,
            vel_mats,
            composite_force_mats,
            states,
            external_forces,
        )
    };
    ForceVector::from_fn(frames.len(), get_entry)
}

/// Writes the constraint blocks into an already-sized augmented system.
///
/// The layout is the symmetric saddle point
///
/// ```text
///   [ g    Jᵀ ] [ q̈ ]   [ f     ]
///   [ J    0  ] [ λ  ] = [ -J̇q̇ ]
/// ```
///
/// Kept symmetric deliberately. λ is a free variable, so scaling one off-diagonal
/// block and not the other still yields the correct q̈ — it only rescales λ, which
/// is what `physm-py` did. Symmetry is what allows a symmetric indefinite
/// factorization later, and what makes a reported constraint force mean anything.
fn write_constraint_blocks(
    coefficient_matrix: &mut CoefficientMatrix,
    force_vector: &mut ForceVector,
    frames: &[&FrameBox],
    index_path_map: &FrameIndexPathMap,
    constraints: &[ConstraintBox],
    constraint_frame_indices: &[(FrameIndex, FrameIndex)],
    pos_mats: &[Mat3],
    vel_mats: &[Mat3],
    vel_sum_mats: &[Mat3],
    accel_sum_mats: &[Mat3],
) {
    let frame_count = frames.len();
    let mut row = frame_count;
    for (constraint, &(index_a, index_b)) in constraints.iter().zip(constraint_frame_indices) {
        let ctx = ConstraintCtx {
            frame_count,
            index_a,
            index_b,
            path_a: &index_path_map[&index_a],
            path_b: &index_path_map[&index_b],
            pos_mats,
            vel_mats,
            vel_sum_mats: Some(vel_sum_mats),
            accel_sum_mats: Some(accel_sum_mats),
        };
        let jacobian_rows = constraint.jacobian_rows(&ctx);
        let bias = constraint.bias(&ctx);
        debug_assert_eq!(jacobian_rows.len(), constraint.row_count());
        debug_assert_eq!(bias.len(), constraint.row_count());
        for (jacobian_row, bias_entry) in jacobian_rows.iter().zip(bias.iter()) {
            for (col, &entry) in jacobian_row.iter().enumerate() {
                coefficient_matrix[(row, col)] = entry;
                coefficient_matrix[(col, row)] = entry;
            }
            force_vector[row] = -bias_entry;
            row += 1;
        }
    }
    debug_assert_eq!(row, coefficient_matrix.nrows());
}

fn get_system_of_equations(
    frames: &[&FrameBox],
    index_path_map: &FrameIndexPathMap,
    constraints: &[ConstraintBox],
    constraint_frame_indices: &[(FrameIndex, FrameIndex)],
    gravity: &Vec3,
    states: &[State],
    external_forces: &[f64],
) -> (CoefficientMatrix, ForceVector) {
    let (pos_mats, vel_mats) = get_config_kinematics(frames, index_path_map, states);
    let inv_pos_mats = get_inv_pos_mats(&pos_mats);
    let vel_sum_mats = get_vel_sum_mats(frames, index_path_map, &pos_mats, &vel_mats, states);
    let accel_mats = get_accel_mats(frames, index_path_map, &pos_mats, &inv_pos_mats, states);
    let accel_sum_mats = get_accel_sum_mats(
        frames,
        index_path_map,
        &pos_mats,
        &vel_mats,
        &accel_mats,
        &vel_sum_mats,
        states,
    );
    let weight_offsets = get_weight_offsets(frames);
    let weight_pos_vecs = get_weight_pos_vecs(frames, &pos_mats);
    let composite_moment_mats =
        get_composite_moment_mats(frames, index_path_map, &weight_offsets, &weight_pos_vecs);
    let composite_force_mats = get_composite_force_mats(
        frames,
        index_path_map,
        &vel_sum_mats,
        &accel_sum_mats,
        &weight_offsets,
        &weight_pos_vecs,
        gravity,
    );
    let unconstrained_matrix =
        get_coefficient_matrix(frames, index_path_map, &vel_mats, &composite_moment_mats);
    let unconstrained_forces = get_force_vector(
        frames,
        &vel_mats,
        &composite_force_mats,
        states,
        external_forces,
    );

    let frame_count = frames.len();
    let row_count: usize = constraints.iter().map(|c| c.row_count()).sum();
    if row_count == 0 {
        return (unconstrained_matrix, unconstrained_forces);
    }

    // The (1,1) block and the first n forces are exactly the unconstrained system;
    // constraints are additive rather than a different assembly.
    let size = frame_count + row_count;
    let mut coefficient_matrix = CoefficientMatrix::zeros(size, size);
    for row in 0..frame_count {
        for col in 0..frame_count {
            coefficient_matrix[(row, col)] = unconstrained_matrix[(row, col)];
        }
    }
    let mut force_vector = ForceVector::zeros(size);
    for row in 0..frame_count {
        force_vector[row] = unconstrained_forces[row];
    }

    write_constraint_blocks(
        &mut coefficient_matrix,
        &mut force_vector,
        frames,
        index_path_map,
        constraints,
        constraint_frame_indices,
        &pos_mats,
        &vel_mats,
        &vel_sum_mats,
        &accel_sum_mats,
    );
    (coefficient_matrix, force_vector)
}

fn solve(
    frames: &[&FrameBox],
    index_path_map: &FrameIndexPathMap,
    constraints: &[ConstraintBox],
    constraint_frame_indices: &[(FrameIndex, FrameIndex)],
    gravity: &Vec3,
    states: &[State],
    external_forces: &[f64],
) -> Vec<f64> {
    let (coefficient_matrix, force_vector) = get_system_of_equations(
        frames,
        index_path_map,
        constraints,
        constraint_frame_indices,
        gravity,
        states,
        external_forces,
    );
    // QR, not Cholesky: with constraints the augmented matrix is symmetric
    // *indefinite* -- the zero block guarantees negative eigenvalues -- so the
    // Cholesky suggestion in algorithm.md is constraint-incompatible.
    let solution = coefficient_matrix.qr().solve(&force_vector).unwrap();
    // The tail entries are the multipliers; only q̈ leaves this function.
    solution.as_slice()[..frames.len()].to_vec()
}

/// The relative tolerance the Newton iteration converges to, matching
/// `CONSISTENCY_RELATIVE_TOLERANCE` in `physm-js`.
const STABILIZATION_TOLERANCE: f64 = 1e-5;

/// When a factorization counts as singular, matching
/// `SINGULAR_RELATIVE_TOLERANCE` in `physm-js`'s `solveLinearSystem`.
const SINGULAR_RELATIVE_TOLERANCE: f64 = 1e-12;

/// How many Newton steps the position half takes before giving up on this tick.
const STABILIZATION_MAX_ITERATIONS: usize = 4;

/// The mass matrix `g` at a configuration, without the rest of the system.
///
/// `get_system_of_equations` builds this on its way to the augmented matrix and
/// then builds `f`, the constraint blocks and both velocity-dependent sweeps on
/// top. Projection wants only `g`, at trial configurations no solve was run at.
fn get_mass_matrix(
    frames: &[&FrameBox],
    index_path_map: &FrameIndexPathMap,
    pos_mats: &[Mat3],
    vel_mats: &[Mat3],
) -> CoefficientMatrix {
    let weight_offsets = get_weight_offsets(frames);
    let weight_pos_vecs = get_weight_pos_vecs(frames, pos_mats);
    let composite_moment_mats =
        get_composite_moment_mats(frames, index_path_map, &weight_offsets, &weight_pos_vecs);
    get_coefficient_matrix(frames, index_path_map, vel_mats, &composite_moment_mats)
}

/// Every constraint's rows, stacked, at one configuration.
fn get_jacobian_rows(
    frames: &[&FrameBox],
    index_path_map: &FrameIndexPathMap,
    constraints: &[ConstraintBox],
    constraint_frame_indices: &[(FrameIndex, FrameIndex)],
    pos_mats: &[Mat3],
    vel_mats: &[Mat3],
) -> (Vec<Vec<f64>>, Vec<f64>) {
    let frame_count = frames.len();
    let mut rows = Vec::new();
    let mut values = Vec::new();
    for (constraint, &(index_a, index_b)) in constraints.iter().zip(constraint_frame_indices) {
        let ctx = ConstraintCtx {
            frame_count,
            index_a,
            index_b,
            path_a: &index_path_map[&index_a],
            path_b: &index_path_map[&index_b],
            pos_mats,
            vel_mats,
            // Configuration-only, which is the whole point of seam 4: `value` and
            // `jacobian_rows` never read these, and a `Some` here would be a claim
            // that velocities belonging to some other configuration are valid at
            // this one.
            vel_sum_mats: None,
            accel_sum_mats: None,
        };
        rows.extend(constraint.jacobian_rows(&ctx));
        values.extend(constraint.value(&ctx));
    }
    (rows, values)
}

/// Whether a factorization's upper factor is singular, by the *relative* test.
///
/// `nalgebra` reports singularity only on a bit-exact zero pivot, and exact rank
/// deficiency has measure zero in float64 -- so a near-collinear chain factors
/// "successfully" and then divides by a pivot around `1e-15`, producing
/// multipliers of order `1e14` that are finite, plausible, and not a correction.
/// `physm-js` compares each pivot against the largest instead, which is what makes
/// its taut-chain skip reachable at all; this is the same predicate, so the two
/// implementations agree on when to skip rather than only on what to compute.
fn is_singular(upper: &CoefficientMatrix) -> bool {
    let diagonal = upper.diagonal();
    let scale = diagonal.iter().map(|entry| entry.abs()).fold(0., f64::max);
    let worst = diagonal
        .iter()
        .map(|entry| entry.abs())
        .fold(f64::INFINITY, f64::min);
    scale == 0. || worst <= SINGULAR_RELATIVE_TOLERANCE * scale
}

/// `g⁻¹Jᵀ(Jg⁻¹Jᵀ)⁻¹ r` — the correction both halves of projection are built from.
///
/// Feed it `J q̇` and subtracting the result makes a velocity consistent; feed it
/// `C` and subtracting the result is one Newton step toward `C = 0`. Same `g`,
/// same gram matrix, same solve — only the right-hand side differs.
///
/// `None` when the gram matrix is singular, which is what a collinear (taut) chain
/// produces. Mirrors `Scene._solveMetricCorrection` in `physm-js`.
fn solve_metric_correction(
    mass_matrix: &CoefficientMatrix,
    rows: &[Vec<f64>],
    residual: &[f64],
) -> Option<Vec<f64>> {
    let frame_count = mass_matrix.nrows();
    let row_count = rows.len();
    // One factorization of `g` serves every row; re-factorizing per row would be
    // `m` times the work for the same answer.
    let mass_lu = mass_matrix.clone().lu();
    if is_singular(&mass_lu.u()) {
        return None;
    }
    let mut inv_mass_jt = Vec::with_capacity(row_count);
    for row in rows {
        inv_mass_jt.push(mass_lu.solve(&ForceVector::from_row_slice(row))?);
    }
    let mut gram = CoefficientMatrix::zeros(row_count, row_count);
    for (i, row) in rows.iter().enumerate() {
        for (j, column) in inv_mass_jt.iter().enumerate() {
            gram[(i, j)] = row.iter().zip(column.iter()).map(|(a, b)| a * b).sum();
        }
    }
    let gram_lu = gram.lu();
    if is_singular(&gram_lu.u()) {
        return None;
    }
    let lambda = gram_lu.solve(&ForceVector::from_row_slice(residual))?;
    let mut correction = vec![0.0; frame_count];
    for (row, column) in inv_mass_jt.iter().enumerate() {
        for (index, entry) in correction.iter_mut().enumerate() {
            *entry += column[index] * lambda[row];
        }
    }
    Some(correction)
}

/// Pull the state back onto the constraint manifold, in place.
///
/// The Rust half of the projection stabilizer `docs/constraints.md` §7 describes,
/// and the reason `RsSolver` no longer has to give up its batched path to
/// stabilize: correcting here means the whole `tickCount` still crosses the wasm
/// boundary once.
///
/// Two halves, both `solve_metric_correction`:
///
/// 1. **Position.** `J Δq = −C` is underdetermined, and the metric minimum-norm
///    solution is `Δq = −g⁻¹Jᵀ(Jg⁻¹Jᵀ)⁻¹C`. `C` is nonlinear, so this iterates.
/// 2. **Velocity.** `J` moved with `q`, so `q̇` is re-projected at the new pose.
///
/// A singular gram matrix skips rather than panicking — a taut chain is collinear,
/// which is exactly when `Jg⁻¹Jᵀ` loses rank, and a hard-driven rope is exactly
/// when a chain goes taut. What a skip leaves behind is three cases, matching
/// `Scene.getStabilizedState`: singular on the first Newton step leaves the state
/// untouched; singular later keeps the positions already corrected with the
/// incoming velocities; singular only in the velocity half does the same.
fn stabilize_mut(
    frames: &[&FrameBox],
    index_path_map: &FrameIndexPathMap,
    constraints: &[ConstraintBox],
    constraint_frame_indices: &[(FrameIndex, FrameIndex)],
    states: &mut [State],
) {
    if constraints.is_empty() {
        return;
    }
    let frame_count = frames.len();
    let row_count: usize = constraints.iter().map(|c| c.row_count()).sum();
    // Up front, and by row count rather than by a failed solve: an over-determined
    // scene also produces a singular gram, so without this it would reach the skip
    // below wearing the taut chain's costume and be skipped silently forever.
    assert!(
        row_count <= frame_count,
        "scene is over-determined: {} constraint rows against {} coordinates; \
         some of these constraints cannot hold at the same time",
        row_count,
        frame_count,
    );

    let mut trial: Vec<State> = states.to_vec();
    for iteration in 0..STABILIZATION_MAX_ITERATIONS {
        let (pos_mats, vel_mats) = get_config_kinematics(frames, index_path_map, &trial);
        let (rows, values) = get_jacobian_rows(
            frames,
            index_path_map,
            constraints,
            constraint_frame_indices,
            &pos_mats,
            &vel_mats,
        );
        let mass_matrix = get_mass_matrix(frames, index_path_map, &pos_mats, &vel_mats);
        let correction = match solve_metric_correction(&mass_matrix, &rows, &values) {
            Some(correction) => correction,
            // Nothing has moved yet on the first iteration, so the input stands;
            // later, the positions already corrected are kept and the velocities
            // are left to the next tick. Re-projecting them here would solve at the
            // same `q` that just defeated the position solve, and fail identically.
            None => {
                if iteration > 0 {
                    for (state, corrected) in states.iter_mut().zip(trial.iter()) {
                        state.q = corrected.q;
                    }
                }
                return;
            }
        };
        for (state, entry) in trial.iter_mut().zip(correction.iter()) {
            state.q -= entry;
        }
        // Per coordinate, against that coordinate's own magnitude: `q` mixes a
        // `TrackFrame`'s metres with a `RotationalFrame`'s radians, so one
        // threshold across the vector would mean different things in different
        // entries. The floor of 1 keeps a coordinate near zero from being asked for
        // exactness that says nothing about how well the constraint holds.
        let converged = correction
            .iter()
            .zip(trial.iter())
            .all(|(entry, state)| entry.abs() <= STABILIZATION_TOLERANCE * state.q.abs().max(1.0));
        if converged {
            break;
        }
    }

    for (state, corrected) in states.iter_mut().zip(trial.iter()) {
        state.q = corrected.q;
    }

    // The velocity half, at the settled pose.
    let (pos_mats, vel_mats) = get_config_kinematics(frames, index_path_map, states);
    let (rows, _) = get_jacobian_rows(
        frames,
        index_path_map,
        constraints,
        constraint_frame_indices,
        &pos_mats,
        &vel_mats,
    );
    let qd: Vec<f64> = states.iter().map(|state| state.qd).collect();
    let residual: Vec<f64> = rows
        .iter()
        .map(|row| row.iter().zip(qd.iter()).map(|(a, b)| a * b).sum())
        .collect();
    // `J q̇` is a sum of signed terms, so what makes a residual meaningful is how
    // much cancellation produced it, not how big it is. An absolute threshold
    // would be a length squared in disguise for a `DistanceConstraint`, which is
    // the unit-dependence the metric correction exists to avoid.
    let term_scale = rows
        .iter()
        .map(|row| {
            row.iter()
                .zip(qd.iter())
                .map(|(entry, velocity)| (entry * velocity).abs())
                .sum::<f64>()
        })
        .fold(f64::NEG_INFINITY, f64::max);
    let worst = residual
        .iter()
        .map(|entry| entry.abs())
        .fold(f64::NEG_INFINITY, f64::max);
    // Already consistent -- don't perturb it with a needless solve. This early-out
    // is load-bearing for agreement with `physm-js`, not an optimization:
    // measured, correcting unconditionally here diverges from the TypeScript
    // implementation by 3.7e-8 after two seconds of driving, against 7.1e-15 for
    // the unstabilized pair.
    if term_scale == 0. || worst <= STABILIZATION_TOLERANCE * term_scale {
        return;
    }
    let mass_matrix = get_mass_matrix(frames, index_path_map, &pos_mats, &vel_mats);
    if let Some(correction) = solve_metric_correction(&mass_matrix, &rows, &residual) {
        for (state, entry) in states.iter_mut().zip(correction.iter()) {
            state.qd -= entry;
        }
    }
}

fn tick_simple_mut(
    frames: &[&FrameBox],
    index_path_map: &FrameIndexPathMap,
    constraints: &[ConstraintBox],
    constraint_frame_indices: &[(FrameIndex, FrameIndex)],
    gravity: &Vec3,
    states: &mut [State],
    external_forces: &[f64],
    delta_time: f64,
) {
    let apply_deltas_mut = |states: &mut [State], qdd_vec: &[f64], delta_time: f64| {
        states.iter_mut().enumerate().for_each(|(index, state)| {
            state.q += state.qd * delta_time;
            state.qd += qdd_vec[index] * delta_time;
        });
    };
    let qdd_vec = solve(
        frames,
        index_path_map,
        constraints,
        constraint_frame_indices,
        gravity,
        states,
        external_forces,
    );
    apply_deltas_mut(states, &qdd_vec, delta_time);
}

fn tick_runge_kutta_mut(
    frames: &[&FrameBox],
    index_path_map: &FrameIndexPathMap,
    constraints: &[ConstraintBox],
    constraint_frame_indices: &[(FrameIndex, FrameIndex)],
    gravity: &Vec3,
    states: &mut [State],
    external_forces: &[f64],
    delta_time: f64,
) {
    let count = frames.len();
    let get_qs = |states: &[State]| states.iter().map(|state| state.q).collect::<Vec<f64>>();
    let get_qds = |states: &[State]| states.iter().map(|state| state.qd).collect::<Vec<f64>>();
    let unzip_states = |states: &[State]| (get_qs(states), get_qds(states));
    let zip_states = |qs: &[f64], qds: &[f64]| {
        qs.iter()
            .zip(qds)
            .map(|(q, qd)| State { q: *q, qd: *qd })
            .collect::<Vec<State>>()
    };
    let solve = |qs: &[f64], qds: &[f64]| {
        solve(
            frames,
            index_path_map,
            constraints,
            constraint_frame_indices,
            gravity,
            &zip_states(qs, qds),
            external_forces,
        )
    };
    let apply_deltas =
        |qs: &[f64], qds: &[f64], delta_qs: &[f64], delta_qds: &[f64], delta_time: f64| {
            let mut new_qs = Vec::<f64>::new();
            let mut new_qds = Vec::<f64>::new();
            new_qs.reserve(count);
            new_qds.reserve(count);
            for i in 0..count {
                new_qs.push(qs[i] + delta_qs[i] * delta_time);
                new_qds.push(qds[i] + delta_qds[i] * delta_time);
            }
            (new_qs, new_qds)
        };

    let (qs0, qds0) = unzip_states(states);
    let qdds0 = solve(&qs0, &qds0);

    let (qs1, qds1) = apply_deltas(&qs0, &qds0, &qds0, &qdds0, delta_time / 2.);
    let qdds1 = solve(&qs1, &qds1);

    let (qs2, qds2) = apply_deltas(&qs0, &qds0, &qds1, &qdds1, delta_time / 2.);
    let qdds2 = solve(&qs2, &qds2);

    let (qs3, qds3) = apply_deltas(&qs0, &qds0, &qds2, &qdds2, delta_time);
    let qdds3 = solve(&qs3, &qds3);

    let mut qds = Vec::<f64>::new();
    let mut qdds = Vec::<f64>::new();
    qds.reserve(count);
    qdds.reserve(count);
    for i in 0..count {
        qds.push((qds0[i] + 2. * qds1[i] + 2. * qds2[i] + qds3[i]) / 6.);
        qdds.push((qdds0[i] + 2. * qdds1[i] + 2. * qdds2[i] + qdds3[i]) / 6.);
    }

    let (qs, qds) = apply_deltas(&qs0, &qds0, &qds, &qdds, delta_time);
    for i in 0..count {
        states[i].q = qs[i];
        states[i].qd = qds[i];
    }
}

impl Solver {
    pub fn new(scene: Scene) -> Self {
        Self {
            scene: scene,
            runge_kutta: true,
            stabilize: true,
        }
    }

    pub fn tick_mut(&self, states: &mut [State], external_forces: &[f64], delta_time: f64) -> () {
        let frames = sort_frames(&self.scene.frames);
        assert_eq!(states.len(), frames.len());
        assert_eq!(external_forces.len(), frames.len());
        let index_path_map = get_index_path_map(&frames);
        let constraints = &self.scene.constraints;
        let constraint_frame_indices = get_constraint_frame_indices(&frames, constraints);
        if self.runge_kutta {
            tick_runge_kutta_mut(
                &frames,
                &index_path_map,
                constraints,
                &constraint_frame_indices,
                &self.scene.gravity,
                states,
                external_forces,
                delta_time,
            );
        } else {
            tick_simple_mut(
                &frames,
                &index_path_map,
                constraints,
                &constraint_frame_indices,
                &self.scene.gravity,
                states,
                external_forces,
                delta_time,
            );
        }
        // Per step, not per batch: drift is injected by each step, so correcting
        // once per `tick_count` would let it accumulate across however many steps
        // a caller happened to ask for -- a different amount of stabilization for
        // the same physics.
        if self.stabilize {
            stabilize_mut(
                &frames,
                &index_path_map,
                constraints,
                &constraint_frame_indices,
                states,
            );
        }
    }
}

#[cfg(test)]
mod tests {
    use std::f64::consts::PI;

    use crate::CoincidenceConstraint;
    use crate::ConstraintBox;
    use crate::DistanceConstraint;
    use crate::FixedFrame;
    use crate::Position;
    use crate::RotationalFrame;
    use crate::Scene;
    use crate::TrackFrame;
    use crate::Weight;

    use super::*;

    const BALL_ID: &str = "ball";
    const BALL_INDEX: FrameIndex = 0;
    const CART_ID: &str = "cart";
    const CART_INDEX: FrameIndex = 1;
    const PENDULUM1_ID: &str = "pendulum1";
    const PENDULUM1_INDEX: FrameIndex = 2;
    const PENDULUM2_ID: &str = "pendulum2";
    const PENDULUM2_INDEX: FrameIndex = 3;
    const FRAME_IDS: &[&str] = &[BALL_ID, CART_ID, PENDULUM1_ID, PENDULUM2_ID];

    // ----------------------------------------------------------------------------------
    // Naive reference assembly.
    //
    // This is the implementation the composite sweeps replaced: it re-walks the subtree
    // and re-sums its weights for every matrix entry. It is kept as a differential
    // oracle, because the replacement is an algebraic identity rather than an
    // approximation, and an identity is only worth as much as the evidence that it holds.
    // See `test_composite_assembly_matches_naive`.
    // ----------------------------------------------------------------------------------

    fn naive_get_descendent_frames(
        parent_index: FrameIndex,
        index_path_map: &FrameIndexPathMap,
    ) -> Vec<FrameIndex> {
        let frame_count = index_path_map.len();
        (parent_index..frame_count)
            .map(|child_index| (child_index, &index_path_map[&child_index]))
            .filter(|(_, path)| path_contains(path, parent_index))
            .map(|(child_index, _)| child_index)
            .collect()
    }

    fn naive_get_coefficient_matrix(
        frames: &[&FrameBox],
        index_path_map: &FrameIndexPathMap,
        vel_mats: &[Mat3],
        weight_offsets: &[FrameIndex],
        weight_pos_vecs: &[Vec3],
    ) -> CoefficientMatrix {
        let get_coefficient = |row_index: usize, col_index: usize| {
            if col_index >= row_index && path_contains(&index_path_map[&col_index], row_index) {
                let vel_mat1 = vel_mats[row_index];
                let vel_mat2 = vel_mats[col_index];
                naive_get_descendent_frames(col_index, index_path_map)
                    .iter()
                    .map(|&frame_index| {
                        let weights = frames[frame_index].get_weights();
                        let offset = weight_offsets[frame_index];
                        (0..weights.len()).map(move |index| {
                            (weights[index].mass, weight_pos_vecs[offset + index])
                        })
                    })
                    .flatten()
                    .map(|(mass, weight_pos)| {
                        mass * (vel_mat1 * weight_pos).dot(&(vel_mat2 * weight_pos))
                    })
                    .sum()
            } else {
                0.
            }
        };
        let size = frames.len();
        let mut coefficient_matrix = CoefficientMatrix::from_fn(size, size, get_coefficient);
        coefficient_matrix.fill_lower_triangle_with_upper_triangle();
        coefficient_matrix
    }

    fn naive_get_force_vector(
        frames: &[&FrameBox],
        index_path_map: &FrameIndexPathMap,
        vel_mats: &[Mat3],
        vel_sum_mats: &[Mat3],
        accel_sum_mats: &[Mat3],
        weight_offsets: &[FrameIndex],
        weight_pos_vecs: &[Vec3],
        gravity: &Vec3,
        states: &[State],
        external_forces: &[f64],
    ) -> ForceVector {
        let get_entry = |row_index: usize, _col: usize| {
            let descendent_frames = naive_get_descendent_frames(row_index, index_path_map);
            let weight_forces = descendent_frames
                .iter()
                .map(|&frame_index| {
                    let weight_offset = weight_offsets[frame_index];
                    frames[frame_index].get_weights().iter().enumerate().map(
                        move |(weight_index, weight)| {
                            (frame_index, weight_offset + weight_index, weight)
                        },
                    )
                })
                .flatten()
                .map(|(frame_index, weight_index, weight)| {
                    let pos = weight_pos_vecs[weight_index];
                    let kinetic_force_vec = -weight.mass * accel_sum_mats[frame_index] * pos;
                    let drag_force_vec = -weight.drag * vel_sum_mats[frame_index] * pos;
                    let gravity_force_vec = weight.mass * gravity;
                    (vel_mats[row_index] * pos)
                        .dot(&(kinetic_force_vec + drag_force_vec + gravity_force_vec))
                });
            let resistance_force = -states[row_index].qd * frames[row_index].get_resistance();
            resistance_force + weight_forces.sum::<f64>() + external_forces[row_index]
        };
        ForceVector::from_fn(frames.len(), get_entry)
    }

    // ----------------------------------------------------------------------------------
    // Scenes for the differential test, chosen for shapes the sample forest does not
    // cover: deep chains (where the naive assembly's cost blows up), a wide shallow hub,
    // and nonzero drag and resistance, which the sample frames leave at zero.
    // ----------------------------------------------------------------------------------

    fn get_chain_frames(link_count: usize) -> Vec<FrameBox> {
        let mut child: Option<FrameBox> = None;
        for index in (0..link_count).rev() {
            let mut link = RotationalFrame::new(format!("link{}", index))
                .set_position(Position([if index == 0 { 0. } else { 3. }, 0.]))
                .set_resistance(0.05 * index as f64)
                .add_weight(
                    Weight::new(1. + index as f64)
                        .set_position(Position([3., 0.]))
                        .set_drag(0.02 * index as f64),
                );
            if let Some(frame) = child.take() {
                link = link.add_child(frame);
            }
            child = Some(Box::new(link));
        }
        child.into_iter().collect()
    }

    /// A chain in which only odd-numbered links carry weight, so the tip subtree is
    /// entirely weightless. This is the shape §3 of the doc singles out: a *comparable*
    /// pair whose subtree carries no mass, and therefore a structural zero that the
    /// ancestor relation alone does not predict.
    fn get_sparse_chain_frames(link_count: usize) -> Vec<FrameBox> {
        let mut child: Option<FrameBox> = None;
        for index in (0..link_count).rev() {
            let mut link = RotationalFrame::new(format!("link{}", index))
                .set_position(Position([if index == 0 { 0. } else { 3. }, 0.]));
            if index % 2 == 1 {
                link = link
                    .add_weight(Weight::new(1. + index as f64).set_position(Position([3., 0.])));
            }
            if let Some(frame) = child.take() {
                link = link.add_child(frame);
            }
            child = Some(Box::new(link));
        }
        child.into_iter().collect()
    }

    fn get_hub_frames(arm_count: usize) -> Vec<FrameBox> {
        let mut hub = TrackFrame::new("hub".into())
            .set_angle(PI / 6.)
            .set_resistance(0.4)
            .add_weight(Weight::new(4.).set_drag(0.1));
        for index in 0..arm_count {
            hub = hub.add_child(Box::new(
                RotationalFrame::new(format!("arm{}", index))
                    .set_position(Position([2. * index as f64, 1.]))
                    .add_weight(
                        Weight::new(2. + index as f64)
                            .set_position(Position([4., -1.]))
                            .set_drag(0.3),
                    )
                    .add_weight(Weight::new(1.).set_position(Position([0., 2.]))),
            ));
        }
        vec![Box::new(hub)]
    }

    /// Deterministic, spread across quadrants so no trig term is accidentally near zero.
    fn get_varied_states(count: usize, seed: f64) -> Vec<State> {
        (0..count)
            .map(|index| {
                let t = seed + 1.7 * index as f64;
                State {
                    q: 0.9 * t.sin() + 0.23 * t,
                    qd: 1.3 * (0.6 * t).cos() - 0.4,
                }
            })
            .collect()
    }

    fn get_initial_state(frame_id: &str) -> State {
        let (q, qd) = match frame_id {
            CART_ID => (5., 1.5),
            PENDULUM1_ID => (0.3, -1.2),
            PENDULUM2_ID => (-0.9, 1.8),
            BALL_ID => (0., -2.),
            _ => panic!(),
        };
        State { q, qd }
    }

    fn get_sample_states() -> Vec<State> {
        FRAME_IDS.iter().map(|id| get_initial_state(id)).collect()
    }

    fn get_sample_frames() -> Vec<FrameBox> {
        let pendulum2 = Box::new(
            RotationalFrame::new(PENDULUM2_ID.into())
                .set_position(Position([10., 0.]))
                .add_weight(Weight::new(8.).set_position(Position([12., 0.]))),
        );
        let pendulum1 = Box::new(
            RotationalFrame::new(PENDULUM1_ID.into())
                .add_weight(Weight::new(5.).set_position(Position([10., 0.])))
                .add_child(pendulum2),
        );
        let cart = Box::new(
            TrackFrame::new(CART_ID.into())
                .add_weight(Weight::new(20.))
                .add_weight(Weight::new(3.).set_position(Position([0., 5.])))
                .add_child(pendulum1),
        );
        let ball = Box::new(
            TrackFrame::new(BALL_ID.into())
                .set_angle(PI / 4.)
                .set_position(Position([30., 0.]))
                .add_weight(Weight::new(5.)),
        );
        vec![cart, ball]
    }

    #[test]
    fn test_sort_frames() {
        assert_eq!(
            super::sort_frames(&get_sample_frames())
                .iter()
                .map(|frame| frame.get_id().as_str())
                .collect::<Vec<&str>>(),
            FRAME_IDS
        );
    }

    #[test]
    fn test_get_index_path_map() {
        let frames = get_sample_frames();
        let frames = super::sort_frames(&frames);
        let index_path_map = super::get_index_path_map(&frames);
        let mut items = index_path_map.iter().collect::<Vec<_>>();
        items.sort_by_key(|(k, _)| *k);
        assert_eq!(
            format!("{:?}", items),
            "[(0, [0]), (1, [1]), (2, [1, 2]), (3, [1, 2, 3])]"
        );
    }

    #[test]
    fn test_get_pos_mats() {
        let states = get_sample_states();
        let frames = get_sample_frames();
        let frames = super::sort_frames(&frames);
        let index_path_map = super::get_index_path_map(&frames);
        let pos_mats = super::get_pos_mats(&frames, &index_path_map, &states);
        let local_pos_mats: Vec<Mat3> = frames
            .iter()
            .zip(states.iter())
            .map(|(frame, state)| frame.get_local_pos_matrix(state.q))
            .collect();
        assert_eq!(pos_mats.len(), frames.len());
        assert_eq!(pos_mats[BALL_INDEX], local_pos_mats[BALL_INDEX]);
        assert_eq!(pos_mats[CART_INDEX], local_pos_mats[CART_INDEX]);
        assert_eq!(
            pos_mats[PENDULUM1_INDEX],
            local_pos_mats[CART_INDEX] * local_pos_mats[PENDULUM1_INDEX]
        );
        assert_eq!(
            pos_mats[PENDULUM2_INDEX],
            local_pos_mats[CART_INDEX]
                * local_pos_mats[PENDULUM1_INDEX]
                * local_pos_mats[PENDULUM2_INDEX]
        );
    }

    #[test]
    fn test_get_inv_pos_mats() {
        let states = get_sample_states();
        let frames = get_sample_frames();
        let frames = super::sort_frames(&frames);
        let index_path_map = super::get_index_path_map(&frames);
        let pos_mats = super::get_pos_mats(&frames, &index_path_map, &states);
        let inv_pos_mats = super::get_inv_pos_mats(&pos_mats);
        let local_pos_mats: Vec<Mat3> = frames
            .iter()
            .zip(states.iter())
            .map(|(frame, state)| frame.get_local_pos_matrix(state.q))
            .collect();
        assert_eq!(inv_pos_mats.len(), frames.len());
        assert_abs_diff_eq!(
            inv_pos_mats[BALL_INDEX],
            local_pos_mats[BALL_INDEX].try_inverse().unwrap()
        );
        assert_abs_diff_eq!(
            inv_pos_mats[CART_INDEX],
            local_pos_mats[CART_INDEX].try_inverse().unwrap()
        );
        assert_abs_diff_eq!(
            inv_pos_mats[PENDULUM1_INDEX],
            (local_pos_mats[CART_INDEX] * local_pos_mats[PENDULUM1_INDEX])
                .try_inverse()
                .unwrap()
        );
        assert_abs_diff_eq!(
            inv_pos_mats[PENDULUM2_INDEX],
            (local_pos_mats[CART_INDEX]
                * local_pos_mats[PENDULUM1_INDEX]
                * local_pos_mats[PENDULUM2_INDEX])
                .try_inverse()
                .unwrap()
        );
    }

    #[test]
    fn test_get_vel_mats() {
        let states = get_sample_states();
        let frames = get_sample_frames();
        let frames = super::sort_frames(&frames);
        let index_path_map = super::get_index_path_map(&frames);
        let pos_mats = super::get_pos_mats(&frames, &index_path_map, &states);
        let inv_pos_mats = super::get_inv_pos_mats(&pos_mats);
        let vel_mats =
            super::get_vel_mats(&frames, &index_path_map, &pos_mats, &inv_pos_mats, &states);
        let local_vel_mats: Vec<Mat3> = frames
            .iter()
            .zip(states.iter())
            .map(|(frame, state)| frame.get_local_vel_matrix(state.q))
            .collect();
        assert_eq!(vel_mats.len(), frames.len());
        assert_abs_diff_eq!(
            vel_mats[BALL_INDEX],
            local_vel_mats[BALL_INDEX] * inv_pos_mats[BALL_INDEX]
        );
        assert_abs_diff_eq!(
            vel_mats[CART_INDEX],
            local_vel_mats[CART_INDEX] * inv_pos_mats[CART_INDEX]
        );
        assert_abs_diff_eq!(
            vel_mats[PENDULUM1_INDEX],
            pos_mats[CART_INDEX] * local_vel_mats[PENDULUM1_INDEX] * inv_pos_mats[PENDULUM1_INDEX]
        );
        assert_abs_diff_eq!(
            vel_mats[PENDULUM2_INDEX],
            pos_mats[PENDULUM1_INDEX]
                * local_vel_mats[PENDULUM2_INDEX]
                * inv_pos_mats[PENDULUM2_INDEX],
            epsilon = 1e-8
        );
    }

    #[test]
    fn test_get_accel_mats() {
        let states = get_sample_states();
        let frames = get_sample_frames();
        let frames = super::sort_frames(&frames);
        let index_path_map = super::get_index_path_map(&frames);
        let pos_mats = super::get_pos_mats(&frames, &index_path_map, &states);
        let inv_pos_mats = super::get_inv_pos_mats(&pos_mats);
        let accel_mats =
            super::get_accel_mats(&frames, &index_path_map, &pos_mats, &inv_pos_mats, &states);
        let local_accel_mats: Vec<Mat3> = frames
            .iter()
            .zip(states.iter())
            .map(|(frame, state)| frame.get_local_accel_matrix(state.q))
            .collect();
        assert_eq!(accel_mats.len(), frames.len());
        assert_abs_diff_eq!(
            accel_mats[BALL_INDEX],
            local_accel_mats[BALL_INDEX] * inv_pos_mats[BALL_INDEX]
        );
        assert_abs_diff_eq!(
            accel_mats[CART_INDEX],
            local_accel_mats[CART_INDEX] * inv_pos_mats[CART_INDEX]
        );
        assert_abs_diff_eq!(
            accel_mats[PENDULUM1_INDEX],
            pos_mats[CART_INDEX]
                * local_accel_mats[PENDULUM1_INDEX]
                * inv_pos_mats[PENDULUM1_INDEX]
        );
        assert_abs_diff_eq!(
            accel_mats[PENDULUM2_INDEX],
            pos_mats[PENDULUM1_INDEX]
                * local_accel_mats[PENDULUM2_INDEX]
                * inv_pos_mats[PENDULUM2_INDEX],
            epsilon = 1e-8
        );
    }

    #[test]
    fn test_get_vel_sum_mats() {
        let states = get_sample_states();
        let frames = get_sample_frames();
        let frames = super::sort_frames(&frames);
        let index_path_map = super::get_index_path_map(&frames);
        let pos_mats = super::get_pos_mats(&frames, &index_path_map, &states);
        let inv_pos_mats = super::get_inv_pos_mats(&pos_mats);
        let vel_mats =
            super::get_vel_mats(&frames, &index_path_map, &pos_mats, &inv_pos_mats, &states);
        let vel_sum_mats =
            super::get_vel_sum_mats(&frames, &index_path_map, &pos_mats, &vel_mats, &states);
        assert_eq!(vel_sum_mats.len(), frames.len());
        assert_abs_diff_eq!(
            vel_sum_mats[BALL_INDEX],
            states[BALL_INDEX].qd * vel_mats[BALL_INDEX]
        );
        assert_abs_diff_eq!(
            vel_sum_mats[CART_INDEX],
            states[CART_INDEX].qd * vel_mats[CART_INDEX]
        );
        assert_abs_diff_eq!(
            vel_sum_mats[PENDULUM1_INDEX],
            states[CART_INDEX].qd * vel_mats[CART_INDEX]
                + states[PENDULUM1_INDEX].qd * vel_mats[PENDULUM1_INDEX]
        );
        assert_abs_diff_eq!(
            vel_sum_mats[PENDULUM2_INDEX],
            states[CART_INDEX].qd * vel_mats[CART_INDEX]
                + states[PENDULUM1_INDEX].qd * vel_mats[PENDULUM1_INDEX]
                + states[PENDULUM2_INDEX].qd * vel_mats[PENDULUM2_INDEX]
        );
    }

    #[test]
    fn test_get_accel_sum_mats() {
        let states = get_sample_states();
        let frames = get_sample_frames();
        let frames = super::sort_frames(&frames);
        let index_path_map = super::get_index_path_map(&frames);
        let pos_mats = super::get_pos_mats(&frames, &index_path_map, &states);
        let inv_pos_mats = super::get_inv_pos_mats(&pos_mats);
        let vel_mats =
            super::get_vel_mats(&frames, &index_path_map, &pos_mats, &inv_pos_mats, &states);
        let accel_mats =
            super::get_accel_mats(&frames, &index_path_map, &pos_mats, &inv_pos_mats, &states);
        let vel_sum_mats =
            super::get_vel_sum_mats(&frames, &index_path_map, &pos_mats, &vel_mats, &states);
        let accel_sum_mats = super::get_accel_sum_mats(
            &frames,
            &index_path_map,
            &pos_mats,
            &vel_mats,
            &accel_mats,
            &vel_sum_mats,
            &states,
        );
        let qds: Vec<f64> = states.iter().map(|state| state.qd).collect();
        assert_eq!(vel_sum_mats.len(), frames.len());
        assert_abs_diff_eq!(
            accel_sum_mats[BALL_INDEX],
            qds[BALL_INDEX] * qds[BALL_INDEX] * accel_mats[BALL_INDEX]
        );
        assert_abs_diff_eq!(
            accel_sum_mats[CART_INDEX],
            qds[CART_INDEX] * qds[CART_INDEX] * accel_mats[CART_INDEX]
        );
        assert_abs_diff_eq!(
            accel_sum_mats[PENDULUM1_INDEX],
            accel_sum_mats[CART_INDEX]
                + 2. * qds[PENDULUM1_INDEX] * vel_sum_mats[CART_INDEX] * vel_mats[PENDULUM1_INDEX]
                + qds[PENDULUM1_INDEX] * qds[PENDULUM1_INDEX] * accel_mats[PENDULUM1_INDEX]
        );
        assert_abs_diff_eq!(
            accel_sum_mats[PENDULUM2_INDEX],
            accel_sum_mats[PENDULUM1_INDEX]
                + 2. * qds[PENDULUM2_INDEX]
                    * vel_sum_mats[PENDULUM1_INDEX]
                    * vel_mats[PENDULUM2_INDEX]
                + qds[PENDULUM2_INDEX] * qds[PENDULUM2_INDEX] * accel_mats[PENDULUM2_INDEX],
            epsilon = 1e-8
        );
    }

    #[test]
    fn test_get_weight_offsets() {
        let frames = get_sample_frames();
        let frames = super::sort_frames(&frames);
        let counts: Vec<usize> = frames
            .iter()
            .map(|frame| frame.get_weights().len())
            .collect();
        assert_eq!(
            super::get_weight_offsets(&frames),
            [
                0,
                counts[BALL_INDEX],
                counts[BALL_INDEX] + counts[CART_INDEX],
                counts[BALL_INDEX] + counts[CART_INDEX] + counts[PENDULUM1_INDEX],
                counts[BALL_INDEX]
                    + counts[CART_INDEX]
                    + counts[PENDULUM1_INDEX]
                    + counts[PENDULUM2_INDEX]
            ]
        )
    }

    #[test]
    fn test_get_weight_pos_vecs() {
        let states = get_sample_states();
        let frames = get_sample_frames();
        let frames = super::sort_frames(&frames);
        let index_path_map = super::get_index_path_map(&frames);
        let pos_mats = super::get_pos_mats(&frames, &index_path_map, &states);
        let frame_weights: Vec<_> = frames.iter().map(|frame| frame.get_weights()).collect();
        assert_eq!(
            super::get_weight_pos_vecs(&frames, &pos_mats),
            [
                pos_mats[BALL_INDEX] * frame_weights[BALL_INDEX][0].position.to_vec3(),
                pos_mats[CART_INDEX] * frame_weights[CART_INDEX][0].position.to_vec3(),
                pos_mats[CART_INDEX] * frame_weights[CART_INDEX][1].position.to_vec3(),
                pos_mats[PENDULUM1_INDEX] * frame_weights[PENDULUM1_INDEX][0].position.to_vec3(),
                pos_mats[PENDULUM2_INDEX] * frame_weights[PENDULUM2_INDEX][0].position.to_vec3(),
            ]
        );
    }

    #[test]
    fn test_get_descendent_frames() {
        let frames = get_sample_frames();
        let frames = super::sort_frames(&frames);
        let index_path_map = super::get_index_path_map(&frames);
        assert_eq!(
            naive_get_descendent_frames(BALL_INDEX, &index_path_map),
            [BALL_INDEX]
        );
        assert_eq!(
            naive_get_descendent_frames(CART_INDEX, &index_path_map),
            [CART_INDEX, PENDULUM1_INDEX, PENDULUM2_INDEX]
        );
        assert_eq!(
            naive_get_descendent_frames(PENDULUM1_INDEX, &index_path_map),
            [PENDULUM1_INDEX, PENDULUM2_INDEX]
        );
        assert_eq!(
            naive_get_descendent_frames(PENDULUM2_INDEX, &index_path_map),
            [PENDULUM2_INDEX]
        );
    }

    #[test]
    fn test_get_coefficient_matrix_entry() {
        let states = get_sample_states();
        let frames = get_sample_frames();
        let frames = super::sort_frames(&frames);
        let index_path_map = super::get_index_path_map(&frames);
        let pos_mats = super::get_pos_mats(&frames, &index_path_map, &states);
        let inv_pos_mats = super::get_inv_pos_mats(&pos_mats);
        let vel_mats =
            super::get_vel_mats(&frames, &index_path_map, &pos_mats, &inv_pos_mats, &states);
        let weight_offsets = super::get_weight_offsets(&frames);
        let weight_pos_vecs = super::get_weight_pos_vecs(&frames, &pos_mats);
        let get_mass = |frame_index: usize, weight_index: usize| {
            frames[frame_index].get_weights()[weight_index].mass
        };
        let get_pos =
            |frame_index, weight_index| weight_pos_vecs[weight_offsets[frame_index] + weight_index];
        let composite_moment_mats = super::get_composite_moment_mats(
            &frames,
            &index_path_map,
            &weight_offsets,
            &weight_pos_vecs,
        );
        let get_coefficient = |row_index, col_index| {
            super::get_coefficient_matrix_entry(
                row_index,
                col_index,
                &index_path_map,
                &vel_mats,
                &composite_moment_mats,
            )
        };

        // Pairs off the ancestor relation are structurally zero and are never visited by
        // `get_coefficient_matrix`, so they are not valid inputs here any more.
        // `test_composite_assembly_matches_naive` covers the full matrix, zeros included.
        //
        // Two of the four expectations below match exactly and carry no tolerance. The
        // other two differ by one or two ulps -- 9.1e-13 at most, on values around 3.6e3 --
        // because they add up the per-weight terms directly while the assembly sums them
        // into a composite moment first and contracts once. 1e-9 leaves a thousandfold
        // margin over that while staying far too tight to hide a dropped term.
        assert_abs_diff_eq!(
            get_coefficient(BALL_INDEX, BALL_INDEX),
            get_mass(BALL_INDEX, 0)
                * (vel_mats[BALL_INDEX] * get_pos(BALL_INDEX, 0)).norm_squared()
        );
        assert_abs_diff_eq!(
            get_coefficient(CART_INDEX, CART_INDEX),
            get_mass(CART_INDEX, 0)
                * (vel_mats[CART_INDEX] * get_pos(CART_INDEX, 0)).norm_squared()
                + get_mass(CART_INDEX, 1)
                    * (vel_mats[CART_INDEX] * get_pos(CART_INDEX, 1)).norm_squared()
                + get_mass(PENDULUM1_INDEX, 0)
                    * (vel_mats[CART_INDEX] * get_pos(PENDULUM1_INDEX, 0)).norm_squared()
                + get_mass(PENDULUM2_INDEX, 0)
                    * (vel_mats[CART_INDEX] * get_pos(PENDULUM2_INDEX, 0)).norm_squared()
        );
        assert_abs_diff_eq!(
            get_coefficient(PENDULUM1_INDEX, PENDULUM1_INDEX),
            get_mass(PENDULUM1_INDEX, 0)
                * (vel_mats[PENDULUM1_INDEX] * get_pos(PENDULUM1_INDEX, 0)).norm_squared()
                + get_mass(PENDULUM2_INDEX, 0)
                    * (vel_mats[PENDULUM1_INDEX] * get_pos(PENDULUM2_INDEX, 0)).norm_squared(),
            epsilon = 1e-9
        );
        assert_abs_diff_eq!(
            get_coefficient(PENDULUM2_INDEX, PENDULUM2_INDEX),
            get_mass(PENDULUM2_INDEX, 0)
                * (vel_mats[PENDULUM2_INDEX] * get_pos(PENDULUM2_INDEX, 0)).norm_squared(),
            epsilon = 1e-9
        );
        assert_abs_diff_eq!(
            get_coefficient(PENDULUM1_INDEX, PENDULUM2_INDEX),
            get_mass(PENDULUM2_INDEX, 0)
                * ((vel_mats[PENDULUM1_INDEX] * get_pos(PENDULUM1_INDEX, 0))
                    .dot(&(vel_mats[PENDULUM2_INDEX] * get_pos(PENDULUM1_INDEX, 0)))
                    + (vel_mats[PENDULUM1_INDEX] * get_pos(PENDULUM2_INDEX, 0))
                        .dot(&(vel_mats[PENDULUM2_INDEX] * get_pos(PENDULUM2_INDEX, 0)))),
            epsilon = 1e-8
        );
    }

    #[test]
    fn test_get_coefficient_matrix() {
        let states = get_sample_states();
        let frames = get_sample_frames();
        let frames = super::sort_frames(&frames);
        let index_path_map = super::get_index_path_map(&frames);
        let pos_mats = super::get_pos_mats(&frames, &index_path_map, &states);
        let inv_pos_mats = super::get_inv_pos_mats(&pos_mats);
        let vel_mats =
            super::get_vel_mats(&frames, &index_path_map, &pos_mats, &inv_pos_mats, &states);
        let weight_offsets = super::get_weight_offsets(&frames);
        let weight_pos_vecs = super::get_weight_pos_vecs(&frames, &pos_mats);
        let composite_moment_mats = super::get_composite_moment_mats(
            &frames,
            &index_path_map,
            &weight_offsets,
            &weight_pos_vecs,
        );
        let coefficient_matrix = super::get_coefficient_matrix(
            &frames,
            &index_path_map,
            &vel_mats,
            &composite_moment_mats,
        );
        let get_coefficient = |row_index, col_index| {
            super::get_coefficient_matrix_entry(
                row_index,
                col_index,
                &index_path_map,
                &vel_mats,
                &composite_moment_mats,
            )
        };
        assert_eq!(coefficient_matrix.shape(), (frames.len(), frames.len()));
        assert_eq!(
            coefficient_matrix[(CART_INDEX, PENDULUM1_INDEX)],
            get_coefficient(CART_INDEX, PENDULUM1_INDEX)
        );
        assert_eq!(
            coefficient_matrix[(PENDULUM1_INDEX, CART_INDEX)],
            get_coefficient(CART_INDEX, PENDULUM1_INDEX)
        );
    }

    #[test]
    fn test_get_coefficient_matrix_gives_a_fixed_frame_an_inertia_of_its_own() {
        // A cart carrying a pendulum on a fixed frame: the fixed frame's
        // coordinate moves nothing, so its row and column would be zero.
        let frames: Vec<FrameBox> = vec![Box::new(
            TrackFrame::new("cart".into())
                .add_weight(Weight::new(20.))
                .add_child(Box::new(
                    FixedFrame::new("mount".into())
                        .set_position(Position([0., 2.]))
                        .set_angle(0.5)
                        .add_child(Box::new(
                            RotationalFrame::new("arm".into())
                                .add_weight(Weight::new(2.).set_position(Position([3., 0.]))),
                        )),
                )),
        )];
        let frames = super::sort_frames(&frames);
        let states: Vec<State> = (0..frames.len())
            .map(|_| State { q: 0.3, qd: 0. })
            .collect();
        let index_path_map = super::get_index_path_map(&frames);
        let pos_mats = super::get_pos_mats(&frames, &index_path_map, &states);
        let inv_pos_mats = super::get_inv_pos_mats(&pos_mats);
        let vel_mats =
            super::get_vel_mats(&frames, &index_path_map, &pos_mats, &inv_pos_mats, &states);
        let mass_matrix = super::get_mass_matrix(&frames, &index_path_map, &pos_mats, &vel_mats);
        let index = |id: &str| {
            frames
                .iter()
                .position(|frame| frame.get_id().as_str() == id)
                .unwrap()
        };
        let (cart, mount, arm) = (index("cart"), index("mount"), index("arm"));
        assert_eq!(mass_matrix[(mount, cart)], 0.);
        assert_eq!(mass_matrix[(mount, arm)], 0.);
        assert_eq!(mass_matrix[(arm, mount)], 0.);
        assert_eq!(
            mass_matrix[(mount, mount)],
            mass_matrix[(cart, cart)].max(mass_matrix[(arm, arm)])
        );
        assert!(mass_matrix[(mount, mount)] > 0.);
    }

    #[test]
    fn test_get_force_vector_entry() {
        let frames = get_sample_frames();
        let frames = super::sort_frames(&frames);
        let index_path_map = super::get_index_path_map(&frames);
        let weight_offsets = super::get_weight_offsets(&frames);
        let get_entry = |row_index, states: &[State], gravity: &Vec3, external_forces: &[f64]| {
            let pos_mats = super::get_pos_mats(&frames, &index_path_map, &states);
            let inv_pos_mats = super::get_inv_pos_mats(&pos_mats);
            let vel_mats =
                super::get_vel_mats(&frames, &index_path_map, &pos_mats, &inv_pos_mats, &states);
            let vel_sum_mats =
                super::get_vel_sum_mats(&frames, &index_path_map, &pos_mats, &vel_mats, &states);
            let accel_mats =
                super::get_accel_mats(&frames, &index_path_map, &pos_mats, &inv_pos_mats, &states);
            let accel_sum_mats = super::get_accel_sum_mats(
                &frames,
                &index_path_map,
                &pos_mats,
                &vel_mats,
                &accel_mats,
                &vel_sum_mats,
                &states,
            );
            let weight_pos_vecs = super::get_weight_pos_vecs(&frames, &pos_mats);
            let composite_force_mats = super::get_composite_force_mats(
                &frames,
                &index_path_map,
                &vel_sum_mats,
                &accel_sum_mats,
                &weight_offsets,
                &weight_pos_vecs,
                &gravity,
            );
            super::get_force_vector_entry(
                row_index,
                &frames,
                &vel_mats,
                &composite_force_mats,
                &states,
                &external_forces,
            )
        };

        let states = get_sample_states();
        let gravity = Vec3::new(0., -10., 0.);
        let ext_forces: Vec<f64> = iter::repeat(2.).take(frames.len()).collect();
        let zero_states: Vec<State> = states
            .iter()
            .map(|state| State { q: state.q, qd: 0. })
            .collect();
        let zero_gravity = Vec3::new(0., 0., 0.);
        let zero_ext_forces: Vec<f64> = iter::repeat(0.).take(frames.len()).collect();
        for frame_index in 0..frames.len() {
            let entry = get_entry(frame_index, &zero_states, &zero_gravity, &zero_ext_forces);
            // Absence of momentum, gravity, and external forces implies no net force:
            assert_eq!(entry, 0.);
        }
        for frame_index in 0..frames.len() {
            let entry = get_entry(frame_index, &states, &zero_gravity, &zero_ext_forces);
            if frame_index == BALL_INDEX {
                // The ball is moving downwards without resistance and thus experiences no net
                // force in absence of gravity/ext-forces:
                assert_eq!(entry, 0.);
            } else {
                // But everything else has a net force, including the cart, since the pendulums
                // tug on the cart and the pendulums experience centripetal force:
                assert!(entry.abs() > 0.1);
            }
        }
        for frame_index in 0..frames.len() {
            let entry = get_entry(frame_index, &zero_states, &gravity, &zero_ext_forces);
            if frame_index == CART_INDEX {
                // Gravity doesn't affect the cart since it moves horizontally:
                assert_eq!(entry, 0.);
            } else {
                assert!(entry.abs() > 0.1);
            }
        }
        for frame_index in 0..frames.len() {
            let entry = get_entry(frame_index, &zero_states, &zero_gravity, &ext_forces);
            assert!(entry.abs() > 0.1);
        }
        for frame_index in 0..frames.len() {
            let entry = get_entry(frame_index, &states, &gravity, &ext_forces);
            assert!(entry.abs() > 0.1);
        }
    }

    #[test]
    fn test_composite_assembly_matches_naive() {
        // The composite sweeps replace a per-entry subtree walk with a single leaf-to-root
        // accumulation. That is an algebraic identity, so the two assemblies must agree on
        // every scene and every state -- not approximately, but to floating-point
        // reassociation noise. Disagreement anywhere means the factorization is wrong.
        let scenes: Vec<(&str, Vec<FrameBox>)> = vec![
            ("sample forest", get_sample_frames()),
            ("chain-1", get_chain_frames(1)),
            ("chain-2", get_chain_frames(2)),
            ("chain-9", get_chain_frames(9)),
            ("chain-24", get_chain_frames(24)),
            ("hub-6", get_hub_frames(6)),
            ("sparse chain-8", get_sparse_chain_frames(8)),
            (
                "sparse chain-1 (no weights at all)",
                get_sparse_chain_frames(1),
            ),
        ];
        let gravities = [Vec3::new(0., -10., 0.), Vec3::new(0., 0., 0.)];

        for (scene_name, scene_frames) in scenes.iter() {
            let frames = super::sort_frames(scene_frames);
            let index_path_map = super::get_index_path_map(&frames);
            let count = frames.len();

            for &seed in [0., 0.61, 2.4, -1.35].iter() {
                let states = get_varied_states(count, seed);
                let external_forces: Vec<f64> = (0..count).map(|i| 0.5 * i as f64 - 1.).collect();

                let pos_mats = super::get_pos_mats(&frames, &index_path_map, &states);
                let inv_pos_mats = super::get_inv_pos_mats(&pos_mats);
                let vel_mats = super::get_vel_mats(
                    &frames,
                    &index_path_map,
                    &pos_mats,
                    &inv_pos_mats,
                    &states,
                );
                let vel_sum_mats = super::get_vel_sum_mats(
                    &frames,
                    &index_path_map,
                    &pos_mats,
                    &vel_mats,
                    &states,
                );
                let accel_mats = super::get_accel_mats(
                    &frames,
                    &index_path_map,
                    &pos_mats,
                    &inv_pos_mats,
                    &states,
                );
                let accel_sum_mats = super::get_accel_sum_mats(
                    &frames,
                    &index_path_map,
                    &pos_mats,
                    &vel_mats,
                    &accel_mats,
                    &vel_sum_mats,
                    &states,
                );
                let weight_offsets = super::get_weight_offsets(&frames);
                let weight_pos_vecs = super::get_weight_pos_vecs(&frames, &pos_mats);

                for gravity in gravities.iter() {
                    let composite_moment_mats = super::get_composite_moment_mats(
                        &frames,
                        &index_path_map,
                        &weight_offsets,
                        &weight_pos_vecs,
                    );
                    let composite_force_mats = super::get_composite_force_mats(
                        &frames,
                        &index_path_map,
                        &vel_sum_mats,
                        &accel_sum_mats,
                        &weight_offsets,
                        &weight_pos_vecs,
                        gravity,
                    );
                    let actual_coeffs = super::get_coefficient_matrix(
                        &frames,
                        &index_path_map,
                        &vel_mats,
                        &composite_moment_mats,
                    );
                    let actual_forces = super::get_force_vector(
                        &frames,
                        &vel_mats,
                        &composite_force_mats,
                        &states,
                        &external_forces,
                    );
                    let expected_coeffs = naive_get_coefficient_matrix(
                        &frames,
                        &index_path_map,
                        &vel_mats,
                        &weight_offsets,
                        &weight_pos_vecs,
                    );
                    let expected_forces = naive_get_force_vector(
                        &frames,
                        &index_path_map,
                        &vel_mats,
                        &vel_sum_mats,
                        &accel_sum_mats,
                        &weight_offsets,
                        &weight_pos_vecs,
                        gravity,
                        &states,
                        &external_forces,
                    );

                    for row in 0..count {
                        for col in 0..count {
                            let expected = expected_coeffs[(row, col)];
                            let actual = actual_coeffs[(row, col)];
                            assert_abs_diff_eq!(
                                actual,
                                expected,
                                epsilon = 1e-9 * (1. + expected.abs())
                            );
                            // Structural zeros must stay exactly zero, not merely small:
                            // the sparsity pattern is what a sparse factorization would use.
                            if expected == 0. {
                                assert_eq!(
                                    actual, 0.,
                                    "{}: seed {}: entry ({}, {}) should be structurally zero",
                                    scene_name, seed, row, col
                                );
                            }
                        }
                        let expected = expected_forces[row];
                        let actual = actual_forces[row];
                        assert_abs_diff_eq!(
                            actual,
                            expected,
                            epsilon = 1e-9 * (1. + expected.abs())
                        );
                    }
                    // Symmetry is now produced by construction rather than by a
                    // fill-lower-from-upper pass, so it is worth asserting directly.
                    for row in 0..count {
                        for col in 0..count {
                            assert_eq!(
                                actual_coeffs[(row, col)],
                                actual_coeffs[(col, row)],
                                "{}: seed {}: asymmetric at ({}, {})",
                                scene_name,
                                seed,
                                row,
                                col
                            );
                        }
                    }
                }
            }
        }
    }

    /// Not a correctness test. Run with:
    ///
    ///     cargo test --release --lib -- --ignored --nocapture bench_assembly
    ///
    /// Reports assembly cost against chain length for both implementations. The naive one
    /// is `Theta(n^4)` on a chain -- `get_descendent_frames` scans the whole suffix of the
    /// sort order and tests membership by walking each candidate's root path -- so its
    /// column should quadruple as `n` doubles once it dominates.
    #[test]
    #[ignore]
    fn bench_assembly() {
        use std::time::Instant;

        // Both shapes, because they are not interchangeable: a chain has depth == n, so
        // the O(n*depth) bound and the dense CoefficientMatrix::zeros(n, n) fill are the
        // same order and the fill hides inside the constant. A hub has depth 2, so the
        // bound reads O(n) while the fill is still n^2 -- and it dominates sooner.
        for (shape, build) in [
            ("chain", get_chain_frames as fn(usize) -> Vec<FrameBox>),
            ("hub", get_hub_frames as fn(usize) -> Vec<FrameBox>),
        ]
        .iter()
        {
            println!(
                "\n{} scenes\n{:>6}  {:>12}  {:>12}  {:>8}",
                shape, "n", "naive (us)", "composite", "speedup"
            );
            for &link_count in [10usize, 20, 40, 80, 160, 320].iter() {
                let scene_frames = build(link_count);
                let frames = super::sort_frames(&scene_frames);
                let index_path_map = super::get_index_path_map(&frames);
                let states = get_varied_states(frames.len(), 0.4);
                let pos_mats = super::get_pos_mats(&frames, &index_path_map, &states);
                let inv_pos_mats = super::get_inv_pos_mats(&pos_mats);
                let vel_mats = super::get_vel_mats(
                    &frames,
                    &index_path_map,
                    &pos_mats,
                    &inv_pos_mats,
                    &states,
                );
                let weight_offsets = super::get_weight_offsets(&frames);
                let weight_pos_vecs = super::get_weight_pos_vecs(&frames, &pos_mats);

                let reps = if link_count > 40 { 3 } else { 50 };

                let start = Instant::now();
                for _ in 0..reps {
                    let m = naive_get_coefficient_matrix(
                        &frames,
                        &index_path_map,
                        &vel_mats,
                        &weight_offsets,
                        &weight_pos_vecs,
                    );
                    std::hint::black_box(m);
                }
                let naive_us = start.elapsed().as_secs_f64() * 1e6 / reps as f64;

                let start = Instant::now();
                for _ in 0..reps {
                    // The composite sweep is part of the cost being measured, not a fixture.
                    let composite_moment_mats = super::get_composite_moment_mats(
                        &frames,
                        &index_path_map,
                        &weight_offsets,
                        &weight_pos_vecs,
                    );
                    let m = super::get_coefficient_matrix(
                        &frames,
                        &index_path_map,
                        &vel_mats,
                        &composite_moment_mats,
                    );
                    std::hint::black_box(m);
                }
                let composite_us = start.elapsed().as_secs_f64() * 1e6 / reps as f64;

                println!(
                    "{:>6}  {:>12.1}  {:>12.1}  {:>7.1}x",
                    link_count,
                    naive_us,
                    composite_us,
                    naive_us / composite_us
                );
            }
        }
        println!();
    }

    // ----------------------------------------------------------------------------------
    // Constraints.
    //
    // The scene is branched on purpose. `physm-py`'s constraint block indexed its
    // matrix by position along a frame's root path where the mass block converted to
    // a global index; the two agree only for an unbranched chain from the first root,
    // so an unbranched fixture would pass with the defect present.
    // ----------------------------------------------------------------------------------

    /// Cart on a track, two 2-link arms hanging from it — a miniature of the rope rig.
    /// `tip_separation` places the arms so the free ends start that far apart.
    fn get_branched_frames() -> Vec<FrameBox> {
        let arm = |side: &str, x: f64| {
            Box::new(
                RotationalFrame::new(format!("{}0", side))
                    .set_position(Position([x, 0.]))
                    .add_weight(Weight::new(2.).set_position(Position([2., 0.])))
                    .add_child(Box::new(
                        RotationalFrame::new(format!("{}1", side))
                            .set_position(Position([2., 0.]))
                            .add_weight(Weight::new(1.).set_position(Position([2., 0.]))),
                    )),
            )
        };
        vec![Box::new(
            TrackFrame::new("cart".into())
                .add_weight(Weight::new(20.))
                .add_child(arm("left", -3.))
                .add_child(arm("right", 3.)),
        )]
    }

    fn get_branched_states(seed: f64) -> Vec<State> {
        get_varied_states(5, seed)
    }

    fn distance_constraint() -> ConstraintBox {
        Box::new(
            DistanceConstraint::new("left1".into(), "right1".into(), 1.5)
                .set_positions(Position([2., 0.]), Position([2., 0.])),
        )
    }

    fn coincidence_constraint() -> ConstraintBox {
        Box::new(
            CoincidenceConstraint::new("left1".into(), "right1".into())
                .set_positions(Position([2., 0.]), Position([2., 0.])),
        )
    }

    /// Builds a `ConstraintCtx` at an arbitrary state. Configuration-only unless
    /// `with_motion`, which is the point of seam 4.
    fn make_ctx<'a>(
        index_path_map: &'a FrameIndexPathMap,
        states: &[State],
        indices: (usize, usize),
        motion: Option<&'a (Vec<Mat3>, Vec<Mat3>)>,
        config: &'a (Vec<Mat3>, Vec<Mat3>),
    ) -> ConstraintCtx<'a> {
        ConstraintCtx {
            frame_count: states.len(),
            index_a: indices.0,
            index_b: indices.1,
            path_a: &index_path_map[&indices.0],
            path_b: &index_path_map[&indices.1],
            pos_mats: &config.0,
            vel_mats: &config.1,
            vel_sum_mats: motion.map(|m| m.0.as_slice()),
            accel_sum_mats: motion.map(|m| m.1.as_slice()),
        }
    }

    #[test]
    fn test_constraint_jacobian_matches_finite_difference() {
        // Catches a Jacobian written to the wrong coordinates, and any error in
        // dC/dq. It CANNOT catch a sign error in the velocity-product term -- the
        // Jacobian contains no qd at all. See
        // test_constraint_acceleration_is_zero, which is the check for that.
        let scene_frames = get_branched_frames();
        let frames = super::sort_frames(&scene_frames);
        let index_path_map = super::get_index_path_map(&frames);
        let count = frames.len();

        for constraint in [distance_constraint(), coincidence_constraint()].iter() {
            let indices =
                super::get_constraint_frame_indices(&frames, std::slice::from_ref(constraint))[0];
            for &seed in [0.3, -1.1, 2.2].iter() {
                let states = get_branched_states(seed);
                let config = super::get_config_kinematics(&frames, &index_path_map, &states);
                let ctx = make_ctx(&index_path_map, &states, indices, None, &config);
                let analytic = constraint.jacobian_rows(&ctx);

                let h = 1e-6;
                for i in 0..count {
                    let bump = |sign: f64| {
                        let mut s: Vec<State> = states.to_vec();
                        s[i].q += sign * h;
                        let c = super::get_config_kinematics(&frames, &index_path_map, &s);
                        let ctx = make_ctx(&index_path_map, &s, indices, None, &c);
                        constraint.value(&ctx)
                    };
                    let plus = bump(1.);
                    let minus = bump(-1.);
                    for row in 0..constraint.row_count() {
                        let numeric = (plus[row] - minus[row]) / (2. * h);
                        assert_abs_diff_eq!(
                            analytic[row][i],
                            numeric,
                            epsilon = 1e-5 * (1. + numeric.abs())
                        );
                    }
                }
            }
        }
    }

    #[test]
    fn test_constraint_acceleration_is_zero() {
        // The check that catches a wrong sign in the bias term, which the
        // finite-difference test above cannot see and which asserting
        // `J*qdd + Jdot*qd == 0` also cannot -- that is the augmented system's own
        // second block row and is satisfied by construction.
        //
        // Instead: solve for qdd, then central-difference Cd in time, computing Cd
        // from the Jacobian and the state alone. Nothing here reads `bias`, so a
        // wrong sign there makes qdd wrong and shows up as a non-zero Cdd.
        let scene_frames = get_branched_frames();
        let frames = super::sort_frames(&scene_frames);
        let index_path_map = super::get_index_path_map(&frames);
        let gravity = Vec3::new(0., -10., 0.);

        for constraint in [distance_constraint(), coincidence_constraint()].iter() {
            let constraints = std::slice::from_ref(constraint);
            let indices = super::get_constraint_frame_indices(&frames, constraints)[0];
            for &seed in [0.3, -1.1, 2.2].iter() {
                let states = get_branched_states(seed);
                let ext: Vec<f64> = vec![0.; frames.len()];
                let qdds = super::solve(
                    &frames,
                    &index_path_map,
                    constraints,
                    &[indices],
                    &gravity,
                    &states,
                    &ext,
                );

                // Cd(q, qd) = J(q) . qd, from `jacobian_rows` only.
                let c_dot = |s: &[State]| -> Vec<f64> {
                    let config = super::get_config_kinematics(&frames, &index_path_map, s);
                    let ctx = make_ctx(&index_path_map, s, indices, None, &config);
                    constraint
                        .jacobian_rows(&ctx)
                        .iter()
                        .map(|row| row.iter().zip(s).map(|(j, st)| j * st.qd).sum())
                        .collect()
                };

                let h = 1e-6;
                let step = |sign: f64| -> Vec<State> {
                    states
                        .iter()
                        .enumerate()
                        .map(|(i, st)| State {
                            q: st.q + sign * h * st.qd,
                            qd: st.qd + sign * h * qdds[i],
                        })
                        .collect()
                };
                let plus = c_dot(&step(1.));
                let minus = c_dot(&step(-1.));
                for row in 0..constraint.row_count() {
                    let c_ddot = (plus[row] - minus[row]) / (2. * h);
                    assert_abs_diff_eq!(c_ddot, 0., epsilon = 1e-4);
                }
            }
        }
    }

    #[test]
    fn test_near_singular_gram_skips_rather_than_dividing_by_it() {
        // A chain pulled taut is collinear, which makes `Jg⁻¹Jᵀ` rank-deficient --
        // and exact rank deficiency has measure zero in float64, so what actually
        // arrives is a gram matrix that is *nearly* singular. `nalgebra` reports
        // singularity only on a bit-exact zero pivot, so without the relative test
        // this divides by a pivot around `1e-16` and returns multipliers of order
        // `1e15`: finite, plausible, and not a correction. `RsSolver`'s `NaN`
        // screen does not catch a large finite value.
        //
        // The predicate itself, at the threshold, because that is what the fix
        // changed. A pivot ratio of `1e-16` is nonzero -- `nalgebra` solves it
        // happily -- and four orders inside the tolerance, so this does not.
        let near_singular =
            CoefficientMatrix::from_diagonal(&ForceVector::from_row_slice(&[1., 1e-16]));
        assert!(super::is_singular(&near_singular));

        // And that it is not simply refusing everything: `1e-6` is well-conditioned
        // by this test and must go through.
        let healthy = CoefficientMatrix::from_diagonal(&ForceVector::from_row_slice(&[1., 1e-6]));
        assert!(!super::is_singular(&healthy));

        // Wired into the solve, not merely defined -- and at a perturbation that
        // only the *relative* test catches. Two rows `3e-7` apart give the gram a
        // second pivot of `9.0e-14`: nonzero, so `nalgebra` solves it and returns
        // multipliers of order `1e13`, and four orders inside the tolerance, so
        // this skips. Exactly duplicated rows would not discriminate, since that
        // pivot comes out bit-exactly zero and `nalgebra` catches it too.
        let mass_matrix = CoefficientMatrix::identity(3, 3);
        let near_collinear = vec![vec![1., 0., 0.], vec![1., 3e-7, 0.]];
        assert!(
            super::solve_metric_correction(&mass_matrix, &near_collinear, &[1., -1.]).is_none()
        );

        let independent = vec![vec![1., 0., 0.], vec![0., 1., 0.]];
        assert!(super::solve_metric_correction(&mass_matrix, &independent, &[1., -1.]).is_some());
    }

    #[test]
    fn test_stabilization_drives_the_violation_to_zero() {
        // The counterpart to `test_constraint_drift_is_conserved`, and the reason
        // that one now says `stabilize: false`.
        //
        // The fixture starts with velocities, so `Ċ₀` is non-zero and the
        // unstabilized violation grows *linearly* rather than by integration
        // error -- which is the index-1 property that test pins, and a far larger
        // signal than truncation drift. That makes this a strong contrast rather
        // than a subtle one, which is the right shape for a first test of a path
        // nothing else in `cargo test` reaches.
        //
        // The direction is what this pins, and a trajectory comparison against
        // `physm-js` cannot: two implementations agreeing says nothing about
        // whether either of them moves `C` toward zero.
        let scene_frames = get_branched_frames();
        let frames = super::sort_frames(&scene_frames);
        let index_path_map = super::get_index_path_map(&frames);

        let makers: [fn() -> ConstraintBox; 2] = [distance_constraint, coincidence_constraint];
        for make in makers.iter() {
            let constraint = make();
            let indices =
                super::get_constraint_frame_indices(&frames, std::slice::from_ref(&constraint))[0];
            let worst_value = |states: &[State]| -> f64 {
                let config = super::get_config_kinematics(&frames, &index_path_map, states);
                let ctx = make_ctx(&index_path_map, states, indices, None, &config);
                constraint
                    .value(&ctx)
                    .iter()
                    .map(|entry| entry.abs())
                    .fold(0., f64::max)
            };

            let run = |stabilize: bool| -> f64 {
                let mut states = get_branched_states(0.4);
                let scene = get_branched_frames()
                    .into_iter()
                    .fold(Scene::new(), |scene, frame| scene.add_frame(frame))
                    .add_constraint(make());
                let solver = Solver {
                    stabilize,
                    ..Solver::new(scene)
                };
                let delta_time = 1. / 400.;
                for step in 0..1200 {
                    // A square wave on the cart, so the rig is driven rather than
                    // settling: idling is easy mode, and a drift measured there is
                    // one any stabilizer and no stabilizer both pass.
                    let mut external_forces = vec![0.; frames.len()];
                    let phase = (step as f64) * delta_time * 0.35 * 2. * PI;
                    external_forces[super::get_id_index_map(&frames)[&"cart".to_string()]] =
                        if phase.sin() >= 0. { 60. } else { -60. };
                    solver.tick_mut(&mut states, &external_forces, delta_time);
                }
                worst_value(&states)
            };

            let plain = run(false);
            let stabilized = run(true);

            // That the drive actually put the rig off the manifold, so the bound
            // below is about the correction rather than about nothing happening.
            assert!(
                plain > 1.,
                "unstabilized violation was {:e}, too small for this to test anything",
                plain
            );
            // Measured: 4.38 unstabilized against 1.6e-15 stabilized for
            // `DistanceConstraint`, and 6.33 against 3.3e-16 for
            // `CoincidenceConstraint`.
            assert!(
                stabilized < 1e-12,
                "stabilized violation was {:e}, against {:e} unstabilized",
                stabilized,
                plain
            );
        }
    }

    #[test]
    fn test_constraint_drift_is_conserved() {
        // The formulation is index-1: it holds C-ddot at zero and nothing pulls a
        // violation back, so C(t) = C0 + C0dot*t exactly. Starting from rest makes
        // C0dot zero, which leaves C *conserved*, and whatever movement is left is
        // integration error alone.
        //
        // Conservation, not satisfaction, is the property under test -- so both
        // constraints deliberately start at a non-zero C0. A test that only checked
        // `C ~ 0` would need a pre-solved initial pose and would pass just as well
        // on an implementation that quietly snapped C to zero every step.
        //
        // The assertion is on the *order*, not a magic threshold: refining the step
        // by 4x must cut the drift by at least 100x. Measured 246x for both types
        // -- within 4% of 4^4, which is as close as an order estimate from two
        // step sizes lands -- which says the drift is RK4 truncation and the
        // constraint machinery contributes none of its own. A wrong bias term does
        // not merely drift faster, it stops being fourth-order.
        let scene_frames = get_branched_frames();
        let frames = super::sort_frames(&scene_frames);
        let index_path_map = super::get_index_path_map(&frames);

        let makers: [fn() -> ConstraintBox; 2] = [distance_constraint, coincidence_constraint];
        for make in makers.iter() {
            let constraint = make();
            let indices =
                super::get_constraint_frame_indices(&frames, std::slice::from_ref(&constraint))[0];

            let value_of = |s: &[State]| -> Vec<f64> {
                let config = super::get_config_kinematics(&frames, &index_path_map, s);
                let ctx = make_ctx(&index_path_map, s, indices, None, &config);
                constraint.value(&ctx)
            };

            // Worst |C(t) - C0| over two seconds of simulated time.
            let drift_over_two_seconds = |steps: usize| -> f64 {
                let mut states: Vec<State> = get_branched_states(0.4)
                    .iter()
                    .map(|state| State { q: state.q, qd: 0. })
                    .collect();
                let initial = value_of(&states);
                // The solver owns its scene, so it gets its own constraint; the one
                // above stays borrowed for reading C back out along the way.
                let scene = get_branched_frames()
                    .into_iter()
                    .fold(Scene::new(), |scene, frame| scene.add_frame(frame))
                    .add_constraint(make());
                // Explicitly unstabilized: this test is *about* the index-1
                // behaviour, which the stabilizer removes by design.
                let solver = Solver {
                    stabilize: false,
                    ..Solver::new(scene)
                };
                let external_forces = vec![0.; frames.len()];
                let delta_time = 2. / steps as f64;
                let mut worst: f64 = 0.;
                for _ in 0..steps {
                    solver.tick_mut(&mut states, &external_forces, delta_time);
                    for (row, value) in value_of(&states).iter().enumerate() {
                        worst = worst.max((value - initial[row]).abs());
                    }
                }
                worst
            };

            let coarse = drift_over_two_seconds(120);
            let fine = drift_over_two_seconds(480);
            assert!(
                coarse < 5e-3,
                "drift at 60 Hz was {:e}, well above what RK4 truncation explains",
                coarse
            );
            assert!(
                fine * 100. < coarse,
                "refining 4x cut the drift only {:.0}x ({:e} -> {:e}); \
                 fourth-order convergence is what says the drift is the integrator's",
                coarse / fine,
                coarse,
                fine
            );
        }
    }

    #[test]
    fn test_augmented_system_is_symmetric_and_sized() {
        let scene_frames = get_branched_frames();
        let frames = super::sort_frames(&scene_frames);
        let index_path_map = super::get_index_path_map(&frames);
        let gravity = Vec3::new(0., -10., 0.);
        let states = get_branched_states(0.7);
        let ext: Vec<f64> = vec![0.; frames.len()];

        // One of each type, so the row count is 1 + 2 rather than a multiple.
        let constraints: Vec<ConstraintBox> = vec![distance_constraint(), coincidence_constraint()];
        let indices = super::get_constraint_frame_indices(&frames, &constraints);
        let (mat, vec_) = super::get_system_of_equations(
            &frames,
            &index_path_map,
            &constraints,
            &indices,
            &gravity,
            &states,
            &ext,
        );

        let n = frames.len();
        assert_eq!(mat.shape(), (n + 3, n + 3));
        assert_eq!(vec_.shape(), (n + 3, 1));
        for row in 0..n + 3 {
            for col in 0..n + 3 {
                assert_eq!(
                    mat[(row, col)],
                    mat[(col, row)],
                    "asymmetric at ({}, {})",
                    row,
                    col
                );
            }
        }
        // The (1,1) block is the unconstrained mass matrix, untouched.
        let (plain, _) = super::get_system_of_equations(
            &frames,
            &index_path_map,
            &[],
            &[],
            &gravity,
            &states,
            &ext,
        );
        assert_eq!(plain.shape(), (n, n));
        for row in 0..n {
            for col in 0..n {
                assert_eq!(mat[(row, col)], plain[(row, col)]);
            }
        }
    }

    #[test]
    fn test_unconstrained_scene_skips_the_augmentation() {
        // The `row_count == 0` early return has to be the path taken, rather than
        // an (n + 0) augmented matrix being assembled and happening to agree.
        //
        // The stronger claim -- that the numbers are unchanged -- is pinned by
        // `test_augmented_system_is_symmetric_and_sized`, which compares the (1,1)
        // block against this same assembly entry by entry, and by
        // `test_get_system_of_equations`, which pins the values themselves.
        let states = get_sample_states();
        let scene_frames = get_sample_frames();
        let frames = super::sort_frames(&scene_frames);
        let index_path_map = super::get_index_path_map(&frames);
        let gravity = Vec3::new(0., -10., 0.);
        let ext: Vec<f64> = iter::repeat(2.).take(frames.len()).collect();
        let (mat, force_vector) = super::get_system_of_equations(
            &frames,
            &index_path_map,
            &[],
            &[],
            &gravity,
            &states,
            &ext,
        );
        assert_eq!(mat.shape(), (frames.len(), frames.len()));
        assert_eq!(force_vector.len(), frames.len());
    }

    #[test]
    fn test_get_system_of_equations() {
        let states = get_sample_states();
        let frames = get_sample_frames();
        let frames = super::sort_frames(&frames);
        let index_path_map = super::get_index_path_map(&frames);
        let gravity = Vec3::new(0., -10., 0.);
        let ext_forces: Vec<f64> = iter::repeat(2.).take(frames.len()).collect();
        let (coeff_matrix, force_vector) = super::get_system_of_equations(
            &frames,
            &index_path_map,
            &[],
            &[],
            &gravity,
            &states,
            &ext_forces,
        );
        let frame_count = frames.len();
        assert_eq!(coeff_matrix.shape(), (frame_count, frame_count));
        assert_eq!(force_vector.shape(), (frame_count, 1));
    }

    #[test]
    fn test_tick_simple_mut() {
        let states1 = get_sample_states();
        let mut states2 = states1.clone();
        let frames = get_sample_frames();
        let frames = super::sort_frames(&frames);
        let index_path_map = super::get_index_path_map(&frames);
        let gravity = Vec3::new(0., -10., 0.);
        let ext_forces: Vec<f64> = iter::repeat(2.).take(frames.len()).collect();
        let delta_time = 1. / 60.;
        super::tick_simple_mut(
            &frames,
            &index_path_map,
            &[],
            &[],
            &gravity,
            &mut states2,
            &ext_forces,
            delta_time,
        );

        println!("states1: {:?}", states1);
        println!("states2: {:?}", states2);
        states1.iter().zip(states2.iter()).enumerate().for_each(
            |(time_index, (state1, state2))| {
                let delta_q = state2.q - state1.q;
                let delta_qd = state2.qd - state1.qd;
                println!(
                    "time_index: {}, state1: {:?}, state2: {:?}, delta_q: {}, delta_qd: {}",
                    time_index, state1, state2, delta_q, delta_qd
                );
                assert!(delta_q.abs() > 0.02);
                assert!(delta_q.abs() < 0.5);
                assert!(delta_qd.abs() > 0.01);
                assert!(delta_qd.abs() < 2.);
            },
        );
    }

    #[test]
    fn test_tick_runge_kutta_mut() {
        let states1 = get_sample_states();
        let mut states2 = states1.clone();
        let frames = get_sample_frames();
        let frames = super::sort_frames(&frames);
        let index_path_map = super::get_index_path_map(&frames);
        let gravity = Vec3::new(0., -10., 0.);
        let ext_forces: Vec<f64> = iter::repeat(2.).take(frames.len()).collect();
        let delta_time = 1. / 60.;
        super::tick_runge_kutta_mut(
            &frames,
            &index_path_map,
            &[],
            &[],
            &gravity,
            &mut states2,
            &ext_forces,
            delta_time,
        );

        println!("states1: {:?}", states1);
        println!("states2: {:?}", states2);
        states1.iter().zip(states2.iter()).enumerate().for_each(
            |(frame_index, (state1, state2))| {
                let delta_q = state2.q - state1.q;
                let delta_qd = state2.qd - state1.qd;
                println!(
                    "frame_index: {}, state1: {:?}, state2: {:?}, delta_q: {}, delta_qd: {}",
                    frame_index, state1, state2, delta_q, delta_qd
                );
                assert!(delta_q.abs() > 0.02);
                assert!(delta_q.abs() < 0.5);
                assert!(delta_qd.abs() > 0.01);
                assert!(delta_qd.abs() < 2.);
            },
        );
    }

    #[test]
    fn test_tick_cross_validate() {
        let mut scene = Scene::new();
        for frame in get_sample_frames() {
            scene = scene.add_frame(frame);
        }
        let mut solver = Solver::new(scene);
        let frames = super::sort_frames(&solver.scene.frames);
        let ext_forces: Vec<f64> = iter::repeat(2.).take(frames.len()).collect();
        let mut state_history1: Vec<Vec<State>> = Vec::new();
        let mut state_history2: Vec<Vec<State>> = Vec::new();
        let max_time_index = 50;
        let delta_time = 1. / 60.;

        println!("Simulating with runge_kutta=false...");
        solver.runge_kutta = false;
        let mut states = get_sample_states();
        for time_index in 0..max_time_index {
            state_history1.push(states.clone());
            solver.tick_mut(&mut states, &ext_forces, delta_time);
        }

        println!("Simulating with runge_kutta=true...");
        solver.runge_kutta = true;
        let mut states = get_sample_states();
        for time_index in 0..max_time_index {
            state_history2.push(states.clone());
            solver.tick_mut(&mut states, &ext_forces, delta_time);
        }

        for time_index in 0..max_time_index {
            let states1 = &state_history1[time_index];
            let states2 = &state_history2[time_index];
            for (frame_index, (state1, state2)) in states1.iter().zip(states2).enumerate() {
                let delta_q = state2.q - state1.q;
                let delta_qd = state2.qd - state1.qd;
                println!(
                    "time_index: {}, frame_index: {}, state1: {:?}, state2: {:?}, delta_q: {}, delta_qd: {}",
                    time_index, frame_index, state1, state2, delta_q, delta_qd
                );
                assert!(delta_q.abs() < 0.2);
                assert!(delta_qd.abs() < 0.2);
            }
        }
    }

    #[test]
    fn test_new() {
        let solver = Solver::new(Scene::new());
        assert_eq!(solver.scene.frames.len(), 0);
    }
}
