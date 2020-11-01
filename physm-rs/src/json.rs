use core::borrow::Borrow;
use core::hash::Hash;

use crate::json;
use crate::Frame;
use crate::Position;
use crate::RotationalFrame;
use crate::SceneError;
use crate::TrackFrame;
use crate::Weight;

use serde_json::Map;
use serde_json::Value;

pub fn value_to_f64(value: &Value) -> Result<f64, SceneError> {
    value
        .as_f64()
        .ok_or_else(|| SceneError(format!("Expected f64 value; got {}", value)))
}

pub fn value_to_json_obj(value: &Value) -> Result<&Map<String, Value>, SceneError> {
    value
        .as_object()
        .ok_or_else(|| SceneError(format!("Expected JSON object; got {}", value)))
}

pub fn value_to_boxed_frame(value: &Value) -> Result<Box<dyn Frame>, SceneError> {
    Ok(
        match value
            .get("type")
            .ok_or_else(|| {
                SceneError(format!(
                    "Expected frame to have `type` property; got {}",
                    value
                ))
            })?
            .as_str()
            .ok_or_else(|| {
                SceneError(format!(
                    "Expected frame `type` to be a string; got {}",
                    value.get("type").unwrap()
                ))
            })? {
            "RotationalFrame" => Box::new(RotationalFrame::from_json_value(value)?),
            "TrackFrame" => Box::new(TrackFrame::from_json_value(value)?),
            type_name => return Err(SceneError(format!("Invalid frame type: {}", type_name))),
        },
    )
}

pub fn value_to_boxed_frames(value: &Value) -> Result<Vec<Box<dyn Frame>>, SceneError> {
    Ok(value
        .as_array()
        .ok_or_else(|| SceneError(format!("Expected `frames` to be an array; got {}", value)))?
        .iter()
        .map(value_to_boxed_frame)
        .collect::<Result<_, _>>()?)
}

pub fn value_to_weights(value: &Value) -> Result<Vec<Weight>, SceneError> {
    Ok(value
        .as_array()
        .ok_or_else(|| SceneError(format!("Expected `weights` to be an array; got {}", value)))?
        .iter()
        .map(Weight::from_json_value)
        .collect::<Result<_, _>>()?)
}

pub fn map_obj_item<F, T, Q: ?Sized>(
    obj: &Map<String, Value>,
    key: &Q,
    func: F,
) -> Result<T, SceneError>
where
    String: Borrow<Q>,
    Q: Ord + Eq + Hash,
    F: FnOnce(&Value) -> Result<T, SceneError>,
    T: Default,
{
    Ok(obj.get(key).map(func).transpose()?.unwrap_or_default())
}

#[cfg(test)]
mod tests {
    use super::*;
}
