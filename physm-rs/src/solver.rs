use crate::Frame;
use crate::Scene;
use crate::TrackFrame;

#[derive(Debug)]
pub struct Solver {
    pub scene: Scene,
    pub runge_kutta: bool,
    //sorted_frames: Vec<&Box<dyn Frame>>,
}

impl Solver {
    fn visit<'a>(frame: &'a Box<dyn Frame>, frames: &mut Vec<&'a Box<dyn Frame>>) {
        frame
            .get_children()
            .iter()
            .for_each(|child| Self::visit(child, frames));
        frames.push(frame);
    }

    fn sort_frames(frames: &Vec<Box<dyn Frame>>) -> Vec<&Box<dyn Frame>> {
        let mut sorted_frames: Vec<&Box<dyn Frame>> = Vec::new();
        frames
            .iter()
            .for_each(|frame| Self::visit(&frame, &mut sorted_frames));
        sorted_frames
    }

    pub fn new(scene: Scene) -> Self {
        Self {
            scene: scene,
            runge_kutta: false,
            //sorted_frames: Self::sort_frames(&scene.frames),
        }
    }

    pub fn set_runge_kutta(mut self, runge_kutta: bool) -> Self {
        self.runge_kutta = runge_kutta;
        self
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
                    TrackFrame::new()
                        .set_resistance(2.)
                        .add_child(Box::new(TrackFrame::new().set_resistance(1.)))
                ),
                Box::new(
                    TrackFrame::new()
                        .set_resistance(5.)
                        .add_child(Box::new(TrackFrame::new().set_resistance(3.)))
                        .add_child(Box::new(TrackFrame::new().set_resistance(4.)))
                )
            ])
            .iter()
            .map(|frame| frame.get_resistance() as i64)
            .collect::<Vec<i64>>(),
            vec![1, 2, 3, 4, 5]
        );
    }

    #[test]
    fn test_new() {
        let solver = Solver::new(Scene::new());
        assert_eq!(solver.scene.frames.len(), 0);
    }
}
