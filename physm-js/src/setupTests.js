import '@testing-library/jest-dom/extend-expect';
import * as tf from '@tensorflow/tfjs-node';

jest.mock('./tfjs')

beforeAll(() => {
  //tf.setBackend('cpu');
})

afterAll(() => {
  tf.ENV.platform = null;
})
