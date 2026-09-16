import * as mat3 from './../Mat3';
import CircleDecal from './../CircleDecal';
import Frame from './../Frame';
import LineDecal from './../LineDecal';
import Scene from './../Scene';
import SceneView from './SceneView';
import TrackFrame from './../TrackFrame';
import { computed, worldPoint } from './../expression';
import { render } from '@testing-library/react';
import type { LineDecalOptions } from './../LineDecal';
import type { ReactElement } from 'react';
import type { StateMap } from './../Frame';
import type { Tick } from './../expression';

/** The DOM a scene view produces, rooted at its `<svg>`. */
function draw(scene: Scene, stateMap: StateMap = new Map()): SVGElement {
  const { container } = render(
    <svg>
      <SceneView scene={scene} stateMap={stateMap} />
    </svg>,
  );

  return container.querySelector<SVGElement>('svg')!;
}

describe('SceneView', () => {
  test('nests a frame group inside the scene group, decals within', () => {
    const scene = new Scene({
      frames: [new Frame({ decals: [new CircleDecal({ radius: 7 })] })],
    });

    const circle = draw(scene).querySelector('g.scene > g.frame > circle');

    expect(circle).not.toBeNull();
    expect(Number(circle!.getAttribute('r'))).toBeCloseTo(7, 9);
  });

  test('a frame absent from the state map draws at its own initialState', () => {
    // A `TrackFrame`, not a base `Frame`: the base ignores `q` entirely, so the
    // fallback and a wrongly-zeroed read would draw identically and this could
    // not fail. Here `q` slides the frame along its axis, which puts the answer
    // in the geometry.
    const scene = new Scene({
      frames: [
        new TrackFrame({
          id: 'cart',
          initialState: [7, 0],
          decals: [new CircleDecal({ radius: 1 })],
        }),
      ],
    });
    const cx = (stateMap: StateMap): number =>
      Number(draw(scene, stateMap).querySelector('circle')!.getAttribute('cx'));

    // Absent from the map -- reads `initialState`, so it sits at 7.
    expect(cx(new Map())).toBeCloseTo(7, 9);

    // Present -- the map wins, so it sits at 2 instead. Were the fallback
    // `ZERO_STATE`, the assertion above would read 0 rather than 7.
    expect(cx(new Map([['cart', [2, 0]]]) as StateMap)).toBeCloseTo(2, 9);
  });

  test('a child frame composes its parent transform, not the view alone', () => {
    // `M_i = ∏ C_k exp(q^k ζ̂_k)` down the tree: the child's decal has to land
    // at the sum of the two displacements, not just its own.
    const scene = new Scene({
      frames: [
        new TrackFrame({
          id: 'outer',
          initialState: [10, 0],
          frames: [
            new TrackFrame({
              id: 'inner',
              initialState: [3, 0],
              decals: [new CircleDecal({ radius: 1 })],
            }),
          ],
        }),
      ],
    });

    const circle = draw(scene).querySelector('g.frame > g.frame > circle');

    expect(circle).not.toBeNull();
    expect(Number(circle!.getAttribute('cx'))).toBeCloseTo(13, 9);
  });

  test('a frame draws at the pose the scene itself computes', () => {
    const scene = new Scene({
      frames: [
        new TrackFrame({
          id: 'outer',
          initialState: [10, 0],
          frames: [
            new TrackFrame({
              id: 'inner',
              initialState: [3, 0],
              decals: [new CircleDecal({ radius: 1 })],
            }),
          ],
        }),
      ],
    });
    const stateMap = new Map([['outer', [4, 0]]]) as StateMap;
    const view = mat3.translation(5, -5);
    const { container } = render(
      <svg>
        <SceneView scene={scene} stateMap={stateMap} xformMatrix={view} />
      </svg>,
    );
    const circle = container.querySelector('g.frame > g.frame > circle')!;

    // No number written out here: the pose is the one the scene computes,
    // carried through the view transform. A walk of the drawing's own would
    // have to agree with this by luck rather than by construction.
    const [x, y] = mat3.translationOf(
      mat3.multiply(view, scene.getPosMatrixMap(stateMap).get('inner')!),
    );

    expect(Number(circle.getAttribute('cx'))).toBeCloseTo(x, 9);
    expect(Number(circle.getAttribute('cy'))).toBeCloseTo(y, 9);
  });

  test('the view transform carries the whole scene', () => {
    const scene = new Scene({ decals: [new CircleDecal({ radius: 2 })] });
    const { container } = render(
      <svg>
        <SceneView
          scene={scene}
          stateMap={new Map()}
          xformMatrix={mat3.translation(5, -5)}
        />
      </svg>,
    );
    const circle = container.querySelector('circle')!;

    expect(Number(circle.getAttribute('cx'))).toBeCloseTo(5, 9);
    expect(Number(circle.getAttribute('cy'))).toBeCloseTo(-5, 9);
  });
});

