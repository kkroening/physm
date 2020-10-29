use std::rc::Rc;
use wasm_bindgen::prelude::*;
use web_sys::console;

pub use crate::frame::Frame;
pub use crate::rotational_frame::RotationalFrame;
pub use crate::track_frame::TrackFrame;
pub use crate::weight::Weight;

mod frame;
mod rotational_frame;
mod track_frame;
mod utils;
mod weight;

pub type Position = [f64; 2];

#[wasm_bindgen]
extern "C" {
    fn alert(s: &str);
    fn setInterval(closure: &Closure<dyn FnMut()>, time: u32) -> i32;
    fn clearInterval(id: i32);
    //fn jsfunc(a: &str) -> String;

    #[wasm_bindgen(js_namespace = console)]
    fn log(s: &str);
}

#[wasm_bindgen]
pub struct IntervalHandle {
    interval_id: i32,
    _closure: Closure<dyn FnMut()>,
}

#[wasm_bindgen]
pub struct Context {
    frames: Vec<Box<dyn Frame>>,
}

#[wasm_bindgen]
impl Context {
    pub fn new() -> Context {
        Context {
            frames: vec![Box::new(TrackFrame::new()), Box::new(TrackFrame::new())],
        }
    }

    pub fn tick(&self, delta_time: f64) -> i32 {
        console::log_1(&format!("Ticking from Rust; delta_time={}", delta_time).into());
        console::log_1(&format!("Number of frames: {}", self.frames.len()).into());
        42
    }
}

#[wasm_bindgen]
pub fn create_context() -> Context {
    utils::set_panic_hook();
    console::log_1(&"[rs] Creating context".into());
    Context::new()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn constructor() {
        let f = TrackFrame::new()
            .set_angle(37.)
            .add_child(Box::new(TrackFrame::new().set_position([1.5, 2.6])))
            .add_child(Box::new(
                RotationalFrame::new()
                    .add_child(Box::new(RotationalFrame::new()))
                    .set_position([5., 28.]),
            ));
        println!("{:#?}", f);
        //assert_eq!(2 + 2, 5);
    }
}
