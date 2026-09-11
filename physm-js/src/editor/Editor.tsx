import './Editor.css';
import * as vec3 from './../Vec3';
import Frame from './../Frame';
import Gizmos from './Gizmos';
import ParentAxes from './ParentAxes';
import PropertiesPane from './PropertiesPane';
import SceneView from './../react/SceneView';
import buildScene from './../react/buildScene';
import coreComponents from './../react/coreComponents';
import emitScene, { rangeKey } from './emitScene';
import getViewXformMatrix from './../getViewXformMatrix';
import hitsAt from './hitsAt';
import movedPosition, { placedPosition } from './movedPosition';
import placeGizmos from './placeGizmos';
import scrollTopFor from './scrollTopFor';
import snapPoints, { nearestSnap } from './snapPoints';
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
  setProp,
} from './sceneDocument';
import { historyOf, recorded, redone, undone } from './history';
import { insertionPoint, newNode, refusalOf } from './insertion';
import { useEffect, useMemo, useRef, useState } from 'react';
import type CoreScene from './../Scene';
import type Decal from './../Decal';
import type { StateMap } from './../Frame';
import type {
  ComponentRef,
  CoreComponent,
  DocNode,
  ElementOrigin,
  NodePath,
  SceneDocument,
} from './sceneDocument';
import type { History, Step } from './history';
import type { InsertionPoint } from './insertion';
import type { Mat3 } from './../Mat3';
import type { MouseEvent, ReactElement } from 'react';
import type { ScreenPoint } from './placeGizmos';
import type { Selection } from './PropertiesPane';
import type { Trail } from './../react/buildScene';
import type { Vec3 } from './../Vec3';

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

/** The keys that move the focus between rows, rather than act on one. */
const NAVIGATION = new Set([
  'ArrowUp',
  'ArrowDown',
  'Home',
  'End',
  'ArrowLeft',
  'ArrowRight',
]);

/**
 * Whether a key came without Alt, Ctrl or Meta. Held with one of those, an
 * arrow is the browser's -- Back and Forward, say -- not the tree's.
 */
function plainKey(event: {
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}): boolean {
  return !(event.altKey || event.ctrlKey || event.metaKey);
}

/**
 * The row a navigation key moves the focus to from `item`, or `null` where
 * there is none: Up and Down to the row above and below, Home and End to the
 * first and last, Right into a node's first child and Left out to its parent.
 * The tree never collapses, so Right and Left only ever move.
 */
function rowAfter(item: HTMLElement, key: string): HTMLElement | null {
  const rows = [
    ...(item
      .closest('[role="tree"]')
      ?.querySelectorAll<HTMLElement>('[role="treeitem"]') ?? []),
  ];
  const at = rows.indexOf(item);

  switch (key) {
    case 'ArrowUp':
      return rows[at - 1] ?? null;
    case 'ArrowDown':
      return rows[at + 1] ?? null;
    case 'Home':
      return rows[0] ?? null;
    case 'End':
      return rows[rows.length - 1] ?? null;
    case 'ArrowRight':
      return item.querySelector<HTMLElement>('[role="treeitem"]');
    case 'ArrowLeft':
      return (
        item.parentElement?.closest<HTMLElement>('[role="treeitem"]') ?? null
      );
    default:
      return null;
  }
}

/** How long a pause between keys starts a new type-ahead search, in ms. */
const TYPE_AHEAD_PAUSE = 500;

/** Whether a search is one letter, typed once or again and again. */
function oneLetter(text: string): boolean {
  return [...text].every((letter) => letter === text.charAt(0));
}

/**
 * The row type-ahead moves the focus to: the first from `from` on, round to the
 * top, whose name starts with `text` -- or, for one letter typed again and
 * again, with that letter.
 */
