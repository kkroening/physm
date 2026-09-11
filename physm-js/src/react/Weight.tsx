import CoreWeight from './../Weight';
import { useId } from 'react';
import { useSceneNode } from './sceneNodes';
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
  useSceneNode(useId(), describeWeight(props), props);

  return null;
}

Weight.sceneNode = describeWeight;
