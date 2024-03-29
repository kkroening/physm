use crate::json;
use crate::Error;
use crate::Frame;
use crate::FrameBox;
use crate::FrameId;
use crate::Mat3;
use crate::Position;
use crate::Weight;

#[derive(Debug)]
pub struct TrackFrame {
    pub angle: f64,
    pub children: Vec<FrameBox>,
    pub id: FrameId,
    pub position: Position,
    pub resistance: f64,
    pub weights: Vec<Weight>,
}

impl TrackFrame {
    pub fn new(id: FrameId) -> TrackFrame {
        TrackFrame {
            angle: 0.,
            children: Vec::new(),
            id: id,
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

    pub fn add_child(mut self, child: FrameBox) -> Self {
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

    pub fn from_json_value(value: &serde_json::Value) -> Result<Self, Error> {
        let obj = json::value_to_json_obj(value)?;
        Ok(TrackFrame {
            angle: json::map_obj_item_or_default(obj, "angle", json::value_to_f64)?,
            children: json::map_obj_item_or_default(obj, "frames", json::value_to_frames)?,
            id: json::map_value_item(value, &"id", json::value_to_str)?.into(),
            position: json::map_obj_item_or_default(obj, "position", Position::from_json_value)?,
            resistance: json::map_obj_item_or_default(obj, "resistance", json::value_to_f64)?,
            weights: json::map_obj_item_or_default(obj, "weights", json::value_to_weights)?,
        })
    }
}

impl Frame for TrackFrame {
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
            1.,
            0.,
            self.position.0[0] + q * self.angle.cos(),
            0.,
            1.,
            self.position.0[1] + q * self.angle.sin(),
            0.,
            0.,
            1.,
        )
    }

    fn get_local_vel_matrix(&self, _q: f64) -> Mat3 {
        Mat3::new(
            0.,
            0.,
            self.angle.cos(),
            0.,
            0.,
            self.angle.sin(),
            0.,
            0.,
            0.,
        )
    }
}

#[cfg(test)]
mod tests {
    use std::f64::consts::PI;

    use super::*;

    #[test]
    fn test_new() {
        let frame = TrackFrame::new("a".to_owned());
        assert_eq!(frame.id, "a");
        assert_eq!(frame.position, Position([0., 0.]));
        assert_eq!(frame.angle, 0.);
        assert_eq!(frame.children.len(), 0);
        let frame = frame
            .add_child(Box::new(
                TrackFrame::new("b".to_owned())
                    .add_child(Box::new(TrackFrame::new("c".to_owned()))),
            ))
            .add_child(Box::new(TrackFrame::new("d".to_owned())));
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
              "frames": [
                {
                  "angle": 0.1,
                  "frames": [],
                  "id": "b",
                  "position": [
                    0.2,
                    0.3
                  ],
                  "type": "TrackFrame",
                  "weights": []
                }
              ],
              "id": "a",
              "position": [
                56,
                78.9
              ],
              "type": "TrackFrame",
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
        let frame = TrackFrame::from_json_value(&json_value).unwrap();
        assert_eq!(frame.angle, 3.5);
        assert_eq!(frame.id, "a");
        assert_eq!(frame.position, Position([56., 78.9]));
        assert_eq!(
            format!("{:?}", frame.children),
            format!(
                "{:?}",
                vec![Box::new(
                    TrackFrame::new("b".to_owned())
                        .set_angle(0.1)
                        .set_position(Position([0.2, 0.3]))
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
        let frame = TrackFrame::new("a".to_owned());
        let frame = frame.set_position(Position([3., 4.]));
        assert_abs_diff_eq!(
            frame.get_local_pos_matrix(7.),
            Mat3::new(
                1.000, 0.000, 10.00, //
                0.000, 1.000, 4.000, //
                0.000, 0.000, 1.000, //
            ),
            epsilon = 0.001
        );
        let frame = frame.set_angle(PI / 3.);
        assert_abs_diff_eq!(
            frame.get_local_pos_matrix(7.),
            Mat3::new(
                1.000, 0.000, 6.500, //
                0.000, 1.000, 10.06, //
                0.000, 0.000, 1.000, //
            ),
            epsilon = 0.01
        );
    }

    #[test]
    fn test_get_local_vel_matrix() {
        let frame = TrackFrame::new("a".to_owned()).set_position(Position([3., 4.]));
        assert_abs_diff_eq!(
            frame.get_local_vel_matrix(7.),
            Mat3::new(
                0.000, 0.000, 1.000, //
                0.000, 0.000, 0.000, //
                0.000, 0.000, 0.000, //
            ),
            epsilon = 0.001
        );
        let frame = frame.set_angle(PI / 3.);
        assert_abs_diff_eq!(
            frame.get_local_vel_matrix(7.),
            Mat3::new(
                0.000, 0.000, 0.500, //
                0.000, 0.000, 0.866, //
                0.000, 0.000, 0.000, //
            ),
            epsilon = 0.001
        );
    }

    #[test]
    fn test_get_local_accel_matrix() {
        let frame = TrackFrame::new("a".to_owned())
            .set_position(Position([3., 4.]))
            .set_angle(PI / 3.);
        assert_abs_diff_eq!(frame.get_local_accel_matrix(PI / 3.), Mat3::zeros());
    }
}
