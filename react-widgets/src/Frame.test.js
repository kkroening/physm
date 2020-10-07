import * as tf from '@tensorflow/tfjs';
import CircleDecal from './CircleDecal';
import Frame from './Frame';
import LineDecal from './LineDecal';
import React from 'react';
import renderer from 'react-test-renderer';

describe('Frame', () => {
  test('constructor', () => {
    const frame = new Frame();
    expect(frame.decals).toEqual([]);
  });

  test('.render method', () => {
    const frame = new Frame({
      decals: [
        new LineDecal({ endPos: [10, 20] }),
        new CircleDecal({ radius: 7, color: 'purple' }),
      ],
    });
    const stateMap = {};
    const xformMatrix = tf.eye(3);
    const thing = renderer.create(
      <svg>{frame.getDomElement(stateMap, xformMatrix)}</svg>,
    );
    expect(thing.toJSON()).toEqual(
      renderer
        .create(
          <svg>
            <g className="frame">
              <line
                className="plot__line"
                stroke="k"
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
