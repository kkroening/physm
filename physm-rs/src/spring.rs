use crate::json;
use crate::Error;

/// A spring acting on its frame's own coordinate, slack at `rest`.
///
/// The restoring generalised force is `-stiffness * (q - rest)`: a torque on a
/// rotational joint, a force along the axis of a track. Conservative -- it
/// enters `U` with gravity rather than the dissipative terms.
///
/// `rest` is in the frame's *own* coordinate, so it carries no unit of its own
/// -- an angle on a revolute joint, a length along a track. A rest read
/// against some other frame is not a property of the spring; see
/// `docs/issues/0030.md`.
///
/// A list on the frame rather than a number on it, mirroring `physm-js`'s
/// `Spring`: there may be several, and while each is linear their sum is one
/// spring of the summed stiffness. That stops being true the moment one is
/// not, which is where a stop that engages past a threshold would go.
#[derive(Debug, PartialEq)]
pub struct Spring {
    pub stiffness: f64,
    pub rest: f64,
}

impl Spring {
    pub fn new(stiffness: f64) -> Self {
        Self {
            stiffness,
            rest: 0.,
        }
    }

    pub fn set_rest(mut self, rest: f64) -> Self {
        self.rest = rest;
        self
    }

    /// What this spring contributes to its frame's generalised force.
    pub fn get_force(&self, q: f64) -> f64 {
        -self.stiffness * (q - self.rest)
    }

    pub fn from_json_value(value: &serde_json::Value) -> Result<Self, Error> {
        let obj = json::value_to_json_obj(value)?;
        Ok(Spring {
            stiffness: json::map_obj_item_or_default(obj, "stiffness", json::value_to_f64)?,
            rest: json::map_obj_item_or_default(obj, "rest", json::value_to_f64)?,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_force() {
        assert_abs_diff_eq!(Spring::new(4.).get_force(0.5), -2.);
        assert_abs_diff_eq!(Spring::new(4.).get_force(-0.5), 2.);
        assert_abs_diff_eq!(Spring::new(0.).get_force(0.5), 0.);
    }

    #[test]
    fn test_get_force_with_a_rest() {
        let spring = Spring::new(4.).set_rest(0.5);

        assert_abs_diff_eq!(spring.get_force(0.5), 0.);
        assert_abs_diff_eq!(spring.get_force(1.), -2.);
        assert_abs_diff_eq!(spring.get_force(0.), 2.);
    }

    #[test]
    fn test_from_json_value() {
        let parse = |json: &str| {
            Spring::from_json_value(&serde_json::from_str::<serde_json::Value>(json).unwrap())
                .unwrap()
        };

        assert_eq!(
            parse(r#"{"stiffness": 6.25, "rest": 1.5}"#),
            Spring::new(6.25).set_rest(1.5)
        );

        // A spring that states nothing is slack at zero, rather than failing
        // to parse -- as is one that states only a stiffness.
        assert_eq!(parse(r#"{}"#), Spring::new(0.));
        assert_eq!(parse(r#"{"stiffness": 6.25}"#), Spring::new(6.25));
    }
}
