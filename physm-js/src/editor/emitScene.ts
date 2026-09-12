import { definitionOf, placeholderPath } from './sceneDocument';
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
   * are indistinguishable by their text. They index `source` exactly as
   * written: formatting it on the way to the code pane would leave them
   * pointing at the wrong characters.
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

/** The denominators a multiple of π is written with: the common fractions of a turn. */
const PI_DENOMINATORS = [1, 2, 3, 4, 6, 8, 12];

/**
 * A multiple of π as a person would write it -- `-Math.PI / 2`, not
 * `-1.5707963267948966` -- or `null` for a number that is not one exactly.
 *
 * Exactly: the expression has to evaluate to the very number, so the code
 * rebuilds what it was written from. It is compared as `(k * Math.PI) / d`,
 * and written so, since `k * (Math.PI / d)` is another double for some
 * fractions. Nor is it always in lowest terms: 495° is the double
 * `(33 * Math.PI) / 12`, which `(11 * Math.PI) / 4` is not. And only within
 * two turns either way: a large enough number lands on some multiple of π by
 * chance -- nearly any past 1e15 does -- and is no angle.
 */
function piLiteral(value: number): string | null {
  for (const d of PI_DENOMINATORS) {
    const k = Math.round((value * d) / Math.PI);
    if (k !== 0 && Math.abs(k) <= 4 * d && (k * Math.PI) / d === value) {
      const times = Math.abs(k) === 1 ? '' : `${Math.abs(k)} * `;
      const multiple = `${k < 0 ? '-' : ''}${times}Math.PI`;

      return d === 1
        ? multiple
        : times
          ? `(${multiple}) / ${d}`
          : `${multiple} / ${d}`;
    }
  }

  return null;
}

/** A value, as a JavaScript expression -- or a throw saying why it cannot be. */
function literal(value: unknown): string {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`${value} cannot be written as source.`);
    }

    return piLiteral(value) ?? String(value);
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

  // A function, a class instance: nothing a scene file can say.
  const what =
    typeof value === 'object'
      ? 'An object that is not plain data'
      : `A value of type ${typeof value}`;
  throw new Error(
    `${what} cannot be written as source. A scene document holds plain ` +
      'data -- numbers, strings, flags, arrays and objects of them.',
  );
}

/**
 * Whether a value is worth naming: the compound ones.
 *
 * A number or a string written twice is not what makes a file tedious to
 * change -- `mass={2}` on two weights is two different masses that happen to
 * agree. A point written at a rod's line, its circle and its weight is one
 * length written three times, and that is the case worth recovering.
 */
function compound(value: unknown): boolean {
  return (
    Array.isArray(value) ||
    (typeof value === 'object' &&
      value !== null &&
      Object.getPrototypeOf(value) === Object.prototype)
  );
}

/**
 * How many times a value is written before it earns a name.
 *
 * Three rather than two, from watching the demo: dragging the cart onto the
 * ground line's end makes its `position` equal that `endPos`, and at two the
 * coincidence was named -- `END_POS`, by a tie -- and the cart written
 * `position={END_POS}`. Twice can be two values that agree; three times is a
 * value used three times.
 */
const REPEATS = 3;

/** A prop's name as a constant's: `endPos` becomes `END_POS`. */
function constantName(prop: string): string {
  return prop.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase();
}

/**
 * A name for each value the module writes more than once, keyed by the
 * literal that value prints as.
 *
 * [0014 page 6](../../../docs/issues/0014/06-codegen.md) asks for this, and
 * says what it can and cannot be: the document is what the source *evaluated
 * to*, so the name a person wrote -- `TIP`, `SWEEP` -- is gone with the rest
 * of how the file was written. The name therefore comes from the prop that
 * carries the value, which is the mechanical recovery that page calls for
 * rather than a reconstruction of what was lost.
 *
 * The most common prop name among the uses, so a point used as three
 * positions and one `endPos` is a `POSITION`; ties go alphabetically, so the
 * same document always emits the same file.
 */
