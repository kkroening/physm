use crate::json;
use crate::Error;
use crate::Frame;
use crate::FrameBox;
use crate::FrameId;
use crate::Mat3;
use crate::Position;
use crate::Weight;

#[derive(Debug)]
pub struct RotationalFrame {
    pub children: Vec<FrameBox>,
    pub id: FrameId,
    pub position: Position,
    pub resistance: f64,
    pub weights: Vec<Weight>,
}

impl RotationalFrame {
    pub fn new(id: FrameId) -> Self {
        Self {
            children: Vec::new(),
            id: id,
            position: Position([0.0, 0.0]),
            resistance: 0.,
            weights: Vec::new(),
        }
    }

    pub fn add_child(mut self, child: FrameBox) -> Self {
        self.children.push(child);
        self
    }

    pub fn set_position(mut self, position: Position) -> Self {
        self.position = position;
        self
    }

    pub fn set_resistance(mut self, resistance: f64) -> Self {
        self.resistance = resistance;
        self
    }

    pub fn add_weight(mut self, weight: Weight) -> Self {
        self.weights.push(weight);
        self
    }

    pub fn from_json_value(value: &serde_json::Value) -> Result<Self, Error> {
        let obj = json::value_to_json_obj(value)?;
        Ok(RotationalFrame {
            children: json::map_obj_item_or_default(obj, "frames", json::value_to_frames)?,
            id: json::map_value_item(value, &"id", json::value_to_str)?.into(),
            position: json::map_obj_item_or_default(obj, "position", Position::from_json_value)?,
            resistance: json::map_obj_item_or_default(obj, "resistance", json::value_to_f64)?,
            weights: json::map_obj_item_or_default(obj, "weights", json::value_to_weights)?,
        })
    }
}

impl Frame for RotationalFrame {
    fn get_children(&self) -> &[FrameBox] {
        &self.children
    }

    fn get_id(&self) -> &FrameId {
        &self.id
    }

    fn get_resistance(&self) -> f64 {
        self.resistance
    }

    fn get_weights(&self) -> &[Weight] {
        &self.weights
    }

    fn get_local_pos_matrix(&self, q: f64) -> Mat3 {
        Mat3::new(
            q.cos(),
            -q.sin(),
            self.position.0[0],
            q.sin(),
            q.cos(),
            self.position.0[1],
            0.,
            0.,
            1.,
        )
    }

    fn get_local_vel_matrix(&self, q: f64) -> Mat3 {
        Mat3::new(-q.sin(), -q.cos(), 0., q.cos(), -q.sin(), 0., 0., 0., 0.)
    }

    fn get_local_accel_matrix(&self, q: f64) -> Mat3 {
        Mat3::new(-q.cos(), q.sin(), 0., -q.sin(), -q.cos(), 0., 0., 0., 0.)
    }
}

#[cfg(test)]
mod tests {
    use std::f64::consts::PI;

    use super::*;

    #[test]
    fn test_new() {
        let frame = RotationalFrame::new("a".into())
            .add_child(Box::new(
                RotationalFrame::new("b".into()).set_position(Position([1.5, 2.6])),
            ))
            .add_child(Box::new(
                RotationalFrame::new("c".into()).set_position(Position([5., 28.])),
            ))
            .add_weight(Weight::new(12.));
        assert_eq!(frame.id, "a");
        assert_eq!(frame.children.len(), 2);
        assert_eq!(
            format!("{:?}", frame.children[0]),
            "RotationalFrame { children: [], id: \"b\", position: Position([1.5, 2.6]), resistance: 0.0, weights: [] }",
        );
        assert_eq!(
            format!("{:?}", frame.children[1]),
            "RotationalFrame { children: [], id: \"c\", position: Position([5.0, 28.0]), resistance: 0.0, weights: [] }",
        );
        assert_eq!(
            format!("{:?}", frame.weights),
            "[Weight { mass: 12.0, position: Position([0.0, 0.0]), drag: 0.0 }]",
        );
    }

    #[test]
    fn test_from_json_value() {
        let json = r#"
            {
              "angle": 3.5,
              "frames": [
                {
                  "frames": [],
                  "id": "b",
                  "position": [
                    0.2,
                    0.3
                  ],
                  "type": "RotationalFrame",
                  "weights": []
                }
              ],
              "id": "a",
              "position": [
                56,
                78.9
              ],
              "type": "RotationalFrame",
              "weights": [
                {
                  "drag": 27,
                  "mass": 55,
                  "position": [
                    3,
                    -4
                  ]
                }
              ]
            }"#;
        let json_value: serde_json::Value = serde_json::from_str(&json).unwrap();
        let frame = RotationalFrame::from_json_value(&json_value).unwrap();
        assert_eq!(frame.id, "a");
        assert_eq!(frame.position, Position([56., 78.9]));
        assert_eq!(
            format!("{:?}", frame.children),
            format!(
                "{:?}",
                vec![Box::new(
                    RotationalFrame::new("b".into()).set_position(Position([0.2, 0.3]))
                )]
            ),
        );
        assert_eq!(
            frame.weights,
            vec![Weight::new(55.)
                .set_drag(27.)
                .set_position(Position([3., -4.]))]
        );
    }

    #[test]
    fn test_get_local_pos_matrix() {
        let frame = RotationalFrame::new("a".into());
        assert_abs_diff_eq!(frame.get_local_pos_matrix(0.), Mat3::identity());
        let frame = frame.set_position(Position([3., 4.]));
        assert_abs_diff_eq!(
            frame.get_local_pos_matrix(PI / 3.),
            Mat3::new(
                0.500, -0.866, 3.000, //
                0.866, 0.5000, 4.000, //
                0.000, 0.0000, 1.000, //
            ),
            epsilon = 0.001
        );
    }

    #[test]
    fn test_get_local_vel_matrix() {
        let frame = RotationalFrame::new("a".into()).set_position(Position([3., 4.]));
        assert_abs_diff_eq!(
            frame.get_local_vel_matrix(PI / 3.),
            Mat3::new(
                -0.866, -0.500, 0.000, //
                0.5000, -0.866, 0.000, //
                0.0000, 0.0000, 0.000, //
            ),
            epsilon = 0.001
        );
    }

    #[test]
    fn test_get_local_accel_matrix() {
        let frame = RotationalFrame::new("a".into()).set_position(Position([3., 4.]));
        assert_abs_diff_eq!(
            frame.get_local_accel_matrix(PI / 3.),
            Mat3::new(
                -0.500, 0.866, 0.000, //
                -0.866, -0.500, 0.000, //
                0.000, 0.000, 0.000, //
            ),
            epsilon = 0.001
        );
    }
}
