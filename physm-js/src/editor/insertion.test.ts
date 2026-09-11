import Anchor from './../react/Anchor';
import Box from './../react/Box';
import Coincidence from './../react/Coincidence';
import Line from './../react/Line';
import RotationalFrame from './../react/RotationalFrame';
import TrackFrame from './../react/TrackFrame';
import Weight from './../react/Weight';
import starterDocument from './starterDocument';
import { extractComponent, insertNode, removeNode } from './sceneDocument';
import {
  dropPoint,
  dropRefusal,
  indentPoint,
  indentRefusal,
  insertionPoint,
  movedIndex,
  newNode,
  outdentPoint,
  outdentRefusal,
  refusalOf,
} from './insertion';
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

describe('moving a node into another', () => {
  // Scene: [TrackFrame [Box, Weight], RotationalFrame, Line].
  function scene(): SceneDocument {
    const node = (component: unknown, children: DocNode[] = []): DocNode => ({
      ...newNode(core(component)),
      children,
    });

    return {
      root: 'Scene',
      definitions: [
        {
          name: 'Scene',
          body: [
            node(TrackFrame, [node(Box), node(Weight)]),
            node(RotationalFrame),
            node(Line),
          ],
        },
      ],
    };
  }

  test('into the node above goes after its last child, held to its rules', () => {
    expect(indentPoint(scene(), 'Scene', [1])).toEqual({
      parent: [0],
      index: 2,
      holder: 'frame',
    });
    expect(indentPoint(scene(), 'Scene', [2])).toEqual({
      parent: [1],
      index: 0,
      holder: 'frame',
    });
    expect(indentRefusal(scene(), 'Scene', [1])).toBeNull();
  });

  test('not with nothing above, nor into a node that takes no children', () => {
    expect(indentPoint(scene(), 'Scene', [0])).toBeNull();
    expect(indentRefusal(scene(), 'Scene', [0])).toBe(
      'There is nothing above it to move it into.',
    );
    expect(indentPoint(scene(), 'Scene', [0, 1])).toBeNull();
    expect(indentRefusal(scene(), 'Scene', [0, 1])).toBe(
      'A Box above it takes no children.',
    );
  });

  test('out of its parent goes just after it, held to the rules there', () => {
    expect(outdentPoint(scene(), 'Scene', [0, 0])).toEqual({
      parent: [],
      index: 1,
      holder: 'root',
    });
    expect(outdentRefusal(scene(), 'Scene', [0, 0])).toBeNull();

    // A weight cannot stand at the top of a body.
    expect(outdentRefusal(scene(), 'Scene', [0, 1])).toBe(
      'Weight has to go inside a frame.',
    );
  });

  test('out of a frame inside a frame, it lands under the frame outside', () => {
    // A weight two frames deep comes out to the frame above it, which holds
    // weights -- where the root would not.
    const doc: SceneDocument = {
      root: 'Scene',
      definitions: [
        {
          name: 'Scene',
          body: [
            {
              ...newNode(core(TrackFrame)),
              children: [
                {
                  ...newNode(core(RotationalFrame)),
                  children: [newNode(core(Weight))],
                },
              ],
            },
          ],
        },
      ],
    };

    expect(outdentPoint(doc, 'Scene', [0, 0, 0])).toEqual({
      parent: [0],
      index: 1,
      holder: 'frame',
    });
    expect(outdentRefusal(doc, 'Scene', [0, 0, 0])).toBeNull();
  });

  test('not from the top of the body', () => {
    expect(outdentPoint(scene(), 'Scene', [1])).toBeNull();
    expect(outdentRefusal(scene(), 'Scene', [1])).toBe(
      'It is at the top of the body already.',
    );
  });

  test("into an instance, held to its place's rules", () => {
    // The starter's pendulum keeps its place in a frame, so a weight can go
    // into it -- from the cart's box, below it, it would first move up.
    const doc = starterDocument();

    // Scene: [Line, TrackFrame [Box, Weight, Pendulum]]: the pendulum is above
    // nothing it could go into, and the weight moves out to the root refused.
    expect(indentRefusal(doc, 'Scene', [1, 2])).toBe(
      'A Weight above it takes no children.',
    );
    expect(outdentRefusal(doc, 'Scene', [1, 1])).toBe(
      'Weight has to go inside a frame.',
    );
  });

  /** A component's place for its instances' children. */
  function place(): DocNode {
    return newNode({ kind: 'children' });
  }

  /**
   * A scene holding one Pendulum, itself `body`, and giving it a weight. The
   * instance is buried in a frame, so that a search for it has to recurse.
   */
  function held(
    body: DocNode[],
    ...extra: SceneDocument['definitions']
  ): SceneDocument {
    return {
      root: 'Scene',
      definitions: [
        {
          name: 'Scene',
          body: [
            {
              ...newNode(core(TrackFrame)),
              children: [
                {
                  ...newNode(defined('Pendulum')),
                  children: [newNode(core(Weight))],
                },
              ],
            },
          ],
        },
        { name: 'Pendulum', body },
        ...extra,
      ],
    };
  }

  test("not a place an instance's children could not follow", () => {
    // Pendulum: [RotationalFrame [Weight, place]].
    const doc = held([
      {
        ...newNode(core(RotationalFrame)),
        children: [newNode(core(Weight)), place()],
      },
    ]);

    // Out of the frame, the place would stand at the top of the body, where
    // the weight the scene's instance holds could not follow it -- a refusal
    // about a body the move never touches.
    expect(outdentPoint(doc, 'Pendulum', [0, 1])).toEqual({
      parent: [],
      index: 1,
      holder: 'root',
    });
    expect(outdentRefusal(doc, 'Pendulum', [0, 1])).toBe(
      'An instance of Pendulum in Scene holds a Weight, which could not stay ' +
        'where its children would go.',
    );

    // The weight beside it is refused for its own sake, not the instance's.
    expect(outdentRefusal(doc, 'Pendulum', [0, 0])).toBe(
      'Weight has to go inside a frame.',
    );
  });

  test('only a place is asked about; another move is judged on its own', () => {
    // The place at the top of the body, which the instance's weight already
    // contradicts -- a document the editor would not have let happen. The
    // frame inside the other still comes out, because its own move is fine.
    const doc = held([
      {
        ...newNode(core(TrackFrame)),
        children: [newNode(core(RotationalFrame))],
      },
      place(),
    ]);

    expect(outdentRefusal(doc, 'Pendulum', [0, 0])).toBeNull();

    // And moving the place into a frame only widens what an instance may hold.
    expect(indentRefusal(doc, 'Pendulum', [1])).toBeNull();
  });

  test("into an instance, held to that component's place", () => {
    // Rod keeps its place at the top of its body, so a Rod's children stand
    // where the Rod does -- and a weight cannot stand at the top of a body.
    const doc = held([newNode(defined('Rod')), place()], {
      name: 'Rod',
      body: [place()],
    });

    expect(indentPoint(doc, 'Pendulum', [1])).toEqual({
      parent: [0],
      index: 0,
      holder: 'root',
    });
    expect(indentRefusal(doc, 'Pendulum', [1])).toBe(
      'An instance of Pendulum in Scene holds a Weight, which could not stay ' +
        'where its children would go.',
    );
  });

  test('in whichever body holds the instance, which it names', () => {
    // Scene: [Rig]; Rig: [TrackFrame [Pendulum [Weight]]] -- the instance is
    // nowhere near the scene's own body.
    const doc: SceneDocument = {
      root: 'Scene',
      definitions: [
        { name: 'Scene', body: [newNode(defined('Rig'))] },
        {
          name: 'Rig',
          body: [
            {
              ...newNode(core(TrackFrame)),
              children: [
                {
                  ...newNode(defined('Pendulum')),
                  children: [newNode(core(Weight))],
                },
              ],
            },
          ],
        },
        {
          name: 'Pendulum',
          body: [
            {
              ...newNode(core(RotationalFrame)),
              children: [newNode(core(Weight)), place()],
            },
          ],
        },
      ],
    };

    expect(outdentRefusal(doc, 'Pendulum', [0, 1])).toBe(
      'An instance of Pendulum in Rig holds a Weight, which could not stay ' +
        'where its children would go.',
    );
  });

  test("by what this component's instances hold, not another's", () => {
    // Scene: [TrackFrame [Pendulum, Strut [Weight]]] -- the strut's weight
    // says nothing about where a pendulum's children may go.
    const doc: SceneDocument = {
      root: 'Scene',
      definitions: [
        {
          name: 'Scene',
          body: [
            {
              ...newNode(core(TrackFrame)),
              children: [
                newNode(defined('Pendulum')),
                {
                  ...newNode(defined('Strut')),
                  children: [newNode(core(Weight))],
                },
              ],
            },
          ],
        },
        {
          name: 'Pendulum',
          body: [{ ...newNode(core(RotationalFrame)), children: [place()] }],
        },
        {
          name: 'Strut',
          body: [{ ...newNode(core(RotationalFrame)), children: [place()] }],
        },
      ],
    };

    expect(outdentRefusal(doc, 'Pendulum', [0, 0])).toBeNull();
    expect(outdentRefusal(doc, 'Strut', [0, 0])).toBe(
      'An instance of Strut in Scene holds a Weight, which could not stay ' +
        'where its children would go.',
    );
  });
});

