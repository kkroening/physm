use std::fmt::Debug;

use crate::Mat3;
use crate::Weight;

pub type FrameId = String;

pub trait Frame: Debug {
    fn get_children(&self) -> &[FrameBox];

    fn get_id(&self) -> &FrameId;

    fn get_resistance(&self) -> f64;

    /// A spring on the frame's own coordinate, slack at zero: the restoring
    /// force is `-stiffness * q`. Local -- it reads `q` and nothing else.
    fn get_stiffness(&self) -> f64;

    fn get_weights(&self) -> &[Weight];

    fn get_local_pos_matrix(&self, _q: f64) -> Mat3 {
        Mat3::identity()
    }

    fn get_local_vel_matrix(&self, _q: f64) -> Mat3 {
        Mat3::zeros()
    }

    fn get_local_accel_matrix(&self, _q: f64) -> Mat3 {
        Mat3::zeros()
    }

    /// Whether the frame's coordinate moves it: true for a joint, false for a
    /// frame whose transform is the same whatever `q` is. Nothing gives such a
    /// coordinate any inertia, so `get_coefficient_matrix` gives it some of its
    /// own. Required, not defaulted: a joint that forgot to say so would have
    /// its inertia replaced.
    fn is_joint(&self) -> bool;

    /// What this frame's spring contributes to its own generalised force.
    ///
    /// A method rather than a term the solver writes out, because what a
    /// spring is slack *toward* is the frame's own business: the default
    /// answers about the coordinate, and `RotationalFrame` may answer about a
    /// direction in the world. `pos_mat` is this frame's local-to-world
    /// transform, out of the walk the solver already makes.
    ///
    /// Mirrors `Frame.springForce` in `physm-js`, which the differential
    /// harness holds this to.
    fn get_spring_force(&self, q: f64, _pos_mat: &Mat3) -> f64 {
        -q * self.get_stiffness()
    }
}

pub type FrameBox = Box<dyn Frame>;
