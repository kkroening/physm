use std::fmt::Debug;

use crate::Mat3;
use crate::Spring;
use crate::Weight;

pub type FrameId = String;

pub trait Frame: Debug {
    fn get_children(&self) -> &[FrameBox];

    fn get_id(&self) -> &FrameId;

    fn get_resistance(&self) -> f64;

    /// Springs on the frame's own coordinate -- see `Spring`. A list rather
    /// than a number, because a spring is a thing a person adds rather than a
    /// property the frame has.
    fn get_springs(&self) -> &[Spring];

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

    /// What this frame's springs contribute to its generalised force, together.
    ///
    /// They add, which is what makes several of them meaningful. Asked of the
    /// frame so the solver adds a term without knowing what is in it, and
    /// mirrors `Frame.springForce` in `physm-js`.
    fn get_spring_force(&self, q: f64) -> f64 {
        self.get_springs()
            .iter()
            .map(|spring| spring.get_force(q))
            .sum()
    }
}

pub type FrameBox = Box<dyn Frame>;
