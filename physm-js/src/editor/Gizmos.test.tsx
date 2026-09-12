import * as mat3 from './../Mat3';
import Circle from './../react/Circle';
import Gizmos from './Gizmos';
import ParentAxes from './ParentAxes';
import RotationalFrame from './../react/RotationalFrame';
import SceneView from './../react/SceneView';
import TrackFrame from './../react/TrackFrame';
import buildScene from './../react/buildScene';
import getViewXformMatrix from './../getViewXformMatrix';
import placeGizmos from './placeGizmos';
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

  test('every gizmo sits where the scene says its frame is', () => {
    const scene = buildScene(
      <TrackFrame id="cart" initialState={[2, 0]}>
        <RotationalFrame id="arm" position={[1, 0]} initialState={[0.4, 0]}>
          <Circle radius={0.5} />
        </RotationalFrame>
      </TrackFrame>,
    );
    const stateMap = new Map([['cart', [3, 0]]]) as StateMap;
    const xformMatrix = view(18);
    const poses = scene.getPosMatrixMap(stateMap);

    // Exactly, not nearly: the gizmos multiply the view into the same pose the
    // scene computed, rather than composing one of their own that would have
    // to agree with it by luck. Keyed by id, since the two are ordered for
    // different reasons -- drawing order here, the solver's order there.
    const placed = Object.fromEntries(
      placeGizmos(scene, stateMap, xformMatrix).map(({ frame, origin }) => [
        frame.id,
        origin,
      ]),
    );

    expect(placed).toEqual(
      Object.fromEntries(
        [...poses].map(([id, pose]) => [
          id,
          mat3.translationOf(mat3.multiply(xformMatrix, pose)),
        ]),
      ),
    );
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

  test('the +x arm runs on as far again, so a quarter turn shows', () => {
    const turn = 0.5;
    // Away from its parent's origin, so a pointer drawn from there would miss.
    const scene = buildScene(
      <RotationalFrame id="arm" position={[1, 2]} initialState={[turn, 0]} />,
    );
    const container = draw(scene, scene.getInitialStateMap(), view(18));
    const [x] = [
      ...container.querySelectorAll('[data-frame-id="arm"] .editor__gizmo-arm'),
    ];
    const pointer = container.querySelector(
      '[data-frame-id="arm"] .editor__gizmo-pointer',
    )!;
    const [, xEnd] = ends(x!);
    const [pointerStart] = ends(pointer);

    // It starts where the +x arm ends, and goes on the same way, half the
    // cross's width again.
    expectPointsClose(pointerStart, xEnd);
    expectPointsClose(run(pointer).direction, [
      Math.cos(turn),
      -Math.sin(turn),
    ]);
    expect(run(pointer).length).toBeCloseTo(run(x!).length / 2, 9);
  });
});

/** A frame's parent's axes, drawn as the scene pane draws them for a drag. */
function drawParentAxes(
  scene: CoreScene,
  id: string,
  xformMatrix: Mat3,
): Element[] {
  const placement = placeGizmos(
    scene,
    scene.getInitialStateMap(),
    xformMatrix,
  ).find(({ frame }) => frame.id === id)!;

  return [
    ...render(
      <svg>
        <ParentAxes placement={placement} />
      </svg>,
    ).container.querySelectorAll('.editor__parent-axis'),
  ];
}

describe('ParentAxes', () => {
  test("they go through the frame's origin, along its parent's axes, not its own", () => {
    const scene = buildScene(
      <RotationalFrame id="arm" position={[1, 2]} initialState={[0.3, 0]}>
        <RotationalFrame id="tip" position={[3, 0]} initialState={[0.5, 0]} />
      </RotationalFrame>,
    );
    const axes = drawParentAxes(scene, 'tip', view(18));

    // The arm's origin is a unit right of the pane's middle and two up, and
    // the tip three units along the arm, turned by 0.3.
    const origin: Point = [218 + 54 * Math.cos(0.3), 114 - 54 * Math.sin(0.3)];

    expect(axes).toHaveLength(2);
    axes.forEach((axis) => {
      const [[x1, y1], [x2, y2]] = ends(axis.querySelector('line')!);

      expectPointsClose([(x1 + x2) / 2, (y1 + y2) / 2], origin);
    });

    // The arm's axes, at 0.3 -- where the tip's own are at 0.8.
    const [x, y] = axes.map((axis) => run(axis.querySelector('line')!));

    expectPointsClose(x!.direction, [Math.cos(0.3), -Math.sin(0.3)]);
    expectPointsClose(y!.direction, [-Math.sin(0.3), -Math.cos(0.3)]);
  });

  test('each is named past its positive end', () => {
    const scene = buildScene(
      <RotationalFrame id="arm" initialState={[0.3, 0]} />,
    );
    const axes = drawParentAxes(scene, 'arm', view(18));

    expect(axes.map((axis) => axis.querySelector('text')!.textContent)).toEqual(
      ['x', 'y'],
    );
    axes.forEach((axis) => {
      const line = axis.querySelector('line')!;
      const text = axis.querySelector('text')!;
      const [, end] = ends(line);
      const { direction, length } = run(line);
      const name: Point = [
        Number(text.getAttribute('x')),
        Number(text.getAttribute('y')),
      ];
      const past = [name[0] - end[0], name[1] - end[1]] as const;
      const beyond = Math.hypot(...past);

      // On along the axis from its positive end, clear of the line.
      expect(beyond).toBeGreaterThan(0);
      expect(beyond).toBeLessThan(length / 2);
      expectPointsClose([past[0] / beyond, past[1] / beyond], direction);
    });
  });

  test("a frame at the top has the world's, the same size at any zoom", () => {
    const scene = buildScene(
      <RotationalFrame id="hub" initialState={[0.5, 0]} />,
    );
    const [near, far] = [18, 40].map((scale) =>
      drawParentAxes(scene, 'hub', view(scale)).map((axis) =>
        run(axis.querySelector('line')!),
      ),
    );

    // The world is y-up and the screen y-down; the hub's own turn is no part
    // of it.
    expectPointsClose(near![0]!.direction, [1, 0]);
    expectPointsClose(near![1]!.direction, [0, -1]);

    expect(near![0]!.length).toBeGreaterThan(0);
    expect(far![0]!.length).toBeCloseTo(near![0]!.length, 9);
    expect(far![1]!.length).toBeCloseTo(near![1]!.length, 9);
  });
});
