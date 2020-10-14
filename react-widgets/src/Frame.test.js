import * as tf from './tfjs';
import CircleDecal from './CircleDecal';
import Frame from './Frame';
import LineDecal from './LineDecal';
import React from 'react';
import renderer from 'react-test-renderer';
import { areTensorsEqual } from './utils';

describe('Frame', () => {
  test('constructor defaults', () => {
    const frame = new Frame();
    expect(frame.decals).toEqual([]);
    expect(frame.weights).toEqual([]);
    expect(frame.frames).toEqual([]);
    expect(frame.resistance).toEqual(0);
    expect(frame.initialState).toEqual([0, 0]);
  });

  test('.getPosMatrix method', () => {
    const frame = new Frame();
    const posMatrix = frame.getPosMatrix(0);
    expect(areTensorsEqual(posMatrix, tf.eye(3))).toBe(true);
  });

  test('.getVelMatrix method', () => {
    const velMatrix = new Frame().getVelMatrix(0);
    expect(areTensorsEqual(velMatrix, tf.zeros([3, 3]))).toBe(true);
  });

  test('.getAccelMatrix method', () => {
    const accelMatrix = new Frame().getAccelMatrix(0);
    expect(areTensorsEqual(accelMatrix, tf.zeros([3, 3]))).toBe(true);
  });

  test('.getDomElement method', () => {
    const frame = new Frame({
      decals: [
        new LineDecal({ endPos: [10, 20] }),
        new CircleDecal({ radius: 7, color: 'purple' }),
      ],
    });
    const stateMap = {};
    const xformMatrix = tf.eye(3);
    const rendered = renderer.create(
      <svg>{frame.getDomElement(stateMap, xformMatrix)}</svg>,
    );
    expect(rendered.toJSON()).toEqual(
      renderer
        .create(
          <svg>
            <g className="frame">
              <line
                className="plot__line"
                stroke="black"
                strokeWidth={2}
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
            </g>
          </svg>,
        )
        .toJSON(),
    );
  });
});
