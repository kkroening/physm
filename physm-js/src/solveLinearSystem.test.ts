import {
  DimensionError,
  SingularMatrixError,
  fromRows,
  solveLinearSystem,
} from './solveLinearSystem';

/** `A x`, so a solution can be checked by substitution rather than by expectation. */
function apply(rows: readonly (readonly number[])[], x: readonly number[]): number[] {
  return rows.map((row) =>
    row.reduce((sum, entry, index) => sum + entry * (x[index] ?? 0), 0),
  );
}

function expectSolves(
  rows: readonly (readonly number[])[],
  b: readonly number[],
  tolerance = 1e-9,
): number[] {
  const x = solveLinearSystem(fromRows(rows.map((row) => [...row])), b);

  apply(rows, x).forEach((entry, index) =>
    expect(Math.abs(entry - (b[index] ?? 0))).toBeLessThan(tolerance),
  );

  return x;
}

describe('solveLinearSystem', () => {
  test('solves by substitution, not by remembering an answer', () => {
    expectSolves([[2]], [6]);
    expectSolves(
      [
        [2, 1],
        [1, 3],
      ],
      [5, 10],
    );
    expectSolves(
      [
        [4, -2, 1],
        [-2, 4, -2],
        [1, -2, 4],
      ],
      [11, -16, 17],
    );
  });

  test('solves a symmetric indefinite system, which is what a constrained scene produces', () => {
    // The KKT shape: a positive-definite block, a constraint row, and a zero
    // corner. Cholesky cannot factor this; QR can, which is the whole reason
    // for the choice.
    const x = expectSolves(
      [
        [3, 0, 1],
        [0, 5, -2],
        [1, -2, 0],
      ],
      [4, 1, 0],
    );

    expect(x).toHaveLength(3);
    expect(x.every(Number.isFinite)).toBe(true);
  });

  test('is unmoved by scale, where an absolute pivot test would not be', () => {
    // The same system at three magnitudes; the solution scales exactly.
    const base = [
      [4, 1],
      [1, 3],
    ];

    const reference = expectSolves(base, [1, 1]);

    [1e-8, 1e8].forEach((scale) => {
      const scaled = expectSolves(
        base.map((row) => row.map((entry) => entry * scale)),
        [scale, scale],
        1e-9 * scale,
      );

      scaled.forEach((entry, index) =>
        expect(entry).toBeCloseTo(reference[index] ?? NaN, 9),
      );
    });
  });

  test('rejects a genuinely singular matrix', () => {
    expect(() =>
      solveLinearSystem(
        fromRows([
          [1, 2],
          [2, 4],
        ]),
        [1, 2],
      ),
    ).toThrow(SingularMatrixError);
  });

  test('rejects a mis-shaped system rather than solving a different one', () => {
    expect(() => fromRows([[1, 2], [3]])).toThrow(DimensionError);
    expect(() => solveLinearSystem(fromRows([[1]]), [1, 2])).toThrow(
      DimensionError,
    );
  });

  test('handles an already-triangular system, where no reflection is needed', () => {
    expectSolves(
      [
        [2, 3],
        [0, 4],
      ],
      [8, 8],
    );
  });

  test('reflects away from the pivot, so the reflector never cancels', () => {
    // The Householder sign choice. Aiming the reflection *toward* the diagonal
    // entry makes `x[k] - alpha` cancel when the column is dominated by that
    // entry, and the resulting reflector is built from the cancelled remainder.
    //
    // A well-conditioned system still solves either way, which is why this needs
    // a family where the cancellation bites rather than a single case: measured,
    // the correct sign holds the residual at machine precision across all four
    // epsilons, and flipping it costs seven orders at `1e-8`.
    [1e-3, 1e-8, 1e-14, 1e-18].forEach((epsilon) => {
      const rows = [
        [1, 0.5, 0.25],
        [epsilon, 1, 0.5],
        [epsilon, epsilon, 1],
      ];

      expectSolves(rows, [1, 1, 1], 1e-12);
    });
  });

  test('stays accurate on an ill-conditioned system that float32 could not carry', () => {
    // Condition number ~1e10: solvable in float64, hopeless in float32, which is
    // the headroom this module exists to buy.
    const scale = 1e10;
    const x = expectSolves(
      [
        [1, 0],
        [0, scale],
      ],
      [1, scale * 2],
      1e-6,
    );

    expect(x[0]).toBeCloseTo(1, 9);
    expect(x[1]).toBeCloseTo(2, 9);
  });
});
