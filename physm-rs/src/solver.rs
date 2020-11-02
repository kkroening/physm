use ndarray::prelude::*;
use std::collections::HashMap;

use crate::Frame;
use crate::FrameId;
use crate::Matrix;
use crate::Scene;
use crate::TrackFrame;

#[derive(Debug)]
pub struct Solver {
    pub scene: Scene,
    pub runge_kutta: bool,
}

type FrameBox = Box<dyn Frame>;
type FrameRefVec<'a> = Vec<&'a FrameBox>;
type FramePath = Vec<usize>;
type FrameIdIndexMap<'a> = HashMap<&'a FrameId, usize>;
type FrameIndexPathMap = HashMap<usize, Vec<usize>>;

impl Solver {
    fn sort_frames(frames: &Vec<Box<dyn Frame>>) -> FrameRefVec {
        fn visit<'a>(frame: &'a Box<dyn Frame>, sorted_frames: &mut FrameRefVec<'a>) {
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

    fn get_id_index_map<'a>(frames: &'a FrameRefVec) -> FrameIdIndexMap<'a> {
        let mut id_index_map = HashMap::new();
        id_index_map.reserve(frames.len());
        frames.iter().enumerate().for_each(|(index, frame)| {
            id_index_map.insert(frame.get_id(), index);
        });
        id_index_map
    }

    fn get_index_path_map(frames: &FrameRefVec) -> FrameIndexPathMap {
        fn visit(
            frame: &Box<dyn Frame>,
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
        if path.len() > 1 {
            Some(path[path.len() - 2])
        } else {
            None
        }
    }

    //fn get_parent(child_index: usize,

    fn get_pos_mats(
        states: &[f64],
        frames: &FrameRefVec,
        index_path_map: &FrameIndexPathMap,
    ) -> Vec<Matrix> {
        let get_parent_index = |index| Self::get_parent_index(index, index_path_map);
        frames
            .iter()
            .enumerate()
            .map(|(index, frame)| {
                let parent_index = get_parent_index(index);
                frame.get_local_pos_matrix(states[index])
            })
            .collect()
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

    pub fn tick(&self, states: &[f64], delta_time: f64) -> i32 {
        let frames = Self::sort_frames(&self.scene.frames);
        let index_path_map = Self::get_index_path_map(&frames);
        42
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::Scene;

    fn get_sample_frames() -> Vec<Box<dyn Frame>> {
        vec![
            Box::new(TrackFrame::new("3".into()).add_child(Box::new(TrackFrame::new("4".into())))),
            Box::new(
                TrackFrame::new("0".into())
                    .add_child(Box::new(TrackFrame::new("2".into())))
                    .add_child(Box::new(TrackFrame::new("1".into()))),
            ),
        ]
    }

    #[test]
    fn test_sort_frames() {
        assert_eq!(
            Solver::sort_frames(&get_sample_frames())
                .iter()
                .map(|frame| frame.get_id().as_str())
                .collect::<Vec<&str>>(),
            vec!["0", "1", "2", "3", "4"]
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
            "[(0, [0]), (1, [0, 1]), (2, [0, 2]), (3, [3]), (4, [3, 4])]",
        );
    }

    #[test]
    fn test_new() {
        let solver = Solver::new(Scene::new());
        assert_eq!(solver.scene.frames.len(), 0);
    }
}
