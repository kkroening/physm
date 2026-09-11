import CartAndRope, { RIG } from './../CartAndRope';
import Circle from './../react/Circle';
import RotationalFrame from './../react/RotationalFrame';
import TrackFrame from './../react/TrackFrame';
import Weight from './../react/Weight';
import buildScene from './../react/buildScene';
import {
  documentFrom,
  elementOf,
  insertNode,
  moveNode,
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

  test('a path that names nothing is refused', () => {
    expect(() => nodeAt(twoPoles(), 'Scene', [0, 9])).toThrow(/No node at/);
    expect(() => nodeAt(twoPoles(), 'Nope', [0])).toThrow(/no component named/);
  });
});
