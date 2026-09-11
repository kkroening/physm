import Anchor from './../react/Anchor';
import Coincidence from './../react/Coincidence';
import Line from './../react/Line';
import RotationalFrame from './../react/RotationalFrame';
import TrackFrame from './../react/TrackFrame';
import Weight from './../react/Weight';
import starterDocument from './starterDocument';
import { extractComponent, insertNode, removeNode } from './sceneDocument';
import { insertionPoint, newNode, refusalOf } from './insertion';
import type {
  ComponentRef,
  CoreComponent,
  DocNode,
  SceneDocument,
} from './sceneDocument';

/** A building block, as a document refers to it. */
function core(component: unknown): ComponentRef {
  return { kind: 'core', component: component as CoreComponent };
}

/** An instance of a component the document defines. */
function defined(name: string): ComponentRef {
  return { kind: 'defined', name };
}

describe('insertionPoint', () => {
  // Scene: [Line, TrackFrame [Box, Weight, Pendulum]].
  const doc = starterDocument();

  test('with nothing selected, the end of the body', () => {
    expect(insertionPoint(doc, 'Scene', null)).toEqual({
      parent: [],
      index: 2,
      holder: 'root',
    });
  });

  test('with a frame selected, inside it after its last child', () => {
    expect(insertionPoint(doc, 'Scene', [1])).toEqual({
      parent: [1],
      index: 3,
      holder: 'frame',
    });
  });

  test('with anything else selected, just after it among its siblings', () => {
    expect(insertionPoint(doc, 'Scene', [1, 0])).toEqual({
      parent: [1],
      index: 1,
      holder: 'frame',
    });
    expect(insertionPoint(doc, 'Scene', [0])).toEqual({
      parent: [],
      index: 1,
      holder: 'root',
    });
  });
});

describe('refusalOf', () => {
  const doc = starterDocument();
  const atRoot = insertionPoint(doc, 'Scene', null);
  const inCart = insertionPoint(doc, 'Scene', [1]);

  test('refuses at the root what the builders refuse there', () => {
    expect(refusalOf(doc, 'Scene', atRoot, core(Weight))).toMatch(
      /Weight has to go inside a frame/,
    );
    expect(refusalOf(doc, 'Scene', atRoot, core(Anchor))).toMatch(
      /Anchor has to go inside a frame/,
    );
    expect(refusalOf(doc, 'Scene', atRoot, core(Line))).toBeNull();
    expect(refusalOf(doc, 'Scene', atRoot, core(Coincidence))).toBeNull();
    expect(refusalOf(doc, 'Scene', inCart, core(Weight))).toBeNull();
  });

  test('refuses a defined component inside itself', () => {
    const inPendulum = insertionPoint(doc, 'Pendulum', null);

    expect(refusalOf(doc, 'Pendulum', inPendulum, defined('Pendulum'))).toMatch(
      /Pendulum cannot go inside itself/,
    );
    expect(refusalOf(doc, 'Scene', inCart, defined('Pendulum'))).toBeNull();
  });

  test('refuses a defined component inside one it contains, at any depth', () => {
    const instance = (name: string) => ({
      type: defined(name),
      props: {},
      children: [],
    });
    // A contains B, which contains C: A inside C would recurse through both.
    const chain: SceneDocument = {
      root: 'A',
      definitions: [
        { name: 'A', body: [instance('B')] },
        { name: 'B', body: [instance('C')] },
        { name: 'C', body: [] },
      ],
    };

    expect(
      refusalOf(chain, 'C', insertionPoint(chain, 'C', null), defined('A')),
    ).toMatch(/A cannot go inside C, which it contains/);
    expect(
      refusalOf(chain, 'A', insertionPoint(chain, 'A', null), defined('C')),
    ).toBeNull();
  });
});

describe('refusalOf, for ids', () => {
  test('refuses a second instance of a component that names ids', () => {
    // Ids are scene-wide, so a second instance would repeat them.
    const doc = extractComponent(starterDocument(), 'Scene', [1], 'Cart');
    const atRoot = insertionPoint(doc, 'Scene', null);

    expect(refusalOf(doc, 'Scene', atRoot, defined('Cart'))).toMatch(
      /Cart names 'cart', which would then appear twice in the scene/,
    );
    // Pendulum, now inside Cart, names none.
    expect(refusalOf(doc, 'Scene', atRoot, defined('Pendulum'))).toBeNull();

    // The first instance is fine: nothing is repeated yet.
    const unused = removeNode(doc, 'Scene', [1]);

    expect(
      refusalOf(
        unused,
        'Scene',
        insertionPoint(unused, 'Scene', null),
        defined('Cart'),
      ),
    ).toBeNull();
  });
});