function rowStarting(
  rows: readonly HTMLElement[],
  from: number,
  text: string,
): HTMLElement | null {
  const search = (oneLetter(text) ? text.charAt(0) : text).toLowerCase();

  return (
    [...rows.slice(from), ...rows.slice(0, from)].find((row) =>
      (row.getAttribute('aria-label') ?? '').toLowerCase().startsWith(search),
    ) ?? null
  );
}

/** Every row's key -- its path, joined -- in the order the tree draws them. */
function rowKeys(nodes: readonly DocNode[], parent: NodePath = []): string[] {
  return nodes.flatMap((node, index) => {
    const path = [...parent, index];

    return [path.join('.'), ...rowKeys(node.children, path)];
  });
}

/** One node of the tree, and everything under it. */
function TreeRow({
  node,
  path,
  selected,
  tabbable,
  onFocusRow,
  ...actions
}: TreeActions & {
  node: DocNode;
  path: NodePath;
  /** The selected node's path, joined -- `null` when none is. */
  selected: string | null;

  /** The one row Tab reaches, by its path joined: see `TreePane`. */
  tabbable: string;
  onFocusRow: (key: string) => void;
}): ReactElement {
  const summary = summaryOf(node);
  const itemRef = useRef<HTMLLIElement>(null);
  const key = path.join('.');
  const isSelected = selected === key;

  // Keyboard focus follows the selection while it is in the tree. Rows are
  // keyed by position, so after a move the focused row shows a different node,
  // and the next keystroke would act on that one instead.
  useEffect(() => {
    const item = itemRef.current;
    if (
      isSelected &&
      item &&
      item !== document.activeElement &&
      item.closest('[role="tree"]')?.contains(document.activeElement)
    ) {
      item.focus();
    }
  }, [isSelected]);
  const { type } = node;

  return (
    <li
      ref={itemRef}
      role="treeitem"
      aria-selected={isSelected}
      aria-expanded={node.children.length ? true : undefined}
      aria-label={summary ? `${tagOf(type)} ${summary}` : tagOf(type)}
      tabIndex={tabbable === key ? 0 : -1}
      onFocus={(event) => {
        if (event.target === event.currentTarget) {
          onFocusRow(key);
        }
      }}
      onKeyDown={(event) => {
        // A key reaches every row around the one it was pressed in, too, and
        // only that row acts on it.
        if (
          (event.target as HTMLElement).closest('[role="treeitem"]') !==
          event.currentTarget
        ) {
          return;
        }

        if (
          event.altKey &&
          (event.key === 'ArrowUp' || event.key === 'ArrowDown')
        ) {
          event.preventDefault();
          actions.onMove(path, event.key === 'ArrowUp' ? -1 : 1);
        } else if (plainKey(event) && NAVIGATION.has(event.key)) {
          event.preventDefault();
          rowAfter(event.currentTarget, event.key)?.focus();
        } else if (event.key === 'Enter' || event.key === ' ') {
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
        }
      }}
    >
      <div
        className="editor__row"
        data-kind={type.kind}
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
      >
        <span className="editor__disclosure" aria-hidden="true">
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
              tabbable={tabbable}
              onFocusRow={onFocusRow}
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
  // still the selection, and a new selection clears it -- one made in the tree,
  // or by a click in the scene.
  const [naming, setNaming] = useState<string | null>(null);
  const selectedKey = selectedPath ? selectedPath.join('.') : null;

  if (naming !== null && naming !== selectedKey) {
    setNaming(null);
  }

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

  // The row the focus is in, while it is in the tree. It is the Tab stop, so
  // Shift+Tab leaves the tree from wherever the arrows took the focus. It is
  // forgotten when the focus leaves, so Tab back in lands on the selection --
  // or the first row -- as the ARIA tree pattern has it; in this editor the
  // selection is also what the properties pane edits.
  const [focused, setFocused] = useState<string | null>(null);

  // What has been typed for type-ahead, and when the last key of it came.
  const typed = useRef({ text: '', at: 0 });

  /** Move the focus to the row whose name starts with what has been typed. */
  const typeAhead = (
    tree: HTMLElement,
    target: HTMLElement,
    key: string,
  ): void => {
    const now = Date.now();
    const text =
      now - typed.current.at > TYPE_AHEAD_PAUSE
        ? key
        : typed.current.text + key;
    typed.current = { text, at: now };
    const rows = [...tree.querySelectorAll<HTMLElement>('[role="treeitem"]')];
    const item = target.closest<HTMLElement>('[role="treeitem"]');

    // From the row after the focused one for one letter, or the same again,
    // and from the focused row itself while a longer search still fits it.
    // With the focus on the tree itself, as after a delete, from the row Tab
    // would reach, where the arrows take up too.
    const from = item
      ? rows.indexOf(item) + (oneLetter(text) ? 1 : 0)
      : Math.max(
          rows.findIndex((row) => row.tabIndex === 0),
          0,
        );
    rowStarting(rows, from, text)?.focus();
  };
  const keys = rowKeys(body);
  const tabbable =
    (focused !== null && keys.includes(focused) ? focused : null) ??
    selectedKey ??
    keys[0] ??
    '';
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
        onBlur={(event) => {
          // Out of the tree altogether, not from one row to another.
          if (
            !event.currentTarget.contains(event.relatedTarget as Node | null)
          ) {
            setFocused(null);
          }
        }}
        onKeyDown={(event) => {
          // A letter, wherever the focus is in the tree, moves it to a row
          // named for what has been typed. Space is not one: it selects.
          if (event.key.length === 1 && event.key !== ' ' && plainKey(event)) {
            event.preventDefault();
            typeAhead(
              event.currentTarget,
              event.target as HTMLElement,
              event.key,
            );
            return;
          }

          if (event.target !== event.currentTarget) {
            return;
          }

          if (event.key === 'Escape') {
            rowActions.onDeselect();
          } else if (plainKey(event) && NAVIGATION.has(event.key)) {
            // The focus is on the tree itself, as after a delete: take up the
            // row Tab would reach.
            event.preventDefault();
            event.currentTarget
              .querySelector<HTMLElement>('[role="treeitem"][tabindex="0"]')
              ?.focus();
          }
        }}
      >
        {body.map((node, at) => (
          <TreeRow
            node={node}
            path={[at]}
            selected={selectedPath ? selectedPath.join('.') : null}
            tabbable={tabbable}
            onFocusRow={setFocused}
            {...rowActions}
            key={rowKey(node, at)}
          />
        ))}
      </ul>
    </section>
  );
}

