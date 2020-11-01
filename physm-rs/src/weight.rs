use std::convert::TryInto;
use std::error::Error;

use crate::Position;
use crate::SceneError;

#[derive(Debug, PartialEq)]
pub struct Weight {
    pub mass: f64,
    pub position: Position,
    pub drag: f64,
}

impl Weight {
    pub fn new(mass: f64) -> Self {
        Self {
            mass,
            position: Position([0., 0.]),
            drag: 0.,
        }
    }

    pub fn set_mass(mut self, mass: f64) -> Self {
        self.mass = mass;
        self
    }

    pub fn set_position(mut self, position: Position) -> Self {
        self.position = position;
        self
    }

    pub fn set_drag(mut self, drag: f64) -> Self {
        self.drag = drag;
        self
    }

    pub fn from_json_value(value: &serde_json::Value) -> Result<Self, SceneError> {
        let obj = match value {
            serde_json::Value::Object(obj) => Ok(obj),
            _ => Err(SceneError(format!("Expected JSON object; got {}", value))),
        }?;
        Ok(Weight {
            mass: obj["mass"].as_f64().unwrap_or(1.),
            position: Position::from_json_value(&obj["position"])?,
            drag: obj["drag"].as_f64().unwrap_or(0.),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_new() {
        let weight = Weight::new(7.);
        assert_eq!(weight.mass, 7.);
        assert_eq!(weight.position, Position([0., 0.]));

        let weight = weight.set_position(Position([3., 4.]));
        assert_eq!(weight.mass, 7.);
        assert_eq!(weight.position, Position([3., 4.]));
    }

    #[test]
    fn test_from_json_value() {
        let json = r#"
            {
                "mass": 34,
                "position": [56, 78.9],
                "drag": 12
            }"#;
        let json_value: serde_json::Value = serde_json::from_str(&json).unwrap();
        let weight = Weight::from_json_value(&json_value).unwrap();
        assert_eq!(weight.mass, 34.);
        assert_eq!(weight.position, Position([56., 78.9]));
        assert_eq!(weight.drag, 12.);
    }

    #[test]
    fn test_from_json_value_bogus_array() {
        let json = r#"
            [{
                "mass": 34,
                "position": [56, 78.9],
                "drag": 12
            }]"#;
        let json_value: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(
            Weight::from_json_value(&json_value)
                .err()
                .unwrap()
                .to_string(),
            r#"Expected JSON object; got [{"drag":12,"mass":34,"position":[56,78.9]}]"#
        );
    }
}
