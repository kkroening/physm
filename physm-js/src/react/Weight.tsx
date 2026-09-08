import CoreWeight from './../Weight';
import { useSceneNode } from './sceneNodes';
import type { WeightOptions } from './../Weight';

export interface WeightProps extends WeightOptions {
  mass: number;
}

/** A point mass in the enclosing frame's coordinates. */
export default function Weight({ mass, ...options }: WeightProps): null {
  useSceneNode({ slot: 'weight', build: () => new CoreWeight(mass, options) }, [
    mass,
    JSON.stringify(options),
  ]);

  return null;
}
