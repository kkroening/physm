import * as mat3 from './../Mat3';
import SceneView from './SceneView';
import assembleScene from './assembleScene';
import { addAnchor } from './resolveAnchor';
import {
  ParentKeyContext,
  RegistryContext,
  buildChildren,
  reapDeadEntries,
  useSceneRegistry,
} from './sceneNodes';
import { useEffect, useMemo, useRef } from 'react';
import type Constraint from './../Constraint';
import type CoreScene from './../Scene';
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
 * Two anchors sharing an id are refused, by `addAnchor` -- the same reason a
 * root `<Weight>` is refused below.
 */
function collectAnchors(entries: SceneRegistry['entries']): AnchorLookup {
  const anchors = new Map<string, AnchorPoint>();
  for (const { node, live } of entries.values()) {
    if (!live || node.slot !== 'anchor' || node.id === undefined) {
      continue;
    }

    addAnchor(anchors, node.id, node.build());
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
    const root = buildChildren(registry.entries, null);

    if (!root.frames.length && !root.decals.length && !root.weights.length) {
      // Cleared on this path too. The warnings below read these refs, so an
      // early return that left them alone would re-report the *previous*
      // assembly's failures against a scene that no longer has any.
      unresolvedRef.current = [];
      unresolvedAnchorsRef.current = [];

      return null;
    }

    const unresolved: Constraint[] = [];
    const unresolvedAnchors: string[] = [];
    const constraints = [...registry.entries.values()].flatMap(
      ({ node, live }) => (live && node.slot === 'constraint' ? [node] : []),
    );
    const built = assembleScene(
      root,
      collectAnchors(registry.entries),
      constraints,
      {
        gravity,
        // A frame or anchor a constraint names may be mid-mount or
        // mid-unmount: registrations arrive and depart one effect at a time,
        // and assembly runs against whatever is registered now. Throwing here
        // would throw out of render, which React cannot recover from without
        // an error boundary -- so an unbuildable constraint waits for the tree
        // to settle instead.
        //
        // The cost is that a genuine typo in `frame1` becomes a missing
        // constraint rather than a loud error. The warnings below are how that
        // surfaces once nothing is moving.
        unbuildable: {
          onEmptyRef: (node) => {
            unresolvedAnchors.push(node.describe?.() ?? 'a constraint');
          },
          onMissingFrame: (constraint) => {
            unresolved.push(constraint);
          },
        },
      },
    );

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
