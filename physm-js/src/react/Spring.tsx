import CoreSpring from './../Spring';
import { computed } from './../expression';
import { useId } from 'react';
import { refuseChildren, useSceneNode } from './sceneNodes';
import type { Computable } from './../expression';
import type { ComponentMeta } from './componentMeta';
import type { SceneNode } from './sceneNodes';

interface SpringValues {
  stiffness: number;
}

/** What an element may be given: any of them may be computed. */
export type SpringProps = Computable<SpringValues>;

function describeSpring({ stiffness }: SpringValues): SceneNode {
  return { slot: 'spring', build: () => new CoreSpring(stiffness) };
}

/**
 * A spring on the enclosing frame's coordinate, slack at zero.
 *
 * A torque on a rotational joint and a force along a track's axis, pulling the
 * joint back toward zero with `-stiffness * q`.
 *
 * **A frame may have several**, and they add. While each is linear that is the
 * same as one of their summed stiffness, so the multiplicity is not yet worth
 * anything -- and it is the shape that makes a non-linear one expressible when
 * one arrives, which is what `docs/issues/0016/12-wishlist.md` asks for:
 * "a restoring force that gets stronger at greater angles".
 *
 * A `<FixedFrame>` refuses one, because its coordinate moves nothing and a
 * spring on it would silently do nothing at all.
 */
export default function Spring(props: SpringProps): null {
  refuseChildren('Spring', (props as { children?: unknown }).children);
  useSceneNode(useId(), describeSpring(computed<SpringValues>(props)), props);

  return null;
}

Spring.sceneNode = describeSpring;

Spring.meta = {
  name: 'Spring',
  category: 'Physics',
  slot: 'spring',
  description: "A spring on the enclosing frame's coordinate, slack at zero.",
  props: {
    stiffness: {
      kind: 'number',
      label: 'Stiffness',
      required: true,
      initial: 1,
      summary: true,
    },
  },
} satisfies ComponentMeta<SpringValues>;
