import * as mat3 from './Mat3';
import CircleDecal from './CircleDecal';
import { faker } from '@faker-js/faker';
import Frame from './Frame';
import React from 'react';
import RotationalFrame from './RotationalFrame';
// `react-test-renderer` ships no types and `@types/react-test-renderer` is
// deprecated for React 19; the shim in `src/types/` declares what is used here.
import renderer from 'react-test-renderer';
import Scene from './Scene';
import TrackFrame from './TrackFrame';
import { DEFAULT_GRAVITY } from './Scene';

describe('Scene queries', () => {
  // `TrackFrame` and `RotationalFrame`, not the base `Frame`, whose
  // `getLocalPosMatrix` returns the identity regardless of `q` *and* of
  // `position` -- a scene built from those would make every assertion here
  // hold whatever the implementation did.
  //
  // `root` also carries a non-zero `initialState`, so the two candidate
  // fallbacks for an absent frame -- its authored coordinate, or zero -- give
  // different answers. That is the difference these tests exist to pin.
  const build = () =>
    new Scene({
      frames: [
        new TrackFrame({
          id: 'root',
          initialState: [7, 0],
          frames: [
            new RotationalFrame({ id: 'child', position: [3, 4] }),
          ],
        }),
      ],
    });

  test('the queries reject a frame id the scene does not contain', () => {
    // This also asserted that no tensor was orphaned on these paths, which was
    // a live concern when a pose map was an owned resource -- it caught two
    // real leaks. Nothing is owned now: the queries return plain tuples, so
    // only the rejection is left to pin.
    const scene = build();

    expect(scene.getWorldPosition('child', [1, 2])).toHaveLength(2);
    expect(scene.getLocalPosition('child', [1, 2])).toHaveLength(2);
    expect(
      scene.getSeparation('root', [0, 0], 'child', [1, 2]).distance,
    ).toBeGreaterThan(0);

    expect(() => scene.getWorldPosition('nope')).toThrow(/No such frame/);
    expect(() => scene.getLocalPosition('nope')).toThrow(/No such frame/);
    expect(() => scene.getSeparation('root', [0, 0], 'nope')).toThrow(
      /No such frame/,
    );
  });

  test('getLocalPosition inverts getWorldPosition', () => {
    // A round trip through a real rotation *and* a real translation: `child` is
    // a `RotationalFrame` offset from a `TrackFrame` displaced by 7, so an
    // implementation that returned its argument would fail here.
    const scene = build();
    scene.frameMap.get('child')!.initialState = [0.9, 0];
    const local = [1.5, -2.25];
    const world = scene.getWorldPosition('child', local);
    expect(world[0]).not.toBeCloseTo(local[0], 2);
    expect(scene.getLocalPosition('child', world)).toEqual([
      expect.closeTo(local[0], 4),
      expect.closeTo(local[1], 4),
    ]);
  });

  test('an omitted state map and an empty one agree', () => {
    // The two fallbacks have to be the same fallback: a frame nobody mentioned
    // is read at its own `initialState`, whether the map is empty or absent.
    // `root` is the frame nobody mentions, and its authored 7 is what a
    // zero-coordinate fallback would silently discard.
    const scene = build();
    const omitted = scene.getWorldPosition('child', [1, 2]);
    expect(
      scene.getWorldPosition('child', [1, 2], { stateMap: new Map() }),
    ).toEqual(omitted);
    expect(
      scene.getWorldPosition('child', [1, 2], {
        stateMap: new Map([['child', [0, 0]]]),
      }),
    ).toEqual(omitted);
    // ...and the authored 7 is actually in the answer, so the assertions above
    // are not two ways of reading the same zero.
    expect(omitted[0]).toBeCloseTo(7 + 3 + 1, 4);
  });
});

describe('Scene class', () => {
  test('constructor with default arguments', () => {
    const scene = new Scene();
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
    const scene = (() => {
      frame3 = new Frame({ id: 'frame3' });
      frame2 = new Frame({ id: 'frame2' });
      frame1 = new Frame({ id: 'frame1', frames: [frame3, frame2] });
      frame0 = new Frame({ id: 'frame0', frames: [frame1] });
      return new Scene({
        frames: [frame0],
      });
    })();
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
    const xformMatrix = mat3.IDENTITY;
    const domElement = scene.getDomElement(stateMap, xformMatrix);
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
    const generateState = () => [faker.number.int(99999), faker.number.int(99999)];
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

  test('.toJsonObj method', () => {
    const scene = new Scene({ frames: [new Frame({ id: 'd34db33f' })] });
    const obj = scene.toJsonObj();
    expect(obj).toEqual({
      gravity: scene.gravity,
      frames: [
        {
          id: scene.frames[0].id,
          initialState: [0, 0],
          position: [0, 0],
          weights: [],
          frames: [],
          type: 'Frame',
          resistance: 0,
        },
      ],
    });
    expect(JSON.stringify(obj)).toEqual(
      '{"frames":[{"frames":[],"id":"d34db33f","initialState":[0,0],"position":[0,0],"resistance":0,"type":"Frame","weights":[]}],"gravity":10}',
    );
  });
});
