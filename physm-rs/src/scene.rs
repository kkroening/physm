use crate::json;
use crate::Error;
use crate::FrameBox;

const DEFAULT_GRAVITY: f64 = 10.0;

#[derive(Debug)]
pub struct Scene {
    pub gravity: f64,
    pub frames: Vec<FrameBox>,
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

    pub fn add_frame(mut self, frame: FrameBox) -> Self {
        self.frames.push(frame);
        self
    }

    pub fn from_json_value(value: &serde_json::Value) -> Result<Self, Error> {
        let obj = json::value_to_json_obj(value)?;
        Ok(Scene {
            frames: json::map_obj_item_or_default(obj, "frames", json::value_to_frames)?,
            gravity: json::map_obj_item_or_default(obj, "gravity", json::value_to_f64)?,
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
            .add_frame(Box::new(TrackFrame::new("a".into())));
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
                      "id": "b",
                      "type": "RotationalFrame"
                    }
                  ],
                  "id": "a",
                  "type": "TrackFrame"
                }
              ],
              "gravity": 5.1
            }"#;
        let json_value: serde_json::Value = serde_json::from_str(&json).unwrap();
        let actual_scene = Scene::from_json_value(&json_value).unwrap();
        let expected_scene = Scene::new().set_gravity(5.1).add_frame(Box::new(
            TrackFrame::new("a".into()).add_child(Box::new(RotationalFrame::new("b".into()))),
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
