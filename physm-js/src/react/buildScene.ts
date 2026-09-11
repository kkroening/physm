import Scene from './Scene';
import assembleScene from './assembleScene';
import { addAnchor } from './resolveAnchor';
import { Fragment, isValidElement } from 'react';
import type {
  AnchorPoint,
  ConstraintNode,
  FrameChildren,
  SceneNode,
  SceneNodeSource,
} from './sceneNodes';
import type CoreScene from './../Scene';
import type { ComponentMeta } from './componentMeta';
import type { FrameId } from './../Frame';
import type { ReactNode } from 'react';

/**
 * How deep composites may nest before the walk gives up.
 *
 * Not a limit any real rig approaches -- the demo nests about a dozen deep --
 * but a component with a bug in its recursion would otherwise overflow the
 * stack, or hang the caller, rather than saying where it went wrong.
 */
const MAX_DEPTH = 1000;

/** Where the walk is, and where what it finds goes. */
interface Walk {
  /** The enclosing frame's id, or `null` at the root. */
  readonly frameId: FrameId | null;

  /** Indices and `$`-marked keys from the root, dot-joined: an unnamed frame's id. */
  readonly path: string;

  /** Composites entered so far, for `MAX_DEPTH`. */
  readonly depth: number;

  /** The frame currently being filled, or the scene's own root lists. */
  readonly into: FrameChildren;

  readonly anchors: Map<string, AnchorPoint>;
  readonly constraints: ConstraintNode[];
}

/** An element type's `sceneNode`, if it is a binding component. */
function sceneNodeOf(type: unknown): SceneNodeSource<unknown> | null {
  const source = (type as { sceneNode?: unknown } | null)?.sceneNode;

  return typeof source === 'function'
    ? (source as SceneNodeSource<unknown>)
    : null;
}

/** An element type, as an error message should name it. */
function nameOf(type: unknown): string {
  if (typeof type === 'string') {
    return `<${type}>`;
  }

  return typeof type === 'function' && type.name
    ? `<${type.name}>`
    : 'an element of an unsupported kind';
}

/**
 * A child's path segment: its index, or `$` and its key.
 *
 * Kept apart the way React keeps them. Otherwise `key="0"` and the first
 * unkeyed sibling would share a segment, and so a frame id -- and the core
 * `Scene` keeps only one of two frames with one id. `.` is the separator and
 * `%` the escape, so a key has both escaped.
 */
function segmentOf(key: string | null, index: number): string {
  return key === null
    ? String(index)
    : `$${key.replace(/%/g, '%25').replace(/\./g, '%2E')}`;
}

/** A path segment appended to its parent's. */
function childPath(parent: string, segment: string): string {
  return parent === '' ? segment : `${parent}.${segment}`;
}

/** Put one binding component's node where it belongs. */
function place(node: SceneNode, children: ReactNode, walk: Walk): void {
  switch (node.slot) {
    case 'frame': {
      // Children first, because a `Frame` takes them as constructor arguments.
      const into: FrameChildren = { decals: [], weights: [], frames: [] };
      walkChildren(children, { ...walk, frameId: node.id, into });
      walk.into.frames.push(node.build(into));
      return;
    }
    case 'decal':
      walk.into.decals.push(node.build());
      return;
    case 'weight':
      walk.into.weights.push(node.build());
      return;
    case 'anchor':
      if (node.id !== undefined) {
        addAnchor(walk.anchors, node.id, node.build());
      }
      return;
    case 'constraint':
      // Built last, once every frame exists and every anchor is known.
      walk.constraints.push(node);
      return;
  }
}

/**
 * Refuse a building block missing a prop it cannot be built without.
 *
 * Written source never gets here -- TypeScript refuses it -- but a document
 * can: a constraint just added from an editor's library has no ends picked
 * yet. Named by the label a person sees, rather than left to whatever the
 * build trips over first.
 */
function refuseMissingProps(type: unknown, props: object): void {
  const { meta } = type as { meta?: ComponentMeta<Record<string, unknown>> };
  const missing = Object.entries(meta?.props ?? {})
    .filter(
      ([name, spec]) =>
        spec.required && (props as Record<string, unknown>)[name] === undefined,
    )
    .map(([, spec]) => spec.label);

  if (meta && missing.length) {
    throw new Error(
      `A <${meta.name}> needs ${missing.join(' and ')} set before it can ` +
        'be built.',
    );
  }
}

