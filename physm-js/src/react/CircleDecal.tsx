import CoreCircleDecal from './../CircleDecal';
import { useSceneNode } from './sceneNodes';
import type { CircleDecalOptions } from './../CircleDecal';

export type CircleDecalProps = CircleDecalOptions;

/** A circle drawn in the enclosing frame's coordinates. */
export default function CircleDecal(props: CircleDecalProps): null {
  useSceneNode({ slot: 'decal', build: () => new CoreCircleDecal(props) }, [
    JSON.stringify(props),
  ]);

  return null;
}
