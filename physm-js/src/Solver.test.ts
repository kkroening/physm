import FixedFrame from './FixedFrame';
import JsSolver from './JsSolver';
import RotationalFrame from './RotationalFrame';
import RsSolver from './RsSolver';
import Scene from './Scene';
import type Solver from './Solver';
import TrackFrame from './TrackFrame';
import Weight from './Weight';
import { DistanceConstraint } from './Constraint';
import type Frame from './Frame';
import type { FrameId, StateMap } from './Frame';

/**
 * The tree scene: no loop closures, so both solvers assemble a plain `n`-by-`n`
 * system.
 */
function getTreeScene() {
  return new Scene({
    frames: [
      new TrackFrame({
        id: 'cart',
        initialState: [5, 1],
        weights: [new Weight(20), new Weight(3, { position: [0, 5] })],
        frames: [
          new RotationalFrame({
            id: 'pendulum1',
            initialState: [0.3, -1.2],
            weights: [new Weight(5, { position: [10, 0] })],
            frames: [
              new RotationalFrame({
                id: 'pendulum2',
                initialState: [-0.9, 1.8],
                position: [10, 0],
                weights: [new Weight(8, { position: [12, 0] })],
              }),
            ],
          }),
        ],
      }),
      new TrackFrame({
        id: 'ball',
        initialState: [0, -2],
        position: [30, 0],
        angle: Math.PI / 4,
        weights: [new Weight(5)],
      }),
    ],
  });
}

// Two poles rising from a cart, their tips roped together — the rig the demo
// scene draws. Mirrored geometry makes the rope's rest length exact, so the
// initial conditions are consistent by construction (`docs/constraints.md` §7);
// the unequal masses keep the motion from being a mirror image of itself, which
// would let a sign error cancel out.
const POLE_ANGLE = 0.6;
const POLE_LENGTH = 10;
const POLE_SPACING = 20;

/**
 * The constrained scene: a rope closes a loop the frame tree cannot express, so
 * both solvers assemble the augmented `(n + 1)`-by-`(n + 1)` saddle-point
 * system.
 */
function getRopeScene() {
  return new Scene({
    frames: [
      new TrackFrame({
        id: 'cart',
        initialState: [0, 1.5],
        weights: [new Weight(20)],
        frames: [
          new RotationalFrame({
            id: 'pole1',
            initialState: [POLE_ANGLE, 0],
            weights: [new Weight(4, { position: [POLE_LENGTH, 0] })],
          }),
          new RotationalFrame({
            id: 'pole2',
            initialState: [Math.PI - POLE_ANGLE, 0],
            position: [POLE_SPACING, 0],
            weights: [new Weight(7, { position: [POLE_LENGTH, 0] })],
          }),
        ],
      }),
    ],
  }).addConstraint(
    new DistanceConstraint({
      frame1: 'pole1',
      frame2: 'pole2',
      position1: [POLE_LENGTH, 0],
      position2: [POLE_LENGTH, 0],
      // Tip 1 sits at `L·cos θ`, tip 2 at `spacing − L·cos θ`; the gap between
      // them is the rope's rest length.
      length: POLE_SPACING - 2 * POLE_LENGTH * Math.cos(POLE_ANGLE),
    }),
  );
}

/** One integration step, as seen by a cross-validation's own extra checks. */
interface StepCheck {
  frameId: FrameId;
  newQ: number;
  newQd: number;
  curStateMap: StateMap;
  timeIndex: number;
}

