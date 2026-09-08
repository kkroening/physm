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

/** How small a pivot may be, relative to the largest, before `R` is singular. */
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
 * Mutable and `Float64Array`-backed because the factorization works in place;
 * unlike `Mat3`, the size is not known ahead of time, so the indices are
 * computed and the accessors below exist to keep that in one place.
 */
export interface SquareMatrix {
  readonly size: number;
  readonly values: Float64Array;
}

/** Element `(row, col)`. */
function at(matrix: SquareMatrix, row: number, col: number): number {
  return matrix.values[row * matrix.size + col] ?? 0;
}

function setAt(
  matrix: SquareMatrix,
  row: number,
  col: number,
  value: number,
): void {
  matrix.values[row * matrix.size + col] = value;
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
    row.forEach((entry, colIndex) => {
      values[rowIndex * size + colIndex] = entry;
    });
  });

  return { size, values };
}

/**
 * Reflect columns `k` onward of `matrix`, and `vector`, about the Householder
 * plane that zeroes column `k` below the diagonal.
 *
 * Returns the reflector's squared norm, or zero when the column is already
 * clear and no reflection is needed.
 */
function reflectColumn(
  matrix: SquareMatrix,
  vector: Float64Array,
  k: number,
): number {
  const { size } = matrix;

  let normSq = 0;
  for (let row = k; row < size; row++) {
    normSq += at(matrix, row, k) ** 2;
  }
  if (normSq === 0) {
    return 0;
  }

  // Away from the diagonal entry rather than toward it, so the subtraction that
  // builds `reflector` never cancels.
  const norm = Math.sqrt(normSq);
  const alpha = at(matrix, k, k) > 0 ? -norm : norm;

  const reflector = new Float64Array(size);
  for (let row = k; row < size; row++) {
    reflector[row] = at(matrix, row, k);
  }
  reflector[k] = (reflector[k] ?? 0) - alpha;

  let reflectorNormSq = 0;
  for (let row = k; row < size; row++) {
    reflectorNormSq += (reflector[row] ?? 0) ** 2;
  }
  if (reflectorNormSq === 0) {
    return 0;
  }

  for (let col = k; col < size; col++) {
    let projection = 0;
    for (let row = k; row < size; row++) {
      projection += (reflector[row] ?? 0) * at(matrix, row, col);
    }

    const factor = (2 * projection) / reflectorNormSq;
    for (let row = k; row < size; row++) {
      setAt(matrix, row, col, at(matrix, row, col) - factor * (reflector[row] ?? 0));
    }
  }

  let vectorProjection = 0;
  for (let row = k; row < size; row++) {
    vectorProjection += (reflector[row] ?? 0) * (vector[row] ?? 0);
  }

  const vectorFactor = (2 * vectorProjection) / reflectorNormSq;
  for (let row = k; row < size; row++) {
    vector[row] = (vector[row] ?? 0) - vectorFactor * (reflector[row] ?? 0);
  }

  return reflectorNormSq;
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
 * Back-substitute through an upper-triangular `matrix`.
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
      sum += at(matrix, row, col) * (solution[col] ?? 0);
    }

    solution[row] = ((vector[row] ?? 0) - sum) / pivot;
  }

  return solution;
}

/**
 * Solve `A x = b`.
 *
 * `A` is consumed: it is reduced to `R` in place, so pass a matrix the caller
 * has finished with, or `fromRows` a fresh one.
 */
export function solveLinearSystem(
  matrix: SquareMatrix,
  vector: readonly number[],
): number[] {
  if (vector.length !== matrix.size) {
    throw new DimensionError(
      `Expected a right-hand side of ${matrix.size} entries; got ` +
        `${vector.length}`,
    );
  }

  const reduced = Float64Array.from(vector);
  for (let k = 0; k < matrix.size; k++) {
    reflectColumn(matrix, reduced, k);
  }

  return backSubstitute(matrix, reduced);
}
