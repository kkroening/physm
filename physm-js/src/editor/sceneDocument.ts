import { Fragment, createElement, isValidElement } from 'react';
import type { ComponentMeta } from './../react/componentMeta';
import type { FunctionComponent, ReactElement, ReactNode } from 'react';

/** Any component, as the document holds it: a function of some props. */
export type AnyComponent = (props: never) => ReactNode;

/** A binding building block: a component that carries its own `meta`. */
export type CoreComponent = AnyComponent & {
  readonly meta: ComponentMeta<Record<string, unknown>>;
};

/**
 * What a document node instantiates.
 *
 * Three kinds, and what separates them is who owns the body
 * (`docs/issues/0014/03-focus.md`):
 *
 * - **core** -- a building block. Its body is the binding's, and its props are
 *   described by its `meta`.
 * - **imported** -- a composite defined in some module the editor did not
 *   write. An opaque function: calling it yields what it produced for those
 *   props, never its body, so it can be expanded but not edited.
 * - **defined** -- a component this document defines. Its body is document
 *   data, so it is editable all the way down.
 */
export type ComponentRef =
  | { readonly kind: 'core'; readonly component: CoreComponent }
  | {
      readonly kind: 'imported';
      readonly name: string;
      readonly component: AnyComponent;
    }
  | { readonly kind: 'defined'; readonly name: string };

/** One authored element: what it is, its props, and its authored children. */
export interface DocNode {
  readonly type: ComponentRef;

  /** Everything but `children`, which are structure and live below. */
  readonly props: Readonly<Record<string, unknown>>;

  /** The element's `key`, when it has one -- its identity among siblings. */
  readonly key?: string;

  readonly children: readonly DocNode[];
}

/** A component the document defines: a name, and the elements it renders. */
export interface Definition {
  readonly name: string;
  readonly body: readonly DocNode[];
}

/**
 * A scene as the editor holds it: every component the document defines, and
 * which of them is the scene.
 *
 * Plain data, replaced rather than mutated by every edit below -- which is what
 * makes undo a stack of past documents, and what makes a node reference stale
 * the moment anything changes. Address nodes by `NodePath` instead.
 */
export interface SceneDocument {
  readonly definitions: readonly Definition[];
  readonly root: string;
}

/**
 * Indices from a definition's body down to one node.
 *
 * `[1, 0]` is the first child of the body's second node. Positional, so a
 * structural edit can move what a path points at; that is accepted, because a
 * structural edit is also where the editor stops trying to carry anything
 * across (`docs/issues/0014/08-play.md`).
 */
export type NodePath = readonly number[];

/** A component's name, as generated source will write its tag. */
function nameOf(component: AnyComponent): string {
  const { displayName, name } = component as { displayName?: string } & {
    name: string;
  };

  return displayName ?? name;
}

/** What an element type refers to, as the document records it. */
function refOf(type: unknown): ComponentRef {
  if (typeof type !== 'function') {
    throw new Error(
      `A scene document is made of components; found ${String(type)}. A DOM ` +
        'element or other element kind has nowhere to go in a scene.',
    );
  }

  const component = type as AnyComponent;

  return 'meta' in type
    ? { kind: 'core', component: component as CoreComponent }
    : { kind: 'imported', name: nameOf(component), component };
}

/**
 * Children, read as document nodes.
 *
 * Fragments and arrays flatten into their parent's children: a fragment is a
 * way of *writing* several siblings, not a node of its own. Nothing is called --
 * an element is a description of a call, and reading it does not make one.
 */
