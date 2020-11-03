use std::fmt::Debug;

use crate::Mat3;
use crate::Weight;

pub type FrameId = String;

pub trait Frame: Debug {
    fn get_children(&self) -> &Vec<Box<dyn Frame>>;

    fn get_id(&self) -> &FrameId;

    fn get_resistance(&self) -> f64;

    fn get_weights(&self) -> &Vec<Weight>;

    fn get_local_pos_matrix(&self, _q: f64) -> Mat3 {
        Mat3::identity()
    }

    fn get_local_vel_matrix(&self, _q: f64) -> Mat3 {
        Mat3::zeros()
    }

    fn get_local_accel_matrix(&self, _q: f64) -> Mat3 {
        Mat3::zeros()
    }
}

pub type FrameBox = Box<dyn Frame>;
