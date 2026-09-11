import CoreWeight from './../Weight';
import { useId } from 'react';
import { refuseChildren, useSceneNode } from './sceneNodes';
import type { ComponentMeta } from './componentMeta';
import type { SceneNode } from './sceneNodes';
import type { WeightOptions } from './../Weight';

export interface WeightProps extends WeightOptions {
  mass: number;
}

function describeWeight({ mass, ...options }: WeightProps): SceneNode {
  return { slot: 'weight', build: () => new CoreWeight(mass, options) };
}

/** A point mass in the enclosing frame's coordinates. */
export default function Weight(props: WeightProps): null {
  refuseChildren('Weight', (props as { children?: unknown }).children);
  useSceneNode(useId(), describeWeight(props), props);

  return null;
}

Weight.sceneNode = describeWeight;

Weight.meta = {
  name: 'Weight',
  category: 'Physics',
  slot: 'weight',
  description: 'A point mass.',
  props: {
    mass: {
      kind: 'number',
      label: 'Mass',
      required: true,
      initial: 1,
      summary: true,
    },
    position: { kind: 'point', label: 'Position', default: [0, 0] },
    drag: { kind: 'number', label: 'Drag', default: 0 },
  },
} satisfies ComponentMeta<WeightProps>;
