import Box from './Box';
import Anchor from './Anchor';
import Circle from './Circle';
import Coincidence from './Coincidence';
import Distance from './Distance';
import CoreBoxDecal from './../BoxDecal';
import CoreCircleDecal from './../CircleDecal';
import CoreRotationalFrame from './../RotationalFrame';
import CoreScene from './../Scene';
import CoreTrackFrame from './../TrackFrame';
import CoreWeight from './../Weight';
import RotationalFrame from './RotationalFrame';
import Scene from './Scene';
import TrackFrame from './TrackFrame';
import Weight from './Weight';
import { CoincidenceConstraint as CoreCoincidenceConstraint } from './../Constraint';
import { DistanceConstraint as CoreDistanceConstraint } from './../Constraint';
import { DEFAULT_GRAVITY } from './../Scene';
import { StrictMode } from 'react';
import { createElement } from 'react';
import { render } from '@testing-library/react';
import { useRef } from 'react';
import type { AnchorPoint } from './sceneNodes';
import type { ReactElement, ReactNode } from 'react';

/**
 * The scene a JSX tree assembles.
 *
 * Assembly takes two renders -- the first registers, the second builds -- so
 * this reads the scene out of `onSceneChange` rather than from the first
 * render's return.
 */
function assemble(children: ReactNode): CoreScene {
  let scene: CoreScene | null = null;
  render(
    <svg>
      <Scene onSceneChange={(built) => (scene = built)}>{children}</Scene>
    </svg>,
  );
  if (!scene) {
    throw new Error('no scene was assembled');
  }

  return scene;
}

