import Circle from './../react/Circle';
import Line from './../react/Line';
import RotationalFrame from './../react/RotationalFrame';
import TrackFrame from './../react/TrackFrame';
import buildScene from './../react/buildScene';
import getViewXformMatrix from './../getViewXformMatrix';
import snapPoints, { nearestSnap } from './snapPoints';

type Point = readonly [number, number];

/** Ten pixels to the unit, with the world's origin at (100, 100) and y up. */
const VIEW = getViewXformMatrix([0, 0], 10, [200, 200]);

/** Where a world point lands on screen under `VIEW`. */
function at(x: number, y: number): Point {
  return [100 + 10 * x, 100 - 10 * y];
}

describe('snapPoints', () => {
  test("every other frame's origin, each line's ends and each circle's centre", () => {
    const scene = buildScene(
      <>
        <Line startPos={[-5, 0]} endPos={[5, 0]} />
        <TrackFrame id="cart" position={[1, 2]}>
          <Circle position={[0, 1]} radius={0.5} />
        </TrackFrame>
        <TrackFrame id="other" position={[-3, -3]} />
      </>,
    );
    const points = snapPoints(
      scene,
      scene.getInitialStateMap(),
      VIEW,
      scene.frames[1]!,
    );

    expect(points).toHaveLength(4);
    expect(points).toEqual(
      expect.arrayContaining([at(1, 2), at(-5, 0), at(5, 0), at(1, 3)]),
    );
  });

  test('nothing that moves with the dragged frame', () => {
    const scene = buildScene(
      <>
        <TrackFrame id="cart">
          <RotationalFrame id="arm" position={[1, 0]}>
            <Circle position={[2, 0]} radius={0.5} />
          </RotationalFrame>
          <Line endPos={[3, 0]} />
        </TrackFrame>
        <TrackFrame id="post" position={[5, 5]} />
      </>,
    );

    expect(
      snapPoints(scene, scene.getInitialStateMap(), VIEW, scene.frames[0]!),
    ).toEqual([at(5, 5)]);
  });
});

describe('nearestSnap', () => {
  test('the nearest point within eight pixels, or none', () => {
    const points: Point[] = [
      [0, 0],
      [10, 0],
    ];

    expect(nearestSnap(points, [3, 0])).toEqual([0, 0]);
    expect(nearestSnap(points, [7, 0])).toEqual([10, 0]);
    expect(nearestSnap(points, [0, 8])).toEqual([0, 0]);
    expect(nearestSnap(points, [0, 9])).toBeNull();
  });
});
