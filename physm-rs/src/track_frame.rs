use ndarray::prelude::*;

use crate::Frame;
use crate::Position;
use crate::SceneError;
use crate::Weight;

#[derive(Debug)]
pub struct TrackFrame {
    pub angle: f64,
    pub children: Vec<Box<dyn Frame>>,
    pub position: Position,
    pub resistance: f64,
    pub weights: Vec<Weight>,
}

impl TrackFrame {
    pub fn new() -> TrackFrame {
        TrackFrame {
            angle: 0.,
            children: Vec::new(),
            position: Position([0., 0.]),
            resistance: 0.,
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

    pub fn add_child(mut self, child: Box<dyn Frame>) -> Self {
        self.children.push(child);
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

    pub fn from_json_value(value: serde_json::Value) -> Result<Self, SceneError> {
        let obj = match value {
            serde_json::Value::Object(obj) => Ok(obj),
            _ => Err(SceneError(format!("Expected JSON object; got {}", value))),
        }?;
        Ok(TrackFrame {
            angle: 0.,
            children: Vec::new(),
            position: Position([0., 0.]),
            resistance: 0.,
            weights: Vec::new(),
        })
    }
}

impl Frame for TrackFrame {
    fn get_children(&self) -> &Vec<Box<dyn Frame>> {
        &self.children
    }

    fn get_weights(&self) -> &Vec<Weight> {
        &self.weights
    }

    fn get_local_pos_matrix(&self, q: f64) -> Array2<f64> {
        arr2(&[
            [1., 0., self.position.0[0] + q * self.angle.cos()],
            [0., 1., self.position.0[1] + q * self.angle.sin()],
            [0., 0., 1.],
        ])
    }

    fn get_local_vel_matrix(&self, _q: f64) -> Array2<f64> {
        arr2(&[
            [0., 0., self.angle.cos()],
            [0., 0., self.angle.sin()],
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
        let frame = TrackFrame::new();
        assert_eq!(frame.position, Position([0., 0.]));
        assert_eq!(frame.angle, 0.);
        assert_eq!(frame.children.len(), 0);
        let frame = frame
            .add_child(Box::new(
                TrackFrame::new().add_child(Box::new(TrackFrame::new())),
            ))
            .add_child(Box::new(TrackFrame::new()));
        assert_eq!(frame.position, Position([0., 0.]));
        assert_eq!(frame.angle, 0.);
        assert_eq!(frame.children.len(), 2);
        assert_eq!(frame.children[0].get_children().len(), 1);
        assert_eq!(frame.children[1].get_children().len(), 0);
        assert_eq!(frame.weights.len(), 0);

        let frame = frame.set_position(Position([2., 3.]));
        assert_eq!(frame.position, Position([2., 3.]));
        assert_eq!(frame.angle, 0.);
        assert_eq!(frame.children.len(), 2);
        assert_eq!(frame.weights.len(), 0);

        let frame = frame.add_weight(Weight::new(12.));
        assert_eq!(frame.position, Position([2., 3.]));
        assert_eq!(frame.angle, 0.);
        assert_eq!(frame.children.len(), 2);
        assert_eq!(frame.weights.len(), 1);

        let frame = frame.set_angle(PI);
        assert_eq!(frame.position, Position([2., 3.]));
        assert_eq!(frame.angle, PI);
        assert_eq!(frame.children.len(), 2);
        assert_eq!(frame.weights.len(), 1);
    }

    #[test]
    fn test_from_json_value() {
        let json = r#"
            {
                "angle": 3.5,
                "position": [56, 78.9],
                "frames": [],
                "weights": []
            }"#;
        let json_value: serde_json::Value = serde_json::from_str(&json).unwrap();
        let frame = TrackFrame::from_json_value(json_value).unwrap();
        //assert_eq!(frame.angle, 3.5);
        //assert_eq!(frame.position, Position([56., 78.9]));
        assert_eq!(
            format!("{:?}", frame.children),
            format!("{:?}", Vec::<Box<dyn Frame>>::new())
        );
        assert_eq!(frame.weights, Vec::<Weight>::new());
    }

    #[test]
    fn test_get_local_pos_matrix() {
        let frame = TrackFrame::new();
        assert_abs_diff_eq!(frame.get_local_pos_matrix(0.), Array2::eye(3));
        let frame = frame.set_position(Position([3., 4.]));
        assert_abs_diff_eq!(
            frame.get_local_pos_matrix(7.),
            arr2(&[
                [1.000, 0.000, 10.00],
                [0.000, 1.000, 4.000],
                [0.000, 0.000, 1.000],
            ]),
            epsilon = 0.001
        );
        let frame = frame.set_angle(PI / 3.);
        assert_abs_diff_eq!(
            frame.get_local_pos_matrix(7.),
            arr2(&[
                [1.000, 0.000, 6.500],
                [0.000, 1.000, 10.06],
                [0.000, 0.000, 1.000],
            ]),
            epsilon = 0.01
        );
    }

    #[test]
    fn test_get_local_vel_matrix() {
        let frame = TrackFrame::new().set_position(Position([3., 4.]));
        assert_abs_diff_eq!(
            frame.get_local_vel_matrix(7.),
            arr2(&[
                [0.000, 0.000, 1.000],
                [0.000, 0.000, 0.000],
                [0.000, 0.000, 0.000],
            ]),
            epsilon = 0.001
        );
        let frame = frame.set_angle(PI / 3.);
        assert_abs_diff_eq!(
            frame.get_local_vel_matrix(7.),
            arr2(&[
                [0.000, 0.000, 0.500],
                [0.000, 0.000, 0.866],
                [0.000, 0.000, 0.000],
            ]),
            epsilon = 0.001
        );
    }

    #[test]
    fn test_get_local_accel_matrix() {
        let frame = TrackFrame::new().set_position(Position([3., 4.])).set_angle(PI / 3.);
        assert_abs_diff_eq!(frame.get_local_accel_matrix(PI / 3.), Array::zeros((3, 3)));
    }
}