function constantsOf(
  doc: SceneDocument,
  bound: ReadonlySet<string>,
): Map<string, string> {
  const uses = new Map<string, string[]>();
  const visit = (nodes: readonly DocNode[]): void => {
    for (const node of nodes) {
      if (node.type.kind !== 'children') {
        for (const [prop, value] of writtenProps(node)) {
          if (compound(value)) {
            try {
              const text = literal(value);
              uses.set(text, [...(uses.get(text) ?? []), prop]);
            } catch {
              // Not writable at all: the write says so, with the node's path.
            }
          }
        }
      }

      visit(node.children);
    }
  };

  for (const { body } of doc.definitions) {
    visit(body);
  }

  const named = new Map<string, string>();
  const taken = new Set(bound);
  for (const [text, props] of uses) {
    if (props.length < REPEATS) {
      continue;
    }

    const counts = new Map<string, number>();
    for (const prop of props) {
      counts.set(prop, (counts.get(prop) ?? 0) + 1);
    }

    const [best] = [...counts].sort(
      ([a, byA], [b, byB]) => byB - byA || a.localeCompare(b),
    )[0]!;
    const base = constantName(best);
    let name = base;
    for (let n = 2; taken.has(name); n += 1) {
      name = `${base}_${n}`;
    }

    taken.add(name);
    named.set(text, name);
  }

  return named;
}

/** Every name the module binds, which a constant's may not be. */
function boundNames(doc: SceneDocument): Set<string> {
  const bound = new Set<string>([
    'ReactElement',
    'ReactNode',
    ...doc.definitions.map(({ name }) => name),
  ]);
  const visit = (nodes: readonly DocNode[]): void => {
    for (const node of nodes) {
      if (node.type.kind !== 'children') {
        bound.add(tagOf(node.type));
      }

      visit(node.children);
    }
  };

  for (const { body } of doc.definitions) {
    visit(body);
  }

  return bound;
}

/**
 * One attribute, as JSX writes it.
 *
 * A string goes in quotes where it can -- `id="cart"` -- and in braces where it
 * cannot. A JSX string attribute has no backslash escapes, but it does decode
 * character references, so `&amp;` written in one would be read back as `&`:
 * a quote, an ampersand, a backslash or a line break has to be an expression.
 */
