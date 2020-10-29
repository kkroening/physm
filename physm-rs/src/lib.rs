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

#[wasm_bindgen]
pub struct SolverContext {
    solver: Solver,
}

#[wasm_bindgen]
impl SolverContext {
    pub fn tick(&self, delta_time: f64) -> i32 {
        console::log_1(&format!("Ticking from Rust; delta_time={}", delta_time).into());
        console::log_1(&format!("Number of frames: {}", self.solver.scene.frames.len()).into());
        42
    }

    pub fn dispose(self) {
        console::log_1(&"[rs] Dropping solver context".into());
    }
}

fn do_create_solver_context(scene_json: &str) -> SolverContext {
    let scene = Scene::new(); // TODO: deserialize.
    let solver = Solver::new(scene);
    SolverContext { solver }
}

#[wasm_bindgen]
pub fn create_solver_context(scene_json: &str) -> SolverContext {
    utils::set_panic_hook();
    console::log_1(&format!("[rs] Creating solver context; scene JSON: {}", scene_json).into());
    do_create_solver_context(scene_json)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_do_create_solver_context() {
        // Note: wasm_bindgen functions can't be called from unit-tests.
        let scene_json = "{}";
        let context = do_create_solver_context(scene_json);
        assert_eq!(context.solver.scene.frames.len(), 0);
    }
}
