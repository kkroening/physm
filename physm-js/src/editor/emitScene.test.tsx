import * as React from 'react';
import * as binding from './../react';
import * as cartAndRopeModule from './../CartAndRope';
import * as jsxRuntime from 'react/jsx-runtime';
import Box from './../react/Box';
import CartAndRope from './../CartAndRope';
import Circle from './../react/Circle';
import Coincidence from './../react/Coincidence';
import FixedFrame from './../react/FixedFrame';
import Line from './../react/Line';
import RotationalFrame from './../react/RotationalFrame';
import TrackFrame from './../react/TrackFrame';
import Weight from './../react/Weight';
import buildScene from './../react/buildScene';
import emitScene, { rangeKey } from './emitScene';
import ts from 'typescript';
import { documentFrom, elementOf, nodesFrom } from './sceneDocument';
import type CoreScene from './../Scene';
import type { DocNode, SceneDocument } from './sceneDocument';
import type { ReactElement } from 'react';

/**
 * An imported composite taking an object prop -- the one kind of value no
 * building block has -- served to the evaluator as `./Gantry`.
 */
function Gantry({
  span,
}: {
  span: { reach: number; 'lift-off': number };
}): ReactElement {
  return (
    <RotationalFrame position={[0, span['lift-off']]}>
      <Weight mass={1} position={[span.reach, 0]} />
    </RotationalFrame>
  );
}

/** `./Gantry` as `tsc` sees it: its type, for an emitted import to check against. */
const GANTRY_MODULE = `import type { ReactElement } from 'react';

export default function Gantry(_props: {
  span: { reach: number; 'lift-off': number };
}): ReactElement {
  throw new Error('declared for type-checking only');
}
`;

/**
 * The modules an emitted scene imports, as the evaluator hands them out.
 *
 * Marked `__esModule` so the CommonJS interop the compiler emits treats a
 * default import as the module's `default` rather than wrapping the namespace.
 */
const MODULES: Record<string, unknown> = {
  react: React,
  'react/jsx-runtime': jsxRuntime,
  './react': binding,
  './CartAndRope': cartAndRopeModule,
  './Gantry': { default: Gantry },
};

/**
 * Compile an emitted module and run it, returning its default export.
 *
 * The same compiler the repo builds with, set to the repo's JSX transform. It
 * parses and transforms and nothing more -- whether the module would also pass
 * `tsc` is `typeCheck`'s question.
 */
function evaluate(source: string): () => ReactElement {
  const { outputText, diagnostics } = ts.transpileModule(source, {
    reportDiagnostics: true,
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  });
  expect(diagnostics ?? []).toEqual([]);

  const module = { exports: {} as Record<string, unknown> };
  const require = (name: string): unknown => {
    if (!(name in MODULES)) {
      throw new Error(`the emitted source imports '${name}'`);
    }

    return { __esModule: true, ...(MODULES[name] as object) };
  };

  new Function('require', 'module', 'exports', outputText)(
    require,
    module,
    module.exports,
  );

  return module.exports.default as () => ReactElement;
}

/**
 * The repo's compiler settings, as CI's `tsc` reads them.
 *
 * Read through `ts.sys` rather than Node's own modules, which this suite's
 * types do not include. Vitest runs from `physm-js`, where the config lives.
 */
const COMPILER_OPTIONS = ((): ts.CompilerOptions => {
  const parsed = ts.getParsedCommandLineOfConfigFile(
    `${ts.sys.getCurrentDirectory()}/tsconfig.json`,
    undefined,
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
        throw new Error(
          ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
        );
      },
    },
  );
  if (!parsed) {
    throw new Error('tsconfig.json could not be read');
  }

  return parsed.options;
})();

/**
 * Type-check modules under the repo's settings, returning each diagnostic.
 *
 * They are served from memory as files in `src/`, so `./react` and
 * `./CartAndRope` resolve to the real modules -- the check a module pasted into
 * the repo would meet in CI.
 */
