import * as mat3 from './Mat3';
import * as vec3 from './Vec3';
import CircleDecal from './CircleDecal';
import Frame from './Frame';
import TrackFrame from './TrackFrame';
import Weight from './Weight';
import type { ReactElement, SVGProps } from 'react';
import type { StateMap } from './Frame';
import { ZERO_STATE } from './State';

describe('Frame', () => {
  test('defaults to the origin, at rest, with nothing attached', () => {
    const frame = new Frame();

    expect(frame.position).toEqual(vec3.ORIGIN);
    expect(frame.decals).toEqual([]);
    expect(frame.weights).toEqual([]);
    expect(frame.frames).toEqual([]);
    expect(frame.resistance).toBe(0);
    expect(frame.initialState).toEqual([0, 0]);
  });

  test('generates an id when none is given, and keeps one that is', () => {
    expect(new Frame({ id: 'named' }).id).toBe('named');
    expect(new Frame().id).not.toBe(new Frame().id);
  });

  test('the base frame has no degree of freedom', () => {
    // Its local transform ignores `q` entirely, which is what makes it a
    // container rather than a joint.
    const frame = new Frame({ position: [3, 4] });

    expect(frame.getLocalPosMatrix(0)).toEqual(mat3.IDENTITY);
    expect(frame.getLocalPosMatrix(9)).toEqual(mat3.IDENTITY);
    expect(frame.getLocalVelMatrix(9)).toEqual(mat3.ZERO);
    expect(frame.getLocalAccelMatrix(9)).toEqual(mat3.ZERO);
  });

  test('renders its decals and children under one group', () => {
    const child = new Frame({ id: 'child', decals: [new CircleDecal()] });
    const frame = new Frame({
      id: 'root',
      decals: [new CircleDecal()],
      frames: [child],
    });

    const element = frame.getDomElement(new Map() as StateMap, mat3.IDENTITY);
    const [decals, children] = element.props.children as [unknown[], unknown[]];

    expect(element.props.className).toBe('frame');
    expect(decals).toHaveLength(1);
    expect(children).toHaveLength(1);
  });

  test('a frame absent from the state map renders at its own initialState', () => {
    // A `TrackFrame`, not a base `Frame`: the base ignores `q` entirely, so
    // both the fallback and a wrongly-zeroed read would render identically and
    // the assertion could not fail. Here `q` slides the frame along its axis,
    // which puts the answer in the rendered geometry.
    const frame = new TrackFrame({
      id: 'root',
      initialState: [7, 0],
      decals: [new CircleDecal({ radius: 1 })],
    });

    const cx = (stateMap: StateMap): number => {
      const element = frame.getDomElement(stateMap, mat3.IDENTITY);
      const [decals] = element.props.children as [
        ReactElement<SVGProps<SVGElement>>[],
        unknown[],
      ];

      return decals[0]!.props.cx as number;
    };

    // Absent from the map -- reads `initialState`, so the decal sits at 7.
    expect(cx(new Map())).toBeCloseTo(7);

    // Present in the map -- the map wins, so it sits at 2 instead.
    expect(cx(new Map([['root', [2, 0]]]) as StateMap)).toBeCloseTo(2);

    // And `ZERO_STATE` is not what an absent entry falls back to: were it, the
    // first assertion above would read 0 rather than 7.
    expect(cx(new Map([['root', ZERO_STATE]]) as StateMap)).toBeCloseTo(0);
  });

  test('serializes its shape, and its decals only when asked', () => {
    const frame = new Frame({
      id: 'root',
      position: [3, 4],
      resistance: 2,
      weights: [new Weight(5)],
      decals: [new CircleDecal()],
    });

    const json = frame.toJsonObj();
    expect(json).toMatchObject({
      id: 'root',
      position: [3, 4],
      resistance: 2,
      type: 'Frame',
    });
    expect(json.decals).toBeUndefined();
    expect(json.weights).toHaveLength(1);
  });
});
