use std::error::Error;

use crate::Position;
use crate::SceneError;

#[derive(Debug)]
pub struct Weight {
    pub mass: f64,
    pub position: Position,
    pub drag: f64,
}

impl Weight {
    pub fn new(mass: f64) -> Self {
        Self {
            mass,
            position: [0., 0.],
            drag: 0.,
        }
    }

    pub fn set_position(mut self, position: [f64; 2]) -> Self {
        self.position = position;
        self
    }

    pub fn set_drag(mut self, drag: f64) -> Self {
        self.drag = drag;
        self
    }

    pub fn from_json_value(value: serde_json::Value) -> Result<Self, SceneError> {
        match value {
            serde_json::Value::Object(obj) => Ok(Self::new(0.).set_position([0., 0.]).set_drag(0.)),
            _ => Err(SceneError(format!("Expected JSON object; got {}", value))),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_new() {
        let weight = Weight::new(7.);
        assert_eq!(weight.mass, 7.);
        assert_eq!(weight.position, [0., 0.]);

        let weight = weight.set_position([3., 4.]);
        assert_eq!(weight.mass, 7.);
        assert_eq!(weight.position, [3., 4.]);
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
        let weight = Weight::from_json_value(json_value).unwrap();
        //assert_eq!(weight.mass, 34.);
        //assert_eq!(weight.position, [56., 78.0]);
        //assert_eq!(weight.drag, 12.);
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
            Weight::from_json_value(json_value)
                .err()
                .unwrap()
                .to_string(),
            r#"Expected JSON object; got [{"drag":12,"mass":34,"position":[56,78.9]}]"#
        );
    }
}
