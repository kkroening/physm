import CoreRotationalFrame from './../RotationalFrame';
import FrameIdContext from './FrameIdContext';
import { ParentKeyContext, useSceneNode } from './sceneNodes';
import { useId } from 'react';
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
  const key = useId();

  useSceneNode(
    key,
    {
      slot: 'frame',
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
          id: id ?? key,
          ...(position === undefined ? {} : { position }),
          ...(initialState === undefined ? {} : { initialState }),
          ...(resistance === undefined ? {} : { resistance }),
        }),
    },
    [id, JSON.stringify(position), JSON.stringify(initialState), resistance],
  );

  return (
    <ParentKeyContext.Provider value={key}>
      <FrameIdContext.Provider value={id ?? key}>
        {children}
      </FrameIdContext.Provider>
    </ParentKeyContext.Provider>
  );
}