describe('dropping a row on another', () => {
  // Scene: [Line, TrackFrame [Box, Weight, FixedFrame [Pendulum]]].
  const doc = starterDocument();

  test('inside a row, after its last child', () => {
    expect(dropPoint(doc, 'Scene', [1], 'inside')).toEqual({
      parent: [1],
      index: 3,
      holder: 'frame',
    });
  });

  test('before a row, among its siblings', () => {
    expect(dropPoint(doc, 'Scene', [1, 1], 'before')).toEqual({
      parent: [1],
      index: 1,
      holder: 'frame',
    });

    // At the top of the body, the root's rules -- as every body is held to.
    expect(dropPoint(doc, 'Scene', [1], 'before')).toEqual({
      parent: [],
      index: 1,
      holder: 'root',
    });
  });

  test('on the body itself, where adding with nothing selected lands', () => {
    expect(dropPoint(doc, 'Scene', null, 'inside')).toEqual(
      insertionPoint(doc, 'Scene', null),
    );
  });

  test('not inside a node that takes no children', () => {
    expect(dropPoint(doc, 'Scene', [1, 0], 'inside')).toBeNull();
    expect(dropRefusal(doc, 'Scene', [0], [1, 0], 'inside')).toBe(
      'A Box takes no children.',
    );
  });

  test('the index counts the list once the node has left it', () => {
    const point = dropPoint(doc, 'Scene', [1, 2], 'before')!;

    expect(point.index).toBe(2);

    // The box, moved from before the fixed frame, lands second rather than
    // third: everything after it shifted down when it left.
    expect(movedIndex([1, 0], point)).toBe(1);

    // Out of another list, nothing shifted.
    expect(movedIndex([0], point)).toBe(2);
  });

  test('not inside itself, nor where it already stands', () => {
    expect(dropRefusal(doc, 'Scene', [1], [1], 'inside')).toBe(
      'A node cannot go inside itself.',
    );
    expect(dropRefusal(doc, 'Scene', [1], [1, 2], 'inside')).toBe(
      'A node cannot go inside itself.',
    );

    // Its own gap, and the gap of the row below it: both leave it where it is.
    expect(dropRefusal(doc, 'Scene', [1, 1], [1, 1], 'before')).toBe(
      'It is already there.',
    );
    expect(dropRefusal(doc, 'Scene', [1, 1], [1, 2], 'before')).toBe(
      'It is already there.',
    );

    // As does the last child dropped inside the parent it already ends.
    expect(dropRefusal(doc, 'Scene', [1, 2], [1], 'inside')).toBe(
      'It is already there.',
    );
  });

  test('held to the rules of adding there', () => {
    // A weight cannot stand at the top of a body, dropped before the ground
    // or at the end of it.
    expect(dropRefusal(doc, 'Scene', [1, 1], [0], 'before')).toBe(
      'Weight has to go inside a frame.',
    );
    expect(dropRefusal(doc, 'Scene', [1, 1], null, 'inside')).toBe(
      'Weight has to go inside a frame.',
    );

    // A frame goes wherever a frame can.
    expect(dropRefusal(doc, 'Scene', [1], [0], 'before')).toBeNull();
  });
});
