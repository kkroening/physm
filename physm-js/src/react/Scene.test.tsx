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
    const authored = assemble(
      <TrackFrame id="cart" initialState={[1, 0]} resistance={5}>
        <BoxDecal width={4} height={2} lineWidth={0.2} />
        <Weight mass={250} />
        <RotationalFrame id="pole" position={[0, -1]} initialState={[0.6, 0]}>
          <CircleDecal position={[3, 0]} radius={0.3} />
          <Weight mass={7} position={[3, 0]} />
        </RotationalFrame>
      </TrackFrame>,
    );

    const built = new CoreScene({
      frames: [
        new CoreTrackFrame({
          id: 'cart',
          initialState: [1, 0],
          resistance: 5,
          decals: [new CoreBoxDecal({ width: 4, height: 2, lineWidth: 0.2 })],
          weights: [new CoreWeight(250)],
          frames: [
            new CoreRotationalFrame({
              id: 'pole',
              position: [0, -1],
              initialState: [0.6, 0],
              decals: [new CoreCircleDecal({ position: [3, 0], radius: 0.3 })],
              weights: [new CoreWeight(7, { position: [3, 0] })],
            }),
          ],
        }),
      ],
    });

    expect(authored.toJsonObj()).toEqual(built.toJsonObj());
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
        <Scene onSceneChange={(built) => (scene = built)}>
          <TrackFrame id="cart">
            <Weight mass={1} />
            <RotationalFrame id="pole" />
          </TrackFrame>
        </Scene>
      </StrictMode>,
    );

    expect([...scene!.frameMap.keys()].sort()).toEqual(['cart', 'pole']);
    expect(scene!.sortedFrames).toHaveLength(2);
    expect(scene!.frameMap.get('cart')!.weights).toHaveLength(1);
  });

  test('gravity reaches the assembled scene, and defaults when omitted', () => {
    // A value that is not `DEFAULT_GRAVITY`, or this passes against a `<Scene>`
    // that ignores the prop entirely.
    let withProp: CoreScene | null = null;
    render(
      <Scene gravity={3.7} onSceneChange={(built) => (withProp = built)}>
        <TrackFrame id="a" />
      </Scene>,
    );

    expect(withProp!.gravity).toBeCloseTo(3.7, 9);
    expect(assemble(<TrackFrame id="a" />).gravity).toBe(DEFAULT_GRAVITY);
  });
});
