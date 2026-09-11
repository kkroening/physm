import Grid from './Grid';
import getViewXformMatrix from './../getViewXformMatrix';
import gridLines from './gridLines';
import { render } from '@testing-library/react';

/** 18 pixels to the unit, on a 400 by 300 pane, with the world's origin at its middle. */
const xformMatrix = getViewXformMatrix([0, 0], 18, [400, 300]);

/** The whole numbers from `from` to `to`, both included. */
function wholeNumbers(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, index) => from + index);
}

/** A line's two ends, as `[x1, y1, x2, y2]`. */
function endsOf(line: Element): number[] {
  return ['x1', 'y1', 'x2', 'y2'].map((name) =>
    Number(line.getAttribute(name)),
  );
}

describe('gridLines', () => {
  test('a line at every whole unit in view, where the view draws it', () => {
    const { vertical, horizontal } = gridLines(xformMatrix, [400, 300]);

    // 200 pixels either side of the middle is 11.1 units, and 150 is 8.3.
    expect(vertical.map(({ unit }) => unit)).toEqual(wholeNumbers(-11, 11));
    expect(horizontal.map(({ unit }) => unit)).toEqual(wholeNumbers(-8, 8));
    vertical.forEach(({ unit, at }) => {
      expect(at).toBeCloseTo(200 + 18 * unit, 9);
    });

    // The world is y-up and the screen y-down.
    horizontal.forEach(({ unit, at }) => {
      expect(at).toBeCloseTo(150 - 18 * unit, 9);
    });
  });

  test('with the world moved in the view, the units in view are the ones the pane shows', () => {
    // Moved 13.6 units left and 2.2 down: the pane shows x from 2.49 to
    // 24.71, and y from -6.13 to 10.53.
    const moved = getViewXformMatrix([-13.6, -2.2], 18, [400, 300]);
    const { vertical, horizontal } = gridLines(moved, [400, 300]);

    expect(vertical.map(({ unit }) => unit)).toEqual(wholeNumbers(3, 24));
    expect(horizontal.map(({ unit }) => unit)).toEqual(wholeNumbers(-6, 10));
    expect(vertical[0]!.at).toBeCloseTo(200 + 18 * (3 - 13.6), 9);
    expect(horizontal[0]!.at).toBeCloseTo(150 - 18 * (-6 - 2.2), 9);
  });
});

describe('Grid', () => {
  test("its lines cross the pane, and the world's axes are drawn apart", () => {
    const { container } = render(
      <svg>
        <Grid xformMatrix={xformMatrix} size={[400, 300]} />
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

    // Top to bottom at x = 3, and side to side at y = 2.
    expect(endsOf(container.querySelector('[data-x="3"]')!)).toEqual([
      254, 0, 254, 300,
    ]);
    expect(endsOf(container.querySelector('[data-y="2"]')!)).toEqual([
      0, 114, 400, 114,
    ]);
  });
});
