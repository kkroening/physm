import BoxDecal from './BoxDecal';
import CircleDecal from './CircleDecal';
import CoincidenceConstraint from './CoincidenceConstraint';
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
import { DEFAULT_GRAVITY } from './../Scene';
import { StrictMode } from 'react';
import { render } from '@testing-library/react';
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
        <BoxDecal width={4} height={2} lineWidth={0.2} color="tomato" />
        <Weight mass={250} position={[0.5, 0]} drag={1.5} />
        <RotationalFrame
          id="pole"
          position={[0, -1]}
          initialState={[0.6, -0.2]}
          resistance={1.25}
        >
          <CircleDecal position={[3, 0]} radius={0.3} color="seagreen" />
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
        <CoincidenceConstraint
          frame1="left"
          frame2="right"
          position1={[1, 0]}
        />
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
            <BoxDecal width={1} color="red" />
            <BoxDecal width={2} color="blue" />
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
            <BoxDecal width={width} color="red" />
            <BoxDecal width={2} color="blue" />
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
          <CoincidenceConstraint
            frame1="left"
            frame2="right"
            position1={[1, 0]}
          />
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
