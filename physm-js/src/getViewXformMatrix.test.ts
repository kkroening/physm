import * as mat3 from './Mat3';
import * as vec3 from './Vec3';
import getViewXformMatrix from './getViewXformMatrix';

/** Where the world origin lands, in plot coordinates. */
function originAt(
  size: readonly [number, number],
  translation: readonly [number, number] = [0, 0],
  scale = 1,
): readonly number[] {
  return mat3.apply(getViewXformMatrix(translation, scale, size), vec3.ORIGIN);
}

describe('getViewXformMatrix', () => {
  test('centres the world origin on the plot, at any size', () => {
    // The bug this replaced: a hardcoded `(300, 300)` centre, which put the
    // scene below the bottom edge of any plot shorter than about 600px. The
    // sizes below are the ones the demo actually gets in a browser pane, where
    // it rendered blank.
    expect(originAt([100, 50])).toEqual([50, 25, 1]);
    expect(originAt([509, 212])).toEqual([254.5, 106, 1]);
    expect(originAt([466, 474])).toEqual([233, 237, 1]);
  });

  test('inverts the y axis, because the world is y-up and SVG is y-down', () => {
    const up = mat3.apply(
      getViewXformMatrix([0, 0], 2, [100, 100]),
      vec3.point(0, 3),
    );

    // Three units up in the world is six pixels *above* the centre.
    expect(up[1]).toBeCloseTo(50 - 6, 9);
    expect(up[0]).toBeCloseTo(50, 9);
  });

  test('pans and scales about the centre', () => {
    // `translation` moves the world under the view, so a scene shifted by `+4`
    // appears `4 * scale` to the right of centre.
    const panned = mat3.apply(
      getViewXformMatrix([4, 0], 3, [200, 200]),
      vec3.ORIGIN,
    );

    expect(panned[0]).toBeCloseTo(100 + 12, 9);
    expect(panned[1]).toBeCloseTo(100, 9);
  });

  test('degenerates to the corner at zero size, rather than throwing', () => {
    // What a plot that has not been measured -- or has been collapsed to
    // nothing by its flex container -- produces. Recorded because the hook
    // takes pains to keep it off the screen: it is reachable, and it is not an
    // error.
    expect(originAt([0, 0])).toEqual([0, 0, 1]);
  });
});
