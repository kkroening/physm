import * as mat3 from './../Mat3';
import Grid from './Grid';
import getViewXformMatrix from './../getViewXformMatrix';
import gridLines, { gridStep } from './gridLines';
import { render } from '@testing-library/react';

/** 18 pixels to the unit, on a 400 by 300 pane, with the world's origin at its middle. */
const xformMatrix = getViewXformMatrix([0, 0], 18, [400, 300]);

/** The whole numbers from `from` to `to`, both included. */
function wholeNumbers(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, index) => from + index);
}

/** A value to a millionth, without the noise an inverse leaves. */
function near(value: number): number {
  return Math.round(value * 1e6) / 1e6 || 0;
}

/** A line's two ends, as `[x1, y1, x2, y2]`. */
function endsOf(line: Element): number[] {
  return ['x1', 'y1', 'x2', 'y2'].map((name) =>
    near(Number(line.getAttribute(name))),
  );
}

describe('gridStep', () => {
  test('a line at every unit, while they are far enough apart to read', () => {
    expect(gridStep(18)).toBe(1);
    expect(gridStep(12)).toBe(1);
  });

  test('a decade at a time as the view pulls back', () => {
    expect(gridStep(11)).toBe(10);
    expect(gridStep(4)).toBe(10);
    expect(gridStep(1.2)).toBe(10);
    expect(gridStep(1)).toBe(100);
  });

  test('never finer than a unit, however near the view', () => {
    expect(gridStep(120)).toBe(1);
    expect(gridStep(10000)).toBe(1);
  });

  test('its lines are never crowded, and no coarser than they need to be', () => {
    for (const scale of [1, 1.7, 4, 9, 11, 12, 18, 47, 119]) {
      const step = gridStep(scale);

      // Twelve pixels is the closest the grid draws two lines.
      expect(step * scale).toBeGreaterThanOrEqual(12);

      // And the step is the smallest that clears it: a decade finer would
      // have crowded them -- except at the floor of a whole unit.
      if (step > 1) {
        expect((step / 10) * scale).toBeLessThan(12);
      }
    }
  });
});

describe('gridLines', () => {
  test('a line at every whole unit in view, straight across the pane', () => {
    const { xLines, yLines } = gridLines(xformMatrix, [400, 300]);

    // 200 pixels either side of the middle is 11.1 units, and 150 is 8.3.
    expect(xLines.map(({ unit }) => unit)).toEqual(wholeNumbers(-11, 11));
    expect(yLines.map(({ unit }) => unit)).toEqual(wholeNumbers(-8, 8));

    // Bottom to top and left to right, the world being y-up and the screen
    // y-down.
    xLines.forEach(({ unit, from, to }) => {
      expect([...from, ...to].map(near)).toEqual([
        near(200 + 18 * unit),
        300,
        near(200 + 18 * unit),
        0,
      ]);
    });
    yLines.forEach(({ unit, from, to }) => {
      expect([...from, ...to].map(near)).toEqual([
        0,
        near(150 - 18 * unit),
        400,
        near(150 - 18 * unit),
      ]);
    });
  });

  test('with the world moved in the view, the units in view are the ones the pane shows', () => {
    // Moved 13.6 units left and 2.2 down: the pane shows x from 2.49 to
    // 24.71, and y from -6.13 to 10.53.
    const moved = getViewXformMatrix([-13.6, -2.2], 18, [400, 300]);
    const { xLines, yLines } = gridLines(moved, [400, 300]);

    expect(xLines.map(({ unit }) => unit)).toEqual(wholeNumbers(3, 24));
    expect(yLines.map(({ unit }) => unit)).toEqual(wholeNumbers(-6, 10));
    expect(xLines[0]!.from[0]).toBeCloseTo(200 + 18 * (3 - 13.6), 9);
    expect(yLines[0]!.from[1]).toBeCloseTo(150 - 18 * (-6 - 2.2), 9);
  });

  test('a turned grid runs along its own axes, over the whole pane', () => {
    const lattice = mat3.multiply(xformMatrix, mat3.rotation(Math.PI / 6));
    const { xLines, yLines } = gridLines(lattice, [400, 300]);

    // Turned by 30 degrees, the pane's corners reach 13.8 units along the
    // grid's x either way, and 12.8 along its y.
    expect(xLines.map(({ unit }) => unit)).toEqual(wholeNumbers(-13, 13));
    expect(yLines.map(({ unit }) => unit)).toEqual(wholeNumbers(-12, 12));

    // The line of x = 1 runs along the grid's y, which is the screen's
    // (-sin, -cos) of the turn, through the point a unit along its x.
    const { from, to } = xLines.find(({ unit }) => unit === 1)!;
    const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
    const [dx, dy] = [(to[0] - from[0]) / length, (to[1] - from[1]) / length];
    const [px, py] = [200 + 18 * Math.cos(Math.PI / 6), 150 - 9];

    expect(dx).toBeCloseTo(-Math.sin(Math.PI / 6), 9);
    expect(dy).toBeCloseTo(-Math.cos(Math.PI / 6), 9);
    expect((px - from[0]) * dy - (py - from[1]) * dx).toBeCloseTo(0, 9);
  });
});

describe('Grid', () => {
  test('pulled back, it steps to tens rather than flooding the pane', () => {
    // Four pixels to the unit: a line per unit would be four pixels apart and
    // five hundred of them across, so the grid draws tens, forty apart.
    const far = getViewXformMatrix([0, 0], 4, [400, 300]);
    const { container } = render(
      <svg>
        <Grid lattice={far} size={[400, 300]} />
      </svg>,
    );

    expect(
      [...container.querySelectorAll('.editor__grid-line[data-x]')].map(
        (line) => line.getAttribute('data-x'),
      ),
    ).toEqual([
      '-50',
      '-40',
      '-30',
      '-20',
      '-10',
      '10',
      '20',
      '30',
      '40',
      '50',
    ]);

    // The world's own axes are still drawn apart from the rest.
    expect(
      [...container.querySelectorAll('.editor__grid-axis')].map((line) => [
        line.getAttribute('data-x'),
        line.getAttribute('data-y'),
      ]),
    ).toEqual([
      ['0', null],
      [null, '0'],
    ]);

    // Ten units out is forty pixels right of the middle.
    expect(endsOf(container.querySelector('[data-x="10"]')!)).toEqual([
      240, 300, 240, 0,
    ]);
  });

  test("its lines cross the pane, and the grid's own axes are drawn apart", () => {
    const { container } = render(
      <svg>
        <Grid lattice={xformMatrix} size={[400, 300]} />
      </svg>,
    );

    expect(
      [...container.querySelectorAll('.editor__grid-axis')].map((line) => [
        line.getAttribute('data-x'),
        line.getAttribute('data-y'),
      ]),
    ).toEqual([
      ['0', null],
      [null, '0'],
    ]);

    // Every other unit in view: 22 across and 16 down.
    expect(container.querySelectorAll('.editor__grid-line')).toHaveLength(38);

    // Bottom to top at x = 3, and side to side at y = 2.
    expect(endsOf(container.querySelector('[data-x="3"]')!)).toEqual([
      254, 300, 254, 0,
    ]);
    expect(endsOf(container.querySelector('[data-y="2"]')!)).toEqual([
      0, 114, 400, 114,
    ]);
  });
});
