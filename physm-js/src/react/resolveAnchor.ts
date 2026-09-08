import type { AnchorHandle } from './sceneNodes';
import type { FrameId } from './../Frame';
import type { PositionLike } from './../Scene';

/** Either end of a constraint: a frame by name, or an `<Anchor>` by ref. */
export type ConstraintEnd = FrameId | AnchorHandle;

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
  if (!point) {
    return null;
  }

  // The anchor's own point wins where it has one, because it is the thing that
  // knows -- but an anchor may deliberately state none, which is how a
  // `CoincidenceConstraint`'s solved attachment stays expressible. In that case
  // the caller's `position` is what there is.
  if (point.position !== undefined && position !== undefined) {
    console.warn(
      `physm: a position was given alongside an <Anchor> on frame ` +
        `'${point.frameId}', which states its own. The anchor's is used. Drop ` +
        'one of the two, or the scene is built from geometry the JSX does not ' +
        'show.',
    );
  }

  return { frameId: point.frameId, position: point.position ?? position };
}
