import CoreTrackFrame from './../TrackFrame';
import FrameIdContext from './FrameIdContext';
import { ParentKeyContext, useSceneNode } from './sceneNodes';
import { useContext, useId } from 'react';
import type { ComponentMeta } from './componentMeta';
import type { FrameId } from './../Frame';
import type { FrameNode, SceneNodeContext } from './sceneNodes';
import type { ReactElement, ReactNode } from 'react';

export interface TrackFrameProps {
  children?: ReactNode;
  id?: FrameId;
  position?: number | readonly number[];
  angle?: number;
  initialState?: number | readonly number[];
  resistance?: number;
}

function describeTrackFrame(
  { id, position, angle, initialState, resistance }: TrackFrameProps,
  { key }: SceneNodeContext,
): FrameNode {
  const frameId = id ?? key;

  return {
    slot: 'frame',
    id: frameId,
    build: ({ decals, weights, frames }) =>
      new CoreTrackFrame({
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
        ...(angle === undefined ? {} : { angle }),
        ...(initialState === undefined ? {} : { initialState }),
        ...(resistance === undefined ? {} : { resistance }),
      }),
  };
}

/** A prismatic joint: one coordinate, sliding along `angle`. */
export default function TrackFrame(props: TrackFrameProps): ReactElement {
  const { children } = props;
  const key = useId();
  const frameId = useContext(FrameIdContext);
  const node = describeTrackFrame(props, { key, frameId });

  useSceneNode(key, node, { ...props, frameId });

  return (
    <ParentKeyContext.Provider value={key}>
      <FrameIdContext.Provider value={node.id}>
        {children}
      </FrameIdContext.Provider>
    </ParentKeyContext.Provider>
  );
}

TrackFrame.sceneNode = describeTrackFrame;

TrackFrame.meta = {
  name: 'TrackFrame',
  category: 'Frames',
  slot: 'frame',
  description: 'A prismatic joint: one coordinate, sliding along an angle.',
  props: {
    id: { kind: 'name', label: 'Id', summary: true },
    position: { kind: 'point', label: 'Position', default: [0, 0] },
    angle: { kind: 'angle', label: 'Angle', default: 0 },
    initialState: {
      kind: 'state',
      coordinate: 'number',
      label: 'Initial state',
      default: [0, 0],
    },
    resistance: { kind: 'number', label: 'Resistance', default: 0 },
  },
} satisfies ComponentMeta<TrackFrameProps>;
