import * as mat3 from './Mat3';
import FixedFrame from './FixedFrame';
import Frame from './Frame';
import JsSolver from './JsSolver';
import RotationalFrame from './RotationalFrame';
import Scene from './Scene';
import TrackFrame from './TrackFrame';
import Weight from './Weight';
import WorldSpring from './WorldSpring';

describe('WorldSpring', () => {
  test('pulls its frame toward a direction in the world', () => {
    const spring = new WorldSpring(4, 0);

    expect(spring.torque(mat3.IDENTITY)).toBeCloseTo(0, 12);
    expect(spring.torque(mat3.rotation(0.5))).toBeCloseTo(-2, 12);
    expect(spring.torque(mat3.rotation(-0.5))).toBeCloseTo(2, 12);
  });

  test('reads the pose, not a coordinate, so a translation changes nothing', () => {
    const spring = new WorldSpring(4, 0);
    const moved = mat3.multiply(mat3.translation(9, -3), mat3.rotation(0.5));

    expect(spring.torque(moved)).toBeCloseTo(-2, 12);
  });

  test('takes the short way round to its rest', () => {
    // The rest and the frame on opposite sides of the half turn, which is the
    // only place the wrap shows: `orientation` already answers in `(-pi, pi]`,
    // so a rest of zero can never be more than a half turn away and a test
    // written there passes whether the difference is wrapped or not.
    const spring = new WorldSpring(1, 3);

    // `3 - (-3)` is 6, which is a fifth of a turn the other way.
    expect(spring.torque(mat3.rotation(-3))).toBeCloseTo(6 - 2 * Math.PI, 12);
  });

  test('serializes as what it is', () => {
    expect(new WorldSpring(2.5, 0.5).toJsonObj()).toEqual({
      stiffness: 2.5,
      restAngle: 0.5,
    });
  });
});

describe('a spring anchored to the world', () => {
  /** A mast that turns, carrying an arm with a world spring on it. */
  function crane({ mastTurns }: { mastTurns: boolean }): Scene {
    const arm = new RotationalFrame({
      id: 'arm',
      position: [4, 0],
      initialState: [0.3, 0],
      worldSprings: [new WorldSpring(45, 0)],
      weights: [new Weight(5, { position: [6, 0] })],
    });

    return new Scene({
      gravity: 0,
      frames: [
        mastTurns
          ? new RotationalFrame({
              id: 'mast',
              weights: [new Weight(9, { position: [4, 0] })],
              frames: [arm],
            })
          : new FixedFrame({ id: 'mast', frames: [arm] }),
      ],
    });
  }

  test('its torque is in every turning frame above it, not its own row alone', () => {
    // The whole of the conservative claim, asserted where it is decided. A
    // spring anchored to the world resists *any* rotation of the frame it is
    // on, and turning the mast turns the arm -- so `d(theta_world)/dq` is one
    // for the mast as well, and the same torque belongs in its row.
    //
    // A torque in the arm's row alone is a different device: a joint actuator
    // with a world-referenced set-point. That is physically real and is what a
    // gyro-levelled crane is, but it is not the gradient of any potential, so
    // it can put energy into a rig without bound.
    const scene = crane({ mastTurns: true });
    const solver = new JsSolver(scene, { rungeKutta: true });

    // Gravity is off, drag is zero and nothing is moving, so every other term
    // in the force vector vanishes and what is left is the spring alone.
    const [, forces] = solver._getSystemOfEquations(
      scene.getInitialStateMap(),
      null,
    );
    const torque = 45 * -0.3;

    expect(scene.sortedFrames.map(({ id }) => id)).toEqual(['mast', 'arm']);
    expect(forces[0]).toBeCloseTo(torque, 10);
    expect(forces[1]).toBeCloseTo(torque, 10);
  });

  test('a joint that slides carries the torque no further', () => {
    // `d(theta_world)/dq` is zero for a track: sliding a cart does not turn
    // what it carries, so a world spring below it says nothing in its row.
    const scene = new Scene({
      gravity: 0,
      frames: [
        new TrackFrame({
          id: 'cart',
          weights: [new Weight(9)],
          frames: [
            new RotationalFrame({
              id: 'arm',
              initialState: [0.3, 0],
              worldSprings: [new WorldSpring(45, 0)],
              weights: [new Weight(5, { position: [6, 0] })],
            }),
          ],
        }),
      ],
    });
    const solver = new JsSolver(scene, { rungeKutta: true });
    const [, forces] = solver._getSystemOfEquations(
      scene.getInitialStateMap(),
      null,
    );

    expect(scene.sortedFrames.map(({ id }) => id)).toEqual(['cart', 'arm']);
    expect(forces[0]).toBeCloseTo(0, 10);
    expect(forces[1]).toBeCloseTo(45 * -0.3, 10);
  });

  test('holds the arm horizontal whatever it hangs from', () => {
    // The claim a joint spring cannot make: the mast's own tilt is what the
    // arm has to cancel, so the answer depends on the pose and on nothing the
    // arm itself holds.
    const settled = (tilt: number, rest: number | null): number => {
      const scene = new Scene({
        gravity: 0,
        frames: [
          new FixedFrame({
            id: 'mast',
            angle: tilt,
            frames: [
              new RotationalFrame({
                id: 'arm',
                initialState: [0.9, 0],
                // Critical damping, `c = 2*sqrt(k*I) = 36`, so twenty seconds
                // leaves a residual far inside the window below.
                resistance: 36,
                ...(rest === null
                  ? {}
                  : { worldSprings: [new WorldSpring(18, rest)] }),
                weights: [new Weight(2, { position: [3, 0] })],
              }),
            ],
          }),
        ],
      });
      const solver = new JsSolver(scene, { rungeKutta: true });
      solver.tick(0.002, 10000);

      return solver.getStateMap().get('arm')![0];
    };

    for (const tilt of [0, 0.6, -1.1]) {
      expect(settled(tilt, 0)).toBeCloseTo(-tilt, 6);
    }

    // A quarter turn up from horizontal is still measured in the world.
    expect(settled(0.6, Math.PI / 4)).toBeCloseTo(Math.PI / 4 - 0.6, 6);

    // Without one the arm stays where it started: nothing acts on it.
    expect(settled(0.6, null)).toBeCloseTo(0.9, 6);
  });

  test('a frame whose coordinate does not turn refuses one', () => {
    const refusal = /whose coordinate does not turn/;

    // At run time rather than in the type, because the rule is about
    // `turnRate` and the *base* frame answers zero to it too -- so the check
    // has to exist whatever a subclass's options say, and stating it twice
    // would only be a second thing to keep in step.
    expect(
      () => new TrackFrame({ worldSprings: [new WorldSpring(1, 0)] }),
    ).toThrow(refusal);
    expect(
      () => new FixedFrame({ worldSprings: [new WorldSpring(1, 0)] }),
    ).toThrow(refusal);
    expect(() => new Frame({ worldSprings: [new WorldSpring(1, 0)] })).toThrow(
      refusal,
    );

    // And a frame that turns takes one.
    expect(
      () => new RotationalFrame({ worldSprings: [new WorldSpring(1, 0)] }),
    ).not.toThrow();
  });
});
