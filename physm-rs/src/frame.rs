use std::fmt::Debug;

use crate::Mat3;
use crate::Spring;
use crate::Weight;
use crate::WorldSpring;

pub type FrameId = String;

pub trait Frame: Debug {
    fn get_children(&self) -> &[FrameBox];

    fn get_id(&self) -> &FrameId;

    fn get_resistance(&self) -> f64;

    /// Springs on the frame's own coordinate -- see `Spring`. A list rather
    /// than a number, because a spring is a thing a person adds rather than a
    /// property the frame has.
    fn get_springs(&self) -> &[Spring];

    /// Springs between this frame and the world -- see `WorldSpring`. Kept
    /// apart from `get_springs` because their generalised forces land in
    /// different rows.
    fn get_world_springs(&self) -> &[WorldSpring] {
        &[]
    }

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

    /// The torque this frame's world-anchored springs apply, at a given pose.
    ///
    /// Not this frame's row alone: a spring anchored to the world resists
    /// rotation from wherever it comes, so the solver sums this over a subtree
    /// rather than reading it per row.
    fn get_world_spring_torque(&self, pos_mat: &Mat3) -> f64 {
        self.get_world_springs()
            .iter()
            .map(|spring| spring.get_torque(pos_mat))
            .sum()
    }

    /// How much a unit of this frame's coordinate turns everything below it.
    ///
    /// `d(theta_world)/dq` for the subtree: one for a revolute joint, zero for
    /// a coordinate that slides or moves nothing.
    fn get_turn_rate(&self) -> f64 {
        0.
    }
}

pub type FrameBox = Box<dyn Frame>;