export function nodesFrom(children: ReactNode): DocNode[] {
  if (children === null || children === undefined) {
    return [];
  }

  if (typeof children === 'boolean') {
    return [];
  }

  if (Array.isArray(children)) {
    return children.flatMap((child: ReactNode) => nodesFrom(child));
  }

  if (!isValidElement<{ children?: ReactNode }>(children)) {
    throw new Error(
      `A scene document is made of elements; found ${JSON.stringify(children)}.`,
    );
  }

  if (children.type === Fragment) {
    return nodesFrom(children.props.children);
  }

  const { children: grandchildren, ...props } = children.props;

  return [
    {
      type: refOf(children.type),
      props,
      ...(children.key === null ? {} : { key: children.key }),
      children: nodesFrom(grandchildren),
    },
  ];
}

/** A document with one definition, named `root`, rendering `element`. */
export function documentFrom(
  element: ReactNode,
  root = 'Scene',
): SceneDocument {
  return { definitions: [{ name: root, body: nodesFrom(element) }], root };
}

/** A definition by name, or a throw naming what was asked for. */
export function definitionOf(doc: SceneDocument, name: string): Definition {
  const found = doc.definitions.find((definition) => definition.name === name);
  if (!found) {
    throw new Error(`The document defines no component named '${name}'.`);
  }

  return found;
}

/**
 * A definition as a React component, and every definition it reaches.
 *
 * One function component per definition, created fresh on each call and shared
 * by every instance within it. They are ordinary composites to anything that
 * renders or walks them -- `buildScene` expands them exactly as it would a
 * hand-written one, which is the point: an editor-defined component and a
 * hand-written one are meant to be indistinguishable to the rest of physm.
 */
export function elementOf(doc: SceneDocument, name = doc.root): ReactElement {
  const components = new Map<string, FunctionComponent>();

  const componentFor = (definitionName: string): FunctionComponent => {
    const cached = components.get(definitionName);
    if (cached) {
      return cached;
    }

    const { body } = definitionOf(doc, definitionName);
    const component: FunctionComponent = () =>
      createElement(Fragment, null, ...body.map(render));

    // Named, so an error from inside it says which definition it came from.
    Object.defineProperty(component, 'name', { value: definitionName });
    components.set(definitionName, component);

    return component;
  };

  const typeOf = (ref: ComponentRef): FunctionComponent =>
    (ref.kind === 'defined'
      ? componentFor(ref.name)
      : ref.component) as unknown as FunctionComponent;

  // Children go in as separate arguments rather than one array: an array child
  // is a list React expects keys on, and these are fixed siblings, not a list.
  const render = (node: DocNode): ReactElement =>
    createElement(
      typeOf(node.type),
      node.key === undefined ? node.props : { ...node.props, key: node.key },
      ...node.children.map(render),
    );

  return createElement(componentFor(name));
}

/** A node by path, or a throw naming the path. */
export function nodeAt(
  doc: SceneDocument,
  definition: string,
  path: NodePath,
): DocNode {
  let nodes = definitionOf(doc, definition).body;
  let node: DocNode | undefined;
  for (const index of path) {
    node = nodes[index];
    if (!node) {
      throw new Error(`No node at [${path.join(', ')}] in '${definition}'.`);
    }

    nodes = node.children;
  }

  if (!node) {
    throw new Error(`An empty path names no node in '${definition}'.`);
  }

  return node;
}

/** `doc` with one definition's body replaced. */
function withBody(
  doc: SceneDocument,
  definition: string,
  update: (body: readonly DocNode[]) => readonly DocNode[],
): SceneDocument {
  definitionOf(doc, definition);

  return {
    ...doc,
    definitions: doc.definitions.map((entry) =>
      entry.name === definition
        ? { ...entry, body: update(entry.body) }
        : entry,
    ),
  };
}

/**
 * A list of siblings with the list at `path` inside it rewritten.
 *
 * `path` names a *list* rather than a node: `[]` is the list itself, `[2]` the
 * children of its third node, and so on down.
 */
