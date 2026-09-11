import FixedFrame from './FixedFrame';
import JsSolver from './JsSolver';
import RotationalFrame from './RotationalFrame';
import Scene from './Scene';
import TrackFrame from './TrackFrame';
import Weight from './Weight';
import { CoincidenceConstraint } from './Constraint';

/** A pendulum, on a fixed frame at (2, 1) turned by 0.4 -- or placed there itself. */
function pendulum({ mounted }: { mounted: boolean }): Scene {
  const arm = (options: { position?: [number, number]; angle: number }) =>
    new RotationalFrame({
      id: 'arm',
      ...(options.position ? { position: options.position } : {}),
      initialState: [options.angle, 0.8],
      weights: [new Weight(2, { position: [3, 0] })],
    });

  return new Scene({
    frames: mounted
      ? [
          new FixedFrame({
            id: 'mount',
            position: [2, 1],
            angle: 0.4,
            frames: [arm({ angle: 0.3 })],
          }),
        ]
      : [arm({ position: [2, 1], angle: 0.7 })],
  });
}

describe('FixedFrame', () => {
  test('its transform is its position and angle, whatever its coordinate', () => {
    const frame = new FixedFrame({ position: [2, 1], angle: 0.4 });
    const [cos, sin] = [Math.cos(0.4), Math.sin(0.4)];

    expect(frame.getLocalPosMatrix(0)).toEqual([
      cos,
      -sin,
      2,
      sin,
      cos,
      1,
      0,
      0,
      1,
    ]);
    expect(frame.getLocalPosMatrix(3)).toEqual(frame.getLocalPosMatrix(0));
    expect(frame.getLocalVelMatrix(0)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(frame.getLocalAccelMatrix(0)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(frame.toJsonObj()).toMatchObject({
      type: 'FixedFrame',
      angle: 0.4,
      position: [2, 1],
      initialState: [0, 0],
    });
  });

  test('it is no joint, where the two joints are', () => {
    expect(new FixedFrame().isJoint()).toBe(false);
    expect(new RotationalFrame().isJoint()).toBe(true);
    expect(new TrackFrame().isJoint()).toBe(true);
  });

  test('a pendulum on a fixed frame swings as one placed there directly', () => {
    const mounted = new JsSolver(pendulum({ mounted: true }), {
      stabilize: false,
    });
    const direct = new JsSolver(pendulum({ mounted: false }), {
      stabilize: false,
    });
    for (let step = 0; step < 120; step++) {
      mounted.tick(1 / 60);
      direct.tick(1 / 60);
    }

    // The same world angle two ways: 0.4 of it on the fixed frame, or all of
    // it on the arm.
    const [q, qd] = mounted.getStateMap().get('arm')!;
    const [qDirect, qdDirect] = direct.getStateMap().get('arm')!;

    expect(q + 0.4).toBeCloseTo(qDirect, 9);
    expect(qd).toBeCloseTo(qdDirect, 9);
    expect(qd).not.toBeCloseTo(0.8, 1);

    // And the fixed frame's own coordinate never moved.
    expect(mounted.getStateMap().get('mount')).toEqual([0, 0]);
  });

  test('its coordinate gets the largest joint inertia, decoupled from the rest', () => {
    const scene = new Scene({
      frames: [
        new TrackFrame({
          id: 'cart',
          weights: [new Weight(20)],
          frames: [
            new FixedFrame({
              id: 'mount',
              position: [0, 2],
              frames: [
                new RotationalFrame({
                  id: 'arm',
                  weights: [new Weight(2, { position: [3, 0] })],
                }),
              ],
            }),
          ],
        }),
      ],
    });
    const at = (id: string): number =>
      scene.sortedFrames.findIndex((frame) => frame.id === id);
    const g = scene.getMassMatrix();
    const [cart, mount, arm] = [at('cart'), at('mount'), at('arm')];

    expect(g[mount]![cart]).toBe(0);
    expect(g[mount]![arm]).toBe(0);
    expect(g[arm]![mount]).toBe(0);
    expect(g[mount]![mount]).toBe(Math.max(g[cart]![cart]!, g[arm]![arm]!));
    expect(g[mount]![mount]).toBeGreaterThan(0);
  });

  test('with no joint to measure by, the inertia is one', () => {
    const scene = new Scene({ frames: [new FixedFrame({ id: 'mount' })] });

    expect(scene.getMassMatrix()).toEqual([[1]]);
  });

  test('a constraint row is counted against the joints, not every frame', () => {
    // A pendulum pinned by both coordinates of its tip: two rows against one
    // joint, however many fixed frames hold it up.
    const scene = new Scene({
      frames: [
        new FixedFrame({
          id: 'mount',
          frames: [
            new FixedFrame({
              id: 'plate',
              frames: [
                new RotationalFrame({
                  id: 'arm',
                  weights: [new Weight(2, { position: [3, 0] })],
                }),
              ],
            }),
          ],
        }),
      ],
    });
    scene.addConstraint(
      new CoincidenceConstraint({
        frame1: 'arm',
        frame2: 'mount',
        position1: [3, 0],
      }),
    );

    expect(() => scene.getStabilizedState(scene.getInitialStateMap())).toThrow(
      /over-determined: 2 constraint rows against 1 coordinates/,
    );
  });
});
