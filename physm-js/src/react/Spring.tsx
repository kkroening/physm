import CoreSpring from './../Spring';
import { computed } from './../expression';
import { useId } from 'react';
import { refuseChildren, useSceneNode } from './sceneNodes';
import type { Computable } from './../expression';
import type { ComponentMeta } from './componentMeta';
import type { SceneNode } from './sceneNodes';

interface SpringValues {
  stiffness: number;
  rest?: number;
}

/** What an element may be given: any of them may be computed. */
export type SpringProps = Computable<SpringValues>;

function describeSpring({ stiffness, rest }: SpringValues): SceneNode {
  return { slot: 'spring', build: () => new CoreSpring(stiffness, rest) };
}

/**
 * A spring on the enclosing frame's coordinate, slack at `rest`.
 *
 * A torque on a rotational joint and a force along a track's axis, pulling the
 * joint back toward `rest` with `-stiffness * (q - rest)`.
 *
 * **`rest` is in the frame's own coordinate**, which is what "hold the arm
 * horizontal" needs: horizontal relative to whatever the arm is mounted on. A
 * rest read against some *other* frame is not a property of the spring -- it
 * is one frame observed from another, which belongs to the expression system
 * (`docs/issues/0030.md`).
 *
 * **A frame may have several**, and they add. While each is linear their sum is
 * one spring at the summed stiffness, slack at the stiffness-weighted mean of
 * their rests -- so two at the *same* rest are expressible as one, and two at
 * different rests are not. The list is also the shape a non-linear spring needs
 * when one arrives, which is what `docs/issues/0016/12-wishlist.md` asks for:
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
  description:
    "A spring on the enclosing frame's coordinate, slack at its rest.",
  props: {
    stiffness: {
      kind: 'number',
      label: 'Stiffness',
      required: true,
      initial: 1,
      summary: true,
    },

    // `number` rather than `angle` or `length`, because which it is depends on
    // the frame this sits in -- an angle on a revolute joint, a distance along
    // a track -- and one component serves both. `stiffness` is untyped for the
    // same reason.
    rest: { kind: 'number', label: 'Rest', default: 0 },
  },
} satisfies ComponentMeta<SpringValues>;
