import CoreScene from './../Scene';
import { refuseAnchorFrameCollisions } from './resolveAnchor';
import type Constraint from './../Constraint';
import type { AnchorLookup, ConstraintNode, FrameChildren } from './sceneNodes';

/**
 * What assembly does with a constraint it cannot build yet -- the one place the
 * two routes differ.
 *
 * A mounted tree registers one effect at a time, so a constraint can name a
 * frame or an anchor that is mid-mount: `<Scene>` sets it aside and reports it
 * once the tree has settled. A walked tree is complete when it is handed over,
 * so `buildScene` throws.
 */
export interface Unbuildable {
  /** A constraint naming an `<Anchor>` by a ref nothing has filled. */
  readonly onEmptyRef: (node: ConstraintNode) => void;

  /** A constraint naming a frame the scene does not contain. */
  readonly onMissingFrame: (constraint: Constraint) => void;
}

/**
 * A `Scene`, from what a route has collected: the root's decals, weights and
 * frames, the anchors named by id, and the constraints.
 *
 * Both `<Scene>` and `buildScene` call it, so the rules that make a scene --
 * no mass at the root, no name meaning both an anchor and a frame, constraints
 * added against the assembled pose -- are written once rather than agreed on.
 */
export default function assembleScene(
  root: FrameChildren,
  anchors: AnchorLookup,
  constraints: readonly ConstraintNode[],
  {
    gravity,
    unbuildable,
  }: { gravity?: number | undefined; unbuildable: Unbuildable },
): CoreScene {
  // A scene carries no mass of its own, so there is nowhere for a root
  // `<Weight>` to go. Silently dropping it would remove mass from a rig, which
  // changes the answer rather than the picture -- and `<Weight>` and `<Box>`
  // are siblings inside a frame, so mistaking one for the other is an easy
  // thing to do from the JSX alone.
  if (root.weights.length) {
    throw new Error(
      `A <Weight> must be inside a frame: a scene carries no mass of its ` +
        `own, and ${root.weights.length} was placed at the root of the scene.`,
    );
  }

  const scene = new CoreScene({
    decals: root.decals,
    frames: root.frames,
    ...(gravity === undefined ? {} : { gravity }),
  });

  // After the tree, because `addConstraint` solves against the pose the frames
  // are actually in.
  refuseAnchorFrameCollisions(anchors, scene.frameMap);
  for (const node of constraints) {
    const constraint = node.build(anchors);
    if (!constraint) {
      unbuildable.onEmptyRef(node);
    } else if (
      scene.frameMap.has(constraint.frameId1) &&
      scene.frameMap.has(constraint.frameId2)
    ) {
      scene.addConstraint(constraint);
    } else {
      unbuildable.onMissingFrame(constraint);
    }
  }

  return scene;
}
