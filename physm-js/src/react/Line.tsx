import CoreLineDecal from './../LineDecal';
import { computed } from './../expression';
import { useId } from 'react';
import { refuseChildren, useSceneNode } from './sceneNodes';
import type { Computable } from './../expression';
import type { ComponentMeta } from './componentMeta';
import type { LineDecalOptions } from './../LineDecal';
import type { SceneNode } from './sceneNodes';

type LineValues = LineDecalOptions;

/** What an element may be given: any of them may be computed. */
export type LineProps = Computable<LineValues>;

function describeLine(props: LineValues): SceneNode {
  return { slot: 'decal', build: () => new CoreLineDecal(props) };
}

/** A line drawn in the enclosing frame's coordinates. */
export default function Line(props: LineProps): null {
  refuseChildren('Line', (props as { children?: unknown }).children);
  useSceneNode(useId(), describeLine(computed<LineValues>(props)), props);

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
} satisfies ComponentMeta<LineValues>;
