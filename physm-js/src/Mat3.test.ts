import * as mat3 from './Mat3';
import * as vec3 from './Vec3';
import type { Mat3 } from './Mat3';

/**
 * A reference multiply, written as the textbook triple loop.
 *
 * The unrolled version in `Mat3` is nine hand-written sums, which is exactly the
 * shape a transposition typos into silently -- so it is checked against a form
 * whose indices are derived rather than typed out.
 */
function referenceMultiply(a: Mat3, b: Mat3): Mat3 {
  const out = new Array<number>(9).fill(0);

  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      let sum = 0;
      for (let k = 0; k < 3; k++) {
        sum += (a[row * 3 + k] ?? 0) * (b[k * 3 + col] ?? 0);
      }
      out[row * 3 + col] = sum;
    }
  }

  return out as unknown as Mat3;
}

const SAMPLES: Mat3[] = [
  mat3.IDENTITY,
  mat3.rotation(0.7),
  mat3.translation(3, -4),
  mat3.scaling(2, 0.5),
  mat3.rotationRate(1.1),
  [1, 2, 3, 4, 5, 6, 7, 8, 9],
  [-2, 0.5, 11, 3, -7, 0, 1, 1, 1],
];

describe('Mat3', () => {
  test('multiply agrees with a looped reference on every pair', () => {
    SAMPLES.forEach((a) =>
      SAMPLES.forEach((b) =>
        expect(mat3.multiply(a, b)).toEqual(
          referenceMultiply(a, b).map((entry) => expect.closeTo(entry, 12)),
        ),
      ),
    );
  });

  test('multiply is not commutative, so the reference is not trivially satisfied', () => {
    const a = mat3.rotation(0.7);
    const b = mat3.translation(3, -4);

    expect(mat3.equals(mat3.multiply(a, b), mat3.multiply(b, a))).toBe(false);
  });

  test('identity is the multiplicative identity on both sides', () => {
    SAMPLES.forEach((m) => {
      expect(mat3.equals(mat3.multiply(m, mat3.IDENTITY), m)).toBe(true);
      expect(mat3.equals(mat3.multiply(mat3.IDENTITY, m), m)).toBe(true);
    });
  });

  test('transpose is an involution, and reverses a product', () => {
    const [a, b] = [mat3.rotation(0.4), mat3.translation(1, 2)];

    SAMPLES.forEach((m) =>
      expect(mat3.equals(mat3.transpose(mat3.transpose(m)), m)).toBe(true),
    );

    expect(
      mat3.equals(
        mat3.transpose(mat3.multiply(a, b)),
        mat3.multiply(mat3.transpose(b), mat3.transpose(a)),
      ),
    ).toBe(true);
  });

  test('apply composes the same way multiply does', () => {
    // `(AB)v == A(Bv)` is the property the whole pose accumulation rests on.
    const [a, b] = [mat3.rotation(0.9), mat3.translation(-2, 5)];
    const v = vec3.point(1.5, -0.25);

    const composed = mat3.apply(mat3.multiply(a, b), v);
    const sequential = mat3.apply(a, mat3.apply(b, v));

    composed.forEach((entry, index) =>
      expect(entry).toBeCloseTo(sequential[index] ?? NaN, 12),
    );
  });

  test('a rotation turns a point without moving its length', () => {
    const turned = mat3.apply(mat3.rotation(Math.PI / 2), vec3.point(2, 0));

    expect(turned[0]).toBeCloseTo(0, 12);
    expect(turned[1]).toBeCloseTo(2, 12);
    expect(vec3.planarLength(turned)).toBeCloseTo(2, 12);
  });

  test('a translation moves a point but not a direction', () => {
    const m = mat3.translation(10, -3);

    expect(mat3.apply(m, vec3.point(1, 1))).toEqual([11, -2, 1]);
    expect(mat3.apply(m, vec3.direction(1, 1))).toEqual([1, 1, 0]);
  });

  test('rotationRate is the derivative of rotation', () => {
    // Central-differenced, which is why this is a real check on the sign
    // convention rather than a restatement of it.
    const angle = 0.6;
    const h = 1e-6;
    const difference = mat3.scale(
      mat3.subtract(mat3.rotation(angle + h), mat3.rotation(angle - h)),
      1 / (2 * h),
    );

    expect(mat3.equals(mat3.rotationRate(angle), difference, 1e-8)).toBe(true);
  });

  test('invertRigid agrees with the general inverse on rigid transforms', () => {
    const rigid = mat3.multiply(mat3.rotation(1.3), mat3.translation(4, -7));

    expect(
      mat3.equals(mat3.invertRigid(rigid), mat3.invert(rigid), 1e-12),
    ).toBe(true);
    expect(
      mat3.equals(mat3.multiply(rigid, mat3.invertRigid(rigid)), mat3.IDENTITY),
    ).toBe(true);
  });

  test('invert rejects a singular matrix rather than returning infinities', () => {
    expect(() => mat3.invert(mat3.scaling(1, 0))).toThrow(/singular/i);
  });

  test('scaling scales x by its first argument, not its second', () => {
    // `scaling(2, 3)` with the arguments swapped is invisible to every test that
    // only uses it as an opaque sample matrix.
    expect(mat3.apply(mat3.scaling(2, 3), vec3.point(1, 1))).toEqual([2, 3, 1]);
  });

  test('add and scale touch every entry, in the right one', () => {
    const a: Mat3 = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    const b: Mat3 = [10, 20, 30, 40, 50, 60, 70, 80, 90];

    expect(mat3.add(a, b)).toEqual([11, 22, 33, 44, 55, 66, 77, 88, 99]);
    expect(mat3.scale(a, 2)).toEqual([2, 4, 6, 8, 10, 12, 14, 16, 18]);
    expect(mat3.subtract(b, a)).toEqual([9, 18, 27, 36, 45, 54, 63, 72, 81]);
  });

  test('trace and determinant match hand-computed values', () => {
    const m: Mat3 = [1, 2, 3, 4, 5, 6, 7, 8, 10];

    expect(mat3.trace(m)).toBe(16);
    expect(mat3.determinant(m)).toBeCloseTo(-3, 12);
  });
});
