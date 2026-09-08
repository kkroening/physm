import * as mat3 from './Mat3';
import * as vec3 from './Vec3';
import CircleDecal from './CircleDecal';

describe('CircleDecal', () => {
  test('defaults to a unit disc at the origin', () => {
    const decal = new CircleDecal();

    expect(decal.position).toEqual(vec3.ORIGIN);
    expect(decal.radius).toBe(1);
  });

  test('xform moves the centre and scales the radius', () => {
    const moved = new CircleDecal({ position: [1, 2], radius: 3 }).xform(
      mat3.scaling(4, 4),
    );

    expect(moved.position).toEqual([4, 8, 1]);
    expect(moved.radius).toBeCloseTo(12, 9);
  });
});