function typeCheck(files: Record<string, string>): string[] {
  const src = `${ts.sys.getCurrentDirectory()}/src`;
  const virtual = new Map(
    Object.entries(files).map(([name, text]) => [`${src}/${name}`, text]),
  );
  const host = ts.createCompilerHost(COMPILER_OPTIONS);
  const { fileExists, getSourceFile, readFile } = host;
  host.fileExists = (fileName) =>
    virtual.has(fileName) || fileExists.call(host, fileName);
  host.readFile = (fileName) =>
    virtual.get(fileName) ?? readFile.call(host, fileName);
  host.getSourceFile = (fileName, languageVersion, onError, fresh) => {
    const text = virtual.get(fileName);

    return text === undefined
      ? getSourceFile.call(host, fileName, languageVersion, onError, fresh)
      : ts.createSourceFile(fileName, text, languageVersion);
  };
  const program = ts.createProgram([...virtual.keys()], COMPILER_OPTIONS, host);

  return [...virtual.keys()].flatMap((fileName) =>
    ts
      .getPreEmitDiagnostics(program, program.getSourceFile(fileName))
      .map(
        (diagnostic) =>
          `${diagnostic.file?.fileName.slice(src.length + 1) ?? ''}: ` +
          ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
      ),
  );
}

/**
 * A scene with each generated frame id replaced by its position among them,
 * plus its decals.
 *
 * Only the ids `buildScene` generates -- `@`-prefixed paths -- are relabelled:
 * they differ between the two builds by the wrapper `elementOf` adds. An
 * authored id compares as itself, so one written wrong, or dropped, is seen.
 */
function normalized(scene: CoreScene): unknown {
  const labels = new Map(
    scene.sortedFrames
      .filter((frame) => frame.id.startsWith('@'))
      .map((frame, index) => [frame.id, `#${index}`]),
  );
  const rewrite = (value: unknown): unknown => {
    if (typeof value === 'string') {
      return labels.get(value) ?? value;
    }

    if (Array.isArray(value)) {
      return value.map(rewrite);
    }

    return value && typeof value === 'object'
      ? Object.fromEntries(
          Object.entries(value).map(([key, entry]) => [key, rewrite(entry)]),
        )
      : value;
  };

  return {
    json: rewrite(scene.toJsonObj()),
    decals: [scene.decals, ...scene.sortedFrames.map((frame) => frame.decals)],
  };
}

/** The round trip: the emitted module must build the scene the document does. */
function expectRoundTrip(doc: SceneDocument): string {
  const { source } = emitScene(doc);
  const Root = evaluate(source);

  expect(normalized(buildScene(<Root />))).toEqual(
    normalized(buildScene(elementOf(doc))),
  );

  return source;
}

/** An instance of a component the document defines. */
function instance(name: string): DocNode {
  return { type: { kind: 'defined', name }, props: {}, children: [] };
}

/**
 * Every kind of value a prop can hold, and every kind of node: named and
 * unnamed frames, a key, strings that need braces, a constraint with a `null`
 * end, and an imported composite with an object prop.
 */
function everything(): SceneDocument {
  return documentFrom(
    <>
      <TrackFrame id={'R&amp;D'} angle={0.25} initialState={[1, 0.5]}>
        <Box width={4} height={2} solid={false} color='say "hi"' />
        <Weight mass={250} position={[0.5, -1]} drag={1.5} />
        <RotationalFrame id="pole" position={[0, -1]} key="p">
          <Circle radius={0.3} color={'a&lt;b'} />
          <Line endPos={[3, 0]} lineWidth={0.1} />
        </RotationalFrame>
      </TrackFrame>
      <RotationalFrame id="left">
        <Weight mass={1} position={[1, 0]} />
      </RotationalFrame>
      <RotationalFrame id="right" position={[3, 0]} />
      <FixedFrame id="mount" position={[1, 2]} angle={0.5}>
        <RotationalFrame id="hung">
          <Weight mass={1} position={[1, 0]} />
        </RotationalFrame>
      </FixedFrame>
      <Coincidence
        frame1="left"
        frame2="right"
        position1={[1, 0]}
        position2={null}
      />
      <Gantry span={{ reach: 2, 'lift-off': 0.5 }} />
    </>,
  );
}