describe('refusalOf, for ids already in use', () => {
  test('refuses even a first instance whose ids the scene already uses', () => {
    const frame = (id: string) => ({
      type: core(TrackFrame),
      props: { id },
      children: [],
    });
    const doc: SceneDocument = {
      root: 'Scene',
      definitions: [
        { name: 'Scene', body: [frame('cart')] },
        // Never instantiated, but its `cart` would meet the scene's.
        { name: 'Arm', body: [frame('cart')] },
        { name: 'Spare', body: [frame('spare')] },
      ],
    };
    const atRoot = insertionPoint(doc, 'Scene', null);

    expect(refusalOf(doc, 'Scene', atRoot, defined('Arm'))).toMatch(
      /Arm names 'cart', which would then appear twice in the scene/,
    );
    expect(refusalOf(doc, 'Scene', atRoot, defined('Spare'))).toBeNull();
  });
});

/** A node of a building block, with the props given. */
function nodeOf(
  component: unknown,
  props: Record<string, unknown> = {},
): DocNode {
  return { type: core(component), props, children: [] };
}

/** An instance of a component the document defines. */
function instanceOf(name: string): DocNode {
  return { type: defined(name), props: {}, children: [] };
}

describe('refusalOf, through the expansion', () => {
  test('counts what the scene reaches, not where the document writes it', () => {
    const doc: SceneDocument = {
      root: 'Scene',
      definitions: [
        { name: 'Scene', body: [instanceOf('Wheel'), instanceOf('Wheel')] },
        { name: 'Wheel', body: [nodeOf(RotationalFrame)] },
        { name: 'Hub', body: [nodeOf(TrackFrame, { id: 'hub' })] },
        // Placed nowhere, so their shared id collides nowhere yet.
        { name: 'Arm', body: [nodeOf(TrackFrame, { id: 'cart' })] },
        { name: 'Leg', body: [nodeOf(TrackFrame, { id: 'cart' })] },
      ],
    };

    // Wheel appears twice in the scene, so one Hub in it is two there.
    expect(
      refusalOf(
        doc,
        'Wheel',
        insertionPoint(doc, 'Wheel', null),
        defined('Hub'),
      ),
    ).toMatch(/Hub names 'hub', which would then appear twice in the scene/);
    expect(
      refusalOf(
        doc,
        'Scene',
        insertionPoint(doc, 'Scene', null),
        defined('Arm'),
      ),
    ).toBeNull();
  });

  test('refuses a second copy of a component whose constraint reaches outside it', () => {
    const frames = [
      nodeOf(TrackFrame, { id: 'a' }),
      nodeOf(TrackFrame, { id: 'b' }),
    ];
    const weld = {
      name: 'Weld',
      body: [nodeOf(Coincidence, { frame1: 'a', frame2: 'b' })],
    };
    const placed: SceneDocument = {
      root: 'Scene',
      definitions: [
        { name: 'Scene', body: [...frames, instanceOf('Weld')] },
        weld,
      ],
    };
    const unplaced: SceneDocument = {
      root: 'Scene',
      definitions: [{ name: 'Scene', body: frames }, weld],
    };

    expect(
      refusalOf(
        placed,
        'Scene',
        insertionPoint(placed, 'Scene', null),
        defined('Weld'),
      ),
    ).toMatch(/Weld holds a constraint on 'a', outside itself/);
    expect(
      refusalOf(
        unplaced,
        'Scene',
        insertionPoint(unplaced, 'Scene', null),
        defined('Weld'),
      ),
    ).toBeNull();
  });
});

describe('newNode', () => {
  test('starts required props at their initial values, and nothing else', () => {
    expect(newNode(core(Weight)).props).toEqual({ mass: 1 });
    expect(newNode(core(Line)).props).toEqual({ endPos: [1, 0] });
    // Which two things a constraint joins is the person's to pick.
    expect(newNode(core(Coincidence)).props).toStrictEqual({});
    expect(newNode(defined('Pendulum'))).toEqual({
      type: defined('Pendulum'),
      props: {},
      children: [],
    });
  });
});

