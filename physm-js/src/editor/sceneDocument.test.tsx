import Anchor from './../react/Anchor';
import Box from './../react/Box';
import Coincidence from './../react/Coincidence';
import CartAndRope, { RIG } from './../CartAndRope';
import Circle from './../react/Circle';
import Frame from './../Frame';
import Line from './../react/Line';
import RotationalFrame from './../react/RotationalFrame';
import TrackFrame from './../react/TrackFrame';
import Weight from './../react/Weight';
import buildScene from './../react/buildScene';
import { newNode } from './insertion';
import coreComponents from './../react/coreComponents';
import emitScene from './emitScene';
import starterDocument from './starterDocument';
import {
  literalOf,
  parameterOf,
  referencesIn,
  resolvedProps,
} from './propValue';
import { mul, vec } from './../expression';
import type { PropValue } from './propValue';
import {
  definitionOf,
  deletionRefusal,
  documentFrom,
  elementOf,
  extractComponent,
  extractionRefusal,
  insertNode,
  moveNode,
  nameRefusal,
  nodeAt,
  nodesFrom,
  placeholderPath,
  removeNode,
  setProp,
  addParameter,
  parameterAt,
  parameterNameRefusal,
  parameterRemovalRefusal,
  removeParameter,
  renameParameter,
  retypeParameter,
  setParameterDefault,
  demoteProp,
  demotionRefusal,
  promoteProp,
  promotionRefusal,
} from './sceneDocument';
import type CoreScene from './../Scene';
import type {
  DocNode,
  ElementOrigin,
  NodePath,
  Parameter,
  SceneDocument,
} from './sceneDocument';
import type { ReactElement } from 'react';

/**
 * A scene's serialization with frame ids replaced by position.
 *
 * A document's root becomes a component of its own when rendered, which puts
 * one more level into every generated path -- so unnamed frames get different
 * ids from the element the document was read from, while being the same frames.
 */
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

/** Frame ids of a scene, in `sortedFrames` order. */
function frameIds(scene: CoreScene): string[] {
  return scene.sortedFrames.map((frame) => frame.id);
}

/** A small rig with named frames, for edits whose effect is easy to read. */
function twoPoles(): SceneDocument {
  return documentFrom(
    <TrackFrame id="cart">
      <RotationalFrame id="left" position={[-1, 0]}>
        <Weight mass={2} position={[1, 0]} />
      </RotationalFrame>
      <RotationalFrame id="right" position={[1, 0]}>
        <Circle radius={0.2} />
      </RotationalFrame>
    </TrackFrame>,
  );
}

