use ndarray::prelude::*;

use crate::json;
use crate::Error;
use crate::Frame;
use crate::Position;
use crate::Weight;

#[derive(Debug)]
pub struct RotationalFrame {
    pub children: Vec<Box<dyn Frame>>,
    pub position: Position,
    pub resistance: f64,
    pub weights: Vec<Weight>,
}

impl RotationalFrame {
    pub fn new() -> Self {
        Self {
            children: Vec::new(),
            position: Position([0.0, 0.0]),
            resistance: 0.,
            weights: Vec::new(),
        }
    }

    pub fn add_child(mut self, child: Box<dyn Frame>) -> Self {
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
            children: json::map_obj_item(obj, "frames", json::value_to_boxed_frames)?,
            position: json::map_obj_item(obj, "position", Position::from_json_value)?,
            resistance: json::map_obj_item(obj, "resistance", json::value_to_f64)?,
            weights: json::map_obj_item(obj, "weights", json::value_to_weights)?,
        })
    }
}

impl Frame for RotationalFrame {
    fn get_children(&self) -> &Vec<Box<dyn Frame>> {
        &self.children
    }

    fn get_resistance(&self) -> f64 {
        self.resistance
    }

    fn get_weights(&self) -> &Vec<Weight> {
        &self.weights
    }

    fn get_local_pos_matrix(&self, q: f64) -> Array2<f64> {
        arr2(&[
            [q.cos(), -q.sin(), self.position.0[0]],
            [q.sin(), q.cos(), self.position.0[1]],
            [0., 0., 1.],
        ])
    }

    fn get_local_vel_matrix(&self, q: f64) -> Array2<f64> {
        arr2(&[
            [-q.sin(), -q.cos(), 0.],
            [q.cos(), -q.sin(), 0.],
            [0., 0., 0.],
        ])
    }

    fn get_local_accel_matrix(&self, q: f64) -> Array2<f64> {
        arr2(&[
            [-q.cos(), q.sin(), 0.],
            [-q.sin(), -q.cos(), 0.],
            [0., 0., 0.],
        ])
    }
}

#[cfg(test)]
mod tests {
    use approx::assert_abs_diff_eq;
    use std::f64::consts::PI;

    use super::*;

    #[test]
    fn test_new() {
        let f = RotationalFrame::new()
            .add_child(Box::new(
                RotationalFrame::new().set_position(Position([1.5, 2.6])),
            ))
            .add_child(Box::new(
                RotationalFrame::new().set_position(Position([5., 28.])),
            ))
            .add_weight(Weight::new(12.));
        println!("{:#?}", f);
        //assert_eq!(0, 1);
    }

    #[test]
    fn test_from_json_value() {
        let json = r#"
            {
              "angle": 3.5,
              "frames": [
                {
                  "frames": [],
                  "position": [
                    0.2,
                    0.3
                  ],
                  "type": "RotationalFrame",
                  "weights": []
                }
              ],
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
        assert_eq!(frame.position, Position([56., 78.9]));
        assert_eq!(
            format!("{:?}", frame.children),
            format!(
                "{:?}",
                vec![Box::new(
                    RotationalFrame::new().set_position(Position([0.2, 0.3]))
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
        let frame = RotationalFrame::new();
        assert_abs_diff_eq!(frame.get_local_pos_matrix(0.), Array2::eye(3));
        let frame = frame.set_position(Position([3., 4.]));
        assert_abs_diff_eq!(
            frame.get_local_pos_matrix(PI / 3.),
            arr2(&[
                [0.500, -0.866, 3.000],
                [0.866, 0.500, 4.000],
                [0.000, 0.000, 1.000],
            ]),
            epsilon = 0.001
        );
    }

    #[test]
    fn test_get_local_vel_matrix() {
        let frame = RotationalFrame::new().set_position(Position([3., 4.]));
        assert_abs_diff_eq!(
            frame.get_local_vel_matrix(PI / 3.),
            arr2(&[
                [-0.866, -0.500, 0.000],
                [0.500, -0.866, 0.000],
                [0.000, 0.000, 0.000],
            ]),
            epsilon = 0.001
        );
    }

    #[test]
    fn test_get_local_accel_matrix() {
        let frame = RotationalFrame::new().set_position(Position([3., 4.]));
        assert_abs_diff_eq!(
            frame.get_local_accel_matrix(PI / 3.),
            arr2(&[
                [-0.500, 0.866, 0.000],
                [-0.866, -0.500, 0.000],
                [0.000, 0.000, 0.000],
            ]),
            epsilon = 0.001
        );
    }
}
