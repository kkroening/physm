/**
 * A dense square solve by Householder QR, in float64.
 *
 * QR rather than Cholesky, and the distinction is load-bearing rather than
 * stylistic: the augmented system a constrained scene produces is symmetric but
 * **indefinite** — the zero block guarantees negative eigenvalues — so Cholesky
 * does not merely cost more here, it does not apply. See `docs/algorithm.md` §5.
 *
 * `physm-js` previously reached into TensorFlow.js for `linalg.qr`, which
 * computes in float32. That put a hard ceiling on the conditioning a scene could
 * carry, since the mass matrix mixes a prismatic coordinate's mass with a
 * revolute one's mass × length² and so has a condition number growing with the
 * square of the scale.
 */

/**
 * How small a pivot may be, relative to the largest, before `R` counts as
 * singular.
 *
 * This is a **policy** about how ill-conditioned a scene may be before the
 * solver declines, not a floating-point detail — measured, refusal begins
 * between condition numbers of `1e12` and `1e13`, where float64 still returns
 * two or three correct digits. Declining beats returning them.
 *
 * It deliberately moves from the `1e-6` that `utils.js` used, which was chosen
 * against float32 and is a million times tighter than float64 warrants.
 * `pinsTheSingularityCeiling` in the tests holds both sides of it.
 */
const SINGULAR_RELATIVE_TOLERANCE = 1e-12;

export class SingularMatrixError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SingularMatrixError';
  }
}

export class DimensionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DimensionError';
  }
}

/**
 * A square matrix, flat and row-major.
 *
 * `Float64Array`-backed and **mutable**, because factorization reduces it in
 * place. Unlike `Mat3` the size is not known ahead of time, so the indices are
 * computed and the accessors below keep that in one place.
 */
export interface SquareMatrix {
  readonly size: number;
  values: Float64Array;
}

/**
 * Element `(row, col)`.
 *
 * Throws rather than defaulting on an out-of-range read. Every index in this
 * file is provably in range, so this is unreachable — which is exactly why it
 * should be loud: substituting `0` would turn an indexing mistake into a legal
 * matrix entry and a plausible wrong answer.
 */
function at(matrix: SquareMatrix, row: number, col: number): number {
  const value = matrix.values[row * matrix.size + col];
  if (value === undefined) {
    throw new RangeError(
      `(${row}, ${col}) is outside a ${matrix.size}-square matrix`,
    );
  }

  return value;
}

/** The vector counterpart of `at`, and loud for the same reason. */
function atEntry(vector: readonly number[], index: number): number {
  const value = vector[index];
  if (value === undefined) {
    throw new RangeError(`${index} is outside a ${vector.length}-vector`);
  }

  return value;
}

function setAt(
  matrix: SquareMatrix,
  row: number,
  col: number,
  value: number,
): void {
  matrix.values[row * matrix.size + col] = value;
}

/** An element of a `Float64Array` that is provably in range. */
function entry(values: Float64Array, index: number): number {
  const value = values[index];
  if (value === undefined) {
    throw new RangeError(`${index} is outside a ${values.length}-element array`);
  }

  return value;
}

/** A square matrix from nested rows, which is how the assemblers build one. */
export function fromRows(rows: readonly (readonly number[])[]): SquareMatrix {
  const size = rows.length;
  const values = new Float64Array(size * size);

  rows.forEach((row, rowIndex) => {
    if (row.length !== size) {
      throw new DimensionError(
        `Expected a square matrix; row ${rowIndex} has ${row.length} ` +
          `entries against ${size} rows`,
      );
    }
    row.forEach((value, colIndex) => {
      values[rowIndex * size + colIndex] = value;
    });
  });

  return { size, values };
}

/**
 * `A = QR`, with `Q` kept as the reflectors that build it rather than assembled.
 *
 * Separating this from the solve is what makes several right-hand sides against
 * one matrix correct *and* cheap: one `O(n³)` factorization serves all of them,
 * where re-factorizing per solve would both cost `n` times as much and — since
 * factorization is destructive — silently return `R⁻¹b` on every call after the
 * first. `Scene`'s initial-velocity projection solves once per constraint row
 * against a single mass matrix, so this is the common case rather than an edge.
 */
export interface Factorization {
  readonly upper: SquareMatrix;
  readonly reflectors: readonly Float64Array[];
}

/**
 * Reflect columns `k` onward of `matrix` about the Householder plane that clears
 * column `k` below the diagonal, returning the reflector.
 *
 * A zero-length reflector means the column is already zero from the diagonal
 * down — not merely clear below it — so there is nothing to reflect and `R` will
 * be singular at this pivot.
 */