describe('sceneDocument', () => {
  test('reads an element tree without calling anything in it', () => {
    // `CartAndRope` is a composite the editor did not write, so the document
    // holds one node for it -- imported, opaque -- rather than its expansion.
    const doc = documentFrom(<CartAndRope />);
    const [node] = doc.definitions[0]!.body;

    expect(doc.root).toBe('Scene');
    expect(doc.definitions[0]!.body).toHaveLength(1);
    expect(node!.type).toEqual({
      kind: 'imported',
      name: 'CartAndRope',
      component: CartAndRope,
    });
  });

  test('recognises a building block by its meta', () => {
    const [node] = nodesFrom(<Weight mass={3} />);

    expect(node!.type).toEqual({ kind: 'core', component: Weight });
    expect(node!.props).toEqual({ mass: literalOf(3) });
  });

  test('keeps keys, and keeps children out of props', () => {
    const [node] = nodesFrom(
      <TrackFrame id="cart" key="k">
        <Weight mass={1} />
        <>
          <Circle />
          {[<Circle key="a" />, null, false]}
        </>
      </TrackFrame>,
    );

    expect(node!.key).toBe('k');
    expect(node!.props).toEqual({ id: literalOf('cart') });

    // The fragment and the array flatten into siblings, and the holes vanish.
    expect(node!.children.map((child) => child.key ?? '-')).toEqual([
      '-',
      '-',
      'a',
    ]);
  });

  test('builds the same scene as the element it was read from', () => {
    // The round trip every later step leans on: element -> document ->
    // element -> scene has to land on the scene the element built directly.
    const doc = documentFrom(<CartAndRope />);
    const direct = buildScene(<CartAndRope />);
    const viaDocument = buildScene(elementOf(doc));

    expect(normalized(viaDocument)).toEqual(normalized(direct));
    expect(viaDocument.sortedFrames).toHaveLength(2 * RIG.segmentCount + 2);
  });

  test('renders a component the document defines, once per instance', () => {
    const arm: DocNode[] = nodesFrom(
      <RotationalFrame position={[1, 0]}>
        <Weight mass={1} position={[2, 0]} />
      </RotationalFrame>,
    );
    const doc: SceneDocument = {
      root: 'Scene',
      definitions: [
        { name: 'Arm', body: arm },
        {
          name: 'Scene',
          body: nodesFrom(<TrackFrame id="cart" />).map((cart) => ({
            ...cart,
            children: [
              {
                type: { kind: 'defined', name: 'Arm' },
                props: {},
                children: [],
              },
              {
                type: { kind: 'defined', name: 'Arm' },
                props: {},
                children: [],
              },
            ],
          })),
        },
      ],
    };

    const scene = buildScene(elementOf(doc));

    // The cart and two arms -- one definition, two instances, two frames.
    expect(scene.sortedFrames).toHaveLength(3);
    expect(scene.frameMap.get('cart')!.frames).toHaveLength(2);
  });

  test('setProp returns a new document and leaves the old one alone', () => {
    const before = twoPoles();
    const after = setProp(
      before,
      'Scene',
      [0, 0],
      'position',
      literalOf([-4, 0]),
    );

    expect(nodeAt(after, 'Scene', [0, 0]).props.position).toEqual(
      literalOf([-4, 0]),
    );
    expect(nodeAt(before, 'Scene', [0, 0]).props.position).toEqual(
      literalOf([-1, 0]),
    );

    // And the edit reaches the scene it builds.
    expect(buildScene(elementOf(after)).frameMap.get('left')!.position).toEqual(
      [-4, 0, 1],
    );
  });

  test('setProp with undefined removes the prop, rather than storing undefined', () => {
    const doc = setProp(twoPoles(), 'Scene', [0, 1], 'position', undefined);

    expect('position' in nodeAt(doc, 'Scene', [0, 1]).props).toBe(false);
  });

  test('insertNode and removeNode change the scene the document builds', () => {
    const [extra] = nodesFrom(<RotationalFrame id="middle" />);
    const inserted = insertNode(twoPoles(), 'Scene', [0], 1, extra!);

    expect(
      buildScene(elementOf(inserted))
        .frameMap.get('cart')!
        .frames.map((frame) => frame.id),
    ).toEqual(['left', 'middle', 'right']);

    const removed = removeNode(inserted, 'Scene', [0, 0]);

    expect(frameIds(buildScene(elementOf(removed)))).not.toContain('left');
    expect(frameIds(buildScene(elementOf(removed)))).toContain('middle');
  });

  test('moveNode reorders siblings, counting the index after the move', () => {
    // Moving the first of two siblings to the end: "index 1 after the move"
    // is the end, even though index 1 held the other sibling before.
    const doc = moveNode(twoPoles(), 'Scene', [0, 0], [0], 1);

    expect(
      buildScene(elementOf(doc))
        .frameMap.get('cart')!
        .frames.map((frame) => frame.id),
    ).toEqual(['right', 'left']);
  });

  test('moveNode re-parents, and its target path survives the removal', () => {
    // `left` moves into `right`. Removing `left` first shifts `right` from
    // [0, 1] to [0, 0] -- the path given is the one before, and the move has to
    // account for that or it lands inside the wrong frame.
    const doc = moveNode(twoPoles(), 'Scene', [0, 0], [0, 1], 0);
    const scene = buildScene(elementOf(doc));

    expect(scene.frameMap.get('cart')!.frames.map((frame) => frame.id)).toEqual(
      ['right'],
    );
    expect(
      scene.frameMap.get('right')!.frames.map((frame) => frame.id),
    ).toEqual(['left']);
  });

  test('moveNode refuses to move a node inside itself', () => {
    expect(() => moveNode(twoPoles(), 'Scene', [0], [0, 0], 0)).toThrow(
      /inside itself/,
    );
  });

  test('reading calls no composite, even one that throws when called', () => {
    function Explodes(): never {
      throw new Error('called while reading');
    }

    expect(() => documentFrom(<Explodes />)).not.toThrow();
  });

  test("round-trips the demo's authored body, not just a node wrapping it", () => {
    // A top-level fragment, keyed `.map`s, and imported composites carrying
    // authored children -- every reading rule, through `elementOf` and back.
    const doc = documentFrom(CartAndRope());

    expect(doc.definitions[0]!.body.length).toBeGreaterThan(1);
    expect(normalized(buildScene(elementOf(doc)))).toEqual(
      normalized(buildScene(<CartAndRope />)),
    );
  });

  test('a key reaches the scene the document builds', () => {
    const doc = documentFrom(
      <TrackFrame id="cart">
        <RotationalFrame key="wheel" />
      </TrackFrame>,
    );
    const [wheel] = buildScene(elementOf(doc)).frameMap.get('cart')!.frames;

    expect(wheel!.id).toMatch(/\.\$wheel$/);
  });

  test('refuses siblings that share a key once read, rather than losing frames', () => {
    // Valid JSX -- each `.map` numbers its own children -- but one list once
    // flattened, where two frames would build with one id.
    expect(() =>
      documentFrom(
        <TrackFrame id="cart">
          {[-1, 1].map((x, i) => (
            <RotationalFrame key={i} position={[x, 0]} />
          ))}
          {[-2, 2].map((x, i) => (
            <RotationalFrame key={i} position={[x, 0]} />
          ))}
        </TrackFrame>,
      ),
    ).toThrow(/Two siblings share the key '0'/);
  });

  test('insertNode and moveNode refuse a key the list already has', () => {
    const doc = documentFrom(
      <>
        <TrackFrame id="a">
          <RotationalFrame key="k" />
        </TrackFrame>
        <TrackFrame id="b">
          <RotationalFrame key="k" />
          <RotationalFrame key="m" />
        </TrackFrame>
      </>,
    );

    expect(() => moveNode(doc, 'Scene', [0, 0], [1], 0)).toThrow(
      /already has a node keyed 'k'/,
    );
    expect(() =>
      insertNode(doc, 'Scene', [1], 0, nodeAt(doc, 'Scene', [0, 0])),
    ).toThrow(/already has a node keyed 'k'/);

    // Among its own siblings a keyed node moves freely: it leaves the list
    // before it is put back.
    const reordered = moveNode(doc, 'Scene', [1, 0], [1], 1);

    expect(
      nodeAt(reordered, 'Scene', [1]).children.map(({ key }) => key),
    ).toEqual(['m', 'k']);
  });

  test('setProp keeps an edited prop where it was', () => {
    const doc = documentFrom(<TrackFrame id="cart" resistance={5} />);
    const next = setProp(doc, 'Scene', [0], 'id', literalOf('wagon'));

    expect(Object.keys(nodeAt(next, 'Scene', [0]).props)).toEqual([
      'id',
      'resistance',
    ]);
  });

  test('a path that names nothing is refused', () => {
    expect(() => nodeAt(twoPoles(), 'Scene', [0, 9])).toThrow(/No node at/);
    expect(() => nodeAt(twoPoles(), 'Nope', [0])).toThrow(/no component named/);
  });
});

