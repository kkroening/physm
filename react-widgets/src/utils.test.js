import * as tf from './tfjs';
import React from 'react';
import { areTensorsEqual } from './utils';
import { coercePositionVector } from './utils';
import { coerceStateTuple } from './utils';
import { getRotationMatrix } from './utils';
import { getRotationTranslationMatrix } from './utils';
import { getTranslationMatrix } from './utils';
import { invertXformMatrix } from './utils';
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

test('invertXformMatrix', () => {
  expect(areTensorsEqual(invertXformMatrix(tf.eye(3)), tf.eye(3))).toBe(true);
  expect(
    areTensorsEqual(
      invertXformMatrix(getRotationMatrix(0.7)),
      getRotationMatrix(-0.7),
    ),
  ).toBe(true);
  const m1 = invertXformMatrix(getRotationTranslationMatrix(0.7, [3, 8]));
  const m2 = getRotationMatrix(-0.7).matMul(getTranslationMatrix([-3, -8]));
  expect(areTensorsEqual(m1, m2)).toBe(true);
});
