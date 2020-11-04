use std::collections::HashMap;
use std::f64::consts::PI;
use std::iter;

use crate::Frame;
use crate::FrameBox;
use crate::FrameId;
use crate::Mat3;
use crate::RotationalFrame;
use crate::Scene;
use crate::State;
use crate::TrackFrame;
use crate::Vec3;

#[derive(Debug)]
pub struct Solver {
    pub scene: Scene,
    pub runge_kutta: bool,
}

type FrameRefVec<'a> = Vec<&'a FrameBox>;
type FrameIndex = usize;

type FramePath = Vec<FrameIndex>;
type FrameIdIndexMap<'a> = HashMap<&'a FrameId, FrameIndex>;
type FrameIndexPathMap = HashMap<FrameIndex, Vec<FrameIndex>>;

type CoefficientMatrix = nalgebra::DMatrix<f64>;

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
    debug_assert_eq!(frames.len(), index_path_map.len());
    debug_assert_eq!(frames.len(), states.len());
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
    debug_assert_eq!(frames.len(), index_path_map.len());
    debug_assert_eq!(frames.len(), pos_mats.len());
    debug_assert_eq!(frames.len(), inv_pos_mats.len());
    debug_assert_eq!(frames.len(), states.len());
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
    debug_assert_eq!(frames.len(), index_path_map.len());
    debug_assert_eq!(frames.len(), pos_mats.len());
    debug_assert_eq!(frames.len(), inv_pos_mats.len());
    debug_assert_eq!(frames.len(), states.len());
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
    debug_assert_eq!(frames.len(), index_path_map.len());
    debug_assert_eq!(frames.len(), pos_mats.len());
    debug_assert_eq!(frames.len(), vel_mats.len());
    debug_assert_eq!(frames.len(), states.len());
    let get_parent_index = |index| get_parent_index(index, index_path_map);
    let mut vel_sum_mats = Vec::<Mat3>::new();
    vel_sum_mats.reserve(frames.len());
    frames.iter().enumerate().for_each(|(index, frame)| {
        let qd_vel_mat = states[index].qd * vel_mats[index];
        let vel_sum_mat = match get_parent_index(index) {
            None => qd_vel_mat,
            Some(parent_index) => qd_vel_mat + vel_sum_mats[parent_index],
        };
        vel_sum_mats.push(vel_sum_mat);
    });
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
    debug_assert_eq!(frames.len(), index_path_map.len());
    debug_assert_eq!(frames.len(), pos_mats.len());
    debug_assert_eq!(frames.len(), vel_mats.len());
    debug_assert_eq!(frames.len(), accel_mats.len());
    debug_assert_eq!(frames.len(), vel_sum_mats.len());
    debug_assert_eq!(frames.len(), states.len());
    let get_parent_index = |index| get_parent_index(index, index_path_map);
    let mut accel_sum_mats = Vec::<Mat3>::new();
    accel_sum_mats.reserve(frames.len());
    frames.iter().enumerate().for_each(|(index, frame)| {
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
    });
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
    debug_assert_eq!(frames.len(), pos_mats.len());
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

