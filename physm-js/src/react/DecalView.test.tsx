import * as mat3 from './../Mat3';
import BoxDecal from './../BoxDecal';
import CircleDecal from './../CircleDecal';
import DecalView from './DecalView';
import LineDecal from './../LineDecal';
import React from 'react';
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

  test('draws a solid box as one rect', () => {
    const rect = drawn(new BoxDecal({ width: 4, height: 2 }));

    expect(rect.tagName).toBe('rect');
    expect(attr(rect, 'width')).toBeCloseTo(4, 9);
    expect(attr(rect, 'height')).toBeCloseTo(2, 9);
  });

  test('draws an outlined box as one line per edge', () => {
    const group = drawn(new BoxDecal({ solid: false }));

    expect(group.tagName).toBe('g');
    expect(group.querySelectorAll('line')).toHaveLength(4);
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
