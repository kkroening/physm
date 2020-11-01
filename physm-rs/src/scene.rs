use crate::json;
use crate::Error;
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

    pub fn from_json_value(value: &serde_json::Value) -> Result<Self, Error> {
        let obj = json::value_to_json_obj(value)?;
        Ok(Scene {
            frames: json::map_obj_item(obj, "frames", json::value_to_boxed_frames)?,
            gravity: json::map_obj_item(obj, "gravity", json::value_to_f64)?,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::RotationalFrame;
    use crate::TrackFrame;

    #[test]
    fn test_new() {
        let scene = Scene::new();
        assert_eq!(scene.gravity, DEFAULT_GRAVITY);
        assert_eq!(scene.frames.len(), 0);
        let scene = scene
            .set_gravity(12.0)
            .add_frame(Box::new(TrackFrame::new()));
        assert_eq!(scene.gravity, 12.0);
        assert_eq!(scene.frames.len(), 1);
    }

    #[test]
    fn test_from_json_value() {
        let json = r#"
            {
              "frames": [
                {
                  "frames": [
                    {
                      "frames": [],
                      "type": "RotationalFrame"
                    }
                  ],
                  "type": "TrackFrame"
                }
              ],
              "gravity": 5.1
            }"#;
        let json_value: serde_json::Value = serde_json::from_str(&json).unwrap();
        let actual_scene = Scene::from_json_value(&json_value).unwrap();
        let expected_scene = Scene::new().set_gravity(5.1).add_frame(Box::new(
            TrackFrame::new().add_child(Box::new(RotationalFrame::new())),
        ));
        assert_eq!(actual_scene.gravity, 5.1);
        assert_eq!(
            format!("{:?}", actual_scene.frames),
            format!("{:?}", expected_scene.frames)
        );
        assert_eq!(
            format!("{:?}", actual_scene),
            format!("{:?}", expected_scene),
        );
    }
}
