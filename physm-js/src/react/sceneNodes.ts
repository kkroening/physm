import { createContext, useContext, useEffect, useId, useState } from 'react';
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
 * `deps` is the caller's own list, exactly as `useEffect` would take it: this
 * hook cannot know which of a component's props the node was built from.
 */
export function useSceneNode(
  node: SceneNode,
  deps: readonly unknown[],
): string {
  const key = useId();
  const registry = useContext(RegistryContext);
  const parentKey = useContext(ParentKeyContext);

  if (!registry) {
    throw new Error(
      'physm components must be rendered inside a <Scene>: no registry found',
    );
  }

  useEffect(() => {
    registry.entries.set(key, { parentKey, node });
    registry.bump();

    return () => {
      registry.entries.delete(key);
      registry.bump();
    };
    // `node` is deliberately absent: it is rebuilt on every render, so
    // including it would re-register forever. The caller names the props it
    // was built from instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, registry, parentKey, ...deps]);

  return key;
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

  for (const [key, { parentKey: entryParent, node }] of entries) {
    if (entryParent !== parentKey) {
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
