import * as mat3 from './Mat3';
import * as vec3 from './Vec3';
import LineDecal from './LineDecal';

describe('LineDecal', () => {
  test('starts at the origin unless told otherwise', () => {
    const decal = new LineDecal({ endPos: [3, 4] });

    expect(decal.startPos).toEqual(vec3.ORIGIN);
    expect(decal.endPos).toEqual([3, 4, 1]);
  });

  test('xform carries both endpoints and scales the stroke', () => {
    const decal = new LineDecal({ endPos: [3, 4], lineWidth: 2 });
    const moved = decal.xform(mat3.scaling(10, 10));

    expect(moved.startPos).toEqual(vec3.ORIGIN);
    expect(moved.endPos).toEqual([30, 40, 1]);

    // Stroke width follows `sqrt(|det|)`, so a 10x zoom thickens by 10.
    expect(moved.lineWidth).toBeCloseTo(20, 9);
  });

  test('renders at the transformed position, not the local one', () => {
    // The element's props rather than a rendered tree: `getDomElement` returns a
    // bare SVG child, which a test renderer has no root to mount into.
    const element = new LineDecal({ endPos: [3, 4] }).getDomElement(
      mat3.translation(100, 200),
    );

    expect(element.type).toBe('line');
    expect(element.props).toMatchObject({ x1: 100, y1: 200, x2: 103, y2: 204 });
  });
});
