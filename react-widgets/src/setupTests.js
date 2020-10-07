import '@testing-library/jest-dom/extend-expect';
import * as immer from 'immer';
import * as tf from '@tensorflow/tfjs';

tf.setBackend('cpu');
immer.enableMapSet();
