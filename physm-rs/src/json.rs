use crate::Error;
use crate::FrameBox;
use crate::RotationalFrame;
use crate::TrackFrame;
use crate::Weight;

use serde_json::Map;
use serde_json::Value;

pub fn value_to_f64(value: &Value) -> Result<f64, Error> {
    value
        .as_f64()
        .ok_or_else(|| Error(format!("Expected f64 value; got {}", value)))
}

pub fn value_to_str(value: &Value) -> Result<&str, Error> {
    value
        .as_str()
        .ok_or_else(|| Error(format!("Expected string value; got {}", value)))
}

pub fn value_to_json_obj(value: &Value) -> Result<&Map<String, Value>, Error> {
    value
        .as_object()
        .ok_or_else(|| Error(format!("Expected JSON object; got {}", value)))
}

pub fn map_value_item<'a, F, T>(value: &'a Value, key: &'a str, func: F) -> Result<T, Error>
where
    F: FnOnce(&'a Value) -> Result<T, Error>,
{
    let item_value = value.get(key).ok_or_else(|| {
        Error(format!(
            "Expected object with `{}` property; got {}",
            key, value
        ))
    })?;
    func(item_value)
}

pub fn map_obj_item_or_default<F, T>(
    obj: &Map<String, Value>,
    key: &str,
    func: F,
) -> Result<T, Error>
where
    F: FnOnce(&Value) -> Result<T, Error>,
    T: Default,
{
    Ok(obj.get(key).map(func).transpose()?.unwrap_or_default())
}

pub fn value_to_frame(value: &Value) -> Result<FrameBox, Error> {
    // TODO: do more of the common frame parsing here (weights, etc.) instead
    // of repeating it in each Frame implementation.
    let type_name = map_value_item(value, &"type", value_to_str)?;
    Ok(match type_name {
        "RotationalFrame" => Box::new(RotationalFrame::from_json_value(value)?),
        "TrackFrame" => Box::new(TrackFrame::from_json_value(value)?),
        _ => return Err(Error(format!("Invalid frame type: {}", type_name))),
    })
}

pub fn value_to_frames(value: &Value) -> Result<Vec<FrameBox>, Error> {
    Ok(value
        .as_array()
        .ok_or_else(|| Error(format!("Expected `frames` to be an array; got {}", value)))?
        .iter()
        .map(value_to_frame)
        .collect::<Result<_, _>>()?)
}

pub fn value_to_weights(value: &Value) -> Result<Vec<Weight>, Error> {
    Ok(value
        .as_array()
        .ok_or_else(|| Error(format!("Expected `weights` to be an array; got {}", value)))?
        .iter()
        .map(Weight::from_json_value)
        .collect::<Result<_, _>>()?)
}
