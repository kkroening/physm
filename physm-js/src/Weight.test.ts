import * as vec3 from './Vec3';
import Weight from './Weight';
import * as mat3 from './Mat3';

describe('Weight', () => {
  test('defaults to unit mass at the origin, with no drag', () => {
    const weight = new Weight();

    // Note these were `expect(weight.mass == 1)` before -- an `expect` with no
    // matcher, which asserts nothing and passes whatever the value is.
    expect(weight.mass).toBe(1);
    expect(weight.position).toEqual(vec3.ORIGIN);
    expect(weight.drag).toBe(0);
  });

  test('accepts a position as a pair', () => {
    expect(new Weight(2, { position: [3, 4] }).position).toEqual([3, 4, 1]);
  });

  test('xform carries the position through a transform', () => {
    const weight = new Weight(2, { position: [3, 4], drag: 5 });
    const moved = weight.xform(mat3.translation(10, -1));

    expect(moved.position).toEqual([13, 3, 1]);

    // Mass and drag are properties of the point, not of where it is.
    expect(moved.mass).toBe(2);
    expect(moved.drag).toBe(5);
  });

  test('round-trips through toJsonObj', () => {
    expect(new Weight(2, { position: [3, 4], drag: 5 }).toJsonObj()).toEqual({
      mass: 2,
      position: [3, 4],
      drag: 5,
    });
  });
});
