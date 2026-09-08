import * as mat3 from './Mat3';
import * as vec3 from './Vec3';

describe('Vec3', () => {
  test('constructors put w where the homogeneous convention needs it', () => {
    expect(vec3.point(3, -4)).toEqual([3, -4, 1]);
    expect(vec3.direction(3, -4)).toEqual([3, -4, 0]);
    expect(vec3.ORIGIN).toEqual([0, 0, 1]);
    expect(vec3.ZERO).toEqual([0, 0, 0]);
  });

  test('add and subtract act componentwise, with every slot distinct', () => {
    // Distinct in all three, so a swapped or duplicated index cannot agree by
    // coincidence.
    const a = vec3.point(2, 5);
    const b: vec3.Vec3 = [10, 100, 1000];

    expect(vec3.add(a, b)).toEqual([12, 105, 1001]);
    expect(vec3.subtract(a, b)).toEqual([-8, -95, -999]);
  });

  test('scale multiplies every component, including w', () => {
    expect(vec3.scale([2, 3, 5], 4)).toEqual([8, 12, 20]);
  });

  test('dot sums all three products', () => {
    // `1*10 + 2*100 + 4*1000`, so dropping any one term changes the answer.
    expect(vec3.dot([1, 2, 4], [10, 100, 1000])).toBe(4210);
  });

  test('planarLength ignores w, which is what every caller means by a distance', () => {
    expect(vec3.planarLength(vec3.point(3, 4))).toBe(5);
    expect(vec3.planarLength(vec3.direction(3, 4))).toBe(5);
    expect(vec3.planarLength([0, 0, 99])).toBe(0);
  });

  test('toPlanar keeps x before y', () => {
    expect(vec3.toPlanar([7, 9, 1])).toEqual([7, 9]);
  });

  test('coerce accepts the shapes a scene author writes', () => {
    expect(vec3.coerce([3, 4])).toEqual([3, 4, 1]);
    expect(vec3.coerce([3, 4, 9])).toEqual([3, 4, 1]);

    // A bare number is an offset along the frame's own axis, which is how a
    // link length or a track position is usually written.
    expect(vec3.coerce(5)).toEqual([5, 0, 1]);

    expect(() => vec3.coerce([1])).toThrow(TypeError);
    expect(() => vec3.coerce([1, 2, 3, 4])).toThrow(TypeError);
  });

  test('scale agrees with applying a scaling matrix', () => {
    // Pins `Vec3` against `Mat3` rather than against itself, so a shared
    // misunderstanding of the index order would have to be present in both.
    const v = vec3.direction(2, 5);

    expect(vec3.scale(v, 3)).toEqual(mat3.apply(mat3.scaling(3, 3), v));
  });

  test('add agrees with applying a translation to a point', () => {
    const point = vec3.point(2, 5);
    const offset = vec3.direction(10, -3);

    expect(vec3.add(point, offset)).toEqual(
      mat3.apply(mat3.translation(10, -3), point),
    );
  });

  test('subtracting two points gives the direction between them', () => {
    // `w` cancels to zero, which is the property that lets a separation be
    // rotated but not translated.
    const separation = vec3.subtract(vec3.point(7, 1), vec3.point(3, 4));

    expect(separation).toEqual([4, -3, 0]);
    expect(vec3.planarLength(separation)).toBe(5);
  });
});