function describeCrossValidation(
  sceneName: string,
  getScene: () => Scene,
  {
    checkStep = (_step: StepCheck): void => {},
    tolerance = 0.2,
  }: { checkStep?: (step: StepCheck) => void; tolerance?: number } = {},
) {
  describe(`Solver subclass cross-validation: ${sceneName}`, () => {
    const scene = getScene();
    const initialStateMap = scene.getInitialStateMap();

    async function loadRsWasmModule() {
      // TODO: find a better way to load physm-rs.
      return await import('../../physm-rs/nodepkg/physm_rs.js');
    }

    // `stabilize: false` on every arm, stated rather than inherited: this suite
    // compares the two *integrators*, and the stabilizer is one piece of
    // TypeScript both of them call.
    const solverInfos = [
      {
        name: 'JsSolver with rungeKutta=false',
        createSolver: () =>
          new JsSolver(scene, { rungeKutta: false, stabilize: false }),
      },
      {
        name: 'JsSolver with rungeKutta=true',
        createSolver: () =>
          new JsSolver(scene, { rungeKutta: true, stabilize: false }),
      },
      {
        name: 'RsSolver with rungeKutta=false',
        createSolver: async () =>
          new RsSolver(scene, await loadRsWasmModule(), {
            rungeKutta: false,
            stabilize: false,
          }),
      },
      {
        name: 'RsSolver with rungeKutta=true',
        createSolver: async () =>
          new RsSolver(scene, await loadRsWasmModule(), {
            rungeKutta: true,
            stabilize: false,
          }),
      },
    ];

    const stateMaps = solverInfos.map(() => [initialStateMap]);

    solverInfos.forEach((solverInfo, solverIndex) => {
      test(solverInfo.name, async () => {
        const solver = await solverInfo.createSolver();
        const MAX_TIME_INDEX = 50;
        const DELTA_TIME = 1 / 60;
        let curStateMap = initialStateMap;
        for (let timeIndex = 0; timeIndex < MAX_TIME_INDEX; timeIndex++) {
          const newStateMap = (() => {
            solver.tick(DELTA_TIME);
            return solver.getStateMap();
          })();
          stateMaps[solverIndex].push(curStateMap);
          expect(curStateMap).not.toEqual(newStateMap);
          [...newStateMap].forEach(([frameId, [newQ, newQd]]) => {
            expect(newQ).not.toBeNaN();
            expect(newQd).not.toBeNaN();
            checkStep({
              frameId,
              newQ,
              newQd,
              curStateMap,
              timeIndex,
            });
          });
          curStateMap = newStateMap;
        }
      });
    });

    const solver1Index = 0;
    const solver1Info = solverInfos[solver1Index];
    solverInfos.slice(1).forEach((solver2Info, solver2Index) => {
      solver2Index++;
      test(`Cross-validation: ${solver1Info.name} vs ${solver2Info.name}`, () => {
        const stateMaps1 = stateMaps[solver1Index];
        const stateMaps2 = stateMaps[solver2Index];
        expect(stateMaps1.length).toEqual(stateMaps2.length);
        for (let timeIndex = 0; timeIndex < stateMaps1.length; timeIndex++) {
          const stateMap1 = stateMaps1[timeIndex];
          const stateMap2 = stateMaps2[timeIndex];
          // Not `Object.keys`, which is `[]` for any `Map` and made this pass
          // against anything at all.
          expect([...stateMap1.keys()]).toEqual([...stateMap2.keys()]);
          scene.sortedFrames.forEach((frame: Frame) => {
            const [q1, qd1] = stateMap1.get(frame.id)!;
            const [q2, qd2] = stateMap2.get(frame.id)!;
            expect(Math.abs(q2 - q1)).toBeLessThan(tolerance);
            expect(Math.abs(qd2 - qd1)).toBeLessThan(tolerance);
          });
        }
      });
    });
  });
}

describeCrossValidation('tree scene', getTreeScene, {
  checkStep: ({ frameId, newQ, newQd, curStateMap, timeIndex }) => {
    const [q, qd] = curStateMap.get(frameId)!;
    if (timeIndex < 60) {
      expect(newQ).not.toBeCloseTo(q);
    }
    if (timeIndex < 15) {
      expect(newQd).not.toBeCloseTo(qd);
    }
    if (frameId == 'ball' || timeIndex >= 10) {
      // The ball accelerates quickly; skip the following expectations.
    } else {
      expect(Math.abs(newQ - q)).toBeLessThan(1);
      expect(Math.abs(newQd - qd)).toBeLessThan(1);
    }
  },
});

describeCrossValidation('rope scene', getRopeScene);

/**
 * Fixed frames where their placement shows in the motion: a bracket off a
 * turning arm, offset along it, turned again, and carrying a weight of its
 * own, with a joint beyond it; and a ramp fixed at an angle with a slider on
 * it.
 *
 * Under a pure translation a fixed frame's offset is invisible to the
 * dynamics, so a scene of those would pin only the angles. This one puts the
 * position, the angle and the weights of a fixed frame where a difference
 * between the two solvers would show.
 *
 * It starts at rest. The chain is a double pendulum in all but name, and given
 * velocities to begin with, the two integrators part company inside these
 * fifty steps -- which says nothing about whether the two *solvers* agree.
 */