describe('extracting a component', () => {
  // Scene: [Line, TrackFrame [Box, Weight, Pendulum]].
  test('moves a subtree into a new component, and leaves an instance in its place', () => {
    const doc = starterDocument();
    const scene = definitionOf(doc, 'Scene');
    const next = extractComponent(doc, 'Scene', [1, 0], 'Chassis');

    expect(nodeAt(next, 'Scene', [1, 0]).type).toEqual({
      kind: 'defined',
      name: 'Chassis',
    });
    // With a place for children beside it, since a box holds none.
    expect(definitionOf(next, 'Chassis').body).toEqual([
      nodeAt(doc, 'Scene', [1, 0]),
      PLACE,
    ]);
    // The document it was given is left as it was.
    expect(definitionOf(doc, 'Scene')).toBe(scene);

    // The same subtree, one component down, builds the same scene.
    const before = buildScene(elementOf(doc));
    const after = buildScene(elementOf(next));

    expect(after.toJsonObj()).toEqual(before.toJsonObj());
    expect(after.frameMap.get('cart')!.decals).toEqual(
      before.frameMap.get('cart')!.decals,
    );
  });

  test('the same scene, up to the ids of frames nobody named', () => {
    // An unnamed frame's id is its path, and the instance adds to that path,
    // so the pendulum's frame is renamed. A structural edit resets motion
    // anyway, and every frame someone named keeps its id.
    const doc = starterDocument();
    const next = extractComponent(doc, 'Scene', [1], 'Cart');
    const before = buildScene(elementOf(doc));
    const after = buildScene(elementOf(next));
    const named = (scene: CoreScene): string[] =>
      frameIds(scene).filter((id) => !id.startsWith('@'));

    expect(normalized(after)).toEqual(normalized(before));
    expect(named(after)).toEqual(named(before));
    expect(named(after)).toContain('cart');
    expect(frameIds(after)).not.toEqual(frameIds(before));
  });

  test('a new component takes children, at the origin of its outermost frame', () => {
    // Scene: [Line, TrackFrame [Box, Weight, Pendulum]].
    const next = extractComponent(starterDocument(), 'Scene', [1], 'Cart');

    expect(placeholderPath(next, 'Cart')).toEqual([0, 3]);
  });

  test('from an instance whose component keeps a place, it passes children on', () => {
    // Given to a rig, they go where its pendulum keeps its place.
    const next = extractComponent(starterDocument(), 'Scene', [1, 2, 0], 'Rig');

    expect(definitionOf(next, 'Rig').body).toEqual([
      {
        type: { kind: 'defined', name: 'Pendulum' },
        props: {},
        children: [PLACE],
      },
    ]);
  });

  test('from anything else, it keeps the place beside the node', () => {
    const next = extractComponent(
      starterDocument(),
      'Scene',
      [1, 0],
      'Chassis',
    );

    expect(placeholderPath(next, 'Chassis')).toEqual([1]);
  });

  test('refuses to extract a weight or an anchor alone', () => {
    // An instance goes wherever a frame can -- which a weight cannot.
    const doc = starterDocument();

    expect(extractionRefusal(doc, 'Scene', [1, 1])).toMatch(
      /A Weight cannot be a component of its own/,
    );
    expect(extractionRefusal(doc, 'Scene', [1, 0])).toBeNull();
    expect(() => extractComponent(doc, 'Scene', [1, 1], 'Ballast')).toThrow(
      /has to go inside a frame/,
    );
  });

  test('moves the key to the instance, where identity among siblings lives', () => {
    const doc = documentFrom(
      <TrackFrame id="cart">
        <Box key="body" width={2} />
      </TrackFrame>,
    );
    const next = extractComponent(doc, 'Scene', [0, 0], 'Body');

    expect(nodeAt(next, 'Scene', [0, 0]).key).toBe('body');
    expect(definitionOf(next, 'Body').body[0]!.key).toBeUndefined();
  });

  test('refuses a name the generated module could not use, saying why', () => {
    const doc = starterDocument();

    expect(nameRefusal(doc, 'chassis')).toMatch(/capital letter/);
    expect(nameRefusal(doc, 'Box')).toMatch(/already a building block/);
    expect(nameRefusal(doc, 'Pendulum')).toMatch(/already a component/);
    expect(nameRefusal(doc, 'ReactElement')).toMatch(/already imported/);
    expect(nameRefusal(documentFrom(<CartAndRope />), 'CartAndRope')).toMatch(
      /already imported/,
    );
    expect(nameRefusal(doc, 'Math')).toMatch(/JavaScript built-in/);
    // A browser's own globals are names generated code never uses.
    expect(nameRefusal(doc, 'Image')).toBeNull();
    expect(nameRefusal(doc, 'Chassis')).toBeNull();

    expect(() => extractComponent(doc, 'Scene', [0], 'Box')).toThrow(
      /already a building block/,
    );
  });
});

describe('elementOf, with origins', () => {
  test('origins say which definition and node made each element', () => {
    const [cart] = nodesFrom(
      <TrackFrame id="cart">
        <Box width={1} height={1} />
      </TrackFrame>,
    );
    const doc: SceneDocument = {
      root: 'Scene',
      definitions: [
        {
          name: 'Pendulum',
          body: nodesFrom(
            <RotationalFrame>
              <Circle radius={1} />
            </RotationalFrame>,
          ),
        },
        {
          name: 'Scene',
          body: [
            {
              ...cart!,
              children: [
                ...cart!.children,
                {
                  type: { kind: 'defined', name: 'Pendulum' },
                  props: {},
                  children: [],
                },
              ],
            },
          ],
        },
      ],
    };
    const origins = new WeakMap<object, ElementOrigin>();
    const trails = new Map<unknown, readonly ReactElement[]>();
    const scene = buildScene(elementOf(doc, 'Scene', origins), {
      trace: (built, trail) => trails.set(built, trail),
    });
    const bob = scene.frames[0]!.frames[0]!.decals[0]!;

    // The root's own element and each body's fragment render no node, so they
    // have no origin.
    expect(
      trails
        .get(bob)!
        .map((element) => origins.get(element))
        .filter(Boolean),
    ).toEqual([
      { definition: 'Scene', path: [0] },
      { definition: 'Scene', path: [0, 1] },
      { definition: 'Pendulum', path: [0] },
      { definition: 'Pendulum', path: [0, 0] },
    ]);
  });
});

/** A component's place for its instances' children. */
const PLACE: DocNode = { type: { kind: 'children' }, props: {}, children: [] };

/**
 * An arm that keeps a place for children in its frame, and a scene with one
 * instance of it, given `given`.
 */
function armGiven(given: DocNode[]): SceneDocument {
  const [arm] = nodesFrom(<RotationalFrame id="arm" />);

  return {
    root: 'Scene',
    definitions: [
      { name: 'Arm', body: [{ ...arm!, children: [PLACE] }] },
      {
        name: 'Scene',
        body: [
          {
            type: { kind: 'defined', name: 'Arm' },
            props: {},
            children: given,
          },
        ],
      },
    ],
  };
}

