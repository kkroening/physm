import Box from './../react/Box';
import Circle from './../react/Circle';
import Line from './../react/Line';
import RotationalFrame from './../react/RotationalFrame';
import TrackFrame from './../react/TrackFrame';
import buildScene from './../react/buildScene';
import getViewXformMatrix from './../getViewXformMatrix';
import hitsAt from './hitsAt';
import type CoreScene from './../Scene';
import type { StateMap } from './../Frame';

type Point = readonly [number, number];

/** Ten pixels to the unit, with the world's origin at (100, 100) and y up. */
const VIEW = getViewXformMatrix([0, 0], 10, [200, 200]);

/** Where a world point lands on screen under `VIEW`. */
function at(x: number, y: number): Point {
  return [100 + 10 * x, 100 - 10 * y];
}

function hits(
  scene: CoreScene,
  point: Point,
  stateMap: StateMap = scene.getInitialStateMap(),
): unknown[] {
  return hitsAt(scene, stateMap, VIEW, point);
}

/** Assert the hits are exactly these, in this order: the same objects. */
function expectHits(
  actual: readonly unknown[],
  expected: readonly unknown[],
): void {
  expect(actual).toHaveLength(expected.length);
  expected.forEach((item, index) => expect(actual[index]).toBe(item));
}

describe('hitsAt', () => {
  test('a line, a circle and a box are hit on their own geometry', () => {
    const scene = buildScene(
      <>
        <Line startPos={[-5, 0]} endPos={[5, 0]} lineWidth={0.1} />
        <TrackFrame id="cart" position={[3, 3]}>
          <Box width={2} height={2} />
          <Circle position={[0, -4]} radius={0.5} />
        </TrackFrame>
      </>,
    );
    const [line] = scene.decals;
    const [box, circle] = scene.frames[0]!.decals;

    expectHits(hits(scene, at(-4, 0)), [line]);
    expectHits(hits(scene, at(3.4, -1)), [circle]);

    // Inside the box, and far enough from the cart's origin to miss its gizmo.
    expectHits(hits(scene, at(3.8, 3.8)), [box]);
    expectHits(hits(scene, at(-3, 5)), []);
  });

  test('a thin line is hit within a few pixels of it, and not beyond', () => {
    const scene = buildScene(
      <Line startPos={[-5, 0]} endPos={[5, 0]} lineWidth={0.1} />,
    );

    // Drawn a pixel wide: half of that, and three more of reach.
    expect(hits(scene, at(0, 0.3))).toHaveLength(1);
    expect(hits(scene, at(0, 0.4))).toHaveLength(0);

    // Past its end the reach is round, not square.
    expect(hits(scene, at(5.3, 0))).toHaveLength(1);
    expect(hits(scene, at(5.3, 0.3))).toHaveLength(0);
  });

  test('a box is hit inside it, and an outlined one across its outline', () => {
    const scene = buildScene(
      <>
        <Box width={2} height={2} position={[-5, 0]} />
        <Box
          width={2}
          height={2}
          position={[5, 0]}
          solid={false}
          lineWidth={1}
        />
      </>,
    );
    const [solid, outlined] = scene.decals;

    // Half a unit outside each: past a solid box's reach, but inside the
    // outlined one's stroke, drawn half its width either side of the edge.
    expectHits(hits(scene, at(-3.5, 0)), []);
    expectHits(hits(scene, at(6.5, 0)), [outlined]);
    expectHits(hits(scene, at(-4.5, 0.5)), [solid]);
  });

  test('a frame is hit on its gizmo, one that draws nothing included', () => {
    const scene = buildScene(<TrackFrame id="pivot" position={[-3, -3]} />);
    const [pivot] = scene.frames;

    expectHits(hits(scene, at(-3, -3)), [pivot]);

    // The cross reaches six pixels, and a click three more.
    expectHits(hits(scene, at(-2.2, -3)), [pivot]);
    expectHits(hits(scene, at(-1.9, -3)), []);
  });

  test('hits come topmost first: gizmos over shapes, and later over earlier', () => {
    const scene = buildScene(
      <>
        <Circle radius={3} />
        <TrackFrame id="outer">
          <Box width={1} height={1} />
          <TrackFrame id="inner" />
        </TrackFrame>
      </>,
    );
    const [circle] = scene.decals;
    const outer = scene.frames[0]!;
    const [box] = outer.decals;
    const inner = outer.frames[0]!;

    // A child's gizmo is drawn after its parent's, a frame's shapes after the
    // scene's own, and every gizmo after every shape.
    expectHits(hits(scene, at(0, 0)), [inner, outer, box, circle]);
  });

  test("a frame's pose comes from the state map", () => {
    const scene = buildScene(
      <RotationalFrame id="arm">
        <TrackFrame id="tip" position={[4, 0]} />
      </RotationalFrame>,
    );
    const tip = scene.frames[0]!.frames[0]!;
    const turned: StateMap = new Map([
      ['arm', [Math.PI / 2, 0] as const],
      ['tip', [0, 0] as const],
    ]);

    expect(hits(scene, at(4, 0))).toContain(tip);
    expect(hits(scene, at(0, 4), turned)).toContain(tip);
    expect(hits(scene, at(4, 0), turned)).not.toContain(tip);
  });
});
