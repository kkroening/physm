import * as mat3 from './../Mat3';
import DecalView from './DecalView';
import { poseIn } from './../Scene';
import type Frame from './../Frame';
import type { Mat3 } from './../Mat3';
import type { PoseMap } from './../Scene';
import type { ReactElement } from 'react';

export interface FrameViewProps {
  frame: Frame;
  poses: PoseMap;
  xformMatrix: Mat3;
}

/**
 * A frame and everything under it, drawn at the pose `poses` puts it in.
 *
 * The composition `M_i = ∏ C_k exp(q^k ζ̂_k)` is the scene's own walk from a
 * state map to a pose, made once by `getPosMatrixMap`; this reads a frame's
 * pose out of it and multiplies in the view transform. Recursive for the
 * picture's structure -- a frame's decals and children sit in one group -- and
 * not for the arithmetic, which no longer accumulates down the tree.
 *
 * A frame absent from the state map the poses were made from is drawn at its
 * own `initialState`, which is what lets a partially-built scene render; that
 * rule lives in `getPosMatrixMap` rather than here.
 */
export default function FrameView({
  frame,
  poses,
  xformMatrix,
}: FrameViewProps): ReactElement {
  const childXform = mat3.multiply(xformMatrix, poseIn(poses, frame.id));

  return (
    <g className="frame">
      {frame.decals.map((decal, index) => (
        <DecalView
          decal={decal}
          xformMatrix={childXform}
          key={`decal${index}`}
        />
      ))}
      {frame.frames.map((child, index) => (
        <FrameView
          frame={child}
          poses={poses}
          xformMatrix={xformMatrix}
          key={`frame${index}`}
        />
      ))}
    </g>
  );
}