describe("a component's place for children", () => {
  test("an instance's children are built where its component keeps a place", () => {
    const scene = buildScene(
      elementOf(armGiven(nodesFrom(<TrackFrame id="slider" />))),
    );

    expect(scene.frames.map(({ id }) => id)).toEqual(['arm']);
    expect(scene.frames[0]!.frames.map(({ id }) => id)).toEqual(['slider']);
  });

  test('an instance given none builds the component alone', () => {
    const scene = buildScene(elementOf(armGiven([])));

    expect(scene.frames.map(({ id }) => id)).toEqual(['arm']);
    expect(scene.frames[0]!.frames).toEqual([]);
  });

  test('the children lead back to the body that gave them', () => {
    const origins = new WeakMap<object, ElementOrigin>();
    const trails = new Map<string, readonly ReactElement[]>();
    buildScene(
      elementOf(
        armGiven(nodesFrom(<TrackFrame id="slider" />)),
        'Scene',
        origins,
      ),
      {
        trace: (built, trail) => {
          if (built instanceof Frame) {
            trails.set(built.id, trail);
          }
        },
      },
    );
    const slider = trails.get('slider')!;

    // The scene wrote the slider, as a child of its instance of the arm: that
    // is the node a click on it selects, and a drag of it moves.
    expect(origins.get(slider[slider.length - 1]!)).toEqual({
      definition: 'Scene',
      path: [0, 0],
    });
  });

  test('placeholderPath finds the place, or says there is none', () => {
    const doc = armGiven([]);

    expect(placeholderPath(doc, 'Arm')).toEqual([0, 0]);
    expect(placeholderPath(doc, 'Scene')).toBeNull();
  });

  test('the place can be deleted unless an instance holds children', () => {
    const given = armGiven(nodesFrom(<TrackFrame id="slider" />));

    expect(deletionRefusal(given, 'Arm', [0, 0])).toBe(
      'An instance of Arm in Scene holds children, which would then have ' +
        'nowhere to go: delete them first.',
    );
    // So can the frame it is in, which takes it along.
    expect(deletionRefusal(given, 'Arm', [0])).not.toBeNull();
    expect(deletionRefusal(armGiven([]), 'Arm', [0, 0])).toBeNull();
    expect(deletionRefusal(given, 'Scene', [0, 0])).toBeNull();

    // Another component's instance holding children is no reason.
    const [arm] = armGiven([]).definitions;
    const other: SceneDocument = {
      root: 'Scene',
      definitions: [
        arm!,
        { name: 'Other', body: [PLACE] },
        {
          name: 'Scene',
          body: [
            { type: { kind: 'defined', name: 'Arm' }, props: {}, children: [] },
            {
              type: { kind: 'defined', name: 'Other' },
              props: {},
              children: nodesFrom(<TrackFrame id="t" />),
            },
          ],
        },
      ],
    };

    expect(deletionRefusal(other, 'Arm', [0, 0])).toBeNull();

    // An instance given children by passing on a place of its own is found in
    // the body that holds it -- and so is one in the scene.
    const passed: SceneDocument = {
      root: 'Scene',
      definitions: [
        arm!,
        {
          name: 'Rig',
          body: [
            {
              type: { kind: 'defined', name: 'Arm' },
              props: {},
              children: [PLACE],
            },
          ],
        },
        {
          name: 'Scene',
          body: [
            { type: { kind: 'defined', name: 'Rig' }, props: {}, children: [] },
            {
              type: { kind: 'defined', name: 'Arm' },
              props: {},
              children: nodesFrom(<TrackFrame id="t" />),
            },
          ],
        },
      ],
    };

    expect(deletionRefusal(passed, 'Arm', [0, 0])).toMatch(
      /^An instance of Arm in Rig and Scene holds children/,
    );
  });

  test('the place stays in its component, and its name is taken', () => {
    const doc = armGiven([]);

    expect(extractionRefusal(doc, 'Arm', [0])).toMatch(
      /place for its children, which has to stay in Arm/,
    );
    expect(nameRefusal(doc, 'Children')).not.toBeNull();
    expect(nameRefusal(doc, 'ReactNode')).not.toBeNull();
  });

  /** A `Scene` taking `bob`, whose one weight's position refers to it. */
  const referring = (parameters: readonly Parameter[]): SceneDocument => {
    const [frame] = nodesFrom(
      <RotationalFrame id="arm">
        <Weight mass={1} position={[1, 0]} />
      </RotationalFrame>,
    );

    return {
      root: 'Scene',
      definitions: [
        {
          name: 'Scene',
          parameters,
          body: [
            {
              ...frame!,
              children: frame!.children.map((weight) => ({
                ...weight,
                props: { ...weight.props, position: parameterOf('bob') },
              })),
            },
          ],
        },
      ],
    };
  };

  test('a subtree that refers to a parameter carries the declaration with it', () => {
    const doc = referring([{ name: 'bob', type: 'point', default: [3, 0] }]);
    const next = extractComponent(doc, 'Scene', [0], 'Arm');

    // The new component declares what the subtree refers to, and the instance
    // left behind passes the enclosing definition's parameter straight
    // through -- so the reference resolves to what it always did.
    expect(definitionOf(next, 'Arm').parameters).toEqual([
      { name: 'bob', type: 'point', default: [3, 0] },
    ]);
    expect(nodeAt(next, 'Scene', [0]).props.bob).toEqual(parameterOf('bob'));
    expect(extractionRefusal(doc, 'Scene', [0])).toBeNull();

    // Which is the invariant this edit rests on: the scene is unchanged.
    expect(
      buildScene(elementOf(next)).frames[0]!.weights[0]!.position[0],
    ).toBeCloseTo(3, 9);
  });

  test('a subtree that refers to nothing declared has nothing to carry', () => {
    // Unreachable from the editor -- every reference it writes names a
    // declaration -- but a document built in code can hold one, and the
    // extraction would resolve it against an empty scope.
    const doc = referring([]);

    expect(extractionRefusal(doc, 'Scene', [0])).toMatch(
      /refers to bob, which Scene does not take/,
    );
    expect(() => extractComponent(doc, 'Scene', [0], 'Arm')).toThrow(
      /which Scene does not take/,
    );
  });

  test('an extraction that refers to nothing declares nothing', () => {
    const next = extractComponent(starterDocument(), 'Scene', [1], 'Cart');

    expect(definitionOf(next, 'Cart').parameters).toBeUndefined();
  });
});

/** A `Pendulum` taking `bob`, instantiated twice at different points. */
function twoInstances(): SceneDocument {
  const [arm] = nodesFrom(
    <RotationalFrame>
      <Weight mass={1} position={[0, -1]} />
    </RotationalFrame>,
  );
  const instance = (bob: readonly [number, number]): DocNode => ({
    type: { kind: 'defined', name: 'Pendulum' },
    props: { bob: literalOf(bob) },
    children: [],
  });

  return {
    root: 'Scene',
    definitions: [
      {
        name: 'Scene',
        body: nodesFrom(<TrackFrame id="cart" />).map((cart) => ({
          ...cart,
          children: [instance([4, 0]), instance([7, 0])],
        })),
      },
      {
        name: 'Pendulum',
        parameters: [{ name: 'bob', type: 'point' }],
        body: [
          {
            ...arm!,
            children: arm!.children.map((weight) => ({
              ...weight,
              props: { ...weight.props, position: parameterOf('bob') },
            })),
          },
        ],
      },
    ],
  };
}

