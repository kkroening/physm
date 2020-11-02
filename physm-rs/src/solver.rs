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

type FrameRefVec<'a> = Vec<&'a Box<dyn Frame>>;
type FramePath<'a> = Vec<&'a FrameId>;
type FrameIdPathMap<'a> = HashMap<&'a FrameId, FramePath<'a>>;

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

    fn get_frame_id_path_map<'a>(frames: &'a FrameRefVec) -> FrameIdPathMap<'a> {
        fn visit<'a>(
            frame: &'a Box<dyn Frame>,
            mut path: FramePath<'a>,
            frame_id_path_map: &mut FrameIdPathMap<'a>,
        ) {
            let id = frame.get_id();
            if !frame_id_path_map.contains_key(id) {
                path.push(id);
                println!("{:?}", path);
                frame_id_path_map.insert(id, path);
                frame.get_children().iter().for_each(|child| {
                    visit(
                        child,
                        frame_id_path_map.get(id).unwrap().to_owned(),
                        frame_id_path_map,
                    )
                });
            }
        }

        let mut frame_id_path_map = HashMap::new();
        frame_id_path_map.reserve(frames.len());
        frames
            .iter()
            .for_each(|frame| visit(&frame, Vec::new(), &mut frame_id_path_map));
        frame_id_path_map
    }

    fn get_pos_mats(states: &[f64], frames: &FrameRefVec) -> Vec<Matrix> {
        frames
            .iter()
            .enumerate()
            .map(|(index, frame)| frame.get_local_pos_matrix(states[index]))
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
        let sorted_frames = Self::sort_frames(&self.scene.frames);
        42
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::Scene;

    fn get_sample_frames() -> Vec<Box<dyn Frame>> {
        vec![
            Box::new(TrackFrame::new("4".into()).add_child(Box::new(TrackFrame::new("5".into())))),
            Box::new(
                TrackFrame::new("1".into())
                    .add_child(Box::new(TrackFrame::new("3".into())))
                    .add_child(Box::new(TrackFrame::new("2".into()))),
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
            vec!["1", "2", "3", "4", "5"]
        );
    }

    #[test]
    fn test_get_frame_id_path_map() {
        let frames = get_sample_frames();
        let frames = Solver::sort_frames(&frames);
        let frame_id_path_map = Solver::get_frame_id_path_map(&frames);
        let mut items = frame_id_path_map.iter().collect::<Vec<_>>();
        items.sort_by_key(|(k, v)| k.to_owned());
        assert_eq!(
            format!("{:?}", items),
            r#"[("1", ["1"]), ("2", ["1", "2"]), ("3", ["1", "3"]), ("4", ["4"]), ("5", ["4", "5"])]"#,
        );
    }

    #[test]
    fn test_new() {
        let solver = Solver::new(Scene::new());
        assert_eq!(solver.scene.frames.len(), 0);
    }
}
