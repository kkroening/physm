import Box from './../react/Box';
import CartAndRope, { RIG } from './../CartAndRope';
import Circle from './../react/Circle';
import Frame from './../Frame';
import RotationalFrame from './../react/RotationalFrame';
import TrackFrame from './../react/TrackFrame';
import Weight from './../react/Weight';
import buildScene from './../react/buildScene';
import starterDocument from './starterDocument';
import { literalOf, parameterOf } from './propValue';
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
} from './sceneDocument';
import type CoreScene from './../Scene';
import type { DocNode, ElementOrigin, SceneDocument } from './sceneDocument';
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

  test('a subtree that refers to a parameter cannot be extracted', () => {
    // The new component would declare nothing, so the reference would resolve
    // against an empty scope and the weight would quietly move to the
    // component's own default -- an extraction that changes the scene, which
    // is the one thing this edit promises not to do. The compiler does not
    // raise it: the prop crosses whole rather than through `.value`.
    const [frame] = nodesFrom(
      <RotationalFrame id="arm">
        <Weight mass={1} position={[1, 0]} />
      </RotationalFrame>,
    );
    const doc: SceneDocument = {
      root: 'Scene',
      definitions: [
        {
          name: 'Scene',
          parameters: [{ name: 'bob', type: 'point' }],
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

    expect(extractionRefusal(doc, 'Scene', [0])).toMatch(
      /position refers to Scene's bob/,
    );
    expect(() => extractComponent(doc, 'Scene', [0], 'Arm')).toThrow(
      /position refers to Scene's bob/,
    );
  });
});

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

    expect(parameterNameRefusal(doc, 'Scene', 1, 'half-length')).toMatch(
      /starts with a letter/,
    );
    expect(parameterNameRefusal(doc, 'Scene', 1, 'children')).toMatch(
      /names what a component is given/,
    );
    expect(parameterNameRefusal(doc, 'Scene', 1, 'bob')).toBe(
      'Scene already takes bob.',
    );
    expect(parameterNameRefusal(doc, 'Scene', 1, 'Array')).toMatch(
      /JavaScript built-in/,
    );

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
