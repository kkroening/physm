import * as tf from './tfjs';
import JsSolver from './JsSolver';
import RotationalFrame from './RotationalFrame';
import Scene from './Scene';
import TrackFrame from './TrackFrame';
import Weight from './Weight';
import { CoincidenceConstraint, DistanceConstraint } from './Constraint';
import { checkTfMemory } from './testutils';

// A branched rig: two poles rising from one cart, so the two attachment points
// have root paths that share a prefix (`cart`) and then diverge. Anything that
// confuses a frame's position along a path with its index into the system —
// physm-py's 2019 constraint code did exactly that — produces the right answer
// on a straight chain and the wrong one here.
const POLE_ANGLE = 0.6;
const POLE_LENGTH = 10;
const POLE_SPACING = 20;

// The gap between the two tips in the initial pose. Used as the rope's rest
// length so that `C = 0` there, and as the coincidence rig's pivot spacing so
// that the two tips meet.
const TIP_GAP = POLE_SPACING - 2 * POLE_LENGTH * Math.cos(POLE_ANGLE);

function getBranchedScene({ seed = 0, spacing = POLE_SPACING } = {}) {
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
    spacing: POLE_SPACING,
    createConstraint: () =>
      new DistanceConstraint({
        frame1: 'pole1',
        frame2: 'pole2',
        position1: [POLE_LENGTH, 0],
        position2: [POLE_LENGTH, 0],
        length: TIP_GAP,
      }),
  },
  {
    name: 'CoincidenceConstraint',
    // Moving the pivots together by exactly the tip gap makes the two tips
    // meet, so the loop closes without the rig having to be pre-strained.
    spacing: POLE_SPACING - TIP_GAP,
    createConstraint: () =>
      new CoincidenceConstraint({
        frame1: 'pole1',
        frame2: 'pole2',
        position1: [POLE_LENGTH, 0],
        position2: [POLE_LENGTH, 0],
      }),
  },
];

