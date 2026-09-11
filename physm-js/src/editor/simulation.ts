import type CoreScene from './../Scene';
import type { StateMap } from './../Frame';

/** Simulated seconds per solver step. */
export const STEP = 1 / 240;

/**
 * The most steps one animation frame may take: a tenth of a second's worth.
 *
 * A tab that was hidden, or a frame that stalled, comes back with a long elapsed
 * time, and stepping all of it at once would freeze the page catching up on
 * time nobody watched.
 */
export const MAX_STEPS = 24;

/**
 * How many steps `elapsed` seconds buy, and what is left for the next frame.
 *
 * The remainder is carried rather than dropped, so a frame rate the step does
 * not divide evenly still runs in real time. Past `MAX_STEPS` the excess is
 * dropped: that time is not coming back.
 */
export function stepsFor(
  elapsed: number,
  carried: number,
): { steps: number; carry: number } {
  const total = carried + Math.max(elapsed, 0);

  // The tolerance is for the carry: two halves of a step can sum to a hair
  // under one, and a floor would then hold that step back a frame.
  const steps = Math.min(Math.floor(total / STEP + 1e-9), MAX_STEPS);

  return {
    steps,
    carry: steps === MAX_STEPS ? 0 : Math.max(total - steps * STEP, 0),
  };
}

/**
 * The state after a prop edit: each frame's `[q, q̇]` carried over from `state`
 * where the frame is still there and still the same kind of frame, and its
 * initial state where not.
 *
 * Only for an edit that leaves the structure alone -- a structural edit resets
 * instead (`docs/issues/0014/08-play.md`). An unnamed frame's id is its path,
 * and a prop edit moves no paths, so a frame that was there is still there
 * under the same id. Two exceptions make a new frame: an edit to an `id`, and a
 * changed kind -- `q` in metres means nothing in radians.
 */
export function carryOver(
  before: CoreScene,
  state: StateMap,
  after: CoreScene,
  initial: StateMap,
): StateMap {
  const carried = new Map(initial);
  for (const [id, frameState] of state) {
    const was = before.frameMap.get(id);
    const is = after.frameMap.get(id);
    if (was && is && was.constructor === is.constructor) {
      carried.set(id, frameState);
    }
  }

  return carried;
}
