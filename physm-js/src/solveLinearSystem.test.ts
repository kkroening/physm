import {
  DimensionError,
  SingularMatrixError,
  factor,
  fromRows,
  solveFactored,
  solveLinearSystem,
} from './solveLinearSystem';

/** `A x`, so a solution can be checked by substitution rather than by expectation. */
function apply(rows: readonly (readonly number[])[], x: readonly number[]): number[] {
  return rows.map((row) =>
    row.reduce((sum, entry, index) => sum + entry * (x[index] ?? 0), 0),
  );
}

/**
 * Solve, and check the result two ways.
 *
 * The residual `Ax - b` is *backward* error, and Householder QR is
 * unconditionally backward stable -- so a tiny residual is a property of the
 * algorithm rather than evidence about this implementation, and it stays at
 * machine precision on a Hilbert system whose answer has lost eleven digits.
 *
 * So an `expected` solution, where the caller knows one, is the assertion that
 * actually bites; the residual check is kept because the two catch different
 * things.
 */
function expectSolves(
  rows: readonly (readonly number[])[],
  b: readonly number[],
  {
    residualTolerance = 1e-9,
    expected,
    forwardTolerance = 1e-9,
  }: {
    residualTolerance?: number;
    expected?: readonly number[];
    forwardTolerance?: number;
  } = {},
): number[] {
  const x = solveLinearSystem(fromRows(rows.map((row) => [...row])), b);

  apply(rows, x).forEach((entry, index) =>
    expect(Math.abs(entry - (b[index] ?? 0))).toBeLessThan(residualTolerance),
  );

  expected?.forEach((want, index) =>
    expect(Math.abs((x[index] ?? NaN) - want)).toBeLessThan(forwardTolerance),
  );

  return x;
}

/**
 * A symmetric positive-definite system with a stated condition number, built as
 * `Q diag(1, 1/cond) Qᵀ` so the ill-conditioning is *not* diagonal scaling.
 *
 * That distinction is the whole point: a diagonal system is solved
 * componentwise, so its condition number never costs a digit and it proves
 * nothing about precision.
 */
function illConditioned(condition: number): {
  rows: number[][];
  b: number[];
  expected: number[];
} {
  const angle = 0.7;
  const [c, s] = [Math.cos(angle), Math.sin(angle)];
  const small = 1 / condition;

  const rows = [
    [c * c + small * s * s, c * s - small * c * s],
    [c * s - small * c * s, s * s + small * c * c],
  ];
  const expected = [1, 1];

  return { rows, b: apply(rows, expected), expected };
}

describe('solveLinearSystem', () => {
  test('solves by substitution, not by remembering an answer', () => {
    expectSolves([[2]], [6], { expected: [3] });
    expectSolves(
      [
        [2, 1],
        [1, 3],
      ],
      [5, 10],
      { expected: [1, 3] },
    );
    expectSolves(
      [
        [4, -2, 1],
        [-2, 4, -2],
        [1, -2, 4],
      ],
      [11, -16, 17],
      { expected: [1, -2, 3] },
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
        base.map((row) => row.map((value) => value * scale)),
        [scale, scale],
        { residualTolerance: 1e-9 * scale },
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

      expectSolves(rows, [1, 1, 1], { residualTolerance: 1e-12 });
    });
  });

  test('stays accurate on an ill-conditioned system that float32 could not carry', () => {
    // Deliberately *not* `diag(1, 1e10)`. That has condition number 1e10 and is
    // solved exactly in float32, because a diagonal system is one division per
    // unknown and the two scales never meet in an operation. Conditioning only
    // costs accuracy when badly-scaled quantities are added.
    //
    // This one is a near-parallel pair, where float32 returns [0, 2] for an
    // answer of [1, 1].
    const { rows, b, expected } = illConditioned(1e10);

    expectSolves(rows, b, { forwardTolerance: 1e-4, expected });
  });

  test('pins the singularity ceiling from both sides', () => {
    // `SINGULAR_RELATIVE_TOLERANCE` is a policy about how ill-conditioned a
    // scene may be before the solver declines, and it is the number that decides
    // when `Scene` reports an undetermined initial-velocity correction. Setting
    // it to zero left every other test in this file passing.
    const inside = illConditioned(1e11);
    expect(() =>
      solveLinearSystem(fromRows(inside.rows), inside.b),
    ).not.toThrow();

    const outside = illConditioned(1e14);
    expect(() => solveLinearSystem(fromRows(outside.rows), outside.b)).toThrow(
      SingularMatrixError,
    );
  });

  test('one factorization serves many right-hand sides', () => {
    // `Scene`'s initial-velocity projection solves once per constraint row
    // against a single mass matrix. Factoring is destructive, so re-solving
    // through `solveLinearSystem` would return `R⁻¹b` on every call after the
    // first -- plausible-looking, finite, and wrong.
    const rows = [
      [4, 1],
      [1, 3],
    ];
    const factorization = factor(fromRows(rows.map((row) => [...row])));

    [
      [1, 0],
      [0, 1],
      [5, 5],
    ].forEach((b) => {
      const x = solveFactored(factorization, b);

      apply(rows, x).forEach((got, index) =>
        expect(got).toBeCloseTo(b[index] ?? NaN, 9),
      );
    });
  });
});
