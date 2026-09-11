import * as mat3 from './../Mat3';
import * as vec3 from './../Vec3';
import getViewXformMatrix from './../getViewXformMatrix';
import movedPosition, {
  griddedPosition,
  placedPosition,
  positionGrid,
} from './movedPosition';
import type { Mat3 } from './../Mat3';

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

describe('griddedPosition', () => {
  test('a coordinate within four pixels of a whole unit snaps to it, each on its own', () => {
    // Three pixels short of a unit across, and seven short of one up.
    expect(griddedPosition(vec3.ORIGIN, VIEW, [0, 0], [15, -11])).toEqual([
      1, 0.61,
    ]);
  });

  test('four pixels is in reach, and a whisker more is not', () => {
    // A quarter of a unit is four pixels at 16 to the unit, exactly.
    const sixteen = getViewXformMatrix([0, 0], 16, [400, 300]);

    expect(griddedPosition(vec3.ORIGIN, sixteen, [0, 0], [12, 0])).toEqual([
      1, 0,
    ]);
    expect(griddedPosition(vec3.ORIGIN, sixteen, [0, 0], [11.9, 0])).toEqual([
      0.74, 0,
    ]);
  });

  test('its reach is in pixels, so in units it is finer the nearer the view', () => {
    const near = getViewXformMatrix([0, 0], 36, [400, 300]);

    // A sixth of a unit short of one: three pixels at 18 to the unit, and six
    // at 36.
    expect(griddedPosition(vec3.ORIGIN, VIEW, [0, 0], [15, 0])).toEqual([1, 0]);
    expect(griddedPosition(vec3.ORIGIN, near, [0, 0], [30, 0])).toEqual([
      0.83, 0,
    ]);
  });

  test("the whole units are the parent's, however it is turned and placed", () => {
    // Moved off the world's grid and turned a quarter, so its x points up the
    // screen and its y to the left. Sixteen pixels up and three right is 0.89
    // along its x and 0.17 against its y: two pixels from 2, and three from 0.
    const parent = mat3.multiply(
      mat3.multiply(VIEW, mat3.translation(0.3, 0.4)),
      mat3.rotation(Math.PI / 2),
    );

    expect(
      griddedPosition(vec3.point(1, 0), parent, [100, 100], [103, 84]),
    ).toEqual([2, 0]);
  });
});

describe('positionGrid', () => {
  test("each whole unit of a position is where the frame's origin goes with it", () => {
    const parent = mat3.multiply(VIEW, mat3.rotation(Math.PI / 6));
    const onScreen = (m: Mat3, x: number, y: number): readonly number[] =>
      vec3
        .toPlanar(mat3.apply(m, vec3.point(x, y)))
        .map((value) => Number(value.toFixed(9)));

    // An origin half a unit on from its position along the parent's x, as a
    // track frame's coordinate would slide it.
    const origin = onScreen(parent, 1.5, 0) as [number, number];
    const grid = positionGrid(vec3.point(1, 0), parent, origin);

    expect(onScreen(grid, 1, 0)).toEqual(origin);
    expect(onScreen(grid, 2, 0)).toEqual(onScreen(parent, 2.5, 0));
    expect(onScreen(grid, 1, 1)).toEqual(onScreen(parent, 1.5, 1));
  });
});