/** A built scene, and the way back from what it draws to the node that wrote it. */
interface Built {
  readonly scene: CoreScene;
  readonly initial: StateMap;

  /** The focused body's node nearest to what built a frame or decal. */
  readonly authoredPathOf: (built: Frame | Decal) => NodePath | null;

  /** The focused body's node that built a frame or decal itself, if one did. */
  readonly ownPathOf: (built: Frame | Decal) => NodePath | null;
}

/**
 * The focused body's node nearest to what built something: the last element on
 * its trail that the focused body wrote. A frame inside a component's instance
 * leads back to the instance, since that is the node a person can act on.
 */
function authoredPathOf(
  trail: Trail,
  origins: WeakMap<object, ElementOrigin>,
  focus: string,
): NodePath | null {
  const authored = trail
    .map((element) => origins.get(element))
    .filter((origin) => origin?.definition === focus);

  return authored[authored.length - 1]?.path ?? null;
}

/**
 * The focused body's node that built something itself: the last element on its
 * trail, if the focused body wrote it. `null` for what a component's instance
 * built, which has no node here to write to.
 */
function ownPathOf(
  trail: Trail,
  origins: WeakMap<object, ElementOrigin>,
  focus: string,
): NodePath | null {
  const origin = origins.get(trail[trail.length - 1] ?? {});

  return origin?.definition === focus ? origin.path : null;
}

