import './Editor.css';
import PropertiesPane from './PropertiesPane';
import SceneView from './../react/SceneView';
import buildScene from './../react/buildScene';
import coreComponents from './../react/coreComponents';
import emitScene from './emitScene';
import getViewXformMatrix from './../getViewXformMatrix';
import starterDocument from './starterDocument';
import useElementSize from './../useElementSize';
import useSimulation from './useSimulation';
import {
  definitionOf,
  elementOf,
  extractComponent,
  extractionRefusal,
  insertNode,
  moveNode,
  nameRefusal,
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

/** What the tree can do to a node: select it, open it, or reshape around it. */
interface TreeActions {
  readonly onSelect: (path: NodePath) => void;
  readonly onDeselect: () => void;
  readonly onOpen: (name: string) => void;
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
  const { type } = node;

  return (
    <li
      role="treeitem"
      aria-selected={isSelected}
      aria-expanded={node.children.length ? true : undefined}
    >
      <div
        ref={rowRef}
        className="editor__row"
        data-kind={type.kind}
        tabIndex={0}
        title={
          type.kind === 'defined'
            ? `Double-click to open ${type.name}`
            : undefined
        }
        onClick={() => actions.onSelect(path)}
        onDoubleClick={() => {
          // Only a component this document defines has a body to open.
          if (type.kind === 'defined') {
            actions.onOpen(type.name);
          }
        }}
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
        <span className="editor__tag">{tagOf(type)}</span>
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

/**
 * Name the selected node's new component, and extract it.
 *
 * The name is checked as it is typed, and the reason a name will not do is
 * shown beside it -- a building block's name, another component's, a global the
 * generated module would shadow.
 */
function ExtractForm({
  doc,
  onExtract,
  onCancel,
}: {
  doc: SceneDocument;
  onExtract: (name: string) => void;
  onCancel: () => void;
}): ReactElement {
  const [name, setName] = useState('');
  const refusal = nameRefusal(doc, name);

  return (
    <form
      className="editor__extract"
      onSubmit={(event) => {
        event.preventDefault();
        if (!refusal) {
          onExtract(name);
        }
      }}
    >
      <input
        type="text"
        aria-label="Component name"
        placeholder="Component name"
        value={name}
        aria-invalid={name !== '' && refusal !== null}
        // Opened by a click on Extract, so the name is the next thing typed.
        autoFocus
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            onCancel();
          }
        }}
      />
      <button type="submit" disabled={refusal !== null}>
        Extract
      </button>
      <button type="button" onClick={onCancel}>
        Cancel
      </button>
      {name !== '' && refusal ? (
        <p className="editor__hint" role="status">
          {refusal}
        </p>
      ) : null}
    </form>
  );
}

