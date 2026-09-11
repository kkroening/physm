import coreComponents from './../react/coreComponents';
import { Fragment, createElement, isValidElement } from 'react';
import { canContain } from './../react/componentMeta';
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
 * - **children** -- no component, but the place a defined component's body
 *   keeps for the children an instance is given: at most one in a body, and
 *   never in the scene's own, which has no instances.
 */
export type ComponentRef =
  | { readonly kind: 'core'; readonly component: CoreComponent }
  | {
      readonly kind: 'imported';
      readonly name: string;
      readonly component: AnyComponent;
    }
  | { readonly kind: 'defined'; readonly name: string }
  | { readonly kind: 'children' };

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

/**
 * What a node of `ref`'s kind is called, wherever one is named to a person --
 * a refusal, a heading over its props.
 */
export function nodeName(ref: ComponentRef): string {
  return ref.kind === 'core'
    ? ref.component.meta.name
    : ref.kind === 'children'
      ? 'Children'
      : ref.name;
}

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

/** `nodes`, once no two of them share a key. */
function refuseRepeatedKeys(nodes: DocNode[]): DocNode[] {
  const keys = new Set<string>();
  for (const { key } of nodes) {
    if (key !== undefined && keys.has(key)) {
      throw new Error(
        `Two siblings share the key '${key}'. In JSX a key only has to ` +
          'differ within its own array or fragment, but a document holds a ' +
          "node's siblings as one list -- give them distinct keys.",
      );
    }

    if (key !== undefined) {
      keys.add(key);
    }
  }

  return nodes;
}

/**
 * Children, read as document nodes.
 *
 * Fragments and arrays flatten into their parent's children: a fragment is a
 * way of *writing* several siblings, not a node of its own. Nothing is called --
 * an element is a description of a call, and reading it does not make one.
 *
 * **Keys are unique among a node's siblings in a document**, which JSX does not
 * promise: there a key need only differ within its own array or fragment, and
 * two `.map`s that each number their children from zero become one list once
 * flattened. Such a list is refused rather than repaired, because the editor
 * does not invent keys -- and two siblings with one key would build as two
 * frames with one id.
 */
export function nodesFrom(children: ReactNode): DocNode[] {
  return refuseRepeatedKeys(flatten(children));
}

