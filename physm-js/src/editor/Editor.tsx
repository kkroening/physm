import './Editor.css';
import PropertiesPane from './PropertiesPane';
import SceneView from './../react/SceneView';
import buildScene from './../react/buildScene';
import coreComponents from './../react/coreComponents';
import emitScene from './emitScene';
import getViewXformMatrix from './../getViewXformMatrix';
import starterDocument from './starterDocument';
import useElementSize from './../useElementSize';
import {
  definitionOf,
  elementOf,
  insertNode,
  moveNode,
  nodeAt,
  removeNode,
} from './sceneDocument';
import { insertionPoint, newNode, refusalOf } from './insertion';
import { useEffect, useMemo, useRef, useState } from 'react';
import type CoreScene from './../Scene';
import type { StateMap } from './../Frame';
import type {
  ComponentRef,
  CoreComponent,
  DocNode,
  NodePath,
  SceneDocument,
} from './sceneDocument';
import type { InsertionPoint } from './insertion';
import type { ReactElement } from 'react';
import type { Selection } from './PropertiesPane';

/** Pixels per scene unit. */
const VIEW_SCALE = 18;

/** The order the library shelves its categories in. */
const CATEGORIES = ['Frames', 'Shapes', 'Physics', 'Constraints'] as const;

/** A node's tag, as the tree and library name it. */
function tagOf(ref: ComponentRef): string {
  return ref.kind === 'core' ? ref.component.meta.name : ref.name;
}

/**
 * What a tree row shows, dimmed, after the tag.
 *
 * The props a building block's metadata marks as a summary, and nothing else --
 * a display hint, carrying no claim about which node this is.
 */
function summaryOf(node: DocNode): string {
  if (node.type.kind !== 'core') {
    return '';
  }

  return Object.entries(node.type.component.meta.props)
    .filter(([name, spec]) => spec.summary && node.props[name] !== undefined)
    .map(([name]) => `${name}=${JSON.stringify(node.props[name])}`)
    .join(' ');
}

/** How many nodes share the list at `parent` -- `[]` for the body. */
function siblingCount(
  doc: SceneDocument,
  definition: string,
  parent: NodePath,
): number {
  return parent.length
    ? nodeAt(doc, definition, parent).children.length
    : definitionOf(doc, definition).body.length;
}

/** What the tree can do to a node: select it, or change the structure there. */
interface TreeActions {
  readonly onSelect: (path: NodePath) => void;
  readonly onDeselect: () => void;
  readonly onDelete: (path: NodePath) => void;
  readonly onMove: (path: NodePath, by: -1 | 1) => void;
}

/**
 * A tree row's React key: its index, or `$` and its document key.
 *
 * React holds every key as a string, so an unkeyed row at index 0 and a sibling
 * keyed `"0"` would otherwise share one -- the same rule `segmentOf` in
 * `buildScene` applies to frame ids.
 */
function rowKey(node: DocNode, index: number): string {
  return node.key === undefined ? String(index) : `$${node.key}`;
}

