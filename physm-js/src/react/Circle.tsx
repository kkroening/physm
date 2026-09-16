import CoreCircleDecal from './../CircleDecal';
import { computed } from './../expression';
import { useId } from 'react';
import { refuseChildren, useSceneNode } from './sceneNodes';
import type { Computable } from './../expression';
import type { ComponentMeta } from './componentMeta';
import type { CircleDecalOptions } from './../CircleDecal';
import type { SceneNode } from './sceneNodes';

type CircleValues = CircleDecalOptions;

/** What an element may be given: any of them may be computed. */
export type CircleProps = Computable<CircleValues>;

function describeCircle(props: CircleValues): SceneNode {
  return { slot: 'decal', build: () => new CoreCircleDecal(props) };
}

/** A circle drawn in the enclosing frame's coordinates. */
export default function Circle(props: CircleProps): null {
  refuseChildren('Circle', (props as { children?: unknown }).children);
  useSceneNode(useId(), describeCircle(computed<CircleValues>(props)), props);

  return null;
}

Circle.sceneNode = describeCircle;

Circle.meta = {
  name: 'Circle',
  category: 'Shapes',
  slot: 'decal',
  description: 'A filled disc.',
  props: {
    position: { kind: 'point', label: 'Position', default: [0, 0] },
    radius: { kind: 'length', label: 'Radius', default: 1 },
    color: { kind: 'color', label: 'Colour', default: 'black' },
  },
} satisfies ComponentMeta<CircleValues>;