describe('insertion, a component that keeps a place for children', () => {
  const PLACE: DocNode = {
    type: { kind: 'children' },
    props: {},
    children: [],
  };

  /** The starter scene with every place for children taken out. */
  function bare(): SceneDocument {
    const strip = (nodes: readonly DocNode[]): DocNode[] =>
      nodes
        .filter(({ type }) => type.kind !== 'children')
        .map((node) => ({ ...node, children: strip(node.children) }));
    const doc = starterDocument();

    return {
      ...doc,
      definitions: doc.definitions.map((definition) => ({
        ...definition,
        body: strip(definition.body),
      })),
    };
  }

  /**
   * The starter scene, with the pendulum's place for children in its frame --
   * or, with `atTop`, at the top of its body.
   */
  function withPlace(atTop = false): SceneDocument {
    const doc = bare();

    return {
      ...doc,
      definitions: doc.definitions.map((definition) => {
        const [frame] = definition.body;
        if (definition.name !== 'Pendulum' || !frame) {
          return definition;
        }

        return atTop
          ? { ...definition, body: [...definition.body, PLACE] }
          : {
              ...definition,
              body: [{ ...frame, children: [...frame.children, PLACE] }],
            };
      }),
    };
  }

  // Scene: [Line, TrackFrame [Box, Weight, Pendulum]].
  test("the starter's pendulum takes children, in the fixed frame at its bob", () => {
    // Scene: [Line, TrackFrame [Box, Weight, FixedFrame [Pendulum]]].
    expect(insertionPoint(starterDocument(), 'Scene', [1, 2, 0])).toEqual({
      parent: [1, 2, 0],
      index: 0,
      holder: 'frame',
    });
  });

  test("an instance takes children, held to the rules of its place's frame", () => {
    expect(insertionPoint(withPlace(), 'Scene', [1, 2, 0])).toEqual({
      parent: [1, 2, 0],
      index: 0,
      holder: 'frame',
    });
  });

  test("with the place at the top of its body, to the root's", () => {
    const doc = withPlace(true);
    const point = insertionPoint(doc, 'Scene', [1, 2, 0]);

    expect(point).toEqual({ parent: [1, 2, 0], index: 0, holder: 'root' });
    expect(refusalOf(doc, 'Scene', point, core(Weight))).toMatch(
      /has to go inside a frame/,
    );
  });

  test('an instance of a component with no place takes none', () => {
    // So an addition goes after it, inside the fixed frame that holds it.
    expect(insertionPoint(bare(), 'Scene', [1, 2, 0])).toEqual({
      parent: [1, 2],
      index: 1,
      holder: 'frame',
    });
  });

  test("an instance's own children are held to its place's rules", () => {
    // Selected, a child of the instance puts an addition after it, still
    // under the place's rules.
    const doc = insertNode(
      withPlace(true),
      'Scene',
      [1, 2, 0],
      0,
      newNode(core(RotationalFrame)),
    );

    expect(insertionPoint(doc, 'Scene', [1, 2, 0, 0])).toEqual({
      parent: [1, 2, 0, 0],
      index: 0,
      holder: 'frame',
    });

    const withLine = insertNode(
      doc,
      'Scene',
      [1, 2, 0],
      1,
      newNode(core(Line)),
    );

    expect(insertionPoint(withLine, 'Scene', [1, 2, 0, 1])).toEqual({
      parent: [1, 2, 0],
      index: 2,
      holder: 'root',
    });
  });

  test('a place passed on through a nested instance is followed to where it ends up', () => {
    /** The scene as one rig, whose place for children is among its pendulum's. */
    const rigOver = (placed: SceneDocument): SceneDocument => ({
      ...placed,
      definitions: [
        ...placed.definitions.filter(({ name }) => name !== placed.root),
        {
          name: 'Rig',
          body: [{ type: defined('Pendulum'), props: {}, children: [PLACE] }],
        },
        {
          name: placed.root,
          body: [{ type: defined('Rig'), props: {}, children: [] }],
        },
      ],
    });

    // What a rig is given goes where the pendulum keeps its place: in its
    // frame, under a frame's rules, or at the top of its body, under the
    // root's.
    expect(insertionPoint(rigOver(withPlace()), 'Scene', [0])).toEqual({
      parent: [0],
      index: 0,
      holder: 'frame',
    });
    expect(insertionPoint(rigOver(withPlace(true)), 'Scene', [0])).toEqual({
      parent: [0],
      index: 0,
      holder: 'root',
    });
  });

  test("a place for children goes in a component's body, and only once", () => {
    const children: ComponentRef = { kind: 'children' };
    const doc = bare();

    expect(
      refusalOf(doc, 'Scene', insertionPoint(doc, 'Scene', null), children),
    ).toMatch(/goes in a component's body/);
    expect(
      refusalOf(
        doc,
        'Pendulum',
        insertionPoint(doc, 'Pendulum', [0]),
        children,
      ),
    ).toBeNull();

    const placed = withPlace();

    expect(
      refusalOf(
        placed,
        'Pendulum',
        insertionPoint(placed, 'Pendulum', [0]),
        children,
      ),
    ).toBe('Pendulum already has a place for its children.');
  });
});
