import resolveAnchor from './resolveAnchor';
import { DistanceConstraint } from './../Constraint';
import { useId } from 'react';
import { useSceneNode } from './sceneNodes';
import type { ConstraintEnd } from './resolveAnchor';
import type { PositionLike } from './../Scene';

export interface DistanceProps {
  frame1: ConstraintEnd;
  frame2: ConstraintEnd;
  position1?: PositionLike;
  position2?: PositionLike | null;
  length?: number | null;
}

/**
 * Two frame-relative points held a fixed distance apart.
 *
 * Either end may be a frame's id or an `<Anchor>` ref, and the anchor form is
 * the one that composes: a generated subtree names none of its frames, so a
 * chain marks its own tip and hands the mark out rather than the author
 * predicting an id.
 *
 * Belongs beside the frames rather than inside either one it names -- the two
 * can be in different subtrees. Nesting one inside a frame is tolerated and
 * means the same thing.
 *
 * An omitted `length` adopts whatever gap the assembled scene places, so a rig
 * can be authored at any geometry. See `docs/constraints.md`.
 */
export default function Distance({
  frame1,
  frame2,
  position1,
  position2,
  length,
}: DistanceProps): null {
  useSceneNode(
    useId(),
    {
      slot: 'constraint',
      build: () => {
        const end1 = resolveAnchor(frame1, position1);
        const end2 = resolveAnchor(frame2, position2 ?? undefined);
        if (!end1 || !end2) {
          return null;
        }

        return new DistanceConstraint({
          frame1: end1.frameId,
          frame2: end2.frameId,
          ...(end1.position === undefined ? {} : { position1: end1.position }),
          ...(end2.position === undefined ? {} : { position2: end2.position }),
          ...(length == null ? {} : { length }),
        });
      },
    },
    [
      frame1,
      frame2,
      JSON.stringify(position1),
      JSON.stringify(position2),
      length,
    ],
  );

  return null;
}
