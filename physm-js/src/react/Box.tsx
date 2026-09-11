import CoreBoxDecal from './../BoxDecal';
import { useId } from 'react';
import { refuseChildren, useSceneNode } from './sceneNodes';
import type { ComponentMeta } from './componentMeta';
import type { BoxDecalOptions } from './../BoxDecal';
import type { SceneNode } from './sceneNodes';

export type BoxProps = BoxDecalOptions;

function describeBox(props: BoxProps): SceneNode {
  return { slot: 'decal', build: () => new CoreBoxDecal(props) };
}

/** A box drawn in the enclosing frame's coordinates. */
export default function Box(props: BoxProps): null {
  refuseChildren('Box', (props as { children?: unknown }).children);
  useSceneNode(useId(), describeBox(props), props);

  return null;
}

Box.sceneNode = describeBox;

Box.meta = {
  name: 'Box',
  category: 'Shapes',
  slot: 'decal',
  description: 'A rectangle, outlined or filled.',
  props: {
    width: { kind: 'length', label: 'Width', default: 1 },
    height: { kind: 'length', label: 'Height', default: 1 },
    position: { kind: 'point', label: 'Position', default: [0, 0] },
    angle: { kind: 'angle', label: 'Angle', default: 0 },
    centered: { kind: 'flag', label: 'Centered', default: true },
    solid: { kind: 'flag', label: 'Solid', default: true },
    lineWidth: { kind: 'length', label: 'Line width', default: 1 },
    color: { kind: 'color', label: 'Colour', default: 'black' },
  },
} satisfies ComponentMeta<BoxProps>;
