import CoreTrackFrame from './../TrackFrame';
import { ParentKeyContext, useSceneNode } from './sceneNodes';
import type { FrameId } from './../Frame';
import type { ReactElement, ReactNode } from 'react';

export interface TrackFrameProps {
  children?: ReactNode;
  id?: FrameId;
  position?: number | readonly number[];
  angle?: number;
  initialState?: number | readonly number[];
  resistance?: number;
}

/** A prismatic joint: one coordinate, sliding along `angle`. */
export default function TrackFrame({
  children,
  id,
  position,
  angle,
  initialState,
  resistance,
}: TrackFrameProps): ReactElement {
  const key = useSceneNode(
    {
      slot: 'frame',
      build: ({ decals, weights, frames }) =>
        new CoreTrackFrame({
          decals,
          weights,
          frames,
          ...(id === undefined ? {} : { id }),
          ...(position === undefined ? {} : { position }),
          ...(angle === undefined ? {} : { angle }),
          ...(initialState === undefined ? {} : { initialState }),
          ...(resistance === undefined ? {} : { resistance }),
        }),
    },
    [
      id,
      JSON.stringify(position),
      angle,
      JSON.stringify(initialState),
      resistance,
    ],
  );

  return (
    <ParentKeyContext.Provider value={key}>
      {children}
    </ParentKeyContext.Provider>
  );
}
