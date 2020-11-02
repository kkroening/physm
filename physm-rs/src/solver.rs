use ndarray::prelude::*;
use std::collections::HashMap;

use crate::Frame;
use crate::Matrix;
use crate::Scene;
use crate::TrackFrame;

#[derive(Debug)]
pub struct Solver {
    pub scene: Scene,
    pub runge_kutta: bool,
}

type FrameRefVec<'a> = Vec<&'a Box<dyn Frame>>;

impl Solver {
    fn visit<'a>(frame: &'a Box<dyn Frame>, frames: &mut FrameRefVec<'a>) {
        frame
            .get_children()
            .iter()
            .for_each(|child| Self::visit(child, frames));
        frames.push(frame);
    }

    fn sort_frames(frames: &Vec<Box<dyn Frame>>) -> FrameRefVec {
        let mut sorted_frames: Vec<&Box<dyn Frame>> = Vec::new();
        frames
            .iter()
            .for_each(|frame| Self::visit(&frame, &mut sorted_frames));
        sorted_frames.reverse();
        sorted_frames
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

    #[test]
    fn test_sort_frames() {
        assert_eq!(
            Solver::sort_frames(&vec![
                Box::new(
                    TrackFrame::new("4".into()).add_child(Box::new(TrackFrame::new("5".into())))
                ),
                Box::new(
                    TrackFrame::new("1".into())
                        .add_child(Box::new(TrackFrame::new("3".into())))
                        .add_child(Box::new(TrackFrame::new("2".into())))
                )
            ])
            .iter()
            .map(|frame| frame.get_id().as_str())
            .collect::<Vec<&str>>(),
            vec!["1", "2", "3", "4", "5"]
        );
    }

    #[test]
    fn test_new() {
        let solver = Solver::new(Scene::new());
        assert_eq!(solver.scene.frames.len(), 0);
    }
}
