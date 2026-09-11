import { canContain } from './../react/componentMeta';
import {
  definitionOf,
  insertNode,
  nodeAt,
  placeholderPath,
} from './sceneDocument';
import type {
  ComponentRef,
  DocNode,
  NodePath,
  SceneDocument,
} from './sceneDocument';
import type { Slot } from './../react/componentMeta';

/**
 * Where something added from the library lands: a list of children, a position
 * in it, and what holds that list.
 */
export interface InsertionPoint {
  readonly parent: NodePath;
  readonly index: number;

  /**
   * The rules the list is held to: a frame's; the root's, for a definition's
   * body or for an instance of a component whose place for children is at the
   * top of its body; or `null` for a composite whose own body decides where
   * its children go.
   */
  readonly holder: Slot | 'root' | null;
}

/**
 * The rules a node holds its children to, as `InsertionPoint.holder` has them:
 * a frame's, or those of the place a defined component keeps for its
 * instances' children. `null` for any other node, which, asked of the selected
 * node, means it takes none, and asked of a list's owner, that its own body
 * decides.
 */
function holderOf(doc: SceneDocument, node: DocNode): Slot | 'root' | null {
  if (node.type.kind === 'core') {
    return node.type.component.meta.slot === 'frame' ? 'frame' : null;
  }

  const place =
    node.type.kind === 'defined' ? placeholderPath(doc, node.type.name) : null;
  if (!place || node.type.kind !== 'defined') {
    return null;
  }

  // At the top of the body, the children stand where the instance does; the
  // root's rules are the ones every body is held to.
  return place.length === 1
    ? 'root'
    : holderOf(doc, nodeAt(doc, node.type.name, place.slice(0, -1)));
}

/**
 * Where an addition lands, given what is selected.
 *
 * Inside the selected node when it holds others, after its last child: a
 * frame, or an instance of a component that keeps a place for children. Just
 * after the selected node, among its siblings, when it is anything else. At
 * the end of the body when nothing is.
 */
export function insertionPoint(
  doc: SceneDocument,
  definition: string,
  selected: NodePath | null,
): InsertionPoint {
  if (!selected) {
    return {
      parent: [],
      index: definitionOf(doc, definition).body.length,
      // Every body is held to the root's rules, whichever definition it is.
      // That is what lets an instance of a defined component go wherever a
      // frame can: no body holds a weight or an anchor at its top.
      holder: 'root',
    };
  }

  const node = nodeAt(doc, definition, selected);
  const holder = holderOf(doc, node);
  if (holder) {
    return { parent: selected, index: node.children.length, holder };
  }

  const parent = selected.slice(0, -1);

  return {
    parent,
    index: selected[selected.length - 1]! + 1,
    holder: parent.length
      ? holderOf(doc, nodeAt(doc, definition, parent))
      : 'root',
  };
}

/** Every component the document defines that `name` instantiates, at any depth. */
function definitionsUsedBy(
  doc: SceneDocument,
  name: string,
  used = new Set<string>(),
): Set<string> {
  const visit = (nodes: readonly DocNode[]): void => {
    for (const node of nodes) {
      if (node.type.kind === 'defined' && !used.has(node.type.name)) {
        used.add(node.type.name);
        definitionsUsedBy(doc, node.type.name, used);
      }

      visit(node.children);
    }
  };

  visit(definitionOf(doc, name).body);
  return used;
}

/** Every id these nodes and their children carry. */
function idsIn(nodes: readonly DocNode[]): string[] {
  return nodes.flatMap(({ props, children }) => [
    ...(typeof props.id === 'string' ? [props.id] : []),
    ...idsIn(children),
  ]);
}

/** Every id an instance of `name` would put in the scene. */
function idsNamedBy(doc: SceneDocument, name: string): string[] {
  return [name, ...definitionsUsedBy(doc, name)].flatMap((each) =>
    idsIn(definitionOf(doc, each).body),
  );
}

/**
 * What the expansion of `name` reaches, and how often: each id, and each
 * component the document defines, once for every time the build would reach
 * it -- the question the build asks, rather than where the document writes it.
 */
function expansionCounts(
  doc: SceneDocument,
  name: string,
  counts: Map<string, number> = new Map(),
  stack: readonly string[] = [],
): Map<string, number> {
  // A cycle is refused before this is asked; it is not followed here.
  if (stack.includes(name)) {
    return counts;
  }

  const bump = (key: string): void => {
    counts.set(key, (counts.get(key) ?? 0) + 1);
  };
  const visit = (nodes: readonly DocNode[]): void => {
    for (const node of nodes) {
      if (typeof node.props.id === 'string') {
        bump(`id:${node.props.id}`);
      }

      if (node.type.kind === 'defined') {
        bump(`component:${node.type.name}`);
        expansionCounts(doc, node.type.name, counts, [...stack, name]);
      }

      visit(node.children);
    }
  };

  visit(definitionOf(doc, name).body);
  return counts;
}

