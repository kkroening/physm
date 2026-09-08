import { createContext, useContext, useEffect, useState } from 'react';
import type Constraint from './../Constraint';
import type Decal from './../Decal';
import type Frame from './../Frame';
import type Weight from './../Weight';

/**
 * What a registered component contributes to a scene.
 *
 * A frame is the only one with children, so it is the only one whose builder
 * is handed any: the rest are leaves that turn their props into an object.
 */
export type SceneNode =
  | {
      readonly slot: 'frame';
      readonly build: (children: FrameChildren) => Frame;
    }
  | { readonly slot: 'decal'; readonly build: () => Decal }
  | { readonly slot: 'weight'; readonly build: () => Weight }
  | { readonly slot: 'constraint'; readonly build: () => Constraint };

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
 * `deps` is the caller's own list, exactly as `useEffect` would take it: this
 * hook cannot know which of a component's props the node was built from.
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
  deps: readonly unknown[],
): void {
  const registry = useContext(RegistryContext);
  const parentKey = useContext(ParentKeyContext);

  if (!registry) {
    throw new Error(
      'physm components must be rendered inside a <Scene>: no registry found',
    );
  }

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
    // including it would re-register forever. The caller names the props it
    // was built from instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, registry, parentKey, ...deps]);
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