describe("a definition's parameters", () => {
  /** A `Scene` taking `bob`, with a weight whose position refers to it. */
  const taking = (): SceneDocument => {
    const [frame] = nodesFrom(
      <RotationalFrame id="arm">
        <Weight mass={1} position={[1, 0]} />
      </RotationalFrame>,
    );

    return {
      root: 'Scene',
      definitions: [
        {
          name: 'Scene',
          parameters: [{ name: 'bob', type: 'point', default: [2, 0] }],
          body: [
            {
              ...frame!,
              children: frame!.children.map((weight) => ({
                ...weight,
                props: { ...weight.props, position: parameterOf('bob') },
              })),
            },
          ],
        },
      ],
    };
  };

  test('a new one is named around the ones already declared', () => {
    const once = addParameter(taking(), 'Scene');
    const twice = addParameter(once, 'Scene');

    expect(parameterAt(once, 'Scene', 1)).toEqual({
      name: 'value',
      type: 'scalar',
    });
    expect(parameterAt(twice, 'Scene', 2).name).toBe('value2');

    // No default: a parameter every instance may leave out is the weaker
    // statement, and nothing here knows what it is for yet.
    expect(parameterAt(once, 'Scene', 1).default).toBeUndefined();
  });

  test('a name is checked the way a component name is', () => {
    const doc = addParameter(taking(), 'Scene');

    for (const name of ['half-length', '2x', '', 'a b']) {
      expect(parameterNameRefusal(doc, 'Scene', 1, name)).toMatch(
        /starts with a letter/,
      );
    }
    expect(parameterNameRefusal(doc, 'Scene', 1, 'children')).toMatch(
      /names what a component is given/,
    );
    expect(parameterNameRefusal(doc, 'Scene', 1, 'bob')).toBe(
      'Scene already takes bob.',
    );
    expect(parameterNameRefusal(doc, 'Scene', 1, 'Array')).toMatch(
      /JavaScript built-in/,
    );

    // A component name is checked by a rule requiring a capital first letter,
    // which excludes every reserved word without naming one. A parameter name
    // is lowercase by convention, so the same rule relaxed to allow that loses
    // the guarantee -- and `function Scene({ default })` does not parse.
    for (const word of ['default', 'const', 'this', 'in', 'await', 'static']) {
      expect(parameterNameRefusal(doc, 'Scene', 1, word)).toMatch(
        /JavaScript keyword/,
      );
    }

    // A parameter is not a duplicate of itself, or renaming it to what it is
    // called would be refused.
    expect(parameterNameRefusal(doc, 'Scene', 0, 'bob')).toBeNull();
    expect(parameterNameRefusal(doc, 'Scene', 1, 'heft')).toBeNull();
  });

  test('a rename carries every prop that refers to it', () => {
    const renamed = renameParameter(taking(), 'Scene', 0, 'hangsAt');
    const weight = nodeAt(renamed, 'Scene', [0, 0]);

    expect(parameterAt(renamed, 'Scene', 0).name).toBe('hangsAt');
    expect(weight.props.position).toEqual(parameterOf('hangsAt'));

    // Which is the point: the scene the document builds is unchanged.
    expect(
      buildScene(elementOf(renamed)).frames[0]!.weights[0]!.position[0],
    ).toBeCloseTo(2, 9);
    expect(() => renameParameter(taking(), 'Scene', 0, 'children')).toThrow(
      /names what a component is given/,
    );
  });

  test('a rename carries what each instance passes, in whatever body holds it', () => {
    // The other half of what a parameter's name reaches: an instance's prop is
    // keyed by that name, and `elementOf` builds the scope from those keys --
    // so a rename that missed them would leave the scope without the name the
    // body now refers to, and both pendulums would fall to Weight's own
    // default and land on top of each other.
    const renamed = renameParameter(twoInstances(), 'Pendulum', 0, 'hangsAt');
    const [first, second] = renamed.definitions[0]!.body[0]!.children;

    expect(first!.props.hangsAt).toEqual(literalOf([4, 0]));
    expect(second!.props.hangsAt).toEqual(literalOf([7, 0]));
    expect(first!.props.bob).toBeUndefined();

    const built = buildScene(elementOf(renamed)).frames[0]!.frames;

    expect(built[0]!.weights[0]!.position[0]).toBeCloseTo(4, 9);
    expect(built[1]!.weights[0]!.position[0]).toBeCloseTo(7, 9);
  });

  test('a delete takes the argument each instance passed with it', () => {
    // Dropped rather than refused: an argument to a parameter that no longer
    // exists is read by nothing, where a reference resolved against a scope
    // without the name falls to its component's default and moves something.
    // Leaving it would emit `<Pendulum bob={…} />` against a signature that
    // does not take `bob`.
    const doc = setProp(
      twoInstances(),
      'Pendulum',
      [0, 0],
      'position',
      undefined,
    );
    const without = removeParameter(doc, 'Pendulum', 0);
    const [first, second] = without.definitions[0]!.body[0]!.children;

    expect(definitionOf(without, 'Pendulum').parameters).toEqual([]);
    expect(first!.props.bob).toBeUndefined();
    expect(second!.props.bob).toBeUndefined();
    expect(emitScene(without).source).not.toContain('bob');
  });

  test('an edit to a component the document does not define says so', () => {
    // `retypeParameter` reaches `withParameters` without looking the
    // definition up first, so the guard in there is the only thing between a
    // wrong name and an edit that silently returns the document unchanged.
    expect(() => retypeParameter(taking(), 'Nowhere', 0, 'scalar')).toThrow(
      /defines no component named 'Nowhere'/,
    );
  });

  test('a referenced parameter cannot be deleted, and an unused one can', () => {
    const doc = addParameter(taking(), 'Scene');

    expect(parameterRemovalRefusal(doc, 'Scene', 0)).toBe(
      "Weight's position refers to bob: give it a value first.",
    );
    expect(() => removeParameter(doc, 'Scene', 0)).toThrow(/refers to bob/);
    expect(parameterRemovalRefusal(doc, 'Scene', 1)).toBeNull();
    expect(
      removeParameter(doc, 'Scene', 1).definitions[0]!.parameters,
    ).toHaveLength(1);
  });

  test('retyping keeps a default that still fits and drops one that does not', () => {
    const doc = taking();

    // A point's `[2, 0]` says nothing as a label, and coercing it would invent
    // an answer the person has one for.
    expect(
      parameterAt(retypeParameter(doc, 'Scene', 0, 'label'), 'Scene', 0),
    ).toEqual({ name: 'bob', type: 'label' });

    const scalar = setParameterDefault(
      retypeParameter(doc, 'Scene', 0, 'scalar'),
      'Scene',
      0,
      3,
    );

    expect(
      parameterAt(retypeParameter(scalar, 'Scene', 0, 'angle'), 'Scene', 0),
    ).toEqual({ name: 'bob', type: 'angle', default: 3 });
  });

  test('a default the declared type cannot hold is refused, and none is allowed', () => {
    const doc = taking();

    expect(() => setParameterDefault(doc, 'Scene', 0, 'over there')).toThrow(
      /is not a point, which bob is/,
    );
    expect(() => setParameterDefault(doc, 'Scene', 0, [1])).toThrow(
      /is not a point/,
    );
    expect(
      parameterAt(setParameterDefault(doc, 'Scene', 0, undefined), 'Scene', 0),
    ).toEqual({ name: 'bob', type: 'point' });
    expect(() => parameterAt(doc, 'Scene', 4)).toThrow(
      /declares no parameter at 4/,
    );
  });
});

