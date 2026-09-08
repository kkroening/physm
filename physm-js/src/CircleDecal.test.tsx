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

  test('renders at the transformed position, not the local one', () => {
    // The element's props rather than a rendered tree: `getDomElement` returns a
    // bare SVG child, which a test renderer has no root to mount into.
    const element = new CircleDecal({ position: [1, 2], radius: 3 }).getDomElement(
      mat3.translation(10, 20),
    );

    expect(element.type).toBe('circle');
    expect(element.props).toMatchObject({ cx: 11, cy: 22, r: 3 });
  });
});