/** The demo rig, as one imported composite. */
function demo(): SceneDocument {
  return documentFrom(<CartAndRope />);
}

/** A component the document defines, listed after the scene that uses it. */
function definedLater(): SceneDocument {
  const [arm] = nodesFrom(
    <RotationalFrame position={[1, 0]}>
      <Weight mass={1} position={[2, 0]} />
    </RotationalFrame>,
  );

  return {
    root: 'Scene',
    definitions: [
      {
        name: 'Scene',
        body: nodesFrom(<TrackFrame id="cart" />).map((cart) => ({
          ...cart,
          children: [instance('Arm'), instance('Arm')],
        })),
      },
      { name: 'Arm', body: [arm] },
    ],
  };
}

/** One node with a prop set to `value` -- a value JSX could not have typed. */
function withProp(prop: string, value: unknown): SceneDocument {
  const [box] = nodesFrom(<Box height={2} />);

  return {
    root: 'Scene',
    definitions: [
      {
        name: 'Scene',
        body: [{ ...box, props: { ...box.props, [prop]: value } }],
      },
    ],
  };
}

describe('emitScene', () => {
  test('writes a module that rebuilds the scene, every kind of value included', () => {
    const source = expectRoundTrip(everything());

    // A JSX string attribute has no escapes and decodes character references,
    // so a string with a quote or an ampersand is written as an expression.
    expect(source).toContain('color={"say \\"hi\\""}');
    expect(source).toContain('id={"R&amp;D"}');
    expect(source).toContain('color={"a&lt;b"}');
    expect(source).toContain('key="p"');
    expect(source).toContain('position2={null}');
    expect(source).toContain('span={{ reach: 2, "lift-off": 0.5 }}');
  });

  test('omits a prop equal to its default, and keeps one that is not', () => {
    const { source } = emitScene(
      documentFrom(
        <TrackFrame id="cart">
          <Box width={1} height={2} centered />
        </TrackFrame>,
      ),
    );

    expect(source).toContain('<Box height={2} />');
    expect(source).not.toContain('width');
    expect(source).not.toContain('centered');
  });

  test('writes an undefined prop as absent', () => {
    // What reading `width={cond ? 2 : undefined}` leaves: the prop is there,
    // holding `undefined` -- which every component takes as absent.
    expect(emitScene(withProp('width', undefined)).source).toContain(
      '<Box height={2} />',
    );
  });

  test('imports an imported composite from a module of its own name', () => {
    const source = expectRoundTrip(demo());

    expect(source).toContain("import CartAndRope from './CartAndRope';");
    expect(source).toContain('export default function Scene(): ReactElement');
  });

  test('declares a defined component before what instantiates it', () => {
    const source = expectRoundTrip(definedLater());

    // Listed after `Scene` in the document, declared before it in the file.
    expect(source.indexOf('function Arm()')).toBeLessThan(
      source.indexOf('function Scene()'),
    );
    expect(source).not.toContain('export default function Arm');
  });

  test('writes modules that type-check under the repo settings', () => {
    // The round trips above only parse what they compile. CI runs `tsc`,
    // which is where a module shadowing its own imports, or writing an
    // `undefined` that `exactOptionalPropertyTypes` refuses, would fail to
    // build -- so every module they emit is checked here, in one program.
    const modules = Object.fromEntries(
      Object.entries({ everything, demo, definedLater }).map(([name, doc]) => [
        `Emitted_${name}.tsx`,
        emitScene(doc()).source,
      ]),
    );

    expect(typeCheck({ ...modules, 'Gantry.tsx': GANTRY_MODULE })).toEqual([]);
  }, 60_000);

  test('refuses components that instantiate each other in a cycle', () => {
    const doc: SceneDocument = {
      root: 'A',
      definitions: [
        {
          name: 'A',
          body: [
            { type: { kind: 'defined', name: 'B' }, props: {}, children: [] },
          ],
        },
        {
          name: 'B',
          body: [
            { type: { kind: 'defined', name: 'A' }, props: {}, children: [] },
          ],
        },
      ],
    };

    // Definitions other than the root are visited first, in document order, so
    // the cycle is reported from `B`.
    expect(() => emitScene(doc)).toThrow(/cycle: B -> A -> B\./);
  });

  test('names only the components in a cycle, not the path into it', () => {
    // `C` is visited first and leads into the cycle, but is not part of it.
    const doc: SceneDocument = {
      root: 'Scene',
      definitions: [
        { name: 'C', body: [instance('A')] },
        { name: 'A', body: [instance('B')] },
        { name: 'B', body: [instance('A')] },
        { name: 'Scene', body: [] },
      ],
    };

    expect(() => emitScene(doc)).toThrow(/cycle: A -> B -> A\.$/);
  });

  test('refuses a name the module would bind twice, naming both uses', () => {
    const [box] = nodesFrom(<Box width={2} />);
    const [frame] = nodesFrom(<TrackFrame id="inner" />);

    expect(() =>
      emitScene({
        root: 'Scene',
        definitions: [
          { name: 'Box', body: [frame] },
          { name: 'Scene', body: [box, instance('Box')] },
        ],
      }),
    ).toThrow(
      /'Box' is both a component this scene defines and a building block the module imports/,
    );
    expect(() =>
      emitScene({
        root: 'ReactElement',
        definitions: [{ name: 'ReactElement', body: [frame] }],
      }),
    ).toThrow(
      /'ReactElement' is both a component this scene defines and the type/,
    );

    // Imports against each other: a building block and an imported component,
    // and two different imported components.
    const named = (name: string, id: string): (() => ReactElement) =>
      Object.defineProperty(
        (): ReactElement => <TrackFrame id={id} />,
        'name',
        {
          value: name,
        },
      );
    const Impostor = named('Box', 'c');
    const Twin = named('Twin', 'a');
    const OtherTwin = named('Twin', 'b');

    expect(() =>
      emitScene(
        documentFrom(
          <>
            <Box />
            <Impostor />
          </>,
        ),
      ),
    ).toThrow(/'Box' is both a building block and an imported component/);
    expect(() =>
      emitScene(
        documentFrom(
          <>
            <Twin />
            <OtherTwin />
          </>,
        ),
      ),
    ).toThrow(/Two different imported components are both called 'Twin'/);
  });

  test('refuses a prop that is not plain data, saying where it is', () => {
    expect(() =>
      emitScene(documentFrom(<Weight mass={1} position={[NaN, 0]} />)),
    ).toThrow(
      /Cannot write 'position' on <Weight> at Scene\/0: NaN cannot be written/,
    );
    expect(() => emitScene(withProp('color', () => 'red'))).toThrow(
      /Cannot write 'color' on <Box> at Scene\/0: A value of type function cannot be written/,
    );
  });

  test('refuses a ref, which it could only copy', () => {
    expect(() => emitScene(withProp('ref', { current: null }))).toThrow(
      /Cannot write 'ref' on <Box> at Scene\/0: A ref cannot be written/,
    );
  });

  test('records where each node landed', () => {
    const { source, ranges } = emitScene(
      documentFrom(
        <TrackFrame id="cart">
          <Weight mass={2} />
          <Weight mass={3} />
        </TrackFrame>,
      ),
    );

    // Two elements that differ only in a prop -- which is why the ranges are
    // recorded while writing rather than found by searching afterwards.
    const text = (path: number[]): string => {
      const [start, end] = ranges.get(rangeKey('Scene', path))!;
      return source.slice(start, end);
    };

    expect(text([0, 0])).toBe('<Weight mass={2} />');
    expect(text([0, 1])).toBe('<Weight mass={3} />');
    expect(text([0])).toMatch(/^<TrackFrame id="cart">[\s\S]*<\/TrackFrame>$/);
  });
});