function reflectColumn(matrix: SquareMatrix, k: number): Float64Array {
  const { size } = matrix;
  const reflector = new Float64Array(size);

  let normSq = 0;
  for (let row = k; row < size; row++) {
    normSq += at(matrix, row, k) ** 2;
  }
  if (normSq === 0) {
    return reflector;
  }

  // Away from the diagonal entry rather than toward it, so the subtraction that
  // builds the reflector never cancels. Worth seven orders of magnitude on a
  // column the diagonal dominates; `reflects away from the pivot` pins it.
  const alpha = at(matrix, k, k) > 0 ? -Math.sqrt(normSq) : Math.sqrt(normSq);

  for (let row = k; row < size; row++) {
    reflector[row] = at(matrix, row, k);
  }
  reflector[k] = entry(reflector, k) - alpha;

  const reflectorNormSq = reflectorNormSquared(reflector, k);
  for (let col = k; col < size; col++) {
    let projection = 0;
    for (let row = k; row < size; row++) {
      projection += entry(reflector, row) * at(matrix, row, col);
    }

    const factor = (2 * projection) / reflectorNormSq;
    for (let row = k; row < size; row++) {
      setAt(
        matrix,
        row,
        col,
        at(matrix, row, col) - factor * entry(reflector, row),
      );
    }
  }

  return reflector;
}

function reflectorNormSquared(reflector: Float64Array, from: number): number {
  let normSq = 0;
  for (let row = from; row < reflector.length; row++) {
    normSq += entry(reflector, row) ** 2;
  }

  return normSq;
}

/** Apply one stored reflection to a right-hand side, in place. */
function reflectVector(
  vector: Float64Array,
  reflector: Float64Array,
  from: number,
): void {
  const normSq = reflectorNormSquared(reflector, from);
  if (normSq === 0) {
    return;
  }

  let projection = 0;
  for (let row = from; row < vector.length; row++) {
    projection += entry(reflector, row) * entry(vector, row);
  }

  const factor = (2 * projection) / normSq;
  for (let row = from; row < vector.length; row++) {
    vector[row] = entry(vector, row) - factor * entry(reflector, row);
  }
}

/**
 * Factor `A` into `QR`.
 *
 * `matrix` is **consumed**: it is reduced to `R` in place and retained by the
 * returned factorization. Pass one the caller has finished with.
 */
export function factor(matrix: SquareMatrix): Factorization {
  const reflectors = Array.from({ length: matrix.size }, (_unused, k) =>
    reflectColumn(matrix, k),
  );

  return { upper: matrix, reflectors };
}

/** The largest absolute value on the diagonal, which sets the singularity scale. */
function largestPivot(matrix: SquareMatrix): number {
  let largest = 0;
  for (let index = 0; index < matrix.size; index++) {
    largest = Math.max(largest, Math.abs(at(matrix, index, index)));
  }

  return largest;
}

/**
 * Back-substitute through the upper-triangular `matrix`.
 *
 * The singularity test is **relative** to the largest pivot. An absolute
 * threshold would reject a well-conditioned system for being authored in
 * kilometres rather than metres, which is a real failure this codebase has had.
 */
function backSubstitute(matrix: SquareMatrix, vector: Float64Array): number[] {
  const { size } = matrix;
  const pivotScale = largestPivot(matrix);
  const solution = new Array<number>(size).fill(0);

  for (let row = size - 1; row >= 0; row--) {
    const pivot = at(matrix, row, row);
    if (Math.abs(pivot) <= SINGULAR_RELATIVE_TOLERANCE * pivotScale) {
      throw new SingularMatrixError(
        `Singular matrix: pivot ${pivot} at row ${row}, against a largest ` +
          `pivot of ${pivotScale}`,
      );
    }

    let sum = 0;
    for (let col = row + 1; col < size; col++) {
      sum += at(matrix, row, col) * atEntry(solution, col);
    }

    solution[row] = (entry(vector, row) - sum) / pivot;
  }

  return solution;
}

/**
 * Solve `A x = b` against an existing factorization.
 *
 * Non-destructive in both arguments, so one factorization serves any number of
 * right-hand sides.
 */
export function solveFactored(
  factorization: Factorization,
  vector: readonly number[],
): number[] {
  const { upper, reflectors } = factorization;
  if (vector.length !== upper.size) {
    throw new DimensionError(
      `Expected a right-hand side of ${upper.size} entries; got ${vector.length}`,
    );
  }

  const reduced = Float64Array.from(vector);
  reflectors.forEach((reflector, k) => reflectVector(reduced, reflector, k));

  return backSubstitute(upper, reduced);
}

/**
 * Solve `A x = b` for a single right-hand side.
 *
 * `matrix` is consumed, since this factors it. Use `factor` plus `solveFactored`
 * for several right-hand sides against one matrix.
 */
export function solveLinearSystem(
  matrix: SquareMatrix,
  vector: readonly number[],
): number[] {
  return solveFactored(factor(matrix), vector);
}
