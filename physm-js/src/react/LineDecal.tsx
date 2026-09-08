import CoreLineDecal from './../LineDecal';
import { useId } from 'react';
import { useSceneNode } from './sceneNodes';
import type { LineDecalOptions } from './../LineDecal';

export type LineDecalProps = LineDecalOptions;

/** A line drawn in the enclosing frame's coordinates. */
export default function LineDecal(props: LineDecalProps): null {
  useSceneNode(
    useId(),
    { slot: 'decal', build: () => new CoreLineDecal(props) },
    [JSON.stringify(props)],
  );

  return null;
}
