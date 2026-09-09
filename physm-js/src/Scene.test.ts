import * as vec3 from './Vec3';
import { faker } from '@faker-js/faker';
import Frame from './Frame';
import RotationalFrame from './RotationalFrame';
import Scene from './Scene';
import type { FrameId, StateMap } from './Frame';
import TrackFrame from './TrackFrame';
import Weight from './Weight';
import { CoincidenceConstraint } from './Constraint';
import { DimensionError, SingularMatrixError } from './solveLinearSystem';
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
          frames: [new RotationalFrame({ id: 'child', position: [3, 4] })],
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

  test('getSeparation measures frame origins when given two ids', () => {
    // The two-id overload is the ergonomic probe an interactive scene builder
    // wants -- "how far apart are these two frames?" should not require naming
    // two origins. Every other call site in the tree uses the four-argument
    // form, so without this the branch the overload exists to add is never
    // executed.
    const scene = build();

    expect(scene.getSeparation('root', 'child')).toEqual(
      scene.getSeparation('root', vec3.ORIGIN, 'child', vec3.ORIGIN),
    );

    // The options argument sits in a different position in the two forms, so
    // it is worth proving it still lands. That needs a scene whose separation
    // the state map can actually change: only a prismatic coordinate moves a
    // frame's own origin, and `child` rides `root`, so posing either leaves
    // this pair exactly where it was.
    const sliders = new Scene({
      frames: [
        new TrackFrame({ id: 'a' }),
        new TrackFrame({ id: 'b', position: [10, 0] }),
      ],
    });
    const posed: StateMap = new Map([['b', [4, 0]]]);

    expect(sliders.getSeparation('a', 'b', { stateMap: posed })).toEqual(
      sliders.getSeparation('a', vec3.ORIGIN, 'b', vec3.ORIGIN, {
        stateMap: posed,
      }),
    );

    // ...and that it is not simply being ignored by both.
    expect(sliders.getSeparation('a', 'b').distance).toBeCloseTo(10, 9);
    expect(
      sliders.getSeparation('a', 'b', { stateMap: posed }).distance,
    ).toBeCloseTo(14, 9);
  });

  test('getSeparation requires its second frame at compile time', () => {
    // Not a runtime assertion -- the assertion is that this file compiles.
    // `@ts-expect-error` fails the build if the error ever stops being an
    // error, which turns a one-off manual check into a standing one.
    //
    // It is the bug the overload pair replaced: a defaulted `frameId2` made the
    // parameter optional to the compiler, leaving a runtime sentinel as the
    // only thing requiring it.
    //
    // The runtime throw is named rather than merely allowed, because it is
    // *incidental*: with one argument `frameId2` binds to `undefined`, and the
    // complaint comes from the id-validation loop finding no such frame -- not
    // from any arity check. Spelling that out is what stops a later tidy-up of
    // that loop from failing here for a reason nobody can place. The call
    // cannot simply be left unasserted: it throws, and an uncaught throw fails
    // the test whatever the directive above says.
    const scene = build();

    // @ts-expect-error -- one id is not a valid call
    expect(() => scene.getSeparation('root')).toThrow(/No such frame/);
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

  test('.getInitialStateMap method', () => {
    const generateState = () => [
      faker.number.int(99999),
      faker.number.int(99999),
    ];
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

describe('Scene.getStabilizedState', () => {
  test('an unconstrained scene is returned untouched', () => {
    // Not merely "unchanged in value": the short-circuit returns the same
    // object, because there is no manifold to project onto and building a new
    // map would be work with nothing to show for it.
    const scene = new Scene({
      frames: [new TrackFrame({ id: 'root', initialState: [7, 3] })],
    });
    const stateMap = scene.getInitialStateMap();

    expect(scene.getStabilizedState(stateMap)).toBe(stateMap);
  });

  /**
   * Two poles off a cart, tips meeting, joined by `count` copies of one
   * coincidence constraint.
   *
   * Duplicated deliberately rather than posed at a singularity, because a pose
   * has to be hit to within floating-point tolerance and a test that has to hit
   * it is a test that stops hitting it. `elbow` adds a coordinate without
   * adding a row, which is what separates a rank-deficient scene from an
   * over-determined one -- and those two now want opposite answers.
   */
  function getDuplicatedScene({ elbow = false } = {}): Scene {
    const scene = new Scene({
      frames: [
        new TrackFrame({
          id: 'cart',
          weights: [new Weight(5)],
          frames: [
            new RotationalFrame({
              id: 'left',
              initialState: [0.6, 0],
              weights: [new Weight(4, { position: [10, 0] })],
              frames: elbow
                ? [
                    new RotationalFrame({
                      id: 'elbow',
                      position: [10, 0],
                      initialState: [0, 0],
                      weights: [new Weight(3, { position: [10, 0] })],
                    }),
                  ]
                : [],
            }),
            new RotationalFrame({
              id: 'right',
              position: [2 * 10 * Math.cos(0.6), 0],
              initialState: [Math.PI - 0.6, 0],
              weights: [new Weight(4, { position: [10, 0] })],
            }),
          ],
        }),
      ],
    });
    for (let copy = 0; copy < 2; copy++) {
      scene.addConstraint(
        // `position2` omitted, so `addConstraint` solves for wherever `right`
        // has to be touched for the constraint to hold in the authored pose.
        // Both copies get the same answer, which is the point: identical rows,
        // singular gram, and no geometry to keep in sync by hand.
        new CoincidenceConstraint({
          frame1: elbow ? 'elbow' : 'left',
          frame2: 'right',
          position1: [10, 0],
        }),
      );
    }

    return scene;
  }

  /** The same state, nudged off the manifold so a correction is attempted. */
  function nudge(scene: Scene): StateMap {
    return new Map(
      [...scene.getInitialStateMap()].map(
        ([frameId, [q, qd]]): [FrameId, [number, number]] => [
          frameId,
          [q + 0.05, qd],
        ],
      ),
    );
  }

  function violation(scene: Scene, stateMap: StateMap): number {
    const ctx = scene.getConfigKinematics(stateMap);

    return Math.max(
      ...scene.constraints.flatMap((constraint) =>
        constraint.value(ctx).map(Math.abs),
      ),
    );
  }

  /**
   * A three-coordinate rig with one coincidence constraint, posed off the
   * manifold and moving in a way the constraint does not admit.
   *
   * Both violations at once, and deliberately: the position half and the
   * velocity half correct different quantities, and a rig that violates only
   * one of them cannot tell which half did the work.
   */
  function getViolatedScene(): { scene: Scene; stateMap: StateMap } {
    const scene = new Scene({
      frames: [
        new TrackFrame({
          id: 'cart',
          weights: [new Weight(5)],
          frames: [
            new RotationalFrame({
              id: 'left',
              initialState: [0.6, 0],
              weights: [new Weight(4, { position: [10, 0] })],
            }),
            new RotationalFrame({
              id: 'right',
              position: [2 * 10 * Math.cos(0.6), 0],
              initialState: [Math.PI - 0.6, 0],
              weights: [new Weight(7, { position: [10, 0] })],
            }),
          ],
        }),
      ],
    }).addConstraint(
      new CoincidenceConstraint({
        frame1: 'left',
        frame2: 'right',
        position1: [10, 0],
      }),
    );

    return {
      scene,
      stateMap: new Map([
        ['cart', [0, 0]],
        ['left', [0.6 + 0.08, 0.5]],
        ['right', [Math.PI - 0.6, -0.2]],
      ]),
    };
  }

  /** `max|C|`, the quantity the position half drives to zero. */
  function positionResidual(scene: Scene, stateMap: StateMap): number {
    const ctx = scene.getConfigKinematics(stateMap);

    return Math.max(
      ...scene.constraints.flatMap((constraint) =>
        constraint.value(ctx).map(Math.abs),
      ),
    );
  }

  /** `max|J q̇|`, the quantity the velocity half drives to zero. */
  function velocityResidual(scene: Scene, stateMap: StateMap): number {
    const ctx = scene.getConfigKinematics(stateMap);
    const qd = scene.sortedFrames.map(
      (frame) => stateMap.get(frame.id)?.[1] ?? 0,
    );

    return Math.max(
      ...scene.constraints
        .flatMap((constraint) => constraint.jacobianRows(ctx))
        .map((row) =>
          Math.abs(
            row.reduce((total, entry, index) => total + entry * qd[index]!, 0),
          ),
        ),
    );
  }

  test('one call corrects the position and the velocity', () => {
    // Both residuals in one test, because the solvers only ever see the fixed
    // point of thousands of calls -- where the position half alone converges
    // to within three orders of the noise floor the acceptance bounds sit at,
    // and a missing velocity half is invisible. A single call is where the two
    // halves are still distinguishable.
    const { scene, stateMap } = getViolatedScene();

    // That the rig starts violated in both senses, so neither assertion below
    // can pass by having nothing to do.
    expect(positionResidual(scene, stateMap)).toBeGreaterThan(0.1);
    expect(velocityResidual(scene, stateMap)).toBeGreaterThan(0.1);

    const stabilized = scene.getStabilizedState(stateMap);

    // Measured: `1.9e-10` and `1.3e-15`, from `0.64` and `4.27`.
    //
    // The two land in different places, and the gap is the convergence test
    // rather than a weaker position solve: it stops on the *correction* falling
    // below `1e-5` of a coordinate, and Newton being quadratic puts `C` at
    // roughly the square of that. The velocity half has no iteration to stop,
    // so it goes to the last bit. Nine orders is a long way inside either
    // bound; what these two pin is that both halves ran.
    expect(positionResidual(scene, stabilized)).toBeLessThan(1e-8);
    expect(velocityResidual(scene, stabilized)).toBeLessThan(1e-12);
  });

  test('maxIterations bounds the Newton iteration', () => {
    // `C` is nonlinear, so one linearized step lands near the manifold rather
    // than on it, and the difference is what "this is a Newton step and it
    // iterates" means. Nothing else pins it: `applyStabilization` runs once per
    // integration step, so a solver iterating once per tick converges just as
    // well over 4000 ticks as one iterating four times.
    //
    // This is also the only caller `StabilizationOptions` has -- without it,
    // `tolerance` and `maxIterations` are unreachable surface.
    const { scene, stateMap } = getViolatedScene();

    const once = scene.getStabilizedState(stateMap, { maxIterations: 1 });
    const settled = scene.getStabilizedState(stateMap);

    // Measured, from `0.64`: `2.5e-2` after one step, `5.0e-5` after two,
    // `1.9e-10` after three, and no further -- the error squaring each time,
    // which is quadratic convergence doing what it says, until the correction
    // test stops it. Eight orders between one step and the default four.
    expect(positionResidual(scene, once)).toBeGreaterThan(1e-3);
    expect(positionResidual(scene, settled)).toBeLessThan(1e-8);
  });

  test('a rank-deficient Jacobian skips rather than throws', () => {
    // Two constraints saying the same thing about the same pair of points, so
    // `J` has duplicate rows and `Jg⁻¹Jᵀ` is singular -- while the row count
    // itself is fine, four rows against four coordinates. That is the shape of
    // the case this policy exists for: a chain pulled taut is collinear, which
    // is exactly when the gram matrix loses rank, and a hard-driven rope is
    // exactly when a chain goes taut. Throwing there would turn the stabilizer
    // into a crash in the one configuration it was added for.
    const scene = getDuplicatedScene({ elbow: true });
    const stateMap = nudge(scene);

    // Nudged off the manifold, so the stabilizer has a correction to attempt
    // and reaches the solve rather than returning early.
    expect(violation(scene, stateMap)).toBeGreaterThan(1e-3);

    // Identity, not equality: only the skip path returns the input object, so
    // this pins that the throw was caught rather than that the answer was zero.
    expect(scene.getStabilizedState(stateMap)).toBe(stateMap);
  });

  test('a structural failure propagates rather than becoming a silent no-op', () => {
    // The failure mode that makes the skip policy dangerous. Skipping is right
    // for a singular gram and wrong for everything else, and a `catch` with no
    // filter cannot tell them apart: a `dotRows` length mismatch, an indexed
    // accessor, a future bug in `jacobianRows` would all be swallowed, leaving
    // the stabilizer doing nothing and reporting nothing.
    //
    // That is worse than a crash, because it looks exactly like the bug the
    // stabilizer was added to remove -- the rig comes apart on schedule, and
    // the flag that was supposed to stop it is on.
    const { scene, stateMap } = getViolatedScene();

    // A mass matrix one row short: the shape a wrongly-sized assembly has.
    const truncated = scene.getMassMatrix(stateMap);
    scene.getMassMatrix = () => truncated.slice(1);

    expect(() => scene.getStabilizedState(stateMap)).toThrow(DimensionError);
  });

  test('a failure in the velocity half propagates too', () => {
    // The other half of the same policy, and it needs its own scene surgery:
    // the position solve has to *succeed* for the velocity `catch` to be
    // reached at all, so truncating the mass matrix -- which is how the test
    // above gets a structural failure -- kills the position half first and
    // never gets here.
    //
    // The path is not hypothetical. `_getProjectedVelocities` builds its
    // right-hand side with `dotRows(row, qd)`, which the position half never
    // runs; a length mismatch there is exactly the "Jacobian was assembled
    // wrong" failure, and it can only surface on this `catch`.
    const { scene, stateMap } = getViolatedScene();
    scene._getProjectedVelocities = () => {
      throw new TypeError('structural');
    };

    expect(() => scene.getStabilizedState(stateMap)).toThrow(TypeError);
  });

  test('a failure part-way through keeps the positions and the input velocities', () => {
    // The skip has three outcomes, and this is the one in the middle: the
    // Newton step walked into a singularity after already correcting something.
    //
    // What it must *not* do is re-project. The velocity half would solve at the
    // same `q` that just defeated the position solve, so it fails identically
    // and arrives back at this same answer one factorization later -- which is
    // what a `break` here bought, before this test existed to say so.
    const { scene, stateMap } = getViolatedScene();
    const solve = scene._solveMetricCorrection.bind(scene);
    let calls = 0;
    scene._solveMetricCorrection = (...args) => {
      calls += 1;
      if (calls > 1) {
        throw new SingularMatrixError('collinear');
      }

      return solve(...args);
    };

    const stabilized = scene.getStabilizedState(stateMap);

    // Exactly two solve calls: the one that worked, and the one that did not.
    // A third would mean the velocity half ran -- the wasted factorization this
    // branch exists to avoid.
    expect(calls).toBe(2);

    // The positions moved, so a correction really was kept rather than
    // discarded wholesale.
    expect(
      Math.max(
        ...scene.sortedFrames.map((frame) =>
          Math.abs(stabilized.get(frame.id)![0] - stateMap.get(frame.id)![0]),
        ),
      ),
    ).toBeGreaterThan(0.01);

    // And the velocities came back verbatim, which is the half of the contract
    // that is easy to state wrongly.
    expect(
      scene.sortedFrames.map((frame) => stabilized.get(frame.id)![1]),
    ).toEqual(scene.sortedFrames.map((frame) => stateMap.get(frame.id)![1]));
  });

  test('an over-determined scene throws rather than skipping', () => {
    // The same duplication without the elbow: four rows against three
    // coordinates. That is not a configuration the rig can move out of -- it is
    // how the scene was authored, and it will be just as broken on every
    // subsequent step. Skipping quietly would buy nothing and cost the author
    // the one message that says what they did.
    const scene = getDuplicatedScene();

    expect(scene.constraints.length * 2).toBeGreaterThan(
      scene.sortedFrames.length,
    );
    expect(() => scene.getStabilizedState(nudge(scene))).toThrow(
      /over-determined/,
    );
  });
});
