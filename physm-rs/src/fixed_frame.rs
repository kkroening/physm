use crate::json;
use crate::Error;
use crate::Frame;
use crate::FrameBox;
use crate::FrameId;
use crate::Mat3;
use crate::Position;
use crate::Weight;

/// A frame fixed to its parent: set at `position`, turned by `angle`, and moved
/// by nothing of its own.
///
/// It is no joint, so its local transform is a constant and its velocity and
/// acceleration matrices are the trait's zeros. Its coordinate moves nothing:
/// nothing acts on it, `get_coefficient_matrix` gives it an inertia of its own,
/// and it stays at rest -- which is `physm-js`'s `FixedFrame` too. It has no
/// resistance.
#[derive(Debug)]
pub struct FixedFrame {
    pub angle: f64,
    pub children: Vec<FrameBox>,
    pub id: FrameId,
    pub position: Position,
    pub weights: Vec<Weight>,
}

impl FixedFrame {
    pub fn new(id: FrameId) -> Self {
        Self {
            angle: 0.,
            children: Vec::new(),
            id,
            position: Position([0., 0.]),
            weights: Vec::new(),
        }
    }

    pub fn set_angle(mut self, angle: f64) -> Self {
        self.angle = angle;
        self
    }

    pub fn set_position(mut self, position: Position) -> Self {
        self.position = position;
        self
    }

    pub fn add_child(mut self, child: FrameBox) -> Self {
        self.children.push(child);
        self
    }

    pub fn add_weight(mut self, weight: Weight) -> Self {
        self.weights.push(weight);
        self
    }

    pub fn from_json_value(value: &serde_json::Value) -> Result<Self, Error> {
        let obj = json::value_to_json_obj(value)?;
        Ok(FixedFrame {
            angle: json::map_obj_item_or_default(obj, "angle", json::value_to_f64)?,
            children: json::map_obj_item_or_default(obj, "frames", json::value_to_frames)?,
            id: json::map_value_item(value, &"id", json::value_to_str)?.into(),
            position: json::map_obj_item_or_default(obj, "position", Position::from_json_value)?,
            weights: json::map_obj_item_or_default(obj, "weights", json::value_to_weights)?,
        })
    }
}

impl Frame for FixedFrame {
    fn get_children(&self) -> &[FrameBox] {
        &self.children
    }

    fn get_id(&self) -> &FrameId {
        &self.id
    }

    fn get_resistance(&self) -> f64 {
        0.
    }

    fn get_weights(&self) -> &[Weight] {
        &self.weights
    }

    fn get_local_pos_matrix(&self, _q: f64) -> Mat3 {
        Mat3::new(
            self.angle.cos(),
            -self.angle.sin(),
            self.position.0[0],
            self.angle.sin(),
            self.angle.cos(),
            self.position.0[1],
            0.,
            0.,
            1.,
        )
    }

    fn is_joint(&self) -> bool {
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_new() {
        let frame = FixedFrame::new("mount".into());
        assert_eq!(frame.id, "mount");
        assert_eq!(frame.angle, 0.);
        assert_eq!(frame.position.0, [0., 0.]);
        assert_eq!(frame.get_resistance(), 0.);
        assert!(!frame.is_joint());
    }

    #[test]
    fn test_from_json_value() {
        let frame = FixedFrame::from_json_value(&serde_json::json!({
            "id": "mount",
            "type": "FixedFrame",
            "angle": 0.4,
            "position": [2., 1.],
            "frames": [{"frames": [], "id": "arm", "type": "RotationalFrame"}],
        }))
        .unwrap();
        assert_eq!(frame.id, "mount");
        assert_eq!(frame.angle, 0.4);
        assert_eq!(frame.position.0, [2., 1.]);
        assert_eq!(frame.children.len(), 1);
    }

    #[test]
    fn test_get_local_pos_matrix_is_the_same_whatever_the_coordinate() {
        let frame = FixedFrame::new("mount".into())
            .set_position(Position([2., 1.]))
            .set_angle(0.4);
        let expected = Mat3::new(
            0.4f64.cos(),
            -(0.4f64.sin()),
            2.,
            0.4f64.sin(),
            0.4f64.cos(),
            1.,
            0.,
            0.,
            1.,
        );
        assert_eq!(frame.get_local_pos_matrix(0.), expected);
        assert_eq!(frame.get_local_pos_matrix(3.), expected);
        assert_eq!(frame.get_local_vel_matrix(1.), Mat3::zeros());
        assert_eq!(frame.get_local_accel_matrix(1.), Mat3::zeros());
    }
}