/** One node of the tree, and everything under it. */
function TreeRow({
  node,
  path,
  selected,
  ...actions
}: TreeActions & {
  node: DocNode;
  path: NodePath;
  /** The selected node's path, joined -- `null` when none is. */
  selected: string | null;
}): ReactElement {
  const summary = summaryOf(node);
  const rowRef = useRef<HTMLDivElement>(null);
  const isSelected = selected === path.join('.');

  // Keyboard focus follows the selection while it is in the tree. Rows are
  // keyed by position, so after a move the focused row shows a different node,
  // and the next keystroke would act on that one instead.
  useEffect(() => {
    const row = rowRef.current;
    if (
      isSelected &&
      row &&
      row !== document.activeElement &&
      row.closest('[role="tree"]')?.contains(document.activeElement)
    ) {
      row.focus();
    }
  }, [isSelected]);

  return (
    <li
      role="treeitem"
      aria-selected={isSelected}
      aria-expanded={node.children.length ? true : undefined}
    >
      <div
        ref={rowRef}
        className="editor__row"
        data-kind={node.type.kind}
        tabIndex={0}
        onClick={() => actions.onSelect(path)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            actions.onSelect(path);
          } else if (event.key === 'Escape') {
            event.preventDefault();
            actions.onDeselect();
          } else if (event.key === 'Delete' || event.key === 'Backspace') {
            event.preventDefault();
            actions.onDelete(path);
            // Off the row: it now shows the next node, which a second press
            // would delete as well. The tree takes focus and ignores Delete.
            event.currentTarget.closest<HTMLElement>('[role="tree"]')?.focus();
          } else if (
            event.altKey &&
            (event.key === 'ArrowUp' || event.key === 'ArrowDown')
          ) {
            event.preventDefault();
            actions.onMove(path, event.key === 'ArrowUp' ? -1 : 1);
          }
        }}
      >
        <span className="editor__disclosure">
          {node.children.length ? '▾' : ''}
        </span>
        <span className="editor__tag">{tagOf(node.type)}</span>
        {summary ? <span className="editor__summary">{summary}</span> : null}
      </div>
      {node.children.length ? (
        <ul role="group">
          {node.children.map((child, index) => (
            <TreeRow
              node={child}
              path={[...path, index]}
              selected={selected}
              {...actions}
              key={rowKey(child, index)}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

/** The focused component's authored tree, and the tools that reshape it. */
function TreePane({
  doc,
  focus,
  selectedPath,
  ...actions
}: TreeActions & {
  doc: SceneDocument;
  focus: string;
  selectedPath: NodePath | null;
}): ReactElement {
  const { body } = definitionOf(doc, focus);
  const index = selectedPath ? selectedPath[selectedPath.length - 1]! : null;
  const count = selectedPath
    ? siblingCount(doc, focus, selectedPath.slice(0, -1))
    : 0;
  const onSelected = (action: (path: NodePath) => void) => (): void => {
    if (selectedPath) {
      action(selectedPath);
    }
  };

  return (
    <section
      className="editor__tree"
      aria-label="Tree"
      onClick={(event) => {
        // A click on the tree's empty space, not on a row or a tool.
        const target = event.target as HTMLElement;
        if (
          target === event.currentTarget ||
          target.getAttribute('role') === 'tree'
        ) {
          actions.onDeselect();
        }
      }}
    >
      <div className="editor__heading editor__toolbar">
        <span>{focus}</span>
        <span className="editor__actions">
          <button
            type="button"
            aria-label="Move up"
            title="Move up (Alt+↑)"
            disabled={index === null || index === 0}
            onClick={onSelected((path) => actions.onMove(path, -1))}
          >
            ↑
          </button>
          <button
            type="button"
            aria-label="Move down"
            title="Move down (Alt+↓)"
            disabled={index === null || index === count - 1}
            onClick={onSelected((path) => actions.onMove(path, 1))}
          >
            ↓
          </button>
          <button
            type="button"
            title="Delete (Del)"
            disabled={!selectedPath}
            onClick={onSelected(actions.onDelete)}
          >
            Delete
          </button>
        </span>
      </div>
      <ul
        role="tree"
        aria-label={focus}
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && event.target === event.currentTarget) {
            actions.onDeselect();
          }
        }}
      >
        {body.map((node, at) => (
          <TreeRow
            node={node}
            path={[at]}
            selected={selectedPath ? selectedPath.join('.') : null}
            {...actions}
            key={rowKey(node, at)}
          />
        ))}
      </ul>
    </section>
  );
}

/**
 * A scene and the state it starts in, or the reason there is not one.
 *
 * The initial state is computed here, inside the `try`, rather than while
 * drawing: solving for consistent initial velocities fails on a rig whose
 * constraints repeat each other or sit at a singular pose, and a throw from
 * render would take the whole editor down with it.
 */
function useBuiltScene(
  doc: SceneDocument,
  focus: string,
): { scene: CoreScene; initial: StateMap } | { error: string } {
  return useMemo(() => {
    try {
      const scene = buildScene(elementOf(doc, focus));

      return { scene, initial: scene.getInitialStateMap() };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }, [doc, focus]);
}

/**
 * The focused component, drawn at its authored pose.
 *
 * A scene that fails to build shows why instead of taking the editor down with
 * it: a half-made rig is the normal state of a document being edited, and the
 * message is the thing the person needs to see.
 */
function ScenePane({
  doc,
  focus,
}: {
  doc: SceneDocument;
  focus: string;
}): ReactElement {
  const svgRef = useRef<SVGSVGElement>(null);
  const size = useElementSize(svgRef);
  const built = useBuiltScene(doc, focus);
  const xformMatrix = getViewXformMatrix([0, 0], VIEW_SCALE, size);

  return (
    <section className="editor__scene" aria-label="Scene">
      <svg ref={svgRef}>
        {'scene' in built ? (
          <SceneView
            scene={built.scene}
            stateMap={built.initial}
            xformMatrix={xformMatrix}
          />
        ) : null}
      </svg>
      {'error' in built ? (
        <p className="editor__error" role="alert">
          {built.error}
        </p>
      ) : null}
    </section>
  );
}

/** The whole module, as it would be written to a file. */
function CodePane({ doc }: { doc: SceneDocument }): ReactElement {
  const source = useMemo(() => {
    try {
      return emitScene(doc).source;
    } catch (error) {
      return `// ${error instanceof Error ? error.message : String(error)}`;
    }
  }, [doc]);

  return (
    <section className="editor__code" aria-label="Code">
      <pre>
        <code>{source}</code>
      </pre>
    </section>
  );
}

/** Where an addition would land, in words. */
function placementOf(
  doc: SceneDocument,
  focus: string,
  selectedPath: NodePath | null,
  point: InsertionPoint,
): string {
  if (!selectedPath) {
    return `Adds to the end of ${focus}.`;
  }

  const tag = tagOf(nodeAt(doc, focus, selectedPath).type);

  return point.parent.length === selectedPath.length
    ? `Adds inside the selected ${tag}.`
    : `Adds after the selected ${tag}.`;
}

/**
 * Everything that can be added: building blocks, and this document's own.
 *
 * What cannot go where an addition would land is shown but disabled, saying
 * why -- a library that hid it would leave the person guessing where it went.
 */
function LibraryPane({
  doc,
  focus,
  point,
  placement,
  onAdd,
}: {
  doc: SceneDocument;
  focus: string;
  point: InsertionPoint;
  placement: string;
  onAdd: (ref: ComponentRef) => void;
}): ReactElement {
  const defined = doc.definitions.filter(({ name }) => name !== doc.root);
  const entry = (ref: ComponentRef, description?: string): ReactElement => {
    const refusal = refusalOf(doc, focus, point, ref);

    return (
      <li key={tagOf(ref)}>
        <button
          type="button"
          data-kind={ref.kind}
          disabled={refusal !== null}
          title={refusal ?? description}
          onClick={() => onAdd(ref)}
        >
          {tagOf(ref)}
        </button>
      </li>
    );
  };

  return (
    <section className="editor__library" aria-label="Library">
      <p className="editor__hint editor__placement">{placement}</p>
      {CATEGORIES.map((category) => (
        <div className="editor__shelf" key={category}>
          <div className="editor__heading">{category}</div>
          <ul>
            {coreComponents
              .filter(({ meta }) => meta.category === category)
              .map((component) =>
                entry(
                  { kind: 'core', component: component as CoreComponent },
                  component.meta.description,
                ),
              )}
          </ul>
        </div>
      ))}
      {defined.length ? (
        <div className="editor__shelf">
          <div className="editor__heading">This scene</div>
          <ul>{defined.map(({ name }) => entry({ kind: 'defined', name }))}</ul>
        </div>
      ) : null}
    </section>
  );
}

/**
 * The scene editor: a document, shown five ways.
 *
 * The tab bar, code pane and library are **global** -- they show the whole
 * module whatever is focused. The tree, scene and properties panes are the
 * **component editor**, and follow the focused tab. See
 * `docs/issues/0014/03-focus.md`.
 */
export default function Editor({
  initialDocument,
}: {
  initialDocument?: SceneDocument;
}): ReactElement {
  const [doc, setDoc] = useState<SceneDocument>(
    () => initialDocument ?? starterDocument(),
  );
  const [selection, setSelection] = useState<Selection | null>(null);
  const focus = doc.root;
  const selectedPath = selection?.definition === focus ? selection.path : null;
  const point = insertionPoint(doc, focus, selectedPath);

  /** Replace the document, and select `path` in it -- or nothing. */
  const change = (next: SceneDocument, path: NodePath | null): void => {
    setDoc(next);
    setSelection(path ? { definition: focus, path } : null);
  };

  const actions: TreeActions = {
    onSelect: (path) => setSelection({ definition: focus, path }),
    onDeselect: () => setSelection(null),
    // Nothing is selected afterwards: the node is gone, and jumping to a
    // neighbour would move the selection somewhere nobody asked for.
    onDelete: (path) => change(removeNode(doc, focus, path), null),
    onMove: (path, by) => {
      const parent = path.slice(0, -1);
      const index = path[path.length - 1]! + by;
      if (index >= 0 && index < siblingCount(doc, focus, parent)) {
        change(moveNode(doc, focus, path, parent, index), [...parent, index]);
      }
    },
  };

  return (
    <div className="editor">
      <nav className="editor__tabs" role="tablist" aria-label="Open components">
        <button role="tab" aria-selected="true" type="button">
          {focus}
        </button>
      </nav>
      <CodePane doc={doc} />
      <div className="editor__center">
        <div className="editor__workspace">
          <TreePane
            doc={doc}
            focus={focus}
            selectedPath={selectedPath}
            {...actions}
          />
          <ScenePane doc={doc} focus={focus} />
        </div>
        <LibraryPane
          doc={doc}
          focus={focus}
          point={point}
          placement={placementOf(doc, focus, selectedPath, point)}
          onAdd={(ref) =>
            change(
              insertNode(doc, focus, point.parent, point.index, newNode(ref)),
              [...point.parent, point.index],
            )
          }
        />
      </div>
      <PropertiesPane doc={doc} selection={selection} onChange={setDoc} />
    </div>
  );
}
