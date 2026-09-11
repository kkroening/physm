import CoreLineDecal from './../LineDecal';
import { useId } from 'react';
import { useSceneNode } from './sceneNodes';
import type { LineDecalOptions } from './../LineDecal';
import type { SceneNode } from './sceneNodes';

export type LineProps = LineDecalOptions;

function describeLine(props: LineProps): SceneNode {
  return { slot: 'decal', build: () => new CoreLineDecal(props) };
}

/** A line drawn in the enclosing frame's coordinates. */
export default function Line(props: LineProps): null {
  useSceneNode(useId(), describeLine(props), props);

  return null;
}

Line.sceneNode = describeLine;