describe('carrying a prop to and from the declaration block', () => {
  /** Two weights that state a position, a box with a flag, and an anchor. */
  const rig = (): SceneDocument =>
    documentFrom(
      <RotationalFrame id="arm" initialState={[0.5, 0]}>
        <Weight mass={3} position={[2, 0]} />
        <Weight mass={1} position={[5, 0]} />
        <Box width={1} height={1} solid />
        <Anchor id="pin" />
      </RotationalFrame>,
    );

  /** One prop of every kind the building blocks declare, in one document. */
  const everyKind = (): SceneDocument =>
    documentFrom(
      <>
        <TrackFrame id="cart" angle={0.25}>
          <Weight mass={3} position={[2, 0]} />
          <Box width={1} height={1} color="red" solid />
          <RotationalFrame id="arm" initialState={[0.5, 0]} />
        </TrackFrame>
        <Coincidence
          frame1="cart"
          frame2="arm"
          position1={[0, 0]}
          position2={[0, 0]}
        />
      </>,
    );

  test('a promoted prop becomes a parameter defaulted to what it held', () => {
    const doc = promoteProp(rig(), 'Scene', [0, 0], 'position');

    expect(definitionOf(doc, 'Scene').parameters).toEqual([
      { name: 'position', type: 'point', default: [2, 0] },
    ]);
    expect(nodeAt(doc, 'Scene', [0, 0]).props.position).toEqual(
      parameterOf('position'),
    );

    // The value moved; it did not change. That is what makes promoting safe
    // to try: nothing about the scene is different until an instance says so.
    expect(
      buildScene(elementOf(doc)).frames[0]!.weights[0]!.position[0],
    ).toBeCloseTo(2, 9);
  });

  test('a prop with no value of its own promotes at the component default', () => {
    // `width` is stated; `drag` is not, and the component behaves as though it
    // were 0 -- which is the value the parameter has to carry for the scene to
    // stay as it was.
    const doc = promoteProp(rig(), 'Scene', [0, 0], 'drag');

    expect(definitionOf(doc, 'Scene').parameters).toEqual([
      { name: 'drag', type: 'scalar', default: 0 },
    ]);
  });

  test('a second promotion of the same prop name is named around the first', () => {
    const once = promoteProp(rig(), 'Scene', [0, 0], 'position');
    const twice = promoteProp(once, 'Scene', [0, 1], 'position');

    expect(
      definitionOf(twice, 'Scene').parameters!.map(({ name }) => name),
    ).toEqual(['position', 'position2']);
    expect(nodeAt(twice, 'Scene', [0, 1]).props.position).toEqual(
      parameterOf('position2'),
    );
  });

  test('every prop kind either has a parameter type or says why not', () => {
    // One prop per kind the building blocks declare, with the type it becomes
    // -- or `null` where nothing can hold it. The exhaustiveness check below
    // is the point: `PROMOTED_TYPES` is partial, so a kind nobody thought
    // about is silence rather than a compile error.
    const kinds: Record<
      string,
      { path: NodePath; prop: string; type: Parameter['type'] | null }
    > = {
      number: { path: [0, 0], prop: 'mass', type: 'scalar' },
      length: { path: [0, 1], prop: 'width', type: 'scalar' },
      angle: { path: [0], prop: 'angle', type: 'angle' },
      point: { path: [0, 0], prop: 'position', type: 'point' },
      name: { path: [0], prop: 'id', type: 'label' },
      end: { path: [1], prop: 'frame1', type: 'label' },
      color: { path: [0, 1], prop: 'color', type: 'label' },
      flag: { path: [0, 1], prop: 'solid', type: null },
      state: { path: [0, 2], prop: 'initialState', type: null },
    };
    const declared = new Set(
      coreComponents.flatMap(({ meta }) =>
        Object.values(meta.props).map(({ kind }) => kind),
      ),
    );

    expect([...declared].filter((kind) => !(kind in kinds))).toEqual([]);

    for (const [kind, { path, prop, type }] of Object.entries(kinds)) {
      const refusal = promotionRefusal(everyKind(), 'Scene', path, prop);
      if (type === null) {
        // A flag is not in 0016 page 3's type set at all, and an initial
        // state is a coordinate and its rate, which no one type covers.
        expect([kind, refusal]).toEqual([
          kind,
          expect.stringMatching(/is not something a parameter can be/),
        ]);
        continue;
      }

      expect([kind, refusal]).toEqual([kind, null]);
      expect([
        kind,
        definitionOf(promoteProp(everyKind(), 'Scene', path, prop), 'Scene')
          .parameters![0]!.type,
      ]).toEqual([kind, type]);
    }
  });

  test('a component with no metadata to consult says that, not something else', () => {
    // Three paths reach a refusal here and each says its own: this one, an
    // instance holding a prop its component does not declare, and a building
    // block whose prop kind has no type. One message reciting all three would
    // lead with a case the reader is not in.
    const doc: SceneDocument = {
      root: 'Scene',
      definitions: [
        {
          name: 'Scene',
          body: [
            {
              type: {
                kind: 'imported',
                name: 'Gantry',
                component: () => null,
              },
              props: { span: literalOf(2) },
              children: [],
            },
          ],
        },
      ],
    };

    expect(promotionRefusal(doc, 'Scene', [0], 'span')).toMatch(
      /Gantry comes from its own module/,
    );
    expect(promotionRefusal(twoInstances(), 'Scene', [0, 0], 'heft')).toBe(
      'Pendulum does not take heft.',
    );
  });

  test('a prop with nothing to carry, and one whose value the type cannot hold', () => {
    const doc = rig();

    // An anchor's point is solved for when absent, which no value expresses,
    // so there is nothing for a default to carry.
    expect(promotionRefusal(doc, 'Scene', [0, 3], 'position')).toMatch(
      /holds no value to carry/,
    );
    expect(() => promoteProp(doc, 'Scene', [0, 2], 'solid')).toThrow(
      /Solid is not something a parameter can be/,
    );

    // The check `setParameterDefault` makes, by the other route: unreachable
    // from the editor, reachable by a document built in code, and the emitted
    // signature would write the default at a type that cannot hold it.
    const mistyped = setProp(doc, 'Scene', [0, 0], 'mass', literalOf('heavy'));

    expect(promotionRefusal(mistyped, 'Scene', [0, 0], 'mass')).toMatch(
      /"heavy" is not a scalar/,
    );
  });

  test('a prop already referring to a parameter is not promoted twice', () => {
    const doc = promoteProp(rig(), 'Scene', [0, 0], 'position');

    expect(promotionRefusal(doc, 'Scene', [0, 0], 'position')).toBe(
      'position already refers to position.',
    );
  });

  test("a value passed to an instance promotes at that definition's type", () => {
    // The instance's props *are* the sub-component's parameters, so the type
    // is declared even though no `meta` describes it -- which is how a value
    // handed down is carried up into the enclosing definition's surface.
    const doc: SceneDocument = {
      root: 'Scene',
      definitions: [
        {
          name: 'Scene',
          body: [
            {
              type: { kind: 'defined', name: 'Pendulum' },
              props: { bob: literalOf([4, 0]) },
              children: [],
            },
          ],
        },
        {
          name: 'Pendulum',
          parameters: [{ name: 'bob', type: 'point' }],
          body: nodesFrom(<RotationalFrame />),
        },
      ],
    };
    const promoted = promoteProp(doc, 'Scene', [0], 'bob');

    expect(definitionOf(promoted, 'Scene').parameters).toEqual([
      { name: 'bob', type: 'point', default: [4, 0] },
    ]);
    expect(nodeAt(promoted, 'Scene', [0]).props.bob).toEqual(
      parameterOf('bob'),
    );

    // And an instance passing nothing promotes at the sub-component's own
    // default, which is the value it was resolving to -- the same fallback a
    // building block's prop gets, reached by the other branch.
    const defaulted: SceneDocument = {
      root: 'Scene',
      definitions: [
        {
          name: 'Scene',
          body: [{ ...nodeAt(doc, 'Scene', [0]), props: {} }],
        },
        {
          ...definitionOf(doc, 'Pendulum'),
          parameters: [{ name: 'bob', type: 'point', default: [9, 0] }],
        },
      ],
    };

    expect(
      definitionOf(promoteProp(defaulted, 'Scene', [0], 'bob'), 'Scene')
        .parameters,
    ).toEqual([{ name: 'bob', type: 'point', default: [9, 0] }]);
  });

  test('demoting is refused while an instance passes something else', () => {
    // What it writes is the *declaration's* default, which is what the
    // reference resolved to only for instances passing nothing. Straight after
    // a promote there are none, which is why the round trip is safe there and
    // not in general.
    const defaulted = setParameterDefault(
      twoInstances(),
      'Pendulum',
      0,
      [1, 0],
    );

    expect(demotionRefusal(defaulted, 'Pendulum', [0, 0], 'position')).toMatch(
      /An instance of Pendulum passes bob=\[4,0\]/,
    );
    expect(() => demoteProp(defaulted, 'Pendulum', [0, 0], 'position')).toThrow(
      /is not the \[1,0\] this would put here/,
    );

    // An instance passing the default resolves to it already, so writing it
    // changes nothing and there is nothing to refuse.
    const agreeing: SceneDocument = {
      ...defaulted,
      definitions: defaulted.definitions.map((definition) => ({
        ...definition,
        body: definition.body.map((node) => ({
          ...node,
          children: node.children.map((child) =>
            child.type.kind === 'defined'
              ? { ...child, props: { bob: literalOf([1, 0]) } }
              : child,
          ),
        })),
      })),
    };

    expect(
      demotionRefusal(agreeing, 'Pendulum', [0, 0], 'position'),
    ).toBeNull();
  });

  test('demoting puts the default back, and leaves the declaration', () => {
    const doc = demoteProp(
      promoteProp(rig(), 'Scene', [0, 0], 'position'),
      'Scene',
      [0, 0],
      'position',
    );

    expect(nodeAt(doc, 'Scene', [0, 0]).props.position).toEqual(
      literalOf([2, 0]),
    );

    // The parameter stays: an unused one is visible in the block, and taking
    // it away here would take a declaration instances may be passing.
    expect(definitionOf(doc, 'Scene').parameters).toHaveLength(1);
  });

  test('demoting rejoins whatever else holds that value', () => {
    // A parameter's default *is* the object the promoted prop held, so the
    // props that shared it are still holding it. Rejoining them is identity
    // rather than the equality this document stopped guessing from -- and
    // without it a promote and a demote would leave the module with a third
    // copy of a value two props name.
    const at = [2, 0] as const;
    const doc = documentFrom(
      <RotationalFrame id="arm">
        <Line endPos={at} lineWidth={0.1} />
        <Circle position={at} radius={0.5} />
        <Weight mass={1} position={at} />
      </RotationalFrame>,
    );
    const promoted = promoteProp(doc, 'Scene', [0, 1], 'position');
    const { source } = emitScene(
      demoteProp(promoted, 'Scene', [0, 1], 'position'),
    );
    const body = (text: string): string => text.slice(text.indexOf('return ('));

    // The body comes back as it was. What is left over is the declaration,
    // which demoting deliberately keeps.
    expect(body(source)).toBe(body(emitScene(doc).source));
    expect(source).toContain('function Scene({ position = [2, 0] }');

    // And a prop that was the only holder gets a node of its own -- even
    // beside a prop holding an equal value, which is what separates rejoining
    // by identity from rejoining by the equality this document stopped
    // guessing from. Joining that one would say the two are one value, which
    // is exactly what nobody said.
    const apart = documentFrom(
      <RotationalFrame id="arm">
        <Line endPos={[2, 0]} lineWidth={0.1} />
        <Circle position={[2, 0]} radius={0.5} />
      </RotationalFrame>,
    );
    const alone = promoteProp(apart, 'Scene', [0, 1], 'position');
    const back = demoteProp(alone, 'Scene', [0, 1], 'position');

    expect(nodeAt(back, 'Scene', [0, 1]).props.position).toEqual(
      literalOf([2, 0]),
    );
    expect(nodeAt(back, 'Scene', [0, 1]).props.position).not.toBe(
      nodeAt(back, 'Scene', [0, 0]).props.endPos,
    );
    expect(emitScene(back).source).not.toContain('const ');
  });

  test('a reference with no default has no value to go back to', () => {
    const promoted = promoteProp(rig(), 'Scene', [0, 0], 'position');
    const undefaulted = setParameterDefault(promoted, 'Scene', 0, undefined);

    expect(demotionRefusal(undefaulted, 'Scene', [0, 0], 'position')).toBe(
      'position has no default, so there is no value to put here.',
    );
    expect(() => demoteProp(undefaulted, 'Scene', [0, 0], 'position')).toThrow(
      /no default/,
    );
    expect(demotionRefusal(promoted, 'Scene', [0, 0], 'mass')).toBe(
      'mass is not a reference.',
    );
  });
});

