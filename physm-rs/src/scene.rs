use crate::constraint;
use crate::json;
use crate::ConstraintBox;
use crate::Error;
use crate::FrameBox;
use crate::FrameId;
use crate::Vec3;
use std::collections::HashSet;

const DEFAULT_GRAVITY: &[f64] = &[0., -10.0, 0.];

#[derive(Debug)]
pub struct Scene {
    pub gravity: Vec3,
    pub frames: Vec<FrameBox>,
    pub constraints: Vec<ConstraintBox>,
}

impl Scene {
    pub fn new() -> Self {
        Self {
            gravity: Vec3::from_column_slice(DEFAULT_GRAVITY),
            frames: Vec::new(),
            constraints: Vec::new(),
        }
    }

    pub fn set_gravity(mut self, gravity: Vec3) -> Self {
        self.gravity = gravity;
        self
    }

    pub fn add_frame(mut self, frame: FrameBox) -> Self {
        self.frames.push(frame);
        self
    }

    pub fn add_constraint(mut self, constraint: ConstraintBox) -> Self {
        self.constraints.push(constraint);
        self
    }

    pub fn from_json_value(value: &serde_json::Value) -> Result<Self, Error> {
        let obj = json::value_to_json_obj(value)?;
        let scene = Scene {
            constraints: json::map_obj_item_or_default(
                obj,
                "constraints",
                constraint::value_to_constraints,
            )?,
            frames: json::map_obj_item_or_default(obj, "frames", json::value_to_frames)?,
            gravity: Vec3::new(
                0.,
                -1. * json::map_obj_item_or_default(obj, "gravity", json::value_to_f64)?,
                0.,
            ),
        };
        scene.check_constraint_frame_ids()?;
        Ok(scene)
    }

    /// Rejects a constraint naming a frame the scene does not contain.
    ///
    /// This is `constraints.md` §8's structural row: caught once, at scene build.
    /// Left to the solver it would surface as a panic on the first tick instead,
    /// which across the wasm boundary traps the module rather than returning an
    /// error the caller can act on.
    fn check_constraint_frame_ids(&self) -> Result<(), Error> {
        fn collect<'a>(frames: &'a [FrameBox], ids: &mut HashSet<&'a FrameId>) {
            for frame in frames {
                ids.insert(frame.get_id());
                collect(frame.get_children(), ids);
            }
        }
        let mut ids = HashSet::new();
        collect(&self.frames, &mut ids);
        for constraint in &self.constraints {
            let (id1, id2) = constraint.frame_ids();
            for id in [id1, id2].iter() {
                if !ids.contains(*id) {
                    return Err(Error(format!(
                        "constraint references unknown frame id: {}",
                        id
                    )));
                }
            }
        }
        Ok(())
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
        assert_eq!(scene.gravity, Vec3::from_column_slice(DEFAULT_GRAVITY));
        assert_eq!(scene.frames.len(), 0);
        let scene = scene
            .set_gravity(Vec3::new(0., -12., 0.))
            .add_frame(Box::new(TrackFrame::new("a".into())));
        assert_eq!(scene.gravity, Vec3::new(0., -12., 0.));
        assert_eq!(scene.frames.len(), 1);
    }

    fn scene_json(constraint_frame1: &str) -> String {
        format!(
            r#"
            {{
              "frames": [
                {{
                  "frames": [
                    {{"frames": [], "id": "b", "type": "RotationalFrame"}},
                    {{"frames": [], "id": "c", "type": "RotationalFrame"}}
                  ],
                  "id": "a",
                  "type": "TrackFrame"
                }}
              ],
              "constraints": [
                {{
                  "frame1": "{}",
                  "frame2": "c",
                  "length": 2,
                  "type": "DistanceConstraint"
                }}
              ]
            }}"#,
            constraint_frame1
        )
    }

    #[test]
    fn test_from_json_value_resolves_constraint_frame_ids() {
        // A nested frame is still in scope for a constraint: the check walks the
        // whole tree, not just the roots.
        let json: serde_json::Value = serde_json::from_str(&scene_json("b")).unwrap();
        let scene = Scene::from_json_value(&json).unwrap();
        assert_eq!(scene.constraints.len(), 1);
    }

    #[test]
    fn test_from_json_value_rejects_unknown_constraint_frame_id() {
        // Rejected at scene build rather than panicking on the first tick --
        // which, across the wasm boundary, would trap the module instead of
        // returning something the caller can act on.
        let json: serde_json::Value = serde_json::from_str(&scene_json("nope")).unwrap();
        let error = Scene::from_json_value(&json).unwrap_err();
        assert!(
            format!("{:?}", error).contains("unknown frame id: nope"),
            "unhelpful error: {:?}",
            error
        );
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
        let expected_scene = Scene::new()
            .set_gravity(Vec3::new(0., -5.1, 0.))
            .add_frame(Box::new(
                TrackFrame::new("a".into()).add_child(Box::new(RotationalFrame::new("b".into()))),
            ));
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
