import Circle from './../react/Circle';
import Gizmos from './Gizmos';
import RotationalFrame from './../react/RotationalFrame';
import SceneView from './../react/SceneView';
import TrackFrame from './../react/TrackFrame';
import buildScene from './../react/buildScene';
import getViewXformMatrix from './../getViewXformMatrix';
import { render } from '@testing-library/react';
import type CoreScene from './../Scene';
import type { Mat3 } from './../Mat3';
import type { StateMap } from './../Frame';

type Point = readonly [number, number];

/** A view at `scale` pixels to the unit, on a 400 by 300 pane. */
function view(scale: number): Mat3 {
  return getViewXformMatrix([0, 0], scale, [400, 300]);
}

/** The scene and its gizmos, drawn as the editor's scene pane draws them. */
function draw(
  scene: CoreScene,
  stateMap: StateMap,
  xformMatrix: Mat3,
): HTMLElement {
  return render(
    <svg>
      <SceneView scene={scene} stateMap={stateMap} xformMatrix={xformMatrix} />
      <Gizmos scene={scene} stateMap={stateMap} xformMatrix={xformMatrix} />
    </svg>,
  ).container;
}

/** A line's two ends. */
function ends(line: Element): readonly [Point, Point] {
  const at = (name: string): number => Number(line.getAttribute(name));

  return [
    [at('x1'), at('y1')],
    [at('x2'), at('y2')],
  ];
}

/** The line from a frame's gizmo to its parent's origin: parent's end first. */
function link(container: HTMLElement, id: string): readonly [Point, Point] {
  return ends(
    container.querySelector(`[data-frame-id="${id}"] .editor__gizmo-link`)!,
  );
}

/** Which way a line runs, as a unit vector, and how long it is. */
function run(line: Element): { direction: Point; length: number } {
  const [[x1, y1], [x2, y2]] = ends(line);
  const length = Math.hypot(x2 - x1, y2 - y1);

  return { direction: [(x2 - x1) / length, (y2 - y1) / length], length };
}

function expectPointsClose(actual: Point, expected: Point): void {
  expect(actual[0]).toBeCloseTo(expected[0], 9);
  expect(actual[1]).toBeCloseTo(expected[1], 9);
}

/** A turned arm with a slider on it, each frame drawing a circle at its origin. */
const arm = (
  <RotationalFrame id="arm" position={[1, 2]} initialState={[0.3, 0]}>
    <Circle radius={0.5} />
    <TrackFrame id="slider" position={[3, 0]} initialState={[0.5, 0]}>
      <Circle radius={0.5} />
    </TrackFrame>
  </RotationalFrame>
);

/** A pose neither frame starts in, so a gizmo drawn at the start would miss. */
const moved: StateMap = new Map([
  ['arm', [1.1, 0] as const],
  ['slider', [-0.8, 0] as const],
]);

describe('Gizmos', () => {
  test('every frame has one, a frame that draws nothing included', () => {
    const scene = buildScene(
      <>
        <TrackFrame id="cart">
          <RotationalFrame id="pivot" />
        </TrackFrame>
        <RotationalFrame id="hub" />
      </>,
    );
    const container = draw(scene, scene.getInitialStateMap(), view(18));

    // Nothing here draws, so without the gizmos the picture would be empty.
    expect(container.querySelector('.scene')!.innerHTML).not.toContain('line');
    expect(
      [...container.querySelectorAll('.editor__gizmo')].map((gizmo) =>
        gizmo.getAttribute('data-frame-id'),
      ),
    ).toEqual(['cart', 'pivot', 'hub']);
  });

  test("a gizmo's cross and line sit where its frame draws, at the state map's pose", () => {
    const scene = buildScene(arm);
    const container = draw(scene, moved, view(18));
    const circles = [...container.querySelectorAll('.scene circle')];

    // Each frame draws its circle at its own origin: the arm's first, since a
    // frame draws before its children.
    ['arm', 'slider'].forEach((id, index) => {
      const circle = circles[index]!;
      const centre: Point = [
        Number(circle.getAttribute('cx')),
        Number(circle.getAttribute('cy')),
      ];
      const [, origin] = link(container, id);
      const arms = [
        ...container.querySelectorAll(
          `[data-frame-id="${id}"] .editor__gizmo-arm`,
        ),
      ];

      expectPointsClose(origin, centre);
      expect(arms).toHaveLength(2);

      // The arms are symmetric about the origin, so each one's middle is the
      // cross's centre.
      arms.forEach((line) => {
        const [[x1, y1], [x2, y2]] = ends(line);

        expectPointsClose([(x1 + x2) / 2, (y1 + y2) / 2], centre);
      });
    });
  });

  test("the line runs back to the parent's origin, the world's at the top", () => {
    const scene = buildScene(arm);
    const container = draw(scene, moved, view(18));
    const [armFrom, armOrigin] = link(container, 'arm');
    const [sliderFrom] = link(container, 'slider');

    // The world's origin is the middle of the pane.
    expectPointsClose(armFrom, [200, 150]);
    expectPointsClose(sliderFrom, armOrigin);
  });

  test("the arms follow the frame's axes, the same size at any zoom", () => {
    const turn = 0.5;
    const scene = buildScene(
      <RotationalFrame id="arm" initialState={[turn, 0]} />,
    );
    const [near, far] = [18, 40].map((scale) =>
      [
        ...draw(
          scene,
          scene.getInitialStateMap(),
          view(scale),
        ).querySelectorAll('[data-frame-id="arm"] .editor__gizmo-arm'),
      ].map(run),
    );

    // The world is y-up and the screen y-down, so a counter-clockwise turn
    // shows clockwise.
    expectPointsClose(near![0]!.direction, [Math.cos(turn), -Math.sin(turn)]);
    expectPointsClose(near![1]!.direction, [-Math.sin(turn), -Math.cos(turn)]);

    expect(near![0]!.length).toBeGreaterThan(0);
    expect(far![0]!.length).toBeCloseTo(near![0]!.length, 9);
    expect(far![1]!.length).toBeCloseTo(near![1]!.length, 9);
  });

  test("a frame's arms turn with its parent's", () => {
    const container = draw(buildScene(arm), moved, view(18));
    const [x] = [
      ...container.querySelectorAll(
        '[data-frame-id="slider"] .editor__gizmo-arm',
      ),
    ].map(run);

    // The slider does not turn, so its axes are the arm's, turned by 1.1.
    expectPointsClose(x!.direction, [Math.cos(1.1), -Math.sin(1.1)]);
  });
});
