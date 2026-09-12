import * as mat3 from './../Mat3';
import * as vec3 from './../Vec3';
import getViewXformMatrix from './../getViewXformMatrix';
import {
  HOME,
  MAX_SCALE,
  MIN_SCALE,
  VIEW_SCALE,
  isHome,
  pannedBy,
  zoomedAbout,
} from './viewChange';
import type { ScreenPoint } from './placeGizmos';
import type { View } from './viewChange';

const SIZE = [400, 300] as const;

/** Where a world point is drawn, under `view`. */
function drawnAt(view: View, [x, y]: readonly [number, number]): ScreenPoint {
  return vec3.toPlanar(
    mat3.apply(
      getViewXformMatrix(view.translation, view.scale, SIZE),
      vec3.point(x, y),
    ),
  );
}

/** The world point drawn at a place on screen, under `view`. */
function worldAt(view: View, [x, y]: ScreenPoint): readonly [number, number] {
  return vec3.toPlanar(
    mat3.apply(
      mat3.invert(getViewXformMatrix(view.translation, view.scale, SIZE)),
      vec3.point(x, y),
    ),
  );
}

describe('zoomedAbout', () => {
  test('the world point under the pointer stays under it', () => {
    // Well off the pane's centre, which is where zooming about the centre
    // instead would let it drift.
    const at: ScreenPoint = [330, 60];
    const before = worldAt(HOME, at);
    const zoomed = zoomedAbout(HOME, at, -240, SIZE);

    expect(zoomed.scale).toBeGreaterThan(HOME.scale);
    expect(drawnAt(zoomed, before)[0]).toBeCloseTo(at[0], 9);
    expect(drawnAt(zoomed, before)[1]).toBeCloseTo(at[1], 9);
  });

  test('it holds on the way out as well, and from a view already moved', () => {
    const moved: View = { translation: [-3.5, 1.25], scale: 40 };
    const at: ScreenPoint = [90, 250];
    const before = worldAt(moved, at);
    const zoomed = zoomedAbout(moved, at, 200, SIZE);

    expect(zoomed.scale).toBeLessThan(moved.scale);
    expect(drawnAt(zoomed, before)[0]).toBeCloseTo(at[0], 9);
    expect(drawnAt(zoomed, before)[1]).toBeCloseTo(at[1], 9);
  });

  test('the same notch is the same ratio, wherever it starts', () => {
    const near = zoomedAbout(
      { translation: [0, 0], scale: 10 },
      [200, 150],
      -100,
      SIZE,
    );
    const far = zoomedAbout(
      { translation: [0, 0], scale: 40 },
      [200, 150],
      -100,
      SIZE,
    );

    expect(near.scale / 10).toBeCloseTo(far.scale / 40, 9);
  });

  test('it stops at each end of the clamp, and does not drift there', () => {
    const out = zoomedAbout(
      { translation: [2, 2], scale: MIN_SCALE },
      [10, 10],
      5000,
      SIZE,
    );
    const into = zoomedAbout(
      { translation: [2, 2], scale: MAX_SCALE },
      [10, 10],
      -5000,
      SIZE,
    );

    expect([out.scale, into.scale]).toEqual([MIN_SCALE, MAX_SCALE]);

    // At the limit the factor is one, so a wheel that changes nothing must not
    // move the view sideways either.
    expect(out.translation).toEqual([2, 2]);
    expect(into.translation).toEqual([2, 2]);
  });

  test('a zoom that would overshoot lands on the limit rather than past it', () => {
    const zoomed = zoomedAbout(
      { translation: [0, 0], scale: MAX_SCALE / 2 },
      [200, 150],
      -5000,
      SIZE,
    );

    expect(zoomed.scale).toBe(MAX_SCALE);
  });
});

describe('pannedBy', () => {
  test('what was under the pointer stays under it', () => {
    const at: ScreenPoint = [120, 200];
    const before = worldAt(HOME, at);
    const panned = pannedBy(HOME, [40, -25]);

    expect(drawnAt(panned, before)[0]).toBeCloseTo(at[0] + 40, 9);
    expect(drawnAt(panned, before)[1]).toBeCloseTo(at[1] - 25, 9);
  });

  test('the scale is untouched, and y moves the other way', () => {
    const panned = pannedBy({ translation: [1, 1], scale: 20 }, [20, 20]);

    expect(panned).toEqual({ translation: [2, 0], scale: 20 });
  });
});

describe('isHome', () => {
  test('it is true only where nothing has moved', () => {
    expect(isHome(HOME)).toBe(true);
    expect(isHome({ translation: [0, 0], scale: VIEW_SCALE + 1 })).toBe(false);
    expect(isHome({ translation: [0.5, 0], scale: VIEW_SCALE })).toBe(false);
    expect(isHome({ translation: [0, -0.5], scale: VIEW_SCALE })).toBe(false);
  });
});