describe('what a read records about sharing', () => {
  test('two props given one value object hold one node', () => {
    const bob = [4, 0] as const;
    const [frame] = nodesFrom(
      <RotationalFrame id="arm">
        <Line endPos={bob} lineWidth={0.1} />
        <Weight mass={1} position={bob} />
      </RotationalFrame>,
    );
    const [line, weight] = frame!.children;

    // One node, not two equal ones. The source said these are the same value
    // and the document is where that has to survive -- the emitter guessing it
    // back from equality is what this replaces.
    expect(line!.props.endPos).toBe(weight!.props.position);
  });

  test('a value shared between a frame and what is under it holds together', () => {
    // The sharing table follows the whole read rather than one list of
    // siblings: a parent's prop and a grandchild's are as much one value as
    // two siblings' are.
    const at = [1, 0] as const;
    const [frame] = nodesFrom(
      <RotationalFrame id="arm" position={at}>
        <RotationalFrame id="tip">
          <Weight mass={1} position={at} />
        </RotationalFrame>
      </RotationalFrame>,
    );

    expect(frame!.props.position).toBe(
      frame!.children[0]!.children[0]!.props.position,
    );
  });

  test('two values that merely agree are two nodes', () => {
    const [frame] = nodesFrom(
      <RotationalFrame id="arm">
        <Line endPos={[4, 0]} lineWidth={0.1} />
        <Weight mass={1} position={[4, 0]} />
      </RotationalFrame>,
    );
    const [line, weight] = frame!.children;

    expect(line!.props.endPos).not.toBe(weight!.props.position);
    expect(line!.props.endPos).toEqual(weight!.props.position);
  });

  test('two reads of one value object are two statements', () => {
    // The object is shared, which is the only thing that can tell the scopes
    // apart: two separately written `[1, 0]`s are two arrays whether the table
    // follows a read, a document, or the whole module.
    const at = [1, 0] as const;
    const [first] = nodesFrom(<Weight mass={2} position={at} />);
    const [second] = nodesFrom(<Weight mass={2} position={at} />);

    expect(first!.props.position).not.toBe(second!.props.position);
    expect(first!.props.position).toEqual(second!.props.position);
  });

  test('a primitive takes the early return, rather than the table', () => {
    // Two props holding `2` are two props holding two, not one value seen
    // twice -- and a `WeakMap` would refuse a number as a key, so what holds
    // this up is the test above the lookup rather than the lookup failing.
    const [frame] = nodesFrom(
      <RotationalFrame id="arm">
        <Weight mass={2} position={[1, 0]} />
        <Weight mass={2} position={[2, 0]} />
      </RotationalFrame>,
    );
    const [first, second] = frame!.children;

    expect(first!.props.mass).not.toBe(second!.props.mass);
    expect(() => literalOf(2, new WeakMap())).not.toThrow();
  });

  test("a building block's declared initial is not a shared value", () => {
    // A `meta`'s `initial` is one object across every instance of the
    // component, which is a fact about the metadata rather than about the
    // scene: two separately inserted lines are not two views of one endpoint.
    // `newNode` therefore reads without a sharing table.
    const first = newNode({ kind: 'core', component: Line });
    const second = newNode({ kind: 'core', component: Line });

    expect(first.props.endPos).toEqual(second.props.endPos);
    expect(first.props.endPos).not.toBe(second.props.endPos);
  });
});

