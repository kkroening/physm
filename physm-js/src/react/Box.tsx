import CoreBoxDecal from './../BoxDecal';
import { useId } from 'react';
import { useSceneNode } from './sceneNodes';
import type { BoxDecalOptions } from './../BoxDecal';
import type { SceneNode } from './sceneNodes';

export type BoxProps = BoxDecalOptions;

function describeBox(props: BoxProps): SceneNode {
  return { slot: 'decal', build: () => new CoreBoxDecal(props) };
}

/** A box drawn in the enclosing frame's coordinates. */
export default function Box(props: BoxProps): null {
  useSceneNode(useId(), describeBox(props), [JSON.stringify(props)]);

  return null;
}

Box.sceneNode = describeBox;
