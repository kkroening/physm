import * as tf from './tfjs';
import faker from 'faker';
import CircleDecal from './CircleDecal';
import React from 'react';
import renderer from 'react-test-renderer';
import { areTensorsEqual } from './utils';
import { coercePositionVector } from './utils';
import { getScaleMatrix } from './utils';
import { ZERO_POS } from './utils';

describe('CircleDecal', () => {
  const SAMPLE_POS = coercePositionVector([
    faker.random.number(),
    faker.random.number(),
  ]);

  test('constructor', () => {
    const decal = new CircleDecal({
      position: SAMPLE_POS,
    });
    expect(areTensorsEqual(decal.position, SAMPLE_POS)).toBe(true);
  });

  test('.getDomElement method', () => {
    const decal = new CircleDecal({
      position: SAMPLE_POS,
    });
    const scale = 1.5;
    const xformMatrix = getScaleMatrix(scale);
    const rendered = renderer.create(
      <svg>{decal.getDomElement(xformMatrix)}</svg>,
    );
    expect(rendered.toJSON()).toEqual(
      renderer
        .create(
          <svg>
            <circle
              className="plot__circle"
              cx={decal.position.dataSync()[0] * scale}
              cy={decal.position.dataSync()[1] * scale}
              fill="black"
              r={decal.radius * scale}
            />
          </svg>,
        )
        .toJSON(),
    );
  });
});
