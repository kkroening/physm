import type { AnchorHandle, AnchorLookup, AnchorPoint } from './sceneNodes';
import type { FrameId } from './../Frame';
import type { PositionLike } from './../Scene';

/**
 * Either end of a constraint: a name, or an `<Anchor>` by ref.
 *
 * A name is an anchor's `id` where one exists and a frame's id otherwise -- see
 * `resolveAnchor`.
 */
export type ConstraintEnd = FrameId | AnchorHandle;

/** A constraint end, as the core constructor wants it. */
export interface ResolvedEnd {
  readonly frameId: FrameId;
  readonly position: PositionLike | undefined;
}

/**
 * An anchor's point, combined with a position the caller also supplied.
 *
 * The anchor's own point wins where it has one, because it is the thing that
 * knows -- but an anchor may deliberately state none, which is how a
 * `CoincidenceConstraint`'s solved attachment stays expressible. In that case
 * the caller's `position` is what there is.
 */
function fromAnchor(
  point: AnchorPoint,
  position: PositionLike | undefined,
): ResolvedEnd {
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

/**
 * One end of a constraint, as the core constructor wants it.
 *
 * **A name resolves to an anchor before a frame.** An anchor with that `id`
 * wins over a frame with that id, because the anchor is the more specific
 * thing: it names a point, where a frame id names only an origin. A name that
 * matches no anchor is a frame id, and passes through untouched.
 *
 * `null` when the end is a ref whose anchor has not reported yet -- see the
 * `constraint` slot in `sceneNodes`. A name never returns `null`: an anchor
 * named by id is collected before any constraint is built, and a frame name
 * needs nothing to have mounted.
 */
export default function resolveAnchor(
  end: ConstraintEnd,
  position: PositionLike | undefined,
  anchors: AnchorLookup,
): ResolvedEnd | null {
  if (typeof end === 'string') {
    const named = anchors.get(end);

    return named ? fromAnchor(named, position) : { frameId: end, position };
  }

  const point = end.current;

  return point ? fromAnchor(point, position) : null;
}
