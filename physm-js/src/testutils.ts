/**
 * Helpers shared across the test suite.
 *
 * This file used to be mostly tensor bookkeeping -- reading a tensor's values
 * and disposing it in one step, comparing two within a tolerance, and
 * `checkTfMemory`, which wrapped a call and asserted the tensor count had not
 * grown. None of it survives: `Mat3` and `Vec3` are plain tuples with no
 * lifetimes, so there is nothing to leak and nothing to dispose.
 */

/** Whether two numeric sequences agree entry by entry, within `tolerance`. */
export function areClose(
  a: readonly number[],
  b: readonly number[],
  tolerance = 1e-9,
): boolean {
  return (
    a.length === b.length &&
    a.every((entry, index) => Math.abs(entry - (b[index] ?? NaN)) <= tolerance)
  );
}