describe('emitScene, numbers', () => {
  test.each([
    [Math.PI, 'Math.PI'],
    [-Math.PI / 2, '-Math.PI / 2'],
    [Math.PI / 3, 'Math.PI / 3'],
    [(3 * Math.PI) / 4, '(3 * Math.PI) / 4'],
    [-Math.PI / 6, '-Math.PI / 6'],
    [(3 * Math.PI) / 8, '(3 * Math.PI) / 8'],
    [(-5 * Math.PI) / 6, '(-5 * Math.PI) / 6'],
    [(5 * Math.PI) / 12, '(5 * Math.PI) / 12'],
    // Its quotient by π comes out a hair under 11: the search rounds, not floors.
    [(11 * Math.PI) / 6, '(11 * Math.PI) / 6'],
    [2 * Math.PI, '2 * Math.PI'],
    [-4 * Math.PI, '-4 * Math.PI'],
  ])('%s is written as %s, which rebuilds it', (angle, text) => {
    const source = expectRoundTrip(
      documentFrom(<Box width={1} height={1} angle={angle} />),
    );

    expect(source).toContain(`angle={${text}}`);
  });

  test.each([
    ['a quarter turn to four places', 1.5708],
    ['a double one step past a quarter turn', Math.PI / 2 + Number.EPSILON],
    ['a multiple past two turns', 5 * Math.PI],
    ['one over a denominator past two turns', (9 * Math.PI) / 2],
    ['a number nowhere near one', -0.6],
  ])('%s is written as it is', (_, angle) => {
    const source = expectRoundTrip(
      documentFrom(<Box width={1} height={1} angle={angle} />),
    );

    expect(source).toContain(`angle={${angle}}`);
  });

  test('a state is written the same way, value and rate', () => {
    const source = expectRoundTrip(
      documentFrom(<RotationalFrame initialState={[Math.PI / 2, 0]} />),
    );

    expect(source).toContain('initialState={[Math.PI / 2, 0]}');
  });
});

