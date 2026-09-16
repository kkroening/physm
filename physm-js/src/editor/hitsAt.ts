import * as mat3 from './../Mat3';
import * as vec3 from './../Vec3';
import placeGizmos, { ARM_LENGTH } from './placeGizmos';
import type BoxDecal from './../BoxDecal';
import type CircleDecal from './../CircleDecal';
import { poseIn } from './../Scene';
import type CoreScene from './../Scene';
import type Decal from './../Decal';
import type { WorldDecal } from './../Decal';
import type Frame from './../Frame';
import type LineDecal from './../LineDecal';
import type { Mat3 } from './../Mat3';
import type { PoseMap } from './../Scene';
import type { ScreenPoint } from './placeGizmos';
import type { Vec3 } from './../Vec3';

/**
 * How near a click has to come to a shape to hit it, in pixels -- so a line
 * drawn a pixel wide can still be clicked.
 */
const REACH = 3;

/** A decal, and the transform it is drawn under. */
interface Placed {
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
function isHit({ decal, xformMatrix }: Placed, point: ScreenPoint): boolean {
  const shape = decal as BoxDecal | CircleDecal | LineDecal;
  const scale = mat3.scaleFactor(xformMatrix);

  switch (shape.kind) {
    case 'box': {
      const corners = shape.corners.map((corner) =>
        toScreen(xformMatrix, corner),
      );

      // A solid box is a filled polygon with no stroke. An outlined one is four
      // lines `lineWidth` wide, half of each outside the corners, and nothing
      // between them.
      const reach = (shape.solid ? 0 : (shape.lineWidth * scale) / 2) + REACH;

      return (
        (shape.solid && insideConvex(point, corners)) ||
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

/**
 * Every world-space decal that can be made from this pose, with the maker each
 * came from, bottom first.
 *
 * The **maker** rather than the shape, because that is what the caller can do
 * anything with: a world decal is remade on every pose, so the shape a click
 * lands on is a different object from the one any earlier pass saw, and the
 * maker is the only part of it that stays the same. `buildScene`'s trace
 * records makers for exactly that reason.
 *
 * A maker that cannot answer is skipped rather than allowed to throw -- it is
 * not drawn either, and hit-testing runs on every pointer move.
 */
function drawnInWorld(
  scene: CoreScene,
  poses: PoseMap,
  viewXform: Mat3,
): { placed: Placed; made: WorldDecal }[] {
  return scene.worldDecals.flatMap((made) => {
    try {
      return [
        {
          placed: { decal: made({ scene, poses }), xformMatrix: viewXform },
          made,
        },
      ];
    } catch {
      return [];
    }
  });
}

/** Every decal from `frames` down, bottom first, as `FrameView` draws them. */
function drawnUnder(
  frames: readonly Frame[],
  poses: PoseMap,
  viewXform: Mat3,
): Placed[] {
  return frames.flatMap((frame) => {
    const xformMatrix = mat3.multiply(viewXform, poseIn(poses, frame.id));

    return [
      ...frame.decals.map((decal) => ({ decal, xformMatrix })),
      ...drawnUnder(frame.frames, poses, viewXform),
    ];
  });
}

/**
 * What a click at `point` hits, topmost first: the frames whose gizmos it
 * lands on, then the decals, each in reverse of the order they are drawn.
 *
 * Decals are hit on their own geometry -- boxes, circles and line segments, as
 * `DecalView` draws them, with a few pixels' reach -- and frames on their
 * gizmo, the cross and its +x pointer, which the editor draws over everything. Screen space throughout,
 * because a gizmo is a fixed size on screen and a shape's reach should be too.
 *
 * A hit is usually one of those shapes, and may be a `WorldDecal` **maker**
 * instead: a world-space decal is remade on every pose, so there is no shape
 * to hand back that anything else would recognise -- see `drawnInWorld`.
 *
 * The poses rather than the state they were made from: a caller asking this on
 * every pointer move has already solved the scene's pose for the marks it
 * draws, and solving it again here would answer one question with two poses.
 */
export default function hitsAt(
  scene: CoreScene,
  poses: PoseMap,
  xformMatrix: Mat3,
  point: ScreenPoint,
): (Frame | Decal | WorldDecal)[] {
  const frames = placeGizmos(scene, poses, xformMatrix)
    .filter(
      (placement) =>
        distance(point, placement.origin) <= ARM_LENGTH + REACH ||
        distanceToSegment(point, placement.origin, placement.pointerEnd) <=
          REACH,
    )
    .map((placement) => placement.frame);
  const decals = [
    ...scene.decals.map((decal) => ({ decal, xformMatrix })),
    ...drawnUnder(scene.frames, poses, xformMatrix),
  ]
    .filter((drawn) => isHit(drawn, point))
    .map((drawn) => drawn.decal);

  // Last in draw order, so first once the shapes are reversed: a world-space
  // decal is drawn over every other decal, and what a click finds should be
  // what a person sees on top. A frame's gizmo still wins, as it does over an
  // ordinary decal, because the editor draws gizmos over everything. What
  // comes back is the maker rather than the shape -- see `drawnInWorld`.
  const world = drawnInWorld(scene, poses, xformMatrix)
    .filter(({ placed }) => isHit(placed, point))
    .map(({ made }) => made);

  return [...frames.reverse(), ...[...decals, ...world].reverse()];
}
