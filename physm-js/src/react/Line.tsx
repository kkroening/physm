import CoreLineDecal from './../LineDecal';
import { useId } from 'react';
import { useSceneNode } from './sceneNodes';
import type { LineDecalOptions } from './../LineDecal';

export type LineProps = LineDecalOptions;

/** A line drawn in the enclosing frame's coordinates. */
export default function Line(props: LineProps): null {
  useSceneNode(
    useId(),
    { slot: 'decal', build: () => new CoreLineDecal(props) },
    [JSON.stringify(props)],
  );

  return null;
}