/** `nodesFrom`, before the flattened list's keys are checked. */
function flatten(children: ReactNode): DocNode[] {
  if (children === null || children === undefined) {
    return [];
  }

  if (typeof children === 'boolean') {
    return [];
  }

  if (Array.isArray(children)) {
    return children.flatMap((child: ReactNode) => flatten(child));
  }

  if (!isValidElement<{ children?: ReactNode }>(children)) {
    throw new Error(
      `A scene document is made of elements; found ${JSON.stringify(children)}.`,
    );
  }

  if (children.type === Fragment) {
    return flatten(children.props.children);
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

/** Where an element `elementOf` made came from: which definition, which node. */
export interface ElementOrigin {
  readonly definition: string;
  readonly path: NodePath;
}

/**
 * A definition as a React component, and every definition it reaches.
 *
 * One function component per definition, created fresh on each call and shared
 * by every instance within it. They are ordinary composites to anything that
 * renders or walks them -- `buildScene` expands them exactly as it would a
 * hand-written one, which is the point: an editor-defined component and a
 * hand-written one are meant to be indistinguishable to the rest of physm.
 *
 * `origins`, when given, is filled in with where each element came from: the
 * definition, and the path of the node it renders. It fills as the elements are
 * made -- for a definition's body, when its component is called -- so it is
 * complete once the element has been built or rendered.
 *
 * It is keyed by the element objects made here. A composite that clones its
 * children -- `cloneElement`, `Children.map` -- hands the walk elements it has
 * never seen, and the editor then selects that composite, the nearest node it
 * knows.
 */
export function elementOf(
  doc: SceneDocument,
  name = doc.root,
  origins?: WeakMap<object, ElementOrigin>,
): ReactElement {
  const components = new Map<string, FunctionComponent>();

  const componentFor = (definitionName: string): FunctionComponent => {
    const cached = components.get(definitionName);
    if (cached) {
      return cached;
    }

    const { body } = definitionOf(doc, definitionName);
    const component: FunctionComponent<{ children?: ReactNode }> = ({
      children,
    }) =>
      createElement(
        Fragment,
        null,
        ...body.map((node, index) =>
          render(definitionName, node, [index], children),
        ),
      );

    // Named, so an error from inside it says which definition it came from.
    Object.defineProperty(component, 'name', { value: definitionName });
    components.set(definitionName, component);

    return component;
  };

  const typeOf = (
    ref: Exclude<ComponentRef, { kind: 'children' }>,
  ): FunctionComponent =>
    (ref.kind === 'defined'
      ? componentFor(ref.name)
      : ref.component) as unknown as FunctionComponent;

  // Children go in as separate arguments rather than one array: an array child
  // is a list React expects keys on, and these are fixed siblings, not a list.
  //
  // `given` is what the instance being rendered was given as children, which
  // go where its body keeps a place for them.
  const render = (
    definition: string,
    node: DocNode,
    path: NodePath,
    given: ReactNode,
  ): ReactElement => {
    if (node.type.kind === 'children') {
      return createElement(
        Fragment,
        node.key === undefined ? null : { key: node.key },
        given,
      );
    }

    const element = createElement(
      typeOf(node.type),
      node.key === undefined ? node.props : { ...node.props, key: node.key },
      ...node.children.map((child, index) =>
        render(definition, child, [...path, index], given),
      ),
    );
    origins?.set(element, { definition, path });

    return element;
  };

  return createElement(componentFor(name));
}

/**
 * Where a definition's body keeps its instances' children, or `null` for a
 * body with no place for them.
 */
export function placeholderPath(
  doc: SceneDocument,
  definition: string,
): NodePath | null {
  const search = (
    nodes: readonly DocNode[],
    parent: NodePath,
  ): NodePath | null => {
    for (const [index, node] of nodes.entries()) {
      const path = [...parent, index];
      const found =
        node.type.kind === 'children' ? path : search(node.children, path);
      if (found) {
        return found;
      }
    }

    return null;
  };

  return search(definitionOf(doc, definition).body, []);
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
          props: value === undefined ? rest : { ...node.props, [prop]: value },
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

      if (
        node.key !== undefined &&
        siblings.some((sibling) => sibling.key === node.key)
      ) {
        throw new Error(
          `The list already has a node keyed '${node.key}', and a key is a ` +
            "node's identity among its siblings.",
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
export function afterRemoval(path: NodePath, removed: NodePath): NodePath {
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
 * The two are read at different moments. `parent` is the list's path as the
 * document reads *before* the move, and is corrected for the removal; `index`
 * counts in that list once the node has left it. So a node moved into a later
 * sibling names that sibling's current path.
 *
 * Refuses to move a node into itself or anything beneath it, which would detach
 * it from the tree entirely -- and, through `insertNode`, into a list that
 * already has a node with its key.
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

/**
 * ECMAScript's own capitalised built-ins: names generated code may use -- page
 * 6's `-Math.PI / 2`, say -- and the same set whichever host runs the editor.
 */
const BUILT_INS = new Set([
  'AggregateError',
  'Array',
  'ArrayBuffer',
  'Atomics',
  'BigInt',
  'BigInt64Array',
  'BigUint64Array',
  'Boolean',
  'DataView',
  'Date',
  'Error',
  'EvalError',
  'FinalizationRegistry',
  'Float32Array',
  'Float64Array',
  'Function',
  'Infinity',
  'Int16Array',
  'Int32Array',
  'Int8Array',
  'Intl',
  'Iterator',
  'JSON',
  'Map',
  'Math',
  'NaN',
  'Number',
  'Object',
  'Promise',
  'Proxy',
  'RangeError',
  'ReferenceError',
  'Reflect',
  'RegExp',
  'Set',
  'SharedArrayBuffer',
  'String',
  'Symbol',
  'SyntaxError',
  'TypeError',
  'URIError',
  'Uint16Array',
  'Uint32Array',
  'Uint8Array',
  'Uint8ClampedArray',
  'WeakMap',
  'WeakRef',
  'WeakSet',
]);

/** Every node in these nodes and their children, parents first. */
function everyNode(nodes: readonly DocNode[]): DocNode[] {
  return nodes.flatMap((node) => [node, ...everyNode(node.children)]);
}

/**
 * Why `name` cannot name a new component in `doc`, or `null` when it can.
 *
 * It becomes a JSX tag and a function in generated source. So it has to be an
 * identifier React reads as a component -- a capital first -- and must not
 * collide with anything that source already means: a building block, another
 * component, an import, or an ECMAScript built-in the module may use.
 */
export function nameRefusal(doc: SceneDocument, name: string): string | null {
  const imported = new Set(
    doc.definitions.flatMap(({ body }) =>
      everyNode(body).flatMap(({ type }) =>
        type.kind === 'imported' ? [type.name] : [],
      ),
    ),
  );

  if (!/^[A-Z][A-Za-z0-9_]*$/.test(name)) {
    return (
      'A component name starts with a capital letter, and has only letters, ' +
      'digits and _ after it.'
    );
  }

  if (coreComponents.some(({ meta }) => meta.name === name)) {
    return `${name} is already a building block.`;
  }

  if (doc.definitions.some((definition) => definition.name === name)) {
    return `${name} is already a component in this scene.`;
  }

  if (name === 'Children') {
    return 'Children names the place a component keeps for its children.';
  }

  if (imported.has(name) || name === 'ReactElement' || name === 'ReactNode') {
    return `${name} is already imported by the generated module.`;
  }

  return BUILT_INS.has(name)
    ? `${name} is a JavaScript built-in, which generated code may use.`
    : null;
}

/**
 * Why the node at `path` cannot be deleted, or `null` when it can: it holds
 * its body's place for children while an instance of the body's component has
 * some, which would be left with nowhere to go.
 */
export function deletionRefusal(
  doc: SceneDocument,
  definition: string,
  path: NodePath,
): string | null {
  const holdsPlace = everyNode([nodeAt(doc, definition, path)]).some(
    ({ type }) => type.kind === 'children',
  );
  // The bodies holding an instance given children, to say where to look.
  const givers = doc.definitions
    .filter(({ body }) =>
      everyNode(body).some(
        ({ type, children }) =>
          type.kind === 'defined' &&
          type.name === definition &&
          children.length > 0,
      ),
    )
    .map(({ name }) => name);
  const where =
    givers.length > 1
      ? `${givers.slice(0, -1).join(', ')} and ${givers[givers.length - 1]}`
      : givers[0];

  return holdsPlace && where
    ? `An instance of ${definition} in ${where} holds children, which would ` +
        'then have nowhere to go: delete them first.'
    : null;
}

/**
 * Why the node at `path` cannot become a component of its own, or `null`.
 *
 * An instance of a defined component goes wherever a frame can, which holds
 * only while no body has a weight or an anchor at its top -- so a building
 * block the root refuses cannot be extracted alone.
 */
export function extractionRefusal(
  doc: SceneDocument,
  definition: string,
  path: NodePath,
): string | null {
  const node = nodeAt(doc, definition, path);
  if (everyNode([node]).some(({ type }) => type.kind === 'children')) {
    return (
      `This holds ${definition}'s place for its children, which has to stay ` +
      `in ${definition}.`
    );
  }

  const { type } = node;
  if (type.kind !== 'core' || canContain('root', type.component.meta.slot)) {
    return null;
  }

  const { name } = type.component.meta;

  return (
    `A ${name} cannot be a component of its own: it has to go inside a ` +
    'frame, and a component goes wherever a frame can. Extract the frame ' +
    'that holds it instead.'
  );
}

/**
 * Move the node at `path`, and everything under it, into a new component named
 * `name`, leaving an instance of it in its place.
 *
 * It also keeps a place for the new component's children: at the origin of its
 * outermost frame, passed on to the place of an instance that keeps one, or
 * beside the node. The place builds nothing until an instance is given
 * children.
 *
 * A pure document edit. The scene it builds is unchanged, up to the ids of
 * frames nobody named: ids are scene-wide, so whatever names one -- inside the
 * subtree or out -- still finds it. That is also the limit on reuse. A
 * component whose constraint names an id outside itself stays tied to the
 * scene it came from, and its own tab reports the frame it cannot find. The instance takes the node's `key`,
 * so its identity among its siblings is unchanged.
 */
export function extractComponent(
  doc: SceneDocument,
  definition: string,
  path: NodePath,
  name: string,
): SceneDocument {
  const refusal =
    nameRefusal(doc, name) ?? extractionRefusal(doc, definition, path);
  if (refusal) {
    throw new Error(refusal);
  }

  const node = nodeAt(doc, definition, path);
  const [list, index] = splitPath(path);

  // A component takes children by default. The place for them goes at the
  // origin of its outermost frame; or, for an instance of a component that
  // keeps a place of its own, among its children, passing them on to it; or
  // beside the node. It builds nothing until an instance is given some, so
  // the scene is unchanged, and it can be moved or deleted like any node.
  const place: DocNode = {
    type: { kind: 'children' },
    props: {},
    children: [],
  };
  const holds =
    (node.type.kind === 'core' && node.type.component.meta.slot === 'frame') ||
    (node.type.kind === 'defined' &&
      placeholderPath(doc, node.type.name) !== null);
  const root: DocNode = {
    type: node.type,
    props: node.props,
    children: holds ? [...node.children, place] : node.children,
  };
  const instance: DocNode = {
    type: { kind: 'defined', name },
    props: {},
    ...(node.key === undefined ? {} : { key: node.key }),
    children: [],
  };
  const replaced = withBody(doc, definition, (body) =>
    withList(body, list, (siblings) =>
      siblings.map((entry, at) => (at === index ? instance : entry)),
    ),
  );

  return {
    ...replaced,
    definitions: [
      ...replaced.definitions,
      { name, body: holds ? [root] : [root, place] },
    ],
  };
}
