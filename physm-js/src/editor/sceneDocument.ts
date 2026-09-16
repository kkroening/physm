import coreComponents from './../react/coreComponents';
import { isOperation } from './../expression';
import { BUILT_INS, IDENTIFIER, RESERVED } from './identifiers';
import { Fragment, createElement, isValidElement } from 'react';
import { canContain } from './../react/componentMeta';
import type { Sharing } from './propValue';
import {
  literalIn,
  literalOf,
  literalProps,
  parameterOf,
  referencesIn,
  renamedReferences,
  resolvedProps,
  shownValueOf,
} from './propValue';
import type { ComponentMeta, PropSpec } from './../react/componentMeta';
import type { FunctionComponent, ReactElement, ReactNode } from 'react';
import type { DocProps, PropValue, Scope } from './propValue';

/** Any component, as the document holds it: a function of some props. */
type AnyComponent = (props: never) => ReactNode;

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
  readonly props: DocProps;

  /** The element's `key`, when it has one -- its identity among siblings. */
  readonly key?: string;

  readonly children: readonly DocNode[];
}

/**
 * What a definition takes: a name a child prop can refer to, and a type saying
 * what may be passed.
 *
 * The types are [0016 page 3](../../../docs/issues/0016/03-scope.md)'s set,
 * restricted to the ones a literal can express. `Direction` and `Frame` arrive
 * with the features that need them.
 *
 * A union rather than a `type` tag beside an open `default`, so the two cannot
 * disagree: an angle defaulted to a point is not a `Parameter`. That is the
 * opposite call from `PropValue.value`, which is `unknown` because the shape it
 * holds is the *component's* business and nothing there could know it -- here
 * the declaration states the type one field away from the value.
 */
export type Parameter =
  | {
      readonly name: string;
      readonly type: 'scalar' | 'integer' | 'angle';
      readonly default?: number;
    }
  | {
      readonly name: string;
      readonly type: 'point';
      readonly default?: readonly [number, number];
    }
  | {
      readonly name: string;
      readonly type: 'label';
      readonly default?: string;
    };

/** A component the document defines: a name, what it takes, and what it renders. */
export interface Definition {
  readonly name: string;

  /**
   * Absent and empty mean the same thing -- a definition that takes nothing --
   * so a document written before parameters existed needs no migration.
   */
  readonly parameters?: readonly Parameter[];

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
  // One sharing table per read, so what it records is what *this* tree states:
  // a value object used in two places here is one value, and the same object
  // reached from a later read is a separate statement.
  return refuseRepeatedKeys(flatten(children, new WeakMap()));
}

