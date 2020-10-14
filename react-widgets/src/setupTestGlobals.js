import * as immer from 'immer';
import * as tf from '@tensorflow/tfjs-node';

export default async () => {
  tf.setBackend('cpu');
  immer.enableMapSet();
}
