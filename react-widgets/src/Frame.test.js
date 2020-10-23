import * as tf from './tfjs';
import CircleDecal from './CircleDecal';
import Frame from './Frame';
import LineDecal from './LineDecal';
import React from 'react';
import renderer from 'react-test-renderer';
import { areTensorsEqual } from './testutils';
import { checkTfMemory } from './testutils';

describe('Frame class', () => {
  test('constructor defaults', () => {
    const frame = checkTfMemory(() => new Frame());
    expect(frame.decals).toEqual([]);
    expect(frame.weights).toEqual([]);
    expect(frame.frames).toEqual([]);
    expect(frame.resistance).toEqual(0);
    expect(frame.initialState).toEqual([0, 0]);
  });

  test('.dispose method', () => {
    checkTfMemory(() => {
      new Frame().dispose();
    });
  });

  test('.getLocalPosMatrix method', () => {
    const frame = new Frame();
    const posMatrix = checkTfMemory(() => frame.getLocalPosMatrix(0));
    expect(areTensorsEqual(posMatrix, tf.eye(3))).toBe(true);
  });

  test('.getLocalVelMatrix method', () => {
    const frame = new Frame();
    const velMatrix = checkTfMemory(() => frame.getLocalVelMatrix(0));
    expect(areTensorsEqual(velMatrix, tf.zeros([3, 3]))).toBe(true);
  });

  test('.getLocalAccelMatrix method', () => {
    const frame = new Frame();
    const accelMatrix = checkTfMemory(() => frame.getLocalAccelMatrix(0));
    expect(areTensorsEqual(accelMatrix, tf.zeros([3, 3]))).toBe(true);
  });

  test('.getDomElement method', () => {
    const frame = new Frame({
      decals: [
        new LineDecal({ endPos: [10, 20] }),
        new CircleDecal({ radius: 7, color: 'purple' }),
      ],
      frames: [
        new Frame({ decals: [new CircleDecal({ radius: 5, color: 'blue' })] }),
      ],
    });
    const stateMap = new Map();
    const xformMatrix = tf.eye(3);
    const domElement = checkTfMemory(() =>
      frame.getDomElement(stateMap, xformMatrix),
    );
    const rendered = renderer.create(<svg>{domElement}</svg>);
    expect(rendered.toJSON()).toEqual(
      renderer
        .create(
          <svg>
            <g className="frame">
              <line
                className="plot__line"
                stroke="black"
                strokeWidth={1}
                x1={0}
                y1={0}
                x2={10}
                y2={20}
              />
              <circle
                className="plot__circle"
                cx={0}
                cy={0}
                fill="purple"
                r={7}
              />
              <g className="frame">
                <circle
                  className="plot__circle"
                  cx={0}
                  cy={0}
                  fill="blue"
                  r={5}
                />
              </g>
            </g>
          </svg>,
        )
        .toJSON(),
    );
  });
});
