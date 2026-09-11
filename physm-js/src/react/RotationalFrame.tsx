import CoreRotationalFrame from './../RotationalFrame';
import FrameIdContext from './FrameIdContext';
import { ParentKeyContext, useSceneNode } from './sceneNodes';
import { useContext, useId } from 'react';
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