function getFixedFrameScene() {
  return new Scene({
    frames: [
      new TrackFrame({
        id: 'cart',
        initialState: [1, 0],
        weights: [new Weight(20)],
        frames: [
          new RotationalFrame({
            id: 'arm',
            initialState: [0.3, 0],
            weights: [new Weight(5, { position: [6, 0] })],
            frames: [
              new FixedFrame({
                id: 'bracket',
                position: [4, 0],
                angle: 0.7,
                weights: [new Weight(10, { position: [2, 0] })],
                frames: [
                  new RotationalFrame({
                    id: 'tip',
                    initialState: [-0.4, 0],
                    weights: [new Weight(2, { position: [3, 0] })],
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
      new FixedFrame({
        id: 'ramp',
        position: [30, 0],
        angle: -Math.PI / 6,
        frames: [
          new TrackFrame({
            id: 'slider',
            initialState: [0, 0],
            weights: [new Weight(3)],
          }),
        ],
      }),
    ],
  });
}

describeCrossValidation('fixed-frame scene', getFixedFrameScene);

describe('stabilization', () => {
  async function loadRsWasmModule() {
    return await import('../../physm-rs/nodepkg/physm_rs.js');
  }

  /** `max|C|` over the rope scene's one constraint. */
  function violation(solver: Solver): number {
    const ctx = solver.scene.getConfigKinematics(solver.getStateMap());

    return Math.max(
      ...solver.scene.constraints.flatMap((constraint) =>
        constraint.value(ctx).map(Math.abs),
      ),
    );
  }

  function drive(solver: Solver, seconds: number): number {
    const deltaTime = 1 / 400;
    for (let step = 0; step < Math.round(seconds / deltaTime); step++) {
      // A square wave at the frequency the rig responds to, because idling is
      // easy mode: the same scene left alone drifts by about 1e-7, which any
      // stabilizer and no stabilizer both pass. Drift is something the solver
      // is *driven* into.
      const sign =
        Math.sin(2 * Math.PI * 0.35 * step * deltaTime) >= 0 ? 1 : -1;
      solver.tick(deltaTime, 1, new Map([['cart', sign * 600]]));
    }

    return violation(solver);
  }

  // Both classes, because they now stabilize by *different code*: `JsSolver`
  // corrects in TypeScript inside its own loop, `RsSolver` in Rust inside the
  // wasm tick loop. Nothing structural stops those two from disagreeing, so the
  // agreement is a thing to test rather than a thing to assume.
  const solverKinds = [
    {
      name: 'JsSolver',
      create: async (stabilize: boolean) =>
        new JsSolver(getRopeScene(), { rungeKutta: true, stabilize }),
    },
    {
      name: 'RsSolver',
      create: async (stabilize: boolean) =>
        new RsSolver(getRopeScene(), await loadRsWasmModule(), {
          rungeKutta: true,
          stabilize,
        }),
    },
  ];

  test('stabilization is on unless a caller turns it off', async () => {
    // The default itself, which nothing else pins: the two tests below build
    // their solvers with an explicit flag, so they would go on passing whichever
    // way this points. `docs/issues/0013.md` records why it points here -- an
    // unstabilized rig looks right for a minute and then comes apart, which is
    // a worse thing to get by not thinking than a solve per step.
    expect(new JsSolver(getRopeScene()).stabilize).toBe(true);
    expect(
      new RsSolver(getRopeScene(), await loadRsWasmModule()).stabilize,
    ).toBe(true);
  });

  test('RsSolver takes the same number of steps however tickCount is split', async () => {
    // `RsSolver` hands the whole `tickCount` to wasm, so one call of N has to
    // land where N calls of one do. The stabilized arm is the one that says the
    // correction inside that call is still per *step* rather than per batch.
    // Nothing else in the suite passes a `tickCount` above 1 at all, and the demo
    // passes one computed from the frame delta.
    for (const stabilize of [false, true]) {
      const wasm = await loadRsWasmModule();
      const batched = new RsSolver(getRopeScene(), wasm, {
        rungeKutta: true,
        stabilize,
      });
      const stepped = new RsSolver(getRopeScene(), wasm, {
        rungeKutta: true,
        stabilize,
      });
      const initial = getRopeScene().getInitialStateMap();

      batched.tick(1 / 400, 200, null);
      for (let step = 0; step < 200; step++) {
        stepped.tick(1 / 400, 1, null);
      }

      const a = batched.getStateMap();
      const b = stepped.getStateMap();

      // That the rig actually moved, so this is not two identical initial
      // states agreeing for the least interesting reason.
      expect(
        Math.max(
          ...[...a].map(([id, [q]]) => Math.abs(q - initial.get(id)![0])),
        ),
      ).toBeGreaterThan(0.01);

      expect([...a].map(([id, [q, qd]]) => [id, q, qd])).toEqual(
        [...b].map(([id, [q, qd]]) => [id, q, qd]),
      );
    }
  });

  test('the two stabilizers hold a driven rig to the same trajectory', async () => {
    // The agreement between two *implementations* of projection, one in
    // TypeScript and one in Rust, on a rig driven hard enough that the
    // stabilizer is doing continuous work rather than nothing.
    //
    // The cross-validation suite above cannot cover this: it pins
    // `stabilize: false` on every arm precisely so it compares integrators.
    const js = new JsSolver(getRopeScene(), { rungeKutta: true });
    const rs = new RsSolver(getRopeScene(), await loadRsWasmModule(), {
      rungeKutta: true,
    });

    expect(js.stabilize).toBe(true);
    expect(rs.stabilize).toBe(true);

    const deltaTime = 1 / 400;
    // Separate accumulators for `q` and `q̇`. The divergence this test was written
    // for lived in the velocity half and reached position only through
    // `deltaTime` and four thousand steps of integration -- so a velocity
    // difference that cancels over a drive cycle would leave almost no position
    // signature. And they get their own bounds because holding a `q` and a `q̇` to
    // one threshold is the unit conflation the per-coordinate convergence floor
    // exists to avoid.
    let worstPosition = 0;
    let worstVelocity = 0;
    for (let step = 0; step < Math.round(10 / deltaTime); step++) {
      const sign =
        Math.sin(2 * Math.PI * 0.35 * step * deltaTime) >= 0 ? 1 : -1;
      const force = new Map([['cart', sign * 600]]);
      js.tick(deltaTime, 1, force);
      rs.tick(deltaTime, 1, force);
      const a = js.getStateMap();
      const b = rs.getStateMap();
      for (const [frameId, [q, qd]] of a) {
        const [otherQ, otherQd] = b.get(frameId)!;
        worstPosition = Math.max(worstPosition, Math.abs(q - otherQ));
        worstVelocity = Math.max(worstVelocity, Math.abs(qd - otherQd));
      }
    }

    // The rig moved, so this is two trajectories rather than two rigs at rest.
    expect(
      Math.max(
        ...[...js.getStateMap()].map(([frameId, [q]]) =>
          Math.abs(q - getRopeScene().getInitialStateMap().get(frameId)![0]),
        ),
      ),
    ).toBeGreaterThan(0.1);

    expect(worstPosition).toBeLessThan(1e-8);
    expect(worstVelocity).toBeLessThan(1e-6);
    expect(violation(js)).toBeLessThan(1e-10);
    expect(violation(rs)).toBeLessThan(1e-10);
  });

  solverKinds.forEach((kind) => {
    test(`${kind.name}: unstabilized, the drift the drive leaves is real`, async () => {
      const solver = await kind.create(false);

      expect(solver.stabilize).toBe(false);

      // Measured: 3.4e-4 for `JsSolver`, and the same order for `RsSolver` --
      // the two integrate the same equations and diverge only through
      // floating-point ordering. The lower bound is what makes the test below
      // mean something: a drive that failed to excite the rig would leave
      // nothing to correct, and a do-nothing stabilizer would pass.
      expect(drive(solver, 25)).toBeGreaterThan(1e-5);
    });

    test(`${kind.name}: stabilized -- the default -- the same drive leaves nothing`, async () => {
      const solver = await kind.create(true);

      expect(solver.stabilize).toBe(true);

      // Measured: 1.9e-14 and 3.7e-14 -- the last few bits of a length squared,
      // which is where projection lands rather than where it is asked to land.
      // Nine orders below the bound above, so the two assertions cannot both
      // hold by accident.
      expect(drive(solver, 25)).toBeLessThan(1e-10);
    });
  });
});
