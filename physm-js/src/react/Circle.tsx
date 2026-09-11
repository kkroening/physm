import CoreCircleDecal from './../CircleDecal';
import { useId } from 'react';
import { useSceneNode } from './sceneNodes';
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
