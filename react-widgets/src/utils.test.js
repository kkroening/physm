import * as tf from '@tensorflow/tfjs';
import React from 'react';
import { coercePositionVector } from './utils';
import { coerceStateTuple } from './utils';
import { render } from '@testing-library/react';

test('coercePositionVector', () => {
  expect(coercePositionVector(3).arraySync()).toEqual([[3], [0], [1]]);
  expect(coercePositionVector([3, 4]).arraySync()).toEqual([[3], [4], [1]]);
  expect(coercePositionVector([3, 4, 5]).arraySync()).toEqual([[3], [4], [1]]);
  expect(coercePositionVector(tf.tensor2d([[3, 4]])).arraySync()).toEqual([
    [3],
    [4],
    [1],
  ]);
  expect(coercePositionVector(tf.tensor2d([[3, 4, 5]])).arraySync()).toEqual([
    [3],
    [4],
    [1],
  ]);
  expect(
    coercePositionVector(tf.tensor2d([[3, 4, 5]]).transpose()).arraySync(),
  ).toEqual([[3], [4], [1]]);
  expect(
    coercePositionVector(tf.tensor1d([3, 4, 5]).transpose()).arraySync(),
  ).toEqual([[3], [4], [1]]);
});

test('coerceStateTuple', () => {
  expect(coerceStateTuple(3)).toEqual([3, 0]);
  expect(coerceStateTuple([3])).toEqual([3, 0]);
  expect(coerceStateTuple([3, 4])).toEqual([3, 4]);
});