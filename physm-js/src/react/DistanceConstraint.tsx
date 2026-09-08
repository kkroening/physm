import { DistanceConstraint as CoreDistanceConstraint } from './../Constraint';
import { useSceneNode } from './sceneNodes';
import type { DistanceConstraintOptions } from './../Constraint';

export type DistanceConstraintProps = DistanceConstraintOptions;

/**
 * Two frame-relative points held a fixed distance apart.
 *
 * An omitted `length` adopts whatever gap the assembled scene places, which is
 * what lets a rig be authored at any geometry -- see `docs/constraints.md`.
 */
export default function DistanceConstraint(
  props: DistanceConstraintProps,
): null {
  useSceneNode(
    { slot: 'constraint', build: () => new CoreDistanceConstraint(props) },
    [JSON.stringify(props)],
  );

  return null;
}
