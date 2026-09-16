use crate::Mat3;

/// Which way a transform points, in radians: `atan2(m10, m00)`.
///
/// The rotation as trigonometry means it. `physm-js` carries a
/// `Mat3.rotationAngle` that is a half turn away from this and is kept that
/// way because the drawing is calibrated against it -- so the JavaScript side
/// has both, and this is the one a spring agrees with.
pub fn orientation(mat: &Mat3) -> f64 {
    mat[(1, 0)].atan2(mat[(0, 0)])
}

/// An angle folded into `(-pi, pi]`, so a difference takes the short way round.
pub fn wrap_angle(angle: f64) -> f64 {
    let turned = (angle + std::f64::consts::PI).rem_euclid(2. * std::f64::consts::PI);

    turned - std::f64::consts::PI
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
