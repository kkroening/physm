import * as tf from './tfjs';
import React from 'react';
import { areTensorsEqual } from './utils';
import { coercePositionVector } from './utils';
import { coerceStateTuple } from './utils';
import { getRotationMatrix } from './utils';
import { getTranslationMatrix } from './utils';
import { invertXformMatrix } from './utils';
import { render } from '@testing-library/react';
import { SingularMatrixError } from './utils';
import { solveLinearSystem } from './utils';

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

describe('coerceStateTuple', () => {
  test('number input', () => {
    expect(coerceStateTuple(3)).toEqual([3, 0]);
  });
  test('single-element array input', () => {
    expect(coerceStateTuple([3])).toEqual([3, 0]);
  });
  test('two-element array input', () => {
    expect(coerceStateTuple([3, 4])).toEqual([3, 4]);
  });
});

describe('invertXformMatrix', () => {
  test('rotation matrix', () => {
    expect(areTensorsEqual(invertXformMatrix(tf.eye(3)), tf.eye(3))).toBe(true);
    expect(
      areTensorsEqual(
        invertXformMatrix(getRotationMatrix(0.7)),
        getRotationMatrix(-0.7),
      ),
    ).toBe(true);
  });
  test('rotation+translation matrix', () => {
    const m1 = invertXformMatrix(
      getTranslationMatrix([3, 8]).matMul(getRotationMatrix(0.7)),
    );
    const m2 = getRotationMatrix(-0.7).matMul(getTranslationMatrix([-3, -8]));
    expect(areTensorsEqual(m1, m2)).toBe(true);
  });
});

describe('solveLinearSystem', () => {
  test('identity matrix', () => {
    expect(
      areTensorsEqual(
        solveLinearSystem(tf.eye(3), tf.tensor2d([[1], [2], [3]])),
        tf.tensor2d([[1], [2], [3]]),
      ),
    ).toBe(true);
  });
  test('rotation+translation matrix', () => {
    const aMat = getTranslationMatrix([3, 8]).matMul(getRotationMatrix(0.7));
    const bVec = tf.tensor2d([[1], [2], [3]]);
    const aInvMat = getRotationMatrix(-0.7).matMul(
      getTranslationMatrix([-3, -8]),
    );
    expect(
      areTensorsEqual(solveLinearSystem(aMat, bVec), aInvMat.matMul(bVec), {
        tolerance: 1e-5,
      }),
    ).toBe(true);
  });
  test('singular matrix', () => {
    const aMat = tf.tensor2d([
      [2, 0, 1],
      [0, 1, 1],
      [2, 1, 2],
    ]);
    const bVec = tf.tensor2d([[1], [2], [3]]);
    expect(() => solveLinearSystem(aMat, bVec)).toThrow(SingularMatrixError);
  });
});
