import * as mat3 from './../Mat3';
import DecalView from './DecalView';
import FrameView from './FrameView';
import { tickOf } from './../expression';
import { useRef } from 'react';
import type Decal from './../Decal';
import type { Mat3 } from './../Mat3';
import type { ReactElement } from 'react';
import type Scene from './../Scene';
import type { StateMap } from './../Frame';
import type { Tick } from './../expression';
import type { WorldDecal } from './../Decal';

/**
 * Every world-space decal this tick can make, leaving out the ones it cannot.
 *
 * Making one can fail: a frame id that names nothing, an expression whose
 * value is not finite because the rig has diverged. A throw here would take
 * the whole picture down mid-render -- including the editor a person would
 * use to fix it -- so the failure costs one decal rather than the scene, and
 * says so.
 *
 * Once per distinct message, because this runs on every animation frame: a
 * mistyped frame id would otherwise print the same sentence sixty times a
 * second, which is not more informative than printing it once.
 */
function drawable(
  worldDecals: readonly WorldDecal[],
  tick: Tick,
  said: Set<string>,
): Decal[] {
  return worldDecals.flatMap((make) => {
    try {
      return [make(tick)];
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!said.has(message)) {
        said.add(message);
        console.warn(`physm: a world-space decal was not drawn. ${message}`);
      }

      return [];
    }
  });
}

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
 *
 * It takes a state and makes the poses here, rather than taking poses: a
 * caller can be expected to hold a scene and a state, where poses would send
 * every one of them through the core first. The editor draws its gizmos over
 * this and so walks the same scene a second time -- the price of that
 * boundary, deliberately paid, rather than an oversight.
 */
export default function SceneView({
  scene,
  stateMap,
  xformMatrix = mat3.IDENTITY,
}: SceneViewProps): ReactElement {
  // One walk from state to pose, made by the scene itself; every frame below
  // reads its own out of it rather than composing one on the way down, and
  // the world-space decals read the same map rather than making a second.
  const tick = tickOf(scene, stateMap);

  // Per view rather than per module, so one view's complaint is not another's
  // silence -- and so a test gets a fresh one with each render.
  const said = useRef(new Set<string>());

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
          poses={tick.poses}
          xformMatrix={xformMatrix}
          key={`frame${index}`}
        />
      ))}

      {/*
        Last, so a line drawn between two bodies is drawn *over* them. A
        world-space decal is produced after the pose walk rather than during
        assembly, so its paint order is a decision rather than something to
        inherit (`docs/issues/0016/09-elements.md`); under the rig it would be
        hidden by the very bodies whose relationship it exists to show.
      */}
      {drawable(scene.worldDecals, tick, said.current).map((decal, index) => (
        <DecalView
          decal={decal}
          xformMatrix={xformMatrix}
          key={`world${index}`}
        />
      ))}
    </g>
  );
}
