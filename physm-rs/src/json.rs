use crate::json;
use crate::Frame;
use crate::Position;
use crate::RotationalFrame;
use crate::SceneError;
use crate::TrackFrame;
use crate::Weight;

pub fn value_to_f64(value: &serde_json::Value) -> Result<f64, SceneError> {
    value
        .as_f64()
        .ok_or_else(|| SceneError(format!("Expected f64 value; got {}", value)))
}

pub fn value_to_json_obj(
    value: &serde_json::Value,
) -> Result<&serde_json::Map<String, serde_json::Value>, SceneError> {
    value
        .as_object()
        .ok_or_else(|| SceneError(format!("Expected JSON object; got {}", value)))
}

pub fn value_to_boxed_frame(value: &serde_json::Value) -> Result<Box<dyn Frame>, SceneError> {
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

pub fn value_to_boxed_frames(value: &serde_json::Value) -> Result<Vec<Box<dyn Frame>>, SceneError> {
    Ok(value
        .as_array()
        .ok_or_else(|| SceneError(format!("Expected `frames` to be an array; got {}", value)))?
        .iter()
        .map(value_to_boxed_frame)
        .collect::<Result<_, _>>()?)
}

pub fn value_to_weights(value: &serde_json::Value) -> Result<Vec<Weight>, SceneError> {
    Ok(value
        .as_array()
        .ok_or_else(|| SceneError(format!("Expected `weights` to be an array; got {}", value)))?
        .iter()
        .map(Weight::from_json_value)
        .collect::<Result<_, _>>()?)
}

#[cfg(test)]
mod tests {
    use super::*;
}
