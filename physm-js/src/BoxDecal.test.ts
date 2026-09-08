import * as mat3 from './Mat3';
import * as vec3 from './Vec3';
import BoxDecal from './BoxDecal';

describe('BoxDecal', () => {
  test('defaults to a centred unit square', () => {
    const decal = new BoxDecal();

    expect(decal.width).toBe(1);
    expect(decal.height).toBe(1);
    expect(decal.position).toEqual(vec3.ORIGIN);
    expect(decal.centered).toBe(true);
    expect(decal.solid).toBe(true);
  });

  test('xform scales the box and its stroke together', () => {
    const moved = new BoxDecal({ width: 2, height: 3, lineWidth: 1 }).xform(
      mat3.scaling(5, 5),
    );

    expect(moved.width).toBeCloseTo(10, 9);
    expect(moved.height).toBeCloseTo(15, 9);
    expect(moved.lineWidth).toBeCloseTo(5, 9);
  });
});
