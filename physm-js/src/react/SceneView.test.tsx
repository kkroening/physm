import * as mat3 from './../Mat3';
import CircleDecal from './../CircleDecal';
import Frame from './../Frame';
import Scene from './../Scene';
import SceneView from './SceneView';
import TrackFrame from './../TrackFrame';
import { render } from '@testing-library/react';
import type { StateMap } from './../Frame';

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
