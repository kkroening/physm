import { CoincidenceConstraint as CoreCoincidenceConstraint } from './../Constraint';
import { useSceneNode } from './sceneNodes';
import type { ConstraintOptions } from './../Constraint';

export type CoincidenceConstraintProps = ConstraintOptions;

/**
 * Two frame-relative points welded together.
 *
 * A constraint is a child of the `<Scene>` rather than of either frame it
 * names: the two can be in different subtrees, and it is solved against the
 * assembled pose once every frame exists.
 */
export default function CoincidenceConstraint(
  props: CoincidenceConstraintProps,
): null {
  useSceneNode(
    { slot: 'constraint', build: () => new CoreCoincidenceConstraint(props) },
    [JSON.stringify(props)],
  );

  return null;
}
