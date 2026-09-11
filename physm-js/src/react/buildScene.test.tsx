import Anchor from './Anchor';
import Box from './Box';
import CartAndRope, { RIG } from './../CartAndRope';
import Circle from './Circle';
import Coincidence from './Coincidence';
import RotationalFrame from './RotationalFrame';
import Scene from './Scene';
import TrackFrame from './TrackFrame';
import Weight from './Weight';
import buildScene from './buildScene';
import { render } from '@testing-library/react';
import type CoreScene from './../Scene';
import type { ReactElement, ReactNode } from 'react';

/** The scene the mounted binding assembles -- the oracle here. */
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

/**
 * A scene's serialization, with each frame id replaced by the frame's position
 * in `sortedFrames`.
 *
 * The two routes name an unnamed frame differently -- React's `useId` against a
 * path through the tree -- so a raw comparison would fail on exactly the frames
 * nobody named. Replacing ids by position keeps every other difference visible,
 * including a frame that landed in the wrong place: its position would differ,
 * and so would everything that references it.
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

  return rewrite(scene.toJsonObj());
}

describe('buildScene', () => {
  test('builds the demo rig exactly as the mounted binding does', () => {
    // The differential test the rest of the editor stands on: two routes, one
    // that walks the element tree and one that mounts it, must produce the
    // same scene -- frames, weights, constraints and the solved attachment
    // alike, in the same order.
    const walked = buildScene(<CartAndRope />);
    const mounted = assemble(<CartAndRope />);

    expect(normalized(walked)).toEqual(normalized(mounted));

    // `toJsonObj` omits decals, so the picture half is compared directly.
    expect(walked.decals).toEqual(mounted.decals);
    walked.sortedFrames.forEach((frame, index) => {
      expect(frame.decals).toEqual(mounted.sortedFrames[index]!.decals);
    });

    // And there was something to compare: the cart, both chains, the
    // pendulum, and the loop-closing constraint.
    expect(walked.sortedFrames).toHaveLength(2 * RIG.segmentCount + 2);
    expect(walked.constraints).toHaveLength(1);
    expect(walked.frameMap.has('cart')).toBe(true);
  });

  test('agrees with the mounted binding on every prop, named frames and all', () => {
    // Every prop set and none at its default, and every frame named, so no
    // normalization is needed and a dropped passthrough cannot agree with the
    // other side by coincidence.
    const rig = (
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
      </TrackFrame>
    );

    const walked = buildScene(rig);
    const mounted = assemble(rig);

    expect(walked.toJsonObj()).toEqual(mounted.toJsonObj());
    for (const frameId of ['cart', 'pole']) {
      expect(walked.frameMap.get(frameId)!.decals).toEqual(
        mounted.frameMap.get(frameId)!.decals,
      );
      expect(walked.frameMap.get(frameId)!.decals).not.toHaveLength(0);
    }
  });

  test('names an unnamed frame by its path, the same way every time', () => {
    // A state map is keyed by frame id, so a generated id that changed between
    // builds would silently reset the rig -- `getPosMatrixMap` forgives a
    // missing frame by reading its initial state.
    const rig = (
      <TrackFrame id="cart">
        <RotationalFrame />
        <RotationalFrame key="named-by-key" />
      </TrackFrame>
    );

    const ids = (scene: CoreScene): string[] =>
      scene.frameMap.get('cart')!.frames.map((frame) => frame.id);

    expect(ids(buildScene(rig))).toEqual(['@0.0', '@0.named-by-key']);
    expect(ids(buildScene(rig))).toEqual(ids(buildScene(rig)));
  });

  test('orders siblings as the JSX does', () => {
    // By construction -- there is no registration order to go by. A keyed list
    // in reverse is the case where "first to register" and "first in the JSX"
    // are easiest to confuse.
    //
    // Read off the parent's `frames`, which is what JSX order governs -- not
    // `sortedFrames`, which `Scene` derives by its own topological sort and
    // which lists siblings in a different order from either.
    const scene = buildScene(
      <TrackFrame id="cart">
        {['z', 'y', 'x'].map((id) => (
          <RotationalFrame key={id} id={id} />
        ))}
      </TrackFrame>,
    );

    expect(scene.frameMap.get('cart')!.frames.map((frame) => frame.id)).toEqual(
      ['z', 'y', 'x'],
    );
  });

  test('refuses an anchor named by ref, and says what to do instead', () => {
    // A ref is filled by an effect, and nothing here runs one -- so it would
    // stay empty, and the constraint would have nothing to name. A plain object
    // stands in for `useRef`, which would throw outside a render.
    const tip = { current: null };
    const rig = (
      <>
        <RotationalFrame id="a">
          <Anchor ref={tip} />
        </RotationalFrame>
        <RotationalFrame id="b" />
        <Coincidence frame1="b" frame2={tip} />
      </>
    );

    expect(() => buildScene(rig)).toThrow(/Give the anchor an id/);
  });

  test('refuses a DOM element, naming it', () => {
    expect(() =>
      buildScene(
        <g>
          <TrackFrame id="cart" />
        </g>,
      ),
    ).toThrow(/<g> at '0' is not a physm component/);
  });

  test('stops a recursion that never ends, rather than overflowing', () => {
    function Forever(): ReactElement {
      return <Forever />;
    }

    expect(() => buildScene(<Forever />)).toThrow(/nest more than 1000 deep/);
  });

  test('refuses a Weight at the root, as the mounted binding does', () => {
    expect(() => buildScene(<Weight mass={1} />)).toThrow(
      /must be inside a frame/,
    );
  });

  test('refuses two anchors sharing an id, as the mounted binding does', () => {
    expect(() =>
      buildScene(
        <>
          <RotationalFrame id="a">
            <Anchor id="tip" />
          </RotationalFrame>
          <RotationalFrame id="b">
            <Anchor id="tip" />
          </RotationalFrame>
        </>,
      ),
    ).toThrow(/share the id 'tip'/);
  });

  test('refuses a name meaning both an anchor and a frame, as the mounted binding does', () => {
    expect(() =>
      buildScene(
        <>
          <RotationalFrame id="post" />
          <RotationalFrame id="arm">
            <Anchor id="post" />
          </RotationalFrame>
        </>,
      ),
    ).toThrow(/'post' names both an <Anchor> and a frame/);
  });
});
