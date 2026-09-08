import * as mat3 from './../Mat3';
import BoxDecal from './../BoxDecal';
import CircleDecal from './../CircleDecal';
import DecalView from './DecalView';
import LineDecal from './../LineDecal';
import { render } from '@testing-library/react';
import type Decal from './../Decal';
import type { Mat3 } from './../Mat3';

/**
 * The DOM a decal view produces, as the one element it draws.
 *
 * `@testing-library/react` rather than `react-test-renderer`, which returns
 * `null` from `toJSON()` under React 19 -- silently, so a test built on it
 * compares `null` to `null` and passes against anything. The wrapping `<svg>`
 * is there because a decal view returns a bare SVG child with no root of its
 * own; `svg > *` then names the drawn element without assuming which tag it is.
 */
function drawn(decal: Decal, xformMatrix: Mat3 = mat3.IDENTITY): SVGElement {
  const { container } = render(
    <svg>
      <DecalView decal={decal} xformMatrix={xformMatrix} />
    </svg>,
  );
  const element = container.querySelector<SVGElement>('svg > *');
  if (!element) {
    throw new Error('decal view drew nothing');
  }

  return element;
}

/** A drawn attribute as a number, so a test can compare geometry. */
function attr(element: Element, name: string): number {
  return Number(element.getAttribute(name));
}

/**
 * The paint attributes, as the DOM spells them.
 *
 * Asserted alongside the geometry because they are the half a move like this
 * loses silently: dropping `stroke` or `fill` does not shift a shape, it
 * removes it from the picture entirely, and every geometry assertion still
 * passes. `class` and `stroke-width` are the DOM's names for the JSX's
 * `className` and `strokeWidth`.
 */
function paintOf(element: Element): Record<string, string | null> {
  return {
    class: element.getAttribute('class'),
    fill: element.getAttribute('fill'),
    stroke: element.getAttribute('stroke'),
    strokeWidth: element.getAttribute('stroke-width'),
  };
}

