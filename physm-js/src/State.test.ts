import { ZERO_STATE, coerceState } from './State';

describe('coerceState', () => {
  test('a bare number is a position at rest', () => {
    expect(coerceState(3)).toEqual([3, 0]);
  });

  test('a one-element array means the same', () => {
    expect(coerceState([3])).toEqual([3, 0]);
  });

  test('a pair is taken as given', () => {
    expect(coerceState([3, -4])).toEqual([3, -4]);
  });

  test('nothing is the origin at rest', () => {
    expect(coerceState(null)).toEqual(ZERO_STATE);
    expect(coerceState(undefined)).toEqual(ZERO_STATE);
  });

  test('rejects a shape it would otherwise have to guess at', () => {
    expect(() => coerceState([])).toThrow(TypeError);
    expect(() => coerceState([1, 2, 3])).toThrow(TypeError);
  });
});
