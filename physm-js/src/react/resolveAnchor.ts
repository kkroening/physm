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
 * **A name resolves to an anchor of that `id` if there is one, and to a frame
 * of that id otherwise.** The two never compete: `refuseAnchorFrameCollisions`
 * refuses a scene where one name means both, so the order decides nothing.
 *
 * `null` only when the end is a ref whose anchor has not reported yet -- see
 * the `constraint` slot in `sceneNodes`. A name never returns `null`, which is
 * not the same as never waiting: a name that matches no live anchor is taken
 * as a frame id, so an anchor that has not mounted yet -- or a mistyped one --
 * surfaces as a constraint naming a frame that does not exist, which `<Scene>`
 * sets aside and reports.
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

/**
 * Add an id-named anchor to `anchors`, refusing a second with the same id.
 *
 * Picking either would weld a constraint to whichever came first, which
 * changes the answer rather than the picture. Shared, like
 * `refuseAnchorFrameCollisions`, by every route that collects anchors.
 */
export function addAnchor(
  anchors: Map<string, AnchorPoint>,
  id: string,
  point: AnchorPoint,
): void {
  if (anchors.has(id)) {
    throw new Error(
      `Two <Anchor>s share the id '${id}'. A constraint naming it would be ` +
        'welded to whichever came first; give each its own.',
    );
  }

  anchors.set(id, point);
}

/**
 * Refuse a name that means both an anchor and a frame.
 *
 * Resolved as the anchor, it would silently move every constraint end that
 * spelled the frame's name onto the anchor's frame -- a stated position with it
 * -- while every other use of the name, a state map or the controls' force map,
 * still meant the frame. The same reason two anchors sharing an id are refused:
 * resolving either way changes the answer rather than the picture.
 *
 * Exported so that every route that collects anchors applies one rule, rather
 * than each restating it.
 */
export function refuseAnchorFrameCollisions(
  anchors: AnchorLookup,
  frames: ReadonlyMap<FrameId, unknown>,
): void {
  for (const id of anchors.keys()) {
    if (frames.has(id)) {
      throw new Error(
        `'${id}' names both an <Anchor> and a frame. A constraint end naming ` +
          'it would silently mean the anchor; rename one of the two.',
      );
    }
  }
}