/** `nodesFrom`, before the flattened list's keys are checked. */
function flatten(children: ReactNode, sharing: Sharing): DocNode[] {
  if (children === null || children === undefined) {
    return [];
  }

  if (typeof children === 'boolean') {
    return [];
  }

  if (Array.isArray(children)) {
    return children.flatMap((child: ReactNode) => flatten(child, sharing));
  }

  if (!isValidElement<{ children?: ReactNode }>(children)) {
    throw new Error(
      `A scene document is made of elements; found ${JSON.stringify(children)}.`,
    );
  }

  if (children.type === Fragment) {
    return flatten(children.props.children, sharing);
  }

  const { children: grandchildren, ...props } = children.props;

  return [
    {
      type: refOf(children.type),
      props: literalProps(props, sharing),
      ...(children.key === null ? {} : { key: children.key }),
      children: refuseRepeatedKeys(flatten(grandchildren, sharing)),
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

    const { body, parameters } = definitionOf(doc, definitionName);
    const defaults = Object.fromEntries(
      (parameters ?? [])
        .filter(({ default: value }) => value !== undefined)
        .map(({ name, default: value }) => [name, value]),
    );

    // Whatever the instance passed, over the declared defaults: that is the
    // scope every `parameter` prop in this body resolves against.
    //
    // What the instance *supplied*, though, not every key it carries: a spread
    // copies an own property whose value is `undefined` and buries the default
    // under it, where the emitted function's `{ bob = [9, 0] }` is triggered by
    // exactly that `undefined`. Dropping them is what keeps the two agreeing.
    const component: FunctionComponent<{ children?: ReactNode } & Scope> = ({
      children,
      ...passed
    }) => {
      // One table across the whole body, so two props on two sibling nodes
      // holding one computation resolve to one node -- which is what the
      // document said, and what a viewer of the resolved graph would draw.
      const seen = new Map<unknown, unknown>();
      const scope = {
        ...defaults,
        ...Object.fromEntries(
          Object.entries(passed).filter(([, value]) => value !== undefined),
        ),
      };

      return createElement(
        Fragment,
        null,
        ...body.map((node, index) =>
          render(definitionName, node, [index], children, scope, seen),
        ),
      );
    };

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
    scope: Scope,
    seen: Map<unknown, unknown>,
  ): ReactElement => {
    if (node.type.kind === 'children') {
      return createElement(
        Fragment,
        node.key === undefined ? null : { key: node.key },
        given,
      );
    }

    const plain = resolvedProps(node.props, scope, seen);
    const element = createElement(
      typeOf(node.type),
      node.key === undefined ? plain : { ...plain, key: node.key },
      ...node.children.map((child, index) =>
        render(definition, child, [...path, index], given, scope, seen),
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
  value: PropValue | undefined,
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
 * Where `moveNode` leaves the node it moved: the list at `parent` as the
 * document reads once the node has left it, and `index` within that list.
 *
 * Not simply `[...parent, index]`, because the two are read at the two moments
 * `moveNode` reads them. A node leaving a list that precedes its destination
 * shifts the destination's own path. The keyboard's moves never see it --
 * indenting lands in a sibling's list and outdenting in the grandparent's, and
 * a removal shifts neither -- which is true rather than obvious, and the reason
 * only the drag asks.
 */
export function movedPath(
  from: NodePath,
  parent: NodePath,
  index: number,
): NodePath {
  return [...afterRemoval(parent, from), index];
}

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
 * Whether `value` is what a parameter of `type` may default to.
 *
 * The union `Parameter` keeps the two together at compile time; this is the
 * same rule where the type is chosen at runtime, by a person picking one.
 */
function fitsType(type: Parameter['type'], value: unknown): boolean {
  if (type === 'label') {
    return typeof value === 'string';
  }

  return type === 'point'
    ? Array.isArray(value) &&
        value.length === 2 &&
        value.every((each) => typeof each === 'number')
    : typeof value === 'number';
}

/**
 * Why `definition` cannot declare a parameter called `name`, or `null`.
 *
 * The name is written into the emitted module as a binding, so it is checked
 * the way a component name is: `emitScene` refuses one it cannot write, and
 * this is the same rule where a person can still fix it. It does not cover
 * everything the emitter does -- a name shadowing a tag the body writes is a
 * whole-module question, and the code pane reports that one -- so the two are
 * not the same check and neither replaces the other.
 *
 * `at` is the parameter being renamed, which is not a duplicate of itself.
 */
export function parameterNameRefusal(
  doc: SceneDocument,
  definition: string,
  at: number | null,
  name: string,
): string | null {
  const { parameters = [] } = definitionOf(doc, definition);

  if (!IDENTIFIER.test(name)) {
    return (
      'A parameter name starts with a letter, _ or $, and has only letters, ' +
      'digits, _ and $ after it.'
    );
  }

  if (name === 'children') {
    return 'children names what a component is given as its children.';
  }

  if (RESERVED.has(name)) {
    return `${name} is a JavaScript keyword, so nothing can be called it.`;
  }

  if (
    parameters.some(
      (parameter, index) => index !== at && parameter.name === name,
    )
  ) {
    return `${definition} already takes ${name}.`;
  }

  return BUILT_INS.has(name)
    ? `${name} is a JavaScript built-in, which generated code may use.`
    : null;
}

/**
 * Every prop in `definition`'s body that refers to the parameter `name`.
 *
 * Not every prop that *names* it: an instance of `definition` passes one keyed
 * by the parameter's name, in whatever body holds that instance, and those are
 * `instancesPassing`. The two sets are disjoint and every edit to a parameter
 * has to answer for both.
 */
function referencesTo(
  doc: SceneDocument,
  definition: string,
  name: string,
): { node: DocNode; prop: string }[] {
  return everyNode(definitionOf(doc, definition).body).flatMap((node) =>
    Object.entries(node.props).flatMap(([prop, held]) =>
      referencesIn(held).includes(name) ? [{ node, prop }] : [],
    ),
  );
}

/** Whether `node` is an instance of the component `definition` names. */
function instantiates(node: DocNode, definition: string): boolean {
  return node.type.kind === 'defined' && node.type.name === definition;
}

/**
 * Every definition's body rewritten by `update`, wherever it instantiates
 * `definition`.
 *
 * The instances are the other half of what a parameter's name reaches: what an
 * instance passes is keyed by that name, and `elementOf` builds the scope from
 * those keys -- so a name the two halves disagree about resolves to
 * `undefined` and the prop it fed falls to its component's own default.
 */
function withInstances(
  doc: SceneDocument,
  definition: string,
  update: (props: DocProps) => DocProps,
): SceneDocument {
  const rewrite = (nodes: readonly DocNode[]): DocNode[] =>
    nodes.map((node) => ({
      ...node,
      ...(instantiates(node, definition) ? { props: update(node.props) } : {}),
      children: rewrite(node.children),
    }));

  return {
    ...doc,
    definitions: doc.definitions.map((entry) => ({
      ...entry,
      body: rewrite(entry.body),
    })),
  };
}

/**
 * Why `definition`'s parameter at `at` cannot be deleted, or `null`.
 *
 * A prop referring to it would be left naming nothing, which resolves to
 * `undefined` and silently moves whatever it placed. Saying so is better than
 * either rewriting those props to a value they never held or leaving them
 * dangling.
 */
export function parameterRemovalRefusal(
  doc: SceneDocument,
  definition: string,
  at: number,
): string | null {
  const { name } = parameterAt(doc, definition, at);
  const [first] = referencesTo(doc, definition, name);

  // Only the references. What an instance passes is dropped by
  // `removeParameter` rather than refused: a reference resolved against a
  // scope that no longer holds the name falls to its component's default and
  // moves something, where an argument to a parameter that no longer exists
  // is read by nothing at all. Refusing that one would make a person visit
  // every instance to delete a value that already means nothing.
  return first
    ? `${nodeName(first.node.type)}'s ${first.prop} refers to ${name}: ` +
        'give it a value first.'
    : null;
}

/** The parameter `definition` declares at `at`, which has to be there. */
export function parameterAt(
  doc: SceneDocument,
  definition: string,
  at: number,
): Parameter {
  const parameter = definitionOf(doc, definition).parameters?.[at];
  if (!parameter) {
    throw new Error(`${definition} declares no parameter at ${at}.`);
  }

  return parameter;
}

/** A document with `definition`'s parameter list rewritten. */
function withParameters(
  doc: SceneDocument,
  definition: string,
  update: (parameters: readonly Parameter[]) => readonly Parameter[],
): SceneDocument {
  // Throws on a definition the document does not have. Without it the map
  // below matches nothing and the edit silently returns the document
  // unchanged, which is a worse failure and a harder one to trace back here.
  definitionOf(doc, definition);

  return {
    ...doc,
    definitions: doc.definitions.map((entry) =>
      entry.name === definition
        ? { ...entry, parameters: update(entry.parameters ?? []) }
        : entry,
    ),
  };
}

/**
 * A scalar parameter added to `definition`, named so as not to clash.
 *
 * A new one takes no default: a parameter every instance may leave out is the
 * weaker statement, and the person adding it is about to say what it is for.
 */
export function addParameter(
  doc: SceneDocument,
  definition: string,
): SceneDocument {
  const taken = new Set(
    (definitionOf(doc, definition).parameters ?? []).map(({ name }) => name),
  );
  let name = 'value';
  for (let n = 2; taken.has(name); n += 1) {
    name = `value${n}`;
  }

  return withParameters(doc, definition, (parameters) => [
    ...parameters,
    { name, type: 'scalar' },
  ]);
}

/**
 * `definition` without the parameter at `at`, which nothing may refer to.
 *
 * The argument each instance passed for it goes too. It feeds nothing once the
 * declaration is gone, and leaving it would emit `<Pendulum bob={[4, 0]} />`
 * against a signature that does not take `bob`.
 */
export function removeParameter(
  doc: SceneDocument,
  definition: string,
  at: number,
): SceneDocument {
  const refusal = parameterRemovalRefusal(doc, definition, at);
  if (refusal) {
    throw new Error(refusal);
  }

  const { name } = parameterAt(doc, definition, at);
  const declared = withParameters(doc, definition, (parameters) =>
    parameters.filter((_, index) => index !== at),
  );

  return withInstances(declared, definition, (props) =>
    Object.fromEntries(Object.entries(props).filter(([prop]) => prop !== name)),
  );
}

/**
 * `definition` with the parameter at `at` moved `by` places among its siblings.
 *
 * Order is not cosmetic here, which is why this is an edit rather than a view
 * concern: the parameters are the emitted signature's order, so moving one
 * rewrites `function Pendulum({ bob, heft })` and every reader of that source.
 *
 * Nothing else moves. A parameter is referred to **by name** -- by the props
 * in this definition's body and by the argument each instance passes -- so
 * unlike a rename there is nothing to carry, and unlike a removal there is
 * nothing to drop.
 *
 * A move that would leave the list is clamped rather than refused, because the
 * caller is a key held down: `Alt+Down` on the last parameter is an ordinary
 * thing to do and means nothing happened, where a throw would mean the editor
 * stopped.
 */
/**
 * Where `moveParameter` leaves the parameter it moved.
 *
 * Exported for the same reason `movedPath` is: a caller that has to select
 * what it just moved should read the answer rather than invert the move --
 * a search for the parameter by name would rest on names being unique, which
 * is an invariant this module does not state, and would answer `-1` where it
 * should throw.
 */
export function movedParameter(
  doc: SceneDocument,
  definition: string,
  at: number,
  by: number,
): number {
  parameterAt(doc, definition, at);
  const { parameters = [] } = definitionOf(doc, definition);

  return Math.min(Math.max(at + by, 0), parameters.length - 1);
}

export function moveParameter(
  doc: SceneDocument,
  definition: string,
  at: number,
  by: number,
): SceneDocument {
  // Throws on an index the definition does not have, which is the one case a
  // clamp must not swallow: `at` names what is being moved, and a bad one is a
  // caller bug rather than the end of the list.
  const moving = parameterAt(doc, definition, at);
  const to = movedParameter(doc, definition, at, by);

  // The *document* back, not an equal one, so that a caller can tell nothing
  // happened. `withParameters` rebuilds whatever its update returns, so
  // clamping inside it would hand back a fresh document every time -- and the
  // editor records one undo step per press of a key that is being held down at
  // the end of the list.
  if (to === at) {
    return doc;
  }

  return withParameters(doc, definition, (declared) => {
    const moved = declared.filter((_, index) => index !== at);

    return [...moved.slice(0, to), moving, ...moved.slice(to)];
  });
}

/**
 * The parameter at `at` renamed, along with every prop that names it: the
 * references in this definition's body, and the argument each instance passes.
 *
 * Those two are the reason this is an edit rather than a field. A rename that
 * left either behind would change the scene, which is the one thing a rename
 * must not do -- and the instance half is the quieter of the two, because
 * nothing about the definition being renamed says which bodies hold one.
 */
export function renameParameter(
  doc: SceneDocument,
  definition: string,
  at: number,
  name: string,
): SceneDocument {
  const refusal = parameterNameRefusal(doc, definition, at, name);
  if (refusal) {
    throw new Error(refusal);
  }

  const { name: was } = parameterAt(doc, definition, at);
  const renamed = withParameters(doc, definition, (parameters) =>
    parameters.map((parameter, index) =>
      index === at ? { ...parameter, name } : parameter,
    ),
  );
  const rewrite = (nodes: readonly DocNode[]): DocNode[] =>
    nodes.map((node) => ({
      ...node,
      props: Object.fromEntries(
        Object.entries(node.props).map(([prop, held]) => [
          prop,
          renamedReferences(held, was, name),
        ]),
      ),
      children: rewrite(node.children),
    }));

  return withInstances(
    withBody(renamed, definition, rewrite),
    definition,
    (props) =>
      Object.fromEntries(
        Object.entries(props).map(([prop, held]) => [
          prop === was ? name : prop,
          held,
        ]),
      ),
  );
}

/**
 * The parameter at `at` retyped, keeping its default only where it still fits.
 *
 * A default the new type cannot hold is dropped rather than coerced: what
 * `[0, 0]` meant as a point says nothing as a label, and a coercion would
 * invent an answer where the person has one to give.
 */
export function retypeParameter(
  doc: SceneDocument,
  definition: string,
  at: number,
  type: Parameter['type'],
): SceneDocument {
  return withParameters(doc, definition, (parameters) =>
    parameters.map((parameter, index) =>
      index === at
        ? ({
            name: parameter.name,
            type,
            ...(parameter.default !== undefined &&
            fitsType(type, parameter.default)
              ? { default: parameter.default }
              : {}),
          } as Parameter)
        : parameter,
    ),
  );
}

/**
 * The parameter at `at` given a default, or `undefined` to take one away.
 *
 * A value the declared type cannot hold is refused rather than stored: the
 * emitted signature writes the default at the declared type, so storing one
 * that does not fit would emit a module that does not compile.
 */
export function setParameterDefault(
  doc: SceneDocument,
  definition: string,
  at: number,
  value: unknown,
): SceneDocument {
  const { type, name } = parameterAt(doc, definition, at);
  if (value !== undefined && !fitsType(type, value)) {
    throw new Error(
      `${JSON.stringify(value)} is not a ${type}, which ${name} is.`,
    );
  }

  return withParameters(doc, definition, (parameters) =>
    parameters.map((parameter, index) =>
      index === at
        ? ({
            name: parameter.name,
            type: parameter.type,
            ...(value === undefined ? {} : { default: value }),
          } as Parameter)
        : parameter,
    ),
  );
}

/**
 * What kind of parameter a prop of each kind becomes.
 *
 * The inverse of what the properties pane edits a parameter with, and it is
 * partial where that one is total: `flag` and `state` have no parameter type
 * to become. A boolean parameter is not in [0016 page
 * 3](../../../docs/issues/0016/03-scope.md)'s set at all, and a `state` is a
 * pair of a coordinate and its rate, which no single type covers.
 *
 * **Three of the entries here are deliberately lossy**, and it is worth saying
 * so rather than letting the table imply otherwise. `length` becomes a
 * `scalar`, which drops *non-negative*; `color` becomes a `label`, which drops
 * *a CSS colour*; `end` becomes a `label`, which drops *an id that resolves to
 * a frame or an anchor*. So the rule is not "refuse rather than approximate"
 * -- it is "approximate where the approximation can hold the value at all, and
 * refuse where it cannot". Whether the type set should instead grow toward the
 * prop kinds is [0022](../../../docs/issues/0022.md), which expressions ask
 * again from the other side.
 */
const PROMOTED_TYPES: Partial<Record<PropSpec['kind'], Parameter['type']>> = {
  number: 'scalar',
  length: 'scalar',
  angle: 'angle',
  point: 'point',
  name: 'label',
  end: 'label',
  color: 'label',
};

/**
 * What `prop` on `node` declares itself to be, or why nothing can.
 *
 * Three ways there is no answer, and each says its own: an imported component
 * describes none of its props, a defined one describes exactly the parameters
 * it declares, and a building block describes a kind that may have no
 * parameter type. One message reciting all three would lead with a case the
 * reader is not in.
 */
function promotable(
  doc: SceneDocument,
  node: DocNode,
  prop: string,
): { type: Parameter['type']; value: unknown } | { refusal: string } {
  const { type } = node;

  // A defined component's props *are* its parameters, so one passed to an
  // instance already has a declared type -- which is how a value handed down
  // to a sub-component is promoted into a parameter of the one holding it.
  if (type.kind === 'defined') {
    const declared = (definitionOf(doc, type.name).parameters ?? []).find(
      ({ name }) => name === prop,
    );

    return declared
      ? {
          type: declared.type,
          value: literalIn(node.props[prop]) ?? declared.default,
        }
      : { refusal: `${type.name} does not take ${prop}.` };
  }

  if (type.kind !== 'core') {
    return {
      refusal:
        `${nodeName(type)} comes from its own module, which does not say ` +
        `what ${prop} is -- so there is no type to declare it at.`,
    };
  }

  const spec = (
    type.component.meta.props as Record<string, PropSpec | undefined>
  )[prop];
  if (!spec) {
    return { refusal: `${nodeName(type)} has no prop called ${prop}.` };
  }

  const promoted = PROMOTED_TYPES[spec.kind];

  return promoted
    ? { type: promoted, value: literalIn(node.props[prop]) ?? spec.default }
    : { refusal: `${spec.label} is not something a parameter can be.` };
}

/**
 * Why `prop` on the node at `path` cannot become a parameter, or `null`.
 */
export function promotionRefusal(
  doc: SceneDocument,
  definition: string,
  path: NodePath,
  prop: string,
): string | null {
  const node = nodeAt(doc, definition, path);
  const held = node.props[prop];
  if (held?.kind === 'parameter') {
    return `${prop} already refers to ${held.name}.`;
  }

  // A computed prop has no literal to carry into a default, so promoting it
  // would declare a parameter at the *component's* default and write a
  // reference over the expression -- a silent scene change, against what this
  // edit promises. Unreachable from the pane, which offers no button beside a
  // computed prop, and a document built in code can still ask.
  if (isOperation(held)) {
    return `${prop} is computed, so there is no value to carry into a default.`;
  }

  const carried = promotable(doc, node, prop);
  if ('refusal' in carried) {
    return carried.refusal;
  }

  if (carried.value === undefined) {
    return `${prop} holds no value to carry into a parameter's default.`;
  }

  // The same check `setParameterDefault` makes, for the same reason: the
  // emitted signature writes the default *at* the declared type, so a value
  // that does not fit emits a module that will not compile. Unreachable from
  // the editor, where a field yields what its kind takes -- and reachable by a
  // document built in code, which is what the refusal below is for too.
  return fitsType(carried.type, carried.value)
    ? null
    : `${JSON.stringify(carried.value)} is not a ${carried.type}, which ` +
        `${prop} would be declared as.`;
}

/**
 * `prop` on the node at `path`, turned into a parameter of `definition` and a
 * reference to it.
 *
 * The parameter's default is what the prop held, so the scene is unchanged:
 * every instance goes on getting that value without passing anything, and the
 * one place it is written moves from the node to the declaration block. What
 * changes is that an instance can now say otherwise.
 *
 * The name comes from the prop, which is the only thing here that knows what
 * the value is *for* -- `docs/issues/0014/06-codegen.md` makes the same
 * argument for a hoisted constant's name.
 */
export function promoteProp(
  doc: SceneDocument,
  definition: string,
  path: NodePath,
  prop: string,
): SceneDocument {
  const refusal = promotionRefusal(doc, definition, path, prop);
  if (refusal) {
    throw new Error(refusal);
  }

  const carried = promotable(doc, nodeAt(doc, definition, path), prop) as {
    type: Parameter['type'];
    value: unknown;
  };
  let name = prop;
  for (
    let n = 2;
    parameterNameRefusal(doc, definition, null, name) !== null;
    n += 1
  ) {
    name = `${prop}${n}`;
  }

  const declared = withParameters(doc, definition, (parameters) => [
    ...parameters,
    { name, type: carried.type, default: carried.value } as Parameter,
  ]);

  return setProp(declared, definition, path, prop, parameterOf(name));
}

/** What `prop` on the node at `path` refers to, when it refers to a parameter. */
function referredParameter(
  doc: SceneDocument,
  definition: string,
  path: NodePath,
  prop: string,
): { name: string; declared: Parameter | undefined } | null {
  const held = nodeAt(doc, definition, path).props[prop];

  return held?.kind === 'parameter'
    ? {
        name: held.name,
        declared: (definitionOf(doc, definition).parameters ?? []).find(
          ({ name }) => name === held.name,
        ),
      }
    : null;
}

/** What each instance of `definition` passes for the parameter `name`. */
function argumentsFor(
  doc: SceneDocument,
  definition: string,
  name: string,
): PropValue[] {
  return doc.definitions.flatMap(({ body }) =>
    everyNode(body).flatMap((node) => {
      const passed = node.props[name];

      return instantiates(node, definition) && passed ? [passed] : [];
    }),
  );
}

/**
 * Whether two prop values read as the same.
 *
 * By what they print as, which is how the tree row and the emitter's constants
 * already decide it: prop values are plain data, so two that stringify alike
 * resolve alike.
 */
function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Why `prop` on the node at `path` cannot go back to a value, or `null`.
 *
 * What demoting writes is the *declaration's* default, which is what the
 * reference resolved to only for instances that pass nothing. For one passing
 * something else it is a value that prop never held, which is what
 * `parameterRemovalRefusal` refuses next door and for the same reason: an edit
 * here does not change the scene without saying so.
 *
 * That is why demoting is safe straight after promoting and not in general --
 * nothing can be passing a parameter that did not exist a moment ago.
 */
export function demotionRefusal(
  doc: SceneDocument,
  definition: string,
  path: NodePath,
  prop: string,
): string | null {
  const referred = referredParameter(doc, definition, path, prop);
  if (!referred) {
    return `${prop} is not a reference.`;
  }

  const { default: value } = referred.declared ?? {};
  if (value === undefined) {
    return `${referred.name} has no default, so there is no value to put here.`;
  }

  const passed = argumentsFor(doc, definition, referred.name).find(
    (held) => !(held.kind === 'literal' && sameValue(held.value, value)),
  );

  return passed
    ? `An instance of ${definition} passes ${referred.name}=` +
        `${shownValueOf(passed)}, which is not the ${JSON.stringify(value)} ` +
        'this would put here.'
    : null;
}

/**
 * A literal node already in `definition` holding this very value object.
 *
 * Identity, not equality: a parameter's default is the object the promoted
 * prop held, so the props that shared it are still holding it, and rejoining
 * them is a statement of fact rather than the guess this document stopped
 * making. Without it a promote and a demote would leave the emitted module
 * with a fourth copy of a value three props name.
 */
function nodeHolding(
  doc: SceneDocument,
  definition: string,
  value: unknown,
): PropValue | undefined {
  if (value === null || typeof value !== 'object') {
    return undefined;
  }

  for (const node of everyNode(definitionOf(doc, definition).body)) {
    for (const held of Object.values(node.props)) {
      if (held.kind === 'literal' && held.value === value) {
        return held;
      }
    }
  }

  return undefined;
}

/**
 * `prop` on the node at `path`, back to the value its parameter defaults to.
 *
 * The parameter stays declared, even where nothing refers to it any more: an
 * unused one is visible in the declaration block and deleting it is a gesture
 * of its own, where a delete folded into this one would take a declaration a
 * person may have instances passing.
 *
 * And the prop rejoins whatever else already holds that value, so a promote
 * followed by a demote leaves the emitted module as it found it.
 */
export function demoteProp(
  doc: SceneDocument,
  definition: string,
  path: NodePath,
  prop: string,
): SceneDocument {
  const refusal = demotionRefusal(doc, definition, path, prop);
  if (refusal) {
    throw new Error(refusal);
  }

  const referred = referredParameter(doc, definition, path, prop)!;
  const { default: value } = referred.declared!;

  return setProp(
    doc,
    definition,
    path,
    prop,
    nodeHolding(doc, definition, value) ?? literalOf(value),
  );
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

  // A reference to a parameter the *enclosing* definition does not declare,
  // which `carriedParameters` therefore cannot copy across. The editor cannot
  // make one -- every reference it writes names a declaration -- but a
  // document built in code can, and extracting it would resolve the name
  // against an empty scope and quietly move whatever the prop placed.
  const declared = new Set(
    (definitionOf(doc, definition).parameters ?? []).map(({ name }) => name),
  );
  for (const { type, props } of everyNode([node])) {
    for (const [prop, held] of Object.entries(props)) {
      const dangling = referencesIn(held).find((name) => !declared.has(name));
      if (dangling !== undefined) {
        return (
          `${nodeName(type)}'s ${prop} refers to ${dangling}, which ` +
          `${definition} does not take, so there is no declaration to carry ` +
          'across. Give it a value first.'
        );
      }
    }
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
 * The parameters an extracted subtree refers to, in the order `definition`
 * declares them.
 *
 * These come with it: the new component declares each, and the instance left
 * behind passes the enclosing definition's parameter of the same name
 * straight through -- so what each resolves to is what it resolved to before,
 * and the scene is unchanged. That is `promoteProp`'s move in the other
 * direction, and it is the reason extracting a parameterised subtree is an
 * ordinary edit rather than a refusal.
 */
function carriedParameters(
  doc: SceneDocument,
  definition: string,
  node: DocNode,
): Parameter[] {
  const referred = new Set(
    everyNode([node]).flatMap(({ props }) =>
      Object.values(props).flatMap((held) => referencesIn(held)),
    ),
  );

  return (definitionOf(doc, definition).parameters ?? []).filter(({ name }) =>
    referred.has(name),
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
  const carried = carriedParameters(doc, definition, node);
  const instance: DocNode = {
    type: { kind: 'defined', name },

    // Threaded, not resolved: the instance passes on whatever its own
    // definition was given, so the new component sees exactly what the
    // subtree saw where it used to sit.
    props: Object.fromEntries(
      carried.map((parameter) => [parameter.name, parameterOf(parameter.name)]),
    ),
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
      {
        name,
        ...(carried.length ? { parameters: carried } : {}),
        body: holds ? [root] : [root, place],
      },
    ],
  };
}
