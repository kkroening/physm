/**
 * A generalized coordinate and its velocity, `[q, qd]`.
 *
 * One per frame: `algorithm.md` calls the vector of them `q` and `q̇`, and the
 * solver integrates the pair together.
 */
export type State = readonly [number, number];

export const ZERO_STATE: State = [0, 0];

/**
 * Accept the shapes a scene author writes a state in.
 *
 * A bare number is a position with no initial velocity, which is what most
 * scenes want; a one-element array means the same.
 */
export function coerceState(
  state: number | readonly number[] | null | undefined,
): State {
  if (state == null) {
    return ZERO_STATE;
  }

  if (typeof state === 'number') {
    return [state, 0];
  }

  if (state.length === 0 || state.length > 2) {
    throw new TypeError(
      `Expected a state of 1 or 2 elements; got ${JSON.stringify(state)}`,
    );
  }

  return [state[0] ?? 0, state[1] ?? 0];
}