function attribute(
  name: string,
  value: unknown,
  constants: ReadonlyMap<string, string>,
): string {
  if (!PROP_NAME.test(name)) {
    throw new Error(`'${name}' cannot be written as a JSX attribute.`);
  }

  // A ref is filled in by an effect. Written out, it would be a fresh object
  // with the ref's contents at the moment of writing, not the ref.
  if (name === 'ref') {
    throw new Error(
      'A ref cannot be written as source: it is filled in by an effect. ' +
        'Name what it points at by id instead.',
    );
  }

  if (typeof value === 'string' && !/["&\\\n\r]/.test(value)) {
    return `${name}="${value}"`;
  }

  const text = literal(value);

  return `${name}={${constants.get(text) ?? text}}`;
}

/** Deep equality for the plain data a prop holds. */
function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** The tag a node's element is written with. */
function tagOf(type: Exclude<ComponentRef, { kind: 'children' }>): string {
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

  // `undefined` is absent to every component, and writing it would say
  // something different under `exactOptionalPropertyTypes`.
  return Object.entries(node.props).filter(([name, value]) => {
    const spec = (specs as Record<string, { default?: unknown } | undefined>)[
      name
    ];

    return (
      value !== undefined &&
      !(spec && 'default' in spec && sameValue(spec.default, value))
    );
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
          // From where the cycle starts: the path that led into it is not
          // part of it.
          `${[...trail.slice(trail.indexOf(name)), name].join(' -> ')}.`,
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

/**
 * The module's import lines -- refusing a name the module would bind twice.
 *
 * A definition named like an import would shadow it, so every tag in the file
 * resolves to the definition: `tsc` refuses that module, and evaluated anyway
 * it builds a different scene. Two different imported components under one
 * name would collapse into one import.
 */
function importsOf(doc: SceneDocument): string[] {
  const core = new Set<string>();
  const imported = new Map<string, unknown>();
  const collect = (nodes: readonly DocNode[]): void => {
    for (const node of nodes) {
      if (node.type.kind === 'core') {
        core.add(tagOf(node.type));
      } else if (node.type.kind === 'imported') {
        const name = tagOf(node.type);
        const earlier = imported.get(name);
        if (earlier !== undefined && earlier !== node.type.component) {
          throw new Error(
            `Two different imported components are both called '${name}', ` +
              'and a module can import only one of them under that name.',
          );
        }

        imported.set(name, node.type.component);
      }

      collect(node.children);
    }
  };

  for (const definition of doc.definitions) {
    collect(definition.body);
  }

  const importedAs = (name: string): string | null => {
    if (core.has(name)) {
      return 'a building block the module imports';
    }

    if (imported.has(name)) {
      return `a component the module imports from './${name}'`;
    }

    return name === 'ReactElement' ? 'the type every component returns' : null;
  };

  for (const name of imported.keys()) {
    if (core.has(name)) {
      throw new Error(
        `'${name}' is both a building block and an imported component, and ` +
          'the module can import only one of them under that name.',
      );
    }
  }

  for (const { name } of doc.definitions) {
    const clash = importedAs(name);
    if (clash) {
      throw new Error(
        `'${name}' is both a component this scene defines and ${clash}. ` +
          'Rename the component.',
      );
    }
  }

  // An imported composite is written as a default import from a module of its
  // own name, which is this repo's convention -- one component per file, named
  // for it -- and so right for anything written to that convention.
  return [
    ...[...imported.keys()]
      .sort()
      .map((name) => `import ${name} from './${name}';`),
    ...(core.size
      ? [`import { ${[...core].sort().join(', ')} } from './react';`]
      : []),
    doc.definitions.some(({ name }) => placeholderPath(doc, name))
      ? "import type { ReactElement, ReactNode } from 'react';"
      : "import type { ReactElement } from 'react';",
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
  const constants = constantsOf(doc, boundNames(doc));
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

    // Where the component's instances put their children.
    if (node.type.kind === 'children') {
      write(`${indent}{children}\n`);
      ranges.set(rangeKey(definition, path), [
        start + indent.length,
        source.length - 1,
      ]);
      return;
    }

    const tag = tagOf(node.type);
    // A value that cannot be written says which one, and where it is.
    const written = (name: string, value: unknown): string => {
      try {
        return attribute(name, value, constants);
      } catch (error) {
        throw new Error(
          `Cannot write '${name}' on <${tag}> at ${rangeKey(definition, path)}: ` +
            (error instanceof Error ? error.message : String(error)),
        );
      }
    };
    const attributes = [
      ...(node.key === undefined ? [] : [written('key', node.key)]),
      ...writtenProps(node).map(([name, value]) => written(name, value)),
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

    const props = placeholderPath(doc, definition.name)
      ? '{ children }: { children?: ReactNode }'
      : '';
    write(
      `${isRoot ? 'export default ' : ''}function ${definition.name}(${props}): ReactElement {\n`,
    );

    // A lone `{children}` goes in a fragment too: in parentheses by itself it
    // would be an object, not an element.
    const { body } = definition;
    if (body.length === 1 && body[0]!.type.kind !== 'children') {
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
  if (constants.size) {
    write('\n');
    for (const [text, name] of constants) {
      write(`const ${name} = ${text};\n`);
    }
  }
  for (const definition of declarationOrder(doc)) {
    write('\n');
    writeDefinition(definition, definition.name === doc.root);
  }

  return { source, ranges };
}