function withList(
  nodes: readonly DocNode[],
  path: NodePath,
  update: (list: readonly DocNode[]) => readonly DocNode[],
): readonly DocNode[] {
  if (!path.length) {
    return update(nodes);
  }

  const [index, ...rest] = path as [number, ...number[]];
  const node = nodes[index];
  if (!node) {
    throw new Error(`No node at index ${index}.`);
  }

  return nodes.map((entry, at) =>
    at === index
      ? { ...entry, children: withList(entry.children, rest, update) }
      : entry,
  );
}

/** A path split into the list that holds the node and its index in it. */
function splitPath(path: NodePath): [NodePath, number] {
  if (!path.length) {
    throw new Error('An empty path names no node.');
  }

  return [path.slice(0, -1), path[path.length - 1]!];
}

/**
 * Set one prop on one node; `undefined` removes it.
 *
 * Removing is not the same as setting `undefined`, and the difference is the
 * one `exactOptionalPropertyTypes` exists for: an absent `position` on an
 * `<Anchor>` means "solve for it", and a present-but-undefined one is a
 * different, confusing thing.
 */
export function setProp(
  doc: SceneDocument,
  definition: string,
  path: NodePath,
  prop: string,
  value: unknown,
): SceneDocument {
  const [list, index] = splitPath(path);
  nodeAt(doc, definition, path);

  return withBody(doc, definition, (body) =>
    withList(body, list, (siblings) =>
      siblings.map((node, at) => {
        if (at !== index) {
          return node;
        }

        const rest = Object.fromEntries(
          Object.entries(node.props).filter(([name]) => name !== prop),
        );

        return {
          ...node,
          props: value === undefined ? rest : { ...rest, [prop]: value },
        };
      }),
    ),
  );
}

/**
 * Insert a node into the list of children at `parent` -- `[]` for the body --
 * so that it lands at `index`.
 */
export function insertNode(
  doc: SceneDocument,
  definition: string,
  parent: NodePath,
  index: number,
  node: DocNode,
): SceneDocument {
  return withBody(doc, definition, (body) =>
    withList(body, parent, (siblings) => {
      if (index < 0 || index > siblings.length) {
        throw new Error(
          `Cannot insert at ${index} among ${siblings.length} siblings.`,
        );
      }

      return [...siblings.slice(0, index), node, ...siblings.slice(index)];
    }),
  );
}

/** Remove the node at `path`, and everything under it. */
export function removeNode(
  doc: SceneDocument,
  definition: string,
  path: NodePath,
): SceneDocument {
  const [list, index] = splitPath(path);
  nodeAt(doc, definition, path);

  return withBody(doc, definition, (body) =>
    withList(body, list, (siblings) =>
      siblings.filter((_, at) => at !== index),
    ),
  );
}

/**
 * Where a path points once the node at `removed` is gone.
 *
 * Only a path that passes *through* the removed node's list, at a later
 * sibling, moves -- by one, at that level. Everything else is untouched.
 */
function afterRemoval(path: NodePath, removed: NodePath): NodePath {
  const level = removed.length - 1;
  const sameList =
    path.length > level &&
    removed.slice(0, level).every((index, at) => index === path[at]);

  return sameList && path[level]! > removed[level]!
    ? path.map((index, at) => (at === level ? index - 1 : index))
    : path;
}

/**
 * Move the node at `from` into the list at `parent`, so that it lands at
 * `index` in that list *as it reads after the move*.
 *
 * Refuses to move a node into itself or anything beneath it, which would detach
 * it from the tree entirely.
 */
export function moveNode(
  doc: SceneDocument,
  definition: string,
  from: NodePath,
  parent: NodePath,
  index: number,
): SceneDocument {
  const intoItself =
    parent.length >= from.length &&
    from.every((segment, at) => segment === parent[at]);
  if (intoItself) {
    throw new Error('A node cannot be moved inside itself.');
  }

  const node = nodeAt(doc, definition, from);
  const removed = removeNode(doc, definition, from);

  return insertNode(
    removed,
    definition,
    afterRemoval(parent, from),
    index,
    node,
  );
}