/**
 * Whether a drawn pose is the one the code builds: every frame at its initial
 * coordinate, as before a run and again after Reset.
 */
function atAuthoredPose(stateMap: StateMap, initial: StateMap): boolean {
  return [...initial].every(([id, [q]]) => stateMap.get(id)?.[0] === q);
}

/** A drag under way in the scene pane. */
interface Drag {
  readonly path: NodePath;

  /** The document and tab the drag began in, which every move rewrites. */
  readonly doc: SceneDocument;
  readonly definition: string;

  /** The node's `position` when the drag began, and the transform it is read in. */
  readonly position: Vec3;
  readonly parentXform: Mat3;

  /** Where the drag began, in the pane's own coordinates. */
  readonly from: ScreenPoint;

  /** Where the frame's origin was then, and the points it can snap to. */
  readonly origin: ScreenPoint;
  readonly targets: readonly ScreenPoint[];

  /** Names the drag to the history, so all of it is one step. */
  readonly field: string;
  moved: boolean;
}

/**
 * How near a click must land to the last one, in pixels, to count as clicking
 * the same place again.
 */
const SAME_PLACE = 3;

/** The nodes a click's hits lead back to, each once, in the order hit. */
function distinctPaths(paths: readonly (NodePath | null)[]): NodePath[] {
  const byKey = new Map<string, NodePath>();
  for (const path of paths) {
    if (path && !byKey.has(path.join('.'))) {
      byKey.set(path.join('.'), path);
    }
  }

  return [...byKey.values()];
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
): Built | { error: string } {
  return useMemo(() => {
    try {
      const origins = new WeakMap<object, ElementOrigin>();
      const trails = new Map<Frame | Decal, Trail>();
      const scene = buildScene(elementOf(doc, focus, origins), {
        trace: (built, trail) => trails.set(built, trail),
      });

      return {
        scene,
        initial: scene.getInitialStateMap(),
        authoredPathOf: (built) =>
          authoredPathOf(trails.get(built) ?? [], origins, focus),
        ownPathOf: (built) =>
          ownPathOf(trails.get(built) ?? [], origins, focus),
      };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }, [doc, focus]);
}

/**
 * The focused component, drawn at its authored pose -- or, on the scene's own
 * tab, running -- with every frame's origin marked over it.
 *
 * Play runs the whole scene, never a component on its own. Page 8 of
 * `docs/issues/0014` makes the simulation the module's, and what a component
 * would do with no world around it is a question it leaves open. So a
 * component's tab draws it as authored, and the scene's run waits for its tab.
 *
 * A click selects what it hit, as the node in the focused body nearest to it --
 * so a click on a component's instance selects the instance. Clicking the same
 * place again goes one deeper, through everything under the click.
 *
 * A frame's gizmo drags, writing the `position` of the node that built it --
 * when the focused body wrote that node, since otherwise there is nowhere to
 * write to. The pointer says which, before the press. Held within a few
 * pixels of another frame's origin, a line's end or a circle's centre, the
 * origin snaps to it exactly; Alt places it freely instead. While it moves,
 * its parent's axes -- the ones `position` is read along -- go through it.
 *
 * A scene that fails to build shows why instead of taking the editor down with
 * it: a half-made rig is the normal state of a document being edited, and the
 * message is the thing the person needs to see. Under it, the last scene this
 * tab drew stays, dimmed, until a scene builds -- in this tab or another -- or
 * its component goes.
 */
function ScenePane({
  doc,
  focus,
  structure,
  selectedPath,
  onPick,
  onEdit,
}: {
  doc: SceneDocument;
  focus: string;
  /** How many structural edits there have been -- see `useSimulation`. */
  structure: number;

  /** The selected node, if the focused body holds it. */
  selectedPath: NodePath | null;

  /** A click in the scene, as the node it selects: `null` when it hit nothing. */
  onPick: (path: NodePath | null) => void;

  /** A document a drag has made, the field naming the drag, and the node it moves. */
  onEdit: (next: SceneDocument, field: string, path: NodePath) => void;
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

  // One pose for the scene and its gizmos, so a gizmo is always where its frame
  // is drawn.
  const drawn =
    'scene' in built
      ? { scene: built.scene, stateMap: simulation.stateMap ?? built.initial }
      : null;

  // The last scene that built, as it was last drawn, and the tab it was drawn
  // in. While an edit passes through a state that does not build, it stays on
  // screen, dimmed under the error, so the pane does not go blank on what the
  // edit is doing to the rig. Another tab's is not this one's to show.
  const lastDrawn = useRef<{
    focus: string;
    drawn: { scene: CoreScene; stateMap: StateMap };
  } | null>(null);
  if (drawn) {
    lastDrawn.current = { focus, drawn };
  }

  // Its component gone, it goes too: a later one of the same name is not it.
  if (
    lastDrawn.current &&
    !doc.definitions.some(({ name }) => name === lastDrawn.current?.focus)
  ) {
    lastDrawn.current = null;
  }

  const stale =
    !drawn && lastDrawn.current?.focus === focus
      ? lastDrawn.current.drawn
      : null;

  // Where the last click landed: a click there again goes one past the
  // selection, when the selection is among what it hits.
  const lastPick = useRef<ScreenPoint | null>(null);

  // The drag under way, how many there have been, and whether the last one
  // ended in a move -- whose release is a click that should pick nothing.
  const drag = useRef<Drag | null>(null);
  const drags = useRef(0);
  const dragged = useRef(false);
  const [cursor, setCursor] = useState('');

  // What a drag under way has snapped to, marked on screen until it ends.
  const [snapMark, setSnapMark] = useState<ScreenPoint | null>(null);

  // The node a drag under way moves, and the body it is in, once it has moved.
  const [dragging, setDragging] = useState<Selection | null>(null);

  /** Where a mouse event lands, in the pane's own coordinates. */
  const pointOf = (event: {
    clientX: number;
    clientY: number;
  }): ScreenPoint => {
    const bounds = svgRef.current!.getBoundingClientRect();

    return [event.clientX - bounds.left, event.clientY - bounds.top];
  };

  /** The frames whose gizmos are under `point`, topmost first, and the node each can be dragged by. */
  const gizmosAt = (
    point: ScreenPoint,
  ): { frame: Frame; path: NodePath | null }[] =>
    'scene' in built && drawn
      ? hitsAt(drawn.scene, drawn.stateMap, xformMatrix, point)
          .filter((hit): hit is Frame => hit instanceof Frame)
          .map((frame) => ({ frame, path: built.ownPathOf(frame) }))
      : [];

  /**
   * The frame a press at `point` would drag, and the node that built it: the
   * selected node, when its gizmo is under the pointer -- which is how click
   * cycling reaches one in a stack -- and otherwise the topmost gizmo, when its
   * frame can be dragged. A gizmo on top that cannot drag blocks the press, as
   * a click there would select something else.
   */
  const dragTargetAt = (
    point: ScreenPoint,
  ): { frame: Frame; path: NodePath } | null => {
    const gizmos = gizmosAt(point);
    const selected = selectedPath
      ? gizmos.find(({ path }) => path?.join('.') === selectedPath.join('.'))
      : undefined;
    const target = selected ?? gizmos[0];

    return target?.path ? { frame: target.frame, path: target.path } : null;
  };

  const hover = (event: MouseEvent<SVGSVGElement>): void => {
    if (drag.current) {
      return;
    }

    const point = pointOf(event);
    setCursor(
      dragTargetAt(point)
        ? 'grab'
        : gizmosAt(point).length
          ? 'not-allowed'
          : '',
    );
  };

  const startDrag = (event: MouseEvent<SVGSVGElement>): void => {
    dragged.current = false;

    // The primary button alone, as d3-drag has it: Ctrl with a click is the
    // secondary button on a Mac.
    if (event.button !== 0 || event.ctrlKey) {
      return;
    }

    const from = pointOf(event);
    const target = dragTargetAt(from);
    const placement =
      target && drawn
        ? placeGizmos(drawn.scene, drawn.stateMap, xformMatrix).find(
            ({ frame }) => frame === target.frame,
          )
        : undefined;
    if (!target || !placement) {
      return;
    }

    event.preventDefault();
    drags.current += 1;
    drag.current = {
      path: target.path,
      doc,
      definition: focus,
      position: vec3.coerce(
        (nodeAt(doc, focus, target.path).props.position ?? [0, 0]) as
          number | readonly number[],
      ),
      parentXform: placement.parentXform,
      from,
      origin: placement.origin,
      // Only in the pose the code builds: a snap is a claim about where frames
      // are, and in a run's pose it would be exact about one never built.
      targets:
        'scene' in built &&
        drawn &&
        atAuthoredPose(drawn.stateMap, built.initial)
          ? snapPoints(drawn.scene, drawn.stateMap, xformMatrix, target.frame)
          : [],
      field: `drag ${drags.current}`,
      moved: false,
    };
    setCursor('grabbing');

    // Both listeners go when the drag ends.
    const listening = new AbortController();

    const end = (): void => {
      listening.abort();
      dragged.current = drag.current?.moved ?? false;
      drag.current = null;
      setCursor('');
      setSnapMark(null);
      setDragging(null);
    };

    const move = (moveEvent: globalThis.MouseEvent): void => {
      const current = drag.current;
      if (!current) {
        return;
      }

      // The button came up where the page could not hear it -- over a context
      // menu, say -- so the drag is over.
      if (moveEvent.buttons % 2 === 0) {
        end();
        return;
      }

      // Not a drag until the pointer leaves the press: a click with a pixel of
      // wobble in it is still a click.
      const to = pointOf(moveEvent);
      if (
        !current.moved &&
        Math.hypot(to[0] - current.from[0], to[1] - current.from[1]) <=
          SAME_PLACE
      ) {
        return;
      }

      if (!current.moved) {
        current.moved = true;
        onPick(current.path);
        setDragging({ definition: current.definition, path: current.path });
      }

      // Where the origin goes with the pointer, and the point it snaps to
      // there: the nearest in reach, unless Alt says to place it freely.
      const origin: ScreenPoint = [
        current.origin[0] + to[0] - current.from[0],
        current.origin[1] + to[1] - current.from[1],
      ];
      const snap = moveEvent.altKey
        ? null
        : nearestSnap(current.targets, origin);
      setSnapMark(snap);
      const position = snap
        ? placedPosition(
            current.position,
            current.parentXform,
            current.origin,
            snap,
          )
        : movedPosition(
            current.position,
            current.parentXform,
            current.from,
            to,
          );
      onEdit(
        setProp(
          current.doc,
          current.definition,
          current.path,
          'position',
          position,
        ),
        current.field,
        current.path,
      );
    };

    window.addEventListener('mousemove', move, { signal: listening.signal });
    window.addEventListener('mouseup', end, { signal: listening.signal });
  };

  const pick = (event: MouseEvent<SVGSVGElement>): void => {
    if (dragged.current) {
      dragged.current = false;
      return;
    }

    if (!('scene' in built) || !drawn) {
      return;
    }

    const point = pointOf(event);
    const paths = distinctPaths(
      hitsAt(drawn.scene, drawn.stateMap, xformMatrix, point).map(
        built.authoredPathOf,
      ),
    );
    const last = lastPick.current;
    const again =
      last !== null &&
      Math.hypot(point[0] - last[0], point[1] - last[1]) <= SAME_PLACE;
    const selected =
      again && selectedPath
        ? paths.findIndex((path) => path.join('.') === selectedPath.join('.'))
        : -1;
    lastPick.current = point;
    onPick(paths[(selected + 1) % paths.length] ?? null);
  };

  // The dragged frame's gizmo as the scene is drawn now -- where the drag has
  // taken it, and in a run, where the run has. Only in the tab the drag began
  // in: a path means nothing in another body.
  const draggedPlacement =
    dragging?.definition === focus && 'scene' in built && drawn
      ? placeGizmos(drawn.scene, drawn.stateMap, xformMatrix).find(
          ({ frame }) =>
            built.ownPathOf(frame)?.join('.') === dragging.path.join('.'),
        )
      : undefined;

  return (
    <section className="editor__scene" aria-label="Scene">
      <svg
        ref={svgRef}
        onClick={pick}
        onMouseDown={startDrag}
        onMouseMove={hover}
        style={cursor ? { cursor } : undefined}
      >
        {drawn ? (
          <>
            <SceneView {...drawn} xformMatrix={xformMatrix} />
            <Gizmos {...drawn} xformMatrix={xformMatrix} />
            {draggedPlacement ? (
              <ParentAxes placement={draggedPlacement} />
            ) : null}
            {snapMark ? (
              <circle
                className="editor__snap"
                cx={snapMark[0]}
                cy={snapMark[1]}
                r={6}
              />
            ) : null}
          </>
        ) : null}
        {stale ? (
          <g className="editor__stale">
            <SceneView {...stale} xformMatrix={xformMatrix} />
          </g>
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
          disabled={!playable || !simulation.started || 'error' in built}
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

/**
 * The whole module, as it would be written to a file, with the selected node's
 * source marked -- a frame with all it holds.
 *
 * The mark is scrolled into view once, when the selection changes, and not on
 * every edit: a keystroke in the properties pane would otherwise pull the view
 * away from what is being read.
 */
function CodePane({
  doc,
  selection,
}: {
  doc: SceneDocument;
  selection: Selection | null;
}): ReactElement {
  const emitted = useMemo(() => {
    try {
      return emitScene(doc);
    } catch (error) {
      return {
        source: `// ${error instanceof Error ? error.message : String(error)}`,
        ranges: new Map<string, readonly [number, number]>(),
      };
    }
  }, [doc]);
  const selected = selection
    ? rangeKey(selection.definition, selection.path)
    : null;
  const range = selected ? emitted.ranges.get(selected) : undefined;
  const paneRef = useRef<HTMLElement>(null);
  const markRef = useRef<HTMLElement>(null);

  // Once a selection, not on every edit, which would pull the view away from
  // what is being read. The pane's own scroll, measured, rather than
  // `scrollIntoView`, which would scroll the editor around the pane as well.
  useEffect(() => {
    const pane = paneRef.current;
    const mark = markRef.current;
    if (!pane || !mark) {
      return;
    }

    // Where the top of what the pane scrolls is on screen.
    const offset = pane.getBoundingClientRect().top - pane.scrollTop;
    const { top, bottom } = mark.getBoundingClientRect();
    pane.scrollTop = scrollTopFor(
      pane.scrollTop,
      pane.clientHeight,
      top - offset,
      bottom - offset,
    );
  }, [selected]);

  return (
    <section ref={paneRef} className="editor__code" aria-label="Code">
      <pre>
        <code>
          {range ? (
            <>
              {emitted.source.slice(0, range[0])}
              <mark ref={markRef}>
                {emitted.source.slice(range[0], range[1])}
              </mark>
              {emitted.source.slice(range[1])}
            </>
          ) : (
            emitted.source
          )}
        </code>
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
  const [history, setHistory] = useState(() =>
    historyOf(initialDocument ?? starterDocument()),
  );
  const doc = history.present.doc;
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

  /**
   * Record an edit made in the focused tab, with the selection before it and
   * the one it makes: by default, the same one.
   */
  const record = (
    next: SceneDocument,
    {
      structural,
      field = null,
      after = selectedPath,
    }: {
      structural: boolean;
      field?: string | null;
      after?: NodePath | null;
    },
  ): void =>
    setHistory((current) =>
      recorded(current, {
        doc: next,
        focus,
        structural,
        before: selectedPath,
        after,
        field,
      }),
    );

  /** Replace the document, and select `path` in it -- or nothing. */
  const change = (next: SceneDocument, path: NodePath | null): void => {
    record(next, { structural: true, after: path });
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

  /**
   * Move through the history to `next` by undoing `edit` -- `back` -- or by
   * redoing it, returning to the tab it was made in.
   *
   * A tab whose component the document no longer defines closes. The selection
   * goes back to one side of the edit: the one before it, on undo, and the one
   * it made, on redo. Each is a path in the very document arrived at, so it
   * means what it meant then.
   */
  const travel = (next: History, edit: Step, back: boolean): void => {
    const names = new Set(next.present.doc.definitions.map(({ name }) => name));
    const to = names.has(edit.focus) ? edit.focus : next.present.doc.root;
    const path = to === edit.focus ? (back ? edit.before : edit.after) : null;
    setHistory(next);
    setTabs((open) => {
      const kept = open.filter((tab) => names.has(tab));

      return kept.includes(to) ? kept : [...kept, to];
    });
    setFocus(to);
    setSelection(path ? { definition: to, path } : null);
    if (edit.structural) {
      restructure();
    }
  };

  const undo = (): void => {
    if (history.past.length) {
      travel(undone(history), history.present, true);
    }
  };

  const redo = (): void => {
    const [next] = history.future;
    if (next) {
      travel(redone(history), next, false);
    }
  };

  // Undo and redo from the keyboard, wherever the focus is -- except in a text
  // field, whose own they are. On the window, because a click in the scene
  // leaves the focus on the page's body, outside the editor; through a ref, so
  // the one listener always reaches this render's history.
  const onHistoryKey = useRef<(event: KeyboardEvent) => void>(() => {});
  onHistoryKey.current = (event) => {
    const { target } = event;
    const inText =
      target instanceof HTMLTextAreaElement ||
      (target instanceof HTMLInputElement && target.type !== 'checkbox');
    const key = event.key.toLowerCase();
    if (
      inText ||
      !(event.metaKey || event.ctrlKey) ||
      !['y', 'z'].includes(key)
    ) {
      return;
    }

    event.preventDefault();
    if (key === 'y' || event.shiftKey) {
      redo();
    } else {
      undo();
    }
  };

  useEffect(() => {
    const listener = (event: KeyboardEvent): void =>
      onHistoryKey.current(event);
    window.addEventListener('keydown', listener);

    return () => window.removeEventListener('keydown', listener);
  }, []);

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
      <div className="editor__bar">
        <nav
          className="editor__tabs"
          role="tablist"
          aria-label="Open components"
        >
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
        <div className="editor__history" role="group" aria-label="History">
          <button type="button" disabled={!history.past.length} onClick={undo}>
            Undo
          </button>
          <button
            type="button"
            disabled={!history.future.length}
            onClick={redo}
          >
            Redo
          </button>
        </div>
      </div>
      <CodePane doc={doc} selection={selection} />
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
              record(extractComponent(doc, focus, path, name), {
                structural: true,
                after: path,
              });
              open(name);
              restructure();
            }}
            {...actions}
          />
          <ScenePane
            doc={doc}
            focus={focus}
            structure={structure}
            selectedPath={selectedPath}
            onPick={(path) =>
              path ? actions.onSelect(path) : actions.onDeselect()
            }
            onEdit={(next, field, path) =>
              record(next, { structural: false, field, after: path })
            }
          />
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
        onChange={(next, field) => record(next, { structural: false, field })}
        onOpen={open}
      />
    </div>
  );
}
