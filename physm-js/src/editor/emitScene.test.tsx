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
import { literalOf, parameterOf, resolvedProps } from './propValue';
import Weight from './../react/Weight';
import buildScene from './../react/buildScene';
import { mul, vec } from './../expression';
import emitScene, { rangeKey } from './emitScene';
import ts from 'typescript';
import {
  definitionOf,
  documentFrom,
  elementOf,
  nodesFrom,
} from './sceneDocument';
import type CoreScene from './../Scene';
import type { DocNode, Parameter, SceneDocument } from './sceneDocument';
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

/**
 * An imported composite taking a tuple, which is the shape a hoisted literal
 * would stop satisfying: a `const` is inferred on its own and widens to
 * `number[]`, where inline the prop's own type named it.
 */
function Strut({ at }: { at: readonly [number, number] }): ReactElement {
  return <Weight mass={1} position={at} />;
}

/** `./Strut` as `tsc` sees it. */
const STRUT_MODULE = `import type { ReactElement } from 'react';

export default function Strut(_props: {
  at: readonly [number, number];
}): ReactElement {
  throw new Error('declared for type-checking only');
}
`;

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
  './Strut': { default: Strut },
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

/** One point, under three tuple-typed props of an imported composite. */
/** One point object, so the props holding it hold *it* and not a copy. */
const AT = [4, 0] as const;

function struts(): SceneDocument {
  return documentFrom(
    <TrackFrame id="cart">
      <Strut at={AT} />
      <Strut at={AT} />
      <Strut at={AT} />
    </TrackFrame>,
  );
}

/**
 * One point carried three times by building blocks and once by an imported
 * component -- so the constant exists, and one use of it must not take it.
 */
function shared(): SceneDocument {
  return documentFrom(
    <RotationalFrame id="arm">
      <Line endPos={AT} lineWidth={0.15} />
      <Circle position={AT} radius={0.5} />
      <Weight mass={10} position={AT} />
      <Strut at={AT} />
    </RotationalFrame>,
  );
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
        body: [{ ...box, props: { ...box.props, [prop]: literalOf(value) } }],
      },
    ],
  };
}

/**
 * A `Pendulum` whose bob hangs at a point the instance passes, instantiated
 * twice at different points -- the case a document of literals cannot express
 * at all. The rod's far end and the weight both refer to it, so one argument
 * moves two props.
 */
function parameterised(withDefault: boolean): SceneDocument {
  const [arm] = nodesFrom(
    <RotationalFrame>
      <Line endPos={[0, -1]} lineWidth={0.1} />
      <Weight mass={3} position={[0, -1]} />
    </RotationalFrame>,
  );
  const [rod, bob] = arm!.children;
  const at = (node: DocNode, prop: string): DocNode => ({
    ...node,
    props: { ...node.props, [prop]: parameterOf('bob') },
  });

  return {
    root: 'Scene',
    definitions: [
      {
        name: 'Scene',
        body: nodesFrom(<TrackFrame id="cart" />).map((cart) => ({
          ...cart,
          children: [
            { ...instance('Pendulum'), props: { bob: literalOf([4, 0]) } },
            withDefault
              ? instance('Pendulum')
              : { ...instance('Pendulum'), props: { bob: literalOf([7, 0]) } },
          ],
        })),
      },
      {
        name: 'Pendulum',
        parameters: [
          {
            name: 'bob',
            type: 'point' as const,
            ...(withDefault ? { default: [9, 0] } : {}),
          },
        ],
        body: [
          {
            ...arm!,
            children: [at(rod!, 'endPos'), at(bob!, 'position')],
          },
        ],
      },
    ],
  };
}