describe('emitScene, children', () => {
  const PLACE: DocNode = {
    type: { kind: 'children' },
    props: {},
    children: [],
  };

  /**
   * A pendulum that keeps a place for children in its frame, and a scene
   * hanging one pendulum in another.
   */
  function nested(): SceneDocument {
    const [pendulum] = nodesFrom(
      <RotationalFrame position={[0, -0.5]}>
        <Line endPos={[4, 0]} />
        <Weight mass={10} position={[4, 0]} />
      </RotationalFrame>,
    );

    return {
      root: 'Scene',
      definitions: [
        {
          name: 'Pendulum',
          body: [{ ...pendulum!, children: [...pendulum!.children, PLACE] }],
        },
        {
          name: 'Scene',
          body: [{ ...instance('Pendulum'), children: [instance('Pendulum')] }],
        },
      ],
    };
  }

  test('a component that keeps a place takes `children`, and puts them there', () => {
    const source = expectRoundTrip(nested());

    expect(source).toContain(
      "import type { ReactElement, ReactNode } from 'react';",
    );
    expect(source).toContain(
      'function Pendulum({ children }: { children?: ReactNode }): ReactElement {',
    );
    expect(source).toContain('      {children}\n');
    expect(source).toContain(
      '    <Pendulum>\n      <Pendulum />\n    </Pendulum>\n',
    );
  });

  test('it type-checks as the repo would', () => {
    expect(typeCheck({ 'Scene.tsx': emitScene(nested()).source })).toEqual([]);
  });

  test('a body of nothing but the place writes it in a fragment', () => {
    const source = expectRoundTrip({
      root: 'Scene',
      definitions: [
        { name: 'Pass', body: [PLACE] },
        {
          name: 'Scene',
          body: [
            {
              ...instance('Pass'),
              children: nodesFrom(<RotationalFrame id="r" />),
            },
          ],
        },
      ],
    });

    expect(source).toContain(
      'function Pass({ children }: { children?: ReactNode }): ReactElement {\n' +
        '  return (\n    <>\n      {children}\n    </>\n  );\n}',
    );
  });

  test('a module with no place for children imports no `ReactNode`', () => {
    expect(emitScene(everything()).source).toContain(
      "import type { ReactElement } from 'react';",
    );
  });

  test("the place's range is its `{children}`", () => {
    const { source, ranges } = emitScene(nested());
    const [start, end] = ranges.get(rangeKey('Pendulum', [0, 2]))!;

    expect(source.slice(start, end)).toBe('{children}');
  });
});
