use crate::Mat3;

/// Which way a transform points, in radians: `atan2(m10, m00)`.
///
/// The rotation as trigonometry means it. `physm-js` carries a
/// `Mat3.rotationAngle` that is a half turn away and is kept that way because
/// the drawing is calibrated against it, so that side has both; this is the
/// one a spring agrees with.
pub fn orientation(mat: &Mat3) -> f64 {
    mat[(1, 0)].atan2(mat[(0, 0)])
}

/// An angle folded into `(-pi, pi]`, so a difference takes the short way round.
///
/// **Closed at `+pi` and open at `-pi`**, matching `Mat3.wrapAngle` exactly.
/// `rem_euclid` alone gives `[0, 2*pi)` and so folds to `[-pi, pi)`, which
/// returns the opposite maximal torque at exactly a half turn from rest -- for
/// a rest a person can write, at the default initial state. The two solvers
/// would then swing a frame in opposite directions from the first step.
pub fn wrap_angle(angle: f64) -> f64 {
    let turned = (angle + std::f64::consts::PI).rem_euclid(2. * std::f64::consts::PI);

    (if turned == 0. {
        2. * std::f64::consts::PI
    } else {
        turned
    }) - std::f64::consts::PI
}

pub fn set_panic_hook() {
    // When the `console_error_panic_hook` feature is enabled, we can call the
    // `set_panic_hook` function at least once during initialization, and then
    // we will get better error messages if our code ever panics.
    //
    // For more details see
    // https://github.com/rustwasm/console_error_panic_hook#readme
    #[cfg(feature = "console_error_panic_hook")]
    console_error_panic_hook::set_once();
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Mirrors `Mat3.test.ts`'s `wrapAngle` and `orientation` blocks, case for
    /// case. Written twice in two languages is the situation the differential
    /// harness handles well -- and a pure helper sits underneath that harness,
    /// where only a mirrored test reaches it.
    #[test]
    fn test_wrap_angle() {
        assert_abs_diff_eq!(wrap_angle(0.), 0.);
        assert_abs_diff_eq!(wrap_angle(1.), 1.);
        assert_abs_diff_eq!(wrap_angle(-1.), -1.);
        assert_abs_diff_eq!(
            wrap_angle(2. * std::f64::consts::PI + 0.4),
            0.4,
            epsilon = 1e-12
        );
        assert_abs_diff_eq!(
            wrap_angle(-2. * std::f64::consts::PI - 0.4),
            -0.4,
            epsilon = 1e-12
        );

        // The cases that discriminate the interval: `(-pi, pi]`, so both of
        // these are `+pi`, as `Mat3.wrapAngle` returns.
        assert_abs_diff_eq!(wrap_angle(std::f64::consts::PI), std::f64::consts::PI);
        assert_abs_diff_eq!(wrap_angle(-std::f64::consts::PI), std::f64::consts::PI);
        assert_abs_diff_eq!(wrap_angle(3. * std::f64::consts::PI), std::f64::consts::PI);

        // Just past a half turn is a small turn the other way.
        assert_abs_diff_eq!(
            wrap_angle(std::f64::consts::PI + 0.1),
            -std::f64::consts::PI + 0.1,
            epsilon = 1e-12
        );
    }

    #[test]
    fn test_orientation() {
        for angle in [0., 0.3, -1.2, std::f64::consts::FRAC_PI_2, 3., -3.] {
            let mat = Mat3::new(
                angle.cos(),
                -angle.sin(),
                0.,
                angle.sin(),
                angle.cos(),
                0.,
                0.,
                0.,
                1.,
            );
            assert_abs_diff_eq!(orientation(&mat), angle, epsilon = 1e-12);
        }
    }
}
