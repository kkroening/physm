import CoreRotationalFrame from './../RotationalFrame';
import { ParentKeyContext, useSceneNode } from './sceneNodes';
import type { FrameId } from './../Frame';
import type { ReactElement, ReactNode } from 'react';

export interface RotationalFrameProps {
  children?: ReactNode;
  id?: FrameId;
  position?: number | readonly number[];
  initialState?: number | readonly number[];
  resistance?: number;
}

/** A revolute joint: one coordinate, rotating about `position`. */
export default function RotationalFrame({
  children,
  id,
  position,
  initialState,
  resistance,
}: RotationalFrameProps): ReactElement {
  const key = useSceneNode(
    {
      slot: 'frame',
      build: ({ decals, weights, frames }) =>
        new CoreRotationalFrame({
          decals,
          weights,
          frames,
          ...(id === undefined ? {} : { id }),
          ...(position === undefined ? {} : { position }),
          ...(initialState === undefined ? {} : { initialState }),
          ...(resistance === undefined ? {} : { resistance }),
        }),
    },
    [id, JSON.stringify(position), JSON.stringify(initialState), resistance],
  );

  return (
    <ParentKeyContext.Provider value={key}>
      {children}
    </ParentKeyContext.Provider>
  );
}