describe('a reference nested inside an expression', () => {
  /** A `Pendulum` whose rod reaches twice what the instance passes. */
  const nesting = (): SceneDocument => {
    const reach = vec(mul(parameterOf('half'), 2), 0);
    const [arm] = nodesFrom(
      <RotationalFrame id="arm">
        <Line endPos={reach} lineWidth={0.1} />
        <Weight mass={1} position={reach} />
      </RotationalFrame>,
    );

    return {
      root: 'Scene',
      definitions: [
        {
          name: 'Scene',
          body: nodesFrom(<TrackFrame id="cart" />).map((cart) => ({
            ...cart,
            children: [
              {
                type: { kind: 'defined', name: 'Pendulum' },
                props: { half: literalOf(2) },
                children: [],
              } as DocNode,
            ],
          })),
        },
        {
          name: 'Pendulum',
          parameters: [{ name: 'half', type: 'scalar' }],
          body: [arm!],
        },
      ],
    };
  };

  test('a rename carries it, however deep it is', () => {
    // The sites that reason about references read the *tag*, and a tag says
    // `operation` for a prop holding a reference three operands down. A rename
    // that stopped there would leave `mul(half, 2)` naming a parameter the
    // definition no longer declares.
    const renamed = renameParameter(nesting(), 'Pendulum', 0, 'halfLength');

    expect(
      referencesIn(nodeAt(renamed, 'Pendulum', [0, 0]).props.endPos),
    ).toEqual(['halfLength']);
    expect(
      buildScene(elementOf(renamed)).frames[0]!.frames[0]!.weights[0]!
        .position[0],
    ).toBeCloseTo(4, 9);
    expect(() => emitScene(renamed)).not.toThrow();
  });

  test('a delete is refused by it, and an extraction carries it', () => {
    const doc = nesting();

    expect(parameterRemovalRefusal(doc, 'Pendulum', 0)).toMatch(
      /refers to half/,
    );

    const next = extractComponent(doc, 'Pendulum', [0], 'Arm');

    expect(definitionOf(next, 'Arm').parameters).toEqual([
      { name: 'half', type: 'scalar' },
    ]);
    expect(nodeAt(next, 'Pendulum', [0]).props.half).toEqual(
      parameterOf('half'),
    );
    expect(
      buildScene(elementOf(next)).frames[0]!.frames[0]!.weights[0]!.position[0],
    ).toBeCloseTo(4, 9);
  });

  test('an extraction that cannot carry it says so', () => {
    const doc = nesting();
    const undeclared: SceneDocument = {
      ...doc,
      definitions: doc.definitions.map((definition) =>
        definition.name === 'Pendulum'
          ? { ...definition, parameters: [] }
          : definition,
      ),
    };

    expect(extractionRefusal(undeclared, 'Pendulum', [0])).toMatch(
      /refers to half, which Pendulum does not take/,
    );
  });

  test('a graph that reaches itself is refused before it is resolved', () => {
    // Resolution now runs ahead of evaluation over the same graph, so without
    // its own guard the stack overflows here and evaluation's guard retires
    // nothing.
    const loop = { kind: 'operation', op: 'neg', operands: [] } as {
      kind: 'operation';
      op: 'neg';
      operands: unknown[];
    };
    loop.operands.push(loop);

    expect(() => resolvedProps({ mass: loop as PropValue }, {})).toThrow(
      /An expression reaches itself: neg -> neg/,
    );
  });

  test('a computed prop has no value to promote', () => {
    // Promoting one would declare a parameter at the *component's* default and
    // write a reference over the expression -- a silent scene change. The pane
    // offers no button beside a computed prop; a document built in code can
    // still ask.
    expect(promotionRefusal(nesting(), 'Pendulum', [0, 1], 'position')).toMatch(
      /position is computed, so there is no value to carry/,
    );
  });
});
