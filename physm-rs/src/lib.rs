#[macro_use]
extern crate approx;

use std::convert::TryInto;
use std::fmt;
use wasm_bindgen::prelude::*;

#[cfg(not(test))]
use web_sys::console;

pub use crate::frame::Frame;
pub use crate::frame::FrameBox;
pub use crate::frame::FrameId;
pub use crate::rotational_frame::RotationalFrame;
pub use crate::scene::Scene;
pub use crate::solver::Solver;
pub use crate::track_frame::TrackFrame;
pub use crate::weight::Weight;

mod frame;
mod json;
mod rotational_frame;
mod scene;
mod solver;
mod track_frame;
mod utils;
mod weight;

#[derive(Debug, PartialEq, Eq)]
pub struct Error(String);

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "{}", self.0)
    }
}

type Mat3 = nalgebra::Matrix3<f64>;
type Vec3 = nalgebra::Vector3<f64>;

#[derive(Debug, Default, PartialEq)]
pub struct Position([f64; 2]);

impl Position {
    pub fn from_json_value(value: &serde_json::Value) -> Result<Self, Error> {
        Ok(Self(
            value
                .as_array()
                .ok_or_else(|| Error(format!("Expected position array; got {}", value)))?
                .as_slice()
                .iter()
                .map(json::value_to_f64)
                .collect::<Result<Vec<f64>, _>>()?
                .as_slice()
                .try_into()
                .map_err(|_| {
                    Error(format!(
                        "Expected position array with length 2; got {}",
                        value
                    ))
                })?,
        ))
    }

    pub fn to_vec3(&self) -> Vec3 {
        Vec3::new(self.0[0], self.0[1], 1.)
    }
}

pub struct State {
    q: f64,
    qd: f64,
}

#[cfg(not(test))]
fn log(s: &str) {
    console::log_1(&s.clone().into());
}

#[cfg(test)]
fn log(s: &str) {
    println!("{}", s);
}

#[wasm_bindgen]
pub struct SolverContext {
    solver: Box<Solver>,
}

#[wasm_bindgen]
impl SolverContext {
    fn _new(scene_json: &str) -> Result<SolverContext, Box<dyn std::error::Error>> {
        let v: serde_json::Value = serde_json::from_str(scene_json)?;
        log(&format!("{:?}", v));
        let scene = Scene::new(); // TODO: deserialize.
        let solver = Box::new(Solver::new(scene));
        Ok(SolverContext { solver })
    }

    #[wasm_bindgen(catch, constructor)]
    pub fn new(scene_json: &str) -> Result<SolverContext, JsValue> {
        utils::set_panic_hook();
        log(&format!(
            "[rs] Creating solver context; scene JSON: {}",
            scene_json
        ));
        Self::_new(scene_json).map_err(|err| JsValue::from_str(&err.to_string()))
    }

    fn unflatten_states(flattened_states: &[f64]) -> Vec<State> {
        flattened_states
            .chunks(2)
            .map(|state| State {
                q: state[0],
                qd: state[1],
            })
            .collect()
    }

    pub fn tick(&self, flattened_states: &[f64], delta_time: f64) -> i32 {
        log(&format!("Ticking from Rust; delta_time={}", delta_time));
        log(&format!(
            "Number of frames: {}",
            self.solver.scene.frames.len()
        ));
        let states = Self::unflatten_states(flattened_states);
        self.solver.tick(&states, delta_time)
    }

    pub fn dispose(self) {
        log(&"[rs] Dropping solver context");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const TEST_SCENE_JSON: &str = r#"
        {
          "frames": [
            {
              "angle": 0,
              "id": "cart",
              "initialState": [0, 0],
              "position": [12.0, 34.5],
              "resistance": 5,
              "type": "TrackFrame",
              "weights": [{
                  "drag": 0,
                  "mass": 250,
                  "position": [0, 0]
              }]
            }
          ],
          "gravity": 10
        }"#;

    mod position_from_json_value {
        use super::*;

        #[test]
        fn ok() {
            let value = serde_json::from_str(&"[12.0, 34.5]").unwrap();
            assert_eq!(
                Position::from_json_value(&value).unwrap(),
                Position([12., 34.5])
            );
        }

        #[test]
        fn int_values() {
            let value = serde_json::from_str(&"[12, 34]").unwrap();
            assert_eq!(
                Position::from_json_value(&value).unwrap(),
                Position([12., 34.])
            );
        }

        #[test]
        fn bool_values() {
            let value = serde_json::from_str(&"[true, false]").unwrap();
            assert_eq!(
                Position::from_json_value(&value).unwrap_err().to_string(),
                "Expected f64 value; got true"
            );
        }

        #[test]
        fn non_array_type() {
            let value = serde_json::from_str(&"{}").unwrap();
            assert_eq!(
                Position::from_json_value(&value).unwrap_err().to_string(),
                "Expected position array; got {}"
            );
        }

        #[test]
        fn wrong_length() {
            let value = serde_json::from_str(&"[1.0, 2.0, 3.0]").unwrap();
            assert_eq!(
                Position::from_json_value(&value).unwrap_err().to_string(),
                "Expected position array with length 2; got [1.0,2.0,3.0]"
            );
        }

        #[test]
        fn null_value() {
            let value = serde_json::from_str(&"[1.0, null]").unwrap();
            assert_eq!(
                Position::from_json_value(&value).unwrap_err().to_string(),
                "Expected f64 value; got null"
            );
        }
    }

    #[test]
    fn test_solver_context_new() {
        let context = SolverContext::_new(TEST_SCENE_JSON).unwrap();
        assert_eq!(context.solver.scene.frames.len(), 0);
        //assert_eq!(1, 0);
    }
}
