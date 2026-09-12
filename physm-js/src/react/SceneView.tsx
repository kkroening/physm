import * as mat3 from './../Mat3';
import DecalView from './DecalView';
import FrameView from './FrameView';
import type { Mat3 } from './../Mat3';
import type { ReactElement } from 'react';
import type Scene from './../Scene';
import type { StateMap } from './../Frame';

export interface SceneViewProps {
  scene: Scene;
  stateMap: StateMap;
  xformMatrix?: Mat3;
}

/**
 * A whole scene, drawn at the pose `stateMap` puts it in.
 *
 * The entry point to `physm-js`'s React binding, and the only part of drawing
 * a scene that a caller needs to name. Everything below it -- the recursion
 * down the frame tree, the per-kind decal mapping -- follows from the scene
 * itself.
 *
 * `xformMatrix` is the view transform: world coordinates to the SVG's. It
 * defaults to the identity, which draws the scene in its own units.
 */
export default function SceneView({
  scene,
  stateMap,
  xformMatrix = mat3.IDENTITY,
}: SceneViewProps): ReactElement {
  // One walk from state to pose, made by the scene itself; every frame below
  // reads its own out of it rather than composing one on the way down.
  const poses = scene.getPosMatrixMap(stateMap);

  return (
    <g className="scene">
      {scene.decals.map((decal, index) => (
        <DecalView
          decal={decal}
          xformMatrix={xformMatrix}
          key={`decal${index}`}
        />
      ))}
      {scene.frames.map((frame, index) => (
        <FrameView
          frame={frame}
          poses={poses}
          xformMatrix={xformMatrix}
          key={`frame${index}`}
        />
      ))}
    </g>
  );
}
