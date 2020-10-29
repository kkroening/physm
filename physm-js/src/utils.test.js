import * as tf from './tfjs';
import React from 'react';
import { areTensorsEqual } from './testutils';
import { checkTfMemory } from './testutils';
import { coercePositionVector } from './utils';
import { coerceStateTuple } from './utils';
import { getRotationMatrix } from './utils';
import { getTranslationMatrix } from './utils';
import { invertXformMatrix } from './utils';
import { render } from '@testing-library/react';
import { SingularMatrixError } from './utils';
import { solveLinearSystem } from './utils';

describe('coercePositionVector function', () => {
  test('number input', () => {
    const input = 3;
    const actual = checkTfMemory(() => coercePositionVector(input)).arraySync();
    const expected = [[3], [0], [1]];
    expect(actual).toEqual(expected);
  });
  test('two-element array input', () => {
    const input = [3, 4];
    const actual = checkTfMemory(() => coercePositionVector(input)).arraySync();
    const expected = [[3], [4], [1]];
    expect(actual).toEqual(expected);
  });
  test('three-element array input', () => {
    const input = [3, 4, 5];
    const actual = checkTfMemory(() => coercePositionVector(input)).arraySync();
    const expected = [[3], [4], [1]];
    expect(actual).toEqual(expected);
  });
  test('1x2 tensor input', () => {
    const input = tf.tensor2d([[3, 4]]);
    const actual = checkTfMemory(() => coercePositionVector(input)).arraySync();
    const expected = [[3], [4], [1]];
    expect(actual).toEqual(expected);
  });
  test('2x1 tensor input', () => {
    const input = tf.tensor2d([[3], [4]]);
    const actual = checkTfMemory(() => coercePositionVector(input)).arraySync();
    const expected = [[3], [4], [1]];
    expect(actual).toEqual(expected);
  });
  test('1x3 tensor input', () => {
    const input = tf.tensor2d([[3, 4, 5]]);
    const actual = checkTfMemory(() => coercePositionVector(input)).arraySync();
    const expected = [[3], [4], [1]];
    expect(actual).toEqual(expected);
  });
  test('3x1 tensor input', () => {
    const input = tf.tensor2d([[3], [4], [5]]);
    const actual = checkTfMemory(() => coercePositionVector(input)).arraySync();
    const expected = [[3], [4], [1]];
    expect(actual).toEqual(expected);
  });
  test('three-element 1D tensor input', () => {
    const input = tf.tensor1d([3, 4, 5]);
    const actual = checkTfMemory(() => coercePositionVector(input)).arraySync();
    const expected = [[3], [4], [1]];
    expect(actual).toEqual(expected);
  });
});

describe('coerceStateTuple function', () => {
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

describe('invertXformMatrix function', () => {
  test('identity matrix', () => {
    const input = tf.eye(3);
    const actual = checkTfMemory(() => invertXformMatrix(input));
    const expected = input;
    expect(areTensorsEqual(actual, expected)).toBe(true);
  });
  test('rotation matrix', () => {
    const input = getRotationMatrix(0.7);
    const actual = checkTfMemory(() => invertXformMatrix(input));
    const expected = getRotationMatrix(-0.7);
    expect(areTensorsEqual(actual, expected)).toBe(true);
  });
  test('rotation+translation matrix', () => {
    const input = getTranslationMatrix([3, 8]).matMul(getRotationMatrix(0.7));
    const actual = checkTfMemory(() => invertXformMatrix(input));
    const expected = getRotationMatrix(-0.7).matMul(
      getTranslationMatrix([-3, -8]),
    );
    expect(areTensorsEqual(actual, expected)).toBe(true);
  });
});

describe('solveLinearSystem function', () => {
  test('identity matrix with array expected', () => {
    const aMat = tf.eye(3);
    const bVec = tf.tensor2d([[1], [2], [3]]);
    const actual = checkTfMemory(() =>
      solveLinearSystem(aMat, bVec, {
        asTensor: false,
      }),
    );
    const expected = [1, 2, 3];
    expect(actual).toEqual(expected);
  });
  test('identity matrix with tensor expected', () => {
    const aMat = tf.eye(3);
    const bVec = tf.tensor2d([[1], [2], [3]]);
    const actual = checkTfMemory(() => solveLinearSystem(aMat, bVec));
    const expected = tf.tensor2d([[1], [2], [3]]);
    expect(areTensorsEqual(actual, expected)).toBe(true);
  });
  test('rotation+translation matrix', () => {
    const aMat = getTranslationMatrix([3, 8]).matMul(getRotationMatrix(0.7));
    const bVec = tf.tensor2d([[1], [2], [3]]);
    const aInvMat = getRotationMatrix(-0.7).matMul(
      getTranslationMatrix([-3, -8]),
    );
    const actual = checkTfMemory(() => solveLinearSystem(aMat, bVec));
    const expected = aInvMat.matMul(bVec);
    expect(
      areTensorsEqual(actual, expected, {
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
    const func = () => checkTfMemory(() => solveLinearSystem(aMat, bVec));
    expect(func).toThrow(SingularMatrixError);
  });
});
