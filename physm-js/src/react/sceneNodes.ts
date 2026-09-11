import {
  Children,
  createContext,
  useContext,
  useEffect,
  useState,
} from 'react';
import type Constraint from './../Constraint';
import type Decal from './../Decal';
import type Frame from './../Frame';
import type { FrameId } from './../Frame';
import type Weight from './../Weight';
import type { PositionLike } from './../Scene';
import type { ReactNode } from 'react';

/**
 * What an `<Anchor>` reports: a frame, and optionally a point on it.
 *
 * The unit a constraint is wired from when the frames are generated rather than
 * written -- a `RopeChain` names none of the frames it produces, so nothing
 * outside it can say `frame1="chainL4"`. An anchor is a mark *the chain itself*
 * makes, handed out by ref.
 *
 * `position` is optional, and the absence is load-bearing rather than a
 * convenience. A `CoincidenceConstraint` solves for the attachment it is *not*
 * given -- that is what lets a rig be authored at any geometry, and what closes
 * the demo's rope loop across a gap the author never measured. An anchor that
 * always stated a point could never express it, and the constraint would check
 * the geometry and throw instead of solving it.
 *
 * So `<Anchor id="tip" position={[1.4, 0]} />` names a point, and
 * `<Anchor id="tip" />` names only the frame and leaves the point to be
 * solved.
 */
export interface AnchorPoint {
  readonly frameId: FrameId;
  readonly position?: PositionLike;
}

/** What an `<Anchor>` hands back through its ref. */
export type AnchorHandle = { readonly current: AnchorPoint | null };

/** Anchors that declared an `id`, by that id, as assembly collects them. */
export type AnchorLookup = ReadonlyMap<string, AnchorPoint>;

/**
 * What a registered component contributes to a scene.
 *
 * A frame is the only one with children, so it is the only one whose builder
 * is handed any: the rest are leaves that turn their props into an object.
 */
export type SceneNode =
  | {
      readonly slot: 'frame';

      /**
       * The frame's id: its `id` prop, or the context key when it has none.
       *
       * Carried on the node so that whoever walks the tree knows what id the
       * frame's children sit in without recomputing the fallback -- which is a
       * rule, and a rule stated twice is a rule that can drift.
       */
      readonly id: FrameId;
      readonly build: (children: FrameChildren) => Frame;
    }
  | {
      readonly slot: 'anchor';

      /**
       * The name a constraint end can use for this anchor, if it has one.
       *
       * The declarative alternative to a ref. A ref is a mutable cell a hook
       * creates, so a component that makes one cannot be evaluated outside a
       * render -- and a document cannot hold one at all. A name is data.
       */
      readonly id?: string;
      readonly build: () => AnchorPoint;
    }
  | { readonly slot: 'decal'; readonly build: () => Decal }
  | { readonly slot: 'weight'; readonly build: () => Weight }
  | {
      readonly slot: 'constraint';
      /**
       * `null` when an anchor it names has not reported yet.
       *
       * Registrations arrive one effect at a time, so a constraint can be
       * assembled before the `<Anchor>` it points at has handed out its point.
       * Returning `null` says "not yet", which `Scene` treats the same way it
       * treats a frame that is mid-unmount: wait, and report if it never
       * resolves.
       */
      readonly build: (anchors: AnchorLookup) => Constraint | null;

      /**
       * What to call this in a warning when `build` returns `null`.
       *
       * There is no constraint object to name at that point, and a count alone
       * gives an author nothing to search for in a rig with several anchors --
       * which is the rig this mechanism exists for.
       */
      readonly describe?: () => string;
    };

/** A frame's node, narrowed -- what a frame component's `sceneNode` returns. */
export type FrameNode = Extract<SceneNode, { slot: 'frame' }>;

/** A constraint's node, narrowed. */
export type ConstraintNode = Extract<SceneNode, { slot: 'constraint' }>;

/** An anchor's node, narrowed. */
export type AnchorNode = Extract<SceneNode, { slot: 'anchor' }>;