/** Every constraint end these nodes and their children name. */
function endsIn(nodes: readonly DocNode[]): string[] {
  return nodes.flatMap((node) => [
    ...(node.type.kind === 'core'
      ? Object.entries(node.type.component.meta.props)
          .filter(([, spec]) => spec.kind === 'end')
          .map(([prop]) => node.props[prop])
          .filter((end): end is string => typeof end === 'string')
      : []),
    ...endsIn(node.children),
  ]);
}

/** The ids a component's constraints name that it does not declare itself. */
function endsOutside(doc: SceneDocument, name: string): string[] {
  const own = new Set(idsNamedBy(doc, name));

  return [name, ...definitionsUsedBy(doc, name)]
    .flatMap((each) => endsIn(definitionOf(doc, each).body))
    .filter((end) => !own.has(end));
}

/**
 * Why `ref` cannot go at `point` in `definition`, or `null` when it can.
 *
 * It checks containment by slot, through `canContain`, and recursion -- not
 * everything a build can refuse. A composite states no slot, and goes wherever
 * a frame could, which holds because every body is held to the root's rules:
 * see `insertionPoint`. A component the document defines
 * cannot go anywhere inside itself, which would recurse without end. And one is
 * refused whose ids would then appear twice in the scene's expansion -- as is a
 * second copy of one whose constraint names a frame outside itself, which
 * would repeat the constraint.
 */
export function refusalOf(
  doc: SceneDocument,
  definition: string,
  point: InsertionPoint,
  ref: ComponentRef,
): string | null {
  if (ref.kind === 'children' && definition === doc.root) {
    return (
      "Children goes in a component's body: the scene has no instances to " +
      'give children to.'
    );
  }

  if (ref.kind === 'children' && placeholderPath(doc, definition)) {
    return `${definition} already has a place for its children.`;
  }

  if (ref.kind === 'defined' && ref.name === definition) {
    return `${ref.name} cannot go inside itself.`;
  }

  if (
    ref.kind === 'defined' &&
    definitionsUsedBy(doc, ref.name).has(definition)
  ) {
    return `${ref.name} cannot go inside ${definition}, which it contains.`;
  }

  if (ref.kind === 'defined') {
    const ids = idsNamedBy(doc, ref.name);
    const outside = endsOutside(doc, ref.name);
    if (ids.length || outside.length) {
      // Asked of the document as it would be, through its expansion: how
      // often the build reaches each id, not where the document writes it.
      const after = insertNode(
        doc,
        definition,
        point.parent,
        point.index,
        newNode(ref),
      );
      for (const root of new Set([doc.root, definition])) {
        const counts = expansionCounts(after, root);
        const where = root === doc.root ? 'the scene' : root;
        const repeated = ids.find((id) => (counts.get(`id:${id}`) ?? 0) > 1);
        if (repeated !== undefined) {
          return (
            `${ref.name} names '${repeated}', which would then appear twice ` +
            `in ${where}: ids are scene-wide.`
          );
        }

        if (outside.length && (counts.get(`component:${ref.name}`) ?? 0) > 1) {
          return (
            `${ref.name} holds a constraint on '${outside[0]}', outside ` +
            `itself: a second ${ref.name} in ${where} would repeat the ` +
            'constraint.'
          );
        }
      }
    }
  }

  const slot = ref.kind === 'core' ? ref.component.meta.slot : 'frame';
  const name =
    ref.kind === 'core'
      ? ref.component.meta.name
      : ref.kind === 'children'
        ? 'Children'
        : ref.name;

  return point.holder === null || canContain(point.holder, slot)
    ? null
    : `${name} has to go inside a frame. Select one to add it there.`;
}

/**
 * A fresh instance of `ref`: its required props at their `initial` values, and
 * nothing else, so every other prop starts at its default.
 *
 * A constraint's ends have no initial -- which two things to join is the
 * person's to pick -- so a new constraint does not build until they are set,
 * and the scene pane says what it needs.
 */
export function newNode(ref: ComponentRef): DocNode {
  const props =
    ref.kind === 'core'
      ? Object.fromEntries(
          Object.entries(ref.component.meta.props)
            .filter(([, spec]) => spec.required && spec.initial !== undefined)
            .map(([name, spec]) => [name, spec.initial]),
        )
      : {};

  return { type: ref, props, children: [] };
}
