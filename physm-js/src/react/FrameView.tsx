import * as mat3 from './../Mat3';
import DecalView from './DecalView';
import type Frame from './../Frame';
import type { Mat3 } from './../Mat3';
import type { ReactElement } from 'react';
import type { StateMap } from './../Frame';

export interface FrameViewProps {
  frame: Frame;
  stateMap: StateMap;
  xformMatrix: Mat3;
}

/**
 * A frame and everything under it, drawn at the pose `stateMap` puts it in.
 *
 * Recursive: a frame's children are drawn under its own local transform, so
 * the composition `M_i = ∏ C_k exp(q^k ζ̂_k)` accumulates down the tree rather
 * than being assembled per frame.
 *
 * A frame absent from `stateMap` is drawn at its own `initialState`, which is
 * what lets a partially-built scene render at all.
 */
export default function FrameView({
  frame,
  stateMap,
  xformMatrix,
}: FrameViewProps): ReactElement {
  const [q] = stateMap.get(frame.id) ?? frame.initialState;
  const childXform = mat3.multiply(xformMatrix, frame.getLocalPosMatrix(q));

  return (
    <g className="frame">
      {frame.decals.map((decal, index) => (
        <DecalView decal={decal} xformMatrix={childXform} key={`decal${index}`} />
      ))}
      {frame.frames.map((child, index) => (
        <FrameView
          frame={child}
          stateMap={stateMap}
          xformMatrix={childXform}
          key={`frame${index}`}
        />
      ))}
    </g>
  );
}
