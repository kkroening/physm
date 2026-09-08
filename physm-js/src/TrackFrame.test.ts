import * as mat3 from './Mat3';
import * as vec3 from './Vec3';
import TrackFrame from './TrackFrame';

describe('TrackFrame', () => {
  test('defaults to the origin, along +x, at rest', () => {
    const frame = new TrackFrame();

    expect(frame.position).toEqual(vec3.ORIGIN);
    expect(frame.angle).toBe(0);
    expect(frame.decals).toEqual([]);
    expect(frame.weights).toEqual([]);
    expect(frame.frames).toEqual([]);
    expect(frame.resistance).toBe(0);
    expect(frame.initialState).toEqual([0, 0]);
  });

  test('slides along its own axis, from its position', () => {
    const frame = new TrackFrame({ position: [3, -4], angle: Math.PI / 2 });
    const [x, y] = mat3.translationOf(frame.getLocalPosMatrix(5));

    // Angle π/2 means the track runs along +y, so `q = 5` moves 5 that way.
    expect(x).toBeCloseTo(3, 9);
    expect(y).toBeCloseTo(1, 9);
  });

  test('the velocity matrix is the derivative, and is constant in q', () => {
    const frame = new TrackFrame({ position: [3, -4], angle: 0.9 });
    const h = 1e-6;
    const difference = mat3.scale(
      mat3.subtract(frame.getLocalPosMatrix(h), frame.getLocalPosMatrix(-h)),
      1 / (2 * h),
    );

    expect(mat3.equals(frame.getLocalVelMatrix(0), difference, 1e-7)).toBe(true);
    expect(frame.getLocalVelMatrix(0)).toEqual(frame.getLocalVelMatrix(42));
  });

  test('the velocity matrix has no rotational part', () => {
    // The property a shared prismatic ancestor's constraint column depends on:
    // `V_i d = 0` for any separation, because the upper-left block is zero.
    const velocity = new TrackFrame({ angle: 0.9 }).getLocalVelMatrix(0);
    const separation = vec3.direction(3, -7);

    expect(mat3.apply(velocity, separation)).toEqual([0, 0, 0]);
  });

  test('carries its angle into the serialized form', () => {
    const json = new TrackFrame({ angle: 0.5 }).toJsonObj();

    expect(json.angle).toBe(0.5);
    expect(json.type).toBe('TrackFrame');
  });
});