describe('DecalView', () => {
  test('draws a circle at the transformed centre, not the local one', () => {
    const circle = drawn(
      new CircleDecal({ position: [1, 2], radius: 3 }),
      mat3.translation(10, 20),
    );

    expect(circle.tagName).toBe('circle');
    expect(attr(circle, 'cx')).toBeCloseTo(11, 9);
    expect(attr(circle, 'cy')).toBeCloseTo(22, 9);
    expect(attr(circle, 'r')).toBeCloseTo(3, 9);
  });

  test('a circle carries its class and fill', () => {
    // A colour that is not the default, so a hardcoded `black` would fail here
    // rather than pass by coincidence.
    const circle = drawn(new CircleDecal({ color: 'rebeccapurple' }));

    expect(paintOf(circle)).toMatchObject({
      class: 'plot__circle',
      fill: 'rebeccapurple',
    });
  });

  test('draws a line between the transformed endpoints', () => {
    const line = drawn(
      new LineDecal({ endPos: [3, 4] }),
      mat3.translation(100, 200),
    );

    expect(line.tagName).toBe('line');
    expect([
      attr(line, 'x1'),
      attr(line, 'y1'),
      attr(line, 'x2'),
      attr(line, 'y2'),
    ]).toEqual([100, 200, 103, 204]);
  });

  test('a line carries its class, stroke and scaled stroke width', () => {
    // Non-default colour and width, under a scaling transform: `lineWidth`
    // times `scaleFactor` is the only place the view scale reaches a stroke,
    // and 2 x 5 distinguishes it from either factor alone.
    const line = drawn(
      new LineDecal({ endPos: [1, 0], lineWidth: 2, color: 'tomato' }),
      mat3.scaling(5, 5),
    );

    expect(paintOf(line)).toMatchObject({
      class: 'plot__line',
      stroke: 'tomato',
      strokeWidth: '10',
    });
  });

  test('draws a solid box as one polygon of its corners', () => {
    const polygon = drawn(new BoxDecal({ width: 4, height: 2 }));

    expect(polygon.tagName).toBe('polygon');

    // The corners themselves, not a width and a height: what is asserted is
    // where the box *lands*, which is what the `rect` this replaced got wrong.
    expect(polygon.getAttribute('points')).toBe('-2,-1 2,-1 2,1 -2,1');
  });

  test('a solid box lands where the box is, under any transform', () => {
    // `corners[3]` is the minimum-`y` corner only after a `y`-inverting
    // transform. `App.jsx` builds its view as `scaling(scale, -scale)`, so the
    // demo has always been in the correct case and this stayed latent.
    const solid = drawn(new BoxDecal({ width: 4, height: 2 }));
    const xs = [...solid.querySelectorAll('*'), solid]
      .flatMap((node) => (node.getAttribute('points') ?? '').split(/[\s,]+/))
      .filter((value) => value !== '')
      .map(Number);

    // A centred 4x2 box under the identity spans x in [-2, 2], y in [-1, 1].
    expect(Math.min(...xs.filter((_, i) => i % 2 === 0))).toBeCloseTo(-2, 9);
    expect(Math.max(...xs.filter((_, i) => i % 2 === 0))).toBeCloseTo(2, 9);
    expect(Math.min(...xs.filter((_, i) => i % 2 === 1))).toBeCloseTo(-1, 9);
    expect(Math.max(...xs.filter((_, i) => i % 2 === 1))).toBeCloseTo(1, 9);
  });

  test('a solid box respects its angle', () => {
    // An axis-aligned `rect` of `width` by `height` cannot express a rotation,
    // so a rotated solid box used to render square to the axes while the
    // outlined branch -- which draws the corners -- rotated correctly.
    const solid = drawn(
      new BoxDecal({ width: 4, height: 2, angle: Math.PI / 2 }),
    );
    const numbers = (solid.getAttribute('points') ?? '')
      .split(/[\s,]+/)
      .filter((value) => value !== '')
      .map(Number);
    const xs = numbers.filter((_, i) => i % 2 === 0);
    const ys = numbers.filter((_, i) => i % 2 === 1);

    // Turned a quarter turn, the 4-wide side is now the vertical one.
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(2, 6);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(4, 6);
  });

  test('draws an outlined box as one line per edge', () => {
    const group = drawn(new BoxDecal({ solid: false }));

    expect(group.tagName).toBe('g');
    expect(group.querySelectorAll('line')).toHaveLength(4);
  });

  test("an outlined box's edges carry class, stroke and scaled width", () => {
    const group = drawn(
      new BoxDecal({ solid: false, lineWidth: 3, color: 'seagreen' }),
      mat3.scaling(4, 4),
    );

    for (const edge of group.querySelectorAll('line')) {
      expect(paintOf(edge)).toMatchObject({
        class: 'plot__line',
        stroke: 'seagreen',
        strokeWidth: '12',
      });
    }
  });

  test('centred and quadrant-one boxes differ by half a side', () => {
    // The two corner sets are the only thing `centered` changes, so this is
    // what would catch them being swapped.
    const firstEdge = (centered: boolean): SVGElement =>
      drawn(
        new BoxDecal({ width: 2, height: 2, solid: false, centered }),
      ).querySelectorAll<SVGElement>('line')[0]!;

    expect(attr(firstEdge(true), 'x1')).toBeCloseTo(-1, 9);
    expect(attr(firstEdge(true), 'y1')).toBeCloseTo(-1, 9);
    expect(attr(firstEdge(false), 'x1')).toBeCloseTo(0, 9);
    expect(attr(firstEdge(false), 'y1')).toBeCloseTo(0, 9);
  });

  test('a box carries its corners through the transform, not its angle', () => {
    // Why `BoxDecal.corners` is public rather than the renderer rebuilding them
    // from `width`/`height`/`angle`. Those agree only when the transform is a
    // rotation and a uniform scale; a *reflection* -- which is what a y-down
    // screen transform is -- composes into `angle` wrongly. Reflecting a
    // quadrant-one unit box across `y` has to put its corners at negative `y`,
    // whatever the angle arithmetic would say.
    const group = drawn(
      new BoxDecal({ solid: false, centered: false }),
      mat3.scaling(1, -1),
    );
    const ys = [...group.querySelectorAll('line')].map((line) =>
      attr(line, 'y1'),
    );

    expect(Math.min(...ys)).toBeCloseTo(-1, 9);
    expect(Math.max(...ys)).toBeCloseTo(0, 9);
  });
});