/** What a component's `sceneNode` is told about where it sits. */
export interface SceneNodeContext {
  /**
   * Stable for this instance, and the id an unnamed frame falls back to.
   *
   * The mounted binding passes its `useId`; `buildScene` passes the element's
   * path through the tree. Either way it is the same value every time the same
   * instance is built, which is what keeps a state map keyed to it valid.
   */
  readonly key: string;

  /** The enclosing frame's id, or `null` at the root. */
  readonly frameId: FrameId | null;
}

/**
 * How a binding component turns its props into a scene node, as a plain
 * function.
 *
 * Each binding component carries one as its static `sceneNode`. The mounted
 * component registers what it returns; `buildScene` calls it directly while
 * walking an element tree. One description, two callers -- so the two routes
 * build the same scene from the same props because there is only one place
 * that says how.
 */
export type SceneNodeSource<P> = (
  props: P,
  context: SceneNodeContext,
) => SceneNode;

/** What a frame's builder receives, grouped by what each child registered as. */
export interface FrameChildren {
  readonly decals: Decal[];
  readonly weights: Weight[];
  readonly frames: Frame[];
}

/** A node plus where it sits, as the registry stores it. */
interface Registration {
  readonly parentKey: string | null;
  readonly node: SceneNode;

  /**
   * Whether the component is still mounted.
   *
   * An unmounted node is flagged rather than deleted, because `Map.set` after
   * `delete` re-inserts the key at the *end* of iteration order -- and a
   * dependency change runs cleanup then setup, so deleting would move a node
   * behind its siblings every time one of its props changed. Sibling order is
   * decal paint order and frame coordinate order, so that is not cosmetic.
   *
   * Genuinely dead entries are reaped after assembly, once nothing is going to
   * re-register them.
   */
  readonly live: boolean;
}

/**
 * The registry a `<Scene>` provides and every other component writes into.
 *
 * `version` is what makes assembly happen: a registration bumps it, `<Scene>`
 * re-renders, and the tree is rebuilt from whatever is registered by then.
 */
export interface SceneRegistry {
  readonly entries: Map<string, Registration>;
  readonly bump: () => void;
}

export const RegistryContext = createContext<SceneRegistry | null>(null);

/**
 * The key of the frame a component is nested inside, or `null` at the root.
 *
 * Parentage is keyed by *component instance*, not by frame id: a decal has no
 * id, and a frame's id is optional. Every component has a `useId`, so this
 * works for all of them and needs nothing from the author.
 */
export const ParentKeyContext = createContext<string | null>(null);

/**
 * Register one node with the enclosing `<Scene>`, for as long as it is mounted.
 *
 * Registration happens in an effect rather than during render, so a component
 * that renders and is then discarded never reaches the scene. The consequence
 * is that effects run children-first, so a child can register before its
 * parent exists -- which is why records are flat and parentage is a key rather
 * than a reference. Assembly puts the tree back together afterwards, and does
 * not care what order the pieces arrived in.
 *
 * `key` is the caller's own `useId`, passed in rather than minted here so that
 * a frame can use the same value for three things that must agree: its
 * registration, the parent key it provides to its children, and the id it
 * falls back to when the author gives none.
 *
 * `key` is the caller's own `useId`, passed in rather than minted here so that
 * a frame can use one value for the three things that must agree: its
 * registration, the parent key it hands its children, and the id it falls back
 * to when the author gives none.
 *
 * `inputs` is everything the node was built from -- the component's props, and
 * the enclosing frame where its describer reads that. It is compared as a JSON
 * signature rather than listed prop by prop, so a describer that starts reading
 * a new prop cannot leave a hand-kept list behind it. `children` and `ref` are
 * structure rather than inputs, and are left out.
 *
 * **Sibling order is first-registration order**, which is JSX order for a tree
 * whose shape does not change: React runs sibling effects left to right. A
 * node that mounts *later* than its siblings -- one behind a condition that
 * flips -- appends rather than taking its JSX position, because nothing here
 * knows where that position is. Composed components are why: a `RopeChain` in
 * the middle of a frame's children contributes several frames, and no parent
 * can index through it without rendering it. That is the case a custom
 * reconciler resolves, and until then it is a documented limitation rather
 * than a fixed one -- see `docs/issues/0005.md`.
 */
