import CoreWeight from './../Weight';
import { useId } from 'react';
import { useSceneNode } from './sceneNodes';
import type { WeightOptions } from './../Weight';

export interface WeightProps extends WeightOptions {
  mass: number;
}

/** A point mass in the enclosing frame's coordinates. */
export default function Weight({ mass, ...options }: WeightProps): null {
  useSceneNode(
    useId(),
    { slot: 'weight', build: () => new CoreWeight(mass, options) },
    [mass, JSON.stringify(options)],
  );

  return null;
}
