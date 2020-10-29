use crate::Frame;

const DEFAULT_GRAVITY: f64 = 10.0;

#[derive(Debug)]
pub struct Scene {
    pub gravity: f64,
    pub frames: Vec<Box<dyn Frame>>,
}

impl Scene {
    pub fn new() -> Self {
        Self {
            gravity: DEFAULT_GRAVITY,
            frames: Vec::new(),
        }
    }

    pub fn set_gravity(mut self, gravity: f64) -> Self {
        self.gravity = gravity;
        self
    }

    pub fn add_frame(mut self, frame: Box<dyn Frame>) -> Self {
        self.frames.push(frame);
        self
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::TrackFrame;

    #[test]
    fn constructor() {
        let scene = Scene::new();
        assert_eq!(scene.gravity, DEFAULT_GRAVITY);
        assert_eq!(scene.frames.len(), 0);
        let scene = scene
            .set_gravity(12.0)
            .add_frame(Box::new(TrackFrame::new()));
        assert_eq!(scene.gravity, 12.0);
        assert_eq!(scene.frames.len(), 1);
    }
}
