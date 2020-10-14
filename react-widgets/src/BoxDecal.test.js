import * as tf from './tfjs';
import faker from 'faker';
import BoxDecal from './BoxDecal';
import React from 'react';
import renderer from 'react-test-renderer';
import { areTensorsEqual } from './utils';
import { coercePositionVector } from './utils';
import { getScaleMatrix } from './utils';
import { ZERO_POS } from './utils';

describe('BoxDecal', () => {
  const SAMPLE_POS = coercePositionVector([
    faker.random.number(),
    faker.random.number(),
  ]);

  test('constructor', () => {
    const decal = new BoxDecal({
      position: SAMPLE_POS,
    });
    expect(areTensorsEqual(decal.position, SAMPLE_POS)).toBe(true);
  });

  test('.getDomElement method', () => {
    const posX = SAMPLE_POS.dataSync()[0];
    const posY = SAMPLE_POS.dataSync()[1];
    const width = faker.random.number();
    const height = faker.random.number();
    const decal = new BoxDecal({
      width: width,
      height: height,
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
            <g>
              <line
                className="plot__line"
                stroke="black"
                strokeWidth={decal.lineWidth * scale}
                x1={(posX - width / 2) * scale}
                y1={(posY - height / 2) * scale}
                x2={(posX + width / 2) * scale}
                y2={(posY - height / 2) * scale}
              />
              <line
                className="plot__line"
                stroke="black"
                strokeWidth={decal.lineWidth * scale}
                x1={(posX + width / 2) * scale}
                y1={(posY - height / 2) * scale}
                x2={(posX + width / 2) * scale}
                y2={(posY + height / 2) * scale}
              />
              <line
                className="plot__line"
                stroke="black"
                strokeWidth={decal.lineWidth * scale}
                x1={(posX + width / 2) * scale}
                y1={(posY + height / 2) * scale}
                x2={(posX - width / 2) * scale}
                y2={(posY + height / 2) * scale}
              />
              <line
                className="plot__line"
                stroke="black"
                strokeWidth={decal.lineWidth * scale}
                x1={(posX - width / 2) * scale}
                y1={(posY + height / 2) * scale}
                x2={(posX - width / 2) * scale}
                y2={(posY - height / 2) * scale}
              />
            </g>
          </svg>,
        )
        .toJSON(),
    );
  });
});
