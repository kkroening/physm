use std::error::Error;
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

pub type Position = [f64; 2];

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
        console::log_1(&format!("[rs] Creating solver context; scene JSON: {}", scene_json).into());
        Self::_new(scene_json).map_err(|err| JsValue::from_str(&err.to_string()))
    }

    pub fn tick(&self, delta_time: f64) -> i32 {
        console::log_1(&format!("Ticking from Rust; delta_time={}", delta_time).into());
        console::log_1(&format!("Number of frames: {}", self.solver.scene.frames.len()).into());
        42
    }

    pub fn dispose(self) {
        console::log_1(&"[rs] Dropping solver context".into());
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
              "position": [0, 0],
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
    fn test_solver_context_new() {
        let context = SolverContext::_new(TEST_SCENE_JSON).unwrap();
        assert_eq!(context.solver.scene.frames.len(), 0);
        //assert_eq!(1, 0);
    }
}
