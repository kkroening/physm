import './Editor.css';
import SceneView from './../react/SceneView';
import buildScene from './../react/buildScene';
import coreComponents from './../react/coreComponents';
import emitScene from './emitScene';
import getViewXformMatrix from './../getViewXformMatrix';
import starterDocument from './starterDocument';
import useElementSize from './../useElementSize';
import { definitionOf, elementOf } from './sceneDocument';
import { useMemo, useRef, useState } from 'react';
import type CoreScene from './../Scene';
import type { ComponentRef, DocNode, SceneDocument } from './sceneDocument';
import type { ReactElement } from 'react';

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

/** One node of the tree, and everything under it. */
function TreeRow({ node }: { node: DocNode }): ReactElement {
  const summary = summaryOf(node);

  return (
    <li role="treeitem" aria-expanded={node.children.length ? true : undefined}>
      <div className="editor__row" data-kind={node.type.kind}>
        <span className="editor__disclosure">
          {node.children.length ? '▾' : ''}
        </span>
        <span className="editor__tag">{tagOf(node.type)}</span>
        {summary ? <span className="editor__summary">{summary}</span> : null}
      </div>
      {node.children.length ? (
        <ul role="group">
          {node.children.map((child, index) => (
            <TreeRow node={child} key={child.key ?? index} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

/** The focused component's authored tree. */
function TreePane({
  doc,
  focus,
}: {
  doc: SceneDocument;
  focus: string;
}): ReactElement {
  const { body } = definitionOf(doc, focus);

  return (
    <section className="editor__tree" aria-label="Tree">
      <div className="editor__heading">{focus}</div>
      <ul role="tree" aria-label={focus}>
        {body.map((node, index) => (
          <TreeRow node={node} key={node.key ?? index} />
        ))}
      </ul>
    </section>
  );
}

/** A scene, or the reason there is not one. */
function useBuiltScene(
  doc: SceneDocument,
  focus: string,
): { scene: CoreScene } | { error: string } {
  return useMemo(() => {
    try {
      return { scene: buildScene(elementOf(doc, focus)) };
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
            stateMap={built.scene.getInitialStateMap()}
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

/** What a selected node's props will be edited in. */
function PropertiesPane(): ReactElement {
  return (
    <section className="editor__props" aria-label="Properties">
      <div className="editor__heading">Properties</div>
      <p className="editor__hint">Select a node to see its props.</p>
    </section>
  );
}

/** Everything that can be added: building blocks, and this document's own. */
function LibraryPane({ doc }: { doc: SceneDocument }): ReactElement {
  const defined = doc.definitions.filter(({ name }) => name !== doc.root);

  return (
    <section className="editor__library" aria-label="Library">
      {CATEGORIES.map((category) => (
        <div className="editor__shelf" key={category}>
          <div className="editor__heading">{category}</div>
          <ul>
            {coreComponents
              .filter(({ meta }) => meta.category === category)
              .map(({ meta }) => (
                <li key={meta.name} title={meta.description}>
                  {meta.name}
                </li>
              ))}
          </ul>
        </div>
      ))}
      {defined.length ? (
        <div className="editor__shelf">
          <div className="editor__heading">This scene</div>
          <ul>
            {defined.map(({ name }) => (
              <li key={name} data-kind="defined">
                {name}
              </li>
            ))}
          </ul>
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
  const [doc] = useState<SceneDocument>(
    () => initialDocument ?? starterDocument(),
  );
  const focus = doc.root;

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
          <TreePane doc={doc} focus={focus} />
          <ScenePane doc={doc} focus={focus} />
        </div>
        <LibraryPane doc={doc} />
      </div>
      <PropertiesPane />
    </div>
  );
}
