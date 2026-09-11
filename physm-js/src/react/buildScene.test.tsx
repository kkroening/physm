import Anchor from './Anchor';
import Box from './Box';
import CartAndRope, { RIG } from './../CartAndRope';
import Circle from './Circle';
import Coincidence from './Coincidence';
import CoreBoxDecal from './../BoxDecal';
import CoreCircleDecal from './../CircleDecal';
import CoreFixedFrame from './../FixedFrame';
import CoreLineDecal from './../LineDecal';
import CoreRotationalFrame from './../RotationalFrame';
import CoreScene from './../Scene';
import CoreTrackFrame from './../TrackFrame';
import CoreWeight from './../Weight';
import Distance from './Distance';
import FixedFrame from './FixedFrame';
import Line from './Line';
import RotationalFrame from './RotationalFrame';
import Scene from './Scene';
import TrackFrame from './TrackFrame';
import Weight from './Weight';
import buildScene from './buildScene';
import coreComponents from './coreComponents';
import { CoincidenceConstraint, DistanceConstraint } from './../Constraint';
import { createElement } from 'react';
import { render } from '@testing-library/react';
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

/**
 * All ten building blocks with every prop set: none at its default when `k`
 * is 1, and every one different between `k` = 1 and 2.
 *
 * The constraints join three pairs of weighted pivots set `gap` apart at
 * angle 0, posed so every stated position and length holds -- which the
 * constraints check -- and so no pair sits at a kinematic singularity, since
 * `<Scene>` solves for initial velocities. Every frame is named, so nothing
 * needs normalizing.
 */
function fullRig(k: 1 | 2): ReactElement {
  const gap = 2 + k;
  const y = 6 + k;
  const pivot = (id: string, x: number, children?: ReactNode): ReactElement => (
    <RotationalFrame
      id={id}
      position={[x, y]}
      initialState={[0, 0.1 * k]}
      resistance={0.5 * k}
    >
      <Weight mass={1} position={[1, 0]} />
      {children}
    </RotationalFrame>
  );

  return (
    <>
      <Line
        startPos={[-k, -4]}
        endPos={[k, -4]}
        lineWidth={0.1 * k}
        color={k === 1 ? 'slategray' : 'peru'}
      />
      <TrackFrame
        id="cart"
        position={[2 * k, -3]}
        angle={0.25 * k}
        initialState={[k, 0.5 * k]}
        resistance={5 * k}
      >
        <Box
          width={4 * k}
          height={2 * k}
          position={[0.5 * k, 0.1]}
          angle={0.2 * k}
          centered={k === 2}
          solid={k === 2}
          lineWidth={0.2 * k}
          color={k === 1 ? 'tomato' : 'navy'}
        />
        <Weight mass={250 * k} position={[0.5 * k, 0]} drag={1.5 * k} />
        <RotationalFrame
          id="pole"
          position={[0, -k]}
          initialState={[0.6 * k, -0.2 * k]}
          resistance={1.25 * k}
        >
          <Circle
            position={[3 * k, 0]}
            radius={0.3 * k}
            color={k === 1 ? 'seagreen' : 'gold'}
          />
          <Weight mass={7 * k} position={[3 * k, 0]} drag={6 * k} />
        </RotationalFrame>
      </TrackFrame>
      <FixedFrame id="mount" position={[-10 * k, 2]} angle={0.3 * k}>
        <RotationalFrame id="hung" initialState={[0.2 * k, 0]}>
          <Weight mass={2} position={[1, 0]} />
        </RotationalFrame>
      </FixedFrame>
      {pivot('c1', -20)}
      {pivot('c2', -20 + gap)}
      {pivot('d1', 0, <Anchor id="d1-top" position={[0, 1]} />)}
      {pivot('d2', gap)}
      {pivot('e1', 20)}
      {pivot('e2', 20 + gap)}
      <Coincidence
        frame1="c1"
        frame2="c2"
        position1={[gap, gap]}
        position2={[0, gap]}
      />
      <Distance frame1="d1-top" frame2="d2" position2={[0, 1]} length={gap} />
      <Distance
        frame1="e1"
        frame2="e2"
        position1={[0, -1]}
        position2={[0, -1]}
        length={gap}
      />
    </>
  );
}

