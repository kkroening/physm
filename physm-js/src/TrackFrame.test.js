import * as tf from './tfjs';
import TrackFrame from './TrackFrame';
import { areTensorsEqual } from './testutils';
import { checkTfMemory } from './testutils';
import { ZERO_POS } from './utils';

describe('TrackFrame class', () => {
  test('constructor defaults', () => {
    const frame = checkTfMemory(() => new TrackFrame());
    expect(areTensorsEqual(frame.position, ZERO_POS)).toBe(true);
    expect(frame.angle).toEqual(0);
    expect(frame.decals).toEqual([]);
    expect(frame.weights).toEqual([]);
    expect(frame.frames).toEqual([]);
    expect(frame.resistance).toEqual(0);
    expect(frame.initialState).toEqual([0, 0]);
  });

  test('.dispose method', () => {
    checkTfMemory(() => {
      new TrackFrame().dispose();
    });
  });

  test('.getLocalPosMatrix method', () => {
    const frame = new TrackFrame();
    checkTfMemory(() => frame.getLocalPosMatrix(0));
  });

  test('.getLocalVelMatrix method', () => {
    const frame = new TrackFrame();
    checkTfMemory(() => frame.getLocalVelMatrix(0));
  });

  test('.getLocalAccelMatrix method', () => {
    const frame = new TrackFrame();
    checkTfMemory(() => frame.getLocalAccelMatrix(0));
  });

  test('.toJsonObj method', () => {
    const frame = new TrackFrame({
      angle: 12.34,
    });
    const obj = checkTfMemory(() => frame.toJsonObj());
    expect(obj).toEqual({
      angle: 12.34,
      frames: [],
      initialState: [0, 0],
      type: 'TrackFrame',
      position: [0, 0],
      id: frame.id,
      weights: [],
      resistance: 0,
    });
  });
});
