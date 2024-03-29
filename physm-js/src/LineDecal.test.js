import * as tf from './tfjs';
import faker from 'faker';
import LineDecal from './LineDecal';
import React from 'react';
import renderer from 'react-test-renderer';
import { areTensorsEqual } from './testutils';
import { checkTfMemory } from './testutils';
import { coercePositionVector } from './utils';
import { getScaleMatrix } from './utils';
import { ZERO_POS } from './utils';

describe('LineDecal class', () => {
  const SAMPLE_POS = coercePositionVector([
    faker.random.number(),
    faker.random.number(),
  ]);

  test('constructor', () => {
    const decal = checkTfMemory(
      () =>
        new LineDecal({
          endPos: SAMPLE_POS,
        }),
    );
    expect(areTensorsEqual(decal.startPos, ZERO_POS)).toBe(true);
    expect(areTensorsEqual(decal.endPos, SAMPLE_POS)).toBe(true);
  });

  test('.dispose method', () => {
    checkTfMemory(() => {
      new LineDecal({
        endPos: SAMPLE_POS,
      }).dispose();
    });
  });

  test('.getDomElement method', () => {
    const decal = new LineDecal({
      endPos: SAMPLE_POS,
    });
    const scale = 1.5;
    const xformMatrix = getScaleMatrix(scale);
    const domElement = checkTfMemory(() => decal.getDomElement(xformMatrix));
    const rendered = renderer.create(<svg>{domElement}</svg>);
    expect(rendered.toJSON()).toEqual(
      renderer
        .create(
          <svg>
            <line
              className="plot__line"
              stroke="black"
              strokeWidth={decal.lineWidth * scale}
              x1={0}
              y1={0}
              x2={decal.endPos.dataSync()[0] * scale}
              y2={decal.endPos.dataSync()[1] * scale}
            />
          </svg>,
        )
        .toJSON(),
    );
  });
});
