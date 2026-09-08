import type { AnchorPoint } from './sceneNodes';
import type { FrameId } from './../Frame';
import type { PositionLike } from './../Scene';

/** Either end of a constraint: a frame by name, or an `<Anchor>` by ref. */
export type ConstraintEnd = FrameId | { readonly current: AnchorPoint | null };

/**
 * One end of a constraint, as the core constructor wants it.
 *
 * `null` when the end is an anchor that has not reported yet -- see the
 * `constraint` slot in `sceneNodes`. A named frame always resolves, because a
 * name needs nothing to have mounted.
 */
export default function resolveAnchor(
  end: ConstraintEnd,
  position: PositionLike | undefined,
): { frameId: FrameId; position: PositionLike | undefined } | null {
  if (typeof end === 'string') {
    return { frameId: end, position };
  }

  const point = end.current;

  // An explicit `position` beside an anchor would be two answers to one
  // question, and the anchor is the one that knows.
  return point ? { frameId: point.frameId, position: point.position } : null;
}
