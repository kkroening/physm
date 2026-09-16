import * as mat3 from './../Mat3';
import DecalView from './DecalView';
import FrameView from './FrameView';
import { tickOf } from './../expression';
import { useMemo } from 'react';
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
 * Once per distinct complaint, because this runs on every animation frame: a
 * mistyped frame id would otherwise print the same sentence sixty times a
 * second, which is not more informative than printing it once. `said` is what
 * remembers, and how long it lives is the other half of that decision -- see
 * where it is made.
 *
 * The position is in the message because a count gives an author nothing to
 * search for in a rig with several of them, which is the rig this exists for.
 * Naming the element rather than its position wants an identity a bare maker
 * does not have -- the same absence `docs/issues/0027.md` is about, reached
 * from the other side, so the two should grow one identity rather than each
 * growing its own.
 */
function drawable(
  worldDecals: readonly WorldDecal[],
  tick: Tick,
  said: Set<string>,
): Decal[] {
  return worldDecals.flatMap((make, index) => {
    try {
      return [make(tick)];
    } catch (error) {
      const cause = error instanceof Error ? error.message : String(error);
      const complaint = `world-space decal ${index + 1} was not drawn. ${cause}`;
      if (!said.has(complaint)) {
        said.add(complaint);
        console.warn(`physm: ${complaint}`);
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

  // Per view *and* per scene. Per view, so one view's complaint is not
  // another's silence; per scene, because that is the boundary a person acts
  // on -- an edit builds a new `Scene`, so breaking a world line the same way
  // twice says so twice, where remembering for the life of the mount would
  // leave the second time silent. It still costs nothing on the path it is
  // for: a scene is stable across animation frames, and only the state moves.
  //
  // `scene` is the cache's *key* rather than an input to what it builds, which
  // is why the dependency looks unnecessary to the rule and is not.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const said = useMemo(() => new Set<string>(), [scene]);

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
      {drawable(scene.worldDecals, tick, said).map((decal, index) => (
        <DecalView
          decal={decal}
          xformMatrix={xformMatrix}
          key={`world${index}`}
        />
      ))}
    </g>
  );
}
