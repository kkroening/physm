use std::fmt::Debug;

use crate::Mat3;
use crate::Weight;

pub type FrameId = String;

pub trait Frame: Debug {
    fn get_children(&self) -> &[FrameBox];

    fn get_id(&self) -> &FrameId;

    fn get_resistance(&self) -> f64;

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
}

pub type FrameBox = Box<dyn Frame>;
