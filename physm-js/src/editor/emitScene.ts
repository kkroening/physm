import { definitionOf } from './sceneDocument';
import type {
  ComponentRef,
  Definition,
  DocNode,
  SceneDocument,
} from './sceneDocument';

/** What the emitter produces: the module's text, and where each node landed. */
export interface EmittedScene {
  readonly source: string;

  /**
   * Each node's character range in `source`, keyed by `rangeKey`.
   *
   * Recorded while writing because it costs a few lines here and a search
   * afterwards cannot recover it -- two identical elements in one definition
   * are indistinguishable by their text.
   */
  readonly ranges: ReadonlyMap<string, readonly [number, number]>;
}

/** The key a node's range is stored under. */
export function rangeKey(definition: string, path: readonly number[]): string {
  return `${definition}/${path.join('.')}`;
}

/** A component name JSX can use as a tag. */
const COMPONENT_NAME = /^[A-Z][A-Za-z0-9_]*$/;

/** A prop name JSX can use as an attribute. */
const PROP_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** An object key that needs no quotes. */
const BARE_KEY = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/** A value, as a JavaScript expression -- or a throw saying why it cannot be. */
function literal(value: unknown): string {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`${value} cannot be written as source.`);
    }

    return String(value);
  }

  if (typeof value === 'string') {
    return JSON.stringify(value);
  }

  if (typeof value === 'boolean' || value === null) {
    return String(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(literal).join(', ')}]`;
  }

  if (
    typeof value === 'object' &&
    Object.getPrototypeOf(value) === Object.prototype
  ) {
    const entries = Object.entries(value).map(
      ([key, entry]) =>
        `${BARE_KEY.test(key) ? key : JSON.stringify(key)}: ${literal(entry)}`,
    );

    return entries.length ? `{ ${entries.join(', ')} }` : '{}';
  }

  // A function, a class instance, a ref: nothing a scene file can say.
  throw new Error(
    `A ${typeof value} prop cannot be written as source. A scene document ` +
      'holds plain data -- numbers, strings, flags, arrays and objects of them.',
  );
}

/**
 * One attribute, as JSX writes it.
 *
 * A string goes in quotes where it can -- `id="cart"` -- and in braces where it
 * cannot: a JSX string attribute has no escapes, so a quote, backslash or line
 * break inside one has to be an expression instead.
 */
function attribute(name: string, value: unknown): string {
  if (!PROP_NAME.test(name)) {
    throw new Error(`'${name}' cannot be written as a JSX attribute.`);
  }

  return typeof value === 'string' && !/["\\\n\r]/.test(value)
    ? `${name}="${value}"`
    : `${name}={${literal(value)}}`;
}

/** Deep equality for the plain data a prop holds. */
function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** The tag a node's element is written with. */
function tagOf(type: ComponentRef): string {
  const name = type.kind === 'core' ? type.component.meta.name : type.name;
  if (!COMPONENT_NAME.test(name)) {
    throw new Error(
      `'${name}' cannot be a JSX tag: a component name starts with a capital ` +
        'letter and holds only letters, digits and underscores.',
    );
  }

  return name;
}

/**
 * The props worth writing: everything but what a building block would have
 * anyway.
 *
 * A prop equal to its declared default is omitted, because generated source is
 * meant to read like source a person wrote, and a person does not write
 * `centered={true}` on every box.
 */
function writtenProps(node: DocNode): [string, unknown][] {
  const specs = node.type.kind === 'core' ? node.type.component.meta.props : {};

  return Object.entries(node.props).filter(([name, value]) => {
    const spec = (specs as Record<string, { default?: unknown } | undefined>)[
      name
    ];

    return !(spec && 'default' in spec && sameValue(spec.default, value));
  });
}

/**
 * Definitions in the order a file declares them: each before anything that
 * instantiates it, the root last.
 *
 * `CLAUDE.md` asks for definitions to precede their use, and it is also what a
 * reader wants -- primitives first, conclusion last. A cycle is refused: an
 * editor-defined component has no way to stop recursing, and the editor refuses
 * one before it can be made, so meeting one here means something upstream let
 * it through.
 */
function declarationOrder(doc: SceneDocument): Definition[] {
  const ordered: Definition[] = [];
  const state = new Map<string, 'visiting' | 'done'>();

  const uses = (nodes: readonly DocNode[]): string[] =>
    nodes.flatMap((node) => [
      ...(node.type.kind === 'defined' ? [node.type.name] : []),
      ...uses(node.children),
    ]);

  const visit = (name: string, trail: readonly string[]): void => {
    const seen = state.get(name);
    if (seen === 'done') {
      return;
    }

    if (seen === 'visiting') {
      throw new Error(
        `Components instantiate each other in a cycle: ` +
          `${[...trail, name].join(' -> ')}.`,
      );
    }

    state.set(name, 'visiting');
    const definition = definitionOf(doc, name);
    for (const used of uses(definition.body)) {
      visit(used, [...trail, name]);
    }

    state.set(name, 'done');
    ordered.push(definition);
  };

  // Definitions nothing reaches still belong in the file -- they are in the
  // library, and may be instantiated next -- so they come before the root too.
  for (const definition of doc.definitions) {
    if (definition.name !== doc.root) {
      visit(definition.name, []);
    }
  }

  visit(doc.root, []);

  return ordered;
}

/** The module's import lines. */
function importsOf(doc: SceneDocument): string[] {
  const core = new Set<string>();
  const imported = new Set<string>();
  const collect = (nodes: readonly DocNode[]): void => {
    for (const node of nodes) {
      if (node.type.kind === 'core') {
        core.add(tagOf(node.type));
      } else if (node.type.kind === 'imported') {
        imported.add(tagOf(node.type));
      }

      collect(node.children);
    }
  };

  for (const definition of doc.definitions) {
    collect(definition.body);
  }

  // An imported composite is written as a default import from a module of its
  // own name, which is this repo's convention -- one component per file, named
  // for it -- and so right for anything written to that convention.
  return [
    ...[...imported].sort().map((name) => `import ${name} from './${name}';`),
    ...(core.size
      ? [`import { ${[...core].sort().join(', ')} } from './react';`]
      : []),
    "import type { ReactElement } from 'react';",
  ];
}

/**
 * A scene document, as a `.tsx` module.
 *
 * The output is meant to be pasted into the repo and rebuilt, so it is written
 * the way a person would write it: definitions before their use, the scene as
 * the default export, building blocks from the binding, and no prop spelled out
 * that would have its value anyway. It is correct rather than canonical --
 * `npm run format` is what gives it the repo's exact shape, rather than a copy
 * of Prettier's line-breaking living in here.
 */
export default function emitScene(doc: SceneDocument): EmittedScene {
  let source = '';
  const ranges = new Map<string, readonly [number, number]>();
  const write = (text: string): void => {
    source += text;
  };

  const writeNode = (
    node: DocNode,
    definition: string,
    path: readonly number[],
    indent: string,
  ): void => {
    const start = source.length;
    const tag = tagOf(node.type);
    const attributes = [
      ...(node.key === undefined ? [] : [attribute('key', node.key)]),
      ...writtenProps(node).map(([name, value]) => attribute(name, value)),
    ];
    const opening = [tag, ...attributes].join(' ');

    if (!node.children.length) {
      write(`${indent}<${opening} />\n`);
    } else {
      write(`${indent}<${opening}>\n`);
      node.children.forEach((child, index) =>
        writeNode(child, definition, [...path, index], `${indent}  `),
      );
      write(`${indent}</${tag}>\n`);
    }

    // The range stops before the trailing newline, so a highlight covers the
    // element and nothing after it.
    ranges.set(rangeKey(definition, path), [
      start + indent.length,
      source.length - 1,
    ]);
  };

  const writeDefinition = (definition: Definition, isRoot: boolean): void => {
    if (!COMPONENT_NAME.test(definition.name)) {
      throw new Error(`'${definition.name}' cannot be a component name.`);
    }

    write(
      `${isRoot ? 'export default ' : ''}function ${definition.name}(): ReactElement {\n`,
    );

    const { body } = definition;
    if (body.length === 1) {
      write('  return (\n');
      writeNode(body[0]!, definition.name, [0], '    ');
      write('  );\n');
    } else if (body.length) {
      write('  return (\n    <>\n');
      body.forEach((node, index) =>
        writeNode(node, definition.name, [index], '      '),
      );
      write('    </>\n  );\n');
    } else {
      write('  return <></>;\n');
    }

    write('}\n');
  };

  write(`${importsOf(doc).join('\n')}\n`);
  for (const definition of declarationOrder(doc)) {
    write('\n');
    writeDefinition(definition, definition.name === doc.root);
  }

  return { source, ranges };
}