/**
 * `fullRig(k)`, built by calling the core constructors by hand.
 *
 * The independent oracle: it shares nothing with the describers, so a describer
 * that drops a prop disagrees with it -- where `<Scene>`, which calls the same
 * describers, would agree just as happily.
 */
function handBuilt(k: 1 | 2): CoreScene {
  const gap = 2 + k;
  const y = 6 + k;
  const pivot = (id: string, x: number): CoreRotationalFrame =>
    new CoreRotationalFrame({
      id,
      position: [x, y],
      initialState: [0, 0.1 * k],
      resistance: 0.5 * k,
      weights: [new CoreWeight(1, { position: [1, 0] })],
    });

  const scene = new CoreScene({
    decals: [
      new CoreLineDecal({
        startPos: [-k, -4],
        endPos: [k, -4],
        lineWidth: 0.1 * k,
        color: k === 1 ? 'slategray' : 'peru',
      }),
    ],
    frames: [
      new CoreTrackFrame({
        id: 'cart',
        position: [2 * k, -3],
        angle: 0.25 * k,
        initialState: [k, 0.5 * k],
        resistance: 5 * k,
        decals: [
          new CoreBoxDecal({
            width: 4 * k,
            height: 2 * k,
            position: [0.5 * k, 0.1],
            angle: 0.2 * k,
            centered: k === 2,
            solid: k === 2,
            lineWidth: 0.2 * k,
            color: k === 1 ? 'tomato' : 'navy',
          }),
        ],
        weights: [
          new CoreWeight(250 * k, { position: [0.5 * k, 0], drag: 1.5 * k }),
        ],
        frames: [
          new CoreRotationalFrame({
            id: 'pole',
            position: [0, -k],
            initialState: [0.6 * k, -0.2 * k],
            resistance: 1.25 * k,
            decals: [
              new CoreCircleDecal({
                position: [3 * k, 0],
                radius: 0.3 * k,
                color: k === 1 ? 'seagreen' : 'gold',
              }),
            ],
            weights: [
              new CoreWeight(7 * k, { position: [3 * k, 0], drag: 6 * k }),
            ],
          }),
        ],
      }),
      new CoreFixedFrame({
        id: 'mount',
        position: [-10 * k, 2],
        angle: 0.3 * k,
        frames: [
          new CoreRotationalFrame({
            id: 'hung',
            initialState: [0.2 * k, 0],
            weights: [new CoreWeight(2, { position: [1, 0] })],
          }),
        ],
      }),
      pivot('c1', -20),
      pivot('c2', -20 + gap),
      pivot('d1', 0),
      pivot('d2', gap),
      pivot('e1', 20),
      pivot('e2', 20 + gap),
    ],
  });

  scene.addConstraint(
    new CoincidenceConstraint({
      frame1: 'c1',
      frame2: 'c2',
      position1: [gap, gap],
      position2: [0, gap],
    }),
  );
  // The first end is the anchor's frame, at the anchor's point.
  scene.addConstraint(
    new DistanceConstraint({
      frame1: 'd1',
      frame2: 'd2',
      position1: [0, 1],
      position2: [0, 1],
      length: gap,
    }),
  );
  scene.addConstraint(
    new DistanceConstraint({
      frame1: 'e1',
      frame2: 'e2',
      position1: [0, -1],
      position2: [0, -1],
      length: gap,
    }),
  );

  return scene;
}

