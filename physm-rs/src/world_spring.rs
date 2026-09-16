use crate::json;
use crate::utils::orientation;
use crate::utils::wrap_angle;
use crate::Error;
use crate::Mat3;

/// A torsion spring between a frame and the world, slack at `rest_angle`.
///
/// Mirrors `physm-js`'s `WorldSpring`, which the differential harness holds
/// this to. `rest_angle` is a direction in the *world*, so the frame cancels
/// whatever it hangs from rather than leaning with it.
///
/// **A different device from `Spring`, not a variant of one.** A joint spring
/// acts on one coordinate; this one is anchored to the world, so it resists
/// any rotation of its frame -- including rotation inherited from above -- and
/// its torque enters the row of every rotational frame between the world and
/// it. That is `U = k (theta_world - rest)^2 / 2` differentiated honestly:
/// `d(theta_world)/dq` is one for each of them.
#[derive(Debug, PartialEq)]
pub struct WorldSpring {
    pub stiffness: f64,
    pub rest_angle: f64,
}

impl WorldSpring {
    pub fn new(stiffness: f64, rest_angle: f64) -> Self {
        Self {
            stiffness,
            rest_angle,
        }
    }

    /// The torque it applies, given where its frame has got to.
    ///
    /// Wrapped, so the spring always takes the short way round.
    pub fn get_torque(&self, pos_mat: &Mat3) -> f64 {
        self.stiffness * wrap_angle(self.rest_angle - orientation(pos_mat))
    }

    pub fn from_json_value(value: &serde_json::Value) -> Result<Self, Error> {
        let obj = json::value_to_json_obj(value)?;
        Ok(WorldSpring {
            stiffness: json::map_obj_item_or_default(obj, "stiffness", json::value_to_f64)?,
            rest_angle: json::map_obj_item_or_default(obj, "restAngle", json::value_to_f64)?,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn turned(angle: f64) -> Mat3 {
        Mat3::new(
            angle.cos(),
            -angle.sin(),
            0.,
            angle.sin(),
            angle.cos(),
            0.,
            0.,
            0.,
            1.,
        )
    }

    #[test]
    fn test_get_torque() {
        let spring = WorldSpring::new(4., 0.);

        assert_abs_diff_eq!(spring.get_torque(&Mat3::identity()), 0.);
        assert_abs_diff_eq!(spring.get_torque(&turned(0.5)), -2., epsilon = 1e-12);
        assert_abs_diff_eq!(spring.get_torque(&turned(-0.5)), 2., epsilon = 1e-12);
    }

    #[test]
    fn test_get_torque_takes_the_short_way() {
        // The rest and the frame on opposite sides of the half turn, which is
        // the only place the wrap shows: `orientation` already answers in
        // `(-pi, pi]`, so a rest of zero can never be more than a half turn
        // away and a test written there passes wrapped or not.
        let spring = WorldSpring::new(1., 3.);

        // `3 - (-3)` is 6, which is a fifth of a turn the other way.
        assert_abs_diff_eq!(
            spring.get_torque(&turned(-3.)),
            6. - 2. * std::f64::consts::PI,
            epsilon = 1e-12
        );
    }

    #[test]
    fn test_from_json_value() {
        let parse = |json: &str| {
            WorldSpring::from_json_value(&serde_json::from_str::<serde_json::Value>(json).unwrap())
                .unwrap()
        };

        assert_eq!(
            parse(r#"{"stiffness": 6.25, "restAngle": 1.5}"#),
            WorldSpring::new(6.25, 1.5)
        );

        // Absent fields default rather than failing to parse, as everywhere.
        assert_eq!(parse(r#"{}"#), WorldSpring::new(0., 0.));
    }
}
