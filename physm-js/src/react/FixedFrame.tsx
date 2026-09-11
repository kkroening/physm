import CoreFixedFrame from './../FixedFrame';
import FrameIdContext from './FrameIdContext';
import { ParentKeyContext, useSceneNode } from './sceneNodes';
import { useContext, useId } from 'react';
import type { ComponentMeta } from './componentMeta';
import type { FrameId } from './../Frame';
import type { FrameNode, SceneNodeContext } from './sceneNodes';
import type { ReactElement, ReactNode } from 'react';

export interface FixedFrameProps {
  children?: ReactNode;
  id?: FrameId;
  position?: number | readonly number[];
  angle?: number;
}

function describeFixedFrame(
  { id, position, angle }: FixedFrameProps,
  { key }: SceneNodeContext,
): FrameNode {
  const frameId = id ?? key;

  return {
    slot: 'frame',
    id: frameId,
    build: ({ decals, weights, frames }) =>
      new CoreFixedFrame({
        decals,
        weights,
        frames,
        // An omitted id defaults to this component's own key, as a joint's
        // does, so a rebuilt scene still matches a caller's state map.
        id: frameId,
        ...(position === undefined ? {} : { position }),
        ...(angle === undefined ? {} : { angle }),
      }),
  };
}

/** A frame fixed to its parent: no coordinate of its own, set at `position` and turned by `angle`. */
export default function FixedFrame(props: FixedFrameProps): ReactElement {
  const { children } = props;
  const key = useId();
  const frameId = useContext(FrameIdContext);
  const node = describeFixedFrame(props, { key, frameId });

  useSceneNode(key, node, { ...props, frameId });

  return (
    <ParentKeyContext.Provider value={key}>
      <FrameIdContext.Provider value={node.id}>
        {children}
      </FrameIdContext.Provider>
    </ParentKeyContext.Provider>
  );
}

FixedFrame.sceneNode = describeFixedFrame;

FixedFrame.meta = {
  name: 'FixedFrame',
  category: 'Frames',
  slot: 'frame',
  description:
    'A frame fixed to its parent: no coordinate of its own, set at a position and turned by an angle.',
  props: {
    id: { kind: 'name', label: 'Id', summary: true },
    position: { kind: 'point', label: 'Position', default: [0, 0] },
    angle: { kind: 'angle', label: 'Angle', default: 0 },
  },
} satisfies ComponentMeta<FixedFrameProps>;
