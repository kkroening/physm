import * as React from 'react';
import * as binding from './../react';
import * as cartAndRopeModule from './../CartAndRope';
import * as jsxRuntime from 'react/jsx-runtime';
import Box from './../react/Box';
import CartAndRope from './../CartAndRope';
import Circle from './../react/Circle';
import Line from './../react/Line';
import RotationalFrame from './../react/RotationalFrame';
import TrackFrame from './../react/TrackFrame';
import Weight from './../react/Weight';
import buildScene from './../react/buildScene';
import emitScene, { rangeKey } from './emitScene';
import ts from 'typescript';
import { documentFrom, elementOf, nodesFrom } from './sceneDocument';
import type CoreScene from './../Scene';
import type { ReactElement } from 'react';
import type { SceneDocument } from './sceneDocument';

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
};

/**
 * Compile an emitted module and run it, returning its default export.
 *
 * This is the half of the round trip the ordinary toolchain does -- the same
 * compiler the repo builds with, set to the repo's JSX transform -- so a module
 * that passes here is one that would build if pasted into `src/`.
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

/** A scene with frame ids replaced by position, plus its decals. */
function normalized(scene: CoreScene): unknown {
  const labels = new Map(
    scene.sortedFrames.map((frame, index) => [frame.id, `#${index}`]),
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

describe('emitScene', () => {
  test('writes a module that rebuilds the scene, every kind of value included', () => {
    const source = expectRoundTrip(
      documentFrom(
        <TrackFrame id="cart" angle={0.25} initialState={[1, 0.5]}>
          <Box width={4} height={2} solid={false} color='say "hi"' />
          <Weight mass={250} position={[0.5, -1]} drag={1.5} />
          <RotationalFrame id="pole" position={[0, -1]} key="p">
            <Circle radius={0.3} />
            <Line endPos={[3, 0]} lineWidth={0.1} />
          </RotationalFrame>
        </TrackFrame>,
      ),
    );

    // A string with a quote in it cannot go in a JSX string attribute, which
    // has no escapes -- so it is written as an expression.
    expect(source).toContain('color={"say \\"hi\\""}');
    expect(source).toContain('key="p"');
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

  test('imports an imported composite from a module of its own name', () => {
    const source = expectRoundTrip(documentFrom(<CartAndRope />));

    expect(source).toContain("import CartAndRope from './CartAndRope';");
    expect(source).toContain('export default function Scene(): ReactElement');
  });

  test('declares a defined component before what instantiates it', () => {
    const [arm] = nodesFrom(
      <RotationalFrame position={[1, 0]}>
        <Weight mass={1} position={[2, 0]} />
      </RotationalFrame>,
    );
    const instance = {
      type: { kind: 'defined' as const, name: 'Arm' },
      props: {},
      children: [],
    };
    const doc: SceneDocument = {
      root: 'Scene',
      definitions: [
        {
          name: 'Scene',
          body: nodesFrom(<TrackFrame id="cart" />).map((cart) => ({
            ...cart,
            children: [instance, instance],
          })),
        },
        { name: 'Arm', body: [arm!] },
      ],
    };

    const source = expectRoundTrip(doc);

    // Listed after `Scene` in the document, declared before it in the file.
    expect(source.indexOf('function Arm()')).toBeLessThan(
      source.indexOf('function Scene()'),
    );
    expect(source).not.toContain('export default function Arm');
  });

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

  test('refuses a prop that is not plain data', () => {
    expect(() =>
      emitScene(documentFrom(<Weight mass={1} position={[NaN, 0]} />)),
    ).toThrow(/NaN cannot be written/);
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
