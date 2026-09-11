import * as binding from './index';
import RotationalFrame from './RotationalFrame';
import Weight from './Weight';
import buildScene from './buildScene';
import coreComponents from './coreComponents';
import { canContain } from './componentMeta';
import { createElement } from 'react';
import type CoreScene from './../Scene';
import type { ComponentMeta } from './componentMeta';
import type { FunctionComponent, ReactNode } from 'react';

/** A core component, seen as the editor sees it: a function with a `meta`. */
type Described = FunctionComponent<Record<string, unknown>> & {
  meta: ComponentMeta<Record<string, unknown>>;
};

const described = coreComponents as unknown as readonly Described[];

/**
 * The props a component cannot be built without.
 *
 * Taken from each required prop's `initial`, so the test also shows that what
 * an editor would insert actually builds. Constraint ends have no sensible
 * `initial` -- a person has to pick what to join -- so they point at the two
 * frames `host` provides.
 */
function requiredProps(meta: Described['meta']): Record<string, unknown> {
  const ends: Record<string, string> = { frame1: 'a', frame2: 'b' };

  return Object.fromEntries(
    Object.entries(meta.props)
      .filter(([, spec]) => spec.required)
      .map(([name, spec]) => [
        name,
        spec.kind === 'end' ? ends[name] : spec.initial,
      ]),
  );
}

/** A minimal scene the element can legally sit in. */
function host(meta: Described['meta'], element: ReactNode): ReactNode {
  switch (meta.slot) {
    case 'frame':
      return element;
    case 'constraint':
      return (
        <>
          <RotationalFrame id="a" initialState={[0.3, 0]}>
            <Weight mass={1} position={[1, 0]} />
          </RotationalFrame>
          <RotationalFrame id="b" position={[3, 0]}>
            <Weight mass={1} position={[1, 0]} />
          </RotationalFrame>
          {element}
        </>
      );
    default:
      return <RotationalFrame id="host">{element}</RotationalFrame>;
  }
}

/**
 * Everything a scene holds, in comparable form.
 *
 * `toJsonObj` omits decals, and constraints are compared by their own
 * serialization, so each gets a field of its own -- otherwise a component whose
 * props only reach a decal or a constraint could be described wrongly and still
 * compare equal.
 */
function snapshot(scene: CoreScene): unknown {
  return {
    json: scene.toJsonObj(),
    decals: [scene.decals, ...scene.sortedFrames.map((frame) => frame.decals)],
    constraints: scene.constraints.map((constraint) => constraint.toJsonObj()),
  };
}

describe('component metadata', () => {
  test('every building block the binding exports is described and listed', () => {
    const exported = Object.entries(binding).filter(
      ([, value]) => typeof value === 'function' && 'sceneNode' in value,
    );

    expect(exported.map(([name]) => name).sort()).toEqual(
      described.map((component) => component.meta.name).sort(),
    );

    // And the name is the one the component is imported by, which is what
    // generated source will write as the tag.
    for (const [name, component] of exported) {
      expect((component as unknown as Described).meta.name).toBe(name);
    }
  });

  test('a required prop has no default, and says what to start with', () => {
    for (const { meta } of described) {
      for (const [name, spec] of Object.entries(meta.props)) {
        if (!spec.required) {
          continue;
        }

        expect([meta.name, name, spec.default]).toEqual([
          meta.name,
          name,
          undefined,
        ]);
        if (spec.kind !== 'end') {
          expect([meta.name, name, spec.initial]).not.toEqual([
            meta.name,
            name,
            undefined,
          ]);
        }
      }
    }
  });

  test('what an editor would insert builds', () => {
    for (const component of described) {
      const { meta } = component;

      expect(() =>
        buildScene(host(meta, createElement(component, requiredProps(meta)))),
      ).not.toThrow();
    }
  });

  test('canContain agrees with the builders about the root', () => {
    // Stated rules and enforced rules have to be the same rules, or the
    // editor would offer an insertion the build then refuses.
    for (const component of described) {
      const { meta } = component;
      const element = createElement(component, requiredProps(meta));
      const atRoot = meta.slot === 'constraint' ? host(meta, element) : element;

      const builds = (() => {
        try {
          buildScene(atRoot);
          return true;
        } catch {
          return false;
        }
      })();

      expect([meta.name, builds]).toEqual([
        meta.name,
        canContain('root', meta.slot),
      ]);
    }

    // And only a frame has children at all.
    expect(canContain('frame', 'weight')).toBe(true);
    expect(canContain('decal', 'frame')).toBe(false);
    expect(canContain('weight', 'decal')).toBe(false);
  });

  // One test per declared default. A default that is wrong -- a Box that
  // actually defaults to width 2, say -- makes the stated rig differ from the
  // omitted one, and generated source that elides it would silently build a
  // different scene.
  for (const component of described) {
    const { meta } = component;
    for (const [name, spec] of Object.entries(meta.props)) {
      if (spec.default === undefined) {
        continue;
      }

      test(`${meta.name}'s ${name} defaults to ${JSON.stringify(spec.default)}`, () => {
        const base = requiredProps(meta);
        const omitted = buildScene(host(meta, createElement(component, base)));
        const stated = buildScene(
          host(
            meta,
            createElement(component, { ...base, [name]: spec.default }),
          ),
        );

        expect(snapshot(stated)).toEqual(snapshot(omitted));
      });
    }
  }
});
