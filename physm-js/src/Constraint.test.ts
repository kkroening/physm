import * as mat3 from './Mat3';
import JsSolver from './JsSolver';
import RotationalFrame from './RotationalFrame';
import Scene from './Scene';
import TrackFrame from './TrackFrame';
import Weight from './Weight';
import { CoincidenceConstraint, DistanceConstraint } from './Constraint';
import { DimensionError } from './solveLinearSystem';
import type { FrameId, StateMap } from './Frame';
import type { State } from './State';

// A branched rig: two poles rising from one cart, so the two attachment points
// have root paths that share a prefix (`cart`) and then diverge. Anything that
// confuses a frame's position along a path with its index into the system —
// physm-py's 2019 constraint code did exactly that — produces the right answer
// on a straight chain and the wrong one here.
/** A frame this fixture just built; a miss means the fixture is wrong. */
function frameOf(scene: Scene, frameId: FrameId) {
  const frame = scene.frameMap.get(frameId);
  if (!frame) {
    throw new Error(`Fixture has no frame ${frameId}`);
  }

  return frame;
}

const POLE_ANGLE = 0.6;
const POLE_LENGTH = 10;
const POLE_SPACING = 20;

// The bend at the second segment, where a rig has one. Non-zero and not a right
// angle, so the segment is neither collinear with its parent nor axis-aligned.
const ELBOW_ANGLE = 0.4;

// The gap between the two tips in the initial pose. Used as the rope's rest
// length so that `C = 0` there, and as the coincidence rig's pivot spacing so
// that the two tips meet.
const TIP_GAP = POLE_SPACING - 2 * POLE_LENGTH * Math.cos(POLE_ANGLE);

function getBranchedScene({
  seed = 0,
  spacing = POLE_SPACING,
  elbow = false,
}: { seed?: number; spacing?: number; elbow?: boolean } = {}) {
  return new Scene({
    frames: [
      new TrackFrame({
        id: 'cart',
        initialState: [0, 1.5 * seed],
        weights: [new Weight(20)],
        frames: [
          new RotationalFrame({
            id: 'pole1',
            initialState: [POLE_ANGLE, 0.4 * seed],
            weights: [new Weight(4, { position: [POLE_LENGTH, 0] })],
            // A second segment hinged at the first one's tip, so a constraint
            // attached out at *its* tip sees three coordinates rather than two.
            // Only some rigs want it -- see `elbow` on the kinds table.
            frames: elbow
              ? [
                  new RotationalFrame({
                    id: 'elbow',
                    position: [POLE_LENGTH, 0],
                    initialState: [ELBOW_ANGLE, 0.3 * seed],
                    weights: [new Weight(3, { position: [POLE_LENGTH, 0] })],
                  }),
                ]
              : [],
          }),
          new RotationalFrame({
            id: 'pole2',
            initialState: [Math.PI - POLE_ANGLE, -0.7 * seed],
            position: [spacing, 0],
            weights: [new Weight(7, { position: [POLE_LENGTH, 0] })],
          }),
        ],
      }),
    ],
  });
}

const constraintKinds = [
  {
    name: 'DistanceConstraint',
    // The measured drift at 120 steps, with a little room. Per-kind rather
    // than shared, because the two differ by 18x and one literal covering both
    // means the looser branch is barely constrained -- see below.
    driftBound: 1e-5,
    spacing: POLE_SPACING,
    createConstraint: (frameId1: FrameId = 'pole1') =>
      new DistanceConstraint({
        frame1: frameId1,
        frame2: 'pole2',
        position1: [POLE_LENGTH, 0],
        position2: [POLE_LENGTH, 0],
        length: TIP_GAP,
      }),
  },
  {
    name: 'CoincidenceConstraint',
    // Two rows, so `C` has to be able to see more than two coordinates or it is
    // pinned outright. On the plain rig it cannot: `C = tip₁ - tip₂` and both
    // tips ride the cart, which is *prismatic*, so its coordinate cancels out
    // of the difference and `C` is a function of the two pole angles alone. A
    // revolute shared ancestor would cancel nothing. Two rows
    // against two coordinates leaves `C` constant on the whole reachable
    // manifold -- not conserved by the integrator, constant by construction,
    // and no dynamics can move it. The elbow adds the third coordinate that
    // makes drift a measurable quantity rather than a structural zero.
    // Moving the pivots together by exactly the tip gap makes the two tips
    // meet, so the loop closes without the rig having to be pre-strained.
    driftBound: 5e-7,
    spacing: POLE_SPACING - TIP_GAP,
    createConstraint: (frameId1: FrameId = 'pole1') =>
      new CoincidenceConstraint({
        frame1: frameId1,
        frame2: 'pole2',
        position1: [POLE_LENGTH, 0],
        position2: [POLE_LENGTH, 0],
      }),
  },
];

type ConstraintKind = (typeof constraintKinds)[number];

function getConstrainedSolver({
  kind,
  seed = 0,
  rungeKutta = false,
  spacingOffset = 0,
  elbow = false,
}: {
  kind: ConstraintKind;
  seed?: number;
  rungeKutta?: boolean;
  spacingOffset?: number;
  elbow?: boolean;
}) {
  // A non-zero `spacingOffset` moves the poles apart without telling the
  // constraint, which is how a scene gets a deliberate `C₀ ≠ 0`.
  const scene = getBranchedScene({
    seed,
    spacing: kind.spacing + spacingOffset,
    elbow,
  }).addConstraint(kind.createConstraint(elbow ? 'elbow' : 'pole1'), {
    // `spacingOffset` exists to violate the constraint at `t = 0`, which is
    // the whole point of the conservation test below; scene build rejects that
    // by default.
    allowInitialViolation: spacingOffset !== 0,
  });
  return new JsSolver(scene, { rungeKutta });
}

