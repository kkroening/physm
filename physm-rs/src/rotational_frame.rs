use crate::json;
use crate::utils::orientation;
use crate::utils::wrap_angle;
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

    /// The direction in the *world* this frame's spring is slack toward, or
    /// `None` for a spring slack at its own zero.
    ///
    /// What "keep the crane arm horizontal" needs and a local spring cannot
    /// say: horizontal is a world direction, so the rest orientation depends
    /// on everything the arm hangs from. Compared against the frame's
    /// accumulated pose each tick, which is why it is a constant rather than
    /// anything evaluated -- a value handed across a solver batch would be a
    /// tick behind in exactly the case it exists for.
    pub rest_angle: Option<f64>,

    pub stiffness: f64,
    pub weights: Vec<Weight>,
}

impl RotationalFrame {
    pub fn new(id: FrameId) -> Self {
        Self {
            children: Vec::new(),
            id: id,
            position: Position([0.0, 0.0]),
            resistance: 0.,
            rest_angle: None,
            stiffness: 0.,
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

    pub fn set_rest_angle(mut self, rest_angle: f64) -> Self {
        self.rest_angle = Some(rest_angle);
        self
    }

    pub fn set_stiffness(mut self, stiffness: f64) -> Self {
        self.stiffness = stiffness;
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
            rest_angle: json::map_obj_item_optional(obj, "restAngle", json::value_to_f64)?,
            stiffness: json::map_obj_item_or_default(obj, "stiffness", json::value_to_f64)?,
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

    fn get_stiffness(&self) -> f64 {
        self.stiffness
    }

    fn get_weights(&self) -> &[Weight] {
        &self.weights
    }

    fn is_joint(&self) -> bool {
        true
    }

    /// `stiffness` times the turn from where this frame points to where it
    /// should, or the base's local spring when there is no world rest.
    ///
    /// The difference is wrapped, so the spring always takes the short way
    /// round: without that, a frame a hair past a half turn from its rest is
    /// driven the long way, which looks like the rig snapping rather than
    /// settling.
    fn get_spring_force(&self, q: f64, pos_mat: &Mat3) -> f64 {
        match self.rest_angle {
            None => -q * self.stiffness,
            Some(rest) => self.stiffness * wrap_angle(rest - orientation(pos_mat)),
        }
    }

    fn get_local_pos_matrix(&self, q: f64) -> Mat3 {
        // TODO: use nalgebra's isometry.
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
            "RotationalFrame { children: [], id: \"b\", position: Position([1.5, 2.6]), resistance: 0.0, rest_angle: None, stiffness: 0.0, weights: [] }",
        );
        assert_eq!(
            format!("{:?}", frame.children[1]),
            "RotationalFrame { children: [], id: \"c\", position: Position([5.0, 28.0]), resistance: 0.0, rest_angle: None, stiffness: 0.0, weights: [] }",
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
              "stiffness": 6.25,
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
        assert_eq!(frame.stiffness, 6.25);
        // The nested frame states no `stiffness`, which is how a document
        // written before springs existed arrives: it defaults rather than
        // failing to parse.
        assert_eq!(frame.children[0].get_stiffness(), 0.);
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
    fn test_from_json_value_rest_angle() {
        // The JavaScript side writes the key with a `null` rather than leaving
        // it out, so both shapes have to mean "no world rest" -- and a
        // document written before this existed has neither.
        let parse = |json: &str| {
            RotationalFrame::from_json_value(&serde_json::from_str(json).unwrap()).unwrap()
        };
        let base = r#"{"id": "a", "type": "RotationalFrame""#;

        assert_eq!(parse(&format!("{}}}", base)).rest_angle, None);
        assert_eq!(
            parse(&format!("{}, \"restAngle\": null}}", base)).rest_angle,
            None
        );
        assert_eq!(
            parse(&format!("{}, \"restAngle\": 1.25}}", base)).rest_angle,
            Some(1.25)
        );
    }

    #[test]
    fn test_get_spring_force() {
        // Slack at its own zero without a rest angle: the pose is ignored, so
        // a frame turned by its parent still reads its coordinate.
        let local = RotationalFrame::new("a".into()).set_stiffness(4.);
        let turned = Mat3::new(0., -1., 0., 1., 0., 0., 0., 0., 1.);
        assert_abs_diff_eq!(local.get_spring_force(0.5, &Mat3::identity()), -2.);
        assert_abs_diff_eq!(local.get_spring_force(0.5, &turned), -2.);

        // With one, the coordinate stops mattering and the pose decides: the
        // frame above is a quarter turn from horizontal whatever `q` says.
        let world = local.set_rest_angle(0.);
        assert_abs_diff_eq!(world.get_spring_force(0.5, &Mat3::identity()), 0.);
        assert_abs_diff_eq!(
            world.get_spring_force(0.5, &turned),
            -4. * std::f64::consts::FRAC_PI_2
        );
    }

    #[test]
    fn test_get_spring_force_takes_the_short_way() {
        // The rest and the frame on opposite sides of the half turn, which is
        // the only place the wrap can show: `orientation` already answers in
        // `(-pi, pi]`, so a rest of zero can never be more than a half turn
        // away and a test written there passes whether the difference is
        // wrapped or not.
        let frame = RotationalFrame::new("a".into())
            .set_stiffness(1.)
            .set_rest_angle(3.);
        let at = -3_f64;
        let pose = Mat3::new(at.cos(), -at.sin(), 0., at.sin(), at.cos(), 0., 0., 0., 1.);

        // `3 - (-3)` is 6, which is a fifth of a turn the other way.
        assert_abs_diff_eq!(
            frame.get_spring_force(0., &pose),
            6. - 2. * std::f64::consts::PI,
            epsilon = 1e-12
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
