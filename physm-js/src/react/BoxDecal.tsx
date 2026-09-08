import CoreBoxDecal from './../BoxDecal';
import { useId } from 'react';
import { useSceneNode } from './sceneNodes';
import type { BoxDecalOptions } from './../BoxDecal';

export type BoxDecalProps = BoxDecalOptions;

/** A box drawn in the enclosing frame's coordinates. */
export default function BoxDecal(props: BoxDecalProps): null {
  useSceneNode(
    useId(),
    { slot: 'decal', build: () => new CoreBoxDecal(props) },
    [JSON.stringify(props)],
  );

  return null;
}