function getConstrainedSolver({
  kind,
  seed = 0,
  rungeKutta = false,
  spacingOffset = 0,
} = {}) {
  // A non-zero `spacingOffset` moves the poles apart without telling the
  // constraint, which is how a scene gets a deliberate `C₀ ≠ 0`.
  const scene = getBranchedScene({
    seed,
    spacing: kind.spacing + spacingOffset,
  }).addConstraint(kind.createConstraint());
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

      const valueAt = (map) => {
        const ctx = solver._getConfigKinematics(map);
        const value = constraint.value(ctx);
        solver._disposeConstraintCtx(ctx);
        return value;
      };

      const ctx = solver._getConfigKinematics(stateMap);
      const analytic = constraint.jacobianRows(ctx);
      solver._disposeConstraintCtx(ctx);
      expect(analytic).toHaveLength(constraint.rowCount);

      // `h` is large for a finite difference because tfjs computes in float32;
      // smaller steps are dominated by cancellation rather than truncation.
      const h = 1e-2;
      solver.scene.sortedFrames.forEach((frame, colIndex) => {
        const bump = (sign) =>
          new Map(
            [...stateMap].map(([frameId, [q, qd]]) => [
              frameId,
              [frameId === frame.id ? q + sign * h : q, qd],
            ]),
          );
        const plus = valueAt(bump(1));
        const minus = valueAt(bump(-1));
        for (let row = 0; row < constraint.rowCount; row++) {
          const finiteDifference = (plus[row] - minus[row]) / (2 * h);
          expect(finiteDifference).toBeCloseTo(analytic[row][colIndex], 2);
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
      [0.6, -1.1, 2.2].forEach((seed) => {
        const solver = getConstrainedSolver({ kind, seed });
        const constraint = solver.scene.constraints[0];
        const frames = solver.scene.sortedFrames;
        const stateMap = solver.scene.getInitialStateMap();
        const qddArray = solver._solve(stateMap, new Map());

        // Ċ(q, q̇) = J(q) · q̇, from `jacobianRows` only.
        const cDotAt = (map) => {
          const ctx = solver._getConfigKinematics(map);
          const rows = constraint.jacobianRows(ctx);
          solver._disposeConstraintCtx(ctx);
          return rows.map((row) =>
            row.reduce(
              (total, entry, index) =>
                total + entry * map.get(frames[index].id)[1],
              0,
            ),
          );
        };

        const h = 1e-3;
        const step = (sign) =>
          new Map(
            frames.map((frame, index) => {
              const [q, qd] = stateMap.get(frame.id);
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
      const array = checkTfMemory(() => {
        const [aMat, bVec] = solver._getSystemOfEquations(
          solver.scene.getInitialStateMap(),
          new Map(),
        );
        expect(aMat.shape).toEqual([size, size]);
        expect(bVec.shape).toEqual([size, 1]);
        const result = aMat.arraySync();
        aMat.dispose();
        bVec.dispose();
        return result;
      });
      for (let row = 0; row < size; row++) {
        for (let col = 0; col < size; col++) {
          expect(array[row][col]).toBeCloseTo(array[col][row], 5);
        }
        // The multiplier block is exactly zero: constraints carry no inertia.
        for (let col = solver.scene.sortedFrames.length; col < size; col++) {
          row >= solver.scene.sortedFrames.length &&
            expect(array[row][col]).toBe(0);
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
      // The *order* of convergence is not asserted here, because at float32 it
      // is not observable. Measured over an 8x range of step sizes, the drift
      // does not move:
      //
      //     steps    120       240       480       960
      //     distance 1.024e-5  1.024e-5  1.029e-5  1.217e-5
      //     coincid. 9.537e-7  9.537e-7  9.537e-7  9.537e-7
      //
      // -- and 9.537e-7 is exactly one float32 ulp (2⁻²⁰). RK4 truncation sits
      // entirely below the representation floor, so refining the step buys
      // nothing and eventually costs a little, as roundoff accumulates over
      // more of it. `test_constraint_drift_is_conserved` in
      // `physm-rs/src/solver.rs` is where the order gets asserted; f64 has the
      // resolution for it, and the ratio there is 246x per 4x refinement.
      //
      // What this test pins is the floor itself, an order of magnitude clear.
      const solver = getConstrainedSolver({
        kind,
        rungeKutta: true,
        spacingOffset: 1.5,
      });
      const constraint = solver.scene.constraints[0];
      const readC = () => {
        const ctx = solver._getConfigKinematics(solver.getStateMap());
        const value = constraint.value(ctx);
        solver._disposeConstraintCtx(ctx);
        return value;
      };

      const initial = readC();
      expect(Math.max(...initial.map(Math.abs))).toBeGreaterThan(1);
      let worst = 0;
      for (let step = 0; step < 120; step++) {
        solver.tick(1 / 60);
        readC().forEach((value, row) => {
          worst = Math.max(worst, Math.abs(value - initial[row]));
        });
      }
      expect(worst).toBeLessThan(1e-4);
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
      solver._disposeConstraintCtx(ctx);
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
    );
    const solver = new JsSolver(scene);
    const constraint = scene.constraints[0];
    const ctx = solver._getConfigKinematics(scene.getInitialStateMap());
    const rows = constraint.jacobianRows(ctx);
    const columnOf = (frameId) => {
      const index = scene.sortedFrames.findIndex(
        (frame) => frame.id === frameId,
      );
      return [rows[0][index], rows[1][index]];
    };

    // Computed straight from the sweep, independently of the constraint.
    const expected = tf.tidy(() => {
      const at = (frameId) =>
        ctx.velMatMap
          .get('boom')
          .matMul(
            ctx.posMatMap.get(frameId).matMul(constraint.position1),
          )
          .dataSync();
      const p = at('pole1');
      const q = at('pole2');
      return [p[0] - q[0], p[1] - q[1]];
    });

    const boom = columnOf('boom');
    boom.forEach((entry, axis) => expect(entry).toBeCloseTo(expected[axis], 4));
    // A revolute generator acts on a direction as a quarter turn, so it carries
    // the separation over without changing its length -- which is `TIP_GAP`,
    // the boom having rotated both tips rigidly. Not a threshold: the column's
    // magnitude is predicted exactly.
    expect(Math.hypot(...boom)).toBeCloseTo(TIP_GAP, 4);

    // ...while the prismatic ancestor above it still cancels exactly.
    columnOf('cart').forEach((entry) => expect(entry).toBeCloseTo(0, 6));

    solver._disposeConstraintCtx(ctx);
  });

  test('an unconstrained scene still assembles the plain n-by-n system', () => {
    const solver = new JsSolver(getBranchedScene({ seed: 1 }));
    const size = solver.scene.sortedFrames.length;
    const [aMat, bVec] = solver._getSystemOfEquations(
      solver.scene.getInitialStateMap(),
      new Map(),
    );
    expect(aMat.shape).toEqual([size, size]);
    expect(bVec.shape).toEqual([size, 1]);
    aMat.dispose();
    bVec.dispose();
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
