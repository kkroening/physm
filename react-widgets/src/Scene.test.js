import * as tf from './tfjs';
import CircleDecal from './CircleDecal';
import faker from 'faker';
import Frame from './Frame';
import React from 'react';
import renderer from 'react-test-renderer';
import Scene from './Scene';
import { checkTfMemory } from './testutils';
import { DEFAULT_GRAVITY } from './Scene';

describe('Scene class', () => {
  test('constructor with default arguments', () => {
    const scene = checkTfMemory(() => new Scene());
    expect(scene.decals).toEqual([]);
    expect(scene.frames).toEqual([]);
    expect(scene.springs).toEqual([]);
    expect(scene.constraints).toEqual([]);
    expect(scene.gravity).toEqual(DEFAULT_GRAVITY);
    expect(scene.sortedFrames).toEqual([]);
    expect(scene.frameMap).toEqual(new Map());
    expect(scene.frameIdParentMap).toEqual(new Map());
    expect(scene.frameIdPathMap).toEqual(new Map());
  });

  test('constructor with scene analysis', () => {
    let frame0;
    let frame1;
    let frame2;
    let frame3;
    const scene = checkTfMemory(() => {
      frame3 = new Frame({ id: 'frame3' });
      frame2 = new Frame({ id: 'frame2' });
      frame1 = new Frame({ id: 'frame1', frames: [frame3, frame2] });
      frame0 = new Frame({ id: 'frame0', frames: [frame1] });
      return new Scene({
        frames: [frame0],
      });
    });
    expect(scene.decals).toEqual([]);
    expect(scene.frames).toEqual([frame0]);
    expect(scene.springs).toEqual([]);
    expect(scene.constraints).toEqual([]);
    expect(scene.gravity).toEqual(DEFAULT_GRAVITY);
    expect(scene.sortedFrames).toEqual([frame0, frame1, frame2, frame3]);
    expect(scene.frameMap).toEqual(
      new Map([
        [frame0.id, frame0],
        [frame1.id, frame1],
        [frame2.id, frame2],
        [frame3.id, frame3],
      ]),
    );
    expect(scene.frameIdParentMap).toEqual(
      new Map([
        [frame0.id, null],
        [frame1.id, frame0.id],
        [frame2.id, frame1.id],
        [frame3.id, frame1.id],
      ]),
    );
    expect(scene.frameIdPathMap).toEqual(
      new Map([
        [frame0.id, [frame0.id]],
        [frame1.id, [frame0.id, frame1.id]],
        [frame2.id, [frame0.id, frame1.id, frame2.id]],
        [frame3.id, [frame0.id, frame1.id, frame3.id]],
      ]),
    );
  });

  test('.getDomElement method', () => {
    const scene = new Scene({
      frames: [
        new Frame({
          decals: [new CircleDecal({ radius: 7 })],
        }),
      ],
    });
    const stateMap = new Map();
    const xformMatrix = tf.eye(3);
    const domElement = checkTfMemory(() =>
      scene.getDomElement(stateMap, xformMatrix),
    );
    const rendered = renderer.create(<svg>{domElement}</svg>);
    expect(rendered.toJSON()).toEqual(
      renderer
        .create(
          <svg>
            <g className="scene">
              <g className="frame">
                <circle
                  className="plot__circle"
                  cx={0}
                  cy={0}
                  r={7}
                  fill="black"
                />
              </g>
            </g>
          </svg>,
        )
        .toJSON(),
    );
  });

  test('.getInitialStateMap method', () => {
    const generateState = () => [faker.random.number(), faker.random.number()];
    const frame1 = new Frame({
      id: 'frame1',
      initialState: generateState(),
    });
    const frame0 = new Frame({
      id: 'frame0',
      initialState: generateState(),
      frames: [frame1],
    });
    const scene = new Scene({
      frames: [frame0],
    });
    expect(scene.getInitialStateMap()).toEqual(
      new Map([
        [frame0.id, frame0.initialState],
        [frame1.id, frame1.initialState],
      ]),
    );
  });
});
