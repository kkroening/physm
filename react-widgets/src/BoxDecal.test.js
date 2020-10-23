import * as tf from './tfjs';
import BoxDecal from './BoxDecal';
import faker from 'faker';
import React from 'react';
import renderer from 'react-test-renderer';
import { areTensorsEqual } from './testutils';
import { checkTfMemory } from './testutils';
import { coercePositionVector } from './utils';
import { getScaleMatrix } from './utils';
import { ZERO_POS } from './utils';

describe('BoxDecal class', () => {
  const SAMPLE_POS = coercePositionVector([
    faker.random.number(),
    faker.random.number(),
  ]);

  test('constructor', () => {
    const decal = checkTfMemory(
      () =>
        new BoxDecal({
          position: SAMPLE_POS,
        }),
    );
    expect(areTensorsEqual(decal.position, SAMPLE_POS)).toBe(true);
  });

  test('.dispose method', () => {
    checkTfMemory(() => {
      new BoxDecal({
        position: SAMPLE_POS,
      }).dispose();
    });
  });

  test('.getDomElement method with non-solid rendering', () => {
    const posX = SAMPLE_POS.dataSync()[0];
    const posY = SAMPLE_POS.dataSync()[1];
    const width = faker.random.number();
    const height = faker.random.number();
    const decal = new BoxDecal({
      width: width,
      height: height,
      position: SAMPLE_POS,
      solid: false,
    });
    const scale = 1.5;
    const xformMatrix = getScaleMatrix(scale);
    const domElement = checkTfMemory(() => decal.getDomElement(xformMatrix));
    const rendered = renderer.create(<svg>{domElement}</svg>);
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

  test('.getDomElement method with solid rendering', () => {
    const posX = SAMPLE_POS.dataSync()[0];
    const posY = SAMPLE_POS.dataSync()[1];
    const width = faker.random.number();
    const height = faker.random.number();
    const decal = new BoxDecal({
      width: width,
      height: height,
      position: SAMPLE_POS,
      solid: true,
    });
    const scale = 1.5;
    const xformMatrix = getScaleMatrix(scale);
    const domElement = checkTfMemory(() => decal.getDomElement(xformMatrix));
    const rendered = renderer.create(<svg>{domElement}</svg>);
    expect(rendered.toJSON()).toEqual(
      renderer
        .create(
          <svg>
            <rect
              x={(posX - width / 2) * scale}
              y={(posY + height / 2) * scale}
              width={width * scale}
              height={height * scale}
            />
          </svg>,
        )
        .toJSON(),
    );
  });
});