fn get_descendent_frames(
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

fn get_coefficient_matrix_entry(
    row: FrameIndex,
    col: FrameIndex,
    frames: &[&FrameBox],
    vel_mats: &[Mat3],
    index_path_map: &FrameIndexPathMap,
    weight_offsets: &[FrameIndex],
    weight_pos_vecs: &[Vec3],
) -> f64 {
    debug_assert!(row < frames.len());
    debug_assert!(col < frames.len());
    debug_assert_eq!(frames.len(), vel_mats.len());
    debug_assert_eq!(frames.len(), weight_offsets.len() - 1);
    debug_assert_eq!(frames.len(), index_path_map.len());
    debug_assert_eq!(weight_pos_vecs.len(), *weight_offsets.last().unwrap());
    if col >= row && path_contains(&index_path_map[&col], row) {
        let vel_mat1 = vel_mats[row];
        let vel_mat2 = vel_mats[col];
        get_descendent_frames(col, &index_path_map)
            .iter()
            .map(|frame_index| {
                let weight_offset = weight_offsets[*frame_index];
                let weight_count = frames[*frame_index].get_weights().len();
                (0..weight_count)
                    .map(move |weight_index| weight_pos_vecs[weight_offset + weight_index])
            })
            .flatten()
            .map(|weight_pos| (vel_mat1 * weight_pos).dot(&(vel_mat2 * weight_pos)))
            .sum()
    } else {
        0.
    }
}

fn get_coefficient_matrix(
    frames: &[&FrameBox],
    vel_mats: &[Mat3],
    index_path_map: &FrameIndexPathMap,
    weight_offsets: &[FrameIndex],
    weight_pos_vecs: &[Vec3],
) -> CoefficientMatrix {
    let get_coefficient = |row, col| {
        get_coefficient_matrix_entry(
            row,
            col,
            &frames,
            &vel_mats,
            &index_path_map,
            &weight_offsets,
            &weight_pos_vecs,
        )
    };
    let size = frames.len();
    let mut coefficient_matrix = CoefficientMatrix::from_fn(size, size, get_coefficient);
    coefficient_matrix.fill_lower_triangle_with_upper_triangle();
    coefficient_matrix
}

impl Solver {
    pub fn new(scene: Scene) -> Self {
        Self {
            scene: scene,
            runge_kutta: false,
        }
    }

    pub fn set_runge_kutta(mut self, runge_kutta: bool) -> Self {
        self.runge_kutta = runge_kutta;
        self
    }

    pub fn tick(&self, states: &[State], delta_time: f64) -> i32 {
        let frames = sort_frames(&self.scene.frames);
        let index_path_map = get_index_path_map(&frames);
        42
    }
}

#[cfg(test)]
mod tests {
    use crate::Position;
    use crate::Scene;
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
        items.sort_by_key(|(k, v)| *k);
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
            super::get_descendent_frames(BALL_INDEX, &index_path_map),
            [BALL_INDEX]
        );
        assert_eq!(
            super::get_descendent_frames(CART_INDEX, &index_path_map),
            [CART_INDEX, PENDULUM1_INDEX, PENDULUM2_INDEX]
        );
        assert_eq!(
            super::get_descendent_frames(PENDULUM1_INDEX, &index_path_map),
            [PENDULUM1_INDEX, PENDULUM2_INDEX]
        );
        assert_eq!(
            super::get_descendent_frames(PENDULUM2_INDEX, &index_path_map),
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
        let get_weight_pos =
            |frame_index, weight_index| weight_pos_vecs[weight_offsets[frame_index] + weight_index];
        let get_coefficient = |row, col| {
            super::get_coefficient_matrix_entry(
                row,
                col,
                &frames,
                &vel_mats,
                &index_path_map,
                &weight_offsets,
                &weight_pos_vecs,
            )
        };

        assert_abs_diff_eq!(get_coefficient(BALL_INDEX, CART_INDEX), 0.);
        assert_abs_diff_eq!(get_coefficient(PENDULUM2_INDEX, PENDULUM1_INDEX), 0.);
        assert_abs_diff_eq!(
            get_coefficient(BALL_INDEX, BALL_INDEX),
            (vel_mats[BALL_INDEX] * get_weight_pos(BALL_INDEX, 0)).norm_squared()
        );
        assert_abs_diff_eq!(
            get_coefficient(CART_INDEX, CART_INDEX),
            (vel_mats[CART_INDEX] * get_weight_pos(CART_INDEX, 0)).norm_squared()
                + (vel_mats[CART_INDEX] * get_weight_pos(CART_INDEX, 1)).norm_squared()
                + (vel_mats[CART_INDEX] * get_weight_pos(PENDULUM1_INDEX, 0)).norm_squared()
                + (vel_mats[CART_INDEX] * get_weight_pos(PENDULUM2_INDEX, 0)).norm_squared()
        );
        assert_abs_diff_eq!(
            get_coefficient(PENDULUM1_INDEX, PENDULUM1_INDEX),
            (vel_mats[PENDULUM1_INDEX] * get_weight_pos(PENDULUM1_INDEX, 0)).norm_squared()
                + (vel_mats[PENDULUM1_INDEX] * get_weight_pos(PENDULUM2_INDEX, 0)).norm_squared()
        );
        assert_abs_diff_eq!(
            get_coefficient(PENDULUM2_INDEX, PENDULUM2_INDEX),
            (vel_mats[PENDULUM2_INDEX] * get_weight_pos(PENDULUM2_INDEX, 0)).norm_squared()
        );
        assert_abs_diff_eq!(
            get_coefficient(PENDULUM1_INDEX, PENDULUM2_INDEX),
            (vel_mats[PENDULUM1_INDEX] * get_weight_pos(PENDULUM1_INDEX, 0))
                .dot(&(vel_mats[PENDULUM2_INDEX] * get_weight_pos(PENDULUM1_INDEX, 0)))
                + (vel_mats[PENDULUM1_INDEX] * get_weight_pos(PENDULUM2_INDEX, 0))
                    .dot(&(vel_mats[PENDULUM2_INDEX] * get_weight_pos(PENDULUM2_INDEX, 0))),
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
        let coefficient_matrix = super::get_coefficient_matrix(
            &frames,
            &vel_mats,
            &index_path_map,
            &weight_offsets,
            &weight_pos_vecs,
        );
        let get_coefficient = |row, col| {
            super::get_coefficient_matrix_entry(
                row,
                col,
                &frames,
                &vel_mats,
                &index_path_map,
                &weight_offsets,
                &weight_pos_vecs,
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
    fn test_new() {
        let solver = Solver::new(Scene::new());
        assert_eq!(solver.scene.frames.len(), 0);
    }
}
