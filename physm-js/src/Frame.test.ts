import * as mat3 from './Mat3';
import * as vec3 from './Vec3';
import CircleDecal from './CircleDecal';
import Frame from './Frame';
import Spring from './Spring';
import Weight from './Weight';

describe('Frame', () => {
  test('defaults to the origin, at rest, with nothing attached', () => {
    const frame = new Frame();

    expect(frame.position).toEqual(vec3.ORIGIN);
    expect(frame.decals).toEqual([]);
    expect(frame.weights).toEqual([]);
    expect(frame.springs).toEqual([]);
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

describe("a frame's springs", () => {
  test('add, so several are one of their summed stiffness', () => {
    // The property that makes the list shape cost nothing today: while every
    // spring is linear, `[k1, k2]` and `[k1 + k2]` are the same spring. It is
    // also the property that stops holding the moment one is not linear,
    // which is the reason the list exists.
    const several = new Frame({ springs: [new Spring(3), new Spring(5)] });
    const one = new Frame({ springs: [new Spring(8)] });

    for (const q of [0, 0.4, -1.7]) {
      expect(several.springForce(q)).toBeCloseTo(one.springForce(q), 12);
    }
  });

  test('a frame with none is a frame with no spring force', () => {
    expect(new Frame().springs).toEqual([]);
    expect(new Frame().springForce(2)).toBe(0);
  });

  test('reach the frame through its own serialization', () => {
    expect(
      new Frame({ id: 'a', springs: [new Spring(6, 0.25)] }).toJsonObj()
        .springs,
    ).toEqual([{ stiffness: 6, rest: 0.25 }]);
  });
});
