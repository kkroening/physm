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

  test('pulled back, it snaps to the step the grid draws, not to units', () => {
    // Four pixels to the unit: the grid steps to tens there, so tens are what
    // a drag lands on, and a unit is no longer a line to be caught by.
    const far = getViewXformMatrix([0, 0], 4, [400, 300]);

    // Two pixels short of ten units across.
    expect(griddedPosition(vec3.ORIGIN, far, [0, 0], [38, 0])).toEqual([10, 0]);

    // And half way between two of its lines is left where it is.
    expect(griddedPosition(vec3.ORIGIN, far, [0, 0], [20, 0])).toEqual([5, 0]);

    // The case that tells the two rules apart: all but on a whole unit, and
    // nowhere near a line the grid is drawing. Snapping to units would pull
    // this to three; snapping to the step leaves it alone.
    expect(griddedPosition(vec3.ORIGIN, far, [0, 0], [11.8, 0])).toEqual([
      2.95, 0,
    ]);
  });

  test('the cap follows the step rather than the unit', () => {
    // 1.3 pixels to the unit is the one regime where both rules are live at
    // once: the step is ten, its lines are thirteen pixels apart, and the
    // reach is a quarter of that -- 3.25 pixels rather than the full four.
    const wide = getViewXformMatrix([0, 0], 1.3, [400, 300]);

    // 8.5 units is 1.95 pixels from the line at ten, so it lands there. A cap
    // that ignored the step would allow only 0.325 pixels and leave this at
    // 8.5; a snap to whole units would give 9. One case, both rules out.
    expect(griddedPosition(vec3.ORIGIN, wide, [0, 0], [11.05, 0])).toEqual([
      10, 0,
    ]);
  });

  test('the reach is capped where the lines are closest, leaving half of each gap', () => {
    // Thirteen pixels to the unit, where the step is one -- so this pins the
    // cap in the regime the rule did *not* change: a quarter of the spacing,
    // 3.25 pixels, rather than the full four. (Twelve is the crowded end.)
    const close = getViewXformMatrix([0, 0], 13, [400, 300]);

    expect(griddedPosition(vec3.ORIGIN, close, [0, 0], [9.75, 0])).toEqual([
      1, 0,
    ]);
    expect(griddedPosition(vec3.ORIGIN, close, [0, 0], [9.7, 0])).toEqual([
      0.75, 0,
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
