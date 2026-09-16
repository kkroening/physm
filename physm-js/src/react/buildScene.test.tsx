import Anchor from './Anchor';
import * as vec3 from './../Vec3';
import {
  computed,
  div,
  mul,
  sqrt,
  tickOf,
  vec,
  worldPoint,
  xOf,
} from './../expression';
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
import CoreSpring from './../Spring';
import CoreTrackFrame from './../TrackFrame';
import CoreWeight from './../Weight';
import Distance from './Distance';
import FixedFrame from './FixedFrame';
import Line from './Line';
import RotationalFrame from './RotationalFrame';
import Scene from './Scene';
import Spring from './Spring';
import TrackFrame from './TrackFrame';
import Weight from './Weight';
import WorldLine from './WorldLine';
import type { LineDecalOptions } from './../LineDecal';
import type { WorldDecal } from './../Decal';
import buildScene from './buildScene';
import coreComponents from './coreComponents';
import { canContain } from './componentMeta';
import { CoincidenceConstraint, DistanceConstraint } from './../Constraint';
import { Children, createElement, isValidElement } from 'react';
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
 * All twelve building blocks with every prop set: none at its default when `k`
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
          <Spring stiffness={0.8 * k} rest={0.15 * k} />
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
      <WorldLine
        startPos={worldPoint('cart', [0, 0])}
        endPos={worldPoint('hung', [k, 0])}
        lineWidth={0.3 * k}
        color={k === 1 ? 'orchid' : 'olive'}
      />
    </>
  );
}

