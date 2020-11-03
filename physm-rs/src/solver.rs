use std::collections::HashMap;
use std::f64::consts::PI;

use crate::Frame;
use crate::FrameBox;
use crate::FrameId;
use crate::Mat3;
use crate::RotationalFrame;
use crate::Scene;
use crate::State;
use crate::TrackFrame;

#[derive(Debug)]
pub struct Solver {
    pub scene: Scene,
    pub runge_kutta: bool,
}

type FrameRefVec<'a> = Vec<&'a FrameBox>;
type FramePath = Vec<usize>;
type FrameIdIndexMap<'a> = HashMap<&'a FrameId, usize>;
type FrameIndexPathMap = HashMap<usize, Vec<usize>>;

impl Solver {
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

        let id_index_map = Self::get_id_index_map(frames);
        let mut index_path_map = HashMap::new();
        index_path_map.reserve(frames.len());
        frames
            .iter()
            .for_each(|frame| visit(&frame, Vec::new(), &id_index_map, &mut index_path_map));
        index_path_map
    }

    fn get_parent_index(child_index: usize, index_path_map: &FrameIndexPathMap) -> Option<usize> {
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
        let get_parent_index = |index| Self::get_parent_index(index, index_path_map);
        let mut pos_mats = Vec::<Mat3>::new();
        pos_mats.reserve(frames.len());
        frames.iter().enumerate().for_each(|(index, frame)| {
            let local_pos_mat = frame.get_local_pos_matrix(states[index].q);
            let pos_mat = match get_parent_index(index) {
                Some(parent_index) => pos_mats[parent_index] * local_pos_mat,
                None => local_pos_mat,
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
        let get_parent_index = |index| Self::get_parent_index(index, index_path_map);
        frames
            .iter()
            .enumerate()
            .map(|(index, frame)| {
                let inv_pos_mat = &inv_pos_mats[index];
                let local_vel_mat = frame.get_local_vel_matrix(states[index].q);
                let rel_vel_mat = local_vel_mat * inv_pos_mat;
                let vel_mat = match get_parent_index(index) {
                    Some(parent_index) => pos_mats[parent_index] * rel_vel_mat,
                    None => rel_vel_mat,
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
        let get_parent_index = |index| Self::get_parent_index(index, index_path_map);
        frames
            .iter()
            .enumerate()
            .map(|(index, frame)| {
                let inv_pos_mat = &inv_pos_mats[index];
                let local_accel_mat = frame.get_local_accel_matrix(states[index].q);
                let rel_accel_mat = local_accel_mat * inv_pos_mat;
                let accel_mat = match get_parent_index(index) {
                    Some(parent_index) => pos_mats[parent_index] * rel_accel_mat,
                    None => rel_accel_mat,
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
        let get_parent_index = |index| Self::get_parent_index(index, index_path_map);
        let mut vel_sum_mats = Vec::<Mat3>::new();
        vel_sum_mats.reserve(frames.len());
        frames.iter().enumerate().for_each(|(index, frame)| {
            let qd_vel_mat = states[index].qd * vel_mats[index];
            let vel_sum_mat = match get_parent_index(index) {
                Some(parent_index) => qd_vel_mat + vel_sum_mats[parent_index],
                None => qd_vel_mat,
            };
            vel_sum_mats.push(vel_sum_mat);
        });
        vel_sum_mats
    }

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
        let frames = Self::sort_frames(&self.scene.frames);
        let index_path_map = Self::get_index_path_map(&frames);
        42
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::Position;
    use crate::Scene;
    use crate::Weight;

    const BALL_ID: &str = "ball";
    const BALL_INDEX: usize = 0;
    const CART_ID: &str = "cart";
    const CART_INDEX: usize = 1;
    const PENDULUM1_ID: &str = "pendulum1";
    const PENDULUM1_INDEX: usize = 2;
    const PENDULUM2_ID: &str = "pendulum2";
    const PENDULUM2_INDEX: usize = 3;
    const FRAME_IDS: &[&str] = &[BALL_ID, CART_ID, PENDULUM1_ID, PENDULUM2_ID];

    fn get_initial_state(frame_id: &str) -> State {
        let (q, qd) = match frame_id {
            CART_ID => (5., 1.),
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

    fn get_sample_frames() -> Vec<Box<dyn Frame>> {
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
            Solver::sort_frames(&get_sample_frames())
                .iter()
                .map(|frame| frame.get_id().as_str())
                .collect::<Vec<&str>>(),
            FRAME_IDS
        );
    }

    #[test]
    fn test_get_index_path_map() {
        let frames = get_sample_frames();
        let frames = Solver::sort_frames(&frames);
        let index_path_map = Solver::get_index_path_map(&frames);
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
        let frames = Solver::sort_frames(&frames);
        let index_path_map = Solver::get_index_path_map(&frames);
        let pos_mats = Solver::get_pos_mats(&frames, &index_path_map, &states);
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
        let frames = Solver::sort_frames(&frames);
        let index_path_map = Solver::get_index_path_map(&frames);
        let pos_mats = Solver::get_pos_mats(&frames, &index_path_map, &states);
        let inv_pos_mats = Solver::get_inv_pos_mats(&pos_mats);
        let id_index_map = Solver::get_id_index_map(&frames);
        let local_pos_mats: Vec<Mat3> = frames
            .iter()
            .zip(states.iter())
            .map(|(frame, state)| frame.get_local_pos_matrix(state.q))
            .collect();
        assert_eq!(inv_pos_mats.len(), frames.len());
        assert_ulps_eq!(
            inv_pos_mats[BALL_INDEX],
            local_pos_mats[BALL_INDEX].try_inverse().unwrap()
        );
        assert_ulps_eq!(
            inv_pos_mats[CART_INDEX],
            local_pos_mats[CART_INDEX].try_inverse().unwrap()
        );
        assert_ulps_eq!(
            inv_pos_mats[PENDULUM1_INDEX],
            (local_pos_mats[CART_INDEX] * local_pos_mats[PENDULUM1_INDEX])
                .try_inverse()
                .unwrap()
        );
        assert_ulps_eq!(
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
        let frames = Solver::sort_frames(&frames);
        let index_path_map = Solver::get_index_path_map(&frames);
        let pos_mats = Solver::get_pos_mats(&frames, &index_path_map, &states);
        let inv_pos_mats = Solver::get_inv_pos_mats(&pos_mats);
        let id_index_map = Solver::get_id_index_map(&frames);
        let vel_mats =
            Solver::get_vel_mats(&frames, &index_path_map, &pos_mats, &inv_pos_mats, &states);
        let local_vel_mats: Vec<Mat3> = frames
            .iter()
            .zip(states.iter())
            .map(|(frame, state)| frame.get_local_vel_matrix(state.q))
            .collect();
        assert_eq!(vel_mats.len(), frames.len());
        assert_ulps_eq!(
            vel_mats[BALL_INDEX],
            local_vel_mats[BALL_INDEX] * inv_pos_mats[BALL_INDEX]
        );
        assert_ulps_eq!(
            vel_mats[CART_INDEX],
            local_vel_mats[CART_INDEX] * inv_pos_mats[CART_INDEX]
        );
        assert_ulps_eq!(
            vel_mats[PENDULUM1_INDEX],
            pos_mats[CART_INDEX] * local_vel_mats[PENDULUM1_INDEX] * inv_pos_mats[PENDULUM1_INDEX]
        );
        assert_ulps_eq!(
            vel_mats[PENDULUM2_INDEX],
            pos_mats[PENDULUM1_INDEX]
                * local_vel_mats[PENDULUM2_INDEX]
                * inv_pos_mats[PENDULUM2_INDEX],
            max_ulps = 4
        );
    }

    #[test]
    fn test_get_accel_mats() {
        let states = get_sample_states();
        let frames = get_sample_frames();
        let frames = Solver::sort_frames(&frames);
        let index_path_map = Solver::get_index_path_map(&frames);
        let pos_mats = Solver::get_pos_mats(&frames, &index_path_map, &states);
        let inv_pos_mats = Solver::get_inv_pos_mats(&pos_mats);
        let id_index_map = Solver::get_id_index_map(&frames);
        let accel_mats =
            Solver::get_accel_mats(&frames, &index_path_map, &pos_mats, &inv_pos_mats, &states);
        let local_accel_mats: Vec<Mat3> = frames
            .iter()
            .zip(states.iter())
            .map(|(frame, state)| frame.get_local_accel_matrix(state.q))
            .collect();
        assert_eq!(accel_mats.len(), frames.len());
        assert_ulps_eq!(
            accel_mats[BALL_INDEX],
            local_accel_mats[BALL_INDEX] * inv_pos_mats[BALL_INDEX]
        );
        assert_ulps_eq!(
            accel_mats[CART_INDEX],
            local_accel_mats[CART_INDEX] * inv_pos_mats[CART_INDEX]
        );
        assert_ulps_eq!(
            accel_mats[PENDULUM1_INDEX],
            pos_mats[CART_INDEX]
                * local_accel_mats[PENDULUM1_INDEX]
                * inv_pos_mats[PENDULUM1_INDEX]
        );
        assert_ulps_eq!(
            accel_mats[PENDULUM2_INDEX],
            pos_mats[PENDULUM1_INDEX]
                * local_accel_mats[PENDULUM2_INDEX]
                * inv_pos_mats[PENDULUM2_INDEX],
            max_ulps = 4
        );
    }

    #[test]
    fn test_get_vel_sum_mats() {
        let states = get_sample_states();
        let frames = get_sample_frames();
        let frames = Solver::sort_frames(&frames);
        let index_path_map = Solver::get_index_path_map(&frames);
        let pos_mats = Solver::get_pos_mats(&frames, &index_path_map, &states);
        let inv_pos_mats = Solver::get_inv_pos_mats(&pos_mats);
        let id_index_map = Solver::get_id_index_map(&frames);
        let vel_mats =
            Solver::get_vel_mats(&frames, &index_path_map, &pos_mats, &inv_pos_mats, &states);
        let vel_sum_mats =
            Solver::get_vel_sum_mats(&frames, &index_path_map, &pos_mats, &vel_mats, &states);
        assert_eq!(vel_sum_mats.len(), frames.len());
        assert_ulps_eq!(
            vel_sum_mats[BALL_INDEX],
            states[BALL_INDEX].qd * vel_mats[BALL_INDEX]
        );
        assert_ulps_eq!(
            vel_sum_mats[CART_INDEX],
            states[CART_INDEX].qd * vel_mats[CART_INDEX]
        );
        assert_ulps_eq!(
            vel_sum_mats[PENDULUM1_INDEX],
            states[CART_INDEX].qd * vel_mats[CART_INDEX]
                + states[PENDULUM1_INDEX].qd * vel_mats[PENDULUM1_INDEX]
        );
        assert_ulps_eq!(
            vel_sum_mats[PENDULUM2_INDEX],
            states[CART_INDEX].qd * vel_mats[CART_INDEX]
                + states[PENDULUM1_INDEX].qd * vel_mats[PENDULUM1_INDEX]
                + states[PENDULUM2_INDEX].qd * vel_mats[PENDULUM2_INDEX]
        );
    }

    #[test]
    fn test_new() {
        let solver = Solver::new(Scene::new());
        assert_eq!(solver.scene.frames.len(), 0);
    }
}