/** The focused component's authored tree, and the tools that reshape it. */
function TreePane({
  doc,
  focus,
  selectedPath,
  onExtract,
  ...actions
}: TreeActions & {
  doc: SceneDocument;
  focus: string;
  selectedPath: NodePath | null;
  onExtract: (path: NodePath, name: string) => void;
}): ReactElement {
  // The path the name is being typed for: the form shows only while that is
  // still the selection, and a selection made in the tree clears it.
  const [naming, setNaming] = useState<string | null>(null);
  const selectedKey = selectedPath ? selectedPath.join('.') : null;
  const extractRefusal = selectedPath
    ? extractionRefusal(doc, focus, selectedPath)
    : null;
  const rowActions: TreeActions = {
    ...actions,
    onSelect: (path) => {
      setNaming(null);
      actions.onSelect(path);
    },
    onDeselect: () => {
      setNaming(null);
      actions.onDeselect();
    },
  };
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
          rowActions.onDeselect();
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
            aria-label="Extract to component"
            title={extractRefusal ?? 'Extract to component'}
            disabled={!selectedPath || extractRefusal !== null}
            onClick={() => setNaming(selectedKey)}
          >
            Extract
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
      {naming !== null && naming === selectedKey && selectedPath ? (
        <ExtractForm
          doc={doc}
          onExtract={(name) => {
            setNaming(null);
            onExtract(selectedPath, name);
          }}
          onCancel={() => setNaming(null)}
        />
      ) : null}
      <ul
        role="tree"
        aria-label={focus}
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && event.target === event.currentTarget) {
            rowActions.onDeselect();
          }
        }}
      >
        {body.map((node, at) => (
          <TreeRow
            node={node}
            path={[at]}
            selected={selectedPath ? selectedPath.join('.') : null}
            {...rowActions}
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
 * The focused component, drawn at its authored pose -- or, on the scene's own
 * tab, running.
 *
 * Play runs the whole scene, never a component on its own. Page 8 of
 * `docs/issues/0014` makes the simulation the module's, and what a component
 * would do with no world around it is a question it leaves open. So a
 * component's tab draws it as authored, and the scene's run waits for its tab.
 *
 * A scene that fails to build shows why instead of taking the editor down with
 * it: a half-made rig is the normal state of a document being edited, and the
 * message is the thing the person needs to see.
 */
function ScenePane({
  doc,
  focus,
  structure,
}: {
  doc: SceneDocument;
  focus: string;
  /** How many structural edits there have been -- see `useSimulation`. */
  structure: number;
}): ReactElement {
  const svgRef = useRef<SVGSVGElement>(null);
  const size = useElementSize(svgRef);
  const built = useBuiltScene(doc, focus);
  const playable = focus === doc.root;
  const simulation = useSimulation(
    playable && 'scene' in built ? built : null,
    structure,
  );
  const xformMatrix = getViewXformMatrix([0, 0], VIEW_SCALE, size);
  const failure = 'error' in built ? built.error : simulation.error;

  return (
    <section className="editor__scene" aria-label="Scene">
      <svg ref={svgRef}>
        {'scene' in built ? (
          <SceneView
            scene={built.scene}
            stateMap={simulation.stateMap ?? built.initial}
            xformMatrix={xformMatrix}
          />
        ) : null}
      </svg>
      <div className="editor__playback">
        {playable ? null : (
          <p className="editor__hint">
            Play runs the whole scene: open {doc.root} to play it.
          </p>
        )}
        <button
          type="button"
          disabled={!playable || 'error' in built}
          onClick={simulation.playing ? simulation.pause : simulation.play}
        >
          {simulation.playing ? 'Pause' : 'Play'}
        </button>
        <button
          type="button"
          disabled={!playable || !simulation.started}
          onClick={simulation.reset}
        >
          Reset
        </button>
      </div>
      {failure ? (
        <p className="editor__error" role="alert">
          {failure}
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
  const [tabs, setTabs] = useState<readonly string[]>(() => [doc.root]);
  const [focus, setFocus] = useState(doc.root);
  const [selection, setSelection] = useState<Selection | null>(null);

  // Counts structural edits, which restart a run where a prop edit carries it
  // over. Each call has to come with a new document: a count that moves with no
  // new scene leaves the run's stamp behind, and the next prop edit would start
  // the run over.
  const [structure, setStructure] = useState(0);
  const restructure = (): void => setStructure((count) => count + 1);
  const selectedPath = selection?.definition === focus ? selection.path : null;
  const point = insertionPoint(doc, focus, selectedPath);

  /** Replace the document, and select `path` in it -- or nothing. */
  const change = (next: SceneDocument, path: NodePath | null): void => {
    setDoc(next);
    restructure();
    setSelection(path ? { definition: focus, path } : null);
  };

  /** Focus a component, opening a tab for it if it has none. */
  const open = (name: string): void => {
    setTabs((open) => (open.includes(name) ? open : [...open, name]));
    setFocus(name);
    setSelection(null);
  };

  /** Close a tab; the scene's own tab stays. */
  const close = (name: string): void => {
    const at = tabs.indexOf(name);
    setTabs(tabs.filter((tab) => tab !== name));
    if (focus === name) {
      setFocus(tabs[at - 1] ?? doc.root);
      setSelection(null);
    }
  };

  const actions: TreeActions = {
    onSelect: (path) => setSelection({ definition: focus, path }),
    onDeselect: () => setSelection(null),
    onOpen: open,
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
        {tabs.map((name) => (
          <span className="editor__tab" key={name}>
            <button
              role="tab"
              type="button"
              aria-selected={name === focus}
              onClick={() => {
                setFocus(name);
                setSelection(null);
              }}
            >
              {name}
            </button>
            {name === doc.root ? null : (
              <button
                type="button"
                className="editor__close"
                aria-label={`Close ${name}`}
                onClick={() => close(name)}
              >
                ×
              </button>
            )}
          </span>
        ))}
      </nav>
      <CodePane doc={doc} />
      <div className="editor__center">
        <div className="editor__workspace">
          <TreePane
            // A fresh pane per component, so a half-typed name for an
            // extraction does not follow the focus to another one.
            key={focus}
            doc={doc}
            focus={focus}
            selectedPath={selectedPath}
            onExtract={(path, name) => {
              setDoc(extractComponent(doc, focus, path, name));
              open(name);
              restructure();
            }}
            {...actions}
          />
          <ScenePane doc={doc} focus={focus} structure={structure} />
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
      <PropertiesPane
        doc={doc}
        selection={selection}
        onChange={setDoc}
        onOpen={open}
      />
    </div>
  );
}