describe('Constraint', () => {
  constraintKinds.forEach((kind) => {
    test(`${kind.name}: jacobianRows matches finite differences of value`, () => {
      // `value` and `jacobianRows` both read configuration alone, so the
      // Jacobian can be checked against a central difference of the constraint
      // function itself — no dynamics involved.
      const solver = getConstrainedSolver({ kind, seed: 1 });
      const constraint = solver.scene.constraints[0];
      const stateMap = solver.scene.getInitialStateMap();

      const valueAt = (map: StateMap): number[] => {
        const ctx = solver._getConfigKinematics(map);
        const value = constraint.value(ctx);
        return value;
      };

      const ctx = solver._getConfigKinematics(stateMap);
      const analytic = constraint.jacobianRows(ctx);
      expect(analytic).toHaveLength(constraint.rowCount);

      // Under float32 this step had to be `1e-2`, and the comparison below
      // held to two decimals: anything smaller was dominated by cancellation
      // rather than truncation, so the check could not be tightened. Float64
      // takes both four orders further -- `1e-6` still passes at six decimals,
      // so `1e-5` is comfortably inside the usable range rather than at its
      // edge.
      const h = 1e-5;
      solver.scene.sortedFrames.forEach((frame, colIndex) => {
        const bump = (sign: number): StateMap =>
          new Map(
            [...stateMap].map(([frameId, [q, qd]]): [FrameId, State] => [
              frameId,
              [frameId === frame.id ? q + sign * h : q, qd],
            ]),
          );
        const plus = valueAt(bump(1));
        const minus = valueAt(bump(-1));
        for (let row = 0; row < constraint.rowCount; row++) {
          const finiteDifference = (plus[row] - minus[row]) / (2 * h);
          expect(finiteDifference).toBeCloseTo(analytic[row][colIndex], 6);
        }
      });
    });

    test(`${kind.name}: solved accelerations hold C̈ at zero`, () => {
      // The check that catches a wrong sign or a missing term in `bias`, which
      // the finite-difference test above cannot see. Asserting `J q̈ + J̇q̇ = 0`
      // would not catch it either — that is the augmented system's own second
      // block row, satisfied by construction whatever `bias` returns.
      //
      // Instead: solve for q̈, then central-difference Ċ in time, with Ċ
      // computed from the Jacobian and the state alone. Nothing here reads
      // `bias`, so a wrong `bias` makes q̈ wrong and shows up as a non-zero C̈.
      //
      // The velocities must be non-zero: `bias` is quadratic in q̇, so at rest
      // every defect in it is invisible.
      //
      // Which is why `spacingOffset` is set. Without it the scene builds with
      // `allowInitialViolation: false`, so the initial velocities are projected
      // onto `J q̇ = 0` -- and for `CoincidenceConstraint` on this rig that is
      // two rows against the only two coordinates `C` can see, so the
      // projection zeroes both pole velocities and takes `bias` down to 1e-31
      // with them. A sign-flipped `bias` passed this test until the offset was
      // added; the same structural degeneracy the conservation test needed the
      // elbow for, one test over.
      [0.6, -1.1, 2.2].forEach((seed) => {
        const solver = getConstrainedSolver({ kind, seed, spacingOffset: 1.5 });
        const constraint = solver.scene.constraints[0];
        const frames = solver.scene.sortedFrames;
        const stateMap = solver.scene.getInitialStateMap();
        const qddArray = solver._solve(stateMap, new Map());

        // Ċ(q, q̇) = J(q) · q̇, from `jacobianRows` only.
        const cDotAt = (map: StateMap): number[] => {
          const ctx = solver._getConfigKinematics(map);
          const rows = constraint.jacobianRows(ctx);
          return rows.map((row) =>
            row.reduce(
              (total, entry, index) =>
                total + entry * map.get(frames[index].id)![1],
              0,
            ),
          );
        };

        const h = 1e-3;
        const step = (sign: number): StateMap =>
          new Map(
            frames.map((frame, index): [FrameId, State] => {
              const [q, qd] = stateMap.get(frame.id)!;

              return [
                frame.id,
                [q + sign * h * qd, qd + sign * h * qddArray[index]],
              ];
            }),
          );
        const plus = cDotAt(step(1));
        const minus = cDotAt(step(-1));
        for (let row = 0; row < constraint.rowCount; row++) {
          const cDDot = (plus[row] - minus[row]) / (2 * h);
          expect(Math.abs(cDDot)).toBeLessThan(1e-2);
        }
      });
    });

    test(`${kind.name}: augmented system is symmetric and sized n + m`, () => {
      const solver = getConstrainedSolver({ kind, seed: 1 });
      const constraint = solver.scene.constraints[0];
      const size = solver.scene.sortedFrames.length + constraint.rowCount;
      const [array, vector] = solver._getSystemOfEquations(
        solver.scene.getInitialStateMap(),
        new Map(),
      );
      expect(array).toHaveLength(size);
      expect(array[0]).toHaveLength(size);
      expect(vector).toHaveLength(size);
      for (let row = 0; row < size; row++) {
        for (let col = 0; col < size; col++) {
          expect(array[row][col]).toBeCloseTo(array[col][row], 5);
        }
        // The multiplier block is exactly zero: constraints carry no inertia.
        if (row >= solver.scene.sortedFrames.length) {
          for (let col = solver.scene.sortedFrames.length; col < size; col++) {
            expect(array[row][col]).toBe(0);
          }
        }
      }
    });

    test(`${kind.name}: constraint value is conserved over a trajectory`, () => {
      // The formulation is index-1: it holds `C̈` at zero, and nothing pulls a
      // violation back, so `C(t) = C₀ + Ċ₀t` exactly. Starting at rest makes
      // `Ċ₀` zero, which leaves `C` *conserved* -- and what moves it after
      // that is numerical error alone.
      //
      // `C₀` is deliberately non-zero. Conservation, not satisfaction, is the
      // property under test: a version of this that only checked `C ≈ 0` from
      // a consistent start would pass unconditionally against an
      // implementation that snapped `C` to zero every step -- and projection
      // is one of the three stabilizers `docs/constraints.md` §7 lists, so
      // that is a plausible future implementation rather than a strawman.
      //
      // Float64 resolves the truncation error, so the *order* is asserted
      // rather than just a bound. Measured over a 16x range of step sizes,
      // integrating two seconds from rest:
      //
      //     steps          120       240       480       960
      //     distance       4.650e-6  2.869e-7  1.780e-8  1.109e-9
      //     ratio                    16.20     16.12     16.06
      //     coincidence    2.594e-7  1.599e-8  9.934e-10 6.211e-11
      //     ratio                    16.22     16.10     15.99
      //
      // Sixteen-fold per halving is fourth order, which is RK4's. Under float32
      // this was invisible -- drift sat flat at one ulp, 9.537e-7, because
      // truncation was below the representation floor -- so the table that used
      // to be here recorded a drift that did not move with the step, and
      // concluded no order was observable. It is, and refining the step buys
      // four orders per 16x.
      //
      // `CoincidenceConstraint` needs the elbow rig to have a curve at all, and
      // the reason is structural rather than numerical. `C = tip₁ - tip₂`, and
      // on the plain rig both tips ride the cart, and the cart is *prismatic*,
      // so its coordinate cancels out of the difference and `C` is a function
      // of the two pole angles alone. The qualifier decides it: a revolute
      // shared ancestor rotates `tip₁ - tip₂` with it, and drops out of
      // nothing -- swapping the cart for one gives a fourth-order curve on the
      // plain two-pole rig, with no elbow at all. Two constraint rows against the two coordinates `C` can
      // see pins both, leaving the cart's slide as the only freedom -- and `C`
      // is blind to it. So `C` is constant on the entire reachable manifold:
      // not conserved by the integrator, constant by construction, and no
      // dynamics can move it. Tilting the track until the cart travels 12.9
      // units leaves the drift at 1.776e-15 for every step size.
      //
      // A test that cannot fail is worse than no test, so rather than assert
      // that floor, the rig gets a third coordinate *below* the shared prefix:
      // a second segment hinged at `pole1`'s tip, with the constraint attached
      // out at *its* tip. Another frame in the prefix would not do -- it would
      // add a coordinate the difference still cancels. `C` then
      // spans three coordinates against two rows, the rig moves, and the order
      // is measurable -- the sweep above.
      //
      // Two seconds of trajectory, at one step size and then at half of it.
      const drift = (steps: number): number => {
        const solver = getConstrainedSolver({
          kind,
          rungeKutta: true,
          spacingOffset: 1.5,
          elbow: true,
        });
        const constraint = solver.scene.constraints[0];
        const readC = (): number[] =>
          constraint.value(
            solver._getConfigKinematics(solver.getStateMap()),
          ) as number[];
        const initial = readC();

        // `C₀ ≠ 0` is the premise: conservation is what is under test, and a
        // start already at zero would pass against a stabilizer that snapped.
        expect(Math.max(...initial.map(Math.abs))).toBeGreaterThan(1);
        let worst = 0;
        for (let step = 0; step < steps; step++) {
          solver.tick(2 / steps);
          readC().forEach((value, row) => {
            worst = Math.max(worst, Math.abs(value - initial[row]));
          });
        }

        return worst;
      };

      const coarse = drift(120);
      const fine = drift(240);

      // Both things, because neither implies the other. The ratio fails second
      // order (4x), a stabilizer that pins `C`, and a wrong bias term; the
      // magnitude fails an implementation that is faithfully fourth order and
      // drifting far too much -- a scale error in the constraint value moves
      // both measurements together and leaves the ratio at 16.
      //
      // The bound comes from the kinds table because the two kinds' drifts
      // differ by 18x: 4.650e-6 and 2.594e-7. One shared literal sized for the
      // larger left the smaller with 39x of slack -- looser than the float32
      // bound this replaced for being loose, while reading as though it were
      // tight.
      expect(coarse / fine).toBeGreaterThan(12);
      expect(coarse / fine).toBeLessThan(20);
      expect(coarse).toBeLessThan(kind.driftBound);
    });

    test(`${kind.name}: drift is exactly linear in time when Ċ₀ ≠ 0`, () => {
      // The sharper half of the index-1 claim. Holding `C̈ = 0` makes
      // `C(t) = C₀ + Ċ₀t` an *exact* solution, not an approximation -- so
      // starting with a velocity the constraint does not admit, the drift after
      // a fixed span depends on the span alone and not on how many steps were
      // taken to cross it. RK4 integrates a linear function of time exactly.
      //
      // Measured across a 16x range of step sizes, two seconds from `seed: 1`
      // on the elbow rig: 1.2064e+1 for `DistanceConstraint` and 2.4203e+1 for
      // `CoincidenceConstraint`, identical at every step count to seven and
      // nine significant figures respectively.
      //
      // This is the property that distinguishes index-1 from a stabilized
      // formulation, and it is the one a Baumgarte or projection term would
      // break -- both pull `C` back toward zero, making the drift depend on how
      // many steps did the pulling. The test above cannot see that, because a
      // conserved `C` and a corrected `C` are both small.
      const drift = (steps: number): number => {
        const solver = getConstrainedSolver({
          kind,
          rungeKutta: true,
          spacingOffset: 1.5,
          seed: 1,
          elbow: true,
        });
        const constraint = solver.scene.constraints[0];
        const readC = (): number[] =>
          constraint.value(
            solver._getConfigKinematics(solver.getStateMap()),
          ) as number[];
        const initial = readC();
        for (let step = 0; step < steps; step++) {
          solver.tick(2 / steps);
        }

        return Math.max(
          ...readC().map((value, row) => Math.abs(value - initial[row])),
        );
      };

      const coarse = drift(120);
      const fine = drift(1920);

      // Large enough that a conserved-`C` implementation could not produce it,
      // so the assertion below is about linearity rather than about zero.
      expect(coarse).toBeGreaterThan(1);
      expect(fine / coarse).toBeCloseTo(1, 4);
    });

    test(`${kind.name}: bias refuses a configuration-only context`, () => {
      // `_getConfigKinematics` deliberately omits the velocity sweeps, so that
      // evaluating a constraint at a trial configuration cannot silently read
      // velocities belonging to some other configuration.
      const solver = getConstrainedSolver({ kind });
      const ctx = solver._getConfigKinematics(solver.scene.getInitialStateMap());
      expect(() => solver.scene.constraints[0].bias(ctx)).toThrow(
        /trial configuration/,
      );
    });

    test(`${kind.name}: round-trips through toJsonObj`, () => {
      const jsonObj = kind.createConstraint().toJsonObj();
      expect(jsonObj).toMatchObject({
        frame1: 'pole1',
        frame2: 'pole2',
        position1: [POLE_LENGTH, 0],
        position2: [POLE_LENGTH, 0],
        type: kind.name,
      });
    });
  });

  test('a shared ancestor contributes V_i d, which only vanishes if prismatic', () => {
    // Every other fixture here hangs its two branches off the cart, which is a
    // `TrackFrame` -- so the shared-ancestor column comes out zero, and the
    // reason *why* goes untested. `docs/algorithm.md` §5 says the column
    // collapses to `V_i d` and vanishes only because a prismatic `V_i` has no
    // rotational part; interposing a rotational boom is what tells the two
    // explanations apart.
    const scene = new Scene({
      frames: [
        new TrackFrame({
          id: 'cart',
          initialState: [0, 0],
          weights: [new Weight(20)],
          frames: [
            new RotationalFrame({
              id: 'boom',
              initialState: [0.35, 0],
              weights: [new Weight(6, { position: [4, 0] })],
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
        }),
      ],
    }).addConstraint(
      // The coincidence form, deliberately: for the distance form the
      // shared-ancestor entry is `dᵀ V_i d`, which is zero for any skew `V_i`,
      // so it cannot distinguish the two ancestors either.
      new CoincidenceConstraint({
        frame1: 'pole1',
        frame2: 'pole2',
        position1: [POLE_LENGTH, 0],
        position2: [POLE_LENGTH, 0],
      }),
      // Only the Jacobian is under test here, and it is defined whether or not
      // the two points currently meet.
      { allowInitialViolation: true },
    );
    const solver = new JsSolver(scene);
    const constraint = scene.constraints[0];
    const ctx = solver._getConfigKinematics(scene.getInitialStateMap());
    const rows = constraint.jacobianRows(ctx);
    const columnOf = (frameId: FrameId) => {
      const index = scene.sortedFrames.findIndex(
        (frame) => frame.id === frameId,
      );
      return [rows[0][index], rows[1][index]];
    };

    // Computed straight from the sweep, independently of the constraint.
    const expected = (() => {
      const at = (frameId: FrameId) =>
        mat3.apply(
          ctx.velMatMap.get('boom')!,
          mat3.apply(ctx.posMatMap.get(frameId)!, constraint.position1),
        );
      const p = at('pole1');
      const q = at('pole2');

      return [p[0] - q[0], p[1] - q[1]];
    })();

    const boom = columnOf('boom');
    boom.forEach((entry, axis) => expect(entry).toBeCloseTo(expected[axis], 4));
    // A revolute generator acts on a direction as a quarter turn, so it carries
    // the separation over without changing its length -- which is `TIP_GAP`,
    // the boom having rotated both tips rigidly. Not a threshold: the column's
    // magnitude is predicted exactly.
    expect(Math.hypot(...boom)).toBeCloseTo(TIP_GAP, 4);

    // ...while the prismatic ancestor above it still cancels exactly.
    columnOf('cart').forEach((entry) => expect(entry).toBeCloseTo(0, 6));

  });

  test('an unconstrained scene still assembles the plain n-by-n system', () => {
    const solver = new JsSolver(getBranchedScene({ seed: 1 }));
    const size = solver.scene.sortedFrames.length;
    const [array, vector] = solver._getSystemOfEquations(
      solver.scene.getInitialStateMap(),
      new Map(),
    );
    expect(array).toHaveLength(size);
    expect(array[0]).toHaveLength(size);
    expect(vector).toHaveLength(size);
  });

  test('DistanceConstraint rejects a non-positive length', () => {
    // At `‖d‖ = 0` the gradient of `½(‖d‖² − L²)` vanishes and the constraint
    // row goes blank, so the degenerate target is refused up front rather than
    // producing a silently singular system.
    [0, -1].forEach((length) => {
      expect(
        () =>
          new DistanceConstraint({
            frame1: 'pole1',
            frame2: 'pole2',
            length,
          }),
      ).toThrow(/must be positive/);
    });
  });
});

describe('Scene build', () => {
  // The rig the query API exists for: two poles on a cart, roped tip to tip.
  // Nothing here computes the geometry -- the scene is asked.
  function getRopeScene({ spacing = POLE_SPACING, poleAngle = POLE_ANGLE } = {}) {
    return new Scene({
      frames: [
        new TrackFrame({
          id: 'cart',
          weights: [new Weight(20)],
          frames: [
            new RotationalFrame({
              id: 'pole1',
              initialState: [poleAngle, 0],
              weights: [new Weight(4, { position: [POLE_LENGTH, 0] })],
            }),
            new RotationalFrame({
              id: 'pole2',
              initialState: [Math.PI - poleAngle, 0],
              position: [spacing, 0],
              weights: [new Weight(7, { position: [POLE_LENGTH, 0] })],
            }),
          ],
        }),
      ],
    });
  }

  const tip = [POLE_LENGTH, 0];

  test('getWorldPosition places a frame-relative point', () => {
    const scene = getRopeScene();
    // Pole 1 pivots at the cart's origin, so its tip is just the pole vector.
    expect(scene.getWorldPosition('pole1', tip)).toEqual([
      expect.closeTo(POLE_LENGTH * Math.cos(POLE_ANGLE), 4),
      expect.closeTo(POLE_LENGTH * Math.sin(POLE_ANGLE), 4),
    ]);
    // A frame's own origin needs no position argument.
    expect(scene.getWorldPosition('pole2')).toEqual([
      expect.closeTo(POLE_SPACING, 4),
      expect.closeTo(0, 4),
    ]);
  });

  test('getWorldPosition answers about a state other than the initial one', () => {
    const scene = getRopeScene();
    const stateMap: StateMap = new Map([['pole1', [0, 0]]]);
    // `cart` and `pole2` are absent from the map and read at rest, which is
    // what makes this answerable while a scene is still being assembled.
    expect(scene.getWorldPosition('pole1', tip, { stateMap })).toEqual([
      expect.closeTo(POLE_LENGTH, 4),
      expect.closeTo(0, 4),
    ]);
  });

  test('getSeparation measures the gap a DistanceConstraint would close on', () => {
    const scene = getRopeScene();
    const { vector, distance } = scene.getSeparation('pole1', tip, 'pole2', tip);
    expect(distance).toBeCloseTo(TIP_GAP, 4);
    // Mirrored poles put the tips at the same height, so the gap is horizontal.
    expect(vector[1]).toBeCloseTo(0, 4);
    // `vector` is the constraint's own `d = x₁ − x₂`, so it points from the
    // second attachment back to the first: pole 1's tip is the left one.
    expect(vector[0]).toBeCloseTo(-TIP_GAP, 4);
  });

  test('an unset length adopts the gap the scene places', () => {
    // The ergonomic path: author the rope, let the scene measure it.
    const scene = getRopeScene().addConstraint(
      new DistanceConstraint({
        frame1: 'pole1',
        frame2: 'pole2',
        position1: tip,
        position2: tip,
      }),
    );
    expect(scene.constraints[0].length).toBeCloseTo(TIP_GAP, 4);
    // ...and the result starts consistent, which is the point of measuring it.
    const ctx = scene.getConfigKinematics(scene.getInitialStateMap());
    expect(Math.abs(scene.constraints[0].value(ctx)[0])).toBeLessThan(1e-4);
  });

  test('the same scene at a different pose measures a different gap', () => {
    // The geometry is not baked into the constraint: it is read off whatever
    // scene the constraint is added to.
    const wide = getRopeScene({ poleAngle: 0.9 }).addConstraint(
      new DistanceConstraint({
        frame1: 'pole1',
        frame2: 'pole2',
        position1: tip,
        position2: tip,
      }),
    );
    expect(wide.constraints[0].length).toBeCloseTo(
      POLE_SPACING - 2 * POLE_LENGTH * Math.cos(0.9),
      4,
    );
    expect(wide.constraints[0].length).not.toBeCloseTo(TIP_GAP, 2);
  });

  test('an explicit length that disagrees with the geometry is rejected', () => {
    expect(() =>
      getRopeScene().addConstraint(
        new DistanceConstraint({
          frame1: 'pole1',
          frame2: 'pole2',
          position1: tip,
          position2: tip,
          length: TIP_GAP + 2,
        }),
      ),
    ).toThrow(/disagrees with/);
    // An explicit length that agrees is fine -- authoring it is redundant, not
    // wrong, and a scene generator may well have computed it.
    expect(() =>
      getRopeScene().addConstraint(
        new DistanceConstraint({
          frame1: 'pole1',
          frame2: 'pole2',
          position1: tip,
          position2: tip,
          length: TIP_GAP,
        }),
      ),
    ).not.toThrow();
  });

  test('a coincidence constraint solves for its second attachment point', () => {
    // The poles are nowhere near meeting, and it does not matter: the author
    // names the point on pole 1, and the attachment on pole 2 is solved for.
    const scene = getRopeScene().addConstraint(
      new CoincidenceConstraint({
        frame1: 'pole1',
        frame2: 'pole2',
        position1: tip,
      }),
    );
    const constraint = scene.constraints[0];

    // The solved point is off pole 2's own axis, because pole 1's tip is not on
    // it -- which is the mechanism working rather than a defect. Asserting the
    // invariant rather than the coordinates: the two attachments name one world
    // point.
    expect(scene.getWorldPosition('pole2', constraint.localPosition2)).toEqual([
      expect.closeTo(scene.getWorldPosition('pole1', tip)[0], 4),
      expect.closeTo(scene.getWorldPosition('pole1', tip)[1], 4),
    ]);
    expect(constraint.localPosition2[1]).not.toBeCloseTo(0, 2);

    // ...and the loop is closed at `t = 0` by construction.
    const ctx = scene.getConfigKinematics(scene.getInitialStateMap());
    constraint
      .value(ctx)
      .forEach((entry) => expect(Math.abs(entry)).toBeLessThan(1e-4));
  });

  test('the solved attachment tracks the pose it was solved against', () => {
    // Nothing about the rig has to be arranged for this to work, which is the
    // property an interactive scene builder needs: the same constraint
    // authored against a differently-posed scene lands somewhere else, and is
    // correct in both.
    const attachmentAt = (poleAngle: number) =>
      getRopeScene({ poleAngle }).addConstraint(
        new CoincidenceConstraint({
          frame1: 'pole1',
          frame2: 'pole2',
          position1: tip,
        }),
      ).constraints[0].localPosition2;

    const narrow = attachmentAt(0.6);
    const wide = attachmentAt(0.9);
    expect(narrow[0]).not.toBeCloseTo(wide[0], 2);
    // Both still close their own loop exactly -- that is the invariant, not
    // the number.
    [0.6, 0.9, 1.3].forEach((poleAngle: number) => {
      const scene = getRopeScene({ poleAngle }).addConstraint(
        new CoincidenceConstraint({
          frame1: 'pole1',
          frame2: 'pole2',
          position1: tip,
        }),
      );
      const ctx = scene.getConfigKinematics(scene.getInitialStateMap());
      scene.constraints[0]
        .value(ctx)
        .forEach((entry) => expect(Math.abs(entry)).toBeLessThan(1e-4));
    });
  });

  test('a structural failure is not re-diagnosed as a scale problem', () => {
    // `_getProjectedVelocities` wraps a `SingularMatrixError` in a long message
    // about the scene's length scale, which is the right diagnosis for a
    // genuinely ill-conditioned rig. It must not wrap anything else: the block
    // also runs `dotRows` and the indexed accessors, whose throws mean the
    // Jacobian was assembled wrong -- a bug with nothing to do with
    // conditioning, and "rescale your scene" would send someone a long way in
    // the wrong direction.
    const scene = getBranchedScene().addConstraint(
      new DistanceConstraint({
        frame1: 'pole1',
        frame2: 'pole2',
        position1: [POLE_LENGTH, 0],
        position2: [POLE_LENGTH, 0],
      }),
    );
    frameOf(scene, 'pole1').initialState = [POLE_ANGLE, 2];

    // A mass matrix one row short: the shape a wrongly-sized assembly has.
    const truncated = scene.getMassMatrix(scene.getInitialStateMap());
    scene.getMassMatrix = () => truncated.slice(1);

    expect(() => scene.getInitialStateMap()).toThrow(DimensionError);
    expect(() => scene.getInitialStateMap()).not.toThrow(/[Rr]escal/);
  });

  test('an unresolved length is refused, not treated as zero', () => {
    // `resolveGeometry` fills `length` in at `addConstraint`, so a null one
    // means the constraint is being evaluated before it joined a scene.
    // Defaulting to zero would compute half the squared separation -- which
    // looks like a constraint value, and is not this one.
    const scene = getBranchedScene();
    const constraint = new DistanceConstraint({
      frame1: 'pole1',
      frame2: 'pole2',
      position1: [POLE_LENGTH, 0],
      position2: [POLE_LENGTH, 0],
    });

    expect(constraint.length).toBeNull();
    expect(() =>
      constraint.value(scene.getConfigKinematics(scene.getInitialStateMap())),
    ).toThrow(/no length yet/);
  });

  test('an explicit second attachment is still checked', () => {
    // Supplying it is opting back into being responsible for it.
    expect(() =>
      getRopeScene().addConstraint(
        new CoincidenceConstraint({
          frame1: 'pole1',
          frame2: 'pole2',
          position1: tip,
          position2: tip,
        }),
      ),
    ).toThrow(/would never actually meet/);
  });

  test('the projection is scale-free across many orders of magnitude', () => {
    // The claim the metric formulation is *for*: one physical rig, expressed at
    // wildly different numeric length scales, gets the same correction as a
    // fraction of what was authored.
    //
    // This needs its own test rather than a column in the sweep above, because
    // the failure it guards lives at the extremes. An absolute early-return
    // threshold does not misbehave at scale 1; it skips the projection entirely
    // once the Jacobian entries fall far enough, and then silently hands the
    // violation back.
    const ratioAt = (scale: number) => {
      const authored = 0.8;
      const scene = new Scene({
        frames: [
          new TrackFrame({
            id: 'slider',
            initialState: [0, 0],
            weights: [new Weight(10)],
          }),
          new RotationalFrame({
            id: 'pole',
            position: [8 * scale, 0],
            initialState: [1.1, authored],
            weights: [new Weight(3, { position: [5 * scale, 0] })],
          }),
        ],
      }).addConstraint(
        new DistanceConstraint({
          frame1: 'slider',
          frame2: 'pole',
          position1: [0, 0],
          position2: [5 * scale, 0],
        }),
      );
      return scene.getInitialStateMap().get('pole')![1] / authored;
    };

    const reference = ratioAt(1);
    // Genuinely corrected at the reference scale, so the comparisons below are
    // not all agreeing on "unchanged".
    expect(reference).toBeGreaterThan(0.01);
    expect(reference).toBeLessThan(0.99);
    // ...and identical to eight figures across ten orders of magnitude. Under
    // the float32 arithmetic this replaced, the same assertion held over five
    // and a half: `3e2` down to `1e-3`.
    //
    // The band is still not unbounded, and the bound is real rather than a
    // tolerance: `g` mixes a prismatic coordinate's mass with a revolute one's
    // mass-times-length-squared, so its condition number grows like the square
    // of the scale, and float64 runs out eventually too. Outside it the solve
    // fails loudly, which is the behaviour worth having.
    [1e5, 1e3, 1, 1e-3, 1e-5].forEach((scale: number) =>
      expect(ratioAt(scale)).toBeCloseTo(reference, 8),
    );
  });

  test('the correction is the metric projection, not the Euclidean one', () => {
    // The falsifying test for this PR's central claim, and the only one that
    // runs the projector rather than its early return.
    //
    // Both candidates land on `J q̇ = 0`, so no assertion about the residual can
    // tell them apart. What separates them is *direction*: the metric version
    // moves along `g⁻¹Jᵀ` -- a generalized force, which is what the solver
    // applies every step -- and the Euclidean one moves along `Jᵀ`. So `g·Δq̇`
    // is parallel to `Jᵀ` and `Δq̇` itself is not.
    //
    // A slider and a pendulum, no shared ancestor, so neither Jacobian column
    // is structurally zero and the two directions genuinely differ.
    const scene = new Scene({
      frames: [
        new TrackFrame({
          id: 'slider',
          initialState: [0, 0],
          weights: [new Weight(10)],
        }),
        new RotationalFrame({
          id: 'pole',
          position: [8, 0],
          initialState: [1.1, 4],
          weights: [new Weight(3, { position: [5, 0] })],
        }),
      ],
    }).addConstraint(
      new DistanceConstraint({
        frame1: 'slider',
        frame2: 'pole',
        position1: [0, 0],
        position2: [5, 0],
      }),
    );

    const before = scene.getInitialStateMap({ project: false });
    const after = scene.getInitialStateMap();
    const delta = scene.sortedFrames.map(
      (frame) => after.get(frame.id)![1] - before.get(frame.id)![1],
    );
    expect(Math.hypot(...delta)).toBeGreaterThan(0.1); // it actually ran

    const ctx = scene.getConfigKinematics(before);
    const [jacobian] = scene.constraints[0].jacobianRows(ctx);
    const massMatrix = scene.getMassMatrix(before);
    const massDelta = massMatrix.map((row) =>
      row.reduce((total, entry, index) => total + entry * delta[index], 0),
    );

    // `g·Δq̇ ∥ Jᵀ`: the ratios agree across coordinates.
    const ratios = massDelta.map((entry, index) => entry / jacobian[index]);
    expect(ratios[0]).toBeCloseTo(ratios[1], 3);
    // ...while `Δq̇ ∥ Jᵀ` -- what the Euclidean version would give -- does not.
    const euclidean = delta.map((entry, index) => entry / jacobian[index]);
    expect(euclidean[0]).not.toBeCloseTo(euclidean[1], 1);
  });

  test('any geometry builds: no arrangement is required of the author', () => {
    // The property an interactive scene builder needs. A person dragging two
    // chains together cannot be asked to place them coincident to machine
    // precision, and a generated scene has nobody to ask -- so the constraint
    // has to accept whatever pose it is handed.
    //
    // Under the previous design, which measured the gap and rejected a
    // non-zero one, most of this grid failed.
    const poses = [];
    for (const poleAngle of [0.3, 0.6, 0.9, 1.3]) {
      for (const spacing of [4, 11.5, 20, 137]) {
        for (const scale of [0.001, 1, 1000]) {
          poses.push({ poleAngle, spacing, scale });
        }
      }
    }
    poses.forEach(({ poleAngle, spacing, scale }) => {
      const scene = new Scene({
        frames: [
          new TrackFrame({
            id: 'cart',
            weights: [new Weight(20)],
            frames: [-1, 1].map((side) =>
              new RotationalFrame({
                id: side < 0 ? 'pole1' : 'pole2',
                initialState: [
                  side < 0 ? poleAngle : Math.PI - poleAngle,
                  // Non-zero, and not mirrored, so it violates the constraint:
                  // with every velocity at zero the residual is identically
                  // zero, the early return fires, and the grid would sweep the
                  // position half only.
                  side < 0 ? 0.7 : 0,
                ],
                position: [side < 0 ? 0 : spacing * scale, 0],
                weights: [
                  new Weight(4, { position: [POLE_LENGTH * scale, 0] }),
                ],
              }),
            ),
          }),
        ],
      });
      expect(() =>
        scene.addConstraint(
          new CoincidenceConstraint({
            frame1: 'pole1',
            frame2: 'pole2',
            position1: [POLE_LENGTH * scale, 0],
          }),
        ),
      ).not.toThrow(); // would have thrown for all but the contrived cases

      // Built is not enough -- it has to be built *consistent*, in both
      // position and velocity.
      const stateMap = scene.getInitialStateMap();
      const ctx = scene.getConfigKinematics(stateMap);
      const constraint = scene.constraints[0];
      constraint.value(ctx).forEach((entry) => {
        // Relative to the scale the scene works at, for the same reason the
        // tolerance itself is relative: floating point carries significant
        // figures, not absolute steps, so an absolute bound would be a
        // different demand at each scale.
        expect(Math.abs(entry) / scale).toBeLessThan(1e-3);
      });
      // Cdot = J qd, which the projection has to have driven to zero. Measured
      // against the residual it *started* with, which is the only denominator
      // that stays meaningful: normalising by the projected terms themselves
      // would be 0/0 in disguise, since driving them to zero is the whole job.
      const authored = scene.getInitialStateMap({ project: false });
      const residualOf = (map: StateMap) =>
        Math.max(
          ...constraint
            .jacobianRows(ctx)
            .map((row) =>
              Math.abs(
                row.reduce(
                  (total, entry, index) =>
                    total + entry * map.get(scene.sortedFrames[index].id)![1],
                  0,
                ),
              ),
            ),
        );
      expect(residualOf(stateMap)).toBeLessThan(residualOf(authored) * 1e-5);
    });
  });

  test('a constraint naming an absent frame is rejected', () => {
    expect(() =>
      getRopeScene().addConstraint(
        new DistanceConstraint({ frame1: 'pole1', frame2: 'nope' }),
      ),
    ).toThrow(/does not contain: nope/);
  });

  test('an inconsistent initial velocity is projected onto J qd = 0', () => {
    const scene = getRopeScene().addConstraint(
      new DistanceConstraint({
        frame1: 'pole1',
        frame2: 'pole2',
        position1: tip,
        position2: tip,
      }),
    );
    // Spin one pole and leave the other still: the rope would have to stretch.
    frameOf(scene, 'pole1').initialState = [POLE_ANGLE, 2.5];

    const rateOfChange = (stateMap: StateMap) => {
      const ctx = scene.getConfigKinematics(stateMap);
      const [row] = scene.constraints[0].jacobianRows(ctx);
      return row.reduce(
        (total, entry, index) =>
          total + entry * stateMap.get(scene.sortedFrames[index].id)![1],
        0,
      );
    };

    expect(
      Math.abs(rateOfChange(scene.getInitialStateMap({ project: false }))),
    ).toBeGreaterThan(1);
    const projected = scene.getInitialStateMap();
    // Relative: the residual floor scales with the Jacobian's own magnitude,
    // for the same reason the consistency tolerance is relative.
    expect(Math.abs(rateOfChange(projected))).toBeLessThan(1e-4);
    // Least-norm, so the authored motion survives as far as the constraint
    // permits rather than being zeroed.
    expect(Math.abs(projected.get('pole1')![1])).toBeGreaterThan(0.5);
    // Positions are untouched: only the velocity half is projected here.
    expect(projected.get('pole1')![0]).toBeCloseTo(POLE_ANGLE, 6);
  });

  test('a consistent initial velocity is left exactly alone', () => {
    const scene = getRopeScene().addConstraint(
      new DistanceConstraint({
        frame1: 'pole1',
        frame2: 'pole2',
        position1: tip,
        position2: tip,
      }),
    );
    // Mirrored poles turning at the same rate keep their tips the same
    // distance apart. Note what this does and does not pin: a null-space
    // velocity has zero residual *by construction*, so it takes the early
    // return and never enters the projection at all. What is pinned is that
    // `J`'s pole columns are non-zero and that the residual cancels on a
    // velocity the constraint can see -- which the cart version below cannot
    // show, its column being structurally zero. The projector itself is pinned
    // by the metric test further down, on an *inconsistent* velocity.
    frameOf(scene, 'pole1').initialState = [POLE_ANGLE, 2];
    frameOf(scene, 'pole2').initialState = [Math.PI - POLE_ANGLE, 2];
    const projected = scene.getInitialStateMap();
    expect(projected.get('pole1')![1]).toBeCloseTo(2, 5);
    expect(projected.get('pole2')![1]).toBeCloseTo(2, 5);
  });

  test('the cart column of the Jacobian is structurally zero', () => {
    // The other half of the test above, separated out because it pins a
    // different claim: a rope slung between two arms of one *prismatic* frame
    // exerts no net generalized force on it, so any cart velocity is
    // consistent whatever else is going on.
    const scene = getRopeScene().addConstraint(
      new DistanceConstraint({
        frame1: 'pole1',
        frame2: 'pole2',
        position1: tip,
        position2: tip,
      }),
    );
    const ctx = scene.getConfigKinematics(scene.getInitialStateMap());
    const [row] = scene.constraints[0].jacobianRows(ctx);
    const cartIndex = scene.sortedFrames.findIndex(
      (frame) => frame.id === 'cart',
    );
    expect(row[cartIndex]).toBeCloseTo(0, 12);
    expect(Math.max(...row.map(Math.abs))).toBeGreaterThan(1);
  });
});
