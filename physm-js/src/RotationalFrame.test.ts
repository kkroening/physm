import * as mat3 from './Mat3';
import * as vec3 from './Vec3';
import RotationalFrame from './RotationalFrame';
import type { Mat3 } from './Mat3';

/** Central difference of a matrix-valued function of `q`. */
function derivativeAt(f: (q: number) => Mat3, q: number, h = 1e-6): Mat3 {
  return mat3.scale(mat3.subtract(f(q + h), f(q - h)), 1 / (2 * h));
}

describe('RotationalFrame', () => {
  test('defaults to the origin, at rest, with nothing attached', () => {
    const frame = new RotationalFrame();

    expect(frame.position).toEqual(vec3.ORIGIN);
    expect(frame.decals).toEqual([]);
    expect(frame.weights).toEqual([]);
    expect(frame.frames).toEqual([]);
    expect(frame.resistance).toBe(0);
    expect(frame.initialState).toEqual([0, 0]);
  });

  test('rotates about its own origin, offset by its position', () => {
    // The previous version of this test called the method and checked the
    // tensor count, asserting nothing about the value it returned.
    const frame = new RotationalFrame({ position: [3, -4] });

    // `mat3.equals` rather than `toEqual`: `-sin(0)` is `-0`, which a
    // deep-equality check separates from `+0` though it is the same number.
    expect(
      mat3.equals(frame.getLocalPosMatrix(0), mat3.translation(3, -4)),
    ).toBe(true);

    // A quarter turn takes a point on `+x` to `+y`, then offsets it.
    const tip = mat3.apply(frame.getLocalPosMatrix(Math.PI / 2), vec3.point(2, 0));
    expect(tip[0]).toBeCloseTo(3, 9);
    expect(tip[1]).toBeCloseTo(-2, 9);
  });

  test('the velocity matrix is the derivative of the pose', () => {
    // Which is what makes it `∂L_i/∂q`, and what a sign error here would break
    // everywhere at once.
    const frame = new RotationalFrame({ position: [3, -4] });

    [0, 0.7, -1.9].forEach((q) =>
      expect(
        mat3.equals(
          frame.getLocalVelMatrix(q),
          derivativeAt((angle) => frame.getLocalPosMatrix(angle), q),
          1e-7,
        ),
      ).toBe(true),
    );
  });

  test('the acceleration matrix is the second derivative', () => {
    const frame = new RotationalFrame({ position: [3, -4] });

    [0, 0.7, -1.9].forEach((q) =>
      expect(
        mat3.equals(
          frame.getLocalAccelMatrix(q),
          derivativeAt((angle) => frame.getLocalVelMatrix(angle), q),
          1e-6,
        ),
      ).toBe(true),
    );
  });

  test('the position offset does not move with the coordinate', () => {
    // Only the linear block turns; the translation column is the fixed offset
    // that places the joint in its parent.
    const frame = new RotationalFrame({ position: [3, -4] });

    [0, 1.1].forEach((q) =>
      expect(mat3.translationOf(frame.getLocalPosMatrix(q))).toEqual([3, -4]),
    );
  });
});