export function useSceneNode(
  key: string,
  node: SceneNode,
  inputs: object,
): void {
  const registry = useContext(RegistryContext);
  const parentKey = useContext(ParentKeyContext);

  if (!registry) {
    throw new Error(
      'physm components must be rendered inside a <Scene>: no registry found',
    );
  }

  const signature = JSON.stringify(inputs, (name, value: unknown) =>
    name === 'children' || name === 'ref' ? undefined : value,
  );

  useEffect(() => {
    registry.entries.set(key, { parentKey, node, live: true });
    registry.bump();

    return () => {
      // Flagged, not deleted -- see `Registration.live`. Keeping the key's slot
      // is what makes a prop change leave sibling order alone.
      const existing = registry.entries.get(key);
      if (existing) {
        registry.entries.set(key, { ...existing, live: false });
      }
      registry.bump();
    };
    // `node` is deliberately absent: it is rebuilt on every render, so
    // including it would re-register forever. `signature` stands in for it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, registry, parentKey, signature]);
}

/**
 * A registry, and a value that changes whenever its contents do.
 *
 * The map is mutated in place rather than replaced because registrations
 * arrive one effect at a time; `version` is what React watches.
 */
export function useSceneRegistry(): {
  registry: SceneRegistry;
  version: number;
} {
  const [version, setVersion] = useState(0);
  const [registry] = useState<SceneRegistry>(() => ({
    entries: new Map<string, Registration>(),
    bump: () => setVersion((previous) => previous + 1),
  }));

  return { registry, version };
}

/**
 * Forget the components that have unmounted for good.
 *
 * Called after assembly rather than during cleanup, so that a node in the
 * middle of a dependency change -- cleanup has run, setup has not -- keeps its
 * position. Removing dead entries cannot change what the next assembly
 * produces, so this deliberately does not bump.
 */
export function reapDeadEntries(entries: Map<string, Registration>): void {
  for (const [key, { live }] of entries) {
    if (!live) {
      entries.delete(key);
    }
  }
}

/**
 * Build the frame tree under one parent, depth-first.
 *
 * Frames are built innermost-first because a `Frame`'s constructor takes its
 * children as arrays -- so a parent cannot exist until its subtree does. That
 * is the inverse of the order the registrations arrived in, which is the whole
 * reason assembly is a separate pass.
 */
export function buildChildren(
  entries: Map<string, Registration>,
  parentKey: string | null,
): FrameChildren {
  const children: FrameChildren = { decals: [], weights: [], frames: [] };

  for (const [key, { parentKey: entryParent, node, live }] of entries) {
    if (!live || entryParent !== parentKey) {
      continue;
    }

    switch (node.slot) {
      case 'decal':
        children.decals.push(node.build());
        break;
      case 'weight':
        children.weights.push(node.build());
        break;
      case 'frame':
        children.frames.push(node.build(buildChildren(entries, key)));
        break;
      case 'anchor':
        // Part of no frame. An id-named anchor's point is collected by
        // `<Scene>` before constraints are built; a ref-named one travels by
        // ref. Either way it contributes nothing here -- see `Anchor`.
        break;
      case 'constraint':
        // Constraints belong to the scene, not to a frame: they name two
        // frames that may be in different subtrees, and `addConstraint`
        // requires both to exist already. `<Scene>` collects them separately,
        // after the whole tree is built.
        break;
    }
  }

  return children;
}

/**
 * Refuse children under a building block that is not a frame.
 *
 * Only a frame holds children. Anything else would drop them unseen, and a
 * `<Weight>` dropped that way takes its mass out of the rig -- which changes
 * the answer rather than the picture. Hand-written JSX cannot get here, since
 * the props types have no `children`, but an element rendered from a document
 * can. Both builders call this, so they refuse the same thing.
 */
export function refuseChildren(name: string, children: unknown): void {
  if (Children.toArray(children as ReactNode).length) {
    throw new Error(
      `A <${name}> is holding children, and only a frame can: they would be ` +
        'dropped, which changes the answer rather than the picture. Move them ' +
        'into the frame that holds it.',
    );
  }
}
