import CoreCircleDecal from './../CircleDecal';
import { useId } from 'react';
import { useSceneNode } from './sceneNodes';
import type { ComponentMeta } from './componentMeta';
import type { CircleDecalOptions } from './../CircleDecal';
import type { SceneNode } from './sceneNodes';

export type CircleProps = CircleDecalOptions;

function describeCircle(props: CircleProps): SceneNode {
  return { slot: 'decal', build: () => new CoreCircleDecal(props) };
}

/** A circle drawn in the enclosing frame's coordinates. */
export default function Circle(props: CircleProps): null {
  useSceneNode(useId(), describeCircle(props), props);

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
} satisfies ComponentMeta<CircleProps>;
