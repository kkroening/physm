import { CoincidenceConstraint as CoreCoincidenceConstraint } from './../Constraint';
import { useId } from 'react';
import { useSceneNode } from './sceneNodes';
import type { ConstraintOptions } from './../Constraint';

export type CoincidenceConstraintProps = ConstraintOptions;

/**
 * Two frame-relative points welded together.
 *
 * Belongs beside the frames rather than inside either one it names: the two can
 * be in different subtrees, and a constraint is solved against the assembled
 * pose once every frame exists. Nesting one inside a frame is tolerated and
 * means the same thing -- the frame it sits in has no bearing on which frames
 * it constrains.
 */
export default function CoincidenceConstraint(
  props: CoincidenceConstraintProps,
): null {
  useSceneNode(
    useId(),
    { slot: 'constraint', build: () => new CoreCoincidenceConstraint(props) },
    [JSON.stringify(props)],
  );

  return null;
}
