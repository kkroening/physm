import CoreRotationalFrame from './../RotationalFrame';
import FrameIdContext from './FrameIdContext';
import { ParentKeyContext, useSceneNode } from './sceneNodes';
import { useContext, useId } from 'react';
import type { ComponentMeta } from './componentMeta';
import type { FrameId } from './../Frame';
import type { FrameNode, SceneNodeContext } from './sceneNodes';
import type { ReactElement, ReactNode } from 'react';

export interface RotationalFrameProps {
  children?: ReactNode;
  id?: FrameId;
  position?: number | readonly number[];
  initialState?: number | readonly number[];
  resistance?: number;
}

function describeRotationalFrame(
  { id, position, initialState, resistance }: RotationalFrameProps,
  { key }: SceneNodeContext,
): FrameNode {
  const frameId = id ?? key;

  return {
    slot: 'frame',
    id: frameId,
    build: ({ decals, weights, frames }) =>
      new CoreRotationalFrame({
        decals,
        weights,
        frames,
        // An omitted id defaults to this component's own key, not to a
        // fresh random one: the scene is rebuilt on every registration
        // change, and a regenerated id would silently stop matching a
        // caller's state map. `getPosMatrixMap` forgives an absent frame
        // by reading its `initialState`, so the rig would snap back to
        // `t = 0` with no error at all.
        id: frameId,
        ...(position === undefined ? {} : { position }),
        ...(initialState === undefined ? {} : { initialState }),
        ...(resistance === undefined ? {} : { resistance }),
      }),
  };
}

/** A revolute joint: one coordinate, rotating about `position`. */
export default function RotationalFrame(
  props: RotationalFrameProps,
): ReactElement {
  const { children } = props;
  const key = useId();
  const frameId = useContext(FrameIdContext);
  const node = describeRotationalFrame(props, { key, frameId });

  useSceneNode(key, node, { ...props, frameId });

  return (
    <ParentKeyContext.Provider value={key}>
      <FrameIdContext.Provider value={node.id}>
        {children}
      </FrameIdContext.Provider>
    </ParentKeyContext.Provider>
  );
}

RotationalFrame.sceneNode = describeRotationalFrame;

RotationalFrame.meta = {
  name: 'RotationalFrame',
  category: 'Frames',
  slot: 'frame',
  description: 'A revolute joint: one coordinate, rotating about its position.',
  props: {
    id: { kind: 'name', label: 'Id', summary: true },
    position: { kind: 'point', label: 'Position', default: [0, 0] },
    initialState: {
      kind: 'state',
      coordinate: 'angle',
      label: 'Initial state',
      default: [0, 0],
    },
    resistance: { kind: 'number', label: 'Resistance', default: 0 },
  },
} satisfies ComponentMeta<RotationalFrameProps>;
