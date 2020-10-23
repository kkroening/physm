import * as tf from './tfjs';
import { DEFAULT_TOLERANCE } from './utils';
import { required } from './utils';

export function getTensorArray(tensor = required('tensor'), dispose = true) {
  /**
   * Get tensor array using `tensor.arraySync`, and dispose of the tensor;
   * makes disposal easier so that the array doesn't need to be saved as a
   * temporary variable when making assertions.
   */
  if (!(tensor instanceof tf.Tensor)) {
    throw new TypeError(
      `Expected \`tensor\` to be tf.Tensor instance; got ${tensor}`,
    );
  }
  const array = tensor.arraySync();
  dispose && tensor.dispose();
  return array;
}

export function getTensorData(tensor = required('tensor'), dispose = true) {
  /**
   * Get tensor data using `tensor.dataSync`, and dispose of the tensor;
   * makes disposal easier so that the data doesn't need to be saved as a
   * temporary variable when making assertions.
   */
  if (!(tensor instanceof tf.Tensor)) {
    throw new TypeError(
      `Expected \`tensor\` to be tf.Tensor instance; got ${tensor}`,
    );
  }
  const array = tensor.dataSync();
  dispose && tensor.dispose();
  return array;
}

export function areTensorsEqual(
  t1 = required('t1'),
  t2 = required('t2'),
  { tolerance = DEFAULT_TOLERANCE, disposeT1 = false, disposeT2 = false } = {},
) {
  /**
   * Check whether two tensors are approximately equal to one another, within
   * some amount of tolerance.
   * @todo Use a custom Jest matcher instead and make nicer error output.
   */
  const result = tf.tidy(
    () => !!tf.all(t1.sub(t2).abs().less(tolerance)).dataSync()[0],
  );
  disposeT1 && t1.dispose();
  disposeT2 && t2.dispose();
  return result;
}

export function checkTfMemory(func = required('func')) {
  /**
   * Check TensorflowJS memory usage before and after calling a function in
   * order to help detect/prevent/fix memory leaks.
   */
  const ignoredTensorIds = new Set();
  const ignoreTensor = (tensor) => {
    ignoredTensorIds.add(tensor.id);
    return tensor;
  };
  function walk(item) {
    // (Adapted from tfjs-core/src/tensor_util.ts)
    if (item == null) {
    } else if (item instanceof tf.Tensor) {
      ignoreTensor(item);
    } else if (Array.isArray(item)) {
      item.forEach(walk);
    } else if (item instanceof Map) {
      [...item.values()].forEach(walk);
    } else if (typeof item === 'object') {
      Object.values(item).forEach(walk);
    }
  }
  const initialTensorCount = tf.memory().numTensors;
  const result = func(ignoreTensor);
  const finalTensorCount = tf.memory().numTensors;
  walk(result, ignoreTensor);
  const tensorCountDelta =
    finalTensorCount - initialTensorCount - ignoredTensorIds.size;
  expect(tensorCountDelta).toBe(0);
  return result;
}
