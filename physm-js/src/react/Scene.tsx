import * as mat3 from './../Mat3';
import CoreScene from './../Scene';
import SceneView from './SceneView';
import {
  ParentKeyContext,
  RegistryContext,
  buildChildren,
  useSceneRegistry,
} from './sceneNodes';
import { useMemo } from 'react';
import type { Mat3 } from './../Mat3';
import type { ReactElement, ReactNode } from 'react';
import type { StateMap } from './../Frame';

export interface SceneProps {
  children?: ReactNode;
  gravity?: number;
  stateMap?: StateMap | undefined;
  xformMatrix?: Mat3;

  /** Called with the assembled scene whenever it changes. */
  onSceneChange?: ((scene: CoreScene) => void) | undefined;
}

/**
 * A scene, authored as JSX.
 *
 * ```jsx
 * <Scene gravity={10}>
 *   <TrackFrame id="cart">
 *     <BoxDecal width={4} height={2} />
 *     <Weight mass={250} />
 *   </TrackFrame>
 * </Scene>
 * ```
 *
 * The children do not render anything themselves -- they register what they
 * describe, and this assembles a `Scene` from the registrations. So the same
 * component tree that *draws* the rig is the one that *defines* it, and a
 * repeated structure is an ordinary React component: a rope is a `RopeChain`
 * built from `RopeSegment`s, not a loop that appends to an array.
 *
 * Two passes rather than one, because a `Frame` takes its children as
 * constructor arguments: the first render registers, and the registrations
 * bump a version that assembles the tree on the next. A scene is therefore
 * `null` on the very first render and present from the second, which is why
 * `onSceneChange` exists -- a solver has to be created from the assembled
 * scene, not from the element tree.
 */
export default function Scene({
  children,
  gravity,
  stateMap,
  xformMatrix = mat3.IDENTITY,
  onSceneChange,
}: SceneProps): ReactElement {
  const { registry, version } = useSceneRegistry();

  const scene = useMemo(() => {
    const { decals, frames } = buildChildren(registry.entries, null);
    if (!frames.length && !decals.length) {
      return null;
    }

    const built = new CoreScene({
      decals,
      frames,
      ...(gravity === undefined ? {} : { gravity }),
    });

    // After the tree, because `addConstraint` solves against the pose the
    // frames are actually in and throws if either frame is missing.
    for (const { node } of registry.entries.values()) {
      if (node.slot === 'constraint') {
        built.addConstraint(node.build());
      }
    }

    return built;
    // `version` is the dependency that matters: the map is mutated in place,
    // so it is never itself a changed reference.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registry, version, gravity]);

  useMemo(() => {
    if (scene && onSceneChange) {
      onSceneChange(scene);
    }
  }, [scene, onSceneChange]);

  return (
    <RegistryContext.Provider value={registry}>
      <ParentKeyContext.Provider value={null}>
        {children}
        {scene ? (
          <SceneView
            scene={scene}
            stateMap={stateMap ?? scene.getInitialStateMap()}
            xformMatrix={xformMatrix}
          />
        ) : null}
      </ParentKeyContext.Provider>
    </RegistryContext.Provider>
  );
}
