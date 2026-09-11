import { canContain } from './../react/componentMeta';
import { definitionOf, nodeAt } from './sceneDocument';
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
   * The slot of the node the list belongs to -- `root` for a definition's body,
   * and `null` for a composite, whose children go wherever its body puts them.
   */
  readonly holder: Slot | 'root' | null;
}

/** A node's slot, when it is a building block that states one. */
function slotOf(node: DocNode): Slot | null {
  return node.type.kind === 'core' ? node.type.component.meta.slot : null;
}

/**
 * Where an addition lands, given what is selected.
 *
 * Inside the selected node when it is a frame, after its last child -- a frame
 * is the one thing that holds others. Just after the selected node, among its
 * siblings, when it is anything else. At the end of the body when nothing is.
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
  if (slotOf(node) === 'frame') {
    return { parent: selected, index: node.children.length, holder: 'frame' };
  }

  const parent = selected.slice(0, -1);

  return {
    parent,
    index: selected[selected.length - 1]! + 1,
    holder: parent.length ? slotOf(nodeAt(doc, definition, parent)) : 'root',
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

/**
 * Why `ref` cannot go at `point` in `definition`, or `null` when it can.
 *
 * It checks containment by slot, through `canContain`, and recursion -- not
 * everything a build can refuse. A composite states no slot, and goes wherever
 * a frame could, which holds because every body is held to the root's rules:
 * see `insertionPoint`. And a component the document
 * defines cannot go anywhere inside itself, which would recurse without end.
 */
export function refusalOf(
  doc: SceneDocument,
  definition: string,
  point: InsertionPoint,
  ref: ComponentRef,
): string | null {
  if (ref.kind === 'defined' && ref.name === definition) {
    return `${ref.name} cannot go inside itself.`;
  }

  if (
    ref.kind === 'defined' &&
    definitionsUsedBy(doc, ref.name).has(definition)
  ) {
    return `${ref.name} cannot go inside ${definition}, which it contains.`;
  }

  const slot = ref.kind === 'core' ? ref.component.meta.slot : 'frame';
  const name = ref.kind === 'core' ? ref.component.meta.name : ref.name;

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
