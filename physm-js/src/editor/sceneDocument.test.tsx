import Box from './../react/Box';
import CartAndRope, { RIG } from './../CartAndRope';
import Circle from './../react/Circle';
import RotationalFrame from './../react/RotationalFrame';
import TrackFrame from './../react/TrackFrame';
import Weight from './../react/Weight';
import buildScene from './../react/buildScene';
import starterDocument from './starterDocument';
import {
  definitionOf,
  documentFrom,
  elementOf,
  extractComponent,
  extractionRefusal,
  insertNode,
  moveNode,
  nameRefusal,
  nodeAt,
  nodesFrom,
  removeNode,
  setProp,
} from './sceneDocument';
import type CoreScene from './../Scene';
import type { DocNode, SceneDocument } from './sceneDocument';

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
    expect(node!.props).toEqual({ mass: 3 });
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
    expect(node!.props).toEqual({ id: 'cart' });

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
    const after = setProp(before, 'Scene', [0, 0], 'position', [-4, 0]);

    expect(nodeAt(after, 'Scene', [0, 0]).props.position).toEqual([-4, 0]);
    expect(nodeAt(before, 'Scene', [0, 0]).props.position).toEqual([-1, 0]);

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
    const next = setProp(doc, 'Scene', [0], 'id', 'wagon');

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
    expect(definitionOf(next, 'Chassis').body).toEqual([
      nodeAt(doc, 'Scene', [1, 0]),
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
