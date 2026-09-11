import resolveAnchor from './resolveAnchor';
import { DistanceConstraint } from './../Constraint';
import { useId } from 'react';
import { useSceneNode } from './sceneNodes';
import type { ComponentMeta } from './componentMeta';
import type { ConstraintEnd } from './resolveAnchor';
import type { ConstraintNode } from './sceneNodes';
import type { PositionLike } from './../Scene';

export interface DistanceProps {
  frame1: ConstraintEnd;
  frame2: ConstraintEnd;
  position1?: PositionLike;
  position2?: PositionLike | null;
  length?: number | null;
}

function describeDistance({
  frame1,
  frame2,
  position1,
  position2,
  length,
}: DistanceProps): ConstraintNode {
  return {
    slot: 'constraint',
    describe: () =>
      `a <Distance> between ` +
      `${typeof frame1 === 'string' ? `'${frame1}'` : 'an anchor'} and ` +
      `${typeof frame2 === 'string' ? `'${frame2}'` : 'an anchor'}`,
    build: (anchors) => {
      const end1 = resolveAnchor(frame1, position1, anchors);
      const end2 = resolveAnchor(frame2, position2 ?? undefined, anchors);
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
  };
}

/**
 * Two frame-relative points held a fixed distance apart.
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
 * An omitted `length` adopts whatever gap the assembled scene places, so a rig
 * can be authored at any geometry. See `docs/constraints.md`.
 */
export default function Distance(props: DistanceProps): null {
  useSceneNode(useId(), describeDistance(props), props);

  return null;
}

Distance.sceneNode = describeDistance;

Distance.meta = {
  name: 'Distance',
  category: 'Constraints',
  slot: 'constraint',
  description: 'Two points held a fixed distance apart.',
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
    position1: { kind: 'point', label: 'First point', default: [0, 0] },
    position2: { kind: 'point', label: 'Second point', default: [0, 0] },

    // No default: an omitted length is adopted from the gap the pose places.
    length: { kind: 'length', label: 'Length' },
  },
} satisfies ComponentMeta<DistanceProps>;
