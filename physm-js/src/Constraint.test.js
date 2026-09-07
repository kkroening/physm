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

function getConstrainedSolver({ kind, seed = 0, rungeKutta = false } = {}) {
  const scene = getBranchedScene({ seed, spacing: kind.spacing }).addConstraint(
    kind.createConstraint(),
  );
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