describe('Scene (authoring)', () => {
  test('assembles the same scene the imperative API builds', () => {
    // The whole justification for the binding: the JSX is a *different way to
    // write the same thing*, not a different thing. Every frame carries an
    // explicit id, because an omitted one is generated and would differ
    // between the two by construction.
    // Every prop set, and none at its default: a passthrough that is dropped
    // then agrees with the other side by coincidence, and the test says nothing.
    const authored = assemble(
      <TrackFrame
        id="cart"
        position={[2, -3]}
        angle={0.25}
        initialState={[1, 0.5]}
        resistance={5}
      >
        <Box width={4} height={2} lineWidth={0.2} color="tomato" />
        <Weight mass={250} position={[0.5, 0]} drag={1.5} />
        <RotationalFrame
          id="pole"
          position={[0, -1]}
          initialState={[0.6, -0.2]}
          resistance={1.25}
        >
          <Circle position={[3, 0]} radius={0.3} color="seagreen" />
          <Weight mass={7} position={[3, 0]} drag={6} />
        </RotationalFrame>
      </TrackFrame>,
    );

    const built = new CoreScene({
      frames: [
        new CoreTrackFrame({
          id: 'cart',
          position: [2, -3],
          angle: 0.25,
          initialState: [1, 0.5],
          resistance: 5,
          decals: [
            new CoreBoxDecal({
              width: 4,
              height: 2,
              lineWidth: 0.2,
              color: 'tomato',
            }),
          ],
          weights: [new CoreWeight(250, { position: [0.5, 0], drag: 1.5 })],
          frames: [
            new CoreRotationalFrame({
              id: 'pole',
              position: [0, -1],
              initialState: [0.6, -0.2],
              resistance: 1.25,
              decals: [
                new CoreCircleDecal({
                  position: [3, 0],
                  radius: 0.3,
                  color: 'seagreen',
                }),
              ],
              weights: [new CoreWeight(7, { position: [3, 0], drag: 6 })],
            }),
          ],
        }),
      ],
    });

    expect(authored.toJsonObj()).toEqual(built.toJsonObj());

    // `toJsonObj` omits decals by default and `Decal.toJsonObj` throws, so the
    // serialization above is structurally blind to them -- all three decal
    // components could register nothing and it would still pass. The picture
    // half of the equality has to be compared directly.
    for (const frameId of ['cart', 'pole']) {
      expect(authored.frameMap.get(frameId)!.decals).toEqual(
        built.frameMap.get(frameId)!.decals,
      );
      expect(authored.frameMap.get(frameId)!.decals).not.toHaveLength(0);
    }
  });

  test('a composed component contributes exactly what it renders', () => {
    // The property that makes this worth having over an array literal: a
    // repeated structure is an ordinary React component, and nesting it is
    // nesting the frames it describes.
    function Segment({
      depth,
      children,
    }: {
      depth: number;
      children?: ReactNode;
    }): ReactElement {
      return (
        <RotationalFrame id={`seg${depth}`} position={[1, 0]}>
          <Weight mass={2} position={[1, 0]} />
          {children}
        </RotationalFrame>
      );
    }

    function Chain({ length }: { length: number }): ReactElement {
      return [...Array(length).keys()].reduceRight(
        (inner: ReactElement | null, depth) => (
          <Segment depth={depth}>{inner}</Segment>
        ),
        null,
      ) as ReactElement;
    }

    const scene = assemble(
      <TrackFrame id="cart">
        <Chain length={4} />
      </TrackFrame>,
    );

    // Five frames deep: the cart plus four segments, each inside the last.
    expect([...scene.frameMap.keys()].sort()).toEqual([
      'cart',
      'seg0',
      'seg1',
      'seg2',
      'seg3',
    ]);
    expect(scene.sortedFrames).toHaveLength(5);
    expect(scene.frameIdPathMap.get('seg3')).toEqual([
      'cart',
      'seg0',
      'seg1',
      'seg2',
      'seg3',
    ]);
  });

  test('a constraint is solved against the assembled pose', () => {
    // Constraints are scene children rather than frame children, and are added
    // after the tree exists -- `addConstraint` needs both frames present and
    // solves the omitted `position2` from where they actually are.
    const scene = assemble(
      <>
        <RotationalFrame id="left" position={[-2, 0]} initialState={[0, 0]}>
          <Weight mass={1} position={[1, 0]} />
        </RotationalFrame>
        <RotationalFrame id="right" position={[2, 0]} initialState={[0, 0]}>
          <Weight mass={1} position={[1, 0]} />
        </RotationalFrame>
        <Coincidence frame1="left" frame2="right" position1={[1, 0]} />
      </>,
    );

    expect(scene.constraints).toHaveLength(1);
    const solved = scene.constraints[0] as CoreCoincidenceConstraint;

    // `left`'s tip is at -1; `right`'s origin is at 2; so the attachment on
    // `right` is 3 to its left, and the loop closes exactly.
    expect(solved.localPosition2[0]).toBeCloseTo(-3, 9);
    expect(
      scene.getSeparation('left', [1, 0], 'right', [
        solved.localPosition2[0],
        solved.localPosition2[1],
      ]).distance,
    ).toBeCloseTo(0, 9);
  });

  test('survives StrictMode, which mounts every effect twice', () => {
    // The failure mode effect-based registration is most exposed to: React
    // mounts, unmounts and remounts every effect in development, so a
    // registration that is not idempotent leaves duplicates, and a cleanup
    // that over-deletes leaves an empty scene. Both would show here as a frame
    // count that is not two.
    let scene: CoreScene | null = null;
    render(
      <StrictMode>
        <svg>
          <Scene onSceneChange={(built) => (scene = built)}>
            <TrackFrame id="cart">
              <Weight mass={1} />
              <RotationalFrame id="pole" />
            </TrackFrame>
          </Scene>
        </svg>
      </StrictMode>,
    );

    expect([...scene!.frameMap.keys()].sort()).toEqual(['cart', 'pole']);
    expect(scene!.sortedFrames).toHaveLength(2);
    expect(scene!.frameMap.get('cart')!.weights).toHaveLength(1);
  });

  test('a prop change reaches the scene without reordering siblings', () => {
    // The update path, which mount-only tests cannot reach and StrictMode does
    // not stand in for -- it tears the whole tree down and rebuilds it in
    // order, which exercises idempotence rather than update.
    //
    // Sibling order is load-bearing twice over: for decals it is SVG paint
    // order, and for frames it is the coordinate order of `sortedFrames`, which
    // indexes the mass matrix and the Jacobian's columns.
    let scene: CoreScene | null = null;
    // The changed prop is on the *frame*, so it is the frame that
    // re-registers. Changing a child's prop instead would re-register the
    // child and leave frame order untouched, which is a weaker test than it
    // looks.
    const tree = (resistance: number): ReactElement => (
      <svg>
        <Scene onSceneChange={(built) => (scene = built)}>
          <RotationalFrame id="first" resistance={resistance}>
            <Box width={1} color="red" />
            <Box width={2} color="blue" />
          </RotationalFrame>
          <RotationalFrame id="second" />
          <RotationalFrame id="third" />
        </Scene>
      </svg>
    );

    const { rerender } = render(tree(1));
    expect(scene!.frames.map((frame) => frame.id)).toEqual([
      'first',
      'second',
      'third',
    ]);

    rerender(tree(9));

    expect(scene!.frameMap.get('first')!.resistance).toBe(9);
    expect(scene!.frames.map((frame) => frame.id)).toEqual([
      'first',
      'second',
      'third',
    ]);
  });

  test('a decal prop change leaves paint order alone', () => {
    // Decal order is SVG paint order, so a reorder flips which of two
    // overlapping shapes is on top -- visible, and from a change to an
    // unrelated property.
    let scene: CoreScene | null = null;
    const tree = (width: number): ReactElement => (
      <svg>
        <Scene onSceneChange={(built) => (scene = built)}>
          <RotationalFrame id="a">
            <Box width={width} color="red" />
            <Box width={2} color="blue" />
          </RotationalFrame>
        </Scene>
      </svg>
    );

    const { rerender } = render(tree(1));
    rerender(tree(5));

    expect(
      scene!.frameMap
        .get('a')!
        .decals.map((decal) => (decal as CoreBoxDecal).color),
    ).toEqual(['red', 'blue']);
  });

  test('an unnamed frame keeps its id across a rebuild', () => {
    // `Frame` generates an id when given none, and assembly reconstructs every
    // frame on each registration change -- so a regenerated id would silently
    // stop matching a caller's state map, and `getPosMatrixMap` forgives an
    // absent frame by reading its `initialState` rather than complaining. The
    // rig would snap back to `t = 0` and stay there.
    let scene: CoreScene | null = null;
    const tree = (mass: number): ReactElement => (
      <svg>
        <Scene onSceneChange={(built) => (scene = built)}>
          <RotationalFrame>
            <Weight mass={mass} />
          </RotationalFrame>
        </Scene>
      </svg>
    );

    const { rerender } = render(tree(1));
    const before = [...scene!.frameMap.keys()];
    rerender(tree(2));

    expect([...scene!.frameMap.keys()]).toEqual(before);
  });

  test('onSceneChange fires once per change, not once per render', () => {
    // It is a notification, so it belongs in an effect: called during render it
    // warns as soon as a consumer holds the scene in state, and re-fires on
    // renders that changed nothing. The usual inline arrow is a fresh identity
    // every render, which is not a change.
    const scenes: CoreScene[] = [];
    const tree = (
      <svg>
        <Scene onSceneChange={(built) => scenes.push(built)}>
          <RotationalFrame id="a" />
        </Scene>
      </svg>
    );

    const { rerender } = render(tree);
    const afterMount = scenes.length;
    rerender(tree);
    rerender(tree);

    expect(afterMount).toBe(1);
    expect(scenes).toHaveLength(1);
  });

  test('unmounting a constrained frame does not throw', () => {
    // Registrations arrive and depart one effect at a time, so assembly runs
    // against a registry that is transiently inconsistent -- by design. A
    // constraint naming a frame that is mid-unmount must wait rather than
    // throw: `addConstraint` treats that as fatal, and a throw from `Scene`'s
    // render body takes the tree down with it.
    const tree = (withRight: boolean): ReactElement => (
      <svg>
        <Scene>
          <RotationalFrame id="left" position={[-2, 0]}>
            <Weight mass={1} position={[1, 0]} />
          </RotationalFrame>
          {withRight ? (
            <RotationalFrame id="right" position={[2, 0]}>
              <Weight mass={1} position={[1, 0]} />
            </RotationalFrame>
          ) : null}
          <Coincidence frame1="left" frame2="right" position1={[1, 0]} />
        </Scene>
      </svg>
    );

    const { rerender } = render(tree(true));

    expect(() => rerender(tree(false))).not.toThrow();
  });

  test('a Weight at the root of a scene is refused, not dropped', () => {
    // A scene carries no mass of its own, so there is nowhere for it to go --
    // and a silently missing mass changes the answer rather than the picture.
    expect(() =>
      render(
        <svg>
          <Scene>
            <Weight mass={5} />
            <RotationalFrame id="a" />
          </Scene>
        </svg>,
      ),
    ).toThrow(/must be inside a frame/);
  });

  test('refuses children under a building block that is not a frame, as the walk does', () => {
    const stray = createElement(
      RotationalFrame,
      { id: 'host' },
      createElement(Box, null, createElement(Weight, { mass: 1 })),
    );

    expect(() =>
      render(
        <svg>
          <Scene>{stray}</Scene>
        </svg>,
      ),
    ).toThrow(/A <Box> is holding children, and only a frame can/);
  });

  test('a Weight alone at the root is refused too, not taken for an empty scene', () => {
    // A tree with nothing to draw yet assembles to no scene at all -- which a
    // root weight must not pass for, or it would be dropped after all.
    expect(() =>
      render(
        <svg>
          <Scene>
            <Weight mass={5} />
          </Scene>
        </svg>,
      ),
    ).toThrow(/must be inside a frame/);
  });

  test('an anchor wires a constraint to a frame nobody named', () => {
    // The case the string-id form cannot express. `Chain` generates its frames
    // and names none of them, so an author outside it has no id to write --
    // which is the problem the JSX authoring exists to remove, reappearing one
    // level up. The chain marks its own tip instead.
    //
    // The two chains are deliberately *different*: same-shaped chains put
    // corresponding frames at identical poses, so any pair of them separates by
    // zero and the closing assertion below would hold for the chain's root, its
    // middle link, or a position of [0, 0]. Different depths and angles are what
    // make it distinguish the tip from anything else.
    function Chain({
      depth,
      angle,
      children,
    }: {
      depth: number;
      angle: number;
      children?: ReactNode;
    }): ReactElement {
      return depth === 0 ? (
        <RotationalFrame position={[1, 0]} initialState={[angle, 0]}>
          {children}
        </RotationalFrame>
      ) : (
        <RotationalFrame position={[1, 0]} initialState={[angle, 0]}>
          <Chain depth={depth - 1} angle={angle}>
            {children}
          </Chain>
        </RotationalFrame>
      );
    }

    function Rig(): ReactElement {
      const left = useRef<AnchorPoint>(null);
      const right = useRef<AnchorPoint>(null);

      return (
        <>
          <TrackFrame id="cart">
            <Chain depth={2} angle={0.3}>
              <Anchor ref={left} position={[1, 0]} />
            </Chain>
            <Chain depth={3} angle={-0.7}>
              {/* No position: the attachment on this end is solved. */}
              <Anchor ref={right} />
            </Chain>
          </TrackFrame>
          <Coincidence frame1={left} frame2={right} />
        </>
      );
    }

    const scene = assemble(<Rig />);

    expect(scene.constraints).toHaveLength(1);

    const solved = scene.constraints[0] as CoreCoincidenceConstraint;

    // Both ids are generated -- neither appears in the JSX above, which is the
    // whole point -- and each names a chain *tip*, not some frame along it: a
    // tip is the one frame in its chain with no child frame.
    for (const frameId of [solved.frameId1, solved.frameId2]) {
      expect(scene.frameMap.has(frameId)).toBe(true);
      expect(frameId).not.toBe('cart');
      expect(scene.frameMap.get(frameId)!.frames).toHaveLength(0);
    }
    expect(solved.frameId1).not.toBe(solved.frameId2);

    // And the loop closes across a gap nobody measured. The right anchor states
    // no point, so `position2` is solved from the assembled pose -- which is
    // what lets two chains of different length and lean meet exactly.
    const gap = scene.getSeparation(
      solved.frameId1,
      [1, 0],
      solved.frameId2,
      solved.localPosition2,
    ).distance;

    expect(gap).toBeCloseTo(0, 9);

    // ...and they genuinely were apart, so the closing above is the solve
    // working rather than the two ends coinciding by construction.
    expect(
      scene.getSeparation(solved.frameId1, [1, 0], solved.frameId2, [1, 0])
        .distance,
    ).toBeGreaterThan(0.5);
  });

  test('an anchor mounting alone still resolves its constraint', () => {
    // Why `<Anchor>` registers a node it contributes nothing to. The point
    // travels by ref, and a ref re-renders nobody -- so when an anchor is the
    // *only* thing that mounts, its own registration is the sole bump available
    // to trigger the reassembly that resolves the constraint. Without it the
    // memo returns its cached scene forever, with the ref sitting there
    // populated and the constraint dropped.
    //
    // `Rig` is declared here rather than inside the render helper on purpose. A
    // component declared inside one is a fresh type on every call, so React
    // unmounts and remounts the whole subtree and *everything* re-registers --
    // which hides exactly the thing this test is for.
    let scene: CoreScene | null = null;

    function Rig({ withAnchor }: { withAnchor: boolean }): ReactElement {
      const tip = useRef<AnchorPoint>(null);

      return (
        <>
          <RotationalFrame id="post" position={[1, 0]}>
            {withAnchor ? <Anchor ref={tip} /> : null}
          </RotationalFrame>
          <RotationalFrame id="other" position={[3, 0]} />
          <Coincidence frame1="other" frame2={tip} />
        </>
      );
    }

    const tree = (withAnchor: boolean): ReactElement => (
      <svg>
        <Scene onSceneChange={(built) => (scene = built)}>
          <Rig withAnchor={withAnchor} />
        </Scene>
      </svg>
    );

    const { rerender } = render(tree(false));
    expect(scene!.constraints).toHaveLength(0);

    rerender(tree(true));

    expect(scene!.constraints).toHaveLength(1);
  });

  test('a Distance constraint takes anchors too, and solves its length', () => {
    // `<Distance>` gained anchor ends in the same change and had no test. Its
    // free parameter is `length` rather than `position2`, so an omitted one
    // adopts whatever gap the assembled scene places -- the same "author any
    // geometry" property, on the other constraint type.
    function Rig(): ReactElement {
      const a = useRef<AnchorPoint>(null);
      const b = useRef<AnchorPoint>(null);

      return (
        <>
          <TrackFrame id="cart">
            <RotationalFrame id="left" position={[-4, 0]}>
              <Anchor ref={a} position={[1, 0]} />
            </RotationalFrame>
            <RotationalFrame id="right" position={[4, 0]}>
              <Anchor ref={b} position={[1, 0]} />
            </RotationalFrame>
          </TrackFrame>
          <Distance frame1={a} frame2={b} />
        </>
      );
    }

    const scene = assemble(<Rig />);

    expect(scene.constraints).toHaveLength(1);

    const solved = scene.constraints[0] as CoreDistanceConstraint;

    // Both arms sit at angle 0, so both reach +1 along x: the tips land at -3
    // and 5, which is 8 apart. The adopted length is that gap, whatever it
    // happens to be -- which is the property, not the number.
    expect(solved.length).toBeCloseTo(8, 9);
    expect(solved.length).toBeCloseTo(
      scene.getSeparation('left', [1, 0], 'right', [1, 0]).distance,
      9,
    );
    expect(solved.frameId1).toBe('left');
    expect(solved.frameId2).toBe('right');
  });

  test('a constraint naming an anchor that never reports is dropped, not thrown', () => {
    // A ref passed to nothing. The registry is transiently inconsistent by
    // design, so an unreported anchor has to read as "wait" rather than as an
    // error -- and a throw from assembly would take the tree down.
    function Rig(): ReactElement {
      const nowhere = useRef<AnchorPoint>(null);

      return (
        <>
          <RotationalFrame id="a" />
          <Coincidence frame1="a" frame2={nowhere} />
        </>
      );
    }

    const scene = assemble(<Rig />);

    expect(scene.constraints).toHaveLength(0);
  });

  test('an anchor named by id wires a constraint, with no ref anywhere', () => {
    // The declarative form, and the one a document can hold.
    //
    // The frames are deliberately unnamed, so the test is about the anchor ids
    // resolving to *generated* frame ids rather than about names that happen
    // to match.
    function Rig(): ReactElement {
      return (
        <>
          <TrackFrame id="cart">
            <RotationalFrame position={[-2, 0]} initialState={[0.3, 0]}>
              <Anchor id="left" position={[1, 0]} />
            </RotationalFrame>
            <RotationalFrame position={[2, 0]} initialState={[-0.7, 0]}>
              {/* No position: the attachment on this end is solved. */}
              <Anchor id="right" />
            </RotationalFrame>
          </TrackFrame>
          <Coincidence frame1="left" frame2="right" />
        </>
      );
    }

    const scene = assemble(<Rig />);

    expect(scene.constraints).toHaveLength(1);

    const solved = scene.constraints[0] as CoreCoincidenceConstraint;

    // Neither end is `left`, `right` or `cart`: the ids resolved through the
    // anchors to the frames they sit on, which nobody named.
    for (const frameId of [solved.frameId1, solved.frameId2]) {
      expect(scene.frameMap.has(frameId)).toBe(true);
      expect(['left', 'right', 'cart']).not.toContain(frameId);
    }
    expect(solved.frameId1).not.toBe(solved.frameId2);

    // The right anchor states no point, so `position2` is solved and the two
    // ends meet -- having genuinely been apart, so this is the solve working.
    expect(
      scene.getSeparation(
        solved.frameId1,
        [1, 0],
        solved.frameId2,
        solved.localPosition2,
      ).distance,
    ).toBeCloseTo(0, 9);
    expect(
      scene.getSeparation(solved.frameId1, [1, 0], solved.frameId2, [1, 0])
        .distance,
    ).toBeGreaterThan(0.5);
  });

  test('a name that means both an anchor and a frame is refused', () => {
    // Resolved as the anchor, it would silently move a constraint end -- and
    // the position it states -- onto a frame its author never named. The same
    // reason two anchors sharing an id are refused.
    function Rig(): ReactElement {
      return (
        <>
          <RotationalFrame id="post" position={[0, 0]} />
          <RotationalFrame id="arm" position={[5, 0]}>
            <Anchor id="post" />
          </RotationalFrame>
          <RotationalFrame id="other" position={[9, 0]} />
          <Coincidence frame1="post" frame2="other" />
        </>
      );
    }

    expect(() => assemble(<Rig />)).toThrow(
      /'post' names both an <Anchor> and a frame/,
    );
  });

  test('an id-named anchor that moves takes its constraint with it', () => {
    // A move is an unmount plus a mount, and the old registration is only
    // reaped after assembly -- so for one assembly both are in the map, and only
    // the dead flag keeps that from reading as two anchors sharing the id.
    let scene: CoreScene | null = null;

    function Rig({ onB }: { onB: boolean }): ReactElement {
      return (
        <>
          <RotationalFrame id="a" position={[1, 0]}>
            {onB ? null : <Anchor id="tip" />}
          </RotationalFrame>
          <RotationalFrame id="b" position={[2, 0]}>
            {onB ? <Anchor id="tip" /> : null}
          </RotationalFrame>
          <RotationalFrame id="other" position={[3, 0]} />
          <Coincidence frame1="other" frame2="tip" />
        </>
      );
    }

    // `Rig` outside `tree`, for the same reason as in the anchor-mounting test
    // above: declared inside, it is a new type on every call, and the full
    // remount would hide the dead entry.
    const tree = (onB: boolean): ReactElement => (
      <svg>
        <Scene onSceneChange={(built) => (scene = built)}>
          <Rig onB={onB} />
        </Scene>
      </svg>
    );

    const { rerender } = render(tree(false));

    expect((scene!.constraints[0] as CoreCoincidenceConstraint).frameId2).toBe(
      'a',
    );

    rerender(tree(true));

    expect((scene!.constraints[0] as CoreCoincidenceConstraint).frameId2).toBe(
      'b',
    );
  });

  test('two anchors sharing an id are refused', () => {
    // Resolving either way would weld the constraint to whichever registered
    // first -- an answer, silently chosen, that the JSX does not show.
    function Rig(): ReactElement {
      return (
        <>
          <RotationalFrame id="a">
            <Anchor id="tip" />
          </RotationalFrame>
          <RotationalFrame id="b">
            <Anchor id="tip" />
          </RotationalFrame>
        </>
      );
    }

    expect(() => assemble(<Rig />)).toThrow(/share the id 'tip'/);
  });

  test('an Anchor outside any frame is refused', () => {
    // It marks a point *on a frame*, and there is no frame at the root of a
    // scene for it to mark.
    function Rig(): ReactElement {
      const stray = useRef<AnchorPoint>(null);

      return <Anchor ref={stray} />;
    }

    expect(() => assemble(<Rig />)).toThrow(/must be inside a frame/);
  });

  test('gravity reaches the assembled scene, and defaults when omitted', () => {
    // A value that is not `DEFAULT_GRAVITY`, or this passes against a `<Scene>`
    // that ignores the prop entirely.
    let withProp: CoreScene | null = null;
    render(
      <svg>
        <Scene gravity={3.7} onSceneChange={(built) => (withProp = built)}>
          <TrackFrame id="a" />
        </Scene>
      </svg>,
    );

    expect(withProp!.gravity).toBeCloseTo(3.7, 9);
    expect(assemble(<TrackFrame id="a" />).gravity).toBe(DEFAULT_GRAVITY);
  });
});