describe('a definition that takes parameters', () => {
  test('two instances at different points build different scenes', () => {
    const scene = buildScene(elementOf(parameterised(false)));
    const [first, second] = scene.frames[0]!.frames;

    // Each instance resolved `bob` against what it was passed, so the two
    // pendulums differ -- which is the whole point of a parameter, and is
    // unreachable by a document that can only hold literals.
    expect(first!.weights[0]!.position[0]).toBeCloseTo(4, 9);
    expect(second!.weights[0]!.position[0]).toBeCloseTo(7, 9);
  });

  test('an instance that passes nothing gets the declared default', () => {
    const scene = buildScene(elementOf(parameterised(true)));
    const [first, second] = scene.frames[0]!.frames;

    expect(first!.weights[0]!.position[0]).toBeCloseTo(4, 9);
    expect(second!.weights[0]!.position[0]).toBeCloseTo(9, 9);
  });

  test('the emitted module takes the parameter and passes it', () => {
    const source = expectRoundTrip(parameterised(false));

    // The signature binds and types it; the body refers to it by name rather
    // than to the number it happened to resolve to; the caller passes one.
    expect(source).toContain(
      'function Pendulum({ bob }: { bob: readonly [number, number] }): ReactElement',
    );
    expect(source).toContain('endPos={bob}');
    expect(source).toContain('<Pendulum bob={[4, 0]} />');
    expect(source).toContain('<Pendulum bob={[7, 0]} />');

    // And nowhere does the reference get flattened into its argument.
    expect(source).not.toContain('endPos={[4, 0]}');
  });

  test('a default is optional to the caller and defaulted in the signature', () => {
    const source = expectRoundTrip(parameterised(true));

    expect(source).toContain(
      'function Pendulum({ bob = [9, 0] }: { bob?: readonly [number, number] }): ReactElement',
    );
    expect(source).toContain('<Pendulum />');
  });

  test('an argument explicitly undefined falls to the declared default', () => {
    // `<Pendulum bob={undefined} />` leaves the prop present and holding
    // nothing, which is a state `literalProps` genuinely produces. A spread
    // would copy that `undefined` over the default beneath it, where the
    // emitted `{ bob = [9, 0] }` is triggered by exactly that `undefined` --
    // so the round trip is what catches the two disagreeing.
    const declared = parameterised(true);
    const doc: SceneDocument = {
      ...declared,
      definitions: declared.definitions.map((definition) =>
        definition.name === 'Scene'
          ? {
              ...definition,
              body: definition.body.map((cart) => ({
                ...cart,
                children: cart.children.map((child, index) =>
                  index === 1
                    ? { ...child, props: { bob: literalOf(undefined) } }
                    : child,
                ),
              })),
            }
          : definition,
      ),
    };
    const scene = buildScene(elementOf(doc));

    expect(scene.frames[0]!.frames[1]!.weights[0]!.position[0]).toBeCloseTo(
      9,
      9,
    );
    expectRoundTrip(doc);
  });

  test('every parameter type is written, and the module type-checks', () => {
    const doc: SceneDocument = {
      root: 'Scene',
      definitions: [
        {
          name: 'Scene',
          body: [{ ...instance('Dial'), props: { turn: literalOf(0.5) } }],
        },
        {
          name: 'Dial',
          parameters: [
            { name: 'turn', type: 'angle', default: 0 },
            { name: 'span', type: 'scalar', default: 1 },
            { name: 'steps', type: 'integer', default: 2 },
            { name: 'at', type: 'point', default: [0, 0] },
            { name: 'tag', type: 'label', default: 'dial' },
          ],
          body: nodesFrom(<RotationalFrame />).map((frame) => ({
            ...frame,
            props: { id: parameterOf('tag'), stiffness: parameterOf('span') },
          })),
        },
      ],
    };
    const { source } = emitScene(doc);

    expect(source).toContain(
      'function Dial({ turn = 0, span = 1, steps = 2, at = [0, 0], tag = "dial" }: ' +
        '{ turn?: number; span?: number; steps?: number; ' +
        'at?: readonly [number, number]; tag?: string }): ReactElement',
    );
    expect(typeCheck({ 'Scene.tsx': source })).toEqual([]);
  });
});

