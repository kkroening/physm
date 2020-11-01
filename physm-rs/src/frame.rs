use ndarray::Array2;
use std::fmt::Debug;

use crate::SceneError;
use crate::Weight;

pub trait Frame: Debug {
    fn get_children(&self) -> &Vec<Box<dyn Frame>>;

    fn get_weights(&self) -> &Vec<Weight>;

    fn get_local_pos_matrix(&self, _q: f64) -> Array2<f64> {
        Array2::eye(3)
    }

    fn get_local_vel_matrix(&self, _q: f64) -> Array2<f64> {
        Array2::zeros((3, 3))
    }

    fn get_local_accel_matrix(&self, _q: f64) -> Array2<f64> {
        Array2::zeros((3, 3))
    }
}