describe('a decal drawn in world space', () => {
  /**
   * Two carts on their own tracks, and a line between a point on each.
   *
   * The wish list's case, as small as it goes: the two endpoints have no
   * common frame, so there is no frame in which this line has fixed endpoints
   * -- move either cart and the line is different.
   */
  function twoCarts(): Scene {
    return new Scene({
      frames: [
        new TrackFrame({ id: 'left', initialState: [1, 0] }),
        new TrackFrame({
          id: 'right',
          position: [0, 4],
          initialState: [5, 0],
          decals: [new CircleDecal({ radius: 1 })],
        }),
      ],
      worldDecals: [
        (tick: Tick) =>
          new LineDecal(
            computed<LineDecalOptions>(
              {
                startPos: worldPoint('left', [0, 0]),
                endPos: worldPoint('right', [0, 0]),
              },
              tick,
            ),
          ),
      ],
    });
  }

  const ends = (svg: SVGElement): number[] =>
    ['x1', 'y1', 'x2', 'y2'].map((name) =>
      Number(svg.querySelector('g.scene > line')!.getAttribute(name)),
    );

  test('spans two points that share no frame', () => {
    expect(ends(draw(twoCarts()))).toEqual([1, 0, 5, 4]);
  });

  test('is different when the scene is', () => {
    // The whole reason it cannot be a `<Line>` with cleverer props: nothing
    // about the expression changed, and the line did.
    const moved = new Map([
      ['left', [2, 0]],
      ['right', [-3, 0]],
    ]) as StateMap;

    expect(ends(draw(twoCarts(), moved))).toEqual([2, 0, -3, 4]);
  });

  test('is drawn over the frames rather than under them', () => {
    // A decision rather than an inheritance: it exists to show a relationship
    // between bodies, and under them it would be hidden by the very things it
    // relates. The scene's own decals keep their place below.
    const svg = draw(
      new Scene({ ...twoCarts(), decals: [new CircleDecal({ radius: 2 })] }),
    );
    const painted = [...svg.querySelectorAll('g.scene > *')].map(
      (each) => each.tagName,
    );

    expect(painted).toEqual(['circle', 'g', 'g', 'line']);
  });

  test('one that cannot be made costs itself, not the picture', () => {
    // It is remade on every animation frame, so a throw would take down the
    // editor a person would use to fix it -- and would do so sixty times a
    // second. The frames still draw, and the complaint is said once.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const scene = new Scene({
      frames: [new TrackFrame({ id: 'left', initialState: [1, 0] })],
      worldDecals: [
        (tick: Tick) =>
          new LineDecal(
            computed<LineDecalOptions>(
              { endPos: worldPoint('elbow', [0, 0]) },
              tick,
            ),
          ),
      ],
    });
    const view = (stateMap: StateMap): ReactElement => (
      <svg>
        <SceneView scene={scene} stateMap={stateMap} />
      </svg>
    );
    const { container, rerender } = render(view(new Map()));

    expect(container.querySelector('line')).toBeNull();
    expect(container.querySelector('g.frame')).not.toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toMatch(
      /world-space decal was not drawn.*No such frame in scene: elbow/,
    );

    // Drawn again, and again it cannot be made. Said once: this runs on every
    // animation frame, so repeating it is noise rather than news.
    rerender(view(new Map([['left', [2, 0]]]) as StateMap));
    rerender(view(new Map([['left', [3, 0]]]) as StateMap));

    expect(warn).toHaveBeenCalledTimes(1);

    warn.mockRestore();
  });
});
