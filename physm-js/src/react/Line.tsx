import CoreLineDecal from './../LineDecal';
import { useId } from 'react';
import { useSceneNode } from './sceneNodes';
import type { ComponentMeta } from './componentMeta';
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

Line.meta = {
  name: 'Line',
  category: 'Shapes',
  slot: 'decal',
  description: 'A straight segment between two points.',
  props: {
    endPos: {
      kind: 'point',
      label: 'End',
      required: true,
      initial: [1, 0],
    },
    startPos: { kind: 'point', label: 'Start', default: [0, 0] },
    lineWidth: { kind: 'length', label: 'Line width', default: 1 },
    color: { kind: 'color', label: 'Colour', default: 'black' },
  },
} satisfies ComponentMeta<LineProps>;