describe('a parameter the emitter cannot write', () => {
  /** A `Dial` declaring `parameters`, instantiated once by the scene. */
  const declaring = (parameters: readonly Parameter[]): SceneDocument => ({
    root: 'Scene',
    definitions: [
      { name: 'Scene', body: [instance('Dial')] },
      { name: 'Dial', parameters, body: nodesFrom(<RotationalFrame />) },
    ],
  });

  test("'children' is refused, because a component's children are bound as it", () => {
    expect(() =>
      emitScene(declaring([{ name: 'children', type: 'label' }])),
    ).toThrow(/'children' cannot be a parameter name/);
  });

  test('a name the module already binds is refused', () => {
    // The body writes `<RotationalFrame />`, so a parameter of that name would
    // resolve the tag to the parameter -- the same failure a definition name
    // shadowing an import is refused for.
    expect(() =>
      emitScene(declaring([{ name: 'RotationalFrame', type: 'label' }])),
    ).toThrow(/the module already binds it/);
  });

  test('a name that is not an identifier is refused, and so is a repeat', () => {
    expect(() =>
      emitScene(declaring([{ name: 'half-length', type: 'scalar' }])),
    ).toThrow(/is not an identifier|bound as an identifier/);
    expect(() =>
      emitScene(
        declaring([
          { name: 'span', type: 'scalar' },
          { name: 'span', type: 'label' },
        ]),
      ),
    ).toThrow(/declared twice/);
  });

  test('a hoisted constant is named around the parameters, not over them', () => {
    // A repeated value is lifted to the module and named after the prop that
    // carries it -- and a parameter of that name would shadow the constant
    // inside the one function that names it.
    const doc: SceneDocument = {
      root: 'Scene',
      definitions: [
        { name: 'Scene', body: [instance('Dial')] },
        {
          name: 'Dial',
          parameters: [{ name: 'POSITION', type: 'scalar', default: 1 }],
          body: nodesFrom(
            <RotationalFrame>
              <Weight mass={1} position={AT} />
              <Weight mass={2} position={AT} />
              <Weight mass={3} position={AT} />
            </RotationalFrame>,
          ),
        },
      ],
    };
    const { source } = emitScene(doc);

    expect(source).toMatch(/^const POSITION_2 = \[4, 0\];$/m);
    expect(source).not.toMatch(/^const POSITION = /m);
  });

  test('a JavaScript keyword is refused, and so is a built-in it would shadow', () => {
    // The document refuses these while a person can still fix one; this is the
    // same check for a document that arrived already holding one, and without
    // it the emitted module does not parse.
    expect(() =>
      emitScene(declaring([{ name: 'default', type: 'scalar' }])),
    ).toThrow(/JavaScript keyword/);
    expect(() =>
      emitScene(declaring([{ name: 'Array', type: 'scalar' }])),
    ).toThrow(/generated code may use the built-in/);
  });

  test('a reference to a parameter the definition does not take is refused', () => {
    const doc: SceneDocument = {
      root: 'Scene',
      definitions: [
        { name: 'Scene', body: [instance('Dial')] },
        {
          name: 'Dial',
          body: nodesFrom(<RotationalFrame />).map((frame) => ({
            ...frame,
            props: { id: parameterOf('tag') },
          })),
        },
      ],
    };

    expect(() => emitScene(doc)).toThrow(
      /refers to 'tag', which Dial does not take/,
    );
  });
});

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
      Object.entries({ everything, demo, definedLater, struts, shared }).map(
        ([name, doc]) => [`Emitted_${name}.tsx`, emitScene(doc()).source],
      ),
    );

    expect(
      typeCheck({
        ...modules,
        'Gantry.tsx': GANTRY_MODULE,
        'Strut.tsx': STRUT_MODULE,
      }),
    ).toEqual([]);
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

  test('refuses a name it cannot write even where the value has one', () => {
    // A prop whose value the module holds by name never reaches `attribute`,
    // so the two refusals in there had to come out of it: whether a prop is
    // checked must not depend on whether its value is shared with another.
    // Both are reachable from ordinary JSX -- on React 19 a `ref` arrives in
    // `props` like any other prop.
    const shared = (prop: string, value: unknown): SceneDocument => {
      const held = literalOf(value);
      const [frame] = nodesFrom(
        <RotationalFrame id="arm">
          <Box width={1} height={1} />
          <Circle radius={1} />
        </RotationalFrame>,
      );

      return {
        root: 'Scene',
        definitions: [
          {
            name: 'Scene',
            body: [
              {
                ...frame!,
                children: frame!.children.map((child) => ({
                  ...child,
                  props: { ...child.props, [prop]: held },
                })),
              },
            ],
          },
        ],
      };
    };

    expect(() => emitScene(shared('ref', { current: null }))).toThrow(
      /A ref cannot be written/,
    );

    // `const DATA-FOO = …` is a module that does not parse, which is worse
    // than one that says the wrong thing.
    expect(() => emitScene(shared('data-foo', { a: 1 }))).toThrow(
      /'data-foo' cannot be written as a JSX attribute/,
    );

    // A value the emitter cannot write is no candidate for a name either.
    // Named, the `const` write would throw from outside the per-node `try`,
    // and the error would arrive without the node it came from.
    expect(() => emitScene(shared('color', { at: () => 1 }))).toThrow(
      /Cannot write 'color' on <Box> at Scene\/0\.0:/,
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

describe('emitScene, repeated values', () => {
  test('a value held in more than one place is named, and used by name', () => {
    const source = expectRoundTrip(
      documentFrom(
        <RotationalFrame id="arm">
          <Line endPos={AT} lineWidth={0.15} />
          <Circle position={AT} radius={0.5} />
          <Weight mass={10} position={AT} />
        </RotationalFrame>,
      ),
    );

    // The name a person wrote is gone with the rest of how the file was
    // written, so it comes from the prop that carries the value -- the most
    // common of them, which is `position` here rather than `endPos`.
    expect(source).toContain('const POSITION = [4, 0];');
    expect(source).toContain('endPos={POSITION}');
    expect(source).toContain('position={POSITION}');
    expect(source).not.toContain('[4, 0]}');
  });

  test('two props that agree are two values, however many of them there are', () => {
    const source = expectRoundTrip(
      documentFrom(
        <RotationalFrame id="arm">
          <Line endPos={[4, 0]} lineWidth={0.15} />
          <Circle position={[4, 0]} radius={0.5} />
          <Weight mass={10} position={[4, 0]} />
        </RotationalFrame>,
      ),
    );

    // The same three props as above, written out rather than sharing one
    // point. Nothing in that source says they are one value, so nothing here
    // says so either -- where counting uses would have named all three
    // together at the third.
    expect(source).not.toContain('const ');
    expect(source).toContain('endPos={[4, 0]}');
    expect(source).toContain('position={[4, 0]}');
  });

  test('a value shared twice is named, which a guess needed three for', () => {
    const source = expectRoundTrip(
      documentFrom(
        <RotationalFrame id="arm">
          <Line endPos={AT} lineWidth={0.15} />
          <Circle position={AT} radius={0.5} />
        </RotationalFrame>,
      ),
    );

    // A guess needs corroboration and a fact does not: two props holding one
    // node say they are one value as plainly as three would.
    expect(source).toContain('const END_POS = [4, 0];');
    expect(source).toContain('position={END_POS}');
  });

  test('what is written once, and what is not compound, stays where it is', () => {
    const source = expectRoundTrip(
      documentFrom(
        <TrackFrame id="cart">
          <Weight mass={2} position={[1, 0]} />
          <Weight mass={2} />
          <Weight mass={2} />
        </TrackFrame>,
      ),
    );

    // Two weights of the same mass are two masses that agree, not one value
    // written twice -- and a point written once is not worth a name.
    expect(source).not.toContain('const ');
    expect(source).toContain('mass={2}');
    expect(source).toContain('position={[1, 0]}');
  });

  test('the sharing survives the round trip, which is what names it', () => {
    const doc = documentFrom(
      <RotationalFrame id="arm">
        <Line endPos={AT} lineWidth={0.15} />
        <Weight mass={10} position={AT} />
      </RotationalFrame>,
    );
    const Root = evaluate(emitScene(doc).source);
    const again = documentFrom(Root());
    const [line, weight] = again.definitions[0]!.body[0]!.children;

    // Read back, the emitted `const POSITION` is one binding in two props, so
    // the document records the same sharing it started with. Losing it here
    // would mean a document degraded a little on every pass through source.
    expect(line!.props.endPos).toBe(weight!.props.position);
  });

  test('a coincidence stays a coincidence', () => {
    const source = expectRoundTrip(
      documentFrom(
        <TrackFrame id="cart" position={[12, -0.5]}>
          <Line startPos={[-12, -0.5]} endPos={[12, -0.5]} lineWidth={0.05} />
        </TrackFrame>,
      ),
    );

    // The demo's own: a cart dragged onto the ground line's end. Equal values
    // arrived at separately, which naming together would have said were one
    // -- and a later drag of either would have had to take it back.
    expect(source).not.toContain('const ');
    expect(source).toContain('position={[12, -0.5]}');
    expect(source).toContain('endPos={[12, -0.5]}');
  });

  test('what an imported component is given is left alone', () => {
    const source = expectRoundTrip(struts());

    // One point in three props, and still inline: the emitter cannot see
    // `Strut`'s types, and a hoisted `const AT = [4, 0]` widens to `number[]`,
    // which its tuple-typed prop would refuse. The type-check test emits this
    // one too.
    expect(source).not.toContain('const ');
    expect(source).toContain('at={[4, 0]}');
  });

  test('a constant stops at the components whose types are known', () => {
    const source = expectRoundTrip(shared());

    // The building blocks take the name; the imported component keeps the
    // literal, because `const POSITION = [4, 0]` is inferred on its own and
    // widens to `number[]`, which its tuple-typed prop would refuse. The
    // type-check test emits this document too, which is where that would show.
    expect(source).toContain('const POSITION = [4, 0];');
    expect(source).toContain('endPos={POSITION}');
    expect(source).toContain('position={POSITION}');
    expect(source).toContain('at={[4, 0]}');
  });

  test('a tie between prop names goes the same way every time', () => {
    const tip = [2, 0] as const;
    const source = expectRoundTrip(
      documentFrom(
        <>
          <RotationalFrame id="a">
            <Line endPos={tip} lineWidth={0.1} />
            <Circle position={tip} radius={0.3} />
          </RotationalFrame>
          <RotationalFrame id="b">
            <Line endPos={tip} lineWidth={0.1} />
            <Weight mass={1} position={tip} />
          </RotationalFrame>
        </>,
      ),
    );

    // Counted across the whole module, this point is two `endPos` and two
    // `position`. A tie goes alphabetically, so the same document emits the
    // same file rather than whichever name the walk reached first.
    expect(source).toContain('const END_POS = [2, 0];');
    expect(source).toContain('position={END_POS}');
  });

  test('the name steps aside for one the module already binds', () => {
    // The root is the one definition nothing instantiates, so a walk of the
    // tags never meets its name -- and a module declaring `const POSITION`
    // beside `function POSITION()` would not even evaluate.
    const [arm] = nodesFrom(
      <RotationalFrame id="arm">
        <Line endPos={AT} lineWidth={0.15} />
        <Circle position={AT} radius={0.5} />
        <Weight mass={10} position={AT} />
      </RotationalFrame>,
    );
    const source = expectRoundTrip({
      root: 'POSITION',
      definitions: [{ name: 'POSITION', body: [arm!] }],
    });

    expect(source).toContain('function POSITION(');
    expect(source).toContain('const POSITION_2 = [4, 0];');
    expect(source).toContain('position={POSITION_2}');
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

describe('a prop the document computes', () => {
  /** A `Pendulum` whose bob hangs at twice what the instance passes. */
  const computing = (): SceneDocument => {
    const [arm] = nodesFrom(
      <RotationalFrame>
        <Line endPos={[0, -1]} lineWidth={0.1} />
        <Weight mass={3} position={[0, -1]} />
      </RotationalFrame>,
    );
    const [rod, bob] = arm!.children;
    const reach = mul(parameterOf('half'), 2);

    return {
      root: 'Scene',
      definitions: [
        {
          name: 'Scene',
          body: nodesFrom(<TrackFrame id="cart" />).map((cart) => ({
            ...cart,
            children: [
              { ...instance('Pendulum'), props: { half: literalOf(2) } },
              { ...instance('Pendulum'), props: { half: literalOf(5) } },
            ],
          })),
        },
        {
          name: 'Pendulum',
          parameters: [{ name: 'half', type: 'scalar' }],
          body: [
            {
              ...arm!,
              children: [
                { ...rod!, props: { ...rod!.props, endPos: vec(reach, 0) } },
                { ...bob!, props: { ...bob!.props, position: vec(reach, 0) } },
              ],
            },
          ],
        },
      ],
    };
  };

  test("a reference inside an expression finds the instance's argument", () => {
    const scene = buildScene(elementOf(computing()));
    const [first, second] = scene.frames[0]!.frames;

    // Resolution goes into the graph: `mul(half, 2)` holds the reference as an
    // operand, so stopping at the prop would hand the node to an operation.
    expect(first!.weights[0]!.position[0]).toBeCloseTo(4, 9);
    expect(second!.weights[0]!.position[0]).toBeCloseTo(10, 9);
  });

  test('the emitted module writes the call, not the value it folds to', () => {
    const source = expectRoundTrip(computing());

    // What a prop is computed *from* is what the module says, the same way the
    // document does -- and the operations come from the binding beside the
    // components that use them.
    expect(source).toContain('endPos={vec(mul(half, 2), 0)}');
    expect(source).toContain('position={vec(mul(half, 2), 0)}');
    expect(source).toMatch(
      /^import \{ Line, RotationalFrame, TrackFrame, Weight, mul, vec \} from '\.\/react';$/m,
    );
    expect(source).not.toContain('endPos={[4, 0]}');
  });

  test('it type-checks as the repo would', () => {
    expect(typeCheck({ 'Scene.tsx': emitScene(computing()).source })).toEqual(
      [],
    );
  });

  test('a reference the definition does not take is refused inside one too', () => {
    const doc: SceneDocument = {
      root: 'Scene',
      definitions: [
        { name: 'Scene', body: [instance('Dial')] },
        {
          name: 'Dial',
          body: nodesFrom(<RotationalFrame />).map((frame) => ({
            ...frame,
            props: { position: vec(mul(parameterOf('reach'), 2), 0) },
          })),
        },
      ],
    };

    expect(() => emitScene(doc)).toThrow(
      /refers to 'reach', which Dial does not take/,
    );
  });

  test('a shared subexpression stays one node through resolution', () => {
    // What the document says is that these two props hold *one* computation.
    // Rebuilding the graph per prop would lose that, and with it the fold over
    // nodes rather than edges.
    const doc = computing();
    const arm = definitionOf(doc, 'Pendulum').body[0]!;
    const [rod, bob] = arm.children;

    const operandsOf = (held: unknown): unknown[] =>
      (held as { operands: unknown[] }).operands;

    expect(operandsOf(rod!.props.endPos)[0]).toBe(
      operandsOf(bob!.props.position)[0],
    );

    const resolved = resolvedProps(
      { a: rod!.props.endPos!, b: bob!.props.position! },
      { half: 2 },
    );

    expect(operandsOf(resolved.a)[0]).toBe(operandsOf(resolved.b)[0]);
  });
});
