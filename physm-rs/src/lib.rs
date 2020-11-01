use std::convert::TryInto;
use std::error::Error;
use std::fmt;
use wasm_bindgen::prelude::*;
use web_sys::console;

pub use crate::frame::Frame;
pub use crate::rotational_frame::RotationalFrame;
pub use crate::scene::Scene;
pub use crate::solver::Solver;
pub use crate::track_frame::TrackFrame;
pub use crate::weight::Weight;

mod frame;
mod rotational_frame;
mod scene;
mod solver;
mod track_frame;
mod utils;
mod weight;

#[derive(Debug)]
pub struct SceneError(String);

impl fmt::Display for SceneError {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "{}", self.0)
    }
}

#[derive(Debug, PartialEq)]
pub struct Position([f64; 2]);

impl Position {
    pub fn from_json_value(value: &serde_json::Value) -> Result<Self, SceneError> {
        Ok(Self(
            match value
                .as_array()
                .ok_or_else(|| SceneError(format!("Expected position array; got {}", value)))?
                .as_slice()
            {
                [x, y] => Ok([x, y]),
                _ => Err(SceneError(format!(
                    "Expected position array with length 2; got {}",
                    value
                ))),
            }?
            .iter()
            .map(|val| val.as_f64())
            .collect::<Option<Vec<f64>>>()
            .ok_or_else(|| {
                SceneError(format!(
                    "Expected position array to contain f64 values; got {}",
                    value
                ))
            })?
            .as_slice()
            .try_into()
            .unwrap(),
        ))
    }
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
    solver: Solver,
}

#[wasm_bindgen]
impl SolverContext {
    fn _new(scene_json: &str) -> Result<SolverContext, Box<dyn Error>> {
        let v: serde_json::Value = serde_json::from_str(scene_json)?;
        log(&format!("{:?}", v));
        let scene = Scene::new(); // TODO: deserialize.
        let solver = Solver::new(scene);
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

    pub fn tick(&self, delta_time: f64) -> i32 {
        log(&format!("Ticking from Rust; delta_time={}", delta_time));
        log(&format!(
            "Number of frames: {}",
            self.solver.scene.frames.len()
        ));
        42
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

    #[test]
    fn test_position_from_json_value() {
        let value: serde_json::Value = serde_json::from_str(&TEST_SCENE_JSON).unwrap();
        let position = Position::from_json_value(&value["frames"][0]["position"]).unwrap();
        assert_eq!(position, Position([12., 34.5]));
    }

    #[test]
    fn test_solver_context_new() {
        let context = SolverContext::_new(TEST_SCENE_JSON).unwrap();
        assert_eq!(context.solver.scene.frames.len(), 0);
        //assert_eq!(1, 0);
    }
}
