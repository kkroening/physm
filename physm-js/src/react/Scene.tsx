import * as mat3 from './../Mat3';
import CoreScene from './../Scene';
import SceneView from './SceneView';
import { refuseAnchorFrameCollisions } from './resolveAnchor';
import {
  ParentKeyContext,
  RegistryContext,
  buildChildren,
  reapDeadEntries,
  useSceneRegistry,
} from './sceneNodes';
import { useEffect, useMemo, useRef } from 'react';
import type Constraint from './../Constraint';
import type { AnchorLookup, AnchorPoint, SceneRegistry } from './sceneNodes';
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
 * Every live anchor that declared an `id`, by that id.
 *
 * Collected before any constraint is built. A constraint naming an anchor that
 * has not registered yet takes the name for a frame id, is set aside as
 * unresolved, and is retried on the next assembly -- see `resolveAnchor`.
 *
 * Two anchors sharing an id are refused rather than resolved either way. Picking
 * one would weld a constraint to whichever happened to register first, which
 * changes the answer rather than the picture -- the same reason a root
 * `<Weight>` is refused below.
 */
function collectAnchors(entries: SceneRegistry['entries']): AnchorLookup {
  const anchors = new Map<string, AnchorPoint>();
  for (const { node, live } of entries.values()) {
    if (!live || node.slot !== 'anchor' || node.id === undefined) {
      continue;
    }

    if (anchors.has(node.id)) {
      throw new Error(
        `Two <Anchor>s share the id '${node.id}'. A constraint naming it ` +
          'would be welded to whichever registered first; give each its own.',
      );
    }

    anchors.set(node.id, node.build());
  }

  return anchors;
}

/**
 * A scene, authored as JSX.
 *
 * ```jsx
 * <Scene gravity={10}>
 *   <TrackFrame id="cart">
 *     <Box width={4} height={2} />
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
  const unresolvedRef = useRef<Constraint[]>([]);
  const unresolvedAnchorsRef = useRef<string[]>([]);

  const scene = useMemo(() => {
    const { decals, weights, frames } = buildChildren(registry.entries, null);

    // A scene carries no mass of its own, so there is nowhere for a root
    // `<Weight>` to go. Silently dropping it would remove mass from a rig,
    // which changes the answer rather than the picture -- and `<Weight>` and
    // `<Box>` are siblings inside a frame, so mistaking one for the other
    // is an easy thing to do from the JSX alone.
    if (weights.length) {
      throw new Error(
        `A <Weight> must be inside a frame: a scene carries no mass of its ` +
          `own, and ${weights.length} was placed at the root of the <Scene>.`,
      );
    }

    if (!frames.length && !decals.length) {
      // Cleared on this path too. The warnings below read these refs, so an
      // early return that left them alone would re-report the *previous*
      // assembly's failures against a scene that no longer has any.
      unresolvedRef.current = [];
      unresolvedAnchorsRef.current = [];

      return null;
    }

    const unresolved: Constraint[] = [];
    const unresolvedAnchors: string[] = [];
    const built = new CoreScene({
      decals,
      frames,
      ...(gravity === undefined ? {} : { gravity }),
    });

    // After the tree, because `addConstraint` solves against the pose the
    // frames are actually in.
    const anchors = collectAnchors(registry.entries);
    refuseAnchorFrameCollisions(anchors, built.frameMap);
    for (const { node, live } of registry.entries.values()) {
      if (!live || node.slot !== 'constraint') {
        continue;
      }

      // A frame this constraint names may be mid-unmount: registrations arrive
      // and depart one effect at a time, and assembly runs against whatever is
      // registered now. `addConstraint` treats a missing frame as fatal, which
      // is right for a hand-built scene and wrong here -- it would throw out of
      // render, which React cannot recover from without an error boundary. So
      // an unresolved constraint waits for the tree to settle instead.
      //
      // The cost is that a genuine typo in `frame1` becomes a missing
      // constraint rather than a loud error. `unresolvedConstraints` below is
      // how that surfaces once nothing is moving.
      // `null` is the same "wait" answer one step earlier: an `<Anchor>` this
      // constraint names has not handed out its point yet.
      const constraint = node.build(anchors);
      if (!constraint) {
        unresolvedAnchors.push(node.describe?.() ?? 'a constraint');
        continue;
      }

      if (
        built.frameMap.has(constraint.frameId1) &&
        built.frameMap.has(constraint.frameId2)
      ) {
        built.addConstraint(constraint);
      } else {
        unresolved.push(constraint);
      }
    }

    unresolvedRef.current = unresolved;
    unresolvedAnchorsRef.current = unresolvedAnchors;

    return built;
    // `version` is the dependency that matters: the map is mutated in place,
    // so it is never itself a changed reference.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registry, version, gravity]);

  // An effect, not a `useMemo`: this is a notification, and a render function
  // may be discarded or replayed. Calling it during render warns as soon as a
  // consumer does the obvious thing and holds the scene in state.
  //
  // The callback is held in a ref rather than depended on, so that the usual
  // inline arrow does not re-fire it on every unrelated parent render. The
  // documented contract is "whenever it changes", and a fresh function identity
  // is not a change.
  const onSceneChangeRef = useRef(onSceneChange);
  onSceneChangeRef.current = onSceneChange;

  useEffect(() => {
    if (scene) {
      onSceneChangeRef.current?.(scene);
    }
  }, [scene]);

  // Once assembly has run, anything still flagged dead is gone for good.
  useEffect(() => {
    reapDeadEntries(registry.entries);
  }, [registry, scene]);

  // Reported after the commit, so a transiently dangling constraint -- one
  // whose frame is mid-unmount -- has had its chance to resolve.
  useEffect(() => {
    for (const constraint of unresolvedRef.current) {
      console.warn(
        `physm: constraint between '${constraint.frameId1}' and ` +
          `'${constraint.frameId2}' was dropped: the scene has no such frame or <Anchor id>.`,
      );
    }

    for (const description of unresolvedAnchorsRef.current) {
      console.warn(
        `physm: ${description} was dropped: an <Anchor> it names has not ` +
          'reported. Either the ref was never passed to one, or the anchor ' +
          'has unmounted while the constraint outlived it.',
      );
    }
  }, [scene]);

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