/** Walk one node of the element tree -- `index` is its position among siblings. */
function walkNode(node: ReactNode, index: number, walk: Walk): void {
  if (node === null || node === undefined || typeof node === 'boolean') {
    return;
  }

  // A nested array is a `.map` among siblings; its entries get their own
  // indices beneath this one, so two unnamed frames never share a path.
  if (Array.isArray(node)) {
    walkChildren(node, { ...walk, path: childPath(walk.path, String(index)) });
    return;
  }

  if (!isValidElement<{ children?: ReactNode }>(node)) {
    throw new Error(
      `A scene is built from elements, and found ${JSON.stringify(node)} at ` +
        `'${walk.path}'. Text has nowhere to go in a scene.`,
    );
  }

  // An explicit `key` beats the index, as it does in React: it is the identity
  // that survives siblings being inserted or removed around it.
  const path = childPath(walk.path, segmentOf(node.key, index));
  const { type, props } = node;

  if (type === Fragment) {
    walkChildren(props.children, { ...walk, path });
    return;
  }

  // Handed the whole `<Scene>`, the walk would call it as a composite and fail
  // inside React, with an error naming neither.
  if (type === Scene) {
    throw new Error(
      `buildScene takes what goes inside a <Scene>, and found the <Scene> ` +
        `itself at '${path}'. Pass its children, and its gravity as an ` +
        'option: buildScene(<Rig />, { gravity }).',
    );
  }

  const sceneNode = sceneNodeOf(type);
  if (sceneNode) {
    // A ref is filled in by an effect, and the walk runs none: an empty one
    // names nothing, and one a mount has filled names that mount's frames.
    // Refused here, where the walk can see it, rather than at whatever
    // constraint happens to name it.
    if ((props as { ref?: unknown }).ref != null) {
      throw new Error(
        `${nameOf(type)} at '${path}' has a ref, which a scene built without ` +
          'rendering never fills: a ref is set by an effect. Give it an id, ' +
          'and name that instead.',
      );
    }

    refuseMissingProps(type, props);
    place(
      sceneNode(props, { key: `@${path}`, frameId: walk.frameId }),
      props.children,
      { ...walk, path },
    );
    return;
  }

  if (typeof type === 'function') {
    if (walk.depth >= MAX_DEPTH) {
      throw new Error(
        `Components nest more than ${MAX_DEPTH} deep at ${nameOf(type)}, ` +
          `'${path}'. A recursive component that never reaches its base case ` +
          'is the usual cause.',
      );
    }

    // A composite: call it. This is why a composite must be a pure function
    // of its props -- outside a render there is no dispatcher, so a hook here
    // throws, and anything that reads the clock or a module-level counter
    // builds a scene nobody else will reproduce.
    const rendered = (type as (props: unknown) => ReactNode)(props);
    walkNode(rendered, 0, { ...walk, path, depth: walk.depth + 1 });
    return;
  }

  throw new Error(
    `${nameOf(type)} at '${path}' is not a physm component. A scene is built ` +
      'from frames, decals, weights, anchors and constraints, and from ' +
      'components that render them.',
  );
}

/** Walk a `children` prop, which is one node or an array of them. */
function walkChildren(children: ReactNode, walk: Walk): void {
  if (Array.isArray(children)) {
    children.forEach((child: ReactNode, index: number) =>
      walkNode(child, index, walk),
    );
    return;
  }

  walkNode(children, 0, walk);
}

/**
 * A scene, built from an element tree without rendering it.
 *
 * `<Scene>` builds by mounting: its children register in effects, and assembly
 * happens on the second render. This builds by *walking* -- it calls each
 * composite with its props and places each binding component's node directly,
 * so it needs no renderer, runs no effects, and finishes in one pass. It is what
 * lets a rig be built in a test, a worker or a tool that holds the rig as data.
 *
 * Both routes build from each binding component's `sceneNode`, so they agree by
 * construction on what a given element means. Three things differ, deliberately:
 *
 * - **Sibling order is JSX order**, always. Mounting orders siblings by when
 *   they registered, which is JSX order only for a tree whose shape never
 *   changes -- see `docs/issues/0005.md`. A walk has no registration to go by.
 * - **An unnamed frame's id is its path** through the tree -- `@0.1`, or
 *   `@0.$wheel` for a child keyed `wheel` -- where
 *   mounting uses React's `useId`. Both are stable for a given tree; they are
 *   not the same string, so a state map built against one does not carry to
 *   the other.
 * - **A building block missing a required prop is refused**, naming it by its
 *   label. Mounting relies on TypeScript to rule one out, and gets whatever the
 *   component does without it.
 *
 * And one thing it cannot do: **resolve an `<Anchor>` named by ref.** A ref is
 * filled in by an effect, and nothing here runs one. Name the anchor by `id`.
 */
export default function buildScene(
  element: ReactNode,
  { gravity }: { gravity?: number } = {},
): CoreScene {
  const root: FrameChildren = { decals: [], weights: [], frames: [] };
  const anchors = new Map<string, AnchorPoint>();
  const constraints: ConstraintNode[] = [];

  walkNode(element, 0, {
    frameId: null,
    path: '',
    depth: 0,
    into: root,
    anchors,
    constraints,
  });

  return assembleScene(root, anchors, constraints, {
    gravity,
    // A walked tree is complete when it is handed over, so nothing will come
    // along later to resolve a constraint that cannot be built now.
    unbuildable: {
      onEmptyRef: (node) => {
        throw new Error(
          `Found ${node.describe?.() ?? 'a constraint'}, naming an <Anchor> ` +
            'by ref. A ref is filled in by an effect, and a scene built ' +
            'without rendering runs none. Give the anchor an id, and name ' +
            'that instead.',
        );
      },
      onMissingFrame: (constraint) => {
        throw new Error(
          `A constraint between '${constraint.frameId1}' and ` +
            `'${constraint.frameId2}' names something the scene does not ` +
            'have: no frame or <Anchor id> goes by that name.',
        );
      },
    },
  });
}
