import * as tf from './tfjs';

export const ZERO_POS = tf.tensor2d([[0], [0], [1]]);
export const ZERO_VEL = tf.tensor2d([[0], [0], [0]]);
export const ZERO_STATE = [0, 0];

export class MissingArgumentError extends Error {}

export class NotImplementedError extends Error {}

export function required(name) {
  throw new MissingArgumentError(`Missing required function argument: ${name}`);
}

export function coercePositionVector(position = required('position')) {
  /**
   * Convert the input argument into a tensor of shape `[3, 1]`, corresponding
   * to an affine position vector where the final component is guaranteed to
   * have a value of 1.
   * @param {(number|number[]|tf.Tensor)} position
   * @returns {tf.Tensor}
   */
  if (position instanceof tf.Tensor) {
    const data = position.dataSync();
    if (data.length < 2 || data.length > 3) {
      throw new Error(
        `Expected position tensor to have 2 or 3 elements; got ${position}`,
      );
    }
    position = tf.tensor1d([data[0], data[1], 1]).reshape([3, 1]);
  } else if (position instanceof Array) {
    if (position.length < 2 || position.length > 3) {
      throw new Error(
        `Expected position array to have 2 or 3 elements; got ${position}`,
      );
    }
    position = tf.tensor1d([position[0], position[1], 1]).reshape([3, 1]);
  } else if (typeof position == 'number') {
    position = tf.tensor1d([position, 0, 1]).reshape([3, 1]);
  } else {
    throw new TypeError(
      `Expected number, array, or tf.Tensor instance; got ${position}`,
    );
  }
  return position;
}

export function coerceStateTuple(state = required('state')) {
  /**
   * Convert the input into a pair of numbers as a `[position, velocity]`
   * list/tuple.
   * @param {(number|number[])} state
   * @returns {(number[])}
   */
  if (state == null) {
    state = ZERO_STATE;
  } else if (state === ZERO_STATE) {
  } else if (typeof state == 'number') {
    state = [state, 0];
  } else if (state instanceof Array) {
    if (state.length === 0 || state.length > 2) {
      throw new Error(
        `Expected state tuple to have 1 or 2 elements; got ${state}`,
      );
    }
    state = [state[0], state.length > 1 ? state[1] : 0];
  } else {
    throw new TypeError(`Expected number of tf.Tensor instance; got ${state}`);
  }
  return state;
}

export function getScaleMatrix(x = required('x'), y = undefined) {
  if (y == null) {
    y = x;
  }
  return tf.tensor2d([
    [x, 0, 0],
    [0, y, 0],
    [0, 0, 1],
  ]);
}

export function getRotationMatrix(angle = required('angle')) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return tf.tensor2d([
    [c, -s, 0],
    [s, c, 0],
    [0, 0, 1],
  ]);
}

export function getTranslationMatrix(offset = required('offset')) {
  offset = coercePositionVector(offset).dataSync();
  return tf.tensor2d([
    [1, 0, offset[0]],
    [0, 1, offset[1]],
    [0, 0, offset[2]],
  ]);
}

export function getRotationTranslationMatrix(
  angle = required('angle'),
  offset = required('offset'),
) {
  offset = coercePositionVector(offset).dataSync();
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return tf.tensor2d([
    [c, -s, offset[0]],
    [s, c, offset[1]],
    [0, 0, offset[2]],
  ]);
}

export function checkXformMatrixShape(mat = required('mat')) {
  if (!(mat instanceof tf.Tensor)) {
    throw new TypeError(
      `Expected transformation matrix to be tf.Tensor instance; got ${mat}`,
    );
  }
  if (mat.shape.length !== 2 || mat.shape[0] !== 3 || mat.shape[1] !== 3) {
    throw new Error(
      `Expected transformation matrix to have shape [3, 3]; got ${mat.shape}`,
    );
  }
}

export function getXformMatrixDeterminant(mat = required('mat')) {
  checkXformMatrixShape(mat);
  const data = mat.dataSync();
  return data[0] * data[4] - data[1] * data[3];
}

export function getXformMatrixScaleFactor(mat = required('mat')) {
  return Math.sqrt(getXformMatrixDeterminant(mat));
}

export function getXformMatrixRotationAngle(mat = required('mat')) {
  checkXformMatrixShape(mat);
  const data = mat.dataSync();
  return Math.atan2(data[1], -data[0]);
}

export function getXformMatrixTranslation(mat = required('mat')) {
  checkXformMatrixShape(mat);
  const data = mat.dataSync();
  return tf.tensor2d([[data[2], data[5], data[8]]]);
}

export function invertXformMatrix(mat = required('mat')) {
  checkXformMatrixShape(mat);
  const data = mat.dataSync();
  const det =
    data[0] * data[4] * data[8] +
    data[1] * data[5] * data[6] +
    data[2] * data[3] * data[7] -
    data[0] * data[5] * data[7] -
    data[1] * data[3] * data[8] -
    data[2] * data[4] * data[6];
  return tf.tensor2d([
    [
      +(data[4] * data[8] - data[5] * data[7]) / det,
      -(data[1] * data[8] - data[2] * data[7]) / det,
      +(data[1] * data[5] - data[2] * data[4]) / det,
    ],
    [
      -(data[3] * data[8] - data[5] * data[6]) / det,
      +(data[0] * data[8] - data[2] * data[6]) / det,
      -(data[0] * data[5] - data[2] * data[3]) / det,
    ],
    [
      +(data[3] * data[7] - data[4] * data[6]) / det,
      -(data[0] * data[7] - data[1] * data[6]) / det,
      +(data[0] * data[4] - data[1] * data[3]) / det,
    ],
  ]);
}

export function areTensorsEqual(
  t1 = required('t1'),
  t2 = required('t2'),
  { epsilon = 1e-6 } = {},
) {
  return !!tf.all(t1.sub(t2).abs().less(epsilon)).dataSync()[0];
}

export function generateRandomId() {
  /** See `https://gist.github.com/gordonbrander/2230317`.
   */
  return Math.random().toString(36).substr(2, 9);
}
