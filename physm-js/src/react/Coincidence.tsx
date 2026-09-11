import resolveAnchor from './resolveAnchor';
import { CoincidenceConstraint } from './../Constraint';
import { useId } from 'react';
import { refuseChildren, useSceneNode } from './sceneNodes';
import type { ComponentMeta } from './componentMeta';
import type { ConstraintEnd } from './resolveAnchor';
import type { ConstraintNode } from './sceneNodes';
import type { PositionLike } from './../Scene';

export interface CoincidenceProps {
  frame1: ConstraintEnd;
  frame2: ConstraintEnd;
  position1?: PositionLike;
  position2?: PositionLike | null;
}

function describeCoincidence({
  frame1,
  frame2,
  position1,
  position2,
}: CoincidenceProps): ConstraintNode {
  return {
    slot: 'constraint',
    describe: () =>
      `a <Coincidence> between ` +
      `${typeof frame1 === 'string' ? `'${frame1}'` : 'an anchor'} and ` +
      `${typeof frame2 === 'string' ? `'${frame2}'` : 'an anchor'}`,
    build: (anchors) => {
      const end1 = resolveAnchor(frame1, position1, anchors);
      const end2 = resolveAnchor(frame2, position2 ?? undefined, anchors);
      if (!end1 || !end2) {
        return null;
      }

      return new CoincidenceConstraint({
        frame1: end1.frameId,
        frame2: end2.frameId,
        ...(end1.position === undefined ? {} : { position1: end1.position }),
        ...(end2.position === undefined ? {} : { position2: end2.position }),
      });
    },
  };
}

/**
 * Two frame-relative points welded together.
 *
 * Either end may name a frame, name an `<Anchor>` by its `id`, or be an
 * `<Anchor>` ref. The anchor forms are the ones that compose: a generated
 * subtree names none of its frames, so a chain marks its own tip rather than
 * the author predicting an id. A name that matches an anchor resolves to it
 * before any frame of the same id -- see `resolveAnchor`.
 *
 * Belongs beside the frames rather than inside either one it names -- the two
 * can be in different subtrees. Nesting one inside a frame is tolerated and
 * means the same thing.
 *
 * An omitted `position2` is solved from the assembled pose, so the loop closes
 * at whatever geometry the scene places. See `docs/constraints.md`.
 */
export default function Coincidence(props: CoincidenceProps): null {
  refuseChildren('Coincidence', (props as { children?: unknown }).children);
  useSceneNode(useId(), describeCoincidence(props), props);

  return null;
}

Coincidence.sceneNode = describeCoincidence;

Coincidence.meta = {
  name: 'Coincidence',
  category: 'Constraints',
  slot: 'constraint',
  description: 'Two points welded together.',
  props: {
    frame1: {
      kind: 'end',
      label: 'First end',
      required: true,
      summary: true,
    },
    frame2: {
      kind: 'end',
      label: 'Second end',
      required: true,
      summary: true,
    },
    position1: {
      kind: 'point',
      relativeTo: 'frame1',
      label: 'First point',
      default: [0, 0],
    },

    // No default: an omitted second point is solved for, from the pose.
    position2: { kind: 'point', relativeTo: 'frame2', label: 'Second point' },
  },
} satisfies ComponentMeta<CoincidenceProps>;
