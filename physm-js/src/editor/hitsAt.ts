import * as mat3 from './../Mat3';
import * as vec3 from './../Vec3';
import placeGizmos, { ARM_LENGTH, poseOf } from './placeGizmos';
import type BoxDecal from './../BoxDecal';
import type CircleDecal from './../CircleDecal';
import type CoreScene from './../Scene';
import type Decal from './../Decal';
import type Frame from './../Frame';
import type LineDecal from './../LineDecal';
import type { Mat3 } from './../Mat3';
import type { ScreenPoint } from './placeGizmos';
import type { StateMap } from './../Frame';
import type { Vec3 } from './../Vec3';

/**
 * How near a click has to come to a shape to hit it, in pixels -- so a line
 * drawn a pixel wide can still be clicked.
 */
const REACH = 3;

/** A decal, and the transform it is drawn under. */
interface Drawn {
  readonly decal: Decal;
  readonly xformMatrix: Mat3;
}

function distance([ax, ay]: ScreenPoint, [bx, by]: ScreenPoint): number {
  return Math.hypot(ax - bx, ay - by);
}

/** How far `point` is from the segment between `start` and `end`. */
function distanceToSegment(
  point: ScreenPoint,
  start: ScreenPoint,
  end: ScreenPoint,
): number {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const lengthSquared = dx * dx + dy * dy;
  const along =
    lengthSquared === 0
      ? 0
      : ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) /
        lengthSquared;
  const t = Math.min(Math.max(along, 0), 1);

  return distance(point, [start[0] + t * dx, start[1] + t * dy]);
}

/** Whether `point` is inside a convex polygon, whichever way its corners wind. */
function insideConvex(
  point: ScreenPoint,
  corners: readonly ScreenPoint[],
): boolean {
  const sides = corners.map((corner, index) => {
    const next = corners[(index + 1) % corners.length] ?? corner;

    return Math.sign(
      (next[0] - corner[0]) * (point[1] - corner[1]) -
        (next[1] - corner[1]) * (point[0] - corner[0]),
    );
  });

  return !(sides.includes(1) && sides.includes(-1));
}

function toScreen(xformMatrix: Mat3, point: Vec3): ScreenPoint {
  return vec3.toPlanar(mat3.apply(xformMatrix, point));
}

/** Whether a click at `point` hits a decal, drawn as `DecalView` draws it. */
function isHit({ decal, xformMatrix }: Drawn, point: ScreenPoint): boolean {
  const shape = decal as BoxDecal | CircleDecal | LineDecal;
  const scale = mat3.scaleFactor(xformMatrix);

  switch (shape.kind) {
    case 'box': {
      const corners = shape.corners.map((corner) =>
        toScreen(xformMatrix, corner),
      );

      // A solid box is a filled polygon with no stroke; an outlined one is
      // drawn `lineWidth` wide, half of it outside the corners.
      const reach = (shape.solid ? 0 : (shape.lineWidth * scale) / 2) + REACH;

      return (
        insideConvex(point, corners) ||
        corners.some(
          (corner, index) =>
            distanceToSegment(
              point,
              corner,
              corners[(index + 1) % corners.length] ?? corner,
            ) <= reach,
        )
      );
    }
    case 'circle':
      return (
        distance(point, toScreen(xformMatrix, shape.position)) <=
        shape.radius * scale + REACH
      );
    case 'line':
      return (
        distanceToSegment(
          point,
          toScreen(xformMatrix, shape.startPos),
          toScreen(xformMatrix, shape.endPos),
        ) <=
        (shape.lineWidth * scale) / 2 + REACH
      );
  }
}

/** Every decal from `frames` down, bottom first, as `FrameView` draws them. */
function drawnUnder(
  frames: readonly Frame[],
  stateMap: StateMap,
  parentXform: Mat3,
): Drawn[] {
  return frames.flatMap((frame) => {
    const xformMatrix = poseOf(frame, stateMap, parentXform);

    return [
      ...frame.decals.map((decal) => ({ decal, xformMatrix })),
      ...drawnUnder(frame.frames, stateMap, xformMatrix),
    ];
  });
}

/**
 * What a click at `point` hits, topmost first: the frames whose gizmos it
 * lands on, then the decals, each in reverse of the order they are drawn.
 *
 * Decals are hit on their own geometry -- boxes, circles and line segments, as
 * `DecalView` draws them, with a few pixels' reach -- and frames on their
 * gizmo, which the editor draws over everything. Screen space throughout,
 * because a gizmo is a fixed size on screen and a shape's reach should be too.
 */
export default function hitsAt(
  scene: CoreScene,
  stateMap: StateMap,
  xformMatrix: Mat3,
  point: ScreenPoint,
): (Frame | Decal)[] {
  const frames = placeGizmos(scene, stateMap, xformMatrix)
    .filter(
      (placement) => distance(point, placement.origin) <= ARM_LENGTH + REACH,
    )
    .map((placement) => placement.frame);
  const decals = [
    ...scene.decals.map((decal) => ({ decal, xformMatrix })),
    ...drawnUnder(scene.frames, stateMap, xformMatrix),
  ]
    .filter((drawn) => isHit(drawn, point))
    .map((drawn) => drawn.decal);

  return [...frames.reverse(), ...decals.reverse()];
}