/** A scene as the tests compare it: its serialization, and the decals that leaves out. */
function picture(scene: CoreScene): unknown {
  return {
    json: scene.toJsonObj(),
    decals: scene.decals,
    frameDecals: scene.sortedFrames.map((frame) => [frame.id, frame.decals]),
  };
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

  test('a frame names the anchors inside it, in both routes', () => {
    // The one piece of a frame component only the mounted route has: the
    // frame id it hands its children. A frame that stopped providing it would
    // give an anchor inside it its *grandparent's* frame -- a constraint on a
    // frame that exists, holding somewhere else, with no complaint from
    // either route.
    const rig = (
      <>
        <RotationalFrame id="left" position={[0, 5]}>
          <Weight mass={1} position={[1, 0]} />
          <FixedFrame id="mount" position={[0, -1]}>
            <Anchor id="hook" position={[0, 0]} />
          </FixedFrame>
        </RotationalFrame>
        <TrackFrame id="cart" position={[3, 5]}>
          <Weight mass={1} position={[1, 0]} />
          <Anchor id="hitch" position={[0, 0]} />
        </TrackFrame>
        <RotationalFrame id="right" position={[6, 5]}>
          <Weight mass={1} position={[1, 0]} />
        </RotationalFrame>
        <Distance frame1="hook" frame2="right" position2={[0, -1]} />
        {/* `position2` solved for, so the coincidence holds as authored. */}
        <Coincidence frame1="hitch" frame2="right" />
      </>
    );
    const ends = (scene: CoreScene): [string, string][] =>
      scene.constraints.map((constraint) => [
        constraint.frameId1,
        constraint.frameId2,
      ]);

    // The anchors' own frames, not the frames above them.
    expect(ends(buildScene(rig))).toEqual([
      ['mount', 'right'],
      ['cart', 'right'],
    ]);
    expect(ends(assemble(rig))).toEqual(ends(buildScene(rig)));
  });

  test('builds every prop of every component as the constructors do', () => {
    expect(picture(buildScene(fullRig(1)))).toEqual(picture(handBuilt(1)));
    expect(picture(buildScene(fullRig(2)))).toEqual(picture(handBuilt(2)));

    // And there was something to compare.
    expect(buildScene(fullRig(1)).constraints).toHaveLength(3);
  });

  test('agrees with the mounted binding on mount, and after every prop changes', () => {
    // A rerender keeps a mounted component's old node unless one of its
    // dependencies changed -- so a dependency list that has fallen behind its
    // describer shows here, as a stale prop the walk does not have.
    let mounted: CoreScene | null = null;
    const tree = (k: 1 | 2): ReactElement => (
      <svg>
        <Scene onSceneChange={(built) => (mounted = built)}>{fullRig(k)}</Scene>
      </svg>
    );

    const { rerender } = render(tree(1));

    expect(picture(mounted!)).toEqual(picture(buildScene(fullRig(1))));

    rerender(tree(2));

    expect(picture(mounted!)).toEqual(picture(buildScene(fullRig(2))));
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

    expect(ids(buildScene(rig))).toEqual(['@0.0', '@0.$named-by-key']);
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

    expect(() => buildScene(rig)).toThrow(/has a ref.*Give it an id/);
  });

  test('refuses a ref even once a mount has filled it', () => {
    // Filled, it names the frames of whichever mount filled it, not the tree
    // being walked -- so it is refused where it sits, not where it is used.
    const tip = {
      current: { frameId: 'from-some-mount' },
    };
    const rig = (
      <>
        <RotationalFrame id="a">
          <Anchor ref={tip} />
        </RotationalFrame>
        <RotationalFrame id="b" />
        <Coincidence frame1="b" frame2={tip} />
      </>
    );

    expect(() => buildScene(rig)).toThrow(/<Anchor> at '0\.0\.0' has a ref/);
  });

  test('keeps keys and indices apart in the ids it makes', () => {
    // `key="0"` beside an unkeyed first child, and a dotted key beside a
    // nested path: sharing a segment would give two frames one id.
    const scene = buildScene(
      <TrackFrame id="cart">
        <RotationalFrame />
        <RotationalFrame key="0" />
        <RotationalFrame>
          <RotationalFrame />
        </RotationalFrame>
        <RotationalFrame key="2.0" />
      </TrackFrame>,
    );

    expect(scene.frameMap.get('cart')!.frames.map(({ id }) => id)).toEqual([
      '@0.0',
      '@0.$0',
      '@0.2',
      '@0.$2%2E0',
    ]);
    expect(scene.sortedFrames).toHaveLength(6);
  });

  test('refuses a whole <Scene>, saying what to pass instead', () => {
    expect(() =>
      buildScene(
        <Scene gravity={10}>
          <TrackFrame id="cart" />
        </Scene>,
      ),
    ).toThrow(/takes what goes inside a <Scene>/);
  });

  test('refuses two frames sharing an id, as the mounted binding does', () => {
    // The core scene refuses it, so both routes do.
    expect(() =>
      buildScene(
        <>
          <RotationalFrame id="x" />
          <RotationalFrame id="x" />
        </>,
      ),
    ).toThrow(/Two frames share the id 'x'/);
  });

  test('refuses a building block missing a required prop, naming it', () => {
    // Written source cannot get here -- TypeScript refuses it -- but a
    // document can: a constraint just added has no ends picked yet.
    const unfinished = createElement(Coincidence as unknown as () => null);

    expect(() => buildScene(unfinished)).toThrow(
      /<Coincidence> needs First end and Second end set/,
    );
  });

  test('every building block that is not a frame refuses children, in both routes', () => {
    // A document can put children under a leaf, where written source cannot.
    // The walk decides by slot, and each leaf component calls the refusal
    // itself when mounted -- so every leaf is held to both, and one that forgot
    // its call would fail here rather than drop a weight's mass unseen.
    const leaves = coreComponents.filter(({ meta }) => meta.slot !== 'frame');

    expect(leaves).toHaveLength(7);

    for (const leaf of leaves) {
      const { meta } = leaf;
      // Required props first, since the walk checks them before children.
      const props = Object.fromEntries(
        Object.entries(meta.props)
          .filter(([, spec]) => spec.required)
          .map(([name, spec]) => [
            name,
            spec.kind === 'end' ? 'host' : spec.initial,
          ]),
      );
      const stray = createElement(
        RotationalFrame,
        { id: 'host' },
        createElement(
          leaf as unknown as (props: object) => null,
          props,
          createElement(Weight, { mass: 1 }),
        ),
      );
      const refusal = new RegExp(
        `A <${meta.name}> is holding children, and only a frame can`,
      );

      expect(() => buildScene(stray), meta.name).toThrow(refusal);
      expect(() => assemble(stray), meta.name).toThrow(refusal);
    }
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

/** Assert that `actual` holds exactly `expected`, by identity, in order. */
function expectSame(
  actual: readonly unknown[] | undefined,
  expected: readonly unknown[],
): void {
  expect(actual).toHaveLength(expected.length);
  expected.forEach((item, index) => expect(actual![index]).toBe(item));
}

describe('buildScene, traced', () => {
  test('trace names every frame and decal, with the elements it came from', () => {
    // A composite between the cart and the arm, so the trail passes through an
    // element the walk calls rather than builds.
    const Arm = ({ children }: { children?: ReactNode }): ReactElement => (
      <RotationalFrame id="arm">{children}</RotationalFrame>
    );
    const circle = <Circle radius={1} />;
    const arm = <Arm>{circle}</Arm>;
    const box = <Box width={1} height={1} />;
    // A fragment between the cart and its children, so the trail also passes
    // through an element that is neither built nor called.
    const fragment = (
      <>
        {box}
        {arm}
      </>
    );
    const root = <TrackFrame id="cart">{fragment}</TrackFrame>;
    const calls: [unknown, readonly ReactElement[]][] = [];
    const scene = buildScene(root, {
      trace: (built, trail) => calls.push([built, trail]),
    });
    const trailOf = (built: unknown): readonly ReactElement[] | undefined =>
      calls.find(([reported]) => reported === built)?.[1];
    const cart = scene.frames[0]!;
    const armFrame = cart.frames[0]!;
    const rendered = trailOf(armFrame)?.[3];

    // Two frames and two decals, each reported once.
    expect(calls).toHaveLength(4);
    expectSame(trailOf(cart), [root]);
    expectSame(trailOf(cart.decals[0]), [root, fragment, box]);
    expect(rendered).toMatchObject({
      type: RotationalFrame,
      props: { id: 'arm' },
    });
    expectSame(trailOf(armFrame), [root, fragment, arm, rendered]);
    expectSame(trailOf(armFrame.decals[0]), [
      root,
      fragment,
      arm,
      rendered,
      circle,
    ]);
  });
});
