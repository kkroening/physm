import CoreWorldSpring from './../WorldSpring';
import { computed } from './../expression';
import { useId } from 'react';
import { refuseChildren, useSceneNode } from './sceneNodes';
import type { Computable } from './../expression';
import type { ComponentMeta } from './componentMeta';
import type { SceneNode } from './sceneNodes';

interface WorldSpringValues {
  stiffness: number;
  restAngle: number;
}

/** What an element may be given: any of them may be computed. */
export type WorldSpringProps = Computable<WorldSpringValues>;

function describeWorldSpring({
  stiffness,
  restAngle,
}: WorldSpringValues): SceneNode {
  return {
    slot: 'worldSpring',
    build: () => new CoreWorldSpring(stiffness, restAngle),
  };
}

/**
 * A torsion spring between the enclosing frame and the world.
 *
 * The crane arm that holds itself horizontal: `restAngle` is a direction in
 * the **world**, so the frame cancels whatever it hangs from rather than
 * leaning with it, and goes on cancelling it while the scene runs.
 *
 * ```jsx
 * <RotationalFrame id="mast" initialState={[0.4, 0]}>
 *   <RotationalFrame id="arm" position={[4, 0]}>
 *     <WorldSpring stiffness={45} restAngle={0} />
 *   </RotationalFrame>
 * </RotationalFrame>
 * ```
 *
 * **It is a different device from a `<Spring>`, not a setting of one.** A
 * joint spring acts on its frame's own coordinate. This one is anchored to
 * the world, so it resists any rotation of its frame -- including rotation
 * inherited from above -- and its torque enters the row of every rotational
 * frame between the world and it.
 *
 * Only a frame that turns can take one: a track's coordinate slides and a
 * fixed frame's moves nothing, so a torque applied there would act on nothing.
 */
export default function WorldSpring(props: WorldSpringProps): null {
  refuseChildren('WorldSpring', (props as { children?: unknown }).children);
  useSceneNode(
    useId(),
    describeWorldSpring(computed<WorldSpringValues>(props)),
    props,
  );

  return null;
}

WorldSpring.sceneNode = describeWorldSpring;

WorldSpring.meta = {
  name: 'WorldSpring',
  category: 'Physics',
  slot: 'worldSpring',
  description: 'A torsion spring between the enclosing frame and the world.',
  props: {
    stiffness: {
      kind: 'number',
      label: 'Stiffness',
      required: true,
      initial: 1,
      summary: true,
    },

    // Labelled for the frame it is measured in, because every other angle on
    // a frame is local and nothing else on the surface would say which.
    restAngle: {
      kind: 'angle',
      label: 'Rest angle (world)',
      required: true,
      initial: 0,
    },
  },
} satisfies ComponentMeta<WorldSpringValues>;