/** `fullRig`'s world-space line, as the oracle builds it. */
function handBuiltWorldLine(k: 1 | 2): WorldDecal {
  return (tick) =>
    new CoreLineDecal(
      computed<LineDecalOptions>(
        {
          startPos: worldPoint('cart', [0, 0]),
          endPos: worldPoint('hung', [k, 0]),
          lineWidth: 0.3 * k,
          color: k === 1 ? 'orchid' : 'olive',
        },
        tick,
      ),
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
    worldDecals: [handBuiltWorldLine(k)],
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
            springs: [new CoreSpring(0.8 * k, 0.15 * k)],
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
    // Made from the scene's own pose, since a world-space decal is not a shape
    // until something says where the scene has got to -- and `toJsonObj` has
    // no term for one, so without this it would compare equal to anything.
    worldDecals: scene.worldDecals.map((make) => make(tickOf(scene))),
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

  test('covers every building block the library lists', () => {
    // The docstring above claims `fullRig` is exhaustive, and that claim was
    // prose until this: a building block left out of the rig failed nothing,
    // so the guarantee the rig is cited for -- that a binding cannot quietly
    // stop carrying a prop -- held only for the ones somebody remembered.
    const named = (node: ReactNode, into: Set<string>): Set<string> => {
      for (const child of Children.toArray(node)) {
        if (!isValidElement(child)) {
          continue;
        }

        // A fragment carries no `meta` and is not a building block; every
        // binding component does, and its name is the tag a person writes.
        const { meta } = child.type as { meta?: { name: string } };
        if (meta) {
          into.add(meta.name);
        }

        named((child.props as { children?: ReactNode }).children, into);
      }

      return into;
    };

    expect([...named(fullRig(1), new Set())].sort()).toEqual(
      coreComponents.map(({ meta }) => meta.name).sort(),
    );
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

    expect(leaves).toHaveLength(9);

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
      const holding = createElement(
        leaf as unknown as (props: object) => null,
        props,
        createElement(Weight, { mass: 1 }),
      );
      // In a frame, except for the one leaf a frame cannot hold: a
      // world-space decal's coordinates are the world's, so it goes at the
      // root, and hosting it in a frame would refuse for that reason instead
      // of for the one under test.
      const stray = canContain('frame', meta.slot)
        ? createElement(RotationalFrame, { id: 'host' }, holding)
        : holding;
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

  test('refuses a Spring at the root, as the mounted binding does', () => {
    // Collected by both routes into the root's list and read by neither, so
    // without this the spring is dropped and the rig quietly loses a force --
    // the same outcome the `<FixedFrame>` refusal rules out, by another door.
    const rig = <Spring stiffness={45} />;
    const refusal = /<Spring> must be inside a frame/;

    expect(() => buildScene(rig)).toThrow(refusal);
    expect(() => assemble(rig)).toThrow(refusal);
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

  test('a world-space decal is named by its maker', () => {
    // It is not a shape until the scene is posed, and a different one on every
    // pose, so what a trace can record -- and what a hit on it hands back --
    // is the maker.
    const rig = <WorldLine startPos={[0, 0]} endPos={[1, 1]} />;
    const calls: [unknown, readonly ReactElement[]][] = [];
    const scene = buildScene(rig, {
      trace: (built, trail) => calls.push([built, trail]),
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]![0]).toBe(scene.worldDecals[0]);
    expectSame(calls[0]![1], [rig]);
  });
});

describe('a prop that is computed rather than stated', () => {
  /**
   * The same rig twice: once with every value written out, once with each
   * arrived at by an expression.
   *
   * `half` is bound once and used twice, which is the sharing a graph can hold
   * and a tree cannot -- and what the two `Weight`s get is one node, not two
   * that agree.
   */
  const stated = (
    <RotationalFrame id="arm" position={[1, 0]} resistance={2.5}>
      <Line endPos={[3, 4]} lineWidth={0.1} />
      <Weight mass={6} position={[3, 4]} />
      <Circle position={[2.5, 0]} radius={5} />
    </RotationalFrame>
  );
  const computedRig = (): ReactElement => {
    const half = div(5, 2);

    return (
      <RotationalFrame id="arm" position={vec(1, 0)} resistance={half}>
        <Line endPos={vec(3, 4)} lineWidth={div(1, 10)} />
        <Weight mass={mul(3, 2)} position={vec(3, xOf([4, 9]))} />
        <Circle position={vec(half, 0)} radius={sqrt(25)} />
      </RotationalFrame>
    );
  };

  test('the walk builds the same scene either way', () => {
    expect(normalized(buildScene(computedRig()))).toEqual(
      normalized(buildScene(stated)),
    );
  });

  test('so does the mounted binding, which shares the same describe', () => {
    let mounted: CoreScene | null = null;
    render(
      <Scene onSceneChange={(built) => (mounted = built)}>
        {computedRig()}
      </Scene>,
    );

    expect(normalized(mounted!)).toEqual(normalized(buildScene(stated)));
  });

  test('an operand of the wrong shape says which prop it was on', () => {
    // The fold happens where the walk hands props over, so the error carries
    // the node it came from rather than arriving from somewhere in the graph.
    expect(() =>
      buildScene(
        <RotationalFrame id="arm">
          <Weight mass={xOf(3)} />
        </RotationalFrame>,
      ),
    ).toThrow(/Expected a point, and found 3/);
  });

  test('a signal refuses at the boundary, in both routes', () => {
    // The gate is that a value which cannot be known until the scene is posed
    // never reaches a built scene, and *this* is where that has to hold: both
    // routes fold a component's props as they hand them over. Asserted here
    // rather than only on `computed`, so that a component folding for itself
    // is a failing test rather than a hole nobody notices.
    const rig = (
      <RotationalFrame id="arm">
        <Weight mass={worldPoint('arm', [0, 0])} />
      </RotationalFrame>
    );
    const refusal = /mass: worldPoint is a signal/;

    expect(() => buildScene(rig)).toThrow(refusal);
    expect(() => assemble(rig)).toThrow(refusal);
  });

  test('several springs on one joint reach both routes, and add', () => {
    // A spring is a node a person adds rather than a number the frame holds,
    // so the shape has to carry more than one -- and while every spring is
    // linear, two of them are one of their summed stiffness, which is what
    // makes the second one free today and expressible at all later.
    const rig = (
      <RotationalFrame id="arm">
        <Spring stiffness={3} />
        <Spring stiffness={5} />
      </RotationalFrame>
    );
    const armOf = (scene: CoreScene) => scene.frameMap.get('arm')!;

    for (const scene of [buildScene(rig), assemble(rig)]) {
      expect(armOf(scene).springs.map(({ stiffness }) => stiffness)).toEqual([
        3, 5,
      ]);
      expect(armOf(scene).springForce(0.5)).toBeCloseTo(-4, 12);
    }
  });

  test('a spring inside a fixed frame is refused, in both routes', () => {
    // Its coordinate moves nothing, so the spring would pull on nothing --
    // silently, which is the one outcome worth ruling out.
    const rig = (
      <FixedFrame id="mount">
        <Spring stiffness={3} />
      </FixedFrame>
    );
    const refusal = /<Spring> is inside a <FixedFrame>, whose coordinate moves/;

    expect(() => buildScene(rig)).toThrow(refusal);
    expect(() => assemble(rig)).toThrow(refusal);
  });

  test('a world-space line reaches both routes, and is not folded early', () => {
    // The one building block whose props are *not* folded where they are
    // handed over: its endpoints cannot be known until the scene is posed, so
    // it carries the expression and folds it when it is drawn. Both routes
    // have to leave it alone, and both have to collect it.
    const rig = (
      <>
        <TrackFrame id="cart" initialState={[3, 0]} />
        <WorldLine
          startPos={worldPoint('cart', [0, 0])}
          endPos={worldPoint('cart', [1, 2])}
        />
      </>
    );
    const drawn = (scene: CoreScene): unknown[] =>
      scene.worldDecals.map((make) => {
        const line = make(tickOf(scene)) as CoreLineDecal;

        return [vec3.toPlanar(line.startPos), vec3.toPlanar(line.endPos)];
      });

    expect(drawn(buildScene(rig))).toEqual([
      [
        [3, 0],
        [4, 2],
      ],
    ]);
    expect(drawn(assemble(rig))).toEqual(drawn(buildScene(rig)));

    // And it is the scene's, not the frame's: nothing landed in a frame's
    // decals on the way past.
    expect(
      buildScene(rig).sortedFrames.flatMap(({ decals }) => decals),
    ).toEqual([]);
  });

  test('a scene whose whole content is a world-space line is still a scene', () => {
    // The mounted route decides whether there is anything to assemble from
    // what landed in the frame tree, and a world decal lands nowhere in it --
    // so this tree, which the walk builds happily, is the one that route can
    // mistake for an empty one. It is not contrived: a fixed line in world
    // space is what the editor inserts.
    const rig = <WorldLine startPos={[0, 0]} endPos={[1, 0]} />;

    expect(buildScene(rig).worldDecals).toHaveLength(1);
    expect(assemble(rig).worldDecals).toHaveLength(1);
  });

  test('a world-space line inside a frame is refused, in both routes', () => {
    // Its coordinates are the world's. In a frame it would say its endpoints
    // move with a body, which is the thing it exists not to do -- and the
    // refusal says which of the two a person wanted.
    const rig = (
      <TrackFrame id="cart">
        <WorldLine startPos={[0, 0]} endPos={[1, 0]} />
      </TrackFrame>
    );
    const refusal =
      /<WorldLine> is drawn in world coordinates.*inside the frame 'cart'/s;

    expect(() => buildScene(rig)).toThrow(refusal);
    expect(() => assemble(rig)).toThrow(refusal);
  });

  test('a prop no operation can produce a value for is not widened', () => {
    // Each of these compiles only if `Computable` widened a prop it should
    // not have -- `@ts-expect-error` fails the build when there is no error,
    // which is the assertion. A guarantee the binding had before expressions
    // existed, and the kind that disappears silently without a test.
    const refused = [
      // @ts-expect-error -- a colour is not something an expression produces
      <Box key="a" width={1} height={1} color={mul(3, 2)} />,
      // @ts-expect-error -- nor is a flag
      <Box key="b" width={1} height={1} solid={mul(1, 0)} />,
      // @ts-expect-error -- nor a frame's id
      <RotationalFrame key="c" id={mul(3, 2)} />,
      // @ts-expect-error -- nor a constraint's end
      <Coincidence key="d" frame1={mul(1, 2)} frame2="b" />,
    ];

    expect(refused).toHaveLength(4);

    // And the props this change is for still take one.
    expect(() =>
      buildScene(
        <RotationalFrame id="arm" resistance={mul(1, 2)}>
          <Box width={sqrt(4)} height={div(4, 2)} position={vec(0, 0)} />
        </RotationalFrame>,
      ),
    ).not.toThrow();
  });

  test('a required prop is satisfied by an expression', () => {
    // `refuseMissingProps` runs before the fold and asks only whether the prop
    // is there, which an expression is.
    expect(() =>
      buildScene(
        <RotationalFrame id="arm">
          <Weight mass={mul(2, 3)} />
        </RotationalFrame>,
      ),
    ).not.toThrow();
  });
});
