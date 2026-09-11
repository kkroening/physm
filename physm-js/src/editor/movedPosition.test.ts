import * as mat3 from './../Mat3';
import * as vec3 from './../Vec3';
import getViewXformMatrix from './../getViewXformMatrix';
import movedPosition, { placedPosition } from './movedPosition';

/** Eighteen pixels to the unit, y up, centred on a 400 by 300 pane. */
const VIEW = getViewXformMatrix([0, 0], 18, [400, 300]);

describe('movedPosition', () => {
  test("a drag moves a position by the pointer's motion, in scene units", () => {
    expect(
      movedPosition(vec3.point(2, 3), VIEW, [100, 100], [118, 82]),
    ).toEqual([3, 4]);
  });

  test("it is read along the parent's axes, turned or not", () => {
    // Turned a quarter, the parent's x points up the screen.
    const turned = mat3.multiply(VIEW, mat3.rotation(Math.PI / 2));

    expect(movedPosition(vec3.ORIGIN, turned, [100, 100], [100, 82])).toEqual([
      1, 0,
    ]);
  });

  test('where the parent sits does not matter, only which way it faces', () => {
    const moved = mat3.multiply(VIEW, mat3.translation(5, -7));

    expect(movedPosition(vec3.ORIGIN, moved, [100, 100], [118, 82])).toEqual([
      1, 1,
    ]);
  });

  test('it is rounded to a hundredth', () => {
    expect(movedPosition(vec3.ORIGIN, VIEW, [0, 0], [7, 0])).toEqual([0.39, 0]);
  });
});

describe('placedPosition', () => {
  test("it puts the origin exactly on the target, along a turned parent's axes", () => {
    const turned = mat3.multiply(VIEW, mat3.rotation(Math.PI / 2));

    // Six pixels up the screen is a third of a unit along the parent's x --
    // kept to a billionth, where a drag's motion is rounded to a hundredth.
    expect(
      placedPosition(vec3.point(1, 0), turned, [200, 150], [200, 144]),
    ).toEqual([1.333333333, 0]);
  });
});
